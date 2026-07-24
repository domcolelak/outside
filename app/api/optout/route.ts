import { NextRequest, NextResponse } from "next/server";
import { normalizeDomain, InvalidTargetError } from "@/lib/security/target";
import { isOptedOut, optOutInstructions } from "@/lib/security/optout";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public opt-out status and instructions for a domain.
 *
 * Deliberately unauthenticated and read-only: a domain owner who wants to be
 * left alone should not have to create an account first. Opting out is done by
 * publishing the DNS TXT record returned here, which only the domain's own DNS
 * operator can do — so this endpoint cannot be used to opt someone else's
 * domain out, or back in.
 */
export async function GET(req: NextRequest) {
  if (!(await rateLimit(`optout:${clientIdentity(req)}`, 30, 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const raw = new URL(req.url).searchParams.get("domain") ?? "";
  if (!raw) return NextResponse.json({ error: "domain is required" }, { status: 400 });

  let domain: string;
  try {
    domain = normalizeDomain(raw);
  } catch (error) {
    return NextResponse.json({ error: error instanceof InvalidTargetError ? error.message : "Invalid domain." }, { status: 400 });
  }

  const state = await isOptedOut(domain);
  return NextResponse.json(
    {
      domain,
      optedOut: state.optedOut,
      source: state.source ?? null,
      howToOptOut: optOutInstructions(domain),
      note: "Opting out removes the domain from anonymous scanning. An organization that has verified ownership of the domain can still scan and monitor it.",
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
