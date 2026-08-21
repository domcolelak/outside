import { NextResponse } from "next/server";
import { CAPABILITIES } from "@/lib/capabilities/registry";
import { REMEDIATION_CAPABILITIES, remediationCoverage } from "@/lib/capabilities/remediation";

export const runtime = "nodejs";

/**
 * Read-only capability inventory: what OUTSIDE can detect, what it can do about
 * it, and whether a capability needs an operator key to activate. Non-sensitive
 * by design — it describes the product's abilities, never this instance's
 * configured keys.
 *
 * The remediation half is deliberately published: a claim that OUTSIDE can fix
 * and verify something should be checkable by anyone evaluating the product,
 * not only visible to whoever is logged in.
 */
export function GET() {
  return NextResponse.json(
    {
      version: 1,
      count: CAPABILITIES.length,
      capabilities: CAPABILITIES,
      remediation: REMEDIATION_CAPABILITIES,
      remediationCoverage: remediationCoverage(),
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
