/**
 * Evolution — draft change preparation (the last safe-autonomy step). When the
 * founder approves a coverage-gap proposal, Evolution prepares the *reviewable
 * code change* that would close it: a curated KNOWN_VULNERABILITIES entry stub
 * for lib/analysis/vulnerabilities.ts.
 *
 * This is the hard line the product never crosses: Evolution PREPARES a draft as
 * text for a human to review and open a pull request. It does NOT write files,
 * commit, push, open PRs, merge, or deploy. Anything it cannot know from evidence
 * (the affected version range, the CVSS score, a precise title) is left as an
 * explicit TODO for human verification — never guessed.
 */

import type { KevRecord } from "@/lib/analysis/kev";

export interface DraftChange {
  proposalId: string;
  /** The file a human would edit. */
  file: string;
  /** Draft TypeScript for a KnownVulnerability entry — for review, not execution. */
  entry: string;
  /** Fields Evolution deliberately left blank because they need human verification. */
  requiresHumanInput: string[];
  /** The safety contract, restated on every draft. */
  note: string;
}

function tsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}

/**
 * Build the draft KNOWN_VULNERABILITIES entry for an approved proposal. Pure and
 * deterministic — no I/O, no side effects. The result is a string for a human to
 * paste after review; it is never applied automatically.
 */
export function prepareDraft(input: { proposalId: string; cveId: string; product: string; kev?: KevRecord }): DraftChange {
  const { proposalId, cveId, product, kev } = input;
  const title = kev ? `${kev.vendor} ${kev.product} — ${cveId}` : `${cveId} (${product})`;
  const summary = kev?.shortDescription
    ? tsString(kev.shortDescription)
    : `${cveId} is listed in the CISA KEV catalogue as exploited in the wild and affects ${product}.`;
  const recommendation = `Upgrade ${product} to a fixed release. Confirm the affected version range before relying on this correlation.`;

  const entry = [
    "  {",
    `    product: "${tsString(product)}",`,
    `    ref: "${tsString(cveId)}",`,
    `    title: "${tsString(title)}",`,
    "    cvss: 0, // TODO(human): set the CVSS v3 base score (0..10)",
    "    kev: true, // present in CISA KEV at draft time",
    "    range: {}, // TODO(human): REQUIRED — affected version bounds, e.g. { lt: \"8.3.8\" }. An empty range matches every version; do not merge until filled.",
    `    summary: "${summary}",`,
    `    recommendation: "${tsString(recommendation)}",`,
    "  },",
  ].join("\n");

  return {
    proposalId,
    file: "lib/analysis/vulnerabilities.ts",
    entry,
    requiresHumanInput: [
      "range — the affected version bounds (required; an empty range would match every version)",
      "cvss — the CVSS v3 base score",
      "title & summary — confirm against the authoritative advisory",
    ],
    note: "Draft only. Review it, fill in the TODOs, and open a pull request yourself. Evolution never writes files, commits, opens PRs, merges, or deploys.",
  };
}
