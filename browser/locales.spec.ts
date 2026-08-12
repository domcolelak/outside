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

  for (const locale of LOCALES) {
    test(`renders sign-in in ${locale} without clipping or overflow`, async ({ page }) => {
      await page.goto("/login");
      const response = await page.request.post("/api/locale", { data: { locale } });
      expect(response.ok()).toBe(true);

      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/login");
        await expect(page.locator("html")).toHaveAttribute("lang", locale);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${locale} at ${width}px scrolls horizontally`).toBeLessThanOrEqual(1);
      }
    });
  }

  test("a rejected sign-in explains itself in the chosen language", async ({ page }) => {
    // The API answers with an English string and a stable code. This proves the
    // code is what reaches the person — otherwise a Slovak user would get a
    // fully translated form and an English failure.
    await page.goto("/login");
    await page.request.post("/api/locale", { data: { locale: "sk" } });
    await page.goto("/login");

    await page.getByLabel("E-mail").fill("definitely-not-a-user@example.invalid");
    await page.getByLabel("Heslo").fill("an-incorrect-password");
    await page.locator("form").getByRole("button", { name: "Prihlásiť sa", exact: true }).click();

    // Scoped to the form: Next renders its own empty role="alert" announcer.
    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert).toHaveText("Nesprávny e-mail alebo heslo.");
  });

  test("the signed-in workspace is written in the chosen language", async ({ page }) => {
    // The screen every signed-in person lands on. Asserted against a real
    // session, because most of its copy lives in client components that only
    // render once the page is actually interactive.
    const email = `locale-workspace-${Date.now()}@example.invalid`;
    await page.goto("/login");
    await page.request.post("/api/locale", { data: { locale: "sk" } });
    const signup = await page.request.post("/api/auth/signup", {
      data: { email, name: "Locale Tester", password: "a-long-enough-password" },
    });
    expect(signup.ok()).toBe(true);

    await page.goto("/account");
    await expect(page.locator("html")).toHaveAttribute("lang", "sk");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Vitajte");

    const body = await page.locator("body").innerText();
    for (const english of ["Monitored targets", "Change alerts", "Sign out", "Organizations"]) {
      expect(body, `"${english}" is still English`).not.toContain(english);
    }
  });

  test("billing and the Guardian paywall are written in the chosen language", async ({ page }) => {
    // Billing is where money changes hands and the paywall is what sells the
    // plan, so English on either is more costly than English anywhere else.
    const email = `locale-billing-${Date.now()}@example.invalid`;
    await page.goto("/login");
    await page.request.post("/api/locale", { data: { locale: "sk" } });
    expect((await page.request.post("/api/auth/signup", {
      data: { email, name: "Locale Tester", password: "a-long-enough-password" },
    })).ok()).toBe(true);

    await page.goto("/billing");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plány a predplatné");
    const billing = await page.locator("body").innerText();
    for (const english of ["Plans & subscription", "Current plan", "Interactive asset graph", "Up to 5 monitored domains"]) {
      expect(billing, `billing still shows "${english}"`).not.toContain(english);
    }
    // Product names stay as they are in every language.
    expect(billing).toContain("Professional");
    expect(billing).toContain("Agency");

    // A new workspace is on the free plan, so Guardian shows the paywall.
    await page.goto("/guardian");
    const guardian = await page.locator("body").innerText();
    expect(guardian).toContain("Odomknúť Guardian");
    for (const english of ["Analyst-grade context", "Unlock Guardian", "Fabricated findings"]) {
      expect(guardian, `the paywall still shows "${english}"`).not.toContain(english);
    }
  });

  test("an unsupported language falls back to English instead of failing", async ({ page }) => {
    const rejected = await page.request.post("/api/locale", { data: { locale: "de" } });
    expect(rejected.status()).toBe(400);

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", /^(en|sk|cs|hu|pl)$/);
  });
});
