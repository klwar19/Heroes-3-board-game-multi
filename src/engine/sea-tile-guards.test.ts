import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getAdjacentSpaceIds,
  isFieldGuarded,
  isSeaField,
  type GameAction,
  type GameState
} from "./index";
import { getTileFootprintSpaceIds, instantiateTile } from "./adventure";

// ---------------------------------------------------------------------------
// Sea-tile guards must match the Difficulty numerals printed on each tile's
// art — and nothing else may carry a guard.
//
// Reported bug: on W6 a hero walking onto the JETSAM hex was forced into a
// level-Ⅴ Neutral battle where the art shows none, and (because jetsam is an
// open-sea hex) the post-combat sea-movement halt then stranded the winner for
// the rest of the turn. Root cause: the W6 jetsam field carried a bogus
// `difficulty: 5`. On the W6 art ONLY two hexes show a numeral — Pandora's Box
// (Ⅴ) and the Derelict Ship (Ⅳ); the jetsam is a bare "?" reward chest, exactly
// like the unguarded jetsam on W3/#C4 and the unguarded sea_chest on W4/#N10.
//
// These tests assert the OBSERVABLE outcome (no Combat starts, the hero is not
// halted) via the live MOVE_HERO action, with a guarded-hex CONTROL that still
// DOES start a Combat — so re-adding any phantom guard fails here.
// ---------------------------------------------------------------------------

function makeState(): GameState {
  const state = createAdventureGameState({ seed: "sea-tile-guards", difficulty: "normal", rollFirstPlayer: false });
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  return state;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

/** Materialise one sea tile far from the scenario tiles; index === slot (rotation 0). */
function placeSeaTile(state: GameState, tileId: string, centerRow: number): string[] {
  const tile = instantiateTile(state.adventure!, tileId, { row: centerRow, col: 40 }, 0, false);
  return getTileFootprintSpaceIds(tile);
}

/** A same-tile open-sea hex adjacent to `targetId` that a hero can sit on and
 *  step OFF without wading (sea→sea never halts). */
function adjacentSeaHex(state: GameState, footprint: string[], targetId: string): string {
  const own = new Set(footprint);
  for (const nb of getAdjacentSpaceIds(targetId)) {
    const field = state.adventure!.fields[nb];
    if (own.has(nb) && field && isSeaField(state, nb) && !isFieldGuarded(field)) {
      return nb;
    }
  }
  throw new Error(`no unguarded open-sea neighbour for ${targetId}`);
}

/** Park p1's hero on `fieldId` with movement to spare and ready to act. */
function parkHero(state: GameState, fieldId: string): GameState["heroes"][string] {
  const hero = state.heroes.hero_p1;
  if (!hero) throw new Error("no hero_p1");
  hero.spaceId = fieldId;
  hero.movementPoints = 3;
  hero.movementHaltedThisTurn = false;
  return hero;
}

describe("W6 jetsam is a peaceful open-sea pickup, not a level-Ⅴ guard", () => {
  it("walking onto W6 jetsam starts NO Combat and does not halt the hero", () => {
    const state = makeState();
    const ids = placeSeaTile(state, "W6", 64);
    const jetsam = ids.find((id) => state.adventure!.fields[id].location === "jetsam")!;

    // The hex is open sea (so a wrongful guard here would also strand the hero).
    expect(isSeaField(state, jetsam)).toBe(true);
    // The engine's own Combat gate: jetsam is NOT guarded.
    expect(isFieldGuarded(state.adventure!.fields[jetsam])).toBe(false);

    const from = adjacentSeaHex(state, ids, jetsam);
    parkHero(state, from);
    const next = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: jetsam });

    // OBSERVABLE: no battle was forced, and the hero kept its move (not stranded).
    expect(next.combat).toBeFalsy();
    expect(next.heroes.hero_p1.spaceId).toBe(jetsam);
    expect(next.heroes.hero_p1.movementHaltedThisTurn).toBe(false);
  });

  it("CONTROL: walking onto W6 Pandora's Box (Ⅴ) DOES start a Neutral Combat", () => {
    const state = makeState();
    const ids = placeSeaTile(state, "W6", 64);
    const pandora = ids.find((id) => state.adventure!.fields[id].location === "pandoras_box")!;

    expect(isSeaField(state, pandora)).toBe(true);
    expect(isFieldGuarded(state.adventure!.fields[pandora])).toBe(true);

    const from = adjacentSeaHex(state, ids, pandora);
    parkHero(state, from); // level-1 hero < difficulty 5, so no Quick-Combat skip
    const next = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: pandora });

    expect(next.combat).toBeTruthy();
    expect(next.combat?.context).toMatchObject({ kind: "neutral", difficulty: 5 });
  });
});

// Every sea tile's guarded hexes, read straight off the Difficulty numerals on
// the printed tile art (/public/assets/board/tiles/*.webp). A location is listed
// here ONLY if its hex shows a roman numeral; a "?"-reward chest with no numeral
// (jetsam, an ungated sea_chest, …) is a peaceful pickup and must stay off the
// list. This invariant guards every sea tile at once against guard-placement
// drift — the W6 jetsam regression is the absence of `jetsam` from W6 below.
//
// Note: temple_of_the_sea is painted "Ⅷ" on W7/#C5 but the engine's Neutral army
// table tops out at tier 7 (NEUTRAL_ARMY_TABLE), so it is intentionally capped
// to 7 in the data — assert 7 here so any change to that cap is a conscious edit.
const EXPECTED_SEA_GUARDS: Record<string, Record<string, number>> = {
  W1: { learning_stone: 4, mine: 5 },
  W2: { mine: 5, sea_chest: 4 },
  W3: { shipwreck: 4, mine: 5 },
  W4: { learning_stone: 4, pandoras_box: 5 },
  W5: { jetsam: 5, derelict_ship: 4 },
  W6: { pandoras_box: 5, derelict_ship: 4 }, // jetsam is UNGUARDED (the fix)
  W7: { temple_of_the_sea: 7, pandoras_box: 6, sea_chest: 6 },
  "#C4": { random_town: 7, pandoras_box: 6, derelict_ship: 6 },
  "#C5": { temple_of_the_sea: 7, warriors_tomb: 6, pandoras_box: 6, derelict_ship: 6 },
  "#N8": { mine: 5, shipwreck_survivor: 4 },
  "#N9": { mine: 5, sea_chest: 4 },
  "#N10": { mine: 5, shipwreck: 4 },
  "#N11": { sea_chest: 4, pandoras_box: 5 }
};

describe("every sea tile's guards match its printed Difficulty numerals", () => {
  it("guarded hexes (and only those) carry the art's Difficulty level", () => {
    const state = makeState();
    Object.entries(EXPECTED_SEA_GUARDS).forEach(([tileId, expected], index) => {
      const ids = placeSeaTile(state, tileId, 64 + index * 6);
      const guardedLocations = new Set(Object.keys(expected));
      const actual: Record<string, number> = {};
      for (const id of ids) {
        const field = state.adventure!.fields[id];
        // isFieldGuarded is the literal branch the reducer takes to start a fight
        // (resolveHeroArrival), so this checks the real Combat decision per hex.
        expect(isFieldGuarded(field), `${tileId} ${field.location} guarded?`).toBe(
          guardedLocations.has(field.location)
        );
        if (field.difficulty) {
          actual[field.location] = field.difficulty;
        }
      }
      expect(actual, `${tileId} guard table`).toEqual(expected);
    });
  });
});
