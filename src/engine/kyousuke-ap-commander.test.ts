import { describe, expect, it } from "vitest";
import {
  COMMANDER_AP_CAST_COST,
  commanderApSkills,
  commanderDefinitions,
  commanderUsesActionPoints,
  type CommanderStatKey
} from "@/data/commanders";
import {
  applyAction,
  commanderUnitId,
  createInitialGameState,
  getActivationOrder,
  getLegalActions,
  makeCommanderCombatUnit
} from "./index";
import {
  effectiveInitiative,
  expireEffectsForCombatRoundEnd,
  getActiveDefenseBonus,
  getDisplayAttackBonus
} from "./active-effects";
import { commanderActionPoints, commanderAdjacentAllies } from "./commanders";
import { chooseComputerAction } from "./computer/policy";
import { hasMediaFile } from "@/lib/media-manifest";
import type { GameAction, GameState } from "./state";

/**
 * Little Busters' Kyousuke Natsume is the SECOND ACTION-POINT commander: the
 * Blue Archive Ibuki machinery, generalised onto the data table
 * COMMANDER_AP_SKILLS (src/data/commanders.ts). He starts every combat at 1 AP,
 * banks +1 for moving / attacking / Defending / being attacked, and spends AP
 * on three cheap commands plus the 3-AP rally "Little Busters, Assemble!".
 *
 * Everything below goes through the REAL applyAction pipeline and asserts the
 * OBSERVABLE outcome (damage dealt, hand size, activation ORDER, which offers
 * exist), each with a CONTROL that diverges. Applied-and-reverted mutations,
 * every one killed by the named spec:
 *
 *  1. `amountByPower: [1, 1, 2]` → `[1, 1, 1]` on Mission Start!
 *     → "Mission Start! … Power 2 doubles it".
 *  2. Gutsy Play's second `createActiveEffect` duration `combat` → the
 *     round-scoped one → "Gutsy Play … the slowdown outlives the round".
 *  3. `power >= effect.initiativeFromPower` → `power >= 0` in the reducer's
 *     `enemy-defense-debuff` arm → "Gutsy Play at Power 0 … CONTROL".
 *  4. `drawCardsForPlayer(state, unit.controllerId, requested)` → `... , 1)`
 *     → "Strategy Meeting … Power 2 draws two".
 *  5. `commanderAdjacentAllies` in `resolveCommanderCast` → every living ally
 *     → "the rally reaches the ADJACENT allies only".
 *  6. the `adjacent-allies-buff` guard in `commanderCastAvailable` deleted
 *     → "a rally with nobody adjacent is never OFFERED".
 *  7. `commanderActionPoints(activeUnit) >= apSkill.ap` → `>= 0` in the OFFER
 *     gate (legal-actions.ts) → "a command the AP cannot pay for is refused"
 *     + "carries its AP skills … starts combat at 1 AP", and it takes an Ibuki
 *     spec with it. NOTE: the reducer's own `< apSkill.ap` throw is an
 *     UNREACHABLE backstop — `assertLegal` refuses a frame the offer gate never
 *     built, so mutating it alone kills nothing. Same for the reducer's
 *     wrong-side target throws: the refusals below are asserted as refusals,
 *     never by message.
 *  8. `commanderCommandUsedThisActivation` → `() => false`
 *     → "after a command Kyousuke may only hold position".
 *  9. `unit.commanderActionPoints ?? unit.ibukiActionPoints ?? 1` → drop the
 *     legacy read → "a pre-Kyousuke snapshot keeps its banked AP".
 * 10. `spendCommanderActionPoints(unit, apSkill.ap)` → `(unit, 0)`
 *     → "each command really spends its printed AP" (and two Ibuki specs).
 * 11. Gutsy Play's `defense: -1` → `0` → all three Gutsy Play specs.
 * 12. the rally's `attackByPower` / `defenseByPower` flattened to [1,1,1] /
 *     [0,0,0] → "Power 1 adds +1 Defense and Power 2 raises the Attack to +2".
 *
 * (The UI half — the generic AP panel really rendering for Kyousuke — is pinned
 * in src/components/commander-card.test.tsx, with its own recorded mutation.)
 */

const KYOUSUKE = commanderUnitId("p1");
const SKELETONS = "unit_p2_skeletons";
const GRIFFINS = "unit_p1_griffins";
const CRUSADERS = "unit_p1_crusaders";
const MARKSMEN = "unit_p1_marksmen";
const VAMPIRES = "unit_p2_vampires";
const DREAD_KNIGHTS = "unit_p2_dread_knights";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function refuse(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected the action to be refused").toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
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
 * Kyousuke active at cell 9 with every die scripted to 0. On the 4-wide board
 * cell 9's orthogonal neighbours are 5 / 8 / 10 / 13, so the fixture puts:
 *   - the Griffins (5) and the Crusaders (8) ADJACENT to Kyousuke,
 *   - the Marksmen (1) far away — the non-adjacent CONTROL for the rally,
 *   - p2's stripped 20-Health Skeletons on 6, adjacent to the Griffins (the
 *     punching bag both sides trade with — no cell is adjacent to BOTH 9 and
 *     an ally, so the buffed ally and Kyousuke need different neighbours),
 *   - p2's stripped Vampires on 10, adjacent to Kyousuke (his own target).
 */
function kyousukeState(
  grades: Partial<Record<CommanderStatKey, number>> = {},
  actionPoints = 1
): GameState {
  const state = createInitialGameState();
  state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
  state.players.p1.commander = {
    slug: "kyousuke_natsume",
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0, ...grades }
  };
  const unit = makeCommanderCombatUnit(state.players.p1, 9);
  if (!unit) throw new Error("expected a commander combat unit");
  unit.commanderActionPoints = actionPoints;
  state.combat!.units[unit.id] = unit;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  for (const id of [GRIFFINS, CRUSADERS, MARKSMEN, SKELETONS, VAMPIRES, DREAD_KNIGHTS]) {
    state.combat!.units[id].abilities = [];
  }
  for (const id of [SKELETONS, VAMPIRES]) {
    const enemy = state.combat!.units[id];
    enemy.defense = 0;
    enemy.maxHealth = 20;
    enemy.damage = 0;
  }
  state.combat!.units[GRIFFINS].position = 5;
  state.combat!.units[CRUSADERS].position = 8;
  state.combat!.units[MARKSMEN].position = 1;
  state.combat!.units[SKELETONS].position = 6;
  state.combat!.units[VAMPIRES].position = 10;
  state.combat!.units[DREAD_KNIGHTS].position = 18;
  state.combat!.activeUnitId = unit.id;
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return state;
}

function useSkill(state: GameState, abilityId: string, target: GameAction extends never ? never : Extract<GameAction, { type: "USE_UNIT_ABILITY" }>["target"]): GameState {
  return apply(state, {
    type: "USE_UNIT_ABILITY",
    playerId: "p1",
    unitId: KYOUSUKE,
    abilityId,
    target
  });
}

function skillOffered(state: GameState, abilityId: string): boolean {
  return getLegalActions(state, "p1").some(
    (legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === abilityId
  );
}

function offerTypes(state: GameState): string[] {
  return getLegalActions(state, "p1")
    .filter((legal) =>
      "unitId" in legal.action ? (legal.action as { unitId?: string }).unitId === KYOUSUKE : false
    )
    .map((legal) => legal.action.type);
}

/** Open the rally's picker and land it on `targetUnitId` (only the anchor). */
function rallyOn(state: GameState, targetUnitId: string): GameState {
  const abilityId = commanderDefinitions.kyousuke_natsume.cast.abilityId;
  const offer = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === abilityId
  );
  expect(offer, "the rally is offered").toBeTruthy();
  const opened = apply(state, offer!.action);
  const choice = opened.pendingChoice;
  if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the commander-cast target choice");
  expect(choice.kind).toBe("commander-cast");
  return apply(opened, {
    type: "CHOOSE_ABILITY_TARGET",
    playerId: "p1",
    choiceId: choice.id,
    targetUnitId
  });
}

/** `attackerId` (p1) strikes `defenderId` with all-zero dice; returns the damage dealt. */
function damageFrom(state: GameState, attackerId: string, defenderId: string): number {
  const combat = state.combat!;
  combat.units[attackerId].activatedThisRound = false;
  combat.units[attackerId].movedThisActivation = false;
  combat.units[attackerId].attackedThisActivation = false;
  combat.units[defenderId].retaliatedThisRound = true; // isolate the blow from a counter
  combat.activeUnitId = attackerId;
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  combat.dice.rollCount = 0;
  const before = combat.units[defenderId].damage;
  const after = settle(
    apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId, defenderId })
  );
  return after.combat!.units[defenderId].damage - before;
}

/** p2's stripped attacker (Attack 3) strikes `defenderId` where it stands. */
function attackedBy(state: GameState, attackerUnitId: string, defenderId: string): GameState {
  const combat = state.combat!;
  const attacker = combat.units[attackerUnitId];
  attacker.abilities = [];
  attacker.attack = 3;
  attacker.activatedThisRound = false;
  combat.units[defenderId].defense = 0;
  combat.units[defenderId].maxHealth = 30;
  combat.activeUnitId = attackerUnitId;
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  combat.dice.rollCount = 0;
  return settle(
    apply({ ...state, activePlayerId: "p2" }, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: attackerUnitId,
      defenderId
    })
  );
}

/** Damage p2's stripped `attackerUnitId` deals to `defenderId` where they stand. */
function enemyDamageOn(state: GameState, attackerUnitId: string, defenderId: string): number {
  const before = state.combat!.units[defenderId].damage;
  const after = attackedBy(state, attackerUnitId, defenderId);
  return after.combat!.units[defenderId].damage - before;
}

// ===========================================================================
// The generalised AP machinery
// ===========================================================================

describe("Kyousuke is an ACTION-POINT commander on the shared Ibuki machinery", () => {
  it("declares three AP skills plus the 3-AP rally, and Ibuki is unchanged", () => {
    expect(commanderUsesActionPoints("kyousuke_natsume")).toBe(true);
    expect(commanderApSkills("kyousuke_natsume").map((skill) => skill.id)).toEqual([
      "commander-kyousuke-mission-start",
      "commander-kyousuke-gutsy-play",
      "commander-kyousuke-strategy-meeting"
    ]);
    expect(commanderApSkills("kyousuke_natsume").map((skill) => skill.ap)).toEqual([1, 2, 2]);
    expect(commanderDefinitions.kyousuke_natsume.cast.abilityId).toBe("commander-cast-kyousuke-assemble");
    expect(commanderDefinitions.kyousuke_natsume.cast.effect.kind).toBe("adjacent-allies-buff");
    // CONTROL: the generalisation did not move Ibuki's own kit.
    expect(commanderApSkills("ibuki").map((skill) => skill.id)).toEqual([
      "commander-ibuki-sniper-shot",
      "commander-ibuki-up-to-mischief",
      "commander-ibuki-gadabout"
    ]);
    // CONTROL: a plain commander is not on the AP track at all.
    expect(commanderUsesActionPoints("paladin")).toBe(false);
    expect(commanderApSkills("paladin")).toEqual([]);
  });

  it("carries its AP skills as real abilities and starts combat at 1 AP", () => {
    const state = kyousukeState();
    // The fixture forces 1 AP; makeCommanderCombatUnit must have seeded it too.
    const fresh = makeCommanderCombatUnit(state.players.p1, 9)!;
    expect(fresh.commanderActionPoints).toBe(1);
    expect(fresh.abilities).toEqual(
      expect.arrayContaining([
        "commander-kyousuke-mission-start",
        "commander-kyousuke-gutsy-play",
        "commander-kyousuke-strategy-meeting",
        "commander-cast-kyousuke-assemble"
      ])
    );
    // At 1 AP only the 1-AP command is affordable.
    expect(skillOffered(state, "commander-kyousuke-mission-start")).toBe(true);
    expect(skillOffered(state, "commander-kyousuke-gutsy-play")).toBe(false);
    expect(skillOffered(state, "commander-kyousuke-strategy-meeting")).toBe(false);
    expect(skillOffered(state, "commander-cast-kyousuke-assemble")).toBe(false);
  });

  it("banks 1 AP for moving, attacking, Defending and being attacked", () => {
    const moved = (() => {
      const state = kyousukeState();
      const move = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "MOVE_UNIT" && legal.action.unitId === KYOUSUKE
      );
      expect(move, "Kyousuke can walk").toBeTruthy();
      return apply(state, move!.action);
    })();
    expect(commanderActionPoints(moved.combat!.units[KYOUSUKE])).toBe(2);

    const attackState = kyousukeState();
    // Isolate the "attacking" trigger from the separate "being attacked" one.
    attackState.combat!.units[VAMPIRES].retaliatedThisRound = true;
    const attacked = settle(
      apply(attackState, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: KYOUSUKE,
        defenderId: VAMPIRES
      })
    );
    expect(commanderActionPoints(attacked.combat!.units[KYOUSUKE])).toBe(2);

    const defended = apply(kyousukeState(), { type: "DEFEND_UNIT", playerId: "p1", unitId: KYOUSUKE });
    expect(commanderActionPoints(defended.combat!.units[KYOUSUKE])).toBe(2);

    const targetedState = kyousukeState();
    // Kyousuke has already retaliated, so the only AP source is "being attacked".
    targetedState.combat!.units[KYOUSUKE].retaliatedThisRound = true;
    const targeted = attackedBy(targetedState, VAMPIRES, KYOUSUKE);
    expect(commanderActionPoints(targeted.combat!.units[KYOUSUKE])).toBe(2);
  });

  it("a pre-Kyousuke snapshot keeps its banked AP (the legacy ibukiActionPoints read)", () => {
    const state = kyousukeState();
    const unit = state.combat!.units[KYOUSUKE];
    // Exactly the shape an edge running the old build committed.
    delete unit.commanderActionPoints;
    unit.ibukiActionPoints = 3;
    expect(commanderActionPoints(unit)).toBe(3);
    expect(skillOffered(state, "commander-kyousuke-gutsy-play")).toBe(true);
    // Spending migrates the field and drops the legacy one.
    const used = useSkill(state, "commander-kyousuke-gutsy-play", { type: "unit", unitId: SKELETONS });
    expect(used.combat!.units[KYOUSUKE].commanderActionPoints).toBe(1);
    expect(used.combat!.units[KYOUSUKE].ibukiActionPoints).toBeUndefined();
    // CONTROL: with the modern field present the legacy one is ignored.
    const both = kyousukeState({}, 1);
    both.combat!.units[KYOUSUKE].ibukiActionPoints = 9;
    expect(commanderActionPoints(both.combat!.units[KYOUSUKE])).toBe(1);
  });

  it("a command the AP cannot pay for is refused, and each command really spends its printed AP", () => {
    const broke = kyousukeState({}, 1);
    expect(skillOffered(broke, "commander-kyousuke-gutsy-play")).toBe(false);
    const message = refuse(broke, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: KYOUSUKE,
      abilityId: "commander-kyousuke-gutsy-play",
      target: { type: "unit", unitId: SKELETONS }
    });
    expect(message.length).toBeGreaterThan(0);
    expect(commanderActionPoints(broke.combat!.units[KYOUSUKE])).toBe(1); // no AP burned

    const funded = kyousukeState({}, 5);
    expect(commanderActionPoints(
      useSkill(funded, "commander-kyousuke-mission-start", { type: "unit", unitId: GRIFFINS })
        .combat!.units[KYOUSUKE]
    )).toBe(4);
    expect(commanderActionPoints(
      useSkill(kyousukeState({}, 5), "commander-kyousuke-gutsy-play", { type: "unit", unitId: SKELETONS })
        .combat!.units[KYOUSUKE]
    )).toBe(3);
    expect(commanderActionPoints(
      useSkill(kyousukeState({}, 5), "commander-kyousuke-strategy-meeting", { type: "none" })
        .combat!.units[KYOUSUKE]
    )).toBe(3);
    expect(commanderActionPoints(
      rallyOn(kyousukeState({}, 5), KYOUSUKE).combat!.units[KYOUSUKE]
    )).toBe(5 - COMMANDER_AP_CAST_COST);
  });

  it("after a command Kyousuke may only hold position — never Defend, never move", () => {
    const state = kyousukeState({}, 3);
    expect(offerTypes(state)).toContain("DEFEND_UNIT");
    expect(offerTypes(state)).toContain("MOVE_UNIT");

    const commanded = useSkill(state, "commander-kyousuke-mission-start", {
      type: "unit",
      unitId: GRIFFINS
    });
    expect(commanded.combat!.activeUnitId).toBe(KYOUSUKE); // the activation is still open
    const after = offerTypes(commanded);
    expect(after).toContain("END_ACTIVATION");
    expect(after).not.toContain("DEFEND_UNIT");
    expect(after).not.toContain("MOVE_UNIT");
    // The frame a forged client could send is refused too (assertLegal fails
    // closed on the withheld offer; defendUnit is the backstop behind it).
    refuse(commanded, { type: "DEFEND_UNIT", playerId: "p1", unitId: KYOUSUKE });
  });

  it("a command is still OFFERED after Kyousuke has walked (the command ends the movement, not the reverse)", () => {
    const state = kyousukeState({}, 3);
    const move = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "MOVE_UNIT" && legal.action.unitId === KYOUSUKE
    );
    const moved = apply(state, move!.action);
    expect(moved.combat!.units[KYOUSUKE].movedThisActivation).toBe(true);
    expect(skillOffered(moved, "commander-kyousuke-mission-start")).toBe(true);
    expect(skillOffered(moved, "commander-kyousuke-gutsy-play")).toBe(true);
  });
});

// ===========================================================================
// Skill 1 — Mission Start! (1 AP)
// ===========================================================================

describe("Kyousuke — Mission Start! (1 AP): an ally hits harder this round", () => {
  it("raises the ally's DAMAGE by 1, and Power 2 doubles it", () => {
    const control = damageFrom(kyousukeState({}, 5), GRIFFINS, SKELETONS);
    expect(control).toBeGreaterThan(0);

    const buffed = useSkill(kyousukeState({}, 5), "commander-kyousuke-mission-start", {
      type: "unit",
      unitId: GRIFFINS
    });
    expect(damageFrom(buffed, GRIFFINS, SKELETONS)).toBe(control + 1);

    const powerTwo = useSkill(kyousukeState({ magic: 3 }, 5), "commander-kyousuke-mission-start", {
      type: "unit",
      unitId: GRIFFINS
    });
    expect(damageFrom(powerTwo, GRIFFINS, SKELETONS)).toBe(control + 2);

    // CONTROL: Power 1 is still the printed +1 (only Power 2 upgrades).
    const powerOne = useSkill(kyousukeState({ magic: 2 }, 5), "commander-kyousuke-mission-start", {
      type: "unit",
      unitId: GRIFFINS
    });
    expect(damageFrom(powerOne, GRIFFINS, SKELETONS)).toBe(control + 1);
  });

  it("lands on an ALLY only — never an enemy, never Kyousuke himself", () => {
    const state = kyousukeState({}, 5);
    const labels = getLegalActions(state, "p1")
      .filter(
        (legal) =>
          legal.action.type === "USE_UNIT_ABILITY" &&
          legal.action.abilityId === "commander-kyousuke-mission-start"
      )
      .map((legal) => legal.label);
    expect(labels.some((label) => label.includes("Mission Start! · 1 AP · +1 Attack"))).toBe(true);
    expect(labels.some((label) => label.includes("Skeletons"))).toBe(false);
    expect(labels.some((label) => label.includes("Kyousuke"))).toBe(false);
    // A forged enemy target is refused (assertLegal fails closed on the frame it
    // never offered; the reducer's own "Choose another living allied unit." is
    // the backstop behind it).
    refuse(state, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: KYOUSUKE,
      abilityId: "commander-kyousuke-mission-start",
      target: { type: "unit", unitId: SKELETONS }
    });
    expect(getDisplayAttackBonus(state, state.combat!.units[SKELETONS])).toBe(0);
  });

  it("expires with the combat ROUND", () => {
    const buffed = useSkill(kyousukeState({}, 5), "commander-kyousuke-mission-start", {
      type: "unit",
      unitId: GRIFFINS
    });
    expect(getDisplayAttackBonus(buffed, buffed.combat!.units[GRIFFINS])).toBe(1);
    const next = structuredClone(buffed);
    expireEffectsForCombatRoundEnd(next, next.combat!.round);
    expect(getDisplayAttackBonus(next, next.combat!.units[GRIFFINS])).toBe(0);
  });
});

// ===========================================================================
// Skill 2 — Gutsy Play (2 AP)
// ===========================================================================

describe("Kyousuke — Gutsy Play (2 AP): −1 Defense this round, −1 Initiative for the combat", () => {
  it("really lets the attack through: the enemy takes 1 more damage", () => {
    const armoured = kyousukeState({}, 5);
    armoured.combat!.units[SKELETONS].defense = 2;
    const control = damageFrom(armoured, GRIFFINS, SKELETONS);

    const broken = kyousukeState({}, 5);
    broken.combat!.units[SKELETONS].defense = 2;
    const debuffed = useSkill(broken, "commander-kyousuke-gutsy-play", {
      type: "unit",
      unitId: SKELETONS
    });
    expect(damageFrom(debuffed, GRIFFINS, SKELETONS)).toBe(control + 1);
  });

  it("at Power 1 it also SLOWS the target — the activation ORDER moves — while Power 0 does not (CONTROL)", () => {
    const slowState = kyousukeState({ magic: 2 }, 5);
    // Give the Skeletons an initiative one point above the Crusaders so the −1
    // really swaps two rows of the activation ladder (not just a field read).
    slowState.combat!.units[SKELETONS].initiative = slowState.combat!.units[CRUSADERS].initiative + 1;
    const beforeOrder = getActivationOrder(slowState.combat!, slowState.activeEffects).map((unit) => unit.id);
    expect(beforeOrder.indexOf(SKELETONS)).toBeLessThan(beforeOrder.indexOf(CRUSADERS));

    const slowed = useSkill(slowState, "commander-kyousuke-gutsy-play", {
      type: "unit",
      unitId: SKELETONS
    });
    const skeletons = slowed.combat!.units[SKELETONS];
    expect(effectiveInitiative(skeletons, slowed.activeEffects)).toBe(skeletons.initiative - 1);
    const afterOrder = getActivationOrder(slowed.combat!, slowed.activeEffects).map((unit) => unit.id);
    expect(afterOrder.indexOf(SKELETONS)).toBeGreaterThan(afterOrder.indexOf(CRUSADERS));

    // CONTROL at Power 0: the Defense break lands, the slowdown does NOT.
    const flatState = kyousukeState({}, 5);
    flatState.combat!.units[SKELETONS].initiative = flatState.combat!.units[CRUSADERS].initiative + 1;
    const flat = useSkill(flatState, "commander-kyousuke-gutsy-play", {
      type: "unit",
      unitId: SKELETONS
    });
    expect(getActiveDefenseBonus(flat, flat.combat!.units[SKELETONS])).toBe(-1);
    expect(effectiveInitiative(flat.combat!.units[SKELETONS], flat.activeEffects)).toBe(
      flat.combat!.units[SKELETONS].initiative
    );
    const flatOrder = getActivationOrder(flat.combat!, flat.activeEffects).map((unit) => unit.id);
    expect(flatOrder.indexOf(SKELETONS)).toBeLessThan(flatOrder.indexOf(CRUSADERS));
  });

  it("the two halves have DIFFERENT durations: the slowdown outlives the round, the Defense break does not", () => {
    const state = kyousukeState({ magic: 2 }, 5);
    const debuffed = useSkill(state, "commander-kyousuke-gutsy-play", {
      type: "unit",
      unitId: SKELETONS
    });
    expect(getActiveDefenseBonus(debuffed, debuffed.combat!.units[SKELETONS])).toBe(-1);

    const next = structuredClone(debuffed);
    expireEffectsForCombatRoundEnd(next, next.combat!.round);
    expect(getActiveDefenseBonus(next, next.combat!.units[SKELETONS])).toBe(0);
    expect(effectiveInitiative(next.combat!.units[SKELETONS], next.activeEffects)).toBe(
      next.combat!.units[SKELETONS].initiative - 1
    );
  });

  it("lands on an ENEMY only", () => {
    const state = kyousukeState({}, 5);
    const labels = getLegalActions(state, "p1")
      .filter(
        (legal) =>
          legal.action.type === "USE_UNIT_ABILITY" &&
          legal.action.abilityId === "commander-kyousuke-gutsy-play"
      )
      .map((legal) => legal.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => label.includes("Griffins"))).toBe(false);
    refuse(state, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: KYOUSUKE,
      abilityId: "commander-kyousuke-gutsy-play",
      target: { type: "unit", unitId: GRIFFINS }
    });
    expect(getActiveDefenseBonus(state, state.combat!.units[GRIFFINS])).toBe(0);
  });
});

// ===========================================================================
// Skill 3 — Strategy Meeting (2 AP)
// ===========================================================================

describe("Kyousuke — Strategy Meeting (2 AP): draw from your OWN deck", () => {
  it("draws 1 card, and Power 2 draws two", () => {
    const state = kyousukeState({}, 5);
    expect(state.players.p1.deck.length).toBeGreaterThan(2);
    const before = state.players.p1.hand.length;
    const drew = useSkill(state, "commander-kyousuke-strategy-meeting", { type: "none" });
    expect(drew.players.p1.hand.length).toBe(before + 1);
    expect(drew.players.p1.deck.length).toBe(state.players.p1.deck.length - 1);

    const powerTwoState = kyousukeState({ magic: 3 }, 5);
    const powerTwo = useSkill(powerTwoState, "commander-kyousuke-strategy-meeting", { type: "none" });
    expect(powerTwo.players.p1.hand.length).toBe(powerTwoState.players.p1.hand.length + 2);

    // CONTROL: Power 1 is still the printed single card.
    const powerOneState = kyousukeState({ magic: 2 }, 5);
    const powerOne = useSkill(powerOneState, "commander-kyousuke-strategy-meeting", { type: "none" });
    expect(powerOne.players.p1.hand.length).toBe(powerOneState.players.p1.hand.length + 1);
  });

  it("reshuffles an EMPTY deck out of the discard instead of drawing nothing", () => {
    const state = kyousukeState({}, 5);
    const parked = [...state.players.p1.deck];
    state.players.p1.deck = [];
    state.players.p1.discard = parked;
    expect(parked.length).toBeGreaterThan(0);
    const drew = useSkill(state, "commander-kyousuke-strategy-meeting", { type: "none" });
    expect(drew.players.p1.hand.length).toBe(1);
    expect(drew.players.p1.deck.length).toBe(parked.length - 1);
    expect(drew.players.p1.discard.length).toBe(0);

    // CONTROL: with NOTHING anywhere the command still resolves (AP spent, no card).
    const dry = kyousukeState({}, 5);
    dry.players.p1.deck = [];
    dry.players.p1.discard = [];
    const nothing = useSkill(dry, "commander-kyousuke-strategy-meeting", { type: "none" });
    expect(nothing.players.p1.hand).toEqual([]);
    expect(commanderActionPoints(nothing.combat!.units[KYOUSUKE])).toBe(3);
  });

  it("is target-less — its offer names the card count, not a unit", () => {
    const labels = getLegalActions(kyousukeState({}, 5), "p1")
      .filter(
        (legal) =>
          legal.action.type === "USE_UNIT_ABILITY" &&
          legal.action.abilityId === "commander-kyousuke-strategy-meeting"
      )
      .map((legal) => legal.label);
    expect(labels).toEqual(["Strategy Meeting · 2 AP · draw 1 card"]);
  });
});

// ===========================================================================
// The cast — Little Busters, Assemble! (3 AP)
// ===========================================================================

describe("Kyousuke — Little Busters, Assemble! (3 AP): the adjacent huddle", () => {
  it("the rally reaches the ADJACENT allies only", () => {
    const state = kyousukeState({}, 3);
    expect(commanderAdjacentAllies(state.combat!, state.combat!.units[KYOUSUKE]).map((u) => u.id).sort()).toEqual(
      [CRUSADERS, GRIFFINS].sort()
    );
    const control = damageFrom(kyousukeState({}, 3), GRIFFINS, SKELETONS);
    const rallied = rallyOn(state, KYOUSUKE);
    expect(damageFrom(rallied, GRIFFINS, SKELETONS)).toBe(control + 1);
    expect(getDisplayAttackBonus(rallied, rallied.combat!.units[CRUSADERS])).toBe(1);
    // The far Marksmen — and Kyousuke himself — are untouched.
    expect(getDisplayAttackBonus(rallied, rallied.combat!.units[MARKSMEN])).toBe(0);
    expect(getDisplayAttackBonus(rallied, rallied.combat!.units[KYOUSUKE])).toBe(0);
    // And so is the enemy standing right beside him.
    expect(getDisplayAttackBonus(rallied, rallied.combat!.units[SKELETONS])).toBe(0);
  });

  it("Power 1 adds +1 Defense and Power 2 raises the Attack to +2", () => {
    const attackControl = damageFrom(kyousukeState({}, 3), GRIFFINS, SKELETONS);
    const defenseControl = enemyDamageOn(kyousukeState({}, 3), SKELETONS, GRIFFINS);
    expect(defenseControl).toBeGreaterThan(0);

    const powerZero = rallyOn(kyousukeState({}, 3), KYOUSUKE);
    expect(damageFrom(powerZero, GRIFFINS, SKELETONS)).toBe(attackControl + 1);
    expect(getActiveDefenseBonus(powerZero, powerZero.combat!.units[GRIFFINS])).toBe(0);

    const powerOne = rallyOn(kyousukeState({ magic: 2 }, 3), KYOUSUKE);
    expect(damageFrom(powerOne, GRIFFINS, SKELETONS)).toBe(attackControl + 1);
    expect(
      enemyDamageOn(rallyOn(kyousukeState({ magic: 2 }, 3), KYOUSUKE), SKELETONS, GRIFFINS)
    ).toBe(defenseControl - 1);

    const powerTwo = rallyOn(kyousukeState({ magic: 3 }, 3), KYOUSUKE);
    expect(damageFrom(powerTwo, GRIFFINS, SKELETONS)).toBe(attackControl + 2);
    expect(
      enemyDamageOn(rallyOn(kyousukeState({ magic: 3 }, 3), KYOUSUKE), SKELETONS, GRIFFINS)
    ).toBe(defenseControl - 1);
  });

  it("a rally with nobody adjacent is never OFFERED (3 AP is never spent on an empty huddle)", () => {
    const alone = kyousukeState({}, 5);
    alone.combat!.units[GRIFFINS].position = 0;
    alone.combat!.units[CRUSADERS].position = 3;
    expect(commanderAdjacentAllies(alone.combat!, alone.combat!.units[KYOUSUKE])).toEqual([]);
    expect(skillOffered(alone, "commander-cast-kyousuke-assemble")).toBe(false);
    // CONTROL: one ally back beside him and the rally returns.
    const together = structuredClone(alone);
    together.combat!.units[GRIFFINS].position = 5;
    expect(skillOffered(together, "commander-cast-kyousuke-assemble")).toBe(true);
  });

  it("needs the full 3 AP: at 2 it is neither offered nor accepted", () => {
    const short = kyousukeState({}, 2);
    expect(skillOffered(short, "commander-cast-kyousuke-assemble")).toBe(false);
    refuse(short, {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: KYOUSUKE,
      abilityId: "commander-cast-kyousuke-assemble",
      target: { type: "none" }
    });
    expect(commanderActionPoints(short.combat!.units[KYOUSUKE])).toBe(2);
    // CONTROL: at 3 AP it is offered and resolves.
    expect(skillOffered(kyousukeState({}, 3), "commander-cast-kyousuke-assemble")).toBe(true);
  });

  it("is an ACTIVATION cast, never an instant reaction, and is repeatable while AP last", () => {
    const definition = commanderDefinitions.kyousuke_natsume;
    // The old Hierophant "defense-buff" reuse WAS an instant reaction; this is not.
    expect(definition.cast.effect.kind).not.toBe("defense-buff");
    const state = kyousukeState({}, 6);
    const once = rallyOn(state, KYOUSUKE);
    expect(commanderActionPoints(once.combat!.units[KYOUSUKE])).toBe(3);
    // No once-per-round cast budget for an AP commander — 3 AP left, 3 AP spent.
    const twice = rallyOn(once, KYOUSUKE);
    expect(commanderActionPoints(twice.combat!.units[KYOUSUKE])).toBe(0);
    expect(skillOffered(twice, "commander-cast-kyousuke-assemble")).toBe(false);
  });
});

// ===========================================================================
// The computer seat
// ===========================================================================

describe("Kyousuke — a computer seat plays him without stalling", () => {
  it("always has a scored action while Kyousuke's AP commands are on the menu, and reaches the end of its activation", () => {
    const state = kyousukeState({}, 5);
    // Drive p1's side as if it were the computer: every step must be a legal,
    // applicable action (never null = never a stall), and the activation must
    // close. 40 steps is generous; a genuine loop blows the budget.
    let current: GameState = state;
    let steps = 0;
    let usedAnApSkill = false;
    while (steps < 40 && current.combat && current.combat.activeUnitId === KYOUSUKE) {
      steps += 1;
      const legalActions = getLegalActions(current, "p1");
      expect(legalActions.length, "the AI is never handed an empty menu").toBeGreaterThan(0);
      const decision = chooseComputerAction({
        playerId: "p1",
        state: current as unknown as Parameters<typeof chooseComputerAction>[0]["state"],
        legalActions
      });
      expect(decision, "the AI always has something to do with an AP commander").toBeTruthy();
      if (
        decision!.action.type === "USE_UNIT_ABILITY" &&
        decision!.action.abilityId.startsWith("commander-")
      ) {
        usedAnApSkill = true;
      }
      const result = applyAction(current, decision!.action);
      expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
      current = settle(result.state);
    }
    expect(steps).toBeLessThan(40);
    expect(current.combat!.activeUnitId).not.toBe(KYOUSUKE);
    // Sanity: the fixture really did expose the AP menu to the scorer, and the
    // AI SPENT AP rather than walking past a full command bar.
    expect(getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId.startsWith("commander-kyousuke-")
    )).toBe(true);
    expect(usedAnApSkill, "the AI spends AP on a command").toBe(true);
  });

  it("never rallies an EMPTY huddle (the -1000 score) but scores every other AP command", () => {
    const alone = kyousukeState({}, 5);
    alone.combat!.units[GRIFFINS].position = 0;
    alone.combat!.units[CRUSADERS].position = 3;
    const legalActions = getLegalActions(alone, "p1");
    // The engine already withholds it; the AI's own score is the second guard.
    expect(
      legalActions.some(
        (legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === "commander-cast-kyousuke-assemble"
      )
    ).toBe(false);
    const forced: GameAction = {
      type: "USE_UNIT_ABILITY",
      playerId: "p1",
      unitId: KYOUSUKE,
      abilityId: "commander-cast-kyousuke-assemble",
      target: { type: "none" }
    };
    const decision = chooseComputerAction({
      playerId: "p1",
      state: alone as unknown as Parameters<typeof chooseComputerAction>[0]["state"],
      legalActions: [...legalActions, { action: forced, label: "forced rally" }]
    });
    expect(decision!.action).not.toEqual(forced);
    // CONTROL: with the huddle back the same forced offer is no longer bottom-ranked.
    const together = structuredClone(alone);
    together.combat!.units[GRIFFINS].position = 5;
    const rankedTogether = chooseComputerAction({
      playerId: "p1",
      state: together as unknown as Parameters<typeof chooseComputerAction>[0]["state"],
      legalActions: [{ action: forced, label: "forced rally" }]
    });
    expect(rankedTogether!.score).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Art (RED until the media lane publishes these five icons)
// ===========================================================================

describe("Kyousuke — command art", () => {
  it("every AP row and the AP panel header point at a PUBLISHED icon", () => {
    const urls = [
      ...commanderApSkills("kyousuke_natsume").map((skill) => skill.icon),
      commanderDefinitions.kyousuke_natsume.cast.icon,
      "/assets/anime/icons/little-busters/kyousuke-command.webp"
    ];
    for (const url of urls) {
      expect(hasMediaFile(url), `${url} — run npm run media:publish`).toBe(true);
    }
  });
});
