import type { Metadata } from "next";
import { APP_URL } from "@/lib/config/runtime";
import { currentLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/context";
import { getBundles } from "@/lib/i18n/messages";
import { getTranslator } from "@/lib/i18n/messages";
import { webAnalyticsConfig } from "@/lib/analytics/config";
import { AnalyticsScript } from "@/components/analytics/AnalyticsScript";
import { CampaignAttribution } from "@/components/analytics/CampaignAttribution";
import "./globals.css";

const SITE_URL = APP_URL;
// A per-request CSP nonce cannot be embedded in statically generated HTML.
// Dynamic rendering lets Next.js apply the middleware nonce to every script.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await currentLocale();
  const t = getTranslator(locale);
  const title = t.t("ui", "metaTitle");
  const description = t.t("ui", "metaDescription");
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    applicationName: "OUTSIDE",
    robots: { index: true, follow: true },
    openGraph: { title, description, siteName: "OUTSIDE", type: "website", url: SITE_URL },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved per request rather than hardcoded, so assistive technology and
  // browser translation see the language the page is actually written in.
  const { locale } = await currentLocale();
  const analytics = webAnalyticsConfig();
  return (
    <html lang={locale} className="dark">
      {analytics && <head><AnalyticsScript config={analytics} /></head>}
      <body className="min-h-screen antialiased">
        {analytics && <CampaignAttribution />}
        {/* Resolved once here so no client component has to work out the
            language for itself, and none of them can disagree. */}
        <LocaleProvider locale={locale} bundles={getBundles(locale)}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
