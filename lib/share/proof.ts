import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret, authVerificationSecrets } from "@/lib/config/secrets";
import type { ScanResult } from "@/lib/types";

const PROOF_TTL_MS = 30 * 60_000;
const MAX_SHARED_FINDINGS = 12;

function proofPayload(result: ScanResult): string {
  return JSON.stringify({
    scanId: result.scanId,
    target: result.target,
    isDemo: result.isDemo,
    finishedAt: result.finishedAt,
    score: { value: result.score.value, band: result.score.band },
    stats: result.stats,
    findings: result.findings.slice(0, MAX_SHARED_FINDINGS).map((finding) => ({
      title: finding.title,
      priority: finding.priority,
      confidence: finding.confidence,
      observation: finding.observation,
      concern: finding.concern,
    })),
  });
}

function signature(secret: string, expiresAt: number, result: ScanResult): string {
  return createHmac("sha256", secret).update(`${expiresAt}.${proofPayload(result)}`).digest("base64url");
}

/** Server-issued proof that a share snapshot came from this scan pipeline. */
export function issueShareProof(result: ScanResult, now = Date.now()): string {
  const expiresAt = now + PROOF_TTL_MS;
  return `${expiresAt}.${signature(authSecret(), expiresAt, result)}`;
}

export function verifyShareProof(result: ScanResult, proof: string | undefined, now = Date.now()): boolean {
  if (!proof || proof.length > 256) return false;
  const [rawExpiry, suppliedSignature, extra] = proof.split(".");
  if (!rawExpiry || !suppliedSignature || extra) return false;
  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) return false;
  const supplied = Buffer.from(suppliedSignature);
  return authVerificationSecrets().some((secret) => {
    const expected = Buffer.from(signature(secret, expiresAt, result));
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}
