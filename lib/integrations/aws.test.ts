import { afterEach, describe, expect, it, vi } from "vitest";
import { signedGetHeaders, verifyKey, ownedDomains, looksLikeAwsCredential } from "./aws";
import { awsProvider } from "./providers/aws";

afterEach(() => vi.restoreAllMocks());

const ID = "AKIAIOSFODNN7EXAMPLE";
const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const CRED = `${ID}:${SECRET}`;

const base = {
  accessKeyId: ID,
  secretAccessKey: SECRET,
  service: "route53",
  host: "route53.amazonaws.com",
  path: "/2013-04-01/hostedzone",
  query: "maxitems=200",
  amzDate: "20260101T000000Z",
};

function stub(status: number, body: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
}

describe("SigV4 signing", () => {
  it("produces the documented Authorization shape", () => {
    const auth = signedGetHeaders(base).authorization;
    expect(auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20260101\/us-east-1\/route53\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[a-f0-9]{64}$/,
    );
  });

  it("is deterministic for identical input", () => {
    expect(signedGetHeaders(base).authorization).toBe(signedGetHeaders(base).authorization);
  });

  it("changes when anything that is signed changes", () => {
    // If the signature stopped depending on one of these, AWS would answer an
    // opaque 403 and nothing here would have caught the drift.
    const signature = (over: Partial<typeof base>) => signedGetHeaders({ ...base, ...over }).authorization.split("Signature=")[1];
    const original = signature({});
    expect(signature({ secretAccessKey: `${SECRET}x` })).not.toBe(original);
    expect(signature({ amzDate: "20260102T000000Z" })).not.toBe(original);
    expect(signature({ path: "/2013-04-01/hostedzonesbyname" })).not.toBe(original);
    expect(signature({ query: "maxitems=1" })).not.toBe(original);
    expect(signature({ service: "sts" })).not.toBe(original);
    expect(signature({ host: "sts.amazonaws.com" })).not.toBe(original);
  });

  it("never puts the secret in the headers it produces", () => {
    const headers = signedGetHeaders(base);
    expect(JSON.stringify(headers)).not.toContain(SECRET);
    expect(headers.authorization).toContain(ID); // the key id is public by design
  });

  it("scopes the credential to the signing date, not the request date", () => {
    expect(signedGetHeaders({ ...base, amzDate: "20260315T123456Z" }).authorization).toContain("/20260315/us-east-1/route53/aws4_request");
  });
});

describe("credential format", () => {
  it("accepts a well-formed pair and rejects a malformed one", () => {
    expect(looksLikeAwsCredential(CRED)).toBe(true);
    expect(looksLikeAwsCredential(ID)).toBe(false);
    expect(looksLikeAwsCredential(`lowercase-id:${SECRET}`)).toBe(false);
    expect(looksLikeAwsCredential(`${ID}:short`)).toBe(false);
  });

  it("expands into both variables the scan reads", () => {
    expect(awsProvider.expandEnv?.(CRED)).toEqual({ AWS_ACCESS_KEY_ID: ID, AWS_SECRET_ACCESS_KEY: SECRET });
    expect(awsProvider.expandEnv?.("broken")).toEqual({});
  });
});

describe("verifyKey", () => {
  it("refuses a malformed pair before signing anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyKey("no-secret")).toMatchObject({ ok: false, code: "bad_format" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the account and identity out of the STS response", async () => {
    stub(200, "<GetCallerIdentityResult><Account>123456789012</Account><Arn>arn:aws:iam::123456789012:user/outside-readonly</Arn></GetCallerIdentityResult>");
    expect(await verifyKey(CRED)).toMatchObject({ ok: true, account: "123456789012 (outside-readonly)" });
  });

  it("maps a rejected credential and never echoes the secret", async () => {
    stub(403, "<Error><Code>InvalidClientTokenId</Code></Error>");
    const result = await verifyKey(CRED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain(SECRET);
  });
});

describe("ownedDomains", () => {
  it("strips the trailing dot so zone names compare against hostnames", async () => {
    stub(200, "<ListHostedZonesResponse><HostedZones><HostedZone><Name>acme.com.</Name></HostedZone><HostedZone><Name>Other.Example.</Name></HostedZone></HostedZones></ListHostedZonesResponse>");
    expect(await ownedDomains(CRED)).toMatchObject({ ok: true, domains: ["acme.com", "other.example"] });
  });

  it("explains the missing permission rather than reporting no domains", async () => {
    // Reporting "owns nothing" here would turn every asset into a false
    // shadow-asset candidate; the customer needs to know it is an IAM policy.
    stub(403, "<Error><Code>AccessDenied</Code></Error>");
    const result = await ownedDomains(CRED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("route53:ListHostedZones");
  });
});
