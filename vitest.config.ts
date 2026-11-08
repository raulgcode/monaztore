import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Pure functions: no I/O, no database, no DOM.
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          environment: "node",
          include: ["{apps,packages}/*/{src,app}/**/*.test.ts", "tooling/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
        },
      },
      {
        // Services against real Postgres (monaztore_test) and Mailpit from compose.yaml.
        test: {
          name: "integration",
          environment: "node",
          include: ["{apps,packages}/*/{src,test}/**/*.integration.test.ts"],
          globalSetup: ["./tooling/vitest/integration-setup.ts"],
          setupFiles: ["./tooling/vitest/load-env.ts"],
          testTimeout: 15_000,
        },
      },
      {
        // React components rendered in a real Chromium via Vitest Browser Mode.
        resolve: { tsconfigPaths: true },
        test: {
          name: "browser",
          include: ["apps/web/app/**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
            }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
