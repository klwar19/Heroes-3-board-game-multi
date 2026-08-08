import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * `PLAY_REACTION.drawOnly` changes RESOLUTION: applyReactionPlayCore returns
 * early after resolving only the printed card-draw rider, deliberately fizzling
 * the primary stat/Power/heal effect. It must therefore be part of the legality
 * match, or the engine executes a resolution path it never offered.
 *
 * It was not: `normalizeActionForMatch` (reducer.ts) dropped the flag for
 * PLAY_REACTION, and `assertBatchReactionLegal` built its per-play comparison
 * action without it — so a forged `drawOnly: true` matched the FULL-effect offer
 * on both the single and the batch path.
 *
 * `utilityOnly` is deliberately NOT matched: the reducer never reads it (it is an
 * offer-side window-opening / trap-twin-dedupe marker consumed by
 * reactionOfferOpensWindow in legal-actions), and the reaction tray's group key
 * does not include it, so matching on it would reject plays that work today.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A clean adjacent melee duel with a scripted 0 Attack die. */
function duel(seed: string): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat;
  if (!combat) {
    throw new Error("Expected combat setup.");
  }
  const griffins = combat.units.unit_p1_griffins;
  const vampires = combat.units.unit_p2_vampires;
  griffins.type = "ground";
  griffins.position = 9;
  griffins.attack = 3;
  griffins.defense = 0;
  griffins.maxHealth = 50;
  griffins.damage = 0;
  griffins.abilities = [];
  vampires.type = "ground";
  vampires.position = 13;
  vampires.attack = 5;
  vampires.defense = 1;
  vampires.maxHealth = 50;
  vampires.damage = 0;
  vampires.abilities = [];
  combat.units.unit_p1_marksmen.position = 0;
  combat.units.unit_p1_crusaders.position = 3;
  combat.units.unit_p2_skeletons.position = 19;
  combat.units.unit_p2_dread_knights.position = 16;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.deck = ["stat.power", "stat.power", "stat.power"];
  state.players.p2.deck = ["stat.power", "stat.power", "stat.power"];
  state.activePlayerId = "p1";
  combat.activeUnitId = "unit_p1_griffins";
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0, 0, 0];
  combat.dice.rollCount = 0;
  return state;
}

function declareP1Attack(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_vampires"
  });
}

function passUntil(state: GameState, playerId: "p1" | "p2"): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function lastHitBy(state: GameState, attackerId: string) {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation
    );
}

/** Offense: +1 attack, THEN draw 1 — printed trigger UNIT_ATTACK_DECLARED/self. */
const OFFENSE = "ability.offense";

/**
 * An OPEN SPELL_CAST_STARTED window owned by p1: Lightning Bolt aimed at p2's
 * Skeletons. Offense's printed attack trigger cannot match here, so it is offered
 * as a legitimate draw-rider-only join.
 */
function castingWindow(seed: string, extraHand: string[]): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["spell.lightning_bolt", ...extraHand];
  state.players.p2.hand = [];
  state.players.p1.deck = ["stat.knowledge"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  const target = state.combat!.units.unit_p2_skeletons;
  target.maxHealth = 30;
  target.damage = 0;

  const cast = getLegalActions(state, "p1").find(
    (entry) =>
      entry.action.type === "CAST_SPELL" &&
      entry.action.cardId === "spell.lightning_bolt" &&
      entry.action.target?.type === "unit" &&
      entry.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast, "Lightning Bolt should be castable").toBeTruthy();
  const casted = passUntil(applyOk(state, cast!.action), "p1");
  // A draw-rider-only join never OPENS a window (reactionOfferOpensWindow) — the
  // Power statistic in hand is the real opener it joins.
  expect(casted.reactionWindow, "the cast should have opened a reaction window").toBeTruthy();
  return casted;
}

function offenseOffers(state: GameState, playerId: "p1" | "p2") {
  return getLegalActions(state, playerId).filter(
    (entry) => entry.action.type === "PLAY_REACTION" && entry.action.cardId === OFFENSE
  );
}

describe("PLAY_REACTION drawOnly is part of the legality match", () => {
  it("REPRO: a forged drawOnly on a FULL-effect offer is rejected", () => {
    const state = duel("flag-forge-single");
    state.players.p1.hand = [OFFENSE];
    const declared = passUntil(declareP1Attack(state), "p1");

    // The attacker's own printed trigger matches, so the engine offers the FULL
    // effect — no draw-only twin exists for this window.
    const full = offenseOffers(declared, "p1").find(
      (entry) => entry.action.type === "PLAY_REACTION" && !entry.action.drawOnly && entry.action.mode !== "expert"
    );
    expect(full, "the full-effect Offense reaction should be offered to the attacker").toBeTruthy();
    expect(
      offenseOffers(declared, "p1").some((entry) => entry.action.type === "PLAY_REACTION" && entry.action.drawOnly),
      "no draw-only twin is offered when the printed trigger matches"
    ).toBe(false);

    const forged: GameAction = { ...(full!.action as Extract<GameAction, { type: "PLAY_REACTION" }>), drawOnly: true };
    const result = applyAction(declared, forged);

    expect(result.errors.length, "a drawOnly play the engine never offered must be refused").toBeGreaterThan(0);
    // The refusal is transactional: nothing moved.
    expect(result.state.players.p1.hand).toContain(OFFENSE);
    expect(result.state.players.p1.discard).not.toContain(OFFENSE);
  });

  it("CONTROL: the legitimate FULL play still lands +1 attack, draws, and discards", () => {
    const state = duel("flag-full-control");
    state.players.p1.hand = [OFFENSE];
    const declared = passUntil(declareP1Attack(state), "p1");
    const full = offenseOffers(declared, "p1").find(
      (entry) => entry.action.type === "PLAY_REACTION" && !entry.action.drawOnly && entry.action.mode !== "expert"
    );
    expect(full).toBeTruthy();

    const played = applyOk(declared, full!.action);
    const resolved = passAllReactions(played);

    // Base Griffin attack is 3; Offense adds its printed +1.
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(4);
    // "Then draw 1 card" resolved, and the card itself is in the discard.
    expect(played.players.p1.hand).toEqual(["stat.power"]);
    expect(played.players.p1.discard).toContain(OFFENSE);
  });

  it("CONTROL: a legitimately OFFERED drawOnly play still resolves (draw, no stat)", () => {
    // Offense in a SPELL window: its printed UNIT_ATTACK_DECLARED trigger does
    // not match, so the engine offers it as a draw-rider-only join (the very case
    // PLAY_REACTION.drawOnly documents).
    const state = castingWindow("flag-drawonly-control", [OFFENSE, "stat.power"]);

    const drawOnly = offenseOffers(state, "p1").find(
      (entry) => entry.action.type === "PLAY_REACTION" && entry.action.drawOnly
    );
    expect(drawOnly, "a draw-only Offense join should be offered in a spell window").toBeTruthy();

    const played = applyOk(state, drawOnly!.action);
    const resolved = passAllReactions(played);

    // The draw rider resolved and the card is spent…
    expect(played.players.p1.hand).toEqual(["stat.power", "stat.knowledge"]);
    expect(played.players.p1.discard).toContain(OFFENSE);
    // …while the cast itself is untouched: Lightning Bolt still lands its Power-0 2.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});

describe("PLAY_REACTIONS batch entries carry the same drawOnly match", () => {
  it("REPRO: a forged drawOnly batch entry is rejected", () => {
    const state = duel("flag-forge-batch");
    state.players.p1.hand = [OFFENSE, "stat.attack"];
    const declared = passUntil(declareP1Attack(state), "p1");

    const result = applyAction(declared, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: OFFENSE, mode: "basic", drawOnly: true },
        { cardId: "stat.attack", mode: "basic" }
      ]
    });

    expect(result.errors.length, "the batch must be refused whole").toBeGreaterThan(0);
    expect(result.state.players.p1.hand).toEqual([OFFENSE, "stat.attack"]);
  });

  it("CONTROL: an ordinary two-card batch still resolves (both stats land, both discard)", () => {
    const state = duel("flag-batch-control");
    state.players.p1.hand = [OFFENSE, "stat.attack"];
    const declared = passUntil(declareP1Attack(state), "p1");

    const statOffer = getLegalActions(declared, "p1").find(
      (entry) =>
        entry.action.type === "PLAY_REACTION" &&
        entry.action.cardId === "stat.attack" &&
        entry.action.mode !== "expert"
    );
    expect(statOffer).toBeTruthy();
    const statAction = statOffer!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;

    const played = applyOk(declared, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: OFFENSE, mode: "basic" },
        {
          cardId: "stat.attack",
          mode: "basic",
          ...(statAction.optionIndex !== undefined ? { optionIndex: statAction.optionIndex } : {})
        }
      ]
    });
    const resolved = passAllReactions(played);

    // Griffins 3 + Offense 1 + Attack statistic 1 = 5.
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(5);
    expect(played.players.p1.discard).toContain(OFFENSE);
    expect(played.players.p1.discard).toContain("stat.attack");
    expect(played.players.p1.hand).not.toContain(OFFENSE);
  });

  it("CONTROL: a legitimately OFFERED drawOnly entry still batches", () => {
    // Spell window again: Offense joins draw-only alongside a Power statistic.
    const state = castingWindow("flag-batch-drawonly", [OFFENSE, "stat.power"]);

    const drawOnly = offenseOffers(state, "p1").find(
      (entry) => entry.action.type === "PLAY_REACTION" && entry.action.drawOnly
    );
    expect(drawOnly, "the draw-only join should be offered in the cast window").toBeTruthy();
    const powerOffer = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "PLAY_REACTION" &&
        entry.action.cardId === "stat.power" &&
        entry.action.mode !== "expert" &&
        !entry.action.asPowerBoost
    );
    expect(powerOffer).toBeTruthy();
    const powerAction = powerOffer!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const drawOnlyAction = drawOnly!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;

    const played = applyOk(state, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        {
          cardId: OFFENSE,
          mode: "basic",
          drawOnly: true,
          ...(drawOnlyAction.optionIndex !== undefined ? { optionIndex: drawOnlyAction.optionIndex } : {})
        },
        {
          cardId: "stat.power",
          mode: "basic",
          ...(powerAction.optionIndex !== undefined ? { optionIndex: powerAction.optionIndex } : {})
        }
      ]
    });
    const resolved = passAllReactions(played);

    expect(played.players.p1.discard).toContain(OFFENSE);
    expect(played.players.p1.discard).toContain("stat.power");
    // The draw rider fired: the drawn card replaced the two spent ones.
    expect(played.players.p1.hand).toEqual(["stat.knowledge"]);
    // The Power statistic really empowered the bolt (Power 0 → 1 lifts 2 → 3).
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });
});
