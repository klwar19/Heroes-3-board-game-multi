import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// EFFECT test (real browser layout) for the redesigned MAP Spell Book — the
// openable two-page tome. Proves the book renders as a genuine two-page spread:
//  - the left page lists the stored Spells (an index of clickable entries),
//  - the right page is the illustrated plate: a sizeable ART SLOT (the room for
//    real/generated art), the Spell's title and a real definition,
//  - the index page sits LEFT of the plate page (the spine between them).
// Self-contained: injects the real globals.css over mock book markup (no dev
// server). Collapse the art slot or stack the pages and the assertions fail.
// ---------------------------------------------------------------------------

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

// A 1x1 transparent GIF lets an <img> take its CSS box with a definite size.
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const bookHtml = `
<div class="spellBookBackdrop">
  <div class="spellBookBook">
    <button class="spellBookBookClose" aria-label="Close the Spell Book">x</button>
    <div class="spellBookPage left">
      <div class="spellBookPlateHeader"><strong>Spell Book</strong></div>
      <p class="spellBookBlurb">Spells set aside for later.</p>
      <ul class="spellBookIndex">
        ${["Haste", "Bloodlust"]
          .map(
            (name, i) => `
        <li>
          <button class="spellBookIndexItem ${i === 0 ? "active" : ""}">
            <span class="spellBookIndexDot"></span>
            <span class="spellBookIndexName">${name}</span>
            <span class="spellBookIndexLevel">Basic</span>
          </button>
        </li>`
          )
          .join("")}
      </ul>
    </div>
    <div class="spellBookSpine"></div>
    <div class="spellBookPage right">
      <div class="spellBookArtSlot">
        <img class="spellBookArt" src="${PIXEL}" alt="Haste" />
        <span class="spellBookArtFrame"></span>
      </div>
      <h3 class="spellBookSpellTitle">Haste</h3>
      <div class="spellBookChips"><span class="spellBookChip level">Basic spell</span><span class="spellBookChip school">Air</span></div>
      <p class="spellBookDefinition">Until the end of the Combat, the selected unit gains +1 initiative.</p>
      <div class="spellBookActions"><button class="commandButton primary">Cast →</button></div>
    </div>
  </div>
</div>`;

test("the map Spell Book opens as a two-page tome: index page beside an illustrated plate", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${bookHtml}</body></html>`);

  // Two-page spread: the index (left page) sits to the LEFT of the plate (right).
  const leftPage = (await page.locator(".spellBookPage.left").boundingBox())!;
  const rightPage = (await page.locator(".spellBookPage.right").boundingBox())!;
  expect(leftPage.x + leftPage.width, "the index page is left of the plate page").toBeLessThanOrEqual(rightPage.x + 2);

  // The left page indexes every stored Spell.
  await expect(page.locator(".spellBookIndexItem")).toHaveCount(2);

  // The right page carries a sizeable ART SLOT — the room for real/generated art.
  const artSlot = (await page.locator(".spellBookArtSlot").boundingBox())!;
  expect(artSlot.width, "the art slot has real width").toBeGreaterThanOrEqual(160);
  expect(artSlot.height, "the art slot has real height").toBeGreaterThanOrEqual(90);

  // The plate shows the Spell's title and a real definition, under the art.
  const title = (await page.locator(".spellBookSpellTitle").boundingBox())!;
  expect(title.y, "the title sits below the art slot").toBeGreaterThanOrEqual(artSlot.y + artSlot.height - 2);
  expect((await page.locator(".spellBookDefinition").textContent()) ?? "", "a real definition is shown").toContain(
    "initiative"
  );
});
