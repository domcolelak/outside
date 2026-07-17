import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { clearedSessionCookies } from "@/lib/auth/session";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await requireBudgets([{ key: `password-reset-confirm:${clientIdentity(req)}`, limit: 10, windowMs: 60 * 60_000 }])).ok) return NextResponse.json({ error: "Too many attempts. Request a new reset link later." }, { status: 429 });
  let body: { token?: string; password?: string };
  try { body = await readLimitedJson(req, 12_000) as typeof body; }
  catch (error) { return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request" }, { status: error instanceof RequestBodyError ? error.status : 400 }); }
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 410 });
  const changed = await (await getAuthStore()).consumePasswordReset(createHash("sha256").update(token).digest("hex"), await hashPassword(password), new Date());
  if (!changed) return NextResponse.json({ error: "Reset link is invalid or expired." }, { status: 410 });
  const response = NextResponse.json({ reset: true });
  for (const cookie of clearedSessionCookies()) response.headers.append("Set-Cookie", cookie);
  return response;
}

