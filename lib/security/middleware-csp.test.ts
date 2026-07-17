import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "@/middleware";

describe("middleware CSP nonce propagation", () => {
  it("forwards the response policy to the Next.js renderer request", () => {
    const request = new NextRequest("https://outside.example/login", {
      headers: { host: "outside.example" },
    });

    const response = middleware(request);
    const responsePolicy = response.headers.get("content-security-policy");
    const forwardedPolicy = response.headers.get(
      "x-middleware-request-content-security-policy",
    );

    expect(responsePolicy).toContain("'nonce-");
    expect(forwardedPolicy).toBe(responsePolicy);
    expect(response.headers.get("x-middleware-override-headers")).toContain(
      "content-security-policy",
    );
  });
});
