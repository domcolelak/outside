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
  const verification = await (await getStore()).getVerification(target);
  if (verification?.status !== "verified" || !verification.orgId) return null;
  const membership = ctx.memberships.find((item) => item.org.id === verification.orgId);
  return membership && roleAtLeast(membership.role, minimumRole) ? verification.orgId : null;
}
