import { defineConfig, devices } from "@playwright/test";

// Point the suite at an already-running server (e.g. a production build on
// another port) with: PW_BASE_URL=http://127.0.0.1:3001 npx playwright test
const baseURL = process.env.PW_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Sandboxed CI images often pre-install one Chromium and block downloads
    // (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1). Point PW_CHROMIUM_PATH at that
    // binary (e.g. /opt/pw-browsers/chromium) to run the suite there; with the
    // variable unset nothing changes — Playwright uses its own install.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {})
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000
  }
});
