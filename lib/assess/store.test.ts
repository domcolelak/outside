import { beforeEach, describe, expect, it } from "vitest";
import { recordRun, listRuns, getRun, previousRun, diffRuns, __resetAssessRuns } from "./store";
import { assess, ASSESS_CHECKS } from "./checks";
import type { Finding, ProviderRun } from "@/lib/types";

beforeEach(() => __resetAssessRuns());

function finding(category: string): Finding {
  return { id: `f-${category}`, category, priority: "high", title: category, confidence: 0.9, assetId: "a1", observation: "", concern: "", reasoning: "", recommendation: "", evidence: [], discoveryMethod: "dns", createdAt: "2026-07-25" } as Finding;
}
/** Store behaviour is about persistence and diffing, so every run here is a fully
 * observed scan — otherwise unmatched checks would come back not_evaluated and the
 * fixed/regressed expectations would be testing coverage, not the store. */
const providerRuns: ProviderRun[] = Array.from(new Set(ASSESS_CHECKS.flatMap((check) => check.requires))).map((method) => ({
  provider: method,
  method,
  status: "ok",
  startedAt: "",
  finishedAt: "",
  observations: 1,
  errors: [],
}));
const run = (categories: string[]) => assess(categories.map(finding), { providerRuns });

describe("assess store", () => {
  it("records and reads back a run only for the owning org", async () => {
    const summary = await recordRun({ orgId: "org_1", target: "acme.com", createdBy: "u1", result: run(["mail-security"]) });
    expect(await getRun("org_1", summary.id)).not.toBeNull();
    expect(await getRun("org_2", summary.id)).toBeNull(); // cross-tenant read blocked
  });

  it("lists an org's runs for a target, newest first, not another org's", async () => {
    await recordRun({ orgId: "org_1", target: "acme.com", createdBy: "u1", result: run([]) });
    await recordRun({ orgId: "org_2", target: "acme.com", createdBy: "u2", result: run([]) });
    const runs = await listRuns("org_1", "acme.com");
    expect(runs).toHaveLength(1);
    expect(await listRuns("org_1", "other.com")).toHaveLength(0);
  });

  it("finds the previous run as the retest baseline", async () => {
    const first = await recordRun({ orgId: "org_1", target: "acme.com", createdBy: "u1", result: run(["security-headers"]) });
    await new Promise((r) => setTimeout(r, 2));
    const second = await recordRun({ orgId: "org_1", target: "acme.com", createdBy: "u1", result: run([]) });
    const baseline = await previousRun("org_1", "acme.com", second.createdAt);
    expect(baseline?.id).toBe(first.id);
  });

  it("diffs a retest into fixed / regressed / still-failing", async () => {
    const before = await recordRun({ orgId: "org_1", target: "acme.com", createdBy: "u1", result: run(["security-headers", "mail-security"]) });
    const after = await recordRun({ orgId: "org_1", target: "acme.com", createdBy: "u1", result: run(["mail-security", "known-vulnerability"]) });
    const diff = diffRuns((await getRun("org_1", before.id))!, (await getRun("org_1", after.id))!);
    expect(diff.fixed).toEqual(["http-security-headers"]); // headers finding went away
    expect(diff.regressed).toEqual(["known-vulnerability-correlation"]); // new vuln finding
    expect(diff.stillFailing).toEqual(["mail-authentication"]); // mail still failing
    expect(diff.newlyEvaluated).toEqual([]);
    expect(diff.coverageLost).toEqual([]);
  });
});
