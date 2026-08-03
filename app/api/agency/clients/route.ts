import { NextRequest, NextResponse } from "next/server";
import { agencyAccess } from "@/lib/agency/access";
import { getAgencyStore } from "@/lib/agency/store";
import { cleanText, notificationRouting } from "@/lib/agency/validation";
import { hasOrgRole } from "@/lib/auth";
import { getGuardianStore } from "@/lib/guardian/store";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import {
  canViewAgencyBilling,
  containsAgencyBillingFields,
  visibleAgencyClient,
  visibleAgencyClients,
} from "@/lib/agency/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  const agencyId = new URL(req.url).searchParams.get("agencyId");
  const access = await agencyAccess(req, "clients:read", agencyId);
  if (!access) return json({ error: "Forbidden" }, 403);
  const clients = await (await getAgencyStore()).clients(access.workspace.id);
  return json({ clients: visibleAgencyClients(clients, access.role) });
}

export async function POST(req: NextRequest) {
  const agencyId = new URL(req.url).searchParams.get("agencyId");
  const access = await agencyAccess(req, "clients:manage", agencyId);
  if (!access?.session)
    return json({ error: "Interactive agency admin session required" }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await readLimitedJson(req, 20_000)) as Record<string, unknown>;
  } catch (error) {
    return json(
      { error: (error as Error).message },
      error instanceof RequestBodyError ? error.status : 400,
    );
  }
  if (containsAgencyBillingFields(body) && !canViewAgencyBilling(access.role)) {
    return json(
      { error: "Billing fields require billing management access" },
      403,
    );
  }

  const orgId = cleanText(body.orgId, 100);
  const org = access.session.memberships.find((item) => item.org.id === orgId);
  if (!org || !hasOrgRole(access.session, orgId, "owner")) {
    return json(
      { error: "Client organization owner approval is required" },
      403,
    );
  }

  const store = await getAgencyStore();
  const groupId = cleanText(body.groupId, 100) || null;
  if (groupId && !(await store.group(access.workspace.id, groupId))) {
    return json({ error: "Group not found" }, 422);
  }
  const row = await store.addClient({
    agencyId: access.workspace.id,
    orgId,
    organizationName: org.org.name,
    organizationSlug: org.org.slug,
    groupId,
    externalRef: cleanText(body.externalRef, 100) || null,
  });
  if (!row) {
    if (groupId && !(await store.group(access.workspace.id, groupId)))
      return json({ error: "Group not found" }, 422);
    return json({ error: "Client is already linked" }, 409);
  }
  await store.appendActivity({
    agencyId: access.workspace.id,
    clientOrgId: orgId,
    actorId: access.actorId,
    type: "client.added",
    message: `${org.org.name} joined the portfolio`,
    detail: { clientId: row.id },
  });
  return json({ client: visibleAgencyClient(row, access.role) }, 201);
}

export async function PATCH(req: NextRequest) {
  const agencyId = new URL(req.url).searchParams.get("agencyId");
  const access = await agencyAccess(req, "clients:manage", agencyId);
  if (!access) return json({ error: "Forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await readLimitedJson(req, 30_000)) as Record<string, unknown>;
  } catch (error) {
    return json(
      { error: (error as Error).message },
      error instanceof RequestBodyError ? error.status : 400,
    );
  }

  const touchesBilling = containsAgencyBillingFields(body);
  if (touchesBilling && !canViewAgencyBilling(access.role)) {
    return json(
      { error: "Billing fields require billing management access" },
      403,
    );
  }

  const billingMode =
    body.billingMode === undefined
      ? undefined
      : cleanText(body.billingMode, 20);
  const currency =
    body.currency === undefined
      ? undefined
      : cleanText(body.currency, 3).toUpperCase();
  const monthlyPrice =
    body.monthlyPriceCents === undefined
      ? undefined
      : Number(body.monthlyPriceCents);
  if (
    (billingMode !== undefined &&
      !["agency", "direct", "reseller"].includes(billingMode)) ||
    (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) ||
    (monthlyPrice !== undefined &&
      (!Number.isFinite(monthlyPrice) ||
        monthlyPrice < 0 ||
        monthlyPrice > 100_000_000))
  ) {
    return json({ error: "Invalid billing configuration" }, 422);
  }

  const store = await getAgencyStore();
  const clientId = cleanText(body.clientId, 100);
  const current = (await store.clients(access.workspace.id)).find(
    (item) => item.id === clientId,
  );
  if (!current) return json({ error: "Client not found" }, 404);

  const groupId =
    body.groupId === undefined
      ? undefined
      : cleanText(body.groupId, 100) || null;
  if (groupId && !(await store.group(access.workspace.id, groupId)))
    return json({ error: "Group not found" }, 422);
  const status = ["onboarding", "active", "paused", "offboarded"].includes(
    String(body.status),
  )
    ? (body.status as "onboarding" | "active" | "paused" | "offboarded")
    : undefined;
  const portalMode = ["disabled", "readonly", "collaborative"].includes(
    String(body.portalMode),
  )
    ? (body.portalMode as "disabled" | "readonly" | "collaborative")
    : undefined;
  const channels =
    body.notificationRouting === undefined
      ? []
      : await (await getGuardianStore()).channels(current.orgId);
  const routing =
    body.notificationRouting === undefined
      ? undefined
      : notificationRouting(
          body.notificationRouting,
          new Set(channels.map((item) => item.id)),
        );

  const patch: Parameters<typeof store.updateClient>[2] = {
    status,
    portalMode,
    groupId,
    serviceTier:
      body.serviceTier === undefined
        ? undefined
        : cleanText(body.serviceTier, 60),
    slaResponseMinutes:
      body.slaResponseMinutes === undefined
        ? undefined
        : Math.max(
            15,
            Math.min(43_200, Number(body.slaResponseMinutes) || 480),
          ),
    notificationRouting: routing,
  };
  if (billingMode !== undefined) patch.billingMode = billingMode;
  if (monthlyPrice !== undefined)
    patch.monthlyPriceCents = Math.round(monthlyPrice);
  if (currency !== undefined) patch.currency = currency;
  const client = await store.updateClient(access.workspace.id, clientId, patch);
  if (!client) {
    if (groupId && !(await store.group(access.workspace.id, groupId)))
      return json({ error: "Group not found" }, 422);
    return json({ error: "Client update could not be applied" }, 409);
  }
  if (touchesBilling) {
    await store.appendActivity({
      agencyId: access.workspace.id,
      clientOrgId: client.orgId,
      actorId: access.actorId,
      type: "billing.updated",
      message: `Billing configuration updated for ${client.organizationName}`,
      detail: {
        clientId: client.id,
        mode: client.billingMode,
        currency: client.currency,
      },
    });
  }
  return json({ client: visibleAgencyClient(client, access.role) });
}
