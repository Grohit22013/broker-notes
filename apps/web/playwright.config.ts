import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig, devices } from "@playwright/test";

// Tests seed/clean data directly via Prisma, so the runner needs the API's database URL.
// Locally it comes from apps/api/.env; in CI it is already in the environment (which wins).
if (existsSync("../api/.env")) {
  const vars = parseEnv(readFileSync("../api/.env", "utf8"));
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    if (!process.env[key] && vars[key]) process.env[key] = vars[key];
  }
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Must match the API_URL the web app was built with (rewrites are resolved at build time).
const API_PORT = Number(process.env.E2E_API_PORT ?? 4000);
const baseURL = `http://localhost:${PORT}`;
const apiURL = `http://localhost:${API_PORT}`;

/**
 * End-to-end tests of the whole stack: the NestJS API + the Next.js web app, both production
 * builds (`npm run build` at the repo root first). Every spec runs on desktop and mobile.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Each sign-up runs two bcrypt (cost 12) hashes; too many parallel workers starve the CPU locally.
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
        ["json", { outputFile: "reports/e2e.json" }],
      ]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-AU",
    timezoneId: "Australia/Sydney",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // NestJS API (reads apps/api/.env locally; CI passes env vars).
      command: "node dist/main.js",
      cwd: "../api",
      url: `${apiURL}/health`,
      env: {
        PORT: String(API_PORT),
        WEB_ORIGIN: baseURL,
        // Every test registers brokers from the same IP; production keeps the default (10/min).
        AUTH_RATE_LIMIT: "1000",
        // Deterministic AI provider: no network calls, no free-tier quota used by tests.
        AI_PROVIDER: "mock",
        AI_BURST_LIMIT: "1000",
        COOKIE_SECURE: "false",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Next.js web app, proxying /api/* to the API above.
      command: `npx next start -p ${PORT}`,
      url: baseURL,
      env: { API_URL: apiURL },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
