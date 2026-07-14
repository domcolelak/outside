import { PrismaClient } from "@prisma/client";

const globalDatabase = globalThis as unknown as { __outsidePrismaClient?: PrismaClient };

/** The application's only PrismaClient. Reused in development and production. */
export const prisma = globalDatabase.__outsidePrismaClient ?? new PrismaClient({
  log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
});

globalDatabase.__outsidePrismaClient = prisma;

export async function databaseReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("[database] readiness check failed", error);
    return false;
  }
}
