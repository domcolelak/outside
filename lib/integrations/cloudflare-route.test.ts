import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level safety for the one write-capable connector. These invariants are
 * what keep a live DNS change reversible: a customer must never be able to
 * disconnect, or narrow the token, in a way that strands an applied remediation
 * with no way to roll it back.
 */
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/auth", () => ({
  getSessionContext: async () => session.current,
  hasOrgRole: (ctx: { memberships?: { org: { id: string }; role: string }[] } | null, orgId: string) =>
    !!ctx?.memberships?.some((m) => m.org.id === orgId && (m.role === "admin" || m.role === "owner")),
  roleAtLeast: () => true,
}));

const store = vi.hoisted(() => ({ summary: vi.fn(), token: vi.fn(), save: vi.fn(), del: vi.fn(), active: vi.fn() }));
vi.mock("@/lib/integrations/connections", () => ({
  getConnectionSummary: (...a: unknown[]) => store.summary(...a),
  getConnectionToken: (...a: unknown[]) => store.token(...a),
  saveConnection: (...a: unknown[]) => store.save(...a),
  deleteConnection: (...a: unknown[]) => store.del(...a),
}));
vi.mock("@/lib/integrations/applied", () => ({
  listActiveRemediations: (...a: unknown[]) => store.active(...a),
}));

const cf = vi.hoisted(() => ({ verify: vi.fn(), zones: vi.fn() }));
vi.mock("@/lib/integrations/cloudflare", () => ({
  verifyToken: (...a: unknown[]) => cf.verify(...a),
  listZones: (...a: unknown[]) => cf.zones(...a),
  CloudflareApiError: class extends Error {},
}));

vi.mock("@/lib/integrations/providers/audit", () => ({ recordProviderAudit: async () => {} }));
vi.mock("@/lib/security/ratelimit", () => ({
  rateLimit: async () => ({ ok: true }),
  requireBudgets: async () => ({ ok: true }),
  clientIdentity: () => "test",
}));
vi.mock("@/lib/http/body", () => ({
  readLimitedJson: async (r: Request) => JSON.parse(await r.text()),
  RequestBodyError: class extends Error {},
}));
vi.mock("@/lib/observability/log", () => ({ operationalLog: () => {} }));

import { GET, DELETE } from "@/app/api/integrations/cloudflare/route";

const ORG = "org_a";

beforeEach(() => {
  vi.clearAllMocks();
  session.current = {
    user: { id: "u_a", email: "a@a.com", emailVerifiedAt: "2026-01-01" },
    memberships: [{ org: { id: ORG, name: "A" }, role: "admin" }],
  };
  store.summary.mockResolvedValue({ provider: "cloudflare", accountHint: "token ending 4f2a", zones: [{ id: "z1", name: "acme.com" }], metadata: {}, connectedAt: "2026-08-01T00:00:00.000Z" });
  store.token.mockResolvedValue("cf-token");
  store.active.mockResolvedValue([]);
  cf.verify.mockResolvedValue({ valid: true });
  cf.zones.mockResolvedValue([{ id: "z1", name: "acme.com" }]);
});

describe("disconnect guard", () => {
  it("refuses to disconnect while a remediation is still applied", async () => {
    store.active.mockResolvedValue([{ target: "acme.com", action: "add_dmarc_monitoring" }]);
    const res = await DELETE(new NextRequest(`http://x/api/integrations/cloudflare?orgId=${ORG}`, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(store.del).not.toHaveBeenCalled();
  });

  it("allows disconnect once nothing is applied", async () => {
    const res = await DELETE(new NextRequest(`http://x/api/integrations/cloudflare?orgId=${ORG}`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(store.del).toHaveBeenCalled();
  });
});

describe("refresh keeps rollback reachable", () => {
  it("refuses to store a narrowed zone list that drops an active remediation zone", async () => {
    store.active.mockResolvedValue([{ target: "acme.com", action: "add_dmarc_monitoring" }]);
    cf.zones.mockResolvedValue([{ id: "z2", name: "other.com" }]); // acme.com no longer covered
    const res = await GET(new NextRequest(`http://x/api/integrations/cloudflare?orgId=${ORG}&refresh=1`));
    expect(res.status).toBe(409);
    // The previous connection must survive, or the customer loses the rollback button.
    expect(store.save).not.toHaveBeenCalled();
  });

  it("stores the refreshed zones when every active remediation is still covered", async () => {
    store.active.mockResolvedValue([{ target: "acme.com", action: "add_dmarc_monitoring" }]);
    const res = await GET(new NextRequest(`http://x/api/integrations/cloudflare?orgId=${ORG}&refresh=1`));
    expect(res.status).toBe(200);
    expect(store.save).toHaveBeenCalled();
  });

  it("keeps the existing connection when Cloudflare rejects the saved token", async () => {
    cf.verify.mockResolvedValue({ valid: false });
    const res = await GET(new NextRequest(`http://x/api/integrations/cloudflare?orgId=${ORG}&refresh=1`));
    expect(res.status).toBe(409);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("never puts the token in the response body", async () => {
    const res = await GET(new NextRequest(`http://x/api/integrations/cloudflare?orgId=${ORG}&refresh=1`));
    expect(JSON.stringify(await res.json())).not.toContain("cf-token");
  });
});

describe("cross-tenant authorization", () => {
  it("refuses to read another organization's connection", async () => {
    const res = await GET(new NextRequest("http://x/api/integrations/cloudflare?orgId=org_b"));
    expect(res.status).toBe(403);
    expect(store.summary).not.toHaveBeenCalled();
  });

  it("refuses to disconnect another organization", async () => {
    const res = await DELETE(new NextRequest("http://x/api/integrations/cloudflare?orgId=org_b", { method: "DELETE" }));
    expect(res.status).toBe(403);
    expect(store.del).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    session.current = null;
    const res = await GET(new NextRequest(`http://x/api/integrations/cloudflare?orgId=${ORG}`));
    expect(res.status).toBe(401);
  });
});
