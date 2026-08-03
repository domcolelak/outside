import { afterEach, describe, expect, it, vi } from "vitest";
import { directoryUserMatchesOidcSubject, makeSsoState, verifySsoState } from "./sso";
import type { EnterpriseDirectoryUser } from "./types";

afterEach(() => {
  vi.useRealTimers();
});

describe("enterprise SSO state (CSRF + open-redirect defense)", () => {
  it("round-trips a signed state and preserves a safe returnTo", () => {
    const state = makeSsoState("idp-1", "/enterprise/settings");
    const parsed = verifySsoState(state, state);
    expect(parsed?.idpId).toBe("idp-1");
    expect(parsed?.returnTo).toBe("/enterprise/settings");
    expect(parsed?.nonce).toBeTruthy();
  });

  it("neutralizes open-redirect returnTo values", () => {
    for (const evil of ["//evil.example", "https://evil.example", "http://x", "javascript:alert(1)", "evil"]) {
      const state = makeSsoState("idp-1", evil);
      expect(verifySsoState(state, state)?.returnTo).toBe("/enterprise");
    }
  });

  it("rejects a tampered signature", () => {
    const state = makeSsoState("idp-1");
    const [payload, sig] = state.split(".");
    const flipped = `${payload}.${sig!.slice(0, -1)}${sig!.at(-1) === "A" ? "B" : "A"}`;
    expect(verifySsoState(flipped, flipped)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const state = makeSsoState("idp-1");
    const forged = `${Buffer.from(JSON.stringify({ idpId: "attacker", nonce: "x", returnTo: "/", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url")}.${state.split(".")[1]}`;
    expect(verifySsoState(forged, forged)).toBeNull();
  });

  it("requires the cookie and the returned value to match (double-submit)", () => {
    const a = makeSsoState("idp-1");
    const b = makeSsoState("idp-2");
    expect(verifySsoState(a, b)).toBeNull();
    expect(verifySsoState(undefined, a)).toBeNull();
    expect(verifySsoState(a, null)).toBeNull();
    expect(verifySsoState("no-dot-token", "no-dot-token")).toBeNull();
  });

  it("rejects an expired state", () => {
    vi.useFakeTimers();
    const state = makeSsoState("idp-1");
    expect(verifySsoState(state, state)).not.toBeNull();
    vi.advanceTimersByTime(601_000); // past the 600s window
    expect(verifySsoState(state, state)).toBeNull();
  });
});

describe("enterprise SSO stable subject binding", () => {
  const directoryUser = {
    identityProviderId: "idp-1",
    externalId: "subject-a",
    attributes: {},
  } satisfies Pick<EnterpriseDirectoryUser, "identityProviderId" | "externalId" | "attributes">;

  it("accepts the subject already bound to the selected identity provider", () => {
    expect(directoryUserMatchesOidcSubject(directoryUser, "idp-1", "subject-a")).toBe(true);
  });

  it("rejects an email match carrying a different OIDC subject", () => {
    expect(directoryUserMatchesOidcSubject(directoryUser, "idp-1", "subject-b")).toBe(false);
  });

  it("fails closed for unbound records and a different provider", () => {
    expect(directoryUserMatchesOidcSubject({ ...directoryUser, externalId: null }, "idp-1", "subject-a")).toBe(false);
    expect(directoryUserMatchesOidcSubject(directoryUser, "idp-2", "subject-a")).toBe(false);
  });

  it("uses an explicit oidcSubject attribute when one is present", () => {
    const migrated = { ...directoryUser, externalId: "scim-object-id", attributes: { oidcSubject: "subject-a" } };
    expect(directoryUserMatchesOidcSubject(migrated, "idp-1", "subject-a")).toBe(true);
    expect(directoryUserMatchesOidcSubject(migrated, "idp-1", "scim-object-id")).toBe(false);
  });
});
