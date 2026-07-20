import { NextResponse } from "next/server";
import { getStore } from "@/lib/persistence";
import { databaseReady } from "@/lib/db/prisma";
import { operationalLog } from "@/lib/observability/log";
import { releaseInfo } from "@/lib/config/build-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health/readiness probe. Reports which optional capabilities are configured
 * (never leaks secret values) and whether persistence is durable.
 */
export async function GET() {
  try {
    const store = await getStore();
    const database = !process.env.DATABASE_URL || await databaseReady();
    return NextResponse.json({
    status: database ? "ok" : "unready",
    time: new Date().toISOString(),
    release: releaseInfo(),
    persistence: store.durable ? "durable" : "in-memory",
    capabilities: {
      database: { configured: !!process.env.DATABASE_URL, ready: database },
      ai: !!process.env.OPENAI_API_KEY,
      threatIntel: !!process.env.ABUSEIPDB_API_KEY || !!process.env.HIBP_API_KEY,
      email: !!process.env.RESEND_API_KEY,
      billing: !!process.env.STRIPE_SECRET_KEY,
      scheduler: !!process.env.CRON_SECRET,
      guardianIntegrations: !!process.env.GUARDIAN_ENCRYPTION_KEY,
    },
    }, { status: database ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch (error) {
    operationalLog("error", "health.readiness_failed", {}, error);
    return NextResponse.json({ status: "unready", time: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
