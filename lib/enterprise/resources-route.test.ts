import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EnterpriseAccess } from "./access";
import type { EnterpriseRole, EnterpriseWorkspace } from "./types";

const h = vi.hoisted(() => ({
  enterpriseAccess: vi.fn(),
  getEnterpriseStore: vi.fn(),
  getAuthStore: vi.fn(),
  requireBudgets: vi.fn(),
}));

vi.mock("@/lib/enterprise/access", () => ({
  enterpriseAccess: h.enterpriseAccess,
}));
vi.mock("@/lib/enterprise/store", () => ({
  getEnterpriseStore: h.getEnterpriseStore,
}));
vi.mock("@/lib/auth", () => ({
  getAuthStore: h.getAuthStore,
}));
vi.mock("@/lib/security/ratelimit", () => ({
  clientIdentity: () => "test-client",
  requireBudgets: h.requireBudgets,
}));

import { POST } from "@/app/api/enterprise/resources/[kind]/route";

const workspace: EnterpriseWorkspace = {
  id: "workspace-1",
  orgId: "org-1",
  licenseStatus: "active",
  licensedSeats: 25,
  features: ["advanced_rbac"],
  dataRegion: "eu",
  retention: {},
  provisioningMode: "manual",
  expiresAt: null,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

function tokenAccess(): EnterpriseAccess {
  return {
    workspace,
    actorId: "api-token:role-manager",
    actorType: "api_token",
    permissions: new Set(["roles:manage"]),
    session: null,
    token: null,
  };
}

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/enterprise/resources/roles?orgId=org-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.enterpriseAccess.mockReset();
  h.getEnterpriseStore.mockReset();
  h.getAuthStore.mockReset();
  h.requireBudgets.mockReset();
  h.enterpriseAccess.mockResolvedValue(tokenAccess());
  h.requireBudgets.mockResolvedValue({ ok: true, retryAfter: 0 });
  h.getAuthStore.mockResolvedValue({ getMembership: vi.fn() });
});

describe("enterprise resources route delegation guard", () => {
  it("returns 403 instead of creating a role with permissions the actor lacks", async () => {
    const createAudited = vi.fn();
    h.getEnterpriseStore.mockResolvedValue({ createAudited });

    const response = await POST(request({
      name: "Escalated role",
      permissions: ["roles:manage", "identity:manage"],
    }), { params: Promise.resolve({ kind: "roles" }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("identity:manage"),
    });
    expect(createAudited).not.toHaveBeenCalled();
  });

  it("returns 403 instead of assigning an existing privileged role", async () => {
    const role = {
      id: "role-1",
      workspaceId: workspace.id,
      name: "Identity manager",
      description: null,
      permissions: ["roles:manage", "identity:manage"],
      system: false,
    } satisfies EnterpriseRole;
    const createAudited = vi.fn();
    h.getEnterpriseStore.mockResolvedValue({
      resource: vi.fn().mockResolvedValue(role),
      createAudited,
    });

    const response = await POST(request({
      roleId: role.id,
      principalType: "user",
      principalId: "target-user",
      scopeType: "organization",
    }), { params: Promise.resolve({ kind: "bindings" }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("identity:manage"),
    });
    expect(createAudited).not.toHaveBeenCalled();
  });
});
