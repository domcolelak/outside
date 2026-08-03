import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function decodeEncryptionKey(name: string, configured: string): Buffer {
  const key = /^[a-f0-9]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes.`);
  return key;
}

function encryptionKeys(): Buffer[] {
  const configured = process.env.GUARDIAN_ENCRYPTION_KEY?.trim();
  if (!configured) throw new Error("GUARDIAN_ENCRYPTION_KEY is required for Guardian integrations.");
  const values = [
    configured,
    ...(process.env.GUARDIAN_ENCRYPTION_KEY_PREVIOUS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ];
  const unique = new Map<string, Buffer>();
  values.forEach((value, index) => {
    const key = decodeEncryptionKey(index === 0 ? "GUARDIAN_ENCRYPTION_KEY" : "GUARDIAN_ENCRYPTION_KEY_PREVIOUS", value);
    unique.set(key.toString("hex"), key);
  });
  return [...unique.values()];
}

export function encryptGuardianConfig(value: unknown, associatedData?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeys()[0]!, iv);
  if (associatedData) cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const version = associatedData ? "v2" : "v1";
  return `${version}.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export interface DecryptedGuardianConfig<T> {
  value: T;
  /** The stored ciphertext format: v2 is bound to its tenant via associated data. */
  version: "v1" | "v2";
  /**
   * True when the ciphertext only opened under a GUARDIAN_ENCRYPTION_KEY_PREVIOUS
   * entry rather than the current primary key. Callers use this to re-encrypt on
   * read, which is what lets a key rotation actually finish — without it the old
   * key could never be retired.
   */
  staleKey: boolean;
}

/**
 * Decrypt and report how the ciphertext was stored. Prefer this at call sites
 * that are able to write the value back, so credentials migrate onto the current
 * key and the current format as they are used.
 */
export function decryptGuardianConfigDetailed<T>(value: string, associatedData?: string): DecryptedGuardianConfig<T> {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if ((version !== "v1" && version !== "v2") || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Guardian integration configuration is malformed.");
  }
  if (version === "v2" && !associatedData) throw new Error("Guardian integration configuration requires associated data.");

  const keys = encryptionKeys();
  for (const [index, key] of keys.entries()) {
    let plain: string;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
      if (version === "v2") decipher.setAAD(Buffer.from(associatedData!, "utf8"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      plain = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      continue; // Authentication failed under this key — try the next rotation key.
    }
    // Parsing happens outside the catch: a decrypted-but-unparseable payload is
    // data corruption, not a wrong key, and must not be reported as one.
    return { value: JSON.parse(plain) as T, version, staleKey: index > 0 };
  }
  throw new Error("Guardian integration configuration cannot be decrypted with the configured keys.");
}

export function decryptGuardianConfig<T>(value: string, associatedData?: string): T {
  return decryptGuardianConfigDetailed<T>(value, associatedData).value;
}
