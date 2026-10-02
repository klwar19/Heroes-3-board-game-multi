/**
 * Unit Experience revisions (user rulings 2026-09-27) that had no behaviour
 * coverage: Black Dragons R3 Wheeling Retreat, Hydras R3 Venomous Heads / R4
 * Venom Ward, Wyverns R3 Venom Hunter, Arch Devils R1 Devil's Luck and R3
 * Petrifying Curse, Manticores R1 (no heal on the Retaliation it takes) and
 * the Rune Keeper's Rune Ritual (+1 Speed at Level 1, a 1-HP heal pick at every
 * Rune Level). Every rule is asserted against a CONTROL where the old and new
 * behaviour diverge.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  makeCombatUnitFromArmy,
  makeCommanderCombatUnit,
  type CombatUnitState,
  type GameAction,
  type GameState,
} from "./index";
import { effectiveInitiative, getActiveAttackBonus, makeActiveEffect } from "./active-effects";
import { canUnitMoveAndAttack, getLegalMoveDestinations } from "./legal-actions";
import { footprintAt } from "./hex-footprint";
import { gainRunes, seedRunesForCombat } from "./runes";
import { noteUnitDamagedForTokens, placeCombatToken, PETRIFYING_CURSE_SOURCE, unitIsPetrified } from "./tokens";
import { DEVIL_LUCK_CURSE_NAME } from "./town-veterancy";
import type { CommanderSlug } from "@/data/commanders";

const ATTACKER = "unit_p1_marksmen";
const DEFENDER = "unit_p2_skeletons";
const DRAGON = "unit_p1_griffins";
const RETURN = "town-black-dragon-return";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass reactions / keep rolls until the table waits on a player decision. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety-- > 0) {
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1,
      });
      continue;
    }
    break;
  }
  return current;
}

/** Sandbox with every unit knocked out (and parked on cell 0) until placed. */
function fresh(seed: string, options: { hexBattlefield?: boolean } = {}): GameState {
  const state = createInitialGameState(seed, options);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  for (const unit of Object.values(state.combat!.units)) {
    Object.assign(unit, { abilities: [], attack: 0, defense: 0, maxHealth: 80, damage: 80, position: 0 });
  }
  return state;
}

function place(state: GameState, id: string, values: Partial<CombatUnitState>): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, { damage: 0, maxHealth: 80, ...values });
  return unit;
}

function script(state: GameState, face: number): void {
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => face);
  state.combat!.dice.rollCount = 0;
}

function arm(state: GameState, unitId: string): void {
  const unit = state.combat!.units[unitId];
  Object.assign(unit, { attackedThisActivation: false, attacksThisActivation: 0, activatedThisRound: false });
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = unitId;
  state.phase = "combat";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.stack = [];
}

function attack(state: GameState, attackerId = ATTACKER, defenderId = DEFENDER): GameState {
  arm(state, attackerId);
  return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId, defenderId }));
}

function elementalRequest(state: GameState) {
  const choice = state.pendingChoice;
  return choice?.type === "OPTION_CHOICE" && choice.context === "elemental-veterancy"
    ? choice.elementalChoice
    : undefined;
}

function choose(state: GameState, optionIndex: number): GameState {
  const choice = state.pendingChoice!;
  return settle(applyOk(state, { type: "CHOOSE_OPTION", playerId: choice.playerId, choiceId: choice.id, optionIndex }));
}

// ---------------------------------------------------------------------------
// Black Dragons R3 — Wheeling Retreat (+1 Initiative, keeps Hunt the Slow)
// ---------------------------------------------------------------------------

/** A real Dungeon Black Dragons card (rank folded from XP) facing hard-hitting Skeletons. */
function dragonDuel(seed: string, experience: number, options: { hexBattlefield?: boolean } = {}): GameState {
  const state = fresh(seed, options);
  const start = options.hexBattlefield ? 148 : 5;
  const dragon = makeCombatUnitFromArmy(
    { id: "bd", unitDefId: "dungeon.black_dragons", side: "few", experience },
    "p1",
    DRAGON,
    start,
    "legacy",
  )!;
  state.combat!.units[DRAGON] = dragon;
  place(state, DEFENDER, { controllerId: "p2", position: options.hexBattlefield ? 142 : 13, attack: 6, defense: 0 });
  script(state, 0);
  arm(state, DRAGON);
  return state;
}

function moveThenAttack(state: GameState, destination: number): GameState {
  const moved = applyOk(state, { type: "MOVE_UNIT", playerId: "p1", unitId: DRAGON, destination });
  return settle(applyOk(moved, { type: "ATTACK_UNIT", playerId: "p1", attackerId: DRAGON, defenderId: DEFENDER }));
}

describe("Black Dragons R3 — Wheeling Retreat", () => {
  it("returns to the activation's start space only after the Retaliation (CONTROL: R2 never offers it)", () => {
    let state = moveThenAttack(dragonDuel("bd-return", 19), 9);
    const request = elementalRequest(state);
    expect(request?.request).toMatchObject({ kind: "return-origin", abilityId: RETURN, position: 5 });
    expect(request?.picks).toEqual([{ position: 5 }, { skip: true }]);
    // The Skeletons already struck back (6 Attack vs 3 Defense) before the offer.
    expect(state.combat!.units[DEFENDER].retaliatedThisRound).toBe(true);
    expect(state.combat!.units[DRAGON].damage).toBe(3);
    state = choose(state, 0);
    expect(state.combat!.units[DRAGON].position).toBe(5);
    expect(state.eventLog.some((event) => event.type === "UNIT_MOVED" && event.sourceAbilityId === RETURN && event.from === 9 && event.to === 5)).toBe(true);

    const rankTwo = moveThenAttack(dragonDuel("bd-return-r2", 13), 9);
    expect(elementalRequest(rankTwo)).toBeUndefined();
    expect(rankTwo.combat!.units[DRAGON].position).toBe(9);
    // R3 is +1 Initiative (was +2) on top of R2.
    expect(dragonDuel("bd-init-r3", 19).combat!.units[DRAGON].initiative)
      .toBe(dragonDuel("bd-init-r2", 13).combat!.units[DRAGON].initiative + 1);
  });

  it("is held behind another post-attack pick until the Retaliation has resolved", () => {
    const state = dragonDuel("bd-hold", 19);
    state.combat!.units[DRAGON].abilities.push("veteran-minotaur-cleave");
    place(state, "unit_p2_vampires", { controllerId: "p2", position: 14 });
    let next = moveThenAttack(state, 9);
    // The Cleave pick of the same hit opens first; the Dragon is not yet retaliated.
    expect(elementalRequest(next)?.request.kind).toBe("veteran-cleave");
    expect(next.combat!.units[DRAGON].damage).toBe(0);
    next = choose(next, 0);
    expect(elementalRequest(next)?.request).toMatchObject({ kind: "return-origin", abilityId: RETURN });
    expect(next.combat!.units[DRAGON].damage).toBe(3);
  });

  it("CONTROLS: an occupied start space or a Dragon killed by the Retaliation gets no offer", () => {
    const blocked = dragonDuel("bd-blocked", 19);
    const moved = applyOk(blocked, { type: "MOVE_UNIT", playerId: "p1", unitId: DRAGON, destination: 9 });
    place(moved, "unit_p1_crusaders", { controllerId: "p1", position: 5 });
    const blockedAfter = settle(applyOk(moved, { type: "ATTACK_UNIT", playerId: "p1", attackerId: DRAGON, defenderId: DEFENDER }));
    expect(elementalRequest(blockedAfter)).toBeUndefined();
    expect(blockedAfter.combat!.units[DRAGON].position).toBe(9);

    const doomed = dragonDuel("bd-dies", 19);
    doomed.combat!.units[DRAGON].damage = doomed.combat!.units[DRAGON].maxHealth - 1;
    place(doomed, "unit_p1_crusaders", { controllerId: "p1", position: 2 });
    const dead = moveThenAttack(doomed, 9);
    expect(dead.combat!.units[DRAGON].damage).toBeGreaterThanOrEqual(dead.combat!.units[DRAGON].maxHealth);
    expect(elementalRequest(dead)).toBeUndefined();
  });

  it("a Berserk MOVE_AND_ATTACK_UNIT also offers the return to the activation's start space", () => {
    const state = dragonDuel("bd-berserk", 19);
    state.combat!.units[DRAGON].activationStartPosition = 5;
    state.activeEffects.push(
      makeActiveEffect(
        state,
        { name: "Berserk", scope: "unit", duration: { type: "combat" }, polarity: "negative", removable: true, modifiers: [{ type: "BERSERK_FORCED_ATTACK" }] },
        { type: "system" },
        "p2",
        { type: "unit", unitId: DRAGON },
      ),
    );
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "MOVE_AND_ATTACK_UNIT" && legal.action.destination === 9,
    );
    expect(offered).toBe(true);
    const next = settle(applyOk(state, { type: "MOVE_AND_ATTACK_UNIT", playerId: "p1", attackerId: DRAGON, destination: 9, defenderId: DEFENDER }));
    expect(elementalRequest(next)?.request).toMatchObject({ kind: "return-origin", abilityId: RETURN, position: 5 });
    expect(next.combat!.units[DRAGON].damage).toBe(3);
  });

  it("hex board: the two-hex footprint returns whole, and a blocked tail hex refuses it", () => {
    for (const blockTail of [false, true]) {
      const state = dragonDuel(`bd-hex-${blockTail}`, 19, { hexBattlefield: true });
      const combat = state.combat!;
      const dragon = combat.units[DRAGON];
      const startCells = footprintAt(combat, dragon, dragon.position)!;
      expect(startCells).toHaveLength(2);
      const destination = getLegalMoveDestinations(combat, dragon, state).find(
        (cell) =>
          canUnitMoveAndAttack(combat, dragon, cell, combat.units[DEFENDER], state) &&
          !(footprintAt(combat, dragon, cell) ?? []).some((c) => startCells.includes(c)),
      )!;
      expect(destination).toBeDefined();
      const moved = applyOk(state, { type: "MOVE_UNIT", playerId: "p1", unitId: DRAGON, destination });
      if (blockTail) place(moved, "unit_p1_crusaders", { controllerId: "p1", position: startCells[1] });
      let after = settle(applyOk(moved, { type: "ATTACK_UNIT", playerId: "p1", attackerId: DRAGON, defenderId: DEFENDER }));
      if (blockTail) {
        expect(elementalRequest(after)).toBeUndefined();
        continue;
      }
      expect(elementalRequest(after)?.request).toMatchObject({ kind: "return-origin", position: startCells[0] });
      after = choose(after, 0);
      expect(footprintAt(after.combat!, after.combat!.units[DRAGON], after.combat!.units[DRAGON].position)).toEqual(startCells);
    }
  });
});

// ---------------------------------------------------------------------------
// Hydras R3 / R4 and Wyverns R3 — poison cubes
// ---------------------------------------------------------------------------

type DuelOptions = {
  face: number;
  attacker?: string[];
  defender?: string[];
  attackerCubes?: number;
  defenderCubes?: number;
};

/**
 * p1 (Attack 4) strikes p2 Skeletons (Attack 3, Defense 0), which retaliate and
 * then activate next — so a cube on them ticks within the same action.
 */
function poisonDuel(seed: string, options: DuelOptions): GameState {
  const state = fresh(seed);
  place(state, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 4, abilities: options.attacker ?? [], poisonCubes: options.attackerCubes ?? 0 });
  place(state, DEFENDER, { controllerId: "p2", position: 10, type: "ground", attack: 3, abilities: options.defender ?? [], poisonCubes: options.defenderCubes ?? 0 });
  script(state, options.face);
  return attack(state);
}

const poisonTicks = (state: GameState, unitId: string) =>
  state.eventLog.filter((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "wyvern-poison-cube" && event.targetUnitId === unitId).length;
const damageOf = (state: GameState, unitId: string) => state.combat!.units[unitId].damage;

describe("Hydras R3 — Venomous Heads", () => {
  it("own attack on a 0 or +1 leaves a cube that bleeds 1 at the enemy's activation (CONTROLS: -1 face, no ability)", () => {
    const zero = poisonDuel("hy-bite-0", { face: 0, attacker: ["town-hydra-venom-bite"] });
    const zeroControl = poisonDuel("hy-bite-0-ctrl", { face: 0 });
    expect(zero.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "town-hydra-venom-bite")).toBe(true);
    expect(poisonTicks(zero, DEFENDER)).toBe(1);
    expect(poisonTicks(zeroControl, DEFENDER)).toBe(0);
    expect(damageOf(zero, DEFENDER)).toBe(damageOf(zeroControl, DEFENDER) + 1);

    const plus = poisonDuel("hy-bite-plus", { face: 1, attacker: ["town-hydra-venom-bite"] });
    expect(poisonTicks(plus, DEFENDER)).toBe(1);
    const minus = poisonDuel("hy-bite-minus", { face: -1, attacker: ["town-hydra-venom-bite"] });
    expect(poisonTicks(minus, DEFENDER)).toBe(0);
    expect(minus.combat!.units[DEFENDER].poisonCubes ?? 0).toBe(0);
  });

  it("stacks with a Wyvern cube already on the target, and never fires on the Hydra's Retaliation", () => {
    const stacked = poisonDuel("hy-bite-stack", { face: 0, attacker: ["town-hydra-venom-bite"], defenderCubes: 1 });
    const wyvernOnly = poisonDuel("hy-bite-stack-ctrl", { face: 0, defenderCubes: 1 });
    // One cube ticks at the activation either way; the Hydra's second cube stays.
    expect(stacked.combat!.units[DEFENDER].poisonCubes).toBe(1);
    expect(wyvernOnly.combat!.units[DEFENDER].poisonCubes ?? 0).toBe(0);

    const retaliation = poisonDuel("hy-bite-retaliation", { face: 0, defender: ["town-hydra-venom-bite"] });
    expect(retaliation.combat!.units[ATTACKER].poisonCubes ?? 0).toBe(0);
    expect(retaliation.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "town-hydra-venom-bite")).toBe(false);
  });
});

describe("Hydras R4 — Venom Ward", () => {
  it("a poisoned enemy deals 1 less damage to the Hydra, attacking or retaliating (CONTROLS: clean enemy, no ward)", () => {
    const struck = poisonDuel("hy-ward-attack", { face: 0, defender: ["town-hydra-venom-ward"], attackerCubes: 1 });
    const cleanAttacker = poisonDuel("hy-ward-attack-clean", { face: 0, defender: ["town-hydra-venom-ward"] });
    const noWard = poisonDuel("hy-ward-attack-noward", { face: 0, attackerCubes: 1 });
    expect(damageOf(struck, DEFENDER)).toBe(damageOf(cleanAttacker, DEFENDER) - 1);
    expect(damageOf(noWard, DEFENDER)).toBe(damageOf(cleanAttacker, DEFENDER));

    // The Hydra attacks a poisoned enemy: that enemy's Retaliation Attack lands for 1 less.
    const retaliated = poisonDuel("hy-ward-retaliation", { face: 0, attacker: ["town-hydra-venom-ward"], defenderCubes: 1 });
    const retaliatedClean = poisonDuel("hy-ward-retaliation-clean", { face: 0, attacker: ["town-hydra-venom-ward"] });
    expect(damageOf(retaliated, ATTACKER)).toBe(damageOf(retaliatedClean, ATTACKER) - 1);
  });
});

describe("Wyverns R3 — Venom Hunter", () => {
  it("+1 Attack into poisoned prey and a poisoned enemy strikes it at -1 (CONTROL: clean enemy)", () => {
    // Wyvern attacks: +1 into the poisoned target (the extra 1 of the tick is in both).
    const hunt = poisonDuel("wy-hunt", { face: 0, attacker: ["town-wyvern-venom-hunter"], defenderCubes: 1 });
    const huntControl = poisonDuel("wy-hunt-ctrl", { face: 0, defenderCubes: 1 });
    expect(damageOf(hunt, DEFENDER)).toBe(damageOf(huntControl, DEFENDER) + 1);
    // …and that poisoned target's Retaliation is at -1 against the Wyvern.
    expect(damageOf(hunt, ATTACKER)).toBe(damageOf(huntControl, ATTACKER) - 1);

    // A poisoned attacker strikes the Wyvern at -1; the Wyvern's Retaliation is at +1.
    const hunted = poisonDuel("wy-hunted", { face: 0, defender: ["town-wyvern-venom-hunter"], attackerCubes: 1 });
    const huntedControl = poisonDuel("wy-hunted-ctrl", { face: 0, defender: ["town-wyvern-venom-hunter"] });
    expect(damageOf(hunted, DEFENDER)).toBe(damageOf(huntedControl, DEFENDER) - 1);
    expect(damageOf(hunted, ATTACKER)).toBe(damageOf(huntedControl, ATTACKER) + 1);
  });
});

// ---------------------------------------------------------------------------
// Arch Devils R1 — Devil's Luck (no curse since 2026-09-29), R3 — Petrifying Curse
// ---------------------------------------------------------------------------

const DEVIL = "unit_p2_vampires";
const DEVIL_TWO = "unit_p2_dread_knights";

/** p1 (Attack 4) against Skeletons that never act back; `devils` enemy Arch Devils watch. */
function luckState(seed: string, devils: number): GameState {
  const state = fresh(seed);
  place(state, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 4, initiative: 20 });
  place(state, DEFENDER, { controllerId: "p2", position: 10, type: "ground", attack: 0, initiative: 1, activatedThisRound: true });
  for (const [index, id] of [DEVIL, DEVIL_TWO].entries()) {
    if (index < devils) place(state, id, { controllerId: "p2", position: 18 + index, abilities: ["town-devil-luck"], initiative: 1, activatedThisRound: true });
  }
  return state;
}

function strike(state: GameState, face: number): { state: GameState; dealt: number } {
  script(state, face);
  const before = damageOf(state, DEFENDER);
  const next = attack(state);
  return { state: next, dealt: damageOf(next, DEFENDER) - before };
}

const curses = (state: GameState) => state.activeEffects.filter((effect) => effect.name === DEVIL_LUCK_CURSE_NAME);

describe("Arch Devils R1 — Devil's Luck", () => {
  // User ruling 2026-09-29: twice per combat round a +1 gets -1 Attack for THAT
  // attack only — no lingering 2-round curse (the 2026-09-27 rule).
  it("twice per round a +1 gets -1 for that attack only; no curse is laid", () => {
    const control = strike(luckState("dl-ctrl", 0), 1).dealt;
    let { state, dealt } = strike(luckState("dl-first", 1), 1);
    expect(dealt).toBe(control - 1);
    expect(curses(state)).toHaveLength(0);
    expect(state.combat!.units[DEVIL].townVeterancy?.devilLuckUses).toBe(1);

    // No flat Attack penalty: a "0" hits normally and spends nothing.
    const zeroControl = strike(luckState("dl-zero-ctrl", 0), 0).dealt;
    ({ state, dealt } = strike(state, 0));
    expect(dealt).toBe(zeroControl);
    expect(state.combat!.units[DEVIL].townVeterancy?.devilLuckUses).toBe(1);

    // The second +1 spends the second use.
    ({ state, dealt } = strike(state, 1));
    expect(dealt).toBe(control - 1);
    expect(state.combat!.units[DEVIL].townVeterancy?.devilLuckUses).toBe(2);

    // A third +1 in the same round gets no -1 (the old curse would still apply it).
    ({ state, dealt } = strike(state, 1));
    expect(dealt).toBe(control);
    expect(state.combat!.units[DEVIL].townVeterancy?.devilLuckUses).toBe(2);
    expect(curses(state)).toHaveLength(0);

    // Next round the +1 again SPENDS a fresh use (a curse would apply it for free).
    state.combat!.round += 1;
    ({ state, dealt } = strike(state, 1));
    expect(dealt).toBe(control - 1);
    expect(state.combat!.units[DEVIL].townVeterancy).toMatchObject({ devilLuckRound: state.combat!.round, devilLuckUses: 1 });

    // Nothing outlives the devil: once it is dead a +1 hits normally.
    state.combat!.units[DEVIL].damage = state.combat!.units[DEVIL].maxHealth;
    ({ state, dealt } = strike(state, 1));
    expect(dealt).toBe(control);
  });

  it("never stacks: two watching devils still give a single -1, the second devil taking over once the first is spent", () => {
    const control = strike(luckState("dl2-ctrl", 0), 1).dealt;
    let { state, dealt } = strike(luckState("dl2", 2), 1);
    expect(dealt).toBe(control - 1);
    ({ state, dealt } = strike(state, 1));
    expect(dealt).toBe(control - 1);
    expect(curses(state)).toHaveLength(0);
    expect(state.combat!.units[DEVIL].townVeterancy?.devilLuckUses).toBe(2);
    expect(state.combat!.units[DEVIL_TWO].townVeterancy?.devilLuckUses).toBeUndefined();
    ({ state, dealt } = strike(state, 1));
    expect(dealt).toBe(control - 1);
    expect(state.combat!.units[DEVIL_TWO].townVeterancy?.devilLuckUses).toBe(1);
  });
});

describe("Arch Devils R3 — Petrifying Curse", () => {
  function petrifyHit(seed: string, face: number, abilities: string[]): { state: GameState; dealt: number } {
    const state = fresh(seed);
    place(state, ATTACKER, { controllerId: "p1", position: 9, type: "ground", attack: 4, initiative: 20, abilities });
    place(state, DEFENDER, { controllerId: "p2", position: 10, type: "ground", attack: 0, initiative: 1, activatedThisRound: true });
    return strike(state, face);
  }

  it("-1 paralyzes (petrified look), 0 adds +1 Attack (CONTROLS: no ability, +1 face)", () => {
    const petrify = ["town-devil-petrify"];
    const minus = petrifyHit("pc-minus", -1, petrify);
    expect(minus.state.combat!.units[DEFENDER].tokens).toEqual([expect.objectContaining({ kind: "paralysis", sourceName: PETRIFYING_CURSE_SOURCE })]);
    expect(unitIsPetrified(minus.state.combat!.units[DEFENDER])).toBe(true);
    expect(petrifyHit("pc-minus-ctrl", -1, []).state.combat!.units[DEFENDER].tokens ?? []).toEqual([]);

    expect(petrifyHit("pc-zero", 0, petrify).dealt).toBe(petrifyHit("pc-zero-ctrl", 0, []).dealt + 1);
    expect(petrifyHit("pc-zero", 0, petrify).state.combat!.units[DEFENDER].tokens ?? []).toEqual([]);
    expect(petrifyHit("pc-plus", 1, petrify).dealt).toBe(petrifyHit("pc-plus-ctrl", 1, []).dealt);
  });

  it("the grey look follows that Paralysis token only and clears with it", () => {
    const state = fresh("pc-token");
    const unit = place(state, DEFENDER, { controllerId: "p2", position: 10 });
    placeCombatToken(state, unit, "paralysis", 0, "Petrifying Hide");
    expect(unitIsPetrified(unit)).toBe(false);
    unit.tokens = [];
    placeCombatToken(state, unit, "paralysis", 0, PETRIFYING_CURSE_SOURCE);
    expect(unitIsPetrified(unit)).toBe(true);
    noteUnitDamagedForTokens(state, unit, 1);
    expect(unitIsPetrified(unit)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Manticores R1 — Mending Hide
// ---------------------------------------------------------------------------

describe("Manticores R1 — Mending Hide", () => {
  it("heals after being attacked, but not after taking a Retaliation for its own attack", () => {
    const MEND = ["veteran-manticore-mend"];
    const attacked = poisonDuel("mt-attacked", { face: 0, defender: MEND });
    const attackedControl = poisonDuel("mt-attacked-ctrl", { face: 0 });
    expect(damageOf(attacked, DEFENDER)).toBe(damageOf(attackedControl, DEFENDER) - 1);

    const retaliated = poisonDuel("mt-retaliated", { face: 0, attacker: MEND });
    expect(damageOf(retaliated, ATTACKER)).toBeGreaterThan(0);
    expect(damageOf(retaliated, ATTACKER)).toBe(damageOf(attackedControl, ATTACKER));
    expect(retaliated.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "veteran-manticore-mend")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rune Keeper (Bulwark commander) — Rune Ritual
// ---------------------------------------------------------------------------

function keeperSandbox(slug: CommanderSlug, runes: { count: number; appliedLevel: number }, sieidi = false): { state: GameState; commanderId: string } {
  const state = createInitialGameState(`rk-${slug}-${runes.appliedLevel}`);
  state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
  state.players.p1.commander = { slug, grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0 } };
  const commander = makeCommanderCombatUnit(state.players.p1, 9)!;
  state.combat!.units[commander.id] = commander;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.factionId = "bulwark";
  state.towns.town_p1.factionId = "bulwark";
  if (sieidi) state.towns.town_p1.buildings.push("bulwark.sieidi");
  state.combat!.runes = { p1: { count: runes.count, reserve: 0, appliedLevel: runes.appliedLevel } };
  state.combat!.units[ATTACKER].damage = 2;
  state.combat!.activeUnitId = commander.id;
  state.activePlayerId = "p1";
  return { state, commanderId: commander.id };
}

describe("Rune Keeper — Rune Ritual (user ruling 2026-09-30: ONLY +1 Rune per move, +3 per attack received)", () => {
  it("Level 1 reached by the Keeper's move: no Keeper-only +1 Speed and no 1-HP heal pick", () => {
    const { state, commanderId } = keeperSandbox("bulwark", { count: 8, appliedLevel: 0 });
    const baseInitiative = effectiveInitiative(state.combat!.units[commanderId], state.activeEffects, state.combat);
    // The commander's move banks the ninth Rune (the +1-per-move half still works).
    const next = applyOk(state, { type: "MOVE_UNIT", playerId: "p1", unitId: commanderId, destination: 10 });
    expect(next.combat!.runes!.p1.appliedLevel).toBe(1);
    const commander = next.combat!.units[commanderId];
    // Removed rider: the Keeper's Initiative is unchanged (was +1).
    expect(effectiveInitiative(commander, next.activeEffects, next.combat) - baseInitiative).toBe(0);
    expect(next.activeEffects.some((effect) => effect.name === "Rune Keeper's Rune Swiftness")).toBe(false);
    // The army-wide Level 1 Rune Power (+1 Attack) is untouched.
    expect(getActiveAttackBonus(next, { attacker: commander, defender: next.combat!.units[DEFENDER], attackKind: "melee" })).toBe(1);
    // Removed rider: no heal pick is queued (the damaged ally stays damaged).
    expect(elementalRequest(next)).toBeUndefined();
    expect(next.combat!.elementalChoices ?? []).toEqual([]);
    expect(next.combat!.units[ATTACKER].damage).toBe(2);
  });

  it("later Rune Levels queue nothing either", () => {
    const { state, commanderId } = keeperSandbox("bulwark", { count: 8, appliedLevel: 1 }, true);
    const next = applyOk(state, { type: "MOVE_UNIT", playerId: "p1", unitId: commanderId, destination: 10 });
    expect(next.combat!.runes!.p1.appliedLevel).toBe(2);
    expect(elementalRequest(next)).toBeUndefined();
    const keeper = keeperSandbox("bulwark", { count: 8, appliedLevel: 0 });
    gainRunes(keeper.state, "p1", 1);
    expect(keeper.state.combat!.runes!.p1.appliedLevel).toBe(1);
    expect(keeper.state.combat!.elementalChoices ?? []).toEqual([]);
  });

  it("an old save's leftover Rune Swiftness rider is cleared when the next combat seeds Runes", () => {
    const { state, commanderId } = keeperSandbox("bulwark", { count: 0, appliedLevel: 0 });
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Rune Keeper's Rune Swiftness",
          scope: "unit",
          modifiers: [{ type: "INITIATIVE_BONUS", amount: 1 }],
          duration: { type: "combat" },
          polarity: "positive",
          removable: false,
        },
        { type: "system" },
        "p1",
        { type: "unit", unitId: commanderId },
      ),
    );
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    seedRunesForCombat(state);
    expect(state.activeEffects.some((effect) => effect.name === "Rune Keeper's Rune Swiftness")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tower Magi R3 — Arcane Recovery (USER RULING 2026-10-01): combat round 1 =
// ANY own attack recovers a discard card; from round 2 only a -1 Attack die.
// ---------------------------------------------------------------------------

describe("Magi R3 — Arcane Recovery", () => {
  function magiShot(seed: string, round: number, face: number): GameState {
    const state = fresh(seed);
    place(state, ATTACKER, { controllerId: "p1", position: 1, type: "ranged", attack: 1, abilities: ["town-magi-recover"] });
    place(state, DEFENDER, { controllerId: "p2", position: 17, defense: 0 });
    state.players.p1.discard = ["stat.attack"];
    state.combat!.round = round;
    script(state, face);
    return attack(state);
  }
  const offered = (state: GameState) => elementalRequest(state)?.request.kind === "town-recover";

  it("round 1 recovers on a +1 die; later rounds only on -1, never on 0 (CONTROLS)", () => {
    expect(offered(magiShot("magi-r1-plus", 1, 1)), "round 1: any own attack").toBe(true);
    expect(offered(magiShot("magi-r2-plus", 2, 1)), "round 2: +1 never").toBe(false);
    expect(offered(magiShot("magi-r2-zero", 2, 0)), "round 2: 0 no longer recovers").toBe(false);
    expect(offered(magiShot("magi-r2-minus", 2, -1)), "round 2: -1 recovers").toBe(true);
    // The pick moves the card from the discard into the hand.
    const picked = choose(magiShot("magi-r1-pick", 1, 1), 0);
    expect(picked.players.p1.hand).toContain("stat.attack");
    expect(picked.players.p1.discard).not.toContain("stat.attack");
  });
});
