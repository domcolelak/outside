import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { InMemoryAgencyStore } from "./memory-store";
import { clientHealth, portfolioScore } from "./portfolio";
import { hasAgencyPermission, type AgencyClient } from "./types";
import type { GuardianOverview } from "@/lib/guardian/types";

const client: AgencyClient = { id: "client_1", agencyId: "agency_1", orgId: "org_client", organizationName: "Acme", organizationSlug: "acme", groupId: null, status: "active", portalMode: "readonly", externalRef: null, serviceTier: "standard", slaResponseMinutes: 60, notificationRouting: {}, billingMode: "agency", monthlyPriceCents: 10000, currency: "EUR", addedAt: "2026-07-01T00:00:00.000Z", offboardedAt: null };
function guardian(score: number, assets = 10): GuardianOverview { return { orgId: client.orgId, generatedAt: "2026-07-15T00:00:00.000Z", targets: [{ target: "acme.test", latest: { orgId: client.orgId, target: "acme.test", scanId: "scan_1", observedAt: "2026-07-15T00:00:00.000Z", exposureScore: score, metrics: { assets, webSurfaces: 1, shadowAssets: 1, authSurfaces: 0, apiSurfaces: 0, nonProduction: 0, technologies: 1, infrastructureProviders: 1, cloudAssets: 0, cdnFrontedAssets: 0, expiringCertificates: 0, checklistPassed: 1, checklistActionable: 0, complexityIndex: 1 }, inventory: [], checklist: [] }, history: [], drift: { from: null, to: "2026-07-15T00:00:00.000Z", direction: "stable", headline: "Stable", narrative: "Stable", dimensions: [] }, events: [], recommendations: [] }], recentEvents: [], recommendations: [], deliveries: [], activity: [], channels: [], durable: false }; }

describe("agency RBAC", () => {
  it("keeps billing and analyst privileges separate", () => { expect(hasAgencyPermission("billing", "billing:manage")).toBe(true); expect(hasAgencyPermission("billing", "clients:manage")).toBe(false); expect(hasAgencyPermission("analyst", "notes:write")).toBe(true); expect(hasAgencyPermission("analyst", "seats:manage")).toBe(false); });
});

describe("agency portfolio", () => {
  it("derives health only from deterministic Guardian state", () => { const healthy = clientHealth(client, guardian(20), new Date("2026-07-15T01:00:00.000Z")); const risky = clientHealth(client, guardian(80), new Date("2026-07-15T01:00:00.000Z")); expect(healthy.health).toBe("healthy"); expect(risky.health).toBe("at_risk"); expect(portfolioScore([healthy, risky])).toBe(50); });
  it("marks stale or absent observations unknown", () => { expect(clientHealth(client, null).health).toBe("unknown"); });
});

describe("agency store workflows", () => {
  it("isolates clients, makes jobs idempotent, and scopes portal invitations", async () => {
    const store = new InMemoryAgencyStore(); const workspace = await store.createWorkspace({ ownerOrgId: "org_owner", ownerUserId: "user_owner", name: "Northstar Agency", slug: "northstar" });
    const linked = await store.addClient({ agencyId: workspace.id, orgId: "org_client", organizationName: "Acme", organizationSlug: "acme" });
    expect(linked).not.toBeNull(); expect(await store.addClient({ agencyId: workspace.id, orgId: "org_client", organizationName: "Acme", organizationSlug: "acme" })).toBeNull();
    const one = await store.createJob({ agencyId: workspace.id, type: "scan", idempotencyKey: "stable-key", clientOrgIds: ["org_client"], payload: {}, createdBy: "user_owner" });
    const two = await store.createJob({ agencyId: workspace.id, type: "scan", idempotencyKey: "stable-key", clientOrgIds: ["org_client"], payload: {}, createdBy: "user_owner" }); expect(two.id).toBe(one.id);
    const raw = "one-time-secret", hash = createHash("sha256").update(raw).digest("hex");
    await store.createInvite({ agencyId: workspace.id, email: "client@acme.test", role: "viewer", kind: "client_portal", clientId: linked!.id, tokenHash: hash, createdBy: "user_owner", expiresAt: "2026-08-01T00:00:00.000Z" });
    expect(await store.acceptInvite(hash, "user_client", "wrong@acme.test", new Date("2026-07-15"))).toBeNull();
    expect(await store.acceptInvite(hash, "user_client", "client@acme.test", new Date("2026-07-15"))).not.toBeNull();
    expect(await store.hasPortalInvite(workspace.id, linked!.id, "user_client")).toBe(true); expect(await store.hasPortalInvite(workspace.id, linked!.id, "other_user")).toBe(false);
    await store.upsertMembership({ agencyId: workspace.id, userId: "analyst", role: "analyst" }); expect((await store.updateMembership(workspace.id, "analyst", { active: false }))?.active).toBe(false);
    const report = await store.createReport({ agencyId: workspace.id, clientOrgId: "org_client", periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-07-15T00:00:00.000Z", kind: "client", title: "Acme report", content: { assets: 10 }, branding: workspace.branding, createdBy: "user_owner" }); expect((await store.reports(workspace.id))[0]?.id).toBe(report.id);
  });
});
