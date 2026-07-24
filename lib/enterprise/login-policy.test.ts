import { describe, expect, it } from "vitest";
import { InMemoryAuthStore } from "@/lib/auth/memory-store";
import { InMemoryEnterpriseStore } from "./memory-store";
import { enterpriseSsoRequirement } from "./login-policy";
import type { EnterpriseIdentityProvider } from "./types";

async function setupProvider(input: { enabled: boolean; enforceSso: boolean }) {
  const authStore = new InMemoryAuthStore();
  const enterpriseStore = new InMemoryEnterpriseStore();
  const { user, org } = await authStore.createUserWithOrg({
    email: "person@corp.test",
    name: "Person",
    passwordHash: "unused",
    orgName: "Corp",
    emailVerified: true,
  });
  const workspace = await enterpriseStore.provision({
    orgId: org.id,
    ownerUserId: user.id,
  });
  const provider = await enterpriseStore.create<EnterpriseIdentityProvider>(
    workspace.id,
    "identityProviders",
    {
      protocol: "oidc",
      name: "Corporate identity",
      domains: ["corp.test"],
      enabled: input.enabled,
      enforceSso: input.enforceSso,
      jitProvisioning: true,
      configEncrypted: "not-needed-in-policy-test",
      scimTokenHash: null,
      scimTokenPrefix: null,
      lastSyncAt: null,
    },
  );
  return { authStore, enterpriseStore, user, provider, workspace };
}

describe("enterprise login SSO policy", () => {
  it("requires the configured enterprise flow before any app session is issued", async () => {
    const { authStore, enterpriseStore, user, provider, workspace } = await setupProvider({
      enabled: true,
      enforceSso: true,
    });

    await expect(enterpriseSsoRequirement(user, {
      authStore,
      enterpriseStore,
      breakGlassEmails: "",
    })).resolves.toEqual({
      providerId: provider.id,
      workspaceId: workspace.id,
      ssoUrl: "/api/enterprise/sso?email=person%40corp.test",
    });
  });

  it("does not enforce disabled or non-enforcing providers", async () => {
    for (const policy of [
      { enabled: false, enforceSso: true },
      { enabled: true, enforceSso: false },
    ]) {
      const { authStore, enterpriseStore, user } = await setupProvider(policy);
      await expect(enterpriseSsoRequirement(user, {
        authStore,
        enterpriseStore,
        breakGlassEmails: "",
      })).resolves.toBeNull();
    }
  });

  it("preserves the explicit break-glass exception for password and OAuth login", async () => {
    const { authStore, enterpriseStore, user } = await setupProvider({
      enabled: true,
      enforceSso: true,
    });

    await expect(enterpriseSsoRequirement(user, {
      authStore,
      enterpriseStore,
      breakGlassEmails: " OTHER@EXAMPLE.TEST, Person@Corp.Test ",
    })).resolves.toBeNull();
  });
});
