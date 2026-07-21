// Record a sales walkthrough video + capture a high-end screenshot set from the
// live demo. Output goes to a sale-assets folder (outside the repo).
//   node scripts/sales-walkthrough.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "https://outsideguardian.eu";
const OUT = process.argv[3] ?? "C:/Users/16dom/outside-screenshots/sales";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const settle = (ms = 1200) => page.waitForTimeout(ms);

async function step(label, fn) {
  try { await fn(); console.log("ok:", label); }
  catch (e) { console.log("skip:", label, "-", e.message.split("\n")[0]); }
}

try {
  // 1) Landing — the first action.
  await page.goto(BASE, { waitUntil: "networkidle" });
  await settle(1500);
  await shot("01-landing");

  // 2) Demo scan — cinematic reveal.
  await page.goto(`${BASE}/scan?target=northstar&mode=demo`, { waitUntil: "domcontentloaded" });
  await step("scan settles", async () => {
    await page.getByText("Exposure posture").first().waitFor({ timeout: 60_000 });
    await page.getByText(/Heartbleed|Internet-exposed|expiring/i).first().waitFor({ timeout: 60_000 });
  });
  await settle(1600);
  await shot("02-discovery-graph");

  // 3) Findings + posture panel.
  await step("findings panel", async () => {
    const panel = page.locator(".scroll-thin").filter({ hasText: "Exposure posture" }).first();
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${OUT}/03-findings-posture.png` });
  });

  // 4) Score breakdown.
  await step("score breakdown", async () => {
    await page.getByText(/Why is my score/i).first().click();
    await settle(700);
    await shot("04-score-breakdown");
  });

  // 5) Open a high-priority finding for evidence detail.
  await step("finding detail", async () => {
    await page.getByText(/Heartbleed|Internet-exposed database|Missing HTTP security/i).first().click();
    await settle(900);
    await shot("05-finding-evidence");
  });

  // 6) Attacker View replay.
  await step("attacker view", async () => {
    await page.getByRole("button", { name: /Attacker View|Replay how the surface/i }).first().click();
    await settle(2500);
    await shot("06-attacker-view");
  });

  // 7) Report preview.
  await step("report preview", async () => {
    await page.getByText(/Preview polished report|Preview report/i).first().click();
    await settle(1500);
    await shot("07-report-preview");
  });

  await settle(1200);
  console.log("Walkthrough captured to", OUT);
} finally {
  await context.close(); // finalizes the video file
  await browser.close();
}
