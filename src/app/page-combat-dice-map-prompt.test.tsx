// @vitest-environment jsdom
/**
 * A leftover COMBAT dice cue must never hide a map prompt — the reported
 * "won the fight, rolled the Treasure dice, got exp + artifact on the die
 * faces, but received nothing" bug (2026-08-14 multiplayer report).
 *
 * Mechanism: the battlefield `<DiceOverlay>` is mounted ONLY on the
 * combat-board layout, and each cue completes through that overlay's own
 * timers. The end-of-combat notice is deliberately NOT gated on the dice
 * queue (a retreat carries no roll), so the player can click "Return to the
 * adventure map" while the last roll is still reading. The next snapshot has
 * no combat → the MAP layout renders → the surviving cue can never finish —
 * and `dice.current` unmounts the PromptTray, so the owed Treasure-die
 * "choose one result" was invisible (engine-side everything was fine; the
 * choice sat waiting) until the 20s presentation watchdog. Bulk-resolved
 * single-player AI fights could strand cues the same way (rolls arriving in
 * a snapshot whose combat is already gone).
 *
 * The fix drops battlefield cues whenever the snapshot cannot present them
 * (no combat / an SP bulk fight): leaving the battlefield forfeits the
 * leftover roll cinematic. This test stages the exact race and asserts the
 * Treasure choice tray is reachable; it fails if the drop is removed.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID, type GameState } from "@/engine";
import { ATTACK_DIE_FACES } from "@/engine/battlefield";
import { getMainHero } from "@/engine/adventure";
import { appendEvent } from "@/engine/events";
import type { CombatState, MapFieldState } from "@/engine/state";
import type { GameRoomSnapshot, RoomConnectionHandlers } from "@/lib/realtime";
import { UI_MODE_STORAGE_KEY } from "@/lib/ui-mode-preference";
import { HELPER_COACH_STORAGE_KEY } from "@/lib/helper-coach-preference";

const { connectRoomMock, routerPush } = vi.hoisted(() => ({
  connectRoomMock: vi.fn(),
  routerPush: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn() })
}));
vi.mock("@/lib/music", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/music")>();
  return { ...original, useBackgroundMusic: vi.fn() };
});
vi.mock("@/lib/lobby-presence-client", () => ({
  sendPresence: vi.fn(async () => undefined),
  leavePresence: vi.fn()
}));
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...original,
    fetchSession: vi.fn(async () => null),
    fetchSocketToken: vi.fn(async () => undefined)
  };
});
vi.mock("@/lib/match-claim-client", () => ({ maybeClaimFinishedMatch: vi.fn() }));
vi.mock("@/lib/realtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/realtime")>();
  return { ...original, connectRoom: connectRoomMock };
});

const ROOM_ID = "combat-dice-map-prompt-test";

function snapshotFor(state: GameState, version: number): GameRoomSnapshot {
  return { roomId: ROOM_ID, version, updatedAt: new Date().toISOString(), state };
}

function serveRoom(state: GameState) {
  const snapshot = snapshotFor(state, 1);
  let handlers: RoomConnectionHandlers | null = null;
  const submitAction = vi.fn(async () => ({ version: 1, errors: [], notices: [] }));
  connectRoomMock.mockReset().mockImplementation((_roomId: string, given: RoomConnectionHandlers) => {
    handlers = given;
    return {
      close: vi.fn(),
      submitAction,
      resetRoom: vi.fn(async () => snapshot),
      fetchSnapshot: vi.fn(async () => snapshot),
      restoreRoom: vi.fn(async () => snapshot),
      fetchSinglePlayerSave: vi.fn(async () => ({ state: snapshot.state, version: snapshot.version })),
      loadSinglePlayerSave: vi.fn(async () => snapshot)
    };
  });
  return {
    push(next: GameState, version: number) {
      handlers?.onSnapshot(snapshotFor(next, version), { source: "broadcast" });
    }
  };
}

async function settle(rounds = 2) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** A won neutral fight standing on a 2-die Treasure field (pre-acknowledge). */
function stagePreAck(): GameState {
  const state = createAdventureGameState({ seed: "dice-map-prompt", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.needsHandRefresh = false;
    player.canMulligan = false;
  }
  state.adventure!.tiles["repro-tile"] = {
    id: "repro-tile",
    tileDefId: "repro",
    centerRow: 0,
    centerCol: 0,
    rotation: 0,
    faceDown: false,
    group: "far"
  };
  const field: MapFieldState = {
    spaceId: "repro-field",
    tileInstanceId: "repro-tile",
    slot: 0,
    location: "treasure_symbol",
    difficulty: 2,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    treasureDice: 2
  };
  state.adventure!.fields[field.spaceId] = field;
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = field.spaceId;
  state.phase = "combat";
  state.combat = {
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    units: {},
    setup: null,
    awaitingContinue: false,
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId!,
      difficulty: 2,
      hasAzure: false
    },
    outcome: {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    },
    dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 }
  } as CombatState;
  return state;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", `/?room=${ROOM_ID}`);
  window.localStorage.setItem("homm3bg.displayName", "Tester");
  window.localStorage.setItem(HELPER_COACH_STORAGE_KEY, "off");
  window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
});

afterEach(() => {
  cleanup();
});

describe("leftover combat dice cue vs the map prompt tray", () => {
  it("the Treasure-die choose-one tray still renders after acking mid-roll", async () => {
    const s1 = stagePreAck();
    const room = serveRoom(s1);
    render(<Home />);
    await settle();

    // A fresh attack roll lands while the end-of-combat notice is already up
    // (the notice is not gated on the dice queue): the cue becomes current.
    const s2 = structuredClone(s1);
    appendEvent(s2, {
      type: "ATTACK_ROLLED",
      attackerId: "u_att",
      defenderId: "u_def",
      rolls: [0],
      roll: 0,
      rollMode: "normal",
      attackBonus: 0,
      defenseBonus: 0,
      attackValue: 2,
      defenseValue: 0,
      damage: 2,
      isRetaliation: false
    });
    await act(async () => {
      room.push(s2, 2);
    });
    await settle();
    // CONTROL: the cue really is live — the battlefield dice overlay is up.
    expect(screen.getByRole("status", { name: /attack roll/i })).toBeTruthy();

    // The player clicks "Return to the adventure map" before the roll finishes
    // reading: the acknowledged snapshot has no combat and rolls the field's
    // two Treasure dice, whose choose-one now waits in the pending visit.
    const s3Result = applyAction(structuredClone(s2), { type: "ACKNOWLEDGE_COMBAT_END", playerId: "p1" });
    expect(s3Result.errors).toEqual([]);
    const s3 = s3Result.state;
    expect(s3.combat).toBeNull();
    expect(s3.adventure?.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
    await act(async () => {
      room.push(s3, 3);
    });
    await settle();

    // Drain the MAP dice cues (resource + treasure) by click-to-skip — the map
    // layout mounts MapDiceOverlay, so these always drain.
    for (let i = 0; i < 6; i += 1) {
      const overlay = screen.queryByRole("status", { name: /(resource|treasure) di/i });
      if (!overlay) break;
      fireEvent.click(overlay);
      await settle();
    }

    // The owed Treasure choice is visible. Without the leftover-cue drop the
    // battlefield cue (which the map layout can never complete) kept the
    // PromptTray unmounted and this prompt was unreachable.
    expect(screen.getByText(/choose one treasure die result/i)).toBeTruthy();
  });
});
