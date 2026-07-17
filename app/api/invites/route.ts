import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getAuthStore, getSessionContext, hasOrgRole, type Role } from "@/lib/auth";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
import { appendAudit } from "@/lib/aegis/store";
import { sendDurably } from "@/lib/email/outbox";
import { inviteEmail } from "@/lib/email/templates";
import { APP_URL } from "@/lib/config/runtime";
import { isValidEmail } from "@/lib/auth/validation";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { recordFunnelEvent } from "@/lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "analyst", "viewer"];

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!ctx.user.emailVerifiedAt) return NextResponse.json({ error: "Verify your email before inviting teammates.", code: "email_unverified" }, { status: 403 });
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  if (!hasOrgRole(ctx, orgId, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const store = await getAuthStore();
  return NextResponse.json({ invites: await store.listInvites(orgId) });
}

/** Invite a teammate to an org (admin+). Sends an invite email (dev: console). */
export async function POST(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; email?: string; role?: string };
  try {
    body = await readLimitedJson(req, 12_000) as typeof body;
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request" }, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const orgId = String(body.orgId ?? "");
  const membership = ctx.memberships.find((m) => m.org.id === orgId);
  if (!membership || !hasOrgRole(ctx, orgId, "admin")) {
    return NextResponse.json({ error: "Admin access required to invite." }, { status: 403 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 422 });
  if (email === ctx.user.email) return NextResponse.json({ error: "You are already a member of this organization." }, { status: 409 });
  // Only owners may grant admin; cap the invited role at the inviter's own level.
  let role = (ROLES.includes(body.role as Role) ? body.role : "analyst") as Role;
  if (role === "admin" && !hasOrgRole(ctx, orgId, "owner")) role = "analyst";

  const store = await getAuthStore();
  const [members, pending] = await Promise.all([store.orgMembers(orgId), store.listInvites(orgId)]);
  if (members.some((member) => member.email === email)) return NextResponse.json({ error: "That person is already a member." }, { status: 409 });
  if (pending.some((invite) => invite.email === email)) return NextResponse.json({ error: "An active invitation already exists for that email." }, { status: 409 });

  const recipient = createHash("sha256").update(email).digest("hex").slice(0, 24);
  const limit = await requireBudgets([
    { key: `invite:client:${clientIdentity(req)}`, limit: 10, windowMs: 60 * 60_000 },
    { key: `invite:user:${ctx.user.id}`, limit: 10, windowMs: 24 * 60 * 60_000 },
    { key: `invite:org:${orgId}`, limit: 25, windowMs: 24 * 60 * 60_000 },
    { key: `invite:recipient:${recipient}`, limit: 3, windowMs: 7 * 24 * 60 * 60_000 },
  ]);
  if (!limit.ok) return NextResponse.json({ error: "Invitation quota exceeded. Try again later." }, { status: 429 });
  const token = randomBytes(24).toString("base64url");
  const invite = await store.createInvite(orgId, email, role, token, ctx.user.id);
  await appendAudit({ orgId, target: `org:${orgId}`, actor: ctx.user.id, action: "invite.created", detail: `${invite.id}:${role}` });

  // Fire-and-forget invite email (console transport unless configured).
  const acceptUrl = `${APP_URL}/invite/${token}`;
  await sendDurably(inviteEmail(email, membership.org.name, role, acceptUrl), `invite:${invite.id}`);

  recordFunnelEvent("invite_created", "product");
  return NextResponse.json({ invite: { id: invite.id, email: invite.email, role: invite.role }, acceptUrl });
}
