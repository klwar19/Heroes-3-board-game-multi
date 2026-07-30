import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createAdventureLobbyState, getLegalActions } from "./index";
import { MAX_FAR_TILES_PER_PLAYER, type GameAction, type GameState } from "./state";

// House-rule Ⅱ–Ⅲ (Far) tile flip: the per-player supply is opaque UNOPENED
// markers, a truly-random tile is drawn at the flip, and the player keeps /
// rerolls / picks under the settlement + material-mine rules. Every test asserts
// the OBSERVED outcome (which tile lands, whether a Settlement/Mine is on the
// board) and would fail if the wiring were removed.
//
// Fixture tile facts (verified against tile-defs):
//   F1   — Settlement, no Mine          → auto-finalizes on a 1st opening
//   F4   — GOLD Mine, no Settlement      → fails the settlement check; NO ore reroll
//   F7   — VALUABLES Mine, no Settlement → NO ore reroll
//   #F4  — ORE Mine, no Settlement       → triggers the one-time ore-mine reroll
const SETTLEMENT_NO_MINE = "F1";
const MINE_NO_SETTLEMENT = "F4"; // a no-Settlement tile (its Mine is GOLD, so no ore reroll)
const ORE_MINE_NO_SETTLEMENT = "#F4";
const GOLD_MINE_NO_SETTLEMENT = "F4";
const VALUABLES_MINE_NO_SETTLEMENT = "F7";

const PLACE: Extract<GameAction, { type: "PLACE_TILE" }> = {
  type: "PLACE_TILE",
  playerId: "p1",
  heroId: "hero_p1",
  supplyIndex: 0,
  centerRow: 6,
  centerCol: 4
};

function makeGame(): GameState {
  return createAdventureGameState({ seed: "far-flip-seed", difficulty: "normal", rollFirstPlayer: false });
}

function refreshP1(state: GameState): GameState {
  if (!state.players.p1.needsHandRefresh && !state.players.p1.canMulligan) {
    return state;
  }
  const result = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  expect(result.errors).toHaveLength(0);
  return result.state;
}

/** A game where p1's hero stands at the (6,4) border slot with movement to spare. */
function setup(): GameState {
  const state = refreshP1(makeGame());
  state.heroes.hero_p1.spaceId = "h:7:2";
  state.heroes.hero_p1.movementPoints = 5;
  return state;
}

function apply(state: GameState, action: GameAction, entropy?: string): GameState {
  const result = applyAction(state, action, entropy ? { entropy } : {});
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** The Ⅱ–Ⅲ tile def the flip is currently showing (mid-decision or just-placed). */
function revealedFarTile(state: GameState): string {
  const flip = state.adventure!.pendingFarTileFlip;
  if (flip) {
    return flip.candidate;
  }
  const pending = state.adventure!.pendingTileChoice;
  if (pending) {
    return state.adventure!.tiles[pending.tileInstanceId].tileDefId;
  }
  throw new Error("no Ⅱ–Ⅲ tile was revealed");
}

/** Resolves the open far-tile-flip OPTION_CHOICE by index. */
function choose(state: GameState, optionIndex: number): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type).toBe("OPTION_CHOICE");
  expect(choice && "context" in choice ? choice.context : null).toBe("far-tile-flip");
  return apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex });
}

/** Confirms the rotation of the just-placed tile and returns whether its footprint carries a Settlement field. */
function rotateAndHasSettlement(state: GameState): boolean {
  const placedId = state.adventure!.pendingTileChoice!.tileInstanceId;
  const rotations = getLegalActions(state, "p1").filter((legal) => legal.action.type === "SET_TILE_ROTATION");
  expect(rotations.length).toBeGreaterThan(0);
  const next = apply(state, rotations[0].action);
  return Object.values(next.adventure!.fields).some(
    (field) => field.tileInstanceId === placedId && field.location === "settlement"
  );
}

describe("Ⅱ–Ⅲ tile flip — true random + keep/reroll/pick", () => {
  describe("setup: number of Ⅱ–Ⅲ tiles per player", () => {
    it("sizes each player's supply to the option (clamped 0..MAX), default 2", () => {
      for (const n of [0, 1, 3, 5]) {
        const state = createAdventureGameState({
          seed: "count",
          difficulty: "normal",
          rollFirstPlayer: false,
          farTilesPerPlayer: n
        });
        expect(state.adventure!.playerFarTiles.p1).toHaveLength(n);
        expect(state.adventure!.playerFarTiles.p1.every((m) => m === "?")).toBe(true);
      }
      // Above the cap clamps to MAX; below clamps to 0.
      const big = createAdventureGameState({ seed: "c", difficulty: "normal", rollFirstPlayer: false, farTilesPerPlayer: 99 });
      expect(big.adventure!.playerFarTiles.p1).toHaveLength(MAX_FAR_TILES_PER_PLAYER);
      const neg = createAdventureGameState({ seed: "c", difficulty: "normal", rollFirstPlayer: false, farTilesPerPlayer: -3 });
      expect(neg.adventure!.playerFarTiles.p1).toHaveLength(0);
      // Default (unset) is the scenario's perPlayer, which is 2.
      const def = createAdventureGameState({ seed: "c", difficulty: "normal", rollFirstPlayer: false });
      expect(def.adventure!.playerFarTiles.p1).toHaveLength(2);
      // Opening OFF empties the supply regardless of the count.
      const off = createAdventureGameState({
        seed: "c",
        difficulty: "normal",
        rollFirstPlayer: false,
        farTileOpening: false,
        farTilesPerPlayer: 4
      });
      expect(off.adventure!.playerFarTiles.p1).toEqual([]);
    });

    it("flows from the lobby SET_GAME_OPTIONS through to each player's supply", () => {
      let state = createAdventureLobbyState({ seed: "lobby" });
      // A value above the cap is clamped on the way into the lobby options.
      state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { farTilesPerPlayer: 99 } });
      expect(state.setupLobby!.options.farTilesPerPlayer).toBe(MAX_FAR_TILES_PER_PLAYER);
      state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: { farTilesPerPlayer: 1 } });
      expect(state.setupLobby!.options.farTilesPerPlayer).toBe(1);
      state = apply(state, {
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { farTileSettlementReroll: false }
      });
      expect(state.setupLobby!.options.farTileSettlementReroll).toBe(false);

      state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
      state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "inferno", heroDefId: "xyron" });
      state = apply(state, { type: "START_ADVENTURE", playerId: "p2" });

      expect(state.adventure!.playerFarTiles.p1).toHaveLength(1);
      expect(state.adventure!.playerFarTiles.p2).toHaveLength(1);
      expect(state.adventure!.playerFarTiles.p1.every((m) => m === "?")).toBe(true);
      expect(state.adventure!.farTileSettlementReroll).toBe(false);
    });
  });

  describe("true randomness at the flip", () => {
    it("reveals a different tile per fresh entropy, but is reproducible without it", () => {
      const base = setup();
      // No entropy (the test/deterministic path): the SAME tile every time.
      expect(revealedFarTile(apply(base, PLACE))).toBe(revealedFarTile(apply(base, PLACE)));
      // Fresh per-action entropy (the live server path): the revealed tile varies.
      const seen = new Set<string>();
      for (const token of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
        seen.add(revealedFarTile(apply(base, PLACE, token)));
      }
      expect(seen.size).toBeGreaterThan(1);
    });
  });

  describe("1st opening is normal (no reroll)", () => {
    it("places the drawn tile straight away, spends 1 MP and ticks the opened counter", () => {
      const state = setup();
      state.adventure!.farTileScriptedDraws = [SETTLEMENT_NO_MINE];
      const before = state.adventure!.playerFarTiles.p1.length;

      const next = apply(state, PLACE);

      expect(next.adventure!.pendingFarTileFlip).toBeNull();
      expect(next.pendingChoice).toBeNull();
      expect(next.adventure!.pendingTileChoice?.kind).toBe("place");
      expect(next.adventure!.tiles[next.adventure!.pendingTileChoice!.tileInstanceId].tileDefId).toBe(SETTLEMENT_NO_MINE);
      expect(next.adventure!.playerFarTiles.p1).toHaveLength(before - 1);
      expect(next.heroes.hero_p1.movementPoints).toBe(4);
      expect(next.adventure!.farTilesOpenedByPlayer!.p1).toBe(1);
    });
  });

  describe("2nd opening — settlement guarantee", () => {
    function secondOpening(scripted: string[]): GameState {
      const state = setup();
      // Pretend the player already opened their 1st tile, so this is the 2nd.
      state.adventure!.farTilesOpenedByPlayer!.p1 = 1;
      state.adventure!.farTileScriptedDraws = scripted;
      return state;
    }

    it("offers keep/reroll when the 2nd tile has no Settlement", () => {
      const state = apply(secondOpening([MINE_NO_SETTLEMENT]), PLACE);
      const flip = state.adventure!.pendingFarTileFlip!;
      expect(flip.openingIndex).toBe(2);
      expect(flip.offerMode).toBe("settlement");
      expect(flip.candidate).toBe(MINE_NO_SETTLEMENT);
      expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
      expect(state.pendingChoice && "options" in state.pendingChoice ? state.pendingChoice.options.length : 0).toBe(2);
    });

    it("places the exact 2nd tile without a Settlement offer when the reroll option is OFF", () => {
      const initial = secondOpening([MINE_NO_SETTLEMENT]);
      initial.adventure!.farTileSettlementReroll = false;
      const placed = apply(initial, PLACE);
      expect(placed.adventure!.pendingFarTileFlip).toBeNull();
      expect(placed.pendingChoice).toBeNull();
      expect(placed.adventure!.tiles[placed.adventure!.pendingTileChoice!.tileInstanceId].tileDefId).toBe(
        MINE_NO_SETTLEMENT
      );
    });

    it("KEEP lands the non-Settlement tile (control: no Settlement on the board)", () => {
      const placed = apply(secondOpening([MINE_NO_SETTLEMENT]), PLACE);
      const kept = choose(placed, 0); // Keep
      expect(kept.adventure!.tiles[kept.adventure!.pendingTileChoice!.tileInstanceId].tileDefId).toBe(MINE_NO_SETTLEMENT);
      expect(kept.adventure!.farTilesOpenedByPlayer!.p1).toBe(2);
      expect(rotateAndHasSettlement(kept)).toBe(false);
    });

    it("REROLL until a Settlement, then PICK the Settlement — a Settlement reaches the board", () => {
      // 1st draw F4 (no settlement) → reroll → F1 (settlement) → pick the settlement.
      let state = apply(secondOpening([MINE_NO_SETTLEMENT, SETTLEMENT_NO_MINE]), PLACE);
      state = choose(state, 1); // Reroll for a Settlement
      const flip = state.adventure!.pendingFarTileFlip!;
      expect(flip.offerMode).toBe("pick");
      expect(flip.candidate).toBe(SETTLEMENT_NO_MINE);
      expect(flip.lastNonSettlement).toBe(MINE_NO_SETTLEMENT);

      const picked = choose(state, 0); // Place the Settlement tile
      const placedId = picked.adventure!.pendingTileChoice!.tileInstanceId;
      expect(picked.adventure!.tiles[placedId].tileDefId).toBe(SETTLEMENT_NO_MINE);
      // The rerolled-away tile returns to the pool (not lost).
      expect(picked.adventure!.farTilePool).toContain(MINE_NO_SETTLEMENT);
      expect(rotateAndHasSettlement(picked)).toBe(true);
    });

    it("PICK the previous tile instead drops the Settlement back and lands the earlier tile", () => {
      let state = apply(secondOpening([MINE_NO_SETTLEMENT, SETTLEMENT_NO_MINE]), PLACE);
      state = choose(state, 1); // Reroll → finds the settlement
      const picked = choose(state, 1); // Place the PREVIOUS (non-settlement) tile instead
      const placedId = picked.adventure!.pendingTileChoice!.tileInstanceId;
      expect(picked.adventure!.tiles[placedId].tileDefId).toBe(MINE_NO_SETTLEMENT);
      expect(picked.adventure!.farTilePool).toContain(SETTLEMENT_NO_MINE);
      expect(rotateAndHasSettlement(picked)).toBe(false);
    });

    it("a 2nd non-Settlement reroll STILL lets you take the PREVIOUS rolled tile (3-option offer)", () => {
      // 1st draw F4 (no settlement) → reroll → F7 (still no settlement): the
      // re-presented offer now carries a THIRD option to settle for the tile just
      // seen (F4) instead of keeping F7 or gambling again (user rule). Without the
      // wiring the offer is only keep/reroll and index 2 cannot land F4.
      let state = apply(secondOpening([MINE_NO_SETTLEMENT, VALUABLES_MINE_NO_SETTLEMENT]), PLACE);
      state = choose(state, 1); // Reroll for a Settlement → draws F7 (still no settlement)
      const flip = state.adventure!.pendingFarTileFlip!;
      expect(flip.offerMode).toBe("settlement");
      expect(flip.candidate).toBe(VALUABLES_MINE_NO_SETTLEMENT);
      expect(flip.lastNonSettlement).toBe(MINE_NO_SETTLEMENT);
      // Three options now: keep F7, reroll again, OR take the previous F4.
      expect(state.pendingChoice && "options" in state.pendingChoice ? state.pendingChoice.options.length : 0).toBe(3);

      const taken = choose(state, 2); // Take the previous tile (F4)
      const placedId = taken.adventure!.pendingTileChoice!.tileInstanceId;
      expect(taken.adventure!.tiles[placedId].tileDefId).toBe(MINE_NO_SETTLEMENT);
      // The newest draw (F7) returns to the pool; nothing is lost.
      expect(taken.adventure!.farTilePool).toContain(VALUABLES_MINE_NO_SETTLEMENT);
      expect(taken.adventure!.farTilesOpenedByPlayer!.p1).toBe(2);
      expect(rotateAndHasSettlement(taken)).toBe(false);
    });

    it("CONTROL: the FIRST settlement offer (no reroll yet) is only keep/reroll — no take-previous", () => {
      // Mutation control for the test above: before any reroll `lastNonSettlement`
      // is null, so the take-previous option is absent (two options only).
      const placed = apply(secondOpening([MINE_NO_SETTLEMENT]), PLACE);
      expect(placed.adventure!.pendingFarTileFlip!.lastNonSettlement).toBeNull();
      expect(placed.pendingChoice && "options" in placed.pendingChoice ? placed.pendingChoice.options.length : 0).toBe(2);
    });

    it("does NOT offer the settlement reroll on the 2nd tile when the 1st tile ALREADY had a Settlement", () => {
      // The guarantee is a FLOOR (one Settlement), not a repeatable reroll: a
      // player whose 1st Ⅱ–Ⅲ tile was a Settlement must NOT be offered/forced a
      // settlement reroll on their 2nd, no-Settlement tile — it just places.
      const state = secondOpening([MINE_NO_SETTLEMENT]);
      state.adventure!.farSettlementOpenedByPlayer = { p1: true }; // 1st tile gave a Settlement
      const placed = apply(state, PLACE);
      expect(placed.adventure!.pendingFarTileFlip).toBeNull();
      expect(placed.pendingChoice).toBeNull();
      expect(placed.adventure!.tiles[placed.adventure!.pendingTileChoice!.tileInstanceId].tileDefId).toBe(
        MINE_NO_SETTLEMENT
      );
    });

    it("CONTROL: without a prior Settlement, the SAME 2nd no-Settlement tile DOES offer the reroll", () => {
      // Same setup minus the prior-settlement flag: the reroll offer appears —
      // proving the guard above is what suppresses it (mutation control).
      const placed = apply(secondOpening([MINE_NO_SETTLEMENT]), PLACE);
      expect(placed.adventure!.pendingFarTileFlip?.offerMode).toBe("settlement");
      expect(placed.pendingChoice?.type).toBe("OPTION_CHOICE");
    });

    it("end-to-end: opening a Settlement 1st sets the flag so the 2nd tile does not fish for another", () => {
      // Drive a real 1st opening of a Settlement tile, then assert the per-player
      // flag is set (the wiring finalizeFarTileFlip does), which is exactly what
      // suppresses the 2nd-tile guarantee.
      const state = setup();
      state.adventure!.farTileScriptedDraws = [SETTLEMENT_NO_MINE];
      const opened = apply(state, PLACE);
      expect(opened.adventure!.farSettlementOpenedByPlayer?.p1).toBe(true);
    });

    it("does NOT fire the settlement reroll on the 1st opening (only the 2nd)", () => {
      const state = setup();
      state.adventure!.farTileScriptedDraws = [MINE_NO_SETTLEMENT];
      const next = apply(state, PLACE); // opening 1 → no settlement guarantee
      // Opening 1 with a Mine tile shows the MINE choice, never the settlement one.
      const flip = next.adventure!.pendingFarTileFlip;
      expect(flip?.offerMode === "settlement").toBe(false);
    });
  });

  describe("ore-mine reroll (every opening, once) — ONLY ore Mines, never gold/valuables", () => {
    it("offers a one-time reroll when the tile has an ORE Mine, and the reroll replaces it", () => {
      const state = setup();
      // Opening 1, scripted: an ORE Mine tile, then a no-Mine tile on the reroll.
      state.adventure!.farTileScriptedDraws = [ORE_MINE_NO_SETTLEMENT, SETTLEMENT_NO_MINE];
      const offered = apply(state, PLACE);
      const flip = offered.adventure!.pendingFarTileFlip!;
      expect(flip.offerMode).toBe("mine");
      expect(flip.candidate).toBe(ORE_MINE_NO_SETTLEMENT);

      const rerolled = choose(offered, 1); // Reroll once (ore mine)
      // The fresh tile (no ore mine) auto-finalizes; the ore tile returns to the pool.
      expect(rerolled.adventure!.pendingFarTileFlip).toBeNull();
      expect(rerolled.adventure!.tiles[rerolled.adventure!.pendingTileChoice!.tileInstanceId].tileDefId).toBe(
        SETTLEMENT_NO_MINE
      );
      expect(rerolled.adventure!.farTilePool).toContain(ORE_MINE_NO_SETTLEMENT);
    });

    it("KEEP lands the ore Mine tile (control: an ore Mine reaches the board)", () => {
      const state = setup();
      state.adventure!.farTileScriptedDraws = [ORE_MINE_NO_SETTLEMENT];
      const offered = apply(state, PLACE);
      expect(offered.adventure!.pendingFarTileFlip!.offerMode).toBe("mine");
      const kept = choose(offered, 0); // Keep the ore Mine tile
      const placedId = kept.adventure!.pendingTileChoice!.tileInstanceId;
      const rotations = getLegalActions(kept, "p1").filter((legal) => legal.action.type === "SET_TILE_ROTATION");
      const placed = apply(kept, rotations[0].action);
      const hasOreMine = Object.values(placed.adventure!.fields).some(
        (field) =>
          field.tileInstanceId === placedId && field.location === "mine" && field.resource === "buildingMaterials"
      );
      expect(hasOreMine).toBe(true);
    });

    it("is suppressed when the Ⅱ–Ⅲ Settlement reroll option is OFF (exact tile identities)", () => {
      const state = setup();
      state.adventure!.farTileSettlementReroll = false;
      state.adventure!.farTileScriptedDraws = [ORE_MINE_NO_SETTLEMENT];
      const next = apply(state, PLACE);
      // No ore-mine offer either: the OFF option promises the exact drawn tile.
      expect(next.adventure!.pendingFarTileFlip).toBeNull();
      expect(next.pendingChoice).toBeNull();
      expect(next.adventure!.tiles[next.adventure!.pendingTileChoice!.tileInstanceId].tileDefId).toBe(
        ORE_MINE_NO_SETTLEMENT
      );
    });

    it("does NOT reroll on a GOLD Mine (it places straight away, like a no-Mine tile)", () => {
      const state = setup();
      state.adventure!.farTileScriptedDraws = [GOLD_MINE_NO_SETTLEMENT];
      const next = apply(state, PLACE); // opening 1
      // No reroll offered: the gold-mine tile finalizes straight onto the board.
      expect(next.adventure!.pendingFarTileFlip).toBeNull();
      expect(next.pendingChoice).toBeNull();
      expect(next.adventure!.tiles[next.adventure!.pendingTileChoice!.tileInstanceId].tileDefId).toBe(
        GOLD_MINE_NO_SETTLEMENT
      );
    });

    it("does NOT reroll on a VALUABLES Mine either", () => {
      const state = setup();
      state.adventure!.farTileScriptedDraws = [VALUABLES_MINE_NO_SETTLEMENT];
      const next = apply(state, PLACE); // opening 1
      expect(next.adventure!.pendingFarTileFlip).toBeNull();
      expect(next.pendingChoice).toBeNull();
      expect(next.adventure!.tiles[next.adventure!.pendingTileChoice!.tileInstanceId].tileDefId).toBe(
        VALUABLES_MINE_NO_SETTLEMENT
      );
    });
  });
});
