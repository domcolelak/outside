import { afterEach, describe, expect, it } from "vitest";
import { appUrl } from "./runtime";

const original = process.env.APP_URL;
afterEach(() => {
  if (original === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = original;
});

describe("runtime URL configuration", () => {
  it("normalizes an absolute HTTP URL to its origin", () => {
    process.env.APP_URL = "https://outside.example/account";
    expect(appUrl()).toBe("https://outside.example");
  });

  it("rejects non-HTTP protocols", () => {
    process.env.APP_URL = "javascript:alert(1)";
    expect(() => appUrl()).toThrow(/absolute http\(s\) URL/);
  });
});
