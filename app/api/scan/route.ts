import { NextRequest } from "next/server";
import { runDemoScan, runPassiveScan, type Emit } from "@/lib/discovery/engine";
import { findDemoOrg, isDemoDomain } from "@/lib/demo";
import { InvalidTargetError, normalizeDomain } from "@/lib/security/target";
import { rateLimit } from "@/lib/security/ratelimit";
import { getStore } from "@/lib/persistence";
import { recordScan } from "@/lib/persistence/record";
import { buildPosture } from "@/lib/aegis/recommendations";
import { buildInvestigation } from "@/lib/aegis/investigation";
import { applyStoredRecommendationStatus } from "@/lib/aegis/store";
import type { ScanEvent } from "@/lib/types";
import { getSessionContext } from "@/lib/auth";
import { authorizedTargetOrg } from "@/lib/auth/target-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: ScanEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawTarget = url.searchParams.get("target") ?? "";
  const mode = url.searchParams.get("mode") ?? "auto"; // "auto" | "demo"

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`scan:${ip}`, 12, 60_000);
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded", retryAfter: limit.retryAfter }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(limit.retryAfter) },
    });
  }

  const scanId = `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit: Emit = (event) => {
        controller.enqueue(encoder.encode(sse(event)));
      };
      try {
        // Demo path: explicit demo mode, a known demo slug, or a demo domain.
        // Demo scans carry a synthetic change story and are NOT persisted.
        const demoOrg = mode === "demo" ? findDemoOrg(rawTarget) : findDemoOrg(rawTarget);
        if (demoOrg || isDemoDomain(rawTarget)) {
          const org = demoOrg ?? findDemoOrg(rawTarget)!;
          const result = await runDemoScan(org, scanId, emit);
          // Aegis: derive the protection posture + correlate findings into incidents.
          result.posture = buildPosture(result);
          result.investigation = buildInvestigation(result);
          emit({ type: "result", result });
        } else {
          const domain = normalizeDomain(rawTarget);
          const result = await runPassiveScan(domain, scanId, emit);
          // Persist + derive change detection against this target's history.
          const store = await getStore();
          await recordScan(store, result);
          // Aegis: build posture + investigation, then apply remembered statuses.
          result.posture = buildPosture(result);
          result.investigation = buildInvestigation(result);
          const ctx = await getSessionContext();
          const orgId = await authorizedTargetOrg(ctx, result.target, "viewer");
          if (orgId) await applyStoredRecommendationStatus(orgId, result.target, result.posture);
          emit({ type: "result", result });
        }
      } catch (error) {
        const message =
          error instanceof InvalidTargetError
            ? error.message
            : "Scan failed. The target may be unreachable or a public data source was unavailable.";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
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
