import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const completed = new Set<string>();
const inFlight = new Set<string>();

/** The event marker commits in the same transaction as all business changes. */
export async function processWebhookOnce(
  eventId: string,
  handler: (tx: Prisma.TransactionClient | null) => Promise<void>,
): Promise<"processed" | "duplicate"> {
  if (process.env.DATABASE_URL && process.env.OUTSIDE_STORAGE_MODE !== "memory") {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.processedEvent.create({ data: { id: eventId } });
        await handler(tx);
      });
      return "processed";
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return "duplicate";
      throw error;
    }
  }
  if (completed.has(eventId) || inFlight.has(eventId)) return "duplicate";
  inFlight.add(eventId);
  try {
    await handler(null);
    completed.add(eventId);
    return "processed";
  } finally { inFlight.delete(eventId); }
}

export function __resetWebhookEvents(): void { completed.clear(); inFlight.clear(); }
