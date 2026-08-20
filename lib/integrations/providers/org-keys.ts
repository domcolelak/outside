/**
 * Bridges stored organization credentials into a running scan.
 *
 * The scan pipeline reads every provider key through providerKey(envKey). This
 * module loads an organization's stored credentials and runs the scan inside an
 * AsyncLocalStorage context so those keys transparently take precedence over the
 * platform environment — the customer's own key is used for their own scan, and
 * a scan with no organization (an anonymous snapshot) simply falls back to the
 * platform configuration.
 *
 * Everything here is best-effort: a credential that cannot be loaded or decrypted
 * must never fail a scan. A broken connected credential is explicitly blocked,
 * though, so it can never fall through to the platform key or be billed as BYOK.
 */

import { getConnectionToken, listConnectedProviderIds, type IntegrationProvider } from "@/lib/integrations/connections";
import { withProviderKeys, type ProviderCredentialValue } from "@/lib/integrations/credential-context";
import { operationalLog } from "@/lib/observability/log";
import { recordIntegrationCredentialLoadFailure } from "@/lib/observability/metrics";
import { listProviders } from "./registry";
import { recordProviderUsage } from "./telemetry";
import type { ProviderDefinition } from "./types";

export interface OrgProviderKeyScope {
  /** Only credentials successfully decrypted and placed in this request. */
  providerIds: ReadonlySet<IntegrationProvider>;
}

interface OrgProviderContext extends OrgProviderKeyScope {
  keys: Map<string, ProviderCredentialValue>;
}

function envKeys(provider: ProviderDefinition): string[] {
  return provider.envKeys ?? [provider.envKey];
}

function blockProvider(keys: Map<string, ProviderCredentialValue>, provider: ProviderDefinition): void {
  for (const name of envKeys(provider)) keys.set(name, null);
}

async function loadOrgProviderContext(orgId: string | null | undefined): Promise<OrgProviderContext> {
  const keys = new Map<string, ProviderCredentialValue>();
  const providerIds = new Set<IntegrationProvider>();
  if (!orgId) return { keys, providerIds };

  const providers = listProviders().filter((provider) => !provider.commercialGate);
  let connected: Set<string>;
  try {
    connected = new Set(await listConnectedProviderIds(orgId));
  } catch (error) {
    // If connection storage cannot be read, fail closed for every optional
    // provider. Using platform credentials here could expose or misattribute a
    // customer's verified scan without us knowing which key was actually used.
    for (const provider of providers) blockProvider(keys, provider);
    recordIntegrationCredentialLoadFailure("index");
    operationalLog("warn", "integrations.org_key_index_unavailable", { orgId }, error);
    return { keys, providerIds };
  }

  for (const provider of providers) {
    if (!connected.has(provider.id)) continue;
    try {
      const token = await getConnectionToken(orgId, provider.id);
      if (!token) {
        blockProvider(keys, provider);
        continue;
      }
      const expanded = provider.expandEnv ? provider.expandEnv(token) : { [provider.envKey]: token };
      const values = Object.entries(expanded).filter(([, value]) => value?.trim());
      if (values.length === 0) {
        blockProvider(keys, provider);
        continue;
      }
      for (const [name, value] of values) keys.set(name, value);
      providerIds.add(provider.id);
    } catch (error) {
      blockProvider(keys, provider);
      recordIntegrationCredentialLoadFailure("credential", provider.id);
      operationalLog("warn", "integrations.org_key_unavailable", { orgId, provider: provider.id }, error);
    }
  }
  return { keys, providerIds };
}

/** Load the organization's stored keys, mapped by the env var each one substitutes. */
export async function loadOrgProviderKeys(orgId: string | null | undefined): Promise<Map<string, ProviderCredentialValue>> {
  return (await loadOrgProviderContext(orgId)).keys;
}

/**
 * Run a scan with the organization's own provider credentials in scope. Falls
 * back to the platform environment for anything the organization has not
 * connected.
 */
export async function withOrgProviderKeys<T>(
  orgId: string | null | undefined,
  run: (scope: OrgProviderKeyScope) => Promise<T>,
): Promise<T> {
  const context = await loadOrgProviderContext(orgId);
  const scope = { providerIds: context.providerIds };
  if (context.keys.size === 0) return run(scope);
  return withProviderKeys(context.keys, () => run(scope), orgId ?? undefined);
}

/**
 * Attribute a completed scan's provider activity back to the organization's
 * credential. Only providers the organization has actually connected AND that
 * actually ran are metered, so the usage figure stays truthful.
 */
export async function recordScanProviderUsage(
  orgId: string | null | undefined,
  runs: { provider: string; status: string }[],
  providerIds: ReadonlySet<IntegrationProvider>,
): Promise<void> {
  if (!orgId || runs.length === 0) return;

  const byLabel = new Map<string, IntegrationProvider>();
  for (const provider of listProviders()) byLabel.set(provider.runLabel, provider.id);

  for (const run of runs) {
    const providerId = byLabel.get(run.provider);
    if (!providerId) continue;
    try {
      // Only meter a key that was successfully decrypted into this exact scan.
      if (!providerIds.has(providerId)) continue;
      await recordProviderUsage({
        orgId,
        provider: providerId,
        operation: "search",
        ok: run.status === "ok",
        errorCode: run.status === "ok" ? undefined : "unavailable",
      });
    } catch {
      // Telemetry must never affect the scan result.
    }
  }
}
