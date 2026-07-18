import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the migration upgrade test.");
}

const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const prismaRoot = join(repository, "prisma");
const migrationsRoot = join(prismaRoot, "migrations");
const checkpoint = process.env.MIGRATION_UPGRADE_CHECKPOINT ?? "20260715010000_guardian_scale";
const available = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (!available.includes(checkpoint)) {
  throw new Error(`Unknown migration checkpoint ${checkpoint}.`);
}

const scratch = mkdtempSync(join(tmpdir(), "outside-migration-upgrade-"));
const scratchPrisma = join(scratch, "prisma");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function prisma(args, schema) {
  const result = spawnSync(npx, ["prisma", ...args, "--schema", schema], {
    cwd: repository,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Prisma ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

try {
  mkdirSync(join(scratchPrisma, "migrations"), { recursive: true });
  cpSync(join(prismaRoot, "schema.prisma"), join(scratchPrisma, "schema.prisma"), { recursive: true });
  cpSync(join(migrationsRoot, "migration_lock.toml"), join(scratchPrisma, "migrations", "migration_lock.toml"), { recursive: true });
  for (const migration of available.filter((name) => name <= checkpoint)) {
    cpSync(join(migrationsRoot, migration), join(scratchPrisma, "migrations", migration), { recursive: true });
  }

  console.log(`Applying historical checkpoint ${checkpoint} to ${basename(databaseUrl.split("?")[0] ?? databaseUrl)}.`);
  prisma(["migrate", "deploy"], join(scratchPrisma, "schema.prisma"));
  console.log("Upgrading the checkpoint database through the current migration set.");
  prisma(["migrate", "deploy"], join(prismaRoot, "schema.prisma"));
  prisma(["migrate", "status"], join(prismaRoot, "schema.prisma"));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
