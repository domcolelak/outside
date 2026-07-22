import { NextResponse } from "next/server";
import { CAPABILITIES } from "@/lib/capabilities/registry";

export const runtime = "nodejs";

/**
 * Read-only capability inventory: what OUTSIDE can detect, how, and whether a
 * capability needs an operator key to activate. Non-sensitive by design — it
 * describes the product's abilities, never this instance's configured keys.
 */
export function GET() {
  return NextResponse.json(
    {
      version: 1,
      count: CAPABILITIES.length,
      capabilities: CAPABILITIES,
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
