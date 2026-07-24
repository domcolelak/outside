import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ role: "viewer" as "viewer" | "analyst", via: "api_key" as "api_key" | "session" }));

const notes = [
  { id: "internal", agencyId: "agency_1", clientId: "client_1", authorId: "author", body: "private", visibility: "internal" as const, createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z" },
  { id: "shared", agencyId: "agency_1", clientId: "client_1", authorId: "author", body: "public", visibility: "shared" as const, createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z" },
];

vi.mock("@/lib/agency/access", () => ({
  agencyAccess: async () => ({
    workspace: { id: "agency_1" },
    role: state.role,
    actorId: state.via === "api_key" ? "api-key:key_1" : "analyst",
    via: state.via,
    scopes: state.via === "api_key" ? ["clients:read"] : ["*"],
    session: null,
  }),
}));

vi.mock("@/lib/agency/store", () => ({
  getAgencyStore: async () => ({
    clients: async () => [{ id: "client_1", orgId: "org_1" }],
    notes: async () => notes,
    findingShares: async () => [],
  }),
}));

vi.mock("@/lib/guardian/store", () => ({
  getGuardianStore: async () => ({ overview: async () => ({ recommendations: [] }) }),
}));

vi.mock("@/lib/agency/sla", () => ({ synchronizeClientSla: async () => [] }));

import { GET } from "@/app/api/agency/clients/[id]/route";

describe("agency client detail note visibility", () => {
  beforeEach(() => {
    state.role = "viewer";
    state.via = "api_key";
  });

  it("does not expose internal notes to a clients:read API key", async () => {
    const response = await GET(new NextRequest("https://outside.test/api/agency/clients/client_1?agencyId=agency_1"), { params: Promise.resolve({ id: "client_1" }) });
    const body = await response.json() as { notes: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.notes.map((note) => note.id)).toEqual(["shared"]);
  });

  it("retains internal notes for a role allowed by the notes endpoint policy", async () => {
    state.role = "analyst";
    state.via = "session";
    const response = await GET(new NextRequest("https://outside.test/api/agency/clients/client_1?agencyId=agency_1"), { params: Promise.resolve({ id: "client_1" }) });
    const body = await response.json() as { notes: Array<{ id: string }> };

    expect(body.notes.map((note) => note.id)).toEqual(["internal", "shared"]);
  });
});
