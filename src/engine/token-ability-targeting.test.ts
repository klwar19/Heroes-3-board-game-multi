import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getUnitTokens, tokenAttackBonus } from "./tokens";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * The Ogres' Attack ("Bloodlust") token and the Sorceresses' Weakness token are
 * "other actions" used instead of attacking. They are NOT a wall of one
 * command-button-per-target: a single command opens a board picker
 * (ABILITY_TARGET_CHOICE, kind "place-token") the controller resolves by
 * clicking a unit. The Sorceresses only ever DEBUFF an enemy; the Ogres only
 * ever BUFF a friendly ground/flying unit. Every assertion fails if that wiring
 * is removed.
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

function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
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
        candidateIndex: 0
      });
    }
  }
  return current;
}

function firstAttackValue(state: GameState): number {
  const rolled = state.eventLog.find(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      event.type === "ATTACK_ROLLED" && !event.isRetaliation
  );
  if (!rolled) {
    throw new Error("no attack was rolled");
  }
  return rolled.attackValue;
}

/** Turns p1's `unitId` into the token placer and makes it the active unit. */
function placerState(seed: string, unitId: string, abilities: string[]): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const placer = state.combat!.units[unitId];
  placer.abilities = abilities;
  placer.activatedThisRound = false;
  placer.movedThisActivation = false;
  placer.attackedThisActivation = false;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = unitId;
  return state;
}

/** The legal "open the token picker" commands for `unitId`/`abilityId`. */
function openTokenPicker(state: GameState, unitId: string, abilityId: string) {
  return getLegalActions(state, "p1").filter(
    (legal) =>
      legal.action.type === "USE_UNIT_ABILITY" &&
      legal.action.unitId === unitId &&
      legal.action.abilityId === abilityId
  );
}

function pendingChoiceId(state: GameState): string {
  return state.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? state.pendingChoice.id : "";
}

describe("Sorceresses' Weakness token — DEBUFF enemy only", () => {
  it("opens a single board picker (not one button per target) and offers ONLY enemies", () => {
    // unit_p1_marksmen stands in for the ranged Sorceresses; all p1 units are
    // friendly, all p2 units are enemies.
    const state = placerState("sorc-enemy", "unit_p1_marksmen", ["sorceress-weakness-few"]);

    const opens = openTokenPicker(state, "unit_p1_marksmen", "sorceress-weakness-few");
    expect(opens, "exactly one open-picker command — never a wall of per-target buttons").toHaveLength(1);
    expect(opens[0].action.type === "USE_UNIT_ABILITY" && opens[0].action.target.type).toBe("none");

    const picking = applyOk(state, opens[0].action);
    const choice = picking.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(choice.kind).toBe("place-token");
    const candidates = new Set(choice.candidateUnitIds);

    // Every enemy is a candidate…
    for (const id of ["unit_p2_skeletons", "unit_p2_vampires", "unit_p2_dread_knights"]) {
      expect(candidates.has(id), `enemy ${id} should be a Weakness target`).toBe(true);
    }
    // …and NO friendly unit is (a debuff is never dropped on your own side).
    for (const id of ["unit_p1_marksmen", "unit_p1_griffins", "unit_p1_crusaders"]) {
      expect(candidates.has(id), `friendly ${id} must NOT be a Weakness target`).toBe(false);
    }

    // The per-click legal actions agree: every offered target is an enemy.
    const targetActions = getLegalActions(picking, "p1").filter(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId !== "skip"
    );
    expect(targetActions.length).toBeGreaterThan(0);
    for (const legal of targetActions) {
      const id = legal.action.type === "CHOOSE_ABILITY_TARGET" ? legal.action.targetUnitId : "";
      expect(picking.combat!.units[id]?.controllerId).toBe("p2");
    }
  });

  it("lands a −2 Weakness token on the chosen enemy and ends the activation", () => {
    const state = placerState("sorc-place", "unit_p1_marksmen", ["sorceress-weakness-few"]);
    expect(tokenAttackBonus(state.combat!.units.unit_p2_skeletons)).toBe(0); // control

    const picking = applyOk(state, openTokenPicker(state, "unit_p1_marksmen", "sorceress-weakness-few")[0].action);
    const placed = applyOk(picking, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: pendingChoiceId(picking),
      targetUnitId: "unit_p2_skeletons"
    });

    const target = placed.combat!.units.unit_p2_skeletons;
    expect(getUnitTokens(target).find((token) => token.kind === "weakness")?.amount).toBe(-2);
    expect(tokenAttackBonus(target)).toBe(-2); // the token lowers the enemy's attack by 2
    expect(placed.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(true);
    expect(placed.pendingChoice).toBeNull();
  });
});

describe("Ogres' Bloodlust token — BUFF friendly ground/flying only", () => {
  it("offers ONLY friendly ground/flying units (no enemy, no friendly ranged)", () => {
    // unit_p1_crusaders stands in for the ground Ogres. Friendly griffins =
    // flying (eligible), crusaders = ground (eligible, self), marksmen = ranged
    // (NOT eligible); enemies are never eligible (a buff only helps your side).
    const state = placerState("ogre-ally", "unit_p1_crusaders", ["ogres-attack-token-pack"]);
    const picking = applyOk(state, openTokenPicker(state, "unit_p1_crusaders", "ogres-attack-token-pack")[0].action);
    const choice = picking.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    const candidates = new Set(choice.candidateUnitIds);

    expect(candidates.has("unit_p1_griffins"), "friendly flying unit is eligible").toBe(true);
    expect(candidates.has("unit_p1_crusaders"), "friendly ground unit (self) is eligible").toBe(true);
    expect(candidates.has("unit_p1_marksmen"), "friendly RANGED unit is NOT eligible").toBe(false);
    for (const id of ["unit_p2_skeletons", "unit_p2_vampires", "unit_p2_dread_knights"]) {
      expect(candidates.has(id), `enemy ${id} must NOT be a Bloodlust target`).toBe(false);
    }
  });

  it("a placed +2 Bloodlust token genuinely raises the buffed ally's attack in combat", () => {
    // Control: griffins (attack 3) strike skeletons — attackValue 3, no token.
    expect(firstAttackValue(runBloodlustDuel("ogre-fx-base", null))).toBe(3);
    // Buffed: the Ogres place +2 on the griffins first → attackValue 5 (3 + 2).
    expect(firstAttackValue(runBloodlustDuel("ogre-fx-buff", "ogres-attack-token-pack"))).toBe(5);
  });
});

describe("Token picker — cancel is a clean no-op", () => {
  it("cancelling the picker places no token and does NOT end the activation", () => {
    const state = placerState("sorc-cancel", "unit_p1_marksmen", ["sorceress-weakness-few"]);
    const picking = applyOk(state, openTokenPicker(state, "unit_p1_marksmen", "sorceress-weakness-few")[0].action);
    const cancelled = applyOk(picking, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: pendingChoiceId(picking),
      targetUnitId: "skip"
    });

    // No token landed on ANY unit…
    for (const unit of Object.values(cancelled.combat!.units)) {
      expect(getUnitTokens(unit), `${unit.id} should be token-free after a cancel`).toHaveLength(0);
    }
    // …the unit is still free to act (the "other action" was never committed)…
    expect(cancelled.combat!.units.unit_p1_marksmen.activatedThisRound).toBe(false);
    expect(cancelled.pendingChoice).toBeNull();
    // …and the open-picker command is offered again.
    expect(openTokenPicker(cancelled, "unit_p1_marksmen", "sorceress-weakness-few")).toHaveLength(1);
  });
});

/**
 * A clean melee duel: the griffins (attack 3) strike undefended skeletons with
 * the Attack die scripted to 0, so the reported attackValue is exactly attack +
 * any token. When `ogreAbility` is set, the crusaders first become the Ogres and
 * drop the buff on the griffins through the picker before they swing.
 */
function runBloodlustDuel(seed: string, ogreAbility: string | null): GameState {
  const state = createInitialGameState(seed);
  const attacker = state.combat!.units.unit_p1_griffins;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.type = "ground";
  attacker.position = 9;
  attacker.attack = 3;
  attacker.defense = 1;
  attacker.maxHealth = 50;
  attacker.damage = 0;
  attacker.abilities = [];
  attacker.activatedThisRound = false;
  attacker.movedThisActivation = false;
  attacker.attackedThisActivation = false;
  defender.type = "ground";
  defender.position = 13;
  defender.attack = 1;
  defender.defense = 0;
  defender.maxHealth = 50;
  defender.damage = 0;
  defender.abilities = [];
  state.combat!.units.unit_p1_marksmen.position = 0;
  state.combat!.units.unit_p1_crusaders.position = 3;
  state.combat!.units.unit_p2_vampires.position = 19;
  state.combat!.units.unit_p2_dread_knights.position = 16;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;

  let current = state;
  if (ogreAbility) {
    const ogres = current.combat!.units.unit_p1_crusaders;
    ogres.type = "ground";
    ogres.abilities = [ogreAbility];
    ogres.activatedThisRound = false;
    ogres.movedThisActivation = false;
    ogres.attackedThisActivation = false;
    current.combat!.activeUnitId = "unit_p1_crusaders";
    current = applyOk(current, openTokenPicker(current, "unit_p1_crusaders", ogreAbility)[0].action);
    current = applyOk(current, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: pendingChoiceId(current),
      targetUnitId: "unit_p1_griffins"
    });
    // The buffed griffins still carry the +2 Attack token.
    expect(tokenAttackBonus(current.combat!.units.unit_p1_griffins)).toBe(2);
  }

  // Now the griffins take their swing.
  current.combat!.activeUnitId = "unit_p1_griffins";
  current.combat!.units.unit_p1_griffins.activatedThisRound = false;
  current.combat!.units.unit_p1_griffins.attackedThisActivation = false;
  current.activePlayerId = "p1";
  return settle(
    applyOk(current, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    })
  );
}
