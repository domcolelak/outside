import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OUTSIDE — See your company from the outside",
  description:
    "OUTSIDE maps your publicly observable digital footprint and reveals forgotten, unexpected, and changing external assets — using passive, safe, public data sources.",
  applicationName: "OUTSIDE",
  robots: { index: true, follow: true },
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
