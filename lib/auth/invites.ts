import { createHash } from "node:crypto";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function inviteExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}
