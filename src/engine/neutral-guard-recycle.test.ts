import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, type GameAction, type GameState } from "./index";
import { getMainHero, NEUTRAL_DECK_IDS, placeCreatureBank } from "./adventure";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import { finishCombatIfNeeded } from "./combat-units";
import { NEUTRAL_PLAYER_ID } from "./state";

// ---------------------------------------------------------------------------
// Neutral-guard deck recycling: the invariant that the `!unit.bankGuard` gate in
// finalizeAdventureCombat's recycle loop pins. It is corruption-prone — a
// one-line deletion of that gate would silently push Creature-Bank / faction
// cards into the neutral tier decks, poisoning future neutral draws, with no
// existing test catching it. These tests assert the OBSERVABLE deck contents.
// ---------------------------------------------------------------------------

const TIERS = ["bronze", "silver", "gold", "azure"] as const;

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshIfNeeded(state: GameState): GameState {
  return state.players.p1.needsHandRefresh || state.players.p1.canMulligan
    ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : state;
}

/** Per-tier (draw + discard) totals — conserved across any draw/recycle cycle. */
function neutralDeckTotals(state: GameState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const tier of TIERS) {
    const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
    totals[tier] = (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0);
  }
  return totals;
}

function neutralDiscardSizes(state: GameState): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const tier of TIERS) {
    sizes[tier] = state.decks[NEUTRAL_DECK_IDS[tier]]?.discardPile.length ?? 0;
  }
  return sizes;
}

/** Deploy one unit, lock placement, then force a flawless win and finalize. */
function winAndFinalize(state: GameState): GameState {
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  expect(place, "a unit must be placeable").toBeTruthy();
  state = apply(state, place!.action);
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  // Force the win: every neutral guard falls. Clear any open pre-battle window so
  // finishCombatIfNeeded resolves the outcome directly.
  state.pendingChoice = null;
  if (state.combat) {
    for (const unit of Object.values(state.combat.units)) {
      if (unit.controllerId === NEUTRAL_PLAYER_ID) {
        unit.damage = unit.maxHealth;
      }
    }
  }
  finishCombatIfNeeded(state);
  finalizeAdventureCombat(state);
  return state;
}

describe("Neutral guard recycle — deck conservation", () => {
  it("a plain deck-drawn guard fight recycles every guard card to its tier discard, deck total conserved", () => {
    let state = createAdventureGameState({ seed: "guard-recycle", difficulty: "normal", rollFirstPlayer: false });
    state = refreshIfNeeded(state);

    // A plain guarded field the hero stands on. Hero level < difficulty so this is
    // a real (deploying) fight, NOT a Quick-Combat auto-win that deploys nobody.
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.spaceId = "guard-field";
    state.adventure!.fields["guard-field"] = {
      spaceId: "guard-field",
      tileInstanceId: "t",
      slot: 0,
      location: "guard",
      difficulty: 3,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };

    const totalsBefore = neutralDeckTotals(state);
    startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
    // A real fight opened (guards will be drawn at placement) — not Quick Combat.
    expect(state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(false);
    expect(state.combat?.context.kind).toBe("neutral");

    // Deploy → the guards are popped from the neutral decks.
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = apply(state, place!.action);
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const drawnGuards = Object.values(state.combat!.units)
      .filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)
      .map((unit) => ({ unitDefId: unit.unitDefId!, grade: unit.grade }));
    expect(drawnGuards.length, "the difficulty-3 party deployed guards").toBeGreaterThan(0);

    // Force the win and finalize (the recycle loop runs here).
    state.pendingChoice = null;
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === NEUTRAL_PLAYER_ID) unit.damage = unit.maxHealth;
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);

    // Every drawn guard card now sits in its OWN tier discard, and no tier's
    // draw+discard total moved (draw N popped → N recycled to discard).
    for (const guard of drawnGuards) {
      const discard = state.decks[NEUTRAL_DECK_IDS[guard.grade as (typeof TIERS)[number]]]!.discardPile;
      expect(discard, `${guard.unitDefId} recycled to the ${guard.grade} discard`).toContain(guard.unitDefId);
    }
    expect(neutralDeckTotals(state)).toEqual(totalsBefore);
  });

  it("a Creature Bank win recycles NO card into the neutral decks — bank guards are excluded", () => {
    let state = createAdventureGameState({ seed: "bank-no-recycle", difficulty: "normal", rollFirstPlayer: false });
    state = refreshIfNeeded(state);

    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.spaceId = "bank-field";
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    placeCreatureBank(state, "bank-field", "crypt");

    const totalsBefore = neutralDeckTotals(state);
    const discardsBefore = neutralDiscardSizes(state);

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    state = winAndFinalize(state);

    // The bank guards (bankGuard) are minted, never deck-drawn — so the neutral
    // decks are byte-identical after the win. Deleting the `!unit.bankGuard` gate
    // in the recycle loop leaks the bank's guard cards into these discards and
    // trips this assertion.
    expect(neutralDiscardSizes(state), "no bank card leaked into any neutral discard").toEqual(discardsBefore);
    expect(neutralDeckTotals(state)).toEqual(totalsBefore);
  });
});
