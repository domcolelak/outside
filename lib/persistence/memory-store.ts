/**
 * In-memory ScanStore. The zero-config default: repeated scans of the same
 * target within a running process produce real change detection, so the product
 * is fully demoable without any database. Not durable across restarts — the
 * Prisma store (enabled by DATABASE_URL) provides durability with identical
 * behavior.
 */

import type { ScanResult } from "@/lib/types";
import type { AssetIdentity, AssetSnapshot, DomainVerification, ScanRecord, ScanStore, Target } from "./model";

interface TargetState {
  target: Target;
  identities: Map<string, AssetIdentity>; // canonical -> identity
  scans: ScanRecord[]; // append order (oldest first)
  snapshotsByScan: Map<string, AssetSnapshot[]>;
}

export class InMemoryScanStore implements ScanStore {
  readonly durable = false;
  private targets = new Map<string, TargetState>(); // domain -> state
  private byId = new Map<string, TargetState>(); // targetId -> state
  private verifications = new Map<string, DomainVerification>(); // domain -> verification

  private id(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async getOrCreateTarget(domain: string): Promise<Target> {
    const key = domain.toLowerCase();
    const existing = this.targets.get(key);
    if (existing) return existing.target;
    const target: Target = { id: this.id("tgt"), domain: key, createdAt: new Date().toISOString() };
    const state: TargetState = { target, identities: new Map(), scans: [], snapshotsByScan: new Map() };
    this.targets.set(key, state);
    this.byId.set(target.id, state);
    return target;
  }

  async latestSnapshots(targetId: string): Promise<AssetSnapshot[]> {
    const state = this.byId.get(targetId);
    if (!state || state.scans.length === 0) return [];
    const last = state.scans[state.scans.length - 1]!;
    return state.snapshotsByScan.get(last.id) ?? [];
  }

  async canonicalsSeenBefore(targetId: string, beforeScanId: string | null): Promise<Set<string>> {
    const state = this.byId.get(targetId);
    const out = new Set<string>();
    if (!state) return out;
    for (const scan of state.scans) {
      if (beforeScanId && scan.id === beforeScanId) break;
      for (const snap of state.snapshotsByScan.get(scan.id) ?? []) out.add(snap.canonical);
    }
    return out;
  }

  async saveScan(target: Target, result: ScanResult, snapshots: AssetSnapshot[]): Promise<{ previousScanId: string | null }> {
    const state = this.byId.get(target.id);
    if (!state) throw new Error(`Unknown target ${target.id}`);
    const previousScanId = state.scans.length ? state.scans[state.scans.length - 1]!.id : null;
    const now = result.finishedAt;

    // Upsert identities and bind snapshots to them.
    for (const snap of snapshots) {
      let identity = state.identities.get(snap.canonical);
      if (!identity) {
        identity = { id: this.id("aid"), targetId: target.id, canonical: snap.canonical, label: snap.label, firstSeenAt: now, lastSeenAt: now };
        state.identities.set(snap.canonical, identity);
      } else {
        identity.lastSeenAt = now;
        identity.label = snap.label;
      }
      snap.identityId = identity.id;
    }

    const record: ScanRecord = {
      id: result.scanId,
      targetId: target.id,
      finishedAt: now,
      mode: result.mode,
      scoreValue: result.score.value,
      assetCount: result.stats.assets,
    };
    state.scans.push(record);
    state.snapshotsByScan.set(result.scanId, snapshots);
    return { previousScanId };
  }

  async recentScans(targetId: string, limit: number): Promise<ScanRecord[]> {
    const state = this.byId.get(targetId);
    if (!state) return [];
    return state.scans.slice(-limit).reverse();
  }

  async getVerification(domain: string): Promise<DomainVerification | null> {
    return this.verifications.get(domain.toLowerCase()) ?? null;
  }

  async startVerification(domain: string, token: string): Promise<DomainVerification> {
    const key = domain.toLowerCase();
    const existing = this.verifications.get(key);
    if (existing) return existing;
    const v: DomainVerification = { domain: key, token, status: "pending", createdAt: new Date().toISOString() };
    this.verifications.set(key, v);
    return v;
  }

  async markVerified(domain: string): Promise<DomainVerification> {
    const key = domain.toLowerCase();
    const existing = this.verifications.get(key);
    if (!existing) throw new Error("No verification challenge for domain");
    const v: DomainVerification = { ...existing, status: "verified", verifiedAt: new Date().toISOString() };
    this.verifications.set(key, v);
    return v;
  }

  identitiesFor(targetId: string): AssetIdentity[] {
    return [...(this.byId.get(targetId)?.identities.values() ?? [])];
  }
}
