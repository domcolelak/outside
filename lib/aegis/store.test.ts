import { beforeEach, describe, expect, it } from "vitest";
import { __resetAegisStore, getRecommendationStatuses, listAudit, setRecommendationStatus } from "./store";

describe("organization-isolated recommendation state", () => {
  beforeEach(() => __resetAegisStore());

  it("does not leak status or audit records between organizations", async () => {
    await setRecommendationStatus("org_a", "acme.com", "rec_1", "resolved", "a@acme.com");

    expect((await getRecommendationStatuses("org_a", "acme.com")).get("rec_1")).toBe("resolved");
    expect((await getRecommendationStatuses("org_b", "acme.com")).size).toBe(0);
    expect(await listAudit("org_b", "acme.com")).toEqual([]);
    expect((await listAudit("org_a", "acme.com"))[0]?.actor).toBe("a@acme.com");
  });
});
