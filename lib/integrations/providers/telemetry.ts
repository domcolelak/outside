/**
 * Shared usage telemetry for provider calls. One row per operation with the
 * outcome, mapped error code and latency — never a secret or provider payload.
 * Backs the per-connection "usage" summary and quota/rate awareness. Every
 * provider uses this; there is no per-provider telemetry table.
 */

import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";
import type { IntegrationProvider } from "@/lib/integrations/connections";
import type { ProviderErrorCode } from "./types";

export type ProviderOperation = "validate" | "connect" | "replace" | "disconnect" | "status" | "search";

export interface ProviderUsageSummary {
  total: number;
  failures: number;
  lastUsedAt?: string;
  lastErrorCode?: string;
}

interface UsageRow {
  orgId: string;
  provider: IntegrationProvider;
  operation: ProviderOperation;
  ok: boolean;
  status?: number;
  errorCode?: ProviderErrorCode;
  latencyMs?: number;
  createdAt: string;
}

const g = globalThis as unknown as { __outsideProviderUsage?: UsageRow[] };
function mem() {
  return (g.__outsideProviderUsage ??= []);
}
function db() {
  return storageMode() === "database" ? database : null;
}

export async function recordProviderUsage(input: {
  orgId: string;
  provider: IntegrationProvider;
  operation: ProviderOperation;
  ok: boolean;
  status?: number;
  errorCode?: ProviderErrorCode;
  latencyMs?: number;
}): Promise<void> {
  const conn = db();
  try {
    if (conn) {
      await conn.providerUsageEvent.create({
        data: {
          orgId: input.orgId,
          provider: input.provider,
          operation: input.operation,
          ok: input.ok,
          status: input.status ?? null,
          errorCode: input.errorCode ?? null,
          latencyMs: input.latencyMs ?? null,
        },
      });
    } else {
      mem().push({ ...input, createdAt: new Date().toISOString() });
    }
  } catch {
    // Telemetry must never break the request path.
  }
}

export async function providerUsageSummary(orgId: string, provider: IntegrationProvider): Promise<ProviderUsageSummary> {
  const conn = db();
  if (conn) {
    const [total, failures, last] = await Promise.all([
      conn.providerUsageEvent.count({ where: { orgId, provider } }),
      conn.providerUsageEvent.count({ where: { orgId, provider, ok: false } }),
      conn.providerUsageEvent.findFirst({ where: { orgId, provider }, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      total,
      failures,
      lastUsedAt: last?.createdAt.toISOString(),
      lastErrorCode: last?.errorCode ?? undefined,
    };
  }
  const rows = mem().filter((r) => r.orgId === orgId && r.provider === provider);
  const last = rows[rows.length - 1];
  return {
    total: rows.length,
    failures: rows.filter((r) => !r.ok).length,
    lastUsedAt: last?.createdAt,
    lastErrorCode: last?.errorCode,
  };
}

/** Test-only reset of the in-memory fallback. */
export function __resetProviderUsage(): void {
  g.__outsideProviderUsage = [];
}
