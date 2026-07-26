import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { startPlayerTurn } from "./adventure";
import type { GameAction, GameState } from "./state";

// ---------------------------------------------------------------------------
// Map spell-power bank (BINH house rule): a Sorcery / Scales-of-the-Greater-
// Basilisk-style "+Power, then draw a card" rider may be played on the MAP just
// like it can in combat — but here the +Power is BANKED (player.mapSpellPowerBank)
// for the next map Spell this turn. Play the rider to draw a card, then cast the
// drawn Spell (View Air / Dimension Door / Fly / …) with the banked Power paying
// part of its tier. The bank is consumed by the next map Spell that pays a Power
// cost. Resolving the Spell consumes all Power added to that cast; if no Spell
// is cast, the bank "goes away after you move" (the hero's next step).
//
// Also pins the crash fix: the Polish "Cast a Spell" enabler is a physical Spell
// card but must NOT count as a Power source (it let a 3-Power hand reach a
// Power-4 tier and crashed the cast).
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

/** A fresh adventure map with p1's hand replaced by exactly `cards`. */
function mapHand(cards: string[]): GameState {
  let state = createAdventureGameState({ seed: "map-power-bank", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.hand = [...cards];
  return state;
}

function plays(state: GameState, cardId: string): Extract<GameAction, { type: "PLAY_CARD" }>[] {
  return getLegalActions(state, "p1")
    .map((l) => l.action)
    .filter((a): a is Extract<GameAction, { type: "PLAY_CARD" }> => a.type === "PLAY_CARD" && a.cardId === cardId);
}

function castViewAir(state: GameState): GameState {
  const play = plays(state, "spell.view_air")[0];
  expect(play, "View Air is offered as a single cast").toBeDefined();
  return applyOk(state, play);
}

describe("Map spell-power bank — Sorcery / Scales on the map", () => {
  it("banks +Power and draws a card when Sorcery is played on the map", () => {
    let state = mapHand(["ability.sorcery"]);
    state.players.p1.deck = ["spell.bless", "spell.haste"]; // haste drawn next
    state = applyOk(state, plays(state, "ability.sorcery")[0]);

    expect(state.players.p1.mapSpellPowerBank, "Sorcery banks its +1 Power on the map").toBe(1);
    expect(state.players.p1.hand, "the draw rider still resolved").toContain("spell.haste");
    expect(state.players.p1.discard).toContain("ability.sorcery");
  });

  it("the banked Power is starting Power on a map cast — Power-1 View Air with NO power cards in hand", () => {
    let state = mapHand(["spell.view_air"]);
    state.players.p1.mapSpellPowerBank = 1; // a Sorcery / Scales bank from earlier this turn
    const materialsBefore = state.players.p1.resources.buildingMaterials;

    // Cast View Air alone: bank becomes starting Power 1, no boost sources left →
    // auto-resolves at Power 1 (2 Building Materials).
    state = castViewAir(state);
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
    expect(state.players.p1.mapSpellPowerBank ?? 0, "one Spell, one boost — the bank is spent").toBe(0);
  });

  it("consumes the whole bank when the Spell resolves, including tier surplus", () => {
    let state = mapHand(["spell.view_air"]);
    state.players.p1.mapSpellPowerBank = 3;
    const valuablesBefore = state.players.p1.resources.valuables;

    state = castViewAir(state);
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1); // top tier needs Power 2
    expect(state.players.p1.mapSpellPowerBank ?? 0).toBe(0);
  });

  it("does not clear surplus Power merely because a new turn starts", () => {
    const state = mapHand([]);
    state.players.p1.mapSpellPowerBank = 2;
    startPlayerTurn(state, "p1");
    expect(state.players.p1.mapSpellPowerBank).toBe(2);
  });

  it("CONTROL: with no bank and no power card, cast resolves at Power 0 (3 gold), never the materials tier", () => {
    let state = mapHand(["spell.view_air"]);
    expect(state.players.p1.mapSpellPowerBank ?? 0).toBe(0);
    const goldBefore = state.players.p1.resources.gold;
    const materialsBefore = state.players.p1.resources.buildingMaterials;
    state = castViewAir(state);
    // Auto-resolves at Power 0 — gold, not materials.
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore);
  });

  it("the bank clears when the hero moves — the saved Power goes away after you move", () => {
    let state = mapHand([]);
    state.players.p1.mapSpellPowerBank = 3;
    const move = getLegalActions(state, "p1")
      .map((l) => l.action)
      .find((a) => a.type === "MOVE_HERO");
    expect(move, "the hero has a legal step").toBeDefined();

    state = applyOk(state, move!);
    expect(state.players.p1.mapSpellPowerBank ?? 0).toBe(0);
  });

  it("Scales of the Greater Basilisk's draw-rider is playable on the map and banks +Power", () => {
    let state = mapHand(["artifact.scales_of_the_greater_basilisk"]);
    state.players.p1.deck = ["spell.bless", "spell.haste"];

    // Only the "+1 Power, then draw a card" side (optionIndex 1) is a map play —
    // the plain "+3 Power" side has no draw rider and stays combat-only.
    const drawSide = plays(state, "artifact.scales_of_the_greater_basilisk").find((a) => a.optionIndex === 1);
    expect(drawSide, "Scales' draw-rider side is a map play").toBeDefined();
    expect(plays(state, "artifact.scales_of_the_greater_basilisk").some((a) => a.optionIndex === 0)).toBe(false);

    state = applyOk(state, drawSide!);
    expect(state.players.p1.mapSpellPowerBank, "Scales banks its +1 Power on the map").toBe(1);
    expect(state.players.p1.hand).toContain("spell.haste");
  });
});

describe("Polish 'Cast a Spell' is never a Power source (Dimension Door / View Air crash fix)", () => {
  it("a Cast-a-Spell is not offered as a map-spell-boost source (CONTROL: a real Power card is)", () => {
    // Cast a Spell is a physical Spell card, but must contribute NO Power.
    const withEnabler = castViewAir(mapHand(["spell.cast_a_spell", "spell.view_air"]));
    const enablerChoice = withEnabler.pendingChoice;
    if (enablerChoice?.type === "OPTION_CHOICE" && enablerChoice.mapSpellBoost) {
      expect(
        enablerChoice.mapSpellBoost.offers.some(
          (offer) => offer.kind === "card" && offer.cardId === "spell.cast_a_spell"
        ),
        "Cast a Spell is not a boost source"
      ).toBe(false);
    } else {
      // No boost window at all (Power 0 auto-resolve) is also correct.
      expect(withEnabler.players.p1.resources.gold).toBeGreaterThan(0);
    }

    // CONTROL: a genuine Power source is offered on the boost window.
    const withPower = castViewAir(mapHand(["stat.power", "spell.view_air"]));
    expect(withPower.pendingChoice?.type === "OPTION_CHOICE" && withPower.pendingChoice.context).toBe(
      "map-spell-boost"
    );
    if (withPower.pendingChoice?.type === "OPTION_CHOICE" && withPower.pendingChoice.mapSpellBoost) {
      expect(
        withPower.pendingChoice.mapSpellBoost.offers.some(
          (offer) => offer.kind === "card" && offer.cardId === "stat.power"
        )
      ).toBe(true);
    }
  });
});
