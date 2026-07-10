/**
 * Webhook idempotency. Durable via a Postgres table when DATABASE_URL is set
 * (survives restarts and works across instances); falls back to an in-memory set
 * otherwise. Returns true the first time an event id is seen, false for
 * duplicates.
 */

const memo = new Set<string>();

export async function markProcessedOnce(eventId: string): Promise<boolean> {
  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const g = globalThis as unknown as { __outsidePrisma?: InstanceType<typeof PrismaClient> };
      const prisma = g.__outsidePrisma ?? new PrismaClient();
      if (process.env.NODE_ENV !== "production") g.__outsidePrisma = prisma;
      await prisma.processedEvent.create({ data: { id: eventId } });
      return true;
    } catch (err) {
      // Unique-constraint violation => already processed.
      if ((err as { code?: string })?.code === "P2002") return false;
      // Any other DB error: fall through to the in-memory guard rather than
      // dropping the event.
    }
  }
  if (memo.has(eventId)) return false;
  memo.add(eventId);
  return true;
}
