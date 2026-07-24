import { beforeEach, describe, expect, it } from "vitest";
import { recordApplied, activeRemediation, markRolledBack, __resetApplied } from "./applied";

beforeEach(() => __resetApplied());

const HANDLE = { zoneId: "z1", recordId: "rec1", name: "_dmarc.acme.com", type: "TXT", content: "v=DMARC1; p=none;" };
const BASE = { orgId: "org_1", provider: "cloudflare", target: "acme.com", action: "add_dmarc_monitoring", appliedBy: "usr_1" };

describe("applied remediations", () => {
  it("keeps the provider rollback handle so the change stays reversible", async () => {
    await recordApplied({ ...BASE, handle: HANDLE });
    const active = await activeRemediation("org_1", "cloudflare", "acme.com", "add_dmarc_monitoring");
    expect(active?.handle).toEqual(HANDLE);
    expect(active?.appliedBy).toBe("usr_1");
  });

  it("stops being active once rolled back", async () => {
    const record = await recordApplied({ ...BASE, handle: HANDLE });
    await markRolledBack(record.id);
    expect(await activeRemediation("org_1", "cloudflare", "acme.com", "add_dmarc_monitoring")).toBeNull();
  });

  it("is scoped per organization and per target", async () => {
    await recordApplied({ ...BASE, handle: HANDLE });
    expect(await activeRemediation("org_2", "cloudflare", "acme.com", "add_dmarc_monitoring")).toBeNull();
    expect(await activeRemediation("org_1", "cloudflare", "other.com", "add_dmarc_monitoring")).toBeNull();
  });

  it("allows re-applying after a rollback", async () => {
    const first = await recordApplied({ ...BASE, handle: HANDLE });
    await markRolledBack(first.id);
    await recordApplied({ ...BASE, handle: { ...HANDLE, recordId: "rec2" } });
    const active = await activeRemediation("org_1", "cloudflare", "acme.com", "add_dmarc_monitoring");
    expect(active?.handle.recordId).toBe("rec2");
  });
});
