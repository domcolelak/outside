import type { Translator, MessageKey } from "@/lib/i18n/messages";
import type {
  GuardianActivity,
  GuardianChecklistCode,
  GuardianChecklistItem,
  GuardianDrift,
  GuardianEvent,
  GuardianEventCategory,
  GuardianEventType,
  GuardianRecommendation,
  GuardianRemediationGuide,
} from "./types";

type GKey = MessageKey<"guardian">;

const CHECKLIST_LABEL: Record<GuardianChecklistCode, GKey> = {
  spf: "controlSpf",
  dkim: "controlDkim",
  dmarc: "controlDmarc",
  dnssec: "controlDnssec",
  hsts: "controlHsts",
  https: "controlHttps",
  security_txt: "controlSecurityTxt",
  mta_sts: "controlMtaSts",
  tls: "controlTls",
  email_security: "controlEmailSecurity",
};

const CHECKLIST_ACTION: Record<GuardianChecklistCode, GKey> = {
  spf: "actionSpf",
  dkim: "actionDkim",
  dmarc: "actionDmarc",
  dnssec: "actionDnssec",
  hsts: "actionHsts",
  https: "actionHttps",
  security_txt: "actionSecurityTxt",
  mta_sts: "actionMtaSts",
  tls: "actionTls",
  email_security: "actionEmailSecurity",
};

const EVENT_TITLE: Record<GuardianEventType, GKey> = {
  asset_new: "eventAssetNew",
  asset_returned: "eventAssetReturned",
  asset_removed: "eventAssetRemoved",
  dns_changed: "eventDnsChanged",
  certificate_changed: "eventCertificateChanged",
  certificate_expiring: "eventCertificateExpiring",
  domain_expiring: "eventDomainExpiring",
  mail_security_changed: "eventMailChanged",
  auth_surface_new: "eventAuthNew",
  api_surface_new: "eventApiNew",
  nonproduction_reachable: "eventNonProduction",
  technology_changed: "eventTechnologyChanged",
  redirect_changed: "eventRedirectChanged",
  infrastructure_changed: "eventInfrastructureChanged",
  shadow_appeared: "eventShadowAppeared",
  shadow_disappeared: "eventShadowCleared",
  asset_flapping: "eventAssetFlapping",
  surface_growth: "eventSurfaceGrowth",
  checklist_changed: "eventChecklistChanged",
};

const CATEGORY_WHY: Record<GuardianEventCategory, GKey> = {
  surface: "eventWhySurface",
  identity: "eventWhyIdentity",
  mail: "eventWhyMail",
  infrastructure: "eventWhyInfrastructure",
  certificate: "eventWhyCertificate",
  posture: "eventWhyPosture",
};

const DIMENSION_LABEL: Record<string, GKey> = {
  assets: "dimensionAssets",
  shadowAssets: "dimensionShadowAssets",
  authSurfaces: "dimensionAuthSurfaces",
  apiSurfaces: "dimensionApiSurfaces",
  nonProduction: "dimensionNonProduction",
  technologies: "dimensionTechnologies",
  technology_composition: "dimensionTechnologyComposition",
  infrastructureProviders: "dimensionProviders",
  cloudAssets: "dimensionCloudAssets",
  cdnFrontedAssets: "dimensionCdnAssets",
  checklistPassed: "dimensionChecklistPassed",
  exposureScore: "dimensionPosture",
};

export function localizeGuardianChecklist(item: GuardianChecklistItem, t: Translator) {
  const label = t.t("guardian", CHECKLIST_LABEL[item.code]);
  return {
    label,
    state: t.t("guardian", `controlState${item.state[0]!.toUpperCase()}${item.state.slice(1)}` as GKey),
    explanation: t.t("guardian", "controlExplanation", { control: label }),
    whyItMatters: t.t("guardian", "controlWhy", { control: label }),
    recommendedAction: t.t("guardian", CHECKLIST_ACTION[item.code]),
    observation: t.t("guardian", "controlObservation", { control: label, state: t.t("guardian", `controlState${item.state[0]!.toUpperCase()}${item.state.slice(1)}` as GKey) }),
  };
}

export function localizeGuardianEvent(event: GuardianEvent, t: Translator) {
  const title = t.t("guardian", EVENT_TITLE[event.type]);
  const asset = event.affectedAssets[0] ?? event.target;
  return {
    title,
    summary: t.t("guardian", "eventSummary", { asset, title: title.toLocaleLowerCase(t.locale) }),
    why: t.t("guardian", CATEGORY_WHY[event.category]),
    category: t.t("guardian", `category${event.category[0]!.toUpperCase()}${event.category.slice(1)}` as GKey),
  };
}

export function localizeGuardianDrift(drift: GuardianDrift, t: Translator) {
  const dimensions = drift.dimensions.map((item) => ({
    ...item,
    label: t.t("guardian", DIMENSION_LABEL[item.code] ?? "dimensionOther"),
  }));
  const changed = dimensions.filter((item) => item.direction !== "stable").slice(0, 3);
  return {
    ...drift,
    headline: t.t("guardian", `driftHeadline${drift.direction[0]!.toUpperCase()}${drift.direction.slice(1)}` as GKey),
    narrative: drift.from === null
      ? t.t("guardian", "driftBaselineNarrative")
      : changed.length
        ? changed.map((item) => t.t("guardian", "driftDimensionChange", {
          label: item.label,
          direction: t.t("guardian", `driftDirection${item.direction[0]!.toUpperCase()}${item.direction.slice(1)}` as GKey),
          delta: Math.abs(item.delta),
        })).join(" ")
        : t.t("guardian", "driftStableNarrative"),
    dimensions,
  };
}

function recommendationKind(recommendation: GuardianRecommendation): "ownership" | "nonprod" | "auth" | "api" | "flapping" | "growth" | "generic" {
  if (recommendation.code.startsWith("ownership:")) return "ownership";
  if (recommendation.code.startsWith("nonprod:")) return "nonprod";
  if (recommendation.code.startsWith("auth:")) return "auth";
  if (recommendation.code.startsWith("api:")) return "api";
  if (recommendation.code.startsWith("flapping:")) return "flapping";
  if (recommendation.code === "surface-growth") return "growth";
  return "generic";
}

const RECOMMENDATION_TITLE: Record<ReturnType<typeof recommendationKind>, GKey> = {
  ownership: "recommendationOwnershipTitle",
  nonprod: "recommendationNonprodTitle",
  auth: "recommendationAuthTitle",
  api: "recommendationApiTitle",
  flapping: "recommendationFlappingTitle",
  growth: "recommendationGrowthTitle",
  generic: "recommendationGenericTitle",
};

export function localizeGuardianGuide(guide: GuardianRemediationGuide, review: string, t: Translator) {
  return {
    ...guide,
    title: t.t("guardian", "guideTitle", { platform: guide.platform }),
    steps: [review, t.t("guardian", "guideRecordOwner"), t.t("guardian", "guideRunAgain")],
    verification: t.t("guardian", "guideVerification"),
  };
}

export function localizeGuardianRecommendation(recommendation: GuardianRecommendation, t: Translator) {
  const checklistCode = recommendation.code.startsWith("checklist:") ? recommendation.code.slice("checklist:".length) as GuardianChecklistCode : null;
  const kind = recommendationKind(recommendation);
  const title = checklistCode && CHECKLIST_ACTION[checklistCode]
    ? t.t("guardian", CHECKLIST_ACTION[checklistCode])
    : t.t("guardian", RECOMMENDATION_TITLE[kind]);
  const review = checklistCode && CHECKLIST_ACTION[checklistCode]
    ? t.t("guardian", CHECKLIST_ACTION[checklistCode])
    : t.t("guardian", `recommendation${kind[0]!.toUpperCase()}${kind.slice(1)}Review` as GKey);
  return {
    title,
    why: t.t("guardian", "recommendationWhy"),
    reasoning: t.t("guardian", "recommendationReasoning", { count: recommendation.affectedAssets.length }),
    suggestedReview: review,
    businessImpact: t.t("guardian", `recommendation${kind[0]!.toUpperCase()}${kind.slice(1)}Impact` as GKey),
    guides: recommendation.guides.map((guide) => localizeGuardianGuide(guide, review, t)),
  };
}

const ACTIVITY_KEY: Record<GuardianActivity["type"], GKey> = {
  scan_analyzed: "activityScanAnalyzed",
  events_correlated: "activityEventsCorrelated",
  notification_queued: "activityNotificationQueued",
  digest_generated: "activityDigestGenerated",
  recommendation_updated: "activityRecommendationUpdated",
};

export function localizeGuardianActivity(activity: GuardianActivity, t: Translator) {
  return t.t("guardian", ACTIVITY_KEY[activity.type], { target: activity.target });
}
