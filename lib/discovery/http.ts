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
  presentHeaders: string[];
  missingHeaders: string[];
  cert?: {
    issuer?: string;
    validTo?: string; // ISO
    daysToExpiry?: number;
    fingerprint?: string;
  };
}

function fetchCert(ip: string, servername: string): Promise<HttpObservation["cert"] | undefined> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: ip, port: 443, servername, rejectUnauthorized: false, timeout: 6000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert || !cert.valid_to) return resolve(undefined);
        const validTo = new Date(cert.valid_to);
        const days = Math.round((validTo.getTime() - Date.now()) / 86_400_000);
        resolve({
          issuer: cert.issuer?.O || cert.issuer?.CN,
          validTo: isNaN(validTo.getTime()) ? undefined : validTo.toISOString(),
          daysToExpiry: isNaN(validTo.getTime()) ? undefined : days,
          fingerprint: cert.fingerprint256 || cert.fingerprint,
        });
      },
    );
    socket.on("error", () => resolve(undefined));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(undefined);
    });
  });
}

/** Observe headers + certificate for a hostname, or null if it can't be reached safely. */
export async function observeHttp(host: string): Promise<HttpObservation | null> {
  const rec = await resolveHost(host).catch(() => null);
  const ips = [...(rec?.a ?? []), ...(rec?.aaaa ?? [])];
  if (ips.length === 0 || !ips.every(isSafePublicIp)) return null;

  const obs: HttpObservation = { presentHeaders: [], missingHeaders: [] };

  // Headers via a bounded GET (redirects not followed).
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://${host}/`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "OUTSIDE-observation/0.1 (+https://outside.example/about)" },
    }).finally(() => clearTimeout(timer));
    obs.status = res.status;
    obs.server = res.headers.get("server") ?? undefined;
    for (const h of SECURITY_HEADERS) {
      if (res.headers.get(h.key)) obs.presentHeaders.push(h.label);
      else obs.missingHeaders.push(h.label);
    }
  } catch {
    // Header probe failed; still attempt the cert observation below.
  }

  // Certificate via a pinned TLS handshake to the first validated IP.
  obs.cert = await fetchCert(ips[0]!, host);
  return obs;
}
