import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyToken, listZones, listDnsTxtRecords, createDnsTxt, deleteDnsRecord } from "./cloudflare";
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
      if (url.includes("/zones?") && (!init.method || init.method === "GET")) return cfOk([{ id: "z1", name: "acme.com" }]);
      if (url.includes("/dns_records?") && (!init.method || init.method === "GET")) return cfOk([]);
      if (init.method === "POST") return cfOk({ id: "rec1" });
      if (init.method === "DELETE") return cfOk({ id: "rec1" });
      return cfOk({});
    }));
    expect(await listZones("tok")).toEqual([{ id: "z1", name: "acme.com" }]);
    expect(await listDnsTxtRecords("z1", "_dmarc.acme.com", "tok")).toEqual([]);
    const handle = await createDnsTxt("z1", "_dmarc.acme.com", "v=DMARC1; p=none;", "tok");
    expect(handle.recordId).toBe("rec1");
    expect(await deleteDnsRecord(handle, "tok")).toBe(true);
  });

  it("paginates zones instead of silently truncating after 50", async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({ id: `z${index}`, name: `zone-${index}.com` }));
    const fetchMock = vi.fn(async (url: string) => cfOk(url.includes("page=1") ? first : [{ id: "z50", name: "last.com" }]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listZones("tok")).toHaveLength(51);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an already deleted DNS record as a successful rollback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: false,
      errors: [{ code: 81044, message: "Record does not exist." }],
      result: null,
    }), { status: 404 })));
    expect(await deleteDnsRecord({ zoneId: "z1", recordId: "gone", name: "_dmarc.acme.com", type: "TXT", content: "x" }, "tok")).toBe(true);
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
    let created = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/tokens/verify")) return cfOk({ status: "active" });
      if (url.includes("/zones?") && (!init.method || init.method === "GET")) return cfOk([{ id: "z1", name: "acme.com" }]);
      if (url.includes("/dns_records?") && (!init.method || init.method === "GET")) {
        return cfOk(created ? [{ id: "rec1", name: "_dmarc.acme.com", type: "TXT", content: "v=DMARC1; p=none; sp=none; fo=1" }] : []);
      }
      if (init.method === "POST") { created = true; return cfOk({ id: "rec1" }); }
      if (init.method === "DELETE") return cfOk({ id: "rec1" });
      return cfOk({});
    }));
    const result = await applyDmarcRemediation("acme.com", { token: "tok", actorId: "u1" });
    expect(result.applied).toBe(true);
    expect(result.handle?.recordId).toBe("rec1");
    expect(await rollbackRemediation(result.handle!, { token: "tok" })).toBe(true);
  });

  it("refuses to create a second DMARC policy", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/tokens/verify")) return cfOk({ status: "active" });
      if (url.includes("/zones?")) return cfOk([{ id: "z1", name: "acme.com" }]);
      if (url.includes("/dns_records?")) return cfOk([{ id: "existing", name: "_dmarc.acme.com", type: "TXT", content: "v=DMARC1; p=reject" }]);
      if (init.method === "POST") throw new Error("must not write");
      return cfOk({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await applyDmarcRemediation("acme.com", { token: "tok" });
    expect(result).toMatchObject({ applied: false, verified: false });
    expect(result.summary).toContain("already exists");
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "POST")).toBe(false);
  });

  it("refuses to write when the token does not manage the zone", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("/tokens/verify")) return cfOk({ status: "active" });
      if (url.includes("/zones?") && (!init.method || init.method === "GET")) return cfOk([{ id: "z9", name: "other.com" }]);
      return cfOk({});
    }));
    const result = await applyDmarcRemediation("acme.com", { token: "tok" });
    expect(result.applied).toBe(false);
    expect(result.summary).toContain("does not manage");
  });
});
