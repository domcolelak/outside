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
    const token = signSession("usr_123", 60, 7);
    expect(verifySession(token)).toEqual({ uid: "usr_123", version: 7 });
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

  it("refuses the public fallback secret in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSecret = process.env.AUTH_SECRET;
    const env = process.env as Record<string, string | undefined>;
    try {
      env.NODE_ENV = "production";
      delete process.env.AUTH_SECRET;
      expect(() => signSession("usr_prod")).toThrow(/AUTH_SECRET/);
    } finally {
      if (previousNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previousNodeEnv;
      if (previousSecret === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = previousSecret;
    }
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

  it("leaves a new password account unverified unless explicitly verified (safe default)", async () => {
    const store = new InMemoryAuthStore();
    const { user } = await store.createUserWithOrg({ email: "unverified@example.com", name: "U", passwordHash: "h", orgName: "U Co" });
    expect(user.emailVerifiedAt).toBeNull();
    const { user: verified } = await store.createUserWithOrg({ email: "verified@example.com", name: "V", passwordHash: "h", orgName: "V Co", emailVerified: true });
    expect(verified.emailVerifiedAt).not.toBeNull();
  });

  it("enforces the role hierarchy", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("analyst", "admin")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
  });

  it("invites a teammate and accepting adds a membership", async () => {
    const store = new InMemoryAuthStore();
    const { org } = await store.createUserWithOrg({ email: "owner@example.com", name: "Owner", passwordHash: "h", orgName: "Acme" });
    const invite = await store.createInvite(org.id, "New@Example.com", "analyst", "tok_invite", "owner_id");
    expect((await store.listInvites(org.id)).map((i) => i.email)).toContain("new@example.com");

    const { user: wrongUser } = await store.createUserWithOrg({ email: "joiner@example.com", name: "Joiner", passwordHash: "h", orgName: "Joiner Co" });
    expect(await store.acceptInvite("tok_invite", wrongUser.id, wrongUser.email)).toBeNull();

    const { user: joiner } = await store.createUserWithOrg({ email: "new@example.com", name: "New", passwordHash: "h", orgName: "New Co" });
    const result = await store.acceptInvite("tok_invite", joiner.id, joiner.email);
    expect(result).toEqual({ orgId: org.id, role: "analyst" });
    const memberships = await store.membershipsForUser(joiner.id);
    expect(memberships.some((m) => m.org.id === org.id && m.role === "analyst")).toBe(true);
    // Accepted invite is no longer pending, and re-accepting fails.
    expect(await store.listInvites(org.id)).toHaveLength(0);
    expect(await store.acceptInvite("tok_invite", joiner.id, joiner.email)).toBeNull();
    void invite;
  });

  it("toggles a member's change-alert preference", async () => {
    const store = new InMemoryAuthStore();
    const { user, org } = await store.createUserWithOrg({ email: "c@example.com", name: "Cy", passwordHash: "h", orgName: "Cy Co" });
    expect((await store.membershipsForUser(user.id))[0]!.notifyChanges).toBe(true);
    await store.setNotifyChanges(user.id, org.id, false);
    expect((await store.orgMembers(org.id))[0]!.notifyChanges).toBe(false);
  });

  it("increments the session version to revoke existing sessions", async () => {
    const store = new InMemoryAuthStore();
    const { user } = await store.createUserWithOrg({ email: "sessions@example.com", name: "Sessions", passwordHash: "h", orgName: "Sessions Co" });
    expect(user.sessionVersion).toBe(0);
    expect(await store.revokeSessions(user.id)).toBe(1);
    expect((await store.getUser(user.id))?.sessionVersion).toBe(1);
  });

  it("updates the org plan", async () => {
    const store = new InMemoryAuthStore();
    const { user, org } = await store.createUserWithOrg({ email: "b@example.com", name: "Bo", passwordHash: "h", orgName: "Bo Co" });
    await store.setPlan(org.id, "professional");
    const m = await store.membershipsForUser(user.id);
    expect(m[0]!.org.plan).toBe("professional");
  });
});
