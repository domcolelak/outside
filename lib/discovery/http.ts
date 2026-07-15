/**
 * HTTP + TLS observation of one verified-domain web surface.
 *
 * This is the only primitive OUTSIDE uses to contact a target web server, so it is
 * strictly bounded and SSRF-guarded: the host's resolved IPs must all be public
 * before we connect, the TLS handshake is pinned to a validated IP with SNI set
 * to the hostname (defeating DNS-rebinding), redirects are not followed, and the
 * response body is ignored. Everything observed is a fact ("HSTS header absent",
 * "certificate valid until …") — never an inference.
 */

import tls from "node:tls";
import type { IncomingHttpHeaders } from "node:http";
import { isSafePublicIp } from "@/lib/security/target";
import { pinnedHttpsGet } from "@/lib/security/pinned-https";
import { resolveHost } from "./providers";

const SECURITY_HEADERS: Array<{ key: string; label: string }> = [
  { key: "strict-transport-security", label: "Strict-Transport-Security (HSTS)" },
  { key: "content-security-policy", label: "Content-Security-Policy" },
  { key: "x-content-type-options", label: "X-Content-Type-Options" },
  { key: "x-frame-options", label: "X-Frame-Options" },
  { key: "referrer-policy", label: "Referrer-Policy" },
];

export interface HttpObservation {
  status?: number;
  server?: string;
  httpsVerified: boolean;
  redirectLocation?: string;
  securityTxt: "present" | "missing" | "invalid" | "unknown";
  presentHeaders: string[];
  missingHeaders: string[];
  technologies: string[];
  providerEvidence: string[];
  cloudProvider?: string;
  cdn?: string;
  cert?: {
    issuer?: string;
    validTo?: string; // ISO
    daysToExpiry?: number;
    fingerprint?: string;
  };
}

export interface HttpFingerprint {
  technologies: string[];
  providerEvidence: string[];
  cloudProvider?: string;
  cdn?: string;
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  const text = Array.isArray(value) ? value[0] : value;
  if (!text) return undefined;
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) || undefined;
}

/** Deterministic fingerprints from headers already returned by a verified host. */
export function fingerprintHttpHeaders(headers: IncomingHttpHeaders): HttpFingerprint {
  const result: HttpFingerprint = { technologies: [], providerEvidence: [] };
  const server = headerValue(headers, "server");
  const poweredBy = headerValue(headers, "x-powered-by");
  if (server) result.technologies.push(server);
  if (poweredBy) result.technologies.push(poweredBy);

  const observed = (name: string) => headerValue(headers, name) !== undefined;
  if (/cloudflare/i.test(server ?? "") || observed("cf-ray")) {
    result.cdn = "Cloudflare";
    result.providerEvidence.push(observed("cf-ray") ? "Observed the cf-ray response header." : "Observed Cloudflare in the Server response header.");
  } else if (/cloudfront/i.test(server ?? "") || observed("x-amz-cf-id")) {
    result.cloudProvider = "Amazon Web Services";
    result.cdn = "Amazon CloudFront";
    result.providerEvidence.push("Observed an Amazon CloudFront response-header signal.");
  } else if (observed("x-vercel-id")) {
    result.cloudProvider = "Vercel";
    result.cdn = "Vercel Edge Network";
    result.providerEvidence.push("Observed the x-vercel-id response header.");
  } else if (observed("x-nf-request-id")) {
    result.cloudProvider = "Netlify";
    result.cdn = "Netlify Edge";
    result.providerEvidence.push("Observed the x-nf-request-id response header.");
  } else if (/akamai/i.test(server ?? "") || observed("x-akamai-transformed")) {
    result.cdn = "Akamai";
    result.providerEvidence.push("Observed an Akamai response-header signal.");
  } else if (/fastly/i.test(server ?? "") || observed("x-fastly-request-id")) {
    result.cdn = "Fastly";
    result.providerEvidence.push("Observed a Fastly response-header signal.");
  } else if (observed("x-azure-ref")) {
    result.cloudProvider = "Microsoft Azure";
    result.cdn = "Azure Front Door";
    result.providerEvidence.push("Observed the x-azure-ref response header.");
  } else if (/gws|google frontend/i.test(server ?? "")) {
    result.cloudProvider = "Google Cloud";
    result.providerEvidence.push("Observed a Google frontend Server response header.");
  }
  result.technologies = [...new Set(result.technologies)];
  return result;
}

function fetchCert(ip: string, servername: string, signal?: AbortSignal): Promise<HttpObservation["cert"] | undefined> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: ip, port: 443, servername, rejectUnauthorized: false, timeout: 6000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) return resolve(undefined);
        const validTo = new Date(cert.valid_to);
        const days = Math.round((validTo.getTime() - Date.now()) / 86_400_000);
        const rawIssuer = cert.issuer?.O ?? cert.issuer?.CN;
        resolve({
          issuer: Array.isArray(rawIssuer) ? rawIssuer[0] : rawIssuer,
          validTo: isNaN(validTo.getTime()) ? undefined : validTo.toISOString(),
          daysToExpiry: isNaN(validTo.getTime()) ? undefined : days,
          fingerprint: cert.fingerprint256 || cert.fingerprint,
        });
      },
    );
    socket.on("error", () => resolve(undefined));
    signal?.addEventListener("abort", () => { socket.destroy(); resolve(undefined); }, { once: true });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(undefined);
    });
  });
}

/** Observe headers + certificate for a hostname, or null if it can't be reached safely. */
export async function observeHttp(host: string, signal?: AbortSignal): Promise<HttpObservation | null> {
  const rec = await resolveHost(host, signal).catch((error) => { if (signal?.aborted) throw error; return null; });
  const ips = [...(rec?.a ?? []), ...(rec?.aaaa ?? [])];
  if (ips.length === 0 || !ips.every(isSafePublicIp)) return null;

  const obs: HttpObservation = { presentHeaders: [], missingHeaders: [], technologies: [], providerEvidence: [], httpsVerified: false, securityTxt: "unknown" };

  // Headers via a bounded, IP-pinned GET. The response body is discarded.
  try {
    const res = await pinnedHttpsGet(host, ips, {
      path: "/",
      timeoutMs: 6_000,
      maxBodyBytes: 0,
      headers: { "user-agent": "OUTSIDE-observation/0.1 (+https://outside.example/about)" },
      signal,
    });
    obs.status = res.status;
    obs.httpsVerified = true;
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location;
      obs.redirectLocation = Array.isArray(location) ? location[0] : location;
    }
    const server = res.headers.server;
    obs.server = Array.isArray(server) ? server[0] : server;
    const fingerprint = fingerprintHttpHeaders(res.headers);
    obs.technologies = fingerprint.technologies;
    obs.providerEvidence = fingerprint.providerEvidence;
    obs.cloudProvider = fingerprint.cloudProvider;
    obs.cdn = fingerprint.cdn;
    for (const h of SECURITY_HEADERS) {
      if (res.headers[h.key]) obs.presentHeaders.push(h.label);
      else obs.missingHeaders.push(h.label);
    }
  } catch {
    // Header probe failed; still attempt the cert observation below.
  }

  // RFC 9116 disclosure contact. This is a separate bounded request to the
  // verified host, pinned to the same public addresses and never redirected.
  try {
    const response = await pinnedHttpsGet(host, ips, {
      path: "/.well-known/security.txt",
      timeoutMs: 6_000,
      maxBodyBytes: 64_000,
      headers: { "user-agent": "OUTSIDE-observation/0.1 (+https://outside.example/about)", accept: "text/plain" },
      signal,
    });
    if (response.status === 200) {
      const expires = /^Expires\s*:\s*(.+)$/im.exec(response.body)?.[1]?.trim();
      obs.securityTxt = /^Contact\s*:/im.test(response.body) && !!expires && Number.isFinite(Date.parse(expires)) && Date.parse(expires) > Date.now() ? "present" : "invalid";
    } else if (response.status === 404 || response.status === 410) {
      obs.securityTxt = "missing";
    }
  } catch {
    // Unknown is distinct from missing: transport failures do not prove absence.
  }

  // Certificate via a pinned TLS handshake to the first validated IP.
  obs.cert = await fetchCert(ips[0]!, host, signal);
  return obs.httpsVerified || obs.cert ? obs : null;
}
