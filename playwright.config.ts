import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./browser",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/browser.xml" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", testIgnore: /responsive\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run start:standalone",
    url: `${baseURL}/api/livez`,
    // Keep NextRequest.url aligned with the browser Origin. The standalone
    // server otherwise advertises its 0.0.0.0 bind address and correctly
    // triggers the application's same-origin mutation guard.
    env: { OUTSIDE_BIND_HOST: "localhost" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
