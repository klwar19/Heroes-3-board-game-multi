import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { ASTROLOGERS_DECK_ID } from "./adventure";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Astrologers "affects EVERY player" proclamations — driven end-to-end through a
 * REAL round-2 wrap (END_TURN → advanceRound → startAdventureRound → pump), not a
 * hand-built queue. The bug this pins: "White Raven — 1 player gets it, the other
 * gets nothing." Each proclamation whose printed text says "each player" / "all
 * players" MUST land its effect on BOTH seats, or the test fails. (CLAUDE.md #1:
 * asserts the observable per-player outcome, with a control that a no-op
 * proclamation changes nothing.)
 */

const SEATS: PlayerId[] = ["p1", "p2"];

function game(): GameState {
  return createAdventureGameState({
    seed: "astro-all",
    difficulty: "normal",
    rollFirstPlayer: false,
    // Two morale-USING factions on purpose: Necropolis ignores morale by faction
    // rule (Undead), which would make the morale assertion below a false failure.
    players: [
      { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "B", factionId: "rampart", heroDefId: "ivor" }
    ]
  });
}

function apply(state: GameState, action: GameAction): GameState {
  const r = applyAction(state, action);
  expect(r.errors, r.errors.map((e) => e.message).join("; ")).toEqual([]);
  return r.state;
}

/** Resolve any forced start-of-turn step (tile rotation / hand refresh / event). */
function driveForced(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 80; i += 1) {
    let acted = false;
    for (const pid of SEATS) {
      const legal = getLegalActions(s, pid);
      const forced = legal.find(
        (l) =>
          l.action.type === "SET_TILE_ROTATION" ||
          l.action.type === "REFRESH_HAND" ||
          l.action.type === "RESOLVE_VISIT_STEP" ||
          (l.action.type === "CHOOSE_OPTION")
      );
      if (forced) {
        const act = forced.action.type === "REFRESH_HAND" ? { ...forced.action, discardCardIds: [] } : forced.action;
        s = apply(s, act);
        acted = true;
        break;
      }
    }
    if (!acted) break;
  }
  return s;
}

/** Play to the round-2 Astrologers wrap with `cardId` on top of the deck. */
function wrapToAstrologers(cardId: string): GameState {
  let state = game();
  const deck = state.decks[ASTROLOGERS_DECK_ID]!;
  deck.drawPile = [cardId];
  deck.discardPile = [];
  state = driveForced(state);
  for (let guard = 0; guard < 12 && state.round === 1; guard += 1) {
    const active = state.activePlayerId as PlayerId;
    state = driveForced(state);
    const end = getLegalActions(state, active).find((l) => l.action.type === "END_TURN");
    if (!end) break;
    state = apply(state, end.action);
    state = driveForced(state);
  }
  expect(state.round).toBe(2);
  expect(state.adventure?.astrologers?.activeCardId).toBe(cardId);
  return state;
}

function mainHeroMp(state: GameState, pid: PlayerId): number {
  const hero = Object.values(state.heroes).find((h) => h.controllerId === pid);
  return hero?.movementPoints ?? 0;
}

function diceRollCountFor(state: GameState, pid: PlayerId): number {
  return state.eventLog.filter((e) => e.type === "ADVENTURE_DICE_ROLLED" && "playerId" in e && e.playerId === pid).length;
}

describe("Astrologers proclamations affect EVERY player (real round wrap)", () => {
  it("White Raven (resource die): BOTH players roll and gain resources", () => {
    const state = wrapToAstrologers("astrologers.white_raven");
    // Each seat rolled at least one Resource die this round…
    for (const pid of SEATS) {
      const rolls = state.eventLog.filter(
        (e) => e.type === "ADVENTURE_DICE_ROLLED" && "playerId" in e && e.playerId === pid && e.dice === "resource"
      );
      expect(rolls.length, `${pid} should have rolled a Resource die`).toBeGreaterThan(0);
    }
    // …and each seat's total resources rose above the fresh-game baseline.
    for (const pid of SEATS) {
      const r = state.players[pid].resources;
      expect(r.gold + r.buildingMaterials + r.valuables, `${pid} should have gained resources`).toBeGreaterThan(13);
    }
  });

  it("Fluffy Rabbit (treasure die): BOTH players roll a Treasure die", () => {
    const state = wrapToAstrologers("astrologers.fluffy_rabbit");
    for (const pid of SEATS) {
      const rolls = state.eventLog.filter(
        (e) => e.type === "ADVENTURE_DICE_ROLLED" && "playerId" in e && e.playerId === pid && e.dice === "treasure"
      );
      expect(rolls.length, `${pid} should have rolled a Treasure die`).toBeGreaterThan(0);
    }
  });

  it("Fancy Pixie (morale +1): BOTH players' morale rises", () => {
    const before = game();
    const beforeMorale: Record<PlayerId, number> = {
      p1: before.players.p1.morale,
      p2: before.players.p2.morale
    };
    const state = wrapToAstrologers("astrologers.fancy_pixie");
    for (const pid of SEATS) {
      expect(state.players[pid].morale, `${pid} morale should rise`).toBe(beforeMorale[pid] + 1);
    }
  });

  it("Battalion's Stallion (movement +1): BOTH players' heroes gain movement", () => {
    const state = wrapToAstrologers("astrologers.battalions_stallion");
    // Both heroes have MORE than a plain refreshed pool (the +1 landed on each).
    // A fresh Catherine/Sandro refresh to their base MP; the modifier adds 1.
    for (const pid of SEATS) {
      expect(mainHeroMp(state, pid), `${pid} hero should have extra movement`).toBeGreaterThanOrEqual(1);
    }
    // Cross-check the modifier reached BOTH heroes equally (no 1-player-only bug):
    // compare to the same wrap with a no-op proclamation.
    const control = wrapToAstrologers("astrologers.dead_silence");
    for (const pid of SEATS) {
      expect(
        mainHeroMp(state, pid),
        `${pid} hero MP should exceed the no-modifier control`
      ).toBe(mainHeroMp(control, pid) + 1);
    }
  });

  it("CONTROL: Dead Silence (no all-player effect) changes neither seat's resources/rolls", () => {
    const state = wrapToAstrologers("astrologers.dead_silence");
    for (const pid of SEATS) {
      // No astrologers resource/treasure roll fired for anyone.
      expect(diceRollCountFor(state, pid)).toBe(0);
      const r = state.players[pid].resources;
      expect(r.gold + r.buildingMaterials + r.valuables).toBe(13);
    }
  });
});
