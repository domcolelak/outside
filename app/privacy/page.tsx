import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { PRIVACY_BODY, PRIVACY_UPDATED } from "@/lib/legal/privacy";

export const metadata: Metadata = { title: "Privacy Policy · OUTSIDE" };

export default function PrivacyPage() {
  return <LegalDocument title="Privacy Policy" updated={PRIVACY_UPDATED} body={PRIVACY_BODY} />;
}
