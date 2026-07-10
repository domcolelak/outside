/**
 * Aegis — the intelligence & protection layer of OUTSIDE.
 *
 * OUTSIDE discovers and scores an external surface (observations → findings →
 * exposure score). Aegis is the layer on top: it turns those findings into
 * *recommendations* (what to do, why, with evidence) and quantifies each against
 * the deterministic exposure score, so "Improve" is honest — resolving a
 * recommendation restores exactly the score penalty it neutralizes.
 *
 * Product journey: Discover → Understand → Monitor (Guardian) → Protect (Aegis)
 * → Improve. Aegis never fabricates: every recommendation cites the same
 * evidence the finding rests on, and remediation is always preview → approve →
 * apply → verify → rollback, defaulting to guided (human-applied) steps.
 */

import type { Evidence, Priority } from "@/lib/types";

export type RecommendationCategory =
  | "mail_security"
  | "security_headers"
  | "certificate_lifecycle"
  | "non_production_exposure"
  | "shadow_asset"
  | "auth_surface"
  | "api_surface"
  | "third_party"
  | "surface_change";

export type RecommendationStatus = "open" | "acknowledged" | "in_progress" | "resolved" | "dismissed";

/** How a remediation would be applied. Guided is always available and safe. */
export type RemediationMode = "guided" | "connector";

export interface RemediationStep {
  instruction: string;
  detail?: string;
}

export type ProposalFormat = "dns_records" | "http_headers" | "text";

export interface ProposedDnsRecord {
  name: string;
  type: string;
  value: string;
}

export interface ProposedHeader {
  name: string;
  value: string;
}

/**
 * A concrete, deterministically-validated remediation artifact — the OUTSIDE
 * analog of Aegis AI's PatchProposal. It states the exact change to apply,
 * validated to stay in-scope of the target, and is NEVER auto-applied.
 */
export interface ChangeProposal {
  format: ProposalFormat;
  summary: string;
  dnsRecords?: ProposedDnsRecord[];
  headers?: ProposedHeader[];
  text?: string;
  /** Hostnames the change touches (declared; validation checks coverage + scope). */
  affects: string[];
  /** Always false — proposals are reviewed and applied by a human. */
  autoApply: false;
  validation: { ok: boolean; issues: string[] };
}

export interface Remediation {
  summary: string;
  mode: RemediationMode;
  steps: RemediationStep[];
  /** A connector that could apply this change once connected (e.g. "cloudflare"). */
  connector?: string;
  /** What a safe rollback looks like. */
  rollback?: string;
  /** Whether applying this touches live infrastructure (always requires approval). */
  changesInfrastructure: boolean;
  /** A concrete, validated change artifact (never auto-applied), when one exists. */
  proposal?: ChangeProposal;
}

export interface Recommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  priority: Priority;
  confidence: number; // 0..1
  /** Why this recommendation exists (rationale). */
  why: string;
  evidence: Evidence[];
  /** Plain-English business impact of the underlying exposure. */
  businessImpact: string;
  assetIds: string[];
  /** The exposure-score component this addresses, if any (e.g. "mail"). */
  scoreComponentCode?: string;
  /** Points restored to the exposure score if resolved — derived from the score model. */
  estimatedReduction: number;
  remediation: Remediation;
  status: RecommendationStatus;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  target: string | null;
  actor: string | null;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface Posture {
  currentScore: number;
  /** Exposure score if all open recommendations were resolved. */
  potentialScore: number;
  recommendations: Recommendation[];
  summary: string;
  /** Count of open items by priority for quick display. */
  openByPriority: Record<Priority, number>;
}
