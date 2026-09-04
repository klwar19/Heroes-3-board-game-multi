import { expect, test } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

let markup: string;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  const directory = await mkdtemp(resolve(tmpdir(), "binh-recruit-layout-"));
  const output = resolve(directory, "recruitment.html");
  await promisify(execFile)(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", "src/components/adventure/binh-recruitment-options.test.tsx"], {
    env: { ...process.env, BINH_RECRUIT_LAYOUT_OUTPUT: output }, timeout: 110_000,
  });
  markup = await readFile(output, "utf8");
});

// Render the real shared component with production CSS. Interaction/reducer
// coverage lives in binh-recruitment-options.test.tsx; this checks real layout.
for (const width of [320, 390, 1440]) {
  test(`foreign recruits and duplicate slots fit at ${width}px`, async ({ page }, testInfo) => {
    const css = await readFile(resolve("src/app/globals.css"), "utf8");
    const publicRoot = resolve("public");
    await page.route("**/*", async (route) => {
      const path = resolve(publicRoot, `.${new URL(route.request().url()).pathname}`);
      if (!path.startsWith(publicRoot + sep)) return route.abort();
      try {
        const body = await readFile(path);
        const contentType = path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".png") ? "image/png" : path.endsWith(".ttf") ? "font/ttf" : "image/webp";
        await route.fulfill({ body, contentType });
      } catch { await route.abort(); }
    });
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<base href="http://fixture.test/"><style>${css}</style><div class="${width < 600 ? "phoneMode" : ""}"><div class="tbPanelBackdrop"><div class="tbPanelModal"><div class="tbPanel"><header><strong>Population — recruit &amp; reinforce</strong></header><div class="tbPanelBody">${markup}</div></div></div></div></div>`);
    const purchase = page.getByRole("button", { name: "Buy same unit: Black Dragons" });
    await purchase.scrollIntoViewIfNeeded();
    await expect(purchase).toBeVisible();
    await expect(page.locator("[data-army-unit-id]")).toHaveCount(5);
    const panel = await page.locator(".tbPanelBody").boundingBox();
    expect(panel).not.toBeNull();
    const controls = await page.locator(".recruitQuick").evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, height: rect.height };
    }));
    for (const control of controls) {
      expect(control.left).toBeGreaterThanOrEqual(panel!.x);
      expect(control.right).toBeLessThanOrEqual(panel!.x + panel!.width);
      if (width < 600) expect(control.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator(".tbPanelBody").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`recruitment-${width}.png`) });
  });
}
