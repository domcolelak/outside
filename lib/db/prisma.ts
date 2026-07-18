import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalDatabase = globalThis as unknown as { __outsidePrismaClient?: PrismaClient };

/** Construct the application's only PrismaClient on first database use. */
function client(): PrismaClient {
  if (!globalDatabase.__outsidePrismaClient) {
    globalDatabase.__outsidePrismaClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
    });
  }
  return globalDatabase.__outsidePrismaClient;
}

/**
 * Preserve the existing PrismaClient-shaped API while avoiding native engine
 * initialization in memory-only processes, static builds, and unit workers.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const database = client();
    const value = Reflect.get(database, property, database) as unknown;
    return typeof value === "function" ? value.bind(database) : value;
  },
});

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
