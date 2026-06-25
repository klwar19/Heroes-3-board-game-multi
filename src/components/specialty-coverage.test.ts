import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";
import { SPECIALTY_ICON_BY_HERO, canRenderSpecialtyCard, parseSpecialtyCardId } from "./specialty-card-data";

const PUBLIC = join(process.cwd(), "public");
const assetPath = (url: string) => join(PUBLIC, url.replace(/^\//u, ""));

/** Every `specialty.<slug>.<level>` card id in the library. */
function specialtyCardIds(): string[] {
  return Object.keys(cardLibrary).filter((id) => parseSpecialtyCardId(id));
}

describe("hero specialty card coverage", () => {
  it("no specialty card is a blank placeholder — each has a scan OR renders natively", () => {
    const blanks: string[] = [];
    for (const id of specialtyCardIds()) {
      const hasScan = Boolean((cardLibrary[id] as { assets?: { cardImage?: string } }).assets?.cardImage);
      if (!hasScan && !canRenderSpecialtyCard(id)) {
        blanks.push(id);
      }
    }
    expect(blanks, `these specialties would show a blank placeholder: ${blanks.join(", ")}`).toEqual([]);
  });

  it("every art-less hero is given a faithful specialty symbol, and the file exists", () => {
    const seen = new Set<string>();
    const missingIcon: string[] = [];
    const missingFile: string[] = [];
    for (const id of specialtyCardIds()) {
      const hasScan = Boolean((cardLibrary[id] as { assets?: { cardImage?: string } }).assets?.cardImage);
      if (hasScan) {
        continue;
      }
      const slug = parseSpecialtyCardId(id)!.slug;
      if (seen.has(slug)) {
        continue;
      }
      seen.add(slug);
      const icon = SPECIALTY_ICON_BY_HERO[slug];
      if (!icon) {
        missingIcon.push(slug);
      } else if (!existsSync(assetPath(icon))) {
        missingFile.push(`${slug} -> ${icon}`);
      }
    }
    expect(missingIcon, `art-less heroes with no specialty symbol: ${missingIcon.join(", ")}`).toEqual([]);
    expect(missingFile, `specialty symbols whose file is missing: ${missingFile.join(", ")}`).toEqual([]);
  });

  it("every specialty scan (assets.cardImage) points at a file that exists on disk", () => {
    // A `cardImage` ref to a missing file renders a broken <img>, yet still counts
    // as a "scan" above — that is how Moandor's never-shipped scans slipped through
    // until his cards were made art-less. Guard the whole set against that here.
    const missing: string[] = [];
    for (const id of specialtyCardIds()) {
      const cardImage = (cardLibrary[id] as { assets?: { cardImage?: string } }).assets?.cardImage;
      if (cardImage && !existsSync(assetPath(cardImage))) {
        missing.push(`${id} -> ${cardImage}`);
      }
    }
    expect(missing, `specialty scans whose file is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("every mapped specialty symbol points at a real, known hero and an existing file", () => {
    for (const [slug, icon] of Object.entries(SPECIALTY_ICON_BY_HERO)) {
      expect(coreHeroDefinitions[slug], `unknown hero slug in icon map: ${slug}`).toBeTruthy();
      expect(existsSync(assetPath(icon)), `missing file for ${slug}: ${icon}`).toBe(true);
    }
  });
});
