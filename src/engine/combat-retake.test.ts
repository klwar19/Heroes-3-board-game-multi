import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getPlayerView } from "./index";
import { redactStateForSeat } from "./player-view";
import { combatRetakeParticipants, trackCombatRetake } from "./combat-retake";
import type { GameAction, GameState } from "./state";

function ready(enabled = true): GameState {
  const state = createInitialGameState("retake");
  state.adventure = createAdventureGameState({ seed: "retake-map", rollFirstPlayer: false,
    houseRules: { "combat-retake": enabled } }).adventure;
  state.combat!.context = { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2", fieldId: "0,0" };
  state.combat!.setup = null;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  for (const unit of Object.values(state.combat!.units)) {
    Object.assign(unit, { abilities: [], position: 0, attack: 0, defense: 0, damage: 0, maxHealth: 60 });
  }
  Object.assign(state.combat!.units.unit_p1_marksmen, { position: 9, type: "ground", attack: 4 });
  Object.assign(state.combat!.units.unit_p2_skeletons, { position: 10, type: "ground" });
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.combat!.dice.scriptedRolls = Array(30).fill(0);
  state.activePlayerId = "p1";
  return state;
}

function ok(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

function attack(state: GameState): GameState {
  let next = ok(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
  for (let i = 0; i < 30 && next.reactionWindow; i++) {
    next = ok(next, { type: "PASS_REACTION", playerId: next.reactionWindow.priorityPlayerId });
  }
  expect(next.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(0);
  return next;
}

describe("PvP activation retake by mutual consent", () => {
  it("saves the first activation when deployment ends", () => {
    const after = ready();
    const before = structuredClone(after);
    before.combat!.setup = { pendingPlayerIds: ["p1"], placedUnitIds: {}, unitLimit: 5 };
    trackCombatRetake(before, after, { type: "END_TURN", playerId: "p1" });
    expect(after.combatRetakeCheckpoint?.snapshot.combat).toEqual(after.combat);
    expect(getPlayerView(after, "p1").combatRetakeAvailable).toBe(true);
    expect(getPlayerView(ready(), "p1").combatRetakeAvailable).toBe(false);
  });
  it("restores damage, dice, cards and activation only after the other player agrees", () => {
    const start = ready();
    const hit = attack(start);
    const requested = ok(hit, { type: "REQUEST_COMBAT_RETAKE", playerId: "p1" });
    expect(requested.combat).toEqual(hit.combat);
    expect(applyAction(requested, { type: "ANSWER_COMBAT_RETAKE", playerId: "p1", agree: true }).errors).not.toEqual([]);
    const restored = ok(requested, { type: "ANSWER_COMBAT_RETAKE", playerId: "p2", agree: true });
    expect(restored.combat).toEqual(start.combat);
    expect(restored.players).toEqual(start.players);
    expect(restored.stack).toEqual(start.stack);
    expect(restored.pendingChoice).toEqual(start.pendingChoice);
    expect(restored.activeEffects).toEqual(start.activeEffects);
    expect(restored.combatRetakeVote).toBeUndefined();
    expect(restored.combatRetakeCheckpoint).toBeUndefined();
    expect(restored.eventLog.at(-1)).toMatchObject({ type: "EVENT_NOTE", message: "Both combat participants agreed: the unit's activation has been restarted." });
    // It is playable again, not merely a visual reset.
    expect(attack(restored).combat!.units.unit_p2_skeletons.damage).toBe(hit.combat!.units.unit_p2_skeletons.damage);
  });

  it("allows the defender to request, but requires the attacker to approve", () => {
    const hit = attack(ready());
    const requested = ok(hit, { type: "REQUEST_COMBAT_RETAKE", playerId: "p2" });
    const restored = ok(requested, { type: "ANSWER_COMBAT_RETAKE", playerId: "p1", agree: true });
    expect(restored.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it.each(["p1", "p2"])("decline/cancel by %s leaves damage and dice unchanged", playerId => {
    const hit = attack(ready());
    const requested = ok(hit, { type: "REQUEST_COMBAT_RETAKE", playerId: "p1" });
    const declined = ok(requested, { type: "ANSWER_COMBAT_RETAKE", playerId, agree: false });
    expect(declined.combat).toEqual(hit.combat);
    expect(declined.combatRetakeVote).toBeUndefined();
  });

  it("freezes combat while consent is pending and refuses outsiders", () => {
    const requested = ok(attack(ready()), { type: "REQUEST_COMBAT_RETAKE", playerId: "p1" });
    for (const action of [
      { type: "CONTINUE_COMBAT", playerId: "p1" },
      { type: "REQUEST_COMBAT_RETAKE", playerId: "p3" },
      { type: "ANSWER_COMBAT_RETAKE", playerId: "p3", agree: true },
    ] as GameAction[]) {
      const result = applyAction(requested, action);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.state.combat).toEqual(requested.combat);
    }
  });

  it("keeps the checkpoint private for both seats and observers, including after serialization", () => {
    const state = JSON.parse(JSON.stringify(attack(ready()))) as GameState;
    expect(state.combatRetakeCheckpoint?.snapshot.combat).toBeDefined();
    expect(state.combatRetakeCheckpoint?.snapshot.combatRetakeCheckpoint).toBeUndefined();
    for (const seat of ["p1", "p2", "observer"]) {
      expect(getPlayerView(state, seat).combatRetakeCheckpoint).toBeUndefined();
      expect(redactStateForSeat(state, seat).combatRetakeCheckpoint).toBeUndefined();
    }
    const requested = ok(state, { type: "REQUEST_COMBAT_RETAKE", playerId: "p1" });
    expect(ok(requested, { type: "ANSWER_COMBAT_RETAKE", playerId: "p2", agree: true }).combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("rejects disabled, map, neutral, neutral-controlled and finished combat", () => {
    const disabled = ready(false);
    const map = ready(); map.combat = null;
    const neutral = ready(); neutral.combat!.context = { kind: "neutral", heroId: "hero_p1", fieldId: "0,0" } as NonNullable<GameState["combat"]>["context"];
    const finished = ready(); finished.combat!.outcome = { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "retreat" };
    // Both seat IDs stay human on neutral: the context gate, not just seat IDs, must reject it.
    for (const state of [disabled, map, neutral, finished]) {
      expect(combatRetakeParticipants(state)).toEqual([]);
      expect(applyAction(state, { type: "REQUEST_COMBAT_RETAKE", playerId: "p1" }).errors.length).toBeGreaterThan(0);
    }
    expect(attack(disabled).combatRetakeCheckpoint).toBeUndefined();
  });
});
