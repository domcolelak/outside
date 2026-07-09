import { PrismaClient } from "@prisma/client";
import type { Frequency, Monitor, MonitorStore } from "./index";
import { nextRunAt } from "./index";

const g = globalThis as unknown as { __outsidePrisma?: PrismaClient };
const prisma = g.__outsidePrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__outsidePrisma = prisma;

function map(r: { id: string; orgId: string; domain: string; frequency: string; enabled: boolean; lastScanAt: Date | null; nextRunAt: Date; createdAt: Date }): Monitor {
  return {
    id: r.id,
    orgId: r.orgId,
    domain: r.domain,
    frequency: (r.frequency as Frequency) ?? "daily",
    enabled: r.enabled,
    lastScanAt: r.lastScanAt?.toISOString() ?? null,
    nextRunAt: r.nextRunAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
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
  async due(now: Date, limit: number) {
    return (await prisma.monitor.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, take: limit })).map(map);
  }
  async markRan(id: string, ranAt: Date) {
    const row = await prisma.monitor.findUnique({ where: { id } });
    if (!row) return;
    await prisma.monitor.update({ where: { id }, data: { lastScanAt: ranAt, nextRunAt: new Date(nextRunAt(ranAt, (row.frequency as Frequency) ?? "daily")) } });
  }
}
