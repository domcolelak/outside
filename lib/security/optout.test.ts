import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOptedOut, addManualOptOut, optOutRecordName, optOutInstructions, OPTOUT_RECORD_VALUE, __resetOptOut } from "./optout";

const resolveTxt = vi.hoisted(() => vi.fn<(name: string) => Promise<string[]>>());
vi.mock("@/lib/discovery/providers", () => ({ resolveTxt }));

beforeEach(() => {
  __resetOptOut();
  resolveTxt.mockReset();
  resolveTxt.mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe("public-scan opt-out", () => {
  it("publishes the record on the domain the owner controls", () => {
    expect(optOutRecordName("app.acme.com")).toBe("_outside-optout.acme.com");
    expect(optOutInstructions("acme.com").recordValue).toBe(OPTOUT_RECORD_VALUE);
  });

  it("honours an owner-published DNS TXT opt-out", async () => {
    resolveTxt.mockResolvedValue([OPTOUT_RECORD_VALUE]);
    expect(await isOptedOut("acme.com")).toEqual({ optedOut: true, source: "dns" });
  });

  it("tolerates quoted TXT values and different casing", async () => {
    resolveTxt.mockResolvedValue([`"${OPTOUT_RECORD_VALUE.toUpperCase()}"`]);
    expect((await isOptedOut("acme.com")).optedOut).toBe(true);
  });

  it("applies to subdomains, because it is keyed on the registrable domain", async () => {
    resolveTxt.mockResolvedValue([OPTOUT_RECORD_VALUE]);
    expect((await isOptedOut("staging.acme.com")).optedOut).toBe(true);
    expect(resolveTxt).toHaveBeenCalledWith("_outside-optout.acme.com", undefined);
  });

  it("is not opted out when the record is absent or unrelated", async () => {
    resolveTxt.mockResolvedValue(["v=spf1 -all", "some-other-verification=abc"]);
    expect(await isOptedOut("acme.com")).toEqual({ optedOut: false });
  });

  it("fails open — a DNS failure must not make a domain unscannable", async () => {
    resolveTxt.mockRejectedValue(new Error("SERVFAIL"));
    expect((await isOptedOut("acme.com")).optedOut).toBe(false);
  });

  it("honours a manual/legal denylist entry without any DNS lookup", async () => {
    await addManualOptOut("acme.com", "legal request", "operator");
    expect(await isOptedOut("acme.com")).toEqual({ optedOut: true, source: "manual" });
    expect(resolveTxt).not.toHaveBeenCalled();
  });

  it("caches the answer so a scan does not cost a lookup every time", async () => {
    resolveTxt.mockResolvedValue([OPTOUT_RECORD_VALUE]);
    await isOptedOut("acme.com");
    await isOptedOut("acme.com");
    expect(resolveTxt).toHaveBeenCalledTimes(1);
  });

  it("keeps domains independent", async () => {
    resolveTxt.mockImplementation(async (name) => (name === "_outside-optout.acme.com" ? [OPTOUT_RECORD_VALUE] : []));
    expect((await isOptedOut("acme.com")).optedOut).toBe(true);
    expect((await isOptedOut("other.com")).optedOut).toBe(false);
  });
});
