/**
 * Parallel turns — ACCESS audit: does an OPEN parallel turn actually reach
 * every handler the offer layer promises it?
 *
 * The whole mode rests on one substitution: `hasOpenAdventureTurn(state, id)`
 * replaces `state.activePlayerId === id` on the adventure map (see
 * src/engine/parallel-turns.ts). getLegalActions makes that substitution
 * everywhere, so a NON-active parallel actor is offered the full map-turn menu.
 * A handler that still compares `state.activePlayerId` therefore REJECTS an
 * action the engine itself just offered — the offer/handler asymmetry this file
 * hunts. Every spec carries an ordered-mode CONTROL on the same setup.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "./index";

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

/**
 * A mid-game table with the map-turn-action-rich optional modules ON (WOG
 * Commanders for the Forge / grade-ups, Unit Experience for Drill, the anime
 * hero systems for Train / Tribulation), everyone's mandatory draw already
 * taken and everyone rich enough that no offer is hidden by a cost gate.
 */
function makeGame(parallelTurns: number): GameState {
  const state = createAdventureGameState({
    seed: "parallel-access-audit",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    parallelTurns,
    unitExperience: true,
    spellBook: true,
    wog: { enabled: true, commanders: true, artifacts: true },
    anime: { enabled: true, heroGrades: true, cultivation: true, equipment: true },
    players: THREE_PLAYERS
  } as never);
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources.gold = 400;
    player.resources.buildingMaterials = 80;
    player.resources.valuables = 80;
    if (player.commander) {
      player.commander.gradePoints = 3;
    }
  }
  for (const hero of Object.values(state.heroes)) {
    hero.level = 7;
    hero.movementPoints = 8;
  }
  // Round 10: every Commander-Forge grade (2 / 7 / 9) is unlocked.
  state.round = 10;
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

/** Offers of `type` that `seat` is given right now. */
function offersOfType(state: GameState, seat: string, type: GameAction["type"]) {
  return getLegalActions(state, seat).filter((legal) => legal.action.type === type);
}

/**
 * Every offer the engine makes to `seat`, applied one at a time against the
 * SAME state, collected as "<TYPE>: <message>" for each rejection. A legal
 * action the engine offers must be accepted by its own handler.
 *
 * `SPEND_MORALE`'s discard-and-redraw offer is a deliberate PLACEHOLDER frame
 * (`discardCardIds` is filled in by the picker) and a cost-bearing PLAY_CARD is
 * likewise armed with its payment by the UI, so both are excluded — they are
 * rejected identically on an ordinary ORDERED turn, which is what makes them
 * provably not a parallel-mode asymmetry.
 */
function rejectedOffers(state: GameState, seat: string): string[] {
  const rejected: string[] = [];
  for (const legal of getLegalActions(state, seat)) {
    const action = legal.action as GameAction;
    if (action.type === "SPEND_MORALE" || action.type === "PLAY_CARD") {
      continue;
    }
    const result = applyAction(state, action);
    if (result.errors.length > 0) {
      rejected.push(`${action.type}: ${result.errors[0]?.message ?? ""}`);
    }
  }
  return rejected;
}

describe("parallel turns — ACCESS: offer/handler symmetry for a non-active open turn", () => {
  it("accepts every action it offers a parallel actor who is not activePlayerId", () => {
    const state = makeGame(12);
    expect(state.turn.mode).toBe("parallel");
    expect(state.activePlayerId).toBe("p1");
    // p2's parallel turn is open even though p1 holds the nominal active seat.
    expect(getLegalActions(state, "p2").length).toBeGreaterThan(10);

    // CONTROL: the nominal active player's identical menu is fully accepted,
    // so any divergence below is about the OPEN-TURN substitution, nothing else.
    expect(rejectedOffers(state, "p1")).toEqual([]);

    expect(rejectedOffers(state, "p2")).toEqual([]);
  });

  it("FORGE_COMMANDER_ARTIFACT: offered to a parallel actor, refused by the handler", () => {
    const state = makeGame(12);
    const offers = offersOfType(state, "p2", "FORGE_COMMANDER_ARTIFACT");
    // The offer layer runs the Forge through addCommanderMapActions, which sits
    // past legal-actions' `hasOpenAdventureTurn` gate — so p2 sees the buttons.
    expect(offers.length).toBeGreaterThan(0);

    const result = applyAction(state, offers[0]!.action as GameAction);
    // BUG: forgeCommanderArtifact still gates on `state.activePlayerId`.
    expect(result.errors.map((error) => error.message)).toEqual([]);
    expect(result.state.players.p2?.commander?.forgeMinorUsed).toBe(true);
  });

  it("CONTROL: the same Forge offer resolves for the ORDERED active player, and is not offered off-turn", () => {
    const ordered = makeGame(0);
    expect(ordered.turn.mode).toBe("ordered");
    const mine = offersOfType(ordered, "p1", "FORGE_COMMANDER_ARTIFACT");
    expect(mine.length).toBeGreaterThan(0);
    const result = applyAction(ordered, mine[0]!.action as GameAction);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p1?.commander?.forgeMinorUsed).toBe(true);

    // Off-turn in ordered play the Forge is correctly withheld, so the offer in
    // the parallel spec above is genuinely the open-turn substitution at work.
    expect(offersOfType(ordered, "p2", "FORGE_COMMANDER_ARTIFACT")).toEqual([]);
  });

  it("CONTROL: the other WOG commander map actions are already parallel-aware", () => {
    const state = makeGame(12);
    const gradeUp = offersOfType(state, "p2", "COMMANDER_GRADE_UP");
    expect(gradeUp.length).toBeGreaterThan(0);
    expect(applyAction(state, gradeUp[0]!.action as GameAction).errors).toEqual([]);

    const drill = offersOfType(state, "p2", "DRILL_UNIT");
    expect(drill.length).toBeGreaterThan(0);
    expect(applyAction(state, drill[0]!.action as GameAction).errors).toEqual([]);
  });
});
