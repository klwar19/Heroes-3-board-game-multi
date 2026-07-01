import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { WOG_UNIT_IDS, WOG_UNIT_IDS_BY_TIER } from "@/data/wog";
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

  it("ships every WOG card face as a real, compressed WebP on disk (frame matches tier)", () => {
    const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
    const frameOf: Record<string, string> = { bronze: "bronze", silver: "silver", gold: "golden", azure: "azure" };
    for (const unitId of WOG_UNIT_IDS) {
      const def = coreUnitDefinitions[unitId];
      const cardImage = def.neutral?.cardImage;
      expect(cardImage, unitId).toBeTruthy();
      // The file the card points at must actually exist (a wrong tier/path — e.g.
      // Ghost left pointing at its old silver frame — fails here, not silently).
      expect(cardImage, `${unitId} frame must match tier ${def.tier}`).toContain(`units-neutral-${frameOf[def.tier]}-`);
      const file = join(publicDir, cardImage!);
      expect(existsSync(file), `${unitId} -> ${cardImage} must exist`).toBe(true);
      const head = readFileSync(file).subarray(0, 12);
      expect(
        head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP",
        `${unitId} must be a valid WebP`
      ).toBe(true);
      const size = statSync(file).size;
      expect(size, `${unitId} must contain a rendered card`).toBeGreaterThan(40_000);
      expect(size, `${unitId} must stay compressed`).toBeLessThan(220_000);
    }
  });

  it("wires every printed WOG ability to an engine effect the engine actually consumes", () => {
    // The ability DEFINITIONS live in src/data; their CONSUMPTION must live in
    // the engine. Concatenate every engine source (this test's own directory) so
    // a decorative effect — declared "implemented" but read by no engine code —
    // fails here instead of shipping as an inert card line. (This is what let the
    // former Santa-Gremlin guard/gift effects pass while doing nothing.)
    const engineDir = dirname(fileURLToPath(import.meta.url));
    const engineSource = readdirSync(engineDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => readFileSync(join(engineDir, file), "utf8"))
      .join("\n");

    for (const unitId of WOG_UNIT_IDS) {
      for (const abilityId of coreUnitDefinitions[unitId].neutral?.abilities ?? []) {
        const ability = unitAbilities[abilityId];
        expect(ability, `${unitId}: ${abilityId}`).toBeTruthy();
        expect(ability.implementationStatus, `${unitId}: ${abilityId}`).toBe("implemented");
        const effectType = ability.effect?.type;
        expect(effectType, `${unitId}: ${abilityId} declares an effect`).toBeTruthy();
        expect(
          engineSource.includes(`"${effectType}"`),
          `${unitId}: ${abilityId} effect ${effectType} must be consumed by engine code, not decorative`
        ).toBe(true);
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
    expect(unitSoundKey("wog.sylvan_centaur", "shoot")).toBe("units/centaur-shoot");
    expect(unitSoundKey("wog.gorynych", "move")).toBe("units/black-dragon-move");
    // All four Messengers (Air/Earth/Fire/Water) share the Stone Golem's voice set.
    for (const messenger of [
      "wog.air_messenger",
      "wog.earth_messenger",
      "wog.fire_messenger",
      "wog.water_messenger"
    ]) {
      expect(unitSoundKey(messenger, "attack"), messenger).toBe("units/stone-golem-attack");
      expect(unitSoundKey(messenger, "move"), messenger).toBe("units/stone-golem-move");
    }
    // The Dracolich speaks with the Ghost Dragon voice for every action EXCEPT its
    // shot, which is the Lich's projectile clip.
    expect(unitSoundKey("wog.dracolich", "attack")).toBe("units/ghost-dragon-attack");
    expect(unitSoundKey("wog.dracolich", "death")).toBe("units/ghost-dragon-death");
    expect(unitSoundKey("wog.dracolich", "shoot")).toBe("units/lich-shoot");
  });

  it("keeps Dracolich and Santa Gremlin recruitable (no unrecruitable tag)", () => {
    // Both carry a normal Neutral cost and sit in a recruitable Neutral deck, so
    // the ordinary recruit flow can pay for them. The `wog-unrecruitable` /
    // NOT_RECRUITABLE tag was removed, so no ability gates them out.
    expect(WOG_UNIT_IDS_BY_TIER.azure).toContain("wog.dracolich");
    expect(coreUnitDefinitions["wog.dracolich"].neutral?.cost).toEqual({ gold: 45, valuables: 2 });
    expect(coreUnitDefinitions["wog.santa_gremlin"].neutral?.cost).toEqual({ gold: 5 });
    for (const unitId of WOG_UNIT_IDS) {
      expect(coreUnitDefinitions[unitId].neutral?.abilities ?? [], unitId).not.toContain("wog-unrecruitable");
    }
    expect(unitAbilities["wog-unrecruitable"]).toBeUndefined();
  });

  it("ships Ghost as a bronze guard", () => {
    expect(WOG_UNIT_IDS_BY_TIER.bronze).toContain("wog.ghost");
    expect(WOG_UNIT_IDS_BY_TIER.silver).not.toContain("wog.ghost");
    expect(coreUnitDefinitions["wog.ghost"].tier).toBe("bronze");
    expect(coreUnitDefinitions["wog.ghost"].neutral?.cardImage).toBe("/assets/units-neutral-bronze-wog_ghost.webp");
  });

  it("gives Dracolich the no-melee-penalty ability", () => {
    expect(coreUnitDefinitions["wog.dracolich"].neutral?.abilities).toContain("ignore-combat-penalties");
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
