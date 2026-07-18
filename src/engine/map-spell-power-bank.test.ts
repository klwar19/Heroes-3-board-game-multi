import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

// ---------------------------------------------------------------------------
// Map spell-power bank (BINH house rule): a Sorcery / Scales-of-the-Greater-
// Basilisk-style "+Power, then draw a card" rider may be played on the MAP just
// like it can in combat — but here the +Power is BANKED (player.mapSpellPowerBank)
// for the next map Spell this turn. Play the rider to draw a card, then cast the
// drawn Spell (View Air / Dimension Door / Fly / …) with the banked Power paying
// part of its tier. The bank is consumed by the next map Spell that pays a Power
// cost, and "goes away after you move" (cleared on the hero's next step) or at
// the owner's next turn.
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

/** The View Air tier at `optionIndex` if it is currently a legal play. */
function viewAirTier(state: GameState, optionIndex: number) {
  return plays(state, "spell.view_air").find((a) => a.optionIndex === optionIndex);
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

  it("the banked Power pays a map Spell tier — a Power-1 View Air resolves with NO power cards, then the bank is spent", () => {
    let state = mapHand(["spell.view_air"]);
    state.players.p1.mapSpellPowerBank = 1; // a Sorcery / Scales bank from earlier this turn
    const materialsBefore = state.players.p1.resources.buildingMaterials;

    // The Power-1 tier ("Gain 2 Building Materials, pay 1 Power") is now offered
    // with NO power cards in hand — the bank pays it.
    const tier = viewAirTier(state, 1);
    expect(tier, "the Power-1 tier is affordable from the bank alone").toBeDefined();

    state = applyOk(state, { ...tier!, costCardIds: [] });

    // The tier RESOLVED (materials rose by 2) and the bank was consumed.
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
    expect(state.players.p1.mapSpellPowerBank ?? 0, "one Spell, one boost — the bank is spent").toBe(0);
  });

  it("CONTROL: with no bank and no power card, the Power-1 tier is not castable (only the free base tier is)", () => {
    const state = mapHand(["spell.view_air"]);
    expect(state.players.p1.mapSpellPowerBank ?? 0).toBe(0);
    expect(viewAirTier(state, 1), "no bank, no power source → the Power tier is withheld").toBeUndefined();
    expect(viewAirTier(state, 0), "the free base tier is still offered").toBeDefined();
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
  it("a Cast-a-Spell cannot fund a map Spell's Power tier (CONTROL: a real Power card does)", () => {
    // Cast a Spell is a physical Spell card, but must contribute NO Power: it
    // previously let the hand reach a tier it could not really pay, then crashed.
    const withEnabler = mapHand(["spell.cast_a_spell", "spell.view_air"]);
    expect(viewAirTier(withEnabler, 1), "Cast a Spell does not fund the Power-1 tier").toBeUndefined();

    // CONTROL: a genuine Power source funds the very same tier.
    const withPower = mapHand(["stat.power", "spell.view_air"]);
    expect(viewAirTier(withPower, 1), "a real Power card DOES fund it").toBeDefined();
  });

  it("rejects paying a map Spell tier with a Cast-a-Spell as the cost card", () => {
    const state = mapHand(["spell.cast_a_spell", "stat.power", "spell.view_air"]);
    const tier = viewAirTier(state, 1)!; // affordable via stat.power
    const result = applyAction(state, { ...tier, costCardIds: ["spell.cast_a_spell"] });
    expect(result.errors.length, "Cast a Spell is not an eligible power-source cost card").toBeGreaterThan(0);
  });
});
