import { describe, expect, it, vi, beforeEach } from "vitest";

const resolveTxt = vi.hoisted(() => vi.fn<(name: string, signal?: AbortSignal) => Promise<string[]>>());
vi.mock("@/lib/discovery/providers", () => ({ resolveTxt }));

import { verifyDmarcRemediation } from "./verification";

const APPLIED = "v=DMARC1; p=none; sp=none; fo=1";

beforeEach(() => {
  resolveTxt.mockReset();
  resolveTxt.mockResolvedValue([]);
});

describe("verifyDmarcRemediation", () => {
  it("looks up the policy at the zone apex, not the hostname it was asked about", async () => {
    await verifyDmarcRemediation("mail.acme.com", APPLIED);
    expect(resolveTxt).toHaveBeenCalledWith("_dmarc.acme.com", undefined);
  });

  it("passes when public DNS serves exactly what was applied", async () => {
    resolveTxt.mockResolvedValue([`"${APPLIED}"`]);
    expect(await verifyDmarcRemediation("acme.com", APPLIED)).toMatchObject({ status: "passed", observed: APPLIED });
  });

  it("ignores spacing and case, which carry no meaning in a policy", async () => {
    resolveTxt.mockResolvedValue(["v=dmarc1;p=none;sp=none;fo=1"]);
    expect(await verifyDmarcRemediation("acme.com", APPLIED)).toMatchObject({ status: "passed" });
  });

  it("joins a policy served as adjacent quoted chunks", async () => {
    resolveTxt.mockResolvedValue([`"v=DMARC1; p=none; " "sp=none; fo=1"`]);
    expect(await verifyDmarcRemediation("acme.com", APPLIED)).toMatchObject({ status: "passed" });
  });

  it("reports not_observed when nothing is served yet", async () => {
    resolveTxt.mockResolvedValue([]);
    expect(await verifyDmarcRemediation("acme.com", APPLIED)).toMatchObject({ status: "not_observed", observed: null });
  });

  it("ignores unrelated TXT records at the same name", async () => {
    resolveTxt.mockResolvedValue(["v=spf1 -all", "google-site-verification=abc"]);
    expect(await verifyDmarcRemediation("acme.com", APPLIED)).toMatchObject({ status: "not_observed" });
  });

  it("reports the policy actually served when it is not the one applied", async () => {
    resolveTxt.mockResolvedValue(['"v=DMARC1; p=reject"']);
    expect(await verifyDmarcRemediation("acme.com", APPLIED)).toMatchObject({ status: "mismatch", observed: "v=DMARC1; p=reject" });
  });

  it("treats a lookup failure as not observed, never as a pass", async () => {
    resolveTxt.mockRejectedValue(new Error("SERVFAIL"));
    expect(await verifyDmarcRemediation("acme.com", APPLIED)).toMatchObject({ status: "not_observed" });
  });

  it("propagates an abort instead of swallowing it as not observed", async () => {
    const controller = new AbortController();
    controller.abort();
    resolveTxt.mockRejectedValue(new Error("aborted"));
    await expect(verifyDmarcRemediation("acme.com", APPLIED, controller.signal)).rejects.toThrow();
  });
});
