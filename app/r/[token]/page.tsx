import type { Metadata } from "next";
import { getShare } from "@/lib/share/shares";
import { SharedReport } from "@/components/share/SharedReport";
import { recordFunnelEvent } from "@/lib/observability/metrics";

export const dynamic = "force-dynamic";
// Unlisted, user-initiated link — not a public directory of anyone's exposure.
export const metadata: Metadata = {
  title: "External exposure report · OUTSIDE",
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const snapshot = await getShare(token);
  if (snapshot) recordFunnelEvent("report_viewed", snapshot.isDemo ? "demo" : "real");
  return <SharedReport snapshot={snapshot} />;
}
