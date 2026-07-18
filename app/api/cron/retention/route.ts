import { NextRequest, NextResponse } from "next/server";
import { runGuardianRetention } from "@/lib/guardian/retention";
import { authorizeCronHeader } from "@/lib/security/cron-auth";
import { runOperationalCleanup } from "@/lib/operations/cleanup";
import { operationalLog } from "@/lib/observability/log";

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
    const now = new Date();
    const [guardian, operational] = await Promise.all([
      runGuardianRetention(now, batchSize, maxBatches),
      runOperationalCleanup(now, batchSize),
    ]);
    return NextResponse.json({ ranAt: now.toISOString(), ...guardian, operational });
  } catch (error) {
    operationalLog("error", "retention.run_failed", {}, error);
    return NextResponse.json({ error: "Guardian retention failed" }, { status: 500 });
  }
}
