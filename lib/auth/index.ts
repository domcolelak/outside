import { cookies } from "next/headers";
import type { AuthStore, Role, SessionContext } from "./model";
import { InMemoryAuthStore } from "./memory-store";
import { SESSION_COOKIE, verifySession } from "./session";
import { roleAtLeast } from "./model";
import { storageMode } from "@/lib/config/storage";

// Cache on globalThis so every route bundle in the same process shares one
// in-memory store instance (module-level singletons would not be shared).
const g = globalThis as unknown as { __outsideAuthStore?: AuthStore };

export async function getAuthStore(): Promise<AuthStore> {
  if (g.__outsideAuthStore) return g.__outsideAuthStore;
  if (storageMode() === "database") {
    const mod = await import("./prisma-store");
    g.__outsideAuthStore = new mod.PrismaAuthStore();
  } else {
    g.__outsideAuthStore = new InMemoryAuthStore();
  }
  return g.__outsideAuthStore;
}

export function __resetAuthStore(store?: AuthStore) {
  g.__outsideAuthStore = store;
}

/** Resolve the current session from the request cookie, or null. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  if (!session) return null;
  const store = await getAuthStore();
  const user = await store.getUser(session.uid);
  if (!user) return null;
  const memberships = await store.membershipsForUser(user.id);
  const { passwordHash, ...safe } = user;
  void passwordHash;
  return { user: safe, memberships };
}

/** RBAC gate: true if the user holds at least `min` in the given org. */
export function hasOrgRole(ctx: SessionContext | null, orgId: string, min: Role): boolean {
  if (!ctx) return false;
  const m = ctx.memberships.find((x) => x.org.id === orgId);
  return !!m && roleAtLeast(m.role, min);
}

export * from "./model";
