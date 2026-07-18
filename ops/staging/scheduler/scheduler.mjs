import { createServer } from "node:http";

const baseUrl = new URL(process.env.OUTSIDE_INTERNAL_URL ?? "http://app:3000");
const secret = process.env.CRON_SECRET?.trim();
if (!secret || Buffer.byteLength(secret, "utf8") < 32) throw new Error("CRON_SECRET must contain at least 32 bytes.");

const jobs = [
  { name: "scan", method: "GET", path: "/api/cron/scan", interval: setting("SCHEDULER_SCAN_INTERVAL_SECONDS", 300, 30) },
  { name: "agency", method: "POST", path: "/api/cron/agency", interval: setting("SCHEDULER_AGENCY_INTERVAL_SECONDS", 600, 30), paginated: true },
  { name: "enterprise", method: "POST", path: "/api/cron/enterprise", interval: setting("SCHEDULER_ENTERPRISE_INTERVAL_SECONDS", 60, 15), paginated: true },
  { name: "retention", method: "GET", path: "/api/cron/retention", interval: setting("SCHEDULER_RETENTION_INTERVAL_SECONDS", 86_400, 300) },
].map((job) => ({ ...job, nextAt: Date.now() + 5_000, startedAt: 0, running: false, successes: 0, failures: 0, lastSuccess: 0, lastDuration: 0 }));

function setting(name, fallback, minimum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}.`);
  return value;
}

function log(level, event, fields = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }));
}

async function invoke(job) {
  if (job.running) return;
  job.running = true;
  job.startedAt = Date.now();
  const started = Date.now();
  let cursor = null;
  let pages = 0;
  try {
    do {
      const url = new URL(job.path, baseUrl);
      if (cursor) url.searchParams.set("after", cursor);
      const response = await fetch(url, {
        method: job.method,
        headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${job.name} returned ${response.status}`);
      cursor = job.paginated && typeof body.nextCursor === "string" && body.nextCursor ? body.nextCursor : null;
      pages += 1;
      if (pages >= 100 && cursor) throw new Error(`${job.name} exceeded the 100-page safety limit`);
    } while (cursor);
    job.successes += 1;
    job.lastSuccess = Date.now() / 1_000;
    job.lastDuration = (Date.now() - started) / 1_000;
    log("info", "scheduler.job_succeeded", { job: job.name, pages, durationSeconds: job.lastDuration });
  } catch (error) {
    job.failures += 1;
    job.lastDuration = (Date.now() - started) / 1_000;
    log("error", "scheduler.job_failed", { job: job.name, durationSeconds: job.lastDuration, errorMessage: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    job.nextAt = Date.now() + job.interval * 1_000;
    job.startedAt = 0;
    job.running = false;
  }
}

function metrics() {
  const lines = [
    "# HELP outside_scheduler_last_success_unixtime Last successful scheduler invocation.",
    "# TYPE outside_scheduler_last_success_unixtime gauge",
    "# HELP outside_scheduler_runs_total Scheduler invocation outcomes.",
    "# TYPE outside_scheduler_runs_total counter",
    "# HELP outside_scheduler_duration_seconds Last scheduler invocation duration.",
    "# TYPE outside_scheduler_duration_seconds gauge",
  ];
  for (const job of jobs) {
    lines.push(`outside_scheduler_last_success_unixtime{job="${job.name}"} ${job.lastSuccess}`);
    lines.push(`outside_scheduler_runs_total{job="${job.name}",result="success"} ${job.successes}`);
    lines.push(`outside_scheduler_runs_total{job="${job.name}",result="failed"} ${job.failures}`);
    lines.push(`outside_scheduler_duration_seconds{job="${job.name}"} ${job.lastDuration}`);
  }
  return `${lines.join("\n")}\n`;
}

createServer((request, response) => {
  if (request.url === "/healthz") {
    const stalled = jobs.some((job) => job.running && job.startedAt > 0 && Date.now() - job.startedAt > 180_000);
    response.writeHead(stalled ? 503 : 200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: stalled ? "stalled" : "ok" }));
    return;
  }
  if (request.url === "/metrics") {
    response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
    response.end(metrics());
    return;
  }
  response.writeHead(404).end();
}).listen(9090, "0.0.0.0");

setInterval(() => {
  for (const job of jobs) if (Date.now() >= job.nextAt) void invoke(job);
}, 1_000).unref();
log("info", "scheduler.started", { jobs: jobs.map(({ name, interval }) => ({ name, interval })) });
