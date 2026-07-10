import { describe, expect, it } from "vitest";
import { expectedTxtValue, isTokenInFile, isTokenPresent, issueToken, TXT_PREFIX, wellKnownUrl } from "./challenge";

describe("domain verification challenge", () => {
  it("issues unguessable, unique tokens bound to the domain", () => {
    const a = issueToken("acme.com", "secret");
    const b = issueToken("acme.com", "secret");
    expect(a).not.toEqual(b); // nonce differs each time
    expect(a.length).toBeGreaterThan(12);
  });

  it("formats the TXT value with the OUTSIDE prefix", () => {
    expect(expectedTxtValue("abc123")).toBe(`${TXT_PREFIX}=abc123`);
  });

  it("matches only the exact issued token", () => {
    const token = "tok_example";
    const value = expectedTxtValue(token);
    expect(isTokenPresent([value], token)).toBe(true);
    expect(isTokenPresent([`"${value}"`], token)).toBe(true); // provider quoting
    expect(isTokenPresent([`  ${value}  `], token)).toBe(true); // whitespace
    expect(isTokenPresent(["v=spf1 include:_spf.google.com ~all"], token)).toBe(false);
    expect(isTokenPresent([expectedTxtValue("other")], token)).toBe(false);
    expect(isTokenPresent([], token)).toBe(false);
  });

  it("file-based: matches the bare token or prefixed value across lines", () => {
    const token = "tok_file";
    expect(isTokenInFile(token, token)).toBe(true);
    expect(isTokenInFile(`# comment\n${expectedTxtValue(token)}\n`, token)).toBe(true);
    expect(isTokenInFile("nothing here", token)).toBe(false);
    expect(wellKnownUrl("acme.com")).toBe("https://acme.com/.well-known/outside-verify.txt");
  });
});
