import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability/log", () => ({ operationalLog: () => {} }));

// The credential store shares Guardian's AES helper, which needs a real key.
vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));

import { connectProvider, disconnectProvider, providerStatus } from "./service";
import type { ProviderDefinition, ProviderValidation } from "./types";
import { getConnectionToken, __resetConnections } from "@/lib/integrations/connections";
import { providerUsageSummary, __resetProviderUsage } from "./telemetry";
import { providerAuditTrail, __resetProviderAudit } from "./audit";

const ORG = "org_1";
const ACTOR = "user_1";

function makeDef(validate: (raw: string) => Promise<ProviderValidation>): ProviderDefinition {
  return {
    id: "hibp",
    name: "Stub",
    category: "threat_intel",
    summary: "",
    credentialKind: "api_key",
    docsUrl: "https://example.test",
    keyPlaceholder: "",
    formatHint: "Key must be at least 4 characters.",
    looksValid: (raw) => raw.length >= 4,
    validate: (raw) => validate(raw),
  };
}

const okValidate = async (): Promise<ProviderValidation> => ({ ok: true, accountLabel: "Plan X", capabilities: [{ id: "cap", label: "Cap", available: true, detail: "1 thing" }] });
const badValidate = async (): Promise<ProviderValidation> => ({ ok: false, code: "invalid_key", message: "Rejected", status: 401 });

beforeEach(() => {
  __resetConnections();
  __resetProviderUsage();
  __resetProviderAudit();
});

describe("connectProvider — save only after live validation", () => {
  it("rejects a bad format before any provider call and stores nothing", async () => {
    const def = makeDef(okValidate);
    const result = await connectProvider(def, ORG, "no", ACTOR);
    expect(result).toMatchObject({ ok: false, httpStatus: 400, code: "bad_format" });
    expect(await getConnectionToken(ORG, "hibp")).toBeNull();
    const usage = await providerUsageSummary(ORG, "hibp");
    expect(usage).toMatchObject({ total: 1, failures: 1, lastErrorCode: "bad_format" });
  });

  it("does not store a credential that fails live validation, but audits the attempt", async () => {
    const def = makeDef(badValidate);
    const result = await connectProvider(def, ORG, "abcd", ACTOR);
    expect(result).toMatchObject({ ok: false, httpStatus: 400, code: "invalid_key" });
    expect(await getConnectionToken(ORG, "hibp")).toBeNull();
    const trail = await providerAuditTrail(ORG, "hibp");
    expect(trail.map((e) => e.action)).toContain("validated");
    expect(trail.map((e) => e.action)).not.toContain("connected");
  });

  it("stores on success and reports capabilities, telemetry and audit", async () => {
    const def = makeDef(okValidate);
    const result = await connectProvider(def, ORG, "goodkey", ACTOR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toMatchObject({ connected: true, accountLabel: "Plan X" });
      expect(result.status.capabilities?.[0]).toMatchObject({ id: "cap", available: true });
    }
    expect(await getConnectionToken(ORG, "hibp")).toBe("goodkey");
    const trail = await providerAuditTrail(ORG, "hibp");
    expect(trail.map((e) => e.action)).toEqual(expect.arrayContaining(["validated", "connected"]));
  });

  it("audits a second successful connect as a replacement", async () => {
    const def = makeDef(okValidate);
    await connectProvider(def, ORG, "goodkey", ACTOR);
    await connectProvider(def, ORG, "goodkey2", ACTOR);
    const trail = await providerAuditTrail(ORG, "hibp");
    expect(trail.map((e) => e.action)).toContain("replaced");
  });
});

describe("providerStatus", () => {
  it("is not connected when nothing is stored", async () => {
    const def = makeDef(okValidate);
    expect(await providerStatus(def, ORG)).toMatchObject({ stored: false, connected: false });
  });

  it("re-validates a stored key and surfaces a live failure without deleting it", async () => {
    let good = true;
    const def = makeDef(async () => (good ? okValidate() : badValidate()));
    await connectProvider(def, ORG, "goodkey", ACTOR);
    good = false;
    const status = await providerStatus(def, ORG);
    expect(status).toMatchObject({ stored: true, connected: false, error: { code: "invalid_key" } });
    // The key is retained — a transient provider failure must not silently disconnect the customer.
    expect(await getConnectionToken(ORG, "hibp")).toBe("goodkey");
  });

  it("is blocked when the provider has a commercial gate", async () => {
    const def = { ...makeDef(okValidate), commercialGate: { reason: "Blocked pending licensing review." } };
    expect(await providerStatus(def, ORG)).toMatchObject({ blocked: { reason: "Blocked pending licensing review." } });
  });
});

describe("disconnectProvider", () => {
  it("removes the credential and audits it", async () => {
    const def = makeDef(okValidate);
    await connectProvider(def, ORG, "goodkey", ACTOR);
    await disconnectProvider(def, ORG, ACTOR);
    expect(await getConnectionToken(ORG, "hibp")).toBeNull();
    const trail = await providerAuditTrail(ORG, "hibp");
    expect(trail.map((e) => e.action)).toContain("disconnected");
  });
});
