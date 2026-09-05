// @vitest-environment jsdom
/**
 * Parallel turns — an OBSERVER is never yanked off the map (user report
 * 2026-09-05: "observer can't see both battles? keep being forced to a battle
 * when view map").
 *
 * The page derives its rendered frame with `parallelStateForPlayer(rawState,
 * viewerPlayerId)`. An unseated observer used to fall through that projection
 * and render the RAW snapshot, i.e. whichever battle the single global
 * `parallelCombatOwnerId` happened to point at — a pointer that moves every
 * time ANY seat acts. Each move changed `state.combat.id`, and the page's
 * "a new battle appeared" hand-off then forced `combatTab` back to "battle".
 *
 * Two halves are pinned here, both of which must hold for the map to stick:
 *  - the ENGINE half: an observer's frame holds ONE battle across snapshots;
 *  - the PAGE half: the forced hand-off is suppressed while the viewer is only
 *    WATCHING (`isParallelWatchOnly`).
 * A CONTROL covers the seat that is actually FIGHTING: its own battle still
 * takes the screen, which is the behaviour the hand-off exists for.
 *
 * jsdom cannot compute CSS, so this pins the rendered SURFACE (the adventure
 * map root vs the battle table root) and nothing about pixels; there is no e2e
 * spec for parallel turns.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import {
  applyAction,
  createAdventureGameState,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameState,
  type PlayerId
} from "@/engine";
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
vi.mock("@/lib/performance-metrics", () => ({
  metricNow: () => Date.now(),
  observeBrowserResponsiveness: () => () => {},
  recordPerformanceMetric: vi.fn()
}));
vi.mock("@/lib/realtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/realtime")>();
  return { ...original, connectRoom: connectRoomMock };
});

function snapshotFor(state: GameState, version: number): GameRoomSnapshot {
  return {
    roomId: "parallel-watch-test",
    version,
    updatedAt: new Date().toISOString(),
    state
  };
}

function serveRoomCapturing(state: GameState) {
  const snapshot = snapshotFor(state, 1);
  let handlers: RoomConnectionHandlers | null = null;
  connectRoomMock.mockReset().mockImplementation((_roomId: string, given: RoomConnectionHandlers) => {
    handlers = given;
    return {
      close: vi.fn(),
      submitAction: vi.fn(async () => ({ version: snapshot.version, errors: [], notices: [] })),
      resetRoom: vi.fn(async () => snapshot),
      fetchSnapshot: vi.fn(async () => snapshot),
      restoreRoom: vi.fn(async () => snapshot),
      fetchSinglePlayerSave: vi.fn(async () => ({ state: snapshot.state, version: snapshot.version })),
      loadSinglePlayerSave: vi.fn(async () => snapshot)
    };
  });
  return {
    push(next: GameState, version: number) {
      act(() => {
        handlers?.onSnapshot(snapshotFor(next, version));
      });
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

function mainEl(): HTMLElement {
  const main = document.querySelector("main");
  expect(main, "the table <main>").toBeTruthy();
  return main as HTMLElement;
}

// ---- game fixture ---------------------------------------------------------

const usedFields = new Set<string>();

function guardFieldNextTo(state: GameState, heroId: string): string {
  const coord = parseHexSpaceId(state.heroes[heroId].spaceId ?? "")!;
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !usedFields.has(candidate.spaceId))!;
  usedFields.add(field.spaceId);
  Object.assign(field as unknown as Record<string, unknown>, {
    location: "empty_field",
    difficulty: 1,
    flagOwnerId: null,
    blackCube: false,
    everFlagged: false
  });
  delete (field as unknown as Record<string, unknown>).bankId;
  return field.spaceId;
}

function fight(state: GameState, playerId: PlayerId): GameState {
  const result = applyAction(state, {
    type: "MOVE_HERO",
    playerId,
    heroId: `hero_${playerId}`,
    to: guardFieldNextTo(state, `hero_${playerId}`)
  });
  expect(result.errors.map((error) => error.message)).toEqual([]);
  return result.state;
}

/** A three-seat parallel table where p1 is already fighting its own guards. */
function parallelTableWithOneBattle(seed: string): GameState {
  usedFields.clear();
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    events: false,
    parallelTurns: 4,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
      { id: "p3", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return fight(state, "p1");
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/?room=parallel-watch-test");
  window.localStorage.setItem("homm3bg.displayName", "Tester");
  window.localStorage.setItem(HELPER_COACH_STORAGE_KEY, "off");
  window.localStorage.setItem(UI_MODE_STORAGE_KEY, "computer");
});

afterEach(cleanup);

describe("parallel turns — an observer's Map choice sticks", () => {
  it("a second battle opening never drags the observer off the adventure map", async () => {
    const first = parallelTableWithOneBattle("page-parallel-watch");
    const room = serveRoomCapturing(first);
    render(<Home />);
    await settle();

    // Take the unseated Observer seat (free local switcher on an open table).
    fireEvent.click(screen.getByRole("button", { name: /Observer/ }));
    expect(mainEl().className).toContain("tableRoot");
    // The observer's own way back to the map (its only one on desktop).
    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));
    expect(mainEl().className, "the observer asked for the map").toContain("adventureRoot");

    // p2 now opens ITS OWN battle. The authoritative global pointer moves to
    // p2 — pre-fix the observer's frame followed it and the "new battle" hand-off
    // forced the battlefield back on screen.
    const second = fight(first, "p2");
    expect(second.parallelCombatOwnerId).toBe("p2");
    room.push(second, 2);
    await settle();
    expect(
      mainEl().className,
      "the observer is still on the map it chose"
    ).toContain("adventureRoot");
    // And it really is watching a live battle, not an empty table: the map's
    // in-combat banner offers the way back.
    fireEvent.click(screen.getByRole("button", { name: /Return to the battle/ }));
    expect(mainEl().className).toContain("tableRoot");
    // The ENGINE half: it is still CATHERINE's battle. Pre-fix the observer
    // rendered the raw snapshot, whose pointer p2's move had just moved — so
    // the battlefield silently became Sandro's.
    expect(
      screen.getByText(/Catherine vs L1 guards/),
      "the observer holds the battle it was watching",
    ).toBeTruthy();
    expect(screen.queryByText(/Sandro vs L1 guards/)).toBeNull();

    // Back to the map, then the WATCHED battle is decided. The observer's frame
    // necessarily moves on to the other live battle — a NEW combat id, which is
    // exactly the transition the "a battle started" hand-off reacts to. It must
    // not fire for a viewer who has no stake in either fight.
    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));
    expect(mainEl().className).toContain("adventureRoot");
    const decided = structuredClone(second);
    decided.parallelCombats!.p1!.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutrals" as PlayerId,
      reason: "all-enemy-units-defeated"
    };
    room.push(decided, 3);
    await settle();
    expect(
      mainEl().className,
      "a battle the observer does not fight never takes the screen",
    ).toContain("adventureRoot");
  });

  it("CONTROL: the seat that is FIGHTING is still taken back to its own battle", async () => {
    const before = parallelTableWithOneBattle("page-parallel-watch-control");
    const room = serveRoomCapturing(before);
    render(<Home />);
    await settle();
    // The viewer defaults to p1, the fighter — its battle opened on the screen.
    expect(mainEl().className).toContain("tableRoot");
    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));
    expect(mainEl().className).toContain("adventureRoot");

    // Its OWN battle is decided: the result belongs on the battle screen, so
    // the hand-off the observer case suppresses is alive and well here.
    const decided = structuredClone(before);
    decided.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: "neutrals" as PlayerId,
      reason: "all-enemy-units-defeated"
    };
    room.push(decided, 2);
    await settle();
    expect(mainEl().className, "the fighter's own result opens the battle screen").toContain("tableRoot");
  });
});
