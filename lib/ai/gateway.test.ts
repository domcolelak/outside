import { afterEach, describe, expect, it, vi } from "vitest";
import { executeModelCall, redactForModel, estimateMaxCostUsd, gatewayConfigured, ModelBudgetError } from "./gateway";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function okResponse(content = "Model output.") {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 40 } }), { status: 200 });
}

describe("redaction", () => {
  it("strips secret- and PII-shaped substrings", () => {
    const out = redactForModel("key sk-abcdEFGH12345678 token Bearer abcdefgh123456 hash deadbeefdeadbeefdeadbeefdeadbeef mail a@b.com");
    expect(out).not.toContain("sk-abcdEFGH12345678");
    expect(out).not.toContain("deadbeefdeadbeefdeadbeefdeadbeef");
    expect(out).not.toContain("a@b.com");
    expect(out).toContain("[redacted-secret]");
    expect(out).toContain("[redacted-email]");
  });
});

describe("cost estimation + budget", () => {
  it("estimates a worst-case cost that grows with tokens", () => {
    const small = estimateMaxCostUsd("gpt-4o-mini", 400, 100);
    const big = estimateMaxCostUsd("gpt-4o-mini", 400, 4000);
    expect(big).toBeGreaterThan(small);
  });

  it("rejects a call whose worst-case cost exceeds the budget, before any network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(executeModelCall({
      taskType: "t", promptVersion: "v1", system: "s", user: "u", maxTokens: 100_000, maxCostUsd: 0.0001, apiKey: "sk-test",
    })).rejects.toBeInstanceOf(ModelBudgetError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("gateway execution", () => {
  it("throws when no provider key is configured", async () => {
    vi.unstubAllEnvs();
    const had = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
    try {
      expect(gatewayConfigured()).toBe(false);
      await expect(executeModelCall({ taskType: "t", promptVersion: "v1", system: "s", user: "u", maxTokens: 100 })).rejects.toThrow(/not configured/);
    } finally { if (had) process.env.OPENAI_API_KEY = had; }
  });

  it("returns model text with token + cost accounting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse("Custom output.")));
    const r = await executeModelCall({ taskType: "t", promptVersion: "v1", system: "s", user: "u", maxTokens: 200, apiKey: "sk-test", model: "gpt-4o-mini" });
    expect(r.text).toBe("Custom output.");
    expect(r.promptTokens).toBe(120);
    expect(r.completionTokens).toBe(40);
    expect(r.costUsd).toBeCloseTo((120 / 1000) * 0.00015 + (40 / 1000) * 0.0006, 8);
  });

  it("redacts the outgoing prompt so secrets never reach the provider", async () => {
    let sentBody = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { sentBody = String(init.body); return okResponse(); }));
    await executeModelCall({ taskType: "t", promptVersion: "v1", system: "system", user: "leaked sk-SECRETSECRET12345 here", maxTokens: 100, apiKey: "sk-test" });
    expect(sentBody).not.toContain("sk-SECRETSECRET12345");
    expect(sentBody).toContain("[redacted-secret]");
  });
});
