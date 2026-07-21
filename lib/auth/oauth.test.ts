import { describe, expect, it } from "vitest";
import { makeState, verifyState, googleConfigured } from "./oauth";

describe("Google OAuth state (CSRF defense)", () => {
  it("round-trips a signed state token", () => {
    const state = makeState();
    expect(verifyState(state, state)).toBe(true);
  });

  it("requires the cookie and query state to match (double-submit)", () => {
    const a = makeState();
    const b = makeState();
    expect(verifyState(a, b)).toBe(false);
    expect(verifyState(undefined, a)).toBe(false);
    expect(verifyState(a, null)).toBe(false);
  });

  it("rejects a tampered signature and malformed tokens", () => {
    const state = makeState();
    const [nonce, sig] = state.split(".");
    const flipped = `${nonce}.${sig!.slice(0, -1)}${sig!.at(-1) === "A" ? "B" : "A"}`;
    expect(verifyState(flipped, flipped)).toBe(false);
    expect(verifyState("no-dot", "no-dot")).toBe(false);
    expect(verifyState(`${nonce}.`, `${nonce}.`)).toBe(false);
  });

  it("reports Google as unconfigured without client credentials", () => {
    const hadId = process.env.GOOGLE_CLIENT_ID;
    const hadSecret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    try {
      expect(googleConfigured()).toBe(false);
    } finally {
      if (hadId !== undefined) process.env.GOOGLE_CLIENT_ID = hadId;
      if (hadSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = hadSecret;
    }
  });
});
