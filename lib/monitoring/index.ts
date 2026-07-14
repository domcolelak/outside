/**
 * Monitored targets + scheduling.
 *
 * A Monitor is a domain an organization watches on a cadence. Scheduling is
 * serverless-friendly: instead of a long-running worker/Redis queue, a
 * protected cron endpoint (`/api/cron/scan`) claims due monitors and runs them.
 * This keeps infra minimal (works on Vercel Cron, GitHub Actions, or any curl on
 * a timer) while remaining idempotent through atomic leases and stable run IDs.
 */

import type { Organization } from "@/lib/auth/model";
import { storageMode } from "@/lib/config/storage";
import { randomUUID } from "node:crypto";

export type Frequency = "daily" | "weekly";

export interface Monitor {
  id: string;
  orgId: string;
  domain: string;
  frequency: Frequency;
  enabled: boolean;
  lastScanAt: string | null;
  nextRunAt: string;
  createdAt: string;
  leaseId: string | null;
  leaseUntil: string | null;
  attempts: number;
  lastError: string | null;
}

/** Per-plan monitored-domain limits (aligns with landing-page pricing). */
export const PLAN_MONITOR_LIMIT: Record<Organization["plan"], number> = {
  free: 1,
  professional: 5,
  agency: 30,
};

export function nextRunAt(from: Date, frequency: Frequency): string {
  const ms = frequency === "weekly" ? 7 * 864e5 : 864e5;
  return new Date(from.getTime() + ms).toISOString();
}

export interface MonitorStore {
  readonly durable: boolean;
  list(orgId: string): Promise<Monitor[]>;
  create(input: { orgId: string; domain: string; frequency: Frequency }): Promise<Monitor>;
  setEnabled(id: string, orgId: string, enabled: boolean): Promise<Monitor | null>;
  remove(id: string, orgId: string): Promise<boolean>;
  /** Atomically claim due work, excluding live leases. */
  claimDue(now: Date, limit: number, leaseMs: number): Promise<Monitor[]>;
  complete(id: string, leaseId: string, ranAt: Date): Promise<boolean>;
  fail(id: string, leaseId: string, error: string, retryAt: Date): Promise<boolean>;
}

class InMemoryMonitorStore implements MonitorStore {
  readonly durable = false;
  private monitors: Monitor[] = [];
  private id() {
    return `mon_${randomUUID()}`;
  }
  async list(orgId: string) {
    return this.monitors.filter((m) => m.orgId === orgId);
  }
  async create(input: { orgId: string; domain: string; frequency: Frequency }) {
    const now = new Date();
    const m: Monitor = {
      id: this.id(),
      orgId: input.orgId,
      domain: input.domain.toLowerCase(),
      frequency: input.frequency,
      enabled: true,
      lastScanAt: null,
      nextRunAt: now.toISOString(), // eligible immediately on first cron tick
      createdAt: now.toISOString(),
      leaseId: null,
      leaseUntil: null,
      attempts: 0,
      lastError: null,
    };
    this.monitors.push(m);
    return m;
  }
  async setEnabled(id: string, orgId: string, enabled: boolean) {
    const m = this.monitors.find((x) => x.id === id && x.orgId === orgId);
    if (!m) return null;
    m.enabled = enabled;
    return m;
  }
  async remove(id: string, orgId: string) {
    const before = this.monitors.length;
    this.monitors = this.monitors.filter((x) => !(x.id === id && x.orgId === orgId));
    return this.monitors.length < before;
  }
  async claimDue(now: Date, limit: number, leaseMs: number) {
    const leaseId = randomUUID();
    const rows = this.monitors.filter((m) => m.enabled && new Date(m.nextRunAt) <= now && (!m.leaseUntil || new Date(m.leaseUntil) <= now)).slice(0, limit);
    for (const monitor of rows) {
      monitor.leaseId = leaseId;
      monitor.leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
      monitor.attempts += 1;
    }
    return rows;
  }
  async complete(id: string, leaseId: string, ranAt: Date) {
    const m = this.monitors.find((x) => x.id === id && x.leaseId === leaseId);
    if (!m) return false;
    m.lastScanAt = ranAt.toISOString();
    m.nextRunAt = nextRunAt(ranAt, m.frequency);
    m.leaseId = null; m.leaseUntil = null; m.lastError = null;
    return true;
  }
  async fail(id: string, leaseId: string, error: string, retryAt: Date) {
    const m = this.monitors.find((x) => x.id === id && x.leaseId === leaseId);
    if (!m) return false;
    m.leaseId = null; m.leaseUntil = null; m.lastError = error.slice(0, 1_000); m.nextRunAt = retryAt.toISOString();
    return true;
  }
}

// Cache on globalThis so all route bundles in the process share one in-memory
// store (module-level singletons are not shared across route bundles).
const g = globalThis as unknown as { __outsideMonitorStore?: MonitorStore };

export async function getMonitorStore(): Promise<MonitorStore> {
  if (g.__outsideMonitorStore) return g.__outsideMonitorStore;
  if (storageMode() === "database") {
    const mod = await import("./prisma-store");
    g.__outsideMonitorStore = new mod.PrismaMonitorStore();
  } else {
    g.__outsideMonitorStore = new InMemoryMonitorStore();
  }
  return g.__outsideMonitorStore;
}

export function __resetMonitorStore(store?: MonitorStore) {
  g.__outsideMonitorStore = store;
}
