import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// EFFECT test (real browser layout) for the map card bar after the redesign.
// Requirements:
//  - the player card bar (.playerCardBar) sits at the TOP of the map screen,
//    ABOVE the map row (.adventureMidRow) — the redesign floats it up with
//    CSS `order`,
//  - inside the bar it reads left → right: the deck/discard + Spell Book +
//    permanent cluster (.ownDeckColumn), then the hand of cards (.handArea),
//  - the permanent shows its effect text,
//  - the Spell Book toggle and the deck/discard pile live in the left cluster.
//
// We inject the real globals.css and mock the map row + the card bar inside the
// real .tableRoot.adventureRoot grid, then measure box geometry. Self-contained
// (setContent, no dev server). Move .playerCardBar back below the map (drop the
// `order`) and the "above the map row" assertion fails; make .ownDeckColumn
// stack over .handArea again and the left-of-hand assertion fails.
// ---------------------------------------------------------------------------

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

// The 1x1 transparent GIF lets an <img> take its CSS width with a definite box.
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const page_html = `
<main class="tableRoot adventureRoot">
  <div class="tableTopRow"><div class="advHud" style="height:56px"></div></div>
  <div class="adventureHand playerCardBar" aria-label="Your hand">
    <div class="ownDeckColumn">
      <div class="ownDeckPile">
        <div class="ownDeckSpot">
          <img class="ownDeckBack" src="${PIXEL}" alt="" />
          <span class="ownDeckCount">12</span>
          <small>Deck</small>
        </div>
        <div class="ownDiscardSpot">
          <span class="ownDeckCount">3</span>
          <small>Discard</small>
        </div>
      </div>
      <div class="permanentRow">
        <div class="permanentSlot">
          <button class="permanentCardButton"><img class="permanentCardImage" src="${PIXEL}" alt="" /></button>
          <div class="permanentMeta">
            <span class="permanentBadge">permanent</span>
            <strong>Eversmoking Ring of Sulfur</strong>
            <small>gain 1 valuables at the start of each Resources round</small>
          </div>
        </div>
      </div>
      <div class="spellBookPanel">
        <button class="spellBookToggle">
          <img class="spellBookIcon" src="${PIXEL}" alt="" />
          <span class="spellBookCount">2</span>
          <small>Spell Book</small>
        </button>
      </div>
    </div>
    <div class="handArea">
      <div class="handTopBar"><small>Hand 3/5</small></div>
      <div class="adventureHandCards">
        ${[0, 1, 2, 3]
          .map(
            () => `
        <div class="adventureHandSlot">
          <button class="adventureHandCard"><img class="handCardImage" src="${PIXEL}" alt="" /></button>
        </div>`
          )
          .join("")}
      </div>
    </div>
  </div>
  <div class="adventureMidRow">
    <div class="leftRail"><div style="height:160px"></div></div>
    <div class="mapColumn"><div class="hexMapWrap"></div></div>
  </div>
</main>`;

test("the card bar rides the top, deck/book cluster left of the hand, readable cards", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${page_html}</body></html>`);

  const midRow = (await page.locator(".adventureMidRow").boundingBox())!;
  const cardBar = (await page.locator(".playerCardBar").boundingBox())!;
  const ownDeckColumn = (await page.locator(".ownDeckColumn").boundingBox())!;
  const handArea = (await page.locator(".handArea").boundingBox())!;
  const deckPile = (await page.locator(".ownDeckPile").boundingBox())!;
  const spellBook = (await page.locator(".spellBookToggle").boundingBox())!;

  // 1. The card bar is floated to the TOP: it sits entirely ABOVE the map row
  //    even though it comes after it in the DOM (CSS `order`).
  expect(cardBar.y + cardBar.height, "the card bar sits above the map row").toBeLessThanOrEqual(midRow.y + 2);

  // 2. Inside the bar: the deck/book cluster is to the LEFT of the hand, on the
  //    same row (a horizontal command bar, not a stacked column).
  expect(ownDeckColumn.x + ownDeckColumn.width, "deck/book cluster ends left of the hand").toBeLessThanOrEqual(
    handArea.x + 2
  );
  expect(Math.abs(ownDeckColumn.y - handArea.y), "cluster and hand share the top of the bar").toBeLessThanOrEqual(24);

  // 3. The Spell Book toggle and the deck/discard pile live in the left cluster.
  expect(spellBook.x, "Spell Book is in the left cluster, left of the hand").toBeLessThan(handArea.x);
  expect(deckPile.x + deckPile.width, "deck/discard pile fits in the left cluster").toBeLessThanOrEqual(handArea.x + 2);

  // 4. Hand cards are a readable size in the top bar.
  const cardWidth = (await page.locator(".adventureHandCard .handCardImage").first().boundingBox())!.width;
  expect(cardWidth, "hand cards are a readable size (>=100px)").toBeGreaterThanOrEqual(100);

  // 5. The permanent (with its effect text) is shown in the left cluster.
  expect(await page.locator(".permanentMeta small").textContent()).toContain("valuables");
});
