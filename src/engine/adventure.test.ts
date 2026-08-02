import { describe, expect, it } from "vitest";
import { tileBackImage } from "@/data/assets/homm-assets";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import { allTileDefinitions } from "@/data/map/tiles";
import { isSharedDeckId } from "./decks";
import {
  changeMorale,
  drawAstrologersCard,
  instantiateTile,
  placeCreatureBank,
  refreshRoundTokens,
  subterraneanTileBand
} from "./adventure";
import {
  applyAction,
  canCrossEdge,
  canHeroReachPlacedTile,
  canHeroReachPlacementCenter,
  createAdventureGameState,
  createAdventureLobbyState,
  getLegalActions,
  getPlayerView,
  getScenario,
  hexDistance,
  hexNeighbors,
  hexSpaceId,
  hexToPixel,
  parseHexSpaceId,
  pixelToHex,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprint,
  tileLatticeColor,
  tileLatticeNeighbors,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameState
} from "./index";

function makeGame(): GameState {
  // The lobby defaults to "impossible"; these fixtures pin "normal" so the
  // guard armies stay small and deterministic.
  return createAdventureGameState({ startingBuildings: [], seed: "test-seed", difficulty: "normal", rollFirstPlayer: false, events: false });
}

/**
 * Same fixture with the OPT-IN `discovery-border-gate` house rule ON: yellow
 * borders then also block TILE DISCOVERY / placement, the way the engine used to
 * behave. Officially (rule OFF, the default) being adjacent is the whole
 * requirement — pinned by "official: adjacency alone …" below.
 */
function makeBorderGateGame(): GameState {
  return createAdventureGameState({
    startingBuildings: [],
    seed: "test-seed",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    houseRules: { "discovery-border-gate": true }
  });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshP1(state: GameState): GameState {
  // Resolve the mandatory start-of-turn draw (every turn, including the first):
  // it must be taken before moving or using a card. When First-round Mulligan
  // is ON, fill-to-limit also arms OPENING_HAND_MULLIGAN — keep the hand so
  // tests can move on without an extra UI step.
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  if (state.players.p1.canOpeningMulligan) {
    state = apply(state, { type: "OPENING_HAND_MULLIGAN", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

/**
 * Fully resolves a shared-deck "Search X". When the deck's discard pile holds
 * cards the engine first raises the Search-or-take-discard choice; this picks
 * the Search branch and then keeps the first revealed card.
 */
function resolveSharedSearch(state: GameState): GameState {
  const pre = state.pendingChoice;
  if (pre?.type === "OPTION_CHOICE" && pre.context === "deck-search-mode") {
    state = apply(state, { type: "CHOOSE_OPTION", playerId: pre.playerId, choiceId: pre.id, optionIndex: 0 });
  }
  const search = state.pendingChoice;
  if (search?.type === "DECK_SEARCH") {
    state = apply(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: search.playerId,
      choiceId: search.id,
      pick: { kind: "revealed", index: 0 }
    });
  }
  return state;
}

describe("hex math", () => {
  it("keeps the six neighbours at distance 1 in ring order", () => {
    for (const center of [
      { row: 4, col: 4 },
      { row: 5, col: 4 }
    ]) {
      const neighbors = hexNeighbors(center);
      expect(neighbors).toHaveLength(6);
      for (const neighbor of neighbors) {
        expect(hexDistance(center, neighbor)).toBe(1);
      }
      expect(new Set(neighbors.map(hexSpaceId)).size).toBe(6);
    }
  });

  it("builds 7-hex tile footprints that rotate in place", () => {
    const center = { row: 8, col: 2 };
    const footprint = tileFootprint(center, 0);
    expect(footprint).toHaveLength(7);
    expect(new Set(footprint.map(hexSpaceId)).size).toBe(7);

    const rotated = tileFootprint(center, 2);
    expect(new Set(rotated.map(hexSpaceId))).toEqual(new Set(footprint.map(hexSpaceId)));
    // Rotation by two steps moves slot 1 to where slot 3 was.
    expect(hexSpaceId(rotated[1])).toBe(hexSpaceId(footprint[3]));
  });

  it("maps pixels back to the hex under them (inverse of hexToPixel)", () => {
    const size = 24;
    for (const coord of [
      { row: 0, col: 0 },
      { row: 8, col: 2 },
      { row: 9, col: 4 },
      { row: 5, col: -3 },
      { row: -4, col: 7 }
    ]) {
      // A hex center round-trips exactly, as does any point jittered within it.
      const center = hexToPixel(coord, size);
      expect(pixelToHex(center.x, center.y, size)).toEqual(coord);
      expect(pixelToHex(center.x + size * 0.3, center.y - size * 0.3, size)).toEqual(coord);
    }
  });

  it("treats tiles as gapless neighbours only on the six lattice positions", () => {
    const base = { row: 8, col: 2 };
    // (9,4) is a true gapless neighbour (a center-to-center lattice vector), so
    // the two flowers interlock with no hole.
    expect(tileCentersAdjacent(base, { row: 9, col: 4 })).toBe(true);
    // (8,5) sits at center-distance 3 but off the tiling lattice — it shares an
    // edge yet leaves a field-sized hole, so it is not a valid neighbour.
    expect(tileCentersAdjacent(base, { row: 8, col: 5 })).toBe(false);
    // (8,4) is too close: the footprints would overlap.
    expect(tileCentersAdjacent(base, { row: 8, col: 4 })).toBe(false);
  });

  it("interlocks a flower with its six lattice neighbours into a hole-free block", () => {
    for (const center of [
      { row: 8, col: 2 },
      { row: 7, col: 5 },
      { row: 0, col: 0 },
      { row: -3, col: 4 }
    ]) {
      const neighbors = tileLatticeNeighbors(center);
      expect(neighbors).toHaveLength(6);
      for (const neighbor of neighbors) {
        // Each is a genuine gapless neighbour, never overlapping, all sharing the
        // center's sublattice color.
        expect(tileCentersAdjacent(center, neighbor)).toBe(true);
        expect(tileCentersOverlap(center, neighbor)).toBe(false);
        expect(tileLatticeColor(neighbor)).toBe(tileLatticeColor(center));
      }

      // The 7 flowers cover exactly 49 distinct hexes — 7 per tile, no overlap.
      const covered = new Map<string, number>();
      for (const tile of [center, ...neighbors]) {
        for (const cell of tileFootprint(tile, 0)) {
          covered.set(hexSpaceId(cell), (covered.get(hexSpaceId(cell)) ?? 0) + 1);
        }
      }
      expect(covered.size).toBe(49);
      expect([...covered.values()].every((count) => count === 1)).toBe(true);

      // No empty hex is fully ringed by filled hexes: the block has no hole.
      const filled = new Set(covered.keys());
      for (const cell of filled) {
        for (const ring of hexNeighbors(parseHexSpaceId(cell)!)) {
          if (filled.has(hexSpaceId(ring))) {
            continue;
          }
          const enclosed = hexNeighbors(ring).every((n) => filled.has(hexSpaceId(n)));
          expect(enclosed).toBe(false);
        }
      }
    }
  });
});

describe("adventure setup", () => {
  it("places starting tiles, towns and heroes, and a connected map", () => {
    const state = makeGame();
    const adventure = state.adventure;
    expect(adventure).not.toBeNull();
    if (!adventure) {
      return;
    }

    // 2 starting + 2 near + 1 center tile.
    expect(Object.keys(adventure.tiles)).toHaveLength(5);

    const centers = Object.values(adventure.tiles).map((tile) => ({ row: tile.centerRow, col: tile.centerCol }));
    for (let i = 0; i < centers.length; i += 1) {
      for (let j = i + 1; j < centers.length; j += 1) {
        expect(hexDistance(centers[i], centers[j])).toBeGreaterThanOrEqual(3);
      }
    }

    const hero = state.heroes.hero_p1;
    expect(hero.spaceId).toBeTruthy();
    const heroField = adventure.fields[hero.spaceId ?? ""];
    expect(heroField.location).toBe("town");
    expect(state.towns.town_p1.fieldId).toBe(hero.spaceId);

    // Starting deck: Catherine has 2/2/1/1 stats + magic arrow + ability + specialty.
    const player = state.players.p1;
    expect(player.deck.length + player.hand.length).toBe(9);
    expect(player.limits.hand).toBe(4);
    expect(player.limits.expertUses).toBe(0);
    expect(player.army.length).toBeGreaterThanOrEqual(3);
  });

  it("lays the skirmish scenario on one gapless sublattice for every seat count", () => {
    const scenario = getScenario("skirmish");
    const everyTile = [...scenario.layout.starts, ...scenario.layout.near, ...scenario.layout.center];
    // A single sublattice color across all tiles is what guarantees no holes.
    expect(new Set(everyTile.map((tile) => tileLatticeColor(tile))).size).toBe(1);

    // The always-on tiles (Near + Center), promoted seat-5/6 fillers, and any
    // number of seats stay non-overlapping and connected through gapless
    // neighbours — including the new 5- and 6-player layouts.
    for (const seats of [2, 3, 4, 5, 6]) {
      const promotedFillers = scenario.layout.starts.slice(
        Math.max(seats, scenario.layout.unusedStartsAsNearFrom ?? scenario.layout.starts.length)
      );
      const placed = [
        ...scenario.layout.starts.slice(0, seats),
        ...scenario.layout.near,
        ...promotedFillers,
        ...scenario.layout.center
      ];
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          expect(hexDistance(placed[i], placed[j])).toBeGreaterThanOrEqual(3);
        }
      }
      const seen = new Set([hexSpaceId(placed[0])]);
      const stack = [placed[0]];
      while (stack.length > 0) {
        const current = stack.pop()!;
        for (const other of placed) {
          if (!seen.has(hexSpaceId(other)) && tileCentersAdjacent(current, other)) {
            seen.add(hexSpaceId(other));
            stack.push(other);
          }
        }
      }
      expect(seen.size).toBe(placed.length);
    }
  });

  it("builds six distinct player homes and heroes on the skirmish map", () => {
    const factions = ["castle", "necropolis", "dungeon", "rampart", "inferno", "tower"] as const;
    const state = createAdventureGameState({
      seed: "six-player-skirmish",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: factions.map((factionId, index) => ({
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
        factionId
      }))
    });

    // The neutral combat controller also lives in `state.players`; turn order
    // is the authoritative list of participating seats.
    expect(state.turnOrder).toHaveLength(6);
    expect(Object.keys(state.towns)).toHaveLength(6);
    expect(Object.keys(state.heroes)).toHaveLength(6);
    expect(new Set(Object.values(state.heroes).map((hero) => hero.spaceId)).size).toBe(6);
    expect(Object.values(state.adventure!.tiles).filter((tile) => tile.group === "starting")).toHaveLength(6);
  });

  it("hides face-down tiles and every far tile supply in the player view", () => {
    const state = makeGame();
    const view = getPlayerView(state, "p1");
    const faceDown = Object.values(view.adventure?.tiles ?? {}).filter((tile) => tile.faceDown);
    expect(faceDown.length).toBeGreaterThan(0);
    for (const tile of faceDown) {
      expect(tile.tileDefId).toBe("hidden");
      // The printed back (Ⅳ–Ⅴ / Ⅵ–Ⅶ) stays public information.
      expect(tile.backLabel).toBeTruthy();
    }
    // Far tiles are face down even for their owner: only the Ⅱ–Ⅲ back shows.
    expect(view.adventure?.playerFarTiles.p2.every((tileId) => tileId === "hidden")).toBe(true);
    expect(view.adventure?.playerFarTiles.p1.every((tileId) => tileId === "hidden")).toBe(true);
  });

  it("labels sea tiles by their real Ⅳ–Ⅴ / Ⅵ–Ⅶ guard band", () => {
    // The Cove sea pool ships both bands behind one wave back, so the label
    // must follow the tile's strongest guarded field — otherwise a Ⅵ–Ⅶ sea
    // tile masquerades as Near and never unlocks the BINH Relic/Center rules.
    const adventure = makeGame().adventure!;
    const nearSea = instantiateTile(adventure, "W1", { row: -6, col: -6 }, 0, true);
    const centerSeaW = instantiateTile(adventure, "W7", { row: -6, col: -7 }, 0, true);
    const centerSeaC = instantiateTile(adventure, "#C4", { row: -6, col: -8 }, 0, true);
    expect(nearSea.backLabel).toBe("Ⅳ–Ⅴ");
    expect(centerSeaW.backLabel).toBe("Ⅵ–Ⅶ");
    expect(centerSeaC.backLabel).toBe("Ⅵ–Ⅶ");
  });

  it("labels underground tiles by their Ⅳ–Ⅴ / Ⅵ–Ⅶ guard band (boss tier = U7/#C2/#C3)", () => {
    // The underground pool ships a regular Ⅳ–Ⅴ tier (fields guarded Ⅳ/Ⅴ) and a
    // Ⅵ–Ⅶ boss tier (U7 / #C2 / #C3, centred on a VII guardian). The band
    // follows each tile's strongest guarded field, so a revealed boss reports
    // Ⅵ–Ⅶ and feeds Center-tier deck rules — and its FACE-DOWN back art must
    // show Ⅵ–Ⅶ, never the Ⅳ–Ⅴ cavern numeral (that was the "open IV-V, fight
    // VII" bug).
    const adventure = makeGame().adventure!;
    const regular = instantiateTile(adventure, "U1", { row: -8, col: -8 }, 0, true);
    const bossU = instantiateTile(adventure, "U7", { row: -8, col: -9 }, 0, true);
    const bossC2 = instantiateTile(adventure, "#C2", { row: -8, col: -10 }, 0, true);
    const bossC3 = instantiateTile(adventure, "#C3", { row: -8, col: -11 }, 0, true);
    // Regular underground reports Ⅳ–Ⅴ (NOT Ⅴ–Ⅵ): no underground tile is guarded Ⅵ
    // unless it is one of the three Ⅵ–Ⅶ boss tiles.
    expect(regular.backLabel).toBe("Ⅳ–Ⅴ");
    expect(bossU.backLabel).toBe("Ⅵ–Ⅶ");
    expect(bossC2.backLabel).toBe("Ⅵ–Ⅶ");
    expect(bossC3.backLabel).toBe("Ⅵ–Ⅶ");

    // Face-down art must match the band: boss back ≠ regular IV-V back.
    const regularBack = tileBackImage(regular.group, regular.backLabel);
    const bossBack = tileBackImage(bossU.group, bossU.backLabel);
    expect(regularBack).toContain("back-subterranean.webp");
    expect(bossBack).toContain("back-subterranean-vi-vii.webp");
    expect(bossBack).not.toBe(regularBack);
    // CONTROL: a VI-VII sea tile likewise does not wear the IV-V wave back.
    expect(tileBackImage("sea", "Ⅵ–Ⅶ")).toContain("back-sea-vi-vii.webp");
    expect(tileBackImage("sea", "Ⅳ–Ⅴ")).toContain("back-sea.webp");

    // Mutation control: the classifier splits exactly the three VII-centre tiles
    // into the boss band and every other underground tile into the regular band.
    // No IV-V tile may carry a VI+ field (VII must never appear under an IV-V band).
    const sub = Object.values(allTileDefinitions).filter((tile) => tile.group === "subterranean");
    const boss = sub.filter((tile) => subterraneanTileBand(tile) === "vi-vii").map((tile) => tile.id).sort();
    expect(boss).toEqual(["#C2", "#C3", "U7"]);
    expect(sub.filter((tile) => subterraneanTileBand(tile) === "iv-v")).toHaveLength(sub.length - 3);
    for (const tile of sub) {
      if (subterraneanTileBand(tile) === "iv-v") {
        const max = tile.fields.reduce((m, f) => Math.max(m, f.difficulty ?? 0), 0);
        expect(max, `${tile.id} is IV-V but has difficulty ${max}`).toBeLessThan(6);
      }
    }
  });

  it("gives each player a face-down Ⅱ–Ⅲ supply of UNOPENED markers, drawn at the flip", () => {
    // The supply no longer pre-decides tiles: each player holds opaque UNOPENED
    // markers, and a truly-random tile is drawn from the shared far pool only when
    // they actually open one (see far-tile-flip.test.ts for that mechanic and the
    // settlement guarantee). The pool is parked on the adventure for those draws.
    const state = makeGame();
    for (const playerId of ["p1", "p2"]) {
      const supply = state.adventure?.playerFarTiles[playerId] ?? [];
      expect(supply).toHaveLength(2);
      expect(supply.every((marker) => marker === "?")).toBe(true);
      expect(state.adventure?.farTilesOpenedByPlayer?.[playerId]).toBe(0);
    }
    expect((state.adventure?.farTilePool ?? []).length).toBeGreaterThan(0);
    // Every pooled tile is a real Far (Ⅱ–Ⅲ) definition (full catalog, all sets).
    for (const tileDefId of state.adventure?.farTilePool ?? []) {
      expect(allTileDefinitions[tileDefId]?.group).toBe("far");
    }
  });

  it("gives every player no Ⅱ–Ⅲ supply when Far-tile opening is off, but two when on", () => {
    // Off: the supply stays empty so there is nothing for players to open
    // (use it when the map already includes its Ⅱ–Ⅲ tiles).
    const off = createAdventureGameState({ startingBuildings: [],
      seed: "test-seed",
      difficulty: "normal",
      rollFirstPlayer: false,
      farTileOpening: false
    });
    for (const playerId of ["p1", "p2"]) {
      expect(off.adventure?.playerFarTiles[playerId]).toEqual([]);
    }

    // On (explicit) and the default both draft the usual two tiles per player.
    const on = createAdventureGameState({ startingBuildings: [],
      seed: "test-seed",
      difficulty: "normal",
      rollFirstPlayer: false,
      farTileOpening: true
    });
    const byDefault = createAdventureGameState({ startingBuildings: [], seed: "test-seed", difficulty: "normal", rollFirstPlayer: false });
    for (const playerId of ["p1", "p2"]) {
      expect(on.adventure?.playerFarTiles[playerId]).toHaveLength(2);
      expect(byDefault.adventure?.playerFarTiles[playerId]).toHaveLength(2);
    }
  });
});

describe("turns and movement", () => {
  // Advances to p1's SECOND turn, pinning a no-op Astrologers event so the
  // round-2 wrap raises no choice.
  function toP1SecondTurn(state: GameState): GameState {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
    // Clear the R1 hand gate (fill + optional opening Mulligan) so END_TURN is
    // never blocked by canOpeningMulligan.
    state = refreshP1(state);
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    if (state.players.p2.canMulligan || state.players.p2.canOpeningMulligan) {
      if (state.players.p2.canMulligan) {
        state = apply(state, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
      }
      if (state.players.p2.canOpeningMulligan) {
        state = apply(state, { type: "OPENING_HAND_MULLIGAN", playerId: "p2", discardCardIds: [] });
      }
    }
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    return state;
  }

  it("deals empty personal-discard starting hands and seeds each shared discard with one card", () => {
    const state = makeGame();
    // Both players hold their starting hand from the first moment.
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.players.p2.hand).toHaveLength(4);
    // Personal discard piles start empty…
    expect(state.players.p1.discard).toHaveLength(0);
    expect(state.players.p2.discard).toHaveLength(0);
    // …but every SHARED deck (Abilities, Spells, Artifacts + split variants) flips
    // one card face-up onto its discard pile from round 1 (first-round rule);
    // non-shared decks (Neutral tiers, Astrologers, Events, Morale) do not.
    for (const [deckId, deck] of Object.entries(state.decks)) {
      const expected = isSharedDeckId(deckId) ? 1 : 0;
      expect(deck.discardPile, `${deckId} discard pile`).toHaveLength(expected);
    }
    // The start-of-turn draw is offered (not forced) from the very first turn,
    // and the hand is not over the limit, so no forced discard is pending.
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p1.needsHandRefresh).toBe(false);
  });

  it("offers discard-and-draw on the first turn without blocking play", () => {
    let state = makeGame();
    expect(state.players.p1.canMulligan).toBe(true);

    // Round 1 full hand: fill first, then OPENING_HAND_MULLIGAN dumps cards.
    const tossed = state.players.p1.hand[0];
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(state.players.p1.canOpeningMulligan).toBe(true);
    state = apply(state, {
      type: "OPENING_HAND_MULLIGAN",
      playerId: "p1",
      discardCardIds: [tossed]
    });
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.players.p1.hand).not.toContain(tossed);
    // First-round rule: the discarded card returns to the player's own deck (its
    // bottom), NOT to the discard pile.
    expect(state.players.p1.discard).toEqual([]);
    expect(state.players.p1.deck).toContain(tossed);
    // The draw is once per turn — a second fill is rejected.
    expect(state.players.p1.canMulligan).toBe(false);
    const again = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(again.errors).toHaveLength(1);
  });

  it("requires the first-turn player to take the draw before moving (it is mandatory)", () => {
    let state = makeGame();
    expect(state.players.p1.canMulligan).toBe(true);
    // Acting without drawing is now BLOCKED — the draw must come first.
    const blocked = applyAction(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:3" });
    expect(blocked.errors.length).toBeGreaterThan(0);
    expect(blocked.state.heroes.hero_p1.spaceId).not.toBe("h:8:3");
    // Take the mandatory fill + keep opening Mulligan, and the move goes through.
    state = refreshP1(state);
    expect(state.players.p1.canMulligan).toBe(false);
    expect(state.players.p1.canOpeningMulligan).toBeFalsy();
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:3" });
    expect(state.heroes.hero_p1.spaceId).toBe("h:8:3");
  });

  it("offers the start-of-turn draw to BOTH players on their own turns", () => {
    let state = makeGame();
    expect(state.players.p1.canMulligan).toBe(true);
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    // p2's turn: p2 may now discard and draw too.
    expect(state.activePlayerId).toBe("p2");
    expect(state.players.p2.canMulligan).toBe(true);
    const tossed = state.players.p2.hand[0];
    state = apply(state, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] });
    expect(state.players.p2.canOpeningMulligan).toBe(true);
    state = apply(state, {
      type: "OPENING_HAND_MULLIGAN",
      playerId: "p2",
      discardCardIds: [tossed]
    });
    // First-round rule: the discard returns to the player's own deck, not the pile.
    expect(state.players.p2.discard).toEqual([]);
    expect(state.players.p2.deck).toContain(tossed);
    expect(state.players.p2.hand).toHaveLength(4);
  });

  it("draws up to the hand limit (draw new), never auto-refilling and never both", () => {
    let state = toP1SecondTurn(makeGame());
    // No auto-draw: a below-limit hand stays below the limit until the player
    // chooses to draw.
    state.players.p1.hand = state.players.p1.hand.slice(0, 2);
    expect(state.players.p1.canMulligan).toBe(true);
    const deckBefore = state.players.p1.deck.length;

    // "Draw new": discard nothing, draw back UP TO the limit (two cards here) —
    // not a draw-as-many-as-you-discard mulligan, and not stacked on an
    // auto-draw.
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.players.p1.discard).toHaveLength(0);
    expect(state.players.p1.deck.length).toBe(deckBefore - 2);
    expect(state.players.p1.canMulligan).toBe(false);
  });

  it("discards first, then draws back up to the limit (discard and draw new)", () => {
    let state = toP1SecondTurn(makeGame());
    state.players.p1.hand = state.players.p1.hand.slice(0, 2);
    const tossed = state.players.p1.hand[0];

    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [tossed] });
    // Discarded one (1 left), then drew back up to the limit of 4 — three cards,
    // not "one drawn per one discarded".
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.players.p1.hand).not.toContain(tossed);
    expect(state.players.p1.discard).toEqual([tossed]);
  });

  it("forces a discard down to the limit before acting when the hand is over it", () => {
    // Stuff p1's hand over the limit, then let a fresh turn start re-derive the
    // forced-discard flag the way startPlayerTurn does.
    let state = makeGame();
    state.players.p1.hand = [...state.players.p1.hand, state.players.p1.deck[0]];
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.players.p1.hand.length).toBeGreaterThan(state.players.p1.limits.hand);
    expect(state.players.p1.needsHandRefresh).toBe(true);

    // Acting before discarding down is rejected.
    const blocked = applyAction(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:3" });
    expect(blocked.errors).toHaveLength(1);

    // Discarding down to the limit resolves the step (and draws 0 more).
    state = apply(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: state.players.p1.hand.slice(0, state.players.p1.hand.length - 4)
    });
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.players.p1.needsHandRefresh).toBe(false);
  });

  it("moves one field for 1 MP and visits resource fields with a die roll", () => {
    let state = refreshP1(makeGame());
    const heroSpace = state.heroes.hero_p1.spaceId ?? "";
    // S3 town at (8,2): the E ring hex (8,3) is the Resources field.
    const target = "h:8:3";
    const before = state.players.p1.resources;
    const totalBefore = before.gold + before.buildingMaterials + before.valuables;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: target });
    expect(state.heroes.hero_p1.spaceId).toBe(target);
    expect(state.heroes.hero_p1.movementPoints).toBe(2);

    const after = state.players.p1.resources;
    const totalAfter = after.gold + after.buildingMaterials + after.valuables;
    expect(totalAfter).toBeGreaterThan(totalBefore);
    expect(state.adventure?.fields[target].blackCube).toBe(true);

    // Re-entering a used visitable field does nothing further.
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: heroSpace });
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: target });
    expect(state.heroes.hero_p1.movementPoints).toBe(0);
  });

  it("rejects moves into blocked fields and through sealed outer edges", () => {
    const state = refreshP1(makeGame());
    // S3 NW ring hex (7,1) is the blocked field.
    const result = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: "h:7:1"
    });
    expect(result.errors).toHaveLength(1);
  });

  it("advances rounds, refreshes tokens, and pays income on resource rounds", () => {
    let state = refreshP1(makeGame());
    state.players.p1.production.gold = 3;
    state.players.p1.townTokens.build = false;
    // Keep the Astrologers draw inert for this test.
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");

    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    const goldBefore = state.players.p1.resources.gold;
    state = apply(state, { type: "END_TURN", playerId: "p2" });

    // Round 2 is an Astrologers round: tokens refresh, a card is drawn,
    // and no income is paid.
    expect(state.round).toBe(2);
    expect(state.players.p1.townTokens.build).toBe(true);
    expect(state.players.p1.resources.gold).toBe(goldBefore);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.dead_silence");
    expect(state.eventLog.some((event) => event.type === "ASTROLOGERS_DRAWN")).toBe(true);

    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" });

    // Round 3 is a Resource round: production pays out.
    expect(state.round).toBe(3);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
  });

  it("walks a multi-step path with MOVE_HERO_PATH, stopping at the destination", () => {
    let state = refreshP1(makeGame());
    const before = state.players.p1.resources;
    const totalBefore = before.gold + before.buildingMaterials + before.valuables;

    // S3 town (8,2) -> empty NE field (7,2) -> Resources field (8,3).
    state = apply(state, {
      type: "MOVE_HERO_PATH",
      playerId: "p1",
      heroId: "hero_p1",
      path: ["h:7:2", "h:8:3"]
    });

    expect(state.heroes.hero_p1.spaceId).toBe("h:8:3");
    expect(state.heroes.hero_p1.movementPoints).toBe(1);
    const after = state.players.p1.resources;
    expect(after.gold + after.buildingMaterials + after.valuables).toBeGreaterThan(totalBefore);
  });

  it("rejects paths that cross a stopping field midway", () => {
    const state = makeGame();
    // (8,3) is an unvisited Resources field: it stops the hero, so it cannot
    // be crossed on the way to (7,2)... build the reverse path to prove it.
    const result = applyAction(state, {
      type: "MOVE_HERO_PATH",
      playerId: "p1",
      heroId: "hero_p1",
      path: ["h:8:3", "h:7:2"]
    });
    expect(result.errors).toHaveLength(1);
  });
});

describe("astrologers rounds", () => {
  function passRound(state: GameState): GameState {
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    return apply(state, { type: "END_TURN", playerId: "p2" });
  }

  it("gold dragon pays all players 5 extra gold on the next resource round", () => {
    let state = makeGame();
    state.decks.astrologers.drawPile.push("astrologers.gold_dragon");
    state.players.p1.production.gold = 2;
    const enemyIncome = state.players.p2.production.gold;

    state = passRound(state); // round 2: draws Gold Dragon
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.gold_dragon");
    const goldBefore = state.players.p1.resources.gold;
    const enemyGoldBefore = state.players.p2.resources.gold;

    state = passRound(state); // round 3: resource round
    expect(state.players.p1.resources.gold).toBe(goldBefore + 2 + 5);
    expect(state.players.p2.resources.gold).toBe(enemyGoldBefore + enemyIncome + 5);
    // The bonus is one-shot.
    expect(state.adventure?.astrologers?.nextResourceModifiers.gold).toBe(0);
  });

  it("battalion's stallion grants +1 movement until the next astrologers round", () => {
    let state = makeGame();
    state.decks.astrologers.drawPile.push("astrologers.dead_silence", "astrologers.battalions_stallion");

    state = passRound(state); // round 2: Stallion
    expect(state.heroes.hero_p1.movementPoints).toBe(4);

    state = passRound(state); // round 3: still active through the resource round
    expect(state.heroes.hero_p1.movementPoints).toBe(4);

    state = passRound(state); // round 4: replaced by Dead Silence
    expect(state.heroes.hero_p1.movementPoints).toBe(3);
    expect(state.decks.astrologers.discardPile).toContain("astrologers.battalions_stallion");
  });

  it("fancy pixie hands out morale, ignoring Necropolis", () => {
    let state = makeGame();
    state.decks.astrologers.drawPile.push("astrologers.fancy_pixie");

    state = passRound(state);
    expect(state.players.p1.morale).toBe(1);
    // Sandro's Necropolis ignores all morale effects.
    expect(state.players.p2.morale).toBe(0);
  });

  it("society inflicts 1 negative morale on every player, still ignoring Necropolis", () => {
    let state = makeGame();
    state.decks.astrologers.drawPile.push("astrologers.society");

    state = passRound(state);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.society");
    expect(state.players.p1.morale).toBe(-1);
    // Sandro's Necropolis ignores all morale effects, good and bad.
    expect(state.players.p2.morale).toBe(0);
  });

  it("big cleanup discards each player's whole hand and redraws the same number", () => {
    const state = makeGame();
    // Pin a known hand and deck so the redraw is deterministic (pop draws the tail).
    state.players.p1.hand = ["stat.attack", "stat.power"];
    state.players.p1.deck = [...state.players.p1.deck, "stat.knowledge", "stat.defense"];
    state.players.p1.discard = [];
    const expectedRedraw = state.players.p1.deck.slice(-2).reverse(); // pop order
    state.decks.astrologers.drawPile = ["astrologers.big_cleanup"];

    drawAstrologersCard(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.big_cleanup");
    // Same count, the old hand is now in the discard, and the redraw came off the deck.
    expect(state.players.p1.hand).toHaveLength(2);
    expect(state.players.p1.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.power"]));
    expect(state.players.p1.hand).toEqual(expectedRedraw);
  });
});

describe("morale actions", () => {
  it("spends the token to discard any number of cards and draw that many", () => {
    let state = makeGame();
    state.players.p1.morale = 1;
    const discards = state.players.p1.hand.slice(0, 3);

    state = apply(state, {
      type: "SPEND_MORALE",
      playerId: "p1",
      benefit: "redraw",
      discardCardIds: discards
    });

    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.players.p1.discard).toHaveLength(3);
  });

  it("does not stack past the +1 cap: extra gains become overflow tokens to spend", () => {
    const state = makeGame();
    state.players.p1.morale = 1;

    changeMorale(state, "p1", 1);
    // The stored token stays capped at +1; the extra is held as overflow.
    expect(state.players.p1.morale).toBe(1);
    expect(state.players.p1.moraleOverflow).toBe(1);

    // The spend actions are offered for the overflow even at the cap.
    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels).toContain("Spend morale: draw a card");
  });

  it("spends the overflow token first, leaving the stored +1 token intact", () => {
    let state = makeGame();
    state.players.p1.morale = 1;
    state.players.p1.moraleOverflow = 1;
    const handBefore = state.players.p1.hand.length;

    state = apply(state, { type: "SPEND_MORALE", playerId: "p1", benefit: "draw" });

    expect(state.players.p1.moraleOverflow).toBe(0);
    expect(state.players.p1.morale).toBe(1); // stored token untouched
    expect(state.players.p1.hand.length).toBe(handBefore + 1);

    // The stored token can then still be spent normally.
    state = apply(state, { type: "SPEND_MORALE", playerId: "p1", benefit: "draw" });
    expect(state.players.p1.morale).toBe(0);
  });

  it("offers the token's draw / discard-redraw even when the player owns no Town", () => {
    const state = makeGame();
    state.players.p1.morale = 1;
    // A player who has lost their Town still holds the morale token and may
    // spend it for a draw — the use is not gated on standing at a Town.
    for (const town of Object.values(state.towns)) {
      if (town.controllerId === "p1") {
        town.controllerId = NEUTRAL_PLAYER_ID;
      }
    }

    const labels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(labels).toContain("Spend morale: draw a card");
    expect(labels.some((label) => label.includes("discard any cards"))).toBe(true);
  });

  it("offers a morale reroll when an adventure die is rolled", () => {
    let state = refreshP1(makeGame());
    state.players.p1.morale = 1;

    // Walking onto the Resources field rolls the Resource die; with a morale
    // token in stock the engine must offer the reroll instead of auto-gaining.
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:3" });
    const visit = state.adventure?.pendingVisit;
    expect(visit).toBeTruthy();
    const step = visit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type === "CHOOSE_ONE") {
      expect(step.options.some((option) => option.label.includes("morale"))).toBe(true);
    }

    // Taking the reroll spends the token and rerolls the die.
    const actions = getLegalActions(state, "p1");
    const reroll = actions.find((legal) => legal.label.includes("morale"));
    expect(reroll).toBeTruthy();
    state = apply(state, reroll!.action);
    expect(state.players.p1.morale).toBe(0);
  });
});

describe("tile discovery and placement", () => {
  it("reveals a face-down tile, then the player rotates it before it lands", () => {
    const state = refreshP1(makeGame());
    // Stand on (10,6) — S1 slot 5, an OPEN-border ring field that touches the
    // face-down Center hub at (9,4) across an unsealed edge. Ordinary discovery
    // needs that open border; placing/standing is set directly so the reveal
    // mechanics are exercised without walking through guarded fields.
    state.heroes.hero_p1.spaceId = "h:10:6";
    state.heroes.hero_p1.movementPoints = 3;
    const tile = Object.values(state.adventure!.tiles).find(
      (candidate) => candidate.centerRow === 9 && candidate.centerCol === 4
    );
    expect(tile?.faceDown).toBe(true);

    let next = apply(state, { type: "DISCOVER_TILE", playerId: "p1", heroId: "hero_p1", tileInstanceId: tile!.id });
    expect(next.heroes.hero_p1.movementPoints).toBe(2);
    const revealed = next.adventure!.tiles[tile!.id];
    expect(revealed.faceDown).toBe(false);
    expect(revealed.awaitingRotation).toBe(true);
    // Fields are not on the map until the rotation locks in.
    expect(next.adventure!.fields["h:9:4"]).toBeUndefined();

    // Other actions are blocked while the rotation is pending.
    const blocked = applyAction(next, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:10:5" });
    expect(blocked.errors).toHaveLength(1);

    const rotations = getLegalActions(next, "p1").filter((legal) => legal.action.type === "SET_TILE_ROTATION");
    expect(rotations.length).toBeGreaterThan(0);
    next = apply(next, rotations[0].action);

    expect(next.adventure!.tiles[tile!.id].awaitingRotation).toBe(false);
    expect(next.adventure!.fields["h:9:4"]).toBeTruthy();
  });

  it("Legacy toggle off: adjacency alone lets a hero discover across a sealed yellow border", () => {
    // Official rules "only require your hero to be adjacent to the discovered
    // tile … There is no mention of blockers or yellow borders." (8,3) sits behind
    // a printed yellow arc facing the face-down hub at (9,4) — the very vantage
    // the house-rule case below refuses — and here the reveal simply works.
    const state = refreshP1(
      createAdventureGameState({
        startingBuildings: [],
        seed: "test-seed",
        difficulty: "normal",
        ruleset: "legacy",
        rollFirstPlayer: false,
        events: false,
        houseRules: { "discovery-border-gate": false }
      })
    );
    state.heroes.hero_p1.spaceId = "h:8:3";
    state.heroes.hero_p1.movementPoints = 3;
    const tile = Object.values(state.adventure!.tiles).find(
      (candidate) => candidate.centerRow === 9 && candidate.centerCol === 4
    )!;
    expect(tile.faceDown).toBe(true);

    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === tile.id
    );
    expect(offered).toBe(true);

    const next = apply(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: tile.id
    });
    expect(next.adventure!.tiles[tile.id].faceDown).toBe(false);
    expect(next.heroes.hero_p1.movementPoints).toBe(2);
    // Movement is UNAFFECTED: the border still seals the step across it.
    expect(canCrossEdge(next, "h:8:3", "h:9:4")).toBe(false);
  });

  it("HOUSE RULE ON: refuses ordinary discovery across a sealed yellow border (edge/border gate)", () => {
    const state = refreshP1(makeBorderGateGame());
    // (8,3) is S3 slot 2 — geometrically adjacent to the same face-down hub at
    // (9,4), but its outer arc toward the hub is a printed yellow line. A hero
    // standing behind that border cannot reveal across it on its own turn; only
    // a Redwood Observatory / Speculum ignores borders. This is exactly the
    // "border and edge interaction" the ordinary action requires.
    state.heroes.hero_p1.spaceId = "h:8:3";
    state.heroes.hero_p1.movementPoints = 3;
    const tile = Object.values(state.adventure!.tiles).find(
      (candidate) => candidate.centerRow === 9 && candidate.centerCol === 4
    );
    expect(tile?.faceDown).toBe(true);

    // The action is not even offered…
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === tile!.id
    );
    expect(offered).toBe(false);

    // …and is rejected if attempted directly, with the movement point untouched.
    const result = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: tile!.id
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("yellow border");
    expect(result.state.heroes.hero_p1.movementPoints).toBe(3);
    expect(result.state.adventure!.tiles[tile!.id].faceDown).toBe(true);
  });

  it("HOUSE RULE ON: lets a hero standing on a (border-free) Creature Bank discover across that edge", () => {
    // Same vantage as the sealed-border test: h:8:3 is S3 slot 2, whose outer arc
    // toward the face-down hub at (9,4) is a printed yellow line — so an ordinary
    // Location there cannot discover across it (that's the CONTROL above). But a
    // Creature Bank draws NO border ("reads as fully open"), so a hero standing on
    // one faces an OPEN edge and MAY flip the adjacent Tile. Carving a bank into
    // that very field is the only change, isolating the bank as the cause.
    const state = refreshP1(makeBorderGateGame());
    state.heroes.hero_p1.spaceId = "h:8:3";
    state.heroes.hero_p1.movementPoints = 3;
    const tile = Object.values(state.adventure!.tiles).find(
      (candidate) => candidate.centerRow === 9 && candidate.centerCol === 4
    )!;
    expect(tile.faceDown).toBe(true);

    // Guard the assumption: as a plain (sealed) field the reveal is refused.
    const sealed = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: tile.id
    });
    expect(sealed.errors).toHaveLength(1);
    expect(sealed.state.adventure!.tiles[tile.id].faceDown).toBe(true);

    // Now carve a Creature Bank into h:8:3 — the border is gone, the edge opens.
    expect(placeCreatureBank(state, "h:8:3", "crypt")).not.toBeNull();
    expect(state.adventure!.fields["h:8:3"].location).toBe("creature_bank");

    // The action is now offered…
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "DISCOVER_TILE" && legal.action.tileInstanceId === tile.id
    );
    expect(offered).toBe(true);

    // …and succeeds: the tile flips face-up (awaiting the rotation), MP spent.
    const next = apply(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: tile.id
    });
    expect(next.adventure!.tiles[tile.id].faceDown).toBe(false);
    expect(next.adventure!.tiles[tile.id].awaitingRotation).toBe(true);
    expect(next.heroes.hero_p1.movementPoints).toBe(2);
  });

  it("places a far tile at the border for 1 MP, touching two tiles, then rotates it", () => {
    const state = refreshP1(makeGame());
    // Stand on the seat-0 town-flower hex (7,2), which borders the empty notch
    // at (6,4) — a gapless slot bordering the seat-0 town, the hub and a Near
    // tile (>=2 tiles), so it is a legal placement that leaves no hole.
    state.heroes.hero_p1.spaceId = "h:7:2";
    state.heroes.hero_p1.movementPoints = 3;

    const supplyBefore = state.adventure!.playerFarTiles.p1.length;
    expect(supplyBefore).toBe(2);

    let next = apply(state, {
      type: "PLACE_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      supplyIndex: 0,
      centerRow: 6,
      centerCol: 4
    });

    expect(next.adventure!.playerFarTiles.p1).toHaveLength(supplyBefore - 1);
    expect(next.heroes.hero_p1.movementPoints).toBe(2);

    // A Far flip may open keep/reroll/pick choices before rotation; drain them.
    for (let guard = 0; guard < 8 && next.pendingChoice?.type === "OPTION_CHOICE"; guard += 1) {
      const choice = next.pendingChoice;
      next = apply(next, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: choice.id,
        optionIndex: 0
      });
    }
    expect(next.adventure!.pendingTileChoice?.kind).toBe("place");

    const rotations = getLegalActions(next, "p1").filter((legal) => legal.action.type === "SET_TILE_ROTATION");
    expect(rotations.length).toBeGreaterThan(0);
    next = apply(next, rotations[0].action);
    expect(next.adventure!.fields["h:6:4"]).toBeTruthy();
  });

  it("rejects placements that do not touch two tiles or sit away from the hero", () => {
    const state = makeGame();
    // (2,20) is off the lattice, touches nothing and is nowhere near the hero.
    const result = applyAction(state, {
      type: "PLACE_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      supplyIndex: 0,
      centerRow: 2,
      centerCol: 20
    });
    expect(result.errors).toHaveLength(1);
  });

  it("offers every far-tile rotation (seal gate OFF) and Confirm accepts a sealed orientation", () => {
    const state = refreshP1(makeGame());
    // The hero stands on h:8:1 — an OPEN-border S3 field directly bordering the
    // (10,0) notch. At this slot some F1 rotations turn a yellow arc back toward
    // the hero (geometry still has sealed vs open doorways) — but with
    // TILE_ROTATION_SEAL_GATE_ENABLED = false every orientation is offered and
    // Confirmable. Movement sealing after materialize is unchanged.
    state.heroes.hero_p1.spaceId = "h:8:1";
    state.heroes.hero_p1.movementPoints = 3;
    state.adventure!.farTileScriptedDraws = ["F1"];
    const tileDefId = "F1";
    const center = { row: 10, col: 0 };

    const next = apply(state, {
      type: "PLACE_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      supplyIndex: 0,
      centerRow: 10,
      centerCol: 0
    });

    expect(next.adventure!.pendingTileChoice?.heroId).toBe("hero_p1");

    const hero = next.heroes.hero_p1;
    const offered = getLegalActions(next, "p1")
      .filter((legal): legal is typeof legal & { action: { type: "SET_TILE_ROTATION"; rotation: number } } =>
        legal.action.type === "SET_TILE_ROTATION"
      )
      .map((legal) => legal.action.rotation);
    // Gate off → all six rotations are legal.
    expect(offered.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);

    // Geometry still has at least one sealed doorway orientation (the pure helper
    // is live; only the hard reject is disabled).
    const reach = [0, 1, 2, 3, 4, 5].map((rotation) => canHeroReachPlacedTile(next, hero, tileDefId, center, rotation));
    expect(reach.some((value) => value)).toBe(true);
    expect(reach.some((value) => !value)).toBe(true);

    // A previously-sealed orientation confirms and materializes.
    const sealedRotation = reach.findIndex((value) => !value);
    const tileInstanceId = next.adventure!.pendingTileChoice!.tileInstanceId;
    const confirmed = apply(next, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId,
      rotation: sealedRotation
    });
    expect(confirmed.adventure!.tiles[tileInstanceId].awaitingRotation).toBe(false);
    expect(confirmed.adventure!.tiles[tileInstanceId].rotation).toBe(sealedRotation);
  });

  it("reports a hero cannot cross to a disconnected area", () => {
    const state = makeGame();
    state.heroes.hero_p1.spaceId = "h:7:2";
    // A real Ⅱ–Ⅲ tile def (the supply slots are now opaque UNOPENED markers): a
    // center far off in empty space shares no crossable edge with the hero.
    const tileDefId = "F1";
    expect(canHeroReachPlacedTile(state, state.heroes.hero_p1, tileDefId, { row: 50, col: 50 }, 0)).toBe(false);
  });

  it("HOUSE RULE ON: rejects far-tile placement at a position sealed off from the hero by a yellow border (regression)", () => {
    const state = refreshP1(makeBorderGateGame());
    // h:8:3 is S3 slot 2 — its outer arc toward the hub at (9,4) is a printed
    // yellow border. No rotation of any tile placed at (9,4) is reachable from
    // here: the BFS can traverse within S3 to its two open slots (7,2) and (8,1)
    // but neither borders any hub footprint cell.
    state.heroes.hero_p1.spaceId = "h:8:3";
    state.heroes.hero_p1.movementPoints = 5;

    // Remove the face-down center tile at (9,4) so the slot is free to use.
    // Face-down tiles carry no materialized fields, so no fields need deleting.
    const hubEntry = Object.entries(state.adventure!.tiles).find(
      ([, t]) => t.centerRow === 9 && t.centerCol === 4
    )!;
    delete state.adventure!.tiles[hubEntry[0]];

    // canHeroReachPlacementCenter must return false for (9,4) from (8,3) — sealed.
    expect(canHeroReachPlacementCenter(state, state.heroes.hero_p1, { row: 9, col: 4 })).toBe(false);
    // Control: from h:10:6 (S1 slot 5, outer arc OPEN, directly borders the hub
    // footprint at (10,5)) the function must return true.
    const heroControl = { ...state.heroes.hero_p1, spaceId: "h:10:6" as const };
    expect(canHeroReachPlacementCenter(state, heroControl, { row: 9, col: 4 })).toBe(true);

    // PRIMARY FIX: PLACE_TILE at (9,4) is rejected without spending MP.
    const mpBefore = state.heroes.hero_p1.movementPoints;
    const placeResult = applyAction(state, {
      type: "PLACE_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      supplyIndex: 0,
      centerRow: 9,
      centerCol: 4
    });
    expect(placeResult.errors).toHaveLength(1);
    expect(placeResult.errors[0].message).toContain("yellow border");
    expect(placeResult.state.heroes.hero_p1.movementPoints).toBe(mpBefore);

    // Pure doorway helper still reports every rotation of F1 at (9,4) unreachable
    // from h:8:3 (placement stay-out is the real guard now; rotation Confirm is
    // free while TILE_ROTATION_SEAL_GATE_ENABLED is off).
    const reachable = [0, 1, 2, 3, 4, 5].map((r) =>
      canHeroReachPlacedTile(state, state.heroes.hero_p1, "F1", { row: 9, col: 4 }, r)
    );
    expect(reachable.every((v) => !v)).toBe(true);

    // Manually plant an F1 tile at (9,4) in pendingTileChoice state — rotation
    // Confirm is free (seal gate OFF); the tile materializes at the chosen angle.
    const tile = instantiateTile(state.adventure!, "F1", { row: 9, col: 4 }, 0, false, { materialize: false });
    tile.awaitingRotation = true;
    state.adventure!.pendingTileChoice = {
      tileInstanceId: tile.id,
      playerId: "p1",
      kind: "place",
      heroId: "hero_p1"
    };
    const rotResult = applyAction(state, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: tile.id,
      rotation: 0
    });
    expect(rotResult.errors, "seal gate OFF → Confirm accepts any rotation").toHaveLength(0);
    expect(rotResult.state.adventure!.tiles[tile.id].awaitingRotation).toBe(false);
  });
});

describe("map setup lobby", () => {
  it("opens and starts a complete six-player skirmish lobby", () => {
    let state = createAdventureLobbyState({
      seed: "six-player-lobby",
      scenarioId: "skirmish",
      playerCount: 6
    });
    expect(state.setupLobby?.seats).toHaveLength(6);

    const picks = [
      ["castle", "catherine"],
      ["necropolis", "sandro"],
      ["dungeon", "mutare"],
      ["rampart", "gelu"],
      ["inferno", "xyron"],
      ["tower", "solmyr"]
    ] as const;
    for (const [index, [factionId, heroDefId]] of picks.entries()) {
      state = apply(state, {
        type: "CHOOSE_FACTION",
        playerId: `p${index + 1}`,
        factionId,
        heroDefId
      });
    }
    state = apply(state, { type: "START_ADVENTURE", playerId: "p1" });

    expect(state.turnOrder).toHaveLength(6);
    expect(Object.keys(state.towns)).toHaveLength(6);
    expect(Object.keys(state.heroes)).toHaveLength(6);
  });

  it("collects faction picks, then builds the scenario map", () => {
    let state = createAdventureLobbyState({ seed: "lobby-seed" });
    expect(state.phase).toBe("setup");
    expect(state.adventure).toBeNull();

    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    // Starting before everyone picked is rejected.
    const early = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(early.errors).toHaveLength(1);

    // A taken faction cannot be claimed twice.
    const dupe = applyAction(state, {
      type: "CHOOSE_FACTION",
      playerId: "p2",
      factionId: "castle",
      heroDefId: "rion"
    });
    expect(dupe.errors).toHaveLength(1);

    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "inferno", heroDefId: "xyron" });
    state = apply(state, { type: "START_ADVENTURE", playerId: "p2" });

    expect(state.phase).toBe("player-turn");
    expect(state.setupLobby).toBeNull();
    expect(state.adventure).not.toBeNull();
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.towns.town_p2.factionId).toBe("inferno");
    // Scenario resources applied per the sheet.
    expect(state.players.p1.resources.gold).toBe(10);
    // Setup defaults: Impossible neutrals, base income 10 gold / 2 materials / 1 valuables.
    expect(state.adventure?.difficulty).toBe("impossible");
    expect(state.players.p1.production).toEqual({ gold: 10, buildingMaterials: 2, valuables: 1 });
  });

  it("rolls for the starting player before any starting hand is dealt", () => {
    let state = createAdventureLobbyState({ seed: "first-player-order" });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "inferno", heroDefId: "xyron" });
    state = apply(state, { type: "START_ADVENTURE", playerId: "p1" });

    const firstRollAt = state.eventLog.findIndex((event) => event.type === "FIRST_PLAYER_ROLLED");
    const firstDrawAt = state.eventLog.findIndex((event) => event.type === "CARDS_DRAWN");
    // The opening ceremony leads the game: the roll is logged before the deal.
    expect(firstRollAt).toBeGreaterThanOrEqual(0);
    expect(firstDrawAt).toBeGreaterThanOrEqual(0);
    expect(firstRollAt).toBeLessThan(firstDrawAt);
    // The deal still happens — every seat opens with a full starting hand.
    expect(state.players.p1.hand).toHaveLength(4);
    expect(state.players.p2.hand).toHaveLength(4);
  });

  it("lets seats adjust difficulty, resources, income, starting units and buildings before the start", () => {
    let state = createAdventureLobbyState({ seed: "lobby-seed" });
    expect(state.setupLobby?.options.difficulty).toBe("impossible");

    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        difficulty: "hard",
        startingResources: { gold: 20, buildingMaterials: 6, valuables: 3 },
        startingProduction: { gold: 12, buildingMaterials: 1, valuables: 0 },
        // Merged starting-units mode: one few/pack pick per unit level 1-7.
        startingUnits: [
          { level: 1, side: "few" },
          { level: 4, side: "few" }
        ],
        startingBuildings: ["city_hall"]
      }
    });

    // An unseated player may not change the options.
    const stranger = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "observer",
      options: { difficulty: "easy" }
    });
    expect(stranger.errors).toHaveLength(1);

    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "necropolis", heroDefId: "sandro" });
    state = apply(state, { type: "START_ADVENTURE", playerId: "p1" });

    expect(state.adventure?.difficulty).toBe("hard");
    expect(state.players.p1.resources).toEqual({ gold: 20, buildingMaterials: 6, valuables: 3 });
    expect(state.players.p1.production).toEqual({ gold: 12, buildingMaterials: 1, valuables: 0 });
    // Level 1 (bronze) + level 4 (silver) "few" units from the faction roster.
    expect(state.players.p1.army.map((unit) => `${unit.unitDefId}:${unit.side}`)).toEqual([
      "castle.halberdiers:few",
      "castle.crusaders:few"
    ]);
    // The chosen starting building stands pre-built, faction-prefixed.
    expect(state.towns.town_p1.buildings).toContain("castle.city_hall");

    // Options are locked once the adventure started.
    const late = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { difficulty: "easy" }
    });
    expect(late.errors).toHaveLength(1);
  });

  it("carries the Ⅱ–Ⅲ tile-opening toggle from the lobby into the started game", () => {
    let state = createAdventureLobbyState({ seed: "lobby-seed" });
    // Default ON.
    expect(state.setupLobby?.options.farTileOpening ?? true).toBe(true);

    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { farTileOpening: false }
    });
    expect(state.setupLobby?.options.farTileOpening).toBe(false);

    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    state = apply(state, { type: "CHOOSE_FACTION", playerId: "p2", factionId: "necropolis", heroDefId: "sandro" });
    state = apply(state, { type: "START_ADVENTURE", playerId: "p1" });

    // With opening off, no player receives a Ⅱ–Ⅲ supply to place.
    for (const playerId of ["p1", "p2"]) {
      expect(state.adventure?.playerFarTiles[playerId]).toEqual([]);
    }
  });
});

describe("printed internal borders", () => {
  it("blocks same-tile movement across a declared internal border", () => {
    const def = coreTileDefinitions.S3;
    const saved = def.internalBorders;
    def.internalBorders = [[0, 1]];
    try {
      const state = refreshP1(makeGame());
      // S3's NE field (h:7:2) borders the town center across the new line.
      const blocked = applyAction(state, {
        type: "MOVE_HERO",
        playerId: "p1",
        heroId: "hero_p1",
        to: "h:7:2"
      });
      expect(blocked.errors).toHaveLength(1);
    } finally {
      def.internalBorders = saved;
    }

    // Without the border the same step is legal.
    const open = applyAction(refreshP1(makeGame()), {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: "h:7:2"
    });
    expect(open.errors).toHaveLength(0);
  });
});

describe("neutral combat", () => {
  function moveOntoGuardedMine(state: GameState): GameState {
    // S3 SW ring hex (9,1) is the building-materials mine guarded at level I.
    return apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  }

  it("hides the guard army until the player finishes placement, then draws it from the difficulty table", () => {
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    expect(state.phase).toBe("combat-setup");
    expect(state.combat).not.toBeNull();
    expect(state.combat?.context.kind).toBe("neutral");

    // Rulebook Combat Setup order: the player places first; the guards are
    // not drawn yet.
    const hidden = Object.values(state.combat?.units ?? {}).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    );
    expect(hidden).toHaveLength(0);

    const armyUnit = state.players.p1.army[0];
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Normal difficulty, level I field: one bronze neutral, revealed now.
    const neutrals = Object.values(state.combat?.units ?? {}).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    );
    expect(neutrals).toHaveLength(1);
    expect(neutrals[0].grade).toBe("bronze");
    expect(state.eventLog.some((event) => event.type === "NEUTRAL_ARMY_REVEALED")).toBe(true);
  });

  it("lets spells be cast in round 1 even after a spell was cast in an earlier fight", () => {
    let state = refreshP1(makeGame());
    // Stale counter from a combat fought earlier this turn.
    state.players.p1.combatStats.spellsCastThisRound = 1;
    state.players.p1.hand[0] = "spell.magic_arrow";

    state = moveOntoGuardedMine(state);
    const armyUnit = state.players.p1.army[0];
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
    for (const unit of Object.values(state.combat!.units)) {
      unit.initiative = 99;
    }
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
    const spells = getLegalActions(state, "p1").filter((legal) => legal.action.type === "CAST_SPELL");
    expect(spells.length).toBeGreaterThan(0);
  });

  it("draws the impossible-difficulty column by default and sorts the guards by the rulebook", () => {
    // Default lobby difficulty: Impossible (3 bronze guards on a level I field).
    let state = createAdventureGameState({ startingBuildings: [], seed: "test-seed", rollFirstPlayer: false });
    expect(state.adventure?.difficulty).toBe("impossible");
    state = refreshP1(state);
    state = moveOntoGuardedMine(state);

    const armyUnit = state.players.p1.army[0];
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
    // Freeze the board right after the reveal: the player's unit activates
    // first, so no guard has moved off its starting space yet.
    for (const unit of Object.values(state.combat!.units)) {
      unit.initiative = 99;
    }
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const neutrals = Object.values(state.combat?.units ?? {}).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    );
    expect(neutrals).toHaveLength(3);
    expect(neutrals.every((unit) => unit.grade === "bronze")).toBe(true);

    // Placement order: ranged in the backline, ground/flying in the
    // frontline, left to right in descending initiative (tier breaks ties).
    const backline = [0, 1, 2, 3];
    const frontline = [4, 5, 6, 7];
    for (const unit of neutrals) {
      if (unit.type === "ranged") {
        expect(backline).toContain(unit.position);
      } else {
        expect(frontline.concat(backline)).toContain(unit.position);
      }
    }
    const frontUnits = neutrals
      .filter((unit) => frontline.includes(unit.position))
      .sort((left, right) => left.position - right.position);
    for (let index = 1; index < frontUnits.length; index += 1) {
      expect(frontUnits[index - 1].initiative).toBeGreaterThanOrEqual(frontUnits[index].initiative);
    }
  });

  it("lets a placed unit be dragged to another legal space before the fight starts", () => {
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    const armyUnit = state.players.p1.army[0];
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });

    // Same unit, new space: the unit moves instead of duplicating.
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 17 });
    const placedUnits = Object.values(state.combat?.units ?? {}).filter((unit) => unit.controllerId === "p1");
    expect(placedUnits).toHaveLength(1);
    expect(placedUnits[0].position).toBe(17);
    expect(state.combat?.setup?.placedUnitIds.p1).toHaveLength(1);
  });

  it("lets the hero place units, fights an automated neutral round, and gates on the time limit", () => {
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    const armyUnit = state.players.p1.army[0];

    state = apply(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: armyUnit.id,
      position: 13
    });
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // The pump runs neutral activations until a human decision is needed:
    // either an instant window opened, the round ended (continue/retreat), or
    // the player unit is up.
    const combat = state.combat;
    expect(combat).not.toBeNull();
    const pausedForHuman =
      state.reactionWindow !== null ||
      combat?.awaitingContinue === true ||
      (combat?.pendingNeutralStep ?? null) !== null ||
      (combat?.activeUnitId !== null &&
        combat?.units[combat.activeUnitId ?? ""]?.controllerId === "p1") ||
      combat?.outcome !== null;
    expect(pausedForHuman).toBe(true);
  });

  it("skips combat entirely with quick combat when the hero outlevels the field", () => {
    let state = refreshP1(makeGame());
    state.heroes.hero_p1.level = 3;
    const productionBefore = state.players.p1.production.buildingMaterials;

    state = moveOntoGuardedMine(state);
    expect(state.combat).toBeNull();
    // The mine is flagged immediately after the free win.
    expect(state.adventure?.fields["h:9:1"].flagOwnerId).toBe("p1");
    expect(state.players.p1.production.buildingMaterials).toBe(productionBefore + 2);
    expect(state.players.p1.resources.buildingMaterials).toBeGreaterThan(0);
  });

  it("awards experience and resolves the mine flag after winning the fight", () => {
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    const armyUnit = state.players.p1.army.find((unit) => unit.unitDefId === "castle.griffins") ?? state.players.p1.army[0];
    state = apply(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: armyUnit.id,
      position: 13
    });

    // Make the fight deterministic: the player's unit one-shots anything.
    state.combat!.dice.scriptedRolls = [1, 1, 1, 1, 1, 1, 1, 1];
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "p1") {
        unit.attack = 99;
        unit.initiative = 99;
      }
    }

    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Drive the combat: the player attacks with their single unit; instant
    // windows are passed through.
    let safety = 30;
    while (state.combat && safety > 0) {
      safety -= 1;
      const actions = getLegalActions(state, "p1");
      const attack = actions.find((legal) => legal.action.type === "ATTACK_UNIT");
      const pass = actions.find((legal) => legal.action.type === "PASS_REACTION");
      const keepRoll = actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
      const next = attack ?? pass ?? keepRoll ?? actions[0];
      expect(next, `no action available in phase ${state.phase}`).toBeTruthy();
      state = apply(state, next.action);
    }

    expect(state.combat).toBeNull();
    // Difficulty I at hero level I: +1 experience.
    expect(state.heroes.hero_p1.experience).toBe(1);
    expect(state.adventure?.fields["h:9:1"].flagOwnerId).toBe("p1");
    // Base materials income (2) + the flagged mine's +2.
    expect(state.players.p1.production.buildingMaterials).toBe(4);
    expect(state.phase).toBe("player-turn");
  });

  /**
   * Places three units, finishes placement with the player units acting
   * first (initiative 99), and hands back the revealed guard for reshaping.
   */
  function threeUnitFight(state: GameState): GameState {
    const army = state.players.p1.army;
    const marksmen = army.find((unit) => unit.unitDefId === "castle.marksmen")!;
    const griffins = army.find((unit) => unit.unitDefId === "castle.griffins")!;
    const halberdiers = army.find((unit) => unit.unitDefId === "castle.halberdiers")!;
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: marksmen.id, position: 17 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: griffins.id, position: 13 });
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: halberdiers.id, position: 16 });
    state.combat!.dice.scriptedRolls = [-1, -1, -1, -1, -1, -1, -1, -1];
    for (const unit of Object.values(state.combat!.units)) {
      unit.initiative = 99;
      unit.attack = 0;
    }
    return apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  }

  /**
   * Defends every player unit so the guard's activation comes up, then
   * passes the instant windows and keeps the rolled dice so the guard's
   * attack fully resolves.
   */
  function defendThrough(state: GameState): GameState {
    let safety = 20;
    while (safety > 0) {
      safety -= 1;
      if (state.reactionWindow) {
        state = apply(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
        continue;
      }
      // The pre-activation reaction pause: this driver does not react, it just
      // lets the guard act (the guard-walk pause below is left for the caller).
      const pre = state.combat?.pendingNeutralStep;
      if (pre?.kind === "pre-activation") {
        state = apply(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: pre.reactingPlayerId ?? "p1" });
        continue;
      }
      const choice = state.pendingChoice;
      if (choice?.type === "ATTACK_DIE_REROLL") {
        state = apply(state, {
          type: "CHOOSE_PENDING_ROLL",
          playerId: choice.playerId,
          choiceId: choice.id,
          candidateIndex: 0
        });
        continue;
      }
      // Same-speed units on one side: the controller picks which goes first.
      // This driver just takes them in the offered order.
      if (choice?.type === "OPTION_CHOICE" && choice.context === "combat-activation-order") {
        state = apply(state, {
          type: "CHOOSE_OPTION",
          playerId: choice.playerId,
          choiceId: choice.id,
          optionIndex: 0
        });
        continue;
      }
      const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
      if (!active || active.controllerId !== "p1" || state.pendingChoice) {
        return state;
      }
      state = apply(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
    }
    return state;
  }

  /** Passes every open reaction window (no defends) so a paused attack resolves. */
  function passReactions(state: GameState): GameState {
    let safety = 20;
    while (safety > 0 && state.reactionWindow) {
      safety -= 1;
      state = apply(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
    }
    return state;
  }

  // BINH house rule ("the player can choose who will get hit when an enemy
  // neutral attacks"): in a PLAIN neutral fight (the AI plays the guards — no
  // PvP Neutral Control) the FIGHTER picks the VICTIM of a neutral splash /
  // spread second-attack. Each pick is mutation-checked by picking the OTHER
  // candidate as the CONTROL — if the pump branch is removed, the choice never
  // reaches p1 (a NEUTRAL-owned choice p1 may not resolve), so `apply` throws.
  it("lets the FIGHTER pick a neutral Magog's fireball splash victim (2 candidates)", () => {
    let state = threeUnitFight(moveOntoGuardedMine(refreshP1(makeGame())));

    // Reshape the revealed guard into a pack of Magogs aiming down the board.
    const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    guard.name = "Magogs";
    guard.type = "ranged";
    guard.abilities = ["magog-fireball-splash"];
    guard.attack = 1;
    guard.grade = "bronze";
    guard.position = 1;
    guard.initiative = 1;

    // The player units defend; the guard shoots the ranged marksmen (AI: ranged
    // hunts ranged), and its fireball splash — a unit adjacent to the target —
    // now STOPS for the fighter with BOTH flanks (griffins @13, halberdiers @16)
    // offered, instead of the AI auto-picking the closer griffins.
    const atChoice = defendThrough(state);
    const choice = atChoice.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("flat-damage");
    expect(choice.playerId).toBe("p1"); // the FIGHTER, not the neutral AI
    const griffins = Object.values(atChoice.combat!.units).find((unit) => unit.name === "Griffins")!;
    const halberdiers = Object.values(atChoice.combat!.units).find((unit) => unit.name === "Halberdiers")!;
    expect(new Set(choice.candidateUnitIds)).toEqual(new Set([griffins.id, halberdiers.id]));
    // The fighter alone may resolve it — the neutral seat is refused.
    const usurped = applyAction(atChoice, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: NEUTRAL_PLAYER_ID,
      choiceId: choice.id,
      targetUnitId: griffins.id
    });
    expect(usurped.errors.length).toBeGreaterThan(0);

    // The fighter dumps the splash on the halberdiers — the flank the old AI
    // would NOT have hit (it favoured the closer griffins).
    const hitB = apply(atChoice, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: halberdiers.id
    });
    expect(hitB.combat!.units[halberdiers.id].damage).toBe(1);
    expect(hitB.combat!.units[griffins.id].damage).toBe(0);

    // CONTROL — the OTHER pick from the same open choice hits the OTHER flank.
    const hitA = apply(atChoice, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: griffins.id
    });
    expect(hitA.combat!.units[griffins.id].damage).toBe(1);
    expect(hitA.combat!.units[halberdiers.id].damage).toBe(0);
  });

  it("lets the FIGHTER pick a neutral Lich's Death Cloud victim (2 candidates)", () => {
    let state = threeUnitFight(moveOntoGuardedMine(refreshP1(makeGame())));

    const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    guard.name = "Liches";
    guard.type = "ranged";
    guard.abilities = ["lich-death-cloud"];
    guard.attack = 1;
    guard.grade = "silver";
    guard.position = 1;
    guard.initiative = 1;

    // The Death Cloud is a full ATTACK (attack 2) at a unit adjacent to the
    // target; give the flanks 0 Defense and high Health so it lands a clean,
    // survivable hit. Dice stay at 0 so the +2 attack reads through.
    const griffins = Object.values(state.combat!.units).find((unit) => unit.name === "Griffins")!;
    const halberdiers = Object.values(state.combat!.units).find((unit) => unit.name === "Halberdiers")!;
    for (const flank of [griffins, halberdiers]) {
      flank.defense = 0;
      flank.maxHealth = 20;
      flank.damage = 0;
    }
    state.combat!.dice.scriptedRolls = Array(40).fill(0);
    state.combat!.dice.rollCount = 0;

    const atChoice = defendThrough(state);
    const choice = atChoice.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("second-attack");
    expect(choice.playerId).toBe("p1"); // the FIGHTER picks the spread target
    expect(new Set(choice.candidateUnitIds)).toEqual(new Set([griffins.id, halberdiers.id]));

    // Pick the halberdiers: the Death Cloud attacks THEM (event) and only they
    // take damage; the griffins the fighter did NOT pick are untouched.
    const hitB = passReactions(
      apply(atChoice, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: halberdiers.id })
    );
    const cloudB = hitB.eventLog.filter(
      (event) => event.type === "UNIT_ATTACK_DECLARED" && event.abilityAttack?.abilityId === "lich-death-cloud"
    );
    expect(cloudB.map((event) => (event.type === "UNIT_ATTACK_DECLARED" ? event.defenderId : null))).toEqual([halberdiers.id]);
    expect(hitB.combat!.units[halberdiers.id].damage).toBeGreaterThan(0);
    expect(hitB.combat!.units[griffins.id].damage).toBe(0);

    // CONTROL — picking the griffins aims the Death Cloud at them instead.
    const hitA = passReactions(
      apply(atChoice, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: griffins.id })
    );
    const cloudA = hitA.eventLog.filter(
      (event) => event.type === "UNIT_ATTACK_DECLARED" && event.abilityAttack?.abilityId === "lich-death-cloud"
    );
    expect(cloudA.map((event) => (event.type === "UNIT_ATTACK_DECLARED" ? event.defenderId : null))).toEqual([griffins.id]);
    expect(hitA.combat!.units[griffins.id].damage).toBeGreaterThan(0);
    expect(hitA.combat!.units[halberdiers.id].damage).toBe(0);
  });

  it("CONTROL: a single splash candidate auto-resolves with NO prompt (engine convention)", () => {
    let state = threeUnitFight(moveOntoGuardedMine(refreshP1(makeGame())));

    const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    guard.name = "Magogs";
    guard.type = "ranged";
    guard.abilities = ["magog-fireball-splash"];
    guard.attack = 1;
    guard.grade = "bronze";
    guard.position = 1;
    guard.initiative = 1;

    // Pull the halberdiers away from the marksmen so ONLY the griffins remain
    // adjacent to the target: a lone candidate is mandatory and needs no prompt.
    const griffins = Object.values(state.combat!.units).find((unit) => unit.name === "Griffins")!;
    const halberdiers = Object.values(state.combat!.units).find((unit) => unit.name === "Halberdiers")!;
    halberdiers.position = 8; // row 2, col 0 — adjacent to neither marksmen@17 nor magog@1

    state = defendThrough(state);

    expect(state.pendingChoice).toBeNull(); // the AI auto-applied the lone splash
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "magog-fireball-splash"
      )
    ).toBe(true);
    expect(state.combat!.units[griffins.id].damage).toBe(1);
    expect(state.combat!.units[halberdiers.id].damage).toBe(0);
  });

  it("lets the player break a neutral target tie, then the guard commits to the pick", () => {
    let state = threeUnitFight(moveOntoGuardedMine(refreshP1(makeGame())));

    const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    guard.type = "ground";
    guard.abilities = [];
    guard.grade = "bronze";
    guard.position = 1;
    guard.initiative = 1;
    // Two bronze player units at equal distance 4 from the guard; the
    // halberdiers sit farther away and are not equally valid.
    const combat = state.combat!;
    const marksmen = Object.values(combat.units).find((unit) => unit.name === "Marksmen")!;
    const griffins = Object.values(combat.units).find((unit) => unit.name === "Griffins")!;
    const halberdiers = Object.values(combat.units).find((unit) => unit.name === "Halberdiers")!;
    marksmen.position = 12;
    griffins.position = 14;
    halberdiers.position = 19;

    state = defendThrough(state);

    // The rulebook tie: the table (attacking player) chooses the target.
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("neutral-target");
    expect(choice.playerId).toBe("p1");
    expect(new Set(choice.candidateUnitIds)).toEqual(new Set([marksmen.id, griffins.id]));

    const guardDistanceBefore = Math.abs(Math.floor(guard.position / 4) - Math.floor(griffins.position / 4)) +
      Math.abs((guard.position % 4) - (griffins.position % 4));
    state = apply(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: griffins.id
    });

    // The destination choice composes with the target choice (BINH house rule):
    // now that the griffins are the target and several cells reach them, the
    // player also picks WHERE the guard lands. It still attacks the griffins.
    const destChoice = state.pendingChoice;
    expect(destChoice?.type).toBe("OPTION_CHOICE");
    if (destChoice?.type === "OPTION_CHOICE") {
      expect(destChoice.context).toBe("neutral-destination");
      expect(destChoice.playerId).toBe("p1");
      expect(destChoice.neutralDestination?.defenderId).toBe(griffins.id);
      state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: destChoice.id, optionIndex: 0 });
    }

    // The guard walked toward the chosen griffins.
    const movedGuard = Object.values(state.combat!.units).find(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    )!;
    const guardDistanceAfter = Math.abs(Math.floor(movedGuard.position / 4) - Math.floor(griffins.position / 4)) +
      Math.abs((movedGuard.position % 4) - (griffins.position % 4));
    expect(guardDistanceAfter).toBeLessThan(guardDistanceBefore);
  });

  it("paces the fight: the engine pauses before a guard takes its turn", () => {
    let state = threeUnitFight(moveOntoGuardedMine(refreshP1(makeGame())));

    const combat = state.combat!;
    const guard = Object.values(combat.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    guard.type = "ground";
    guard.abilities = [];
    guard.grade = "bronze";
    guard.position = 0; // top-left corner
    guard.initiative = 1; // acts after the player's units defend

    // One uniquely-closest target, far enough that the guard only walks this
    // turn (cannot reach adjacent) — the pure-move case that used to flash by.
    const marksmen = Object.values(combat.units).find((unit) => unit.name === "Marksmen")!;
    const griffins = Object.values(combat.units).find((unit) => unit.name === "Griffins")!;
    const halberdiers = Object.values(combat.units).find((unit) => unit.name === "Halberdiers")!;
    halberdiers.position = 17; // distance 5 from the guard — the closest
    marksmen.position = 18; // distance 6
    griffins.position = 19; // distance 7

    // Defend the player units until the guard's pre-activation pause comes up —
    // without resuming it (so we can inspect the pause itself).
    let safety = 20;
    while (safety > 0 && state.combat && !state.combat.pendingNeutralStep) {
      safety -= 1;
      if (state.reactionWindow) {
        state = apply(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
        continue;
      }
      // p1's three units share initiative 99, so it is asked which goes first.
      const choice = state.pendingChoice;
      if (choice?.type === "OPTION_CHOICE" && choice.context === "combat-activation-order") {
        state = apply(state, { type: "CHOOSE_OPTION", playerId: choice.playerId, choiceId: choice.id, optionIndex: 0 });
        continue;
      }
      const active = state.combat.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
      if (active?.controllerId !== "p1") {
        break;
      }
      state = apply(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
    }

    // The engine paused before the guard acts, previewing its planned move.
    const step = state.combat!.pendingNeutralStep;
    expect(step?.kind).toBe("pre-activation");
    expect(step?.unitId).toBe(guard.id);
    expect(step?.intent?.kind).toBe("move");

    // Only the attacker holds the pause; doing so resumes it and the guard walks.
    const continues = getLegalActions(state, "p1").filter(
      (entry) => entry.action.type === "CONTINUE_NEUTRAL_STEP"
    );
    expect(continues).toHaveLength(1);
    const blocked = getLegalActions(state, "p2").filter(
      (entry) => entry.action.type === "CONTINUE_NEUTRAL_STEP"
    );
    expect(blocked).toHaveLength(0);

    const before = state.combat!.units[guard.id].position;
    state = apply(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    expect(state.combat!.units[guard.id].position).not.toBe(before);
  });

  it("returns the hero on retreat and keeps the field guarded", () => {
    let state = moveOntoGuardedMine(refreshP1(makeGame()));
    const townSpace = state.towns.town_p1.fieldId ?? "";
    const armyUnit = state.players.p1.army[0];
    state = apply(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: armyUnit.id,
      position: 16
    });
    // Stack the dice against the player so the round ends with both alive.
    state.combat!.dice.scriptedRolls = [-1, -1, -1, -1, -1, -1];
    for (const unit of Object.values(state.combat!.units)) {
      unit.attack = 0;
    }
    state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    let safety = 30;
    while (state.combat && !state.combat.awaitingContinue && safety > 0) {
      safety -= 1;
      const actions = getLegalActions(state, "p1");
      const defend = actions.find((legal) => legal.action.type === "DEFEND_UNIT");
      const pass = actions.find((legal) => legal.action.type === "PASS_REACTION");
      const keepRoll = actions.find((legal) => legal.action.type === "CHOOSE_PENDING_ROLL");
      const next = defend ?? pass ?? keepRoll ?? actions[0];
      expect(next, `no action available in phase ${state.phase}`).toBeTruthy();
      state = apply(state, next.action);
    }

    expect(state.combat?.awaitingContinue).toBe(true);
    state = apply(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });

    // The battlefield stays up with the end-of-combat notice until the
    // participant returns to the map.
    expect(state.combat?.outcome?.reason).toBe("retreat");
    state = apply(state, { type: "ACKNOWLEDGE_COMBAT_END", playerId: "p1" });

    expect(state.combat).toBeNull();
    expect(state.heroes.hero_p1.spaceId).toBe(townSpace);
    expect(state.adventure?.fields["h:9:1"].flagOwnerId).toBeNull();
    expect(state.adventure?.fields["h:9:1"].difficulty).toBe(1);
  });
});

describe("town economy", () => {
  it("builds with the build token, enforcing cost and dwelling order", () => {
    let state = refreshP1(makeGame());
    // This test exercises build order/cost, not the default resource sheet — give
    // the materials the bronze dwelling needs (default income is a lean 2 materials).
    state.players.p1.resources.buildingMaterials = 20;
    state.players.p1.resources.valuables = 20;

    const silverFirst = applyAction(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_silver"
    });
    expect(silverFirst.errors).toHaveLength(1);

    state = apply(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_bronze"
    });
    expect(state.towns.town_p1.buildings).toContain("castle.dwelling_bronze");
    expect(state.players.p1.resources.gold).toBe(5);
    expect(state.players.p1.townTokens.build).toBe(false);

    const secondBuild = applyAction(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.mage_guild"
    });
    expect(secondBuild.errors).toHaveLength(1);
  });

  it("recruits with the population token once a dwelling stands", () => {
    let state = refreshP1(makeGame());
    // Give the materials the bronze dwelling needs (default income is 2 materials).
    state.players.p1.resources.buildingMaterials = 20;
    state.players.p1.resources.valuables = 20;

    const tooEarly = applyAction(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.halberdiers" }]
    });
    expect(tooEarly.errors).toHaveLength(1);

    state = apply(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_bronze"
    });

    // Each unit card exists once: the starting army already holds the
    // halberdiers, so recruiting them again is rejected.
    const duplicate = applyAction(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.halberdiers" }]
    });
    expect(duplicate.errors).toHaveLength(1);

    // After the card left the army (lost in combat), it can be bought anew.
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.halberdiers");
    const armyBefore = state.players.p1.army.length;
    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.halberdiers" }]
    });
    expect(state.players.p1.army).toHaveLength(armyBefore + 1);
    // A purchase no longer consumes the token outright: the window stays open
    // for more recruiting/reinforcing and only arms the move lock.
    expect(state.players.p1.townTokens.population).toBe(true);
    expect(state.players.p1.populationPurchasedThisRound).toBe(true);
  });

  describe("Population Token — recruiting a Secondary Hero blocks unit recruit/reinforce", () => {
    // Bronze dwelling up, gold to spare, and a bronze Few freed so it is
    // recruitable — the same starting point as the population window tests.
    function townReadyToRecruit(): GameState {
      let state = refreshP1(makeGame());
      state.players.p1.resources.buildingMaterials = 20;
      state.players.p1.resources.valuables = 20;
      state.players.p1.resources.gold = 100;
      state = apply(state, {
        type: "BUILD_STRUCTURE",
        playerId: "p1",
        townId: "town_p1",
        buildingId: "castle.dwelling_bronze"
      });
      state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.griffins");
      return state;
    }

    const recruitGriffins: GameAction = {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.griffins" }]
    };
    const hireOffer = (state: GameState) =>
      getLegalActions(state, "p1").find((legal) => legal.action.type === "HIRE_SECONDARY_HERO")?.action as
        | Extract<GameAction, { type: "HIRE_SECONDARY_HERO" }>
        | undefined;
    const recruitOffered = (state: GameState) =>
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.unitDefId === "castle.griffins"
      );

    it("hiring a hero spends the token: recruit/reinforce offers vanish and the action is rejected", () => {
      const state = townReadyToRecruit();
      // Both offers are live on the fresh Population Token.
      expect(recruitOffered(state)).toBe(true);
      const hire = hireOffer(state);
      expect(hire).toBeDefined();

      const afterHire = apply(state, hire!);
      // The Population Token is spent on the hero...
      expect(afterHire.players.p1.townTokens.population).toBe(false);
      // ...so no unit recruit/reinforce is offered any more...
      expect(recruitOffered(afterHire)).toBe(false);
      // ...and forcing the POPULATION_ACTION is rejected.
      const forced = applyAction(afterHire, recruitGriffins);
      expect(forced.errors.length).toBeGreaterThan(0);
    });

    it("CONTROL: without hiring a hero, the same recruit goes through on the token", () => {
      const state = townReadyToRecruit();
      const recruited = apply(state, recruitGriffins);
      expect(recruited.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins")).toBe(true);
      expect(recruited.players.p1.townTokens.population).toBe(true);
    });

    it("a Population Token already spent this round offers no hero hire and rejects it", () => {
      const state = townReadyToRecruit();
      const hire = hireOffer(state)!; // capture a valid portrait while the token is up
      state.players.p1.townTokens.population = false;
      expect(hireOffer(state)).toBeUndefined();
      const forced = applyAction(state, hire);
      expect(forced.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Population window stays open until a move (BINH house rule)", () => {
    // Bronze dwelling up and gold to spare. The scenario seeds every bronze
    // few into the starting army, so clear marksmen + griffins (each unit card
    // exists once) to leave them freshly recruitable.
    function townReady(): GameState {
      let state = refreshP1(makeGame());
      // Materials for the bronze dwelling (default income is a lean 2 materials).
      state.players.p1.resources.buildingMaterials = 20;
      state.players.p1.resources.valuables = 20;
      state = apply(state, {
        type: "BUILD_STRUCTURE",
        playerId: "p1",
        townId: "town_p1",
        buildingId: "castle.dwelling_bronze"
      });
      state.players.p1.army = state.players.p1.army.filter(
        (unit) => unit.unitDefId !== "castle.marksmen" && unit.unitDefId !== "castle.griffins"
      );
      state.players.p1.resources.gold = 50;
      return state;
    }

    it("lets a player recruit again and again on one Population token", () => {
      let state = townReady();

      state = apply(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
      });
      // The first buy does NOT spend the token; it only arms the move lock.
      expect(state.players.p1.townTokens.population).toBe(true);
      expect(state.players.p1.populationPurchasedThisRound).toBe(true);
      expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);

      // A second, separate recruit on the same token still goes through.
      state = apply(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "recruit", unitDefId: "castle.griffins" }]
      });
      expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins")).toBe(true);
      expect(state.players.p1.townTokens.population).toBe(true);
    });

    it("closes the window once a hero moves after a purchase", () => {
      let state = townReady();
      state = apply(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
      });
      expect(state.players.p1.townTokens.population).toBe(true);

      // Buying, then moving, commits the Population action for the round.
      state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:3" });
      expect(state.players.p1.townTokens.population).toBe(false);

      const blocked = applyAction(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "recruit", unitDefId: "castle.griffins" }]
      });
      expect(blocked.errors).toHaveLength(1);
      expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.griffins")).toBe(false);
    });

    it("leaves the window open when a hero moves before any purchase", () => {
      let state = townReady();

      // Move first, having bought nothing — the window must stay open.
      state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:3" });
      expect(state.players.p1.townTokens.population).toBe(true);
      expect(state.players.p1.populationPurchasedThisRound).toBeFalsy();

      // Recruiting after the move still works (would even work on a rival's turn).
      state = apply(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
      });
      expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);
      expect(state.players.p1.townTokens.population).toBe(true);
    });

    it("reopens the Population window each round", () => {
      let state = townReady();
      state = apply(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
      });
      state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:3" });
      expect(state.players.p1.townTokens.population).toBe(false);

      refreshRoundTokens(state);
      expect(state.players.p1.townTokens.population).toBe(true);
      expect(state.players.p1.populationPurchasedThisRound).toBe(false);
    });
  });

  it("buys spells through the Mage Guild one round after construction", () => {
    let state = refreshP1(makeGame());
    // Isolate this Mage-Guild flow from the first-round face-up seed on the Spell
    // discard, so the first free Search opens straight onto its reveal.
    state.decks.spells.discardPile = [];
    state = apply(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.mage_guild"
    });

    // Building it queues two free Search (2) of the Spell deck. The first opens
    // straight onto the reveal (the spell discard starts empty); resolving it
    // discards the unkept card, so the second opens the Search-or-take-discard
    // choice. Resolve both fully through the shared-search helper.
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    state = resolveSharedSearch(state);
    state = resolveSharedSearch(state);
    expect(state.pendingChoice).toBeNull();

    const sameRound = applyAction(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
    expect(sameRound.errors).toHaveLength(1);

    // Pass to the next round; the two searched spells push the hand over the
    // limit, so the start-of-turn refresh has to discard down to 4 first.
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.players.p1.needsHandRefresh).toBe(true);
    state = apply(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: state.players.p1.hand.slice(0, Math.max(0, state.players.p1.hand.length - 4))
    });

    state.players.p1.resources.gold = 10;
    state = apply(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
    expect(state.players.p1.resources.gold).toBe(4);
    // Earlier searches left cards in the spell discard, so the Spell Book search
    // opens the up-front Search-or-take-discard choice rather than a bare reveal.
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.pendingChoice && "context" in state.pendingChoice ? state.pendingChoice.context : null).toBe(
      "deck-search-mode"
    );
  });
});

describe("experience and victory", () => {
  it("applies level effects: hand limit, expert slots, searches and specialties", () => {
    let state = refreshP1(makeGame());
    state.adventure!.fields["h:7:2"].location = "learning_stone";

    // Visiting a learning stone grants 1 XP (still level I at one step).
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:7:2" });
    expect(state.heroes.hero_p1.experience).toBe(1);
    expect(state.heroes.hero_p1.level).toBe(1);

    // Push straight to level IV: searches queue and the specialty is gained.
    const handBefore = state.players.p1.hand.length;
    state.heroes.hero_p1.experience = 5;
    state.adventure!.fields["h:9:2"].location = "learning_stone";
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:2" });
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:2" });

    expect(state.heroes.hero_p1.level).toBe(4);
    expect(state.players.p1.limits.hand).toBe(5);
    expect(state.players.p1.limits.expertUses).toBe(2);
    expect(state.players.p1.hand.length).toBeGreaterThan(handBefore);
    expect(state.players.p1.hand).toContain("specialty.catherine.4");
    // Ability searches from levels II and III open one at a time.
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
  });

  it("flags the enemy town without an instant win, rewards the conqueror a resource-gain level, and starts the elimination clock", () => {
    let state = refreshP1(makeGame());
    const enemyTownField = state.towns.town_p2.fieldId ?? "";
    const hero = state.heroes.hero_p1;
    // Teleport next to the enemy town for the test. (9,7) is a ring hex of
    // seat 1's town flower (centered at 10,7), so it borders the town center.
    state.heroes.hero_p2.spaceId = null;
    hero.spaceId = "h:9:7";
    state.adventure!.fields["h:9:7"] = {
      ...state.adventure!.fields[enemyTownField],
      spaceId: "h:9:7",
      location: "empty_field",
      difficulty: undefined,
      flagOwnerId: null,
      blackCube: false,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.lastVisitedField.hero_p1 = "h:9:7";

    const goldProductionBefore = state.players.p1.production.gold;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: enemyTownField });

    // The town owner is asked to garrison (8 gold, units only) and declines.
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      expect(state.pendingChoice.context).toBe("garrison");
      expect(state.pendingChoice.playerId).toBe("p2");
      state = apply(state, {
        type: "CHOOSE_OPTION",
        playerId: "p2",
        choiceId: state.pendingChoice.id,
        optionIndex: 1
      });
    }

    // Flagging an enemy faction Town is NOT an instant win (rulebook p.76).
    expect(state.adventure?.winnerPlayerId).toBeNull();
    expect(state.phase).not.toBe("game-over");
    expect(state.adventure?.fields[enemyTownField].flagOwnerId).toBe("p1");

    // The conqueror is offered the resource-gain-level reward; pick +5 gold.
    expect(state.adventure?.pendingVisit?.steps[0].type).toBe("RESOURCE_GAIN_LEVEL");
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    const rewardLabels = getLegalActions(state, "p1").map((entry) => entry.label);
    expect(rewardLabels.some((label) => label.includes("Raise Gold income by 5"))).toBe(true);
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.players.p1.production.gold).toBe(goldProductionBefore + 5);

    // p2 lost their only base and is now on the 2-turn elimination clock.
    expect(state.players.p2.eliminationCountdown).toBe(2);
    expect(state.players.p2.eliminated).toBeFalsy();
    expect(state.turnOrder).toContain("p2");
  });
});
