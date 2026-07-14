import type { SessionContext } from "./model";
import { authorizedTargetOrg } from "./target-access";

export async function targetEntitlement(
  ctx: SessionContext | null,
  target: string,
  options: { paid?: boolean; allowDemo?: boolean } = {},
): Promise<{ orgId: string; plan: "free" | "professional" | "agency" } | null> {
  if (!ctx?.user.emailVerifiedAt) return null;
  if (options.allowDemo && target.endsWith(".example")) {
    const membership = ctx.memberships.find((item) => !options.paid || item.org.plan !== "free");
    return membership ? { orgId: membership.org.id, plan: membership.org.plan } : null;
  }
  const orgId = await authorizedTargetOrg(ctx, target, "viewer");
  const membership = ctx.memberships.find((item) => item.org.id === orgId);
  if (!orgId || !membership || (options.paid && membership.org.plan === "free")) return null;
  return { orgId, plan: membership.org.plan };
}
