import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function decodeKey(configured: string): Buffer {
  const key = /^[a-f0-9]{64}$/i.test(configured) ? Buffer.from(configured, "hex") : Buffer.from(configured, "base64");
  if (key.length !== 32) throw new Error("ENTERPRISE_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}
function encryptionKeys(): Buffer[] { const current = process.env.ENTERPRISE_ENCRYPTION_KEY?.trim(); if (!current) throw new Error("ENTERPRISE_ENCRYPTION_KEY is required for enterprise secrets."); return [current, ...(process.env.ENTERPRISE_ENCRYPTION_KEY_PREVIOUS ?? "").split(",").map((item) => item.trim()).filter(Boolean)].map(decodeKey); }

export function encryptEnterpriseSecret(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeys()[0]!, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptEnterpriseSecret<T>(value: string): T {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Enterprise secret is malformed.");
  for (const key of encryptionKeys()) try { const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url")); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")) as T; } catch { /* try the next rotation key */ }
  throw new Error("Enterprise secret authentication failed.");
}

export const secretHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function safeHashEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function opaqueToken(prefix: "out_enterprise" | "out_scim"): { token: string; prefix: string; hash: string } {
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, prefix.length + 9), hash: secretHash(token) };
}
