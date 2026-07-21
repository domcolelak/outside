import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (_name: string) => (h.cookie ? { value: h.cookie } : undefined) }),
}));

import { agencyAccess } from "./access";
import { InMemoryAgencyStore } from "./memory-store";
import { __resetAgencyStore } from "./store";
import { InMemoryAuthStore } from "@/lib/auth/memory-store";
import { __resetAuthStore } from "@/lib/auth";
import { SESSION_MAX_AGE, signSession } from "@/lib/auth/session";

function bearer(token: string): NextRequest {
  return { headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? `Bearer ${token}` : null) } } as unknown as NextRequest;
}

let auth: InMemoryAuthStore;
let agency: InMemoryAgencyStore;
let ownerId: string;
let orgId: string;
let workspaceId: string;

beforeEach(async () => {
  h.cookie = undefined;
  auth = new InMemoryAuthStore();
  agency = new InMemoryAgencyStore();
  __resetAuthStore(auth);
  __resetAgencyStore(agency);
  const created = await auth.createUserWithOrg({ email: "owner@acme.test", name: "Owner", passwordHash: "h", orgName: "Acme", emailVerified: true });
  ownerId = created.user.id;
  orgId = created.org.id;
  await auth.setPlan(orgId, "agency");
  const ws = await agency.createWorkspace({ ownerOrgId: orgId, ownerUserId: ownerId, name: "Acme Agency", slug: "acme" });
  workspaceId = ws.id;
});

afterEach(() => {
  __resetAuthStore(undefined);
  __resetAgencyStore(undefined);
});

async function issueKey(scopes: string[]): Promise<string> {
  const raw = `out_agency_${Math.random().toString(36).slice(2)}${Date.now()}`;
  const secretHash = createHash("sha256").update(raw).digest("hex");
  await agency.createApiKey({ agencyId: workspaceId, name: "k", prefix: raw.slice(0, 18), secretHash, scopes, createdBy: ownerId });
  return raw;
}

describe("agencyAccess — API key path", () => {
  it("grants access for a scoped key on an agency-plan workspace", async () => {
    const raw = await issueKey(["clients:read"]);
    const access = await agencyAccess(bearer(raw), "clients:read", workspaceId);
    expect(access?.via).toBe("api_key");
    expect(access?.workspace.id).toBe(workspaceId);
  });

  it("rejects a key used against a different agency id", async () => {
    const raw = await issueKey(["clients:read"]);
    expect(await agencyAccess(bearer(raw), "clients:read", "some-other-agency")).toBeNull();
  });

  it("rejects a permission the key was not scoped for", async () => {
    const raw = await issueKey(["clients:read"]);
    expect(await agencyAccess(bearer(raw), "billing:manage", workspaceId)).toBeNull();
  });

  it("honors a wildcard scope but still enforces the agency plan", async () => {
    const raw = await issueKey(["*"]);
    expect(await agencyAccess(bearer(raw), "billing:manage", workspaceId)).not.toBeNull();
    await auth.setPlan(orgId, "free");
    expect(await agencyAccess(bearer(raw), "billing:manage", workspaceId)).toBeNull();
  });

  it("rejects an unknown/forged bearer token", async () => {
    expect(await agencyAccess(bearer("out_agency_forged"), "clients:read", workspaceId)).toBeNull();
  });
});

describe("agencyAccess — session path", () => {
  it("grants the owner all permissions on their workspace", async () => {
    h.cookie = signSession(ownerId, SESSION_MAX_AGE, 0);
    const access = await agencyAccess(null, "billing:manage");
    expect(access?.via).toBe("session");
    expect(access?.role).toBe("owner");
  });

  it("rejects an unverified email", async () => {
    const other = await auth.createUserWithOrg({ email: "new@acme.test", name: "New", passwordHash: "h", orgName: "New Co", emailVerified: false });
    h.cookie = signSession(other.user.id, SESSION_MAX_AGE, 0);
    expect(await agencyAccess(null, "agency:read")).toBeNull();
  });

  it("rejects a verified non-member of the requested agency", async () => {
    const outsider = await auth.createUserWithOrg({ email: "outsider@x.test", name: "Out", passwordHash: "h", orgName: "Outsider Co", emailVerified: true });
    h.cookie = signSession(outsider.user.id, SESSION_MAX_AGE, 0);
    expect(await agencyAccess(null, "clients:read", workspaceId)).toBeNull();
  });

  it("rejects when the owner org is no longer on the agency plan", async () => {
    await auth.setPlan(orgId, "free");
    h.cookie = signSession(ownerId, SESSION_MAX_AGE, 0);
    expect(await agencyAccess(null, "agency:read")).toBeNull();
  });

  it("rejects a missing/invalid session cookie", async () => {
    h.cookie = undefined;
    expect(await agencyAccess(null, "agency:read")).toBeNull();
  });
});
