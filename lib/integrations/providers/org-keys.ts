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
 * must never fail a scan, it only means the provider stays on the platform key.
 */

import { getConnectionSummary, getConnectionToken, type IntegrationProvider } from "@/lib/integrations/connections";
import { withProviderKeys } from "@/lib/integrations/credential-context";
import { operationalLog } from "@/lib/observability/log";
import { listProviders } from "./registry";
import { recordProviderUsage } from "./telemetry";

/** Load the organization's stored keys, mapped by the env var each one substitutes. */
export async function loadOrgProviderKeys(orgId: string | null | undefined): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  if (!orgId) return keys;

  for (const provider of listProviders()) {
    if (provider.commercialGate) continue;
    try {
      const token = await getConnectionToken(orgId, provider.id);
      if (!token) continue;
      // A pair credential backs more than one variable, so the provider decides
      // how its stored value maps onto the environment the scan reads.
      const expanded = provider.expandEnv ? provider.expandEnv(token) : { [provider.envKey]: token };
      for (const [name, value] of Object.entries(expanded)) {
        if (value) keys.set(name, value);
      }
    } catch (error) {
      // A single unreadable credential must not stop the scan or the other providers.
      operationalLog("warn", "integrations.org_key_unavailable", { orgId, provider: provider.id }, error);
    }
  }
  return keys;
}

/**
 * Run a scan with the organization's own provider credentials in scope. Falls
 * back to the platform environment for anything the organization has not
 * connected.
 */
export async function withOrgProviderKeys<T>(orgId: string | null | undefined, run: () => Promise<T>): Promise<T> {
  const keys = await loadOrgProviderKeys(orgId);
  if (keys.size === 0) return run();
  return withProviderKeys(keys, run, orgId ?? undefined);
}

/**
 * Attribute a completed scan's provider activity back to the organization's
 * credential. Only providers the organization has actually connected AND that
 * actually ran are metered, so the usage figure stays truthful.
 */
export async function recordScanProviderUsage(
  orgId: string | null | undefined,
  runs: { provider: string; status: string }[],
): Promise<void> {
  if (!orgId || runs.length === 0) return;

  const byLabel = new Map<string, IntegrationProvider>();
  for (const provider of listProviders()) byLabel.set(provider.runLabel, provider.id);

  for (const run of runs) {
    const providerId = byLabel.get(run.provider);
    if (!providerId) continue;
    try {
      // Only meter it when the key in play was the organization's own.
      if (!(await getConnectionSummary(orgId, providerId))) continue;
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
