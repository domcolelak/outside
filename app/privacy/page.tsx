import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { currentLocale } from "@/lib/i18n/server";
import { privacyDocument } from "@/lib/legal/documents";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await currentLocale();
  return { title: `${privacyDocument(locale).title} · OUTSIDE` };
}

export default async function PrivacyPage() {
  const { locale } = await currentLocale();
  return <LegalDocument {...privacyDocument(locale)} locale={locale} />;
}
