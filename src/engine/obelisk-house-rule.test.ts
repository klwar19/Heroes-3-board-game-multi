import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState, PlayerId } from "./state";
import { beginFieldVisit, classifyHeroStep, getMainHero } from "./adventure";
import { pumpAdventureQueues, resolveVisitStep } from "./adventure-reducer";
import { createAdventureGameState } from "./index";

/**
 * Obelisk house rule (engine: handleObeliskVisit). The first Hero to visit an
 * Obelisk rolls one Attack die; the face is LOCKED on the Field for the rest of
 * the game. Every visitor (any player) flags the Field and gets the same fixed
 * reward — without rerolling the Attack die:
 *   -1 -> +1 positive morale
 *    0 -> Search (2) the Artifact deck
 *   +1 -> roll one Treasure die and one Resource die
 *
 * These tests fail if the Obelisk routing, the die-lock, the per-face reward
 * mapping, or the multi-flag/no-revisit behavior is removed.
 */

function makeGame(): GameState {
  return createAdventureGameState({ seed: "obelisk-house-rule", difficulty: "normal", rollFirstPlayer: false });
}

const FIELD_ID = "50,50";

function injectObelisk(state: GameState, roll?: -1 | 0 | 1): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "obelisk-tile",
    slot: 0,
    location: "obelisk",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    obeliskRoll: roll
  };
  state.adventure!.fields[field.spaceId] = field;
  return field;
}

function countRolls(state: GameState, dice: "attack" | "resource" | "treasure"): number {
  return state.eventLog.filter((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === dice).length;
}

/** Resolves any "choose a die result" prompts (taking the first result) until the visit ends. */
function driveVisit(state: GameState, playerId: PlayerId): void {
  let guard = 0;
  while (state.adventure!.pendingVisit && !state.pendingChoice && guard < 30) {
    guard += 1;
    const step = state.adventure!.pendingVisit.steps[0];
    if (step?.type === "CHOOSE_ONE") {
      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 });
    } else {
      break;
    }
  }
}

/** Parks a player's main hero on the Obelisk and returns it. */
function parkHero(state: GameState, playerId: PlayerId, field: MapFieldState) {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = field.spaceId;
  return hero;
}

describe("Obelisk house rule", () => {
  it("the first visit rolls one Attack die and locks the face", () => {
    const state = makeGame();
    const field = injectObelisk(state);
    const hero = parkHero(state, "p1", field);

    expect(field.obeliskRoll).toBeUndefined();
    beginFieldVisit(state, hero.id, field.spaceId, false);

    expect([-1, 0, 1]).toContain(field.obeliskRoll);
    expect(countRolls(state, "attack")).toBe(1);
  });

  it("a locked -1 grants +1 positive morale", () => {
    const state = makeGame();
    state.players.p1.factionId = "castle"; // not a morale-ignoring faction
    state.players.p1.morale = 0;
    const field = injectObelisk(state, -1);
    const hero = parkHero(state, "p1", field);

    beginFieldVisit(state, hero.id, field.spaceId, false);

    expect(state.players.p1.morale).toBe(1);
    expect(countRolls(state, "attack")).toBe(0); // pre-locked: nothing to roll
    expect(field.obeliskRoll).toBe(-1);
  });

  it("a locked 0 queues a Search (2) of the Artifact deck", () => {
    const state = makeGame();
    const field = injectObelisk(state, 0);
    const hero = parkHero(state, "p1", field);

    beginFieldVisit(state, hero.id, field.spaceId, false);

    const queued = state.adventure!.rewardQueue.find(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts" && reward.count === 2
    );
    expect(queued, "the 0 face should queue a Search (2) of the Artifact deck").toBeTruthy();

    // Pumping the queue opens an actionable artifact search (a deck search, or a
    // deck-family pick in split-deck modes).
    pumpAdventureQueues(state);
    expect(state.pendingChoice).toBeTruthy();
  });

  it("a locked +1 rolls one Treasure die and one Resource die", () => {
    const state = makeGame();
    const field = injectObelisk(state, 1);
    const hero = parkHero(state, "p1", field);

    beginFieldVisit(state, hero.id, field.spaceId, false);
    driveVisit(state, "p1");

    expect(countRolls(state, "treasure")).toBe(1);
    expect(countRolls(state, "resource")).toBeGreaterThanOrEqual(1);
  });

  it("locks the result: a later visitor reuses the same face and never rerolls the die", () => {
    const state = makeGame();
    state.players.p1.factionId = "castle";
    state.players.p2.factionId = "castle";
    state.players.p1.morale = 0;
    state.players.p2.morale = 0;
    const field = injectObelisk(state, -1); // pre-locked
    const p1 = parkHero(state, "p1", field);
    const p2 = parkHero(state, "p2", field);

    beginFieldVisit(state, p1.id, field.spaceId, false);
    beginFieldVisit(state, p2.id, field.spaceId, false);

    expect(state.players.p1.morale).toBe(1);
    expect(state.players.p2.morale).toBe(1); // same reward, not a fresh roll
    expect(field.obeliskRoll).toBe(-1); // unchanged
    expect(countRolls(state, "attack")).toBe(0); // never rerolled
  });

  it("flags every visitor (multi-cube) and never drops a black cube", () => {
    const state = makeGame();
    const field = injectObelisk(state, -1);
    const p1 = parkHero(state, "p1", field);
    const p2 = parkHero(state, "p2", field);

    beginFieldVisit(state, p1.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");

    beginFieldVisit(state, p2.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1"); // first cube kept
    expect(field.extraFlagOwnerIds).toEqual(["p2"]); // second player's cube added
    expect(field.blackCube).toBe(false); // flaggable, never a black cube
  });

  it("does not re-reward a player who already holds a cube, and becomes a walk-through", () => {
    const state = makeGame();
    state.players.p1.factionId = "castle";
    state.players.p1.morale = 0;
    const field = injectObelisk(state, -1);
    const hero = parkHero(state, "p1", field);

    // Before flagging, an Obelisk stops the hero.
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("stop");

    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.players.p1.morale).toBe(1);

    // Re-entering the Field this player already flagged grants nothing more.
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.players.p1.morale).toBe(1);
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("open");
  });
});
