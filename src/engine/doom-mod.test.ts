import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasMediaFile, localMediaPath, mediaFileInfo } from "@/lib/media-manifest";
import { DOOM_UNIT_IDS, DOOM_UNIT_IDS_BY_TIER, doomUnitDefinitions } from "@/data/doom";
import { WOG_UNIT_IDS } from "@/data/wog";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { createAdventureGameState } from "./adventure-setup";
import { NEUTRAL_DECK_IDS } from "./adventure";
import { DEFAULT_WOG_OPTIONS } from "./state";


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
      expect(hasMediaFile(image!), `${id}: ${image} is not published (npm run media:publish)`).toBe(true);
      const info = mediaFileInfo(image!)!;
      expect(info.bytes, id).toBeGreaterThan(40_000);
      expect(info.bytes, id).toBeLessThan(220_000);
      const file = localMediaPath(image!);
      if (!file) continue; // media not pulled on this checkout — the RIFF/WEBP header needs the bytes
      const header = readFileSync(file).subarray(0, 12);
      expect(header.subarray(0, 4).toString("ascii"), id).toBe("RIFF");
      expect(header.subarray(8, 12).toString("ascii"), id).toBe("WEBP");
    }
  });

  it("pins the revised Doom stats, costs, types, and ability assignments", () => {
    const expected: Record<string, { attack: number; defense: number; health: number; initiative: number; abilities: string[]; cost: Record<string, number> }> = {
      "doom.demon": { attack: 2, defense: 1, health: 4, initiative: 7, abilities: ["unlimited-retaliation", "doom-demon-retaliation-attack"], cost: { gold: 7 } },
      "doom.former_human": { attack: 2, defense: 0, health: 3, initiative: 4, abilities: [], cost: { gold: 4 } },
      "doom.former_human_sergeant": { attack: 2, defense: 1, health: 3, initiative: 5, abilities: ["doom-former-human-sergeant-double-roll"], cost: { gold: 6 } },
      "doom.imp": { attack: 2, defense: 0, health: 4, initiative: 7, abilities: ["ranged-extra-shot-on-low-roll", "ignore-combat-penalties"], cost: { gold: 5 } },
      "doom.cacodemon": { attack: 3, defense: 1, health: 5, initiative: 9, abilities: ["doom-cacodemon-poison"], cost: { gold: 11 } },
      "doom.hell_knight": { attack: 3, defense: 2, health: 6, initiative: 6, abilities: ["reduce-spell-damage-1"], cost: { gold: 14 } },
      "doom.arachnotron": { attack: 3, defense: 0, health: 6, initiative: 7, abilities: ["doom-arachnotron-triple-strike"], cost: { gold: 15 } },
      "doom.former_commando": { attack: 3, defense: 1, health: 4, initiative: 6, abilities: ["double-attack"], cost: { gold: 13 } },
      "doom.baron_of_hell": { attack: 5, defense: 2, health: 8, initiative: 7, abilities: ["doom-baron-damage-cap"], cost: { gold: 29 } },
      "doom.revenant": { attack: 5, defense: 1, health: 7, initiative: 10, abilities: ["doom-revenant-pre-attack-damage"], cost: { gold: 20 } },
      "doom.mancubus": { attack: 5, defense: 1, health: 7, initiative: 7, abilities: ["magog-fireball-splash", "doom-mancubus-retaliation-advantage"], cost: { gold: 22 } },
      "doom.pain_elemental": { attack: 4, defense: 1, health: 6, initiative: 7, abilities: ["doom-pain-elemental-summon-lost-soul"], cost: { gold: 20 } },
      "doom.arch_vile": { attack: 6, defense: 1, health: 8, initiative: 12, abilities: ["archangel-lethal-save"], cost: { gold: 30 } },
      "doom.spider_mastermind": { attack: 7, defense: 2, health: 10, initiative: 11, abilities: ["doom-spider-mastermind-adjacent-strike", "immune-specialty-damage"], cost: { gold: 38, valuables: 2 } },
      "doom.cyberdemon": { attack: 7, defense: 3, health: 10, initiative: 10, abilities: ["magog-fireball-splash", "reduce-spell-damage-3"], cost: { gold: 42, valuables: 2 } }
    };

    for (const [id, values] of Object.entries(expected)) {
      const def = doomUnitDefinitions[id as keyof typeof doomUnitDefinitions];
      expect(def.neutral, id).toMatchObject(values);
    }
    expect(doomUnitDefinitions["doom.cacodemon"].type).toBe("flying");
  });

  it("adds Doom guards through the ANIME gate only; WOG new-creatures adds its OWN roster, never Doom", () => {
    // WOG "new creatures" shuffles in the WOG roster — but NOT the Doom slice,
    // which now belongs to the anime mod alone. (The WOG PvE modules keep their
    // WOG special neutrals; only Doom moved.)
    const on = createAdventureGameState({
      seed: "doom-decks-on",
      ruleset: "binh",
      wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, newCreatures: true },
      rollFirstPlayer: false
    });
    const cardsOn = Object.values(NEUTRAL_DECK_IDS).flatMap((deckId) => on.decks[deckId].drawPile);
    // The WOG roster IS present…
    expect(cardsOn).toEqual(expect.arrayContaining(WOG_UNIT_IDS));
    for (const id of WOG_UNIT_IDS) {
      expect(cardsOn.filter((cardId) => cardId === id), id).toHaveLength(1);
    }
    // …but the Doom slice is NOT (anime-only now).
    expect(cardsOn.filter((id) => id.startsWith("doom."))).toEqual([]);

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
    for (const id of DOOM_UNIT_IDS) {
      expect(animeCardsOn.filter((cardId) => cardId === id), id).toHaveLength(1);
    }

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
