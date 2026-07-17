import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("production critical journeys", () => {
  test("landing and authentication surfaces meet the accessibility baseline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("internet knows");
    await expect(page.getByRole("link", { name: /watch demo/i })).toBeVisible();

    const landing = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(landing.violations, JSON.stringify(landing.violations, null, 2)).toEqual([]);

    await page.goto("/login?mode=signup");
    await expect(
      page.locator("form").getByRole("button", { name: "Create account", exact: true }),
    ).toBeVisible();
    const auth = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(auth.violations, JSON.stringify(auth.violations, null, 2)).toEqual([]);
  });

  test("account creation establishes a hardened session and authenticated workspace", async ({ page }) => {
    const email = `browser-${Date.now()}@outside.example`;
    await page.goto("/login?mode=signup");
    await page.getByLabel("Name").fill("Browser Release");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Release-gate-password-2026!");
    const signupResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/auth/signup",
    );
    await page
      .locator("form")
      .getByRole("button", { name: "Create account", exact: true })
      .click();

    const signupResponse = await signupResponsePromise;
    expect(
      signupResponse.status(),
      await signupResponse.text(),
    ).toBe(200);

    // The release server is intentionally exercised through production mode,
    // so its __Host cookie is Secure and cannot persist over Playwright's local
    // HTTP transport. Verify the cookie contract, then present that exact
    // signed session to the protected server-rendered workspace.
    const setCookie = signupResponse.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("__Host-outside_session=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Secure");

    const sessionCookie = setCookie.split(";", 1)[0] ?? "";
    const accountResponse = await page.request.get("/account", {
      headers: { cookie: sessionCookie },
      maxRedirects: 0,
    });
    expect(accountResponse.status()).toBe(200);
    await expect(accountResponse.text()).resolves.toContain("Welcome, Browser");
  });

  test("the deterministic demo completes and opens Attacker View", async ({ page }) => {
    await page.goto("/scan?target=northstar&mode=demo");
    await expect(page.getByText("Demo", { exact: true }).first()).toBeVisible();
    const attacker = page.locator('[data-tour="attacker"]');
    await expect(attacker).toBeVisible({ timeout: 30_000 });
    await attacker.click();

    await expect(page.getByText("How the public surface reveals itself")).toBeVisible();
    await expect(page.getByText("Discovery only · never exploitation")).toBeVisible();
    await expect(page.getByRole("slider", { name: "Replay position" })).toBeVisible();
  });
});

test("health endpoint sustains the release smoke budget", async ({ request }) => {
  const warmup = await request.get("/api/livez");
  expect(warmup.ok()).toBeTruthy();

  const durations: number[] = [];
  const total = 120;
  const concurrency = 12;
  for (let offset = 0; offset < total; offset += concurrency) {
    await Promise.all(Array.from({ length: Math.min(concurrency, total - offset) }, async () => {
      const started = performance.now();
      const response = await request.get("/api/livez");
      durations.push(performance.now() - started);
      expect(response.status()).toBe(200);
    }));
  }
  durations.sort((left, right) => left - right);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  expect(p95, `local release-gate p95 was ${p95.toFixed(1)} ms`).toBeLessThan(500);
});
