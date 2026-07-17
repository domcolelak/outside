import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryAuthStore } from "./memory-store";
import { hashPassword, verifyPassword } from "./password";

describe("password reset lifecycle", () => {
  it("consumes a token once, changes the password, and revokes sessions", async () => {
    const store = new InMemoryAuthStore();
    const originalHash = await hashPassword("original-password");
    const { user } = await store.createUserWithOrg({ email: "owner@example.com", name: "Owner", passwordHash: originalHash, orgName: "Example" });
    const tokenHash = createHash("sha256").update("single-use-token").digest("hex");
    await store.createPasswordReset(user.id, tokenHash, new Date(Date.now() + 60_000));
    const replacement = await hashPassword("replacement-password");

    expect(await store.consumePasswordReset(tokenHash, replacement, new Date())).toBe(true);
    expect(await store.consumePasswordReset(tokenHash, originalHash, new Date())).toBe(false);
    const updated = await store.getUser(user.id);
    expect(updated?.sessionVersion).toBe(1);
    expect(await verifyPassword("replacement-password", updated!.passwordHash)).toBe(true);
  });

  it("rejects expired tokens and invalidates an older request", async () => {
    const store = new InMemoryAuthStore();
    const { user } = await store.createUserWithOrg({ email: "owner@example.com", name: "Owner", passwordHash: await hashPassword("original-password"), orgName: "Example" });
    await store.createPasswordReset(user.id, "old", new Date(Date.now() + 60_000));
    await store.createPasswordReset(user.id, "new", new Date(Date.now() + 60_000));
    expect(await store.consumePasswordReset("old", "unused", new Date())).toBe(false);
    await store.createPasswordReset(user.id, "expired", new Date(Date.now() - 1));
    expect(await store.consumePasswordReset("expired", "unused", new Date())).toBe(false);
  });
});

