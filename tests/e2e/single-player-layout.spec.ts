import { expect, type Locator, test } from "@playwright/test";

async function expectContained(child: Locator, parent: Locator): Promise<void> {
  const [childBox, parentBox] = await Promise.all([child.boundingBox(), parent.boundingBox()]);
  expect(childBox).not.toBeNull();
  expect(parentBox).not.toBeNull();
  expect(childBox!.x).toBeGreaterThanOrEqual(parentBox!.x - 1);
  expect(childBox!.y).toBeGreaterThanOrEqual(parentBox!.y - 1);
  expect(childBox!.x + childBox!.width).toBeLessThanOrEqual(parentBox!.x + parentBox!.width + 1);
  expect(childBox!.y + childBox!.height).toBeLessThanOrEqual(parentBox!.y + parentBox!.height + 1);
}

test.describe("single-player responsive shell", () => {
  test("desktop cards and copy stay inside the framed panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/single-player");

    const panel = page.locator(".menuShellPanel");
    const cards = page.locator(".singlePlayerModeCard");
    await expect(panel).toBeVisible();
    await expect(cards).toHaveCount(2);
    await expectContained(page.locator(".singlePlayerHeroCopy"), panel);
    await expectContained(page.locator(".singlePlayerModeNav"), panel);
    await expectContained(cards.nth(0), panel);
    await expectContained(cards.nth(1), panel);
  });

  test("phone layout becomes one clean column and its setup dialog fits", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/single-player");

    const panel = page.locator(".menuShellPanel");
    const cards = page.locator(".singlePlayerModeCard");
    await expect(cards).toHaveCount(2);
    await expectContained(page.locator(".singlePlayerModeNav"), panel);

    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
    expect(Math.abs(first!.width - second!.width)).toBeLessThanOrEqual(1);

    await cards.nth(0).click();
    const dialog = page.getByRole("dialog", { name: "VS Computer setup" });
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(7);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(383);
    expect(dialogBox!.height).toBeLessThanOrEqual(820);
  });
});
