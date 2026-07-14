/**
 * Store factory. Returns a durable Prisma-backed store when DATABASE_URL is set,
 * otherwise the zero-config in-memory store. The Prisma store is loaded lazily
 * via dynamic import so the app builds and runs with no database and without the
 * Prisma client installed.
 */

import type { ScanStore } from "./model";
import { InMemoryScanStore } from "./memory-store";
import { storageMode } from "@/lib/config/storage";

// Cache on globalThis so all route bundles in the process share one in-memory
// store (module-level singletons are not shared across route bundles).
const g = globalThis as unknown as { __outsideScanStore?: ScanStore };

export async function getStore(): Promise<ScanStore> {
  if (g.__outsideScanStore) return g.__outsideScanStore;
  if (storageMode() === "database") {
    const mod = await import("./prisma-store");
    g.__outsideScanStore = new mod.PrismaScanStore();
  } else {
    g.__outsideScanStore = new InMemoryScanStore();
  }
  return g.__outsideScanStore;
}

/** Test hook. */
export function __resetStore(store?: ScanStore) {
  g.__outsideScanStore = store;
}

export * from "./model";
export { diffScans, summarize, toSnapshot, applyHistoryFlags } from "./diff";
