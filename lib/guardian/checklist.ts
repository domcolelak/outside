import type { Asset, ScanResult } from "@/lib/types";
import type { GuardianChecklistCode, GuardianChecklistItem, GuardianChecklistState, GuardianEvidence } from "./types";

interface ItemInput {
  code: GuardianChecklistCode;
  label: string;
  state: GuardianChecklistState;
  asset?: Asset;
  observation: string;
  explanation: string;
  whyItMatters: string;
  recommendedAction: string;
}

function item(result: ScanResult, input: ItemInput): GuardianChecklistItem {
  const evidence: GuardianEvidence[] = input.state === "unknown" ? [] : [{
    source: input.asset?.evidence.at(-1)?.provider ?? "OUTSIDE deterministic analysis",
    observation: input.observation,
    observedAt: result.finishedAt,
    scanId: result.scanId,
    asset: input.asset?.canonical,
  }];
  return { code: input.code, label: input.label, state: input.state, evidence, explanation: input.explanation, whyItMatters: input.whyItMatters, recommendedAction: input.recommendedAction };
}

function presence(value: unknown, good: string[] = ["present", "enabled", "enforced", "valid"]): GuardianChecklistState {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (["unknown", "unverified", "not_observed"].includes(normalized)) return "unknown";
  if (good.includes(normalized)) return "pass";
  if (["monitoring", "none", "warning"].includes(normalized)) return "warning";
  return "fail";
}

/** A factual living checklist. Unknown is preferred over guessing. */
export function evaluateChecklist(result: ScanResult): GuardianChecklistItem[] {
  const root = result.graph.assets.find((asset) => asset.kind === "root_domain");
  const mail = result.graph.assets.find((asset) => asset.kind === "mail_service");
  const primary = result.graph.assets.find((asset) => Array.isArray(asset.attrs.presentHeaders))
    ?? result.graph.assets.find((asset) => asset.kind === "web_service")
    ?? root;
  const presentHeaders = new Set(Array.isArray(primary?.attrs.presentHeaders) ? primary.attrs.presentHeaders.map(String) : []);
  const certDays = typeof primary?.attrs.certDaysToExpiry === "number" ? primary.attrs.certDaysToExpiry : undefined;
  const httpObserved = primary?.discoveredVia.includes("http_observation") ?? false;

  const spfState = presence(mail?.attrs.spf);
  const dkimState = presence(mail?.attrs.dkim);
  const dmarcState = presence(mail?.attrs.dmarc);
  const mtaState: GuardianChecklistState = mail?.attrs.mtaSts === "present" ? "warning" : presence(mail?.attrs.mtaSts);
  const httpsObserved = primary?.attrs.https === "observed";
  const tlsState: GuardianChecklistState = certDays === undefined ? "unknown" : certDays < 0 ? "fail" : primary?.attrs.tlsValidation !== "valid" || certDays <= 30 ? "warning" : "pass";

  const rows: GuardianChecklistItem[] = [
    item(result, { code: "spf", label: "SPF", state: spfState, asset: mail, observation: `SPF state: ${String(mail?.attrs.spf ?? "not observed")}.`, explanation: "SPF authorizes the mail systems permitted to send for this domain.", whyItMatters: "Missing or overly weak sender authorization makes spoofing and delivery problems more likely.", recommendedAction: "Publish one provider-aligned SPF TXT record and keep DNS lookup count within the SPF limit." }),
    item(result, { code: "dkim", label: "DKIM", state: dkimState, asset: mail, observation: `DKIM state: ${String(mail?.attrs.dkim ?? "not observed")}.`, explanation: dkimState === "unknown" ? "A generic passive lookup cannot safely enumerate private DKIM selectors, so Guardian does not guess." : "DKIM cryptographically signs outbound messages.", whyItMatters: "DKIM supports message integrity and enables DMARC alignment.", recommendedAction: "Confirm the active selector in your mail provider, publish its public key, and verify signed outbound mail." }),
    item(result, { code: "dmarc", label: "DMARC", state: dmarcState, asset: mail, observation: `DMARC state: ${String(mail?.attrs.dmarc ?? "not observed")}.`, explanation: "DMARC defines how receivers handle messages that fail aligned SPF or DKIM.", whyItMatters: "An enforcement policy materially reduces direct domain spoofing.", recommendedAction: "Start with aggregate reporting, fix legitimate alignment, then progress to quarantine or reject." }),
    item(result, { code: "dnssec", label: "DNSSEC", state: presence(root?.attrs.dnssec), asset: root, observation: `DNSSEC delegation state: ${String(root?.attrs.dnssec ?? "not observed")}.`, explanation: "DNSSEC signs the DNS delegation chain when a DS record is published.", whyItMatters: "It helps resolvers detect forged DNS answers.", recommendedAction: "Enable DNSSEC at the DNS provider and publish the matching DS record through the registrar." }),
    item(result, { code: "hsts", label: "HSTS", state: !httpObserved ? "unknown" : presentHeaders.has("Strict-Transport-Security (HSTS)") ? "pass" : "fail", asset: primary, observation: presentHeaders.has("Strict-Transport-Security (HSTS)") ? "Strict-Transport-Security was observed." : "Strict-Transport-Security was not observed on the primary HTTPS response.", explanation: "HSTS instructs browsers to use HTTPS for future requests.", whyItMatters: "It reduces protocol downgrade and accidental cleartext access.", recommendedAction: "Add HSTS after confirming all covered hosts support HTTPS; increase max-age gradually before includeSubDomains/preload." }),
    item(result, { code: "https", label: "HTTPS", state: !httpObserved ? "unknown" : httpsObserved ? "pass" : "fail", asset: primary, observation: httpsObserved ? "The primary surface was observed over HTTPS with certificate validation." : "A validated HTTPS response was not observed for the primary surface.", explanation: "HTTPS authenticates the service and encrypts traffic in transit.", whyItMatters: "Public web and authentication traffic should not traverse plaintext channels.", recommendedAction: "Provision a trusted certificate, redirect HTTP to HTTPS, and remove mixed-content dependencies." }),
    item(result, { code: "security_txt", label: "security.txt", state: presence(primary?.attrs.securityTxt), asset: primary, observation: `security.txt state: ${String(primary?.attrs.securityTxt ?? "not observed")}.`, explanation: "security.txt publishes an official path for responsible vulnerability disclosure.", whyItMatters: "Researchers can report issues to the right team instead of using ad-hoc channels.", recommendedAction: "Publish /.well-known/security.txt with Contact and Expires fields and monitor its expiry." }),
    item(result, { code: "mta_sts", label: "MTA-STS", state: mtaState, asset: mail, observation: `MTA-STS state: ${String(mail?.attrs.mtaSts ?? "not observed")}.`, explanation: "MTA-STS lets sending mail servers require authenticated TLS for delivery.", whyItMatters: "It reduces downgrade and interception risk for inbound email transport.", recommendedAction: "Publish the _mta-sts TXT record and a valid HTTPS policy before moving to enforce mode." }),
    item(result, { code: "tls", label: "TLS certificate", state: tlsState, asset: primary, observation: certDays === undefined ? "Certificate lifetime was not observed." : `Certificate has ${certDays} day(s) remaining.`, explanation: "Guardian tracks the certificate currently presented by the verified primary surface.", whyItMatters: "Unexpected expiry causes outages and can indicate unmanaged certificate ownership.", recommendedAction: "Use managed renewal and alert at 45, 30, 14, and 7 days before expiry." }),
  ];

  const mailStates = [spfState, dkimState, dmarcState, mtaState];
  const known = mailStates.filter((state) => state !== "unknown");
  const emailState: GuardianChecklistState = known.length === 0 ? "unknown" : known.some((state) => state === "fail") ? "fail" : known.some((state) => state === "warning") || known.length < 4 ? "warning" : "pass";
  rows.push(item(result, { code: "email_security", label: "Email security", state: emailState, asset: mail, observation: `Observed mail controls: ${known.length} of 4; ${known.filter((state) => state === "pass").length} passing.`, explanation: "This roll-up reflects only individually observed SPF, DKIM, DMARC, and MTA-STS controls.", whyItMatters: "Layered sender authentication and transport policy protect brand trust and mail delivery.", recommendedAction: "Resolve the individual mail checklist items; Guardian will update this roll-up on the next scan." }));
  return rows;
}
