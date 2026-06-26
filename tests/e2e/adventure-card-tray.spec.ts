import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// EFFECT test (real browser layout) for the map card tray. Requirements:
//  - the hand of cards sits directly BENEATH the center map column (its left
//    edge lines up with the map column above it),
//  - the support column (Spell Book + deck/discard + permanent) sits under the
//    left rail, to the LEFT of the hand,
//  - the hand cards are enlarged,
//  - the permanent shows its effect text.
//
// We inject the real globals.css and mock BOTH the map row (.adventureMidRow)
// and the tray (.adventureHand) inside the real .tableRoot grid, then measure
// box geometry to prove the two rows line up. Self-contained (uses setContent,
// not the dev server). Revert .adventureHand to a flex row / full width and the
// "aligned under the map column" assertion fails; shrink .handCardImage back
// and the enlarge assertion fails.
// ---------------------------------------------------------------------------

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

// The 1x1 transparent GIF lets an <img> take its CSS width with a definite box.
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const page_html = `
<main class="tableRoot adventureRoot">
  <div class="adventureMidRow">
    <div class="leftRail"><div style="height:160px"></div></div>
    <div class="mapColumn"><div class="hexMapWrap"></div></div>
    <div class="rightRail adventureRail"><div style="height:160px"></div></div>
  </div>
  <div class="adventureHand" aria-label="Your hand">
    <div class="ownDeckColumn">
      <div class="spellBookPanel">
        <button class="spellBookToggle">
          <img class="spellBookIcon" src="${PIXEL}" alt="" />
          <span class="spellBookCount">2</span>
          <small>Spell Book</small>
        </button>
      </div>
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
</main>`;

test("the hand tray sits beneath the center map column, Spell Book to the left, enlarged cards", async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${page_html}</body></html>`);

  const mapColumn = (await page.locator(".mapColumn").boundingBox())!;
  const leftRail = (await page.locator(".leftRail").boundingBox())!;
  const ownDeckColumn = (await page.locator(".ownDeckColumn").boundingBox())!;
  const handArea = (await page.locator(".handArea").boundingBox())!;
  const deckPile = (await page.locator(".ownDeckPile").boundingBox())!;
  const spellBook = (await page.locator(".spellBookToggle").boundingBox())!;

  // 1. The hand is anchored BENEATH the center map column: its left edge lines
  //    up with the map column above it (the tray grid tracks the map row's
  //    columns), and it sits below that row.
  expect(Math.abs(handArea.x - mapColumn.x), "hand left edge lines up under the map column").toBeLessThanOrEqual(2);
  expect(handArea.y, "hand area should sit below the map row").toBeGreaterThan(mapColumn.y);

  // 2. The support column sits under the left rail, to the LEFT of the hand.
  expect(Math.abs(ownDeckColumn.x - leftRail.x), "support column should line up under the left rail").toBeLessThanOrEqual(
    2
  );
  expect(ownDeckColumn.x + ownDeckColumn.width, "support column ends left of the hand").toBeLessThanOrEqual(
    handArea.x + 2
  );

  // 3. The Spell Book moved to the left support column (not in the hand area).
  expect(spellBook.x, "Spell Book should be in the left column, left of the hand").toBeLessThan(handArea.x);
  expect(
    spellBook.x >= ownDeckColumn.x - 2 && spellBook.x + spellBook.width <= ownDeckColumn.x + ownDeckColumn.width + 2,
    "Spell Book should sit inside the support column"
  ).toBe(true);

  // 4. The deck/discard pile fits within the support column (left of the hand).
  expect(deckPile.x + deckPile.width, "deck/discard pile fits in the support column").toBeLessThanOrEqual(handArea.x + 2);

  // 5. Enlarged cards: each hand card image is clearly larger than the old tray.
  const cardWidth = (await page.locator(".adventureHandCard .handCardImage").first().boundingBox())!.width;
  expect(cardWidth, "hand cards should be enlarged (>140px)").toBeGreaterThan(140);

  // 6. The permanent (with its effect text) is shown in the support column.
  expect(await page.locator(".permanentMeta small").textContent()).toContain("valuables");
});
