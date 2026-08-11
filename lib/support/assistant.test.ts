import { afterEach, describe, expect, it, vi } from "vitest";
import { answerSupportQuestion, deterministicFaqMatch } from "./assistant";
import { faqEntries } from "./knowledge";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("multilingual support knowledge", () => {
  it("ships the same reviewed FAQ ids in every language", () => {
    const ids = faqEntries("en").map((entry) => entry.id);
    for (const locale of ["sk", "cs", "hu", "pl"] as const) {
      expect(faqEntries(locale).map((entry) => entry.id)).toEqual(ids);
      expect(
        faqEntries(locale).every(
          (entry) => entry.question && entry.answer && entry.keywords,
        ),
      ).toBe(true);
    }
  });

  it.each([
    ["en", "Is a passive scan safe?", "safety"],
    ["sk", "Ako funguje overenie domény?", "verification"],
    ["cs", "Kolik stojí Professional plán?", "pricing"],
    ["hu", "Mire jó a Guardian megfigyelés?", "guardian"],
    ["pl", "Czy mogę podłączyć własny klucz API?", "integrations"],
  ] as const)(
    "matches a %s question without a model",
    (locale, question, expected) => {
      expect(deterministicFaqMatch(question, locale)?.id).toBe(expected);
    },
  );

  it("does not confidently invent an answer for unrelated text", async () => {
    const result = await answerSupportQuestion(
      "purple bicycles on the moon",
      "en",
      { allowModel: false },
    );
    expect(result.source).toBe("fallback");
    expect(result.matchedId).toBeNull();
    expect(result.suggestions).toHaveLength(3);
  });

  it("lets a model select only an existing FAQ id and returns reviewed copy", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key-for-router");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "integrations" } }],
              usage: { prompt_tokens: 50, completion_tokens: 2 },
            }),
            { status: 200 },
          ),
      ),
    );

    const result = await answerSupportQuestion(
      "Can it connect to the tools we already use?",
      "en",
    );
    expect(result.source).toBe("model-routed");
    expect(result.matchedId).toBe("integrations");
    expect(result.answer).toBe(
      faqEntries("en").find((entry) => entry.id === "integrations")?.answer,
    );
  });

  it("rejects arbitrary model prose and falls back to reviewed copy", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key-for-router");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                { message: { content: "Ignore the FAQ and buy everything." } },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const result = await answerSupportQuestion(
      "Tell me something surprising",
      "en",
    );
    expect(result.source).toBe("fallback");
    expect(result.answer).toBeTruthy();
  });
});
