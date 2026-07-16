import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  expertUsesAvailable,
  expertUsesTotalThisRound,
  getLegalActions
} from "./index";
import { getMainHero, refreshRoundTokens } from "./adventure";
import { startPlayerCombat } from "./adventure-reducer";
import type { GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** END_COMBAT_ROUND with the active unit cleared, so the round may end here. */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

function expertOffers(state: GameState, playerId: PlayerId) {
  return getLegalActions(state, playerId).filter((legal) => (legal.action as { mode?: string }).mode === "expert");
}

function scriptDice(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
}

describe("expert-effect crown limit — realistic combat flow", () => {
  it("a 1-crown hero who plays Archery expert cannot then play an attack-instant expert", () => {
    let state = createInitialGameState("crown-archery-then-instant");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.hand = ["ability.archery", "stat.attack"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9; // adjacent to the skeletons
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    scriptDice(state, [1, -1, 1, -1]);

    // Archery expert (ongoing) spends the only crown.
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.archery",
      mode: "expert",
      target: { type: "none" }
    });
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(expertUsesAvailable(state.players.p1)).toBe(0);

    // Declaring an attack opens the reaction window.
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(state.reactionWindow).toBeTruthy();

    // The Attack statistic's expert side is NOT offered, and forcing it fails.
    const offers = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.attack"
    );
    expect(offers.every((legal) => (legal.action as { mode?: string }).mode !== "expert")).toBe(true);

    const forced = applyAction(state, { type: "PLAY_REACTION", playerId: "p1", cardId: "stat.attack", mode: "expert" });
    expect(forced.errors.length, "a second expert play must be rejected").toBeGreaterThan(0);
    expect(forced.state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });
});

describe("expert-effect crown limit", () => {
  it("a level-2 hero (1 crown) cannot play a second expert effect in the same round", () => {
    let state = createInitialGameState("crown-lv2-seed");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.hand = ["ability.archery", "ability.luck"];

    const before = expertOffers(state, "p1");
    expect(before.length, "an expert effect should be offered with a free crown").toBeGreaterThan(0);

    // Spend the only crown.
    state = applyOk(state, before[0].action as GameAction);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(expertUsesAvailable(state.players.p1)).toBe(0);

    // No expert effect may be chosen now — the option is gone, not merely re-labelled.
    expect(expertOffers(state, "p1").map((legal) => legal.label)).toEqual([]);

    // And forcing it anyway is rejected by the reducer.
    const forced = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.archery",
      mode: "expert",
      target: { type: "none" }
    });
    expect(forced.errors.length, "a second expert play must be rejected").toBeGreaterThan(0);
  });

  it("a one-round bonus crown is offered while it lasts, but only up to the total", () => {
    const state = createInitialGameState("crown-bonus-seed");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 1; // base crown already spent
    state.players.p1.combatStats.expertUseBonusThisRound = 1; // e.g. Pendant of Courage
    state.players.p1.hand = ["ability.archery", "ability.luck"];

    // 1 + 1 bonus − 1 spent = 1 crown free.
    expect(expertUsesAvailable(state.players.p1)).toBe(1);
    expect(expertOffers(state, "p1").length, "the bonus crown should still allow an expert").toBeGreaterThan(0);

    // Spend the bonus crown; now nothing is free.
    state.players.p1.combatStats.expertUsesSpentThisRound = 2;
    expect(expertUsesAvailable(state.players.p1)).toBe(0);
    expect(expertOffers(state, "p1").map((legal) => legal.label)).toEqual([]);
  });

  it("crowns are a per-game-round budget: they survive across combat rounds within a battle", () => {
    let state = createInitialGameState("crown-combat-round-seed");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUseBonusThisRound = 1; // e.g. Pendant of Courage
    state.players.p1.combatStats.expertUsesSpentThisRound = 1; // base crown already spent

    // 1 + 1 bonus − 1 spent = 1 crown free this round.
    expect(expertUsesAvailable(state.players.p1)).toBe(1);

    // Advancing to the next COMBAT round does NOT refresh crowns — the spend and
    // the bonus are a per-game-round budget, not a per-combat-round one.
    state = endRound(state, "p1");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(state.players.p1.combatStats.expertUseBonusThisRound ?? 0).toBe(1);
    expect(expertUsesAvailable(state.players.p1)).toBe(1);
  });

  it("crowns and the one-round bonus refresh only at the start of the player's game round", () => {
    const state = createInitialGameState("crown-game-round-seed");
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUseBonusThisRound = 1; // e.g. Pendant of Courage
    state.players.p1.combatStats.expertUsesSpentThisRound = 1; // base crown already spent

    // Nothing free until the game round refreshes (1 + 1 − 1 = 1... but the
    // spend should clear, not the availability — verify the refresh below).
    expect(expertUsesAvailable(state.players.p1)).toBe(1);

    // The game-round refresh (start of the player's turn) clears the spend and
    // the one-round bonus: only the base crown comes back.
    refreshRoundTokens(state);
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(state.players.p1.combatStats.expertUseBonusThisRound ?? 0).toBe(0);
    expect(expertUsesAvailable(state.players.p1)).toBe(1);
  });
});

describe("expert-effect crown limit — crowns are shared between the map and the ensuing battle", () => {
  // The reported bug: a level-3 hero (1 crown) spent its only crown on a map
  // ability, then entered combat and was handed a *second* crown because
  // starting combat reset `expertUsesSpentThisRound`. Crowns are a per-game-round
  // budget shared across map abilities and combat, so the spend must carry in.
  it("a crown spent on the map this round leaves nothing for the battle it triggers", () => {
    let state = createAdventureGameState({ seed: "tactics-diplomacy", difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }

    // Level 3 → exactly one crown, already spent this round on a map ability.
    state.players.p1.limits.expertUses = 1;
    state.players.p1.combatStats.expertUsesSpentThisRound = 1;
    state.players.p1.combatStats.expertUseBonusThisRound = 0;
    expect(expertUsesAvailable(state.players.p1)).toBe(0);

    // Step onto the level-I guarded mine — this starts a neutral combat.
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
    expect(state.combat, "moving onto the guarded mine should start a combat").toBeTruthy();

    // The crown spent on the map is still spent: the battle offers no fresh crown.
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(expertUsesAvailable(state.players.p1)).toBe(0);
  });

  // One pool per game round, used or not on your own turn: if an enemy attacks
  // you on THEIR turn, you defend with whatever crowns you have left — a spent
  // pool is not refilled just because the battle started on someone else's turn.
  it("a defender who already spent its crown this round gets none for the enemy-initiated battle", () => {
    let state = createAdventureGameState({ seed: "tactics-diplomacy", difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const heroP1 = getMainHero(state, "p1")!;
    const heroP2 = getMainHero(state, "p2")!;

    // p2 is level 3 (1 crown) and already spent it earlier this round.
    state.players.p2.limits.expertUses = 1;
    state.players.p2.combatStats.expertUsesSpentThisRound = 1;
    state.players.p2.combatStats.expertUseBonusThisRound = 0;
    expect(expertUsesAvailable(state.players.p2)).toBe(0);

    // p1 attacks p2 on p1's turn — a fresh combat where p2 is the defender.
    const fieldId = heroP1.spaceId ?? Object.keys(state.adventure!.fields)[0];
    startPlayerCombat(state, heroP1, heroP2, fieldId);
    expect(state.combat, "the player-vs-player combat should start").toBeTruthy();

    // The defender's crown stays spent: no fresh crown for the enemy-turn battle.
    expect(state.players.p2.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(expertUsesAvailable(state.players.p2)).toBe(0);
  });
});

describe("crown budget helpers — remaining vs round total (HUD read)", () => {
  // The adventure HUD shows "remaining / total"; both numbers come straight from
  // these pure helpers so the display can never drift from the engine's read.
  it("total is the level budget plus one-shot bonus; remaining subtracts what was spent", () => {
    const state = createInitialGameState("crown-helper-total");
    const player = state.players.p1;
    player.limits.expertUses = 3;
    player.combatStats.expertUseBonusThisRound = 1;
    player.combatStats.expertUsesSpentThisRound = 1;

    // total = 3 (level) + 1 (bonus) = 4; remaining = 4 − 1 spent = 3.
    expect(expertUsesTotalThisRound(player)).toBe(4);
    expect(expertUsesAvailable(player)).toBe(3);
  });

  it("CONTROL: spending more crowns lowers remaining while total holds", () => {
    const state = createInitialGameState("crown-helper-control");
    const player = state.players.p1;
    player.limits.expertUses = 3;
    player.combatStats.expertUseBonusThisRound = 1;
    player.combatStats.expertUsesSpentThisRound = 2;

    // Same 4 total, but a second crown spent → remaining is 2, not 3.
    expect(expertUsesTotalThisRound(player)).toBe(4);
    expect(expertUsesAvailable(player)).toBe(2);
  });

  it("a missing (undefined) bonus is treated as zero on both helpers", () => {
    const state = createInitialGameState("crown-helper-nobonus");
    const player = state.players.p1;
    player.limits.expertUses = 2;
    player.combatStats.expertUseBonusThisRound = undefined;
    player.combatStats.expertUsesSpentThisRound = 0;

    expect(expertUsesTotalThisRound(player)).toBe(2);
    expect(expertUsesAvailable(player)).toBe(2);
  });
});
