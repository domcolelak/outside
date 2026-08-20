import { describe, expect, it, vi } from "vitest";

vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));

import { digestEmail } from "./notifications";
import { createWeeklyDigest } from "./digest";
import type { GuardianDrift, GuardianEvent, GuardianRecommendation, GuardianSnapshot } from "./types";

const BASE = "https://app.outside.test";
const NOW = new Date("2026-06-08T12:00:00.000Z");

const drift: GuardianDrift = {
  from: "2026-06-01T00:00:00.000Z",
  to: NOW.toISOString(),
  direction: "stable",
  headline: "External exposure is stable",
  narrative: "No dimension moved.",
  dimensions: [],
};

function rec(over: Partial<GuardianRecommendation> = {}): GuardianRecommendation {
  return {
    id: "rec_1", orgId: "org_a", target: "acme.com", code: "checklist:dmarc", status: "open",
    priority: "high", confidence: 1, title: "Enforce DMARC", why: "", reasoning: "",
    affectedAssets: ["acme.com"], evidence: [], suggestedReview: "Move the DMARC policy to quarantine.",
    businessImpact: "", guides: [], firstObservedAt: "2026-06-07T00:00:00.000Z", lastObservedAt: NOW.toISOString(),
    ...over,
  };
}

function assetEvent(id: string, type: GuardianEvent["type"] = "asset_new"): GuardianEvent {
  return {
    id, orgId: "org_a", target: "acme.com", scanId: "s1", type, category: "surface",
    severity: "medium", confidence: 1, title: "New asset", summary: "", why: "",
    affectedAssets: ["a.acme.com"], evidence: [], groupKey: `${type}:a.acme.com`,
    observedAt: "2026-06-07T00:00:00.000Z",
  };
}

const snapshot = { orgId: "org_a", target: "acme.com", metrics: { shadowAssets: 3 } } as unknown as GuardianSnapshot;

describe("weekly digest email rendering", () => {
  it("keeps change status, protection posture and open recommendations separate", () => {
    const digest = createWeeklyDigest(snapshot, [assetEvent("e1")], [rec()], drift, NOW, BASE);
    const { html } = digestEmail("owner@acme.com", digest);
    expect(html).toContain("What changed");
    expect(html).toContain("Protection posture");
    expect(html).toContain("Open recommendations");
  });

  it("renders every fact a reader needs to act: severity, asset, state, action and a link", () => {
    const digest = createWeeklyDigest(snapshot, [], [rec()], drift, NOW, BASE);
    const { html } = digestEmail("owner@acme.com", digest);
    expect(html).toContain("HIGH");
    expect(html).toContain("New");
    expect(html).toContain("acme.com");
    expect(html).toContain("Move the DMARC policy to quarantine.");
    expect(html).toContain("orgId=org_a");
    expect(html).toContain("Enforce DMARC");
  });

  it("shows at most five cards and summarises the rest", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      rec({ id: `r${i}`, code: `auth:host-${i}.acme.com`, affectedAssets: [`host-${i}.acme.com`], title: `Review surface ${i}` }),
    );
    const digest = createWeeklyDigest(snapshot, [], many, drift, NOW, BASE);
    const { html } = digestEmail("owner@acme.com", digest);
    expect(html.match(/Open in OUTSIDE/g)).toHaveLength(5);
    expect(html).toContain("View 3 additional recommendations");
  });

  it("groups cards under user-facing area headings", () => {
    const digest = createWeeklyDigest(snapshot, [], [rec(), rec({ id: "r2", code: "checklist:tls", title: "Renew certificate", suggestedReview: "Renew it." })], drift, NOW, BASE);
    const { html } = digestEmail("owner@acme.com", digest);
    expect(html).toContain("EMAIL SECURITY");
    expect(html).toContain("CERTIFICATES");
  });

  it("never shows a stable headline in an email that reports changes", () => {
    const digest = createWeeklyDigest(snapshot, [assetEvent("e1")], [rec()], drift, NOW, BASE);
    const { html, subject } = digestEmail("owner@acme.com", digest);
    expect(subject).not.toContain("stable");
    expect(html).not.toContain("External exposure is stable</h1>");
    expect(html).toContain("External exposure changed, with no material deterioration.");
  });

  it("labels new and returning counts separately rather than as one 'new' figure", () => {
    const digest = createWeeklyDigest(snapshot, [assetEvent("e1"), assetEvent("e2", "asset_returned")], [rec()], drift, NOW, BASE);
    const { html } = digestEmail("owner@acme.com", digest);
    expect(html).toContain("1 new, 1 returning");
  });

  it("escapes hostile content instead of rendering it as markup", () => {
    const digest = createWeeklyDigest(snapshot, [], [rec({ title: "<script>alert(1)</script>" })], drift, NOW, BASE);
    const { html } = digestEmail("owner@acme.com", digest);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders identical output for identical input", () => {
    const digest = createWeeklyDigest(snapshot, [assetEvent("e1")], [rec()], drift, NOW, BASE);
    expect(digestEmail("owner@acme.com", digest)).toEqual(digestEmail("owner@acme.com", digest));
  });

  it("localizes the complete digest for the recipient locale", () => {
    const digest = createWeeklyDigest(snapshot, [assetEvent("e1")], [rec()], drift, NOW, BASE);
    const { html, subject, text } = digestEmail("owner@acme.com", digest, "sk");
    expect(html).toContain('<html lang="sk">');
    expect(html).toContain("Čo sa zmenilo");
    expect(html).toContain("Stav ochrany");
    expect(html).toContain("Otvorené odporúčania");
    expect(subject).toContain("Týždenný Guardian");
    expect(text).not.toContain("Enforce DMARC");
    expect(html).not.toContain("What changed");
  });
});
