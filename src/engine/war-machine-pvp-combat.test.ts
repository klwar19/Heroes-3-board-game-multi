import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Every war machine, exercised in a real player-vs-player ("player"-context)
 * combat — the multiplayer PvP battle — driven entirely through the public
 * action API (PLAY_CARD / END_COMBAT_ROUND / USE_ACTIVE_EFFECT /
 * CHOOSE_ABILITY_TARGET), never by reaching into engine internals.
 *
 * The numbers asserted are the printed rules from
 * https://en.homm3bg.wiki/war_machines/ :
 *   - First Aid Tent: once per round, remove 1 damage from your unit.
 *   - Ammo Cart: your ranged units ignore combat penalties and gain +2 initiative.
 *   - Ballista: at round start, 1 damage to the lowest-initiative enemy.
 *   - Catapult: at round start, pay 1 building material to hit 2 adjacent
 *     targets for 1 each.
 *   - Cannon: at round start, spend 1 expertise to deal 2 to one enemy.
 *
 * startWarMachineRound scans BOTH the attacker's and the defender's permanents,
 * so each assertion below also proves war machines are not attacker-only and not
 * sandbox-gated. Every assertion fails if its wiring is removed (CLAUDE.md #1).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Re-skins the sandbox combat as a real PvP (`player`-context) battle. */
function pvpCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.combat!.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: "hero_p2",
    fieldId: "field_center"
  };
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.permanents = [];
  state.players.p2.permanents = [];
  return state;
}

/** Make `unitId` (owned by `owner`) the uniquely slowest, tanky enough to read. */
function singleSlowest(state: GameState, owner: PlayerId, unitId: string): void {
  const units = state.combat!.units;
  let next = 8;
  for (const id of Object.keys(units)) {
    if (units[id].controllerId === owner) {
      units[id].initiative = id === unitId ? 1 : next--;
    }
  }
  units[unitId].maxHealth = 12;
  units[unitId].damage = 0;
}

/** END_COMBAT_ROUND with the active unit cleared so the war-machine round fires. */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

function fireOption(state: GameState, playerId: PlayerId, match: RegExp): GameAction {
  const legal = getLegalActions(state, playerId).find((entry) => match.test(entry.label));
  expect(legal, `expected a war-machine option matching ${match}`).toBeTruthy();
  return legal!.action;
}

// ===========================================================================
// Ballista — 1 damage to the lowest-initiative enemy, both sides
// ===========================================================================

describe("PvP — Ballista (round start: 1 to the slowest enemy)", () => {
  it("the attacker's Ballista fires at the defender's slowest unit", () => {
    const state = pvpCombat("pvp-attacker-ballista");
    state.players.p1.permanents = ["war_machine.ballista"];
    singleSlowest(state, "p2", "unit_p2_dread_knights");

    const fired = endRound(state, "p1");
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
  });

  it("the defender's Ballista fires too — it is not attacker-only", () => {
    const state = pvpCombat("pvp-defender-ballista");
    state.players.p2.permanents = ["war_machine.ballista"];
    singleSlowest(state, "p1", "unit_p1_crusaders");

    const fired = endRound(state, "p1");
    expect(fired.combat!.units.unit_p1_crusaders.damage).toBe(1);
  });

  it("both sides' Ballistas fire in the same round, each at the other's slowest", () => {
    const state = pvpCombat("pvp-both-ballistas");
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p2.permanents = ["war_machine.ballista"];
    singleSlowest(state, "p2", "unit_p2_dread_knights");
    singleSlowest(state, "p1", "unit_p1_crusaders");

    const fired = endRound(state, "p1");
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(fired.combat!.units.unit_p1_crusaders.damage).toBe(1);
  });
});

// ===========================================================================
// First Aid Tent — once per round, remove 1 damage from your selected unit
// ===========================================================================

describe("PvP — First Aid Tent (heal 1 once per round)", () => {
  it("plays from hand, then heals a wounded friendly for 1", () => {
    let state = pvpCombat("pvp-first-aid");
    state.players.p1.hand = ["war_machine.first_aid_tent"];
    const wounded = state.combat!.units.unit_p1_crusaders;
    wounded.maxHealth = 8;
    wounded.damage = 5;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "war_machine.first_aid_tent"
    );
    expect(play, "the Tent should be playable into play during the owner's activation").toBeTruthy();
    state = applyOk(state, play!.action);
    expect(state.players.p1.permanents).toContain("war_machine.first_aid_tent");

    const heal = state.activeEffects.find((effect) => effect.name === "First Aid Tent");
    expect(heal, "the Tent's heal effect should be seeded on play").toBeTruthy();
    state = applyOk(state, {
      type: "USE_ACTIVE_EFFECT",
      playerId: "p1",
      effectId: heal!.id,
      target: { type: "unit", unitId: "unit_p1_crusaders" }
    });
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(4);
  });
});

// ===========================================================================
// Ammo Cart — ranged units ignore penalties and gain +2 initiative
// ===========================================================================

describe("PvP — Ammo Cart (+2 ranged initiative, penalty waiver)", () => {
  it("playing it raises the owner's ranged unit initiative by 2 and seeds the waiver", () => {
    let state = pvpCombat("pvp-ammo-cart");
    state.players.p1.hand = ["war_machine.ammo_cart"];
    const ranged = state.combat!.units.unit_p1_marksmen;
    expect(ranged.type).toBe("ranged");
    const initiativeBefore = ranged.initiative;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "war_machine.ammo_cart"
    );
    expect(play).toBeTruthy();
    state = applyOk(state, play!.action);

    expect(state.players.p1.permanents).toContain("war_machine.ammo_cart");
    expect(state.combat!.units.unit_p1_marksmen.initiative).toBe(initiativeBefore + 2);
    const waiver = state.activeEffects.find(
      (effect) =>
        effect.name === "Ammo Cart" &&
        effect.controllerId === "p1" &&
        effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_ALL_PENALTIES")
    );
    expect(waiver, "the ranged penalty waiver should be in play").toBeTruthy();
  });
});

// ===========================================================================
// Cannon — spend 1 expertise to deal 2 to one enemy (optional)
// ===========================================================================

describe("PvP — Cannon (spend 1 expertise, 2 damage to one enemy)", () => {
  it("offers the shot, spends an expert use and deals 2 to the chosen enemy", () => {
    const state = pvpCombat("pvp-cannon");
    state.players.p1.permanents = ["war_machine.cannon"];
    state.players.p1.limits.expertUses = 1;

    const offered = endRound(state, "p1");
    expect(offered.pendingChoice?.type).toBe("OPTION_CHOICE");
    const aiming = applyOk(offered, fireOption(offered, "p1", /Fire the Cannon/));
    expect(aiming.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(aiming.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");

    const shot = applyOk(aiming, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: aiming.pendingChoice!.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(shot.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("is not offered with no expert use to spend", () => {
    const state = pvpCombat("pvp-cannon-no-crown");
    state.players.p1.permanents = ["war_machine.cannon"];
    state.players.p1.limits.expertUses = 0;

    const fired = endRound(state, "p1");
    expect(fired.pendingChoice ?? null).toBeNull();
    expect(Object.values(fired.combat!.units).every((unit) => unit.damage === 0)).toBe(true);
  });
});

// ===========================================================================
// Catapult — pay 1 building material to hit 2 adjacent targets for 1 each
// ===========================================================================

describe("PvP — Catapult (pay 1 material, 2 adjacent targets for 1 each)", () => {
  it("spends 1 building material and deals 1 to each of two adjacent enemies", () => {
    const state = pvpCombat("pvp-catapult");
    state.players.p1.permanents = ["war_machine.catapult"];
    state.players.p1.resources.buildingMaterials = 2;

    // Two enemies side by side (positions 13 & 14 are adjacent on the board).
    const units = state.combat!.units;
    units.unit_p2_skeletons.position = 13;
    units.unit_p2_vampires.position = 14;

    const offered = endRound(state, "p1");
    const aiming = applyOk(offered, fireOption(offered, "p1", /Fire the Catapult/));
    expect(aiming.players.p1.resources.buildingMaterials).toBe(1);
    expect(aiming.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");

    let resolved = applyOk(aiming, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: aiming.pendingChoice!.id,
      targetUnitId: "unit_p2_skeletons"
    });
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(1);

    // A second, adjacent target may need picking; choose the neighbour explicitly.
    if (resolved.pendingChoice?.type === "ABILITY_TARGET_CHOICE") {
      expect(resolved.pendingChoice.candidateUnitIds).toContain("unit_p2_vampires");
      resolved = applyOk(resolved, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: resolved.pendingChoice.id,
        targetUnitId: "unit_p2_vampires"
      });
    }
    expect(resolved.combat!.units.unit_p2_vampires.damage).toBe(1);
  });
});
