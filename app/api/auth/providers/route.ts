import { NextResponse } from "next/server";
import { googleConfigured } from "@/lib/auth/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which sign-in providers are configured (so the UI shows only usable options). */
export async function GET() {
  return NextResponse.json({ google: googleConfigured() });
}
