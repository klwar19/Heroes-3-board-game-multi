import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// EFFECT test (real browser layout) for the card-tray sizing bug: an art-less
// hero specialty rendered natively inside a slot that fixes only its WIDTH (the
// permanents row, `.permanentCardImage`, which sets no aspect-ratio and no
// height) used to collapse to its text height — visibly smaller than a scanned
// card of the same width. The fix lets the native card keep its own 625/879
// ratio, so its height is definite (full card) in every slot.
//
// We inject the real globals.css and the exact .scWrap markup the SpecialtyCard
// renders, then measure. Self-contained (uses setContent, not the dev server).
// ---------------------------------------------------------------------------

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

const card = (slotClass: string) => `
  <div class="${slotClass} specialtyCardFrame" style="--sc-accent:#1f3a5f">
    <div class="scWrap" data-level="6">
      <div class="sc">
        <div class="scContent">
          <div class="scIconBox"></div>
          <h3 class="scName">Runes VI</h3>
          <p class="scDesc">Hold up to 4 Runes; gain their bonuses while held.</p>
        </div>
        <div class="scPortrait"></div>
        <div class="scLevel"><span class="scLevelBadge">VI</span></div>
      </div>
    </div>
  </div>`;

const NATIVE_RATIO = 879 / 625; // ≈ 1.406 — the printed card's height/width

test("native specialty card fills its slot height (does not collapse) in every slot", async ({ page }) => {
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body>
       <div style="display:flex; gap:24px; align-items:flex-start; padding:20px">
         <div id="perm">${card("permanentCardImage")}</div>
         <div id="tray" class="trayTile" style="width:240px">${card("trayCardImage")}</div>
       </div>
     </body></html>`
  );

  for (const id of ["perm", "tray"]) {
    const box = await page.locator(`#${id} .specialtyCardFrame`).boundingBox();
    expect(box, `${id}: frame must render`).not.toBeNull();
    const ratio = box!.height / box!.width;
    // A collapsed card (the bug) sat near ratio ~1.0; a full card is ~1.41.
    expect(ratio, `${id}: card height/width should match the printed 625/879 card`).toBeGreaterThan(1.3);
    expect(Math.abs(ratio - NATIVE_RATIO), `${id}: ratio ${ratio.toFixed(3)} should be ≈ ${NATIVE_RATIO.toFixed(3)}`).toBeLessThan(0.08);
  }
});
