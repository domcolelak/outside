import { headers } from "next/headers";
import { ANALYTICS_BEFORE_SEND_SOURCE, type WebAnalyticsConfig } from "@/lib/analytics/config";

/**
 * Self-hosted, cookie-free Umami tracker. Query strings and token-bearing
 * routes are removed before collection; campaign codes are sent separately.
 */
export async function AnalyticsScript({ config }: { config: WebAnalyticsConfig }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: ANALYTICS_BEFORE_SEND_SOURCE }} />
      <script
        defer
        nonce={nonce}
        src="/insights.js"
        data-website-id={config.websiteId}
        data-domains={config.domain}
        data-do-not-track="true"
        data-exclude-search="true"
        data-exclude-hash="true"
        data-performance="true"
        data-before-send="outsideAnalyticsBeforeSend"
      />
    </>
  );
}
