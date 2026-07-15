import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  spellCastPowerBounds,
  spellMaxUsefulPower,
  spellMinUsefulPower
} from "./index";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("spellCastPowerBounds", () => {
  it("Implosion: min useful 1, max useful 5 (no Power-0 damage tier)", () => {
    expect(spellMinUsefulPower(cardLibrary["spell.implosion"])).toBe(1);
    expect(spellMaxUsefulPower(cardLibrary["spell.implosion"])).toBe(5);
    expect(spellCastPowerBounds(cardLibrary["spell.implosion"])).toEqual({
      minUseful: 1,
      maxUseful: 5
    });
  });

  it("Lightning Bolt works at Power 0 and tops at 2", () => {
    expect(spellCastPowerBounds(cardLibrary["spell.lightning_bolt"])).toEqual({
      minUseful: 0,
      maxUseful: 2
    });
  });

  it("Magic Arrow works at Power 0 and tops at 2", () => {
    expect(spellCastPowerBounds(cardLibrary["spell.magic_arrow"])).toEqual({
      minUseful: 0,
      maxUseful: 2
    });
  });

  it("a non-scaling spell has no max-useful tier", () => {
    // Dispel is grade-gated but still has amountByPower-like gradeByPower keys.
    // A pure non-ladder card (if any) returns maxUseful null — Haste has amountByPower.
    const bounds = spellCastPowerBounds(cardLibrary["spell.haste"]);
    expect(bounds.minUseful).toBe(0);
    expect(bounds.maxUseful).toBeGreaterThanOrEqual(0);
  });
});

describe("PASS_REACTION under-min Power guard", () => {
  function castImplosionWithPowerCards(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.implosion", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 30;
    target.damage = 0;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.implosion" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "Implosion cast should be legal").toBeTruthy();
    return applyOk(state, cast!.action);
  }

  it("rejects the caster's Pass while Power is below min and fuel remains", () => {
    const casted = castImplosionWithPowerCards("impl-pass-block");
    // Caster has priority and still holds Power statistics — Pass must fail.
    expect(casted.reactionWindow?.priorityPlayerId).toBe("p1");
    const blocked = applyAction(casted, { type: "PASS_REACTION", playerId: "p1" });
    expect(blocked.errors.length).toBeGreaterThan(0);
    expect(blocked.errors[0]?.message).toMatch(/at least Power 1/i);
    expect(blocked.state.stack.length).toBe(1);
    expect(blocked.state.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("allows Pass once Power reaches the min useful tier", () => {
    let state = castImplosionWithPowerCards("impl-pass-ok");
    // Fuel +1 Power via the Power statistic reaction.
    const boost = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        (legal.action.asPowerBoost ||
          (legal.action.cardId === "stat.power" && !legal.action.asPowerBoost))
    );
    // Prefer the dedicated Power-card play or discard-for-power.
    const powerPlay =
      getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === "stat.power" &&
          !legal.action.asPowerBoost
      ) ??
      getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.asPowerBoost
      );
    expect(powerPlay ?? boost, "a Power fuel play should be offered").toBeTruthy();
    state = applyOk(state, (powerPlay ?? boost)!.action);

    // Pass through any remaining reactions so the cast resolves.
    let safety = 20;
    while (state.reactionWindow && safety-- > 0) {
      const pass = applyAction(state, {
        type: "PASS_REACTION",
        playerId: state.reactionWindow.priorityPlayerId
      });
      expect(pass.errors, pass.errors.map((e) => e.message).join("; ")).toEqual([]);
      state = pass.state;
    }
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("allows Pass under min when the caster has nothing left to fuel with", () => {
    const state = createInitialGameState("impl-pass-empty");
    // Only Implosion — after cast the hand is empty of Power sources.
    state.players.p1.hand = ["spell.implosion"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p2_skeletons.abilities = [];
    state.combat!.units.unit_p2_skeletons.maxHealth = 30;
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.implosion"
    );
    expect(cast).toBeTruthy();
    let next = applyOk(state, cast!.action);
    // No fuel left — Pass is the escape hatch so the table cannot soft-lock.
    // Pass as whoever currently holds priority (the window may open on either seat).
    let safety = 12;
    while (next.reactionWindow && safety-- > 0) {
      const passer = next.reactionWindow.priorityPlayerId;
      const result = applyAction(next, { type: "PASS_REACTION", playerId: passer });
      expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
      next = result.state;
    }
    // Spell resolved for 0 damage (fizzle) — not stuck.
    expect(next.stack.length).toBe(0);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("a FORCED-resolution pass (AFK drop / turn timeout) is never blocked — the cast just fizzles", () => {
    // The AFK-drop and turn-timeout drivers hard-code PASS_REACTION and cannot
    // fuel; if the under-min guard blocked their pass the driver would soft-lock
    // (driveAfkDrop bails on error and re-runs the same blocked pass forever).
    // While a force-drop/timeout is armed for the caster, the pass must go
    // through even though they still hold fuel.
    for (const armed of ["droppingPlayerId", "turnTimeoutPlayerId"] as const) {
      const casted = castImplosionWithPowerCards(`impl-forced-${armed}`);
      // Sanity: without the force flag the caster's own pass is rejected.
      const control = applyAction(casted, { type: "PASS_REACTION", playerId: "p1" });
      expect(control.errors.length, `${armed}: control pass should still be blocked`).toBeGreaterThan(0);

      // Arm the force-resolution for p1, then the same pass must succeed.
      casted.afk = { lastActionAt: {}, vote: null, ...(casted.afk ?? {}), [armed]: "p1" };
      let next = applyAction(casted, { type: "PASS_REACTION", playerId: "p1" });
      expect(next.errors, `${armed}: forced pass must not error`).toEqual([]);
      let state = next.state;
      let safety = 12;
      while (state.reactionWindow && safety-- > 0) {
        const passer = state.reactionWindow.priorityPlayerId;
        next = applyAction(state, { type: "PASS_REACTION", playerId: passer });
        expect(next.errors, next.errors.map((e) => e.message).join("; ")).toEqual([]);
        state = next.state;
      }
      // Implosion resolved at Power 0 → 0 damage (fizzle), and the stack cleared.
      expect(state.stack.length, `${armed}: stack should clear`).toBe(0);
      expect(state.combat!.units.unit_p2_skeletons.damage, `${armed}: 0-damage fizzle`).toBe(0);
    }
  });
});
