import { expect, type Page, test } from "@playwright/test";

/**
 * "Discard first to use" (Bulwark house rule), verified in a real browser against
 * a live room server. A Frost Ring specialty carries BOTH a board (space) target
 * and a printed 1-card discard. The flow must be: select the card → pay the
 * discard FIRST → only THEN aim at a space. Before the fix the order was reversed
 * (aim, then a discard prompt), which is what this exercises end-to-end (every
 * click round-trips through the actual room server's HTTP action + snapshot
 * stream, so it also guards the multiplayer path).
 */

async function openCombatSandbox(page: Page): Promise<void> {
  await page.goto(`/?room=e2e-fr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  const sandbox = page.getByTitle("Open the combat sandbox");
  await sandbox.waitFor({ state: "visible", timeout: 30000 });
  await sandbox.click();
  await expect(page.getByRole("button", { name: /add card/i })).toBeVisible({ timeout: 30000 });
}

/** Add a card via the sandbox picker, narrowing by `filter` and clicking `itemName`. */
async function addCard(page: Page, filter: string, itemName: RegExp): Promise<void> {
  await page.getByRole("button", { name: /add card/i }).click();
  const dialog = page.getByRole("dialog", { name: /add a card to your hand/i });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/filter cards/i).fill(filter);
  await dialog.getByRole("button", { name: itemName }).click();
  await dialog.getByRole("button", { name: /close/i }).click();
  await expect(dialog).toBeHidden();
}

test("Frost Ring specialty: the discard is paid BEFORE the space is aimed", async ({ page }) => {
  await openCombatSandbox(page);

  // Glacius' Frost Ring I (space target + 1-card discard) and a Power statistic
  // to pay the discard with. Filtering by the hero/slug narrows to one card.
  await addCard(page, "glacius", /Frost Ring I$/);
  await addCard(page, "stat.power", /^statistic Power$/);

  const costPicker = page.locator('[aria-label="Pay the card cost"]');
  const targetBanner = page.locator('[aria-label="Selected card target"]');

  // Selecting the Frost Ring opens the DISCARD picker first — not the aim banner.
  await page.locator('.handFan .fanCard[title^="Frost Ring I"]').click();
  await expect(costPicker, "the discard picker opens first").toBeVisible({ timeout: 15000 });
  await expect(targetBanner, "aiming has NOT started yet").toBeHidden();
  await expect(costPicker.getByRole("button", { name: /discard, then aim/i })).toBeVisible();

  // Pay the discard (pick the Power card), then confirm.
  await costPicker.getByRole("button", { name: /^Power$/ }).click();
  await costPicker.getByRole("button", { name: /discard, then aim/i }).click();

  // Only NOW does aiming begin: the target banner appears and the picker is gone.
  await expect(targetBanner, "aiming starts only after the discard is paid").toBeVisible({ timeout: 15000 });
  await expect(targetBanner).toContainText(/click a glowing space/i);
  await expect(costPicker).toBeHidden();

  // Click a glowing space: the play must round-trip through the room server with
  // the banked discard re-attached and be ACCEPTED — the Frost Ring leaves the
  // hand (played) and no rules error surfaces. This is the multiplayer-path check.
  await page.locator(".battleCell.cardTarget").first().click();
  await expect(
    page.locator('.handFan .fanCard[title^="Frost Ring I"]'),
    "the played Frost Ring leaves the hand (server accepted it)"
  ).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator(".errorBanner")).toHaveCount(0);
});
