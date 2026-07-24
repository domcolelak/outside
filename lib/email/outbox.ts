import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { EmailMessage } from "./provider";
import { getEmailProvider } from "./provider";

interface OutboxRow extends EmailMessage { id: string; attempts: number }
const OUTBOX_LEASE_MS = 60_000;

async function claimOneEmail(): Promise<{ row: OutboxRow; leaseId: string } | null> {
  const leaseId = randomUUID();
  const rows = await prisma.$queryRaw<OutboxRow[]>`
    UPDATE "email_outbox"
    SET "status" = 'sending', "leaseId" = ${leaseId}, "leasedUntil" = ${new Date(Date.now() + OUTBOX_LEASE_MS)}, "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "email_outbox"
      WHERE "status" IN ('pending', 'retry', 'sending')
        AND "nextAttemptAt" <= NOW()
        AND ("leasedUntil" IS NULL OR "leasedUntil" <= NOW())
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "to", "subject", "html", "text", "attempts"
  `;
  return rows[0] ? { row: rows[0], leaseId } : null;
}

async function renewEmailLease(id: string, leaseId: string): Promise<boolean> {
  return await prisma.$executeRaw`
    UPDATE "email_outbox"
    SET "leasedUntil" = ${new Date(Date.now() + OUTBOX_LEASE_MS)}
    WHERE "id" = ${id} AND "status" = 'sending' AND "leaseId" = ${leaseId}
  ` === 1;
}

export async function enqueueEmail(message: EmailMessage, idempotencyKey: string): Promise<boolean> {
  if (!process.env.DATABASE_URL || process.env.OUTSIDE_STORAGE_MODE === "memory") {
    await getEmailProvider().send(message);
    return true;
  }
  const changed = await prisma.$executeRaw`
    INSERT INTO "email_outbox" ("id", "idempotencyKey", "to", "subject", "html", "text", "status", "attempts", "nextAttemptAt", "createdAt")
    VALUES (${randomUUID()}, ${idempotencyKey}, ${message.to}, ${message.subject}, ${message.html}, ${message.text}, 'pending', 0, NOW(), NOW())
    ON CONFLICT ("idempotencyKey") DO NOTHING
  `;
  return changed === 1;
}

export async function deliverOutboxBatch(limit = 10): Promise<{ sent: number; failed: number }> {
  if (!process.env.DATABASE_URL || process.env.OUTSIDE_STORAGE_MODE === "memory") return { sent: 0, failed: 0 };
  const batchSize = Math.min(Math.max(Math.trunc(limit), 0), 100);
  let sent = 0, failed = 0;
  for (let claimed = 0; claimed < batchSize; claimed += 1) {
    const item = await claimOneEmail();
    if (!item) break;
    const { row, leaseId } = item;
    try {
      // Each item is claimed immediately before use. The renewal is a CAS:
      // if another worker recovered this row, do not perform the side effect.
      if (!await renewEmailLease(row.id, leaseId)) continue;
      await getEmailProvider().send({ to: row.to, subject: row.subject, html: row.html, text: row.text });
      const completed = await prisma.$executeRaw`UPDATE "email_outbox" SET "status" = 'sent', "sentAt" = NOW(), "leaseId" = NULL, "leasedUntil" = NULL, "lastError" = NULL WHERE "id" = ${row.id} AND "status" = 'sending' AND "leaseId" = ${leaseId}`;
      if (completed === 1) sent += 1;
    } catch (error) {
      const terminal = row.attempts >= 8;
      const delayMinutes = Math.min(360, 2 ** Math.min(row.attempts, 8));
      const completed = await prisma.$executeRaw`
        UPDATE "email_outbox" SET "status" = ${terminal ? "failed" : "retry"}, "nextAttemptAt" = ${new Date(Date.now() + delayMinutes * 60_000)},
          "leaseId" = NULL, "leasedUntil" = NULL, "lastError" = ${(error as Error).message.slice(0, 1_000)}
        WHERE "id" = ${row.id} AND "status" = 'sending' AND "leaseId" = ${leaseId}
      `;
      if (completed === 1) failed += 1;
    }
  }
  return { sent, failed };
}

/** Enqueue durably, then make one best-effort delivery pass for low latency. */
export async function sendDurably(message: EmailMessage, idempotencyKey: string): Promise<boolean> {
  const queued = await enqueueEmail(message, idempotencyKey);
  const immediate = process.env.OUTSIDE_EMAIL_IMMEDIATE_DELIVERY !== "false";
  if (queued && process.env.DATABASE_URL && immediate) await deliverOutboxBatch(5).catch((error) => console.error("[email] outbox delivery deferred", error));
  return queued;
}
