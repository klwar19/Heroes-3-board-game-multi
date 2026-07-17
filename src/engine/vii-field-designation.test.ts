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
  VII_FIELD_LOCATION
} from "./adventure";
import {
  createAdventureGameState,
  validateCustomMapPlan,
  getScenario
} from "./adventure-setup";
import { applyAction, computeVictoryPoints, createAdventureLobbyState } from "./index";
import { getPlayerView } from "./player-view";
import {
  describeCustomMapPresetEntries,
  sanitizeCustomMapPreset,
  victoryDesignConflicts
} from "./map-preset";
import type {
  CustomMapTilePlan,
  GameState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  PlayerId,
  ViiFieldReward
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

  it("forces the Ⅶ field to a Dragon Utopia at setup — and it is fightable like a printed one", () => {
    const state = faceUpCenter("dragon_utopia");
    const field = objectiveField(state);
    expect(field?.location).toBe("dragon_utopia");
    expect(field?.difficulty).toBe(7);

    // Fightable exactly like a printed Utopia: the guard draw is the minted azure
    // dragon party (reusing the Utopia guard-draw path).
    const draws = drawGuardArmy(state, field!, 7);
    expect(draws.length).toBeGreaterThanOrEqual(1);
    expect(draws.every((draw) => draw.tier === "azure" && draw.bankGuard === true)).toBe(true);
  });

  it("CONTROL: no viiField keeps C4's printed Grail field", () => {
    const state = faceUpCenter();
    const field = objectiveField(state);
    expect(field?.location).toBe("grail");
    expect(field?.difficulty).toBe(7);
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
    return Object.values(state.adventure!.tiles).find((tile) => tile.tileDefId === "C1")!;
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

  it("masks a face-down center slot's Ⅶ designation in another player's view until reveal", () => {
    const state = faceDownGrailGame("grail");
    const tileId = centerTile(state).id;

    const p2View = getPlayerView(state, "p2");
    const maskedTile = p2View.adventure!.tiles[tileId];
    // The hidden slot leaks neither its identity NOR its forced objective.
    expect(maskedTile.tileDefId).toBe("hidden");
    expect(maskedTile.viiField).toBeUndefined();
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

    // Defended by an unused faction's Packs (the printed Random Town guard draw).
    const draws = drawGuardArmy(state, field, 7);
    expect(draws.length).toBeGreaterThan(0);
    expect(draws.every((draw) => draw.factionPack && draw.bankGuard)).toBe(true);

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
    // The distinct count-3 Search is the bonus, on top of the printed Relic
    // Search(2) — a count no printed Utopia reward carries.
    const bonusRewards = withBonus.adventure!.rewardQueue.filter(
      (reward) => reward.kind === "shared-deck-search" && reward.count === 3 && reward.deckId === "artifacts"
    );
    expect(bonusRewards).toHaveLength(1);

    // CONTROL: no objectives → only the printed reward, no count-3 bonus Search.
    const control = createAdventureGameState({ seed: "vii-bonus-ctl", difficulty: "normal", rollFirstPlayer: false, victoryMode: "conquest" });
    const cField: MapFieldState = { ...fieldWith("dragon_utopia"), spaceId: "88,88" };
    control.adventure!.fields[cField.spaceId] = cField;
    const cHero = getMainHero(control, "p1")!;
    cHero.spaceId = cField.spaceId;
    beginFieldVisit(control, cHero.id, cField.spaceId, false);
    expect(
      control.adventure!.rewardQueue.filter((reward) => reward.kind === "shared-deck-search" && reward.count === 3)
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7b. Designer reward + Victory Points on a Ⅶ objective center.
// ---------------------------------------------------------------------------
describe("Ⅶ designation — designer reward + Victory Points", () => {
  // A conquest game whose single center is a designer Grail Ⅶ objective (a plain
  // Lvl-VII bank in conquest mode — the consolation path), optionally carrying a
  // designer bonus. Valuables isolate the reward: the printed clear reward is
  // gold, so a valuables gain can ONLY be the designer reward.
  function grailBonusGame(bonus?: { reward?: ViiFieldReward; vp?: number }): GameState {
    return createAdventureGameState({
      seed: "vii-bonus-reward",
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
          viiField: "grail",
          ...(bonus?.reward ? { viiFieldReward: bonus.reward } : {}),
          ...(bonus?.vp !== undefined ? { viiFieldVp: bonus.vp } : {})
        }
      ]
    });
  }

  it("materializes the designer reward + VP onto the Ⅶ field and grants them on the first clear", () => {
    const state = grailBonusGame({ reward: { valuables: 4 }, vp: 5 });
    const field = objectiveField(state)!;
    expect(field.viiReward).toEqual({ valuables: 4 });
    expect(field.viiVp).toBe(5);
    expect(field.viiBonusClaimed).toBeUndefined();

    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const valuablesBefore = state.players.p1.resources.valuables;
    beginFieldVisit(state, hero.id, field.spaceId, false);

    // Observable: valuables rose by EXACTLY the designer reward, the capturer's VP
    // ledger recorded the designer VP, and the claim latched.
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 4);
    expect(state.adventure!.vpLedger?.p1?.viiCenterVp).toBe(5);
    expect(field.viiBonusClaimed).toBe(true);
  });

  it("grants the bonus ONCE — a re-visit never re-pays it (the claim latch)", () => {
    const state = grailBonusGame({ reward: { valuables: 4 }, vp: 5 });
    const field = objectiveField(state)!;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const valuablesBefore = state.players.p1.resources.valuables;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    beginFieldVisit(state, hero.id, field.spaceId, true); // a later revisit
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 4); // still just one grant
    expect(state.adventure!.vpLedger?.p1?.viiCenterVp).toBe(5);
  });

  it("CONTROL: a Ⅶ designation with no reward / VP grants nothing extra", () => {
    const state = grailBonusGame();
    const field = objectiveField(state)!;
    expect(field.viiReward).toBeUndefined();
    expect(field.viiVp).toBeUndefined();
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    const valuablesBefore = state.players.p1.resources.valuables;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore);
    expect(state.adventure!.vpLedger?.p1?.viiCenterVp).toBeUndefined();
  });

  it("scores the captured-Ⅶ VP in computeVictoryPoints (CONTROL: no row without it)", () => {
    const state = grailBonusGame({ vp: 5 });
    state.adventure!.mapPreset = { ...(state.adventure!.mapPreset ?? {}), victoryPoints: { enabled: true } };
    const field = objectiveField(state)!;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    const p1 = computeVictoryPoints(state).breakdown.find((row) => row.playerId === "p1")!;
    const capturedRow = p1.rows.find((row) => row.label.includes("objectives captured"));
    expect(capturedRow?.vp).toBe(5);

    const control = grailBonusGame();
    control.adventure!.mapPreset = { victoryPoints: { enabled: true } };
    const cHero = getMainHero(control, "p1")!;
    const cField = objectiveField(control)!;
    cHero.spaceId = cField.spaceId;
    beginFieldVisit(control, cHero.id, cField.spaceId, false);
    const cp1 = computeVictoryPoints(control).breakdown.find((row) => row.playerId === "p1")!;
    expect(cp1.rows.some((row) => row.label.includes("objectives captured"))).toBe(false);
  });

  it("masks the reward + VP on a FACE-DOWN center in other players' views (with a face-up CONTROL)", () => {
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
          viiFieldReward: { gold: 8 },
          viiFieldVp: 4
        }
      ]
    });
    const centerTile = () =>
      Object.values(state.adventure!.tiles).find((tile) => tile.centerRow === CENTER.row && tile.centerCol === CENTER.col)!;
    // The authoritative state keeps the bonus…
    expect(centerTile().viiFieldReward).toEqual({ gold: 8 });
    expect(centerTile().viiFieldVp).toBe(4);
    // …but a player view MASKS it on the still-face-down tile (like viiField).
    const view = getPlayerView(state, "p2");
    const maskedTile = Object.values(view.adventure!.tiles).find(
      (tile) => tile.centerRow === CENTER.row && tile.centerCol === CENTER.col
    )!;
    expect(maskedTile.viiField).toBeUndefined();
    expect(maskedTile.viiFieldReward).toBeUndefined();
    expect(maskedTile.viiFieldVp).toBeUndefined();
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

  it("validateCustomMapPlan drops a reward / VP that has no valid Ⅶ designation", () => {
    const { accepted } = validateCustomMapPlan(
      [
        ...startPlans(),
        // Center + valid designation → the bonus is KEPT.
        {
          row: CENTER.row,
          col: CENTER.col,
          group: "center",
          faceDown: true,
          viiField: "grail",
          viiFieldReward: { gold: 6 },
          viiFieldVp: 3
        },
        // A bonus on a non-center slot is meaningless — the whole thing is stripped.
        {
          row: 7,
          col: 6,
          group: "near",
          faceDown: true,
          viiFieldReward: { gold: 5 },
          viiFieldVp: 2
        } as CustomMapTilePlan,
        // A center slot with a bonus but NO designation — the orphan bonus is dropped.
        {
          row: 11,
          col: 2,
          group: "center",
          faceDown: true,
          viiFieldReward: { valuables: 9 }
        } as CustomMapTilePlan
      ],
      scenario
    );
    const center = accepted.find((plan) => plan.group === "center" && plan.row === CENTER.row);
    const near = accepted.find((plan) => plan.group === "near");
    const orphanCenter = accepted.find((plan) => plan.group === "center" && plan.row === 11);
    expect(center?.viiFieldReward).toEqual({ gold: 6 });
    expect(center?.viiFieldVp).toBe(3);
    expect(near?.viiFieldReward).toBeUndefined();
    expect(near?.viiFieldVp).toBeUndefined();
    expect(orphanCenter?.viiFieldReward).toBeUndefined();
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
