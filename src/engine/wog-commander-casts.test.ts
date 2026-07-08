import { describe, expect, it } from "vitest";
import { commanderDefinitions, type CommanderSlug, type CommanderStatKey } from "@/data/commanders";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  makeCommanderCombatUnit,
  commanderUnitId
} from "./index";
import { effectiveInitiative } from "./active-effects";
import type { GameAction, GameState } from "./state";

/**
 * The 12 command abilities — once per combat round, free during the
 * commander's own activation, Power 0/1/2 from the Magic grade. Every cast is
 * exercised end-to-end through USE_UNIT_ABILITY → the "commander-cast" target
 * pick, asserting the OBSERVABLE combat outcome with a control.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = apply(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

/**
 * Sandbox with p1's commander active at cell 9 and everything scripted to 0s.
 * The p2 skeletons wait at 10 (adjacent), stripped and fattened to 20 Health.
 */
function castState(
  slug: CommanderSlug,
  grades: Partial<Record<CommanderStatKey, number>> = {},
  options: { runes?: number } = {}
): GameState {
  const state = createInitialGameState();
  state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false };
  state.players.p1.commander = {
    slug,
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0, ...grades }
  };
  const unit = makeCommanderCombatUnit(state.players.p1, 9);
  if (!unit) {
    throw new Error("expected a commander combat unit");
  }
  state.combat!.units[unit.id] = unit;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const skeletons = state.combat!.units.unit_p2_skeletons;
  skeletons.abilities = [];
  skeletons.position = 10;
  skeletons.defense = 0;
  skeletons.maxHealth = 20;
  skeletons.damage = 0;
  state.combat!.activeUnitId = unit.id;
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  if (options.runes !== undefined) {
    state.combat!.runes = { p1: { count: options.runes, appliedLevel: 0 } };
  }
  return state;
}

function castOffer(state: GameState, slug: CommanderSlug) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "USE_UNIT_ABILITY" &&
      legal.action.abilityId === commanderDefinitions[slug].cast.abilityId
  );
}

/** Open the cast picker and land it on `targetUnitId`. */
function castOn(state: GameState, slug: CommanderSlug, targetUnitId: string): GameState {
  const offer = castOffer(state, slug);
  expect(offer, `${slug} cast offered`).toBeTruthy();
  const opened = apply(state, offer!.action);
  const choice = opened.pendingChoice;
  expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
  if (choice?.type !== "ABILITY_TARGET_CHOICE") {
    throw new Error("expected the commander-cast target choice");
  }
  expect(choice.kind).toBe("commander-cast");
  return apply(opened, {
    type: "CHOOSE_ABILITY_TARGET",
    playerId: "p1",
    choiceId: choice.id,
    targetUnitId
  });
}

/** The unit ids the cast currently offers as targets. */
function castCandidateIds(state: GameState, slug: CommanderSlug): string[] {
  const offer = castOffer(state, slug);
  expect(offer, `${slug} cast offered`).toBeTruthy();
  const opened = apply(state, offer!.action);
  const choice = opened.pendingChoice;
  if (choice?.type !== "ABILITY_TARGET_CHOICE") {
    throw new Error("expected the commander-cast target choice");
  }
  return choice.candidateUnitIds;
}

/** p2's stripped attacker at `from` strikes `defenderId` with all-zero dice. */
function enemyAttack(state: GameState, attackerUnitId: string, from: number, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerUnitId];
  attacker.abilities = [];
  attacker.position = from;
  state.combat!.activeUnitId = attackerUnitId;
  state.activePlayerId = "p2";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return settle(
    apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attackerUnitId, defenderId })
  );
}

// ===========================================================================
// The shared cast rules.
// ===========================================================================

describe("commander casts — shared rules", () => {
  it("is free (the commander still attacks) but only ONCE per combat round", () => {
    let state = castState("ogre_leader");
    state = castOn(state, "ogre_leader", "unit_p1_marksmen");

    // Still this commander's activation: the cast is NOT offered again…
    expect(castOffer(state, "ogre_leader")).toBeUndefined();

    // …but its attack is still available and lands (free action).
    state = settle(
      apply(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: commanderUnitId("p1"),
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);

    // Next combat round the budget refreshes (the once-per-round key is the
    // round number; round advancement itself is pinned in the round tests).
    state.combat!.round += 1;
    state.combat!.units[commanderUnitId("p1")].activatedThisRound = false;
    state.combat!.units[commanderUnitId("p1")].movedThisActivation = false;
    state.combat!.units[commanderUnitId("p1")].attackedThisActivation = undefined;
    state.combat!.activeUnitId = commanderUnitId("p1");
    state.activePlayerId = "p1";
    expect(castOffer(state, "ogre_leader")).toBeTruthy();
  });

  it("is offered only during the commander's OWN activation", () => {
    const state = castState("ogre_leader");
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(castOffer(state, "ogre_leader")).toBeUndefined();
  });

  it("cancelling the pick costs nothing — the cast stays available", () => {
    const state = castState("ogre_leader");
    const offer = castOffer(state, "ogre_leader")!;
    const opened = apply(state, offer.action);
    const choice = opened.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected the commander-cast target choice");
    }
    const cancelled = apply(opened, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "skip"
    });
    expect(castOffer(cancelled, "ogre_leader")).toBeTruthy();
  });

  it("ongoing-effect casts never offer an ONGOING-IMMUNE commander (Magic grade 1+)", () => {
    function withEnemyCommander(magic: number): GameState {
      // Sea Marshal's Slow against an enemy commander.
      const state = castState("corsair");
      const enemyCommander = makeCommanderCombatUnit(
        { ...state.players.p2, commander: { slug: "paladin", grades: { attack: 0, defense: 0, health: 0, damage: 0, magic, speed: 0 } } } as never,
        14
      );
      // makeCommanderCombatUnit reads player.id — rebuild it for p2 cleanly.
      expect(enemyCommander).toBeTruthy();
      enemyCommander!.id = "unit_p2_commander";
      enemyCommander!.controllerId = "p2";
      enemyCommander!.position = 13;
      state.combat!.units[enemyCommander!.id] = enemyCommander!;
      return state;
    }

    // Magic grade 1 (immune to ongoing): excluded up front.
    const immune = castCandidateIds(withEnemyCommander(1), "corsair");
    expect(immune).toContain("unit_p2_skeletons");
    expect(immune).not.toContain("unit_p2_commander");

    // CONTROL: a Magic grade-0 enemy commander is NOT immune → it IS offered.
    const vulnerable = castCandidateIds(withEnemyCommander(0), "corsair");
    expect(vulnerable).toContain("unit_p2_commander");
  });
});

// ===========================================================================
// The 12 casts.
// ===========================================================================

describe("commander casts — Paladin's Cure", () => {
  it("Pow 0 heals 1; Pow 1 also cleanses tokens and negative effects; Pow 2 heals 2", () => {
    // Pow 0: heal 1, the Weakness token STAYS (no cleanse yet — the control).
    let low = castState("paladin");
    const wounded = low.combat!.units.unit_p1_marksmen;
    wounded.maxHealth = 9;
    wounded.damage = 3;
    wounded.tokens = [{ id: "t1", kind: "weakness", amount: -1, sourceName: "test" }];
    low = castOn(low, "paladin", "unit_p1_marksmen");
    expect(low.combat!.units.unit_p1_marksmen.damage).toBe(2);
    expect(low.combat!.units.unit_p1_marksmen.tokens?.some((token) => token.kind === "weakness")).toBe(true);

    // Pow 2: heal 2 AND the Weakness token is gone.
    let high = castState("paladin", { magic: 3 });
    const target = high.combat!.units.unit_p1_marksmen;
    target.maxHealth = 9;
    target.damage = 3;
    target.tokens = [{ id: "t1", kind: "weakness", amount: -1, sourceName: "test" }];
    high = castOn(high, "paladin", "unit_p1_marksmen");
    expect(high.combat!.units.unit_p1_marksmen.damage).toBe(1);
    expect(high.combat!.units.unit_p1_marksmen.tokens?.some((token) => token.kind === "weakness") ?? false).toBe(false);
  });
});

describe("commander casts — Hierophant's Shield vs Ogre Leader's Stone Skin", () => {
  it("Shield blunts MELEE attacks only; Stone Skin blunts ranged shots too (sibling cross-check)", () => {
    // Baseline: skeletons (attack 2 + die 0) hit the crusaders for 2 - 1 defense = 1… use marksmen defense 0.
    function meleeInto(state: GameState): number {
      // The defender never retaliates — the burn/blunt reading stays clean.
      state.combat!.units.unit_p1_marksmen.retaliatedThisRound = true;
      const next = enemyAttack(state, "unit_p2_skeletons", 2, "unit_p1_marksmen");
      return next.combat!.units.unit_p1_marksmen.damage;
    }
    function rangedInto(state: GameState): number {
      // Vampires make a fake ranged shooter: type ranged, far away.
      const shooter = state.combat!.units.unit_p2_vampires;
      shooter.type = "ranged";
      shooter.attack = 3;
      const next = enemyAttack(state, "unit_p2_vampires", 14, "unit_p1_marksmen");
      return next.combat!.units.unit_p1_marksmen.damage;
    }

    // CONTROL: unbuffed marksmen (defense 1) take 3 - 1 = 2 from the melee hit.
    const plain = castState("hierophant");
    plain.combat!.units.unit_p1_marksmen.defense = 1;
    expect(meleeInto(plain)).toBe(2);

    // Shield Pow 2 (+3 vs melee): the same hit is fully blunted.
    let shielded = castState("hierophant", { magic: 3 });
    shielded.combat!.units.unit_p1_marksmen.defense = 1;
    shielded = castOn(shielded, "hierophant", "unit_p1_marksmen");
    expect(meleeInto(shielded)).toBe(0);

    // …but Shield does NOT stop a ranged shot (3 - 1 = 2 damage).
    let shotThrough = castState("hierophant", { magic: 3 });
    shotThrough.combat!.units.unit_p1_marksmen.defense = 1;
    shotThrough = castOn(shotThrough, "hierophant", "unit_p1_marksmen");
    expect(rangedInto(shotThrough)).toBe(2);

    // Stone Skin Pow 2 (+3 vs ALL): the ranged shot is blunted to 0 as well.
    let stone = castState("ogre_leader", { magic: 3 });
    stone.combat!.units.unit_p1_marksmen.defense = 1;
    stone = castOn(stone, "ogre_leader", "unit_p1_marksmen");
    expect(rangedInto(stone)).toBe(0);
  });
});

describe("commander casts — Temple Guardian's Precision", () => {
  it("targets RANGED friendlies only and adds +1/+3 Attack to their shot", () => {
    // Targeting: the ground crusaders are never offered; the ranged marksmen are.
    const gate = castState("temple_guardian");
    const candidates = castCandidateIds(gate, "temple_guardian");
    expect(candidates).toContain("unit_p1_marksmen");
    expect(candidates).not.toContain("unit_p1_crusaders");

    function shoot(state: GameState): number {
      const marksmen = state.combat!.units.unit_p1_marksmen;
      marksmen.abilities = [];
      marksmen.attack = 3;
      state.combat!.activeUnitId = "unit_p1_marksmen";
      state.activePlayerId = "p1";
      state.combat!.dice.scriptedRolls = [0, 0];
      state.combat!.dice.rollCount = 0;
      const next = settle(
        apply(state, {
          type: "ATTACK_UNIT",
          playerId: "p1",
          attackerId: "unit_p1_marksmen",
          defenderId: "unit_p2_skeletons"
        })
      );
      return next.combat!.units.unit_p2_skeletons.damage;
    }

    // CONTROL: marksmen attack 3 + die 0 = 3.
    expect(shoot(castState("temple_guardian"))).toBe(3);
    // Pow 0: +1 → 4. (The cast happens during the commander's activation;
    // the buff then rides the marksmen's own shot.)
    expect(shoot(castOn(castState("temple_guardian"), "temple_guardian", "unit_p1_marksmen"))).toBe(4);
    // Pow 2: +3 → 6.
    expect(shoot(castOn(castState("temple_guardian", { magic: 3 }), "temple_guardian", "unit_p1_marksmen"))).toBe(6);
  });

  it("lifts the adjacent-shot penalty: a point-blank shot rolls one straight die", () => {
    function pointBlank(state: GameState): number {
      const marksmen = state.combat!.units.unit_p1_marksmen;
      marksmen.abilities = [];
      marksmen.attack = 3;
      const skeletons = state.combat!.units.unit_p2_skeletons;
      skeletons.position = 5; // adjacent to the marksmen at 1 → penalty shot
      state.combat!.units.unit_p1_griffins.position = 6; // clear cell 5's owner
      state.combat!.activeUnitId = "unit_p1_marksmen";
      state.activePlayerId = "p1";
      // Disadvantage rolls two dice and keeps the LOWER: [+1, -1] → -1.
      // With the penalty waived only the first die is rolled: +1.
      state.combat!.dice.scriptedRolls = [1, -1];
      state.combat!.dice.rollCount = 0;
      const next = settle(
        apply(state, {
          type: "ATTACK_UNIT",
          playerId: "p1",
          attackerId: "unit_p1_marksmen",
          defenderId: "unit_p2_skeletons"
        })
      );
      return next.combat!.units.unit_p2_skeletons.damage;
    }

    // CONTROL: penalty keeps the -1 → 3 - 1 = 2 damage.
    const penalized = castState("temple_guardian");
    penalized.combat!.units.unit_p2_skeletons.position = 5;
    expect(pointBlank(penalized)).toBe(2);

    // Precision waives every ranged penalty → the +1 stands: 3 + 1 + 1(Pow 0 attack) = 5.
    let waived = castState("temple_guardian");
    waived.combat!.units.unit_p2_skeletons.position = 5;
    state_fixup(waived);
    waived = castOn(waived, "temple_guardian", "unit_p1_marksmen");
    expect(pointBlank(waived)).toBe(5);

    function state_fixup(state: GameState): void {
      // keep the commander's own activation valid for the cast first
      state.combat!.activeUnitId = commanderUnitId("p1");
      state.activePlayerId = "p1";
    }
  });
});

describe("commander casts — Brute's Bloodlust", () => {
  it("buffs a MELEE friendly anywhere (+1/+3 Attack); ranged units are never offered", () => {
    const gate = castState("brute");
    const candidates = castCandidateIds(gate, "brute");
    expect(candidates).toContain("unit_p1_crusaders");
    expect(candidates).not.toContain("unit_p1_marksmen");

    function strike(state: GameState): number {
      const crusaders = state.combat!.units.unit_p1_crusaders;
      crusaders.abilities = [];
      crusaders.attack = 2;
      crusaders.position = 13; // adjacent to the skeletons at 10? no — 13 is adjacent to 9/12/14/17; use 6→10.
      crusaders.position = 6;
      state.combat!.units.unit_p2_skeletons.position = 10;
      state.combat!.activeUnitId = "unit_p1_crusaders";
      state.activePlayerId = "p1";
      state.combat!.dice.scriptedRolls = [0, 0];
      state.combat!.dice.rollCount = 0;
      const next = settle(
        apply(state, {
          type: "ATTACK_UNIT",
          playerId: "p1",
          attackerId: "unit_p1_crusaders",
          defenderId: "unit_p2_skeletons"
        })
      );
      return next.combat!.units.unit_p2_skeletons.damage;
    }

    expect(strike(castState("brute"))).toBe(2);
    expect(strike(castOn(castState("brute"), "brute", "unit_p1_crusaders"))).toBe(3);
    expect(strike(castOn(castState("brute", { magic: 3 }), "brute", "unit_p1_crusaders"))).toBe(5);
  });
});

describe("commander casts — Succubus' Fire Shield", () => {
  it("burns a melee attacker for 1 (Pow 0/1) or 2 (Pow 2); durations follow the tiers", () => {
    function burn(state: GameState): number {
      // The defender's retaliation is spent, so any damage on the attacker
      // can only come from the Fire Shield itself.
      state.combat!.units.unit_p1_marksmen.retaliatedThisRound = true;
      const next = enemyAttack(state, "unit_p2_skeletons", 2, "unit_p1_marksmen");
      return next.combat!.units.unit_p2_skeletons.damage;
    }

    // CONTROL: no shield → the attacker walks away unburned.
    expect(burn(castState("succubus"))).toBe(0);
    // Pow 0: 1 damage back.
    expect(burn(castOn(castState("succubus"), "succubus", "unit_p1_marksmen"))).toBe(1);
    // Pow 2: 2 damage back.
    expect(burn(castOn(castState("succubus", { magic: 3 }), "succubus", "unit_p1_marksmen"))).toBe(2);

    // Durations (expiry machinery itself is pinned in the active-effects tests):
    // Pow 0 ends with this round, Pow 1 lasts the combat, Pow 2 two rounds.
    const low = castOn(castState("succubus"), "succubus", "unit_p1_marksmen");
    const lowEffect = low.activeEffects.find((effect) => effect.modifiers.some((m) => m.type === "FIRE_SHIELD"));
    expect(lowEffect?.expiresAtCombatRoundEnd).toBe(low.combat!.round);

    // Magic grade 2 = Power 1 (the ladder is 0/0/1/2).
    const mid = castOn(castState("succubus", { magic: 2 }), "succubus", "unit_p1_marksmen");
    const midEffect = mid.activeEffects.find((effect) => effect.modifiers.some((m) => m.type === "FIRE_SHIELD"));
    expect(midEffect?.duration.type).toBe("combat");
    expect(midEffect?.expiresAtCombatRoundEnd).toBeUndefined();

    const high = castOn(castState("succubus", { magic: 3 }), "succubus", "unit_p1_marksmen");
    const highEffect = high.activeEffects.find((effect) => effect.modifiers.some((m) => m.type === "FIRE_SHIELD"));
    expect(highEffect?.expiresAtCombatRoundEnd).toBe(high.combat!.round + 1);
  });
});

describe("commander casts — Soul Eater's Animate Dead", () => {
  it("heals 2 with a bronze → silver → gold tier ladder; undamaged units are never offered", () => {
    function prepare(state: GameState): GameState {
      const marksmen = state.combat!.units.unit_p1_marksmen; // bronze
      const griffins = state.combat!.units.unit_p1_griffins; // silver
      const crusaders = state.combat!.units.unit_p1_crusaders;
      marksmen.grade = "bronze";
      griffins.grade = "silver";
      crusaders.grade = "gold";
      marksmen.maxHealth = 9;
      griffins.maxHealth = 9;
      crusaders.maxHealth = 9;
      marksmen.damage = 3;
      griffins.damage = 3;
      crusaders.damage = 3;
      return state;
    }

    // Pow 0: bronze only.
    const low = prepare(castState("soul_eater"));
    const lowIds = castCandidateIds(low, "soul_eater");
    expect(lowIds).toContain("unit_p1_marksmen");
    expect(lowIds).not.toContain("unit_p1_griffins");
    expect(lowIds).not.toContain("unit_p1_crusaders");

    // Pow 1 (Magic grade 2): silver joins; Pow 2 (grade 3): even gold.
    const mid = prepare(castState("soul_eater", { magic: 2 }));
    const midIds = castCandidateIds(mid, "soul_eater");
    expect(midIds).toContain("unit_p1_griffins");
    expect(midIds).not.toContain("unit_p1_crusaders");

    const high = prepare(castState("soul_eater", { magic: 3 }));
    const highIds = castCandidateIds(high, "soul_eater");
    expect(highIds).toContain("unit_p1_crusaders");

    // The heal itself removes 2 damage.
    const healed = castOn(prepare(castState("soul_eater")), "soul_eater", "unit_p1_marksmen");
    expect(healed.combat!.units.unit_p1_marksmen.damage).toBe(1);

    // Undamaged bronze: not a target.
    const clean = castState("soul_eater");
    clean.combat!.units.unit_p1_marksmen.grade = "bronze";
    clean.combat!.units.unit_p1_griffins.damage = 0;
    clean.combat!.units.unit_p1_marksmen.damage = 0;
    // With NO damaged friendly of the unlocked tier the cast is not offered at all.
    clean.combat!.units.unit_p1_crusaders.damage = 0;
    expect(castOffer(clean, "soul_eater")).toBeUndefined();
  });
});

describe("commander casts — Shaman's Haste and Sea Marshal's Slow", () => {
  it("Haste: +2/+4 Initiative and +1 Attack against SLOWER targets only", () => {
    // Initiative shift.
    const state = castOn(castState("shaman"), "shaman", "unit_p1_crusaders");
    const crusaders = state.combat!.units.unit_p1_crusaders;
    expect(effectiveInitiative(crusaders, state.activeEffects)).toBe(crusaders.initiative + 2);
    const high = castOn(castState("shaman", { magic: 3 }), "shaman", "unit_p1_crusaders");
    expect(effectiveInitiative(high.combat!.units.unit_p1_crusaders, high.activeEffects)).toBe(
      high.combat!.units.unit_p1_crusaders.initiative + 4
    );

    function strike(state: GameState, defenderInitiative: number): number {
      const attacker = state.combat!.units.unit_p1_crusaders;
      attacker.abilities = [];
      attacker.attack = 2;
      attacker.position = 6;
      const skeletons = state.combat!.units.unit_p2_skeletons;
      skeletons.position = 10;
      skeletons.initiative = defenderInitiative;
      state.combat!.activeUnitId = "unit_p1_crusaders";
      state.activePlayerId = "p1";
      state.combat!.dice.scriptedRolls = [0, 0];
      state.combat!.dice.rollCount = 0;
      const next = settle(
        apply(state, {
          type: "ATTACK_UNIT",
          playerId: "p1",
          attackerId: "unit_p1_crusaders",
          defenderId: "unit_p2_skeletons"
        })
      );
      return next.combat!.units.unit_p2_skeletons.damage;
    }

    // Hasted crusaders vs a SLOWER skeleton: +1 Attack (2 + 1 = 3).
    const hasted = castOn(castState("shaman"), "shaman", "unit_p1_crusaders");
    expect(strike(hasted, 1)).toBe(3);
    // Same buff vs a FASTER skeleton: no rider (2).
    const vsFaster = castOn(castState("shaman"), "shaman", "unit_p1_crusaders");
    expect(strike(vsFaster, 30)).toBe(2);
    // CONTROL: unhasted vs slower: 2.
    expect(strike(castState("shaman"), 1)).toBe(2);
  });

  it("Slow: enemies only, -2/-4 Initiative and -1 Attack against FASTER targets", () => {
    const gate = castState("corsair");
    const candidates = castCandidateIds(gate, "corsair");
    expect(candidates).toContain("unit_p2_skeletons");
    expect(candidates).not.toContain("unit_p1_marksmen");

    const state = castOn(castState("corsair"), "corsair", "unit_p2_skeletons");
    const slowed = state.combat!.units.unit_p2_skeletons;
    expect(effectiveInitiative(slowed, state.activeEffects)).toBe(slowed.initiative - 2);
    const deep = castOn(castState("corsair", { magic: 3 }), "corsair", "unit_p2_skeletons");
    expect(effectiveInitiative(deep.combat!.units.unit_p2_skeletons, deep.activeEffects)).toBe(
      deep.combat!.units.unit_p2_skeletons.initiative - 4
    );

    function retaliationFreeStrike(state: GameState, targetInitiative: number): number {
      // The SLOWED skeletons attack the marksmen: -1 Attack only vs a faster target.
      const skeletons = state.combat!.units.unit_p2_skeletons;
      skeletons.attack = 3;
      skeletons.position = 2; // adjacent to the marksmen at 1
      const marksmen = state.combat!.units.unit_p1_marksmen;
      marksmen.abilities = [];
      marksmen.initiative = targetInitiative;
      marksmen.defense = 0;
      marksmen.maxHealth = 9;
      marksmen.retaliatedThisRound = true;
      state.combat!.activeUnitId = "unit_p2_skeletons";
      state.activePlayerId = "p2";
      state.combat!.dice.scriptedRolls = [0, 0];
      state.combat!.dice.rollCount = 0;
      const next = settle(
        apply(state, {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: "unit_p2_skeletons",
          defenderId: "unit_p1_marksmen"
        })
      );
      return next.combat!.units.unit_p1_marksmen.damage;
    }

    // Slowed skeletons (init 3-2=1) vs marksmen at init 30 (faster): 3 - 1 = 2.
    const slowedState = castOn(castState("corsair"), "corsair", "unit_p2_skeletons");
    expect(retaliationFreeStrike(slowedState, 30)).toBe(2);
    // Same slow, but the target is even SLOWER (init 0): full 3.
    const vsSlower = castOn(castState("corsair"), "corsair", "unit_p2_skeletons");
    expect(retaliationFreeStrike(vsSlower, 0)).toBe(3);
    // CONTROL: unslowed skeletons vs the fast marksmen: full 3.
    expect(retaliationFreeStrike(castState("corsair"), 30)).toBe(3);
  });
});

describe("commander casts — Astral Spirit's Counterstrike", () => {
  it("lets the buffed unit retaliate WITHOUT limit this round (tier-gated like Animate Dead)", () => {
    function doubleAssault(state: GameState): { first: number; second: number } {
      // Two stripped enemies melee the marksmen (defense 0, attack 1 → they
      // each take the 1-damage retaliation if the marksmen may retaliate).
      const marksmen = state.combat!.units.unit_p1_marksmen;
      marksmen.abilities = [];
      marksmen.attack = 1;
      marksmen.defense = 9; // survive everything
      marksmen.maxHealth = 20;
      let current = enemyAttack(state, "unit_p2_skeletons", 2, "unit_p1_marksmen");
      current = enemyAttack(current, "unit_p2_vampires", 5, "unit_p1_marksmen");
      // (cell 5 is freed below by moving the griffins)
      return {
        first: current.combat!.units.unit_p2_skeletons.damage,
        second: current.combat!.units.unit_p2_vampires.damage
      };
    }

    function prepared(state: GameState): GameState {
      state.combat!.units.unit_p1_griffins.position = 6; // free cell 5
      state.combat!.units.unit_p2_vampires.maxHealth = 20;
      state.combat!.units.unit_p2_vampires.damage = 0;
      state.combat!.units.unit_p2_vampires.defense = 0; // retaliations read as damage
      state.combat!.units.unit_p1_marksmen.grade = "bronze";
      return state;
    }

    // CONTROL: one retaliation per round — the second attacker walks free.
    const plain = doubleAssault(prepared(castState("astral_spirit")));
    expect(plain.first).toBeGreaterThan(0);
    expect(plain.second).toBe(0);

    // Counterstrike: BOTH attackers eat a retaliation.
    const buffed = doubleAssault(
      castOn(prepared(castState("astral_spirit")), "astral_spirit", "unit_p1_marksmen")
    );
    expect(buffed.first).toBeGreaterThan(0);
    expect(buffed.second).toBeGreaterThan(0);

    // Tier gate: at Pow 0 a silver friendly is not offered.
    const gate = prepared(castState("astral_spirit"));
    gate.combat!.units.unit_p1_griffins.grade = "silver";
    const ids = castCandidateIds(gate, "astral_spirit");
    expect(ids).toContain("unit_p1_marksmen");
    expect(ids).not.toContain("unit_p1_griffins");
  });
});

describe("commander casts — Rune Keeper's Rune Mend", () => {
  it("spends 1/2 Runes to heal 1/3; without the Runes the cast is not offered", () => {
    // Pow 0: spend 1 Rune, heal 1.
    let low = castState("bulwark", {}, { runes: 3 });
    low.combat!.units.unit_p1_marksmen.maxHealth = 9;
    low.combat!.units.unit_p1_marksmen.damage = 3;
    low = castOn(low, "bulwark", "unit_p1_marksmen");
    expect(low.combat!.units.unit_p1_marksmen.damage).toBe(2);
    expect(low.combat!.runes?.p1?.count).toBe(2);

    // Pow 2: spend 2 Runes, heal 3.
    let high = castState("bulwark", { magic: 3 }, { runes: 3 });
    high.combat!.units.unit_p1_marksmen.maxHealth = 9;
    high.combat!.units.unit_p1_marksmen.damage = 3;
    high = castOn(high, "bulwark", "unit_p1_marksmen");
    expect(high.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(high.combat!.runes?.p1?.count).toBe(1);

    // CONTROL: an empty pool never offers the cast.
    const broke = castState("bulwark", {}, { runes: 0 });
    broke.combat!.units.unit_p1_marksmen.maxHealth = 9;
    broke.combat!.units.unit_p1_marksmen.damage = 3;
    expect(castOffer(broke, "bulwark")).toBeUndefined();
  });
});

describe("commander casts — Artificer's Field Repair", () => {
  it("repairs 1/2 on a MECHANICAL friendly — adjacent below Pow 2, anywhere at Pow 2", () => {
    function withMachine(state: GameState, position: number): GameState {
      const machine = state.combat!.units.unit_p1_crusaders;
      machine.unitDefId = "factory.automatons"; // the engine's mechanical trait
      machine.position = position;
      machine.damage = 3;
      machine.maxHealth = 5;
      return state;
    }

    // A wounded NON-mechanical unit never qualifies (the cast is not offered).
    const flesh = castState("factory");
    flesh.combat!.units.unit_p1_marksmen.maxHealth = 9;
    flesh.combat!.units.unit_p1_marksmen.damage = 2;
    expect(castOffer(flesh, "factory")).toBeUndefined();

    // Pow 0: adjacent only (commander at 9; the machine at 10 qualifies)…
    let near = withMachine(castState("factory"), 10);
    near.combat!.units.unit_p2_skeletons.position = 13; // free cell 10 first
    near = castOn(near, "factory", "unit_p1_crusaders");
    expect(near.combat!.units.unit_p1_crusaders.damage).toBe(2);

    // …a distant machine is NOT offered below Pow 2…
    const far = withMachine(castState("factory"), 17);
    expect(castOffer(far, "factory")).toBeUndefined();

    // …but at Pow 2 the repair reaches anywhere and removes 2.
    let reach = withMachine(castState("factory", { magic: 3 }), 17);
    reach = castOn(reach, "factory", "unit_p1_crusaders");
    expect(reach.combat!.units.unit_p1_crusaders.damage).toBe(1);
  });
});
