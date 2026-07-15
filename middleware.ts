import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  let primaryHost = ""; try { primaryHost = new URL(process.env.APP_URL ?? "http://localhost:3000").hostname.toLowerCase(); } catch { primaryHost = ""; }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (request.nextUrl.pathname === "/" && host && !isLocal && host !== primaryHost) { const url = request.nextUrl.clone(); url.pathname = "/agency/portal/domain"; url.searchParams.set("domain", host); return NextResponse.rewrite(url); }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
