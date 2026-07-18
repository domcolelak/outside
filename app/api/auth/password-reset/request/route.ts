import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { isValidEmail } from "@/lib/auth/validation";
import { APP_URL } from "@/lib/config/runtime";
import { enqueueEmail } from "@/lib/email/outbox";
import { passwordResetEmail } from "@/lib/email/templates";
import { readLimitedJson, RequestBodyError } from "@/lib/http/body";
import { clientIdentity, requireBudgets } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = () => NextResponse.json({ accepted: true, message: "If the account exists, a reset link will be sent." }, { status: 202, headers: { "cache-control": "no-store" } });

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try { body = await readLimitedJson(req, 8_000) as typeof body; }
  catch (error) { return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : "Invalid request" }, { status: error instanceof RequestBodyError ? error.status : 400 }); }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return response();
  const recipient = createHash("sha256").update(email).digest("hex").slice(0, 24);
  const budget = await requireBudgets([
    { key: `password-reset:client:${clientIdentity(req)}`, limit: 8, windowMs: 60 * 60_000 },
    { key: `password-reset:recipient:${recipient}`, limit: 3, windowMs: 60 * 60_000 },
  ]);
  if (!budget.ok) return response();
  const store = await getAuthStore();
  const user = await store.findUserByEmail(email);
  if (!user) return response();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await store.createPasswordReset(user.id, tokenHash, new Date(Date.now() + 30 * 60_000));
  await enqueueEmail(passwordResetEmail(user.email, `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`), `password-reset:${user.id}:${tokenHash.slice(0, 16)}`);
  return response();
}

