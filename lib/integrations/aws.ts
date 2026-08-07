/**
 * AWS — BYOK (bring your own key) adapter.
 *
 * Pure provider logic: no storage, no auth, no HTTP framework. AWS is the one
 * provider that cannot use a bearer token: every request must carry a Signature
 * Version 4 signature derived from the access key pair, so the signing lives
 * here rather than in the shared HTTP helper.
 *
 * Read-only, and deliberately minimal in what it asks for:
 *   - STS GetCallerIdentity proves the credential works and needs no permissions
 *     at all, so a connection test cannot fail for a reason the customer would
 *     have to debug in IAM.
 *   - Route 53 ListHostedZones supplies the domains used to attribute hostnames
 *     OUTSIDE already discovered. `route53:ListHostedZones` is the only
 *     permission this connector needs.
 *
 * Neither half of the credential is ever logged, returned, or placed in an error
 * message.
 */

import { createHash, createHmac } from "node:crypto";
import { mapProviderStatus, networkFailure, type ProviderFailure } from "@/lib/integrations/providers/http";
import { splitCredentialPair } from "@/lib/integrations/pair-credential";

const LABEL = "AWS";
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_000_000;
const MAX_ZONES = 200;
/** Route 53 and STS are global services, signed against us-east-1. */
const REGION = "us-east-1";

export type AwsResult<T> = ({ ok: true } & T) | ProviderFailure;

const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value, "utf8").digest();

/**
 * Build the SigV4 Authorization header for a GET.
 *
 * Exported so the deterministic parts — canonical request, credential scope,
 * signing-key derivation — can be pinned by tests. A signature that silently
 * drifts would surface only as an opaque 403 from AWS.
 */
/**
 * A type alias rather than an interface: only aliases receive an implicit index
 * signature, which is what lets these headers be passed straight to fetch.
 */
export type SignedGetHeaders = {
  host: string;
  "x-amz-content-sha256": string;
  "x-amz-date": string;
  authorization: string;
};

export function signedGetHeaders(input: {
  accessKeyId: string;
  secretAccessKey: string;
  service: string;
  host: string;
  path: string;
  query: string;
  amzDate: string; // YYYYMMDDTHHMMSSZ
}): SignedGetHeaders {
  const { accessKeyId, secretAccessKey, service, host, path, query, amzDate } = input;
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex("");

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["GET", path, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${dateStamp}/${REGION}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), REGION), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** UTC timestamp in the compact form SigV4 requires. */
function amzNow(now = new Date()): string {
  return `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** A bounded signed GET. AWS answers XML, so the shared JSON helper cannot be used. */
async function signedGet(
  pair: { id: string; secret: string },
  service: string,
  host: string,
  path: string,
  query: string,
  signal?: AbortSignal,
): Promise<{ status: number; text: string; retryAfter: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("AWS request timed out.")), TIMEOUT_MS);
  const composed = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const headers = signedGetHeaders({
      accessKeyId: pair.id,
      secretAccessKey: pair.secret,
      service,
      host,
      path,
      query,
      amzDate: amzNow(),
    });
    const res = await fetch(`https://${host}${path}${query ? `?${query}` : ""}`, { headers, signal: composed });
    const raw = await res.text();
    return { status: res.status, text: raw.slice(0, MAX_BYTES), retryAfter: res.headers.get("retry-after") };
  } finally {
    clearTimeout(timer);
  }
}

/** Extract every occurrence of a simple XML element's text content. */
function xmlValues(xml: string, tag: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
  for (const match of xml.matchAll(pattern)) if (match[1]) out.push(match[1]);
  return out;
}

/**
 * Prove the credential works. GetCallerIdentity requires no IAM permissions, so
 * a failure here always means the credential itself is wrong — never that a
 * policy is missing.
 */
export async function verifyKey(raw: string, signal?: AbortSignal): Promise<AwsResult<{ account: string }>> {
  const pair = splitCredentialPair(raw);
  if (!pair) return { ok: false, code: "bad_format", message: "Enter both the AWS access key ID and the secret access key." };

  try {
    const { status, text, retryAfter } = await signedGet(pair, "sts", "sts.amazonaws.com", "/", "Action=GetCallerIdentity&Version=2011-06-15", signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "Rejected by AWS — check the access key is active and not restricted by a policy or SCP.",
      });
    }
    const account = xmlValues(text, "Account")[0] ?? "Connected";
    const arn = xmlValues(text, "Arn")[0];
    return { ok: true, account: arn ? `${account} (${arn.split("/").pop()})` : account };
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * Route 53 hosted zones, used only to attribute hostnames OUTSIDE already found.
 * Trailing dots are stripped so zone names compare against discovered hostnames.
 */
export async function ownedDomains(raw: string, signal?: AbortSignal): Promise<AwsResult<{ domains: string[] }>> {
  const pair = splitCredentialPair(raw);
  if (!pair) return { ok: false, code: "bad_format", message: "Enter both the AWS access key ID and the secret access key." };

  try {
    const { status, text, retryAfter } = await signedGet(pair, "route53", "route53.amazonaws.com", "/2013-04-01/hostedzone", `maxitems=${MAX_ZONES}`, signal);
    if (status !== 200) {
      return mapProviderStatus(status, {
        label: LABEL,
        retryAfter,
        forbidden: "AWS refused to list hosted zones — the credential needs the route53:ListHostedZones permission.",
      });
    }
    const domains = xmlValues(text, "Name")
      .map((name) => name.trim().toLowerCase().replace(/\.$/, ""))
      .filter((name) => name.length > 0);
    return { ok: true, domains: [...new Set(domains)].slice(0, MAX_ZONES) };
  } catch {
    return networkFailure(LABEL);
  }
}

/**
 * An AWS access key ID is 16–128 uppercase alphanumerics (AKIA…, ASIA…) and the
 * secret is 40 base64-ish characters. The live test remains the real check.
 */
export function looksLikeAwsCredential(value: string): boolean {
  const pair = splitCredentialPair(value);
  if (!pair) return false;
  return /^[A-Z0-9]{16,128}$/.test(pair.id) && pair.secret.length >= 20 && !/\s/.test(pair.secret);
}
