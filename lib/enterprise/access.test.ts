import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (_name: string) => (h.cookie ? { value: h.cookie } : undefined) }),
}));

import { enterpriseAccess } from "./access";
import { InMemoryEnterpriseStore } from "./memory-store";
import { __resetEnterpriseStore } from "./store";
import { secretHash } from "./crypto";
import type { EnterpriseApiToken, EnterprisePermission, EnterpriseWorkspace } from "./types";
import { InMemoryAuthStore } from "@/lib/auth/memory-store";
import { __resetAuthStore } from "@/lib/auth";
import { SESSION_MAX_AGE, signSession } from "@/lib/auth/session";

function bearer(token: string): NextRequest {
  return { headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? `Bearer ${token}` : null) } } as unknown as NextRequest;
}

let store: InMemoryEnterpriseStore;
let auth: InMemoryAuthStore;
let workspace: EnterpriseWorkspace;
let orgId: string;
let ownerId: string;

async function provisionFor(expiresAt: string | null = null): Promise<void> {
  const created = await auth.createUserWithOrg({ email: "owner@corp.test", name: "Owner", passwordHash: "h", orgName: "Corp", emailVerified: true });
  ownerId = created.user.id;
  orgId = created.org.id;
  workspace = await store.provision({ orgId, ownerUserId: ownerId, expiresAt });
}

async function issueToken(permissions: EnterprisePermission[], scopes: Record<string, string[]> = {}): Promise<string> {
  const raw = `out_enterprise_${Math.random().toString(36).slice(2)}${Date.now()}`;
  await store.create<EnterpriseApiToken>(workspace.id, "apiTokens", {
    name: "t", prefix: raw.slice(0, 23), secretHash: secretHash(raw), permissions, scopes, createdBy: ownerId, expiresAt: null, lastUsedAt: null, revokedAt: null,
  });
  return raw;
}

beforeEach(async () => {
  h.cookie = undefined;
  store = new InMemoryEnterpriseStore();
  auth = new InMemoryAuthStore();
  __resetEnterpriseStore(store);
  __resetAuthStore(auth);
  await provisionFor();
});

afterEach(() => {
  __resetEnterpriseStore(undefined);
  __resetAuthStore(undefined);
});

describe("enterpriseAccess — API token path", () => {
  it("grants access for a token holding the required permission on the right org", async () => {
    const raw = await issueToken(["audit:read"]);
    const access = await enterpriseAccess(bearer(raw), "audit:read", orgId);
    expect(access?.actorType).toBe("api_token");
    expect(access?.permissions.has("audit:read")).toBe(true);
  });

  it("rejects a token scoped to a different org", async () => {
    const raw = await issueToken(["audit:read"]);
    expect(await enterpriseAccess(bearer(raw), "audit:read", "another-org")).toBeNull();
  });

  it("rejects a permission the token does not hold", async () => {
    const raw = await issueToken(["audit:read"]);
    expect(await enterpriseAccess(bearer(raw), "roles:manage", orgId)).toBeNull();
  });

  it("rejects when the workspace license is expired", async () => {
    store = new InMemoryEnterpriseStore();
    auth = new InMemoryAuthStore();
    __resetEnterpriseStore(store);
    __resetAuthStore(auth);
    await provisionFor(new Date(Date.now() - 86_400_000).toISOString());
    const raw = await issueToken(["audit:read"]);
    expect(await enterpriseAccess(bearer(raw), "audit:read", orgId)).toBeNull();
  });

  it("enforces scope binding when the token declares scopes", async () => {
    const raw = await issueToken(["audit:read"], { department: ["dept-a"] });
    expect(await enterpriseAccess(bearer(raw), "audit:read", orgId, { type: "department", id: "dept-b" })).toBeNull();
    expect(await enterpriseAccess(bearer(raw), "audit:read", orgId, { type: "department", id: "dept-a" })).not.toBeNull();
  });

  it("rejects an unknown/forged token", async () => {
    expect(await enterpriseAccess(bearer("out_enterprise_forged"), "audit:read", orgId)).toBeNull();
  });
});

describe("enterpriseAccess — session path", () => {
  it("grants the org owner the full permission set", async () => {
    h.cookie = signSession(ownerId, SESSION_MAX_AGE, 0);
    const access = await enterpriseAccess(null, "roles:manage", orgId);
    expect(access?.actorType).toBe("user");
    expect(access?.permissions.has("roles:manage")).toBe(true);
  });

  it("rejects an unverified session", async () => {
    const other = await auth.createUserWithOrg({ email: "u@corp.test", name: "U", passwordHash: "h", orgName: "Other", emailVerified: false });
    h.cookie = signSession(other.user.id, SESSION_MAX_AGE, 0);
    expect(await enterpriseAccess(null, "audit:read", orgId)).toBeNull();
  });

  it("rejects a user with no enterprise workspace for their org", async () => {
    const other = await auth.createUserWithOrg({ email: "solo@corp.test", name: "Solo", passwordHash: "h", orgName: "Solo Co", emailVerified: true });
    h.cookie = signSession(other.user.id, SESSION_MAX_AGE, 0);
    expect(await enterpriseAccess(null, "audit:read", other.org.id)).toBeNull();
  });
});
