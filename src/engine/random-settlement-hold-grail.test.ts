/**
 * Random Settlement (Ⅶ), control VP on Random Town/Settlement, Grail possession
 * VP (not dig/conquer), and hold-with-grail win conditions.
 *
 * Every claim asserts an OBSERVABLE outcome with a CONTROL that fails if the
 * wiring is removed.
 */
import { describe, expect, it } from "vitest";
import {
  checkCustomWinConditions,
  computeVictoryPoints,
  createAdventureGameState,
  describeCustomWinCondition,
  playerPossessesGrail,
  sanitizeCenterHexPlan,
  sanitizeCustomMapPreset,
  sanitizeCustomWinConditions,
  tickSettlementHoldControl,
  VII_FIELD_LOCATION,
  type CustomMapPreset,
  type CustomMapTilePlan,
  type GameState,
  type MapFieldState
} from "./index";

const START_A = { row: 8, col: 2 } as const;
const START_B = { row: 10, col: 7 } as const;
const CENTER = { row: 9, col: 4 } as const;

function startPlans(): CustomMapTilePlan[] {
  return [
    { row: START_A.row, col: START_A.col, group: "starting", faceDown: false },
    { row: START_B.row, col: START_B.col, group: "starting", faceDown: false }
  ];
}

function clearHandGates(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
}

function faceUpCenterGame(
  viiField: NonNullable<CustomMapTilePlan["viiField"]>,
  centerHex?: CustomMapTilePlan["centerHex"],
  presetExtras?: Partial<CustomMapPreset>
): GameState {
  // C4 prints a Grail Ⅶ — designation override proves the location change.
  const state = createAdventureGameState({
    seed: `vii-${viiField}`,
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
        tileDefId: "C4",
        viiField,
        ...(centerHex ? { centerHex } : {})
      }
    ],
    ...(presetExtras
      ? {
          customMapPreset: {
            ...presetExtras
          }
        }
      : {})
  });
  clearHandGates(state);
  if (presetExtras) {
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      ...presetExtras
    };
  }
  return state;
}

function objectiveField(state: GameState): MapFieldState {
  const field = Object.values(state.adventure!.fields).find((f) => f.difficulty === 7);
  if (!field) throw new Error("no difficulty-7 field");
  return field;
}

describe("VII_FIELD_LOCATION Random Settlement", () => {
  it("maps settlement → settlement (and town → random_town as CONTROL)", () => {
    expect(VII_FIELD_LOCATION.settlement).toBe("settlement");
    expect(VII_FIELD_LOCATION.town).toBe("random_town");
  });

  it("materializes a center Ⅶ as a difficulty-7 Settlement tagged randomSettlement", () => {
    const state = faceUpCenterGame("settlement", { controlVp: 4, holdRoundsToWin: 2 });
    const field = objectiveField(state);
    expect(field.location).toBe("settlement");
    expect(field.difficulty).toBe(7);
    expect(field.randomSettlement, "Ⅶ settlement is tagged for hold-with-grail target").toBe(true);
    expect(field.settlementBonusVp, "control VP stamped").toBe(4);
    expect(field.holdRoundsToWin).toBe(2);

    // CONTROL: Random Town designation is not a settlement.
    const townGame = faceUpCenterGame("town");
    const townField = objectiveField(townGame);
    expect(townField.location).toBe("random_town");
    expect(townField.randomSettlement).toBeUndefined();
  });
});

describe("Random Town / Settlement control VP", () => {
  it("scores centerHex.controlVp while the player holds a Random Town", () => {
    const state = faceUpCenterGame("town", { controlVp: 5 }, {
      victoryPoints: { enabled: true }
    });
    const field = objectiveField(state);
    // The materialize stamp itself is under test — a broken stamp must FAIL
    // here, never be papered over by the test writing the field by hand.
    expect(field.location).toBe("random_town");
    expect(field.settlementBonusVp, "centerHex.controlVp stamped on the Random Town").toBe(5);
    field.flagOwnerId = "p1";
    const row = computeVictoryPoints(state).breakdown.find((b) => b.playerId === "p1")!;
    expect(row.rows.find((r) => r.label === "Special control VP")?.vp).toBe(5);

    // CONTROL: no flag → no control VP.
    field.flagOwnerId = "p2";
    const p1 = computeVictoryPoints(state).breakdown.find((b) => b.playerId === "p1")!;
    expect(p1.rows.find((r) => r.label === "Special control VP")).toBeUndefined();
  });

  it("scores map-wide randomTowns.vp per controlled Random Town", () => {
    const state = faceUpCenterGame("town");
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      victoryPoints: { enabled: true },
      randomTowns: { vp: 3 }
    };
    const field = objectiveField(state);
    field.flagOwnerId = "p1";
    const row = computeVictoryPoints(state).breakdown.find((b) => b.playerId === "p1")!;
    expect(row.rows.find((r) => r.label === "Random Town control VP")?.vp).toBe(3);
  });
});

describe("Grail possession VP (not dig/conquer)", () => {
  it("playerPossessesGrail is true only when carried or built — not uncollected", () => {
    const state = faceUpCenterGame("grail");
    state.adventure!.grail = { status: "uncollected" };
    expect(playerPossessesGrail(state, "p1")).toBe(false);

    const hero = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
    state.adventure!.grail = { status: "carried", carrierHeroId: hero.id };
    expect(playerPossessesGrail(state, "p1")).toBe(true);
    expect(playerPossessesGrail(state, "p2"), "CONTROL: other seat does not possess").toBe(false);

    const field = objectiveField(state);
    field.flagOwnerId = "p1";
    state.adventure!.grail = { status: "built", builtFieldId: field.spaceId };
    expect(playerPossessesGrail(state, "p1")).toBe(true);
  });

  it("scores possession VP for carrier; dig-site flag alone does not", () => {
    const state = faceUpCenterGame("grail");
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      victoryPoints: { enabled: true },
      objectives: { grailPossessionVp: 7 }
    };
    const field = objectiveField(state);
    field.flagOwnerId = "p1";
    // Grail still uncollected — conquering the dig site is NOT possession.
    state.adventure!.grail = { status: "uncollected" };
    let row = computeVictoryPoints(state).breakdown.find((b) => b.playerId === "p1")!;
    expect(row.rows.find((r) => r.label === "Possessing the Grail")).toBeUndefined();

    const hero = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
    state.adventure!.grail = { status: "carried", carrierHeroId: hero.id };
    row = computeVictoryPoints(state).breakdown.find((b) => b.playerId === "p1")!;
    expect(row.rows.find((r) => r.label === "Possessing the Grail")?.vp).toBe(7);
  });
});

describe("hold-with-grail and field holdRequiresGrail", () => {
  it("sanitizeCustomWinConditions accepts hold-with-grail targets", () => {
    const list = sanitizeCustomWinConditions([
      { kind: "hold-with-grail", rounds: 3, target: "starting-town" },
      { kind: "hold-with-grail", rounds: 99, target: "random-settlement" },
      { kind: "hold-with-grail", rounds: 2, target: { spaceId: "1,2" } },
      { kind: "hold-with-grail", rounds: 1, target: "nope" }
    ]);
    expect(list).toEqual([
      { kind: "hold-with-grail", rounds: 3, target: "starting-town" },
      { kind: "hold-with-grail", rounds: 10, target: "random-settlement" },
      { kind: "hold-with-grail", rounds: 2, target: { spaceId: "1,2" } }
    ]);
    expect(describeCustomWinCondition(list[0]!)).toContain("Starting Town");
    expect(describeCustomWinCondition(list[0]!)).toContain("Grail");
  });

  it("sanitizeCenterHexPlan keeps controlVp + holdRequiresGrail with hold rounds", () => {
    expect(
      sanitizeCenterHexPlan({
        controlVp: 4,
        holdRoundsToWin: 3,
        holdRequiresGrail: true
      })
    ).toEqual({ controlVp: 4, holdRoundsToWin: 3, holdRequiresGrail: true });
    // holdRequiresGrail alone is meaningless — dropped without rounds.
    expect(sanitizeCenterHexPlan({ holdRequiresGrail: true })).toBeUndefined();
  });

  it("field holdRequiresGrail only ticks while possessing the Grail", () => {
    const state = faceUpCenterGame("settlement", {
      holdRoundsToWin: 2,
      holdRequiresGrail: true
    });
    const field = objectiveField(state);
    field.flagOwnerId = "p1";
    field.holdControlOwnerId = "p1";
    field.holdControlRounds = 0;
    // No grail possession → counter stays 0.
    state.adventure!.grail = { status: "uncollected" };
    tickSettlementHoldControl(state);
    expect(field.holdControlRounds).toBe(0);

    const hero = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
    state.adventure!.grail = { status: "carried", carrierHeroId: hero.id };
    tickSettlementHoldControl(state);
    expect(field.holdControlRounds).toBe(1);
    tickSettlementHoldControl(state);
    expect(field.holdControlRounds).toBe(2);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });

  it("abstract hold-with-grail (random-settlement) wins after N rounds of control+grail", () => {
    const state = faceUpCenterGame("settlement");
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      customWinConditions: [
        { kind: "hold-with-grail", rounds: 2, target: "random-settlement" }
      ]
    };
    const field = objectiveField(state);
    expect(field.randomSettlement).toBe(true);
    field.flagOwnerId = "p1";
    const hero = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
    state.adventure!.grail = { status: "carried", carrierHeroId: hero.id };

    tickSettlementHoldControl(state);
    expect(state.adventure!.winnerPlayerId).toBeFalsy();
    checkCustomWinConditions(state);
    expect(state.adventure!.winnerPlayerId).toBeFalsy();

    tickSettlementHoldControl(state);
    checkCustomWinConditions(state);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });

  it("CONTROL: hold-with-grail does not advance without the Grail", () => {
    const state = faceUpCenterGame("settlement");
    state.adventure!.mapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      customWinConditions: [
        { kind: "hold-with-grail", rounds: 1, target: "random-settlement" }
      ]
    };
    const field = objectiveField(state);
    field.flagOwnerId = "p1";
    state.adventure!.grail = { status: "uncollected" };
    tickSettlementHoldControl(state);
    checkCustomWinConditions(state);
    expect(state.adventure!.winnerPlayerId).toBeFalsy();
    // Progress entry is deleted when no one qualifies (not left stale).
    expect(state.adventure!.holdWithGrailProgress ?? {}).toEqual({});
  });
});

describe("preset sanitizer round-trip", () => {
  it("keeps randomTowns.vp and hold-with-grail on a custom map preset", () => {
    const preset = sanitizeCustomMapPreset({
      randomTowns: { vp: 4, incomeGold: 12 },
      customWinConditions: [
        { kind: "hold-with-grail", rounds: 5, target: "random-town" }
      ],
      objectives: { grailPossessionVp: 6, grailBuildAt: "both" }
    });
    expect(preset?.randomTowns?.vp).toBe(4);
    expect(preset?.customWinConditions?.[0]).toEqual({
      kind: "hold-with-grail",
      rounds: 5,
      target: "random-town"
    });
    expect(preset?.objectives?.grailPossessionVp).toBe(6);
    expect(preset?.objectives?.grailBuildAt).toBe("both");
  });
});
