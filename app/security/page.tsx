import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { currentLocale } from "@/lib/i18n/server";
import { securityDocument } from "@/lib/legal/documents";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await currentLocale();
  return { title: `${securityDocument(locale).title} · OUTSIDE` };
}

export default async function SecurityPage() {
  const { locale } = await currentLocale();
  return <LegalDocument {...securityDocument(locale)} locale={locale} />;
}
