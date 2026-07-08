import { describe, expect, it } from "vitest";
import {
  InvalidTargetError,
  isSafePublicIp,
  normalizeDomain,
  registrableDomain,
} from "./target";

describe("normalizeDomain", () => {
  it("strips scheme, path, port, credentials and trailing dot", () => {
    expect(normalizeDomain("https://user:pw@API.Company.com:443/path?x=1")).toBe("api.company.com");
    expect(normalizeDomain("company.com.")).toBe("company.com");
    expect(normalizeDomain("  WWW.Example-Site.io  ")).toBe("www.example-site.io");
  });

  it("strips a wildcard prefix from certificate names", () => {
    expect(normalizeDomain("*.company.com")).toBe("company.com");
  });

  it("rejects IP literals", () => {
    expect(() => normalizeDomain("127.0.0.1")).toThrow(InvalidTargetError);
    expect(() => normalizeDomain("10.0.0.5")).toThrow(InvalidTargetError);
  });

  it("rejects reserved / internal TLDs", () => {
    expect(() => normalizeDomain("service.local")).toThrow(InvalidTargetError);
    expect(() => normalizeDomain("box.internal")).toThrow(InvalidTargetError);
    expect(() => normalizeDomain("foo.example")).toThrow(InvalidTargetError);
  });

  it("rejects malformed input", () => {
    expect(() => normalizeDomain("")).toThrow(InvalidTargetError);
    expect(() => normalizeDomain("not a domain")).toThrow(InvalidTargetError);
    expect(() => normalizeDomain("nodots")).toThrow(InvalidTargetError);
  });
});

describe("isSafePublicIp — SSRF guard", () => {
  it("blocks loopback, private, link-local and metadata ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0"]) {
      expect(isSafePublicIp(ip)).toBe(false);
    }
  });

  it("blocks IPv6 loopback, link-local and unique-local", () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1"]) {
      expect(isSafePublicIp(ip)).toBe(false);
    }
  });

  it("allows genuine public addresses", () => {
    expect(isSafePublicIp("8.8.8.8")).toBe(true);
    expect(isSafePublicIp("1.1.1.1")).toBe(true);
    expect(isSafePublicIp("2606:4700:4700::1111")).toBe(true);
  });
});

describe("registrableDomain", () => {
  it("returns the registrable base for common and multi-level TLDs", () => {
    expect(registrableDomain("api.staging.company.com")).toBe("company.com");
    expect(registrableDomain("app.service.co.uk")).toBe("service.co.uk");
    expect(registrableDomain("company.com")).toBe("company.com");
  });
});
