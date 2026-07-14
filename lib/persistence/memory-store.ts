/**
 * In-memory ScanStore. The zero-config default: repeated scans of the same
 * target within a running process produce real change detection, so the product
 * is fully demoable without any database. Not durable across restarts — the
 * Prisma store (enabled by DATABASE_URL) provides durability with identical
 * behavior.
 */

import type { ScanResult } from "@/lib/types";
import type { AssetIdentity, AssetSnapshot, DomainVerification, ScanRecord, ScanStore, Target } from "./model";
import { randomUUID } from "node:crypto";

interface TargetState {
  target: Target;
  identities: Map<string, AssetIdentity>; // canonical -> identity
  scans: ScanRecord[]; // append order (oldest first)
  snapshotsByScan: Map<string, AssetSnapshot[]>;
}

export class InMemoryScanStore implements ScanStore {
  readonly durable = false;
  private targets = new Map<string, TargetState>(); // orgId + domain -> state
  private byId = new Map<string, TargetState>(); // targetId -> state
  private verifications = new Map<string, DomainVerification>(); // orgId + domain -> verification

  private id(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }

  private scope(orgId: string, domain: string) { return `${orgId}\u0000${domain.toLowerCase()}`; }

  async findTarget(orgId: string, domain: string): Promise<Target | null> {
    return this.targets.get(this.scope(orgId, domain))?.target ?? null;
  }

  async getOrCreateTarget(orgId: string, domain: string): Promise<Target> {
    const key = this.scope(orgId, domain);
    const existing = this.targets.get(key);
    if (existing) return existing.target;
    const target: Target = { id: this.id("tgt"), orgId, domain: domain.toLowerCase(), createdAt: new Date().toISOString() };
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
      orgId: target.orgId,
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

  async getVerification(domain: string, orgId: string): Promise<DomainVerification | null> {
    return this.verifications.get(this.scope(orgId, domain)) ?? null;
  }

  async startVerification(domain: string, token: string, orgId: string): Promise<DomainVerification> {
    const key = this.scope(orgId, domain);
    const existing = this.verifications.get(key);
    if (existing) {
      return existing;
    }
    const v: DomainVerification = { domain: domain.toLowerCase(), token, status: "pending", orgId, createdAt: new Date().toISOString() };
    this.verifications.set(key, v);
    return v;
  }

  async markVerified(domain: string, orgId: string): Promise<DomainVerification> {
    const key = this.scope(orgId, domain);
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
