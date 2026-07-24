import { describe, expect, it } from "vitest";
import type { AuthStore, SessionContext } from "@/lib/auth";
import type { EnterpriseAccess } from "./access";
import { InMemoryEnterpriseStore } from "./memory-store";
import {
  assertRoleDelegationAllowed,
  EnterpriseDelegationError,
} from "./role-delegation";
import type { EnterprisePermission, EnterpriseRole, EnterpriseWorkspace } from "./types";

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

function access(
  permissions: EnterprisePermission[],
  membershipRole: "owner" | "admin" = "admin",
): EnterpriseAccess {
  const session = {
    user: {
      id: "actor",
      email: "actor@example.test",
      name: "Actor",
      emailVerifiedAt: "2026-07-23T00:00:00.000Z",
      sessionVersion: 0,
      createdAt: "2026-07-23T00:00:00.000Z",
    },
    memberships: [{
      org: {
        id: workspace.orgId,
        name: "Corp",
        slug: "corp",
        plan: "professional",
        createdAt: "2026-07-23T00:00:00.000Z",
      },
      role: membershipRole,
      notifyChanges: true,
    }],
  } satisfies SessionContext;

  return {
    workspace,
    actorId: session.user.id,
    actorType: "user",
    permissions: new Set(permissions),
    session,
    token: null,
  };
}

const authStore = (targetRole: "owner" | "admin" | null): Pick<AuthStore, "getMembership"> => ({
  getMembership: async () => targetRole ? {
    userId: "target",
    orgId: workspace.orgId,
    role: targetRole,
    notifyChanges: true,
    active: true,
    provisionedBy: null,
  } : null,
});

describe("enterprise role delegation", () => {
  it("rejects role creation or updates containing permissions the actor lacks", async () => {
    const enterpriseStore = new InMemoryEnterpriseStore();
    await expect(assertRoleDelegationAllowed({
      kind: "roles",
      value: {
        name: "Escalated role",
        permissions: ["roles:manage", "identity:manage"],
        system: false,
      },
      access: access(["roles:manage"]),
      enterpriseStore,
      authStore: authStore(null),
    })).rejects.toBeInstanceOf(EnterpriseDelegationError);
  });

  it("rejects assignment of an existing role that exceeds the actor's authority", async () => {
    const enterpriseStore = new InMemoryEnterpriseStore();
    const provisioned = await enterpriseStore.provision({
      orgId: workspace.orgId,
      ownerUserId: "owner",
    });
    const role = await enterpriseStore.create<EnterpriseRole>(provisioned.id, "roles", {
      name: "Identity manager",
      description: null,
      permissions: ["roles:manage", "identity:manage"],
      system: false,
    });
    const actor = access(["roles:manage"]);
    actor.workspace = provisioned;

    await expect(assertRoleDelegationAllowed({
      kind: "bindings",
      value: {
        roleId: role.id,
        principalType: "user",
        principalId: "target",
      },
      access: actor,
      enterpriseStore,
      authStore: authStore("admin"),
    })).rejects.toThrow(/identity:manage/);
  });

  it("allows a role whose permissions are a subset of the actor's permissions", async () => {
    const enterpriseStore = new InMemoryEnterpriseStore();
    await expect(assertRoleDelegationAllowed({
      kind: "roles",
      value: {
        name: "Role manager",
        permissions: ["enterprise:read", "roles:manage"],
        system: false,
      },
      access: access(["enterprise:read", "roles:manage"]),
      enterpriseStore,
      authStore: authStore(null),
    })).resolves.toBeUndefined();
  });

  it("reserves the system Enterprise Owner binding for organization owners", async () => {
    const enterpriseStore = new InMemoryEnterpriseStore();
    const provisioned = await enterpriseStore.provision({
      orgId: workspace.orgId,
      ownerUserId: "owner",
    });
    const ownerRole = (await enterpriseStore.list<EnterpriseRole>(provisioned.id, "roles"))
      .find((role) => role.name === "Enterprise Owner")!;
    const allPermissions = ownerRole.permissions;
    const actor = access(allPermissions, "admin");
    actor.workspace = provisioned;

    await expect(assertRoleDelegationAllowed({
      kind: "bindings",
      value: {
        roleId: ownerRole.id,
        principalType: "user",
        principalId: "target",
      },
      access: actor,
      enterpriseStore,
      authStore: authStore("owner"),
    })).rejects.toThrow(/only be assigned by an organization owner/);

    actor.session!.memberships[0]!.role = "owner";
    await expect(assertRoleDelegationAllowed({
      kind: "bindings",
      value: {
        roleId: ownerRole.id,
        principalType: "user",
        principalId: "target",
      },
      access: actor,
      enterpriseStore,
      authStore: authStore("admin"),
    })).rejects.toThrow(/active organization owner/);

    await expect(assertRoleDelegationAllowed({
      kind: "bindings",
      value: {
        roleId: ownerRole.id,
        principalType: "user",
        principalId: "target",
      },
      access: actor,
      enterpriseStore,
      authStore: authStore("owner"),
    })).resolves.toBeUndefined();
  });
});
