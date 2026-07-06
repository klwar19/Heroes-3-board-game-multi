import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ART_LESS_PROCLAMATIONS,
  ART_PENDING_PROCLAMATIONS,
  ASTROLOGERS_EXPANSIONS,
  ASTROLOGERS_NOT_IMPLEMENTED,
  DISABLED_ASTROLOGERS_CARDS,
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
  NEUTRAL_DRAW_SWAP: true,
  EMPOWER_STATISTIC_CHOICE: true,
  REMOVE_CARDS_CHOICE: true,
  PAID_EMPOWER_PER_TURN: true,
  GRANT_WAR_MACHINE_CHOICE: true,
  WAR_MACHINE_BUFF: true,
  EMPOWER_PER_DISCARD: true,
  RECRUIT_NEUTRAL_DRAW: true,
  RECRUIT_FACTION_FREE: true,
  WAR_MACHINE_DISCOUNT_OFFER: true,
  REMOVE_PERMANENT_FOR_GOLD: true,
  PVP_ATTACK_BAN: true,
  SPELL_SEARCH_WIDEN: true,
  COMBAT_WIN_RESOURCE_DIE: true,
  NEUTRAL_DIFFICULTY_LOWER: true,
  NEUTRAL_REDRAW_ALL: true,
  SEA_CONTINUE_AFTER_EMBARK: true,
  FREE_SPELL_BOOK: true
} satisfies Record<AstrologersEffect["type"], true>;

// Exhaustive public index from https://en.homm3bg.wiki/astrologers_proclaim/.
const WIKI_ASTROLOGERS_CARD_NAMES = [
  "Ammo Cart",
  "Annoying Lizard",
  "Battalion's Stallion",
  "Big Cleanup",
  "Blue Sky",
  "Charlie and his Circus",
  "Crag Hack",
  "Crazy Wizard",
  "Dancing Imp",
  "Dead Silence",
  "Destruction",
  "Disruption",
  "Elementals",
  "Explorers",
  "Fancy Pixie",
  "Fluffy Rabbit",
  "Forty Thieves",
  "Friendly Beaver",
  "Gold Dragon",
  "Greedy Dragon",
  "Grim Warlock",
  "Groovy Satyr",
  "Hero",
  "Isra's Friends",
  "Judge Dread",
  "Mages",
  "Magic Tortoise",
  "McGiver",
  "Merry Leprechaun",
  "Multilingual Bron",
  "Offense",
  "Pirates",
  "Plane Between Planes",
  "Plastic Tray",
  "Profuse Growth",
  "Restart",
  "Rulebook",
  "Sanctuary",
  "Scorched Ground",
  "Society",
  "Spells",
  "Swift Weasel",
  "Terrible Plague",
  "Unexpected Reinforcements",
  "Wandering Merchant",
  "Whirlpool",
  "White Raven",
  "Wild Debauchery",
  "Wind"
] as const;

const ASSETS_DIR = join(process.cwd(), "public", "assets");

describe("astrologers deck data integrity", () => {
  it("deals exactly the defined cards minus the temporarily disabled ones", () => {
    expect(new Set([...astrologersDeckCardIds, ...DISABLED_ASTROLOGERS_CARDS])).toEqual(
      new Set(Object.keys(astrologersCardDefinitions))
    );
  });

  it("never deals a disabled proclamation, but keeps its definition for re-enabling", () => {
    const dealt = new Set(astrologersDeckCardIds);
    for (const id of DISABLED_ASTROLOGERS_CARDS) {
      expect(dealt.has(id), `${id} is disabled and must NOT be in the live deck`).toBe(false);
      expect(astrologersCardDefinitions[id], `${id} keeps its definition`).toBeDefined();
    }
  });

  it("disables Friendly Beaver for now", () => {
    expect(DISABLED_ASTROLOGERS_CARDS.has("astrologers.friendly_beaver")).toBe(true);
    expect(astrologersDeckCardIds).not.toContain("astrologers.friendly_beaver");
  });

  it("ships a real local card scan for every proclamation (or declares it art-less / art-pending)", () => {
    for (const [id, card] of Object.entries(astrologersCardDefinitions)) {
      if (ART_LESS_PROCLAMATIONS.has(id) || ART_PENDING_PROCLAMATIONS.has(id)) {
        // A card with no local front scan — either the fan wiki publishes none
        // (art-less) or the scan is not fetched yet (art-pending): it must carry
        // an empty image (so the UI uses its honest text card-face), never a
        // faked scan. The effect is still fully engine-wired + tested.
        expect(card.image, `${id} should have an empty image`).toBe("");
        continue;
      }
      expect(card.image, `${id} image path`).toMatch(/^\/assets\/astrologers_proclaim-[a-z0-9_]+\.webp$/);
      const onDisk = join(ASSETS_DIR, card.image.replace("/assets/", ""));
      expect(existsSync(onDisk), `${id} scan missing at ${card.image}`).toBe(true);
    }
  });

  it("only declares dealt cards as art-less / art-pending, and never both", () => {
    const dealt = new Set(astrologersDeckCardIds);
    for (const id of ART_LESS_PROCLAMATIONS) {
      expect(dealt.has(id), `${id} is declared art-less but is not in the deck`).toBe(true);
      expect(ART_PENDING_PROCLAMATIONS.has(id), `${id} cannot be both art-less and art-pending`).toBe(false);
    }
    for (const id of ART_PENDING_PROCLAMATIONS) {
      expect(dealt.has(id), `${id} is declared art-pending but is not in the deck`).toBe(true);
    }
  });

  it("gives every card real, printed text and a known expansion", () => {
    for (const [id, card] of Object.entries(astrologersCardDefinitions)) {
      expect(card.text.trim().length, `${id} text`).toBeGreaterThan(0);
      expect(card.name.trim().length, `${id} name`).toBeGreaterThan(0);
      expect(ASTROLOGERS_EXPANSIONS).toContain(card.expansion);
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

  it("accounts for every proclamation listed on the wiki index", () => {
    const accountedFor = new Set([
      ...Object.values(astrologersCardDefinitions).map((card) => card.name),
      ...ASTROLOGERS_NOT_IMPLEMENTED.map((entry) => entry.name)
    ]);
    expect(accountedFor).toEqual(new Set(WIKI_ASTROLOGERS_CARD_NAMES));
  });
});
