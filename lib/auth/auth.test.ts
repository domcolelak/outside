import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { clearedSessionCookie, sessionCookie, signSession, verifySession } from "./session";
import { InMemoryAuthStore } from "./memory-store";
import { roleAtLeast } from "./model";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password here", hash)).toBe(false);
  });
  it("salts: same password hashes differently each time", async () => {
    expect(await hashPassword("same-password-xx")).not.toBe(await hashPassword("same-password-xx"));
  });
  it("enforces a minimum length", () => {
    expect(passwordProblem("short")).toBeTruthy();
    expect(passwordProblem("longenoughpassword")).toBeNull();
  });
});

describe("signed sessions", () => {
  it("round-trips a valid session", () => {
    const token = signSession("usr_123");
    expect(verifySession(token)?.uid).toBe("usr_123");
  });
  it("rejects tampered or malformed tokens", () => {
    const token = signSession("usr_123");
    expect(verifySession(token + "x")).toBeNull();
    expect(verifySession("garbage")).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });
  it("rejects expired sessions", () => {
    const expired = signSession("usr_123", -10);
    expect(verifySession(expired)).toBeNull();
  });
  it("marks the cookie httpOnly and clears correctly", () => {
    expect(sessionCookie("t")).toMatch(/HttpOnly/);
    expect(clearedSessionCookie()).toMatch(/Max-Age=0/);
  });
});

describe("accounts, organizations, RBAC", () => {
  it("creates a user with a personal org and owner membership", async () => {
    const store = new InMemoryAuthStore();
    const { user, org } = await store.createUserWithOrg({ email: "A@Example.com", name: "Ann", passwordHash: "h", orgName: "Ann Co" });
    expect(user.email).toBe("a@example.com"); // normalized
    const found = await store.findUserByEmail("a@example.com");
    expect(found?.id).toBe(user.id);
    const memberships = await store.membershipsForUser(user.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.role).toBe("owner");
    expect(memberships[0]!.org.id).toBe(org.id);
  });

  it("enforces the role hierarchy", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("analyst", "admin")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
  });

  it("invites a teammate and accepting adds a membership", async () => {
    const store = new InMemoryAuthStore();
    const { org } = await store.createUserWithOrg({ email: "owner@example.com", name: "Owner", passwordHash: "h", orgName: "Acme" });
    const invite = await store.createInvite(org.id, "New@Example.com", "analyst", "tok_invite");
    expect((await store.listInvites(org.id)).map((i) => i.email)).toContain("new@example.com");

    const { user: joiner } = await store.createUserWithOrg({ email: "joiner@example.com", name: "Joiner", passwordHash: "h", orgName: "Joiner Co" });
    const result = await store.acceptInvite("tok_invite", joiner.id);
    expect(result).toEqual({ orgId: org.id, role: "analyst" });
    const memberships = await store.membershipsForUser(joiner.id);
    expect(memberships.some((m) => m.org.id === org.id && m.role === "analyst")).toBe(true);
    // Accepted invite is no longer pending, and re-accepting fails.
    expect(await store.listInvites(org.id)).toHaveLength(0);
    expect(await store.acceptInvite("tok_invite", joiner.id)).toBeNull();
    void invite;
  });

  it("toggles a member's change-alert preference", async () => {
    const store = new InMemoryAuthStore();
    const { user, org } = await store.createUserWithOrg({ email: "c@example.com", name: "Cy", passwordHash: "h", orgName: "Cy Co" });
    expect((await store.membershipsForUser(user.id))[0]!.notifyChanges).toBe(true);
    await store.setNotifyChanges(user.id, org.id, false);
    expect((await store.orgMembers(org.id))[0]!.notifyChanges).toBe(false);
  });

  it("updates the org plan", async () => {
    const store = new InMemoryAuthStore();
    const { user, org } = await store.createUserWithOrg({ email: "b@example.com", name: "Bo", passwordHash: "h", orgName: "Bo Co" });
    await store.setPlan(org.id, "professional");
    const m = await store.membershipsForUser(user.id);
    expect(m[0]!.org.plan).toBe("professional");
  });
});
