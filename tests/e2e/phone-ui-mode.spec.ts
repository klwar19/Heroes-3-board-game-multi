import { expect, type Page, test } from "@playwright/test";

/**
 * The lobby's faction/hero picks live in the Setup Hub's "Heroes & Draft"
 * window; it is a modal, so the top-bar seat switcher needs it closed first.
 */
async function openHeroesWindow(page: Page): Promise<void> {
  const box = page.locator(".setupHubBox--heroes");
  await expect(box).toBeVisible();
  await box.click();
  await expect(page.getByRole("dialog", { name: "Heroes & Draft" })).toBeVisible();
}

async function closeHeroesWindow(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Heroes & Draft" });
  await dialog.locator(".setupHubWindowClose").click();
  await expect(dialog).toHaveCount(0);
}

/**
 * Phone UI mode — the REAL-BROWSER half of the feature's test bar.
 *
 * The jsdom suite (src/app/page-phone-mode.test.tsx) pins the wiring (class +
 * data attribute + tab bar); jsdom cannot compute CSS, so THIS spec pins the
 * visible effect: on a phone viewport in phone mode the panels actually swap —
 * one full-screen panel at a time — while computer mode keeps the desktop
 * side-by-side layout with no phone chrome at all.
 *
 * These tests opt OUT of the config-level seeded storage (which pre-answers
 * the first-visit prompts for every other spec) because the pre-game prompt
 * itself is under test here.
 */

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  storageState: { cookies: [], origins: [] }
});

/** Answer the pre-game layout prompt (it blocks the lobby until answered). */
async function chooseUiMode(page: Page, mode: "phone" | "computer"): Promise<void> {
  const prompt = page.getByRole("dialog", { name: /choose your screen layout/i });
  await expect(prompt).toBeVisible({ timeout: 20000 });
  await prompt.getByRole("button", { name: mode === "phone" ? /^Phone mode/ : /^Computer mode/ }).click();
  await expect(prompt).toHaveCount(0);
}

/** Answer the helper-tips prompt if it follows (fresh browser, both unset). */
async function dismissCoachPrompt(page: Page): Promise<void> {
  const coach = page.getByRole("dialog", { name: /on-screen helper tips/i });
  if (await coach.isVisible().catch(() => false)) {
    await coach.getByRole("button", { name: /turn tips off/i }).click();
    await expect(coach).toHaveCount(0);
  }
}

async function startTwoPlayerAdventure(page: Page, roomId: string): Promise<void> {
  await page.goto(`/?room=${roomId}`);
  await expect(page.locator(".setupHubBox--mode")).toBeVisible({ timeout: 20000 });
  await chooseUiMode(page, "phone");
  await dismissCoachPrompt(page);

  await openHeroesWindow(page);
  await page.getByRole("button", { name: /Catherine/ }).click();
  await expect(page.locator(".setupHubBox--heroes")).toContainText("Castle — Catherine");
  await closeHeroesWindow(page);
  await page.getByTitle("Sit as Player 2").click();
  await openHeroesWindow(page);
  await page.getByRole("button", { name: /Sandro/ }).click();
  await expect(page.locator(".setupHubBox--heroes")).toContainText("Necropolis — Sandro");
  await closeHeroesWindow(page);

  await page.getByRole("button", { name: "New Game" }).click();
  await expect(page.locator(".hexMapSvg")).toBeVisible({ timeout: 20000 });
}

/** Dismiss the "Who goes first?" ceremony once its dice settle. */
async function dismissFirstRoll(page: Page): Promise<void> {
  const begin = page.getByRole("button", { name: /Begin the adventure/i });
  await begin.waitFor({ state: "visible", timeout: 20000 });
  await begin.click();
  await page.locator(".firstRollOverlay").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
}

test("the pre-game prompt recommends Phone on a phone and phone mode takes over the lobby", async ({ page }) => {
  await page.goto(`/?room=e2e-phone-lobby-${Date.now().toString(36)}`);

  const prompt = page.getByRole("dialog", { name: /choose your screen layout/i });
  await expect(prompt).toBeVisible({ timeout: 20000 });
  // Device detection pre-highlights Phone on a coarse-pointer 390px viewport.
  await expect(prompt.locator(".uiModeOption.recommended")).toContainText("Phone mode");

  await prompt.getByRole("button", { name: /^Phone mode/ }).click();
  await expect(page.locator("main.phoneMode")).toBeVisible();
  // The site header collapses to give the table the whole phone screen.
  await expect(page.locator("header.topBar")).toBeHidden();
  // The lobby stays a single scrolling column — tabs only exist in-game.
  await expect(page.locator(".phoneTabBar")).toHaveCount(0);
});

test("phone mode on the map: one full-screen panel at a time, switched by the tab bar", async ({ page }) => {
  test.setTimeout(120000);
  await startTwoPlayerAdventure(page, `e2e-phone-map-${Date.now().toString(36)}`);
  await dismissFirstRoll(page);

  const main = page.locator("main.phoneMode");
  await expect(main).toBeVisible();
  const tabBar = page.locator(".phoneTabBar");
  await expect(tabBar).toBeVisible();

  // Map tab (default): the map is on screen; hand, decks, army and menu are not.
  await expect(main).toHaveAttribute("data-phone-tab", "map");
  await expect(page.locator(".hexMapSvg")).toBeVisible();
  await expect(page.locator(".adventureHand")).toBeHidden();
  await expect(page.locator(".advDecksBottom")).toBeHidden();
  await expect(page.locator(".leftRailDock")).toBeHidden();
  await expect(page.locator(".tableMenu")).toBeHidden();

  // Hand tab: the hand replaces the map (nothing overlaps, nothing is blocked).
  await tabBar.getByRole("tab", { name: /hand/i }).click();
  await expect(main).toHaveAttribute("data-phone-tab", "hand");
  await expect(page.locator(".adventureHand")).toBeVisible();
  await expect(page.locator(".hexMapSvg")).toBeHidden();

  // Decks tab: the shared-deck shelf gets the screen.
  await tabBar.getByRole("tab", { name: /decks/i }).click();
  await expect(page.locator(".advDecksBottom .advDecks")).toBeVisible();
  await expect(page.locator(".adventureHand")).toBeHidden();

  // Army tab: the town/hero/army command rail gets the screen.
  await tabBar.getByRole("tab", { name: /army/i }).click();
  await expect(page.locator(".leftRailDock")).toBeVisible();
  await expect(page.locator(".hexMapSvg")).toBeHidden();

  // Menu tab: the table menu (seats, room, music, the mode switch) gets the screen.
  await tabBar.getByRole("tab", { name: /menu/i }).click();
  await expect(page.locator(".tableMenu")).toBeVisible();
  await expect(page.getByRole("button", { name: /phone ui/i })).toBeVisible();

  // Back to the map.
  await tabBar.getByRole("tab", { name: /^map$/i }).click();
  await expect(page.locator(".hexMapSvg")).toBeVisible();
});

test("CONTROL — computer mode: desktop side-by-side layout, zero phone chrome", async ({ page }) => {
  // Same phone-shaped device — but the player CHOOSES Computer, so the desktop
  // layout must persist untouched (the strongest desktop-unchanged control).
  await page.goto(`/?room=e2e-phone-ctl-${Date.now().toString(36)}`);
  await chooseUiMode(page, "computer");
  await dismissCoachPrompt(page);

  await openHeroesWindow(page);
  await page.getByRole("button", { name: /Catherine/ }).click();
  await closeHeroesWindow(page);
  await page.getByTitle("Sit as Player 2").click();
  await openHeroesWindow(page);
  await page.getByRole("button", { name: /Sandro/ }).click();
  await closeHeroesWindow(page);
  await page.getByRole("button", { name: "New Game" }).click();
  await expect(page.locator(".hexMapSvg")).toBeVisible({ timeout: 20000 });
  await dismissFirstRoll(page);

  // No phone chrome anywhere…
  await expect(page.locator("main.phoneMode")).toHaveCount(0);
  await expect(page.locator(".phoneTabBar")).toHaveCount(0);
  await expect(page.locator("main")).not.toHaveAttribute("data-phone-tab", /.+/);
  // …and the classic layout shows map AND hand AND decks side by side/stacked,
  // all visible at once (even on a small window — the desktop truth).
  await expect(page.locator(".hexMapSvg")).toBeVisible();
  await expect(page.locator(".adventureHand")).toBeVisible();
  await expect(page.locator(".advDecksBottom .advDecks")).toBeVisible();
  // The site header stays.
  await expect(page.locator("header.topBar")).toBeVisible();
});
