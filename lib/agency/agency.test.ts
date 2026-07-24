import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { InMemoryAgencyStore } from "./memory-store";
import { clientHealth, portfolioScore } from "./portfolio";
import { hasAgencyPermission, type AgencyClient } from "./types";
import type { GuardianOverview } from "@/lib/guardian/types";
import { synchronizeClientSla } from "./sla";
import { normalizedRouting } from "./notifications";
import { notificationRouting } from "./validation";

const client: AgencyClient = { id: "client_1", agencyId: "agency_1", orgId: "org_client", organizationName: "Acme", organizationSlug: "acme", groupId: null, status: "active", portalMode: "readonly", externalRef: null, serviceTier: "standard", slaResponseMinutes: 60, notificationRouting: {}, billingMode: "agency", monthlyPriceCents: 10000, currency: "EUR", addedAt: "2026-07-01T00:00:00.000Z", offboardedAt: null };
function guardian(score: number, assets = 10): GuardianOverview { return { orgId: client.orgId, generatedAt: "2026-07-15T00:00:00.000Z", targets: [{ target: "acme.test", latest: { orgId: client.orgId, target: "acme.test", scanId: "scan_1", observedAt: "2026-07-15T00:00:00.000Z", exposureScore: score, metrics: { assets, webSurfaces: 1, shadowAssets: 1, authSurfaces: 0, apiSurfaces: 0, nonProduction: 0, technologies: 1, infrastructureProviders: 1, cloudAssets: 0, cdnFrontedAssets: 0, expiringCertificates: 0, checklistPassed: 1, checklistActionable: 0, complexityIndex: 1 }, inventory: [], checklist: [] }, history: [], drift: { from: null, to: "2026-07-15T00:00:00.000Z", direction: "stable", headline: "Stable", narrative: "Stable", dimensions: [] }, events: [], recommendations: [] }], recentEvents: [], recommendations: [], deliveries: [], activity: [], channels: [], durable: false }; }

describe("agency RBAC", () => {
  it("keeps billing and analyst privileges separate", () => { expect(hasAgencyPermission("billing", "billing:manage")).toBe(true); expect(hasAgencyPermission("billing", "clients:manage")).toBe(false); expect(hasAgencyPermission("analyst", "notes:write")).toBe(true); expect(hasAgencyPermission("analyst", "seats:manage")).toBe(false); });
});

describe("agency portfolio", () => {
  it("treats higher protection-posture scores as healthier", () => {
    const atRisk = clientHealth(client, guardian(20), new Date("2026-07-15T01:00:00.000Z"));
    const watch = clientHealth(client, guardian(50), new Date("2026-07-15T01:00:00.000Z"));
    const healthy = clientHealth(client, guardian(80), new Date("2026-07-15T01:00:00.000Z"));

    expect(atRisk.health).toBe("at_risk");
    expect(watch.health).toBe("watch");
    expect(healthy.health).toBe("healthy");
    expect(portfolioScore([atRisk, healthy])).toBe(50);
  });
  it("aligns portfolio health boundaries with the shared protection-posture bands", () => {
    const healthAt = (score: number) => clientHealth(client, guardian(score), new Date("2026-07-15T01:00:00.000Z")).health;

    expect(healthAt(39)).toBe("at_risk");
    expect(healthAt(40)).toBe("watch");
    expect(healthAt(59)).toBe("watch");
    expect(healthAt(60)).toBe("healthy");
  });
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
    const report = await store.createReport({ agencyId: workspace.id, clientOrgId: "org_client", periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-07-15T00:00:00.000Z", kind: "client", title: "Acme report", content: { assets: 10 }, branding: workspace.branding, createdBy: "user_owner" }); expect((await store.reports(workspace.id))[0]?.id).toBe(report.id); await store.createReportShare({ agencyId: workspace.id, reportId: report.id, email: "client@acme.test", tokenHash: "share-hash", expiresAt: "2026-07-20T00:00:00.000Z" }); expect(await store.authorizeReportShare(workspace.id, report.id, "share-hash", new Date("2026-07-16"))).toBe(true); expect(await store.authorizeReportShare("other", report.id, "share-hash", new Date("2026-07-16"))).toBe(false);
  });
  it("persists SLA acknowledgement and resolution without crossing agency boundaries", async () => {
    const store = new InMemoryAgencyStore(); const workspace = await store.createWorkspace({ ownerOrgId: "org_owner", ownerUserId: "owner", name: "Agency", slug: "agency" }); const linked = (await store.addClient({ agencyId: workspace.id, orgId: "org_client", organizationName: "Acme", organizationSlug: "acme" }))!;
    const recommendations = [{ id: "rec_1", orgId: linked.orgId, target: "acme.test", code: "public-login", status: "open" as const, priority: "high" as const, confidence: 1, title: "Review public login", why: "A public authentication surface was observed.", reasoning: "Deterministic observation", affectedAssets: ["login.acme.test"], evidence: [{ source: "scan", observation: "HTTPS login form", observedAt: "2026-07-15T00:00:00.000Z", scanId: "scan_1" }], suggestedReview: "Confirm ownership", businessImpact: "Unexpected access surface", guides: [], firstObservedAt: "2026-07-15T00:00:00.000Z", lastObservedAt: "2026-07-15T02:00:00.000Z" }];
    const events = await synchronizeClientSla(store, { ...linked, slaResponseMinutes: 60 }, recommendations, new Date("2026-07-15T02:00:00.000Z")); expect(events[0]?.breached).toBe(true); const acknowledged = await store.updateSlaEvent(workspace.id, events[0]!.id, { acknowledgeBy: "analyst" }); expect(acknowledged?.status).toBe("acknowledged"); expect(await store.updateSlaEvent("other", events[0]!.id, { resolve: true })).toBeNull(); expect((await store.updateSlaEvent(workspace.id, events[0]!.id, { resolve: true }))?.status).toBe("resolved"); expect((await synchronizeClientSla(store, { ...linked, slaResponseMinutes: 60 }, recommendations))[0]?.status).toBe("resolved");
  });
});

describe("agency notification routing", () => {
  it("normalizes recipients, severities and tenant-owned channel IDs", () => { const routing = notificationRouting({ emails: ["SOC@EXAMPLE.COM", "bad", "soc@example.com"], channelIds: ["allowed", "foreign"], severities: ["critical", "invalid"] }, new Set(["allowed"])); expect(routing).toEqual({ emails: ["soc@example.com"], channelIds: ["allowed"], severities: ["critical"] }); expect(normalizedRouting({ ...client, notificationRouting: routing })).toEqual(routing); });
});
