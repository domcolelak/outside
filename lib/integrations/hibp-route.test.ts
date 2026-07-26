import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level authorization for the HIBP integration. The store is already
 * tenant-scoped; this proves the ENDPOINT refuses a user of organization A any
 * access to organization B's credential — read, test, connect/replace or
 * disconnect — before the store is ever touched.
 */
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/auth", () => ({
  getSessionContext: async () => session.current,
  hasOrgRole: (ctx: { memberships?: { org: { id: string }; role: string }[] } | null, orgId: string) =>
    !!ctx?.memberships?.some((m) => m.org.id === orgId && (m.role === "admin" || m.role === "owner")),
}));

const store = vi.hoisted(() => ({ summary: vi.fn(), token: vi.fn(), save: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/integrations/connections", () => ({
  getConnectionSummary: (...a: unknown[]) => store.summary(...a),
  getConnectionToken: (...a: unknown[]) => store.token(...a),
  saveProviderKey: (...a: unknown[]) => store.save(...a),
  deleteConnection: (...a: unknown[]) => store.del(...a),
}));
vi.mock("@/lib/integrations/hibp", () => ({
  verifyKey: async () => ({ ok: true, subscription: { subscriptionName: "Pwned 5", domainSearchMaxBreachedAccounts: null, subscribedUntil: null } }),
  subscribedDomains: async () => ({ ok: true, domains: [] }),
  looksLikeHibpKey: (v: string) => /^[a-f0-9]{32}$/i.test(v),
}));
vi.mock("@/lib/security/ratelimit", () => ({ rateLimit: async () => ({ ok: true }), clientIdentity: () => "test" }));
vi.mock("@/lib/http/body", () => ({ readLimitedJson: async (r: Request) => JSON.parse(await r.text()), RequestBodyError: class extends Error {} }));
vi.mock("@/lib/observability/log", () => ({ operationalLog: () => {} }));

import { GET, POST, DELETE } from "@/app/api/integrations/hibp/route";

const KEY = "0".repeat(32);
function get(url: string) { return GET(new NextRequest(url)); }

beforeEach(() => {
  vi.clearAllMocks();
  session.current = { user: { id: "u_a", email: "a@a.com", emailVerifiedAt: "2026-01-01" }, memberships: [{ org: { id: "org_a", name: "A" }, role: "admin" }] };
  store.summary.mockResolvedValue(null);
  store.token.mockResolvedValue(null);
});

describe("HIBP route authorization — cross-tenant", () => {
  it("refuses to READ another org's credential (403, store never touched)", async () => {
    const res = await get("http://x/api/integrations/hibp?orgId=org_b");
    expect(res.status).toBe(403);
    expect(store.summary).not.toHaveBeenCalled();
    expect(store.token).not.toHaveBeenCalled();
  });

  it("refuses to CONNECT/REPLACE on another org (403, nothing saved)", async () => {
    const res = await POST(new NextRequest("http://x/api/integrations/hibp", { method: "POST", body: JSON.stringify({ orgId: "org_b", key: KEY }) }));
    expect(res.status).toBe(403);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("refuses to DISCONNECT another org (403, nothing deleted)", async () => {
    const res = await DELETE(new NextRequest("http://x/api/integrations/hibp?orgId=org_b", { method: "DELETE" }));
    expect(res.status).toBe(403);
    expect(store.del).not.toHaveBeenCalled();
  });

  it("allows the user's OWN org", async () => {
    const res = await get("http://x/api/integrations/hibp?orgId=org_a");
    expect(res.status).toBe(200);
  });

  it("requires a verified email even on the own org", async () => {
    (session.current as { user: { emailVerifiedAt: string | null } }).user.emailVerifiedAt = null;
    const res = await get("http://x/api/integrations/hibp?orgId=org_a");
    expect(res.status).toBe(403);
  });

  it("requires authentication at all", async () => {
    session.current = null;
    const res = await get("http://x/api/integrations/hibp?orgId=org_a");
    expect(res.status).toBe(401);
  });
});
