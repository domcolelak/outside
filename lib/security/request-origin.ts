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
export function mutationOriginAllowed(request: OriginRequest): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
