import type { Metadata } from "next";
import { APP_URL } from "@/lib/config/runtime";
import { currentLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/context";
import { getBundles } from "@/lib/i18n/messages";
import { webAnalyticsConfig } from "@/lib/analytics/config";
import { AnalyticsScript } from "@/components/analytics/AnalyticsScript";
import { CampaignAttribution } from "@/components/analytics/CampaignAttribution";
import "./globals.css";

const SITE_URL = APP_URL;
const DESCRIPTION =
  "Evidence-first external attack surface management: passive discovery, verified assessments, continuous Guardian monitoring, BYOK intelligence, and reversible remediation.";

// A per-request CSP nonce cannot be embedded in statically generated HTML.
// Dynamic rendering lets Next.js apply the middleware nonce to every script.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "OUTSIDE — See your company from the outside",
  description: DESCRIPTION,
  applicationName: "OUTSIDE",
  robots: { index: true, follow: true },
  openGraph: {
    title: "OUTSIDE — See your company from the outside",
    description: DESCRIPTION,
    siteName: "OUTSIDE",
    type: "website",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "OUTSIDE — See your company from the outside",
    description: DESCRIPTION,
  },
};

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
