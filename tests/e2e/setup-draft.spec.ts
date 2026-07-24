import { expect, type Page, test } from "@playwright/test";

/**
 * Real-browser check of the reworked map-setup lobby: the hero info popup and the
 * four setup formats (free pick, full random, draft + ban, random with choice).
 * The draft test drives BOTH seats through the local seat switcher — locking
 * towns, going around the ban phase, then picking — so the multiplayer round-trip
 * (shared draft state + turn-order banning) is exercised end to end.
 */

async function openSetup(page: Page, roomId: string): Promise<void> {
  await page.goto(`/?room=${roomId}`);
  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 30000 });
}

/** The local "Sit as …" seat switcher buttons, addressed by index (0 = p1). */
function seat(page: Page, index: number) {
  return page.locator(".seatSwitch button").nth(index);
}

/**
 * The format selector + faction grid live in the Heroes & Draft hub window.
 * Addressed by class, not accessible name: "Close Heroes & Draft" would also
 * match a /Heroes & Draft/ name query while the window is open.
 */
async function openHeroes(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Heroes & Draft" });
  if (await dialog.isVisible().catch(() => false)) {
    return;
  }
  const box = page.locator(".setupHubBox--heroes");
  await expect(box).toBeVisible();
  await box.click();
  await expect(dialog).toBeVisible();
}

async function closeHeroes(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Heroes & Draft" });
  if (!(await dialog.isVisible().catch(() => false))) {
    return;
  }
  await dialog.locator(".setupHubWindowClose").click();
  await expect(dialog).toHaveCount(0);
}

/**
 * Switch the local hot-seat view. The seat switcher lives in the top bar, which
 * the hub window's backdrop covers — so close the window, switch, reopen.
 */
async function switchSeat(page: Page, index: number): Promise<void> {
  await closeHeroes(page);
  await seat(page, index).click();
  await openHeroes(page);
}

const roomId = (tag: string) => `e2e-setup-${tag}-${Date.now().toString(36)}`;

test("hero info opens a closeable popup without choosing the hero", async ({ page }) => {
  await openSetup(page, roomId("popup"));
  await openHeroes(page);

  // Default format is free pick: the faction grid is shown. Open Catherine's info.
  const row = page.locator(".lobbyHeroRow").filter({ has: page.getByRole("button", { name: /Catherine/ }) }).first();
  await row.getByRole("button", { name: "Show hero details" }).click();

  const modal = page.locator(".heroInfoModal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Catherine");
  await expect(modal).toContainText("Crusaders"); // a Catherine specialty card

  // Inspecting must not have committed the seat (still "choosing").
  await expect(page.locator(".lobbySeat.mine")).toContainText(/choosing/i);

  await page.getByRole("button", { name: "Close hero details" }).click();
  await expect(modal).toBeHidden();
});

test("TYPE 2 full random rolls the seat's town and hero", async ({ page }) => {
  await openSetup(page, roomId("random"));
  await openHeroes(page);
  await page.getByRole("button", { name: "Full random" }).click();
  await page.getByRole("button", { name: /Roll random town/ }).click();
  await expect(page.locator(".draftLockNote")).toContainText(/Rolled/, { timeout: 10000 });
});

test("TYPE 3 random-with-choice rolls two towns to choose from", async ({ page }) => {
  await openSetup(page, roomId("choice"));
  await openHeroes(page);
  await page.getByRole("button", { name: "Random with choice" }).click();
  await page.getByRole("button", { name: /Roll two towns/ }).click();
  await expect(page.locator(".draftTownChoices .draftTownButton")).toHaveCount(2, { timeout: 10000 });
});

test("TYPE 1 draft: lock towns, go around the ban phase, pick, and start", async ({ page }) => {
  // Seven hot-seat switches, each closing and reopening the Heroes & Draft
  // window (the seat switcher lives in the top bar, behind it).
  test.setTimeout(240000);
  await openSetup(page, roomId("draft"));
  await openHeroes(page);
  await page.getByRole("button", { name: "Draft (ban-pick)" }).click();

  // p1 (seat 0) locks Castle directly; p2 (seat 1) locks Necropolis.
  await switchSeat(page, 0);
  await page.locator(".draftTownButton").filter({ hasText: "Castle" }).click();
  await expect(page.locator(".draftLockNote")).toContainText("Castle", { timeout: 10000 });

  await switchSeat(page, 1);
  await page.locator(".draftTownButton").filter({ hasText: "Necropolis" }).click();

  // Ban phase (2 players → 2 bans each, going around). Only the current banner
  // sees ban chips; the other sees a "waiting" note. Sync on those transitions.
  const banChip = () => page.locator(".draftBanHero").first();
  const waiting = () => page.locator(".draftTurnNote.waiting");

  // p1 bans (turn passes to p2).
  await switchSeat(page, 0);
  await expect(banChip()).toBeVisible({ timeout: 10000 });
  await banChip().click();
  await expect(waiting()).toBeVisible({ timeout: 10000 });

  // p2 bans (turn back to p1).
  await switchSeat(page, 1);
  await expect(banChip()).toBeVisible({ timeout: 10000 });
  await banChip().click();
  await expect(waiting()).toBeVisible({ timeout: 10000 });

  // p1 bans again.
  await switchSeat(page, 0);
  await expect(banChip()).toBeVisible({ timeout: 10000 });
  await banChip().click();
  await expect(waiting()).toBeVisible({ timeout: 10000 });

  // p2 bans again → the 4th ban opens the pick phase.
  await switchSeat(page, 1);
  await expect(banChip()).toBeVisible({ timeout: 10000 });
  await banChip().click();

  // Pick phase: p2 (current view) picks the first non-banned Necropolis hero.
  await expect(page.getByText("Step 3 — pick your hero")).toBeVisible({ timeout: 10000 });
  await page.locator(".factionGrid .lobbyHero:not([disabled])").first().click();

  // p1 picks too.
  await switchSeat(page, 0);
  await expect(page.getByText("Step 3 — pick your hero")).toBeVisible({ timeout: 10000 });
  await page.locator(".factionGrid .lobbyHero:not([disabled])").first().click();

  // Both picked → start the adventure and land on the map.
  await closeHeroes(page);
  await page.getByRole("button", { name: "New Game" }).click();
  await expect(page.locator(".hexMapSvg")).toBeVisible({ timeout: 30000 });
});
