import { expect, test } from "@playwright/test";

test.describe("map designer teleporter token drag", () => {
  test("moves a Monolith between exact hexes on one face-down tile", async ({ page }) => {
    await page.goto("/designer");
    await expect(page.locator(".designerSvg")).toBeVisible();

    // Add one ordinary face-down tile away from the default seats.
    const far = page.locator(".paletteTile.group-far").first();
    const board = page.locator(".designerSvg");
    const farBox = await far.boundingBox();
    const boardBox = await board.boundingBox();
    expect(farBox).not.toBeNull();
    expect(boardBox).not.toBeNull();
    await page.mouse.move(farBox!.x + farBox!.width / 2, farBox!.y + farBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(boardBox!.x + boardBox!.width * 0.78, boardBox!.y + boardBox!.height * 0.28, {
      steps: 12
    });
    await page.mouse.up();

    // Place the token on one exact flower hex, then leave placement mode.
    const monolith = page.locator(".designerObjectButton").filter({ hasText: "Monolith" });
    await monolith.click();
    const armedSlots = page.locator(".designerObjectSlot.faceDownTile");
    await expect(armedSlots).toHaveCount(7);
    await armedSlots.nth(1).click();
    await monolith.click();

    // The transparent painted hex is essential: without it real browsers never
    // deliver pointer-down for pointer-transparent token art (synthetic DOM tests
    // can dispatch to the parent group and miss this regression).
    const hit = page.locator(".designerMapTokenHit").first();
    await expect(hit).toBeVisible();
    const hitBox = await hit.boundingBox();
    expect(hitBox).not.toBeNull();
    await page.mouse.move(hitBox!.x + hitBox!.width / 2, hitBox!.y + hitBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hitBox!.x + hitBox!.width / 2 + 16, hitBox!.y + hitBox!.height / 2, { steps: 5 });

    const liveSlots = page.locator(".designerObjectSlot.faceDownTile");
    await expect(liveSlots).toHaveCount(7);
    const target = liveSlots.nth(4);
    const targetBox = await target.boundingBox();
    expect(targetBox).not.toBeNull();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 5 });

    const reticle = page.locator(".designerTokenDropReticle");
    await expect(reticle).toHaveCount(1);
    await expect(reticle).toHaveAttribute("data-space-id", /^h:/);
    await expect(page.locator(".designerPlacementLegend")).toContainText("exact tile hex");
    await page.mouse.up();

    // The compact editor confirms that the fourth ring target, not the tile
    // centre, was persisted as the reserved in-game slot.
    await page.locator(".designerMapTokenHit").first().click();
    await expect(page.getByLabel("Token hex")).toHaveValue("4");
  });
});
