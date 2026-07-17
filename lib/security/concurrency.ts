import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const localActive = new Map<string, number>();

export class CapacityError extends Error {
  constructor() { super("Service capacity is temporarily exhausted."); }
}

async function acquire(scope: string, limit: number, ttlMs: number): Promise<string | null> {
  if (!process.env.DATABASE_URL || process.env.OUTSIDE_STORAGE_MODE === "memory") {
    const active = localActive.get(scope) ?? 0;
    if (active >= limit) return null;
    localActive.set(scope, active + 1);
    return "local";
  }
  const id = randomUUID();
  return prisma.$transaction(async (tx) => {
    // pg_advisory_xact_lock returns PostgreSQL void, which Prisma cannot
    // deserialize through $queryRaw. Execute it without requesting a rowset.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope}))`;
    await tx.$executeRaw`DELETE FROM "concurrency_leases" WHERE "scope" = ${scope} AND "expiresAt" <= NOW()`;
    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS "count" FROM "concurrency_leases" WHERE "scope" = ${scope}`;
    if (Number(rows[0]?.count ?? 0) >= limit) return null;
    await tx.$executeRaw`INSERT INTO "concurrency_leases" ("id", "scope", "expiresAt") VALUES (${id}, ${scope}, ${new Date(Date.now() + ttlMs)})`;
    return id;
  });
}

async function release(scope: string, id: string): Promise<void> {
  if (id === "local") {
    const active = localActive.get(scope) ?? 1;
    if (active <= 1) localActive.delete(scope); else localActive.set(scope, active - 1);
    return;
  }
  await prisma.$executeRaw`DELETE FROM "concurrency_leases" WHERE "id" = ${id}`;
}

export async function withConcurrency<T>(scope: string, limit: number, ttlMs: number, work: () => Promise<T>): Promise<T> {
  const lease = await acquire(scope, limit, ttlMs);
  if (!lease) throw new CapacityError();
  try { return await work(); } finally { await release(scope, lease).catch((error) => console.error("[concurrency] lease release failed", error)); }
}
