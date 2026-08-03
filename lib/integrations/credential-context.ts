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
const store = new AsyncLocalStorage<Map<string, string>>();
const organizationStore = new AsyncLocalStorage<string>();

export function withProviderKeys<T>(keys: Map<string, string>, fn: () => T, orgId?: string): T {
  return store.run(keys, () => orgId ? organizationStore.run(orgId, fn) : fn());
}

/** The effective value of a provider env var: org-supplied first, then server env. */
export function providerKey(envName: string): string | undefined {
  const scoped = store.getStore()?.get(envName)?.trim();
  if (scoped) return scoped;
  const env = process.env[envName]?.trim();
  return env || undefined;
}

export function providerKeyIsOrgSupplied(envName: string): boolean {
  return store.getStore()?.has(envName) ?? false;
}

export function providerOrganizationId(): string | undefined {
  return organizationStore.getStore();
}
