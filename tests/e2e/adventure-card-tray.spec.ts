import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// EFFECT test (real browser layout) for the map card tray. The player's hand
// must sit UNDER the map, to the RIGHT of the deck + discard pile, and the hand
// cards must be enlarged. The permanent in play is shown in the same left
// column (under the deck/discard) so its effect reads clearly on the map.
//
// We inject the real globals.css and the exact tray markup page.tsx renders,
// then measure box geometry. Self-contained (uses setContent, not the dev
// server). Revert the `.adventureHand { flex-direction: row }` change and the
// side-by-side assertion fails; shrink `.handCardImage` back to 92px and the
// enlarge assertion fails.
// ---------------------------------------------------------------------------

const css = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

// The 1x1 transparent GIF lets the <img> take its CSS width with a definite box.
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const tray = `
  <div class="adventureHand" aria-label="Your hand">
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
    </div>
    <div class="handArea">
      <div class="handTopBar"><small>Hand 3/5</small></div>
      <div class="adventureHandCards">
        ${[0, 1, 2]
          .map(
            () => `
        <div class="adventureHandSlot">
          <button class="adventureHandCard"><img class="handCardImage" src="${PIXEL}" alt="" /></button>
        </div>`,
          )
          .join("")}
      </div>
    </div>
  </div>`;

test("the hand tray sits to the RIGHT of the deck/discard, with enlarged cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(
    `<!doctype html><html><head><style>${css}</style></head><body>
       <div style="padding:20px">${tray}</div>
     </body></html>`,
  );

  const deckCol = (await page.locator(".ownDeckColumn").boundingBox())!;
  const handArea = (await page.locator(".handArea").boundingBox())!;
  const deckPile = (await page.locator(".ownDeckPile").boundingBox())!;
  const handCards = (await page.locator(".adventureHandCards").boundingBox())!;
  expect(deckCol, "deck column must render").not.toBeNull();
  expect(handArea, "hand area must render").not.toBeNull();

  // 1. Side by side, not stacked: the hand area starts to the RIGHT of the deck
  //    column (its left edge is past the deck column's right edge) and the two
  //    overlap vertically (they share the same horizontal band).
  expect(
    handArea.x,
    "hand area should begin to the right of the deck column",
  ).toBeGreaterThanOrEqual(deckCol.x + deckCol.width - 2);
  const verticalOverlap =
    Math.min(deckCol.y + deckCol.height, handArea.y + handArea.height) -
    Math.max(deckCol.y, handArea.y);
  expect(
    verticalOverlap,
    "deck column and hand area should share a row (overlap vertically)",
  ).toBeGreaterThan(20);

  // 2. The hand cards are to the right of the deck + discard pile specifically.
  expect(
    handCards.x,
    "the hand cards should sit right of the deck/discard pile",
  ).toBeGreaterThan(deckPile.x + deckPile.width - 2);

  // 3. Enlarged cards: each hand card image is wider than the old 92px tray card.
  const cardWidth = (await page
    .locator(".adventureHandCard .handCardImage")
    .first()
    .boundingBox())!.width;
  expect(
    cardWidth,
    "hand cards should be enlarged beyond the old 92px",
  ).toBeGreaterThan(110);

  // 4. The permanent (with its effect text) sits in the left column, BELOW the
  //    deck/discard pile — clearly visible alongside the player's cards.
  const permanent = (await page.locator(".permanentSlot").boundingBox())!;
  expect(
    permanent.y,
    "the permanent should sit below the deck/discard pile",
  ).toBeGreaterThan(deckPile.y);
  expect(await page.locator(".permanentMeta small").textContent()).toContain(
    "valuables",
  );
});
