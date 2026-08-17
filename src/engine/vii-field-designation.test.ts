import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  beginFieldVisit,
  canDigGrail,
  drawGuardArmy,
  dragonUtopiaDifficultyGuardCount,
  getMainHero,
  grailObelisksRequired,
  materializeTileFields,
  MAX_EXPERIENCE,
  VII_FIELD_LOCATION
} from "./adventure";
import {
  createAdventureGameState,
  validateCustomMapPlan,
  getScenario
} from "./adventure-setup";
import { applyAction, computeVictoryPoints, createAdventureLobbyState } from "./index";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import { getPlayerView } from "./player-view";
import {
  describeCustomMapPresetEntries,
  sanitizeCustomMapPreset,
  victoryDesignConflicts
} from "./map-preset";
import { grailUtopiaFieldRulesEnabled } from "./map-design-features";
import type {
  CustomCenterHexPlan,
  CustomMapTilePlan,
  GameState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  PlayerId
} from "./state";

// ---------------------------------------------------------------------------
// Designer Ⅶ-field designation (`CustomMapTilePlan.viiField`) + victory-conflict
// blocking + the Grail / Dragon Utopia objectives options. Every test asserts an
// OBSERVABLE outcome (materialized field location, a fightable guard draw, a grail
// dig unlock, a queued reward, a refused game start) with a CONTROL that diverges,
// so it fails if the wiring is removed.
// ---------------------------------------------------------------------------

/** The two default-seat skirmish positions used across these maps. */
const START_A = { row: 8, col: 2 } as const;
const START_B = { row: 10, col: 7 } as const;
const CENTER = { row: 9, col: 4 } as const;

function startPlans(): CustomMapTilePlan[] {
  return [
    { row: START_A.row, col: START_A.col, group: "starting", faceDown: false },
    { row: START_B.row, col: START_B.col, group: "starting", faceDown: false }
  ];
}

/** The single difficulty-7 objective field on a map with exactly one center tile. */
function objectiveField(state: GameState): MapFieldState | undefined {
  return Object.values(state.adventure!.fields).find((field) => field.difficulty === 7);
}

/** A bare difficulty-7 field for the guard-draw harness (mirrors creature-bank-guards). */
function fieldWith(location: string): MapFieldState {
  return {
    spaceId: "0,0",
    tileInstanceId: "t",
    slot: 0,
    location,
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
}

function injectObelisk(state: GameState, spaceId: MapSpaceId): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: `obelisk-${spaceId}`,
    slot: 0,
    location: "obelisk",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

function clearHandGate(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
}

// ---------------------------------------------------------------------------
// Invariant that makes a center designation ALWAYS effective (so there is no
// dead "no Ⅶ field" branch): every center-group tile has exactly one
// difficulty-7 field.
// ---------------------------------------------------------------------------
describe("center-tile Ⅶ-field invariant", () => {
  it("every center-group tile carries exactly one difficulty-7 objective field", () => {
    const centerTiles = Object.values(allTileDefinitions).filter((def) => def.group === "center");
    expect(centerTiles.length).toBeGreaterThan(0);
    for (const def of centerTiles) {
      const viiFields = def.fields.filter((field) => field.difficulty === 7);
      expect(viiFields, `${def.id} Ⅶ fields`).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. Face-up pinned center tile + viiField "dragon_utopia".
// ---------------------------------------------------------------------------
describe("Ⅶ designation — face-up center tile", () => {
  function faceUpCenter(viiField?: CustomMapTilePlan["viiField"]): GameState {
    return createAdventureGameState({
      seed: "vii-faceup",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: [
        ...startPlans(),
        // C4 prints a GRAIL Ⅶ field — a real change when designated a Utopia.
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: false, tileDefId: "C4", ...(viiField ? { viiField } : {}) }
      ]
    });
  }

  it("forces the Ⅶ field to a Dragon Utopia at setup — the field rules auto-activate for a designer Utopia", () => {
    const state = faceUpCenter("dragon_utopia");
    const field = objectiveField(state);
    expect(field?.location).toBe("dragon_utopia");
    expect(field?.difficulty).toBe(7);

    // A designer-placed Utopia auto-activates the Grail & Dragon Utopia field
    // rules (no separate toggle): a normal Level-VII fight vs 2 Azure guards
    // PLUS a Black Dragon (the Utopia signature).
    const draws = drawGuardArmy(state, field!, 7);
    expect(draws.map((draw) => draw.tier)).toEqual(["azure", "azure", "gold"]);
    expect(draws.at(-1)?.unitDefId).toBe("neutral.black_dragons");
  });

  it("CONTROL: no viiField keeps C4's printed Grail field", () => {
    const state = faceUpCenter();
    const field = objectiveField(state);
    expect(field?.location).toBe("grail");
    expect(field?.difficulty).toBe(7);
  });

  it("auto-activates the Grail & Dragon Utopia field rules for a designer-placed objective (no toggle)", () => {
    // A designer who PLACES a Grail/Utopia gets the field rules without also
    // toggling the house rule — so the Grail digs / the Utopia gets its Black
    // Dragon, never the old generic Level-VII artifact bank.
    expect(grailUtopiaFieldRulesEnabled(faceUpCenter("grail"))).toBe(true);
    expect(grailUtopiaFieldRulesEnabled(faceUpCenter("dragon_utopia"))).toBe(true);
    // CONTROL: a plain map with no Grail/Utopia designation leaves them off.
    const plain = createAdventureGameState({
      seed: "vii-auto-control",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest"
    });
    expect(grailUtopiaFieldRulesEnabled(plain)).toBe(false);
  });
});

describe("Random Town is always a VII siege", () => {
  it("keeps VII reward/round rules with custom guards and places walls without an Arrow Tower", () => {
    const state = createAdventureGameState({
      seed: "random-town-vii-siege",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    clearHandGate(state);
    const hero = getMainHero(state, "p1")!;
    const randomTown: MapFieldState = {
      ...fieldWith("random_town"),
      spaceId: "70,70",
      // Mutation control: a bad map customization tries to downgrade the field.
      difficulty: 2,
      customGuardUnits: ["neutral.magi"]
    };
    state.adventure!.fields[randomTown.spaceId] = randomTown;
    hero.spaceId = randomTown.spaceId;

    startNeutralEncounter(state, hero, randomTown);

    expect(state.combat?.context.kind).toBe("neutral");
    if (state.combat?.context.kind !== "neutral") return;
    expect(state.combat.context.difficulty).toBe(7);
    expect(state.combat.siege?.walls).toHaveLength(3);
    expect(state.combat.siege?.gatePosition).not.toBeNull();
    expect(state.combat.siege?.arrowTowerUnitId).toBeNull();
    expect(state.combat.boardArtId).toBe("castle-siege");

    hero.level = 3;
    hero.experience = 4;
    state.combat.setup = null;
    state.combat.units = {};
    state.combat.activeUnitId = null;
    state.combat.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutral",
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);
    expect(hero.experience).toBe(MAX_EXPERIENCE);
    expect(hero.level).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 2. Face-down center slot + viiField "grail": real grail bookkeeping on reveal,
//    masked in other players' views until then.
// ---------------------------------------------------------------------------
describe("Ⅶ designation — face-down center slot", () => {
  function faceDownGrailGame(viiField?: CustomMapTilePlan["viiField"]): GameState {
    const state = createAdventureGameState({
      seed: "vii-facedown",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "grail",
      // C1 prints a Dragon Utopia — pinning it proves the "grail" override BEATS
      // the printed field, and keeps a single materialized objective field.
      customMap: [
        ...startPlans(),
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true, tileDefId: "C1", ...(viiField ? { viiField } : {}) }
      ]
    });
    clearHandGate(state);
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "obelisk-rewards": false };
    return state;
  }

  function centerTile(state: GameState): MapTileState {
    return Object.values(state.adventure!.tiles).find(
      (tile) => tile.centerRow === CENTER.row && tile.centerCol === CENTER.col
    )!;
  }

  /** Simulate the reveal: flip the tile face-up and materialize its fields. */
  function reveal(state: GameState): MapFieldState {
    const tile = centerTile(state);
    tile.faceDown = false;
    materializeTileFields(state.adventure!, tile);
    return Object.values(state.adventure!.fields).find((field) => field.location === "grail")!;
  }

  it("materializes a real Grail dig site on reveal — the dig unlocks after 2 Obelisks", () => {
    const state = faceDownGrailGame("grail");
    // Server state holds the designation (it is NOT masked in the raw state).
    expect(centerTile(state).viiField).toBe("grail");

    const grailField = reveal(state);
    expect(grailField.location).toBe("grail");
    expect(grailField.difficulty).toBe(7);

    const hero = getMainHero(state, "p1")!;
    // Defeat the guards → arms the dig; digging before 2 Obelisks does nothing.
    hero.spaceId = grailField.spaceId;
    beginFieldVisit(state, hero.id, grailField.spaceId, false);
    expect(grailField.grailDiggable).toBe(true);
    expect(canDigGrail(state, "p1")).toBe(false);

    // Visiting 2 distinct Obelisks unlocks the dig — real grail bookkeeping.
    const o1 = injectObelisk(state, "60,60");
    const o2 = injectObelisk(state, "61,61");
    hero.spaceId = o1.spaceId;
    beginFieldVisit(state, hero.id, o1.spaceId, false);
    hero.spaceId = o2.spaceId;
    beginFieldVisit(state, hero.id, o2.spaceId, false);
    expect(canDigGrail(state, "p1")).toBe(true);
  });

  it("a 'grail' designation BEATS a printed Dragon Utopia (the documented FORCE rule)", () => {
    // The hidden Grail & Dragon Utopia package pins hidden identities onto
    // RANDOM centre tiles — if a printed Utopia could refuse the "grail"
    // designation, an unlucky draw would leave the map with two Utopias and
    // zero dig sites, making a Grail victory unwinnable.
    const state = createAdventureGameState({
      seed: "vii-identity-locked-utopia",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap: [
        ...startPlans(),
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true, tileDefId: "C1", viiField: "grail" }
      ]
    });
    const tile = Object.values(state.adventure!.tiles).find((entry) => entry.tileDefId === "C1")!;
    tile.faceDown = false;
    materializeTileFields(state.adventure!, tile);

    const objective = Object.values(state.adventure!.fields).find(
      (field) => field.tileInstanceId === tile.id && field.difficulty === 7
    );
    expect(objective?.location).toBe("grail");
  });

  it("allows a forced Dragon Utopia to replace a printed Grail as a real Utopia", () => {
    const state = createAdventureGameState({
      seed: "vii-identity-grail-to-utopia",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap: [
        ...startPlans(),
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true, tileDefId: "C4", viiField: "dragon_utopia" }
      ]
    });
    const tile = Object.values(state.adventure!.tiles).find((entry) => entry.tileDefId === "C4")!;
    tile.faceDown = false;
    materializeTileFields(state.adventure!, tile);

    const objective = Object.values(state.adventure!.fields).find(
      (field) => field.tileInstanceId === tile.id && field.difficulty === 7
    );
    expect(objective?.location).toBe("dragon_utopia");
    expect(objective?.grailDiggable).toBeUndefined();
  });

  it("masks a face-down center slot's Ⅶ designation in another player's view until reveal", () => {
    const state = faceDownGrailGame("grail");
    const tileId = centerTile(state).id;

    const p2View = getPlayerView(state, "p2");
    const maskedTile = p2View.adventure!.tiles[tileId];
    // The hidden slot leaks neither its identity NOR its forced objective.
    expect(maskedTile.tileDefId).toBe("hidden");
    expect(maskedTile.viiField).toBeUndefined();
  });

  it("masks a face-down center slot's Ⅶ MULTI-SELECT (viiFields) the same way", () => {
    // Mutation control: the multi-select carries the same objective info as
    // viiField — leaking it would tell opponents the hidden slot is (say)
    // Grail-or-Utopia before discovery.
    const state = faceDownGrailGame("grail");
    const tile = centerTile(state);
    tile.viiFields = ["grail", "dragon_utopia"];
    tile.playerViiPick = true;

    const p2View = getPlayerView(state, "p2");
    const maskedTile = p2View.adventure!.tiles[tile.id];
    expect(maskedTile.viiFields).toBeUndefined();
    // The owner-agnostic pick FLAG may stay (behaviour-public, like a pending
    // token) — only the designation set is secret.
  });

  it("balances hidden Grail/Utopia pairs across editor-authored positions", () => {
    const pairedPlan = (row: number, col: number): CustomMapTilePlan => ({
      row,
      col,
      group: "center",
      faceDown: true,
      viiFields: ["grail", "dragon_utopia"]
    });
    const countsFor = (seed: string, count: 3 | 4) => {
      const positions = [
        [24, 20],
        [24, 30],
        [34, 20],
        [34, 30]
      ].slice(0, count);
      const state = createAdventureGameState({
        seed,
        difficulty: "normal",
        rollFirstPlayer: false,
        victoryMode: "conquest",
        customMap: [
          ...startPlans(),
          ...positions.map(([row, col]) => pairedPlan(row, col))
        ],
        customMapPreset: { objectives: { hiddenGrailUtopia: true } }
      });
      const designated = Object.values(state.adventure!.tiles)
        .filter((tile) => tile.group === "center")
        .map((tile) => tile.viiField);
      return {
        grail: designated.filter((entry) => entry === "grail").length,
        utopia: designated.filter((entry) => entry === "dragon_utopia").length
      };
    };

    expect(countsFor("designer-balanced-four", 4)).toEqual({ grail: 2, utopia: 2 });
    const threeSplits = new Set<string>();
    for (let index = 0; index < 12; index += 1) {
      const counts = countsFor(`designer-balanced-three-${index}`, 3);
      expect(counts.grail + counts.utopia).toBe(3);
      expect([1, 2]).toContain(counts.grail);
      threeSplits.add(`${counts.grail}:${counts.utopia}`);
    }
    expect(threeSplits).toEqual(new Set(["1:2", "2:1"]));
  });

  it("CONTROL: a face-down center pinned to a Utopia tile keeps the Utopia when NOT designated", () => {
    const state = createAdventureGameState({
      seed: "vii-facedown-control",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: [
        ...startPlans(),
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true, tileDefId: "C1" }
      ]
    });
    const tile = Object.values(state.adventure!.tiles).find((t) => t.tileDefId === "C1")!;
    expect(tile.viiField).toBeUndefined();
    tile.faceDown = false;
    materializeTileFields(state.adventure!, tile);
    expect(objectiveField(state)?.location).toBe("dragon_utopia");
  });
});

// ---------------------------------------------------------------------------
// 2b. An UNPINNED Ⅶ slot's designation must land on a tile that PRINTS it.
//
// REPORTED BUG 2026-08-09, verbatim: "2nd tile - Grail - was mix of utopia and
// grail". The hidden Grail & Dragon Utopia package assigns a balanced 2 Grails +
// 2 Utopias across the paired face-down centre slots, but each slot used to draw
// an ARBITRARY centre tile: a "grail" slot could land on C1 (which PRINTS a
// Dragon Utopia) or on &C1 (an Airship Yard). materializeTileFields then forced
// the FIELD to the designation while the board still showed the printed tile —
// the hex pictured a Dragon Utopia / Airship Yard and acted as a Grail, and the
// rotation preview (which draws the printed field def) said the same. One tile,
// two identities. A slot that carries the designation now draws a tile whose own
// printed Ⅶ objective IS that designation whenever the pool still holds one, so
// art, printed field, guards and rewards all agree.
// ---------------------------------------------------------------------------
describe("Ⅶ designation — an unpinned slot draws a tile that PRINTS its objective", () => {
  /** The four centre slots of the reported map: 4 paired mystery Ⅶ objectives. */
  const MYSTERY_CENTERS = [
    { row: 9, col: 4 },
    { row: 7, col: 6 },
    { row: 11, col: 2 },
    { row: 5, col: 8 }
  ] as const;

  function mysteryGame(seed: string): GameState {
    return createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: [
        ...startPlans(),
        ...MYSTERY_CENTERS.map((center) => ({
          row: center.row,
          col: center.col,
          group: "center" as const,
          faceDown: true,
          viiFields: ["grail", "dragon_utopia"] as CustomMapTilePlan["viiFields"]
        }))
      ],
      customMapPreset: { objectives: { hiddenGrailUtopia: true } }
    });
  }

  /** The printed Ⅶ objective of a tile definition (every centre tile has one). */
  function printedVii(tileDefId: string): string | undefined {
    return allTileDefinitions[tileDefId]?.fields.find((field) => field.difficulty === 7)?.location;
  }

  it("the hidden package's 2 Grails + 2 Utopias each sit on a tile that prints that objective", () => {
    for (const seed of ["mystery-a", "mystery-b", "mystery-c", "mystery-d"]) {
      const state = mysteryGame(seed);
      const centers = Object.values(state.adventure!.tiles).filter((tile) => tile.group === "center");
      expect(centers).toHaveLength(4);
      const designations = centers.map((tile) => tile.viiField);
      // The balanced pool contract: four paired slots = 2 Grails + 2 Utopias.
      expect(designations.filter((entry) => entry === "grail")).toHaveLength(2);
      expect(designations.filter((entry) => entry === "dragon_utopia")).toHaveLength(2);

      for (const tile of centers) {
        expect(
          printedVii(tile.tileDefId),
          `${seed}: tile ${tile.tileDefId} designated ${tile.viiField} must PRINT that objective`
        ).toBe(tile.viiField);
        // …and materializing is then a pure no-op override: the live field agrees
        // with both the designation and the printed tile.
        tile.faceDown = false;
        materializeTileFields(state.adventure!, tile);
        const objective = Object.values(state.adventure!.fields).find(
          (field) => field.tileInstanceId === tile.id && field.difficulty === 7
        );
        expect(objective?.location).toBe(tile.viiField);
      }
    }
  });

  it("a designated Grail really fights and pays as a Grail (no Utopia guards, no artifacts)", () => {
    const state = mysteryGame("mystery-behaviour");
    for (const tile of Object.values(state.adventure!.tiles)) {
      if (tile.faceDown) {
        tile.faceDown = false;
        materializeTileFields(state.adventure!, tile);
      }
    }
    const objectives = Object.values(state.adventure!.fields).filter((field) => field.difficulty === 7);
    const grails = objectives.filter((field) => field.location === "grail");
    const utopias = objectives.filter((field) => field.location === "dragon_utopia");
    expect(grails).toHaveLength(2);
    expect(utopias).toHaveLength(2);

    const hero = getMainHero(state, "p1")!;
    const artifactSearches = () =>
      state.adventure!.rewardQueue.filter(
        (reward) => reward.kind === "shared-deck-search" && String(reward.deckId).startsWith("artifact")
      ).length;

    // A Grail: plain Ⅶ neutral guards (the Utopia draw appends a Black Dragon),
    // no artifact ladder, and the dig is armed.
    const grail = grails[0];
    expect(
      drawGuardArmy(state, grail, 7).some((draw) => draw.unitDefId === "neutral.black_dragons")
    ).toBe(false);
    const searchesBefore = artifactSearches();
    hero.spaceId = grail.spaceId;
    beginFieldVisit(state, hero.id, grail.spaceId, false);
    expect(artifactSearches(), "a Grail field pays NO artifacts").toBe(searchesBefore);
    expect(grail.grailDiggable).toBe(true);

    // CONTROL: the Utopia on the same map pays its full package and never digs.
    const utopia = utopias[0];
    expect(
      drawGuardArmy(state, utopia, 7).some((draw) => draw.unitDefId === "neutral.black_dragons")
    ).toBe(true);
    hero.spaceId = utopia.spaceId;
    beginFieldVisit(state, hero.id, utopia.spaceId, false);
    expect(artifactSearches()).toBe(searchesBefore + 2);
    expect(utopia.grailDiggable ?? false).toBe(false);
  });

  it("SCOPE: a FACE-UP slot always names its own tile, so nothing there is swapped", () => {
    // The designation-matched draw is face-DOWN only. A face-up slot that names
    // no tile is refused at validation, which is what keeps that branch honest.
    const { problems } = validateCustomMapPlan(
      [
        ...startPlans(),
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: false, viiField: "grail" }
      ],
      getScenario("skirmish")
    );
    expect(problems.join(" ")).toContain("pick a tile for the face-up slot");
  });

  it("CONTROL: an EXPLICIT tile pin keeps the designer's deliberate mismatch", () => {
    // Pinning C1 (a printed Dragon Utopia) and designating it a Grail is an
    // authored choice — the FORCE rule still wins, and the tile is not swapped.
    const state = createAdventureGameState({
      seed: "vii-pin-mismatch-kept",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: [
        ...startPlans(),
        {
          row: CENTER.row,
          col: CENTER.col,
          group: "center",
          faceDown: true,
          tileDefId: "C1",
          viiField: "grail"
        }
      ]
    });
    const tile = Object.values(state.adventure!.tiles).find((entry) => entry.group === "center")!;
    expect(tile.tileDefId, "an explicit pin is never swapped").toBe("C1");
    tile.faceDown = false;
    materializeTileFields(state.adventure!, tile);
    expect(objectiveField(state)?.location).toBe("grail");
  });
});

// ---------------------------------------------------------------------------
// 3. "town" designation → the neutral Random Town (conquerable / flaggable).
// ---------------------------------------------------------------------------
describe("Ⅶ designation — town", () => {
  it("makes the Ⅶ field a conquerable Random Town with printed-random-town semantics", () => {
    const state = createAdventureGameState({
      seed: "vii-town",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      // C1 prints a Dragon Utopia — designating it a town is a real change.
      customMap: [
        ...startPlans(),
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: false, tileDefId: "C1", viiField: "town" }
      ]
    });
    const field = objectiveField(state)!;
    expect(field.location).toBe("random_town");
    expect(field.difficulty).toBe(7);

    // Defended by an unused faction's printed party (the Random Town guard draw:
    // 1 bronze Pack + 2 silver Packs + 2 gold Fews — see random-town-defenders).
    const draws = drawGuardArmy(state, field, 7);
    expect(draws.length).toBeGreaterThan(0);
    expect(draws.every((draw) => (draw.factionPack || draw.factionFew) && draw.bankGuard)).toBe(true);

    // Conquerable: visiting after the guards fall flags it for +10 gold income.
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const incomeBefore = state.players.p1.production.gold;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");
    expect(state.players.p1.production.gold).toBe(incomeBefore + 10);
  });
});

// ---------------------------------------------------------------------------
// 4. No-op: a designation that matches the printed field changes NOTHING.
// ---------------------------------------------------------------------------
describe("Ⅶ designation — no-op when it already matches", () => {
  function faceUpField(tileDefId: string, viiField?: CustomMapTilePlan["viiField"]): MapFieldState {
    const state = createAdventureGameState({
      seed: `vii-noop-${tileDefId}-${viiField ?? "none"}`,
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: [
        ...startPlans(),
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: false, tileDefId, ...(viiField ? { viiField } : {}) }
      ]
    });
    return objectiveField(state)!;
  }

  it("designating a Grail tile 'grail' is deep-equal to the undesignated field", () => {
    const designated = faceUpField("C2", "grail"); // C2 prints a Grail Ⅶ field
    const control = faceUpField("C2");
    expect(designated.location).toBe("grail");
    expect(designated).toEqual(control);
  });

  it("designating a Dragon Utopia tile 'dragon_utopia' is deep-equal to the undesignated field", () => {
    const designated = faceUpField("C1", "dragon_utopia"); // C1 prints a Utopia Ⅶ field
    const control = faceUpField("C1");
    expect(designated.location).toBe("dragon_utopia");
    expect(designated).toEqual(control);
  });
});

// ---------------------------------------------------------------------------
// 5. Conflict helper.
// ---------------------------------------------------------------------------
describe("victoryDesignConflicts", () => {
  const town = (): CustomMapTilePlan => ({
    row: CENTER.row,
    col: CENTER.col,
    group: "center",
    faceDown: false,
    tileDefId: "C1",
    viiField: "town"
  });

  it("Holy Grail: designs that eat all Grail capacity conflict; Near/Far overflow rescues it", () => {
    // Every centre slot designated away from a Grail, no Near/Far overflow slots.
    const noCapacity = victoryDesignConflicts([...startPlans(), town()], "grail");
    expect(noCapacity).toHaveLength(1);
    expect(noCapacity[0]).toMatch(/Grail dig sites/i);

    // The near/far-overflow nuance: the SAME designation is fine once two
    // face-down Near/Far slots can host the two Grail dig sites.
    const rescued = victoryDesignConflicts(
      [
        ...startPlans(),
        town(),
        { row: 7, col: 6, group: "near", faceDown: true },
        { row: 11, col: 2, group: "far", faceDown: true }
      ],
      "grail"
    );
    expect(rescued).toEqual([]);
  });

  it("Holy Grail: a single Grail-capable slot still conflicts (needs 2 dig sites)", () => {
    const oneSite = victoryDesignConflicts(
      [...startPlans(), { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true }],
      "grail"
    );
    expect(oneSite).toHaveLength(1);

    // Two centre slots (or one centre + overflow) reach the 2-site capacity.
    const twoSites = victoryDesignConflicts(
      [
        ...startPlans(),
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true },
        { row: 7, col: 6, group: "near", faceDown: true },
        { row: 11, col: 2, group: "far", faceDown: true }
      ],
      "grail"
    );
    expect(twoSites).toEqual([]);
  });

  it("Dragon modes: a no-Utopia design conflicts; a Utopia designation clears it", () => {
    for (const mode of ["dragon-hunt", "dragon-conqueror"] as const) {
      const noUtopia = victoryDesignConflicts(
        [
          ...startPlans(),
          { row: CENTER.row, col: CENTER.col, group: "center", faceDown: false, tileDefId: "C2", viiField: "grail" }
        ],
        mode
      );
      expect(noUtopia, mode).toHaveLength(1);
      expect(noUtopia[0]).toMatch(/Dragon Utopia/i);

      const withUtopia = victoryDesignConflicts(
        [
          ...startPlans(),
          { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true, viiField: "dragon_utopia" }
        ],
        mode
      );
      expect(withUtopia, mode).toEqual([]);
    }
  });

  it("Conquest and scenario-driven maps never conflict", () => {
    expect(victoryDesignConflicts([...startPlans(), town()], "conquest")).toEqual([]);
    // No customMap = scenario forcing handles the objective — never a conflict.
    expect(victoryDesignConflicts([], "grail")).toEqual([]);
    expect(victoryDesignConflicts([], "dragon-hunt")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. START BLOCK through the real start action path.
// ---------------------------------------------------------------------------
describe("start block — conflicting designs are refused", () => {
  function lobbyWith(customMap: CustomMapTilePlan[]): GameState {
    let state = createAdventureLobbyState({ seed: "vii-start-block", scenarioId: "skirmish" });
    const apply = (action: Parameters<typeof applyAction>[1]) => {
      const result = applyAction(state, action);
      expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
      state = result.state;
    };
    apply({
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { scenarioId: "skirmish", playerCount: 2, customMap, customMapPreset: { victoryMode: "grail" } }
    });
    apply({ type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" });
    apply({ type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "gelu" });
    return state;
  }

  it("refuses to start a Grail game whose design has no Grail capacity — lobby stays intact", () => {
    const state = lobbyWith([
      ...startPlans(),
      { row: CENTER.row, col: CENTER.col, group: "center", faceDown: false, tileDefId: "C1", viiField: "town" }
    ]);
    const result = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(result.errors.some((error) => /Grail dig sites/i.test(error.message))).toBe(true);
    // The lobby is untouched — still in setup, not built.
    expect(result.state.phase).toBe("setup");
    expect(result.state.setupLobby).not.toBeNull();
  });

  it("CONTROL: a compatible Grail design starts normally", () => {
    const state = lobbyWith([
      ...startPlans(),
      { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true },
      { row: 7, col: 6, group: "near", faceDown: true },
      { row: 11, col: 2, group: "far", faceDown: true }
    ]);
    const result = applyAction(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    expect(result.state.phase).toBe("player-turn");
  });

  it("an authored Hidden Grail/Utopia map cannot also select a Grail or Dragon preset", () => {
    let state = createAdventureLobbyState({ seed: "vii-owned-objective", scenarioId: "skirmish" });
    const picked = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        customMap: [
          ...startPlans(),
          {
            row: CENTER.row,
            col: CENTER.col,
            group: "center",
            faceDown: true,
            viiFields: ["grail", "dragon_utopia"]
          }
        ],
        customMapPreset: { objectives: { hiddenGrailUtopia: true }, victoryMode: "dragon-hunt" }
      }
    });
    expect(picked.errors).toHaveLength(0);
    state = picked.state;
    expect(state.setupLobby?.options.victoryMode).toBe("conquest");

    const forbidden = applyAction(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { victoryMode: "grail" }
    });
    expect(forbidden.errors.some((error) => /already contains Hidden Grail/i.test(error.message))).toBe(true);
    expect(forbidden.state.setupLobby?.options.victoryMode).toBe("conquest");
  });
});

// ---------------------------------------------------------------------------
// 7. Objectives options.
// ---------------------------------------------------------------------------
describe("objectives options", () => {
  function grailDigGame(grailObelisksRequiredValue?: 1 | 2 | 3 | 4): GameState {
    const state = createAdventureGameState({
      seed: "vii-obelisks-req",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "grail"
    });
    clearHandGate(state);
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "obelisk-rewards": false };
    if (grailObelisksRequiredValue !== undefined) {
      state.adventure!.mapPreset = { objectives: { grailObelisksRequired: grailObelisksRequiredValue } };
    }
    const grailField: MapFieldState = {
      spaceId: "70,70",
      tileInstanceId: "grail-tile",
      slot: 0,
      location: "grail",
      difficulty: 7,
      blackCube: true,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      grailDiggable: true
    };
    state.adventure!.fields[grailField.spaceId] = grailField;
    return state;
  }

  it("grailObelisksRequired=1 unlocks the dig after ONE Obelisk (CONTROL: default needs 2)", () => {
    const state = grailDigGame(1);
    expect(grailObelisksRequired(state)).toBe(1);
    const hero = getMainHero(state, "p1")!;
    const o1 = injectObelisk(state, "60,60");
    hero.spaceId = o1.spaceId;
    beginFieldVisit(state, hero.id, o1.spaceId, false);
    expect(canDigGrail(state, "p1")).toBe(true);

    // CONTROL: the default requirement (2) is still locked after one Obelisk.
    const control = grailDigGame();
    expect(grailObelisksRequired(control)).toBe(2);
    const controlHero = getMainHero(control, "p1")!;
    const c1 = injectObelisk(control, "60,60");
    controlHero.spaceId = c1.spaceId;
    beginFieldVisit(control, controlHero.id, c1.spaceId, false);
    expect(canDigGrail(control, "p1")).toBe(false);
  });

  it("utopiaGuards='four' draws the full four-dragon party (CONTROL: default scales to 2 at Normal)", () => {
    const four = createAdventureGameState({ seed: "vii-guards-four", difficulty: "normal", rollFirstPlayer: false });
    four.adventure!.mapPreset = { objectives: { utopiaGuards: "four" } };
    expect(drawGuardArmy(four, fieldWith("dragon_utopia"), 7)).toHaveLength(4);

    // CONTROL: no objectives → the by-difficulty count (Normal = 2).
    const control = createAdventureGameState({ seed: "vii-guards-def", difficulty: "normal", rollFirstPlayer: false });
    expect(dragonUtopiaDifficultyGuardCount(control, 7)).toBe(2);
    expect(drawGuardArmy(control, fieldWith("dragon_utopia"), 7)).toHaveLength(2);
  });

  it("utopiaBonusSearch grants the defeater an EXTRA Artifact Search (CONTROL: none without it)", () => {
    const withBonus = createAdventureGameState({ seed: "vii-bonus", difficulty: "normal", rollFirstPlayer: false, victoryMode: "conquest" });
    withBonus.adventure!.mapPreset = { objectives: { utopiaBonusSearch: 3 } };
    const field: MapFieldState = { ...fieldWith("dragon_utopia"), spaceId: "88,88" };
    withBonus.adventure!.fields[field.spaceId] = field;
    const hero = getMainHero(withBonus, "p1")!;
    hero.spaceId = field.spaceId;
    beginFieldVisit(withBonus, hero.id, field.spaceId, false);
    // 2026-08-13: the Utopia's OWN reward is two fixed Artifact Search (3)
    // rewards (it used to be a hardcoded Relic Search(2), then 3 / 5 / 5), so
    // the opt-in bonus is the THIRD Search appended after them — every entry is
    // a 3 now, so the LENGTH is the discriminator, not the count.
    const searchCounts = (state: GameState): number[] =>
      state
        .adventure!.rewardQueue.filter(
          (reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts"
        )
        .map((reward) => (reward.kind === "shared-deck-search" ? reward.count : 0));
    expect(searchCounts(withBonus)).toEqual([3, 3, 3]);

    // CONTROL: no objectives → the Utopia's own three Searches and no fourth.
    const control = createAdventureGameState({ seed: "vii-bonus-ctl", difficulty: "normal", rollFirstPlayer: false, victoryMode: "conquest" });
    const cField: MapFieldState = { ...fieldWith("dragon_utopia"), spaceId: "88,88" };
    control.adventure!.fields[cField.spaceId] = cField;
    const cHero = getMainHero(control, "p1")!;
    cHero.spaceId = cField.spaceId;
    beginFieldVisit(control, cHero.id, cField.spaceId, false);
    expect(searchCounts(control)).toEqual([3, 3]);
  });
});

// ---------------------------------------------------------------------------
// 7b. Designer center-hex customization: guard / first-clear reward / VP.
// ---------------------------------------------------------------------------
describe("center hex — designer guard, reward + Victory Points", () => {
  // A conquest game whose single center is the C2 tile (prints a Grail Ⅶ field —
  // a plain Lvl-VII bank in conquest mode), optionally customized. NO viiField
  // designation: the customization must work on the PRINTED objective (the old
  // build's editor was gated on a designation, which is exactly the bug this
  // suite pins). Valuables isolate the reward: the printed clear reward is
  // gold, so a valuables gain can ONLY be the designer reward.
  function centerHexGame(centerHex?: CustomCenterHexPlan, seed = "vii-center-hex"): GameState {
    return createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: [
        ...startPlans(),
        {
          row: CENTER.row,
          col: CENTER.col,
          group: "center",
          faceDown: false,
          tileDefId: "C2", // C2 prints a Grail Ⅶ field
          ...(centerHex ? { centerHex } : {})
        }
      ]
    });
  }

  it("materializes the reward + VP onto the PRINTED Ⅶ field (no designation needed) and grants them on the first clear", () => {
    const state = centerHexGame({ reward: { valuables: 4 }, vp: 5 });
    const field = objectiveField(state)!;
    expect(field.centerHexReward).toEqual({ valuables: 4 });
    expect(field.centerHexVp).toBe(5);
    expect(field.centerHexClaimed).toBeUndefined();

    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const valuablesBefore = state.players.p1.resources.valuables;
    beginFieldVisit(state, hero.id, field.spaceId, false);

    // Observable: valuables rose by EXACTLY the designer reward, the capturer's VP
    // ledger recorded the designer VP, and the claim latched.
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 4);
    expect(state.adventure!.vpLedger?.p1?.viiCenterVp).toBe(5);
    expect(field.centerHexClaimed).toBe(true);
  });

  it("queues Treasure dice + deck Searches as a visit-steps reward (CONTROL: none without them)", () => {
    const state = centerHexGame({ reward: { treasureDice: 2, searchSpell: 3, searchArtifact: 1 } });
    const field = objectiveField(state)!;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    const queued = state.adventure!.rewardQueue.find((reward) => reward.kind === "visit-steps");
    expect(queued && queued.kind === "visit-steps" ? queued.steps : []).toEqual([
      { type: "ROLL_TREASURE_DICE", count: 2 },
      { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 3 },
      { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 1 }
    ]);

    // CONTROL: no designed reward → no visit-steps reward queued by the clear.
    const control = centerHexGame(undefined, "vii-center-hex-ctl");
    const cField = objectiveField(control)!;
    const cHero = getMainHero(control, "p1")!;
    cHero.spaceId = cField.spaceId;
    beginFieldVisit(control, cHero.id, cField.spaceId, false);
    expect(control.adventure!.rewardQueue.some((reward) => reward.kind === "visit-steps")).toBe(false);
  });

  it("expands Times × Search(X) into multiple Search steps (CONTROL: times absent = one)", () => {
    const state = centerHexGame({
      reward: { searchArtifact: 5, searchArtifactTimes: 2, searchSpell: 3 }
    });
    const field = objectiveField(state)!;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    const queued = state.adventure!.rewardQueue.find((reward) => reward.kind === "visit-steps");
    expect(queued && queued.kind === "visit-steps" ? queued.steps : []).toEqual([
      { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 3 },
      { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 5 },
      { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 5 }
    ]);

    // CONTROL: no times field → still exactly one Search of that size.
    const single = centerHexGame({ reward: { searchArtifact: 5 } }, "vii-search-times-ctl");
    const sField = objectiveField(single)!;
    const sHero = getMainHero(single, "p1")!;
    sHero.spaceId = sField.spaceId;
    beginFieldVisit(single, sHero.id, sField.spaceId, false);
    const sQueued = single.adventure!.rewardQueue.find((reward) => reward.kind === "visit-steps");
    expect(sQueued && sQueued.kind === "visit-steps" ? sQueued.steps : []).toEqual([
      { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 5 }
    ]);
  });

  it("grants the bonus ONCE — a re-visit never re-pays it (the claim latch)", () => {
    const state = centerHexGame({ reward: { valuables: 4 }, vp: 5 });
    const field = objectiveField(state)!;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const valuablesBefore = state.players.p1.resources.valuables;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    beginFieldVisit(state, hero.id, field.spaceId, true); // a later revisit
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 4); // still just one grant
    expect(state.adventure!.vpLedger?.p1?.viiCenterVp).toBe(5);
  });

  it("CONTROL: a plain center (no customization) grants nothing extra", () => {
    const state = centerHexGame();
    const field = objectiveField(state)!;
    expect(field.centerHexReward).toBeUndefined();
    expect(field.centerHexVp).toBeUndefined();
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const valuablesBefore = state.players.p1.resources.valuables;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore);
    expect(state.adventure!.vpLedger?.p1?.viiCenterVp).toBeUndefined();
  });

  it("a guard LEVEL override replaces the printed Ⅶ difficulty (CONTROL: printed 7 without it)", () => {
    const state = centerHexGame({ guard: { level: 3 } });
    const field = Object.values(state.adventure!.fields).find((f) => f.location === "grail")!;
    expect(field.difficulty).toBe(3);
    // The guard army drawn for the fight follows the designed level: difficulty 3
    // at Normal = 3 cards (2 bronze + 1 silver), never the azure Ⅶ party.
    const draws = drawGuardArmy(state, field, field.difficulty!);
    expect(draws).toHaveLength(3);
    expect(draws.every((draw) => draw.tier !== "azure")).toBe(true);

    // CONTROL: no guard override → the printed difficulty-7 field.
    const control = centerHexGame(undefined, "vii-guard-ctl");
    expect(objectiveField(control)?.difficulty).toBe(7);
  });

  it("an EXACT-ARMY guard mints the designed units and is never Quick-Combat skipped (CONTROL: level guard is)", () => {
    const state = centerHexGame({ guard: { units: ["neutral.cyclopes", "neutral.troglodytes"] } });
    const field = Object.values(state.adventure!.fields).find((f) => f.location === "grail")!;
    expect(field.customGuardUnits).toEqual(["neutral.cyclopes", "neutral.troglodytes"]);
    // Difficulty derives from the tiers (gold 3 + bronze 1 = 4 points → Ⅲ).
    expect(field.difficulty).toBe(3);

    // The guard army is EXACTLY the designed units, minted bank-style (never
    // drawn from the tier decks).
    const draws = drawGuardArmy(state, field, field.difficulty!);
    expect(draws.map((draw) => draw.unitDefId)).toEqual(["neutral.cyclopes", "neutral.troglodytes"]);
    expect(draws.every((draw) => draw.bankGuard)).toBe(true);

    // A hero far above the derived difficulty still has to FIGHT: the encounter
    // opens combat setup instead of a Quick-Combat win.
    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.spaceId = field.spaceId;
    clearHandGate(state);
    startNeutralEncounter(state, hero, field);
    expect(state.combat?.context.kind).toBe("neutral");
    expect(state.phase).toBe("combat-setup");
    expect(state.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(false);

    // CONTROL: the SAME derived difficulty as a plain LEVEL guard IS
    // Quick-Combat skipped by the same hero — the exact army is what blocks it.
    const control = centerHexGame({ guard: { level: 3 } }, "vii-army-ctl");
    const cField = Object.values(control.adventure!.fields).find((f) => f.location === "grail")!;
    const cHero = getMainHero(control, "p1")!;
    cHero.level = 7;
    cHero.spaceId = cField.spaceId;
    clearHandGate(control);
    startNeutralEncounter(control, cHero, cField);
    expect(control.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(true);
    expect(control.combat).toBeNull();
  });

  it("scores the captured-Ⅶ VP in computeVictoryPoints (CONTROL: no row without it)", () => {
    const state = centerHexGame({ vp: 5 });
    state.adventure!.mapPreset = { ...(state.adventure!.mapPreset ?? {}), victoryPoints: { enabled: true } };
    const field = objectiveField(state)!;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    const p1 = computeVictoryPoints(state).breakdown.find((row) => row.playerId === "p1")!;
    const capturedRow = p1.rows.find((row) => row.label.includes("objectives captured"));
    expect(capturedRow?.vp).toBe(5);

    const control = centerHexGame(undefined, "vii-vp-ctl");
    control.adventure!.mapPreset = { victoryPoints: { enabled: true } };
    const cHero = getMainHero(control, "p1")!;
    const cField = objectiveField(control)!;
    cHero.spaceId = cField.spaceId;
    beginFieldVisit(control, cHero.id, cField.spaceId, false);
    const cp1 = computeVictoryPoints(control).breakdown.find((row) => row.playerId === "p1")!;
    expect(cp1.rows.some((row) => row.label.includes("objectives captured"))).toBe(false);
  });

  it("a LEGACY mid-game snapshot's viiReward/viiVp still pays through the same seam", () => {
    // Simulate a pre-centerHex snapshot: the field carries the old names.
    const state = centerHexGame();
    const field = objectiveField(state)!;
    field.viiReward = { valuables: 6 };
    field.viiVp = 2;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const valuablesBefore = state.players.p1.resources.valuables;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 6);
    expect(state.adventure!.vpLedger?.p1?.viiCenterVp).toBe(2);
    // The legacy latch is set too, so neither name can double-pay.
    expect(field.viiBonusClaimed).toBe(true);
    expect(field.centerHexClaimed).toBe(true);
  });

  it("masks the customization on a FACE-DOWN center in other players' views", () => {
    const state = createAdventureGameState({
      seed: "vii-bonus-mask",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      customMap: [
        ...startPlans(),
        {
          row: CENTER.row,
          col: CENTER.col,
          group: "center",
          faceDown: true,
          viiField: "dragon_utopia",
          centerHex: { guard: { level: 5 }, reward: { gold: 8 }, vp: 4 }
        }
      ]
    });
    const centerTile = () =>
      Object.values(state.adventure!.tiles).find((tile) => tile.centerRow === CENTER.row && tile.centerCol === CENTER.col)!;
    // The authoritative state keeps the customization…
    expect(centerTile().centerHex).toEqual({ guard: { level: 5 }, reward: { gold: 8 }, vp: 4 });
    // …but a player view MASKS it on the still-face-down tile (like viiField).
    const view = getPlayerView(state, "p2");
    const maskedTile = Object.values(view.adventure!.tiles).find(
      (tile) => tile.centerRow === CENTER.row && tile.centerCol === CENTER.col
    )!;
    expect(maskedTile.viiField).toBeUndefined();
    expect(maskedTile.centerHex).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Sanitize / validate / describe.
// ---------------------------------------------------------------------------
describe("sanitize / validate / describe", () => {
  const scenario = getScenario("skirmish");

  it("validateCustomMapPlan strips viiField off non-center groups and drops garbage", () => {
    const { accepted } = validateCustomMapPlan(
      [
        ...startPlans(),
        // Legal on a center slot.
        { row: CENTER.row, col: CENTER.col, group: "center", faceDown: true, viiField: "grail" },
        // Illegal on a near slot — stripped.
        { row: 7, col: 6, group: "near", faceDown: true, viiField: "dragon_utopia" },
        // Garbage value on a center slot — stripped.
        { row: 11, col: 2, group: "center", faceDown: true, viiField: "castle" as unknown as CustomMapTilePlan["viiField"] }
      ],
      scenario
    );
    const center = accepted.find((plan) => plan.group === "center" && plan.row === CENTER.row);
    const near = accepted.find((plan) => plan.group === "near");
    const garbageCenter = accepted.find((plan) => plan.group === "center" && plan.row === 11);
    expect(center?.viiField).toBe("grail");
    expect(near?.viiField).toBeUndefined();
    expect(garbageCenter?.viiField).toBeUndefined();
  });

  it("validateCustomMapPlan keeps centerHex on centers (designation or not) and strips it elsewhere", () => {
    const { accepted } = validateCustomMapPlan(
      [
        ...startPlans(),
        // Center + designation → both KEPT.
        {
          row: CENTER.row,
          col: CENTER.col,
          group: "center",
          faceDown: true,
          viiField: "grail",
          centerHex: { reward: { gold: 6 }, vp: 3 }
        },
        // A customization on a non-center slot is meaningless — stripped whole.
        {
          row: 7,
          col: 6,
          group: "near",
          faceDown: true,
          centerHex: { reward: { gold: 5 }, vp: 2 }
        },
        // A center slot with a customization but NO designation — KEPT (it
        // customizes the printed objective; the old build wrongly required a
        // designation). Garbage inside is clamped away.
        {
          row: 11,
          col: 2,
          group: "center",
          faceDown: true,
          centerHex: {
            reward: { valuables: 9 },
            guard: { units: ["not.a.unit"] }
          } as CustomCenterHexPlan
        }
      ],
      scenario
    );
    const center = accepted.find((plan) => plan.group === "center" && plan.row === CENTER.row);
    const near = accepted.find((plan) => plan.group === "near");
    const printedCenter = accepted.find((plan) => plan.group === "center" && plan.row === 11);
    expect(center?.centerHex).toEqual({ reward: { gold: 6 }, vp: 3 });
    expect(near?.centerHex).toBeUndefined();
    expect(printedCenter?.centerHex).toEqual({ reward: { valuables: 9 } });
  });

  it("sanitizeCustomMapPreset keeps valid objectives and drops garbage", () => {
    const kept = sanitizeCustomMapPreset({
      objectives: { grailObelisksRequired: 3, utopiaGuards: "four", utopiaBonusSearch: 2 }
    });
    expect(kept?.objectives).toEqual({ grailObelisksRequired: 3, utopiaGuards: "four", utopiaBonusSearch: 2 });

    // Out-of-range / unknown values are dropped; an all-garbage block vanishes.
    const clamped = sanitizeCustomMapPreset({
      victoryMode: "grail",
      objectives: { grailObelisksRequired: 9, utopiaGuards: "many", utopiaBonusSearch: 0 }
    });
    expect(clamped?.objectives).toBeUndefined();
    expect(clamped?.victoryMode).toBe("grail");
  });

  it("describeCustomMapPresetEntries emits 🏆 / 🐉 objective lines", () => {
    const entries = describeCustomMapPresetEntries({
      objectives: { grailObelisksRequired: 1, utopiaGuards: "four", utopiaBonusSearch: 2 }
    });
    const texts = entries.map((entry) => `${entry.icon} ${entry.text}`);
    expect(texts).toContain("🏆 Grail dig needs 1 Obelisk");
    expect(texts).toContain("🐉 Dragon Utopia guards: always four dragons");
    expect(texts).toContain("🐉 Dragon Utopia bonus: Search(2) Artifacts");
  });

  it("VII_FIELD_LOCATION maps 'town' to the printed Random Town field", () => {
    expect(VII_FIELD_LOCATION.town).toBe("random_town");
    expect(VII_FIELD_LOCATION.grail).toBe("grail");
    expect(VII_FIELD_LOCATION.dragon_utopia).toBe("dragon_utopia");
  });
});
