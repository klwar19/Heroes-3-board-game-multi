import { describe, expect, it } from "vitest";
import { commanderDefinitions, type CommanderSlug, type CommanderStatKey } from "@/data/commanders";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  makeCommanderCombatUnit,
  commanderUnitId
} from "./index";
import { effectiveInitiative, expireEffectsForActivationEnd, getActiveDefenseBonus, getDisplayAttackBonus } from "./active-effects";
import { applyCommanderCombatStart, applyLionRoundStartBarrage } from "./commanders";
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
  state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
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

function castOfferByAbility(state: GameState, abilityId: string) {
  return getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === abilityId
  );
}

function castOnByAbility(state: GameState, abilityId: string, targetUnitId: string): GameState {
  const offer = castOfferByAbility(state, abilityId);
  expect(offer, `${abilityId} offered`).toBeTruthy();
  const opened = apply(state, offer!.action);
  const choice = opened.pendingChoice;
  if (choice?.type !== "ABILITY_TARGET_CHOICE") {
    throw new Error("expected the commander-cast target choice");
  }
  return apply(opened, {
    type: "CHOOSE_ABILITY_TARGET",
    playerId: "p1",
    choiceId: choice.id,
    targetUnitId
  });
}

function castCandidateIdsByAbility(state: GameState, abilityId: string): string[] {
  const offer = castOfferByAbility(state, abilityId);
  expect(offer, `${abilityId} offered`).toBeTruthy();
  const opened = apply(state, offer!.action);
  const choice = opened.pendingChoice;
  if (choice?.type !== "ABILITY_TARGET_CHOICE") {
    throw new Error("expected the commander-cast target choice");
  }
  return choice.candidateUnitIds;
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

/**
 * p2's stripped attacker (Attack 3) at `from` DECLARES an attack on `defenderId`
 * but does NOT settle — it leaves the attack-declared reaction window open so a
 * commander's instant-reaction defend buff can be played into it.
 */
function declareEnemyAttack(state: GameState, attackerUnitId: string, from: number, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerUnitId];
  attacker.abilities = [];
  attacker.position = from;
  attacker.attack = 3;
  state.combat!.activeUnitId = attackerUnitId;
  state.activePlayerId = "p2";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attackerUnitId, defenderId });
}

/** The commander defend-buff reaction offered to p1 in an open attack window. */
function commanderReactionOffer(state: GameState) {
  return (state.reactionWindow?.legalReactions.p1 ?? []).find(
    (legal) => legal.action.type === "USE_COMMANDER_CAST_REACTION"
  );
}

// ===========================================================================
// The shared cast rules.
// ===========================================================================

describe("commander casts — shared rules", () => {
  // Brute's Bloodlust is a plain activation cast; the adjacent griffins (cell 5,
  // next to the commander at 9) are a legal melee target at every Power.
  it("is free (the commander still attacks) but only ONCE per combat round", () => {
    let state = castState("brute");
    state = castOn(state, "brute", "unit_p1_griffins");

    // Still this commander's activation: the cast is NOT offered again…
    expect(castOffer(state, "brute")).toBeUndefined();

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
    state.combat!.units[commanderUnitId("p1")].movementLockedThisActivation = false;
    state.combat!.units[commanderUnitId("p1")].attackedThisActivation = undefined;
    state.combat!.activeUnitId = commanderUnitId("p1");
    state.activePlayerId = "p1";
    expect(castOffer(state, "brute")).toBeTruthy();
  });

  it("a (non-reaction) cast ENDS the commander's movement — it may still attack", () => {
    let state = castState("brute");
    const commanderId = commanderUnitId("p1");
    const canMove = (s: GameState) =>
      getLegalActions(s, "p1").some(
        (legal) => legal.action.type === "MOVE_UNIT" && legal.action.unitId === commanderId
      );

    // CONTROL: before casting the commander may still move.
    expect(canMove(state)).toBe(true);

    state = castOn(state, "brute", "unit_p1_griffins");
    expect(state.combat!.units[commanderId].movementLockedThisActivation).toBe(true);

    // Movement is gone — no offer, and a forced MOVE_UNIT is rejected outright.
    expect(canMove(state)).toBe(false);
    const rejected = applyAction(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: commanderId,
      destination: 13
    });
    expect(rejected.errors.length).toBeGreaterThan(0);

    // …but the attack still lands (the cast is free, only movement is spent).
    state = settle(apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: commanderId, defenderId: "unit_p2_skeletons" }));
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("a cast that leaves NO reachable attack still lets the commander HOLD (no combat deadlock)", () => {
    // Regression: a commander that CAST (movement-locked, "may still attack, but
    // no longer move"), cannot reach any enemy to attack, AND Defended last
    // activation (the consecutive-Defend ban blocks Defend) was offered ZERO
    // legal actions — deadlocking the whole combat and stalling the single-player
    // computer pump (the all-options soak: 3 opp + Impossible + Morale + Events +
    // WOG Commanders). END_ACTIVATION (hold) must always remain available to a
    // cast-locked unit, since casting IS its action for the activation.
    let state = castState("brute");
    const commanderId = commanderUnitId("p1");

    // Cast first (a friendly target is adjacent at the default layout) — this is
    // what locks the commander's movement for the activation.
    state = castOn(state, "brute", "unit_p1_griffins");
    expect(state.combat!.units[commanderId].movementLockedThisActivation).toBe(true);

    // Now ISOLATE the commander: park every other unit far from cell 9 (its
    // orthogonal neighbours are 5/8/10/13) so NO melee attack line exists, and
    // mark it as having Defended last activation so Defend is banned this one.
    const farCells = [12, 15, 16, 17, 18, 19];
    let idx = 0;
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.id === commanderId) continue;
      unit.position = farCells[idx % farCells.length];
      idx += 1;
    }
    state.combat!.units[commanderId].defendedLastActivation = true;
    state.combat!.activeUnitId = commanderId;
    state.activePlayerId = "p1";

    const commanderActions = getLegalActions(state, "p1").filter((legal) => {
      const action = legal.action;
      return (
        ("unitId" in action && action.unitId === commanderId) ||
        ("attackerId" in action && action.attackerId === commanderId)
      );
    });
    const types = commanderActions.map((legal) => legal.action.type);

    // The deadlock precondition is real: NO move, NO attack, NO defend…
    expect(types).not.toContain("MOVE_UNIT");
    expect(types).not.toContain("MOVE_AND_ATTACK_UNIT");
    expect(types).not.toContain("ATTACK_UNIT");
    expect(types).not.toContain("DEFEND_UNIT");
    // …but the commander can still HOLD — this is the fix (fails without it: the
    // menu would be empty and the pump would stall).
    expect(types).toContain("END_ACTIVATION");

    // And the hold really resolves — the activation ends and combat advances.
    const held = applyAction(state, {
      type: "END_ACTIVATION",
      playerId: "p1",
      unitId: commanderId,
    });
    expect(held.errors).toEqual([]);
    expect(held.state.combat!.units[commanderId].activatedThisRound).toBe(true);

    // CONTROL: the same isolated, cast-locked commander that did NOT Defend last
    // activation is offered Defend (its ordinary escape) — so the empty menu bit
    // only when every other option was independently unavailable.
    state.combat!.units[commanderId].defendedLastActivation = false;
    const withDefend = getLegalActions(state, "p1")
      .filter(
        (legal) =>
          "unitId" in legal.action && legal.action.unitId === commanderId,
      )
      .map((legal) => legal.action.type);
    expect(withDefend).toContain("DEFEND_UNIT");
  });

  it("is offered only during the commander's OWN activation", () => {
    const state = castState("brute");
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(castOffer(state, "brute")).toBeUndefined();
  });

  it("cancelling the pick costs nothing — the cast stays available", () => {
    const state = castState("brute");
    const offer = castOffer(state, "brute")!;
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
    expect(castOffer(cancelled, "brute")).toBeTruthy();
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

describe("commander casts — Hierophant Shield / Ogre Stone Skin are INSTANT REACTIONS", () => {
  function targetMarksmen(state: GameState): void {
    const marksmen = state.combat!.units.unit_p1_marksmen;
    marksmen.abilities = [];
    marksmen.defense = 1;
    marksmen.maxHealth = 20;
    marksmen.damage = 0;
    marksmen.retaliatedThisRound = true; // clean reading (no retaliation noise)
    marksmen.position = 1;
  }

  it("shields the ATTACKED unit before damage; Shield is melee-only, Stone Skin also stops ranged", () => {
    // A stripped melee attacker (skeletons, Attack 3) hits the marksmen (def 1).
    function meleeInto(slug: CommanderSlug, useShield: boolean): number {
      const state = castState(slug, { magic: 3 }); // Power 2 → +3 Defense
      targetMarksmen(state);
      let s = declareEnemyAttack(state, "unit_p2_skeletons", 2, "unit_p1_marksmen");
      if (useShield) {
        const offer = commanderReactionOffer(s);
        expect(offer, `${slug} defend reaction offered vs melee`).toBeTruthy();
        s = apply(s, offer!.action);
      }
      return settle(s).combat!.units.unit_p1_marksmen.damage;
    }

    // CONTROL (pass the reaction): 3 - 1 = 2 damage.
    expect(meleeInto("hierophant", false)).toBe(2);
    // Shield +3 vs melee: 3 - (1+3) = 0.
    expect(meleeInto("hierophant", true)).toBe(0);
    // Stone Skin +3 vs ALL also blunts the melee hit to 0.
    expect(meleeInto("ogre_leader", true)).toBe(0);

    // A RANGED shot (vampires turned ranged): Shield is NOT offered (melee-only),
    // Stone Skin IS and blunts the shot.
    function rangedInto(slug: CommanderSlug): { offered: boolean; damage: number } {
      const state = castState(slug, { magic: 3 });
      targetMarksmen(state);
      state.combat!.units.unit_p2_vampires.type = "ranged";
      let s = declareEnemyAttack(state, "unit_p2_vampires", 14, "unit_p1_marksmen");
      const offer = commanderReactionOffer(s);
      if (offer) {
        s = apply(s, offer.action);
      }
      return { offered: Boolean(offer), damage: settle(s).combat!.units.unit_p1_marksmen.damage };
    }

    const shieldVsRanged = rangedInto("hierophant");
    expect(shieldVsRanged.offered).toBe(false); // melee-only → no dead offer
    expect(shieldVsRanged.damage).toBe(2); // full 3 - 1 = 2
    const stoneVsRanged = rangedInto("ogre_leader");
    expect(stoneVsRanged.offered).toBe(true);
    expect(stoneVsRanged.damage).toBe(0);
  });

  it("is NOT an activation cast, and the reaction is once per combat round", () => {
    // Never offered as a USE_UNIT_ABILITY during the commander's own activation.
    const own = castState("hierophant", { magic: 3 });
    expect(castOffer(own, "hierophant")).toBeUndefined();

    // Once per round: after shielding one hit, a second attack the same round
    // offers no further reaction (the once-per-round budget was spent).
    const state = castState("hierophant", { magic: 3 });
    targetMarksmen(state);
    let s = declareEnemyAttack(state, "unit_p2_skeletons", 2, "unit_p1_marksmen");
    const first = commanderReactionOffer(s);
    expect(first).toBeTruthy();
    s = settle(apply(s, first!.action));

    s.combat!.units.unit_p1_marksmen.retaliatedThisRound = true;
    const s2 = declareEnemyAttack(s, "unit_p2_vampires", 0, "unit_p1_marksmen");
    expect(commanderReactionOffer(s2)).toBeFalsy();
    settle(s2);
  });
});

describe("commander casts — Temple Guardian's Precision", () => {
  // Power ladder (user spec): Pow 0 = +1 but ADJACENT; Pow 1 = +1 anywhere; Pow 2
  // = +2 anywhere. Always this round only; the ignore-ranged-penalties rider stays.
  it("targets RANGED friendlies only; Pow 0 needs adjacency, Pow 1+ reaches anywhere", () => {
    function gate(magic: number): string[] {
      const state = castState("temple_guardian", magic ? { magic } : {});
      state.combat!.units.unit_p1_marksmen.position = 13; // ranged, adjacent to the commander at 9
      const griffins = state.combat!.units.unit_p1_griffins;
      griffins.type = "ranged";
      griffins.position = 1; // ranged, FAR from the commander
      return castCandidateIds(state, "temple_guardian");
    }
    // Pow 0: only the ADJACENT ranged marksmen; the distant ranged griffins and
    // the ground crusaders are NOT offered.
    const low = gate(0);
    expect(low).toContain("unit_p1_marksmen");
    expect(low).not.toContain("unit_p1_griffins");
    expect(low).not.toContain("unit_p1_crusaders");
    // Pow 1 (magic grade 2): the distant ranged griffins joins; crusaders never do.
    const mid = gate(2);
    expect(mid).toContain("unit_p1_marksmen");
    expect(mid).toContain("unit_p1_griffins");
    expect(mid).not.toContain("unit_p1_crusaders");
  });

  it("adds +1 Attack at Pow 1 and +2 at Pow 2 to the buffed unit's shot", () => {
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
    // Pow 1 (magic grade 2), reaches anywhere: +1 → 4.
    expect(shoot(castOn(castState("temple_guardian", { magic: 2 }), "temple_guardian", "unit_p1_marksmen"))).toBe(4);
    // Pow 2 (magic grade 3): +2 → 5.
    expect(shoot(castOn(castState("temple_guardian", { magic: 3 }), "temple_guardian", "unit_p1_marksmen"))).toBe(5);
  });

  it("lifts the adjacent-shot penalty (Pow 1): a point-blank shot rolls one straight die", () => {
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

    // Precision at Pow 1 (magic grade 2, reaches anywhere) waives every ranged
    // penalty → the +1 stands: 3 + 1(buff) + 1(die) = 5.
    let waived = castState("temple_guardian", { magic: 2 });
    waived.combat!.units.unit_p2_skeletons.position = 5;
    waived.combat!.activeUnitId = commanderUnitId("p1");
    waived.activePlayerId = "p1";
    waived = castOn(waived, "temple_guardian", "unit_p1_marksmen");
    expect(pointBlank(waived)).toBe(5);
  });
});

describe("commander casts — Brute's Bloodlust", () => {
  // Power ladder (user spec): Pow 0 = +1 but ADJACENT; Pow 1 = +1 anywhere;
  // Pow 2 = +2 anywhere. Always this round only.
  it("targets MELEE friendlies only; Pow 0 needs adjacency, Pow 1+ reaches anywhere", () => {
    function gate(magic: number): string[] {
      const state = castState("brute", magic ? { magic } : {});
      state.combat!.units.unit_p1_crusaders.position = 6; // melee, NOT adjacent to the commander at 9
      return castCandidateIds(state, "brute");
    }
    // Pow 0: only the ADJACENT melee griffins (cell 5); the distant melee crusaders
    // and the ranged marksmen are NOT offered.
    const low = gate(0);
    expect(low).toContain("unit_p1_griffins");
    expect(low).not.toContain("unit_p1_crusaders");
    expect(low).not.toContain("unit_p1_marksmen");
    // Pow 1 (magic grade 2): the distant melee crusaders joins; ranged never do.
    const mid = gate(2);
    expect(mid).toContain("unit_p1_crusaders");
    expect(mid).not.toContain("unit_p1_marksmen");
  });

  it("adds +1 Attack at Pow 1 and +2 at Pow 2 to the buffed unit's strike", () => {
    function strike(state: GameState): number {
      const crusaders = state.combat!.units.unit_p1_crusaders;
      crusaders.abilities = [];
      crusaders.attack = 2;
      crusaders.position = 6; // adjacent to the skeletons at 10
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

    // CONTROL: crusaders attack 2 + die 0 = 2.
    expect(strike(castState("brute"))).toBe(2);
    // Pow 1 (magic grade 2), reaches anywhere: +1 → 3.
    expect(strike(castOn(castState("brute", { magic: 2 }), "brute", "unit_p1_crusaders"))).toBe(3);
    // Pow 2 (magic grade 3): +2 → 4.
    expect(strike(castOn(castState("brute", { magic: 3 }), "brute", "unit_p1_crusaders"))).toBe(4);
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
  it("Haste: Power 0/1/2 grants +2/+6/+9 Initiative and +1 Attack; Power 2 lasts all combat", () => {
    // Initiative shift.
    const state = castOn(castState("shaman"), "shaman", "unit_p1_crusaders");
    const crusaders = state.combat!.units.unit_p1_crusaders;
    expect(effectiveInitiative(crusaders, state.activeEffects)).toBe(crusaders.initiative + 2);
    const middle = castOn(castState("shaman", { magic: 2 }), "shaman", "unit_p1_crusaders");
    expect(effectiveInitiative(middle.combat!.units.unit_p1_crusaders, middle.activeEffects)).toBe(
      middle.combat!.units.unit_p1_crusaders.initiative + 6
    );
    const high = castOn(castState("shaman", { magic: 3 }), "shaman", "unit_p1_crusaders");
    expect(effectiveInitiative(high.combat!.units.unit_p1_crusaders, high.activeEffects)).toBe(
      high.combat!.units.unit_p1_crusaders.initiative + 9
    );
    expect(high.activeEffects.find((effect) => effect.name.startsWith("Haste"))?.duration.type).toBe("combat");

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

    // Hasted crusaders get +1 Attack against any target (2 + 1 = 3).
    const hasted = castOn(castState("shaman"), "shaman", "unit_p1_crusaders");
    expect(strike(hasted, 1)).toBe(3);
    // The same buff remains +1 Attack against a faster skeleton.
    const vsFaster = castOn(castState("shaman"), "shaman", "unit_p1_crusaders");
    expect(strike(vsFaster, 30)).toBe(3);
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

describe("commander casts — Ibuki's Executive Order", () => {
  it("starts at 1 AP and exposes only affordable commands", () => {
    const state = castState("ibuki");
    const ibuki = state.combat!.units[commanderUnitId("p1")];
    expect(ibuki.commanderActionPoints).toBe(1);
    const ids = getLegalActions(state, "p1").filter((entry) => entry.action.type === "USE_UNIT_ABILITY").map((entry) => entry.action.type === "USE_UNIT_ABILITY" ? entry.action.abilityId : "");
    expect(ids).toContain("commander-ibuki-sniper-shot");
    expect(ids).not.toContain("commander-ibuki-up-to-mischief");
    expect(ids).not.toContain("commander-cast-executive-order");
  });

  it("gains exactly 1 AP for moving, attacking, Defending, or being attacked", () => {
    const movedState = castState("ibuki");
    const ibukiId = commanderUnitId("p1");
    const move = getLegalActions(movedState, "p1").find((entry) => entry.action.type === "MOVE_UNIT");
    expect(move).toBeTruthy();
    const moved = apply(movedState, move!.action);
    expect(moved.combat!.units[ibukiId].commanderActionPoints).toBe(2);

    const attackingState = castState("ibuki");
    // Isolate the attack trigger from the separate "being attacked" trigger
    // that a normal melee retaliation would also award.
    attackingState.combat!.units[ibukiId].abilities.push("ignores-retaliation");
    const attacked = settle(apply(attackingState, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: ibukiId,
      defenderId: "unit_p2_skeletons"
    }));
    expect(attacked.combat!.units[ibukiId].commanderActionPoints).toBe(2);

    const defendingState = castState("ibuki");
    const defended = apply(defendingState, { type: "DEFEND_UNIT", playerId: "p1", unitId: ibukiId });
    expect(defended.combat!.units[ibukiId].commanderActionPoints).toBe(2);

    const targetedState = castState("ibuki");
    // Prevent a retaliation from adding a second, unrelated "attacking" AP.
    targetedState.combat!.units[ibukiId].retaliatedThisRound = true;
    const targeted = enemyAttack(targetedState, "unit_p2_skeletons", 10, ibukiId);
    expect(targeted.combat!.units[ibukiId].commanderActionPoints).toBe(2);
  });

  it("spends AP on Sniper Shot, Up to Mischief, and Gadabout", () => {
    const sniper = castState("ibuki");
    const ibukiId = commanderUnitId("p1");
    // Flat damage must ignore even an otherwise-impenetrable Defense value.
    sniper.combat!.units.unit_p2_skeletons.defense = 99;
    const shot = apply(sniper, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: ibukiId, abilityId: "commander-ibuki-sniper-shot", target: { type: "unit", unitId: "unit_p2_skeletons" } });
    expect(shot.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(shot.combat!.units[ibukiId].commanderActionPoints).toBe(0);

    const powerTwoShot = castState("ibuki", { magic: 3 });
    powerTwoShot.combat!.units.unit_p2_skeletons.defense = 99;
    expect(getLegalActions(powerTwoShot, "p1").some((entry) => entry.label.includes("Sniper Shot · 1 AP · 2 damage"))).toBe(true);
    const strongerShot = apply(powerTwoShot, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: ibukiId, abilityId: "commander-ibuki-sniper-shot", target: { type: "unit", unitId: "unit_p2_skeletons" } });
    expect(strongerShot.combat!.units.unit_p2_skeletons.damage).toBe(2);

    const mischief = castState("ibuki");
    mischief.combat!.units[ibukiId].commanderActionPoints = 2;
    const debuffed = apply(mischief, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: ibukiId, abilityId: "commander-ibuki-up-to-mischief", target: { type: "unit", unitId: "unit_p2_skeletons" } });
    expect(getDisplayAttackBonus(debuffed, debuffed.combat!.units.unit_p2_skeletons)).toBe(-1);
    expect(debuffed.combat!.units[ibukiId].commanderActionPoints).toBe(0);

    const control = castState("ibuki");
    control.combat!.units.unit_p2_skeletons.attack = 3;
    control.combat!.units[ibukiId].retaliatedThisRound = true;
    const controlHit = enemyAttack(control, "unit_p2_skeletons", 10, ibukiId);
    debuffed.combat!.units.unit_p2_skeletons.attack = 3;
    debuffed.combat!.units[ibukiId].retaliatedThisRound = true;
    const mischiefHit = enemyAttack(debuffed, "unit_p2_skeletons", 10, ibukiId);
    expect(mischiefHit.combat!.units[ibukiId].damage).toBe(controlHit.combat!.units[ibukiId].damage - 1);

    const powerOneMischief = castState("ibuki", { magic: 2 });
    powerOneMischief.combat!.units[ibukiId].commanderActionPoints = 2;
    powerOneMischief.combat!.units.unit_p2_skeletons.defense = 2;
    expect(getLegalActions(powerOneMischief, "p1").some((entry) => entry.label.includes("−1 Attack and Defense"))).toBe(true);
    const fullyDebuffed = apply(powerOneMischief, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: ibukiId, abilityId: "commander-ibuki-up-to-mischief", target: { type: "unit", unitId: "unit_p2_skeletons" } });
    expect(getDisplayAttackBonus(fullyDebuffed, fullyDebuffed.combat!.units.unit_p2_skeletons)).toBe(-1);
    expect(getActiveDefenseBonus(fullyDebuffed, fullyDebuffed.combat!.units.unit_p2_skeletons)).toBe(-1);
    fullyDebuffed.combat!.units[ibukiId].abilities.push("ignores-retaliation");
    const defenseReducedHit = settle(apply(fullyDebuffed, { type: "ATTACK_UNIT", playerId: "p1", attackerId: ibukiId, defenderId: "unit_p2_skeletons" }));
    expect(defenseReducedHit.combat!.units.unit_p2_skeletons.damage).toBe(1);

    const gadabout = castState("ibuki");
    gadabout.combat!.units[ibukiId].commanderActionPoints = 2;
    const landed = apply(gadabout, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: ibukiId, abilityId: "commander-ibuki-gadabout", target: { type: "space", position: 11 } });
    expect(landed.combat!.units[ibukiId].position).toBe(11);
    expect(landed.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(landed.combat!.units[ibukiId].commanderActionPoints).toBe(0);
    expect(getLegalActions(landed, "p1").some((entry) => entry.action.type === "MOVE_UNIT")).toBe(false);
  });

  it("offers Executive Order only for already-activated allies within its Power tier and spends 3 AP", () => {
    const bronze = castState("ibuki");
    const ibukiId = commanderUnitId("p1");
    bronze.combat!.units[ibukiId].commanderActionPoints = 3;
    bronze.combat!.units.unit_p1_marksmen.activatedThisRound = true;
    bronze.combat!.units.unit_p1_griffins.grade = "silver";
    bronze.combat!.units.unit_p1_griffins.activatedThisRound = true;
    expect(castCandidateIds(bronze, "ibuki")).toContain("unit_p1_marksmen");
    expect(castCandidateIds(bronze, "ibuki")).not.toContain("unit_p1_griffins");

    const silver = castState("ibuki", { magic: 2 });
    silver.combat!.units[ibukiId].commanderActionPoints = 3;
    silver.combat!.units.unit_p1_griffins.grade = "silver";
    silver.combat!.units.unit_p1_griffins.activatedThisRound = true;
    expect(castCandidateIds(silver, "ibuki")).toContain("unit_p1_griffins");

    const gold = castState("ibuki", { magic: 3 });
    gold.combat!.units[ibukiId].commanderActionPoints = 3;
    gold.combat!.units.unit_p1_crusaders.grade = "gold";
    gold.combat!.units.unit_p1_crusaders.activatedThisRound = true;
    expect(castCandidateIds(gold, "ibuki")).toContain("unit_p1_crusaders");
    expect(castCandidateIds(gold, "ibuki")).not.toContain(ibukiId);

    const ordered = castOn(gold, "ibuki", "unit_p1_crusaders");
    expect(ordered.combat!.units[ibukiId].commanderActionPoints).toBe(0);
    expect(ordered.combat!.units.unit_p1_crusaders.activatedThisRound).toBe(false);
    expect(getLegalActions(ordered, "p1").some((entry) => entry.action.type === "MOVE_UNIT")).toBe(false);
  });

  it("refreshes an activated ally and gives Silver/Gold −2 Attack only for the extra activation", () => {
    const bronze = castState("ibuki");
    bronze.combat!.units[commanderUnitId("p1")].commanderActionPoints = 3;
    bronze.combat!.units.unit_p1_marksmen.activatedThisRound = true;
    const bronzeRefreshed = castOn(bronze, "ibuki", "unit_p1_marksmen");
    expect(bronzeRefreshed.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(false);
    expect(getDisplayAttackBonus(bronzeRefreshed, bronzeRefreshed.combat!.units.unit_p1_marksmen)).toBe(0);

    const silver = castState("ibuki", { magic: 2 });
    silver.combat!.units[commanderUnitId("p1")].commanderActionPoints = 3;
    silver.combat!.units.unit_p1_griffins.grade = "silver";
    silver.combat!.units.unit_p1_griffins.activatedThisRound = true;
    const refreshed = castOn(silver, "ibuki", "unit_p1_griffins");
    const target = refreshed.combat!.units.unit_p1_griffins;
    expect(target.activatedThisRound).toBe(false);
    expect(getDisplayAttackBonus(refreshed, target)).toBe(-2);

    expireEffectsForActivationEnd(refreshed, target.id);
    expect(getDisplayAttackBonus(refreshed, target)).toBe(0);
  });

  it("Mission Briefing recovers the discard top first, falling back to the normal deck", () => {
    const recovered = castState("ibuki");
    recovered.players.p1.hand = [];
    recovered.players.p1.discard = ["ability.offense"];
    recovered.players.p1.deck = ["ability.defense"];
    applyCommanderCombatStart(recovered);
    expect(recovered.players.p1.hand).toEqual(["ability.offense"]);
    expect(recovered.players.p1.discard).toEqual([]);
    expect(recovered.players.p1.deck).toEqual(["ability.defense"]);

    const fallback = castState("ibuki");
    fallback.players.p1.hand = [];
    fallback.players.p1.discard = [];
    fallback.players.p1.deck = ["ability.defense"];
    applyCommanderCombatStart(fallback);
    expect(fallback.players.p1.hand).toEqual(["ability.defense"]);
  });
});

describe("Imperium commander — Lion command table", () => {
  it("Lion's Slash deals 1/2/3 flat adjacent damage at Power 0/1/2", () => {
    for (const [magic, expected] of [[0, 1], [2, 2], [3, 3]] as const) {
      let state = castState("lion_el_jonson", { magic });
      state.combat!.units.unit_p2_skeletons.defense = 99;
      state = castOnByAbility(state, "commander-cast-lion-slash", "unit_p2_skeletons");
      expect(state.combat!.units.unit_p2_skeletons.damage).toBe(expected);
    }
  });

  it("Deathwing Counterstroke follows the Bronze/Silver/Gold Power ladder and lasts the whole Combat", () => {
    let low = castState("lion_el_jonson");
    const ally = low.combat!.units.unit_p1_marksmen;
    ally.position = 8;
    low = castOnByAbility(low, "commander-cast-lion-counterstroke", ally.id);
    const buff = low.activeEffects.find((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "UNLIMITED_RETALIATION")
    );
    expect(buff?.duration).toEqual({ type: "combat" });

    const silverBlocked = castState("lion_el_jonson");
    silverBlocked.combat!.units.unit_p1_marksmen.grade = "silver";
    expect(castCandidateIdsByAbility(silverBlocked, "commander-cast-lion-counterstroke")).not.toContain("unit_p1_marksmen");

    const silverAllowed = castState("lion_el_jonson", { magic: 2 });
    silverAllowed.combat!.units.unit_p1_marksmen.grade = "silver";
    expect(castCandidateIdsByAbility(silverAllowed, "commander-cast-lion-counterstroke")).toContain("unit_p1_marksmen");

    const goldAllowed = castState("lion_el_jonson", { magic: 3 });
    goldAllowed.combat!.units.unit_p1_marksmen.grade = "gold";
    expect(castCandidateIdsByAbility(goldAllowed, "commander-cast-lion-counterstroke")).toContain("unit_p1_marksmen");
  });

  it("Lion's Barrage deals 1 round-start damage to a random living enemy", () => {
    const state = castState("lion_el_jonson");
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "p2" && unit.id !== "unit_p2_skeletons") {
        unit.damage = unit.maxHealth;
      }
    }
    applyLionRoundStartBarrage(state);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(state.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "lion-round-barrage")).toBe(true);

    const roundFour = castState("lion_el_jonson");
    roundFour.combat!.round = 4;
    applyLionRoundStartBarrage(roundFour);
    expect(Object.values(roundFour.combat!.units).every((unit) => unit.damage === 0)).toBe(true);
    expect(roundFour.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "lion-round-barrage")).toBe(false);
  });
});
