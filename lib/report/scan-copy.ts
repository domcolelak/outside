import type { ChangeEvent } from "@/lib/persistence/model";
import type { Asset, AssetKind, AttackerBeat, DiscoveryMethod, ScanResult, ScoreComponent, Signal } from "@/lib/types";
import type { MessageKey, Translator } from "@/lib/i18n/messages";

type ScanKey = MessageKey<"scan">;

export function localizeScoreComponent(component: ScoreComponent, result: ScanResult, tr: Translator) {
  const countSignal = (code: string) => result.graph.assets.filter((asset) => asset.signals.some((signal) => signal.code === code && signal.confidence >= 0.55)).length;
  const values: Record<string, string | number> = { count: 0, days: 0, critical: 0 };
  switch (component.code) {
    case "shadow": values.count = countSignal("asset.shadow"); break;
    case "nonprod": values.count = countSignal("env.nonprod"); break;
    case "auth": values.count = countSignal("surface.auth"); break;
    case "api": values.count = countSignal("surface.api"); break;
    case "new": values.count = result.graph.assets.filter((asset) => asset.attrs.newlyObserved === true).length; break;
    case "headers": values.count = result.graph.assets.find((asset) => Array.isArray(asset.attrs.missingHeaders))?.attrs.missingHeaders instanceof Array ? (result.graph.assets.find((asset) => Array.isArray(asset.attrs.missingHeaders))!.attrs.missingHeaders as string[]).length : 0; break;
    case "cert_expiry": values.days = Math.max(0, Number(result.graph.assets.find((asset) => typeof asset.attrs.certDaysToExpiry === "number")?.attrs.certDaysToExpiry ?? 0)); break;
    case "known_vulnerabilities": values.count = result.findings.filter((finding) => finding.category === "known-vulnerability").length; values.critical = result.findings.filter((finding) => finding.category === "known-vulnerability" && finding.priority === "critical").length; break;
  }
  const key = `scoreComponent${component.code.split("_").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("")}` as ScanKey;
  const rendered = tr.t("scan", key, values);
  return rendered === key ? tr.t("scan", "scoreComponentOther") : rendered;
}

export function localizeScoreExplanation(result: ScanResult, tr: Translator) {
  return tr.t("scan", "scoreExplanation", { value: result.score.value });
}

const CHANGE_DETAIL: Record<NonNullable<ChangeEvent["detailKey"]>, MessageKey<"email">> = {
  assetAppeared: "detailAssetAppeared",
  assetReturned: "detailAssetReturned",
  assetDisappeared: "detailAssetDisappeared",
  technologyChanged: "detailTechnologyChanged",
  certificateChanged: "detailCertificateChanged",
  priorityChanged: "detailPriorityChanged",
};

export function localizeChangeDetail(event: ChangeEvent, tr: Translator) {
  return event.detailKey ? tr.t("email", CHANGE_DETAIL[event.detailKey]) : tr.t("scan", "changeHistoricalDetail");
}

const CHANGE_TYPE: Record<ChangeEvent["type"], ScanKey> = { asset_appeared: "changeNew", asset_returned: "changeReturned", asset_disappeared: "changeGone", technology_changed: "changeTech", certificate_changed: "changeCert", priority_changed: "changePriority" };
export function localizeChangeType(event: ChangeEvent, tr: Translator) { return tr.t("scan", CHANGE_TYPE[event.type]); }

export function localizeAttackerBeat(beat: AttackerBeat, index: number, result: ScanResult, tr: Translator) {
  const assets = beat.revealAssetIds.flatMap((id) => result.graph.assets.find((asset) => asset.id === id) ?? []);
  const asset = assets[0]?.label ?? result.target;
  return {
    headline: tr.t("scan", index === 0 ? "avBeatRoot" : "avBeatAsset", { asset }),
    detail: tr.t("scan", "avBeatDetail", { asset, count: assets.length }),
  };
}

const KIND_KEY: Record<AssetKind, ScanKey> = {
  root_domain: "kindRootDomain", subdomain: "kindSubdomain", host: "kindHost", ip: "kindIp", web_service: "kindWebService", mail_service: "kindMailService", dns_provider: "kindDnsProvider", nameserver: "kindNameserver", certificate: "kindCertificate", cloud_provider: "kindCloud", cdn: "kindCdn", technology: "kindTechnology", auth_surface: "kindAuthSurface", api_surface: "kindApiSurface", third_party: "kindThirdParty", unknown: "kindUnknown",
};

export function localizeAssetKind(kind: AssetKind | string, tr: Translator) { return tr.t("scan", KIND_KEY[kind as AssetKind] ?? "kindUnknown"); }

const METHOD_KEY: Record<DiscoveryMethod, ScanKey> = {
  certificate_transparency: "methodCertificateTransparency", dns: "methodDns", dns_txt: "methodDnsTxt", dns_mx: "methodDnsMx", http_observation: "methodHttp", technology_fingerprint: "methodTechnology", passive_subdomain: "methodPassiveDns", service_observation: "methodService", domain_registration: "methodRegistration", threat_intel: "methodThreatIntel", ownership_attribution: "methodOwnership", seed: "methodSeed", demo: "methodDemo",
};

export function localizeDiscoveryMethod(method: DiscoveryMethod | string, tr: Translator) { return tr.t("scan", METHOD_KEY[method as DiscoveryMethod] ?? "methodOther"); }

export function localizeSignal(signal: Signal, asset: Asset, tr: Translator) {
  if (signal.code === "surface.api") return { label: tr.t("ui", "categoryApiSurface"), rationale: tr.t("scan", "signalRationale") };
  const base = signal.code === "env.nonprod" ? "nonProdExposure" : signal.code === "surface.auth" ? "authSurface" : signal.code === "asset.shadow" ? "shadowAsset" : null;
  if (!base) return { label: tr.t("scan", "signalObserved"), rationale: tr.t("scan", "signalRationale") };
  const values = { label: asset.label, token: signal.token ?? "" };
  return {
    label: tr.t("finding", `${base}Title` as MessageKey<"finding">, values),
    rationale: tr.t("finding", `${base}Concern` as MessageKey<"finding">, values),
  };
}

const FINDING_CATEGORY: Record<string, MessageKey<"ui">> = {
  "auth-surface": "categoryAuthSurface", "certificate-expiry": "categoryCertificate", "domain-expiry": "categoryDomainExpiry", "exposed-service": "categoryExposedService", "infrastructure-concentration": "categoryInfrastructureConcentration", "insecure-redirect": "categoryInsecureRedirect", "known-vulnerability": "categoryKnownVulnerability", "mail-security": "categoryMailSecurity", "non-production-exposure": "categoryNonProduction", "security-headers": "categorySecurityHeaders", "shadow-asset": "categoryShadowAsset", "surface-change": "categorySurfaceChange",
};

export function localizeFindingCategory(category: string, tr: Translator) {
  return tr.t("ui", FINDING_CATEGORY[category] ?? "categoryOther");
}
