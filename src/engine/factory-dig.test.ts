import { describe, expect, it } from "vitest";

import { applyAction, createAdventureGameState } from "./index";
import { processPendingVisit } from "./adventure";
import { locationDefinitions } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import type { GameState } from "./state";

/**
 * The Factory "shovel" — the Excavation (artifact_dig) field: dig up the top
 * Artifact card, then KEEP it (into hand) or DISCARD it (to that deck's discard
 * pile). Wired as the DIG_ARTIFACT location interaction → visit steps, used by
 * the Factory near tile &N1. Each behaviour below fails if the wiring is removed.
 */

function factoryGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

/** The minor Artifact deck's current top card (what the dig will reveal). */
function minorTop(state: GameState): string {
  const pile = state.decks["artifacts-minor"]!.drawPile;
  return pile[pile.length - 1];
}

/** Queue a dig for p1's hero and run the visit up to the keep/discard choice. */
function openDig(state: GameState): void {
  state.adventure!.pendingVisit = {
    playerId: "p1",
    heroId: "hero_p1",
    fieldId: state.heroes.hero_p1!.spaceId!,
    steps: [{ type: "DIG_ARTIFACT" }]
  };
  processPendingVisit(state);
}

describe("Factory Excavation (shovel) — dig an artifact, keep or discard", () => {
  it("the &N1 tile carries the Excavation field and the location is implemented", () => {
    const tile = allTileDefinitions["&N1"];
    expect(tile, "&N1 is defined").toBeDefined();
    expect(tile.fields.some((f) => f.location === "artifact_dig"), "&N1 has the shovel field").toBe(true);
    const loc = locationDefinitions.artifact_dig;
    expect(loc?.interaction).toEqual({ type: "DIG_ARTIFACT" });
    expect(loc?.implementationStatus).toBe("implemented");
  });

  it("digging reveals the top Artifact and offers keep OR discard", () => {
    const state = factoryGame("dig-offer");
    const top = minorTop(state);
    openDig(state);

    const step = state.adventure!.pendingVisit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    if (step.type === "CHOOSE_ONE") {
      expect(step.options).toHaveLength(2);
      expect(step.options[0].label).toContain("Keep");
      expect(step.options[1].label).toBe("Discard it");
    }
    // The card is off the draw pile while the choice is pending.
    expect(state.decks["artifacts-minor"]!.drawPile).not.toContain(top);
  });

  it("KEEP puts the dug artifact into the digger's hand", () => {
    const state = factoryGame("dig-keep");
    const top = minorTop(state);
    expect(state.players.p1.hand).not.toContain(top);

    openDig(state);
    const result = applyAction(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(result.errors).toEqual([]);
    expect(result.state.players.p1.hand, "kept artifact is in hand").toContain(top);
    expect(result.state.decks["artifacts-minor"]!.discardPile, "not discarded").not.toContain(top);
    expect(
      result.state.eventLog.some((e) => e.type === "ARTIFACT_DUG" && e.cardId === top && e.kept),
      "a keep event fires"
    ).toBe(true);
  });

  it("DISCARD sends the dug artifact to the Artifact discard, never the hand", () => {
    const state = factoryGame("dig-discard");
    const top = minorTop(state);

    openDig(state);
    const result = applyAction(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 });

    expect(result.errors).toEqual([]);
    expect(result.state.players.p1.hand, "discarded artifact never reaches hand").not.toContain(top);
    expect(result.state.decks["artifacts-minor"]!.discardPile, "it is in the artifact discard").toContain(top);
    expect(
      result.state.eventLog.some((e) => e.type === "ARTIFACT_DUG" && e.cardId === top && !e.kept),
      "a discard event fires"
    ).toBe(true);
  });
});
