// Standalone screenshot runner (NOT the playwright test runner, which hangs here).
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const outDir = process.argv[2];
const targets = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));

const hardKill = setTimeout(() => {
  console.error("HARD TIMEOUT — killing");
  process.exit(2);
}, 120_000);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (const t of targets) {
  try {
    await page.goto(`http://localhost:3000${t.url}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(t.settle ?? 2500);
    if (t.click) {
      try {
        await page.click(t.click, { timeout: 4000 });
        await page.waitForTimeout(1500);
      } catch (e) {
        console.error(`click failed for ${t.name}: ${e.message.split("\n")[0]}`);
      }
    }
    await page.screenshot({ path: path.join(outDir, `${t.name}.png`), fullPage: false });
    console.log(`OK ${t.name}`);
  } catch (e) {
    console.error(`FAIL ${t.name}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
clearTimeout(hardKill);
process.exit(0);
