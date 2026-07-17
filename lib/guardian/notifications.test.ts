import dns from "node:dns/promises";
import https from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateGuardianChannelConfig } from "./channel-config";
import { decryptGuardianConfig, encryptGuardianConfig } from "./crypto";
import { alertableGuardianEvents } from "./notifications";
import type { GuardianEvent } from "./types";
import { InMemoryGuardianStore } from "./memory-store";
import { safeGuardianPost } from "./transport";

function event(id: string, severity: GuardianEvent["severity"], category: GuardianEvent["category"] = "surface"): GuardianEvent {
  return { id, orgId: "o", target: "acme.com", scanId: "s", type: "asset_new", category, severity, confidence: 1, title: id, summary: id, why: id, affectedAssets: [id], evidence: [], groupKey: id, observedAt: "2026-01-01T00:00:00.000Z" };
}

afterEach(() => { delete process.env.GUARDIAN_ENCRYPTION_KEY; });

describe("Guardian integrations", () => {
  it("encrypts channel secrets with authenticated encryption", () => {
    process.env.GUARDIAN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptGuardianConfig({ token: "sensitive" });
    expect(encrypted).not.toContain("sensitive");
    expect(decryptGuardianConfig<{ token: string }>(encrypted)).toEqual({ token: "sensitive" });
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString("base64url");
    expect(() => decryptGuardianConfig(parts.join("."))).toThrow();
  });

  it("rejects provider mismatch and private webhook endpoints", () => {
    expect(() => validateGuardianChannelConfig("slack", { url: "https://example.com/hook" })).toThrow(/provider/);
    expect(() => validateGuardianChannelConfig("webhook", { url: "https://127.0.0.1/hook" })).toThrow(/Private/);
    expect(validateGuardianChannelConfig("github_issues", { owner: "outside", repo: "security", token: "secret" }).destinationHint).toBe("outside/security");
  });

  it("revalidates DNS and refuses private resolution before delivery", async () => {
    const lookup = vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    const request = vi.spyOn(https, "request");
    await expect(safeGuardianPost({ url: "https://events.example.com/guardian", body: "{}" })).rejects.toThrow(/public/);
    expect(request).not.toHaveBeenCalled();
    lookup.mockRestore(); request.mockRestore();
  });

  it("groups high severity immediately and medium severity only by threshold", () => {
    const selected = alertableGuardianEvents([event("high", "high"), event("m1", "medium"), event("m2", "medium"), event("i", "info"), event("m3", "medium", "mail"), event("m4", "medium", "mail"), event("m5", "medium", "mail")]);
    expect(selected.map((row) => row.id)).toEqual(["high", "m3", "m4", "m5"]);
  });

  it("deduplicates queued deliveries across crash recovery", async () => {
    const store = new InMemoryGuardianStore();
    const input = { idempotencyKey: "guardian:event:o:s:email:owner@example.com", orgId: "o", channelId: null, channelType: "email" as const, target: "acme.com", kind: "event_group" as const, itemCount: 1, payload: { to: "owner@example.com" } };
    const first = await store.queueDelivery(input);
    const second = await store.queueDelivery(input);
    expect(second.id).toBe(first.id);
    expect((await store.overview("o")).deliveries).toHaveLength(1);
  });
});
