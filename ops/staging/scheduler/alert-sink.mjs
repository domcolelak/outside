import { createServer } from "node:http";

let received = 0;
let lastReceived = 0;
createServer((request, response) => {
  if (request.method === "POST" && request.url === "/alerts") {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes <= 256_000) chunks.push(chunk);
      else request.destroy();
    });
    request.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const alerts = Array.isArray(body.alerts) ? body.alerts : [];
        received += alerts.length;
        lastReceived = Date.now() / 1_000;
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: alerts.some((alert) => alert.labels?.severity === "critical") ? "error" : "warn",
          event: "alertmanager.delivery_received",
          status: body.status,
          alerts: alerts.map((alert) => ({
            name: alert.labels?.alertname,
            severity: alert.labels?.severity,
            owner: alert.labels?.owner,
            status: alert.status,
            summary: alert.annotations?.summary,
            action: alert.annotations?.action,
          })),
        }));
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
    return;
  }
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.url === "/metrics") {
    response.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
    response.end(
      "# HELP outside_alert_sink_received_total Alerts received from Alertmanager.\n" +
      "# TYPE outside_alert_sink_received_total counter\n" +
      `outside_alert_sink_received_total ${received}\n` +
      "# HELP outside_alert_sink_last_received_unixtime Last alert delivery.\n" +
      "# TYPE outside_alert_sink_last_received_unixtime gauge\n" +
      `outside_alert_sink_last_received_unixtime ${lastReceived}\n`,
    );
    return;
  }
  response.writeHead(404).end();
}).listen(9090, "0.0.0.0");
