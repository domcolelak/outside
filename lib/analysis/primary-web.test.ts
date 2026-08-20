import { describe, expect, it } from "vitest";
import type { Asset, AssetKind } from "@/lib/types";
import { computeExposureScore } from "./scoring";
import {
  hasVerifiedHttpObservation,
  selectPrimaryWebSurface,
} from "./primary-web";

function asset(
  canonical: string,
  kind: AssetKind,
  attrs: Asset["attrs"] = {},
): Asset {
  return {
    id: `asset-${canonical}`,
    canonical,
    label: canonical,
    kind,
    attrs,
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastObservedAt: "2026-01-01T00:00:00.000Z",
    discoveredVia: ["seed"],
    evidence: [],
    signals: [],
    priority: "low",
    orgConfidence: 1,
  };
}

const observed = (missingHeaders: string[]) => ({
  https: "observed",
  missingHeaders,
  presentHeaders: [],
});

describe("primary web-surface selection", () => {
  it("selects the observed target regardless of provider array order", () => {
    const assets = [
      asset(
        "login.acme.com",
        "auth_surface",
        observed(["HSTS", "CSP", "XCTO"]),
      ),
      asset("acme.com", "root_domain", observed(["HSTS", "CSP"])),
      asset("www.acme.com", "web_service", observed(["HSTS"])),
    ];

    expect(
      selectPrimaryWebSurface(assets, "acme.com", hasVerifiedHttpObservation),
    ).toMatchObject({
      basis: "target",
      asset: { canonical: "acme.com" },
    });
  });

  it("uses www when the root was not observed, never the first arbitrary subdomain", () => {
    const assets = [
      asset(
        "login.acme.com",
        "auth_surface",
        observed(["HSTS", "CSP", "XCTO"]),
      ),
      asset("acme.com", "root_domain"),
      asset("www.acme.com", "web_service", observed(["HSTS", "CSP"])),
    ];

    const score = computeExposureScore(assets, [], "acme.com");
    expect(
      score.components.find((component) => component.code === "headers"),
    ).toMatchObject({
      label: "2 security headers missing on www.acme.com",
      evidenceAssetId: "asset-www.acme.com",
      evidenceCanonical: "www.acme.com",
    });
  });

  it("names a deterministic fallback instead of claiming it is the primary site", () => {
    const assets = [
      asset("zeta.acme.com", "web_service", observed(["HSTS", "CSP"])),
      asset("api.acme.com", "api_surface", observed(["HSTS", "CSP", "XCTO"])),
      asset("alpha.acme.com", "web_service", observed(["HSTS", "CSP"])),
      asset("acme.com", "root_domain"),
    ];

    const selection = selectPrimaryWebSurface(
      assets,
      "acme.com",
      hasVerifiedHttpObservation,
    );
    expect(selection).toMatchObject({
      basis: "fallback",
      asset: { canonical: "alpha.acme.com" },
    });
    expect(
      computeExposureScore(assets, [], "acme.com").components.find(
        (component) => component.code === "headers",
      )?.label,
    ).toBe("2 security headers missing on alpha.acme.com");
  });
});
