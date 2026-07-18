import type { Priority } from "@/lib/types";
import { guardianId } from "./identity";
import type { GuardianAnalysis, GuardianChecklistItem, GuardianEvent, GuardianGuidePlatform, GuardianRecommendation, GuardianRemediationGuide, GuardianSnapshot } from "./types";

const platformSteps: Partial<Record<GuardianGuidePlatform, Record<string, string[]>>> = {
  Cloudflare: {
    dnssec: ["Open DNS > Settings > DNSSEC for the verified zone.", "Enable DNSSEC and copy the generated DS parameters to the domain registrar.", "Wait for delegation propagation before confirming the DS record externally."],
    hsts: ["Confirm every covered hostname supports HTTPS.", "Open SSL/TLS > Edge Certificates > HTTP Strict Transport Security.", "Start with a conservative max-age and expand only after validation."],
    https: ["Set SSL/TLS encryption mode to Full (strict).", "Enable Always Use HTTPS after validating the origin certificate.", "Verify the public redirect and certificate chain."],
  },
  AWS: {
    https: ["Request or import a certificate in AWS Certificate Manager in the serving region.", "Attach it to the CloudFront distribution or Application Load Balancer HTTPS listener.", "Redirect the HTTP listener or viewer protocol policy to HTTPS."],
    tls: ["Use ACM-managed certificates where supported.", "Confirm DNS validation remains present and renewal is eligible.", "Set operational alerts before the observed expiry threshold."],
  },
  Azure: {
    https: ["Bind a managed or Key Vault certificate to the public endpoint.", "Require HTTPS on App Service, Front Door, or Application Gateway as applicable.", "Validate redirects and the served certificate from outside the tenant."],
    tls: ["Store the certificate in Key Vault or use a managed certificate.", "Confirm rotation is connected to the serving resource.", "Monitor the externally presented notAfter value."],
  },
  "Google Cloud": {
    https: ["Create a Google-managed certificate or Certificate Manager certificate map.", "Attach it to the external HTTPS load balancer.", "Configure HTTP-to-HTTPS redirection and verify the public endpoint."],
    tls: ["Use Certificate Manager for automated renewal.", "Verify DNS authorization and certificate attachment.", "Monitor the certificate actually served at the edge."],
  },
  "Google Workspace": {
    spf: ["Inventory every approved outbound mail source.", "Publish one SPF TXT record using Google's include plus only required additional senders.", "Validate alignment with a real outbound message."],
    dkim: ["Generate a DKIM record in Admin console > Apps > Google Workspace > Gmail > Authenticate email.", "Publish the selector TXT record in DNS.", "Start authentication and verify a signed outbound message."],
    dmarc: ["Create a reporting mailbox and publish a DMARC p=none policy with aggregate reporting.", "Review alignment reports and correct legitimate senders.", "Increase enforcement gradually to quarantine or reject."],
  },
  "Microsoft 365": {
    spf: ["Inventory Microsoft 365 and every other approved sender.", "Publish one SPF record containing include:spf.protection.outlook.com and only necessary sources.", "Validate lookup count and message alignment."],
    dkim: ["Open the Microsoft Defender portal DKIM settings for the domain.", "Publish both CNAME selectors exactly as supplied.", "Enable signing and verify an outbound message."],
    dmarc: ["Publish an aggregate-reporting DMARC policy after SPF and DKIM alignment.", "Review third-party senders and remediate failures.", "Move gradually to quarantine or reject."],
  },
  Vercel: {
    https: ["Confirm the custom domain is valid in Project Settings > Domains.", "Resolve any certificate issuance or DNS configuration warning.", "Enable the intended redirect and verify the external certificate."],
    security_txt: ["Add public/.well-known/security.txt to the application.", "Include Contact and Expires fields using RFC 9116 format.", "Deploy and verify the exact public path."],
  },
  Netlify: {
    https: ["Confirm the custom domain and DNS records in Domain management.", "Provision or renew the managed certificate under HTTPS.", "Enable Force TLS and verify the redirect externally."],
    security_txt: ["Add .well-known/security.txt to the published static directory.", "Include Contact and Expires fields.", "Deploy and verify the response is text/plain over HTTPS."],
  },
  "GitHub Pages": {
    https: ["Confirm the custom domain and DNS records in repository Pages settings.", "Wait for certificate provisioning to complete.", "Enable Enforce HTTPS and verify the public response."],
    security_txt: ["Add .well-known/security.txt to the published Pages source.", "Include Contact and Expires fields.", "Commit, deploy, and verify the public file."],
  },
};

const generic: Record<string, { title: string; steps: string[]; verification: string }> = {
  spf: { title: "Authorize outbound email senders", steps: ["Inventory every legitimate outbound sender.", "Publish exactly one SPF TXT policy for the organizational domain.", "Remove obsolete sources and keep DNS lookups within the protocol limit."], verification: "Query the domain TXT records and verify an outbound message passes aligned SPF." },
  dkim: { title: "Enable DKIM signing", steps: ["Identify the active selector in the mail provider.", "Publish the provider-generated public key in DNS.", "Enable signing after propagation."], verification: "Inspect a received message and confirm DKIM=pass with the expected aligned domain." },
  dmarc: { title: "Progress DMARC to enforcement", steps: ["Publish aggregate reporting with a controlled reporting mailbox.", "Correct alignment for approved senders.", "Move incrementally from monitoring to quarantine or reject."], verification: "Query _dmarc and review reports for aligned SPF or DKIM and the intended policy." },
  dnssec: { title: "Protect DNS delegation with DNSSEC", steps: ["Enable zone signing at the authoritative DNS provider.", "Publish the matching DS record through the registrar.", "Allow delegation caches to update."], verification: "Validate the DS/DNSKEY chain from an independent resolver." },
  hsts: { title: "Introduce HSTS safely", steps: ["Confirm HTTPS works on every hostname that may be covered.", "Add Strict-Transport-Security with a conservative max-age.", "Increase the lifetime and scope after monitoring."], verification: "Request the HTTPS endpoint and confirm the expected Strict-Transport-Security header." },
  https: { title: "Require HTTPS", steps: ["Provision a publicly trusted certificate.", "Serve the application on HTTPS.", "Redirect HTTP to HTTPS and remove mixed content."], verification: "Verify the external certificate chain and an HTTP-to-HTTPS redirect." },
  security_txt: { title: "Publish a responsible disclosure contact", steps: ["Create /.well-known/security.txt using RFC 9116.", "Include Contact and Expires fields.", "Assign an owner to refresh the file before expiry."], verification: "Fetch /.well-known/security.txt over HTTPS and confirm the content and MIME type." },
  mta_sts: { title: "Protect inbound mail transport", steps: ["Publish and test the HTTPS MTA-STS policy file.", "Publish the _mta-sts TXT version record.", "Move the policy to enforce after validating every MX host."], verification: "Retrieve the policy and confirm the TXT identifier and MX patterns match." },
  tls: { title: "Renew and automate the public certificate", steps: ["Identify the team and system responsible for the presented certificate.", "Renew or rotate before the threshold.", "Automate renewal and monitor the certificate served at the edge."], verification: "Re-scan the public service and confirm a new valid notAfter date." },
  email_security: { title: "Complete the email protection baseline", steps: ["Resolve the individual SPF, DKIM, DMARC, and MTA-STS checklist items.", "Test real outbound and inbound flows.", "Document providers, selectors, policies, and owners."], verification: "Confirm each individual Guardian mail control has deterministic passing evidence." },
};

function guides(code: string, snapshot: GuardianSnapshot): GuardianRemediationGuide[] {
  const base = generic[code] ?? generic.email_security!;
  const result: GuardianRemediationGuide[] = [{ platform: "Generic", title: base.title, steps: base.steps, verification: base.verification }];
  const providers = new Set(snapshot.inventory.flatMap((item) => [item.dnsProvider, item.cloudProvider, item.cdn, item.mailProvider, ...item.technologies]).filter(Boolean));
  for (const [platform, mapping] of Object.entries(platformSteps) as Array<[GuardianGuidePlatform, Record<string, string[]>]>) {
    if (![...providers].some((provider) => String(provider).toLowerCase().includes(platform.toLowerCase().replace("google cloud", "google")))) continue;
    const steps = mapping[code];
    if (steps) result.push({ platform, title: `${base.title} in ${platform}`, steps, verification: base.verification });
  }
  return result;
}

function priority(item: GuardianChecklistItem): Priority {
  if (item.state === "fail" && ["https", "tls", "dmarc", "email_security"].includes(item.code)) return "high";
  return item.state === "fail" ? "medium" : "low";
}

function fromChecklist(snapshot: GuardianSnapshot, item: GuardianChecklistItem): GuardianRecommendation {
  const assets = [...new Set(item.evidence.flatMap((entry) => entry.asset ? [entry.asset] : []))];
  return {
    id: guardianId("guardian-recommendation", snapshot.orgId, snapshot.target, `checklist:${item.code}`), orgId: snapshot.orgId, target: snapshot.target,
    code: `checklist:${item.code}`, status: "open", priority: priority(item), confidence: item.evidence.length ? 1 : 0.6,
    title: item.recommendedAction, why: item.whyItMatters,
    reasoning: `${item.label} is currently ${item.state}. ${item.explanation}`,
    affectedAssets: assets.length ? assets : [snapshot.target], evidence: item.evidence,
    suggestedReview: item.recommendedAction, businessImpact: item.whyItMatters, guides: guides(item.code, snapshot),
    firstObservedAt: snapshot.observedAt, lastObservedAt: snapshot.observedAt,
  };
}

function fromEvent(snapshot: GuardianSnapshot, event: GuardianEvent): GuardianRecommendation | null {
  const map: Partial<Record<GuardianEvent["type"], { code: string; title: string; review: string; impact: string }>> = {
    shadow_appeared: { code: `ownership:${event.affectedAssets.join("|")}`, title: "Confirm ownership of possible shadow infrastructure", review: "Map the asset to a business owner, purpose, data classification, and retirement plan.", impact: "Unowned infrastructure increases incident response time and creates lifecycle gaps." },
    nonproduction_reachable: { code: `nonprod:${event.affectedAssets.join("|")}`, title: "Review the public non-production surface", review: "Confirm the observed DNS or verified HTTP exposure is intentional, then review access, data, logging, and ownership controls.", impact: "Non-production systems can expose internal workflows or weaker operational controls." },
    auth_surface_new: { code: `auth:${event.affectedAssets.join("|")}`, title: "Review the new authentication surface", review: "Confirm ownership, intended audience, identity provider, MFA policy, and decommissioning path.", impact: "Unexpected authentication entry points expand the organization's identity boundary." },
    api_surface_new: { code: `api:${event.affectedAssets.join("|")}`, title: "Review the new API-related surface", review: "Confirm owner, consumers, authentication requirement, data classification, and production status.", impact: "New APIs can expand integration and data exposure even when correctly implemented." },
    asset_flapping: { code: `flapping:${event.affectedAssets.join("|")}`, title: "Investigate repeated asset presence changes", review: "Reconcile DNS, deployment, uptime, and retirement records with the observed presence sequence.", impact: "Unstable or intermittently exposed services are harder to own and monitor reliably." },
    surface_growth: { code: "surface-growth", title: "Reconcile recent external surface growth", review: "Review all newly observed assets as a group and assign an owner, environment, purpose, and lifecycle state.", impact: "Rapid inventory growth increases operational complexity and the probability of unmanaged assets." },
  };
  const spec = map[event.type];
  if (!spec) return null;
  return { id: guardianId("guardian-recommendation", snapshot.orgId, snapshot.target, spec.code), orgId: snapshot.orgId, target: snapshot.target, code: spec.code, status: "open", priority: event.severity, confidence: event.confidence, title: spec.title, why: event.why, reasoning: event.summary, affectedAssets: event.affectedAssets, evidence: event.evidence, suggestedReview: spec.review, businessImpact: spec.impact, guides: [{ platform: "Generic", title: spec.title, steps: [spec.review, "Record the confirmed owner and expected public exposure.", "Re-run Guardian after the review or remediation."], verification: "Confirm the next Guardian observation matches the documented intended state." }], firstObservedAt: snapshot.observedAt, lastObservedAt: snapshot.observedAt };
}

export function generateRecommendations(snapshot: GuardianSnapshot, events: GuardianEvent[]): GuardianRecommendation[] {
  const checklist = snapshot.checklist.filter((item) => item.state === "warning" || item.state === "fail").map((item) => fromChecklist(snapshot, item));
  const eventRecommendations = events.map((event) => fromEvent(snapshot, event)).filter((item): item is GuardianRecommendation => item !== null);
  return [...new Map([...checklist, ...eventRecommendations].map((item) => [item.code, item])).values()];
}

export function mergeRecommendationState(current: GuardianRecommendation[], prior: GuardianRecommendation[]): GuardianRecommendation[] {
  const old = new Map(prior.map((item) => [item.code, item]));
  return current.map((item) => {
    const previous = old.get(item.code);
    return previous ? { ...item, status: previous.status === "resolved" ? "open" : previous.status, firstObservedAt: previous.firstObservedAt } : item;
  });
}

export function recommendationSummary(analysis: GuardianAnalysis): string {
  const high = analysis.recommendations.filter((item) => item.priority === "high" || item.priority === "critical").length;
  return `${analysis.recommendations.length} open deterministic recommendation(s), including ${high} high-priority review item(s).`;
}
