/**
 * Shareable scan snapshots — the growth loop's viral artifact.
 *
 * When a scanner chooses to share a result, we persist a bounded, public-safe
 * projection under an unlisted random token with a 30-day expiry. The snapshot
 * carries only public passive-scan facts (the same the scan already shows to
 * anyone) — no tenant state, no raw internals. The share page is noindex, so
 * this is a user-initiated link, not a public directory of anyone's exposure.
 */

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Finding, ScanResult, ScanStats } from "@/lib/types";

const TTL_DAYS = 30;
const MAX_FINDINGS = 12;

export interface ShareSnapshot {
  target: string;
  isDemo: boolean;
  score: { value: number; band: string };
  stats: ScanStats;
  findings: Array<{ title: string; priority: string; confidence: number; observation: string; concern: string }>;
  createdAt: string;
}

export interface ShareRecord {
  token: string;
  target: string;
  score: number;
  band: string;
  snapshot: ShareSnapshot;
  expiresAt: Date;
}

/** Pure: build a bounded, public-safe snapshot + token from a finished scan. */
export function buildShareRecord(result: ScanResult, now = new Date(), ttlDays = TTL_DAYS): ShareRecord {
  const snapshot: ShareSnapshot = {
    target: result.target,
    isDemo: result.isDemo,
    score: { value: result.score.value, band: result.score.band },
    stats: result.stats,
    findings: result.findings.slice(0, MAX_FINDINGS).map((f: Finding) => ({
      title: f.title,
      priority: f.priority,
      confidence: f.confidence,
      observation: f.observation,
      concern: f.concern,
    })),
    createdAt: now.toISOString(),
  };
  return {
    token: randomBytes(12).toString("base64url"),
    target: result.target,
    score: result.score.value,
    band: result.score.band,
    snapshot,
    expiresAt: new Date(now.getTime() + ttlDays * 86_400_000),
  };
}

export async function createShare(result: ScanResult): Promise<{ token: string }> {
  const record = buildShareRecord(result);
  await prisma.scanShare.create({
    data: {
      token: record.token,
      target: record.target,
      score: record.score,
      band: record.band,
      snapshot: record.snapshot as unknown as object,
      expiresAt: record.expiresAt,
    },
  });
  return { token: record.token };
}

/** Fetch a live (non-expired) share and count the view. Null when missing/expired. */
export async function getShare(token: string): Promise<ShareSnapshot | null> {
  const row = await prisma.scanShare.findUnique({ where: { token } });
  if (!row || row.expiresAt < new Date()) return null;
  await prisma.scanShare.update({ where: { token }, data: { views: { increment: 1 } } }).catch(() => {});
  return row.snapshot as unknown as ShareSnapshot;
}
