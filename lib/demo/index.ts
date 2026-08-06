import { buildNorthstar, type DemoOrg } from "./northstar";
import { buildAtlas, buildVelora } from "./others";

export type { DemoOrg } from "./northstar";

export const DEMO_ORGS: Array<{ slug: string; name: string; domain: string; build: () => DemoOrg }> = [
  { slug: "northstar", name: "Northstar Labs", domain: "northstarlabs.example", build: buildNorthstar },
  { slug: "velora", name: "Velora Commerce", domain: "veloracommerce.example", build: buildVelora },
  { slug: "atlas", name: "Atlas Financial", domain: "atlasfinancial.example", build: buildAtlas },
];

/** Resolve a demo org by slug or by its domain (case-insensitive). */
export function findDemoOrg(input: string): DemoOrg | null {
  const key = input.trim().toLowerCase();
  const match = DEMO_ORGS.find((o) => o.slug === key || o.domain === key);
  return match ? match.build() : null;
}

// isDemoDomain() lost its only caller when the scan route moved target handling
// into canonicalScanTarget(), which resolves a demo target through findDemoOrg()
// directly. Removed rather than left as a second, unused way to ask the question.
