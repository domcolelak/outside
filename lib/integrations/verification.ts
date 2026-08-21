/**
 * Post-change verification of an applied remediation, observed the way the
 * public internet sees it.
 *
 * The apply path already confirms the write through the provider's own API, but
 * that only proves the provider stored the record. It cannot prove the record is
 * served to the internet: a zone can be inactive, delegation can point somewhere
 * else, or the change may simply not have propagated yet. Only a public lookup
 * answers the question the customer actually has — "is it true from outside?" —
 * so this check is deliberately independent of the provider that made the change.
 */

import { resolveTxt } from "@/lib/discovery/providers";
import { registrableDomain } from "@/lib/security/target";

export type RemediationCheckStatus = "passed" | "not_observed" | "mismatch";

export interface RemediationCheck {
  status: RemediationCheckStatus;
  /** The DMARC policy actually served, when one was seen. */
  observed: string | null;
  checkedAt: string;
}

/** TXT answers arrive quoted, and long ones are served as adjacent chunks. */
function normalizeTxt(record: string): string {
  return record
    .replace(/"\s+"/g, "")
    .replace(/^"|"$/g, "")
    .trim();
}

/** Spacing and case carry no meaning in a DMARC policy; the tag values do. */
function canonical(policy: string): string {
  return policy
    .toLowerCase()
    .replace(/\s*;\s*/g, ";")
    .replace(/;+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Look up the DMARC policy served for a domain and compare it with what was
 * applied. A lookup failure returns "not_observed" rather than throwing: the
 * point of this check is that "we could not see it" never becomes "it is there".
 */
export async function verifyDmarcRemediation(target: string, expected: string, signal?: AbortSignal): Promise<RemediationCheck> {
  const name = `_dmarc.${registrableDomain(target)}`;
  const checkedAt = new Date().toISOString();

  const records = await resolveTxt(name, signal).catch((error) => {
    if (signal?.aborted) throw error;
    return [] as string[];
  });

  const policies = records.map(normalizeTxt).filter((record) => record.toLowerCase().startsWith("v=dmarc1"));
  if (policies.length === 0) return { status: "not_observed", observed: null, checkedAt };

  const match = policies.find((policy) => canonical(policy) === canonical(expected));
  if (match) return { status: "passed", observed: match, checkedAt };

  // Something else is answering for this name — a pre-existing policy, or an
  // edit made outside OUTSIDE. Report what is actually served, not what we hoped.
  return { status: "mismatch", observed: policies[0] ?? null, checkedAt };
}
