import { describe, expect, it } from "vitest";
import { hasMediaFile } from "@/lib/media-manifest";

import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";
import { effectiveInitiative } from "./active-effects";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  getUnitMoveRange
} from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Miku (Fuyuki) Voice of Angel I/IV/VI — engine-enforced outcomes.
 * Each case fails if its wiring is removed.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (unitId === undefined ||
        (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

describe("Miku hero registration", () => {
  it("is a Fuyuki magic hero with Interference and Voice of Angel specialties", () => {
    const hero = coreHeroDefinitions.miku;
    expect(hero).toBeDefined();
    expect(hero.faction).toBe("fuyuki");
    expect(hero.type).toBe("magic");
    expect(hero.startingAbilityCardId).toBe("ability.interference");
    expect(hero.specialtyCardIds).toEqual({
      1: "specialty.miku.1",
      4: "specialty.miku.4",
      6: "specialty.miku.6"
    });
    expect(hero.portrait).toBe("/assets/anime/heroes/miku.webp");
    expect(hasMediaFile("/assets/anime/heroes/miku.webp"), "miku portrait is not published (npm run media:publish)").toBe(
      true
    );
    for (const level of [1, 4, 6] as const) {
      const id = `specialty.miku.${level}`;
      expect(cardLibrary[id]?.implementationStatus, id).toBe("implemented");
      expect(cardLibrary[id]?.assets?.cardImage, `${id} is art-less native`).toBeUndefined();
    }
  });
});

describe("Voice of Angel I — SLOW_ALL_ENEMIES", () => {
  it("gives every enemy −1 Initiative and −1 Combat movement; allies unchanged", () => {
    const state = createInitialGameState("miku-i-slow");
    state.players.p1.hand = ["specialty.miku.1"];
    const enemyId = Object.keys(state.combat!.units).find(
      (id) => state.combat!.units[id].controllerId === "p2"
    )!;
    const allyId = Object.keys(state.combat!.units).find(
      (id) => state.combat!.units[id].controllerId === "p1"
    )!;
    const enemyBefore = effectiveInitiative(state.combat!.units[enemyId], state.activeEffects);
    const allyBefore = effectiveInitiative(state.combat!.units[allyId], state.activeEffects);
    const enemyMoveBefore = getUnitMoveRange(state.combat!.units[enemyId], state);
    const allyMoveBefore = getUnitMoveRange(state.combat!.units[allyId], state);

    const play = findPlay(state, "specialty.miku.1");
    expect(play, "I is offered as a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);

    expect(effectiveInitiative(after.combat!.units[enemyId], after.activeEffects)).toBe(
      enemyBefore - 1
    );
    expect(getUnitMoveRange(after.combat!.units[enemyId], after)).toBe(
      Math.max(1, enemyMoveBefore - 1)
    );
    // CONTROL: own units are not slowed.
    expect(effectiveInitiative(after.combat!.units[allyId], after.activeEffects)).toBe(allyBefore);
    expect(getUnitMoveRange(after.combat!.units[allyId], after)).toBe(allyMoveBefore);
  });
});

describe("Voice of Angel IV — heal after own unit is attacked", () => {
  // Skeletons (p2) strike Miku's pre-damaged Griffins (p1) in melee. After the
  // hit resolves, the specialty must heal 1 on the attacked Griffins. A CONTROL
  // that skips the specialty proves the heal is the specialty's doing — the pair
  // fails if EITHER the CREATE_HEAL_ON_ATTACKED wiring OR the
  // applyHealAfterAttacked consumer is removed.
  const ATTACKER: UnitId = "unit_p2_skeletons";
  const DEFENDER: UnitId = "unit_p1_griffins";

  function runIncomingMelee(seed: string, withSpecialty: boolean): GameState {
    let state = createInitialGameState(seed);
    if (withSpecialty) {
      state.players.p1.hand = ["specialty.miku.4"];
      const play = findPlay(state, "specialty.miku.4");
      expect(play, "IV is offered as a combat play").toBeTruthy();
      state = applyOk(state, play!.action);
      expect(
        state.activeEffects.some((effect) =>
          effect.modifiers.some((mod) => mod.type === "HEAL_AFTER_ATTACKED" && mod.amount === 1)
        ),
        "ongoing HEAL_AFTER_ATTACKED is recorded"
      ).toBe(true);
    }
    const combat = state.combat!;
    combat.units[ATTACKER].position = 9;
    combat.units[DEFENDER].position = 13; // adjacent to 9
    combat.units[DEFENDER].maxHealth = 50;
    combat.units[DEFENDER].damage = 3; // pre-damaged so a heal is observable
    combat.units[ATTACKER].attackedThisActivation = false;
    combat.units[ATTACKER].retaliatedThisRound = false;
    combat.activeUnitId = ATTACKER;
    combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    combat.dice.rollCount = 0;
    state.activePlayerId = "p2";
    state.players.p2.hand = [];
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: ATTACKER,
      defenderId: DEFENDER
    });
    return passAllReactions(state);
  }

  it("heals 1 on the attacked friendly unit after a resolved hit", () => {
    const next = runIncomingMelee("miku-iv-heal", true);
    expect(next.combat!.units[DEFENDER]).toBeDefined();
    expect(
      next.eventLog.some(
        (event) =>
          event.type === "DAMAGE_HEALED" &&
          event.target.type === "unit" &&
          event.target.unitId === DEFENDER &&
          event.amount >= 1
      ),
      "DAMAGE_HEALED fires on the attacked friendly unit"
    ).toBe(true);
  });

  it("CONTROL: without the specialty, the attacked unit is not healed", () => {
    const next = runIncomingMelee("miku-iv-control", false);
    expect(
      next.eventLog.some(
        (event) =>
          event.type === "DAMAGE_HEALED" &&
          event.target.type === "unit" &&
          event.target.unitId === DEFENDER
      )
    ).toBe(false);
  });
});

describe("Voice of Angel VI — DAMAGE_ALL_ENEMY_UNITS", () => {
  it("deals 1 damage to every living enemy; allies untouched", () => {
    const state = createInitialGameState("miku-vi-blast");
    state.players.p1.hand = ["specialty.miku.6"];
    const enemies = Object.values(state.combat!.units).filter((u) => u.controllerId === "p2");
    const allies = Object.values(state.combat!.units).filter((u) => u.controllerId === "p1");
    for (const enemy of enemies) {
      enemy.damage = 0;
    }
    for (const ally of allies) {
      ally.damage = 0;
    }
    const play = findPlay(state, "specialty.miku.6");
    expect(play, "VI is offered").toBeTruthy();
    const after = applyOk(state, play!.action);
    for (const enemy of enemies) {
      expect(after.combat!.units[enemy.id].damage, enemy.cardName).toBeGreaterThanOrEqual(1);
    }
    for (const ally of allies) {
      expect(after.combat!.units[ally.id].damage, ally.cardName).toBe(0);
    }
  });
});
