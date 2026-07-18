import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const standalone = resolve(repository, ".next", "standalone");
const server = resolve(standalone, "server.js");
if (!existsSync(server)) {
  throw new Error("Standalone build not found. Run npm run build first.");
}

const staticSource = resolve(repository, ".next", "static");
if (existsSync(staticSource)) {
  const staticDestination = resolve(standalone, ".next", "static");
  mkdirSync(resolve(standalone, ".next"), { recursive: true });
  cpSync(staticSource, staticDestination, { recursive: true, force: true });
}
const publicSource = resolve(repository, "public");
if (existsSync(publicSource)) {
  cpSync(publicSource, resolve(standalone, "public"), { recursive: true, force: true });
}

const child = spawn(process.execPath, [server], {
  cwd: standalone,
  env: {
    ...process.env,
    HOSTNAME: process.env.OUTSIDE_BIND_HOST ?? "0.0.0.0",
    PORT: process.env.OUTSIDE_BIND_PORT ?? "3000",
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
