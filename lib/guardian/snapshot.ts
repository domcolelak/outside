import type { Asset, ScanResult } from "@/lib/types";
import { numberAttr, sortedStrings, stringAttr } from "./identity";
import type { GuardianChecklistItem, GuardianInventoryItem, GuardianSnapshot } from "./types";

function inventoryItem(asset: Asset): GuardianInventoryItem {
  return {
    canonical: asset.canonical,
    label: asset.label,
    kind: asset.kind,
    priority: asset.priority,
    addresses: sortedStrings(asset.attrs.addresses),
    technologies: sortedStrings(asset.attrs.technologies),
    status: stringAttr(asset.attrs.status),
    certKey: stringAttr(asset.attrs.certFingerprint) ?? stringAttr(asset.attrs.certIssuer),
    certNotAfter: stringAttr(asset.attrs.certNotAfter),
    certDaysToExpiry: numberAttr(asset.attrs.certDaysToExpiry),
    redirectLocation: stringAttr(asset.attrs.redirectLocation),
    mx: sortedStrings(asset.attrs.mx),
    spf: stringAttr(asset.attrs.spf),
    dkim: stringAttr(asset.attrs.dkim),
    dmarc: stringAttr(asset.attrs.dmarc),
    dnssec: stringAttr(asset.attrs.dnssec),
    mtaSts: stringAttr(asset.attrs.mtaSts),
    mailProvider: stringAttr(asset.attrs.mailProvider),
    securityTxt: stringAttr(asset.attrs.securityTxt),
    dnsProvider: stringAttr(asset.attrs.dnsProvider),
    cloudProvider: stringAttr(asset.attrs.cloudProvider),
    cdn: stringAttr(asset.attrs.cdn),
    domainExpiresAt: stringAttr(asset.attrs.domainExpiresAt),
    domainDaysToExpiry: numberAttr(asset.attrs.domainDaysToExpiry),
    isShadow: asset.signals.some((signal) => signal.code === "asset.shadow" && signal.confidence >= 0.55),
    isNonProduction: asset.signals.some((signal) => signal.code === "env.nonprod" && signal.confidence >= 0.6),
    isAuthSurface: asset.kind === "auth_surface" || asset.signals.some((signal) => signal.code === "surface.auth"),
    isApiSurface: asset.kind === "api_surface" || asset.signals.some((signal) => signal.code === "surface.api"),
  };
}

export function createGuardianSnapshot(orgId: string, result: ScanResult, checklist: GuardianChecklistItem[]): GuardianSnapshot {
  const inventory = result.graph.assets.map(inventoryItem).sort((a, b) => a.canonical.localeCompare(b.canonical));
  const providers = new Set(inventory.flatMap((item) => [item.dnsProvider, item.cloudProvider, item.cdn, item.mailProvider]).filter((value): value is string => !!value));
  const technologies = new Set(inventory.flatMap((item) => item.technologies));
  const checklistPassed = checklist.filter((item) => item.state === "pass").length;
  const checklistActionable = checklist.filter((item) => item.state === "warning" || item.state === "fail").length;
  const metrics = {
    assets: inventory.length,
    webSurfaces: inventory.filter((item) => ["web_service", "auth_surface", "api_surface"].includes(item.kind)).length,
    shadowAssets: inventory.filter((item) => item.isShadow).length,
    authSurfaces: inventory.filter((item) => item.isAuthSurface).length,
    apiSurfaces: inventory.filter((item) => item.isApiSurface).length,
    nonProduction: inventory.filter((item) => item.isNonProduction).length,
    technologies: technologies.size,
    infrastructureProviders: providers.size,
    cloudAssets: inventory.filter((item) => !!item.cloudProvider).length,
    cdnFrontedAssets: inventory.filter((item) => !!item.cdn).length,
    expiringCertificates: inventory.filter((item) => typeof item.certDaysToExpiry === "number" && item.certDaysToExpiry <= 45).length,
    checklistPassed,
    checklistActionable,
    complexityIndex: Math.round((inventory.length + technologies.size * 0.7 + providers.size * 1.5 + inventory.filter((item) => item.isAuthSurface || item.isApiSurface).length * 1.2) * 10) / 10,
  };
  return { orgId, target: result.target, scanId: result.scanId, observedAt: result.finishedAt, exposureScore: result.score.value, metrics, inventory, checklist };
}
