/**
 * Persistence for OUTSIDE Assess runs. Organization-scoped: a run is only ever
 * read back for the org that created it. Runs are immutable — a retest is a new
 * run diffed against the previous one for the same target.
 */

import type { Prisma } from "@prisma/client";
import { prisma as database } from "@/lib/db/prisma";
import { storageMode } from "@/lib/config/storage";
import type { AssessResult, AssessCheckResult } from "./checks";

export interface AssessRunSummary {
  id: string;
  target: string;
  catalogueVersion: string;
  passed: number;
  failed: number;
  createdAt: string;
}
export interface AssessRunRecord extends AssessRunSummary {
  results: AssessCheckResult[];
}

/** What changed between two runs of the same target — the retest view. */
export interface AssessDiff {
  fixed: string[]; // check ids that went fail -> pass
  regressed: string[]; // check ids that went pass -> fail
  stillFailing: string[];
}

const g = globalThis as unknown as { __outsideAssessRuns?: (AssessRunRecord & { orgId: string })[] };
function mem() {
  return (g.__outsideAssessRuns ??= []);
}
function db() {
  return storageMode() === "database" ? database : null;
}

export async function recordRun(input: { orgId: string; target: string; createdBy: string; result: AssessResult }): Promise<AssessRunSummary> {
  const conn = db();
  if (conn) {
    const row = await conn.assessmentRun.create({
      data: {
        orgId: input.orgId,
        target: input.target,
        catalogueVersion: input.result.catalogueVersion,
        passed: input.result.summary.passed,
        failed: input.result.summary.failed,
        results: input.result.results as unknown as Prisma.InputJsonValue,
        createdBy: input.createdBy,
      },
    });
    return { id: row.id, target: row.target, catalogueVersion: row.catalogueVersion, passed: row.passed, failed: row.failed, createdAt: row.createdAt.toISOString() };
  }
  const record = {
    id: crypto.randomUUID(),
    orgId: input.orgId,
    target: input.target,
    catalogueVersion: input.result.catalogueVersion,
    passed: input.result.summary.passed,
    failed: input.result.summary.failed,
    results: input.result.results,
    createdAt: new Date().toISOString(),
  };
  mem().unshift(record);
  const { orgId, ...summary } = record;
  void orgId;
  return { id: summary.id, target: summary.target, catalogueVersion: summary.catalogueVersion, passed: summary.passed, failed: summary.failed, createdAt: summary.createdAt };
}

export async function listRuns(orgId: string, target?: string): Promise<AssessRunSummary[]> {
  const conn = db();
  if (conn) {
    const rows = await conn.assessmentRun.findMany({
      where: { orgId, ...(target ? { target } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, target: true, catalogueVersion: true, passed: true, failed: true, createdAt: true },
    });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
  return mem()
    .filter((run) => run.orgId === orgId && (!target || run.target === target))
    .map(({ id, target: t, catalogueVersion, passed, failed, createdAt }) => ({ id, target: t, catalogueVersion, passed, failed, createdAt }));
}

/** A full run, only if it belongs to the org. */
export async function getRun(orgId: string, id: string): Promise<AssessRunRecord | null> {
  const conn = db();
  if (conn) {
    const row = await conn.assessmentRun.findFirst({ where: { id, orgId } });
    return row
      ? { id: row.id, target: row.target, catalogueVersion: row.catalogueVersion, passed: row.passed, failed: row.failed, createdAt: row.createdAt.toISOString(), results: row.results as unknown as AssessCheckResult[] }
      : null;
  }
  const run = mem().find((candidate) => candidate.id === id && candidate.orgId === orgId);
  if (!run) return null;
  const { orgId: _org, ...record } = run;
  void _org;
  return record;
}

/** The run immediately before `beforeId` for the same target — the retest baseline. */
export async function previousRun(orgId: string, target: string, beforeCreatedAt: string): Promise<AssessRunRecord | null> {
  const conn = db();
  if (conn) {
    const row = await conn.assessmentRun.findFirst({
      where: { orgId, target, createdAt: { lt: new Date(beforeCreatedAt) } },
      orderBy: { createdAt: "desc" },
    });
    return row
      ? { id: row.id, target: row.target, catalogueVersion: row.catalogueVersion, passed: row.passed, failed: row.failed, createdAt: row.createdAt.toISOString(), results: row.results as unknown as AssessCheckResult[] }
      : null;
  }
  const run = mem().find((candidate) => candidate.orgId === orgId && candidate.target === target && candidate.createdAt < beforeCreatedAt);
  if (!run) return null;
  const { orgId: _org, ...record } = run;
  void _org;
  return record;
}

/** fail→pass, pass→fail and still-failing checks between a baseline and a run. */
export function diffRuns(baseline: AssessRunRecord, current: AssessRunRecord): AssessDiff {
  const was = new Map(baseline.results.map((result) => [result.check.id, result.status]));
  const fixed: string[] = [];
  const regressed: string[] = [];
  const stillFailing: string[] = [];
  for (const result of current.results) {
    const before = was.get(result.check.id);
    if (result.status === "fail" && before === "pass") regressed.push(result.check.id);
    else if (result.status === "pass" && before === "fail") fixed.push(result.check.id);
    else if (result.status === "fail" && before === "fail") stillFailing.push(result.check.id);
  }
  return { fixed, regressed, stillFailing };
}

export function __resetAssessRuns(): void {
  g.__outsideAssessRuns = [];
}
