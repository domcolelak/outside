import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { SECURITY_BODY, SECURITY_UPDATED } from "@/lib/legal/security";

export const metadata: Metadata = { title: "Security · OUTSIDE" };

export default function SecurityPage() {
  return <LegalDocument title="Security at OUTSIDE" updated={SECURITY_UPDATED} body={SECURITY_BODY} />;
}
