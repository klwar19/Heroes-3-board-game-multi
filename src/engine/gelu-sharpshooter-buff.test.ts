import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  makeCombatUnitFromArmy,
  NEUTRAL_DECK_IDS
} from "./index";
import type { GameAction, GameState } from "./state";

// ---------------------------------------------------------------------------
// House rule (BINH) — Gelu IV: a Sharpshooters recruited via Gelu's level-IV
// specialty is permanently BUFFED. It carries +1 Attack in EVERY combat, from
// beginning to end. The buff lives on the army card (permanentAttackBonus) and
// is re-applied each time the card enters combat, and the recruit event is
// flagged (attackBuff) so the UI can announce "this is a BUFF".
//
// These tests assert the OBSERVABLE combat outcome (the Sharpshooters fights at
// base + 1 Attack), not just the data marker — with a plain, un-buffed
// Sharpshooters as the control. Remove `grantAttackBonus` from the specialty and
// the army card loses `permanentAttackBonus`, so the buffed/plain Attack converge
// and these tests fail.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function geluMap(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Gelu", factionId: "rampart", heroDefId: "gelu" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.players.p1.hand = ["specialty.gelu.4"];
  return state;
}

function findGeluOption(state: GameState, optionIndex: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "specialty.gelu.4" &&
      legal.action.optionIndex === optionIndex
  );
}

/** Recruit the Sharpshooters via Gelu IV (option 0) and return the new state. */
function recruitSharpshooters(seed: string): GameState {
  const state = geluMap(seed);
  state.players.p1.army = [{ id: "army_elves", unitDefId: "rampart.elves", side: "pack" }];
  expect(state.decks[NEUTRAL_DECK_IDS.silver].drawPile).toContain("neutral.sharpshooters");
  const convert = findGeluOption(state, 0);
  expect(convert, "the Elves→Sharpshooters trade is offered").toBeTruthy();
  return applyOk(state, convert!.action);
}

describe("Gelu IV — the recruited Sharpshooters is permanently buffed", () => {
  it("bakes a permanent +1 Attack onto the recruited Sharpshooters army card", () => {
    const after = recruitSharpshooters("gelu-buff-army");
    const sharpshooters = after.players.p1.army.find((unit) => unit.unitDefId === "neutral.sharpshooters");
    expect(sharpshooters, "the Sharpshooters joined the army").toBeTruthy();
    expect(sharpshooters!.permanentAttackBonus, "permanent +1 Attack baked on the card").toBe(1);
  });

  it("flags the recruit event as a BUFF (attackBuff: 1) so the player gets a notice", () => {
    const after = recruitSharpshooters("gelu-buff-event");
    const recruited = after.eventLog.filter(
      (event) => event.type === "UNIT_RECRUITED" && event.unitDefId === "neutral.sharpshooters"
    );
    expect(recruited.length, "exactly one Sharpshooters recruit event").toBe(1);
    const event = recruited[0];
    expect(event.type === "UNIT_RECRUITED" && event.attackBuff, "recruit flagged as a +1 Attack BUFF").toBe(1);
  });

  it("fights at base + 1 Attack in combat (the plain Sharpshooters is the control)", () => {
    const after = recruitSharpshooters("gelu-buff-combat");
    const buffedCard = after.players.p1.army.find((unit) => unit.unitDefId === "neutral.sharpshooters")!;
    // An identical Sharpshooters card with NO Gelu buff.
    const plainCard = { id: "plain_ss", unitDefId: "neutral.sharpshooters", side: "neutral" as const };

    const buffed = makeCombatUnitFromArmy(buffedCard, "p1", "u_buffed", 0, "binh");
    const plain = makeCombatUnitFromArmy(plainCard, "p1", "u_plain", 1, "binh");
    expect(buffed && plain, "both Sharpshooters build into combat units").toBeTruthy();

    // The printed Sharpshooters Attack is 3; the buffed one fights at 4.
    expect(plain!.attack, "plain Sharpshooters fights at its printed Attack (3)").toBe(3);
    expect(buffed!.attack, "Gelu's Sharpshooters fights at base + 1 (4)").toBe(plain!.attack + 1);
    expect(buffed!.permanentAttackBonus).toBe(1);
  });

  it("keeps the +1 Attack across separate combats (start to end, every fight)", () => {
    const after = recruitSharpshooters("gelu-buff-persist");
    const buffedCard = after.players.p1.army.find((unit) => unit.unitDefId === "neutral.sharpshooters")!;
    const plainCard = { id: "plain_ss", unitDefId: "neutral.sharpshooters", side: "neutral" as const };

    // Rebuild the unit twice — combats rebuild units from the army each time.
    for (const fight of ["first", "second"]) {
      const buffed = makeCombatUnitFromArmy(buffedCard, "p1", `b_${fight}`, 0, "binh")!;
      const plain = makeCombatUnitFromArmy(plainCard, "p1", `p_${fight}`, 1, "binh")!;
      expect(buffed.attack, `combat ${fight}: still base + 1`).toBe(plain.attack + 1);
    }
  });

  it("CONTROL: choosing the draw option recruits no unit and bakes no buff", () => {
    const state = geluMap("gelu-buff-draw");
    state.players.p1.army = [{ id: "army_elves", unitDefId: "rampart.elves", side: "pack" }];
    state.players.p1.deck = ["stat.attack"];
    const draw = findGeluOption(state, 1);
    expect(draw, "the draw option is offered").toBeTruthy();
    const after = applyOk(state, draw!.action);

    expect(after.players.p1.army.some((unit) => unit.unitDefId === "neutral.sharpshooters")).toBe(false);
    expect(
      after.eventLog.some((event) => event.type === "UNIT_RECRUITED" && event.unitDefId === "neutral.sharpshooters"),
      "no Sharpshooters recruit event from the draw option"
    ).toBe(false);
  });
});
