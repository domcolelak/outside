import { describe, expect, it } from "vitest";
import {
  buildChangeStatus,
  buildDigestCards,
  dedupeRecommendations,
  groupCardsByArea,
  recommendationLink,
  semanticKey,
  withoutSupersededRollups,
  MAX_DIGEST_CARDS,
} from "./digest-content";
import { createWeeklyDigest } from "./digest";
import type { GuardianDrift, GuardianEvent, GuardianRecommendation, GuardianSnapshot } from "./types";

const BASE = "https://app.outside.test";
const NOW = new Date("2026-06-08T12:00:00.000Z");
const WINDOW_START = NOW.getTime() - 7 * 86_400_000;

function rec(over: Partial<GuardianRecommendation> = {}): GuardianRecommendation {
  return {
    id: over.id ?? "rec_1",
    orgId: "org_a",
    target: "acme.com",
    code: "checklist:dmarc",
    status: "open",
    priority: "high",
    confidence: 1,
    title: "Enforce DMARC",
    why: "",
    reasoning: "",
    affectedAssets: ["acme.com"],
    evidence: [],
    suggestedReview: "Move the DMARC policy to quarantine.",
    businessImpact: "",
    guides: [],
    firstObservedAt: "2026-05-01T00:00:00.000Z",
    lastObservedAt: NOW.toISOString(),
    ...over,
  };
}

function event(over: Partial<GuardianEvent> = {}): GuardianEvent {
  return {
    id: over.id ?? "ev_1",
    orgId: "org_a",
    target: "acme.com",
    scanId: "s1",
    type: "asset_new",
    category: "surface",
    severity: "medium",
    confidence: 1,
    title: "New asset",
    summary: "",
    why: "",
    affectedAssets: ["a.acme.com"],
    evidence: [],
    groupKey: "asset_new:a.acme.com",
    observedAt: "2026-06-07T00:00:00.000Z",
    ...over,
  };
}

const stableDrift: GuardianDrift = {
  from: "2026-06-01T00:00:00.000Z",
  to: NOW.toISOString(),
  direction: "stable",
  headline: "External exposure is stable",
  narrative: "No dimension moved.",
  dimensions: [],
};

describe("deduplication", () => {
  it("renders an identical recommendation only once", () => {
    const duplicate = [rec({ id: "rec_1" }), rec({ id: "rec_1" })];
    expect(dedupeRecommendations(duplicate)).toHaveLength(1);
  });

  it("deduplicates by semantic key even when ids differ and wording varies", () => {
    const a = rec({ id: "rec_1", suggestedReview: "Move the DMARC policy to quarantine." });
    const b = rec({ id: "rec_2", suggestedReview: "  move the dmarc policy to quarantine  " });
    expect(semanticKey(a)).toBe(semanticKey(b));
    expect(dedupeRecommendations([a, b])).toHaveLength(1);
  });

  it("does not merge different assets that share a title and action", () => {
    const a = rec({ id: "r1", code: "auth:one.acme.com", affectedAssets: ["one.acme.com"] });
    const b = rec({ id: "r2", code: "auth:two.acme.com", affectedAssets: ["two.acme.com"] });
    expect(dedupeRecommendations([a, b])).toHaveLength(2);
  });

  it("does not deduplicate on visible text alone — same title, different finding", () => {
    const a = rec({ id: "r1", code: "checklist:spf", suggestedReview: "Publish an SPF record." });
    const b = rec({ id: "r2", code: "checklist:dkim", suggestedReview: "Publish a DKIM record." });
    expect(dedupeRecommendations([a, b])).toHaveLength(2);
  });
});

describe("roll-up suppression", () => {
  it("drops the parent roll-up when its children are in the same digest", () => {
    const parent = rec({ id: "p", code: "surface-growth", title: "Reconcile recent external surface growth" });
    const child = rec({ id: "c", code: "ownership:a.acme.com", affectedAssets: ["a.acme.com"] });
    const result = withoutSupersededRollups([parent, child]);
    expect(result.map((item) => item.code)).toEqual(["ownership:a.acme.com"]);
  });

  it("keeps the roll-up when no child recommendation is present", () => {
    const parent = rec({ id: "p", code: "surface-growth" });
    expect(withoutSupersededRollups([parent]).map((item) => item.code)).toEqual(["surface-growth"]);
  });

  it("never renders parent and child together through the card builder", () => {
    const parent = rec({ id: "p", code: "surface-growth", priority: "critical" });
    const child = rec({ id: "c", code: "auth:a.acme.com", priority: "critical", affectedAssets: ["a.acme.com"] });
    const { cards } = buildDigestCards([parent, child], BASE, WINDOW_START);
    expect(cards.some((card) => card.code === "surface-growth")).toBe(false);
    expect(cards.some((card) => card.code === "auth:a.acme.com")).toBe(true);
  });
});

describe("change counts", () => {
  it("does not conflate new and returning assets", () => {
    const status = buildChangeStatus([event({ id: "e1", type: "asset_new" }), event({ id: "e2", type: "asset_returned" }), event({ id: "e3", type: "asset_returned" })], stableDrift);
    expect(status.newAssets).toBe(1);
    expect(status.returnedAssets).toBe(2);
  });

  it("counts surface signals separately from asset appearances", () => {
    const status = buildChangeStatus([event({ id: "e1", type: "asset_new" }), event({ id: "e2", type: "auth_surface_new" })], stableDrift);
    expect(status.newAssets).toBe(1);
    expect(status.newSurfaceSignals).toBe(1);
  });

  it("reports high-priority alerts rather than an ambiguous important count", () => {
    const status = buildChangeStatus([event({ id: "e1", severity: "critical" }), event({ id: "e2", severity: "low" })], stableDrift);
    expect(status.highPriorityAlerts).toBe(1);
    expect(status.headline).toBe("1 high-priority alert to review");
  });
});

describe("headline honesty", () => {
  it("cannot claim a stable surface when assets changed", () => {
    const status = buildChangeStatus([event({ type: "asset_new" })], stableDrift);
    expect(status.headline).toBe("External exposure changed, with no material deterioration.");
    expect(status.headline).not.toContain("stable");
  });

  it("still reports a genuinely unchanged week as stable", () => {
    const status = buildChangeStatus([], stableDrift);
    expect(status.headline).toBe("External exposure is stable");
  });

  it("prefers the deterioration headline when the surface is worsening", () => {
    const worsening: GuardianDrift = { ...stableDrift, direction: "worsening", headline: "External exposure is expanding" };
    expect(buildChangeStatus([event({ type: "asset_new" })], worsening).headline).toBe("External exposure is expanding");
  });

  it("a digest reporting asset changes never carries a no-change headline", () => {
    const snapshot = { orgId: "org_a", target: "acme.com", metrics: { shadowAssets: 2 } } as unknown as GuardianSnapshot;
    const digest = createWeeklyDigest(snapshot, [event({ type: "asset_new" })], [], stableDrift, NOW, BASE);
    expect(digest.headline).not.toContain("stable");
    expect(digest.changeStatus.newAssets).toBe(1);
  });
});

describe("card contents and limits", () => {
  it("shows at most five cards and summarises the remainder", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      rec({ id: `r${index}`, code: `auth:host-${index}.acme.com`, affectedAssets: [`host-${index}.acme.com`], title: `Review surface ${index}` }),
    );
    const { cards, additional, total } = buildDigestCards(many, BASE, WINDOW_START);
    expect(cards).toHaveLength(MAX_DIGEST_CARDS);
    expect(additional).toBe(4);
    expect(total).toBe(9);
  });

  it("each card carries severity, asset, state, action and a link", () => {
    const { cards } = buildDigestCards([rec({ firstObservedAt: "2026-06-07T00:00:00.000Z" })], BASE, WINDOW_START);
    expect(cards[0]).toMatchObject({
      title: "Enforce DMARC",
      priority: "high",
      area: "Email security",
      affectedAsset: "acme.com",
      state: "new",
      action: "Move the DMARC policy to quarantine.",
    });
    expect(cards[0]!.link).toContain("/guardian");
  });

  it("marks a recommendation that came back after being resolved as regressed", () => {
    const { cards } = buildDigestCards([rec({ regressedAt: "2026-06-06T00:00:00.000Z" })], BASE, WINDOW_START);
    expect(cards[0]!.state).toBe("regressed");
  });

  it("excludes resolved and dismissed recommendations", () => {
    const { total } = buildDigestCards([rec({ id: "a", status: "resolved" }), rec({ id: "b", code: "checklist:spf", status: "dismissed" })], BASE, WINDOW_START);
    expect(total).toBe(0);
  });

  it("groups by user-facing area in a stable order", () => {
    const cards = buildDigestCards(
      [
        rec({ id: "r1", code: "checklist:tls", suggestedReview: "Renew the certificate." }),
        rec({ id: "r2", code: "checklist:dmarc", suggestedReview: "Fix DMARC." }),
        rec({ id: "r3", code: "auth:sso.acme.com", affectedAssets: ["sso.acme.com"], suggestedReview: "Review SSO." }),
      ],
      BASE,
      WINDOW_START,
    ).cards;
    expect(groupCardsByArea(cards).map((group) => group.area)).toEqual(["Email security", "Certificates", "Identity"]);
  });
});

describe("tenant scoping", () => {
  it("deep links carry the owning organization and target", () => {
    const link = recommendationLink(BASE, rec({ orgId: "org_a", target: "acme.com" }));
    expect(link).toContain("orgId=org_a");
    expect(link).toContain("target=acme.com");
  });

  it("two tenants with identical findings never share digest content", () => {
    const a = rec({ orgId: "org_a", target: "acme.com" });
    const b = rec({ orgId: "org_b", target: "acme.com" });
    expect(semanticKey(a)).not.toBe(semanticKey(b));
    expect(recommendationLink(BASE, a)).not.toBe(recommendationLink(BASE, b));

    const snapshot = (orgId: string) => ({ orgId, target: "acme.com", metrics: { shadowAssets: 0 } }) as unknown as GuardianSnapshot;
    const digestA = createWeeklyDigest(snapshot("org_a"), [], [a], stableDrift, NOW, BASE);
    const digestB = createWeeklyDigest(snapshot("org_b"), [], [b], stableDrift, NOW, BASE);
    expect(digestA.recommendations.cards[0]!.link).not.toBe(digestB.recommendations.cards[0]!.link);
    expect(digestA.orgId).not.toBe(digestB.orgId);
  });

  it("one tenant's recommendation cannot be deduplicated away by another's", () => {
    const merged = dedupeRecommendations([rec({ id: "r1", orgId: "org_a" }), rec({ id: "r2", orgId: "org_b" })]);
    expect(merged).toHaveLength(2);
  });
});

describe("determinism", () => {
  it("produces identical content for identical input", () => {
    const snapshot = { orgId: "org_a", target: "acme.com", metrics: { shadowAssets: 1 } } as unknown as GuardianSnapshot;
    const events = [event({ type: "asset_new" }), event({ id: "e2", type: "asset_returned" })];
    const recs = [rec({ id: "r1" }), rec({ id: "r2", code: "checklist:spf", suggestedReview: "Publish SPF." })];
    const first = createWeeklyDigest(snapshot, events, recs, stableDrift, NOW, BASE);
    const second = createWeeklyDigest(snapshot, events, recs, stableDrift, NOW, BASE);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
