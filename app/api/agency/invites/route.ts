import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { agencyAccess } from "@/lib/agency/access";
import { getAgencyStore } from "@/lib/agency/store";
import { cleanText } from "@/lib/agency/validation";
import { isValidEmail } from "@/lib/auth/validation";
import { sendDurably } from "@/lib/email/outbox";
import { agencyInviteEmail } from "@/lib/email/templates";
import { APP_URL } from "@/lib/config/runtime";
import { readLimitedJson } from "@/lib/http/body";
import { requireBudgets } from "@/lib/security/ratelimit";
import type { AgencyPermission, AgencyRole } from "@/lib/agency/types";

const ROLES: AgencyRole[] = ["admin", "manager", "analyst", "billing", "viewer"];
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await agencyAccess(req, "seats:manage", new URL(req.url).searchParams.get("agencyId"));
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const store = await getAgencyStore();
  return NextResponse.json({ members: await store.memberships(access.workspace.id), invites: await store.invites(access.workspace.id) });
}

export async function POST(req: NextRequest) {
  const body = await readLimitedJson(req, 10_000) as Record<string, unknown>;
  const kind = body.kind === "client_portal" ? "client_portal" : "seat";
  const permission: AgencyPermission = kind === "seat" ? "seats:manage" : "clients:manage";
  const access = await agencyAccess(req, permission, new URL(req.url).searchParams.get("agencyId"));
  if (!access?.session) return NextResponse.json({ error: "Interactive admin session required" }, { status: 403 });
  const email = cleanText(body.email, 254).toLowerCase();
  const role = ROLES.includes(body.role as AgencyRole) ? body.role as AgencyRole : "viewer";
  const store = await getAgencyStore();
  const clientId = kind === "client_portal" ? cleanText(body.clientId, 100) : null;
  if (!isValidEmail(email) || (clientId && !(await store.clients(access.workspace.id)).some((item) => item.id === clientId))) return NextResponse.json({ error: "Valid recipient and client are required" }, { status: 422 });
  if (kind === "seat") {
    const seatLimit = Math.max(1, Math.min(1_000, Number(process.env.OUTSIDE_AGENCY_SEAT_LIMIT) || 100));
    const [members, pending] = await Promise.all([store.memberships(access.workspace.id), store.invites(access.workspace.id)]);
    const used = members.filter((item) => item.active).length + pending.filter((item) => item.kind === "seat" && !item.acceptedAt && !item.revokedAt && Date.parse(item.expiresAt) > Date.now()).length;
    if (used >= seatLimit) return NextResponse.json({ error: `Agency seat limit of ${seatLimit} reached`, code: "seat_limit" }, { status: 402 });
  }
  const recipientHash = createHash("sha256").update(email).digest("hex");
  if (!(await requireBudgets([{ key: `agency:invite:${access.workspace.id}`, limit: 50, windowMs: 86_400_000 }, { key: `agency:invite:recipient:${recipientHash}`, limit: 3, windowMs: 604_800_000 }])).ok) return NextResponse.json({ error: "Invitation quota exceeded" }, { status: 429 });
  const token = randomBytes(32).toString("base64url");
  const invite = await store.createInvite({ agencyId: access.workspace.id, email, role: kind === "client_portal" ? "viewer" : role, kind, clientId, tokenHash: createHash("sha256").update(token).digest("hex"), createdBy: access.actorId, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
  const baseUrl = access.workspace.branding.whiteLabel && access.workspace.branding.customDomain ? `https://${access.workspace.branding.customDomain}` : APP_URL; const url = `${baseUrl}/agency/invite/${token}`;
  await sendDurably(agencyInviteEmail(email, access.workspace.name, kind === "client_portal" ? "client portal viewer" : role, url, access.workspace.branding), `agency-invite:${invite.id}`);
  return NextResponse.json({ invite, acceptUrl: url }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const access = await agencyAccess(req, "seats:manage", new URL(req.url).searchParams.get("agencyId"));
  if (!access?.session) return NextResponse.json({ error: "Interactive admin session required" }, { status: 403 });
  const body = await readLimitedJson(req, 10_000) as Record<string, unknown>; const userId = cleanText(body.userId, 100); const store = await getAgencyStore();
  const members = await store.memberships(access.workspace.id); const current = members.find((item) => item.userId === userId);
  if (!current) return NextResponse.json({ error: "Seat not found" }, { status: 404 });
  if (current.role === "owner" && access.role !== "owner") return NextResponse.json({ error: "Only an owner can modify an owner seat" }, { status: 403 });
  const active = typeof body.active === "boolean" ? body.active : undefined; const nextRole = ROLES.includes(body.role as AgencyRole) || body.role === "owner" ? body.role as AgencyRole : undefined;
  if (userId === access.actorId && (active === false || (current.role === "owner" && nextRole && nextRole !== "owner"))) return NextResponse.json({ error: "Transfer ownership before changing your own owner seat" }, { status: 409 });
  if (current.role === "owner" && (active === false || (nextRole && nextRole !== "owner")) && members.filter((item) => item.active && item.role === "owner").length <= 1) return NextResponse.json({ error: "An agency must retain at least one active owner" }, { status: 409 });
  const member = await store.updateMembership(access.workspace.id, userId, { active, role: nextRole, seatLabel: body.seatLabel === undefined ? undefined : cleanText(body.seatLabel, 80) || null });
  await store.appendActivity({ agencyId: access.workspace.id, clientOrgId: null, actorId: access.actorId, type: "seat.updated", message: `Agency seat updated for ${userId}`, detail: { userId, role: member?.role, active: member?.active } });
  return NextResponse.json({ member });
}
