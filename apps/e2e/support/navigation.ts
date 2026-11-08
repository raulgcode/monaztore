import { expect, type Page } from "@playwright/test";

/**
 * Opens a section of the workspace from its menu: the bar at the bottom on the phone, the side
 * menu on the desktop. Both are the same `nav`, so one locator serves both.
 */
export async function openSection(page: Page, name: string): Promise<void> {
  await page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}
