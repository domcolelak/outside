const DEVELOPMENT_AUTH_SECRET = "outside-dev-auth-secret-change-me";
const DEVELOPMENT_VERIFY_SECRET = "outside-dev-verify-secret";
const MIN_SECRET_BYTES = 32;

function requiredSecret(name: string, developmentFallback: string): string {
  const value = process.env[name]?.trim();
  if (value && Buffer.byteLength(value, "utf8") >= MIN_SECRET_BYTES) return value;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be configured with at least ${MIN_SECRET_BYTES} bytes in production.`);
  }
  return developmentFallback;
}

/** Session/OAuth signing secret. Production deliberately has no fallback. */
export function authSecret(): string {
  return requiredSecret("AUTH_SECRET", DEVELOPMENT_AUTH_SECRET);
}

/** Current secret first, followed by optional rotation secrets used only to verify. */
export function authVerificationSecrets(): string[] {
  const current = authSecret();
  const previous = (process.env.AUTH_SECRET_PREVIOUS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => Buffer.byteLength(value, "utf8") >= MIN_SECRET_BYTES);
  return [current, ...previous.filter((value) => value !== current)];
}

/** Domain-verification signing secret. Production deliberately has no fallback. */
export function verificationSecret(): string {
  return requiredSecret("OUTSIDE_VERIFY_SECRET", DEVELOPMENT_VERIFY_SECRET);
}
