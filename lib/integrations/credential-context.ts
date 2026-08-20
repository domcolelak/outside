import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request provider credentials.
 *
 * Provider keys used to come only from the server environment. Customers can now
 * supply their own key for each provider (see the provider registry + the account
 * "API keys" settings), so a scan must use the key of the organization it runs
 * for. Threading a credential map through the whole discovery/intel pipeline would
 * be invasive; instead the scan runs inside an AsyncLocalStorage context and every
 * provider reads its key through providerKey(), which prefers the request's
 * org-supplied value and falls back to the server environment.
 *
 * The map is keyed by ENV VAR NAME (e.g. "HIBP_API_KEY") so migrating a provider
 * is just `process.env.X` → `providerKey("X")`.
 */
export type ProviderCredentialValue = string | null;

const store = new AsyncLocalStorage<Map<string, ProviderCredentialValue>>();
const organizationStore = new AsyncLocalStorage<string>();

export function withProviderKeys<T>(keys: Map<string, ProviderCredentialValue>, fn: () => T, orgId?: string): T {
  return store.run(keys, () => orgId ? organizationStore.run(orgId, fn) : fn());
}

/** The effective value of a provider env var: org-supplied first, then server env. */
export function providerKey(envName: string): string | undefined {
  const scopedStore = store.getStore();
  if (scopedStore?.has(envName)) {
    // A null entry is an explicit fail-closed marker: the organization has a
    // connection for this provider, but its credential could not be opened.
    // Never substitute the platform credential in that situation.
    const scoped = scopedStore.get(envName)?.trim();
    return scoped || undefined;
  }
  const env = process.env[envName]?.trim();
  return env || undefined;
}

export function providerKeyIsOrgSupplied(envName: string): boolean {
  const value = store.getStore()?.get(envName);
  return typeof value === "string" && value.trim().length > 0;
}

export function providerOrganizationId(): string | undefined {
  return organizationStore.getStore();
}
