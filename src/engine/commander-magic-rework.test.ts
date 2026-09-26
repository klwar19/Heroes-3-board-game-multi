import { describe, expect, it } from "vitest";
import { commanderDefinitions, type CommanderSlug } from "@/data/commanders";
import {
  applyAction,
  commanderUnitId,
  createInitialGameState,
  getLegalActions,
  makeCommanderCombatUnit
} from "./index";
import { effectiveInitiative } from "./active-effects";
import { soulLinkShareAmount } from "./events";
import type { GameAction, GameState } from "./state";

/**
 * Commander Magic grade rework + Soul Eater (Necropolis) changes:
 *  - grade 2+ ignores NEGATIVE ongoing effects, while POSITIVE ones still land;
 *  - grade 2+ takes 1 less Specialty damage (grade 1 has the Spell ward only);
 *  - Soul Eater's Animate Dead may heal Soul Eater itself ONCE per combat;
 *  - Soul Link never drops the commander below 1 Health; the excess stays on
 *    the linked unit, and at 1 Health the link waits.
 * Each rule is asserted against a CONTROL where it would diverge.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  for (let safety = 0; safety < 40 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL"); safety += 1) {
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

/** Sandbox with `owner`'s commander (given Magic grade) on the battlefield. */
function sandbox(slug: CommanderSlug, magic: number, owner: "p1" | "p2" = "p1", position = 9): GameState {
  const state = createInitialGameState();
  state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
  state.players[owner].commander = {
    slug,
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic, speed: 0 }
  };
  const unit = makeCommanderCombatUnit(state.players[owner], position);
  if (!unit) throw new Error("expected a commander combat unit");
  state.combat!.units[unit.id] = unit;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

describe("Commander Magic grade 2 — negative ongoing effects are ignored, positive ones still land", () => {
  function hasteOwnCommander(magic: number): { before: number; after: number } {
    let state = sandbox("paladin", magic);
    state.players.p1.hand = ["spell.haste"];
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.activePlayerId = "p1";
    const id = commanderUnitId("p1");
    const before = effectiveInitiative(state.combat!.units[id], state.activeEffects);
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.haste" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === id
    );
    expect(cast, `Haste may target the Magic grade-${magic} commander`).toBeTruthy();
    state = settle(apply(state, cast!.action));
    return { before, after: effectiveInitiative(state.combat!.units[id], state.activeEffects) };
  }

  it("a friendly Haste (positive) raises a grade-2 commander's Initiative exactly as it does a grade-0 one", () => {
    const immune = hasteOwnCommander(2);
    expect(immune.after).toBeGreaterThan(immune.before);
    // CONTROL: the same Haste on a grade-0 commander gains the same amount.
    const plain = hasteOwnCommander(0);
    expect(immune.after - immune.before).toBe(plain.after - plain.before);
  });
});

describe("Commander Magic grade 2 — 1 less Specialty damage (Solmyr's Chain Lightning)", () => {
  function chainAtCommander(magic: number): number {
    const state = sandbox("paladin", magic, "p2", 13);
    state.players.p1.hand = ["specialty.solmyr.6"];
    for (const unit of Object.values(state.combat!.units)) {
      unit.damage = 0;
    }
    state.combat!.units.unit_p2_skeletons.position = 20;
    state.combat!.units.unit_p2_vampires.position = 21;
    state.combat!.units.unit_p2_dread_knights.position = 22;
    const id = commanderUnitId("p2");
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.solmyr.6" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === id
    );
    expect(play, "Solmyr VI may target the enemy commander").toBeTruthy();
    return apply(state, play!.action).combat!.units[id].damage;
  }

  it("grade 2 and 3 soak 1 of the 2-damage bolt; grade 1 (Spell ward only) takes all of it (CONTROL)", () => {
    expect(chainAtCommander(1)).toBe(2);
    expect(chainAtCommander(2)).toBe(1);
    expect(chainAtCommander(3)).toBe(1);
  });
});

describe("Soul Eater — Animate Dead may heal Soul Eater itself once per combat", () => {
  function castOffer(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "USE_UNIT_ABILITY" &&
        legal.action.abilityId === commanderDefinitions.soul_eater.cast.abilityId
    );
  }
  function openCast(state: GameState): GameState {
    const offer = castOffer(state);
    expect(offer, "Animate Dead offered").toBeTruthy();
    return apply(state, offer!.action);
  }
  function candidates(opened: GameState): string[] {
    const choice = opened.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the commander-cast target choice");
    return choice.candidateUnitIds;
  }

  it("offers the damaged Soul Eater once; after that self-heal only graded allies remain", () => {
    let state = sandbox("soul_eater", 0);
    const self = commanderUnitId("p1");
    state.combat!.units[self].damage = 2;
    // The combat-start Soul Link pick is not under test here.
    state.combat!.units[self].soulLinkSelectionDone = true;
    state.combat!.units.unit_p1_marksmen.grade = "bronze";
    state.combat!.units.unit_p1_marksmen.maxHealth = 9;
    state.combat!.units.unit_p1_marksmen.damage = 3;
    state.combat!.activeUnitId = self;
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];

    const opened = openCast(state);
    expect(candidates(opened)).toContain(self);
    expect(candidates(opened)).toContain("unit_p1_marksmen");
    const choice = opened.pendingChoice!;
    state = apply(opened, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: self });
    expect(state.combat!.units[self].damage).toBe(1);

    // A later round: the cast is available again, but Soul Eater itself is not.
    state.combat!.round += 1;
    delete state.combat!.units[self].commanderCastRound;
    const reopened = openCast(state);
    expect(candidates(reopened)).not.toContain(self);
    expect(candidates(reopened)).toContain("unit_p1_marksmen");
  });
});

describe("Soul Eater — Soul Link stops at 1 Health", () => {
  it("shares half (rounded up) only down to 1 Health, and nothing at 1 Health", () => {
    // CONTROL: plenty of Health left → the full rounded-up half.
    expect(soulLinkShareAmount({ damage: 0, maxHealth: 6 }, 3)).toBe(2);
    // Only 2 Health left: take 1 (to 1 Health) — the excess stays on the unit.
    expect(soulLinkShareAmount({ damage: 4, maxHealth: 6 }, 4)).toBe(1);
    // At 1 Health the link waits.
    expect(soulLinkShareAmount({ damage: 5, maxHealth: 6 }, 4)).toBe(0);
  });

  function boltLinkedMarksmen(commanderDamage: number): GameState {
    const state = sandbox("soul_eater", 0);
    const self = state.combat!.units[commanderUnitId("p1")];
    self.damage = commanderDamage;
    self.soulLinkTargetId = "unit_p1_marksmen";
    self.soulLinkSelectionDone = true;
    const marksmen = state.combat!.units.unit_p1_marksmen;
    marksmen.abilities = [];
    marksmen.maxHealth = 20;
    marksmen.damage = 0;
    state.players.p2.hand = ["spell.lightning_bolt"];
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.activePlayerId = "p2";
    const cast = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.lightning_bolt" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_marksmen"
    );
    expect(cast).toBeTruthy();
    return settle(apply(state, cast!.action));
  }

  it("a 2-damage bolt on the linked unit: 1/1 split when healthy; all 2 stay on the unit at 1 Health (CONTROL)", () => {
    const self = commanderUnitId("p1");
    const healthy = boltLinkedMarksmen(0);
    expect(healthy.combat!.units[self].damage).toBe(1);
    expect(healthy.combat!.units.unit_p1_marksmen.damage).toBe(1);

    const maxHealth = healthy.combat!.units[self].maxHealth;
    const atOne = boltLinkedMarksmen(maxHealth - 1);
    expect(atOne.combat!.units[self].damage).toBe(maxHealth - 1);
    expect(atOne.combat!.units.unit_p1_marksmen.damage).toBe(2);
    // The link did not fire, so it is still unused this round.
    expect(atOne.combat!.units[self].soulLinkUsedRound).toBeUndefined();
  });
});
