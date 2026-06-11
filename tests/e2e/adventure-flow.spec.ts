import { expect, test } from "@playwright/test";

/**
 * Full adventure happy path against a live room: map-setup lobby (factions,
 * heroes, start), starting hands, click-to-move with the confirm bar, tile
 * discovery with the rotation flow, and the far-tile tray.
 */
test("map setup lobby builds the adventure and the hero walks by clicking the map", async ({ page }) => {
  const roomId = `e2e-${Date.now().toString(36)}`;
  await page.goto(`/?room=${roomId}`);

  // --- Lobby: seats pick factions, then start -----------------------------
  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 20000 });

  // Player 1 picks Castle — Catherine.
  await page.getByRole("button", { name: /Catherine/ }).click();
  await expect(page.getByText("Castle — Catherine", { exact: false })).toBeVisible();

  // Switch seats to Player 2 and pick Necropolis — Sandro.
  await page.getByTitle("Sit as Player 2").click();
  await page.getByRole("button", { name: /Sandro/ }).click();
  await expect(page.getByText("Necropolis — Sandro", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Start the adventure" }).click();

  // --- Adventure map -------------------------------------------------------
  await expect(page.locator(".hexMapSvg")).toBeVisible({ timeout: 20000 });

  // Switch back to seat 1 (its turn) and check the starting hand is dealt.
  await page.getByTitle(/Sit as Catherine/).click();
  await expect(page.locator(".adventureHandCard")).toHaveCount(4);

  // The mulligan offer is open at the start of the turn.
  await expect(page.getByRole("button", { name: /Mulligan/ })).toBeVisible();

  // Click a reachable hex, then confirm the move.
  const target = page.locator(".hexCell.moveTarget").first();
  await expect(target).toBeVisible();
  await target.click();
  await expect(page.getByRole("button", { name: /Move there/ })).toBeVisible();
  await page.getByRole("button", { name: /Move there/ }).click();

  // The movement consumed MP (3 -> 2 or less, depending on the visited field).
  await expect(page.locator(".advHud")).not.toContainText("MP 3");

  // Far tile tray shows the two face-down Ⅱ–Ⅲ backs.
  await expect(page.locator(".farTileBack")).toHaveCount(2);
});

test("discovering a face-down tile asks for its rotation", async ({ page }) => {
  const roomId = `e2e-rot-${Date.now().toString(36)}`;
  await page.goto(`/?room=${roomId}`);

  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: /Catherine/ }).click();
  await page.getByTitle("Sit as Player 2").click();
  await page.getByRole("button", { name: /Sandro/ }).click();
  await page.getByRole("button", { name: "Start the adventure" }).click();
  await expect(page.locator(".hexMapSvg")).toBeVisible({ timeout: 20000 });

  await page.getByTitle(/Sit as Catherine/).click();

  // Walk next to the face-down near tile: pick the discoverable back directly
  // if it is already adjacent, otherwise step towards it first.
  const discoverable = page.locator(".hexFaceDown.discoverable").first();
  if (!(await discoverable.isVisible().catch(() => false))) {
    // Step onto the NE empty field, which is adjacent to the near tile.
    await page.locator(".hexCell.moveTarget").first().click();
    await page.getByRole("button", { name: /Move there/ }).click();
  }

  await expect(page.locator(".hexFaceDown.discoverable").first()).toBeVisible();
  await page.locator(".hexFaceDown.discoverable").first().click();

  // The rotation bar opens with rotate buttons and a confirm. Rotations that
  // border lines seal off disable the confirm — keep turning until legal.
  await expect(page.locator(".rotateBar")).toBeVisible();
  const confirm = page.getByRole("button", { name: /Confirm/ });
  for (let turn = 0; turn < 6; turn += 1) {
    if (await confirm.isEnabled()) {
      break;
    }
    await page.getByTitle("Rotate clockwise").click();
  }
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.locator(".rotateBar")).toHaveCount(0);
});
