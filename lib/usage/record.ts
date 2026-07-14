import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

export async function recordUsage(orgId: string, userId: string, kind: "ai" | "report" | "scan", units = 1): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await prisma.$executeRaw`
    INSERT INTO "usage_events" ("id", "orgId", "userId", "kind", "units", "createdAt")
    VALUES (${randomUUID()}, ${orgId}, ${userId}, ${kind}, ${units}, NOW())
  `;
}
