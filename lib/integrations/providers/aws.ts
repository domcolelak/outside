/**
 * AWS as a ProviderDefinition. All AWS-specific logic — SigV4 signing, the XML
 * responses — stays in the pure adapter it wraps; this file only adapts it to
 * the shared framework.
 */

import { verifyKey, ownedDomains, looksLikeAwsCredential } from "@/lib/integrations/aws";
import type { ProviderDefinition, ProviderValidation } from "./types";

async function validate(raw: string, signal?: AbortSignal): Promise<ProviderValidation> {
  const verification = await verifyKey(raw, signal);
  if (!verification.ok) {
    return { ok: false, code: verification.code, message: verification.message, status: verification.status, retryAfterSeconds: verification.retryAfterSeconds };
  }

  // The credential can be valid while lacking Route 53 read access, so the two
  // are reported separately: connected, but attribution not yet available.
  const owned = await ownedDomains(raw, signal);
  const count = owned.ok ? owned.domains.length : 0;
  return {
    ok: true,
    accountLabel: verification.account,
    capabilities: [
      {
        id: "asset_attribution",
        label: "Asset attribution",
        available: owned.ok && count > 0,
        detail: owned.ok
          ? count > 0
            ? `${count} Route 53 hosted zone${count === 1 ? "" : "s"} available to attribute discovered assets against`
            : "This account has no Route 53 hosted zones, so there is nothing to attribute against yet"
          : owned.message,
      },
    ],
  };
}

export const awsProvider: ProviderDefinition = {
  id: "aws",
  name: "AWS",
  category: "attack_surface",
  summary:
    "Attributes discovered hostnames to your Route 53 hosted zones, so anything left unattributed stands out as a possible shadow asset. Read-only — the only permission needed is route53:ListHostedZones.",
  credentialKind: "id_secret",
  envKey: "AWS_ACCESS_KEY_ID",
  envKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
  runLabel: "AWS",
  expandEnv(raw): Record<string, string> {
    const separator = raw.indexOf(":");
    if (separator <= 0) return {};
    return { AWS_ACCESS_KEY_ID: raw.slice(0, separator).trim(), AWS_SECRET_ACCESS_KEY: raw.slice(separator + 1).trim() };
  },
  docsUrl: "https://console.aws.amazon.com/iam/home#/security_credentials",
  keyPlaceholder: "Secret access key",
  looksValid: looksLikeAwsCredential,
  formatHint: "Enter the AWS access key ID and its secret access key.",
  validate,
  async ownedDomains(raw, signal) {
    const result = await ownedDomains(raw, signal);
    return result.ok ? { ok: true, domains: result.domains } : { ok: false, message: result.message };
  },
};
