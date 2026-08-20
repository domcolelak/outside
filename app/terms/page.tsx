import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { currentLocale } from "@/lib/i18n/server";
import { termsDocument } from "@/lib/legal/documents";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await currentLocale();
  return { title: `${termsDocument(locale).title} · OUTSIDE` };
}

export default async function TermsPage() {
  const { locale } = await currentLocale();
  return <LegalDocument {...termsDocument(locale)} locale={locale} />;
}
