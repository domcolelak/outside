import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret, authVerificationSecrets } from "@/lib/config/secrets";

const MAX_AGE_SECONDS = 24 * 60 * 60;

export function issueEmailVerification(userId: string, email: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, email: email.toLowerCase(), exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyEmailVerification(token: string): { uid: string; email: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const actual = Buffer.from(signature);
  const valid = authVerificationSecrets().some((secret) => {
    const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url"));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  if (!valid) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; email?: string; exp?: number };
    if (!parsed.uid || !parsed.email || typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: parsed.uid, email: parsed.email.toLowerCase() };
  } catch {
    return null;
  }
}
