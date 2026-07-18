import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads env files. Load local development env files so
// `npm run db:migrate` keeps working; containers and CI pass DATABASE_URL directly.
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
