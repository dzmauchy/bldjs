import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.test.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1400, height: 900 },
    launchOptions: {
      args: ["--disable-dev-shm-usage"],
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run preview:e2e",
        url: "http://127.0.0.1:8080",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
