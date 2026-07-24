import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { __resetAuthStore } from "@/lib/auth";
import { InMemoryAuthStore } from "@/lib/auth/memory-store";
import { auditHash, verifyAuditChain } from "./audit";
import { secretHash } from "./crypto";
import { validGraphqlRequest } from "./graphql";
import { InMemoryEnterpriseStore } from "./memory-store";
import { permissionsFor, flagEnabled } from "./permissions";
import { activeRiskException, applyScoringPolicies } from "./policy";
import { providerPayload, validateProviderConfig } from "./providers";
import { scimAccess, scimFilter } from "./scim";
import { __resetEnterpriseStore } from "./store";
import type { EnterpriseAuditEvent, EnterpriseFeatureFlag, EnterpriseIdentityProvider, EnterprisePolicy, EnterpriseRiskException, EnterpriseRole, EnterpriseRoleBinding } from "./types";

afterEach(() => {
  __resetAuthStore();
  __resetEnterpriseStore();
  delete process.env.OUTSIDE_DATA_REGION;
});

describe("enterprise control plane", () => {
  it("creates a verifiable append-only audit chain and detects tampering", async () => { const store = new InMemoryEnterpriseStore(), workspace = await store.provision({ orgId: "org-1", ownerUserId: "owner" }); await store.appendAudit({ workspaceId: workspace.id, actorType: "user", actorId: "owner", action: "policy.created", resourceType: "policy", resourceId: "p1", requestId: "r1", ipHash: null, detail: { version: 1 } }); const events = await store.auditEvents(workspace.id); expect(verifyAuditChain(events)).toMatchObject({ valid: true, checked: 2 }); const changed = structuredClone(events); changed[1]!.detail = { version: 2 }; expect(verifyAuditChain(changed).valid).toBe(false); expect(events[0]!.hash).toBe(auditHash({ sequence: events[0]!.sequence, actorType: events[0]!.actorType, actorId: events[0]!.actorId, action: events[0]!.action, resourceType: events[0]!.resourceType, resourceId: events[0]!.resourceId, requestId: events[0]!.requestId, ipHash: events[0]!.ipHash, detail: events[0]!.detail, previousHash: "GENESIS", createdAt: events[0]!.createdAt })); });
  it("evaluates scoped RBAC and stable percentage flags", () => { const roles = [{ id: "r", workspaceId: "w", name: "Analyst", description: null, permissions: ["audit:read"], system: false }] as EnterpriseRole[], bindings = [{ id: "b", workspaceId: "w", roleId: "r", principalType: "group", principalId: "g", scopeType: "department", scopeId: "d", conditions: {}, createdBy: "owner" }] as EnterpriseRoleBinding[]; expect(permissionsFor({ principalIds: ["u", "g"], roles, bindings, scopeType: "department", scopeId: "d" }).has("audit:read")).toBe(true); expect(permissionsFor({ principalIds: ["g"], roles, bindings, scopeType: "department", scopeId: "other" }).size).toBe(0); const flag = { key: "new-console", enabled: true, rollout: 50 } as EnterpriseFeatureFlag; expect(flagEnabled(flag, "user-1")).toBe(flagEnabled(flag, "user-1")); });
  it("applies bounded deterministic scoring and time-bound exceptions", () => { const policy = { id: "p", workspaceId: "w", kind: "scoring", name: "Risk", description: null, enabled: true, version: 1, document: { rules: [{ name: "Auth surface", severity: "high", delta: 15 }] }, createdBy: "u" } as EnterprisePolicy; expect(applyScoringPolicies({ baseScore: 50, severity: "high", assetTags: [], evidenceConfidence: 1 }, [policy])).toEqual({ score: 65, appliedRules: [{ policyId: "p", rule: "Auth surface", delta: 15 }] }); const exception = { subjectType: "finding", subjectId: "f", status: "approved", expiresAt: new Date(Date.now() + 60_000).toISOString() } as EnterpriseRiskException; expect(activeRiskException([exception], "finding", "f")?.subjectId).toBe("f"); });
  it("validates providers, SCIM filters and persisted GraphQL operations", () => { expect(validateProviderConfig("splunk", { url: "https://splunk.example/services/collector", hecToken: "secret" }).ok).toBe(true); expect(validateProviderConfig("webhook", { url: "http://127.0.0.1/hook", signingSecret: "x" }).ok).toBe(false); const payload = providerPayload("elastic", { id: "e", occurredAt: new Date(0).toISOString(), organizationId: "o", type: "finding.changed", severity: "high", title: "Observed change", description: "Deterministic", resource: { type: "finding", id: "f" }, evidence: { snapshotId: "s" } }); expect(payload).toHaveProperty("ecs.version", "8.11.0"); expect(scimFilter('userName eq "analyst@example.com"')).toEqual({ field: "userName", value: "analyst@example.com" }); expect(() => scimFilter('userName co "example"')).toThrow(); expect(validGraphqlRequest({ operationName: "EnterpriseOverview", variables: { orgId: "o" } }).operationName).toBe("EnterpriseOverview"); expect(() => validGraphqlRequest({ operationName: "Unknown" })).toThrow(); });
  it("keeps delivery enqueue idempotent and enforces renewable CAS leases", async () => { const store = new InMemoryEnterpriseStore(), workspace = await store.provision({ orgId: "o", ownerUserId: "u" }), first = await store.enqueueDelivery({ workspaceId: workspace.id, integrationId: "i", idempotencyKey: "same", eventId: "e", payload: {} }), second = await store.enqueueDelivery({ workspaceId: workspace.id, integrationId: "i", idempotencyKey: "same", eventId: "e", payload: {} }); expect(second.id).toBe(first.id); const claimedAt = new Date(), [claimed] = await store.claimDeliveries(claimedAt, 10, 60_000); expect(claimed?.attempts).toBe(1); expect(await store.renewDeliveryLease(workspace.id, first.id, "wrong", new Date(), 60_000)).toBe(false); expect(await store.renewDeliveryLease(workspace.id, first.id, claimed!.leaseId!, new Date(claimedAt.getTime() + 30_000), 60_000)).toBe(true); expect(await store.finishDelivery(workspace.id, first.id, "wrong", { delivered: true })).toBe(false); expect(await store.finishDelivery(workspace.id, first.id, claimed!.leaseId!, { delivered: true })).toBe(true); });
  it("enforces SCIM license, feature and residency gates", async () => {
    const store = new InMemoryEnterpriseStore(), token = "out_scim_gate-test";
    const workspace = await store.provision({ orgId: "gate-org", ownerUserId: "owner" });
    await store.create<EnterpriseIdentityProvider>(workspace.id, "identityProviders", { protocol: "oidc", name: "Gate", domains: ["example.test"], enabled: true, enforceSso: false, jitProvisioning: true, configEncrypted: "encrypted", scimTokenHash: secretHash(token), scimTokenPrefix: token.slice(0, 12), lastSyncAt: null });
    __resetEnterpriseStore(store);
    const request = new NextRequest("https://outside.test/api/enterprise/scim/v2/Users", { headers: { authorization: `Bearer ${token}` } });
    expect(await scimAccess(request)).not.toBeNull();
    await store.updateWorkspace(workspace.id, { licenseStatus: "suspended" });
    expect(await scimAccess(request)).toBeNull();
    await store.updateWorkspace(workspace.id, { licenseStatus: "active", features: workspace.features.filter((feature) => feature !== "scim") });
    expect(await scimAccess(request)).toBeNull();
    await store.updateWorkspace(workspace.id, { features: workspace.features });
    process.env.OUTSIDE_DATA_REGION = "us";
    expect(await scimAccess(request)).toBeNull();
  });
  it("serializes SCIM seat allocation with directory and membership provisioning", async () => {
    const auth = new InMemoryAuthStore();
    __resetAuthStore(auth);
    const store = new InMemoryEnterpriseStore();
    const workspace = await store.provision({ orgId: "seat-org", ownerUserId: "owner", licensedSeats: 1 });
    const provider = await store.create<EnterpriseIdentityProvider>(workspace.id, "identityProviders", { protocol: "oidc", name: "Seats", domains: ["example.test"], enabled: true, enforceSso: false, jitProvisioning: true, configEncrypted: "encrypted", scimTokenHash: null, scimTokenPrefix: null, lastSyncAt: null });
    const provision = (email: string) => store.provisionScimUserAtomic({ workspaceId: workspace.id, orgId: workspace.orgId, providerId: provider.id, feature: "scim", email, name: email, passwordHash: "hash", externalId: email, active: true }, { actorType: "scim", actorId: provider.id, action: "test.provision", resourceType: "directory_user", requestId: null, ipHash: null, detail: {} });
    const results = await Promise.allSettled([provision("one@example.test"), provision("two@example.test")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await store.list(workspace.id, "directoryUsers")).filter((item) => item.active)).toHaveLength(1);
  });
  it("rejects stale inbound ticket updates", async () => { const store = new InMemoryEnterpriseStore(), workspace = await store.provision({ orgId: "ticket-org", ownerUserId: "owner" }), ticket = await store.create(workspace.id, "tickets", { provider: "servicenow", findingId: "finding-1", externalId: "INC001", externalUrl: null, status: "open", syncVersion: 1, lastSyncedAt: new Date().toISOString(), metadata: {} } as never); expect((await store.updateTicketInbound(workspace.id, ticket.id, 1, { status: "closed", syncVersion: 2 }))?.syncVersion).toBe(2); expect(await store.updateTicketInbound(workspace.id, ticket.id, 1, { status: "reopened", syncVersion: 2 })).toBeNull(); });
});
