import { expect, type Page, test } from "@playwright/test";

/**
 * Full adventure happy path against a live room: map-setup lobby (factions,
 * heroes, start), the first-player ceremony, click-to-move with the confirm
 * card anchored on the destination hex, and tile discovery with the rotation
 * card anchored on the tile.
 */

/** Dismiss the "Who goes first?" ceremony once its dice settle. */
async function dismissFirstRoll(page: Page): Promise<void> {
  const begin = page.getByRole("button", { name: /Begin the adventure/i });
  await begin.waitFor({ state: "visible", timeout: 20000 });
  await begin.click();
  await page.locator(".firstRollOverlay").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
}

/**
 * Click-dismiss any map-notice toasts (resource pickups, etc.). They queue, so
 * keep clearing until two consecutive checks find none — otherwise the full-bleed
 * backdrop keeps intercepting the next click on the board.
 */
async function clearMapNotices(page: Page): Promise<void> {
  let emptyChecks = 0;
  for (let i = 0; i < 25 && emptyChecks < 2; i += 1) {
    const notice = page.locator(".mapNoticeBackdrop").first();
    if (await notice.isVisible().catch(() => false)) {
      await notice.click({ force: true }).catch(() => {});
      emptyChecks = 0;
    } else {
      emptyChecks += 1;
    }
    await page.waitForTimeout(300);
  }
}

/**
 * Sit at whichever seat actually holds the turn after the random first-player
 * roll. The start-of-turn draw is MANDATORY before moving, so the active seat is
 * the one offered the "Draw new" button; taking it reveals the move targets.
 */
async function sitActiveSeat(page: Page): Promise<void> {
  for (const title of [/Sit as Catherine/, /Sit as Sandro/]) {
    await page.getByTitle(title).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await clearMapNotices(page);
    // Take the mandatory start-of-turn draw — only the active seat is offered it,
    // and movement stays locked until it is taken.
    const drawNew = page.getByRole("button", { name: /Draw new/ }).first();
    if (await drawNew.isVisible().catch(() => false)) {
      await drawNew.click().catch(() => {});
      await page.waitForTimeout(800);
      await clearMapNotices(page);
    }
    if ((await page.locator(".hexCell.moveTarget").count()) > 0) {
      return;
    }
  }
}

async function startTwoPlayerAdventure(page: Page, roomId: string): Promise<void> {
  await page.goto(`/?room=${roomId}`);
  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 20000 });

  // Player 1 picks Castle — Catherine.
  await page.getByRole("button", { name: /Catherine/ }).click();
  await expect(page.getByText("Castle — Catherine", { exact: false })).toBeVisible();

  // Switch seats to Player 2 and pick Necropolis — Sandro.
  await page.getByTitle("Sit as Player 2").click();
  await page.getByRole("button", { name: /Sandro/ }).click();
  await expect(page.getByText("Necropolis — Sandro", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Start the adventure" }).click();
  await expect(page.locator(".hexMapSvg")).toBeVisible({ timeout: 20000 });
}

test("the hero walks by clicking the map with the confirm card on the hex", async ({ page }) => {
  await startTwoPlayerAdventure(page, `e2e-${Date.now().toString(36)}`);
  await dismissFirstRoll(page);
  await sitActiveSeat(page);

  // The active seat was dealt its starting hand of four cards.
  await expect(page.locator(".adventureHandCard")).toHaveCount(4);

  // Click a reachable hex: the move-confirm card opens anchored on the map
  // (foreignObject inside the SVG), not in a bar pinned to the bottom edge.
  const target = page.locator(".hexCell.moveTarget").first();
  await expect(target).toBeVisible();
  await target.click();
  const confirmCard = page.locator(".moveConfirmFloat");
  await expect(confirmCard).toBeVisible();
  await expect(confirmCard).toContainText(/Move there/);

  // Confirming consumes movement and dismisses the card.
  const hudBefore = await page.locator(".advHud").innerText();
  await page.getByRole("button", { name: /Move there/ }).click();
  await expect(confirmCard).toHaveCount(0);
  await expect
    .poll(async () => (await page.locator(".advHud").innerText()) !== hudBefore, { timeout: 5000 })
    .toBe(true);

  // Far tile tray shows the two face-down backs available to the active seat.
  await expect(page.locator(".farTileBack")).toHaveCount(2);
});

test("discovering a face-down tile opens the rotation card on the tile", async ({ page }) => {
  await startTwoPlayerAdventure(page, `e2e-rot-${Date.now().toString(36)}`);
  await dismissFirstRoll(page);
  await sitActiveSeat(page);

  // Walk towards the nearest face-down tile until one becomes discoverable.
  const discoverable = page.locator(".hexFaceDown.discoverable").first();
  for (let step = 0; step < 5; step += 1) {
    await clearMapNotices(page);
    if (await discoverable.isVisible().catch(() => false)) {
      break;
    }
    const faces = page.locator(".hexFaceDown");
    const faceCenters: { x: number; y: number }[] = [];
    for (let i = 0; i < (await faces.count()); i += 1) {
      const box = await faces.nth(i).boundingBox();
      if (box) {
        faceCenters.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
      }
    }
    const targets = page.locator(".hexCell.moveTarget");
    const targetCount = await targets.count();
    if (targetCount === 0 || faceCenters.length === 0) {
      break;
    }
    // Step onto the reachable hex nearest any face-down tile, skipping guarded
    // fields (their <title> says "(guard …)") so we approach the tile without
    // tripping a neutral combat that would block the discovery.
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < targetCount; i += 1) {
      const title = (await targets.nth(i).locator("title").textContent().catch(() => "")) ?? "";
      if (/guard/i.test(title)) {
        continue;
      }
      const box = await targets.nth(i).boundingBox();
      if (!box) {
        continue;
      }
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const distance = Math.min(...faceCenters.map((f) => Math.hypot(f.x - center.x, f.y - center.y)));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) {
      break;
    }
    await targets.nth(bestIndex).click();
    const moveThere = page.getByRole("button", { name: /Move there/ });
    await moveThere.click();
    // Wait for the move to actually commit (round-tripped through the room
    // server) instead of a fixed sleep: the planned-route control detaches once
    // the walk resolves and the board re-renders with the new reachable hexes.
    await expect(moveThere).toBeHidden({ timeout: 15000 });
  }

  await clearMapNotices(page);
  await expect(discoverable).toBeVisible();
  await discoverable.click();

  // The rotation card opens anchored on the tile (foreignObject) with rotate
  // buttons and a confirm. Rotations that border lines seal off disable the
  // confirm — keep turning until legal.
  await expect(page.locator(".rotateFloat")).toBeVisible();
  const confirm = page.getByRole("button", { name: /Confirm/ });
  for (let turn = 0; turn < 6; turn += 1) {
    if (await confirm.isEnabled()) {
      break;
    }
    await page.getByTitle("Rotate clockwise").click();
  }
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.locator(".rotateFloat")).toHaveCount(0);
});
