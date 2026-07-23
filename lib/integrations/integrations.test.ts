import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyToken, listZones, createDnsTxt, deleteDnsRecord } from "./cloudflare";
import { previewDmarcRemediation, applyDmarcRemediation, rollbackRemediation } from "./remediate";

afterEach(() => vi.restoreAllMocks());

function cfOk(result: unknown) {
  return new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 });
}

describe("Cloudflare connector", () => {
  it("verifies a token via the read-only endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => cfOk({ status: "active" })));
    expect(await verifyToken("tok")).toEqual({ valid: true, status: "active" });
  });

  it("surfaces a Cloudflare API error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, errors: [{ message: "Invalid token" }] }), { status: 403 })));
    await expect(verifyToken("bad")).rejects.toThrow(/Invalid token/);
  });

  it("lists zones and creates + deletes a TXT record", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/zones") && (!init.method || init.method === "GET")) return cfOk([{ id: "z1", name: "acme.com" }]);
      if (init.method === "POST") return cfOk({ id: "rec1" });
      if (init.method === "DELETE") return cfOk({ id: "rec1" });
      return cfOk({});
    }));
    expect(await listZones("tok")).toEqual([{ id: "z1", name: "acme.com" }]);
    const handle = await createDnsTxt("z1", "_dmarc.acme.com", "v=DMARC1; p=none;", "tok");
    expect(handle.recordId).toBe("rec1");
    expect(await deleteDnsRecord(handle, "tok")).toBe(true);
  });
});

describe("DMARC remediation (safe, reversible)", () => {
  it("previews without touching anything", () => {
    const p = previewDmarcRemediation("www.acme.com");
    expect(p.record.name).toBe("_dmarc.acme.com");
    expect(p.record.content).toContain("p=none");
    expect(p.reversible).toBe(true);
  });

  it("applies to the matching zone and returns a rollback handle", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/tokens/verify")) return cfOk({ status: "active" });
      if (url.includes("/zones") && (!init.method || init.method === "GET")) return cfOk([{ id: "z1", name: "acme.com" }]);
      if (init.method === "POST") return cfOk({ id: "rec1" });
      if (init.method === "DELETE") return cfOk({ id: "rec1" });
      return cfOk({});
    }));
    const result = await applyDmarcRemediation("acme.com", { token: "tok", actorId: "u1" });
    expect(result.applied).toBe(true);
    expect(result.handle?.recordId).toBe("rec1");
    expect(await rollbackRemediation(result.handle!, { token: "tok" })).toBe(true);
  });

  it("refuses to write when the token does not manage the zone", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/tokens/verify")) return cfOk({ status: "active" });
      if (url.includes("/zones") && (!init.method || init.method === "GET")) return cfOk([{ id: "z9", name: "other.com" }]);
      return cfOk({});
    }));
    const result = await applyDmarcRemediation("acme.com", { token: "tok" });
    expect(result.applied).toBe(false);
    expect(result.summary).toContain("does not manage");
  });
});
