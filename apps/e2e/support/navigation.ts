import { expect, type Page } from "@playwright/test";

/**
 * Opens a section of the workspace from its menu: the bar at the bottom on the phone, the side
 * menu on the desktop. Both are the same `nav`, so one locator serves both.
 */
export async function openSection(page: Page, name: string): Promise<void> {
  const menu = page.getByRole("navigation", { name: "Main menu" });
  const link = menu.getByRole("link", { name });
  if (name === "Pages" && (await link.count()) === 0) {
    // The phone's bar fits six sections: Pages opens from Store.
    await menu.getByRole("link", { name: "Store" }).click();
    await page
      .getByRole("main")
      .getByRole("link", { name: /^Pages/ })
      .click();
  } else {
    await link.click();
  }
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

/** Opens a section of /admin from its menu, like `openSection` in a workspace. */
export async function openAdminSection(page: Page, name: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Admin sections" })
    .getByRole("link", { name })
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}
