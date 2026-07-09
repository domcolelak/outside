/**
 * Monitored targets + scheduling.
 *
 * A Monitor is a domain an organization watches on a cadence. Scheduling is
 * serverless-friendly: instead of a long-running worker/Redis queue, a
 * protected cron endpoint (`/api/cron/scan`) claims due monitors and runs them.
 * This keeps infra minimal (works on Vercel Cron, GitHub Actions, or any curl on
 * a timer) while remaining idempotent via `nextRunAt`.
 */

import type { Organization } from "@/lib/auth/model";

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
  /** Monitors whose nextRunAt has passed and are enabled. */
  due(now: Date, limit: number): Promise<Monitor[]>;
  markRan(id: string, ranAt: Date): Promise<void>;
}

class InMemoryMonitorStore implements MonitorStore {
  readonly durable = false;
  private monitors: Monitor[] = [];
  private id() {
    return `mon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  async due(now: Date, limit: number) {
    return this.monitors.filter((m) => m.enabled && new Date(m.nextRunAt) <= now).slice(0, limit);
  }
  async markRan(id: string, ranAt: Date) {
    const m = this.monitors.find((x) => x.id === id);
    if (!m) return;
    m.lastScanAt = ranAt.toISOString();
    m.nextRunAt = nextRunAt(ranAt, m.frequency);
  }
}

// Cache on globalThis so all route bundles in the process share one in-memory
// store (module-level singletons are not shared across route bundles).
const g = globalThis as unknown as { __outsideMonitorStore?: MonitorStore };

export async function getMonitorStore(): Promise<MonitorStore> {
  if (g.__outsideMonitorStore) return g.__outsideMonitorStore;
  let store: MonitorStore | null = null;
  if (process.env.DATABASE_URL) {
    try {
      const mod = await import("./prisma-store");
      store = new mod.PrismaMonitorStore();
    } catch (err) {
      console.warn("[monitoring] Prisma store unavailable, using in-memory:", (err as Error).message);
    }
  }
  g.__outsideMonitorStore = store ?? new InMemoryMonitorStore();
  return g.__outsideMonitorStore;
}

export function __resetMonitorStore(store?: MonitorStore) {
  g.__outsideMonitorStore = store;
}
