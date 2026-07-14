import { afterEach, describe, expect, it } from "vitest";
import { InMemoryScanStore } from "@/lib/persistence/memory-store";
import { __resetStore } from "@/lib/persistence";
import type { SessionContext } from "./model";
import { authorizedTargetOrg } from "./target-access";

const context: SessionContext = {
  user: { id: "user_1", email: "owner@acme.com", name: "Owner", emailVerifiedAt: new Date(0).toISOString(), createdAt: new Date(0).toISOString() },
  memberships: [{
    org: { id: "org_1", name: "Acme", slug: "acme", plan: "free", createdAt: new Date(0).toISOString() },
    role: "owner",
    notifyChanges: true,
  }],
};

describe("authorizedTargetOrg", () => {
  afterEach(() => __resetStore());

  it("requires verified ownership and a sufficient organization role", async () => {
    const store = new InMemoryScanStore();
    __resetStore(store);
    await store.startVerification("acme.com", "token", "org_1");
    expect(await authorizedTargetOrg(context, "acme.com", "viewer")).toBeNull();

    await store.markVerified("acme.com", "org_1");
    expect(await authorizedTargetOrg(context, "acme.com", "analyst")).toBe("org_1");
    expect(await authorizedTargetOrg({ ...context, memberships: [] }, "acme.com", "viewer")).toBeNull();
    expect(await authorizedTargetOrg(null, "acme.com", "viewer")).toBeNull();
  });
});
