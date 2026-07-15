import { timingSafeEqual } from "node:crypto";

export interface CronAuthorization {
  ok: boolean;
  status: 200 | 401 | 503;
  error?: string;
}

/** Shared constant-time authorization for every scheduler endpoint. */
export function authorizeCronHeader(authorization: string | null): CronAuthorization {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  if (!expected || (process.env.NODE_ENV === "production" && Buffer.byteLength(expected) < 32)) {
    return { ok: false, status: 503, error: "A strong CRON_SECRET is not configured" };
  }
  const provided = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b)
    ? { ok: true, status: 200 }
    : { ok: false, status: 401, error: "Unauthorized" };
}
