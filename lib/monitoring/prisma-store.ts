import type { Frequency, Monitor, MonitorStore } from "./index";
import { nextRunAt } from "./index";
import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";

type MonitorRow = { id: string; orgId: string; domain: string; frequency: string; enabled: boolean; lastScanAt: Date | null; nextRunAt: Date; createdAt: Date; leaseId?: string | null; leaseUntil?: Date | null; attempts?: number; lastError?: string | null };
function map(r: MonitorRow): Monitor {
  return {
    id: r.id,
    orgId: r.orgId,
    domain: r.domain,
    frequency: (r.frequency as Frequency) ?? "daily",
    enabled: r.enabled,
    lastScanAt: r.lastScanAt?.toISOString() ?? null,
    nextRunAt: r.nextRunAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    leaseId: r.leaseId ?? null,
    leaseUntil: r.leaseUntil?.toISOString() ?? null,
    attempts: r.attempts ?? 0,
    lastError: r.lastError ?? null,
  };
}

export class PrismaMonitorStore implements MonitorStore {
  readonly durable = true;

  async list(orgId: string) {
    return (await prisma.monitor.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } })).map(map);
  }
  async create(input: { orgId: string; domain: string; frequency: Frequency }) {
    const row = await prisma.monitor.create({
      data: { orgId: input.orgId, domain: input.domain.toLowerCase(), frequency: input.frequency, nextRunAt: new Date() },
    });
    return map(row);
  }
  async setEnabled(id: string, orgId: string, enabled: boolean) {
    const res = await prisma.monitor.updateMany({ where: { id, orgId }, data: { enabled } });
    if (res.count === 0) return null;
    const row = await prisma.monitor.findUnique({ where: { id } });
    return row ? map(row) : null;
  }
  async remove(id: string, orgId: string) {
    const res = await prisma.monitor.deleteMany({ where: { id, orgId } });
    return res.count > 0;
  }
  async claimDue(now: Date, limit: number, leaseMs: number) {
    const leaseId = randomUUID();
    const rows = await prisma.$queryRaw<MonitorRow[]>`
      UPDATE "monitors" SET
        "leaseId" = ${leaseId}, "leaseUntil" = ${new Date(now.getTime() + leaseMs)}, "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "monitors"
        WHERE "enabled" = true AND "nextRunAt" <= ${now} AND ("leaseUntil" IS NULL OR "leaseUntil" <= ${now})
        ORDER BY "nextRunAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      RETURNING *
    `;
    return rows.map(map);
  }
  async complete(id: string, leaseId: string, ranAt: Date) {
    const changed = await prisma.$executeRaw`
      UPDATE "monitors" SET "lastScanAt" = ${ranAt},
        "nextRunAt" = ${ranAt} + CASE WHEN "frequency" = 'weekly' THEN INTERVAL '7 days' ELSE INTERVAL '1 day' END,
        "leaseId" = NULL, "leaseUntil" = NULL, "lastError" = NULL
      WHERE "id" = ${id} AND "leaseId" = ${leaseId}
    `;
    return changed === 1;
  }
  async fail(id: string, leaseId: string, error: string, retryAt: Date) {
    const changed = await prisma.$executeRaw`
      UPDATE "monitors" SET "leaseId" = NULL, "leaseUntil" = NULL, "lastError" = ${error.slice(0, 1_000)}, "nextRunAt" = ${retryAt}
      WHERE "id" = ${id} AND "leaseId" = ${leaseId}
    `;
    return changed === 1;
  }
}
