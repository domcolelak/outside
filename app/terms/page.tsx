import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { TERMS_BODY, TERMS_UPDATED } from "@/lib/legal/terms";

export const metadata: Metadata = { title: "Terms of Service · OUTSIDE" };

export default function TermsPage() {
  return <LegalDocument title="Terms of Service" updated={TERMS_UPDATED} body={TERMS_BODY} />;
}
