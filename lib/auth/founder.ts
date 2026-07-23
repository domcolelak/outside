import type { SessionContext } from "./model";

/**
 * Evolution is a SYSTEM control plane, not a customer feature: its decisions and
 * calibration are product-wide, so it must be restricted to the product owner —
 * never inferred from ordinary customer RBAC. Membership is an explicit email
 * allowlist (OUTSIDE_FOUNDER_EMAILS, comma-separated).
 *
 * Safe default when the allowlist is unset: locked in production (no one is a
 * founder), open in development so local work is unhindered.
 */
export function founderEmails(): Set<string> {
  return new Set(
    (process.env.OUTSIDE_FOUNDER_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isFounder(ctx: SessionContext | null): boolean {
  if (!ctx) return false;
  const allow = founderEmails();
  if (allow.size === 0) return process.env.NODE_ENV !== "production";
  return allow.has(ctx.user.email.toLowerCase());
}
