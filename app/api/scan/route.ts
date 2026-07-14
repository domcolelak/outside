import { NextRequest } from "next/server";
import { runDemoScan, runPassiveScan, type Emit } from "@/lib/discovery/engine";
import { findDemoOrg, isDemoDomain } from "@/lib/demo";
import { InvalidTargetError, normalizeDomain } from "@/lib/security/target";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
import { createHash, randomUUID } from "node:crypto";
import { getStore } from "@/lib/persistence";
import { recordScan } from "@/lib/persistence/record";
import { buildPosture } from "@/lib/aegis/recommendations";
import { buildInvestigation } from "@/lib/aegis/investigation";
import { applyStoredRecommendationStatus } from "@/lib/aegis/store";
import type { ScanEvent } from "@/lib/types";
import { getSessionContext } from "@/lib/auth";
import { authorizedTargetOrg } from "@/lib/auth/target-access";
import { CapacityError, withConcurrency } from "@/lib/security/concurrency";
import { processGuardianScan } from "@/lib/guardian/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: ScanEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawTarget = url.searchParams.get("target") ?? "";
  const mode = url.searchParams.get("mode") ?? "auto"; // "auto" | "demo"

  const client = clientIdentity(req);
  const targetBudget = createHash("sha256").update(rawTarget.trim().toLowerCase()).digest("hex").slice(0, 24);
  const limit = await requireBudgets([
    { key: "scan:global", limit: 240, windowMs: 60_000 },
    { key: `scan:client:${client}`, limit: Number(process.env.OUTSIDE_SCANS_PER_MINUTE ?? 12), windowMs: 60_000 },
    { key: `scan:target:${targetBudget}`, limit: 20, windowMs: 60_000 },
  ]);
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded", retryAfter: limit.retryAfter }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(limit.retryAfter) },
    });
  }

  const scanId = `scan_${randomUUID()}`;
  const cancellation = new AbortController();
  const signal = AbortSignal.any([req.signal, cancellation.signal, AbortSignal.timeout(50_000)]);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit: Emit = (event) => {
        signal.throwIfAborted();
        controller.enqueue(encoder.encode(sse(event)));
      };
      try {
        await withConcurrency("scan:global", 8, 60_000, () => withConcurrency(`scan:target:${targetBudget}`, 2, 60_000, async () => {
        // Demo path: explicit demo mode, a known demo slug, or a demo domain.
        // Demo scans carry a synthetic change story and are NOT persisted.
        const demoOrg = findDemoOrg(rawTarget) ?? (mode === "demo" ? findDemoOrg("northstar") : null);
        if (demoOrg || isDemoDomain(rawTarget)) {
          const org = demoOrg ?? findDemoOrg(rawTarget)!;
          const result = await runDemoScan(org, scanId, emit);
          // Aegis: derive the protection posture + correlate findings into incidents.
          result.posture = buildPosture(result);
          result.investigation = buildInvestigation(result);
          emit({ type: "result", result });
        } else {
          const domain = normalizeDomain(rawTarget);
          const ctx = await getSessionContext();
          const orgId = await authorizedTargetOrg(ctx, domain, "viewer");
          const result = await runPassiveScan(domain, scanId, emit, { activeObservation: !!orgId, signal });
          // Persist + derive change detection against this target's history.
          const store = await getStore();
          if (orgId) {
            const persisted = await recordScan(store, result, orgId);
            if (persisted) await processGuardianScan(orgId, result, { notify: false, weeklyDigest: false });
          }
          // Aegis: build posture + investigation, then apply remembered statuses.
          result.posture = buildPosture(result);
          result.investigation = buildInvestigation(result);
          if (orgId) await applyStoredRecommendationStatus(orgId, result.target, result.posture);
          emit({ type: "result", result });
        }
        }));
      } catch (error) {
        if (signal.aborted) return;
        const message = error instanceof CapacityError
          ? error.message
          : error instanceof InvalidTargetError
            ? error.message
            : "Scan failed. The target may be unreachable or a public data source was unavailable.";
        emit({ type: "error", message });
      } finally {
        if (!signal.aborted) controller.close();
      }
    },
    cancel() { cancellation.abort(new Error("Scan client disconnected")); },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
