import { describe, expect, it } from "vitest";
import { expansionTileDefinitions } from "@/data/map/expansion-tiles";
import {
  applyAction,
  combatElementalSchool,
  createInitialGameState,
  elementalTileSpellPowerBonus,
  getLegalActions,
  pickSpellSchoolForPower,
  schoolScopedStandingPower,
  standingSpellPower
} from "./index";
import type { AdventureState, GameAction, GameState } from "./state";
import { cardLibrary } from "@/data/cards/library";

/**
 * Conflux Elemental Near tiles (N14–N21) + Magic Arrow single-school rule.
 *
 * Every claim is an observable outcome (damage / standing Power) with CONTROLs
 * that fail if the wiring is removed or if schools cross-stack illegally.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

/** Park the open combat on a Conflux Elemental tile (any hex of that tile). */
function putCombatOnTile(state: GameState, tileDefId: string): void {
  const fieldId = "elem_field";
  const tileInstanceId = "elem_tile";
  if (!state.adventure) {
    // Minimal adventure shell — only fields/tiles are read for terrain.
    state.adventure = { fields: {}, tiles: {} } as AdventureState;
  }
  const adventure = state.adventure!;
  adventure.tiles[tileInstanceId] = {
    id: tileInstanceId,
    tileDefId,
    centerRow: 10,
    centerCol: 10,
    rotation: 0,
    faceDown: false,
    group: "near",
    backLabel: "Ⅳ–Ⅴ"
  };
  adventure.fields[fieldId] = {
    spaceId: fieldId,
    tileInstanceId,
    slot: 0,
    location: "empty_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.combat!.context = {
    kind: "neutral",
    heroId: "hero_p1",
    fieldId,
    difficulty: 4,
    hasAzure: false
  };
}

function combatReady(seed: string, hand: string[], permanent?: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = hand;
  state.players.p2.hand = [];
  if (permanent) {
    state.players.p1.permanents = [permanent];
  }
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 40;
  target.damage = 0;
  return state;
}

function castMagicArrow(state: GameState): GameState {
  const cast = getLegalActions(state, "p1").find(
    (l) =>
      l.action.type === "CAST_SPELL" &&
      l.action.cardId === "spell.magic_arrow" &&
      !l.action.useSchoolExpert &&
      l.action.target?.type === "unit" &&
      l.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast, "Magic Arrow cast should be legal").toBeTruthy();
  return passAll(applyOk(state, cast!.action));
}

function castLightningBolt(state: GameState): GameState {
  const cast = getLegalActions(state, "p1").find(
    (l) =>
      l.action.type === "CAST_SPELL" &&
      l.action.cardId === "spell.lightning_bolt" &&
      !l.action.useSchoolExpert &&
      l.action.target?.type === "unit" &&
      l.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast, "Lightning Bolt cast should be legal").toBeTruthy();
  return passAll(applyOk(state, cast!.action));
}

describe("Conflux Elemental tiles N14–N21 terrain assignment", () => {
  it("maps each Near tile to the wiki Elemental school", () => {
    // Wiki: N14/N15 Fire, N16/N17 Water, N18/N19 Air, N20/N21 Earth.
    expect(expansionTileDefinitions.N14.terrain).toBe("elemental_fire");
    expect(expansionTileDefinitions.N15.terrain).toBe("elemental_fire");
    expect(expansionTileDefinitions.N16.terrain).toBe("elemental_water");
    expect(expansionTileDefinitions.N17.terrain).toBe("elemental_water");
    expect(expansionTileDefinitions.N18.terrain).toBe("elemental_air");
    expect(expansionTileDefinitions.N19.terrain).toBe("elemental_air");
    expect(expansionTileDefinitions.N20.terrain).toBe("elemental_earth");
    expect(expansionTileDefinitions.N21.terrain).toBe("elemental_earth");
  });
});

describe("Elemental tile +1 Power in combat", () => {
  it("combat on N14 (Fire) gives Magic Arrow +1 Power (damage 1 → 2)", () => {
    const state = combatReady("tile-fire-ma", ["spell.magic_arrow"]);
    putCombatOnTile(state, "N14");
    expect(combatElementalSchool(state)).toBe("fire");
    expect(elementalTileSpellPowerBonus(state, "fire")).toBe(1);
    expect(elementalTileSpellPowerBonus(state, "water")).toBe(0);

    const next = castMagicArrow(state);
    // Power 0 → 1 dmg; Power 1 → 2 dmg
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("combat on N18 (Air) gives Lightning Bolt +1 Power (damage 2 → 3)", () => {
    const base = combatReady("tile-air-lb-base", ["spell.lightning_bolt"]);
    const boosted = combatReady("tile-air-lb", ["spell.lightning_bolt"]);
    putCombatOnTile(boosted, "N18");
    expect(castLightningBolt(base).combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(castLightningBolt(boosted).combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("Fire tile does NOT boost Lightning Bolt (Air) — school CONTROL", () => {
    const base = combatReady("tile-fire-no-air-base", ["spell.lightning_bolt"]);
    const onFire = combatReady("tile-fire-no-air", ["spell.lightning_bolt"]);
    putCombatOnTile(onFire, "N15");
    expect(castLightningBolt(onFire).combat!.units.unit_p2_skeletons.damage).toBe(
      castLightningBolt(base).combat!.units.unit_p2_skeletons.damage
    );
  });

  it("sandbox combat (no map field) grants no Elemental tile bonus", () => {
    const state = combatReady("tile-sandbox", ["spell.magic_arrow"]);
    // createInitialGameState combat is sandbox-context — no tile.
    expect(combatElementalSchool(state)).toBeNull();
    expect(castMagicArrow(state).combat!.units.unit_p2_skeletons.damage).toBe(1);
  });
});

describe("Magic Arrow: one school at a time (no cross-school stacking)", () => {
  it("Water Magic permanent stacks with Water tile (+2), not with Fire tile", () => {
    const waterTile = combatReady("ma-water-stack", ["spell.magic_arrow"], "ability.water_magic");
    putCombatOnTile(waterTile, "N16"); // Elemental Water
    // Water permanent +1 + Water tile +1 = Power 2 → 3 damage
    expect(castMagicArrow(waterTile).combat!.units.unit_p2_skeletons.damage).toBe(3);

    const fireTile = combatReady("ma-fire-nostack", ["spell.magic_arrow"], "ability.water_magic");
    putCombatOnTile(fireTile, "N14"); // Elemental Fire
    // Best single school is +1 (either Water permanent OR Fire tile), NOT +2
    expect(castMagicArrow(fireTile).combat!.units.unit_p2_skeletons.damage).toBe(2);

    // Standing Power agrees with the cast (preview must not show cross-stack).
    const preview = combatReady("ma-preview", ["spell.magic_arrow"], "ability.water_magic");
    putCombatOnTile(preview, "N14");
    const arrow = cardLibrary["spell.magic_arrow"]!;
    expect(schoolScopedStandingPower(preview, "p1", arrow)).toBe(1);
    expect(standingSpellPower(preview, "p1", arrow)).toBe(1);
  });

  it("auto-picks the school with the highest package (Water permanent + Water tile beats Fire tile alone)", () => {
    const state = combatReady("ma-pick-water", ["spell.magic_arrow"], "ability.water_magic");
    putCombatOnTile(state, "N17"); // Water
    expect(pickSpellSchoolForPower(state, "p1", cardLibrary["spell.magic_arrow"])).toBe("water");
    expect(schoolScopedStandingPower(state, "p1", cardLibrary["spell.magic_arrow"]!)).toBe(2);
  });

  it("Water Magic does not boost an Air spell even on a Water tile (school gate CONTROL)", () => {
    const state = combatReady("water-no-air", ["spell.lightning_bolt"], "ability.water_magic");
    putCombatOnTile(state, "N16");
    // Lightning Bolt is Air: Water permanent no, Water tile no → base 2 damage
    expect(castLightningBolt(state).combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});
