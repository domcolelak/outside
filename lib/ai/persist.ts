/**
 * Best-effort persistence of AI output as a separate AIAnalysis record — kept
 * apart from the deterministic scan data so AI text never contaminates facts.
 * No-ops (safely) when no database is configured.
 */

export async function saveAnalysis(input: {
  target: string;
  scanId?: string | null;
  kind: "summary" | "finding";
  source: string;
  text: string;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const g = globalThis as unknown as { __outsidePrisma?: InstanceType<typeof PrismaClient> };
    const prisma = g.__outsidePrisma ?? new PrismaClient();
    if (process.env.NODE_ENV !== "production") g.__outsidePrisma = prisma;
    await prisma.aIAnalysis.create({
      data: { target: input.target, scanId: input.scanId ?? null, kind: input.kind, source: input.source, text: input.text },
    });
  } catch (err) {
    console.warn("[ai] saveAnalysis failed (non-fatal):", (err as Error).message);
  }
}
