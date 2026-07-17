import { afterEach, describe, expect, it } from "vitest";
import { validateProductionEnvironment } from "./production";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

function validProduction() {
  Object.assign(process.env, {
    NODE_ENV: "production",
    OUTSIDE_STORAGE_MODE: "database",
    DATABASE_URL: "postgresql://outside:secret@db.example:5432/outside",
    APP_URL: "https://outside.example",
    AUTH_SECRET: "a".repeat(40),
    OUTSIDE_VERIFY_SECRET: "v".repeat(40),
    CRON_SECRET: "c".repeat(40),
    RESEND_API_KEY: "r".repeat(40),
    EMAIL_FROM: "OUTSIDE <alerts@outside.example>",
  });
}

describe("production environment", () => {
  it("accepts an independent durable baseline", () => { validProduction(); expect(() => validateProductionEnvironment()).not.toThrow(); });
  it("rejects localhost and ephemeral production", () => { validProduction(); process.env.APP_URL = "http://localhost:3000"; expect(() => validateProductionEnvironment()).toThrow(/canonical public HTTPS/); validProduction(); process.env.OUTSIDE_STORAGE_MODE = "memory"; expect(() => validateProductionEnvironment()).toThrow(/in-memory storage/); });
  it("rejects reused trust-boundary secrets", () => { validProduction(); process.env.OUTSIDE_VERIFY_SECRET = process.env.AUTH_SECRET; expect(() => validateProductionEnvironment()).toThrow(/independent/); });
  it("rejects partially configured billing", () => { validProduction(); process.env.STRIPE_SECRET_KEY = "sk_test_configured"; expect(() => validateProductionEnvironment()).toThrow(/STRIPE_WEBHOOK_SECRET/); });
  it("rejects malformed or equivalent encryption keys", () => {
    validProduction();
    process.env.GUARDIAN_ENCRYPTION_KEY = "not-a-32-byte-key";
    expect(() => validateProductionEnvironment()).toThrow(/exactly 32 bytes/);
    validProduction();
    process.env.GUARDIAN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("hex");
    process.env.ENTERPRISE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(() => validateProductionEnvironment()).toThrow(/must be independent/);
  });
});
