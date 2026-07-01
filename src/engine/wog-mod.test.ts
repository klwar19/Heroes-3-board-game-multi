import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { isNormallyRecruitableNeutralUnit, WOG_UNIT_IDS, WOG_UNIT_IDS_BY_TIER } from "@/data/wog";
import { unitSoundKey } from "@/data/unit-sounds";
import { applyAction } from "./reducer";
import { createAdventureGameState, createAdventureLobbyState } from "./adventure-setup";
import { DEFAULT_WOG_OPTIONS } from "./state";
import { NEUTRAL_DECK_IDS } from "./adventure";

describe("WOG BINH setup module", () => {
  it("starts off and cannot remain enabled after switching to Legacy", () => {
    const lobby = createAdventureLobbyState({ seed: "wog-lobby" });
    expect(lobby.ruleset).toBe("binh");
    expect(lobby.setupLobby?.options.wog).toEqual(DEFAULT_WOG_OPTIONS);

    const enabled = applyAction(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, commanders: true } }
    });
    expect(enabled.errors).toEqual([]);
    expect(enabled.state.wog?.enabled).toBe(true);

    const legacy = applyAction(enabled.state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { ruleset: "legacy" }
    });
    expect(legacy.errors).toEqual([]);
    expect(legacy.state.wog?.enabled).toBe(false);
    expect(legacy.state.setupLobby?.options.wog?.enabled).toBe(false);
  });

  it("adds the WOG roster to matching Neutral decks only when New creatures is enabled", () => {
    const enabled = createAdventureGameState({
      seed: "wog-decks-on",
      ruleset: "binh",
      wog: { enabled: true, newCreatures: true },
      rollFirstPlayer: false
    });
    for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
      const cards = enabled.decks[NEUTRAL_DECK_IDS[tier]].drawPile;
      expect(cards).toEqual(expect.arrayContaining([...WOG_UNIT_IDS_BY_TIER[tier]]));
    }

    const disabled = createAdventureGameState({
      seed: "wog-decks-off",
      ruleset: "binh",
      wog: { enabled: true, newCreatures: false },
      rollFirstPlayer: false
    });
    const disabledCards = Object.values(NEUTRAL_DECK_IDS).flatMap((deckId) => disabled.decks[deckId].drawPile);
    expect(disabledCards.filter((id) => id.startsWith("wog."))).toEqual([]);

    const legacy = createAdventureGameState({
      seed: "wog-decks-legacy",
      ruleset: "legacy",
      wog: { enabled: true, newCreatures: true },
      rollFirstPlayer: false
    });
    expect(legacy.wog?.enabled).toBe(false);
    const legacyCards = Object.values(NEUTRAL_DECK_IDS).flatMap((deckId) => legacy.decks[deckId].drawPile);
    expect(legacyCards.filter((id) => id.startsWith("wog."))).toEqual([]);
  });
});

describe("WOG neutral roster data", () => {
  it("ships all 15 supplied creatures with a neutral card face", () => {
    expect(WOG_UNIT_IDS).toHaveLength(15);
    for (const unitId of WOG_UNIT_IDS) {
      const unit = coreUnitDefinitions[unitId];
      expect(unit, unitId).toBeTruthy();
      expect(unit.faction).toBe("neutral");
      expect(unit.neutral?.cardImage).toMatch(/^\/assets\/units-neutral-(bronze|silver|golden|azure)-wog_/);
    }
  });

  it("wires every printed WOG ability to an implemented engine effect", () => {
    for (const unitId of WOG_UNIT_IDS) {
      for (const abilityId of coreUnitDefinitions[unitId].neutral?.abilities ?? []) {
        expect(unitAbilities[abilityId], `${unitId}: ${abilityId}`).toBeTruthy();
        expect(unitAbilities[abilityId].implementationStatus, `${unitId}: ${abilityId}`).toBe("implemented");
        expect(unitAbilities[abilityId].effect, `${unitId}: ${abilityId}`).toBeTruthy();
      }
    }
  });

  it("keeps the supplied A/D/HP/I statistics and costs", () => {
    const expected: Record<string, [number, number, number, number, number | undefined]> = {
      "wog.ghost": [3, 0, 4, 7, 6],
      "wog.air_messenger": [3, 1, 5, 10, 8],
      "wog.earth_messenger": [3, 2, 4, 5, 8],
      "wog.fire_messenger": [4, 1, 5, 7, 8],
      "wog.water_messenger": [3, 1, 6, 6, 8],
      "wog.war_zealot": [4, 1, 4, 6, 13],
      "wog.arctic_sharpshooter": [4, 1, 5, 8, 15],
      "wog.lava_sharpshooter": [4, 0, 6, 9, 15],
      "wog.sylvan_centaur": [3, 0, 4, 8, 12],
      "wog.werewolf": [3, 1, 5, 7, 15],
      "wog.nightmare": [5, 2, 7, 11, 25],
      "wog.hell_steed": [5, 1, 8, 9, 22],
      "wog.gorynych": [5, 2, 7, 8, 25],
      "wog.santa_gremlin": [2, 0, 4, 5, 5],
      "wog.dracolich": [7, 2, 10, 16, 45]
    };
    for (const [unitId, stats] of Object.entries(expected)) {
      const side = coreUnitDefinitions[unitId].neutral!;
      expect([side.attack, side.defense, side.health, side.initiative, side.cost.gold], unitId).toEqual(stats);
    }
  });

  it("maps requested creature voices and special movement/shooting clips", () => {
    expect(unitSoundKey("wog.ghost", "attack")).toBe("units/wraith-attack");
    expect(unitSoundKey("wog.air_messenger", "move")).toBe("units/stone-golem-move");
    expect(unitSoundKey("wog.sylvan_centaur", "shoot")).toBe("units/centaur-shoot");
    expect(unitSoundKey("wog.gorynych", "move")).toBe("units/black-dragon-move");
    expect(unitSoundKey("wog.dracolich", "shoot")).toBe("units/lich-shoot");
  });

  it("allows Dracolich to be encountered and recruited at the Azure Dragon cost", () => {
    expect(WOG_UNIT_IDS_BY_TIER.azure).toContain("wog.dracolich");
    expect(isNormallyRecruitableNeutralUnit("wog.dracolich")).toBe(true);
    expect(isNormallyRecruitableNeutralUnit("wog.gorynych")).toBe(true);
    expect(coreUnitDefinitions["wog.dracolich"].neutral?.cost).toEqual({ gold: 45, valuables: 2 });
  });

  it("places Gorynych in the gold WOG deck, not the Azure deck", () => {
    expect(WOG_UNIT_IDS_BY_TIER.gold).toContain("wog.gorynych");
    expect(WOG_UNIT_IDS_BY_TIER.azure).not.toContain("wog.gorynych");
    expect(coreUnitDefinitions["wog.gorynych"].tier).toBe("gold");
  });

  it("gives Dracolich the Devil-style anywhere movement", () => {
    expect(coreUnitDefinitions["wog.dracolich"].neutral?.abilities).toContain("teleport-move");
    expect(unitAbilities["teleport-move"].effect).toEqual({ type: "MOVE_ANYWHERE" });
  });

  it("gives Dracolich a Lich-style spread attack at Attack 4", () => {
    expect(coreUnitDefinitions["wog.dracolich"].neutral?.abilities).toContain("wog-dracolich-death-cloud");
    expect(unitAbilities["wog-dracolich-death-cloud"].effect).toEqual({
      type: "SECOND_ATTACK_ADJACENT_TO_TARGET",
      baseAttack: 4
    });
  });
});
