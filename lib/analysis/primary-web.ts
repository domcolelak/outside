import type { Asset } from "@/lib/types";

export type PrimaryWebBasis = "target" | "www" | "fallback";

export interface PrimaryWebSelection {
  asset: Asset;
  basis: PrimaryWebBasis;
}

const WEB_KINDS = new Set<Asset["kind"]>([
  "root_domain",
  "web_service",
  "auth_surface",
  "api_surface",
  "host",
  "subdomain",
]);

function canonicalHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/, 1)[0]!
    .replace(/\.$/, "");
}

function fallbackRank(asset: Asset): number {
  if (asset.kind === "root_domain") return 0;
  if (asset.kind === "web_service") return 1;
  if (asset.kind === "host" || asset.kind === "subdomain") return 2;
  return 3;
}

/**
 * Select the surface that may supply a customer-facing web claim.
 *
 * The scan target wins only when it actually has the required observation,
 * followed by its conventional www host. A deterministic fallback is allowed,
 * but callers must name that host explicitly rather than calling it the primary
 * site. This prevents array/provider ordering from changing score semantics.
 */
export function selectPrimaryWebSurface(
  assets: Asset[],
  target: string,
  eligible: (asset: Asset) => boolean,
): PrimaryWebSelection | null {
  const requested = canonicalHost(target);
  const exact = assets.find(
    (asset) => canonicalHost(asset.canonical) === requested && eligible(asset),
  );
  if (exact) return { asset: exact, basis: "target" };

  const www = requested.startsWith("www.") ? requested : `www.${requested}`;
  const conventional = assets.find(
    (asset) => canonicalHost(asset.canonical) === www && eligible(asset),
  );
  if (conventional) return { asset: conventional, basis: "www" };

  const fallback = assets
    .filter((asset) => WEB_KINDS.has(asset.kind) && eligible(asset))
    .sort(
      (a, b) =>
        fallbackRank(a) - fallbackRank(b) ||
        a.canonical.localeCompare(b.canonical),
    )[0];
  return fallback ? { asset: fallback, basis: "fallback" } : null;
}

export function hasVerifiedHttpObservation(asset: Asset): boolean {
  return asset.attrs.https === "observed";
}

export function hasSecurityHeaderObservation(asset: Asset): boolean {
  return (
    hasVerifiedHttpObservation(asset) &&
    Array.isArray(asset.attrs.missingHeaders)
  );
}

export function hasCertificateObservation(asset: Asset): boolean {
  return typeof asset.attrs.certDaysToExpiry === "number";
}
