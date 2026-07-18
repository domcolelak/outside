import { NextRequest, NextResponse } from "next/server";
import { getAuthStore, getSessionContext, hasOrgRole } from "@/lib/auth";
import { agencyAccess } from "@/lib/agency/access";
import { portfolioOverview } from "@/lib/agency/service";
import { getAgencyStore } from "@/lib/agency/store";
import { cleanText, optionalHttpsUrl, validColor, validSlug } from "@/lib/agency/validation";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
import { getStore } from "@/lib/persistence";
import { recordFunnelEvent } from "@/lib/observability/metrics";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  const agencyId = new URL(req.url).searchParams.get("agencyId"); const access = await agencyAccess(req, "agency:read", agencyId);
  if (!access) return json({ error: "Agency access required" }, 403);
  return json(await portfolioOverview(access.workspace.id, access.role));
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionContext(); if (!ctx?.user.emailVerifiedAt) return json({ error: "Verified authentication required" }, 401);
  let body: Record<string, unknown>; try { body = await readLimitedJson(req, 20_000) as Record<string, unknown>; } catch (error) { return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 400); }
  const ownerOrgId = cleanText(body.ownerOrgId, 100); const membership = ctx.memberships.find((item) => item.org.id === ownerOrgId);
  if (!membership || !hasOrgRole(ctx, ownerOrgId, "owner") || membership.org.plan !== "agency") return json({ error: "An Agency-plan organization owner is required" }, 403);
  if (!(await requireBudgets([{ key: `agency:create:${ctx.user.id}`, limit: 3, windowMs: 86_400_000 }, { key: `agency:create:${clientIdentity(req)}`, limit: 10, windowMs: 86_400_000 }])).ok) return json({ error: "Workspace creation limit exceeded" }, 429);
  const name = cleanText(body.name, 100); const slug = validSlug(body.slug || name); if (name.length < 2 || slug.length < 2) return json({ error: "Valid agency name and slug are required" }, 422);
  try { const workspace = await (await getAgencyStore()).createWorkspace({ ownerOrgId, ownerUserId: ctx.user.id, name, slug }); recordFunnelEvent("agency_created", "product"); return json({ workspace }, 201); } catch { return json({ error: "Agency workspace or slug already exists" }, 409); }
}

export async function PATCH(req: NextRequest) {
  const agencyId = new URL(req.url).searchParams.get("agencyId"); const access = await agencyAccess(req, "agency:manage", agencyId); if (!access) return json({ error: "Agency admin access required" }, 403);
  let body: Record<string, unknown>; try { body = await readLimitedJson(req, 30_000) as Record<string, unknown>; } catch (error) { return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 400); }
  const branding = body.branding && typeof body.branding === "object" ? body.branding as Record<string, unknown> : {};
  const customDomain = branding.customDomain === undefined ? undefined : cleanText(branding.customDomain, 253).toLowerCase() || null;
  if (customDomain) { const verification = await (await getStore()).getVerification(customDomain, access.workspace.ownerOrgId); if (verification?.status !== "verified") return json({ error: "Verify the custom domain in the owner organization before enabling it" }, 403); }
  let resellerParentId: string | null | undefined;
  if (body.resellerParentId !== undefined) {
    resellerParentId = cleanText(body.resellerParentId, 100) || null;
    if (access.role !== "owner" || !access.session) return json({ error: "Only the agency owner can change reseller hierarchy" }, 403);
    if (resellerParentId) { const store = await getAgencyStore(); const [parent, membership] = await Promise.all([store.workspace(resellerParentId), store.membershipForUser(resellerParentId, access.session.user.id)]); if (!parent || !membership || !["owner", "admin"].includes(membership.role) || parent.id === access.workspace.id || parent.resellerParentId === access.workspace.id) return json({ error: "Invalid or unauthorized reseller parent" }, 403); }
  }
  const patch = { name: body.name === undefined ? undefined : cleanText(body.name, 100), consultantMode: typeof body.consultantMode === "boolean" ? body.consultantMode : undefined, resellerParentId, branding: { whiteLabel: typeof branding.whiteLabel === "boolean" ? branding.whiteLabel : undefined, logoUrl: branding.logoUrl === undefined ? undefined : optionalHttpsUrl(branding.logoUrl), primaryColor: branding.primaryColor === undefined ? undefined : validColor(branding.primaryColor, access.workspace.branding.primaryColor), accentColor: branding.accentColor === undefined ? undefined : validColor(branding.accentColor, access.workspace.branding.accentColor), supportEmail: branding.supportEmail === undefined ? undefined : cleanText(branding.supportEmail, 200) || null, customDomain, emailFromName: branding.emailFromName === undefined ? undefined : cleanText(branding.emailFromName, 100) || null, emailFooter: branding.emailFooter === undefined ? undefined : cleanText(branding.emailFooter, 500) || null } };
  const workspace = await (await getAgencyStore()).updateWorkspace(access.workspace.id, patch); return json({ workspace });
}
