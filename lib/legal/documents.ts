import type { Locale } from "@/lib/i18n/locales";
import { PRIVACY_BODY } from "./privacy";
import { SECURITY_BODY } from "./security";
import { TERMS_BODY } from "./terms";
import { PRIVACY_TRANSLATIONS } from "./privacy-localized";
import { SECURITY_TRANSLATIONS } from "./security-localized";
import { TERMS_TRANSLATIONS } from "./terms-localized";

export type LegalContent = { title: string; updated: string; body: string };

const ENGLISH: Record<"privacy" | "terms" | "security", LegalContent> = {
  privacy: { title: "Privacy Policy", updated: "2026-08-17", body: PRIVACY_BODY },
  terms: { title: "Terms of Service", updated: "2026-07-24", body: TERMS_BODY },
  security: { title: "Security at OUTSIDE", updated: "2026-07-24", body: SECURITY_BODY },
};

export function privacyDocument(locale: Locale): LegalContent {
  return locale === "en" ? ENGLISH.privacy : PRIVACY_TRANSLATIONS[locale];
}

export function termsDocument(locale: Locale): LegalContent {
  return locale === "en" ? ENGLISH.terms : TERMS_TRANSLATIONS[locale];
}

export function securityDocument(locale: Locale): LegalContent {
  return locale === "en" ? ENGLISH.security : SECURITY_TRANSLATIONS[locale];
}
