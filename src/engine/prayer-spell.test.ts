import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { cardLibrary } from "@/data/cards/library";
import { effectiveInitiative } from "./active-effects";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * Regression coverage for spell.prayer (CLAUDE.md rule #1). Prayer is a CHOOSE_ONE
 * spell with three arms (src/data/cards/spells.ts):
 *   option 0 — +X attack (trigger: self attack-declared, one-attack reaction),
 *   option 1 — +X defense (trigger: opponent attack-declared, one-attack reaction),
 *   option 2 — +X initiative (no trigger, a WHOLE-COMBAT ongoing buff).
 * Each arm scales amountByPower {0:1, 2:2, 4:3}.
 *
 * These tests assert the OBSERVABLE combat outcome of every arm against a control:
 *   - option 0: the attacker deals MORE damage,
 *   - option 1: the defender takes LESS damage,
 *   - option 2: the chosen unit's effective Initiative RISES for the combat,
 *     scaling with Power; and an off-turn cast that out-paces the enemy unit
 *     about to act STEALS its activation (with a control that does not).
 *
 * Option 2 was previously a dead arm — a trigger-free CHOOSE_ONE spell option had
 * no offer path. It is now cast as a real Spell (CAST_SPELL with an optionIndex)
 * on your own turn OR off-turn as an instant before an enemy unit moves; see
 * addChooseOneSpellInstantCasts (offer), resolveTopStack's CHOOSE_ONE-spell branch
 * (resolution, power-scaled) and maybeStealActivationAfterInitiativeShift (steal).
 *
 * Sandbox: p1 griffins/crusaders, p2 skeletons. Board 4x5.
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

function lastHitBy(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation
    );
}

function prayerReaction(
  state: GameState,
  playerId: "p1" | "p2",
  optionIndex: number
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === "spell.prayer" &&
      entry.action.optionIndex === optionIndex &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

/** Griffins (attacker, attack 5) adjacent to skeletons (defender, defense 0), attack declared. */
function declareMelee(seed: string, p1Hand: string[], p2Hand: string[]): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  const griffins = combat.units.unit_p1_griffins;
  const skeletons = combat.units.unit_p2_skeletons;
  griffins.attack = 5;
  griffins.defense = 0;
  griffins.abilities = [];
  griffins.position = 9;
  griffins.maxHealth = 50;
  griffins.damage = 0;
  skeletons.attack = 5;
  skeletons.defense = 0;
  skeletons.abilities = [];
  skeletons.position = 13;
  skeletons.maxHealth = 50;
  skeletons.damage = 0;
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0]; // 0 face: damage = attack − defense
  combat.dice.rollCount = 0;
  combat.activeUnitId = "unit_p1_griffins";
  state.activePlayerId = "p1";
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [...p2Hand];
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
}

describe("Prayer — option 0 (+attack, attacker)", () => {
  it("control: the attacker deals only its base damage with no Prayer", () => {
    const resolved = passAllReactions(declareMelee("prayer0-control", [], []));
    const hit = lastHitBy(resolved, "unit_p1_griffins");
    expect(hit?.attackBonus).toBe(0);
    expect(hit?.damage).toBe(5); // 5 attack − 0 defense, die 0
  });

  it("raises the attacker's damage when the attacker plays the +attack arm", () => {
    const declared = passUntil(declareMelee("prayer0-buff", ["spell.prayer"], []), "p1");
    const play = prayerReaction(declared, "p1", 0);
    expect(play, "Prayer +attack arm should be offered to the attacker").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    const hit = lastHitBy(resolved, "unit_p1_griffins");
    expect(hit?.attackBonus).toBe(1); // amountByPower[0] = +1
    expect(hit?.damage).toBe(6); // 5 + 1 − 0
  });
});

describe("Prayer — option 1 (+defense, defender)", () => {
  it("reduces the damage the defender takes when the defender plays the +defense arm", () => {
    const declared = passUntil(declareMelee("prayer1-buff", [], ["spell.prayer"]), "p2");
    const play = prayerReaction(declared, "p2", 1);
    expect(play, "Prayer +defense arm should be offered to the defender").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    const hit = lastHitBy(resolved, "unit_p1_griffins");
    expect(hit?.defenseBonus).toBe(1); // amountByPower[0] = +1 defense
    // Observable: attack 5 − defense 1 = 4 damage (control deals 5).
    expect(hit?.damage).toBe(4);
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });
});

/** A fresh combat (no attack declared) with one unit active and not yet acted. */
function freshCombat(seed: string, activeUnitId: string, activePlayer: "p1" | "p2"): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = false;
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.attacksThisActivation = 0;
    unit.abilities = [];
  }
  combat.activeUnitId = activeUnitId;
  state.activePlayerId = activePlayer;
  state.phase = "combat";
  return state;
}

/** The CAST_SPELL action that casts Prayer's +initiative arm on the named unit. */
function prayerInitCast(
  state: GameState,
  playerId: "p1" | "p2",
  targetUnitId: string
): Extract<GameAction, { type: "CAST_SPELL" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "CAST_SPELL" &&
      entry.action.cardId === "spell.prayer" &&
      entry.action.optionIndex === 2 &&
      entry.action.target.type === "unit" &&
      entry.action.target.unitId === targetUnitId
  );
  return legal?.action.type === "CAST_SPELL" ? legal.action : undefined;
}

/** Plays Power statistics into the open cast window until `amount` Power is paid. */
function payPower(state: GameState, playerId: "p1" | "p2", amount: number): GameState {
  let current = state;
  let safety = 10;
  while (safety-- > 0) {
    if ((current.stack[0]?.modifiers.spellPowerBonus ?? 0) >= amount) {
      break;
    }
    const power = getLegalActions(current, playerId).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power" && !legal.action.asPowerBoost
    );
    if (!power) {
      break;
    }
    current = applyOk(current, power.action);
  }
  return current;
}

/**
 * An off-turn steal scene: p2's skeletons is the fresh unit about to act, p1 is
 * off-turn with Prayer in hand. Every other unit has already acted, so only
 * griffins (p1) and skeletons (p2) contend for the activation slot.
 */
function stealScene(seed: string, griffinsInitiative: number, skeletonsInitiative: number): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== "unit_p2_skeletons";
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.attacksThisActivation = 0;
    unit.abilities = [];
  }
  combat.units.unit_p1_griffins.initiative = griffinsInitiative;
  combat.units.unit_p2_skeletons.initiative = skeletonsInitiative;
  combat.activeUnitId = "unit_p2_skeletons";
  state.activePlayerId = "p2";
  state.phase = "combat";
  state.players.p1.hand = ["spell.prayer"];
  state.players.p2.hand = [];
  return state;
}

describe("Prayer — option 2 (+initiative) is a whole-Combat buff cast as a Spell", () => {
  it("data: the initiative arm is a trigger-free, friendly-unit, whole-combat CREATE_INITIATIVE_BUFF", () => {
    const prayer = cardLibrary["spell.prayer"];
    expect(prayer.effect.type).toBe("CHOOSE_ONE");
    if (prayer.effect.type === "CHOOSE_ONE") {
      const arm = prayer.effect.options[2];
      expect(arm?.effect.type).toBe("CREATE_INITIATIVE_BUFF");
      // No trigger (it is not a reaction rider) and its own friendly-unit target.
      expect(arm?.trigger).toBeUndefined();
      expect(arm?.target).toEqual({ type: "friendly-unit" });
      if (arm?.effect.type === "CREATE_INITIATIVE_BUFF") {
        // Lasts the whole combat — unlike the one-attack +attack/+defense arms.
        expect(arm.effect.duration).toEqual({ type: "combat" });
      }
    }
  });

  it("is offered as a Spell cast on your own turn AND off-turn — but never the triggered arms", () => {
    // On-turn: p1's griffins is active.
    const onTurn = freshCombat("prayer2-offer-on", "unit_p1_griffins", "p1");
    onTurn.players.p1.hand = ["spell.prayer"];
    const onTurnCasts = getLegalActions(onTurn, "p1").filter(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.prayer"
    );
    expect(onTurnCasts.length, "Prayer +initiative should be a direct cast on your turn").toBeGreaterThan(0);
    // Only the +initiative arm is a direct cast; +attack (0) / +defense (1) are not.
    expect(
      onTurnCasts.every((legal) => legal.action.type === "CAST_SPELL" && legal.action.optionIndex === 2),
      "the +attack/+defense arms must NOT be offered as a direct cast"
    ).toBe(true);

    // Off-turn: p2's skeletons is active; p1 may cast before it moves.
    const offTurn = freshCombat("prayer2-offer-off", "unit_p2_skeletons", "p2");
    offTurn.players.p1.hand = ["spell.prayer"];
    const offTurnCast = getLegalActions(offTurn, "p1").some(
      (legal) =>
        legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.prayer" && legal.action.optionIndex === 2
    );
    expect(offTurnCast, "Prayer +initiative is castable off-turn before the enemy unit acts").toBe(true);
  });

  it("raises the chosen friendly unit's effective Initiative for the rest of the combat (Power 0 → +1)", () => {
    const state = freshCombat("prayer2-buff", "unit_p1_griffins", "p1");
    state.players.p1.hand = ["spell.prayer"];
    const base = effectiveInitiative(state.combat!.units.unit_p1_griffins, state.activeEffects);
    const cast = prayerInitCast(state, "p1", "unit_p1_griffins");
    expect(cast, "Prayer +initiative should be castable on a friendly unit").toBeTruthy();
    const resolved = passAllReactions(applyOk(state, cast!));
    expect(effectiveInitiative(resolved.combat!.units.unit_p1_griffins, resolved.activeEffects)).toBe(base + 1);
  });

  it("scales with Power paid into the cast (Power 2 → +2 initiative)", () => {
    const state = freshCombat("prayer2-power", "unit_p1_griffins", "p1");
    state.players.p1.hand = ["spell.prayer", "stat.power", "stat.power"];
    const base = effectiveInitiative(state.combat!.units.unit_p1_griffins, state.activeEffects);
    let current = applyOk(state, prayerInitCast(state, "p1", "unit_p1_griffins")!);
    current = payPower(current, "p1", 2);
    expect(current.stack[0]?.modifiers.spellPowerBonus, "two Power paid into the cast").toBe(2);
    const resolved = passAllReactions(current);
    // amountByPower[2] = +2 — proves it scales, not a fixed printed number.
    expect(effectiveInitiative(resolved.combat!.units.unit_p1_griffins, resolved.activeEffects)).toBe(base + 2);
  });
});

describe("Prayer — option 2 steals the enemy's turn when it out-paces them", () => {
  it("an off-turn +initiative cast that out-paces the about-to-act enemy unit takes its activation", () => {
    const scene = stealScene("prayer2-steal", 5, 5); // griffins 5, skeletons 5 (active)
    const cast = prayerInitCast(scene, "p1", "unit_p1_griffins");
    expect(cast, "Prayer +initiative should be castable off-turn").toBeTruthy();
    const resolved = applyOk(scene, cast!); // no reactions available → resolves at once
    // +1 lifts griffins to 6 > skeletons' 5: griffins steals the activation.
    expect(resolved.combat!.activeUnitId).toBe("unit_p1_griffins");
    // The pre-empted enemy unit has not acted — it resumes later this round.
    expect(resolved.combat!.units.unit_p2_skeletons.activatedThisRound).toBe(false);
  });

  it("control: a +1 buff that does NOT out-pace the enemy unit leaves its turn untouched", () => {
    const scene = stealScene("prayer2-no-steal", 3, 5); // griffins 3 → 4, still slower than skeletons' 5
    const resolved = applyOk(scene, prayerInitCast(scene, "p1", "unit_p1_griffins")!);
    expect(resolved.combat!.activeUnitId, "the enemy keeps its activation when not out-paced").toBe(
      "unit_p2_skeletons"
    );
    // The buff still landed (griffins is faster than before) — it just didn't cut in.
    expect(effectiveInitiative(resolved.combat!.units.unit_p1_griffins, resolved.activeEffects)).toBe(4);
  });
});
