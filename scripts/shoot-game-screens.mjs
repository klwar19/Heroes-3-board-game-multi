// Standalone in-game screenshot driver (NOT the playwright test runner, which
// hangs on this machine). Drives a real Chromium against a running `npm run dev`
// on :3000 and screenshots the five art-skin surfaces: adventure map, town
// board, battle sandbox, map designer, single-player setup.
// Usage: node scripts/shoot-game-screens.mjs <outDir> [only1,only2,...]
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const outDir = process.argv[2];
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
fs.mkdirSync(outDir, { recursive: true });

const hardKill = setTimeout(() => {
  console.error("HARD TIMEOUT — killing");
  process.exit(2);
}, 420_000);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3000",
        localStorage: [
          { name: "binh-ui-mode", value: "computer" },
          { name: "binh-helper-coach", value: "off" }
        ]
      }
    ]
  }
});
const page = await context.newPage();

const shoot = async (name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  console.log(`OK ${name}`);
};

const clearMapNotices = async () => {
  let empty = 0;
  for (let i = 0; i < 20 && empty < 2; i += 1) {
    const notice = page.locator(".mapNoticeBackdrop").first();
    if (await notice.isVisible().catch(() => false)) {
      await notice.click({ force: true }).catch(() => {});
      empty = 0;
    } else {
      empty += 1;
    }
    await page.waitForTimeout(300);
  }
};

const wants = (name) => !only || only.has(name);

// ---- designer -------------------------------------------------------------
if (wants("designer")) {
  try {
    await page.goto("http://localhost:3000/designer", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    await shoot("designer");
  } catch (e) {
    console.error(`FAIL designer: ${e.message.split("\n")[0]}`);
  }
}

// ---- single player setup ----------------------------------------------------
if (wants("single-player")) {
  try {
    await page.goto("http://localhost:3000/single-player", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3500);
    await shoot("single-player");
  } catch (e) {
    console.error(`FAIL single-player: ${e.message.split("\n")[0]}`);
  }
}

// ---- battle sandbox ---------------------------------------------------------
if (wants("battle") || wants("battle-setup")) {
  try {
    await page.goto("http://localhost:3000/battle", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("button", { name: /create arena/i }).click({ timeout: 30000 });
    const begin = page.getByRole("button", { name: /Begin deployment/i }).first();
    await begin.waitFor({ state: "visible", timeout: 45000 });
    await page.waitForTimeout(1500);
    if (wants("battle-setup")) {
      await shoot("battle-setup");
    }
    if (wants("battle")) {
      await begin.click();
      await page.waitForTimeout(4000);
      await shoot("battle");
    }
  } catch (e) {
    console.error(`FAIL battle: ${e.message.split("\n")[0]}`);
  }
}

// ---- adventure map + town board ----------------------------------------------
if (wants("map") || wants("town")) {
  try {
    const roomId = `shot-adv-${Date.now().toString(36)}`;
    await page.goto(`http://localhost:3000/?room=${roomId}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("button", { name: /Catherine/ }).click({ timeout: 30000 });
    await page.getByTitle("Sit as Player 2").click();
    await page.getByRole("button", { name: /Sandro/ }).click();
    await page.getByRole("button", { name: "New Game" }).click();
    await page.locator(".hexMapSvg").waitFor({ state: "visible", timeout: 30000 });
    // Dismiss the first-player ceremony.
    const begin = page.getByRole("button", { name: /Begin the adventure/i });
    await begin.waitFor({ state: "visible", timeout: 25000 });
    await begin.click();
    await page.locator(".firstRollOverlay").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    // Sit at whichever seat holds the turn, resolve the forced rotation + draw.
    for (const title of [/Sit as Catherine/, /Sit as Sandro/]) {
      await page.getByTitle(title).click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      await clearMapNotices();
      const rotate = page.locator(".rotateFloat");
      if (await rotate.isVisible().catch(() => false)) {
        const confirm = rotate.getByRole("button", { name: /Confirm/ });
        for (let t = 0; t < 6 && !(await confirm.isEnabled().catch(() => false)); t += 1) {
          await rotate.getByTitle("Rotate clockwise").click().catch(() => {});
        }
        await confirm.click().catch(() => {});
        await rotate.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
      }
      const drawNew = page.getByRole("button", { name: /Draw new/ }).first();
      if (await drawNew.isVisible().catch(() => false)) {
        await drawNew.click().catch(() => {});
        await page.waitForTimeout(800);
        await clearMapNotices();
      }
      if ((await page.locator(".hexCell.moveTarget").count()) > 0) {
        break;
      }
    }
    await clearMapNotices();
    await page.waitForTimeout(800);
    if (wants("map")) {
      await shoot("map");
    }
    if (wants("town")) {
      const openTown = page.getByTitle(/Open your town/).first();
      if (await openTown.isVisible().catch(() => false)) {
        await openTown.click();
        await page.waitForTimeout(2200);
        await shoot("town");
      } else {
        console.error("FAIL town: no Open-your-town control visible");
      }
    }
  } catch (e) {
    console.error(`FAIL map/town: ${e.message.split("\n")[0]}`);
  }
}

await browser.close();
clearTimeout(hardKill);
process.exit(0);
