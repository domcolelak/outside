import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth/password";
import { sessionCookie, signSession } from "@/lib/auth/session";
import { clientIdentity, rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const client = clientIdentity(req);
  // Tighter limit on login to blunt credential guessing.
  if (!(await rateLimit(`login:${client}`, 8, 60_000)).ok) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const store = await getAuthStore();
  const user = await store.findUserByEmail(email);
  // Same generic message + password check either way to avoid user enumeration.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  res.headers.append("Set-Cookie", sessionCookie(signSession(user.id)));
  return res;
}
