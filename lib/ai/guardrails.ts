/**
 * Deterministic enforcement of the Aegis Constitution on model output.
 *
 * Prompts alone are advisory — a model can ignore them. These guardrails are
 * the hard boundary: model output is scanned for constitutional violations
 * against the exact evidence the model was allowed to use, and any violation
 * makes the caller discard the output and fall back to the deterministic
 * template. The checks are intentionally conservative (clear violations only)
 * so they never suppress a legitimate, evidence-grounded explanation.
 */

const CVE = /CVE-\d{4}-\d{4,}/gi;

// Asserting the TARGET is in a confirmed-bad state (never allowed from external evidence).
const CONFIRMED_STATE = /\b(?:is|are|was|were|been)\s+(?:confirmed(?:ly)?\s+)?(?:vulnerable|exploited|compromised|breached)\b/i;
const CONFIRMED_EVENT = /\b(?:successfully\s+exploited|we\s+(?:exploited|compromised|breached)|confirmed\s+(?:exploitation|compromise|breach|vulnerability)|(?:exploitation|the\s+breach)\s+(?:was\s+|has\s+been\s+)?confirmed)\b/i;

// Asserting compliance/certification (only an auditor can).
const COMPLIANCE_CLAIM = /\b(?:is|are)\s+(?:fully\s+)?(?:compliant|certified)\b|\b(?:soc\s?2|iso\s?27001|pci(?:\s?dss)?|nis2|dora|gdpr)[\s-]+(?:compliant|certified)\b|\bachieved\s+(?:compliance|certification)\b/i;

/** Returns the list of constitutional violations in `output`; empty means clean. */
export function findConstitutionViolations(output: string, allowedEvidence: string): string[] {
  const violations: string[] = [];

  if (CONFIRMED_STATE.test(output) || CONFIRMED_EVENT.test(output)) {
    violations.push("unsupported confirmed-vulnerability or exploitation claim");
  }
  if (COMPLIANCE_CLAIM.test(output)) {
    violations.push("unsupported compliance or certification claim");
  }

  const allowed = new Set((allowedEvidence.match(CVE) ?? []).map((value) => value.toUpperCase()));
  for (const cve of output.match(CVE) ?? []) {
    if (!allowed.has(cve.toUpperCase())) {
      violations.push(`fabricated CVE ${cve.toUpperCase()} not present in the evidence`);
      break;
    }
  }

  return violations;
}

export class ConstitutionViolation extends Error {
  constructor(public readonly violations: string[]) {
    super(`Aegis output rejected: ${violations.join("; ")}`);
    this.name = "ConstitutionViolation";
  }
}

/** Throw if the model output violates the constitution given its allowed evidence. */
export function enforceConstitution(output: string, allowedEvidence: string): void {
  const violations = findConstitutionViolations(output, allowedEvidence);
  if (violations.length) throw new ConstitutionViolation(violations);
}
