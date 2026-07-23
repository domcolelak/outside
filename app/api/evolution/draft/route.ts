import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { isFounder } from "@/lib/auth/founder";
import { currentKevIndex } from "@/lib/analysis/kev";
import { resolveProposal } from "@/lib/evolution/evolution";
import { prepareDraft } from "@/lib/evolution/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prepare the reviewable draft code change for an approved Evolution proposal.
 * Read-only: it resolves the proposal against the live KEV catalogue and returns
 * a KNOWN_VULNERABILITIES entry stub as text. It NEVER writes files, commits,
 * opens a PR, merges, or deploys — the founder reviews and opens the PR.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isFounder(ctx)) return NextResponse.json({ error: "Evolution is restricted to the product owner." }, { status: 403 });

  const proposalId = new URL(req.url).searchParams.get("proposalId") ?? "";
  if (!proposalId) return NextResponse.json({ error: "proposalId is required" }, { status: 400 });

  const kev = currentKevIndex();
  const target = resolveProposal(kev, proposalId);
  if (!target) return NextResponse.json({ error: "Unknown proposal" }, { status: 404 });

  const draft = prepareDraft({ proposalId, cveId: target.cveId, product: target.product, kev: kev.get(target.cveId) });
  return NextResponse.json({ draft }, { headers: { "cache-control": "private, no-store" } });
}
