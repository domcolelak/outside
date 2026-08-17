const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WebAnalyticsConfig = {
  websiteId: string;
  domain: string;
};

type WebAnalyticsEnv = { UMAMI_WEBSITE_ID?: string; APP_URL?: string };

export const ANALYTICS_BEFORE_SEND_SOURCE = `window.__outsideAnalyticsConfigured=true;window.outsideAnalyticsBeforeSend=function(type,payload){try{var page=new URL(payload.url||location.href,location.origin);if(/^\\/(?:r|invite)\\//.test(page.pathname)||page.pathname==="/reset-password")return false;page.search="";page.hash="";payload.url=page.pathname;if(payload.referrer){var ref=new URL(payload.referrer,location.origin);ref.search="";ref.hash="";payload.referrer=ref.origin===location.origin?ref.pathname:ref.origin;}return payload;}catch(_){return false;}};`;

/** Analytics is fail-closed: a missing or malformed deployment value disables it. */
export function webAnalyticsConfig(
  env: WebAnalyticsEnv = process.env as WebAnalyticsEnv,
): WebAnalyticsConfig | null {
  const websiteId = env.UMAMI_WEBSITE_ID?.trim() ?? "";
  if (!UUID.test(websiteId)) return null;
  try {
    const url = new URL(env.APP_URL ?? "");
    const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { websiteId, domain: url.hostname.toLowerCase() };
  } catch {
    return null;
  }
}
