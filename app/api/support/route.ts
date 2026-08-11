import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/i18n/locales";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";
import { answerSupportQuestion } from "@/lib/support/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

export async function POST(req: NextRequest) {
  const client = clientIdentity(req);
  const budget = await requireBudgets([
    { key: "support:global", limit: 120, windowMs: 60_000 },
    { key: `support:client:${client}`, limit: 12, windowMs: 60_000 },
    { key: `support:daily:${client}`, limit: 80, windowMs: 24 * 60 * 60_000 },
  ]);
  if (!budget.ok) {
    return json(
      {
        error: "Support request limit exceeded.",
        code: "rate_limited",
        retryAfter: budget.retryAfter,
      },
      429,
      { "retry-after": String(budget.retryAfter) },
    );
  }

  let raw: unknown;
  try {
    raw = await readLimitedJson(req, 4_096);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      error instanceof RequestBodyError ? error.status : 400,
    );
  }

  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  const locale = asLocale(body.locale) ?? "en";
  if (question.length < 2)
    return json({ error: "Enter a question.", code: "empty_question" }, 422);
  if (question.length > 500)
    return json(
      { error: "Question is too long.", code: "question_too_long" },
      422,
    );

  return json(await answerSupportQuestion(question, locale));
}
