import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOOM_UNIT_IDS, DOOM_UNIT_IDS_BY_TIER } from "@/data/doom";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { createAdventureGameState } from "./adventure-setup";
import { NEUTRAL_DECK_IDS } from "./adventure";
import { DEFAULT_WOG_OPTIONS } from "./state";

const publicFile = (assetPath: string) => fileURLToPath(new URL(`../../public${assetPath}`, import.meta.url));

describe("Doom neutral monster slice", () => {
  it("assigns the complete classic monster roster to exact board-game tiers", () => {
    expect(DOOM_UNIT_IDS).toHaveLength(16);
    expect(DOOM_UNIT_IDS_BY_TIER).toEqual({
      bronze: ["doom.demon", "doom.former_human", "doom.former_human_sergeant", "doom.imp", "doom.lost_soul"],
      silver: ["doom.cacodemon", "doom.hell_knight", "doom.arachnotron", "doom.former_commando"],
      gold: ["doom.baron_of_hell", "doom.revenant", "doom.mancubus", "doom.pain_elemental"],
      azure: ["doom.arch_vile", "doom.spider_mastermind", "doom.cyberdemon"]
    });
    expect(DOOM_UNIT_IDS.map((id) => coreUnitDefinitions[id].tier)).toEqual([
      "bronze", "bronze", "bronze", "bronze", "bronze",
      "silver", "silver", "silver", "silver",
      "gold", "gold", "gold", "gold",
      "azure", "azure", "azure"
    ]);
  });

  it("ships playable neutral cards with real compressed WebP faces", () => {
    for (const id of DOOM_UNIT_IDS) {
      const def = coreUnitDefinitions[id];
      const image = def.neutral?.cardImage;
      expect(def.faction, id).toBe("neutral");
      expect(image, id).toMatch(/^\/assets\/doom\/units\/[a-z-]+\.webp$/);
      const file = publicFile(image!);
      expect(existsSync(file), id).toBe(true);
      const header = readFileSync(file).subarray(0, 12);
      expect(header.subarray(0, 4).toString("ascii"), id).toBe("RIFF");
      expect(header.subarray(8, 12).toString("ascii"), id).toBe("WEBP");
      expect(statSync(file).size, id).toBeGreaterThan(40_000);
      expect(statSync(file).size, id).toBeLessThan(220_000);
    }
  });

  it("adds Doom guards through WOG or Anime neutral-creature gates", () => {
    const on = createAdventureGameState({
      seed: "doom-decks-on",
      ruleset: "binh",
      wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newCreatures: true },
      rollFirstPlayer: false
    });
    const cardsOn = Object.values(NEUTRAL_DECK_IDS).flatMap((deckId) => on.decks[deckId].drawPile);
    expect(cardsOn).toEqual(expect.arrayContaining(DOOM_UNIT_IDS));

    const off = createAdventureGameState({
      seed: "doom-decks-off",
      ruleset: "binh",
      wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newCreatures: false },
      rollFirstPlayer: false
    });
    const cardsOff = Object.values(NEUTRAL_DECK_IDS).flatMap((deckId) => off.decks[deckId].drawPile);
    expect(cardsOff.filter((id) => id.startsWith("doom."))).toEqual([]);

    const animeOn = createAdventureGameState({
      seed: "doom-decks-anime",
      ruleset: "binh",
      anime: { enabled: true, doomNeutrals: true },
      rollFirstPlayer: false
    });
    const animeCardsOn = Object.values(NEUTRAL_DECK_IDS).flatMap((deckId) => animeOn.decks[deckId].drawPile);
    expect(animeCardsOn).toEqual(expect.arrayContaining(DOOM_UNIT_IDS));

    const animeNoDoom = createAdventureGameState({
      seed: "doom-decks-anime-no-doom",
      ruleset: "binh",
      anime: { enabled: true, doomNeutrals: false },
      rollFirstPlayer: false
    });
    const animeCardsNoDoom = Object.values(NEUTRAL_DECK_IDS).flatMap((deckId) => animeNoDoom.decks[deckId].drawPile);
    expect(animeCardsNoDoom.filter((id) => id.startsWith("doom."))).toEqual([]);

    const animeOff = createAdventureGameState({
      seed: "doom-decks-anime-off",
      ruleset: "binh",
      anime: { enabled: false, xianxiaNeutrals: false, isekaiNeutrals: false },
      rollFirstPlayer: false
    });
    const animeCardsOff = Object.values(NEUTRAL_DECK_IDS).flatMap((deckId) => animeOff.decks[deckId].drawPile);
    expect(animeCardsOff.filter((id) => id.startsWith("doom.")).length).toBe(0);
  });

  it("uses only engine-backed ability tags", () => {
    for (const id of DOOM_UNIT_IDS) {
      for (const abilityId of coreUnitDefinitions[id].neutral?.abilities ?? []) {
        expect(unitAbilities[abilityId]?.implementationStatus, `${id}: ${abilityId}`).toBe("implemented");
      }
    }
  });
});
