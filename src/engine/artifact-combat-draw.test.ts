import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero
} from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameState } from "./state";

/**
 * Card-draw ARTIFACTS in combat.
 *
 * [1] House-rule twin of the Offense/Armorer/Sorcery draw-only play: an
 *     artifact's trigger SIDE carrying a "then draw" rider (ADD_COMBAT_STAT /
 *     ADD_SPELL_POWER with drawCards — Armor of Wonder, Scales of the Greater
 *     Basilisk, Tunic of the Cyclops King) is playable on your own activation
 *     JUST for the draw. Pins the legal-actions offer (the ownActivationOpen
 *     draw-rider loop in addPlayableCardActions' CHOOSE_ONE branch) and the
 *     reducer's rider resolution + Sorcery-style Power bank.
 * [2] Invariant: EVERY implemented artifact "OR" side whose effect is a plain
 *     DRAW_CARDS (and not map-gated) is offered during your own combat
 *     activation — guards all current and future draw artifacts at once.
 * [3] Trident of Dominion's sea side ("If this Hero is on a Sea tile, draw 2")
 *     is playable MID-COMBAT while the hero stands on a Sea field.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

/** Sandbox combat with p1's own unit active, fresh (not moved / not attacked). */
function combatOwnTurn(hand: string[], deck: string[] = ["spell.bless", "stat.power"]): GameState {
  const state = createInitialGameState(`artifact-draw-${hand.join("-")}`);
  state.players.p1.hand = [...hand];
  state.players.p2.hand = [];
  state.players.p1.deck = [...deck];
  const activeId = state.combat!.activeUnitId!;
  const active = state.combat!.units[activeId];
  if (active.controllerId !== "p1") {
    const p1Unit = Object.values(state.combat!.units).find(
      (u) => u.controllerId === "p1" && u.damage < u.maxHealth
    );
    expect(p1Unit, "sandbox needs a living p1 unit").toBeTruthy();
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

/** All PLAY_CARD offers for `cardId` in p1's current menu. */
function playsFor(state: GameState, cardId: string): Extract<GameAction, { type: "PLAY_CARD" }>[] {
  return getLegalActions(state, "p1")
    .map((l) => l.action)
    .filter((a): a is Extract<GameAction, { type: "PLAY_CARD" }> => a.type === "PLAY_CARD" && a.cardId === cardId);
}

// ===========================================================================
// [1] Trigger draw-rider sides playable draw-only on your own activation
// ===========================================================================

describe("artifact trigger draw-riders: combat draw-only play (own activation)", () => {
  it("Armor of Wonder offers BOTH draw sides outside any window", () => {
    const state = combatOwnTurn(["artifact.armor_of_wonder"]);
    const plays = playsFor(state, "artifact.armor_of_wonder");
    // Both options carry "Draw 1 card and +stat" — each becomes a draw-only play.
    expect(plays.map((p) => p.optionIndex).sort()).toEqual([0, 1]);
    expect(plays.every((p) => (p.mode ?? "basic") === "basic")).toBe(true);
  });

  it("playing Armor of Wonder draw-only draws exactly 1; the stat fizzles", () => {
    let state = combatOwnTurn(["artifact.armor_of_wonder"], ["spell.bless", "stat.attack"]);
    const deckBefore = state.players.p1.deck.length;
    state = applyOk(state, playsFor(state, "artifact.armor_of_wonder")[0]);
    expect(state.players.p1.discard).toContain("artifact.armor_of_wonder");
    expect(deckBefore - state.players.p1.deck.length).toBe(1);
    expect(state.players.p1.hand).toEqual(["stat.attack"]);
    // No attack window existed, so nothing rides the stack — the +1 fizzled.
    expect(state.stack).toHaveLength(0);
  });

  it("Scales of the Greater Basilisk: ONLY its draw side is offered (the +3 Power side is not)", () => {
    const state = combatOwnTurn(["artifact.scales_of_the_greater_basilisk"]);
    const plays = playsFor(state, "artifact.scales_of_the_greater_basilisk");
    // Option 1 is "+1 Power, then draw a card"; option 0 (+3 Power, no draw)
    // must keep waiting for its spell-cast window.
    expect(plays.map((p) => p.optionIndex)).toEqual([1]);
  });

  it("Tunic of the Cyclops King draws and banks +1 Power for the next spell (unit unmoved)", () => {
    let state = combatOwnTurn(["artifact.tunic_of_the_cyclops_king", "spell.magic_arrow"]);
    const plays = playsFor(state, "artifact.tunic_of_the_cyclops_king");
    // Only the draw side (option 0); the +2 Power side stays window-only.
    expect(plays.map((p) => p.optionIndex)).toEqual([0]);
    state = applyOk(state, plays[0]);
    expect(state.players.p1.hand).toContain("stat.power");
    // Sorcery-style bank: the fizzled +1 Power waits for the next spell cast.
    expect(state.players.p1.combatStats.pendingDrawRiderSpellPower).toBe(1);
  });

  it("CONTROL: after the unit has moved, the Tunic still draws but banks nothing", () => {
    let state = combatOwnTurn(["artifact.tunic_of_the_cyclops_king"]);
    state.combat!.units[state.combat!.activeUnitId!].movedThisActivation = true;
    state = applyOk(state, playsFor(state, "artifact.tunic_of_the_cyclops_king")[0]);
    expect(state.players.p1.hand).toContain("stat.power");
    expect(state.players.p1.combatStats.pendingDrawRiderSpellPower ?? 0).toBe(0);
  });

  it("CONTROL: none of the draw-only sides are offered OFF-turn (enemy activation)", () => {
    for (const cardId of [
      "artifact.armor_of_wonder",
      "artifact.scales_of_the_greater_basilisk",
      "artifact.tunic_of_the_cyclops_king"
    ]) {
      const state = combatOwnTurn([cardId]);
      const p2Unit = Object.values(state.combat!.units).find(
        (u) => u.controllerId === "p2" && u.damage < u.maxHealth
      )!;
      state.combat!.activeUnitId = p2Unit.id;
      p2Unit.activatedThisRound = false;
      p2Unit.attackedThisActivation = false;
      expect(playsFor(state, cardId), `${cardId} must not be playable off-turn`).toHaveLength(0);
    }
  });

  it("CONTROL: trigger sides WITHOUT an unconditional draw never get the draw-only offer", () => {
    // Trident's "+2 attack" side has no draw rider; Blackshard's big side only
    // draws CONDITIONALLY (drawIfCostCardSpell resolves in the reaction path
    // alone) — both stay locked to their attack windows.
    const trident = combatOwnTurn(["artifact.trident_of_dominion"]);
    expect(playsFor(trident, "artifact.trident_of_dominion").map((p) => p.optionIndex)).not.toContain(0);
    const blackshard = combatOwnTurn(["artifact.blackshard_of_the_dead_knight", "spell.bless"]);
    expect(playsFor(blackshard, "artifact.blackshard_of_the_dead_knight")).toHaveLength(0);
  });
});

// ===========================================================================
// [2] Invariant: every plain DRAW_CARDS artifact side is a combat play
// ===========================================================================

describe("invariant: implemented artifact DRAW_CARDS sides are playable in combat", () => {
  const drawSides: { cardId: string; optionIndex: number }[] = [];
  for (const [cardId, card] of Object.entries(cardLibrary)) {
    if (card.kind !== "artifact" || card.implementationStatus !== "implemented") {
      continue;
    }
    if (card.effect.type !== "CHOOSE_ONE") {
      continue;
    }
    for (const [optionIndex, option] of card.effect.options.entries()) {
      if (option.effect.type !== "DRAW_CARDS") {
        continue;
      }
      // Map-gated sides are exempt by design: mapOnly never plays in combat and
      // requiresSeaTile is pinned separately below (needs an adventure map).
      if (option.mapOnly || option.requiresSeaTile || option.postSearchOnly) {
        continue;
      }
      drawSides.push({ cardId, optionIndex });
    }
  }

  it("finds the known draw artifacts (sanity: the sweep is not empty)", () => {
    const ids = drawSides.map((s) => s.cardId);
    for (const known of [
      "artifact.speculum",
      "artifact.charm_of_mana",
      "artifact.mystic_orb_of_mana",
      "artifact.angel_wings",
      "artifact.helm_of_heavenly_enlightenment"
    ]) {
      expect(ids, `${known} should be swept`).toContain(known);
    }
  });

  it("offers every such side during your own combat activation", () => {
    for (const { cardId, optionIndex } of drawSides) {
      // Filler cards make any discard cost affordable; the discard pile stays
      // empty so requiresEmptyDiscard sides (Mystic Orb) qualify.
      const state = combatOwnTurn([cardId, "stat.attack", "stat.defense", "stat.power"]);
      const offered = playsFor(state, cardId).some((p) => p.optionIndex === optionIndex);
      expect(offered, `${cardId} option ${optionIndex} must be a combat play`).toBe(true);
    }
  });

  it("Charm of Mana's 'draw 2, then discard 1' fully resolves mid-combat", () => {
    let state = combatOwnTurn(["artifact.charm_of_mana"], ["spell.bless", "stat.power", "stat.attack"]);
    const deckBefore = state.players.p1.deck.length;
    const play = playsFor(state, "artifact.charm_of_mana").find((p) => p.optionIndex === 1);
    expect(play, "the draw-2 side is offered").toBeTruthy();
    state = applyOk(state, play!);
    // Both cards drawn, then the discard follow-up choice opens IN combat.
    expect(deckBefore - state.players.p1.deck.length).toBe(2);
    expect(state.pendingChoice, "the then-discard choice opens mid-combat").toBeTruthy();
    const discardPick = getLegalActions(state, "p1").find((l) => l.action.type === "CHOOSE_OPTION");
    expect(discardPick, "the discard pick is answerable").toBeTruthy();
    state = applyOk(state, discardPick!.action);
    // Net: drew 2, discarded 1 of them — one drawn card remains in hand.
    expect(state.players.p1.hand).toHaveLength(1);
    expect(state.pendingChoice).toBeFalsy();
    // Combat is intact and playable after the cycling.
    expect(state.combat).toBeTruthy();
  });
});

// ===========================================================================
// [3] Trident of Dominion's sea-draw side mid-combat (real adventure map)
// ===========================================================================

describe("Trident of Dominion's sea side in combat", () => {
  /** A neutral bank fight with the hero standing on a (togglable) sea field. */
  function seaCombat(seed: string, onSea: boolean): GameState {
    let state = createAdventureGameState({ seed, difficulty: "easy", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const hero = getMainHero(state, "p1")!;
    // Level == difficulty: an even fight OPENS (level > difficulty would
    // Quick-Combat-resolve before any card could be played).
    hero.level = 1;
    hero.spaceId = "guard-field";
    state.adventure!.fields["guard-field"] = {
      spaceId: "guard-field",
      tileInstanceId: "t",
      slot: 0,
      location: "empty",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      ...(onSea ? { terrain: "water" as const } : {})
    };
    startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
    expect(state.combat, "the even fight must open a real combat").toBeTruthy();
    while (state.combat?.setup) {
      const actions = getLegalActions(state, "p1");
      const next =
        actions.find((l) => l.action.type === "PLACE_COMBAT_UNIT") ??
        actions.find((l) => l.action.type === "FINISH_COMBAT_PLACEMENT");
      if (!next) {
        break;
      }
      state = applyOk(state, next.action);
    }
    state.players.p1.hand = ["artifact.trident_of_dominion"];
    state.players.p1.deck = ["spell.bless", "stat.power", "stat.attack"];
    // Put one of p1's own units in a fresh activation with no window open.
    const p1Unit = Object.values(state.combat!.units).find(
      (u) => u.controllerId === "p1" && u.damage < u.maxHealth
    )!;
    state.combat!.activeUnitId = p1Unit.id;
    p1Unit.activatedThisRound = false;
    p1Unit.attackedThisActivation = false;
    state.stack = [];
    state.reactionWindow = null;
    state.pendingChoice = null;
    if (state.combat!.pendingNeutralStep) {
      state.combat!.pendingNeutralStep = null;
    }
    return state;
  }

  it("on a Sea field: 'draw 2 cards' is offered mid-combat and draws 2", () => {
    let state = seaCombat("trident-sea", true);
    const play = playsFor(state, "artifact.trident_of_dominion").find((p) => p.optionIndex === 1);
    expect(play, "the sea-draw side is a combat play while the hero is on water").toBeTruthy();
    const deckBefore = state.players.p1.deck.length;
    state = applyOk(state, play!);
    expect(deckBefore - state.players.p1.deck.length).toBe(2);
    expect(state.players.p1.hand).toHaveLength(2);
  });

  it("CONTROL: off the Sea, the draw side is NOT offered in the same combat", () => {
    const state = seaCombat("trident-land", false);
    const plays = playsFor(state, "artifact.trident_of_dominion");
    expect(plays.some((p) => p.optionIndex === 1)).toBe(false);
  });
});
