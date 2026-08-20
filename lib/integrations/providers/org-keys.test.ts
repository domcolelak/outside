import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/log", () => ({ operationalLog: () => {} }));

// The credential store shares Guardian's AES helper, which needs a real key.
vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));

import { loadOrgProviderKeys, withOrgProviderKeys, recordScanProviderUsage } from "./org-keys";
import { providerKey } from "@/lib/integrations/credential-context";
import { saveProviderKey, __resetConnections } from "@/lib/integrations/connections";
import type { IntegrationProvider } from "@/lib/integrations/connections";
import { providerUsageSummary, __resetProviderUsage } from "./telemetry";
import { getProvider, listProviders } from "./registry";
import { hibpConfigured } from "@/lib/intel/providers";
import { securityTrailsConfigured, passiveDnsEnabled } from "@/lib/discovery/passive-dns";

const ORG_A = "org_a";
const ORG_B = "org_b";

beforeEach(() => {
  __resetConnections();
  __resetProviderUsage();
  vi.unstubAllEnvs();
  vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));
});

describe("loadOrgProviderKeys", () => {
  it("is empty without an organization", async () => {
    expect((await loadOrgProviderKeys(null)).size).toBe(0);
  });

  it("maps a stored credential onto the env var the scan pipeline reads", async () => {
    await saveProviderKey(ORG_A, "hibp", "a".repeat(32), "user_1");
    expect((await loadOrgProviderKeys(ORG_A)).get("HIBP_API_KEY")).toBe("a".repeat(32));
  });

  it("does not leak one organization's credential into another", async () => {
    await saveProviderKey(ORG_A, "hibp", "a".repeat(32), "user_1");
    expect((await loadOrgProviderKeys(ORG_B)).size).toBe(0);
  });
});

describe("withOrgProviderKeys", () => {
  it("makes the organization's key the effective key inside the scan", async () => {
    vi.stubEnv("HIBP_API_KEY", "platform-key");
    await saveProviderKey(ORG_A, "hibp", "b".repeat(32), "user_1");

    expect(providerKey("HIBP_API_KEY")).toBe("platform-key");
    await withOrgProviderKeys(ORG_A, async () => {
      expect(providerKey("HIBP_API_KEY")).toBe("b".repeat(32));
      // The intel layer's gate must see the organization's key too.
      expect(hibpConfigured()).toBe(true);
    });
    // The context does not leak out of the scan.
    expect(providerKey("HIBP_API_KEY")).toBe("platform-key");
  });

  it("falls back to the platform key for a provider the organization has not connected", async () => {
    vi.stubEnv("ABUSEIPDB_API_KEY", "platform-abuse");
    await saveProviderKey(ORG_A, "hibp", "c".repeat(32), "user_1");
    await withOrgProviderKeys(ORG_A, async () => {
      expect(providerKey("ABUSEIPDB_API_KEY")).toBe("platform-abuse");
    });
  });

  it("enables a provider for an organization even when the platform has no key at all", async () => {
    expect(hibpConfigured()).toBe(false);
    await saveProviderKey(ORG_A, "hibp", "d".repeat(32), "user_1");
    await withOrgProviderKeys(ORG_A, async () => {
      expect(hibpConfigured()).toBe(true);
    });
  });

  it("carries every connected provider, not just one, through the same mechanism", async () => {
    await saveProviderKey(ORG_A, "hibp", "a".repeat(32), "user_1");
    await saveProviderKey(ORG_A, "securitytrails", "st-key-abcdefghijkl", "user_1");
    await withOrgProviderKeys(ORG_A, async () => {
      expect(providerKey("HIBP_API_KEY")).toBe("a".repeat(32));
      expect(providerKey("SECURITYTRAILS_API_KEY")).toBe("st-key-abcdefghijkl");
      // Both discovery gates flip on from the organization's own credentials.
      expect(hibpConfigured()).toBe(true);
      expect(securityTrailsConfigured()).toBe(true);
      expect(passiveDnsEnabled()).toBe(true);
    });
  });

  it("runs the scan unchanged for an anonymous (no organization) scan", async () => {
    vi.stubEnv("HIBP_API_KEY", "platform-key");
    await withOrgProviderKeys(null, async () => {
      expect(providerKey("HIBP_API_KEY")).toBe("platform-key");
    });
  });

  it("fails closed instead of substituting a platform key when a connected credential cannot be decrypted", async () => {
    vi.stubEnv("HIBP_API_KEY", "platform-key");
    await saveProviderKey(ORG_A, "hibp", "z".repeat(32), "user_1");
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "e".repeat(64));

    await withOrgProviderKeys(ORG_A, async ({ providerIds }) => {
      expect(providerKey("HIBP_API_KEY")).toBeUndefined();
      expect(providerIds.has("hibp")).toBe(false);
    });
  });
});

describe("provider credential declarations", () => {
  it("keeps every registry key aligned with its provider definition", () => {
    const providers = listProviders();
    expect(new Set(providers.map((provider) => provider.id)).size).toBe(providers.length);
    for (const provider of providers) expect(getProvider(provider.id)).toBe(provider);
  });

  it("declares every environment variable, including every field of paired credentials", () => {
    const all = new Set<string>();
    for (const provider of listProviders()) {
      const names = provider.envKeys ?? [provider.envKey];
      expect(names).toContain(provider.envKey);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(all.has(name), `${name} is assigned to more than one provider`).toBe(false);
        all.add(name);
      }
    }
  });
});

describe("recordScanProviderUsage", () => {
  it("meters a provider that actually ran on the organization's own key", async () => {
    await saveProviderKey(ORG_A, "hibp", "e".repeat(32), "user_1");
    await recordScanProviderUsage(ORG_A, [{ provider: "HaveIBeenPwned", status: "ok" }], new Set<IntegrationProvider>(["hibp"]));
    expect(await providerUsageSummary(ORG_A, "hibp")).toMatchObject({ total: 1, failures: 0 });
  });

  it("records a failed provider run as a failure", async () => {
    await saveProviderKey(ORG_A, "hibp", "e".repeat(32), "user_1");
    await recordScanProviderUsage(ORG_A, [{ provider: "HaveIBeenPwned", status: "error" }], new Set<IntegrationProvider>(["hibp"]));
    expect(await providerUsageSummary(ORG_A, "hibp")).toMatchObject({ total: 1, failures: 1 });
  });

  it("does not meter a provider the organization has not connected (platform key ran it)", async () => {
    await recordScanProviderUsage(ORG_A, [{ provider: "HaveIBeenPwned", status: "ok" }], new Set());
    expect(await providerUsageSummary(ORG_A, "hibp")).toMatchObject({ total: 0 });
  });

  it("meters each connected provider separately from one scan's runs", async () => {
    await saveProviderKey(ORG_A, "hibp", "e".repeat(32), "user_1");
    await saveProviderKey(ORG_A, "securitytrails", "st-key-abcdefghijkl", "user_1");
    await recordScanProviderUsage(ORG_A, [
      { provider: "HaveIBeenPwned", status: "ok" },
      { provider: "SecurityTrails", status: "error" },
    ], new Set<IntegrationProvider>(["hibp", "securitytrails"]));
    expect(await providerUsageSummary(ORG_A, "hibp")).toMatchObject({ total: 1, failures: 0 });
    expect(await providerUsageSummary(ORG_A, "securitytrails")).toMatchObject({ total: 1, failures: 1 });
  });

  it("meters every provider the scan pipeline can actually report", async () => {
    // These are the exact strings lib/discovery and lib/intel push as
    // ProviderRun.provider. Usage attribution is a match on that string against
    // ProviderDefinition.runLabel, held together by nothing but two literals in
    // unrelated files — rename either side and metering stops silently. This
    // pins the seam from the consuming end.
    const directScanProviders = new Set<IntegrationProvider>([
      "hibp", "securitytrails", "shodan", "abuseipdb", "greynoise", "virustotal", "censys",
    ]);
    const metered = listProviders().filter((provider) => directScanProviders.has(provider.id) || !!provider.ownedDomains);
    const ids = metered.map((provider) => provider.id);
    const emitted = metered.map((provider) => provider.runLabel);

    for (const id of ids) await saveProviderKey(ORG_A, id, "k".repeat(32), "user_1");
    await recordScanProviderUsage(ORG_A, emitted.map((provider) => ({ provider, status: "ok" })), new Set(ids));

    for (const id of ids) {
      expect((await providerUsageSummary(ORG_A, id)).total, `${id} was not metered`).toBe(1);
    }
  });

  it("ignores providers that are not in the registry", async () => {
    await saveProviderKey(ORG_A, "hibp", "e".repeat(32), "user_1");
    await recordScanProviderUsage(ORG_A, [{ provider: "crt.sh", status: "ok" }], new Set<IntegrationProvider>(["hibp"]));
    expect(await providerUsageSummary(ORG_A, "hibp")).toMatchObject({ total: 0 });
  });

  it("does not meter a connected provider whose credential was blocked", async () => {
    await saveProviderKey(ORG_A, "hibp", "e".repeat(32), "user_1");
    await recordScanProviderUsage(ORG_A, [{ provider: "HaveIBeenPwned", status: "ok" }], new Set());
    expect(await providerUsageSummary(ORG_A, "hibp")).toMatchObject({ total: 0 });
  });
});
