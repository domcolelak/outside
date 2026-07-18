import { storageMode } from "@/lib/config/storage";
import { InMemoryAgencyStore } from "./memory-store";
import type { AgencyStore } from "./store-model";

const globalAgency = globalThis as unknown as { __outsideAgencyStore?: AgencyStore };
export async function getAgencyStore(): Promise<AgencyStore> {
  if (globalAgency.__outsideAgencyStore) return globalAgency.__outsideAgencyStore;
  if (storageMode() === "database") {
    const adapter = await import("./prisma-store");
    globalAgency.__outsideAgencyStore = new adapter.PrismaAgencyStore();
  } else globalAgency.__outsideAgencyStore = new InMemoryAgencyStore();
  return globalAgency.__outsideAgencyStore;
}
export function __resetAgencyStore(store?: AgencyStore) { globalAgency.__outsideAgencyStore = store; }
export * from "./store-model";
