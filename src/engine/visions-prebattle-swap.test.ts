import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, type GameAction, type GameState } from "./index";
import { getMainHero, NEUTRAL_DECK_IDS } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { NEUTRAL_PLAYER_ID, type HouseRuleId, type PendingChoice } from "./state";

// ===========================================================================
// Visions (pre-battle) — casting Visions before a NEUTRAL guard battle to SWAP
// OUT the drawn guards (an addition to its map-turn deck scry). This mirrors the
// Groovy Satyr swap but is player-initiated: hold Visions, and at guard reveal
// you may cast it to discard-and-redraw up to N of the drawn guards, where N
// scales with Visions' Power (1/2/3, paid by discarding extra Spells). Every
// assertion below fails if its wiring is removed, each with a CONTROL.
// ===========================================================================

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function setActive(state: GameState, activeCardId: string): void {
  state.adventure!.astrologers = {
    activeCardId,
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: []
  };
}

/** A real neutral Combat Setup for p1 (level-1 hero vs a field-difficulty guard). */
function neutralSetup(
  seed: string,
  hand: string[],
  difficulty = 2,
  houseRules?: Partial<Record<HouseRuleId, boolean>>
): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, houseRules });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  // No swap-granting Astrologers card up: dead_silence is a neutral proclamation,
  // so any swap offered here comes from Visions alone.
  setActive(state, "astrologers.dead_silence");
  const hero = getMainHero(state, "p1")!;
  const field = state.adventure!.fields[hero.spaceId!];
  field.difficulty = difficulty; // level-1 hero < difficulty → a real fight
  startNeutralEncounter(state, hero, field);
  // Set the attacker's hand exactly (read live at guard reveal).
  state.players.p1.hand = [...hand];
  state.players.p1.discard = [];
  return state;
}

/** Deploys one unit and locks placement, so the guard army reveals (or its offer opens). */
function placeAndFinish(state: GameState): GameState {
  const place = getLegalActions(state, "p1").find((legal) => legal.action.type === "PLACE_COMBAT_UNIT");
  expect(place, "a unit to place").toBeTruthy();
  const placed = apply(state, place!.action);
  return apply(placed, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

function choiceContext(choice: PendingChoice | null): string | null {
  return choice?.type === "OPTION_CHOICE" ? choice.context : null;
}

function neutralUnitDefIds(state: GameState): string[] {
  return Object.values(state.combat!.units)
    .filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)
    .map((unit) => unit.unitDefId!)
    .filter(Boolean);
}

function swappedEvents(state: GameState) {
  return state.eventLog.filter(
    (event): event is Extract<GameState["eventLog"][number], { type: "NEUTRAL_DRAW_SWAPPED" }> =>
      event.type === "NEUTRAL_DRAW_SWAPPED"
  );
}

describe("Visions pre-battle swap", () => {
  it("offers a cast/keep choice when the attacker holds Visions at guard reveal", () => {
    const state = placeAndFinish(neutralSetup("vis-offer", ["spell.visions"]));
    expect(choiceContext(state.pendingChoice)).toBe("visions-guard-cast");
    const labels = state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.options.map((o) => o.label) : [];
    expect(labels.some((label) => /Cast Visions/.test(label))).toBe(true);
    // The drawn guards are parked, awaiting the decision.
    expect((state.combat!.pendingNeutralDraws ?? []).length).toBeGreaterThan(0);
  });

  it("CONTROL: no offer when the attacker does NOT hold Visions — the army reveals directly", () => {
    const state = placeAndFinish(neutralSetup("vis-none", ["spell.slow"]));
    expect(state.pendingChoice).toBeNull();
    expect(neutralUnitDefIds(state).length).toBeGreaterThan(0);
  });

  it("OFF (house rule 'vision-battle-swap'): holding Visions offers NO swap — the army reveals directly", () => {
    // Same hand as the offer case, but the toggle is off: the pre-battle cast is
    // never offered, so the guards reveal straight away and Visions stays in hand.
    const state = placeAndFinish(neutralSetup("vis-off", ["spell.visions"], 2, { "vision-battle-swap": false }));
    expect(choiceContext(state.pendingChoice), "no visions-guard-cast offer without the rule").not.toBe(
      "visions-guard-cast"
    );
    expect(neutralUnitDefIds(state).length, "the guards revealed directly").toBeGreaterThan(0);
    expect(state.players.p1.hand, "Visions was never cast").toContain("spell.visions");
  });

  it("KEEP leaves the drawn army and keeps Visions in hand", () => {
    const opened = placeAndFinish(neutralSetup("vis-keep", ["spell.visions"]));
    const drawn = (opened.combat!.pendingNeutralDraws ?? []).map((draw) => draw.unitDefId).filter(Boolean);
    expect(drawn.length).toBeGreaterThan(0);

    const kept = apply(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 0
    });
    expect(kept.pendingChoice).toBeNull();
    // Revealed army is exactly the drawn one; Visions is still in hand, not spent.
    expect(neutralUnitDefIds(kept).filter((id) => drawn.includes(id)).length).toBe(drawn.length);
    expect(kept.players.p1.hand).toContain("spell.visions");
    expect(swappedEvents(kept)).toHaveLength(0);
  });

  it("CAST → swaps one drawn guard (discard + redraw same tier) and spends Visions", () => {
    // Power 0 (no extra Spells): casting goes straight to the swap loop.
    const opened = placeAndFinish(neutralSetup("vis-swap", ["spell.visions"]));
    expect(choiceContext(opened.pendingChoice)).toBe("visions-guard-cast");

    const casting = apply(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 1 // Cast Visions
    });
    // Visions was discarded to pay the cast.
    expect(casting.players.p1.hand).not.toContain("spell.visions");
    expect(casting.players.p1.discard).toContain("spell.visions");
    // With no boost Spells in hand, the swap loop opens immediately.
    expect(choiceContext(casting.pendingChoice)).toBe("visions-guard-swap");

    // The first swappable (non-bank) drawn guard.
    const draws = casting.combat!.pendingNeutralDraws ?? [];
    const swapIndex = draws.findIndex((draw) => !draw.bankGuard);
    expect(swapIndex).toBeGreaterThanOrEqual(0);
    const originalDrawn = draws[swapIndex].unitDefId;
    const tier = draws[swapIndex].tier;

    const swapped = apply(casting, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: casting.pendingChoice!.id,
      optionIndex: swapIndex
    });

    // At Power 0 the single swap is spent, so the army reveals.
    expect(swapped.pendingChoice).toBeNull();
    const events = swappedEvents(swapped);
    expect(events).toHaveLength(1);
    expect(events[0].fromUnitDefId).toBe(originalDrawn);
    // The discarded original is in its tier's Neutral discard pile...
    expect(swapped.decks[NEUTRAL_DECK_IDS[tier]]!.discardPile).toContain(originalDrawn);
    // ...and the fresh replacement is the unit now on the board.
    expect(neutralUnitDefIds(swapped)).toContain(events[0].toUnitDefId);
  });

  it("DONE mid-loop reveals the drawn army unchanged (no swap forced)", () => {
    const opened = placeAndFinish(neutralSetup("vis-done", ["spell.visions"]));
    const drawn = (opened.combat!.pendingNeutralDraws ?? []).map((draw) => draw.unitDefId).filter(Boolean);
    const casting = apply(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 1 // Cast Visions
    });
    expect(choiceContext(casting.pendingChoice)).toBe("visions-guard-swap");
    // The trailing "Done — reveal the army" option is the last one.
    const loop = casting.pendingChoice;
    const doneIndex = loop?.type === "OPTION_CHOICE" ? loop.options.length - 1 : -1;
    const done = apply(casting, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: casting.pendingChoice!.id,
      optionIndex: doneIndex
    });
    expect(choiceContext(done.pendingChoice)).not.toBe("visions-guard-swap");
    // Visions was still spent (the cast happened) but no guard was swapped.
    expect(done.players.p1.discard).toContain("spell.visions");
    expect(swappedEvents(done)).toHaveLength(0);
    expect(neutralUnitDefIds(done).filter((id) => drawn.includes(id)).length).toBe(drawn.length);
  });

  it("Power scales the swap budget: two extra Spells buy up to 3 swaps", () => {
    const opened = placeAndFinish(neutralSetup("vis-power", ["spell.visions", "spell.slow", "spell.haste"]));
    const casting = apply(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 1 // Cast Visions
    });
    // With boost Spells in hand, the Power boost step opens first.
    expect(choiceContext(casting.pendingChoice)).toBe("visions-guard-boost");

    // Discard the first extra Spell for +1 swap (Power 1)...
    const boost1 = apply(casting, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: casting.pendingChoice!.id,
      optionIndex: 0
    });
    expect(choiceContext(boost1.pendingChoice)).toBe("visions-guard-boost");
    // ...and the second (Power 2 = top breakpoint) → the swap loop opens with 3.
    const boost2 = apply(boost1, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: boost1.pendingChoice!.id,
      optionIndex: 0
    });
    expect(choiceContext(boost2.pendingChoice)).toBe("visions-guard-swap");
    const loop = boost2.pendingChoice;
    expect(loop?.type === "OPTION_CHOICE" ? loop.visionsGuardSwap?.swapsRemaining : 0).toBe(3);
    // Both boost Spells were spent alongside Visions.
    expect(boost2.players.p1.hand).toEqual([]);
    expect(boost2.players.p1.discard).toEqual(
      expect.arrayContaining(["spell.visions", "spell.slow", "spell.haste"])
    );
  });

  it("CONTROL: at Power 0 the loop closes after a single swap (budget is 1)", () => {
    const opened = placeAndFinish(neutralSetup("vis-p0", ["spell.visions"]));
    const casting = apply(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 1
    });
    const loop = casting.pendingChoice;
    expect(loop?.type === "OPTION_CHOICE" ? loop.visionsGuardSwap?.swapsRemaining : 0).toBe(1);
  });
});
