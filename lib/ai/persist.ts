/**
 * Best-effort persistence of AI output as a separate AIAnalysis record — kept
 * apart from the deterministic scan data so AI text never contaminates facts.
 * No-ops (safely) when no database is configured.
 */

import { prisma } from "@/lib/db/prisma";

export async function saveAnalysis(input: {
  target: string;
  scanId?: string | null;
  kind: "summary" | "finding";
  source: string;
  text: string;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await prisma.aIAnalysis.create({
      data: { target: input.target, scanId: input.scanId ?? null, kind: input.kind, source: input.source, text: input.text },
    });
  } catch (err) {
    console.warn("[ai] saveAnalysis failed (non-fatal):", (err as Error).message);
  }
}
