import { prisma } from "@/lib/db/prisma";

export interface OperationalCleanupResult {
  rateLimits: number;
  concurrencyLeases: number;
  emailOutbox: number;
  processedEvents: number;
  usageEvents: number;
  passwordResets: number;
}

const boundedDays = (value: string | undefined, fallback: number, minimum: number) => Math.max(minimum, Math.min(3650, Number(value) || fallback));

/** Bounded retention for operational, non-evidence tables. */
export async function runOperationalCleanup(now = new Date(), batchSize = 5000): Promise<OperationalCleanupResult> {
  if (!process.env.DATABASE_URL || process.env.OUTSIDE_STORAGE_MODE === "memory") return { rateLimits: 0, concurrencyLeases: 0, emailOutbox: 0, processedEvents: 0, usageEvents: 0, passwordResets: 0 };
  const limit = Math.max(100, Math.min(20_000, batchSize));
  const emailCutoff = new Date(now.getTime() - boundedDays(process.env.OUTSIDE_EMAIL_OUTBOX_RETENTION_DAYS, 90, 30) * 86_400_000);
  const eventCutoff = new Date(now.getTime() - boundedDays(process.env.OUTSIDE_WEBHOOK_IDEMPOTENCY_DAYS, 400, 365) * 86_400_000);
  const usageCutoff = new Date(now.getTime() - boundedDays(process.env.OUTSIDE_USAGE_RETENTION_DAYS, 730, 90) * 86_400_000);
  const usedResetCutoff = new Date(now.getTime() - 86_400_000);
  const [rateLimits, concurrencyLeases, emailOutbox, processedEvents, usageEvents, passwordResets] = await prisma.$transaction([
    prisma.$executeRaw`WITH doomed AS (SELECT ctid FROM rate_limit_buckets WHERE "expiresAt" < ${now} ORDER BY "expiresAt" LIMIT ${limit}) DELETE FROM rate_limit_buckets WHERE ctid IN (SELECT ctid FROM doomed)`,
    prisma.$executeRaw`WITH doomed AS (SELECT ctid FROM concurrency_leases WHERE "expiresAt" < ${now} ORDER BY "expiresAt" LIMIT ${limit}) DELETE FROM concurrency_leases WHERE ctid IN (SELECT ctid FROM doomed)`,
    prisma.$executeRaw`WITH doomed AS (SELECT ctid FROM email_outbox WHERE status IN ('sent','failed') AND COALESCE("sentAt","createdAt") < ${emailCutoff} ORDER BY COALESCE("sentAt","createdAt") LIMIT ${limit}) DELETE FROM email_outbox WHERE ctid IN (SELECT ctid FROM doomed)`,
    prisma.$executeRaw`WITH doomed AS (SELECT ctid FROM processed_events WHERE "createdAt" < ${eventCutoff} ORDER BY "createdAt" LIMIT ${limit}) DELETE FROM processed_events WHERE ctid IN (SELECT ctid FROM doomed)`,
    prisma.$executeRaw`WITH doomed AS (SELECT ctid FROM usage_events WHERE "createdAt" < ${usageCutoff} ORDER BY "createdAt" LIMIT ${limit}) DELETE FROM usage_events WHERE ctid IN (SELECT ctid FROM doomed)`,
    prisma.$executeRaw`WITH doomed AS (SELECT ctid FROM password_reset_tokens WHERE "expiresAt" < ${now} OR "usedAt" < ${usedResetCutoff} ORDER BY "createdAt" LIMIT ${limit}) DELETE FROM password_reset_tokens WHERE ctid IN (SELECT ctid FROM doomed)`,
  ]);
  return { rateLimits, concurrencyLeases, emailOutbox, processedEvents, usageEvents, passwordResets };
}
