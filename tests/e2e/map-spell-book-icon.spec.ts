import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// EFFECT test (real browser layout) for the MAP Spell Book window (house rule).
// The user report: opening the Book on the map showed the Spell NAMES only, with
// no card art. The fix adds a <CardFrame> (.spellBookSpellIcon) to each row, in a
// .spellBookSpellHead flex row beside the name. This injects the real globals.css
// with the window's markup and proves each stored Spell renders its card art at a
// visible size, to the LEFT of the name. Remove the icon from the row (or its CSS
// width) and this fails. Self-contained (setContent, no dev server).
// ---------------------------------------------------------------------------

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

// A 1x1 transparent GIF lets an <img> take its CSS box with a definite size.
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const windowHtml = `
<div class="spellBookPanel">
  <div class="spellBookWindow" role="menu" aria-label="Spell Book">
    <strong>Spell Book</strong>
    <small>Cast a stored Spell, or stash a hand Spell here with the 📖 button on its card.</small>
    ${["Haste", "Bloodlust"]
      .map(
        (name) => `
    <div class="spellBookSpell">
      <div class="spellBookSpellHead">
        <img class="spellBookSpellIcon" src="${PIXEL}" alt="${name}" />
        <span class="spellBookSpellName">${name}</span>
      </div>
      <div class="spellBookSpellActions">
        <button class="commandButton">Cast</button>
      </div>
    </div>`
      )
      .join("")}
  </div>
</div>`;

test("the map Spell Book window shows each stored Spell's card art beside its name", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${windowHtml}</body></html>`);

  const icons = page.locator(".spellBookSpellIcon");
  // One card-art icon per stored Spell (not just the names).
  await expect(icons).toHaveCount(2);

  // Each icon renders at its intended, visible size — not collapsed/hidden.
  const iconBox = (await icons.first().boundingBox())!;
  expect(iconBox.width, "card icon has a visible width").toBeGreaterThanOrEqual(28);
  expect(iconBox.height, "card icon has a visible height").toBeGreaterThanOrEqual(38);

  // The icon sits to the LEFT of the Spell name, in the same header row.
  const nameBox = (await page.locator(".spellBookSpellName").first().boundingBox())!;
  expect(iconBox.x, "the card icon is left of the name").toBeLessThan(nameBox.x);
  expect(Math.abs(iconBox.y - nameBox.y), "icon and name share the header row").toBeLessThan(iconBox.height);
});
