import { afterEach, describe, expect, it, vi } from "vitest";
import { splitMicrosoftCredential, looksLikeMicrosoftCredential, accessToken } from "./microsoft-oauth";
import { splitCredentialParts, joinCredentialParts } from "./pair-credential";
import { ownedDomains as azureDomains, verifyKey as azureVerify } from "./azure";
import { ownedDomains as m365Domains, verifyKey as m365Verify } from "./m365";
import { azureProvider } from "./providers/azure";
import { m365Provider } from "./providers/m365";

afterEach(() => vi.restoreAllMocks());

const TENANT = "11111111-2222-3333-4444-555555555555";
const CLIENT = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const SECRET = "example-client-secret-value";
const CRED = joinCredentialParts(TENANT, CLIENT, SECRET);

/** Answer the token endpoint, then route resource calls by URL. */
function routes(map: Array<[RegExp, unknown, number?]>, tokenStatus = 200) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (String(url).includes("/oauth2/v2.0/token")) {
      return new Response(tokenStatus === 200 ? JSON.stringify({ access_token: "at-1" }) : "", { status: tokenStatus });
    }
    for (const [pattern, body, status] of map) {
      if (pattern.test(String(url))) return new Response(body === null ? "" : JSON.stringify(body), { status: status ?? 200 });
    }
    return new Response("", { status: 404 });
  });
}
const stub = (...args: Parameters<typeof routes>) => {
  const mock = routes(...args);
  vi.stubGlobal("fetch", mock);
  return mock;
};

describe("three-part credential", () => {
  it("splits into exactly three parts, letting only the secret contain colons", () => {
    expect(splitMicrosoftCredential(CRED)).toEqual({ tenantId: TENANT, clientId: CLIENT, clientSecret: SECRET });
    expect(splitMicrosoftCredential(joinCredentialParts(TENANT, CLIENT, "has:colons:inside"))).toMatchObject({
      clientSecret: "has:colons:inside",
    });
  });

  it("refuses a half-filled credential rather than applying part of it", () => {
    expect(splitMicrosoftCredential(`${TENANT}:${CLIENT}`)).toBeNull();
    expect(splitMicrosoftCredential(`${TENANT}:${CLIENT}:`)).toBeNull();
    expect(splitCredentialParts("only-one", 3)).toBeNull();
  });

  it("requires both identifiers to be GUIDs", () => {
    expect(looksLikeMicrosoftCredential(CRED)).toBe(true);
    expect(looksLikeMicrosoftCredential(joinCredentialParts("not-a-guid", CLIENT, SECRET))).toBe(false);
    expect(looksLikeMicrosoftCredential(joinCredentialParts(TENANT, CLIENT, "tiny"))).toBe(false);
  });

  it("expands into the variables each provider's scan reads", () => {
    expect(azureProvider.expandEnv?.(CRED)).toEqual({
      AZURE_TENANT_ID: TENANT,
      AZURE_CLIENT_ID: CLIENT,
      AZURE_CLIENT_SECRET: SECRET,
    });
    expect(m365Provider.expandEnv?.("broken")).toEqual({});
  });
});

describe("token exchange", () => {
  it("posts client_credentials with the requested scope, and never in the URL", async () => {
    const mock = stub([]);
    const result = await accessToken({ tenantId: TENANT, clientId: CLIENT, clientSecret: SECRET }, "https://graph.microsoft.com/.default", "Microsoft 365");
    expect(result).toMatchObject({ ok: true, token: "at-1" });

    const [url, init] = mock.mock.calls[0]!;
    expect(String(url)).toContain(`/${TENANT}/oauth2/v2.0/token`);
    expect(String(url)).not.toContain(SECRET); // the secret belongs in the body, never the URL
    const body = String((init as RequestInit).body);
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain(encodeURIComponent("https://graph.microsoft.com/.default"));
  });

  it("explains an expired secret rather than reporting an empty result", async () => {
    stub([], 401);
    const result = await accessToken({ tenantId: TENANT, clientId: CLIENT, clientSecret: SECRET }, "scope", "Azure");
    expect(result).toMatchObject({ ok: false, code: "invalid_key" });
  });
});

describe("Azure", () => {
  it("separates a wrong application from a missing role assignment", async () => {
    // Signing in works but no subscription is readable: connected, not yet useful.
    stub([[/\/subscriptions\?/, { value: [] }]]);
    expect(await azureVerify(CRED)).toMatchObject({ ok: true, subscriptions: 0 });
  });

  it("collects DNS zones across readable subscriptions", async () => {
    stub([
      [/\/subscriptions\?/, { value: [{ subscriptionId: "sub-1" }, { subscriptionId: "sub-2" }] }],
      [/sub-1\/providers\/Microsoft\.Network\/dnszones/, { value: [{ name: "acme.com" }] }],
      [/sub-2\/providers\/Microsoft\.Network\/dnszones/, { value: [{ name: "Acme.io" }] }],
    ]);
    const result = await azureDomains(CRED);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.domains.sort()).toEqual(["acme.com", "acme.io"]);
  });

  it("says the Reader role is missing instead of reporting no domains", async () => {
    stub([[/\/subscriptions\?/, null, 403]]);
    const result = await azureDomains(CRED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Reader role");
  });
});

describe("Microsoft 365", () => {
  it("attributes only VERIFIED tenant domains", async () => {
    // An unverified domain is claimed, not proven; attributing on it would
    // assert ownership the customer has not established.
    stub([[/\/v1\.0\/domains/, { value: [{ id: "acme.com", isVerified: true }, { id: "claimed.test", isVerified: false }] }]]);
    expect(await m365Domains(CRED)).toMatchObject({ ok: true, domains: ["acme.com"] });
  });

  it("reports how many unverified domains were ignored", async () => {
    stub([[/\/v1\.0\/domains/, { value: [{ id: "acme.com", isVerified: true }, { id: "claimed.test", isVerified: false }] }]]);
    expect(await m365Verify(CRED)).toMatchObject({ ok: true, verified: 1, total: 2 });
  });

  it("names the permission it needs when Graph refuses", async () => {
    stub([[/\/v1\.0\/domains/, null, 403]]);
    const result = await m365Domains(CRED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Domain.Read.All");
  });
});
