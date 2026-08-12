import { describe, expect, it } from "vitest";

import { providerSummaryKey, DESCRIBED_PROVIDER_IDS } from "./text";
import { listByokDescriptors } from "./registry";
import { LOCALES } from "@/lib/i18n/locales";
import { getTranslator } from "@/lib/i18n/messages";

/**
 * A provider description is what a customer reads before deciding to hand over
 * an API key, so it is worth holding to the same standard as the rest of the
 * product's words rather than leaving it in English under a translated heading.
 */
describe("provider descriptions", () => {
  it("describes every registered provider", () => {
    for (const descriptor of listByokDescriptors()) {
      expect(DESCRIBED_PROVIDER_IDS, `${descriptor.id} has no catalog key`).toContain(descriptor.id);
    }
  });

  it("describes nothing that is no longer registered", () => {
    const live = new Set(listByokDescriptors().map((descriptor) => descriptor.id));
    for (const id of DESCRIBED_PROVIDER_IDS) {
      expect(live.has(id), `${id} is described but not registered`).toBe(true);
    }
  });

  it("resolves a description in every language", () => {
    for (const descriptor of listByokDescriptors()) {
      const key = providerSummaryKey(descriptor.id)!;
      for (const { code } of LOCALES) {
        const text = getTranslator(code).t("integrations", key);
        expect(text, `${descriptor.id} is missing in ${code}`).not.toBe(key);
        expect(text.trim().length, `${descriptor.id} is empty in ${code}`).toBeGreaterThan(20);
      }
    }
  });

  it("keeps the English identical to the adapter's own summary", () => {
    // Two copies of the same sentence: one for the page, one carried by the
    // adapter as the fallback. If they drift, the fallback silently starts
    // saying something different from the translation it stands in for.
    const t = getTranslator("en");
    for (const descriptor of listByokDescriptors()) {
      expect(t.t("integrations", providerSummaryKey(descriptor.id)!), `${descriptor.id} drifted`).toBe(descriptor.summary);
    }
  });

  it("falls back to English for a provider the catalog does not know", () => {
    expect(providerSummaryKey("not_a_provider")).toBeNull();
  });

  it("does not translate the providers' own product names", () => {
    // AbuseIPDB and Censys are other companies' products, and route53:List-
    // HostedZones is an API permission. A translated one sends a customer
    // looking for a key, or a permission, that does not exist.
    const mustSurvive: Array<[string, string]> = [
      ["abuseipdb", "AbuseIPDB"],
      ["greynoise", "GreyNoise"],
      ["securitytrails", "SecurityTrails"],
      ["virustotal", "VirusTotal"],
      ["openai", "OpenAI"],
      ["censys", "Censys"],
      ["hibp", "HIBP"],
      ["aws", "route53:ListHostedZones"],
      ["m365", "Domain.Read.All"],
      ["gcp", "DNS Reader"],
    ];
    for (const { code } of LOCALES) {
      const t = getTranslator(code);
      for (const [id, literal] of mustSurvive) {
        const text = t.t("integrations", providerSummaryKey(id)!);
        expect(text, `${code}/${id} lost "${literal}"`).toContain(literal);
      }
    }
  });
});
