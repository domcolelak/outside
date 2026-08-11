import type { Locale } from "@/lib/i18n/locales";
import { getTranslator, type MessageKey } from "@/lib/i18n/messages";

type SupportKey = MessageKey<"support">;

const DEFINITIONS = [
  {
    id: "overview",
    question: "faqOverviewQuestion",
    answer: "faqOverviewAnswer",
    keywords: "faqOverviewKeywords",
  },
  {
    id: "safety",
    question: "faqSafetyQuestion",
    answer: "faqSafetyAnswer",
    keywords: "faqSafetyKeywords",
  },
  {
    id: "sources",
    question: "faqSourcesQuestion",
    answer: "faqSourcesAnswer",
    keywords: "faqSourcesKeywords",
  },
  {
    id: "verification",
    question: "faqVerificationQuestion",
    answer: "faqVerificationAnswer",
    keywords: "faqVerificationKeywords",
  },
  {
    id: "guardian",
    question: "faqGuardianQuestion",
    answer: "faqGuardianAnswer",
    keywords: "faqGuardianKeywords",
  },
  {
    id: "integrations",
    question: "faqIntegrationsQuestion",
    answer: "faqIntegrationsAnswer",
    keywords: "faqIntegrationsKeywords",
  },
  {
    id: "ai",
    question: "faqAiQuestion",
    answer: "faqAiAnswer",
    keywords: "faqAiKeywords",
  },
  {
    id: "pricing",
    question: "faqPricingQuestion",
    answer: "faqPricingAnswer",
    keywords: "faqPricingKeywords",
  },
  {
    id: "data",
    question: "faqDataQuestion",
    answer: "faqDataAnswer",
    keywords: "faqDataKeywords",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  question: SupportKey;
  answer: SupportKey;
  keywords: SupportKey;
}>;

export type FaqId = (typeof DEFINITIONS)[number]["id"];

export interface FaqEntry {
  id: FaqId;
  question: string;
  answer: string;
  keywords: string;
}

export interface SupportCopy {
  navFaq: string;
  faqKicker: string;
  faqTitle: string;
  faqIntro: string;
  assistantOpen: string;
  assistantClose: string;
  assistantTitle: string;
  assistantSubtitle: string;
  assistantGreeting: string;
  assistantDisclosure: string;
  assistantQuestionLabel: string;
  assistantPlaceholder: string;
  assistantSend: string;
  assistantSending: string;
  assistantQuickLabel: string;
  assistantError: string;
  assistantRateLimited: string;
  assistantFallback: string;
  assistantMatchedLabel: string;
  assistantUserLabel: string;
  assistantSuggestionsLabel: string;
}

export function faqEntries(locale: Locale): FaqEntry[] {
  const t = getTranslator(locale);
  return DEFINITIONS.map((definition) => ({
    id: definition.id,
    question: t.t("support", definition.question),
    answer: t.t("support", definition.answer),
    keywords: t.t("support", definition.keywords),
  }));
}

export function faqById(locale: Locale, id: string): FaqEntry | null {
  return faqEntries(locale).find((entry) => entry.id === id) ?? null;
}

export function supportCopy(locale: Locale): SupportCopy {
  const t = getTranslator(locale);
  const text = (key: SupportKey) => t.t("support", key);
  return {
    navFaq: text("navFaq"),
    faqKicker: text("faqKicker"),
    faqTitle: text("faqTitle"),
    faqIntro: text("faqIntro"),
    assistantOpen: text("assistantOpen"),
    assistantClose: text("assistantClose"),
    assistantTitle: text("assistantTitle"),
    assistantSubtitle: text("assistantSubtitle"),
    assistantGreeting: text("assistantGreeting"),
    assistantDisclosure: text("assistantDisclosure"),
    assistantQuestionLabel: text("assistantQuestionLabel"),
    assistantPlaceholder: text("assistantPlaceholder"),
    assistantSend: text("assistantSend"),
    assistantSending: text("assistantSending"),
    assistantQuickLabel: text("assistantQuickLabel"),
    assistantError: text("assistantError"),
    assistantRateLimited: text("assistantRateLimited"),
    assistantFallback: text("assistantFallback"),
    assistantMatchedLabel: text("assistantMatchedLabel"),
    assistantUserLabel: text("assistantUserLabel"),
    assistantSuggestionsLabel: text("assistantSuggestionsLabel"),
  };
}
