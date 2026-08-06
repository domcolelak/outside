import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/log", () => ({ operationalLog: () => {} }));
vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));

import { attributeAssetOwnership, matchesOwnedDomain, ownershipAttributionEnabled } from "./ownership";
import { withOrgProviderKeys } from "@/lib/integrations/providers/org-keys";
import { saveProviderKey, __resetConnections } from "@/lib/integrations/connections";
import type { Asset } from "@/lib/types";

afterEach(() => vi.restoreAllMocks());

const asset = (canonical: string): Asset => ({
  id: `asset_${canonical}`,
  kind: "web_service",
  label: canonical,
  canonical,
  firstObservedAt: "2026-01-01T00:00:00.000Z",
  lastObservedAt: "2026-01-01T00:00:00.000Z",
  discoveredVia: ["dns"],
  evidence: [],
  signals: [],
  priority: "low",
  orgConfidence: 1,
  attrs: {},
});

/** Answer Vercel's two endpoints: identity, then the owned-domain list. */
function stubVercel(domains: string[], status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/v5/domains")
        ? new Response(status === 200 ? JSON.stringify({ domains: domains.map((name) => ({ name })) }) : "", { status })
        : new Response(JSON.stringify({ user: { username: "acme" } }), { status: 200 }),
    ),
  );
}

describe("hostname matching", () => {
  it("claims the domain itself and anything beneath it", () => {
    expect(matchesOwnedDomain("acme.com", "acme.com")).toBe(true);
    expect(matchesOwnedDomain("api.staging.acme.com", "acme.com")).toBe(true);
  });

  it("does not claim a lookalike that merely ends with the same letters", () => {
    // notacme.com must never be attributed to acme.com.
    expect(matchesOwnedDomain("notacme.com", "acme.com")).toBe(false);
    expect(matchesOwnedDomain("acme.com.evil.test", "acme.com")).toBe(false);
  });
});

describe("attribution during a scan", () => {
  beforeEach(() => {
    __resetConnections();
    vi.unstubAllEnvs();
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));
    vi.stubEnv("VERCEL_API_TOKEN", "");
  });

  it("is inactive when no account is connected", async () => {
    expect(ownershipAttributionEnabled()).toBe(false);
    const assets = [asset("acme.com")];
    expect(await attributeAssetOwnership(assets)).toEqual([]);
    expect(assets[0]!.attrs.ownedBy).toBeUndefined();
  });

  it("annotates owned assets and leaves the rest unattributed", async () => {
    stubVercel(["acme.com"]);
    await saveProviderKey("org_a", "vercel", "v".repeat(30), "user_1");

    const assets = [asset("acme.com"), asset("app.acme.com"), asset("legacy.otherco.test")];
    await withOrgProviderKeys("org_a", async () => {
      expect(ownershipAttributionEnabled()).toBe(true);
      const runs = await attributeAssetOwnership(assets);
      expect(runs[0]).toMatchObject({ provider: "Vercel", method: "ownership_attribution", status: "ok", observations: 2 });
    });

    expect(assets[0]!.attrs.ownedBy).toBe("Vercel");
    expect(assets[1]!.attrs.ownedByDomain).toBe("acme.com");
    // The point of the feature: what nobody owns stays conspicuously unclaimed.
    expect(assets[2]!.attrs.ownedBy).toBeUndefined();
  });

  it("prefers the most specific owned domain", async () => {
    stubVercel(["acme.com", "app.acme.com"]);
    await saveProviderKey("org_a", "vercel", "v".repeat(30), "user_1");
    const assets = [asset("api.app.acme.com")];
    await withOrgProviderKeys("org_a", () => attributeAssetOwnership(assets));
    expect(assets[0]!.attrs.ownedByDomain).toBe("app.acme.com");
  });

  it("reports a provider failure instead of silently marking everything unowned", async () => {
    // A failed lookup must not be mistaken for "the customer owns nothing",
    // which would turn every asset into a false shadow-asset candidate.
    stubVercel([], 401);
    await saveProviderKey("org_a", "vercel", "v".repeat(30), "user_1");
    const assets = [asset("acme.com")];
    const runs = await withOrgProviderKeys("org_a", () => attributeAssetOwnership(assets));
    expect(runs[0]).toMatchObject({ status: "error", observations: 0 });
    expect(assets[0]!.attrs.ownedBy).toBeUndefined();
  });

  it("never leaks one organization's account into another's scan", async () => {
    stubVercel(["acme.com"]);
    await saveProviderKey("org_a", "vercel", "v".repeat(30), "user_1");
    const assets = [asset("acme.com")];
    await withOrgProviderKeys("org_b", () => attributeAssetOwnership(assets));
    expect(assets[0]!.attrs.ownedBy).toBeUndefined();
  });
});
