import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

interface Window { count: number; resetAt: number }
const buckets = new Map<string, Window>();
const MAX_MEMORY_BUCKETS = 10_000;
let lastSweep = 0;

export interface RateLimitResult { ok: boolean; retryAfter: number }

function sweep(now: number) {
  if (now - lastSweep < 30_000 && buckets.size < MAX_MEMORY_BUCKETS) return;
  lastSweep = now;
  for (const [key, window] of buckets) if (window.resetAt <= now) buckets.delete(key);
  while (buckets.size >= MAX_MEMORY_BUCKETS) buckets.delete(buckets.keys().next().value as string);
}

async function distributedRateLimit(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitResult> {
  const id = createHash("sha256").update(key).digest("hex");
  const resetAt = new Date(now + windowMs);
  const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
    INSERT INTO "rate_limit_buckets" ("key", "count", "expiresAt")
    VALUES (${id}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limit_buckets"."expiresAt" <= NOW() THEN 1 ELSE "rate_limit_buckets"."count" + 1 END,
      "expiresAt" = CASE WHEN "rate_limit_buckets"."expiresAt" <= NOW() THEN ${resetAt} ELSE "rate_limit_buckets"."expiresAt" END
    RETURNING "count", "expiresAt"
  `;
  const row = rows[0];
  if (!row) throw new Error("Rate limit store did not return a bucket.");
  return { ok: row.count <= limit, retryAfter: row.count <= limit ? 0 : Math.max(1, Math.ceil((row.expiresAt.getTime() - now) / 1000)) };
}

/** Shared fixed-window limiter in production; bounded in-memory limiter in dev. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  if (process.env.DATABASE_URL && process.env.OUTSIDE_STORAGE_MODE !== "memory") {
    return distributedRateLimit(key, limit, windowMs, now);
  }
  sweep(now);
  const window = buckets.get(key);
  if (!window || window.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (window.count >= limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
  window.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Caller identity is accepted only from an edge header configured to overwrite input. */
export function clientIdentity(req: NextRequest): string {
  let candidate = "";
  if (process.env.VERCEL === "1") candidate = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
  else if (process.env.OUTSIDE_TRUST_PROXY === "true") candidate = req.headers.get("x-real-ip")?.trim() ?? "";
  if (!candidate || isIP(candidate) === 0) return "untrusted-client";
  return createHash("sha256").update(candidate).digest("hex").slice(0, 24);
}

export async function requireBudgets(budgets: Array<{ key: string; limit: number; windowMs: number }>): Promise<RateLimitResult> {
  for (const budget of budgets) {
    const result = await rateLimit(budget.key, budget.limit, budget.windowMs);
    if (!result.ok) return result;
  }
  return { ok: true, retryAfter: 0 };
}

export function __resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}
