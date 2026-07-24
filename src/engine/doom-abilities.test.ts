import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, NEUTRAL_PLAYER_ID } from "./index";
import { rollsTwoDiceOnRetaliation, unitHasAttackRollAdvantage } from "./unit-abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId, UnitId } from "./state";

/**
 * Doom neutral-monster slice — every NEW engine arm pinned by an OBSERVABLE
 * combat outcome with a CONTROL (CLAUDE.md §1a), not just by the data tags in
 * doom-mod.test.ts:
 *
 *  1. `doom-demon-retaliation-attack`    — RETALIATION_ATTACK_BONUS +1
 *  2. `doom-former-human-sergeant-double-roll`
 *                                        — ROLL_TWO_DICE_APPLY_BOTH, retaliationAlso
 *                                          (the Champion keeps its single-die
 *                                          retaliation — the regression CONTROL)
 *  3. `doom-mancubus-retaliation-advantage`
 *                                        — ATTACK_ROLL_ADVANTAGE, retaliationOnly
 *  4. `doom-cacodemon-poison`            — ON_ATTACK_DIE_POISON_CUBES (-1/0 gate)
 *  5. `doom-revenant-pre-attack-damage`  — ON_ATTACK_PRE_DAMAGE 1
 *  6. `doom-arachnotron-triple-strike`   — SEQUENCE_ATTACK_SAME_TARGET [2, 1]
 *  7. `doom-spider-mastermind-adjacent-strike`
 *                                        — SECOND_ATTACK_ADJACENT_TO_TARGET, onRoll -1
 *  8. `doom-baron-damage-cap`            — CAP_DAMAGE_PER_ATTACK 4
 *  9. `doom-pain-elemental-summon-lost-soul`
 *                                        — SUMMON_UNIT_ON_ATTACK, incl. the REAL
 *                                          neutral-guard case (no PlayerState
 *                                          exists for the neutral seat) and the
 *                                          no-army-pollution invariant
 * 10. the NEUTRAL-side Arch-Vile auto lethal save (archangel-lethal-save reuse:
 *     the reaction window never opens for the neutral seat, so it auto-uses)
 *
 * Board: 4 columns × 5 rows (position = row * 4 + column), orthogonal adjacency.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Drain reactions and keep the ORIGINAL roll in any reroll window. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

type UnitOverrides = {
  position?: number;
  controllerId?: PlayerId;
  abilities?: string[];
  attack?: number;
  defense?: number;
  maxHealth?: number;
  damage?: number;
  name?: string;
  type?: CombatUnitState["type"];
  variant?: CombatUnitState["variant"];
};

/** Combat sandbox, empty hands, scripted dice. */
function freshCombat(seed: string, rolls: number[]): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = [...rolls, ...Array.from({ length: 30 }, () => 0)];
  state.combat!.dice.rollCount = 0;
  return state;
}

function place(state: GameState, id: string, overrides: UnitOverrides): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, overrides);
  return unit;
}

function unitAt(state: GameState, id: string): CombatUnitState {
  return state.combat!.units[id];
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId })
  );
}

function abilityEvents(state: GameState, abilityId: string): GameEvent[] {
  return state.eventLog.filter(
    (event: GameEvent) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === abilityId
  );
}

function wasRemoved(state: GameState, id: UnitId): boolean {
  return state.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === id);
}

/**
 * A melee exchange: p1's marksmen (attack 3, no abilities) strike the adjacent
 * p2 defender, which retaliates with `defenderAttack` and `defenderAbilities`.
 * Every OTHER sandbox unit is parked far away with no abilities.
 */
function retaliationExchange(options: {
  seed: string;
  defenderAbilities: string[];
  defenderAttack: number;
  rolls: number[];
  attackerAttack?: number;
}): GameState {
  const state = freshCombat(options.seed, options.rolls);
  place(state, "unit_p1_marksmen", {
    position: 1,
    controllerId: "p1",
    abilities: [],
    attack: options.attackerAttack ?? 3,
    defense: 0,
    maxHealth: 40,
    damage: 0,
    type: "ground"
  });
  place(state, "unit_p2_skeletons", {
    position: 5,
    controllerId: "p2",
    abilities: options.defenderAbilities,
    attack: options.defenderAttack,
    defense: 0,
    maxHealth: 40,
    damage: 0,
    type: "ground"
  });
  place(state, "unit_p1_griffins", { position: 16, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
  place(state, "unit_p1_crusaders", { position: 17, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
  place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
  place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
  return attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
}

function attackerDamage(state: GameState): number {
  return unitAt(state, "unit_p1_marksmen").damage;
}

/**
 * p1's marksmen with `attackerAbilities` strike a fat 0-Attack adjacent target
 * (its retaliation exists but deals 0), isolating the attacker-side arm.
 */
function ownAttack(options: {
  seed: string;
  attackerAbilities: string[];
  attackerAttack?: number;
  defenderDefense?: number;
  defenderMaxHealth?: number;
  rolls: number[];
}): GameState {
  const state = freshCombat(options.seed, options.rolls);
  place(state, "unit_p1_marksmen", {
    position: 1,
    controllerId: "p1",
    abilities: options.attackerAbilities,
    attack: options.attackerAttack ?? 3,
    defense: 0,
    maxHealth: 40,
    damage: 0,
    type: "ground"
  });
  place(state, "unit_p2_skeletons", {
    position: 5,
    controllerId: "p2",
    abilities: [],
    attack: 0,
    defense: options.defenderDefense ?? 0,
    maxHealth: options.defenderMaxHealth ?? 30,
    damage: 0,
    type: "ground"
  });
  place(state, "unit_p1_griffins", { position: 16, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
  place(state, "unit_p1_crusaders", { position: 17, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
  place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
  place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
  return attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
}

function defenderDamage(state: GameState): number {
  return unitAt(state, "unit_p2_skeletons").damage;
}

// ---------------------------------------------------------------------------
// 1. Demon — Savage Retaliation (+1 Attack when retaliating)
// ---------------------------------------------------------------------------

describe("Demon Savage Retaliation — +1 Attack on the Retaliation Attack only", () => {
  const DEMON = ["unlimited-retaliation", "doom-demon-retaliation-attack"];

  it("the retaliation hits for attack + 1 (CONTROL: without the tag it stays base)", () => {
    // Attacker rolls 0, the demon's retaliation die rolls 0 → 2 + 1 bonus = 3.
    const tagged = retaliationExchange({ seed: "demon-retaliation", defenderAbilities: DEMON, defenderAttack: 2, rolls: [0, 0] });
    expect(attackerDamage(tagged)).toBe(3);

    const control = retaliationExchange({
      seed: "demon-retaliation-control",
      defenderAbilities: ["unlimited-retaliation"],
      defenderAttack: 2,
      rolls: [0, 0]
    });
    expect(attackerDamage(control)).toBe(2);
  });

  it("its OWN attack gets no bonus", () => {
    const state = ownAttack({ seed: "demon-own", attackerAbilities: DEMON, attackerAttack: 2, rolls: [0, 0] });
    expect(defenderDamage(state)).toBe(2); // not 3
  });
});

// ---------------------------------------------------------------------------
// 2. Former Human Sergeant — two dice, applied on BOTH sides of the exchange
// ---------------------------------------------------------------------------

describe("Sergeant Shotgun Assault — 2 apply-both dice on own attacks AND retaliations", () => {
  const SERGEANT = ["doom-former-human-sergeant-double-roll"];

  it("data: the sergeant doubles on retaliation, the classic Champion does not", () => {
    expect(rollsTwoDiceOnRetaliation({ abilities: SERGEANT } as CombatUnitState)).toBe(true);
    expect(rollsTwoDiceOnRetaliation({ abilities: ["champion-roll-two-dice"] } as CombatUnitState)).toBe(false);
  });

  it("sums both dice on its OWN attack", () => {
    // attack 2, dice +1 and +1 → 4 damage.
    const state = ownAttack({ seed: "sergeant-own", attackerAbilities: SERGEANT, attackerAttack: 2, rolls: [1, 1] });
    expect(defenderDamage(state)).toBe(4);
  });

  it("ALSO rolls 2 dice on its Retaliation Attack (CONTROL: the Champion rolls one)", () => {
    // Attacker rolls 0 (script[0]); the sergeant's retaliation consumes TWO dice
    // (+1, +1) → 2 + 2 = 4 damage to the attacker.
    const sergeant = retaliationExchange({
      seed: "sergeant-retaliation",
      defenderAbilities: SERGEANT,
      defenderAttack: 2,
      rolls: [0, 1, 1]
    });
    expect(attackerDamage(sergeant)).toBe(4);

    // The Champion regression CONTROL: same script, single retaliation die (+1)
    // → 2 + 1 = 3. The trailing +1 must NOT be consumed by a second die.
    const champion = retaliationExchange({
      seed: "sergeant-retaliation-champion",
      defenderAbilities: ["champion-roll-two-dice"],
      defenderAttack: 2,
      rolls: [0, 1, 1]
    });
    expect(attackerDamage(champion)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3. Mancubus — Retaliation Volley (advantage on retaliations ONLY)
// ---------------------------------------------------------------------------

describe("Mancubus Retaliation Volley — 2-dice advantage on the retaliation only", () => {
  const VOLLEY = ["doom-mancubus-retaliation-advantage"];

  it("data: advantage reads retaliation-only", () => {
    const unit = { abilities: VOLLEY } as CombatUnitState;
    expect(unitHasAttackRollAdvantage(unit, true)).toBe(true);
    expect(unitHasAttackRollAdvantage(unit, false)).toBe(false);
  });

  it("the retaliation rolls 2 dice and keeps the higher (CONTROL: own attack rolls one)", () => {
    // Attacker rolls 0; the retaliation rolls -1 and +1 → keeps +1 → 3 + 1 = 4.
    const retaliation = retaliationExchange({
      seed: "mancubus-retaliation",
      defenderAbilities: VOLLEY,
      defenderAttack: 3,
      rolls: [0, -1, 1]
    });
    expect(attackerDamage(retaliation)).toBe(4);

    // Own attack: a single straight die (-1) → 3 - 1 = 2. The trailing +1 is the
    // CONTROL — advantage would consume it and deal 4.
    const own = ownAttack({ seed: "mancubus-own", attackerAbilities: VOLLEY, attackerAttack: 3, rolls: [-1, 1] });
    expect(defenderDamage(own)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Cacodemon — Burning Poison (die-gated poison cube)
// ---------------------------------------------------------------------------

describe("Cacodemon Burning Poison — a cube lands only on a '-1' or '0' own Attack die", () => {
  const POISON = ["doom-cacodemon-poison"];

  it.each([
    [-1, 1],
    [0, 1],
    [1, 0]
  ] as const)("own attack die %i → %i poison cube(s)", (roll, cubes) => {
    const state = ownAttack({ seed: `caco-die-${roll}`, attackerAbilities: POISON, attackerAttack: 3, rolls: [roll, 0] });
    expect(unitAt(state, "unit_p2_skeletons").poisonCubes ?? 0).toBe(cubes);
    expect(abilityEvents(state, "doom-cacodemon-poison")).toHaveLength(cubes);
  });

  it("never places a cube from a Retaliation Attack", () => {
    // Attacker rolls 0; the tagged defender's retaliation also rolls 0 — a cube
    // WOULD land if the retaliation gate were missing.
    const state = retaliationExchange({
      seed: "caco-retaliation",
      defenderAbilities: POISON,
      defenderAttack: 2,
      rolls: [0, 0]
    });
    expect(unitAt(state, "unit_p1_marksmen").poisonCubes ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Revenant — Death Mark (1 pre-attack damage on its chosen target)
// ---------------------------------------------------------------------------

describe("Revenant Death Mark — 1 damage to the target immediately before the attack", () => {
  const MARK = ["doom-revenant-pre-attack-damage"];

  it("total damage = 1 (mark) + the attack (CONTROL: untagged deals attack only)", () => {
    const tagged = ownAttack({ seed: "revenant-mark", attackerAbilities: MARK, attackerAttack: 3, rolls: [0] });
    expect(defenderDamage(tagged)).toBe(4);
    expect(abilityEvents(tagged, "doom-revenant-pre-attack-damage")).toHaveLength(1);

    const control = ownAttack({ seed: "revenant-control", attackerAbilities: [], attackerAttack: 3, rolls: [0] });
    expect(defenderDamage(control)).toBe(3);
  });

  it("the mark is effect damage — it lands through Defense the attack cannot beat", () => {
    const state = ownAttack({
      seed: "revenant-defense",
      attackerAbilities: MARK,
      attackerAttack: 3,
      defenderDefense: 50,
      rolls: [0]
    });
    expect(defenderDamage(state)).toBe(1); // the soaked attack added nothing
  });

  it("a lethal mark removes the target and the attack (and any retaliation) never happens", () => {
    const state = freshCombat("revenant-lethal", [0, 0]);
    place(state, "unit_p1_marksmen", {
      position: 1,
      controllerId: "p1",
      abilities: MARK,
      attack: 3,
      defense: 0,
      maxHealth: 40,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 5,
      controllerId: "p2",
      abilities: [],
      attack: 5,
      defense: 0,
      maxHealth: 1,
      damage: 0,
      variant: "few",
      type: "ground"
    });
    place(state, "unit_p1_griffins", { position: 16, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 17, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(wasRemoved(after, "unit_p2_skeletons")).toBe(true);
    expect(unitAt(after, "unit_p1_marksmen").damage).toBe(0); // no attack, no retaliation
    expect(
      after.eventLog.some(
        (event: GameEvent) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === "unit_p1_marksmen"
      )
    ).toBe(false);
  });

  it("never fires on a Retaliation Attack", () => {
    const state = retaliationExchange({
      seed: "revenant-retaliation",
      defenderAbilities: MARK,
      defenderAttack: 2,
      rolls: [0, 0]
    });
    // The retaliation dealt 2 — a mark would have made it 3 (and left an event).
    expect(attackerDamage(state)).toBe(2);
    expect(abilityEvents(state, "doom-revenant-pre-attack-damage")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Arachnotron — Triple Plasma (Attack 3, then 2, then 1 at the same target)
// ---------------------------------------------------------------------------

describe("Arachnotron Triple Plasma — three same-target strikes at fixed Attack values", () => {
  it("deals 3 + 2 + 1 with all-zero dice (CONTROL: untagged deals 3)", () => {
    const tagged = ownAttack({
      seed: "arachno-triple",
      attackerAbilities: ["doom-arachnotron-triple-strike"],
      attackerAttack: 3,
      rolls: [0, 0, 0, 0]
    });
    expect(defenderDamage(tagged)).toBe(6);
    expect(abilityEvents(tagged, "doom-arachnotron-triple-strike").length).toBeGreaterThan(0);

    const control = ownAttack({ seed: "arachno-control", attackerAbilities: [], attackerAttack: 3, rolls: [0, 0, 0, 0] });
    expect(defenderDamage(control)).toBe(3);
  });

  it("the follow-ups stop when the target falls to the first strike", () => {
    const state = ownAttack({
      seed: "arachno-lethal",
      attackerAbilities: ["doom-arachnotron-triple-strike"],
      attackerAttack: 3,
      defenderMaxHealth: 2,
      rolls: [0, 0, 0, 0]
    });
    expect(wasRemoved(state, "unit_p2_skeletons")).toBe(true);
    expect(unitAt(state, "unit_p2_skeletons").damage).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 7. Spider Mastermind — the "-1"-gated second attack adjacent to the target
// ---------------------------------------------------------------------------

describe("Mastermind Assault — a '-1' own die also attacks a unit adjacent to the target", () => {
  function layout(state: GameState): void {
    place(state, "unit_p1_marksmen", {
      position: 1,
      controllerId: "p1",
      abilities: ["doom-spider-mastermind-adjacent-strike"],
      attack: 7,
      defense: 0,
      maxHealth: 40,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 5,
      controllerId: "p2",
      abilities: [],
      attack: 0,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    // The ONLY unit adjacent to the target: the second strike auto-declares here.
    place(state, "unit_p2_vampires", { position: 6, controllerId: "p2", abilities: [], attack: 0, defense: 0, maxHealth: 30, damage: 0, type: "ground" });
    place(state, "unit_p1_griffins", { position: 16, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 17, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
  }

  it("fires on a '-1' die: the neighbour takes the printed Attack-7 strike", () => {
    const state = freshCombat("mastermind-minus", [-1, 0, 0]);
    layout(state);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(6); // 7 - 1

    // Lich semantics: every unit adjacent to the target qualifies (the adjacent
    // attacker itself included), so the second strike opens the target choice.
    const choice = after.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the second-attack target choice");
    expect(choice.kind).toBe("second-attack");
    expect(choice.baseAttack).toBe(7);
    expect(choice.candidateUnitIds).toContain("unit_p2_vampires");

    const resolved = settle(
      applyOk(after, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: choice.id,
        targetUnitId: "unit_p2_vampires"
      })
    );
    expect(unitAt(resolved, "unit_p2_vampires").damage).toBe(7); // baseAttack 7 + die 0
  });

  it("CONTROL: any other die leaves the neighbour untouched (and opens no choice)", () => {
    const state = freshCombat("mastermind-zero", [0, 0, 0]);
    layout(state);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(7);
    expect(unitAt(after, "unit_p2_vampires").damage).toBe(0);
    expect(after.pendingChoice?.type).not.toBe("ABILITY_TARGET_CHOICE");
  });
});

// ---------------------------------------------------------------------------
// 8. Baron of Hell — the 4-damage single-attack cap
// ---------------------------------------------------------------------------

describe("Baron Hellborn Hide — at most 4 damage from a single attack", () => {
  it("caps an 8-Attack hit at 4 (CONTROL: untagged takes 8)", () => {
    const capped = retaliationExchange({
      seed: "baron-cap",
      defenderAbilities: ["doom-baron-damage-cap"],
      defenderAttack: 0,
      rolls: [0, 0],
      attackerAttack: 8
    });
    expect(defenderDamage(capped)).toBe(4);

    const control = retaliationExchange({
      seed: "baron-control",
      defenderAbilities: [],
      defenderAttack: 0,
      rolls: [0, 0],
      attackerAttack: 8
    });
    expect(defenderDamage(control)).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// 9. Pain Elemental — the Lost Soul burst (player AND neutral controllers)
// ---------------------------------------------------------------------------

describe("Pain Elemental Lost Soul Burst — a temporary Lost Soul appears after its attack", () => {
  const BURST = ["doom-pain-elemental-summon-lost-soul"];

  function summonedLostSouls(state: GameState): CombatUnitState[] {
    return Object.values(state.combat!.units).filter((unit) => unit.unitDefId === "doom.lost_soul");
  }

  it("a PLAYER-controlled burst summons a battlefield-only body — the army gains NO card", () => {
    const state = freshCombat("pain-player", [0, 0]);
    place(state, "unit_p1_marksmen", {
      position: 1,
      controllerId: "p1",
      abilities: BURST,
      attack: 2,
      defense: 0,
      maxHealth: 40,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", { position: 5, controllerId: "p2", abilities: [], attack: 0, defense: 0, maxHealth: 30, damage: 0, type: "ground" });
    place(state, "unit_p1_griffins", { position: 16, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 17, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    const armyBefore = state.players.p1.army.length;

    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");

    const souls = summonedLostSouls(after);
    expect(souls).toHaveLength(1);
    expect(souls[0].controllerId).toBe("p1");
    expect(souls[0].summoned).toBe(true);
    expect(souls[0].temporary).toBe(true);
    expect(souls[0].armyUnitId).toBeUndefined();
    // The regression pin: the burst must NEVER push a permanent army card.
    expect(after.players.p1.army.length).toBe(armyBefore);
    expect(abilityEvents(after, "doom-pain-elemental-summon-lost-soul")).toHaveLength(1);
  });

  it("CONTROL: no tag, no Lost Soul", () => {
    const state = ownAttack({ seed: "pain-control", attackerAbilities: [], attackerAttack: 2, rolls: [0, 0] });
    expect(summonedLostSouls(state)).toHaveLength(0);
  });

  it("never fires on a Retaliation Attack", () => {
    const state = retaliationExchange({
      seed: "pain-retaliation",
      defenderAbilities: BURST,
      defenderAttack: 2,
      rolls: [0, 0]
    });
    expect(summonedLostSouls(state)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The REAL neutral-guard cases: a live adventure fight, where NO PlayerState
// exists for the neutral seat (state.players[NEUTRAL_PLAYER_ID] is absent).
// ---------------------------------------------------------------------------

/** A real one-guard neutral fight with the player's unit deployed at 13. */
function neutralFight(reshape: (guard: CombatUnitState, state: GameState) => void): GameState {
  let state = createAdventureGameState({ seed: "doom-neutral-e2e", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  const armyUnit = state.players.p1.army[0];
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
  for (const unit of Object.values(state.combat!.units)) {
    unit.initiative = 99; // the player's unit acts first
  }
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
  reshape(guard, state);
  state.combat!.dice.scriptedRolls = Array(30).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

/** Drives p1 (defend/pass/continue) until the guard side has acted. */
function driveNeutralTurn(state: GameState): GameState {
  let safety = 40;
  while (safety > 0) {
    safety -= 1;
    if (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      continue;
    }
    const pre = state.combat?.pendingNeutralStep;
    if (pre?.kind === "pre-activation") {
      state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: pre.reactingPlayerId ?? "p1" });
      continue;
    }
    const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
    if (active && active.controllerId === "p1" && !state.pendingChoice) {
      state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
      continue;
    }
    break;
  }
  return state;
}

describe("Doom arms on the NEUTRAL side (a real adventure guard fight)", () => {
  it("a NEUTRAL Pain Elemental's burst summons a temporary neutral Lost Soul — and pollutes NO army", () => {
    let state = neutralFight((guard) => {
      guard.type = "ground";
      guard.abilities = ["doom-pain-elemental-summon-lost-soul"];
      guard.attack = 1;
      guard.initiative = 1; // acts after the player unit
      guard.position = 9; // adjacent to the prey at 13 → it just attacks
      guard.maxHealth = 20;
      guard.damage = 0;
    });
    const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    prey.maxHealth = 20;
    prey.damage = 0;
    // The neutral seat keeps a BOOKKEEPING PlayerState in adventure games; the
    // burst must never write an army card into it (nor into any player's army).
    const neutralArmyBefore = state.players[NEUTRAL_PLAYER_ID]?.army.length ?? 0;
    const p1ArmyBefore = state.players.p1.army.length;

    state = driveNeutralTurn(state);

    const souls = Object.values(state.combat!.units).filter((unit) => unit.unitDefId === "doom.lost_soul");
    expect(souls, "the neutral burst must actually summon").toHaveLength(1);
    expect(souls[0].controllerId).toBe(NEUTRAL_PLAYER_ID);
    expect(souls[0].summoned).toBe(true);
    expect(souls[0].temporary).toBe(true);
    expect(souls[0].armyUnitId).toBeUndefined();
    expect(state.players[NEUTRAL_PLAYER_ID]?.army.length ?? 0).toBe(neutralArmyBefore);
    expect(state.players.p1.army.length).toBe(p1ArmyBefore);
  });

  it("a NEUTRAL Arch-Vile AUTO-cancels the first killing blow on another guard (once per combat)", () => {
    let state = createAdventureGameState({ seed: "doom-neutral-e2e", difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
    // TWO player units, both acting before the guards, both able to reach the
    // victim: the melee striker adjacent to it and a second RANGED striker.
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: state.players.p1.army[0].id, position: 13 });
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: state.players.p1.army[1].id, position: 14 });
    // Distinct initiatives BEFORE the round starts: the melee striker @13 acts
    // first, the ranged striker @14 second, every guard last — no order ties.
    for (const unit of Object.values(state.combat!.units)) {
      unit.initiative = unit.controllerId === "p1" ? (unit.position === 13 ? 99 : 98) : 1;
    }
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // The victim guard the players will kill…
    const victim = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    victim.type = "ground";
    victim.abilities = [];
    victim.attack = 0;
    victim.initiative = 1;
    victim.position = 9; // adjacent to the first striker at 13
    victim.maxHealth = 3;
    victim.damage = 0;
    // …and an injected Arch-Vile bodyguard beside it.
    const vile: CombatUnitState = {
      ...structuredClone(victim),
      id: "unit_neutral_archvile",
      name: "Arch-Vile",
      cardName: "Arch-Vile",
      abilities: ["archangel-lethal-save"],
      position: 8,
      maxHealth: 8,
      damage: 0
    };
    delete vile.armyUnitId;
    state.combat!.units[vile.id] = vile;
    state.combat!.dice.scriptedRolls = Array(30).fill(0);
    state.combat!.dice.rollCount = 0;

    const strikers = Object.values(state.combat!.units)
      .filter((unit) => unit.controllerId === "p1")
      .sort((a, b) => a.position - b.position);
    for (const striker of strikers) {
      striker.attack = 5; // lethal vs the 3-Health victim
      striker.maxHealth = 20;
      striker.damage = 0;
    }
    strikers[1].type = "ranged"; // shoots the victim from 14

    const clearPauses = (current: GameState): GameState => {
      let safety = 10;
      while (safety > 0 && current.combat?.pendingNeutralStep?.kind === "pre-activation") {
        safety -= 1;
        current = applyOk(current, {
          type: "CONTINUE_NEUTRAL_STEP",
          playerId: current.combat.pendingNeutralStep.reactingPlayerId ?? "p1"
        });
      }
      return current;
    };

    // First killing blow: automatically cancelled by the Arch-Vile.
    state = clearPauses(state);
    state = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: strikers[0].id, defenderId: victim.id })
    );
    expect(state.combat!.units[victim.id], "the victim survives the cancelled blow").toBeTruthy();
    expect(state.combat!.units[victim.id].damage).toBe(0);
    expect(state.combat!.units.unit_neutral_archvile.usedLethalSaveThisCombat).toBe(true);
    expect(
      state.eventLog.some(
        (event: GameEvent) =>
          event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "archangel-lethal-save"
      )
    ).toBe(true);

    // Second killing blow (the ranged striker, same round): the once-per-combat
    // save is spent, so this one goes through.
    state = clearPauses(state);
    state = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: strikers[1].id, defenderId: victim.id })
    );
    expect(
      state.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === victim.id)
    ).toBe(true);
  });
});
