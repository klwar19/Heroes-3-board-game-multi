import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * Regression coverage for spell.precision (CLAUDE.md rule #1: an effect is "done"
 * only if a test fails when its wiring is removed). Precision was WIRED BUT
 * UNTESTED — no test asserted its observable effects, so a sign flip / wrong
 * scaling / a dropped ranged gate would have been invisible.
 *
 * Printed card: "Instant: When attacking a non-adjacent unit, the selected RANGED
 * unit ignores the combat penalties and gains Power 0: +1 / 1: +2 / 2: +3 attack."
 * Engine: ADD_COMBAT_STAT attack, amountByPower {0:1,1:2,2:3}, unitTypes:["ranged"],
 * ignoreRangedPenalty:true (src/data/cards/spells.ts).
 *
 * Each test asserts the OBSERVABLE outcome (rolled damage / roll mode / whether
 * the play is offered), never just "a buff was created":
 *  - the ranged unit's damage RISES by the scaled bonus,
 *  - Precision is NOT offered on a non-ranged attacker (the unitTypes gate),
 *  - Precision lifts the back-row ranged disadvantage (rollMode normal vs the
 *    control's disadvantage).
 *
 * Sandbox (createInitialGameState): p1 marksmen bronze/RANGED, griffins
 * bronze/flying; p2 skeletons bronze/ground. Board is 4 cols x 5 rows (0-19);
 * back rows are row 0 (0-3) and row 4 (16-19); adjacency is orthogonal.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function passUntil(state: GameState, playerId: "p1" | "p2"): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** The most recent main (non-retaliation) hit dealt by `attackerId`. */
function lastHitBy(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation
    );
}

function precisionReaction(state: GameState): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, "p1").find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === "spell.precision" &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

function powerReaction(state: GameState): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, "p1").find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" && entry.action.cardId === "stat.power" && !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

/**
 * Marksmen (ranged) about to make a NON-adjacent shot at the skeletons, with the
 * declaration already opened and priority handed back to p1. Marksmen stripped of
 * its double-attack ability so a single clean hit is read. Attack 5, defense 0,
 * scripted die +1, so the only variable is the Precision bonus.
 */
function declareRangedShot(seed: string, p1Hand: string[]): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  const marksmen = combat.units.unit_p1_marksmen;
  const skeletons = combat.units.unit_p2_skeletons;
  marksmen.type = "ranged";
  marksmen.attack = 5;
  marksmen.abilities = [];
  marksmen.position = 8; // row 2; neighbours 4/9/12 — 13 is NOT adjacent → ranged shot
  marksmen.maxHealth = 50;
  marksmen.damage = 0;
  skeletons.position = 13;
  skeletons.defense = 0;
  skeletons.abilities = [];
  skeletons.maxHealth = 50;
  skeletons.damage = 0;
  combat.dice.scriptedRolls = [1, 1, 1, 1, 1, 1]; // +1 face, normal roll keeps +1
  combat.dice.rollCount = 0;
  combat.activeUnitId = "unit_p1_marksmen";
  state.activePlayerId = "p1";
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [];
  return passUntil(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    }),
    "p1"
  );
}

describe("Precision — ranged attack buff", () => {
  it("control: the marksmen's ranged shot WITHOUT Precision deals only its base damage", () => {
    const state = declareRangedShot("precision-control", []);
    const resolved = passAllReactions(state);
    const hit = lastHitBy(resolved, "unit_p1_marksmen");
    // Attack 5 + die +1, no bonus = 6 damage, defense 0.
    expect(hit?.attackBonus).toBe(0);
    expect(hit?.damage).toBe(6);
  });

  it("raises a ranged unit's attack by the power-scaled bonus (+2 at Power 1)", () => {
    const declared = declareRangedShot("precision-scale", ["spell.precision", "stat.power"]);
    const precision = precisionReaction(declared);
    expect(precision, "Precision should be offered on the marksmen's ranged shot").toBeTruthy();

    // Play Precision, then pay 1 Power into the same window → amountByPower[1] = +2.
    const afterPrecision = applyOk(declared, precision!);
    const power = powerReaction(afterPrecision);
    expect(power, "Power should be offerable to empower Precision in the open window").toBeTruthy();
    const resolved = passAllReactions(applyOk(afterPrecision, power!));

    const hit = lastHitBy(resolved, "unit_p1_marksmen");
    // amountByPower {0:1, 1:2}: one Power lifts the bonus to +2 (NOT +1).
    expect(hit?.attackBonus).toBe(2);
    // Observable: attack 5 + bonus 2 + die +1 = 8 damage (control was 6).
    expect(hit?.damage).toBe(8);
  });

  it("at Power 0 grants exactly +1 attack (amountByPower base)", () => {
    const declared = declareRangedShot("precision-base", ["spell.precision"]);
    const precision = precisionReaction(declared);
    expect(precision).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, precision!));
    const hit = lastHitBy(resolved, "unit_p1_marksmen");
    expect(hit?.attackBonus).toBe(1);
    expect(hit?.damage).toBe(7); // 5 + 1 + die 1
  });

  it("is NOT offered on a non-ranged attacker (the unitTypes gate)", () => {
    const state = createInitialGameState("precision-nonranged");
    const combat = state.combat!;
    combat.units.unit_p1_griffins.position = 9; // flying, attacking adjacent skeletons
    combat.units.unit_p2_skeletons.position = 13;
    combat.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    state.players.p1.hand = ["spell.precision"];
    state.players.p2.hand = [];

    const declared = passUntil(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      }),
      "p1"
    );
    expect(precisionReaction(declared), "Precision must NOT be offered to a flying (non-ranged) attacker").toBeUndefined();
  });

  it("the reducer REFUSES to resolve Precision on a non-ranged attacker (hard backstop)", () => {
    // Open the offer with a genuine ranged shot, capture the Precision play, then
    // flip the attacker to non-ranged before resolving: the reducer's unitTypes
    // guard must reject it (this is the throw that backstops the offer gates).
    const declared = declareRangedShot("precision-throw", ["spell.precision"]);
    const precision = precisionReaction(declared);
    expect(precision).toBeTruthy();
    declared.combat!.units.unit_p1_marksmen.type = "flying";
    const result = applyAction(declared, precision!);
    expect(result.errors.length, "the reducer must reject Precision on a non-ranged unit").toBeGreaterThan(0);
    expect(result.errors[0]?.message ?? "").toContain("only affects ranged");
  });

  it("lifts the back-row ranged disadvantage (roll becomes normal); control stays at disadvantage", () => {
    // Marksmen in row 0 (pos 0) shooting a defender in the opposite back row
    // (row 4, pos 16) is a long-range shot that rolls at disadvantage. Scripted
    // dice [1, -1, ...]: disadvantage keeps the -1, a normal roll keeps the +1.
    function backRowShot(seed: string, hand: string[]): GameState {
      const state = createInitialGameState(seed);
      const combat = state.combat!;
      const marksmen = combat.units.unit_p1_marksmen;
      const skeletons = combat.units.unit_p2_skeletons;
      marksmen.type = "ranged";
      marksmen.attack = 5;
      marksmen.abilities = [];
      marksmen.position = 0;
      marksmen.maxHealth = 50;
      marksmen.damage = 0;
      skeletons.position = 16;
      skeletons.defense = 0;
      skeletons.abilities = [];
      skeletons.maxHealth = 50;
      skeletons.damage = 0;
      combat.dice.scriptedRolls = [1, -1, 0, 0, 0, 0];
      combat.dice.rollCount = 0;
      combat.activeUnitId = "unit_p1_marksmen";
      state.activePlayerId = "p1";
      state.players.p1.hand = [...hand];
      state.players.p2.hand = [];
      return passUntil(
        applyOk(state, {
          type: "ATTACK_UNIT",
          playerId: "p1",
          attackerId: "unit_p1_marksmen",
          defenderId: "unit_p2_skeletons"
        }),
        "p1"
      );
    }

    // Control: no Precision → disadvantage keeps the −1 die.
    const control = passAllReactions(backRowShot("precision-backrow-ctrl", []));
    const controlHit = lastHitBy(control, "unit_p1_marksmen");
    expect(controlHit?.rollMode).toBe("disadvantage");
    expect(controlHit?.damage).toBe(4); // 5 + (−1)

    // With Precision: penalty lifted → normal roll keeps the +1 die, plus +1 bonus.
    const declared = backRowShot("precision-backrow", ["spell.precision"]);
    const precision = precisionReaction(declared);
    expect(precision).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, precision!));
    const hit = lastHitBy(resolved, "unit_p1_marksmen");
    expect(hit?.rollMode).toBe("normal");
    expect(hit?.attackBonus).toBe(1);
    expect(hit?.damage).toBe(7); // 5 + 1 (bonus) + 1 (die, penalty lifted)
  });
});
