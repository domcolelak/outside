import { performance } from "node:perf_hooks";

const [url, rawCount = "50"] = process.argv.slice(2);
const count = Number(rawCount);
if (!url || !Number.isInteger(count) || count < 1 || count > 1_000) {
  throw new Error("usage: node scripts/measure-http.mjs <url> [count: 1-1000]");
}

const durations = [];
const statuses = {};
let failed = 0;
for (let index = 0; index < count; index += 1) {
  const started = performance.now();
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    await response.arrayBuffer();
    durations.push(performance.now() - started);
    statuses[response.status] = (statuses[response.status] ?? 0) + 1;
    if (!response.ok) failed += 1;
  } catch {
    durations.push(performance.now() - started);
    failed += 1;
  }
}

durations.sort((left, right) => left - right);
const percentile = (value) => durations[Math.min(durations.length - 1, Math.ceil((value / 100) * durations.length) - 1)];
const result = {
  schema: "com.outside.performance.http/v1",
  measuredAt: new Date().toISOString(),
  url,
  requests: count,
  failed,
  statuses,
  latencyMs: {
    min: Number(durations[0].toFixed(2)),
    p50: Number(percentile(50).toFixed(2)),
    p95: Number(percentile(95).toFixed(2)),
    p99: Number(percentile(99).toFixed(2)),
    max: Number(durations.at(-1).toFixed(2)),
    mean: Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)),
  },
};
console.log(JSON.stringify(result, null, 2));
if (failed) process.exitCode = 1;
