import { storageMode } from "@/lib/config/storage";
import { InMemoryEnterpriseStore } from "./memory-store";
import type { EnterpriseStore } from "./store-model";

const globalEnterprise = globalThis as unknown as { __outsideEnterpriseStore?: EnterpriseStore };
export async function getEnterpriseStore(): Promise<EnterpriseStore> {
  if (globalEnterprise.__outsideEnterpriseStore) return globalEnterprise.__outsideEnterpriseStore;
  if (storageMode() === "database") { const adapter = await import("./prisma-store"); globalEnterprise.__outsideEnterpriseStore = new adapter.PrismaEnterpriseStore(); }
  else globalEnterprise.__outsideEnterpriseStore = new InMemoryEnterpriseStore();
  return globalEnterprise.__outsideEnterpriseStore!;
}
export function __resetEnterpriseStore(store?: EnterpriseStore) { globalEnterprise.__outsideEnterpriseStore = store; }
export * from "./store-model";
