import { NextResponse } from "next/server";

/**
 * RFC 9116 security.txt.
 *
 * A researcher who finds something looks here first. Without it they guess an
 * address, or post publicly — which is the outcome a disclosure policy exists
 * to avoid. The policy page has said the same things for a while; this is the
 * machine-readable pointer to it.
 *
 * Expires is mandatory under the RFC and is computed rather than hard-coded, so
 * the file cannot quietly go stale the way a literal date would. A year is the
 * longest the RFC recommends.
 */

export const dynamic = "force-dynamic";

const CONTACT = "security@outsideguardian.eu";

function siteOrigin(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "https://outsideguardian.eu";
}

/** One year ahead, to the second, in the Zulu form the RFC requires. */
function expiry(now: Date): string {
  const next = new Date(now);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return `${next.toISOString().slice(0, 19)}Z`;
}

export async function GET() {
  const origin = siteOrigin();
  const body = [
    `Contact: mailto:${CONTACT}`,
    `Expires: ${expiry(new Date())}`,
    `Policy: ${origin}/security`,
    `Canonical: ${origin}/.well-known/security.txt`,
    // The languages a report can be written in are the languages the product
    // is written in; claiming more would leave a reporter waiting.
    "Preferred-Languages: en, sk, cs, hu, pl",
    "",
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Public, unauthenticated, and cheap — but short enough that a changed
      // contact address reaches researchers the same day.
      "cache-control": "public, max-age=3600",
    },
  });
}
