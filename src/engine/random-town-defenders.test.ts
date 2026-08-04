import { describe, expect, it } from "vitest";
import { startNeutralEncounter } from "./adventure-reducer";
import {
  drawGuardArmy,
  getMainHero,
  randomTownDefaultGoldPackId,
  randomTownGoldPackCandidates,
  eliminatePlayer
} from "./adventure";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID } from "./index";
import { coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { marketGoldValueOf } from "@/data/map/locations";
import type { GameAction, GameState, MapFieldState, PlayerId, ResourceKind } from "./state";

/**
 * Random Town defenders (printed Stretch-Goals card): "defended by units from
 * that Faction: a Pack of GOLD-tier units, chosen by the player who controls the
 * defense during this Combat; two Packs of SILVER-tier units; two Fews of
 * GOLD-tier units. Add Walls and the Gate for this Combat, but not the Arrow
 * Tower." The faction is one NOT in play.
 *
 * Every claim below asserts the real minted combat units (or the real seeded
 * faction pick), with a CONTROL that fails under the previous reading.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function makeGame(seed: string, options: Record<string, unknown> = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    ...options
  } as Parameters<typeof createAdventureGameState>[0]);
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.priorityPlayerId = "p1";
  state.phase = "player-turn";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.stack = [];
  if (state.adventure) {
    state.adventure.pendingTileChoice = null;
    state.adventure.pendingVisit = null;
    state.adventure.rewardQueue = [];
  }
  return state;
}

function randomTownField(spaceId = "70,70"): MapFieldState {
  return {
    spaceId,
    tileInstanceId: "t",
    slotIndex: 0,
    location: "random_town",
    difficulty: 7,
    terrain: "land"
  } as unknown as MapFieldState;
}

/** Opens a Random Town fight for p1 and deploys, so the guards are drawn. */
function fightRandomTown(state: GameState, fighter: PlayerId = "p1"): GameState {
  let next = state;
  const hero = getMainHero(next, fighter)!;
  const field = randomTownField();
  next.adventure!.fields[field.spaceId] = field;
  hero.spaceId = field.spaceId;
  next.players[fighter].hand = [];
  startNeutralEncounter(next, hero, field);
  expect(next.combat?.context.kind).toBe("neutral");
  const army = next.players[fighter].army;
  next = applyOk(next, {
    type: "PLACE_COMBAT_UNIT",
    playerId: fighter,
    armyUnitId: army[0].id,
    position: 13
  });
  return applyOk(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: fighter });
}

/** The open OPTION_CHOICE context, or undefined for any other/no choice. */
function optionChoiceContext(state: GameState): string | undefined {
  const choice = state.pendingChoice;
  return choice && choice.type === "OPTION_CHOICE" ? choice.context : undefined;
}

function neutralUnits(state: GameState) {
  return Object.values(state.combat?.units ?? {}).filter(
    (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.position >= 0
  );
}

/** Gold-equivalent printed Pack cost (Trading Post rates), the "cost" read. */
function packGoldCost(unitDefId: string): number {
  const cost = (coreUnitDefinitions[unitDefId]?.pack?.cost ?? {}) as Partial<Record<ResourceKind, number>>;
  return (Object.entries(cost) as [ResourceKind, number][]).reduce(
    (sum, [resource, amount]) =>
      sum + (resource === "gold" ? amount : amount * marketGoldValueOf(resource as "buildingMaterials" | "valuables")),
    0
  );
}

describe("Random Town defense — the printed composition", () => {
  it("mints 1 gold Pack + 2 silver Packs + 2 gold Fews of the chosen faction", () => {
    const state = fightRandomTown(makeGame("rt-composition"));
    const field = state.adventure!.fields["70,70"]!;
    const faction = field.faction!;
    expect(faction).toBeTruthy();

    const guards = neutralUnits(state);
    expect(guards).toHaveLength(5);
    expect(guards.every((unit) => coreUnitDefinitions[unit.unitDefId!]?.faction === faction)).toBe(true);

    const packs = guards.filter((unit) => unit.variant === "pack");
    const fews = guards.filter((unit) => unit.variant === "few");
    expect(packs.map((unit) => unit.grade).sort()).toEqual(["gold", "silver", "silver"]);
    expect(fews.map((unit) => unit.grade)).toEqual(["gold", "gold"]);

    // Each Pack/Few really fights on that printed side (stats, not just a flag).
    for (const unit of packs) {
      const side = coreUnitDefinitions[unit.unitDefId!]!.pack!;
      expect(unit.attack).toBe(side.attack);
      expect(unit.maxHealth).toBe(side.health);
    }
    for (const unit of fews) {
      const side = coreUnitDefinitions[unit.unitDefId!]!.few!;
      expect(unit.attack).toBe(side.attack);
      expect(unit.maxHealth).toBe(side.health);
    }

    // CONTROL against the OLD composition (1 bronze + 2 silver + 2 gold Packs):
    // no bronze body defends a Random Town and Fews are really on the table.
    expect(guards.some((unit) => unit.grade === "bronze")).toBe(false);
    expect(fews).toHaveLength(2);
  });

  it("takes the faction's highest-printed-cost gold Pack when no human controls the defense", () => {
    const state = fightRandomTown(makeGame("rt-default-pick"));
    const faction = state.adventure!.fields["70,70"]!.faction!;
    const goldPack = neutralUnits(state).find((unit) => unit.variant === "pack" && unit.grade === "gold")!;

    const candidates = randomTownGoldPackCandidates(faction);
    expect(candidates.length).toBeGreaterThan(1);
    const best = [...candidates].sort((left, right) => packGoldCost(right) - packGoldCost(left))[0]!;
    expect(goldPack.unitDefId).toBe(best);
    // CONTROL: it is NOT merely the first (or cheapest) gold unit of the roster.
    const cheapest = [...candidates].sort((left, right) => packGoldCost(left) - packGoldCost(right))[0]!;
    expect(packGoldCost(best)).toBeGreaterThan(packGoldCost(cheapest));
    expect(goldPack.unitDefId).not.toBe(cheapest);
    // No pick window ever opened: the fight went straight to the battle.
    expect(optionChoiceContext(state)).not.toBe("random-town-pack");
  });

  it("picks per faction cost table, not a fixed roster slot (CONTROL across factions)", () => {
    // Rampart's dearest gold Pack is the Gold Dragons; Castle's the Archangels;
    // in both cases the SECOND gold unit — so also check a faction whose roster
    // order does not track cost by asserting the max against the real table.
    for (const faction of Object.keys(coreFactionDefinitions)) {
      const candidates = randomTownGoldPackCandidates(faction);
      if (candidates.length === 0) continue;
      const best = randomTownDefaultGoldPackId(faction)!;
      const maxCost = Math.max(...candidates.map((id) => packGoldCost(id)));
      expect(packGoldCost(best)).toBe(maxCost);
    }
    // A concrete divergence: Castle picks Archangels, never Champions.
    expect(randomTownDefaultGoldPackId("castle")).toBe("castle.archangels");
    expect(randomTownDefaultGoldPackId("rampart")).toBe("rampart.gold_dragons");
  });
});

describe("Random Town faction pick", () => {
  it("is drawn seeded-random from factions NOT participating, deterministically", () => {
    const factions: string[] = [];
    for (const seed of ["rt-f1", "rt-f2", "rt-f3", "rt-f4", "rt-f5", "rt-f6"]) {
      const state = makeGame(seed);
      const inPlay = Object.values(state.players).map((player) => player.factionId);
      const field = randomTownField();
      drawGuardArmy(state, field, 7);
      expect(field.faction).toBeTruthy();
      // CONTROL: a participating faction is never the defender.
      expect(inPlay).not.toContain(field.faction);
      factions.push(field.faction!);

      // Determinism: the same seed re-rolls the same faction (no Math.random).
      const twin = makeGame(seed);
      const twinField = randomTownField();
      drawGuardArmy(twin, twinField, 7);
      expect(twinField.faction).toBe(field.faction);
    }
    // The pick really varies with the seed (not a constant).
    expect(new Set(factions).size).toBeGreaterThan(1);
  });

  it("is the field's VII fight with Walls and the Gate but NO Arrow Tower", () => {
    const state = fightRandomTown(makeGame("rt-siege"));
    expect(state.combat?.context.kind).toBe("neutral");
    if (state.combat?.context.kind !== "neutral") return;
    expect(state.combat.context.difficulty).toBe(7);
    expect(state.combat.siege?.walls).toHaveLength(3);
    expect(state.combat.siege?.gatePosition).not.toBeNull();
    expect(state.combat.siege?.gatePosition).toBeGreaterThanOrEqual(0);
    // CONTROL: a real town siege DOES field an Arrow Tower; this one must not.
    expect(state.combat.siege?.arrowTowerUnitId).toBeNull();
    expect(
      Object.values(state.combat.units).some((unit) => unit.position === -1)
    ).toBe(false);
  });
});

describe("Random Town — single player never pauses for the Pack pick", () => {
  it("auto-takes the highest-cost gold Pack in a single-player game with manual guard control", () => {
    const state = fightRandomTown(
      makeGame("rt-single-player", { manualGuardControl: true, sessionMode: "single-player" })
    );
    expect(state.sessionMode).toBe("single-player");
    expect(optionChoiceContext(state)).not.toBe("random-town-pack");
    const faction = state.adventure!.fields["70,70"]!.faction!;
    const goldPack = neutralUnits(state).find((unit) => unit.variant === "pack" && unit.grade === "gold")!;
    expect(goldPack.unitDefId).toBe(randomTownDefaultGoldPackId(faction));
  });
});

describe("Random Town — a HUMAN defense controller picks the gold Pack", () => {
  function pvpControlGame(seed: string): GameState {
    const state = makeGame(seed, { pvpNeutralControl: true });
    return state;
  }

  it("opens the pick for the controlling seat and mints exactly what they chose", () => {
    let state = fightRandomTown(pvpControlGame("rt-controller-pick"));
    // The controller is the next live seat clockwise from the fighter.
    expect(optionChoiceContext(state)).toBe("random-town-pack");
    const controller = state.pendingChoice!.playerId;
    expect(controller).not.toBe("p1");
    expect(controller).not.toBe(NEUTRAL_PLAYER_ID);

    const faction = state.adventure!.fields["70,70"]!.faction!;
    const candidates = randomTownGoldPackCandidates(faction);
    const wanted = candidates.find((id) => id !== randomTownDefaultGoldPackId(faction))!;
    const optionIndex = candidates.indexOf(wanted);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: controller,
      choiceId: state.pendingChoice!.id,
      optionIndex
    });

    const goldPack = neutralUnits(state).find((unit) => unit.variant === "pack" && unit.grade === "gold")!;
    // CONTROL: the picked unit replaced the default, and it is a real Pack body.
    expect(goldPack.unitDefId).toBe(wanted);
    expect(goldPack.unitDefId).not.toBe(randomTownDefaultGoldPackId(faction));
    expect(goldPack.attack).toBe(coreUnitDefinitions[wanted]!.pack!.attack);
    // The rest of the printed composition is untouched.
    expect(neutralUnits(state)).toHaveLength(5);
  });

  it("hands an eliminated controller's pick back and reveals the default army (no stall)", () => {
    let state = fightRandomTown(pvpControlGame("rt-controller-eliminated"));
    expect(optionChoiceContext(state)).toBe("random-town-pack");
    const controller = state.pendingChoice!.playerId;
    const faction = state.adventure!.fields["70,70"]!.faction!;

    // The REAL elimination path: eliminatePlayer hands a neutral-side choice the
    // dead controller held back to the Neutral seat instead of dropping it.
    eliminatePlayer(state, controller, "gave up", true);
    expect(state.pendingChoice?.playerId).toBe(NEUTRAL_PLAYER_ID);

    // Any next action pumps the engine: the window auto-resolves to the default.
    state = applyOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "watcher" } as GameAction);
    expect(optionChoiceContext(state)).not.toBe("random-town-pack");
    const goldPack = neutralUnits(state).find((unit) => unit.variant === "pack" && unit.grade === "gold")!;
    expect(goldPack.unitDefId).toBe(randomTownDefaultGoldPackId(faction));
    expect(neutralUnits(state)).toHaveLength(5);
  });
});
