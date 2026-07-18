import { describe, expect, it } from "vitest";
import { fingerprintHttpHeaders } from "./http";

describe("HTTP technology and provider fingerprints", () => {
  it("keeps literal technology headers and recognizes explicit edge signals", () => {
    expect(fingerprintHttpHeaders({ server: "cloudflare", "cf-ray": "abc-FRA", "x-powered-by": "Next.js" })).toEqual({
      technologies: ["cloudflare", "Next.js"],
      providerEvidence: ["Observed the cf-ray response header."],
      cdn: "Cloudflare",
    });
  });

  it("does not infer a provider from unrelated or look-alike headers", () => {
    expect(fingerprintHttpHeaders({ server: "nginx", "x-cloudfront-like": "yes" })).toEqual({
      technologies: ["nginx"],
      providerEvidence: [],
    });
  });

  it("bounds untrusted header values before storing them", () => {
    const result = fingerprintHttpHeaders({ server: `nginx\n${"x".repeat(200)}` });
    expect(result.technologies[0]).not.toContain("\n");
    expect(result.technologies[0]?.length).toBeLessThanOrEqual(120);
  });
});
