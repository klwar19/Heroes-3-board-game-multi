// @vitest-environment jsdom
/**
 * Snapshot-ingestion resilience — the "game froze, every click says 'That
 * action is not legal in the current game state'" class (reported live at
 * round 6 in single player):
 *
 *  1. A THROW inside the ~2000-line presentation derivation
 *     (ingestServerState) must never block the AUTHORITATIVE state commit.
 *     Before the ingestServerStateSafely wrapper, the arbiter had already
 *     accepted the frame's version, the throw skipped setState, and the
 *     rendered table froze on the old state forever — while every click was
 *     rejected server-side and the stale-state resync never fired (the
 *     rejection reply's version MATCHED the arbiter's).
 *  2. A REJECTED action must resync unconditionally — not only when the
 *     reply's version differs from the arbiter's — so any client/server
 *     divergence heals on the first rejection instead of freezing play.
 *  3. CONTROL: a successful action must NOT trigger the resync refetch.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { createAdventureGameState, type GameState } from "@/engine";
import type { GameRoomSnapshot, RoomConnectionHandlers } from "@/lib/realtime";
import { UI_MODE_STORAGE_KEY } from "@/lib/ui-mode-preference";
import { HELPER_COACH_STORAGE_KEY } from "@/lib/helper-coach-preference";

const { connectRoomMock, routerPush, metricBomb } = vi.hoisted(() => ({
  connectRoomMock: vi.fn(),
  routerPush: vi.fn(),
  // When armed, the end-of-derivation metric throws — simulating a TypeError
  // anywhere inside ingestServerState's presentation work.
  metricBomb: { armed: false }
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
  recordPerformanceMetric: (entry: { name: string }) => {
    if (metricBomb.armed && entry.name === "room.presentation.event-window") {
      throw new Error("test: poisoned presentation derivation");
    }
  }
}));
vi.mock("@/lib/realtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/realtime")>();
  return { ...original, connectRoom: connectRoomMock };
});

const ROOM_ID = "snapshot-resilience-test";

function snapshotFor(state: GameState, version = 1): GameRoomSnapshot {
  return {
    roomId: ROOM_ID,
    version,
    updatedAt: new Date().toISOString(),
    state
  };
}

/**
 * Fake room transport. Returns the captured handlers (for pushing later
 * broadcast frames) plus the submitAction/fetchSnapshot mocks the tests
 * assert against. `submitResult` controls what an action reply carries.
 */
function serveRoom(
  state: GameState,
  submitResult: { version: number; errors: { code: string; message: string }[] }
) {
  const snapshot = snapshotFor(state);
  let handlers: RoomConnectionHandlers | null = null;
  const submitAction = vi.fn(async () => ({ ...submitResult, notices: [] }));
  const fetchSnapshot = vi.fn(async () => snapshot);
  connectRoomMock.mockReset().mockImplementation((_roomId: string, given: RoomConnectionHandlers) => {
    handlers = given;
    return {
      close: vi.fn(),
      submitAction,
      resetRoom: vi.fn(async () => snapshot),
      fetchSnapshot,
      restoreRoom: vi.fn(async () => snapshot),
      fetchSinglePlayerSave: vi.fn(async () => ({ state: snapshot.state, version: snapshot.version })),
      loadSinglePlayerSave: vi.fn(async () => snapshot)
    };
  });
  return {
    submitAction,
    fetchSnapshot,
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

function stateAtRound(seed: string, round: number): GameState {
  const state = createAdventureGameState({ seed, rollFirstPlayer: false });
  const copy = JSON.parse(JSON.stringify(state)) as GameState;
  copy.round = round;
  return copy;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", `/?room=${ROOM_ID}`);
  window.localStorage.setItem("homm3bg.displayName", "Tester");
  window.localStorage.setItem(HELPER_COACH_STORAGE_KEY, "off");
  window.localStorage.setItem(UI_MODE_STORAGE_KEY, "phone");
  metricBomb.armed = false;
});

afterEach(() => {
  metricBomb.armed = false;
  cleanup();
});

describe("snapshot ingestion resilience", () => {
  it("a presentation-derivation throw still commits the authoritative frame (and later frames recover cosmetics)", async () => {
    const base = stateAtRound("ingest-resilience", 1);
    const room = serveRoom(base, { version: 1, errors: [] });
    render(<Home />);
    await settle();
    expect(screen.getAllByText("Round 1").length).toBeGreaterThan(0);

    // Push round 2 with the derivation poisoned: without the safety wrapper
    // this throw skipped setState and the table froze on Round 1 forever.
    metricBomb.armed = true;
    await act(async () => {
      room.push(stateAtRound("ingest-resilience", 2), 2);
    });
    metricBomb.armed = false;
    expect(screen.getAllByText("Round 2").length).toBeGreaterThan(0);

    // The poisoned window is skipped, not retried: the next (healthy) frame
    // derives and commits normally.
    await act(async () => {
      room.push(stateAtRound("ingest-resilience", 3), 3);
    });
    expect(screen.getAllByText("Round 3").length).toBeGreaterThan(0);
  });

  it("a rejected action resyncs even when the reply's version matches the client's", async () => {
    const base = stateAtRound("reject-resync", 1);
    // The reply version EQUALS the snapshot version the client holds — the
    // exact shape of the rendered-state-lag freeze, which the old
    // version-mismatch gate never healed.
    const room = serveRoom(base, {
      version: 1,
      errors: [{ code: "ACTION_NOT_LEGAL", message: "That action is not legal in the current game state." }]
    });
    render(<Home />);
    await settle();

    const fetchesBefore = room.fetchSnapshot.mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: /end turn/i }));
    await settle();

    expect(room.submitAction).toHaveBeenCalled();
    expect(room.fetchSnapshot.mock.calls.length).toBeGreaterThan(fetchesBefore);
  });

  it("CONTROL: a successful action does not trigger the resync refetch", async () => {
    const base = stateAtRound("accept-no-refetch", 1);
    const room = serveRoom(base, { version: 2, errors: [] });
    render(<Home />);
    await settle();

    const fetchesBefore = room.fetchSnapshot.mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: /end turn/i }));
    await settle();

    expect(room.submitAction).toHaveBeenCalled();
    expect(room.fetchSnapshot.mock.calls.length).toBe(fetchesBefore);
  });
});
