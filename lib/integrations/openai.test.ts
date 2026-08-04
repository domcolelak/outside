import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyKey, looksLikeOpenAiKey } from "./openai";
import { openAiProvider } from "./providers/openai";

vi.mock("@/lib/observability/log", () => ({ operationalLog: () => {} }));
vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));

import { withOrgProviderKeys } from "./providers/org-keys";
import { saveProviderKey, __resetConnections } from "./connections";
import { providerKey } from "./credential-context";
import { gatewayConfigured } from "@/lib/ai/gateway";

afterEach(() => vi.restoreAllMocks());

const KEY = `sk-${"a".repeat(40)}`;

function stubModels(ids: string[], status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(status === 200 ? JSON.stringify({ data: ids.map((id) => ({ id })) }) : "", { status }),
    ),
  );
}

describe("OpenAI key format", () => {
  it("accepts an sk- key and rejects obvious rubbish", () => {
    expect(looksLikeOpenAiKey(KEY)).toBe(true);
    expect(looksLikeOpenAiKey("sk-short")).toBe(false);
    expect(looksLikeOpenAiKey("not-a-key-at-all-but-long-enough")).toBe(false);
    expect(looksLikeOpenAiKey(`sk-${"a".repeat(40)} trailing`)).toBe(false);
  });
});

describe("verifyKey", () => {
  it("authenticates with a bearer token and counts available models", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(((init?.headers ?? {}) as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
      return new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyKey(KEY)).toMatchObject({ ok: true, access: { modelCount: 2, hasDefaultModel: true } });
  });

  it("reports when the key cannot reach the model the gateway uses", async () => {
    stubModels(["gpt-3.5-turbo"]);
    expect(await verifyKey(KEY)).toMatchObject({ ok: true, access: { hasDefaultModel: false } });
  });

  it("maps failure statuses through the shared taxonomy", async () => {
    stubModels([], 401);
    expect(await verifyKey(KEY)).toMatchObject({ ok: false, code: "invalid_key" });
    stubModels([], 429);
    expect(await verifyKey(KEY)).toMatchObject({ ok: false, code: "rate_limited" });
    stubModels([], 503);
    expect(await verifyKey(KEY)).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("never leaks the key in the error message", async () => {
    stubModels([], 401);
    const result = await verifyKey("sk-super-secret-openai-key-value");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("super-secret-openai-key-value");
  });
});

describe("provider definition", () => {
  it("marks explanations unavailable when the default model is out of reach", async () => {
    stubModels(["gpt-3.5-turbo"]);
    const result = await openAiProvider.validate(KEY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const capability = result.capabilities.find((c) => c.id === "scan_explanations");
      expect(capability?.available).toBe(false);
      expect(capability?.detail).toContain("deterministic template");
    }
  });

  it("marks explanations available on a key that can reach the model", async () => {
    stubModels(["gpt-4o-mini"]);
    const result = await openAiProvider.validate(KEY);
    if (result.ok) {
      expect(result.capabilities.find((c) => c.id === "scan_explanations")?.available).toBe(true);
    }
  });
});

describe("the connected key is the one actually used", () => {
  beforeEach(() => {
    __resetConnections();
    vi.unstubAllEnvs();
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));
    // A developer machine may have a real platform key loaded; force the
    // starting state these assertions describe rather than inheriting it.
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  it("takes precedence over the platform key inside the organization context", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-platform-key");
    await saveProviderKey("org_a", "openai", KEY, "user_1");

    expect(providerKey("OPENAI_API_KEY")).toBe("sk-platform-key");
    await withOrgProviderKeys("org_a", async () => {
      expect(providerKey("OPENAI_API_KEY")).toBe(KEY);
      expect(gatewayConfigured()).toBe(true);
    });
    // The context does not leak back out.
    expect(providerKey("OPENAI_API_KEY")).toBe("sk-platform-key");
  });

  it("enables the hosted explainer for an organization even with no platform key", async () => {
    expect(gatewayConfigured()).toBe(false);
    await saveProviderKey("org_a", "openai", KEY, "user_1");
    await withOrgProviderKeys("org_a", async () => {
      expect(gatewayConfigured()).toBe(true);
    });
  });

  it("does not leak one organization's model key into another", async () => {
    await saveProviderKey("org_a", "openai", KEY, "user_1");
    await withOrgProviderKeys("org_b", async () => {
      expect(providerKey("OPENAI_API_KEY")).toBeUndefined();
    });
  });
});
