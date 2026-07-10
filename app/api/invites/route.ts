import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getAuthStore, getSessionContext, hasOrgRole, type Role } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES: Role[] = ["admin", "analyst", "viewer"];

export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orgId = String(body.orgId ?? "");
  const membership = ctx.memberships.find((m) => m.org.id === orgId);
  if (!membership || !hasOrgRole(ctx, orgId, "admin")) {
    return NextResponse.json({ error: "Admin access required to invite." }, { status: 403 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 422 });
  // Only owners may grant admin; cap the invited role at the inviter's own level.
  let role = (ROLES.includes(body.role as Role) ? body.role : "analyst") as Role;
  if (role === "admin" && !hasOrgRole(ctx, orgId, "owner")) role = "analyst";

  const store = await getAuthStore();
  const token = randomBytes(24).toString("base64url");
  const invite = await store.createInvite(orgId, email, role, token);

  // Fire-and-forget invite email (console transport unless configured).
  const acceptUrl = `${APP_URL}/invite/${token}`;
  import("@/lib/email/provider")
    .then(({ getEmailProvider }) => import("@/lib/email/templates").then(({ inviteEmail }) => getEmailProvider().send(inviteEmail(email, membership.org.name, role, acceptUrl))))
    .catch(() => {});

  return NextResponse.json({ invite: { id: invite.id, email: invite.email, role: invite.role }, acceptUrl });
}
