import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ authenticated: false });
  return NextResponse.json({
    authenticated: true,
    user: ctx.user,
    organizations: ctx.memberships.map((m) => ({ id: m.org.id, name: m.org.name, plan: m.org.plan, role: m.role })),
  });
}
