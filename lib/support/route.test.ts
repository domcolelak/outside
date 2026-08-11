import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/support/route";
import { __resetRateLimits } from "@/lib/security/ratelimit";

function request(body: unknown, contentType = "application/json") {
  return new NextRequest("https://outside.test/api/support", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  __resetRateLimits();
  vi.unstubAllEnvs();
});

describe("public support route", () => {
  it("returns reviewed localized FAQ copy without a model", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(request({
      locale: "sk",
      question: "Ako funguje overenie domény?",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      matchedId: "verification",
      source: "faq",
    });
  });

  it("rejects malformed and oversized questions", async () => {
    const malformed = await POST(request("{not-json"));
    expect(malformed.status).toBe(400);

    __resetRateLimits();
    const oversized = await POST(
      request({ question: "x".repeat(501), locale: "en" }),
    );
    expect(oversized.status).toBe(422);
    await expect(oversized.json()).resolves.toMatchObject({ code: "question_too_long" });
  });

  it("rate limits repeated public requests per client", async () => {
    vi.stubEnv("DATABASE_URL", "");
    for (let index = 0; index < 12; index += 1) {
      const response = await POST(request({ question: "pricing", locale: "en" }));
      expect(response.status).toBe(200);
    }

    const limited = await POST(request({ question: "pricing", locale: "en" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    await expect(limited.json()).resolves.toMatchObject({ code: "rate_limited" });
  });
});
