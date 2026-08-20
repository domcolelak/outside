import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetKevIndex, currentKevIndex } from "@/lib/analysis/kev";
import { __resetDecisions } from "@/lib/evolution/decisions";
import { __resetEvolutionState, latestEvolutionRun } from "@/lib/evolution/state";
import { GET } from "@/app/api/cron/evolution/route";

const secret = "evolution-cron-secret-at-least-thirty-two-bytes";
const originalStorageMode = process.env.OUTSIDE_STORAGE_MODE;
const originalCronSecret = process.env.CRON_SECRET;

function request() {
  return new NextRequest("http://localhost/api/cron/evolution", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("scheduled Evolution route", () => {
  beforeEach(() => {
    process.env.OUTSIDE_STORAGE_MODE = "memory";
    process.env.CRON_SECRET = secret;
    __resetKevIndex();
    __resetDecisions();
    __resetEvolutionState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalStorageMode === undefined) delete process.env.OUTSIDE_STORAGE_MODE;
    else process.env.OUTSIDE_STORAGE_MODE = originalStorageMode;
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  it("refreshes an empty process-local KEV cache before recording a baseline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cveID: "CVE-2026-12345",
                vendorProject: "Example",
                product: "Gateway",
                vulnerabilityName: "Example vulnerability",
                dateAdded: "2026-08-20",
                dueDate: "2026-09-01",
                knownRansomwareCampaignUse: "Unknown",
                shortDescription: "A reviewed test record.",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.kevSize).toBe(1);
    expect(body.firstRun).toBe(true);
    expect(currentKevIndex().size).toBe(1);
    expect(await latestEvolutionRun()).toMatchObject({ total: body.total });
  });

  it("does not persist an empty baseline when the KEV feed is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await latestEvolutionRun()).toBeNull();
  });
});
