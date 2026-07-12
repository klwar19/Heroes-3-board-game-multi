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
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
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

// ===========================================================================
// [4] Combat draw-only on your own activation (no attack / spell window open)
// ===========================================================================

function combatOwnTurn(hand: string[], deck: string[] = ["spell.bless", "stat.power"]): GameState {
  const state = createInitialGameState(`combat-draw-${hand.join("-")}`);
  state.players.p1.hand = [...hand];
  state.players.p2.hand = [];
  state.players.p1.deck = [...deck];
  // Ensure p1 has an active unit that has not moved or attacked.
  const activeId = state.combat!.activeUnitId!;
  const active = state.combat!.units[activeId];
  if (active.controllerId !== "p1") {
    // Force a p1 unit active if the seed opened on p2.
    const p1Unit = Object.values(state.combat!.units).find(
      (u) => u.controllerId === "p1" && u.damage < u.maxHealth
    );
    expect(p1Unit, "sandbox needs a p1 unit").toBeTruthy();
    state.combat!.activeUnitId = p1Unit!.id;
    p1Unit!.activatedThisRound = false;
    p1Unit!.attackedThisActivation = false;
    p1Unit!.movedThisActivation = false;
  } else {
    active.activatedThisRound = false;
    active.attackedThisActivation = false;
    active.movedThisActivation = false;
  }
  state.phase = "combat";
  state.stack = [];
  state.reactionWindow = null;
  state.pendingChoice = null;
  return state;
}

function combatDrawPlay(state: GameState, cardId: string) {
  return getLegalActions(state, "p1")
    .map((l) => l.action)
    .find((a): a is Extract<GameAction, { type: "PLAY_CARD" }> => a.type === "PLAY_CARD" && a.cardId === cardId);
}

describe("Combat draw-only: Sorcery / Offense / Armorer on your own activation", () => {
  it("offers all three on your turn outside any reaction window", () => {
    for (const cardId of ["ability.sorcery", "ability.offense", "ability.armorer"] as const) {
      const state = combatOwnTurn([cardId]);
      expect(combatDrawPlay(state, cardId), `${cardId} offered for draw-only`).toBeTruthy();
    }
  });

  it("CONTROL: not offered off-turn (enemy activation)", () => {
    const state = combatOwnTurn(["ability.sorcery"]);
    const p2Unit = Object.values(state.combat!.units).find(
      (u) => u.controllerId === "p2" && u.damage < u.maxHealth
    );
    expect(p2Unit).toBeTruthy();
    state.combat!.activeUnitId = p2Unit!.id;
    p2Unit!.activatedThisRound = false;
    p2Unit!.attackedThisActivation = false;
    expect(combatDrawPlay(state, "ability.sorcery"), "no draw-only off-turn").toBeUndefined();
  });

  it("Offense draws without applying attack (stat fizzles)", () => {
    let state = combatOwnTurn(["ability.offense"], ["spell.bless", "stat.attack"]);
    const deckBefore = state.players.p1.deck.length;
    state = applyOk(state, combatDrawPlay(state, "ability.offense")!);
    expect(state.players.p1.discard).toContain("ability.offense");
    expect(deckBefore - state.players.p1.deck.length).toBe(1);
    expect(state.players.p1.hand).toContain("stat.attack");
    expect(state.stack).toHaveLength(0);
  });

  it("Sorcery draws and banks +1 Power for the next spell when the unit has not moved", () => {
    let state = combatOwnTurn(["ability.sorcery", "spell.magic_arrow"], ["spell.bless", "stat.power"]);
    // Own unit not moved.
    const active = state.combat!.units[state.combat!.activeUnitId!];
    expect(active.movedThisActivation).toBe(false);

    state = applyOk(state, combatDrawPlay(state, "ability.sorcery")!);
    expect(state.players.p1.combatStats.pendingDrawRiderSpellPower).toBe(1);
    expect(state.players.p1.hand).toContain("stat.power");

    // Cast Magic Arrow — banked Power lands on the cast.
    const target = Object.values(state.combat!.units).find(
      (u) => u.controllerId === "p2" && u.damage < u.maxHealth
    )!;
    state = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: target.id }
    });
    expect(state.players.p1.combatStats.pendingDrawRiderSpellPower ?? 0).toBe(0);
    // Power 0 Arrow + banked 1 = power 1 on the started cast (or resolved).
    const started = lastEvent(state, "SPELL_CAST_STARTED");
    // Bank is on the stack modifier; resolve or read stack.
    const stackPower =
      state.stack[0]?.modifiers.spellPowerBonus ??
      (lastEvent(state, "SPELL_CAST_RESOLVED") as { power?: number } | undefined)?.power;
    // After reactions may still be open; the stack holds the banked bonus.
    if (state.stack[0]) {
      expect(state.stack[0].modifiers.spellPowerBonus).toBeGreaterThanOrEqual(1);
    } else {
      expect(stackPower).toBeGreaterThanOrEqual(1);
    }
    expect(started).toBeTruthy();
  });

  it("CONTROL: Sorcery after the unit has already moved draws but does NOT bank Power", () => {
    let state = combatOwnTurn(["ability.sorcery"], ["spell.bless", "stat.power"]);
    state.combat!.units[state.combat!.activeUnitId!].movedThisActivation = true;
    state = applyOk(state, combatDrawPlay(state, "ability.sorcery")!);
    expect(state.players.p1.hand).toContain("stat.power");
    expect(state.players.p1.combatStats.pendingDrawRiderSpellPower ?? 0).toBe(0);
  });
});
