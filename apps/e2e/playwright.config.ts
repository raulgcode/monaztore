import { loadDotEnv } from "@monaztore/env";
import { defineConfig, devices } from "@playwright/test";

loadDotEnv();

const PORT = 4173;
export const baseURL = `http://localhost:${PORT}`;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./support/global-setup.ts",
  use: {
    baseURL,
    // The source language: scenarios find things by their English texts.
    locale: "en-US",
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Mobile first: every flow also runs at phone size.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // The production build against the test database, the same artifact that gets deployed. The
  // schema comes first: the readiness probe opens the home page, which reads the session.
  webServer: {
    command:
      "pnpm --filter @monaztore/db migrate && pnpm --filter @monaztore/web build && pnpm --filter @monaztore/web start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      APP_URL: baseURL,
      DATABASE_URL: testDatabaseUrl,
      AUTH_RATE_LIMIT: "off",
      // Every way to sign in is on, whatever this project picked: the template tests them all.
      AUTH_METHODS: "magic-link,password,google",
      // Fake credentials: enough to render "Continue with Google" and build the redirect.
      GOOGLE_CLIENT_ID: "e2e.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "e2e-secret",
    },
  },
});
