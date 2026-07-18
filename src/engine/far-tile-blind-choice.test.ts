import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState } from "./index";
import { tileDefHasResourceMine } from "./adventure-reducer";
import { allTileDefinitions } from "@/data/map/tiles";
import type { GameAction, GameState } from "./state";

/**
 * Blind Ⅱ–Ⅲ tile choice (OPTIONAL rule, `GameSetupOptions.farTileBlindChoice`,
 * default OFF — a Game-options row under the Ⅱ–Ⅲ tile settings): a player
 * opening a Ⅱ–Ⅲ (Far) tile from their supply first chooses BLINDLY — before
 * any tile is drawn — whether they want a tile with a GOLD mine, one with a
 * VALUABLES mine, or no preference; the random draw is then restricted to
 * tiles carrying that landmark, falling back to a plain draw (with a public
 * note) when none is left in the pool. Every claim below is mutation-checked
 * with an option-off CONTROL.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(seed: string, blindChoice: boolean): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    farTileBlindChoice: blindChoice
  });
  state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  // Stand on the seat-0 town-flower hex (7,2), bordering the empty notch at
  // (6,4) — the same legal placement adventure.test.ts uses.
  state.heroes.hero_p1.spaceId = "h:7:2";
  state.heroes.hero_p1.movementPoints = 3;
  return state;
}

const PLACE: GameAction = {
  type: "PLACE_TILE",
  playerId: "p1",
  heroId: "hero_p1",
  supplyIndex: 0,
  centerRow: 6,
  centerCol: 4
};

/** A Far-pool tile id carrying (or not carrying) the given mine. */
function poolTileWith(state: GameState, resource: "gold" | "valuables", want: boolean): string | undefined {
  return (state.adventure!.farTilePool ?? []).find(
    (id) => tileDefHasResourceMine(id, resource) === want
  );
}

describe("Blind Ⅱ–Ⅲ tile choice", () => {
  it("with the option ON, placing a supply tile first opens the blind pick — no tile drawn yet", () => {
    const state = makeGame("blind-open", true);
    const poolBefore = [...(state.adventure!.farTilePool ?? [])];
    const next = applyOk(state, PLACE);

    const choice = next.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("far-tile-flip");
    expect(choice?.playerId).toBe("p1");
    expect(choice?.type === "OPTION_CHOICE" ? choice.options.map((o) => o.label) : []).toEqual([
      "No preference — draw any tile",
      "Prefer a tile with a GOLD mine",
      "Prefer a tile with a VALUABLES mine"
    ]);
    // BLIND: nothing has been drawn — the pool is untouched, no candidate yet.
    expect(next.adventure!.pendingFarTileFlip?.offerMode).toBe("blind");
    expect(next.adventure!.pendingFarTileFlip?.candidate).toBe("");
    expect(next.adventure!.farTilePool).toEqual(poolBefore);
    // The supply marker and the movement point are spent as usual.
    expect(next.adventure!.playerFarTiles.p1.length).toBe(state.adventure!.playerFarTiles.p1.length - 1);
    expect(next.heroes.hero_p1.movementPoints).toBe(2);
  });

  it("preferring GOLD draws a gold-mine tile whenever the pool holds one (fails if the filter is removed)", () => {
    // Across several seeds the drawn candidate must ALWAYS carry a gold mine
    // while the pool holds at least one such tile.
    for (const seed of ["g1", "g2", "g3", "g4", "g5"]) {
      const state = makeGame(`blind-gold-${seed}`, true);
      expect(poolTileWith(state, "gold", true), "the pool holds a gold-mine tile").toBeTruthy();
      let next = applyOk(state, PLACE);
      next = applyOk(next, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: next.pendingChoice!.id,
        optionIndex: 1
      });
      const candidate =
        next.adventure!.pendingFarTileFlip?.candidate ??
        // No reroll offer due → the tile was placed straight away and awaits rotation.
        Object.values(next.adventure!.tiles).find((tile) => tile.centerRow === 6 && tile.centerCol === 4)!
          .tileDefId;
      expect(
        tileDefHasResourceMine(candidate, "gold"),
        `seed ${seed}: drew ${candidate}, which should carry a gold mine (fields=${JSON.stringify(
          allTileDefinitions[candidate]?.fields
        )})`
      ).toBe(true);
    }
  });

  it("a preference with NO matching tile left falls back to a plain draw with a public note", () => {
    const state = makeGame("blind-fallback", true);
    // Strip every valuables-mine tile from the pool so the preference must soft-fail.
    state.adventure!.farTilePool = (state.adventure!.farTilePool ?? []).filter(
      (id) => !tileDefHasResourceMine(id, "valuables")
    );
    expect(state.adventure!.farTilePool.length).toBeGreaterThan(0);
    let next = applyOk(state, PLACE);
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice!.id,
      optionIndex: 2
    });
    // A tile WAS drawn (flip advanced past the blind stage or already placed)…
    const flip = next.adventure!.pendingFarTileFlip;
    if (flip) {
      expect(flip.offerMode).not.toBe("blind");
      expect(flip.candidate).not.toBe("");
    }
    // …and the soft-fail is publicly noted.
    expect(
      next.eventLog.some(
        (event) => event.type === "MAP_SECRET_FEATURE_FALLBACK" && event.feature === "valuables_mine"
      )
    ).toBe(true);
  });

  it("'No preference' draws a plain random tile and the flip continues as usual", () => {
    const state = makeGame("blind-nopref", true);
    let next = applyOk(state, PLACE);
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice!.id,
      optionIndex: 0
    });
    // The flip advanced: either a follow-up keep/reroll offer or a placed tile.
    const flip = next.adventure!.pendingFarTileFlip;
    const placed = Object.values(next.adventure!.tiles).some(
      (tile) => tile.centerRow === 6 && tile.centerCol === 4
    );
    expect((flip && flip.offerMode !== "blind" && flip.candidate !== "") || placed).toBe(true);
    expect(next.eventLog.some((event) => event.type === "MAP_SECRET_FEATURE_FALLBACK")).toBe(false);
  });

  it("CONTROL: with the option OFF the draw is immediate — no blind pick opens", () => {
    const state = makeGame("blind-off", false);
    const next = applyOk(state, PLACE);
    // No blind stage: either the tile placed straight away (rotation pending)
    // or a NORMAL keep/reroll offer is open — never the blind pick.
    const flip = next.adventure!.pendingFarTileFlip;
    if (flip) {
      expect(flip.offerMode).not.toBe("blind");
      expect(flip.candidate).not.toBe("");
    }
    const choice = next.pendingChoice;
    if (choice?.type === "OPTION_CHOICE" && choice.context === "far-tile-flip") {
      expect(choice.options.map((o) => o.label)).not.toContain("No preference — draw any tile");
    }
    expect(next.adventure!.farTileBlindChoice ?? false).toBe(false);
  });

  it("freezes the lobby option onto adventure state (CONTROL: absent by default)", () => {
    const on = createAdventureGameState({
      seed: "blind-freeze",
      difficulty: "normal",
      rollFirstPlayer: false,
      farTileBlindChoice: true
    });
    expect(on.adventure?.farTileBlindChoice).toBe(true);
    const off = createAdventureGameState({ seed: "blind-freeze-off", difficulty: "normal", rollFirstPlayer: false });
    expect(off.adventure?.farTileBlindChoice ?? false).toBe(false);
  });
});
