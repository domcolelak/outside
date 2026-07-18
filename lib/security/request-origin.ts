const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface OriginRequest {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
}

/**
 * Browser session mutations must originate from the host that receives them.
 * Non-browser clients commonly omit Origin/Sec-Fetch-Site and continue to rely
 * on their bearer/signature authentication. Browsers cannot forge either
 * header, so this closes the remaining SameSite-only CSRF gap without breaking
 * Stripe, SCIM, cron, or webhook integrations.
 */
export function mutationOriginAllowed(
  request: OriginRequest,
  canonicalOrigin = process.env.APP_URL,
): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    // Reverse proxies commonly expose an internal request URL to Next.js. The
    // configured public origin is authoritative and avoids trusting spoofable
    // forwarded host/protocol headers. The actual listener origin remains
    // valid for direct deployments and local release tests.
    const browserOrigin = new URL(origin).origin;
    const listenerOrigin = new URL(request.url).origin;
    if (canonicalOrigin && browserOrigin === new URL(canonicalOrigin).origin) return true;
    return browserOrigin === listenerOrigin;
  } catch {
    return false;
  }
}
