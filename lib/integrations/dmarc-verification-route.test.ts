import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The post-change check is a claim about the outside world, so these tests pin
 * the two properties that make the claim honest: a check that could not be made
 * is never stored as a pass, and a failed check never undoes or hides a change
 * that is already live in the customer's DNS.
 */
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/auth", () => ({
  getSessionContext: async () => session.current,
  hasOrgRole: (ctx: { memberships?: { org: { id: string }; role: string }[] } | null, orgId: string) =>
    !!ctx?.memberships?.some((m) => m.org.id === orgId && (m.role === "admin" || m.role === "owner")),
}));

const access = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/target-access", () => ({ authorizedTargetOrg: (...a: unknown[]) => access.owner(...a) }));

const store = vi.hoisted(() => ({ summary: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/integrations/connections", () => ({
  getConnectionSummary: (...a: unknown[]) => store.summary(...a),
  getConnectionToken: (...a: unknown[]) => store.token(...a),
}));

const applied = vi.hoisted(() => ({ record: vi.fn(), active: vi.fn(), rolledBack: vi.fn(), verification: vi.fn() }));
vi.mock("@/lib/integrations/applied", () => ({
  recordApplied: (...a: unknown[]) => applied.record(...a),
  activeRemediation: (...a: unknown[]) => applied.active(...a),
  markRolledBack: (...a: unknown[]) => applied.rolledBack(...a),
  recordVerification: (...a: unknown[]) => applied.verification(...a),
}));

const remediate = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn(), rollback: vi.fn() }));
vi.mock("@/lib/integrations/remediate", () => ({
  previewDmarcRemediation: (...a: unknown[]) => remediate.preview(...a),
  applyDmarcRemediation: (...a: unknown[]) => remediate.apply(...a),
  rollbackRemediation: (...a: unknown[]) => remediate.rollback(...a),
}));

const check = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/integrations/verification", () => ({ verifyDmarcRemediation: (...a: unknown[]) => check.verify(...a) }));

vi.mock("@/lib/security/ratelimit", () => ({ rateLimit: async () => ({ ok: true }), clientIdentity: () => "test" }));
vi.mock("@/lib/http/body", () => ({
  readLimitedJson: async (r: Request) => JSON.parse(await r.text()),
  RequestBodyError: class extends Error {},
}));
vi.mock("@/lib/observability/log", () => ({ operationalLog: () => {} }));
vi.mock("@/lib/security/concurrency", () => ({
  withConcurrency: async (_key: string, _limit: number, _ms: number, fn: () => Promise<unknown>) => fn(),
  CapacityError: class extends Error {},
}));

import { GET, POST, PATCH } from "@/app/api/integrations/cloudflare/dmarc/route";

const ORG = "org_a";
const POLICY = "v=DMARC1; p=none; sp=none; fo=1";
const PASSED = { status: "passed", observed: POLICY, checkedAt: "2026-08-21T03:00:00.000Z" };

function post(target: string) {
  return new NextRequest("http://x/api/integrations/cloudflare/dmarc", { method: "POST", body: JSON.stringify({ orgId: ORG, target }) });
}
function patch(target: string) {
  return new NextRequest("http://x/api/integrations/cloudflare/dmarc", { method: "PATCH", body: JSON.stringify({ orgId: ORG, target }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.current = {
    user: { id: "u_a", email: "a@a.com", emailVerifiedAt: "2026-01-01" },
    memberships: [{ org: { id: ORG, name: "A" }, role: "admin" }],
  };
  access.owner.mockResolvedValue(ORG);
  store.summary.mockResolvedValue({ zones: [{ id: "z1", name: "acme.com" }] });
  store.token.mockResolvedValue("cf-token");
  applied.active.mockResolvedValue(null);
  applied.record.mockResolvedValue({ id: "rem_1", appliedAt: "2026-08-21T02:59:00.000Z" });
  remediate.preview.mockReturnValue({ record: { name: "_dmarc.acme.com", type: "TXT", content: POLICY }, summary: "s" });
  remediate.apply.mockResolvedValue({ applied: true, handle: { recordId: "r1", zoneId: "z1", content: POLICY }, summary: "applied" });
  check.verify.mockResolvedValue(PASSED);
});

describe("applying runs the post-change check", () => {
  it("checks the public result against the policy it applied, and stores it", async () => {
    const res = await POST(post("acme.com"));
    expect(res.status).toBe(200);
    expect(check.verify).toHaveBeenCalledWith("acme.com", POLICY, expect.anything());
    expect(applied.verification).toHaveBeenCalledWith("rem_1", PASSED);
    expect((await res.json()).remediation.verification).toMatchObject({ status: "passed" });
  });

  it("reports not_observed honestly instead of implying success", async () => {
    check.verify.mockResolvedValue({ status: "not_observed", observed: null, checkedAt: PASSED.checkedAt });
    const body = await (await POST(post("acme.com"))).json();
    expect(body.applied).toBe(true);
    expect(body.remediation.verification.status).toBe("not_observed");
  });

  it("keeps the applied change when the check itself fails", async () => {
    check.verify.mockRejectedValue(new Error("DNS unavailable"));
    const res = await POST(post("acme.com"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.applied).toBe(true);
    expect(body.remediation.verification).toBeNull();
    // The DNS record stays: a check that could not run is not a reason to revert.
    expect(remediate.rollback).not.toHaveBeenCalled();
  });
});

describe("re-checking on demand", () => {
  it("re-runs the check for an applied remediation and stores the new result", async () => {
    applied.active.mockResolvedValue({ id: "rem_1", handle: {}, appliedAt: PASSED.checkedAt });
    const res = await PATCH(patch("acme.com"));
    expect(res.status).toBe(200);
    expect(applied.verification).toHaveBeenCalledWith("rem_1", PASSED);
    expect((await res.json()).verification.status).toBe("passed");
  });

  it("has nothing to check when nothing was applied", async () => {
    const res = await PATCH(patch("acme.com"));
    expect(res.status).toBe(404);
    expect(check.verify).not.toHaveBeenCalled();
  });

  it("reports the check as unavailable without touching the change", async () => {
    applied.active.mockResolvedValue({ id: "rem_1", handle: {}, appliedAt: PASSED.checkedAt });
    check.verify.mockRejectedValue(new Error("DNS unavailable"));
    expect((await PATCH(patch("acme.com"))).status).toBe(503);
    expect(applied.verification).not.toHaveBeenCalled();
  });

  it("refuses a domain that is not a verified target of the organization", async () => {
    access.owner.mockResolvedValue("org_b");
    const res = await PATCH(patch("acme.com"));
    expect(res.status).toBe(403);
    expect(check.verify).not.toHaveBeenCalled();
  });

  it("refuses an unverified email even for an admin", async () => {
    session.current = { user: { id: "u_a", email: "a@a.com", emailVerifiedAt: null }, memberships: [{ org: { id: ORG, name: "A" }, role: "admin" }] };
    expect((await PATCH(patch("acme.com"))).status).toBe(403);
  });
});

describe("listing zones", () => {
  it("exposes the stored check next to the applied record", async () => {
    applied.active.mockResolvedValue({ id: "rem_1", appliedAt: PASSED.checkedAt, verification: PASSED });
    const body = await (await GET(new NextRequest(`http://x/api/integrations/cloudflare/dmarc?orgId=${ORG}`))).json();
    expect(body.zones[0].applied.verification).toMatchObject({ status: "passed" });
  });
});
