/**
 * Update HOMM3BG_MATCH_REPORT_KEY on Vercel so it matches PartyKit / GitHub.
 * The variable already exists — we open its row and overwrite the value.
 */
import { chromium } from "playwright";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEY =
  process.env.MATCH_REPORT_KEY?.trim() ||
  (existsSync(join(process.env.TEMP || "/tmp", "homm3bg-match-report-key.txt"))
    ? readFileSync(join(process.env.TEMP || "/tmp", "homm3bg-match-report-key.txt"), "utf8").trim()
    : "");

if (!KEY || KEY.length < 16) {
  console.error("MATCH_REPORT_KEY missing.");
  process.exit(1);
}

const ENV_URL =
  process.env.VERCEL_PROJECT_URL ||
  "https://vercel.com/klwar-s-projects/heroes-3-board-game-multi/settings/environment-variables";

const userDataDir = join(homedir(), ".homm3bg-playwright-vercel");
const debugDir = join(process.cwd(), ".playwright-vercel-debug");
mkdirSync(debugDir, { recursive: true });

async function dump(page, label) {
  await page.screenshot({ path: join(debugDir, `${label}.png`), fullPage: true }).catch(() => {});
  writeFileSync(join(debugDir, `${label}.html`), await page.content().catch(() => ""));
  console.log(`  debug → ${label}.png`);
}

async function main() {
  console.log(`Updating HOMM3BG_MATCH_REPORT_KEY (len=${KEY.length}) to match PartyKit…`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 960 }
  });
  const page = context.pages()[0] || (await context.newPage());

  await page.goto(ENV_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(2500);
  await dump(page, "env-start");

  // Search to surface the row
  const search = page.getByPlaceholder(/search variables/i).first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill("HOMM3BG_MATCH_REPORT_KEY");
    await page.waitForTimeout(1000);
  }

  const rowText = page.getByText("HOMM3BG_MATCH_REPORT_KEY", { exact: true }).first();
  if (!(await rowText.isVisible().catch(() => false))) {
    console.error("HOMM3BG_MATCH_REPORT_KEY row not found.");
    await dump(page, "not-found");
    await page.waitForTimeout(15_000);
    await context.close();
    process.exit(2);
  }

  // Open the row's ⋯ menu
  const row = rowText.locator("xpath=ancestor::*[contains(@class,'') or self::div or self::li or self::tr][1]");
  // Prefer the menu button in the same list item
  const listItem = page.locator("div, li, tr").filter({ hasText: "HOMM3BG_MATCH_REPORT_KEY" }).first();
  await listItem.hover();
  await page.waitForTimeout(400);

  // The ⋯ button is usually the last button in the row
  const moreBtn = listItem.getByRole("button").last();
  // Fallback: buttons near the text
  if (await moreBtn.isVisible().catch(() => false)) {
    await moreBtn.click({ force: true });
  } else {
    await rowText.click({ force: true });
  }
  await page.waitForTimeout(800);
  await dump(page, "menu-open");

  // Click Edit in the menu
  const editItem = page
    .getByRole("menuitem", { name: /^edit$/i })
    .or(page.getByRole("button", { name: /^edit$/i }))
    .or(page.getByText(/^Edit$/i))
    .first();
  if (await editItem.isVisible().catch(() => false)) {
    await editItem.click();
    console.log("Opened Edit.");
  } else {
    // Some UIs open edit by clicking the row itself
    console.log("No Edit menu — clicking the variable name…");
    await rowText.click({ force: true });
  }
  await page.waitForTimeout(1500);
  await dump(page, "edit-open");

  // Value field in edit sheet
  const valueField = page
    .getByLabel(/^value$/i)
    .or(page.getByPlaceholder(/value|secret/i))
    .or(page.locator('[role="dialog"] textarea, [role="dialog"] input[type="password"], [role="dialog"] input[type="text"]').nth(1))
    .or(page.locator('textarea, input[type="password"]').first())
    .first();

  // Reveal value if there's an eye button
  const eye = page.locator('[role="dialog"] button').filter({ has: page.locator("svg") }).first();
  // Try to clear and type new value
  const candidates = [
    page.locator('[role="dialog"] input').filter({ hasNot: page.locator('[disabled]') }),
    page.locator('[role="dialog"] textarea'),
    page.getByLabel(/value/i)
  ];

  let filled = false;
  for (const group of candidates) {
    const count = await group.count();
    for (let i = 0; i < count; i++) {
      const el = group.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const type = await el.getAttribute("type").catch(() => "");
      const name = (await el.getAttribute("name").catch(() => "")) || "";
      const placeholder = (await el.getAttribute("placeholder").catch(() => "")) || "";
      const aria = (await el.getAttribute("aria-label").catch(() => "")) || "";
      // Skip key name field
      if (/key|name/i.test(placeholder + aria + name) && !/value/i.test(placeholder + aria + name)) {
        continue;
      }
      try {
        await el.click({ clickCount: 3 });
        await el.fill(KEY);
        filled = true;
        console.log(`Filled value via ${el} type=${type} placeholder=${placeholder}`);
        break;
      } catch {
        /* try next */
      }
    }
    if (filled) break;
  }

  if (!filled) {
    // Last resort: all visible inputs in dialog, use the second one
    const dialogInputs = page.locator('[role="dialog"] input:not([type="checkbox"]):not([type="hidden"]), [role="dialog"] textarea');
    const n = await dialogInputs.count();
    console.log(`Dialog inputs count=${n}`);
    if (n >= 2) {
      await dialogInputs.nth(1).fill(KEY);
      filled = true;
    } else if (n === 1) {
      await dialogInputs.nth(0).fill(KEY);
      filled = true;
    }
  }

  if (!filled) {
    console.error("Could not fill value — complete manually in the open dialog (60s).");
    console.error(`Paste this key (also in temp file): length ${KEY.length}`);
    await page.waitForTimeout(60_000);
    await context.close();
    process.exit(3);
  }

  // Save
  const save = page.getByRole("button", { name: /^save$/i }).or(page.getByRole("button", { name: /save changes/i })).last();
  await save.click();
  console.log("Clicked Save.");
  await page.waitForTimeout(3000);
  await dump(page, "after-update");

  // Toast or list still shows the key
  const stillThere = await page.getByText("HOMM3BG_MATCH_REPORT_KEY").first().isVisible().catch(() => false);
  console.log(stillThere ? "SUCCESS: key still listed (value updated)." : "Check UI manually.");
  console.log("Redeploy Vercel Production so the new value is live.");

  await page.waitForTimeout(5000);
  await context.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
