import { NextResponse } from "next/server";
import { clearedSessionCookies } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const cookie of clearedSessionCookies()) res.headers.append("Set-Cookie", cookie);
  return res;
}
