import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// LEFT: deck + discard + Spell Book
// RIGHT: permanents above hand
const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
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
      <div class="spellBookPanel">
        <button class="spellBookToggle">
          <img class="spellBookIcon" src="${PIXEL}" alt="" />
          <span class="spellBookCount">2</span>
          <small>Spell Book</small>
        </button>
      </div>
    </div>
    <div class="handMain">
      <div class="permanentEffectsPanel">
        <div class="trayBoxHeader"><strong>Permanents &amp; Ongoing</strong></div>
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
  </div>
  <div class="adventureMidRow">
    <div class="leftRail"><div style="height:160px"></div></div>
    <div class="mapColumn"><div class="hexMapWrap"></div></div>
  </div>
</main>`;

test("LEFT deck tools, RIGHT permanents above hand", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${page_html}</body></html>`);

  const deckBox = (await page.locator(".ownDeckColumn").boundingBox())!;
  const permBox = (await page.locator(".permanentEffectsPanel").boundingBox())!;
  const handBox = (await page.locator(".handArea").boundingBox())!;
  const spellBook = (await page.locator(".spellBookToggle").boundingBox())!;

  // Deck box is LEFT of permanents and hand.
  expect(deckBox.x + deckBox.width, "deck left of permanents").toBeLessThanOrEqual(permBox.x + 2);
  expect(deckBox.x + deckBox.width, "deck left of hand").toBeLessThanOrEqual(handBox.x + 2);

  // Permanents ABOVE hand (same right column).
  expect(permBox.y + permBox.height, "permanents above hand").toBeLessThanOrEqual(handBox.y + 2);

  // Spell book in the left deck box.
  expect(spellBook.x, "spell book on the left").toBeLessThan(handBox.x);

  expect(await page.locator(".permanentMeta small").textContent()).toContain("valuables");
});
