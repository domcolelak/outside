import { NextResponse } from "next/server";
import { getStore } from "@/lib/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health/readiness probe. Reports which optional capabilities are configured
 * (never leaks secret values) and whether persistence is durable.
 */
export async function GET() {
  const store = await getStore();
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    persistence: store.durable ? "durable" : "in-memory",
    capabilities: {
      database: !!process.env.DATABASE_URL,
      ai: !!process.env.ANTHROPIC_API_KEY,
      email: !!process.env.RESEND_API_KEY,
      billing: !!process.env.STRIPE_SECRET_KEY,
      scheduler: !!process.env.CRON_SECRET,
    },
  });
}
