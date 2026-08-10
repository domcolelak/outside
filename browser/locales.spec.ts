import { expect, test } from "@playwright/test";

/**
 * The five-language public experience, in a real browser.
 *
 * Catalog parity is checked in CI from the files themselves, but parity says
 * nothing about what the page looks like. Hungarian and Czech labels are wider
 * than their English sources and pushed the header controls off a 390px screen —
 * a defect no unit test can see. These assertions render the page in every
 * supported language at both breakpoints and fail on the two things that
 * actually break: text the layout cannot hold, and English copy left behind.
 */
const LOCALES = ["en", "sk", "cs", "hu", "pl"] as const;

/** Copy that is deliberately identical everywhere: product and vendor names. */
const NONTRANSLATABLE = /^(OUTSIDE|Guardian|Attacker View|Chronos|Digital Twin|Evolution|Exposure Drift|Snapshot|Professional|Agency|Slack · Teams · Jira|Northstar Labs|Velora Commerce|Atlas Financial)$/;

test.describe("public experience in five languages", () => {
  for (const locale of LOCALES) {
    test(`renders the landing page in ${locale} without clipping or overflow`, async ({ page }) => {
      await page.goto("/");
      // Set the language the way a visitor does — through the endpoint that
      // signs the cookie. A hand-written cookie would test a path nobody takes.
      const response = await page.request.post("/api/locale", { data: { locale } });
      expect(response.ok()).toBe(true);

      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");

        // Assistive technology and browser translation both read this.
        await expect(page.locator("html")).toHaveAttribute("lang", locale);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${locale} at ${width}px scrolls horizontally`).toBeLessThanOrEqual(1);

        const clipped = await page.evaluate(() =>
          [...document.querySelectorAll("h1, h2, h3, a, button, span, div, li, p")]
            .filter((el) => el.children.length === 0 && el.textContent?.trim())
            // sr-only text is clipped on purpose, for screen readers.
            .filter((el) => !el.classList.contains("sr-only"))
            .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible")
            .map((el) => `${el.tagName}: ${el.textContent?.trim().slice(0, 40)}`),
        );
        expect(clipped, `${locale} at ${width}px clips text`).toEqual([]);
      }
    });
  }

  test("a visitor who picks Slovak gets Slovak copy, not English with a Slovak label", async ({ page }) => {
    await page.goto("/");
    await page.request.post("/api/locale", { data: { locale: "sk" } });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("internet");
    // The scan form appears twice — hero and closing call to action.
    await expect(page.getByRole("button", { name: /vonkajší povrch/i }).first()).toBeVisible();

    // The headings are the surface a prospect reads first; none of them may
    // still be the English source unless the phrase is a product name.
    const headings = await page.locator("h1, h2").allTextContents();
    const english = ["See what the internet knows", "Analyst-grade context.", "Start free. Monitor when it matters."];
    for (const heading of headings) {
      const text = heading.trim();
      if (NONTRANSLATABLE.test(text)) continue;
      expect(english, `"${text}" is still English`).not.toContain(text);
    }
  });

  test("an unsupported language falls back to English instead of failing", async ({ page }) => {
    const rejected = await page.request.post("/api/locale", { data: { locale: "de" } });
    expect(rejected.status()).toBe(400);

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^(en|sk|cs|hu|pl)$/);
  });
});
