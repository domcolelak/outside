import type { Metadata } from "next";
import { APP_URL } from "@/lib/config/runtime";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
