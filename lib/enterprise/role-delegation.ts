import type { AuthStore } from "@/lib/auth";
import type { EnterpriseAccess } from "./access";
import type { EnterpriseStore } from "./store-model";
import type { EnterprisePermission, EnterpriseResourceKind, EnterpriseRole } from "./types";

const ENTERPRISE_OWNER_ROLE = "Enterprise Owner";

export class EnterpriseDelegationError extends Error {
  readonly status = 403;
}

function assertPermissionsDelegable(
  actorPermissions: ReadonlySet<EnterprisePermission>,
  delegatedPermissions: readonly EnterprisePermission[],
): void {
  const forbidden = delegatedPermissions.filter((permission) => !actorPermissions.has(permission));
  if (forbidden.length) {
    throw new EnterpriseDelegationError(
      `Role permissions exceed the actor's authority: ${forbidden.join(", ")}.`,
    );
  }
}

function actorIsOrganizationOwner(access: EnterpriseAccess): boolean {
  return access.actorType === "user"
    && access.session?.memberships.some(
      (membership) => membership.org.id === access.workspace.orgId
        && membership.role === "owner",
    ) === true;
}

/**
 * Prevents a roles administrator from using role creation, mutation, or
 * assignment to grant authority they do not already hold.
 *
 * The system Enterprise Owner role is stricter: only an interactive
 * organization owner may bind it, and only to another active organization
 * owner. Provisioning creates the initial owner binding outside this endpoint.
 */
export async function assertRoleDelegationAllowed(input: {
  kind: EnterpriseResourceKind;
  value: Record<string, unknown>;
  access: EnterpriseAccess;
  enterpriseStore: EnterpriseStore;
  authStore: Pick<AuthStore, "getMembership">;
}): Promise<void> {
  const { kind, value, access, enterpriseStore, authStore } = input;
  if (kind !== "roles" && kind !== "bindings") return;

  const role = kind === "roles"
    ? value as unknown as EnterpriseRole
    : await enterpriseStore.resource<EnterpriseRole>(
      access.workspace.id,
      "roles",
      typeof value.roleId === "string" ? value.roleId : "",
    );

  // Reference validation returns the public "missing role" error later.
  if (!role) return;

  assertPermissionsDelegable(access.permissions, role.permissions);

  if (kind !== "bindings" || !role.system || role.name !== ENTERPRISE_OWNER_ROLE) return;

  const principalType = value.principalType;
  const principalId = typeof value.principalId === "string" ? value.principalId : "";
  const targetMembership = principalType === "user" && principalId
    ? await authStore.getMembership(principalId, access.workspace.orgId)
    : null;

  if (!actorIsOrganizationOwner(access) || targetMembership?.role !== "owner") {
    throw new EnterpriseDelegationError(
      "The Enterprise Owner role can only be assigned by an organization owner to an active organization owner.",
    );
  }
}
