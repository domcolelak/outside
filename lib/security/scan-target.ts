import { createHash } from "node:crypto";
import { normalizeDomain } from "./target";

export interface CanonicalScanTarget {
  target: string;
  budgetKey: string;
}

/**
 * Canonicalize before deriving either the rate-limit or concurrency identity.
 * URL-like aliases must consume the same target budget as the bare domain.
 */
export function canonicalScanTarget(rawTarget: string, demoDomain?: string | null): CanonicalScanTarget {
  const target = demoDomain ? demoDomain.trim().toLowerCase() : normalizeDomain(rawTarget);
  const identity = demoDomain ? `demo:${target}` : target;
  return {
    target,
    budgetKey: createHash("sha256").update(identity).digest("hex").slice(0, 24),
  };
}
