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
  if (typeof password !== "string" || password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}
