// Regenerate the README screenshots that require a signed-in workspace.
//   node scripts/capture-authenticated-screenshots.mjs [baseUrl] [email] [password]
//
// The public captures (landing, scan graph, findings, attacker view) come from
// scripts/capture-screenshots.mjs and need no account. Guardian and Integrations
// do, which is why they used to drift: there was no repeatable way to take them.
//
// Point this at a DISPOSABLE workspace holding synthetic data — never a customer
// account. Against a local dev server that is a throwaway signup; the captured
// pages show connection state and posture, not credentials.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = process.argv[3] ?? "screenshots@outside.local";
const PASSWORD = process.argv[4];
if (!PASSWORD) {
  console.error("Usage: node scripts/capture-authenticated-screenshots.mjs [baseUrl] [email] <password>");
  process.exit(1);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "media");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });

try {
  // Sign in through the API so the run does not depend on the login form's markup.
  // context.request shares this context's cookie jar, so pages are authenticated.
  const login = await context.request.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!login.ok()) throw new Error(`Login failed: ${login.status()} — is the workspace seeded and the email verified?`);

  const page = await context.newPage();

  // Integrations — the BYOK connector surface.
  await page.goto(`${BASE}/integrations`, { waitUntil: "networkidle" });
  // Each connector loads its status asynchronously; wait for the badges to settle
  // so the shot never captures a page full of "Checking…".
  await page.getByText("Have I Been Pwned").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, "outside-integrations.png"), fullPage: false });
  console.log("captured outside-integrations.png");

  // Guardian — continuous change intelligence. On a free plan with no monitored
  // target this route renders an "Unlock Guardian" upsell instead of the
  // dashboard, and capturing that would replace a screenshot of the product with
  // a screenshot of a paywall. So the gate is the ABSENCE of the upsell, not the
  // presence of the word "Guardian" — which appears on both.
  await page.goto(`${BASE}/guardian`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const upsell = await page.getByRole("link", { name: /Unlock Guardian/i }).or(page.getByText(/Unlock Guardian/i)).first().isVisible().catch(() => false);
  const dashboard = await page.getByText(/Exposure Drift/i).first().isVisible().catch(() => false);
  if (dashboard && !upsell) {
    await page.screenshot({ path: join(OUT, "outside-guardian.png"), fullPage: false });
    console.log("captured outside-guardian.png");
  } else {
    console.log("skipped outside-guardian.png — this workspace shows the upsell, not the dashboard.");
    console.log("  Guardian needs a paid plan and a verified, monitored target with scan history.");
  }
} finally {
  await browser.close();
}
