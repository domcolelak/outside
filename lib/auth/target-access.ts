import { roleAtLeast, type Role, type SessionContext } from "./model";
import { getStore } from "@/lib/persistence";

/**
 * Resolve the verified organization that owns a target and enforce membership.
 * Target-owned state must never be keyed or authorized by the domain alone.
 */
export async function authorizedTargetOrg(
  ctx: SessionContext | null,
  target: string,
  minimumRole: Role,
): Promise<string | null> {
  if (!ctx) return null;
  const store = await getStore();
  for (const membership of ctx.memberships) {
    if (!roleAtLeast(membership.role, minimumRole)) continue;
    const verification = await store.getVerification(target, membership.org.id);
    if (verification?.status === "verified") return membership.org.id;
  }
  return null;
}
