import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  getLegalActions
} from "./index";
import { eliminatePlayer, getTileFootprintSpaceIds } from "./adventure";
import { canHeroDiscoverAdjacentTile } from "./adventure-reducer";
import { nextAfkDropAction, nextTurnTimeoutAction } from "./afk-drop";
import { chooseComputerAction } from "./computer/policy";
import {
  applyCustomMapPresetToOptions,
  revertCustomMapPresetOptions,
  sanitizeCustomMapPreset,
  type CustomMapPreset
} from "./map-preset";
import { farTileTypeMatches } from "./far-tile-types";
import { allTileDefinitions } from "@/data/map/tiles";
import type { GameAction, GameSetupOptions, GameState, PlayerVisibleState } from "./state";

/**
 * Ⅱ–Ⅲ TILE TYPE CHOICE (OPTIONAL rule, `GameSetupOptions.farTileTypeChoice`,
 * default OFF — a Game-options row plus a map-designer preset field).
 *
 * The undecided Ⅱ–Ⅲ tile in a player's hand works like a hidden tile: placing
 * it first asks WHICH KIND they want — a GOLD mine, a CRYSTAL (valuables) mine,
 * a STONE (ore) mine or a SETTLEMENT — and a random tile OF THAT KIND is then
 * drawn from the Ⅱ–Ⅲ pool. A designed map may narrow the offered kinds
 * (`CustomMapPreset.farTileTypeChoices`, e.g. "crystal or gold").
 *
 * Every claim below is mutation-checked with a rule-off / subset / exhausted
 * CONTROL. Classification REUSES `farTileTypeMatches`, which delegates to the
 * same predicates the Settlement guarantee and the Ore-Mine reroll already use.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

const PLACE: GameAction = {
  type: "PLACE_TILE",
  playerId: "p1",
  heroId: "hero_p1",
  supplyIndex: 0,
  centerRow: 6,
  centerCol: 4
};

function makeGame(seed: string, options: Partial<GameSetupOptions> = {}): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ...options
  });
  state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  // Stand on the seat-0 town-flower hex (7,2), bordering the empty notch at
  // (6,4) — the same legal placement adventure.test.ts / the blind-choice test use.
  state.heroes.hero_p1.spaceId = "h:7:2";
  state.heroes.hero_p1.movementPoints = 3;
  return state;
}

function typeMenuLabels(state: GameState): string[] {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "far-tile-flip") {
    return [];
  }
  return choice.options.map((option) => option.label);
}

function choose(state: GameState, optionIndex: number): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type).toBe("OPTION_CHOICE");
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: choice!.id,
    optionIndex
  });
}

/** The tile the flip settled on (mid-decision candidate, or the placed tile). */
function settledTile(state: GameState): string {
  const flip = state.adventure!.pendingFarTileFlip;
  if (flip && flip.candidate) {
    return flip.candidate;
  }
  const pending = state.adventure!.pendingTileChoice;
  if (pending) {
    return state.adventure!.tiles[pending.tileInstanceId].tileDefId;
  }
  const placed = Object.values(state.adventure!.tiles).find(
    (tile) => tile.centerRow === 6 && tile.centerCol === 4
  );
  if (!placed) {
    throw new Error("no Ⅱ–Ⅲ tile was placed");
  }
  return placed.tileDefId;
}

/**
 * Answers any follow-up `far-tile-rerolls` keep/reroll window with "Keep" (the
 * type choice replaces only the BLIND draw — the house rule's own offers still
 * run afterwards; a drawn tile that happens to carry an Ore Mine opens one).
 */
function keepThroughOffers(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 4; guard += 1) {
    const labels = typeMenuLabels(next);
    if (labels[0] !== "Keep this Ⅱ–Ⅲ tile") {
      return next;
    }
    next = choose(next, 0);
  }
  return next;
}

/**
 * Confirms the placed tile's rotation (when one is still owed) and returns its
 * MATERIALIZED fields — the real board content, not a tile-id list.
 */
function rotateAndMaterializedFields(stateIn: GameState) {
  const state = keepThroughOffers(stateIn);
  const pending = state.adventure!.pendingTileChoice;
  const placedId =
    pending?.tileInstanceId ??
    Object.values(state.adventure!.tiles).find(
      (tile) => tile.centerRow === 6 && tile.centerCol === 4
    )!.id;
  let next = state;
  if (pending) {
    const rotations = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "SET_TILE_ROTATION"
    );
    expect(rotations.length).toBeGreaterThan(0);
    next = applyOk(state, rotations[0].action);
  }
  const fields = Object.values(next.adventure!.fields).filter(
    (field) => field.tileInstanceId === placedId
  );
  expect(fields.length, "the placed tile materialized its fields").toBeGreaterThan(0);
  return fields;
}

/** Every tile id in the pool carrying (or not carrying) the given kind. */
function poolWith(state: GameState, kind: Parameters<typeof farTileTypeMatches>[1], want: boolean) {
  return (state.adventure!.farTilePool ?? []).filter((id) => farTileTypeMatches(id, kind) === want);
}

describe("Ⅱ–Ⅲ tile type choice — default OFF is byte-identical", () => {
  it("an explicit OFF places exactly like a build that never heard of the rule (exact-equality CONTROL)", () => {
    const absent = applyOk(makeGame("type-off"), PLACE);
    const explicitOff = applyOk(makeGame("type-off", { farTileTypeChoice: false }), PLACE);
    expect(JSON.stringify(explicitOff)).toEqual(JSON.stringify(absent));
    // …and nothing of the rule is written onto adventure state.
    expect(absent.adventure!.farTileTypeChoice).toBeUndefined();
    expect(absent.adventure!.farTileTypeChoices).toBeUndefined();
    expect(absent.adventure!.pendingFarTileFlip?.offerMode).not.toBe("type-choice");
    expect(typeMenuLabels(absent)).not.toContain("Choose a GOLD mine tile");
  });

  it("freezes the lobby option onto adventure state (CONTROL: absent by default)", () => {
    const on = createAdventureGameState({
      seed: "type-freeze",
      difficulty: "normal",
      rollFirstPlayer: false,
      farTileTypeChoice: true
    });
    expect(on.adventure?.farTileTypeChoice).toBe(true);
    const off = createAdventureGameState({
      seed: "type-freeze-off",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    expect(off.adventure?.farTileTypeChoice).toBeUndefined();
  });
});

describe("Ⅱ–Ⅲ tile type choice — the menu", () => {
  it("with the rule ON, placing a supply tile opens the kind menu — no tile drawn yet", () => {
    const state = makeGame("type-open", { farTileTypeChoice: true });
    const poolBefore = [...(state.adventure!.farTilePool ?? [])];
    const next = applyOk(state, PLACE);

    const choice = next.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("far-tile-flip");
    expect(choice?.playerId).toBe("p1");
    expect(typeMenuLabels(next)).toEqual([
      "No preference — draw any tile",
      "Choose a GOLD mine tile",
      "Choose a CRYSTAL (valuables) mine tile",
      "Choose a STONE (ore) mine tile",
      "Choose a SETTLEMENT tile"
    ]);
    // The kind→index map is persisted on the flip so menu and draw cannot drift.
    expect(next.adventure!.pendingFarTileFlip?.offerMode).toBe("type-choice");
    expect(next.adventure!.pendingFarTileFlip?.typeOptions).toEqual([
      null,
      "gold",
      "valuables",
      "buildingMaterials",
      "settlement"
    ]);
    // Nothing has been drawn: the pool is untouched, no candidate yet…
    expect(next.adventure!.pendingFarTileFlip?.candidate).toBe("");
    expect(next.adventure!.farTilePool).toEqual(poolBefore);
    // …but the supply marker and the movement point are spent as usual.
    expect(next.adventure!.playerFarTiles.p1.length).toBe(
      state.adventure!.playerFarTiles.p1.length - 1
    );
    expect(next.heroes.hero_p1.movementPoints).toBe(2);
  });

  it("a kind with nothing left in the pool is NOT offered (CONTROL: it is offered while one remains)", () => {
    const withSettlements = makeGame("type-drop", { farTileTypeChoice: true });
    expect(typeMenuLabels(applyOk(withSettlements, PLACE))).toContain("Choose a SETTLEMENT tile");

    const stripped = makeGame("type-drop", { farTileTypeChoice: true });
    stripped.adventure!.farTilePool = poolWith(stripped, "settlement", false);
    expect(stripped.adventure!.farTilePool.length).toBeGreaterThan(0);
    const labels = typeMenuLabels(applyOk(stripped, PLACE));
    expect(labels).not.toContain("Choose a SETTLEMENT tile");
    expect(labels).toContain("No preference — draw any tile");
  });

  it("with NO allowed kind left the menu never opens — a random tile is drawn with a public note", () => {
    const state = makeGame("type-none", {
      farTileTypeChoice: true,
      customMapPreset: { farTileTypeChoices: ["settlement"] } as CustomMapPreset
    });
    expect(state.adventure!.farTileTypeChoices).toEqual(["settlement"]);
    state.adventure!.farTilePool = poolWith(state, "settlement", false);
    expect(state.adventure!.farTilePool.length).toBeGreaterThan(0);

    const next = applyOk(state, PLACE);
    expect(typeMenuLabels(next)).not.toContain("No preference — draw any tile");
    // A tile WAS drawn straight away…
    expect(settledTile(next)).toBeTruthy();
    // …and the soft-fail is publicly noted.
    expect(
      next.eventLog.some(
        (event) =>
          event.type === "MAP_SECRET_FEATURE_FALLBACK" && event.feature === "far_tile_type_choice"
      )
    ).toBe(true);
  });

  it("a designed subset limits the menu to those kinds (CONTROL: no subset offers all four)", () => {
    const subset = makeGame("type-subset", {
      farTileTypeChoice: true,
      customMapPreset: { farTileTypeChoices: ["valuables", "gold"] } as CustomMapPreset
    });
    // The frozen list keeps the designer's own entries; the MENU is always
    // rendered in the canonical FAR_TILE_TYPES order, whatever order they wrote.
    expect([...subset.adventure!.farTileTypeChoices!].sort()).toEqual(["gold", "valuables"]);
    expect(typeMenuLabels(applyOk(subset, PLACE))).toEqual([
      "No preference — draw any tile",
      "Choose a GOLD mine tile",
      "Choose a CRYSTAL (valuables) mine tile"
    ]);

    const all = makeGame("type-subset", { farTileTypeChoice: true });
    expect(typeMenuLabels(applyOk(all, PLACE))).toHaveLength(5);
  });
});

describe("Ⅱ–Ⅲ tile type choice — the draw really matches the chosen kind", () => {
  it("choosing GOLD lands a tile whose MATERIALIZED fields carry a gold Mine (several seeds)", () => {
    for (const seed of ["g1", "g2", "g3", "g4", "g5"]) {
      const state = makeGame(`type-gold-${seed}`, { farTileTypeChoice: true });
      expect(poolWith(state, "gold", true).length).toBeGreaterThan(0);
      let next = applyOk(state, PLACE);
      const goldIndex = typeMenuLabels(next).indexOf("Choose a GOLD mine tile");
      expect(goldIndex).toBeGreaterThan(0);
      next = choose(next, goldIndex);
      // Any follow-up keep/reroll offer (the far-tile-rerolls house rule is OFF
      // by default here) would leave the flip open; with it off the tile lands.
      const fields = rotateAndMaterializedFields(next);
      expect(
        fields.some((field) => field.location === "mine" && field.resource === "gold"),
        `seed ${seed}: placed ${settledTile(next)} with fields ${JSON.stringify(
          allTileDefinitions[settledTile(next)]?.fields
        )}`
      ).toBe(true);
    }
  });

  it("choosing SETTLEMENT lands a Settlement field; choosing STONE lands an ore Mine", () => {
    const settlement = (() => {
      let state = applyOk(makeGame("type-settle", { farTileTypeChoice: true }), PLACE);
      state = choose(state, typeMenuLabels(state).indexOf("Choose a SETTLEMENT tile"));
      return rotateAndMaterializedFields(state);
    })();
    expect(settlement.some((field) => field.location === "settlement")).toBe(true);

    const stone = (() => {
      let state = applyOk(makeGame("type-stone", { farTileTypeChoice: true }), PLACE);
      state = choose(state, typeMenuLabels(state).indexOf("Choose a STONE (ore) mine tile"));
      return rotateAndMaterializedFields(state);
    })();
    expect(
      stone.some((field) => field.location === "mine" && field.resource === "buildingMaterials")
    ).toBe(true);
  });

  it("'No preference' draws a plain random tile — no filter, no fallback note", () => {
    let state = applyOk(makeGame("type-nopref", { farTileTypeChoice: true }), PLACE);
    state = choose(state, 0);
    expect(settledTile(state)).toBeTruthy();
    expect(state.eventLog.some((event) => event.type === "MAP_SECRET_FEATURE_FALLBACK")).toBe(false);
  });

  it("is DETERMINISTIC — the same seed and the same pick land the same tile", () => {
    const run = () => {
      let state = applyOk(makeGame("type-determinism", { farTileTypeChoice: true }), PLACE);
      state = choose(state, typeMenuLabels(state).indexOf("Choose a CRYSTAL (valuables) mine tile"));
      return settledTile(state);
    };
    const first = run();
    expect(run()).toBe(first);
    expect(farTileTypeMatches(first, "valuables")).toBe(true);
  });
});

describe("Ⅱ–Ⅲ tile type choice — scope and interplay", () => {
  it("DISCOVERING a face-down Ⅱ–Ⅲ tile already on the map never asks — its identity is fixed", () => {
    // The land map rings each home with face-down Ⅱ–Ⅲ tiles. Stand beside one,
    // pin its (hidden) def, and discover it with the rule ON: the printed def
    // is what lands — no kind menu, and the supply pool is untouched.
    let state = createAdventureGameState({
      seed: "type-reveal",
      scenarioId: "land-2p",
      difficulty: "normal",
      rollFirstPlayer: false,
      creatureBanks: false,
      farTileTypeChoice: true
    });
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    const adventure = state.adventure!;
    let armed: string | null = null;
    outer: for (const tile of Object.values(adventure.tiles)) {
      if (!tile.faceDown || tile.group !== "far") continue;
      const footprint = getTileFootprintSpaceIds(tile);
      for (const spaceId of Object.keys(adventure.fields)) {
        if (footprint.includes(spaceId)) continue;
        const hero = { ...state.heroes.hero_p1, spaceId };
        if (canHeroDiscoverAdjacentTile(state, hero, tile)) {
          state.heroes.hero_p1.spaceId = spaceId;
          state.heroes.hero_p1.movementPoints = 5;
          tile.tileDefId = "F1"; // Settlement, no Mine
          armed = tile.id;
          break outer;
        }
      }
    }
    expect(armed, "the land map has a discoverable face-down Ⅱ–Ⅲ tile").toBeTruthy();
    const poolBefore = [...(adventure.farTilePool ?? [])];

    const next = applyOk(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: armed!
    });

    expect(next.adventure!.pendingFarTileFlip?.offerMode).not.toBe("type-choice");
    expect(typeMenuLabels(next)).not.toContain("Choose a GOLD mine tile");
    expect(next.adventure!.tiles[armed!].tileDefId).toBe("F1");
    expect(next.adventure!.farTilePool).toEqual(poolBefore);
  });

  it("SUPERSEDES the older blind gold/valuables pick when both rules are on", () => {
    const both = applyOk(
      makeGame("type-supersede", { farTileTypeChoice: true, farTileBlindChoice: true }),
      PLACE
    );
    expect(both.adventure!.pendingFarTileFlip?.offerMode).toBe("type-choice");
    expect(typeMenuLabels(both)).toContain("Choose a STONE (ore) mine tile");
    expect(typeMenuLabels(both)).not.toContain("Prefer a tile with a GOLD mine");

    // CONTROL: with only the blind rule on, the blind menu is untouched.
    const blindOnly = applyOk(makeGame("type-supersede", { farTileBlindChoice: true }), PLACE);
    expect(blindOnly.adventure!.pendingFarTileFlip?.offerMode).toBe("blind");
    expect(typeMenuLabels(blindOnly)).toEqual([
      "No preference — draw any tile",
      "Prefer a tile with a GOLD mine",
      "Prefer a tile with a VALUABLES mine"
    ]);
  });

  it("the type choice replaces only the BLIND draw — the far-tile-rerolls Ore-Mine window still follows", () => {
    // With the BINH `far-tile-rerolls` house rule on, asking for a STONE tile
    // still gets the printed "keep it, or reroll once?" Ore-Mine offer; keeping
    // places the stone tile the player asked for.
    let state = makeGame("type-reroll", {
      farTileTypeChoice: true,
      houseRules: { "far-tile-rerolls": true }
    });
    state = applyOk(state, PLACE);
    state = choose(state, typeMenuLabels(state).indexOf("Choose a STONE (ore) mine tile"));
    expect(state.adventure!.pendingFarTileFlip?.offerMode).toBe("mine");
    expect(typeMenuLabels(state)[0]).toBe("Keep this Ⅱ–Ⅲ tile");
    const asked = settledTile(state);
    state = choose(state, 0);
    expect(settledTile(state)).toBe(asked);
    expect(
      rotateAndMaterializedFields(state).some(
        (field) => field.location === "mine" && field.resource === "buildingMaterials"
      )
    ).toBe(true);
  });

  it("eliminating the owner mid-menu strands nothing — no tile was ever lifted from the pool", () => {
    const state = makeGame("type-eliminate", { farTileTypeChoice: true });
    const poolBefore = [...(state.adventure!.farTilePool ?? [])];
    const open = applyOk(state, PLACE);
    expect(open.pendingChoice?.playerId).toBe("p1");
    eliminatePlayer(open, "p1", "test", true);
    expect(open.pendingChoice).toBeNull();
    expect(open.adventure!.pendingFarTileFlip).toBeNull();
    // The menu opens BEFORE any draw, so the pool is exactly as it started.
    expect(open.adventure!.farTilePool).toEqual(poolBefore);
  });
});

describe("Ⅱ–Ⅲ tile type choice — automated seats never stall", () => {
  it("a computer seat answers the menu with a real kind, never a stall", () => {
    const state = applyOk(makeGame("type-ai", { farTileTypeChoice: true }), PLACE);
    const choice = state.pendingChoice!;
    const decision = chooseComputerAction({
      state: state as unknown as PlayerVisibleState,
      playerId: "p1",
      legalActions: getLegalActions(state, "p1")
    });
    expect(decision, "the AI produced an action for the open kind menu").toBeTruthy();
    expect(decision!.action.type).toBe("CHOOSE_OPTION");
    const index = (decision!.action as { optionIndex: number }).optionIndex;
    // A real KIND, not the "no preference" fallthrough.
    expect(index).toBeGreaterThan(0);
    // The chosen action really resolves the menu.
    const resolved = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: index
    });
    expect(resolved.pendingChoice?.type === "OPTION_CHOICE" ? true : false).toBeDefined();
    expect(settledTile(resolved)).toBeTruthy();
  });

  it("the AFK / turn-timeout driver default-answers the menu", () => {
    const state = applyOk(makeGame("type-afk", { farTileTypeChoice: true }), PLACE);
    for (const next of [nextAfkDropAction(state, "p1"), nextTurnTimeoutAction(state, "p1")]) {
      expect(next?.type).toBe("CHOOSE_OPTION");
      const resolved = applyOk(state, next!);
      expect(resolved.adventure!.pendingFarTileFlip?.offerMode).not.toBe("type-choice");
      expect(settledTile(resolved)).toBeTruthy();
    }
  });
});

describe("Ⅱ–Ⅲ tile type choice — designer preset seeding", () => {
  const defaults: GameSetupOptions = createAdventureLobbyState({ seed: "d" }).setupLobby!.options;

  it("a preset kind list seeds the lobby toggle ON and survives the sanitiser round-trip", () => {
    const raw = {
      farTileTypeChoices: ["gold", "not-a-kind", "valuables", "gold"]
    } as unknown as CustomMapPreset;
    const preset = sanitizeCustomMapPreset(raw)!;
    // Unknown entries dropped, duplicates collapsed, canonical order.
    expect(preset.farTileTypeChoices).toEqual(["gold", "valuables"]);

    const options: GameSetupOptions = { ...defaults };
    const changes = applyCustomMapPresetToOptions(options, preset);
    expect(options.farTileTypeChoice).toBe(true);
    expect(changes.some((line) => line.includes("Ⅱ–Ⅲ tile type choice"))).toBe(true);

    // Dropping the map restores the scenario default.
    revertCustomMapPresetOptions(options, preset, null, defaults);
    expect(options.farTileTypeChoice).toBe(defaults.farTileTypeChoice);
  });

  it("an explicit preset OFF seeds OFF (CONTROL: it does not turn the rule on)", () => {
    const preset = sanitizeCustomMapPreset({
      farTileTypeChoice: false,
      farTileTypeChoices: ["gold"]
    } as unknown as CustomMapPreset)!;
    const options: GameSetupOptions = { ...defaults, farTileTypeChoice: true };
    applyCustomMapPresetToOptions(options, preset);
    expect(options.farTileTypeChoice).toBe(false);
  });

  it("a sanitiser round-trip of an ALL-BOGUS list drops the field entirely (absent = every kind)", () => {
    const preset = sanitizeCustomMapPreset({
      farTileTypeChoices: ["crystal", "ore", 7, null]
    } as unknown as CustomMapPreset);
    expect(preset?.farTileTypeChoices).toBeUndefined();
  });

  it("a host edit WINS over the preset seed at build (apply-once)", () => {
    const built = createAdventureGameState({
      seed: "type-host-wins",
      difficulty: "normal",
      rollFirstPlayer: false,
      farTileTypeChoice: false,
      customMapPreset: { farTileTypeChoice: true } as CustomMapPreset
    });
    expect(built.adventure?.farTileTypeChoice).toBeUndefined();
  });
});
