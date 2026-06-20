import { expect, type Page, test } from "@playwright/test";

/**
 * The fix under test, in a real browser against a live room: war machines must
 * be obtainable in combat test mode. Before the fix the sandbox "Add card"
 * picker excluded the "war-machine" kind, so First Aid Tent and Cannon could
 * not be added or exercised. Each pick here round-trips through the actual room
 * server (HTTP action + live snapshot stream) and must land in the hand UI.
 */

async function openCombatSandbox(page: Page): Promise<void> {
  await page.goto(`/?room=e2e-wm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  // The lobby shows the table controls, including the combat sandbox button.
  const sandbox = page.getByTitle("Open the combat sandbox");
  await sandbox.waitFor({ state: "visible", timeout: 30000 });
  await sandbox.click();
  // The sandbox combat mounts; its "Add card" test-mode button appears for p1.
  await expect(page.getByRole("button", { name: /add card/i })).toBeVisible({ timeout: 30000 });
}

/** Add a war machine through the picker and close the overlay. */
async function addCard(page: Page, filter: string, itemName: RegExp): Promise<void> {
  await page.getByRole("button", { name: /add card/i }).click();
  const dialog = page.getByRole("dialog", { name: /add a card to your hand/i });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/filter cards/i).fill(filter);
  await dialog.getByRole("button", { name: itemName }).click();
  await dialog.getByRole("button", { name: /close/i }).click();
  await expect(dialog).toBeHidden();
}

test("combat sandbox: the First Aid Tent war machine can be added to hand", async ({ page }) => {
  await openCombatSandbox(page);
  await addCard(page, "first aid tent", /first aid tent/i);
  // It reached the viewer's hand fan as a real, playable card (round-tripped
  // through the room server).
  await expect(page.locator('.handFan .fanCard[title^="First Aid Tent"]')).toBeVisible({ timeout: 15000 });
});

test("combat sandbox: the Cannon war machine can be added to hand", async ({ page }) => {
  await openCombatSandbox(page);
  await addCard(page, "cannon", /cannon/i);
  await expect(page.locator('.handFan .fanCard[title^="Cannon"]')).toBeVisible({ timeout: 15000 });
});

test("combat sandbox: the First Aid Tent can be played into play (its heal effect goes live)", async ({ page }) => {
  await openCombatSandbox(page);
  await addCard(page, "first aid tent", /first aid tent/i);

  // Open the hand card's play menu and put the Tent into play.
  await page.locator('.handFan .fanCard[title^="First Aid Tent"]').click();
  const popover = page.getByRole("menu", { name: /First Aid Tent/i });
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: /^Use$/ }).click();

  // It is now an active table effect (the heal is live for the round). With no
  // wounded unit there is no heal button yet — that appears once a unit is hurt.
  await expect(page.locator(".effectsRail")).toContainText(/First Aid Tent/i, { timeout: 15000 });
});
