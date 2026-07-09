import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.APP_URL ?? "http://localhost:3000";
const DESCRIPTION =
  "OUTSIDE maps your publicly observable digital footprint and reveals forgotten, unexpected, and changing external assets — using passive, safe, public data sources.";

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
