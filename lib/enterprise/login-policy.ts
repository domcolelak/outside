import { getAuthStore, type AuthStore } from "@/lib/auth";
import { getEnterpriseStore } from "./store";
import type { EnterpriseStore } from "./store-model";
import type { EnterpriseIdentityProvider } from "./types";

export interface EnterpriseSsoRequirement {
  providerId: string;
  workspaceId: string;
  ssoUrl: string;
}

interface LoginPolicyDependencies {
  authStore?: AuthStore;
  enterpriseStore?: EnterpriseStore;
  breakGlassEmails?: string;
}

function normalizedEmails(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Resolves the enterprise SSO policy for an already authenticated identity.
 * Password and social-OAuth login must both call this before issuing a session.
 */
export async function enterpriseSsoRequirement(
  user: { id: string; email: string },
  dependencies: LoginPolicyDependencies = {},
): Promise<EnterpriseSsoRequirement | null> {
  const email = user.email.trim().toLowerCase();
  const breakGlass = normalizedEmails(
    dependencies.breakGlassEmails ?? process.env.ENTERPRISE_BREAK_GLASS_EMAILS ?? "",
  );
  if (breakGlass.has(email)) return null;

  const domain = email.split("@")[1];
  if (!domain) return null;

  const authStore = dependencies.authStore ?? await getAuthStore();
  const enterpriseStore = dependencies.enterpriseStore ?? await getEnterpriseStore();
  const memberships = await authStore.membershipsForUser(user.id);

  for (const membership of memberships) {
    const workspace = await enterpriseStore.workspaceByOrg(membership.org.id);
    if (!workspace) continue;
    const providers = await enterpriseStore.list<EnterpriseIdentityProvider>(
      workspace.id,
      "identityProviders",
    );
    const provider = providers.find(
      (candidate) => candidate.enabled
        && candidate.enforceSso
        && candidate.domains.some((candidateDomain) => candidateDomain.toLowerCase() === domain),
    );
    if (provider) {
      return {
        providerId: provider.id,
        workspaceId: workspace.id,
        ssoUrl: `/api/enterprise/sso?email=${encodeURIComponent(email)}`,
      };
    }
  }

  return null;
}
