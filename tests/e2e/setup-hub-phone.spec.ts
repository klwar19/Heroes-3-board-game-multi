import { expect, type Page, test } from "@playwright/test";

/**
 * Setup Hub — the REAL-BROWSER half of the four-box lobby's test bar.
 *
 * The jsdom suite (src/components/adventure/setup-hub.test.tsx) pins the wiring
 * (which box opens which dialog, what each dispatches). jsdom cannot compute
 * CSS, so THIS spec pins the visible effect: the boxes sit in a 2×2 grid, a hub
 * window is a centered panel on a desktop viewport and a FULL-SCREEN sheet on a
 * phone, and the Map window's two-column preview layout collapses to one column
 * on a phone.
 */

const roomId = (tag: string) => `e2e-hub-${tag}-${Date.now().toString(36)}`;

async function openLobby(page: Page, tag: string): Promise<void> {
  await page.goto(`/?room=${roomId(tag)}`);
  await expect(page.getByRole("heading", { name: /Map setup/i })).toBeVisible({ timeout: 30000 });
}

/** Answer the pre-game layout prompt (it blocks the lobby until answered). */
async function chooseUiMode(page: Page, mode: "phone" | "computer"): Promise<void> {
  const prompt = page.getByRole("dialog", { name: /choose your screen layout/i });
  await expect(prompt).toBeVisible({ timeout: 20000 });
  await prompt.getByRole("button", { name: mode === "phone" ? /^Phone mode/ : /^Computer mode/ }).click();
  await expect(prompt).toHaveCount(0);
}

async function dismissCoachPrompt(page: Page): Promise<void> {
  const coach = page.getByRole("dialog", { name: /on-screen helper tips/i });
  if (await coach.isVisible().catch(() => false)) {
    await coach.getByRole("button", { name: /turn tips off/i }).click();
    await expect(coach).toHaveCount(0);
  }
}

/** The four boxes wrap into rows of two — group them by their y position. */
async function boxRows(page: Page): Promise<number[]> {
  const boxes = page.locator(".setupHubBox");
  await expect(boxes).toHaveCount(4);
  const tops: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const box = await boxes.nth(index).boundingBox();
    tops.push(Math.round(box!.y));
  }
  const rows = new Map<number, number>();
  for (const top of tops) {
    // Same row within a couple of pixels.
    const key = [...rows.keys()].find((candidate) => Math.abs(candidate - top) < 4) ?? top;
    rows.set(key, (rows.get(key) ?? 0) + 1);
  }
  return [...rows.values()];
}

test.describe("desktop", () => {
  test("the boxes sit in a 2×2 grid and a hub window is a centered panel", async ({ page }) => {
    await openLobby(page, "desktop");
    // Two rows of two — the boxes are a block in the middle, not a top-edge strip.
    expect(await boxRows(page)).toEqual([2, 2]);

    const viewport = page.viewportSize()!;
    const firstBox = (await page.locator(".setupHubBox").first().boundingBox())!;
    expect(firstBox.y).toBeGreaterThan(80);

    await page.getByRole("button", { name: /^Map/ }).click();
    const window = page.locator(".setupHubWindow");
    await expect(window).toBeVisible();
    const panel = (await window.boundingBox())!;
    // A centered panel: narrower than the viewport, with side gutters.
    expect(panel.width).toBeLessThan(viewport.width - 20);
    expect(panel.x).toBeGreaterThan(8);

    // The Map window shows the list and the shape preview SIDE BY SIDE.
    const list = (await page.locator(".mapPickList").boundingBox())!;
    const detail = (await page.locator(".mapPickDetail").boundingBox())!;
    expect(detail.x).toBeGreaterThan(list.x + list.width - 4);
    await expect(page.locator(".mapShapePreviewSvg")).toBeVisible();

    // All four chess difficulty pieces are on screen — and REACHABLE: the
    // docked table chat sits at the window's bottom-left corner, so a click
    // that lands proves the window really is above it (Playwright refuses to
    // click an occluded element).
    await expect(page.locator(".difficultyChessBtn")).toHaveCount(4);
    const easy = page.getByRole("button", { name: /^Easy/ });
    await easy.click();
    await expect(easy).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  });
});

test.describe("phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    storageState: { cookies: [], origins: [] }
  });

  test("2×2 boxes, and a hub window fills the screen with a stacked Map layout", async ({ page }) => {
    await openLobby(page, "phone");
    await chooseUiMode(page, "phone");
    await dismissCoachPrompt(page);
    await expect(page.locator("main.phoneMode")).toBeVisible();

    // Still two rows of two on a 390px screen (the boxes shrink, not reflow to 1).
    expect(await boxRows(page)).toEqual([2, 2]);

    await page.getByRole("button", { name: /^Map/ }).click();
    const window = page.locator(".setupHubWindow");
    await expect(window).toBeVisible();
    const viewport = page.viewportSize()!;
    const panel = (await window.boundingBox())!;
    // A full-screen sheet: the whole width, effectively the whole height.
    expect(panel.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(panel.x).toBeLessThanOrEqual(1);
    expect(panel.height).toBeGreaterThan(viewport.height * 0.9);

    // The preview stacks UNDER the list instead of beside it.
    const list = (await page.locator(".mapPickList").boundingBox())!;
    const detail = (await page.locator(".mapPickDetail").boundingBox())!;
    expect(detail.y).toBeGreaterThan(list.y + list.height - 4);
    expect(Math.abs(detail.x - list.x)).toBeLessThan(4);

    // Closing returns to the boxes.
    await page.getByRole("button", { name: "Close Choose a map" }).click();
    await expect(window).toHaveCount(0);
    await expect(page.locator(".setupHubBox")).toHaveCount(4);
  });
});
