/**
 * Necropolis Ghost Dragons veterancy (user spec 2026-09-27):
 *  R1 Dread Aura      — odd rounds, activation die: -1 Paralyze a chosen enemy,
 *                       0 random enemy -1 Defense this round (no stacking), +1 nothing.
 *  R2 Spectral Ward   — immune to every non-damage Spell effect; Spell damage -1.
 *  R3 Withering Touch — own attack die "0": attacked enemy -1 max Health for the
 *                       combat, stacking, carried across Pack→Few flips.
 *
 * Every rule is asserted against a CONTROL where the old and new behaviour
 * diverge (even round, "+1" face, retaliation, unit without the ability).
 */
import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { effectAppliesToUnit, makeActiveEffect } from "./active-effects";
import { veteranAfterAttack } from "./faction-veterancy";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { applyUnitCurrentSide } from "./unit-transforms";
import { spellReactionBlockedByImmunity } from "./legal-actions";
import { cardLibrary } from "@/data/cards/library";
import { rankScheduleFor } from "@/data/units/experience-rank-abilities";
import type { CombatUnitState, GameAction, GameState, PlayerId, SourceRef } from "./state";

const DREAD = "veteran-dragon-dread";
const WARD = "veteran-ghost-dragon-spectral-ward";
const WITHER = "veteran-ghost-dragon-withering-touch";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, { type: "CHOOSE_PENDING_ROLL", playerId: choice.playerId, choiceId: choice.id, candidateIndex: 0 });
    }
  }
  return current;
}

function tokens(state: GameState, unitId: string): string[] {
  return (state.combat?.units[unitId].tokens ?? []).map((token) => token.kind);
}

function enemiesOf(state: GameState, playerId: PlayerId): CombatUnitState[] {
  return Object.values(state.combat!.units).filter((u) => u.controllerId !== playerId && u.damage < u.maxHealth);
}

function dreadEffects(state: GameState) {
  return state.activeEffects.filter((effect) => effect.name === "Dread Aura");
}

function dreadRolls(state: GameState) {
  return state.eventLog.filter((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === `${DREAD}-roll`);
}

// ---------------------------------------------------------------------------
// R1 — Dread Aura
// ---------------------------------------------------------------------------

/** Fresh sandbox where p1's Crusaders stand in for the Ghost Dragons. */
function dreadState(seed: string, round: number, rolls: number[], abilities: string[] = [DREAD]): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.round = round;
  state.combat!.units.unit_p1_crusaders.abilities = abilities;
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
  return state;
}

/** Griffins Defend; the only other un-activated unit (Crusaders) activates next. */
function activateCrusaders(state: GameState): GameState {
  for (const unit of Object.values(state.combat!.units)) {
    unit.activatedThisRound = unit.id !== "unit_p1_crusaders" && unit.id !== "unit_p1_griffins";
  }
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
}

describe("Ghost Dragons R1 — Dread Aura", () => {
  it("die 0 in an odd round: exactly one enemy gets -1 Defense for the current combat round", () => {
    const after = activateCrusaders(dreadState("gd-dread-zero", 1, [0]));
    expect(after.combat!.dice.rollCount).toBe(1);
    const effects = dreadEffects(after);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      duration: { type: "current-combat-round" },
      polarity: "negative",
      modifiers: [expect.objectContaining({ type: "DEFENSE_BONUS", amount: -1 })]
    });
    const target = after.combat!.units[(effects[0].target as { unitId: string }).unitId];
    expect(target.controllerId).toBe("p2");
    // The roll is a real, logged dice cue.
    expect(dreadRolls(after)[0]).toMatchObject({ dice: expect.objectContaining({ rolls: [0] }) });
  });

  it("CONTROL: an even round rolls nothing and changes nothing", () => {
    const after = activateCrusaders(dreadState("gd-dread-even", 2, [0]));
    expect(after.combat!.dice.rollCount).toBe(0);
    expect(dreadRolls(after)).toHaveLength(0);
    expect(dreadEffects(after)).toHaveLength(0);
  });

  it("round 5 still rolls (every odd round, not only 1 and 3)", () => {
    const after = activateCrusaders(dreadState("gd-dread-r5", 5, [0]));
    expect(dreadEffects(after)).toHaveLength(1);
  });

  it("CONTROL: die +1 does nothing; a unit without the ability never rolls", () => {
    const plus = activateCrusaders(dreadState("gd-dread-plus", 1, [1]));
    expect(dreadRolls(plus)).toHaveLength(1);
    expect(dreadEffects(plus)).toHaveLength(0);
    expect(plus.pendingChoice).toBeFalsy();
    expect(enemiesOf(plus, "p1").some((u) => tokens(plus, u.id).includes("paralysis"))).toBe(false);

    const plain = activateCrusaders(dreadState("gd-dread-plain", 1, [0], []));
    expect(plain.combat!.dice.rollCount).toBe(0);
    expect(dreadEffects(plain)).toHaveLength(0);
  });

  it("die 0 never stacks: an enemy already under Dread Aura is not picked again", () => {
    const state = dreadState("gd-dread-nostack", 1, [0]);
    for (const enemy of enemiesOf(state, "p1")) {
      state.activeEffects.push(
        makeActiveEffect(
          state,
          { name: "Dread Aura", scope: "unit", duration: { type: "current-combat-round" }, polarity: "negative", removable: true, modifiers: [{ type: "DEFENSE_BONUS", amount: -1 }] },
          { type: "unit", unitId: "unit_p1_crusaders", controllerId: "p1" },
          "p1",
          { type: "unit", unitId: enemy.id }
        )
      );
    }
    const before = dreadEffects(state).length;
    const after = activateCrusaders(state);
    expect(dreadEffects(after)).toHaveLength(before);
  });

  it("die -1: the owner chooses an enemy to Paralyze; strongest first, immune units excluded", () => {
    const state = dreadState("gd-dread-minus", 1, [-1]);
    const [strong, immune] = ["unit_p2_dread_knights", "unit_p2_vampires"];
    Object.assign(state.combat!.units[strong], { attack: 30 });
    state.combat!.units[immune].abilities = ["ignore-paralysis"];
    const after = activateCrusaders(state);
    const choice = after.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") return;
    expect(choice.context).toBe("elemental-veterancy");
    expect(choice.elementalChoice?.request.kind).toBe("dread-paralyze");
    const picks = choice.elementalChoice!.picks.map((pick) => pick.targetId);
    expect(picks[0]).toBe(strong);
    expect(picks).not.toContain(immune);
    expect(picks.some((id) => id?.startsWith("unit_p1_"))).toBe(false);
    // No "Skip": the Paralysis is mandatory.
    expect(choice.options.some((option) => /skip/i.test(option.label))).toBe(false);

    const resolved = applyOk(after, { type: "CHOOSE_OPTION", playerId: choice.playerId, choiceId: choice.id, optionIndex: 0 });
    expect(tokens(resolved, strong)).toContain("paralysis");
    expect(enemiesOf(resolved, "p1").filter((u) => tokens(resolved, u.id).includes("paralysis"))).toHaveLength(1);
    expect(dreadEffects(resolved)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// R2 — Spectral Ward
// ---------------------------------------------------------------------------

function castState(seed: string, hand: string[], wardOn: string | null): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = hand;
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  for (const unit of Object.values(state.combat!.units)) Object.assign(unit, { maxHealth: 30, damage: 0 });
  state.combat!.units.unit_p2_skeletons.abilities = wardOn ? [wardOn] : [];
  return state;
}

function castAt(state: GameState, cardId: string, unitId: string) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function lightningDamage(ward: boolean): number {
  let state = castState(ward ? "gd-ward-bolt" : "gd-ward-bolt-ctrl", ["spell.lightning_bolt"], ward ? WARD : null);
  const cast = castAt(state, "spell.lightning_bolt", "unit_p2_skeletons");
  expect(cast, "a damage Spell must stay castable on the unit").toBeTruthy();
  state = settle(applyOk(state, cast!.action));
  return state.combat!.units.unit_p2_skeletons.damage;
}

describe("Ghost Dragons R2 — Spectral Ward", () => {
  it("a damage Spell still lands, reduced by exactly 1", () => {
    const control = lightningDamage(false);
    expect(control).toBeGreaterThanOrEqual(2);
    expect(lightningDamage(true)).toBe(control - 1);
  });

  it("a no-damage Spell cannot target it (CONTROL: another enemy stays a legal target)", () => {
    const state = castState("gd-ward-slow", ["spell.slow"], WARD);
    expect(castAt(state, "spell.slow", "unit_p2_skeletons")).toBeUndefined();
    expect(castAt(state, "spell.slow", "unit_p2_vampires")).toBeTruthy();
    const control = castState("gd-ward-slow-ctrl", ["spell.slow"], null);
    expect(castAt(control, "spell.slow", "unit_p2_skeletons")).toBeTruthy();
  });

  it("Weakness / Curse reactions are blocked on it (CONTROL: an unwarded unit)", () => {
    for (const [cardId, stat, attackerId, defenderId] of [
      ["spell.weakness", "attack", "unit_p2_skeletons", "unit_p1_griffins"],
      ["spell.curse", "defense", "unit_p1_griffins", "unit_p2_skeletons"]
    ] as const) {
      const event = {
        type: "UNIT_ATTACK_DECLARED",
        playerId: "p1",
        attackerId,
        defenderId,
        isRetaliation: false,
        attackKind: "melee",
        rollMode: "normal"
      } as unknown as Parameters<typeof spellReactionBlockedByImmunity>[3];
      const effect = { type: "ADD_COMBAT_STAT", stat, amount: -1 } as Parameters<typeof spellReactionBlockedByImmunity>[2];
      const warded = castState(`gd-ward-${cardId}`, [], WARD);
      expect(spellReactionBlockedByImmunity(warded, cardLibrary[cardId], effect, event), cardId).toBe(true);
      const control = castState(`gd-ward-${cardId}-ctrl`, [], null);
      expect(spellReactionBlockedByImmunity(control, cardLibrary[cardId], effect, event), `${cardId} control`).toBe(false);
    }
  });

  it("no ongoing Spell effect applies, friendly buffs included; non-Spell effects still do", () => {
    const state = castState("gd-ward-effects", [], WARD);
    const unit = state.combat!.units.unit_p2_skeletons;
    const make = (source: SourceRef, polarity: "positive" | "negative", scope: "unit" | "player") =>
      makeActiveEffect(
        state,
        { name: "probe", scope, duration: { type: "combat" }, polarity, modifiers: [{ type: "ATTACK_BONUS", amount: polarity === "positive" ? 1 : -1 }] },
        source,
        "p2",
        scope === "unit" ? { type: "unit", unitId: unit.id } : undefined
      );
    const blessFromOwner: SourceRef = { type: "card", cardId: "spell.bless", controllerId: "p2" };
    const slowFromEnemy: SourceRef = { type: "card", cardId: "spell.slow", controllerId: "p1" };
    expect(effectAppliesToUnit(make(blessFromOwner, "positive", "unit"), unit)).toBe(false);
    expect(effectAppliesToUnit(make(blessFromOwner, "positive", "player"), unit)).toBe(false);
    expect(effectAppliesToUnit(make(slowFromEnemy, "negative", "unit"), unit)).toBe(false);
    expect(effectAppliesToUnit(make({ type: "system" }, "negative", "unit"), unit)).toBe(true);
    // CONTROL: the same Spell buff reaches an unwarded unit.
    unit.abilities = [];
    expect(effectAppliesToUnit(make(blessFromOwner, "positive", "unit"), unit)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R3 — Withering Touch
// ---------------------------------------------------------------------------

const ATTACKER = "unit_p1_marksmen";
const DEFENDER = "unit_p2_skeletons";

function duel(seed: string, face: number, attackerAbilities: string[], defenderAbilities: string[] = []): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => face);
  state.combat!.dice.rollCount = 0;
  for (const unit of Object.values(state.combat!.units)) {
    Object.assign(unit, { abilities: [], attack: 0, defense: 0, maxHealth: 60, damage: 0, position: 0 });
  }
  Object.assign(state.combat!.units[ATTACKER], { position: 9, abilities: attackerAbilities, attack: 4, type: "ground" });
  Object.assign(state.combat!.units[DEFENDER], { position: 10, abilities: defenderAbilities, attack: 3, defense: 1, type: "ground" });
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = ATTACKER;
  return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: ATTACKER, defenderId: DEFENDER }));
}

describe("Ghost Dragons R3 — Withering Touch", () => {
  it("own attack with a 0 die: the target loses 1 max Health (CONTROLS: +1 die, no ability)", () => {
    const hit = duel("gd-wither", 0, [WITHER]);
    expect(hit.combat!.units[DEFENDER].maxHealth).toBe(59);
    expect(hit.combat!.units[DEFENDER].combatMaxHealthPenalty).toBe(1);

    expect(duel("gd-wither-plus", 1, [WITHER]).combat!.units[DEFENDER].maxHealth).toBe(60);
    expect(duel("gd-wither-none", 0, []).combat!.units[DEFENDER].maxHealth).toBe(60);
  });

  it("CONTROL: a Retaliation Attack with a 0 die withers nothing", () => {
    // The Withering unit is the DEFENDER here; its retaliation rolls "0".
    const after = duel("gd-wither-retaliation", 0, [], [WITHER]);
    const attacker = after.combat!.units[ATTACKER];
    expect(attacker.damage).toBeGreaterThan(0); // the retaliation really happened
    expect(attacker.maxHealth).toBe(60);
    expect(attacker.combatMaxHealthPenalty).toBeUndefined();
  });

  it("stacks, persists across a Pack→Few flip, and a lethal loss routes through the flip path", () => {
    const build = (seed: string) => {
      const state = createInitialGameState(seed);
      const defender = state.combat!.units[DEFENDER];
      Object.assign(defender, { unitDefId: "necropolis.ghost_dragons", variant: "pack", damage: 0, abilities: [] });
      applyUnitCurrentSide(defender, "legacy");
      const attacker = state.combat!.units[ATTACKER];
      attacker.abilities = [WITHER];
      return { state, attacker, defender };
    };

    // Stacking: two triggers, -2.
    const stack = build("gd-wither-stack");
    const packHealth = stack.defender.maxHealth;
    veteranAfterAttack(stack.state, stack.attacker, stack.defender, 0, false);
    veteranAfterAttack(stack.state, stack.attacker, stack.defender, 0, false);
    expect(stack.defender.maxHealth).toBe(packHealth - 2);
    // A cancelled die supplies no face.
    veteranAfterAttack(stack.state, stack.attacker, stack.defender, 0, true);
    expect(stack.defender.maxHealth).toBe(packHealth - 2);

    // CONTROL flip: no penalty, knocked to the Few side.
    const control = build("gd-wither-flip-ctrl");
    control.defender.damage = control.defender.maxHealth;
    markUnitRemovedIfNeeded(control.state, control.defender);
    expect(control.defender.variant).toBe("few");
    const fewHealth = control.defender.maxHealth;
    expect(fewHealth).toBeGreaterThan(1);

    // Pack at 1 HP left: the -1 max Health is lethal → flips, and the Few side keeps -1.
    const flip = build("gd-wither-flip");
    flip.defender.damage = flip.defender.maxHealth - 1;
    veteranAfterAttack(flip.state, flip.attacker, flip.defender, 0, false);
    expect(flip.defender.variant).toBe("few");
    expect(flip.defender.maxHealth).toBe(fewHealth - 1);
  });
});

// ---------------------------------------------------------------------------
// Schedule wiring (only the Necropolis Ghost Dragons changed)
// ---------------------------------------------------------------------------

describe("Ghost Dragons veterancy schedule", () => {
  it("Necropolis Ghost Dragons get Dread Aura / Spectral Ward / Withering Touch; others unchanged", () => {
    const necro = rankScheduleFor("necropolis.ghost_dragons");
    expect(necro[1]).toMatchObject({ kind: "ability", choices: [DREAD] });
    expect(necro[2]).toMatchObject({ kind: "ability", choices: [WARD] });
    expect(necro[3]).toMatchObject({ kind: "ability", choices: [WITHER] });
    expect(necro[4]).toMatchObject({ kind: "ability", choices: ["veteran-dragon-feast"] });
    // Other Ghost Dragons keep their own schedules.
    const neutral = JSON.stringify(rankScheduleFor("neutral.ghost_dragons"));
    expect(neutral).not.toContain(WARD);
    expect(neutral).not.toContain(WITHER);
  });
});
