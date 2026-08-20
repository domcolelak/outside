/**
 * Attribute discovered assets to accounts the customer owns.
 *
 * OUTSIDE finds hostnames from the outside, with no idea who runs them. A
 * customer connecting a hosting or cloud account lets the scan answer the
 * question that actually matters operationally: *is this ours, and where does it
 * live?*
 *
 * The valuable half is the inverse. An asset that matches nothing across every
 * connected account is a shadow-asset candidate — infrastructure that is
 * publicly reachable and belongs to no inventory anyone is looking after.
 *
 * Strictly read-only, and strictly explanatory: attribution never introduces an
 * asset, it only annotates one discovery already found. A provider failure is
 * captured in its ProviderRun and never fails the scan.
 */

import type { Asset, ProviderRun } from "@/lib/types";
import { providerKey } from "@/lib/integrations/credential-context";
import { listProviders } from "@/lib/integrations/providers/registry";
import type { ProviderDefinition } from "@/lib/integrations/providers/types";
import { joinCredentialParts } from "@/lib/integrations/pair-credential";

/** True when the hostname is the owned domain itself or sits beneath it. */
export function matchesOwnedDomain(canonical: string, owned: string): boolean {
  const host = canonical.trim().toLowerCase();
  const domain = owned.trim().toLowerCase();
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

/** Rebuild the stored provider credential from the variables in scan scope. */
export function providerRuntimeCredential(provider: ProviderDefinition): string | undefined {
  const values = (provider.envKeys ?? [provider.envKey]).map((name) => providerKey(name));
  if (values.some((value) => !value)) return undefined;
  const present = values as string[];
  return present.length === 1 ? present[0] : joinCredentialParts(...present);
}

/** Any provider that can attribute, has a complete key in scope, and is not gated. */
function attributingProviders() {
  return listProviders().filter((provider) => provider.ownedDomains && !provider.commercialGate && providerRuntimeCredential(provider));
}

/** True when at least one connected account can attribute assets. */
export function ownershipAttributionEnabled(): boolean {
  return attributingProviders().length > 0;
}

/**
 * Annotate assets in place with the account that owns them. Returns a
 * ProviderRun per attempted provider so a partial attribution is visible rather
 * than silently making unowned assets look like shadow candidates.
 */
export async function attributeAssetOwnership(assets: Asset[], options: { signal?: AbortSignal } = {}): Promise<ProviderRun[]> {
  const runs: ProviderRun[] = [];

  for (const provider of attributingProviders()) {
    const startedAt = new Date().toISOString();
    const key = providerRuntimeCredential(provider)!;
    try {
      const owned = await provider.ownedDomains!(key, options.signal);
      if (!owned.ok) {
        runs.push({ provider: provider.runLabel, method: "ownership_attribution", status: "error", startedAt, finishedAt: new Date().toISOString(), observations: 0, errors: [owned.message] });
        continue;
      }

      let attributed = 0;
      for (const asset of assets) {
        // Longest match wins: a hostname under both example.com and
        // app.example.com belongs to the more specific account entry.
        const match = owned.domains
          .filter((domain) => matchesOwnedDomain(asset.canonical, domain))
          .sort((a, b) => b.length - a.length)[0];
        if (!match) continue;
        // First provider to claim an asset keeps it, so the annotation stays
        // stable rather than depending on registry iteration order.
        if (typeof asset.attrs.ownedBy === "string") continue;
        asset.attrs.ownedBy = provider.name;
        asset.attrs.ownedByDomain = match;
        attributed += 1;
      }

      runs.push({ provider: provider.runLabel, method: "ownership_attribution", status: "ok", startedAt, finishedAt: new Date().toISOString(), observations: attributed, errors: [] });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      runs.push({ provider: provider.runLabel, method: "ownership_attribution", status: "error", startedAt, finishedAt: new Date().toISOString(), observations: 0, errors: [(error as Error).message] });
    }
  }

  return runs;
}
