import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AgencyClient, AgencyRole } from "./types";
import {
  canViewAgencyBilling,
  visibleAgencyActivity,
  visibleAgencyAnalytics,
  visibleAgencyClient,
} from "./visibility";

const roles: AgencyRole[] = [
  "owner",
  "admin",
  "manager",
  "analyst",
  "billing",
  "viewer",
];
const billingRoles = new Set<AgencyRole>(["owner", "admin", "billing"]);

const state = vi.hoisted(() => ({
  role: "viewer",
  updates: [] as Array<Record<string, unknown>>,
  activities: [] as Array<Record<string, unknown>>,
  client: {
    id: "client_1",
    agencyId: "agency_1",
    orgId: "org_1",
    organizationName: "Acme",
    organizationSlug: "acme",
    groupId: null,
    status: "active",
    portalMode: "readonly",
    externalRef: null,
    serviceTier: "standard",
    slaResponseMinutes: 480,
    notificationRouting: {},
    billingMode: "agency",
    monthlyPriceCents: 25_000,
    currency: "EUR",
    addedAt: "2026-07-01T00:00:00.000Z",
    offboardedAt: null,
  },
}));

vi.mock("@/lib/agency/access", () => ({
  agencyAccess: async (_req: unknown, permission: string) => {
    const allowed =
      permission === "clients:read" ||
      (permission === "clients:manage" &&
        ["owner", "admin", "manager"].includes(state.role)) ||
      (permission === "billing:manage" &&
        ["owner", "admin", "billing"].includes(state.role));
    if (!allowed) return null;
    return {
      workspace: { id: "agency_1" },
      role: state.role,
      actorId: `user_${state.role}`,
      via: "session",
      scopes: ["*"],
      session: {
        user: { id: `user_${state.role}` },
        memberships: [
          { org: { id: "org_1", name: "Acme", slug: "acme" }, role: "owner" },
        ],
      },
    };
  },
}));

vi.mock("@/lib/agency/store", () => ({
  getAgencyStore: async () => ({
    clients: async () => [state.client],
    group: async () => null,
    addClient: async () => state.client,
    updateClient: async (
      _agencyId: string,
      _clientId: string,
      patch: Record<string, unknown>,
    ) => {
      state.updates.push(patch);
      Object.assign(
        state.client,
        Object.fromEntries(
          Object.entries(patch).filter(([, value]) => value !== undefined),
        ),
      );
      return state.client;
    },
    appendActivity: async (activity: Record<string, unknown>) => {
      state.activities.push(activity);
      return activity;
    },
  }),
}));

vi.mock("@/lib/auth", () => ({ hasOrgRole: () => true }));
vi.mock("@/lib/guardian/store", () => ({
  getGuardianStore: async () => ({ channels: async () => [] }),
}));

import {
  GET as getClients,
  PATCH as patchClient,
  POST as createClient,
} from "@/app/api/agency/clients/route";
import { PATCH as patchBilling } from "@/app/api/agency/billing/route";

describe("agency commercial billing RBAC", () => {
  beforeEach(() => {
    state.role = "viewer";
    state.updates.length = 0;
    state.activities.length = 0;
    Object.assign(state.client, {
      status: "active",
      billingMode: "agency",
      monthlyPriceCents: 25_000,
      currency: "EUR",
    });
  });

  it.each(roles)(
    "projects client billing fields according to the %s role",
    (role) => {
    const visible = visibleAgencyClient(state.client as AgencyClient, role);
      expect(canViewAgencyBilling(role)).toBe(billingRoles.has(role));
      expect(Object.hasOwn(visible, "billingMode")).toBe(
        billingRoles.has(role),
      );
      expect(Object.hasOwn(visible, "monthlyPriceCents")).toBe(
        billingRoles.has(role),
      );
      expect(Object.hasOwn(visible, "currency")).toBe(billingRoles.has(role));
    },
  );

  it.each(roles)(
    "applies the same %s role projection to the clients DTO",
    async (role) => {
      state.role = role;
      const response = await getClients(
        new NextRequest(
          "https://outside.test/api/agency/clients?agencyId=agency_1",
        ),
      );
      const body = (await response.json()) as {
        clients: Array<Record<string, unknown>>;
      };
      expect(response.status).toBe(200);
      expect(Object.hasOwn(body.clients[0]!, "monthlyPriceCents")).toBe(
        billingRoles.has(role),
      );
    },
  );

  it.each(roles)(
    "prevents unauthorized generic billing updates for the %s role",
    async (role) => {
      state.role = role;
      const response = await patchClient(
        new NextRequest(
          "https://outside.test/api/agency/clients?agencyId=agency_1",
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientId: "client_1",
              billingMode: "reseller",
              monthlyPriceCents: 99_000,
              currency: "USD",
            }),
          },
        ),
      );
      const mayUseGenericRoute = role === "owner" || role === "admin";
      expect(response.status).toBe(mayUseGenericRoute ? 200 : 403);
      expect(state.updates).toHaveLength(mayUseGenericRoute ? 1 : 0);
    },
  );

  it("lets a manager update operational fields without passing or receiving billing fields", async () => {
    state.role = "manager";
    const response = await patchClient(
      new NextRequest(
        "https://outside.test/api/agency/clients?agencyId=agency_1",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId: "client_1", status: "paused" }),
        },
      ),
    );
    const body = (await response.json()) as { client: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(state.updates[0]).not.toHaveProperty("billingMode");
    expect(state.updates[0]).not.toHaveProperty("monthlyPriceCents");
    expect(state.updates[0]).not.toHaveProperty("currency");
    expect(body.client).not.toHaveProperty("billingMode");
    expect(body.client).not.toHaveProperty("monthlyPriceCents");
    expect(body.client).not.toHaveProperty("currency");
  });

  it("rejects billing fields on generic client creation by a non-billing manager", async () => {
    state.role = "manager";
    const response = await createClient(
      new NextRequest(
        "https://outside.test/api/agency/clients?agencyId=agency_1",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orgId: "org_1", monthlyPriceCents: 1 }),
        },
      ),
    );
    expect(response.status).toBe(403);
  });

  it.each(roles)(
    "keeps the dedicated billing update route limited for the %s role",
    async (role) => {
      state.role = role;
      const response = await patchBilling(
        new NextRequest(
          "https://outside.test/api/agency/billing?agencyId=agency_1",
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientId: "client_1",
              billingMode: "direct",
              monthlyPriceCents: 50_000,
              currency: "USD",
            }),
          },
        ),
      );
      expect(response.status).toBe(billingRoles.has(role) ? 200 : 403);
      expect(state.updates).toHaveLength(billingRoles.has(role) ? 1 : 0);
    },
  );

  it.each(roles)(
    "redacts commercial analytics and activity for the %s role",
    (role) => {
      const analytics = visibleAgencyAnalytics(
        {
          periodDays: 30,
          billing: { revenueByCurrency: { EUR: 25_000 } },
          reseller: {
            parent: null,
            children: [{ id: "child", revenueByCurrency: { EUR: 10_000 } }],
          },
        },
        role,
      );
      const activity = visibleAgencyActivity(
        [
          {
            id: "billing",
            agencyId: "agency_1",
            clientOrgId: "org_1",
            actorId: "admin",
            type: "billing.updated",
            message: "Billing updated",
            detail: { mode: "direct", currency: "USD" },
            createdAt: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "client",
            agencyId: "agency_1",
            clientOrgId: "org_1",
            actorId: "admin",
            type: "client.updated",
            message: "Client updated",
            detail: {},
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ],
        role,
      );

      if (billingRoles.has(role)) {
        expect(analytics).toHaveProperty("billing");
        expect(analytics.reseller.children[0]).toHaveProperty(
          "revenueByCurrency",
        );
        expect(activity.map((item) => item.id)).toEqual(["billing", "client"]);
      } else {
        expect(analytics).not.toHaveProperty("billing");
        expect(analytics.reseller.children[0]).not.toHaveProperty(
          "revenueByCurrency",
        );
        expect(activity.map((item) => item.id)).toEqual(["client"]);
      }
    },
  );
});
