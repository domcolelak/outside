import { NextRequest, NextResponse } from "next/server";
import { runGuardianRetention } from "@/lib/guardian/retention";
import { authorizeCronHeader } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integerSetting(name: string, fallback: number): number {
  const configured = process.env[name]?.trim();
  if (!configured) return fallback;
  const value = Number(configured);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

export async function GET(req: NextRequest) {
  const authorization = authorizeCronHeader(req.headers.get("authorization"));
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  try {
    const batchSize = integerSetting("GUARDIAN_RETENTION_BATCH_SIZE", 2_000);
    const maxBatches = integerSetting("GUARDIAN_RETENTION_MAX_BATCHES", 10);
    return NextResponse.json({ ranAt: new Date().toISOString(), ...(await runGuardianRetention(new Date(), batchSize, maxBatches)) });
  } catch (error) {
    console.error("[guardian-retention] run failed", error);
    return NextResponse.json({ error: "Guardian retention failed" }, { status: 500 });
  }
}
