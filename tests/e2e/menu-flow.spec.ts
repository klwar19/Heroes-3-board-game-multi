import { expect, test } from "@playwright/test";

/**
 * Phase 0 platform flow (expansion plan): the pre-game screens exist
 * end-to-end in guest mode with zero env vars — login (guest name) → main
 * menu → multiplayer room browser (/play, Erathia badge) → create a room →
 * the game's setup lobby. Plus the two landing rules: a bare "/" redirects
 * to /menu, while a shared ?room= deep link still opens the room directly.
 */

test("bare visit redirects to the main menu with Single player greyed out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/menu$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: /Heroes III — The Board Game/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Single player/i })).toBeDisabled();
  // Logout must not exist in guest mode (accounts ship in a later phase).
  await expect(page.getByText(/Logout/i)).toHaveCount(0);
});

test("guest flow: login name → menu → play (Erathia) → create room → setup lobby", async ({ page }) => {
  // Unique per run: the dev server's room directory outlives test runs.
  const roomName = `E2E Menu Flow ${Date.now().toString(36)}`;

  // Login screen persists the guest name and forwards to the menu.
  await page.goto("/login");
  await page.getByLabel(/name other players will see/i).fill("E2E Guest");
  await page.getByRole("button", { name: /Continue as guest/i }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.getByText(/Playing as E2E Guest/)).toBeVisible();

  // Menu → multiplayer room browser under the Erathia server badge.
  await page.locator(".menuNav").getByRole("link", { name: /Multiplayer/i }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.locator(".serverBadge")).toContainText("Erathia");

  // Create a named room from the browser → lands in the game's setup lobby.
  await page.getByLabel("New room name").fill(roomName);
  await page.getByRole("button", { name: /Create room/i }).click();
  await expect(page).toHaveURL(/\?room=/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 30000 });

  // Leaving via Browse rooms returns to the /play room browser, where the
  // created room is listed UNDER ITS CHOSEN NAME (the name round-tripped
  // through creation → directory).
  await page.getByRole("button", { name: /Room.*in room/ }).click();
  await page.getByRole("button", { name: /Browse rooms/i }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByText(roomName)).toBeVisible({ timeout: 15000 });
});

test("?room= deep link bypasses the menu and opens the room directly", async ({ page }) => {
  const roomId = `e2e-menu-deeplink-${Date.now().toString(36)}`;
  await page.goto(`/?room=${roomId}`);
  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 30000 });
  // Still on the room URL — the landing redirect must not have fired.
  await expect(page).toHaveURL(new RegExp(`\\?room=${roomId}`));
});
