import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Database } from "@monaztore/db";
import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  test as base,
  expect,
  type Page,
} from "@playwright/test";
import { connectTestDatabase, findWorkspace, slugOf, type Workspace } from "./database";
import { getLinkFromEmail, uniqueEmail } from "./mailpit";

interface Fixtures {
  /** Runs axe against the current page and fails on any WCAG 2.2 A/AA violation. */
  expectAccessible: (page: Page, options?: { exclude?: string[] }) => Promise<void>;
  /**
   * Signs in through the magic link and returns the email: a brand-new person, or `email` to
   * come back as an existing one.
   */
  signIn: (page: Page, email?: string) => Promise<string>;
  /** Signs a new person in and creates their workspace, landing on its home. */
  signInWithWorkspace: (page: Page, workspaceName?: string) => Promise<string>;
  /** The workspace of the page (`/app/:workspace/…`), to seed it through core. */
  workspaceOf: (page: Page) => Promise<Workspace>;
  /**
   * Another browser of someone else (a teammate, the owner's other device), in the test's
   * language unless `options` says otherwise. Closed when the test ends, even if it fails.
   */
  newVisitor: (options?: BrowserContextOptions) => Promise<Page>;
}

interface WorkerFixtures {
  /** The e2e database, one connection per worker: seed data with `@monaztore/core`, not SQL. */
  db: Database;
  /**
   * Session of an owner with a workspace ("My company"), created once per worker through the
   * real magic link and reused by every `ownerTest` in that worker.
   */
  ownerSession: { storageState: string; slug: string };
}

async function signInThroughEmail(
  page: Page,
  baseURL: string | undefined,
  email = uniqueEmail("owner"),
): Promise<string> {
  await page.goto("/login?with=link");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me the link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(email);
  await page.goto(await getLinkFromEmail(email, baseURL));
  return email;
}

/** Creates the workspace from the onboarding, landing on its home. */
export async function createWorkspace(page: Page, name: string): Promise<void> {
  await expect(page).toHaveURL(/\/app\/onboarding$/);
  await page.getByLabel("Workspace name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/app\/[a-z0-9-]+-[0-9a-f]{6}$/);
}

async function createOwnerSession(
  browser: Browser,
  { baseURL, locale }: { baseURL: string; locale?: string },
  path: string,
) {
  // A context of our own doesn't get the project's `use`: without its locale the app would
  // answer in the machine's language.
  const context = await browser.newContext({ baseURL, locale });
  const page = await context.newPage();
  await signInThroughEmail(page, baseURL);
  await createWorkspace(page, "My company");
  await context.storageState({ path });
  const slug = slugOf(page);
  await context.close();
  return slug;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  db: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
    async ({}, use) => {
      const connection = connectTestDatabase();
      await use(connection.db);
      await connection.close();
    },
    { scope: "worker" },
  ],
  ownerSession: [
    async ({ browser }, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL;
      if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
      const dir = workerInfo.project.outputDir;
      mkdirSync(dir, { recursive: true });
      const storageState = `${dir}/owner-${workerInfo.workerIndex}.json`;
      const slug = await createOwnerSession(
        browser,
        { baseURL, locale: workerInfo.project.use.locale },
        storageState,
      );
      await use({ storageState, slug });
    },
    { scope: "worker" },
  ],
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern here.
  expectAccessible: async ({}, use) => {
    await use(async (page, { exclude = [] } = {}) => {
      // Colors mid-transition (e.g. right after switching theme) would give false contrast hits.
      await page.waitForFunction(() =>
        document.getAnimations().every((animation) => animation.playState !== "running"),
      );
      const builder = new AxeBuilder({ page }).withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22aa",
      ]);
      for (const selector of exclude) builder.exclude(selector);
      const results = await builder.analyze();
      expect(results.violations).toEqual([]);
    });
  },
  signIn: async ({ baseURL }, use) => {
    await use((page, email) => signInThroughEmail(page, baseURL, email));
  },
  signInWithWorkspace: async ({ signIn }, use) => {
    await use(async (page, workspaceName = "My company") => {
      const email = await signIn(page);
      await createWorkspace(page, workspaceName);
      return email;
    });
  },
  workspaceOf: async ({ db }, use) => {
    await use((page) => findWorkspace(db, slugOf(page)));
  },
  newVisitor: async ({ browser, baseURL, locale }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      // Signed out: `browser.newContext` would otherwise take the test's `storageState`.
      const context = await browser.newContext({
        baseURL,
        locale,
        storageState: { cookies: [], origins: [] },
        ...options,
      });
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

/**
 * Tests that start already signed in as the worker's owner. Use it whenever the test does not
 * need a brand-new account; use `test` + `signIn` for flows that must start from zero
 * (login, onboarding, an empty workspace).
 */
export const ownerTest = test.extend<{ workspace: Workspace }>({
  storageState: ({ ownerSession }, use) => use(ownerSession.storageState),
  /** The worker's workspace, already created: seed it through core without visiting /app. */
  workspace: ({ db, ownerSession }, use) => findWorkspace(db, ownerSession.slug).then(use),
});

export { expect };
