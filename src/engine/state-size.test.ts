import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getPlayerView, type AdventurePlayerConfig, type GameState } from "./index";

// ---------------------------------------------------------------------------
// Snapshot-size regression guard (Phase 2, plan §D6).
//
// Every action serializes the WHOLE GameState: the built-in store persists +
// broadcasts it, and the PartyKit edge stores it under ONE Durable Object key
// (~128 KiB hard cap) and broadcasts it to every socket (~1 MiB WS cap). Nobody
// had measured a real 4-player game. This test records the bytes and fails if
// they cross an explicit budget — a tripwire before a snapshot silently
// outgrows a transport limit. If it trips, that is the signal to add gzip
// (CompressionStream) and/or chunked `snapshot:<i>` storage in party/index.ts.
// ---------------------------------------------------------------------------

const FOUR_PLAYERS: AdventurePlayerConfig[] = [
  { id: "p1", name: "Catherine of Castle", factionId: "castle", heroDefId: "catherine" },
  { id: "p2", name: "Sandro of Necropolis", factionId: "necropolis", heroDefId: "sandro" },
  { id: "p3", name: "Crag Hack of Stronghold", factionId: "stronghold", heroDefId: "crag_hack" },
  { id: "p4", name: "Gelu of Rampart", factionId: "rampart", heroDefId: "gelu" }
];

/** A seeded 4-player game with the event log padded toward its cap (late-game). */
function lateGameFixture(): GameState {
  let state = createAdventureGameState({
    seed: "state-size-fixture",
    difficulty: "hard",
    players: FOUR_PLAYERS,
    rollFirstPlayer: false
  });
  // Fatten the event log toward its rolling cap so the fixture reflects a game
  // that has been PLAYED, not a pristine setup — the log is the part that grows.
  for (let round = 0; round < 40; round += 1) {
    for (const playerId of ["p1", "p2", "p3", "p4"] as const) {
      const result = applyAction(state, { type: "END_TURN", playerId });
      if (result.errors.length === 0) {
        state = result.state;
      }
    }
  }
  return state;
}

function bytesOf(value: unknown): number {
  // Node's Buffer is available under vitest; matches the wire encoding (UTF-8).
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

describe("GameState snapshot size stays within transport budgets", () => {
  // The alert threshold. Chosen as a headroom-comfortable fraction of the ~128
  // KiB Durable-Object value cap. If a fixture legitimately grows past this,
  // don't just bump the number — implement compression/chunking first (see the
  // header note), THEN re-baseline with a comment explaining why.
  const SNAPSHOT_BUDGET_BYTES = 100 * 1024;

  it("a seeded 4-player late-game full snapshot is under budget", () => {
    const state = lateGameFixture();
    const bytes = bytesOf(state);
    // Surface the measurement in the test output for tracking over time.
    console.log(`[state-size] 4-player full snapshot: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB)`);
    expect(bytes).toBeLessThan(SNAPSHOT_BUDGET_BYTES);
  });

  it("a per-connection player view is no larger than the full snapshot (redaction only shrinks)", () => {
    const state = lateGameFixture();
    const full = bytesOf(state);
    const view = bytesOf(getPlayerView(state, "p1"));
    // Redaction replaces opponents' hands/decks with counts, so a seat's view is
    // never bigger than the raw state — the property Phase 2's per-connection
    // redaction relies on to also shrink frames.
    expect(view).toBeLessThanOrEqual(full);
  });
});
