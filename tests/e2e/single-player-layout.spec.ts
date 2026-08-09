import { expect, type Locator, test } from "@playwright/test";

async function expectContained(child: Locator, parent: Locator): Promise<void> {
  const [childBox, parentBox] = await Promise.all([
    child.boundingBox(),
    parent.boundingBox(),
  ]);
  expect(childBox).not.toBeNull();
  expect(parentBox).not.toBeNull();
  expect(childBox!.x).toBeGreaterThanOrEqual(parentBox!.x - 1);
  expect(childBox!.y).toBeGreaterThanOrEqual(parentBox!.y - 1);
  expect(childBox!.x + childBox!.width).toBeLessThanOrEqual(
    parentBox!.x + parentBox!.width + 1,
  );
  expect(childBox!.y + childBox!.height).toBeLessThanOrEqual(
    parentBox!.y + parentBox!.height + 1,
  );
}

test.describe("single-player responsive shell", () => {
  test("desktop generated choices stay inside the framed panel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/single-player");

    const panel = page.locator(".menuShellPanel");
    const choices = page.locator(".singlePlayerArtNav > .menuNavButton");
    await expect(panel).toBeVisible();
    await expect(choices).toHaveCount(3);
    await expectContained(page.locator(".singlePlayerArtNav"), panel);
    for (let index = 0; index < 3; index += 1)
      await expectContained(choices.nth(index), panel);
  });

  test("phone layout becomes one clean column and its setup dialog fits", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/single-player");

    const panel = page.locator(".menuShellPanel");
    const choices = page.locator(".singlePlayerArtNav > .menuNavButton");
    await expect(choices).toHaveCount(3);
    await expectContained(page.locator(".singlePlayerArtNav"), panel);

    const first = await choices.nth(0).boundingBox();
    const second = await choices.nth(1).boundingBox();
    const third = await choices.nth(2).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(third).not.toBeNull();
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
    expect(third!.y).toBeGreaterThan(second!.y + second!.height - 1);
    expect(Math.abs(first!.width - second!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(second!.width - third!.width)).toBeLessThanOrEqual(1);

    await choices.nth(0).click();
    const dialog = page.getByRole("dialog", { name: "VS Computer setup" });
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(7);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(383);
    expect(dialogBox!.height).toBeLessThanOrEqual(820);
  });
});
