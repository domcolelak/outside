import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveConnection,
  getConnectionSummary,
  getConnectionToken,
  deleteConnection,
  tokenHint,
  __resetConnections,
} from "./connections";

// The encryption helper is shared with Guardian channels and needs a real key.
vi.stubEnv("GUARDIAN_ENCRYPTION_KEY", "f".repeat(64));

beforeEach(() => __resetConnections());

const TOKEN = "cf-token-abcdefghijklmnop-9f2a";
const ZONES = [{ id: "z1", name: "acme.com" }];

async function connect(orgId = "org_1") {
  return saveConnection({ orgId, provider: "cloudflare", token: TOKEN, zones: ZONES, createdBy: "usr_1" });
}

describe("integration connections", () => {
  it("stores the token encrypted and returns it only through the token accessor", async () => {
    await connect();
    expect(await getConnectionToken("org_1", "cloudflare")).toBe(TOKEN);
  });

  it("never exposes the token in the browser-facing summary", async () => {
    const summary = await connect();
    expect(JSON.stringify(summary)).not.toContain(TOKEN);
    const fetched = await getConnectionSummary("org_1", "cloudflare");
    expect(JSON.stringify(fetched)).not.toContain(TOKEN);
    expect(fetched?.zones).toEqual(ZONES);
  });

  it("reveals at most the last four characters as a hint", () => {
    expect(tokenHint(TOKEN)).toBe("token ending 9f2a");
    expect(tokenHint(TOKEN)).not.toContain("abcdefghijklmnop");
  });

  it("is scoped per organization — another tenant sees nothing", async () => {
    await connect("org_1");
    expect(await getConnectionSummary("org_2", "cloudflare")).toBeNull();
    expect(await getConnectionToken("org_2", "cloudflare")).toBeNull();
  });

  it("re-connecting replaces the stored credential", async () => {
    await connect();
    await saveConnection({ orgId: "org_1", provider: "cloudflare", token: "cf-token-second-credential-1234", zones: ZONES, createdBy: "usr_1" });
    expect(await getConnectionToken("org_1", "cloudflare")).toBe("cf-token-second-credential-1234");
  });

  it("disconnecting removes the credential entirely", async () => {
    await connect();
    await deleteConnection("org_1", "cloudflare");
    expect(await getConnectionSummary("org_1", "cloudflare")).toBeNull();
    expect(await getConnectionToken("org_1", "cloudflare")).toBeNull();
  });
});
