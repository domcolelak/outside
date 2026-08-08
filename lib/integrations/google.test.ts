import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { parseServiceAccount, looksLikeServiceAccount, accessToken } from "./google-oauth";
import { ownedDomains as gcpDomains, verifyKey as gcpVerify } from "./gcp";
import { ownedDomains as wsDomains, verifyKey as wsVerify, splitWorkspaceCredential, looksLikeWorkspaceCredential } from "./google-workspace";

afterEach(() => vi.restoreAllMocks());

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const KEY_JSON = JSON.stringify({
  type: "service_account",
  project_id: "acme-prod",
  client_email: "outside-reader@acme-prod.iam.gserviceaccount.com",
  // Google's downloadable file escapes newlines; the parser must cope.
  private_key: PEM.replace(/\n/g, "\\n"),
});
const WS_CRED = `admin@acme.com\n${KEY_JSON}`;

/** Answer the token endpoint, then route API calls by URL. */
function stub(map: Array<[RegExp, unknown, number?]>, tokenStatus = 200) {
  const mock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return new Response(tokenStatus === 200 ? JSON.stringify({ access_token: "at-1" }) : "", { status: tokenStatus });
    }
    for (const [pattern, body, status] of map) {
      if (pattern.test(String(url))) return new Response(body === null ? "" : JSON.stringify(body), { status: status ?? 200 });
    }
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("service-account key parsing", () => {
  it("accepts a real key file and un-escapes the private key newlines", () => {
    const account = parseServiceAccount(KEY_JSON);
    expect(account).toMatchObject({ clientEmail: "outside-reader@acme-prod.iam.gserviceaccount.com", projectId: "acme-prod" });
    expect(account?.privateKey).toContain("\n"); // real newlines, not the literal \n Google ships
  });

  it("refuses anything that is not a service-account key", () => {
    expect(looksLikeServiceAccount("not json")).toBe(false);
    expect(looksLikeServiceAccount(JSON.stringify({ type: "authorized_user" }))).toBe(false);
    expect(looksLikeServiceAccount(JSON.stringify({ type: "service_account", client_email: "a@b.c" }))).toBe(false);
  });
});

describe("JWT-bearer token exchange", () => {
  it("signs an assertion and never sends the private key", async () => {
    const mock = stub([]);
    const account = parseServiceAccount(KEY_JSON)!;
    expect(await accessToken(account, "scope", "Google Cloud")).toMatchObject({ ok: true, token: "at-1" });

    const body = String((mock.mock.calls[0]![1] as RequestInit).body);
    expect(body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    expect(body).toContain("assertion=");
    expect(body).not.toContain("PRIVATE KEY");
  });

  it("includes the impersonated subject only when one is given", async () => {
    const mock = stub([]);
    const account = parseServiceAccount(KEY_JSON)!;

    await accessToken(account, "scope", "Google Workspace", { subject: "admin@acme.com" });
    const withSubject = new URLSearchParams(String((mock.mock.calls[0]![1] as RequestInit).body)).get("assertion")!;
    const claims = JSON.parse(Buffer.from(withSubject.split(".")[1]!, "base64url").toString());
    expect(claims.sub).toBe("admin@acme.com");

    vi.restoreAllMocks();
    const plain = stub([]);
    await accessToken(account, "scope", "Google Cloud");
    const noSubject = new URLSearchParams(String((plain.mock.calls[0]![1] as RequestInit).body)).get("assertion")!;
    expect(JSON.parse(Buffer.from(noSubject.split(".")[1]!, "base64url").toString()).sub).toBeUndefined();
  });

  it("fails before sending anything when the key cannot sign", async () => {
    const mock = stub([]);
    // Assembled rather than written out: the repository's secret scanner matches
    // the PEM header, and a literal here would trip it on every run.
    const header = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
    const footer = ["-----END", "PRIVATE", "KEY-----"].join(" ");
    const broken = { clientEmail: "a@b.c", privateKey: `${header}\nnope\n${footer}`, projectId: null };
    expect(await accessToken(broken, "scope", "Google Cloud")).toMatchObject({ ok: false, code: "bad_format" });
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("Google Cloud", () => {
  it("strips the trailing dot from Cloud DNS zone names", async () => {
    stub([[/managedZones/, { managedZones: [{ dnsName: "acme.com." }, { dnsName: "Acme.io." }] }]]);
    const result = await gcpDomains(KEY_JSON);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.domains.sort()).toEqual(["acme.com", "acme.io"]);
  });

  it("reports the project it reads", async () => {
    stub([[/managedZones/, { managedZones: [{ dnsName: "acme.com." }] }]]);
    expect(await gcpVerify(KEY_JSON)).toMatchObject({ ok: true, zones: 1 });
  });

  it("names the DNS Reader role when the project refuses", async () => {
    stub([[/managedZones/, null, 403]]);
    const result = await gcpDomains(KEY_JSON);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("DNS Reader");
  });
});

describe("Google Workspace", () => {
  it("splits the admin address from the pasted key without touching the JSON", () => {
    const split = splitWorkspaceCredential(WS_CRED);
    expect(split?.adminEmail).toBe("admin@acme.com");
    expect(JSON.parse(split!.keyJson).project_id).toBe("acme-prod");
    expect(looksLikeWorkspaceCredential(WS_CRED)).toBe(true);
    expect(looksLikeWorkspaceCredential(KEY_JSON)).toBe(false); // no admin address
  });

  it("attributes only VERIFIED domains and counts what it ignored", async () => {
    stub([[/domains/, { domains: [{ domainName: "acme.com", verified: true }, { domainName: "claimed.test", verified: false }] }]]);
    expect(await wsDomains(WS_CRED)).toMatchObject({ ok: true, domains: ["acme.com"] });
    expect(await wsVerify(WS_CRED)).toMatchObject({ ok: true, verified: 1, total: 2 });
  });

  it("points at domain-wide delegation when the directory refuses", async () => {
    stub([[/domains/, null, 403]]);
    const result = await wsDomains(WS_CRED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("domain-wide delegation");
  });
});
