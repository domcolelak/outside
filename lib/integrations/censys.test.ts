import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { splitCensysCredential, joinCensysCredential, looksLikeCensysCredential, verifyKey } from "./censys";
import { censysProvider } from "./providers/censys";

vi.mock("@/lib/observability/log", () => ({ operationalLog: () => {} }));
vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));

import { loadOrgProviderKeys } from "./providers/org-keys";
import { saveProviderKey, __resetConnections } from "./connections";

afterEach(() => vi.restoreAllMocks());

const ID = "11111111-2222-3333-4444-555555555555";
const SECRET = "abcdefghijklmnop";

describe("pair credential encoding", () => {
  it("round-trips an id and secret through a single stored value", () => {
    const stored = joinCensysCredential(ID, SECRET);
    expect(splitCensysCredential(stored)).toEqual({ id: ID, secret: SECRET });
  });

  it("keeps a secret containing colons intact — only the first colon splits", () => {
    expect(splitCensysCredential(`${ID}:aa:bb:cc`)).toEqual({ id: ID, secret: "aa:bb:cc" });
  });

  it("rejects a half-filled or malformed pair", () => {
    expect(splitCensysCredential("no-separator")).toBeNull();
    expect(splitCensysCredential(":only-secret")).toBeNull();
    expect(splitCensysCredential(`${ID}:`)).toBeNull();
    expect(looksLikeCensysCredential("short:x")).toBe(false);
    expect(looksLikeCensysCredential(joinCensysCredential(ID, SECRET))).toBe(true);
  });
});

describe("verifyKey", () => {
  it("refuses a malformed pair before making any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyKey("missing-secret")).toMatchObject({ ok: false, code: "bad_format" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("authenticates with HTTP basic and reads the query allowance", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = ((init?.headers ?? {}) as Record<string, string>).authorization ?? "";
      expect(auth.startsWith("Basic ")).toBe(true);
      expect(Buffer.from(auth.slice(6), "base64").toString()).toBe(`${ID}:${SECRET}`);
      return new Response(JSON.stringify({ quota: { used: 12, allowance: 250 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyKey(joinCensysCredential(ID, SECRET))).toMatchObject({ ok: true, account: { used: 12, allowance: 250 } });
  });

  it("maps an invalid credential and never echoes either half", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const result = await verifyKey(joinCensysCredential(ID, SECRET));
    expect(result).toMatchObject({ ok: false, code: "invalid_key" });
    if (!result.ok) {
      expect(result.message).not.toContain(SECRET);
      expect(result.message).not.toContain(ID);
    }
  });
});

describe("environment expansion", () => {
  it("expands one stored pair into both variables the scan reads", () => {
    expect(censysProvider.expandEnv?.(joinCensysCredential(ID, SECRET))).toEqual({
      CENSYS_API_ID: ID,
      CENSYS_API_SECRET: SECRET,
    });
  });

  it("expands to nothing rather than half a credential when the value is malformed", () => {
    expect(censysProvider.expandEnv?.("broken")).toEqual({});
  });
});

describe("organization key loading", () => {
  beforeEach(() => {
    __resetConnections();
    vi.unstubAllEnvs();
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));
  });

  it("puts both Censys variables in scope from a single stored credential", async () => {
    await saveProviderKey("org_a", "censys", joinCensysCredential(ID, SECRET), "user_1");
    const keys = await loadOrgProviderKeys("org_a");
    expect(keys.get("CENSYS_API_ID")).toBe(ID);
    expect(keys.get("CENSYS_API_SECRET")).toBe(SECRET);
  });

  it("does not leak one organization's pair into another", async () => {
    await saveProviderKey("org_a", "censys", joinCensysCredential(ID, SECRET), "user_1");
    expect((await loadOrgProviderKeys("org_b")).size).toBe(0);
  });
});
