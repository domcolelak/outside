import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, hasOrgRole } from "@/lib/auth";
import { enterpriseAccess } from "@/lib/enterprise/access";
import { hashIp } from "@/lib/enterprise/audit";
import { runtimeDataRegion } from "@/lib/enterprise/residency";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { ENTERPRISE_FEATURES, type DataRegion, type EnterpriseDirectoryUser } from "@/lib/enterprise/types";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const seatCount = (value: unknown): number | null => { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : null; };
const retentionDays = (value: unknown, minimum: number): number | null => { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= minimum && parsed <= 3650 ? parsed : null; };

function provisioningAuthorized(req: NextRequest): boolean {
  const expected = process.env.ENTERPRISE_PROVISIONING_TOKEN?.trim();
  if (!expected) return process.env.NODE_ENV !== "production" || process.env.ENTERPRISE_SELF_SERVICE_TRIAL === "true";
  if (process.env.NODE_ENV === "production" && Buffer.byteLength(expected) < 32) return false;
  const supplied = req.headers.get("x-outside-provisioning-token") ?? "";
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const access = await enterpriseAccess(req, "enterprise:read", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Enterprise access required" }, 403);
  return json(await (await getEnterpriseStore()).overview(access.workspace.id));
}

export async function POST(req: NextRequest) {
  const session = await getSessionContext();
  if (!session?.user.emailVerifiedAt) return json({ error: "Verified authentication required" }, 401);
  let body: Record<string, unknown>;
  try { body = object(await readLimitedJson(req, 20_000)); } catch (error) { return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 400); }
  const orgId = typeof body.orgId === "string" ? body.orgId : "";
  if (!orgId || !hasOrgRole(session, orgId, "owner")) return json({ error: "Organization owner access required" }, 403);
  if (!provisioningAuthorized(req)) return json({ error: "Enterprise provisioning approval required" }, 403);
  if (!(await requireBudgets([{ key: `enterprise:provision:${session.user.id}`, limit: 3, windowMs: 86_400_000 }, { key: `enterprise:provision:${clientIdentity(req)}`, limit: 10, windowMs: 86_400_000 }])).ok) return json({ error: "Provisioning limit exceeded" }, 429);
  const requestedRegion = ["eu", "us", "uk", "ca", "au", "apac"].includes(String(body.dataRegion)) ? body.dataRegion as DataRegion : "eu";
  const deployedRegion = runtimeDataRegion();
  if (deployedRegion && requestedRegion !== deployedRegion) return json({ error: `Provision this workspace in the ${requestedRegion} regional deployment.` }, 409);
  const licensedSeats = seatCount(body.licensedSeats ?? 25);
  if (!licensedSeats) return json({ error: "licensedSeats must be an integer between 1 and 100000" }, 422);
  try {
    const workspace = await (await getEnterpriseStore()).provision({ orgId, ownerUserId: session.user.id, licensedSeats, dataRegion: deployedRegion ?? requestedRegion, expiresAt: typeof body.expiresAt === "string" ? new Date(body.expiresAt).toISOString() : null });
    return json({ workspace }, 201);
  } catch (error) {
    return json({ error: (error as Error).message }, 422);
  }
}

export async function PATCH(req: NextRequest) {
  const access = await enterpriseAccess(req, "retention:manage", new URL(req.url).searchParams.get("orgId"));
  if (!access) return json({ error: "Enterprise data-control permission required" }, 403);
  let body: Record<string, unknown>;
  try { body = object(await readLimitedJson(req, 20_000)); } catch (error) { return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 400); }
  const store = await getEnterpriseStore();
  const patch: Record<string, unknown> = {};
  if (body.retention && typeof body.retention === "object") {
    const raw = object(body.retention);
    const retention = { ...access.workspace.retention };
    for (const key of ["auditDays", "exportDays", "integrationDays", "ticketDays"] as const) {
      if (raw[key] === undefined) continue;
      const parsed = retentionDays(raw[key], key === "auditDays" ? 365 : 30);
      if (!parsed) return json({ error: `${key} must be an integer within the supported retention range` }, 422);
      retention[key] = parsed;
    }
    patch.retention = retention;
  }
  if (body.dataRegion !== undefined && body.dataRegion !== access.workspace.dataRegion) return json({ error: "Data residency changes require an export/import migration into the destination regional deployment; metadata relabeling is prohibited." }, 409);
  if (["licenseStatus", "licensedSeats", "features", "expiresAt"].some((key) => body[key] !== undefined)) {
    if (!provisioningAuthorized(req)) return json({ error: "License authority required" }, 403);
    if (body.licenseStatus !== undefined) {
      if (!["trial", "active", "suspended", "expired"].includes(String(body.licenseStatus))) return json({ error: "Invalid license status" }, 422);
      patch.licenseStatus = body.licenseStatus;
    }
    if (body.licensedSeats !== undefined) {
      const licensedSeats = seatCount(body.licensedSeats);
      if (!licensedSeats) return json({ error: "licensedSeats must be an integer between 1 and 100000" }, 422);
      const activeUsers = (await store.list<EnterpriseDirectoryUser>(access.workspace.id, "directoryUsers")).filter((item) => item.active).length;
      if (licensedSeats < activeUsers) return json({ error: `Deactivate users before reducing the license below ${activeUsers} active seats.` }, 409);
      patch.licensedSeats = licensedSeats;
    }
    if (Array.isArray(body.features)) patch.features = [...new Set(body.features.filter((item) => ENTERPRISE_FEATURES.includes(item as never)))];
    if (body.expiresAt !== undefined) patch.expiresAt = body.expiresAt ? new Date(String(body.expiresAt)).toISOString() : null;
  }
  const workspace = await store.updateWorkspaceAudited(access.workspace.id, patch, { actorType: access.actorType, actorId: access.actorId, action: "enterprise.workspace.updated", resourceType: "workspace", requestId: req.headers.get("x-request-id"), ipHash: hashIp(clientIdentity(req)), detail: { fields: Object.keys(patch) } });
  return json({ workspace });
}
