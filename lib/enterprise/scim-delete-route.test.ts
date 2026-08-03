import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE as deleteScimResource } from "@/app/api/enterprise/scim/v2/[resource]/[id]/route";
import { __resetAuthStore } from "@/lib/auth";
import { InMemoryAuthStore } from "@/lib/auth/memory-store";
import { secretHash } from "./crypto";
import { InMemoryEnterpriseStore } from "./memory-store";
import { __resetEnterpriseStore } from "./store";
import type { EnterpriseIdentityProvider, EnterpriseRole, EnterpriseRoleBinding } from "./types";

const audit = {
  actorType: "scim" as const,
  actorId: "test-idp",
  action: "test.scim.provision",
  resourceType: "directory_user",
  requestId: null,
  ipHash: null,
  detail: {},
};

afterEach(() => {
  __resetAuthStore();
  __resetEnterpriseStore();
});

describe("SCIM user deletion", () => {
  it("removes auth-user role bindings so reprovisioning cannot restore stale access", async () => {
    const auth = new InMemoryAuthStore();
    const store = new InMemoryEnterpriseStore();
    __resetAuthStore(auth);
    __resetEnterpriseStore(store);

    const workspace = await store.provision({ orgId: "org-scim-delete", ownerUserId: "owner" });
    const token = "out_scim_delete-regression";
    const provider = await store.create<EnterpriseIdentityProvider>(workspace.id, "identityProviders", {
      protocol: "oidc",
      name: "Directory",
      domains: ["example.test"],
      enabled: true,
      enforceSso: false,
      jitProvisioning: true,
      configEncrypted: "encrypted",
      scimTokenHash: secretHash(token),
      scimTokenPrefix: token.slice(0, 12),
      lastSyncAt: null,
    });
    const provision = () => store.provisionScimUserAtomic({
      workspaceId: workspace.id,
      orgId: workspace.orgId,
      providerId: provider.id,
      feature: "scim",
      email: "analyst@example.test",
      name: "Analyst",
      passwordHash: "hash",
      externalId: "oidc-subject-1",
      active: true,
    }, { ...audit, actorId: provider.id });

    const first = await provision();
    const viewerRole = (await store.list<EnterpriseRole>(workspace.id, "roles"))
      .find((role) => role.name === "Enterprise Viewer")!;
    await store.create<EnterpriseRoleBinding>(workspace.id, "bindings", {
      roleId: viewerRole.id,
      principalType: "user",
      principalId: first.userId!,
      scopeType: "organization",
      scopeId: null,
      conditions: {},
      createdBy: "owner",
    });

    const response = await deleteScimResource(
      new NextRequest(`https://outside.test/api/enterprise/scim/v2/Users/${first.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ resource: "Users", id: first.id }) },
    );
    expect(response.status).toBe(204);
    expect((await store.list<EnterpriseRoleBinding>(workspace.id, "bindings"))
      .filter((binding) => binding.principalType === "user" && binding.principalId === first.userId))
      .toHaveLength(0);

    const reprovisioned = await provision();
    expect(reprovisioned.userId).toBe(first.userId);
    expect((await store.list<EnterpriseRoleBinding>(workspace.id, "bindings"))
      .filter((binding) => binding.principalType === "user" && binding.principalId === reprovisioned.userId))
      .toHaveLength(0);
  });
});
