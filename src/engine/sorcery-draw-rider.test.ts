import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

// ---------------------------------------------------------------------------
// "+stat / +Power, then draw a card" instants played OUTSIDE their window.
//
// Offense/Armorer ("+1 Attack/Defense, then draw a card") and Sorcery ("+1
// Power, then draw a card") may be played on the adventure map purely for the
// card draw: with no attack/spell to apply it to, the stat/Power fizzles, but
// the draw rider still resolves (card-neutral cycling). Sorcery is the same
// shape as Offense/Armorer and must behave the same — this previously worked
// only for the ADD_COMBAT_STAT pair, never for Sorcery's ADD_SPELL_POWER.
//
// In COMBAT these instants instead route through their reaction window, where
// the draw refreshes the reaction list in real time so the freshly drawn card
// is immediately playable into the SAME open window (more Power onto the spell,
// more Attack onto the declaration). Those two paths are also asserted below.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

/** A fresh adventure map with p1's hand replaced by exactly `cards`. */
function mapHand(cards: string[]): GameState {
  let state = createAdventureGameState({ seed: "sorcery-draw", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.hand = [...cards];
  return state;
}

function mapPlays(state: GameState, cardId: string): Extract<GameAction, { type: "PLAY_CARD" }>[] {
  return getLegalActions(state, "p1")
    .map((l) => l.action)
    .filter((a): a is Extract<GameAction, { type: "PLAY_CARD" }> => a.type === "PLAY_CARD" && a.cardId === cardId);
}

function reactionFor(state: GameState, playerId: PlayerId, cardId: string) {
  return getLegalActions(state, playerId).find(
    (l) => l.action.type === "PLAY_REACTION" && l.action.cardId === cardId && !l.action.asPowerBoost
  );
}

function lastEvent(state: GameState, type: string) {
  return [...state.eventLog].reverse().find((event) => event.type === type);
}

// ===========================================================================
// [1] Sorcery on the map — playable just for the draw (the fixed gap)
// ===========================================================================

describe("Sorcery played on the map (outside any spell cast)", () => {
  it("is offered on the map, exactly like Offense/Armorer", () => {
    // The two ADD_COMBAT_STAT draw-riders are the established precedent…
    expect(mapPlays(mapHand(["ability.offense"]), "ability.offense")).toHaveLength(1);
    expect(mapPlays(mapHand(["ability.armorer"]), "ability.armorer")).toHaveLength(1);
    // …and Sorcery (ADD_SPELL_POWER draw-rider) must now match them.
    expect(mapPlays(mapHand(["ability.sorcery"]), "ability.sorcery")).toHaveLength(1);
  });

  it("is offered only as a basic play (no crown wasted on the fizzled Power)", () => {
    const plays = mapPlays(mapHand(["ability.sorcery"]), "ability.sorcery");
    expect(plays).toHaveLength(1);
    expect(plays[0].mode ?? "basic").toBe("basic");
  });

  it("draws exactly its rider when played: the Power fizzles, the card is drawn", () => {
    let state = mapHand(["ability.sorcery"]);
    // Known draw pile so the draw is observable and isolated from a reshuffle.
    state.players.p1.deck = ["spell.bless", "spell.haste"]; // haste drawn next (pop)
    const deckBefore = state.players.p1.deck.length;

    const play = mapPlays(state, "ability.sorcery")[0];
    expect(play).toBeDefined();
    state = applyOk(state, play);

    // Sorcery spent, exactly one card drawn — net card-neutral cycling.
    expect(state.players.p1.discard).toContain("ability.sorcery");
    expect(deckBefore - state.players.p1.deck.length).toBe(1);
    expect(state.players.p1.hand).toEqual(["spell.haste"]);
    // No spell/combat anywhere, so the +1 Power had nothing to land on.
    expect(state.combat).toBeFalsy();
    expect(state.stack).toHaveLength(0);
  });

  it("GUARD: a Power statistic (ADD_SPELL_POWER but NO draw rider) is NOT a map play", () => {
    // Proves the map gate is the *draw rider*, not "any ADD_SPELL_POWER card":
    // stat.power has the same trigger/effect type as Sorcery but no drawCards.
    expect(mapPlays(mapHand(["stat.power"]), "stat.power")).toHaveLength(0);
  });

  it("GUARD: Sorcery played on the map draws nothing if the reducer rider is removed", () => {
    // The draw count is the only observable effect of the map play; a regression
    // that drops the reducer handler would leave the deck untouched here.
    let state = mapHand(["ability.sorcery", "ability.offense"]);
    state.players.p1.deck = ["spell.bless", "spell.haste"];
    const deckBefore = state.players.p1.deck.length;
    state = applyOk(state, mapPlays(state, "ability.sorcery")[0]);
    expect(state.players.p1.deck.length).toBe(deckBefore - 1);
  });
});

// ===========================================================================
// [2] Sorcery in a spell-cast window — the drawn power card refreshes into the
//     SAME open window and can be played for more Power, in real time.
// ===========================================================================

describe("Sorcery in a spell-cast window refreshes the reaction list with its draw", () => {
  it("draws a Power card that becomes immediately playable into the same cast", () => {
    let state = createInitialGameState("sorcery-cast-window");
    state.players.p1.hand = ["spell.magic_arrow", "ability.sorcery"];
    state.players.p2.hand = [];
    // Sorcery's draw yields a Power statistic (another SPELL_CAST_STARTED rider).
    state.players.p1.deck = ["spell.bless", "stat.power"]; // stat.power drawn next

    // Cast Magic Arrow → opens the caster's SPELL_CAST_STARTED window.
    state = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");

    // Play Sorcery: +1 Power onto the pending Arrow, then draw stat.power.
    const sorcery = reactionFor(state, "p1", "ability.sorcery");
    expect(sorcery, "Sorcery is offered into the caster's own spell window").toBeTruthy();
    state = applyOk(state, sorcery!.action);

    // Real-time refresh: the just-drawn stat.power now appears as a legal play,
    // the caster keeps priority, and the window is still open.
    expect(state.players.p1.hand).toContain("stat.power");
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    const power = reactionFor(state, "p1", "stat.power");
    expect(power, "the freshly drawn Power card is immediately playable").toBeTruthy();

    // Playing it adds a second Power to the very same cast.
    state = applyOk(state, power!.action);
    while (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    }
    // Sorcery (+1) + the drawn Power (+1) = Magic Arrow resolves at Power 2.
    expect(lastEvent(state, "SPELL_CAST_RESOLVED")).toMatchObject({ power: 2 });
  });
});

// ===========================================================================
// [3] Offense in an attack window — the drawn Attack card refreshes into the
//     SAME open declaration and can be played for more Attack, in real time.
// ===========================================================================

describe("Offense in an attack window refreshes the reaction list with its draw", () => {
  it("draws an Attack card that becomes immediately playable onto the same attack", () => {
    let state = createInitialGameState("offense-attack-window");
    state.players.p1.hand = ["ability.offense"];
    state.players.p2.hand = [];
    state.players.p1.deck = ["spell.bless", "stat.attack"]; // stat.attack drawn next
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13; // adjacent to 9

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");

    // Play Offense: +1 Attack, then draw stat.attack.
    const offense = reactionFor(state, "p1", "ability.offense");
    expect(offense, "Offense is offered onto the attacker's declaration").toBeTruthy();
    state = applyOk(state, offense!.action);

    // Real-time refresh: the just-drawn stat.attack is immediately playable.
    expect(state.players.p1.hand).toContain("stat.attack");
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    const attack = reactionFor(state, "p1", "stat.attack");
    expect(attack, "the freshly drawn Attack card is immediately playable").toBeTruthy();

    // Playing it stacks a second +1 Attack onto the same declaration.
    state = applyOk(state, attack!.action);
    while (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    }
    const rolled = lastEvent(state, "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null).toBe(2);
  });
});
