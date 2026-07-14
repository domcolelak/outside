/**
 * HTTP + TLS observation of the primary web surface.
 *
 * This is the one place OUTSIDE contacts the target's own web server, so it is
 * strictly bounded and SSRF-guarded: the host's resolved IPs must all be public
 * before we connect, the TLS handshake is pinned to a validated IP with SNI set
 * to the hostname (defeating DNS-rebinding), redirects are not followed, and the
 * response body is ignored. Everything observed is a fact ("HSTS header absent",
 * "certificate valid until …") — never an inference.
 */

import tls from "node:tls";
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
  cert?: {
    issuer?: string;
    validTo?: string; // ISO
    daysToExpiry?: number;
    fingerprint?: string;
  };
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

  const obs: HttpObservation = { presentHeaders: [], missingHeaders: [], httpsVerified: false, securityTxt: "unknown" };

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
  return obs;
}
