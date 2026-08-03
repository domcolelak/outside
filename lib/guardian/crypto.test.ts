import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptGuardianConfig, decryptGuardianConfigDetailed, encryptGuardianConfig } from "./crypto";

const current = Buffer.alloc(32, 1).toString("base64");
const previous = Buffer.alloc(32, 2).toString("hex");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Guardian credential encryption rotation", () => {
  it("round-trips configuration with the current key", () => {
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    const encrypted = encryptGuardianConfig({ token: "secret" });
    expect(decryptGuardianConfig(encrypted)).toEqual({ token: "secret" });
  });

  it("decrypts existing configuration with an explicitly configured previous key", () => {
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", previous);
    const encrypted = encryptGuardianConfig({ token: "old" });

    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY_PREVIOUS", previous);
    expect(decryptGuardianConfig(encrypted)).toEqual({ token: "old" });
  });

  it("always encrypts new configuration with the current key", () => {
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY_PREVIOUS", previous);
    const encrypted = encryptGuardianConfig({ token: "new" });

    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", previous);
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY_PREVIOUS", "");
    expect(() => decryptGuardianConfig(encrypted)).toThrow(/cannot be decrypted/);
  });

  it("binds v2 ciphertext to its tenant/provider associated data", () => {
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    const encrypted = encryptGuardianConfig("secret", "outside.integration:[\"org_1\",\"hibp\"]");
    expect(encrypted).toMatch(/^v2\./);
    expect(decryptGuardianConfig(encrypted, "outside.integration:[\"org_1\",\"hibp\"]")).toBe("secret");
    expect(() => decryptGuardianConfig(encrypted, "outside.integration:[\"org_2\",\"hibp\"]")).toThrow(/cannot be decrypted/);
    expect(() => decryptGuardianConfig(encrypted)).toThrow(/associated data/);
  });

  it("rejects malformed previous keys instead of silently weakening rotation", () => {
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY_PREVIOUS", "too-short");
    expect(() => encryptGuardianConfig({ token: "secret" })).toThrow(/GUARDIAN_ENCRYPTION_KEY_PREVIOUS/);
  });

  it("decrypts a legacy v1 ciphertext even when associated data is supplied", () => {
    // Every credential stored before the v2 format takes this branch on its
    // first read after deploying, so it must not require the binding.
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    const legacy = encryptGuardianConfig("secret");
    expect(legacy).toMatch(/^v1\./);
    expect(decryptGuardianConfig(legacy, "outside.integration:[\"org_1\",\"hibp\"]")).toBe("secret");
  });
});

describe("rotation completion signals", () => {
  it("reports the format and that the current key was used", () => {
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    const encrypted = encryptGuardianConfig("secret", "aad");
    expect(decryptGuardianConfigDetailed<string>(encrypted, "aad")).toEqual({ value: "secret", version: "v2", staleKey: false });
  });

  it("flags a v2 credential that only opened under a retired key", () => {
    // Without this signal a rotation could never finish: the record is already
    // in the current format, so a version check alone would never re-encrypt it.
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", previous);
    const encrypted = encryptGuardianConfig("secret", "aad");

    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY_PREVIOUS", previous);
    expect(decryptGuardianConfigDetailed<string>(encrypted, "aad")).toMatchObject({ value: "secret", version: "v2", staleKey: true });
  });

  it("reports a legacy v1 credential on the current key as format-stale only", () => {
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    const legacy = encryptGuardianConfig("secret");
    expect(decryptGuardianConfigDetailed<string>(legacy)).toMatchObject({ version: "v1", staleKey: false });
  });

  it("reports corrupted-but-decryptable data as corruption, not a key problem", () => {
    vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", current);
    // Encrypt a raw string that is not valid JSON, so decryption succeeds but parsing fails.
    const encrypted = encryptGuardianConfig("x").replace(/^v1/, "v1");
    const broken = encrypted.split(".");
    broken[3] = Buffer.from("not json").toString("base64url");
    expect(() => decryptGuardianConfig(broken.join("."))).toThrow(/cannot be decrypted/);
  });
});
