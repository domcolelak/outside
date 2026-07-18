import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify, type JsonWebKey } from "node:crypto";
import { APP_URL } from "@/lib/config/runtime";
import { authSecret, authVerificationSecrets } from "@/lib/config/secrets";
import { safeEnterpriseJson } from "./http";
import { normalizeDomain } from "@/lib/security/target";

export const ENTERPRISE_SSO_COOKIE = "outside_enterprise_sso";
export interface OidcConfig { issuer: string; authorizationEndpoint: string; tokenEndpoint: string; jwksUri: string; clientId: string; clientSecret: string; scopes?: string; }
export interface SamlBrokerConfig extends OidcConfig { samlMetadataUrl?: string; brokered: true; }

function safeEndpoint(value: string): URL { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("SSO endpoints must use standard HTTPS."); normalizeDomain(url.hostname); return url; }
export function validateOidcConfig(value: unknown, protocol: "oidc" | "saml"): OidcConfig | SamlBrokerConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SSO configuration is required."); const raw = value as Record<string, unknown>;
  const required = ["issuer", "authorizationEndpoint", "tokenEndpoint", "jwksUri", "clientId", "clientSecret"]; const config: Record<string, string> = {};
  for (const field of required) { if (typeof raw[field] !== "string" || !(raw[field] as string).trim()) throw new Error(`SSO configuration requires ${field}.`); config[field] = (raw[field] as string).trim(); }
  const issuer = safeEndpoint(config.issuer!); for (const field of ["authorizationEndpoint", "tokenEndpoint", "jwksUri"]) { const endpoint = safeEndpoint(config[field]!); if (endpoint.origin !== issuer.origin && raw.allowCrossOriginEndpoints !== true) throw new Error("OIDC endpoints must share the issuer origin unless explicitly approved."); }
  if (protocol === "saml" && raw.brokered !== true) throw new Error("SAML must use the audited OIDC broker boundary; direct unsigned XML assertions are never accepted.");
  return { issuer: config.issuer!.replace(/\/$/, ""), authorizationEndpoint: config.authorizationEndpoint!, tokenEndpoint: config.tokenEndpoint!, jwksUri: config.jwksUri!, clientId: config.clientId!, clientSecret: config.clientSecret!, scopes: typeof raw.scopes === "string" ? raw.scopes : "openid email profile", ...(protocol === "saml" ? { brokered: true as const, samlMetadataUrl: typeof raw.samlMetadataUrl === "string" ? safeEndpoint(raw.samlMetadataUrl).toString() : undefined } : {}) };
}

interface SsoState { idpId: string; nonce: string; returnTo: string; exp: number; }
function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
export function makeSsoState(idpId: string, returnTo = "/enterprise"): string { const safeReturn = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/enterprise"; const payload = encode({ idpId, nonce: randomBytes(24).toString("base64url"), returnTo: safeReturn, exp: Math.floor(Date.now() / 1000) + 600 }); const signature = createHmac("sha256", authSecret()).update(payload).digest("base64url"); return `${payload}.${signature}`; }
export function verifySsoState(cookie: string | undefined, returned: string | null): SsoState | null { if (!cookie || !returned || cookie !== returned) return null; const [payload, signature] = cookie.split("."); if (!payload || !signature) return null; const actual = Buffer.from(signature); const valid = authVerificationSecrets().some((secret) => { const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url")); return expected.length === actual.length && timingSafeEqual(expected, actual); }); if (!valid) return null; try { const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SsoState; return state.idpId && state.nonce && state.exp >= Math.floor(Date.now() / 1000) ? state : null; } catch { return null; } }
export function oidcAuthorizationUrl(config: OidcConfig, state: string): string { const data = verifySsoState(state, state); if (!data) throw new Error("Invalid SSO state."); const endpoint = new URL(config.authorizationEndpoint), params = { client_id: config.clientId, redirect_uri: `${APP_URL}/api/enterprise/sso/callback`, response_type: "code", response_mode: "query", scope: config.scopes ?? "openid email profile", state, nonce: data.nonce }; for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value); return endpoint.toString(); }

interface JwtHeader { alg?: string; kid?: string; typ?: string; crit?: string[] }
interface IdClaims { iss?: string; aud?: string | string[]; azp?: string; exp?: number; iat?: number; nonce?: string; sub?: string; email?: string; email_verified?: boolean; name?: string }
interface Jwk { kty: string; kid?: string; alg?: string; use?: string; n?: string; e?: string; x?: string; y?: string; crv?: string }
export async function exchangeEnterpriseCode(config: OidcConfig, code: string, expectedNonce: string): Promise<{ email: string; name: string; subject: string }> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${APP_URL}/api/enterprise/sso/callback`, client_id: config.clientId, client_secret: config.clientSecret }).toString();
  const token = await safeEnterpriseJson<{ id_token?: string }>(config.tokenEndpoint, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }); if (!token.id_token) throw new Error("Identity provider did not return an ID token.");
  const parts = token.id_token.split("."); if (parts.length !== 3) throw new Error("Identity provider returned a malformed ID token."); const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")) as JwtHeader; const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as IdClaims;
  if (!header.kid || header.crit?.length || !["RS256", "ES256"].includes(header.alg ?? "")) throw new Error("Identity provider used an unsupported signing algorithm.");
  const jwks = await safeEnterpriseJson<{ keys?: Jwk[] }>(config.jwksUri); const jwk = jwks.keys?.find((item) => item.kid === header.kid && (!item.use || item.use === "sig") && (!item.alg || item.alg === header.alg)); if (!jwk) throw new Error("Identity provider signing key was not found.");
  const key = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" }), details = key.asymmetricKeyDetails; if (header.alg === "RS256" && Number(details?.modulusLength ?? 0) < 2048 || header.alg === "ES256" && details?.namedCurve !== "prime256v1") throw new Error("Identity provider signing key is too weak or uses the wrong curve."); const signature = Buffer.from(parts[2]!, "base64url"); let valid = false;
  if (header.alg === "RS256") valid = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, signature);
  else valid = verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: "ieee-p1363" }, signature);
  const now = Math.floor(Date.now() / 1000), audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || claims.iss?.replace(/\/$/, "") !== config.issuer || !audiences.includes(config.clientId) || audiences.length > 1 && claims.azp !== config.clientId || !claims.exp || claims.exp <= now || claims.iat && claims.iat > now + 60 || claims.nonce !== expectedNonce || !claims.sub || !claims.email || claims.email_verified === false) throw new Error("Identity provider token validation failed.");
  return { email: claims.email.toLowerCase(), name: claims.name || claims.email.split("@")[0]!, subject: claims.sub };
}
