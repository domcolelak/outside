/**
 * Store factory. Returns a durable Prisma-backed store when DATABASE_URL is set,
 * otherwise the zero-config in-memory store. The Prisma store is loaded lazily
 * via dynamic import so the app builds and runs with no database and without the
 * Prisma client installed.
 */

import type { ScanStore } from "./model";
import { InMemoryScanStore } from "./memory-store";

// Cache on globalThis so all route bundles in the process share one in-memory
// store (module-level singletons are not shared across route bundles).
const g = globalThis as unknown as { __outsideScanStore?: ScanStore };

export async function getStore(): Promise<ScanStore> {
  if (g.__outsideScanStore) return g.__outsideScanStore;
  let store: ScanStore | null = null;
  if (process.env.DATABASE_URL) {
    try {
      const mod = await import("./prisma-store");
      store = new mod.PrismaScanStore();
    } catch (err) {
      // Fail safe: never take down scanning because persistence is misconfigured.
      console.warn("[persistence] Prisma store unavailable, falling back to in-memory:", (err as Error).message);
    }
  }
  g.__outsideScanStore = store ?? new InMemoryScanStore();
  return g.__outsideScanStore;
}

/** Test hook. */
export function __resetStore(store?: ScanStore) {
  g.__outsideScanStore = store;
}

export * from "./model";
export { diffScans, summarize, toSnapshot, applyHistoryFlags } from "./diff";
