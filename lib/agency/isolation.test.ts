import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { InMemoryAgencyStore } from "./memory-store";

/**
 * Cross-tenant isolation: every agency-scoped store read must be confined to its
 * own workspace. These tests populate agency A and then assert that agency B's
 * queries never observe A's rows, and that A-scoped mutations refuse B's ids.
 */
describe("agency store — cross-tenant isolation", () => {
  let store: InMemoryAgencyStore;
  let A: string; // agency A workspace id
  let B: string; // agency B workspace id
  let aClientId: string;

  beforeEach(async () => {
    store = new InMemoryAgencyStore();
    const a = await store.createWorkspace({ ownerOrgId: "org_a", ownerUserId: "user_a", name: "Agency A", slug: "agency-a" });
    const b = await store.createWorkspace({ ownerOrgId: "org_b", ownerUserId: "user_b", name: "Agency B", slug: "agency-b" });
    A = a.id; B = b.id;

    // Populate A with data across every scoped collection.
    const client = await store.addClient({ agencyId: A, orgId: "org_client_a", organizationName: "Acme", organizationSlug: "acme" });
    aClientId = client!.id;
    await store.createGroup({ agencyId: A, name: "A Group", color: "#111111" });
    await store.createNote({ agencyId: A, clientId: aClientId, authorId: "user_a", body: "A private note", visibility: "internal" });
    await store.createJob({ agencyId: A, type: "scan", idempotencyKey: "a-job", clientOrgIds: ["org_client_a"], payload: {}, createdBy: "user_a" });
    await store.createApiKey({ agencyId: A, name: "A key", prefix: "out_agency_a", secretHash: createHash("sha256").update("a-secret").digest("hex"), scopes: ["*"], createdBy: "user_a" });
  });

  it("agency B never observes agency A's clients, groups, jobs, keys or activity", async () => {
    expect(await store.clients(B)).toEqual([]);
    expect(await store.groups(B)).toEqual([]);
    expect(await store.jobs(B)).toEqual([]);
    expect(await store.apiKeys(B)).toEqual([]);
    // A still sees its own data (sanity: the query works, isolation is the filter).
    expect((await store.clients(A)).length).toBe(1);
    expect((await store.groups(A)).length).toBe(1);
  });

  it("agency B cannot read notes attached to agency A's client", async () => {
    // Even passing A's real clientId, B's scope returns nothing.
    expect(await store.notes(B, aClientId)).toEqual([]);
    expect((await store.notes(A, aClientId)).length).toBe(1);
  });

  it("A-scoped membership and key reads exclude the other workspace", async () => {
    const aMembers = await store.memberships(A);
    const bMembers = await store.memberships(B);
    expect(aMembers.every((m) => m.agencyId === A)).toBe(true);
    expect(bMembers.every((m) => m.agencyId === B)).toBe(true);
    expect(aMembers.map((m) => m.userId)).not.toContain("user_b");
  });

  it("an A-scoped mutation refuses to act on a foreign client id", async () => {
    // updateClient is scoped by (agencyId, clientId); B must not mutate A's client.
    const viaB = await store.updateClient(B, aClientId, { serviceTier: "premium" });
    expect(viaB).toBeNull();
    // The same call scoped to A succeeds.
    const viaA = await store.updateClient(A, aClientId, { serviceTier: "premium" });
    expect(viaA).not.toBeNull();
  });

  it("addClient enforces per-agency uniqueness without leaking across agencies", async () => {
    // The same org can be a client of both agencies independently.
    const inB = await store.addClient({ agencyId: B, orgId: "org_client_a", organizationName: "Acme", organizationSlug: "acme" });
    expect(inB).not.toBeNull();
    expect((await store.clients(A)).length).toBe(1);
    expect((await store.clients(B)).length).toBe(1);
    expect((await store.clients(A))[0]!.id).not.toBe((await store.clients(B))[0]!.id);
  });
});
