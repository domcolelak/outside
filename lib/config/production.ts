import { appUrl } from "./runtime";
import { authSecret, verificationSecret } from "./secrets";
import { storageMode } from "./storage";

const MIN_SECRET_BYTES = 32;

function required(name: string, minimum = MIN_SECRET_BYTES): string {
  const value = process.env[name]?.trim() ?? "";
  if (Buffer.byteLength(value, "utf8") < minimum) throw new Error(`${name} must contain at least ${minimum} bytes in production.`);
  return value;
}

function paired(left: string, right: string): void {
  if (Boolean(process.env[left]?.trim()) !== Boolean(process.env[right]?.trim())) throw new Error(`${left} and ${right} must be configured together.`);
}

function encryptionKey(name: string, value: string): Buffer {
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes.`);
  return key;
}

/** Fail before serving traffic when the production trust boundary is incomplete. */
export function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (storageMode() !== "database") throw new Error("Production must use durable database storage.");
  const url = new URL(appUrl());
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("APP_URL must be the canonical public HTTPS origin in production.");

  const auth = authSecret();
  const verify = verificationSecret();
  const cron = required("CRON_SECRET");
  const email = required("RESEND_API_KEY", 16);
  required("EMAIL_FROM", 3);
  if (new Set([auth, verify, cron, email]).size !== 4) throw new Error("Authentication, verification, cron, and email secrets must be independent.");

  paired("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  if (process.env.STRIPE_SECRET_KEY?.trim()) {
    required("STRIPE_WEBHOOK_SECRET", 16);
    required("STRIPE_PRICE_PROFESSIONAL", 8);
    required("STRIPE_PRICE_AGENCY", 8);
  } else if (["STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PROFESSIONAL", "STRIPE_PRICE_AGENCY"].some((name) => process.env[name]?.trim())) {
    throw new Error("STRIPE_SECRET_KEY is required when any Stripe configuration is present.");
  }

  if (process.env.ENTERPRISE_PROVISIONING_TOKEN?.trim()) {
    const encryption = required("ENTERPRISE_ENCRYPTION_KEY");
    encryptionKey("ENTERPRISE_ENCRYPTION_KEY", encryption);
    required("AUDIT_IP_SALT", 16);
    if ([auth, verify, cron, email].includes(encryption)) throw new Error("ENTERPRISE_ENCRYPTION_KEY must be independent from other production secrets.");
  }
  const enterprisePrevious = (process.env.ENTERPRISE_ENCRYPTION_KEY_PREVIOUS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const value of enterprisePrevious) encryptionKey("ENTERPRISE_ENCRYPTION_KEY_PREVIOUS", value);
  const guardianValue = process.env.GUARDIAN_ENCRYPTION_KEY?.trim();
  const enterpriseValue = process.env.ENTERPRISE_ENCRYPTION_KEY?.trim();
  const guardian = guardianValue ? encryptionKey("GUARDIAN_ENCRYPTION_KEY", guardianValue) : null;
  const enterprise = enterpriseValue ? encryptionKey("ENTERPRISE_ENCRYPTION_KEY", enterpriseValue) : null;
  if (guardian && enterprise && guardian.equals(enterprise)) throw new Error("Guardian and Enterprise encryption keys must be independent.");
}
