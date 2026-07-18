import { NextRequest, NextResponse } from "next/server";
import { mutationOriginAllowed } from "@/lib/security/request-origin";
// @ts-expect-error Plain ESM is shared with next.config.mjs.
import { contentSecurityPolicy } from "@/lib/security/headers.mjs";

function requestNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function proxy(request: NextRequest) {
  const nonce = requestNonce();
  const requestId = crypto.randomUUID();
  const csp = contentSecurityPolicy(process.env.NODE_ENV === "production", nonce);
  if (request.nextUrl.pathname.startsWith("/api/") && !mutationOriginAllowed(request)) {
    return NextResponse.json({ error: "Cross-site mutation rejected." }, { status: 403, headers: { "cache-control": "no-store", "content-security-policy": csp, "x-request-id": requestId } });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  // The renderer reads the request CSP to attach this nonce to framework and
  // application scripts. A response-only policy blocks production hydration.
  requestHeaders.set("content-security-policy", csp);
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  let primaryHost = "";
  try { primaryHost = new URL(process.env.APP_URL ?? "http://localhost:3000").hostname.toLowerCase(); } catch { primaryHost = ""; }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  let response: NextResponse;
  if (request.nextUrl.pathname === "/" && host && !isLocal && host !== primaryHost) {
    const url = request.nextUrl.clone();
    url.pathname = "/agency/portal/domain";
    url.searchParams.set("domain", host);
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  response.headers.set("content-security-policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
