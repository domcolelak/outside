import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { platformProvisioningAuthorized } from "@/lib/enterprise/provisioning";
import { runtimeDataRegion } from "@/lib/enterprise/residency";
import { getEnterpriseStore } from "@/lib/enterprise/store";
import { ENTERPRISE_FEATURES, type DataRegion, type EnterpriseDirectoryUser } from "@/lib/enterprise/types";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
const regions = new Set<DataRegion>(["eu", "us", "uk", "ca", "au", "apac"]);
const seats = (value: unknown): number | null => { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000 ? parsed : null; };

export async function GET(req: NextRequest) {
  if (!platformProvisioningAuthorized(req.headers.get("authorization"))) return json({ error: "Platform provisioning token required" }, 401);
  const orgId = new URL(req.url).searchParams.get("orgId") ?? "";
  const workspace = await (await getEnterpriseStore()).workspaceByOrg(orgId);
  return workspace ? json({ workspace }) : json({ error: "Workspace not found" }, 404);
}

export async function POST(req: NextRequest) {
  if (!platformProvisioningAuthorized(req.headers.get("authorization"))) return json({ error: "Platform provisioning token required" }, 401);
  if (!(await requireBudgets([{ key: `enterprise:platform-provision:${clientIdentity(req)}`, limit: 60, windowMs: 60_000 }])).ok) return json({ error: "Provisioning rate exceeded" }, 429);
  try {
    const body = await readLimitedJson(req, 20_000) as Record<string, unknown>;
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    const ownerUserId = typeof body.ownerUserId === "string" ? body.ownerUserId : "";
    if (!orgId || !ownerUserId || (await (await getAuthStore()).getMembership(ownerUserId, orgId))?.role !== "owner") return json({ error: "A valid organization owner is required" }, 422);
    const requestedRegion = regions.has(body.dataRegion as DataRegion) ? body.dataRegion as DataRegion : "eu";
    const deployedRegion = runtimeDataRegion();
    if (deployedRegion && requestedRegion !== deployedRegion) return json({ error: `Provision this workspace in the ${requestedRegion} regional deployment.` }, 409);
    const licensedSeats = seats(body.licensedSeats ?? 25);
    if (!licensedSeats) return json({ error: "licensedSeats must be an integer between 1 and 100000" }, 422);
    const workspace = await (await getEnterpriseStore()).provision({ orgId, ownerUserId, licensedSeats, dataRegion: deployedRegion ?? requestedRegion, expiresAt: typeof body.expiresAt === "string" ? new Date(body.expiresAt).toISOString() : null });
    return json({ workspace }, 201);
  } catch (error) {
    return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 422);
  }
}

export async function PATCH(req: NextRequest) {
  if (!platformProvisioningAuthorized(req.headers.get("authorization"))) return json({ error: "Platform provisioning token required" }, 401);
  try {
    const body = await readLimitedJson(req, 20_000) as Record<string, unknown>;
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    const store = await getEnterpriseStore();
    const current = await store.workspaceByOrg(orgId);
    if (!current) return json({ error: "Workspace not found" }, 404);
    const patch: Record<string, unknown> = {};
    if (body.licenseStatus !== undefined) {
      if (!["trial", "active", "suspended", "expired"].includes(String(body.licenseStatus))) return json({ error: "Invalid license status" }, 422);
      patch.licenseStatus = body.licenseStatus;
    }
    if (body.licensedSeats !== undefined) {
      const licensedSeats = seats(body.licensedSeats);
      if (!licensedSeats) return json({ error: "licensedSeats must be an integer between 1 and 100000" }, 422);
      const activeUsers = (await store.list<EnterpriseDirectoryUser>(current.id, "directoryUsers")).filter((item) => item.active).length;
      if (licensedSeats < activeUsers) return json({ error: `Deactivate users before reducing the license below ${activeUsers} active seats.` }, 409);
      patch.licensedSeats = licensedSeats;
    }
    if (Array.isArray(body.features)) patch.features = [...new Set(body.features.filter((item) => ENTERPRISE_FEATURES.includes(item as never)))];
    if (body.expiresAt !== undefined) patch.expiresAt = body.expiresAt ? new Date(String(body.expiresAt)).toISOString() : null;
    const workspace = await store.updateWorkspaceAudited(current.id, patch, { actorType: "system", actorId: "platform-provisioner", action: "enterprise.license.updated", resourceType: "workspace", requestId: req.headers.get("x-request-id"), ipHash: null, detail: { fields: Object.keys(patch) } });
    return json({ workspace });
  } catch (error) {
    return json({ error: (error as Error).message }, error instanceof RequestBodyError ? error.status : 422);
  }
}
