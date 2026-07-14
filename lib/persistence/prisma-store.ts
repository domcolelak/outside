/**
 * Durable ScanStore backed by PostgreSQL via Prisma. Loaded lazily by the store
 * factory only when DATABASE_URL is set, so the app builds and runs without a
 * database. Behavior is identical to the in-memory store — the same diff logic
 * runs on top — this class only provides durability.
 */

import type { ScanResult } from "@/lib/types";
import type { AssetSnapshot, DomainVerification, ScanRecord, ScanStore, Target } from "./model";
import { prisma } from "@/lib/db/prisma";

export class PrismaScanStore implements ScanStore {
  readonly durable = true;

  async getOrCreateTarget(domain: string): Promise<Target> {
    const key = domain.toLowerCase();
    const row = await prisma.target.upsert({
      where: { domain: key },
      create: { domain: key },
      update: {},
    });
    return { id: row.id, domain: row.domain, createdAt: row.createdAt.toISOString() };
  }

  async latestSnapshots(targetId: string): Promise<AssetSnapshot[]> {
    const scan = await prisma.scan.findFirst({
      where: { targetId },
      orderBy: { finishedAt: "desc" },
    });
    if (!scan) return [];
    const rows = await prisma.assetSnapshot.findMany({ where: { scanId: scan.id } });
    return rows.map(this.mapSnapshot);
  }

  async canonicalsSeenBefore(targetId: string, beforeScanId: string | null): Promise<Set<string>> {
    // All canonicals ever observed for this target = its identities. When a
    // specific scan boundary is given, restrict to identities first seen before
    // that scan's finish time.
    let cutoff: Date | undefined;
    if (beforeScanId) {
      const scan = await prisma.scan.findUnique({ where: { id: beforeScanId } });
      cutoff = scan?.finishedAt;
    }
    const identities = await prisma.assetIdentity.findMany({
      where: { targetId, ...(cutoff ? { firstSeenAt: { lt: cutoff } } : {}) },
      select: { canonical: true },
    });
    return new Set(identities.map((i) => i.canonical));
  }

  async saveScan(target: Target, result: ScanResult, snapshots: AssetSnapshot[]): Promise<{ previousScanId: string | null }> {
    const finishedAt = new Date(result.finishedAt);
    const prevScan = await prisma.scan.findFirst({ where: { targetId: target.id }, orderBy: { finishedAt: "desc" } });

    await prisma.$transaction(async (tx) => {
      // Upsert identities and resolve identity ids for each snapshot.
      for (const snap of snapshots) {
        const identity = await tx.assetIdentity.upsert({
          where: { targetId_canonical: { targetId: target.id, canonical: snap.canonical } },
          create: { targetId: target.id, canonical: snap.canonical, label: snap.label, firstSeenAt: finishedAt, lastSeenAt: finishedAt },
          update: { lastSeenAt: finishedAt, label: snap.label },
        });
        snap.identityId = identity.id;
      }
      await tx.scan.create({
        data: {
          id: result.scanId,
          targetId: target.id,
          finishedAt,
          mode: result.mode,
          scoreValue: result.score.value,
          assetCount: result.stats.assets,
        },
      });
      await tx.assetSnapshot.createMany({
        data: snapshots.map((s) => ({
          scanId: result.scanId,
          identityId: s.identityId,
          canonical: s.canonical,
          label: s.label,
          kind: s.kind,
          priority: s.priority,
          technologies: s.technologies,
          status: s.status,
          present: true,
        })),
      });
    });

    return { previousScanId: prevScan?.id ?? null };
  }

  async recentScans(targetId: string, limit: number): Promise<ScanRecord[]> {
    const rows = await prisma.scan.findMany({ where: { targetId }, orderBy: { finishedAt: "desc" }, take: limit });
    return rows.map((r) => ({
      id: r.id,
      targetId: r.targetId,
      finishedAt: r.finishedAt.toISOString(),
      mode: r.mode as "passive" | "demo",
      scoreValue: r.scoreValue,
      assetCount: r.assetCount,
    }));
  }

  async getVerification(domain: string): Promise<DomainVerification | null> {
    const row = await prisma.domainVerification.findUnique({ where: { domain: domain.toLowerCase() } });
    return row ? this.mapVerification(row) : null;
  }

  async startVerification(domain: string, token: string, orgId?: string | null): Promise<DomainVerification> {
    const key = domain.toLowerCase();
    const existing = await prisma.domainVerification.findUnique({ where: { domain: key } });
    if (existing) {
      // Never overwrite the token; bind the org on the first authenticated start.
      const row = orgId && !existing.orgId
        ? await prisma.domainVerification.update({ where: { domain: key }, data: { orgId } })
        : existing;
      return this.mapVerification(row);
    }
    const row = await prisma.domainVerification.create({ data: { domain: key, token, status: "pending", orgId: orgId ?? null } });
    return this.mapVerification(row);
  }

  async markVerified(domain: string): Promise<DomainVerification> {
    const row = await prisma.domainVerification.update({
      where: { domain: domain.toLowerCase() },
      data: { status: "verified", verifiedAt: new Date() },
    });
    return this.mapVerification(row);
  }

  private mapVerification = (r: { domain: string; token: string; status: string; orgId: string | null; createdAt: Date; verifiedAt: Date | null }): DomainVerification => ({
    domain: r.domain,
    token: r.token,
    status: r.status === "verified" ? "verified" : "pending",
    orgId: r.orgId,
    createdAt: r.createdAt.toISOString(),
    verifiedAt: r.verifiedAt?.toISOString(),
  });

  private mapSnapshot = (r: {
    scanId: string;
    identityId: string;
    canonical: string;
    label: string;
    kind: string;
    priority: string;
    technologies: string[];
    status: string | null;
    present: boolean;
  }): AssetSnapshot => ({
    scanId: r.scanId,
    identityId: r.identityId,
    canonical: r.canonical,
    label: r.label,
    kind: r.kind as AssetSnapshot["kind"],
    priority: r.priority as AssetSnapshot["priority"],
    technologies: r.technologies,
    status: r.status ?? undefined,
    present: r.present,
  });
}
