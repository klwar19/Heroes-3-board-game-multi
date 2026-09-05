import { describe, expect, it } from "vitest";
import { mediaFileInfo } from "@/lib/media-manifest";
import {
  RESOURCE_ICONS,
  COMBAT_TOKEN_IMAGES,
  STAT_SYMBOL_ICONS,
  SKILL_ICONS,
  DESIGNER_UI_ICONS,
  SECRET_FEATURE_ICONS
} from "@/data/assets/homm-assets";
import { SECRET_TILE_FEATURES } from "@/engine";
import { CARD_BACK_IMAGES, deckBacks } from "@/data/decks";
import { TOWN_TOKEN_ICONS } from "@/data/towns/boards";

// Every asset below is downloaded LOCALLY and referenced only by its /assets
// path — this test fails if a wiring is reverted to a placeholder or a file is
// missing, and it pins the real board-game art from github.com/Heegu-sama/Homm3BG.
function assertRealArt(assetPath: string, minBytes = 1500) {
  expect(assetPath.startsWith("/assets/"), `${assetPath} must be a local /assets path`).toBe(true);
  const info = mediaFileInfo(assetPath);
  expect(info, `${assetPath} must be published — run npm run media:publish`).toBeDefined();
  expect(info!.bytes, `${assetPath} must contain real art`).toBeGreaterThan(minBytes);
}

describe("board-game resource icons", () => {
  it("wires the three board-game resources to real local glyph art (not the old .gif)", () => {
    expect(RESOURCE_ICONS.gold).toBe("/assets/icons/resource-gold.webp");
    expect(RESOURCE_ICONS.buildingMaterials).toBe("/assets/glyphs/building_materials.svg");
    expect(RESOURCE_ICONS.valuables).toBe("/assets/icons/resource-valuables.webp");
    assertRealArt(RESOURCE_ICONS.gold);
    assertRealArt(RESOURCE_ICONS.buildingMaterials, 1_000);
    assertRealArt(RESOURCE_ICONS.valuables);
  });
});

describe("combat token art", () => {
  it("maps every engine combat-token kind to a real token disc", () => {
    // These four are the engine's CombatTokenKind union — board.tsx draws each.
    for (const kind of ["attack", "weakness", "corrosion", "paralysis"] as const) {
      assertRealArt(COMBAT_TOKEN_IMAGES[kind]);
    }
    // The extra printed tokens are staged for later use.
    assertRealArt(COMBAT_TOKEN_IMAGES.damage);
    assertRealArt(COMBAT_TOKEN_IMAGES.defense);
    // attack vs weakness must be distinct discs (buff vs debuff), never the same file.
    expect(COMBAT_TOKEN_IMAGES.attack).not.toBe(COMBAT_TOKEN_IMAGES.weakness);
  });
});

describe("stat / board symbols", () => {
  it("ships every registered stat symbol", () => {
    for (const path of Object.values(STAT_SYMBOL_ICONS)) {
      assertRealArt(path);
    }
  });
});

describe("main-menu skill emblems", () => {
  it("ships exactly the nine skill emblems wired to menu buttons", () => {
    const values = Object.values(SKILL_ICONS);
    expect(values.length).toBe(9);
    expect(new Set(values).size).toBe(9); // one distinct emblem per button
    for (const path of values) {
      assertRealArt(path);
    }
  });
});

describe("map designer UI icons", () => {
  it("ships toolbar medallions and Homm3BG mode glyphs on disk", () => {
    for (const path of Object.values(DESIGNER_UI_ICONS)) {
      // Glyphs (svg) can be small; medallions (webp) are larger.
      assertRealArt(path, path.endsWith(".svg") ? 200 : 1200);
    }
  });

  it("wires every secret landmark to real board-game art (not emoji)", () => {
    for (const feature of SECRET_TILE_FEATURES) {
      expect(feature.iconSrc, `${feature.id} needs iconSrc`).toMatch(/^\/assets\//);
      expect(feature.iconSrc).toBe(SECRET_FEATURE_ICONS[feature.id]);
      assertRealArt(feature.iconSrc, feature.iconSrc.endsWith(".svg") ? 200 : 1200);
      // No emoji in the icon field — plain short label only.
      expect(feature.icon).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});

describe("building Spell Book token", () => {
  it("uses the real spellbook token art", () => {
    assertRealArt(TOWN_TOKEN_ICONS.spellBook);
  });
});

describe("deck card backs", () => {
  it("ships the real deck backs, including a distinct Events back (no longer the M&M stand-in)", () => {
    assertRealArt(CARD_BACK_IMAGES.mm);
    assertRealArt(CARD_BACK_IMAGES.astrologers);
    assertRealArt(CARD_BACK_IMAGES.neutral);
    assertRealArt(CARD_BACK_IMAGES.events);
    expect(deckBacks.events.image).toBe(CARD_BACK_IMAGES.events);
    expect(CARD_BACK_IMAGES.events).not.toBe(CARD_BACK_IMAGES.mm);
  });
});
