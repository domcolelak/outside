/**
 * Temporal persistence model.
 *
 * The central problem: an asset (e.g. staging.company.com) may appear in scan 1,
 * vanish in scan 2, and return in scan 5. We must preserve one stable identity
 * across that gap and represent each observation in time.
 *
 * Design:
 *   AssetIdentity  — stable, keyed by (targetId, canonical). Created once, never
 *                    duplicated. Records when the org first/last saw the asset.
 *   AssetSnapshot  — one row per asset per scan: what was observed that time.
 *   ScanRecord     — metadata for a completed scan (score, stats).
 *   ChangeEvent    — derived by diffing consecutive scans (see diff.ts).
 *
 * This module is storage-agnostic: both the in-memory and Prisma stores speak
 * these shapes. Nothing here depends on a database.
 */

import type { AssetKind, Priority, ScanResult } from "@/lib/types";

export interface Target {
  id: string;
  domain: string;
  createdAt: string;
}

export interface ScanRecord {
  id: string;
  targetId: string;
  finishedAt: string;
  mode: "passive" | "demo";
  scoreValue: number;
  assetCount: number;
}

export interface AssetIdentity {
  id: string;
  targetId: string;
  canonical: string;
  label: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** The observable state of one asset in one scan — the temporal unit. */
export interface AssetSnapshot {
  scanId: string;
  identityId: string;
  canonical: string;
  label: string;
  kind: AssetKind;
  priority: Priority;
  technologies: string[];
  status?: string;
  present: boolean;
}

export type ChangeType =
  | "asset_appeared"
  | "asset_returned"
  | "asset_disappeared"
  | "technology_changed"
  | "priority_changed";

export interface ChangeEvent {
  type: ChangeType;
  canonical: string;
  label: string;
  detail: string;
  /** Review weight so the UI/alerts can rank and group changes. */
  priority: Priority;
  from?: string;
  to?: string;
}

/** Compact per-scan diff attached to a ScanResult once history exists. */
export interface ChangeSummary {
  previousScanId: string | null;
  events: ChangeEvent[];
  counts: {
    appeared: number;
    returned: number;
    disappeared: number;
    changed: number;
  };
}

export interface DomainVerification {
  domain: string;
  token: string;
  status: "pending" | "verified";
  createdAt: string;
  verifiedAt?: string;
}

/** Persistence boundary. Implemented by the in-memory and Prisma stores. */
export interface ScanStore {
  /** Whether this store durably persists across process restarts. */
  readonly durable: boolean;
  getOrCreateTarget(domain: string): Promise<Target>;
  /** Snapshots of the most recent completed scan for a target, if any. */
  latestSnapshots(targetId: string): Promise<AssetSnapshot[]>;
  /** Canonicals ever observed for a target strictly before `beforeScanId` (or all if null). */
  canonicalsSeenBefore(targetId: string, beforeScanId: string | null): Promise<Set<string>>;
  /** Persist a completed scan and its snapshots; returns the previous scan id. */
  saveScan(target: Target, result: ScanResult, snapshots: AssetSnapshot[]): Promise<{ previousScanId: string | null }>;
  recentScans(targetId: string, limit: number): Promise<ScanRecord[]>;

  /** Domain ownership verification (DNS-TXT). */
  getVerification(domain: string): Promise<DomainVerification | null>;
  /** Create a pending challenge if none exists; return the current one otherwise. */
  startVerification(domain: string, token: string): Promise<DomainVerification>;
  markVerified(domain: string): Promise<DomainVerification>;
}
