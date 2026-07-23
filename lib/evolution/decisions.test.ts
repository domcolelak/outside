import { beforeEach, describe, expect, it } from "vitest";
import {
  recordDecision,
  listDecisions,
  __resetDecisions,
  decidedProposalIds,
  productAffinity,
  type EvolutionDecision,
} from "./decisions";

beforeEach(() => __resetDecisions());

function decision(over: Partial<EvolutionDecision>): EvolutionDecision {
  return { proposalId: "EVP-CVE-2099-0001", cveId: "CVE-2099-0001", product: "nginx", decision: "approved", actor: "founder@outside.test", ...over };
}

describe("Evolution decision store (memory fallback)", () => {
  it("records and lists a decision", async () => {
    await recordDecision(decision({}));
    expect(await listDecisions()).toEqual([decision({})]);
  });

  it("is idempotent per proposal — a later decision overturns the earlier one", async () => {
    await recordDecision(decision({ decision: "approved" }));
    await recordDecision(decision({ decision: "rejected" }));
    const all = await listDecisions();
    expect(all).toHaveLength(1);
    expect(all[0]!.decision).toBe("rejected");
  });
});

describe("Evolution learning signals", () => {
  it("collects the ids of every decided proposal", () => {
    const decided = decidedProposalIds([
      decision({ proposalId: "EVP-A" }),
      decision({ proposalId: "EVP-B", decision: "rejected" }),
    ]);
    expect(decided.has("EVP-A")).toBe(true);
    expect(decided.has("EVP-B")).toBe(true);
    expect(decided.has("EVP-C")).toBe(false);
  });

  it("nets founder affinity per product: +1 approve, -1 reject", () => {
    const affinity = productAffinity([
      decision({ proposalId: "EVP-1", product: "citrix", decision: "approved" }),
      decision({ proposalId: "EVP-2", product: "citrix", decision: "approved" }),
      decision({ proposalId: "EVP-3", product: "citrix", decision: "rejected" }),
      decision({ proposalId: "EVP-4", product: "sharepoint", decision: "rejected" }),
    ]);
    expect(affinity.get("citrix")).toBe(1); // +1 +1 -1
    expect(affinity.get("sharepoint")).toBe(-1);
    expect(affinity.has("nginx")).toBe(false);
  });
});
