import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameEvent,
  type GameState,
  type LegalAction,
} from "./index";
import { placeCreatureBank } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { startWarMachineRound } from "./permanents";

/**
 * START-OF-COMBAT ordering pause for the Ballista specialties (classic ruleset).
 *
 * USER ASK (2026-09-15): "Tarnum of Castle, specialty IV, if it can be played
 * begin of combat, will be asked … Same for tower hero Torosar VI."
 *
 * The engine already opens a "play a Ballista specialty first, or fire now"
 * OPTION_CHOICE pause at the start of combat when the hand holds Gerwulf VI or
 * Tarnum Castle IV, so the owner can order the specialty BEFORE the owned
 * Ballista's automatic round-start shot commits (`openingBallistaSpecialty` in
 * permanents.ts). Torosar VI — a start-of-combat instant with the same
 * combatAnytime "activate all your Ballistas now" side — was omitted from that
 * list, so under the classic ruleset a hand holding only Torosar VI was NEVER
 * asked: the owned Ballista auto-fired first. This adds it.
 *
 * IMPORTANT (2026-09-15 ruling): "You can activate all your Ballistas now" is a
 * SEPARATE activation from the automatic round-start volley. So playing Torosar
 * VI while owning 1 Ballista fires 3 shots that round (the owned Ballista's
 * round-start shot + the activate-all volley firing owned + granted). The pause
 * only reorders that play; it must NOT suppress the multi-fire. These tests pin
 * both the "asked" behavior and the intended 3-shot count.
 *
 * Every test carries a CONTROL; the mutation that breaks each is named in-body.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function plays(state: GameState, cardId: string, playerId = "p1"): LegalAction[] {
  return getLegalActions(state, playerId).filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId,
  );
}

function warMachineHits(state: GameState): Extract<GameEvent, { type: "WAR_MACHINE_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "WAR_MACHINE_TRIGGERED" }> =>
      event.type === "WAR_MACHINE_TRIGGERED",
  );
}

/** True when an OPTION_CHOICE war-machine ordering pause is open for `playerId`. */
function warMachineOrderingPauseOpen(state: GameState, playerId = "p1"): boolean {
  const choice = state.pendingChoice;
  return Boolean(
    choice &&
      choice.type === "OPTION_CHOICE" &&
      choice.context === "war-machine" &&
      choice.playerId === playerId,
  );
}

/**
 * A bare round-1 combat (classic ruleset — no adventure house rules) where p1
 * owns exactly one Ballista and one enemy is the unique slowest, so the owned
 * round-start shot and every activate-all shot land on it with no target choice.
 */
function combatOwning(hand: string[], seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [...hand];
  state.players.p1.permanents = ["war_machine.ballista"];
  state.players.p2.hand = [];
  // Unique slowest enemy with plenty of health: every Ballista shot hits it and
  // it never dies, so the shot count is exact and no combat-end short-circuits.
  state.combat!.units.unit_p2_skeletons.initiative = 1;
  state.combat!.units.unit_p2_skeletons.maxHealth = 50;
  state.combat!.units.unit_p2_vampires.initiative = 5;
  state.combat!.units.unit_p2_dread_knights.initiative = 5;
  return state;
}

// ---------------------------------------------------------------------------
// Item: the player is ASKED at the start of combat (classic ruleset).
// ---------------------------------------------------------------------------

describe("classic ruleset: the start-of-combat Ballista specialty pause", () => {
  it("Torosar VI opens the ordering pause and is playable BEFORE the owned Ballista fires (THE FIX)", () => {
    // Mutation: drop "specialty.torosar.6" from openingBallistaSpecialty in
    // permanents.ts and the pause never opens — the owned Ballista auto-fires
    // (a target choice / immediate shot), so both assertions below flip.
    const state = combatOwning(["specialty.torosar.6"], "torosar-vi-start-pause");
    startWarMachineRound(state);

    expect(warMachineOrderingPauseOpen(state), "the ordering pause is open").toBe(true);
    expect(
      plays(state, "specialty.torosar.6").length,
      "Torosar VI is a legal play INTO that pause",
    ).toBeGreaterThan(0);
    expect(warMachineHits(state), "no Ballista shot has fired yet").toHaveLength(0);
  });

  it("Tarnum Castle IV opens the same pause (already-correct control)", () => {
    const state = combatOwning(["specialty.tarnum_castle.4"], "tarnum-iv-start-pause");
    startWarMachineRound(state);

    expect(warMachineOrderingPauseOpen(state)).toBe(true);
    expect(plays(state, "specialty.tarnum_castle.4").length).toBeGreaterThan(0);
    expect(warMachineHits(state)).toHaveLength(0);
  });

  it("CONTROL: the map-only Torosar IV never opens the pause — the owned Ballista just fires", () => {
    // Discriminates the fix from a blanket "any ballista card opens the pause":
    // Torosar IV is a bare map-timed BALLISTA_SPECIALTY with no combatAnytime
    // side, so it must NOT open the ordering pause even after the fix.
    const state = combatOwning(["specialty.torosar.4"], "torosar-iv-no-pause");
    startWarMachineRound(state);

    expect(warMachineOrderingPauseOpen(state), "no ordering pause for a map-only card").toBe(false);
    expect(plays(state, "specialty.torosar.4"), "Torosar IV is not a combat play").toHaveLength(0);
    // The owned Ballista resolved its round-start shot (unique slowest target).
    expect(warMachineHits(state).length).toBeGreaterThan(0);
  });

  it("CONTROL: with no Ballista owned there is no round-start volley, so no pause", () => {
    const state = createInitialGameState("torosar-vi-no-ballista-no-pause");
    state.players.p1.hand = ["specialty.torosar.6"];
    state.players.p1.permanents = [];
    state.players.p2.hand = [];
    startWarMachineRound(state);
    expect(warMachineOrderingPauseOpen(state)).toBe(false);
    expect(warMachineHits(state)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Item: the intended multi-fire is preserved (owning 1 -> 3 shots), not
// suppressed to 2 by the ordering pause.
// ---------------------------------------------------------------------------

describe("classic ruleset: Torosar VI multi-fire from the start-of-combat pause", () => {
  it("playing Torosar VI into the pause fires 3 Ballista shots (round-start + activate-all), NOT 2 and NOT 1", () => {
    // The discriminating count: 1 owned round-start shot + the "activate all"
    // volley firing BOTH Ballistas (owned again + granted) = 3. A regression
    // that suppressed the owned round-start shot would read 2; one that dropped
    // the activate-all volley would read 1.
    const state = combatOwning(["specialty.torosar.6"], "torosar-vi-multifire");
    startWarMachineRound(state);
    expect(warMachineOrderingPauseOpen(state)).toBe(true);

    const offer = plays(state, "specialty.torosar.6")[0];
    expect(offer, "Torosar VI is offered in the pause").toBeTruthy();
    const fired = apply(state, offer.action);

    expect(warMachineHits(fired), "owned round-start + activate-all (owned + granted)").toHaveLength(3);
    expect(fired.combat!.units.unit_p2_skeletons.damage, "all 3 hit the unique slowest enemy").toBe(3);
  });

  it("CONTROL: choosing 'Fire once' fires only the owned Ballista (1) and keeps Torosar VI in hand", () => {
    // Same board, the OTHER branch of the pause: option 0 fires the owned
    // Ballista's round-start shot alone. Proves the pause really is a choice and
    // that the 3-shot count above is caused by playing the card, not the fixture.
    const state = combatOwning(["specialty.torosar.6"], "torosar-vi-fire-once");
    startWarMachineRound(state);
    const fireOnce = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && legal.label.includes("Fire once"),
    );
    expect(fireOnce, "the pause offers 'Fire once'").toBeTruthy();
    const fired = apply(state, fireOnce!.action);

    expect(warMachineHits(fired)).toHaveLength(1);
    expect(fired.players.p1.hand, "unplayed Torosar VI is still in hand").toContain("specialty.torosar.6");
  });
});

// ---------------------------------------------------------------------------
// Faithful reproduction in a REAL neutral (Creature Bank) fight.
// ---------------------------------------------------------------------------

describe("classic ruleset: Torosar VI is asked in a real neutral fight", () => {
  function torosarAdventure(cardId: string): GameState {
    const state = createAdventureGameState({
      seed: `ballista-start-${cardId}`,
      difficulty: "easy",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Torosar", factionId: "tower", heroDefId: "torosar" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      ],
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.round = 3;
    state.activePlayerId = "p1";
    state.phase = "player-turn";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = [cardId];
    state.players.p1.permanents = ["war_machine.ballista"]; // owns exactly one
    state.players.p1.resources.gold = 50;
    return state;
  }

  function startFight(state: GameState, fieldId = "bank-field"): GameState {
    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.spaceId = fieldId;
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
    } as never;
    placeCreatureBank(state, fieldId, "crypt");
    startNeutralEncounter(state, hero, state.adventure!.fields[fieldId]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    let next = apply(state, place!.action);
    next = apply(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    return next;
  }

  it("the opening pause is presented before the owned Ballista's round-start shot", () => {
    let state = torosarAdventure("specialty.torosar.6");
    state = startFight(state);
    expect(state.adventure?.houseRules?.["polish-card-balance"] ?? false, "this is the classic ruleset").toBe(false);
    expect(warMachineOrderingPauseOpen(state), "asked at the start of the real fight").toBe(true);
    expect(plays(state, "specialty.torosar.6").length).toBeGreaterThan(0);
    expect(warMachineHits(state), "the owned Ballista has not fired yet").toHaveLength(0);
  });
});
