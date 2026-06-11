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
    trace: "on-first-retry"
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
