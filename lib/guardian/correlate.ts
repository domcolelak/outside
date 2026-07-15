import type { ChangeEvent } from "@/lib/persistence";
import type { Priority } from "@/lib/types";
import { guardianId } from "./identity";
import type {
  GuardianChecklistItem,
  GuardianEvent,
  GuardianEventCategory,
  GuardianEventType,
  GuardianInventoryItem,
  GuardianSnapshot,
} from "./types";

interface CorrelationInput {
  current: GuardianSnapshot;
  previous?: GuardianSnapshot;
  history: GuardianSnapshot[];
  changes?: ChangeEvent[];
}

interface EventInput {
  type: GuardianEventType;
  category: GuardianEventCategory;
  severity: Priority;
  confidence: number;
  title: string;
  summary: string;
  why: string;
  assets: string[];
  observations: string[];
  groupKey: string;
}

function evidence(snapshot: GuardianSnapshot, assets: string[], observations: string[]) {
  return observations.map((observation, index) => ({
    source: "OUTSIDE scan correlation",
    observation,
    observedAt: snapshot.observedAt,
    scanId: snapshot.scanId,
    asset: assets[index] ?? assets[0],
  }));
}

function makeEvent(snapshot: GuardianSnapshot, input: EventInput): GuardianEvent {
  return {
    id: guardianId("guardian-event", snapshot.orgId, snapshot.target, snapshot.scanId, input.groupKey),
    orgId: snapshot.orgId,
    target: snapshot.target,
    scanId: snapshot.scanId,
    type: input.type,
    category: input.category,
    severity: input.severity,
    confidence: input.confidence,
    title: input.title,
    summary: input.summary,
    why: input.why,
    affectedAssets: [...new Set(input.assets)].sort(),
    evidence: evidence(snapshot, input.assets, input.observations),
    groupKey: input.groupKey,
    observedAt: snapshot.observedAt,
  };
}

function describeList(values: string[]): string {
  return values.length ? values.join(", ") : "none observed";
}

function itemMap(snapshot?: GuardianSnapshot): Map<string, GuardianInventoryItem> {
  return new Map((snapshot?.inventory ?? []).map((item) => [item.canonical, item]));
}

function checklistMap(snapshot?: GuardianSnapshot): Map<string, GuardianChecklistItem> {
  return new Map((snapshot?.checklist ?? []).map((item) => [item.code, item]));
}

function appearedEvent(snapshot: GuardianSnapshot, change: ChangeEvent, current?: GuardianInventoryItem): GuardianEvent {
  const common = {
    confidence: 1,
    assets: [change.canonical],
    observations: [`${change.canonical} was present in scan ${snapshot.scanId} and absent from the immediately preceding inventory.`],
  };
  if (current?.isAuthSurface) return makeEvent(snapshot, { ...common, type: "auth_surface_new", category: "identity", severity: "high", title: "New public authentication surface", summary: `${change.label} is newly observable and was classified as an authentication surface from its public signals.`, why: "Authentication surfaces are high-value business entry points and ownership, access policy, and lifecycle should be confirmed.", groupKey: `auth-new:${change.canonical}` });
  if (current?.isApiSurface) return makeEvent(snapshot, { ...common, type: "api_surface_new", category: "surface", severity: "high", title: "New API-related surface", summary: `${change.label} is newly observable and carries deterministic API-related signals.`, why: "A newly public API can expand data and integration exposure even when it is intentional.", groupKey: `api-new:${change.canonical}` });
  if (current?.isNonProduction) return makeEvent(snapshot, { ...common, type: "nonproduction_reachable", category: "surface", severity: "high", confidence: 0.82, title: "New non-production surface is publicly observable", summary: `${change.label} is newly observable and its hostname or verified public response contains a non-production signal.`, why: "Staging and development systems often have different ownership, data, and access-control expectations than production.", groupKey: `nonprod-new:${change.canonical}` });
  if (current?.isShadow) return makeEvent(snapshot, { ...common, type: "shadow_appeared", category: "surface", severity: "high", confidence: 0.7, title: "Possible shadow asset appeared", summary: `${change.label} is newly observable and OUTSIDE's existing ownership signals classify it for review as possible shadow infrastructure.`, why: "Unclear ownership can delay patching, incident response, certificate renewal, and decommissioning.", groupKey: `shadow-new:${change.canonical}` });
  return makeEvent(snapshot, { ...common, type: "asset_new", category: "surface", severity: change.priority, title: "New public asset observed", summary: `${change.label} appeared on the organization's external surface.`, why: "New public assets should be mapped to an owner and an expected business purpose.", groupKey: `asset-new:${change.canonical}` });
}

function crossedThreshold(current?: number, previous?: number, thresholds = [45, 30, 14, 7, 0]): boolean {
  if (current === undefined || current > thresholds[0]!) return false;
  return previous === undefined || thresholds.some((threshold) => current <= threshold && previous > threshold);
}

/** Correlate factual observations into meaningful, deduplicated Guardian events. */
export function correlateGuardianEvents({ current, previous, history, changes: suppliedChanges = [] }: CorrelationInput): GuardianEvent[] {
  const events: GuardianEvent[] = [];
  const now = itemMap(current);
  const before = itemMap(previous);
  const changes = [...suppliedChanges];

  // Guardian remains independently recoverable when scan persistence completed
  // but its post-processing crashed before the original ChangeSummary was kept.
  if (previous && changes.length === 0) {
    const everSeen = new Set(history.flatMap((snapshot) => snapshot.inventory.map((item) => item.canonical)));
    for (const item of current.inventory) {
      const old = before.get(item.canonical);
      if (!old) changes.push({ type: everSeen.has(item.canonical) ? "asset_returned" : "asset_appeared", canonical: item.canonical, label: item.label, detail: everSeen.has(item.canonical) ? "A previously observed asset is publicly observable again after being absent." : "A new public asset appeared on the external surface.", priority: item.priority });
      else {
        if (old.technologies.join("|") !== item.technologies.join("|")) changes.push({ type: "technology_changed", canonical: item.canonical, label: item.label, detail: "Observed technology signals changed since the previous scan.", priority: "medium", from: describeList(old.technologies), to: describeList(item.technologies) });
        if (old.certKey && item.certKey && old.certKey !== item.certKey) changes.push({ type: "certificate_changed", canonical: item.canonical, label: item.label, detail: "The certificate presented for this hostname changed since the previous scan.", priority: "medium", from: old.certKey, to: item.certKey });
      }
    }
    for (const item of previous.inventory) if (!now.has(item.canonical)) changes.push({ type: "asset_disappeared", canonical: item.canonical, label: item.label, detail: "An asset observed in the previous scan was not observed in the current scan.", priority: "low" });
  }

  for (const change of changes) {
    const asset = now.get(change.canonical);
    if (change.type === "asset_appeared") events.push(appearedEvent(current, change, asset));
    if (change.type === "asset_returned") events.push(makeEvent(current, { type: "asset_returned", category: "surface", severity: change.priority, confidence: 1, title: "Historical asset reappeared", summary: `${change.label} is publicly observable again after being absent.`, why: "A reappearing asset may indicate an intentional restoration, DNS reuse, or incomplete decommissioning and should be reconciled with its owner.", assets: [change.canonical], observations: [change.detail], groupKey: `asset-returned:${change.canonical}` }));
    if (change.type === "asset_disappeared") events.push(makeEvent(current, { type: "asset_removed", category: "surface", severity: "low", confidence: 1, title: "Public asset disappeared", summary: `${change.label} is no longer observable in the current inventory.`, why: "Disappearance can reflect successful decommissioning or an outage; Guardian records it without assuming which occurred.", assets: [change.canonical], observations: [change.detail], groupKey: `asset-removed:${change.canonical}` }));
    if (change.type === "technology_changed") events.push(makeEvent(current, { type: "technology_changed", category: "infrastructure", severity: change.priority, confidence: 0.9, title: "Observed technology changed", summary: `${change.label} changed from ${change.from ?? "none"} to ${change.to ?? "none"}.`, why: "Technology changes can indicate a deployment, migration, proxy change, or ownership transition.", assets: [change.canonical], observations: [`Previous: ${change.from ?? "none"}; current: ${change.to ?? "none"}.`], groupKey: `technology:${change.canonical}` }));
    if (change.type === "certificate_changed") events.push(makeEvent(current, { type: "certificate_changed", category: "certificate", severity: change.priority, confidence: 1, title: "Presented certificate changed", summary: `${change.label} now presents a different certificate identity.`, why: "Certificate rotation is often routine, but unexpected issuer or identity changes are valuable lifecycle evidence.", assets: [change.canonical], observations: [`Previous certificate key: ${change.from}; current certificate key: ${change.to}.`], groupKey: `certificate:${change.canonical}` }));
  }

  for (const [canonical, item] of now) {
    const old = before.get(canonical);
    if (crossedThreshold(item.certDaysToExpiry, old?.certDaysToExpiry)) events.push(makeEvent(current, { type: "certificate_expiring", category: "certificate", severity: (item.certDaysToExpiry ?? 46) <= 14 ? "critical" : "high", confidence: 1, title: "Certificate renewal window reached", summary: `${item.label} has ${item.certDaysToExpiry} day(s) remaining on its observed certificate.`, why: "Expired certificates cause outages and erode trust; threshold-based events avoid repeat alerts on every scan.", assets: [canonical], observations: [`Certificate notAfter: ${item.certNotAfter ?? "unknown"}; days remaining: ${item.certDaysToExpiry}.`], groupKey: `cert-expiry:${canonical}:${item.certDaysToExpiry! <= 0 ? 0 : item.certDaysToExpiry! <= 7 ? 7 : item.certDaysToExpiry! <= 14 ? 14 : item.certDaysToExpiry! <= 30 ? 30 : 45}` }));
    if (crossedThreshold(item.domainDaysToExpiry, old?.domainDaysToExpiry, [60, 30, 14, 7, 0])) events.push(makeEvent(current, { type: "domain_expiring", category: "identity", severity: (item.domainDaysToExpiry ?? 61) <= 14 ? "critical" : "high", confidence: 1, title: "Domain renewal window reached", summary: `${item.label} has ${item.domainDaysToExpiry} day(s) remaining until the publicly reported registration expiry.`, why: "Domain expiry can interrupt every dependent service and create brand-control risk.", assets: [canonical], observations: [`Domain expiry: ${item.domainExpiresAt ?? "unknown"}; days remaining: ${item.domainDaysToExpiry}.`], groupKey: `domain-expiry:${canonical}:${item.domainDaysToExpiry! <= 0 ? 0 : item.domainDaysToExpiry! <= 7 ? 7 : item.domainDaysToExpiry! <= 14 ? 14 : item.domainDaysToExpiry! <= 30 ? 30 : 60}` }));
    if (!old) continue;
    const oldDns = [...old.addresses, ...(old.cnames ?? [])].join("|");
    const newDns = [...item.addresses, ...(item.cnames ?? [])].join("|");
    if (oldDns !== newDns) events.push(makeEvent(current, { type: "dns_changed", category: "infrastructure", severity: "medium", confidence: 1, title: "DNS destination changed", summary: `${item.label} exposes a different public address or CNAME destination set.`, why: "A changed destination can reflect a deployment, provider migration, failover, or unexpected DNS modification.", assets: [canonical], observations: [`Previous addresses: ${describeList(old.addresses)}; CNAMEs: ${describeList(old.cnames ?? [])}.`, `Current addresses: ${describeList(item.addresses)}; CNAMEs: ${describeList(item.cnames ?? [])}.`], groupKey: `dns:${canonical}` }));
    const oldMail = [old.mx.join("|"), old.spf, old.dkim, old.dmarc, old.mtaSts].join("::");
    const newMail = [item.mx.join("|"), item.spf, item.dkim, item.dmarc, item.mtaSts].join("::");
    if (oldMail !== newMail) events.push(makeEvent(current, { type: "mail_security_changed", category: "mail", severity: "high", confidence: 1, title: "Mail configuration changed", summary: `${item.label} has a different observable mail-routing or mail-security configuration.`, why: "Mail routing and authentication changes affect brand protection, delivery, and business continuity.", assets: [canonical], observations: [`Previous: MX ${describeList(old.mx)}, SPF ${old.spf ?? "unknown"}, DMARC ${old.dmarc ?? "unknown"}, MTA-STS ${old.mtaSts ?? "unknown"}.`, `Current: MX ${describeList(item.mx)}, SPF ${item.spf ?? "unknown"}, DMARC ${item.dmarc ?? "unknown"}, MTA-STS ${item.mtaSts ?? "unknown"}.`], groupKey: `mail:${canonical}` }));
    if (old.redirectLocation !== item.redirectLocation) events.push(makeEvent(current, { type: "redirect_changed", category: "infrastructure", severity: "medium", confidence: 1, title: "Redirect destination changed", summary: `${item.label} now exposes a different redirect destination.`, why: "Redirect changes can alter user journeys, authentication boundaries, and third-party dependencies.", assets: [canonical], observations: [`Previous redirect: ${old.redirectLocation ?? "none"}; current redirect: ${item.redirectLocation ?? "none"}.`], groupKey: `redirect:${canonical}` }));
    const oldInfra = [old.dnsProvider, old.cloudProvider, old.cdn, old.mailProvider].join("|");
    const newInfra = [item.dnsProvider, item.cloudProvider, item.cdn, item.mailProvider].join("|");
    if (oldInfra !== newInfra) events.push(makeEvent(current, { type: "infrastructure_changed", category: "infrastructure", severity: "medium", confidence: 0.9, title: "Infrastructure provider signals changed", summary: `${item.label} has different publicly observable provider signals.`, why: "Provider signals can indicate cloud, DNS, mail, or delivery migration and should be reconciled with planned work; headers and DNS aliases are evidence, not proof of ownership.", assets: [canonical], observations: [`Previous: DNS ${old.dnsProvider ?? "unknown"}, cloud ${old.cloudProvider ?? "unknown"}, CDN ${old.cdn ?? "unknown"}, mail ${old.mailProvider ?? "unknown"}.`, `Current: DNS ${item.dnsProvider ?? "unknown"}, cloud ${item.cloudProvider ?? "unknown"}, CDN ${item.cdn ?? "unknown"}, mail ${item.mailProvider ?? "unknown"}.`, `Previous source signals: ${(old.providerEvidence ?? []).join("; ") || "none retained"}.`, `Current source signals: ${(item.providerEvidence ?? []).join("; ") || "none retained"}.`], groupKey: `infrastructure:${canonical}` }));
    if (!old.isShadow && item.isShadow) events.push(makeEvent(current, { type: "shadow_appeared", category: "surface", severity: "high", confidence: 0.7, title: "Asset now requires ownership review", summary: `${item.label} now meets OUTSIDE's existing possible-shadow classification.`, why: "Ownership ambiguity creates operational and security blind spots.", assets: [canonical], observations: ["The current scan contains a qualifying asset.shadow signal that the preceding scan did not."], groupKey: `shadow-state:${canonical}` }));
    if (old.isShadow && !item.isShadow) events.push(makeEvent(current, { type: "shadow_disappeared", category: "surface", severity: "info", confidence: 0.7, title: "Shadow-asset signal cleared", summary: `${item.label} no longer meets the possible-shadow classification.`, why: "Guardian records positive lifecycle movement while preserving the underlying scan evidence.", assets: [canonical], observations: ["The preceding scan contained a qualifying asset.shadow signal and the current scan does not."], groupKey: `shadow-cleared:${canonical}` }));
    if (!old.isNonProduction && item.isNonProduction) events.push(makeEvent(current, { type: "nonproduction_reachable", category: "surface", severity: "high", confidence: 0.82, title: "Public surface now carries a non-production signal", summary: `${item.label} remains publicly observable and now has a qualifying non-production signal.`, why: "A changed environment signal can reflect a deployment, repurposed hostname, or previously unrecognized staging surface.", assets: [canonical], observations: ["The current observation contains a qualifying env.nonprod signal that the preceding observation did not."], groupKey: `nonprod-state:${canonical}` }));
    if (!old.isAuthSurface && item.isAuthSurface) events.push(makeEvent(current, { type: "auth_surface_new", category: "identity", severity: "high", confidence: 0.9, title: "Existing asset now exposes authentication signals", summary: `${item.label} is now classified as a public authentication surface.`, why: "A new identity entry point changes the organization's external authentication boundary.", assets: [canonical], observations: ["The current observation contains an authentication-surface classification that the preceding observation did not."], groupKey: `auth-state:${canonical}` }));
    if (!old.isApiSurface && item.isApiSurface) events.push(makeEvent(current, { type: "api_surface_new", category: "surface", severity: "high", confidence: 0.9, title: "Existing asset now exposes API signals", summary: `${item.label} is now classified as an API-related public surface.`, why: "A new API classification can indicate changed routing, deployment, or externally exposed integration functionality.", assets: [canonical], observations: ["The current observation contains an API-surface classification that the preceding observation did not."], groupKey: `api-state:${canonical}` }));
  }

  const oldChecklist = checklistMap(previous);
  for (const currentItem of current.checklist) {
    const old = oldChecklist.get(currentItem.code);
    if (old && old.state !== currentItem.state) events.push(makeEvent(current, { type: "checklist_changed", category: currentItem.code.includes("mail") || ["spf", "dkim", "dmarc", "mta_sts"].includes(currentItem.code) ? "mail" : "posture", severity: currentItem.state === "fail" ? "high" : currentItem.state === "warning" ? "medium" : "info", confidence: 1, title: `${currentItem.label} checklist state changed`, summary: `${currentItem.label} moved from ${old.state} to ${currentItem.state}.`, why: "A deterministic security-control observation changed between consecutive scans.", assets: currentItem.evidence.flatMap((entry) => entry.asset ? [entry.asset] : []), observations: [`Previous state: ${old.state}; current state: ${currentItem.state}.`], groupKey: `checklist:${currentItem.code}` }));
  }

  if (previous) {
    const delta = current.metrics.assets - previous.metrics.assets;
    if (delta >= 5 && delta / Math.max(previous.metrics.assets, 1) >= 0.25) events.push(makeEvent(current, { type: "surface_growth", category: "surface", severity: "high", confidence: 1, title: "External surface grew significantly", summary: `The observable inventory grew from ${previous.metrics.assets} to ${current.metrics.assets} assets.`, why: "Rapid growth increases ownership, certificate, access, and decommissioning workload even when every new asset is legitimate.", assets: current.inventory.filter((item) => !before.has(item.canonical)).map((item) => item.canonical), observations: [`Asset count increased by ${delta} (${Math.round(delta / Math.max(previous.metrics.assets, 1) * 100)}%).`], groupKey: "surface-growth" }));
    const apiDelta = current.metrics.apiSurfaces - previous.metrics.apiSurfaces;
    if (apiDelta >= 2 && current.metrics.apiSurfaces >= Math.max(2, previous.metrics.apiSurfaces * 2)) events.push(makeEvent(current, { type: "surface_growth", category: "surface", severity: "high", confidence: 1, title: "API-related external surface doubled", summary: `API-related assets increased from ${previous.metrics.apiSurfaces} to ${current.metrics.apiSurfaces}.`, why: "Rapid API growth expands integration ownership and data-boundary review requirements.", assets: current.inventory.filter((item) => item.isApiSurface && !before.get(item.canonical)?.isApiSurface).map((item) => item.canonical), observations: [`API-related surface count increased by ${apiDelta}.`], groupKey: "api-surface-growth" }));
  }

  const chronological = [...history, current].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const canonicals = new Set(chronological.flatMap((snapshot) => snapshot.inventory.map((item) => item.canonical)));
  for (const canonical of canonicals) {
    const states = chronological.map((snapshot) => snapshot.inventory.some((item) => item.canonical === canonical));
    let transitions = 0;
    for (let index = 1; index < states.length; index += 1) if (states[index] !== states[index - 1]) transitions += 1;
    if (transitions >= 3 && now.has(canonical) && (changes.some((change) => change.canonical === canonical))) events.push(makeEvent(current, { type: "asset_flapping", category: "surface", severity: "medium", confidence: 1, title: "Asset repeatedly disappears and returns", summary: `${canonical} changed presence ${transitions} times across ${states.length} observations.`, why: "Repeated presence changes can indicate unstable service, rotating DNS, incomplete retirement, or intermittent discovery and deserve ownership review.", assets: [canonical], observations: [`Presence sequence: ${states.map((present) => present ? "present" : "absent").join(" → ")}.`], groupKey: `flapping:${canonical}` }));
  }

  return [...new Map(events.map((event) => [event.groupKey, event])).values()];
}
