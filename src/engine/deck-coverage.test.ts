import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";
import { STARTING_ONLY_SPELLS, spellDeckBinhBasic, spellDeckBinhExpert, spellDeckLegacy } from "@/data/cards/spells";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import { moraleCardPolarity } from "@/data/cards/morale";
import { coreHeroDefinitions } from "@/data/factions/core";

/**
 * Every fully-implemented Artifact, Spell and Ability must be reachable in a
 * game — i.e. present in at least one shared draw deck (legacy or BINH).
 * Statistics (built into hero starting decks), hero specialties (dealt per
 * hero), war machines (bought at the Factory/Trading Post), Pandora cards
 * (their own deck), morale cards (their own positive/negative morale decks,
 * gated behind the optional Morale Cards rule) and starting-only spells (Magic
 * Arrow — gifted at setup, never shuffled into a deck) are acquired through
 * other channels and excluded.
 *
 * This guards against the "implemented but orphaned" trap: a card whose effect
 * runs and is tested, yet can never be drawn because nobody added it to a deck.
 */
describe("deck coverage", () => {
  const decked = new Set<string>([
    ...artifactDeckLegacy,
    ...artifactDeckBinhMinor,
    ...artifactDeckBinhMajor,
    ...artifactDeckBinhRelic,
    ...spellDeckLegacy,
    ...spellDeckBinhBasic,
    ...spellDeckBinhExpert,
    ...abilityDeckLegacy,
    ...abilityDeckBinh
  ]);

  const DECK_KINDS = new Set(["artifact", "spell", "ability"]);
  const startingOnly = new Set(STARTING_ONLY_SPELLS);

  it("places every implemented artifact, spell and ability in a draw deck", () => {
    const orphaned = Object.entries(cardLibrary)
      .filter(([, card]) => card.implementationStatus === "implemented" && DECK_KINDS.has(card.kind))
      .map(([id]) => id)
      .filter((id) => !decked.has(id) && !startingOnly.has(id) && moraleCardPolarity(id) === null)
      .sort();

    expect(orphaned).toEqual([]);
  });

  it("references only known cards from the deck lists", () => {
    const unknown = [...decked].filter((id) => !cardLibrary[id]).sort();
    expect(unknown).toEqual([]);
  });

  it("never deals a not-implemented card into a deck", () => {
    const inert = [...decked]
      .filter((id) => cardLibrary[id] && cardLibrary[id].implementationStatus !== "implemented")
      .sort();
    expect(inert).toEqual([]);
  });

  /**
   * The legacy and BINH deck lists are hand-maintained in parallel, which let
   * them drift: BINH was missing five expansion spells while legacy was missing
   * a pile of BINH artifacts/abilities, and the union-only check above never
   * noticed. This guards EACH variant individually: every implemented card must
   * sit in the legacy deck of its kind AND in the BINH deck its own tier
   * metadata (spellLevel / artifactTier) points at — so the two can never fall
   * out of sync again, and the per-card tier and the deck it lives in must agree.
   */
  it("places every implemented card in the legacy deck and its matching BINH tier deck", () => {
    const legacy: Record<"spell" | "artifact" | "ability", Set<string>> = {
      spell: new Set(spellDeckLegacy),
      artifact: new Set(artifactDeckLegacy),
      ability: new Set(abilityDeckLegacy)
    };
    const binhSpell: Record<string, Set<string>> = {
      basic: new Set(spellDeckBinhBasic),
      expert: new Set(spellDeckBinhExpert)
    };
    const binhArtifact: Record<string, Set<string>> = {
      minor: new Set(artifactDeckBinhMinor),
      major: new Set(artifactDeckBinhMajor),
      relic: new Set(artifactDeckBinhRelic)
    };
    const binhAbility = new Set(abilityDeckBinh);

    const problems: string[] = [];
    for (const card of Object.values(cardLibrary)) {
      if (
        card.implementationStatus !== "implemented" ||
        !DECK_KINDS.has(card.kind) ||
        startingOnly.has(card.id) ||
        moraleCardPolarity(card.id) !== null
      ) {
        continue;
      }
      const kind = card.kind as "spell" | "artifact" | "ability";
      if (!legacy[kind].has(card.id)) {
        problems.push(`${card.id}: missing from the legacy ${kind} deck`);
      }
      if (card.kind === "spell") {
        if (!card.spellLevel) {
          problems.push(`${card.id}: spell has no spellLevel to tier it`);
        } else if (!binhSpell[card.spellLevel].has(card.id)) {
          problems.push(`${card.id}: missing from the BINH ${card.spellLevel} spell deck`);
        }
      } else if (card.kind === "artifact") {
        if (!card.artifactTier) {
          problems.push(`${card.id}: artifact has no artifactTier to tier it`);
        } else if (!binhArtifact[card.artifactTier].has(card.id)) {
          problems.push(`${card.id}: missing from the BINH ${card.artifactTier} artifact deck`);
        }
      } else if (!binhAbility.has(card.id)) {
        problems.push(`${card.id}: missing from the BINH ability deck`);
      }
    }

    expect(problems.sort()).toEqual([]);
  });
});

/**
 * A hero's starting Ability (Diplomacy, Logistics, Necromancy…) is NOT exclusive
 * to that hero: the same Ability lives in the shared Ability deck, so any player
 * can draw their own copy of it during the game. This guards that invariant —
 * every hero's `startingAbilityCardId` must resolve to an implemented Ability
 * card that is present in BOTH shared Ability decks (legacy + BINH). Without it,
 * a future hero could ship a starting skill that nobody else can ever acquire
 * (or, worse, a starting card with no library entry at all).
 */
describe("hero starting abilities are also in the shared deck pool", () => {
  const legacy = new Set(abilityDeckLegacy);
  const binh = new Set(abilityDeckBinh);
  const heroes = Object.entries(coreHeroDefinitions);

  it("has at least one hero whose starting ability is Diplomacy (the reported case)", () => {
    const diplomats = heroes.filter(([, hero]) => hero.startingAbilityCardId === "ability.diplomacy");
    expect(diplomats.length).toBeGreaterThan(0);
    expect(legacy.has("ability.diplomacy")).toBe(true);
    expect(binh.has("ability.diplomacy")).toBe(true);
  });

  it("places every hero's starting ability in both shared ability decks as an implemented card", () => {
    const problems: string[] = [];
    for (const [heroId, hero] of heroes) {
      const abilityId = hero.startingAbilityCardId;
      const card = cardLibrary[abilityId];
      if (!card) {
        problems.push(`${heroId}: starting ability ${abilityId} has no card library entry`);
        continue;
      }
      if (card.kind !== "ability") {
        problems.push(`${heroId}: starting ability ${abilityId} is a ${card.kind}, not an ability`);
      }
      if (card.implementationStatus !== "implemented") {
        problems.push(`${heroId}: starting ability ${abilityId} is ${card.implementationStatus}`);
      }
      if (!legacy.has(abilityId)) {
        problems.push(`${heroId}: starting ability ${abilityId} is missing from the legacy ability deck`);
      }
      if (!binh.has(abilityId)) {
        problems.push(`${heroId}: starting ability ${abilityId} is missing from the BINH ability deck`);
      }
    }

    expect(problems.sort()).toEqual([]);
  });
});
