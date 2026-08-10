/**
 * Password hashing with scrypt (Node built-in — no native bcrypt dependency, so
 * it builds cleanly everywhere). Format: scrypt$<salt>$<hash>, both base64url.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, (err, derived) => (err ? reject(err) : resolve(derived)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("base64url")}$${dk.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64url");
  const expected = Buffer.from(parts[2]!, "base64url");
  const dk = await scryptAsync(password, salt);
  return expected.length === dk.length && timingSafeEqual(expected, dk);
}

/** Basic strength gate — enforced server-side at signup. */
export function passwordProblem(password: string): string | null {
  return passwordRejection(password)?.message ?? null;
}

/**
 * Why a password is unacceptable, as a stable code plus English wording.
 *
 * Too short and too long are different fixes for the person typing, so they get
 * different codes rather than one "weak password". The code is what the UI
 * translates; the message stays for API consumers and as the fallback.
 */
export function passwordRejection(password: string): { code: "password_too_short" | "password_too_long"; message: string } | null {
  if (typeof password !== "string" || password.length < 10) {
    return { code: "password_too_short", message: "Password must be at least 10 characters." };
  }
  if (password.length > 200) return { code: "password_too_long", message: "Password is too long." };
  return null;
}
