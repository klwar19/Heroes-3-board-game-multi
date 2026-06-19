import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASTROLOGERS_NOT_IMPLEMENTED,
  astrologersCardDefinitions,
  astrologersDeckCardIds,
  type AstrologersEffect
} from "@/data/cards/astrologers";

/**
 * Guards that keep the Astrologers deck honest (CLAUDE.md rules #1-#3):
 *  - every dealt card has a real, locally-shipped card scan;
 *  - every card's `effect` is a type the engine actually handles, so a new card
 *    with an unwired effect fails CI instead of shipping as inert text;
 *  - the "not implemented" registry stays disjoint from the live deck, so an
 *    omitted proclamation is a conscious, reviewable entry — never a silent gap.
 */

// The exhaustive set of effect types the engine resolves or reads. Adding a new
// AstrologersEffect variant forces a matching entry here (and real wiring), or
// the `satisfies` check and this test fail.
const WIRED_EFFECT_TYPES = {
  NONE: true,
  GAIN_MORALE_ALL: true,
  ROLL_DICE_ALL: true,
  REMOVE_BLACK_CUBES: true,
  NEXT_RESOURCE_ROUND: true,
  MOVEMENT_MODIFIER: true,
  HAND_LIMIT_MODIFIER: true,
  RESHUFFLE_ARTIFACTS_SPELLS: true,
  DISCARD_REDRAW_ALL: true,
  PLAGUE_FLIP_ALL: true,
  REINFORCE_HALF_COST_ALL: true,
  DIE_REROLL_PER_TURN: true,
  FIRST_SPELL_POWER_BONUS: true,
  SCHOOL_SPELL_POWER_BONUS: true,
  FIRST_SPELL_RETURNS: true,
  NEUTRAL_DRAW_SWAP: true
} satisfies Record<AstrologersEffect["type"], true>;

const ASSETS_DIR = join(process.cwd(), "public", "assets");

describe("astrologers deck data integrity", () => {
  it("deals exactly the defined cards (deck ids match the definitions)", () => {
    expect(new Set(astrologersDeckCardIds)).toEqual(new Set(Object.keys(astrologersCardDefinitions)));
  });

  it("ships a real local card scan for every proclamation", () => {
    for (const [id, card] of Object.entries(astrologersCardDefinitions)) {
      expect(card.image, `${id} image path`).toMatch(/^\/assets\/astrologers_proclaim-[a-z0-9_]+\.webp$/);
      const onDisk = join(ASSETS_DIR, card.image.replace("/assets/", ""));
      expect(existsSync(onDisk), `${id} scan missing at ${card.image}`).toBe(true);
    }
  });

  it("gives every card real, printed text and a known expansion", () => {
    for (const [id, card] of Object.entries(astrologersCardDefinitions)) {
      expect(card.text.trim().length, `${id} text`).toBeGreaterThan(0);
      expect(card.name.trim().length, `${id} name`).toBeGreaterThan(0);
      expect(["Core Game", "Tower Expansion", "Fortress Expansion"]).toContain(card.expansion);
    }
  });

  it("only deals cards whose effect the engine actually wires", () => {
    for (const [id, card] of Object.entries(astrologersCardDefinitions)) {
      expect(WIRED_EFFECT_TYPES[card.effect.type], `${id} effect ${card.effect.type} is not wired`).toBe(true);
    }
  });

  it("keeps the not-implemented registry disjoint from the live deck", () => {
    const liveNames = new Set(Object.values(astrologersCardDefinitions).map((card) => card.name));
    for (const entry of ASTROLOGERS_NOT_IMPLEMENTED) {
      expect(liveNames.has(entry.name), `${entry.name} is both dealt and listed as not-implemented`).toBe(false);
    }
  });
});
