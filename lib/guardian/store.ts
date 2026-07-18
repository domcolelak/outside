import { storageMode } from "@/lib/config/storage";
import { InMemoryGuardianStore } from "./memory-store";
import type { GuardianStore } from "./store-model";

const globalGuardian = globalThis as unknown as { __outsideGuardianStore?: GuardianStore };

export async function getGuardianStore(): Promise<GuardianStore> {
  if (globalGuardian.__outsideGuardianStore) return globalGuardian.__outsideGuardianStore;
  if (storageMode() === "database") {
    const adapter = await import("./prisma-store");
    globalGuardian.__outsideGuardianStore = new adapter.PrismaGuardianStore();
  } else {
    globalGuardian.__outsideGuardianStore = new InMemoryGuardianStore();
  }
  return globalGuardian.__outsideGuardianStore!;
}

export function __resetGuardianStore(store?: GuardianStore) {
  globalGuardian.__outsideGuardianStore = store;
}

export * from "./store-model";
