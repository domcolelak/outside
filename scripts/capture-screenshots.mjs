// Regenerate README screenshots from the live demo scan.
//   node scripts/capture-screenshots.mjs [baseUrl]
// Defaults to the public demo. Writes PNGs into docs/media/.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.argv[2] ?? "https://outsideguardian.eu";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "media");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });

try {
  // Landing.
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(OUT, "outside-landing.png") });

  // Demo scan — auto-runs from the deep link; wait for the cinematic scan to settle.
  await page.goto(`${BASE}/scan?target=northstar&mode=demo`, { waitUntil: "domcontentloaded" });
  await page.getByText("Exposure posture").first().waitFor({ timeout: 60_000 });
  // Wait for a new-feature finding to render so the screenshot proves them.
  await page.getByText(/Heartbleed|Internet-exposed|expiring/i).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "outside-scan-graph.png") });

  // Findings panel close-up (the summary column, identified by its score header).
  const panel = page.locator(".scroll-thin").filter({ hasText: "Exposure posture" }).first();
  if (await panel.count()) {
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: join(OUT, "outside-findings.png") });
  }

  console.log("Captured screenshots into docs/media/");
} finally {
  await browser.close();
}
