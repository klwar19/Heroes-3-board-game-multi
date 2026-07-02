import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoom, resetRoom } from "./game-room-store";

/**
 * The room seed is what makes each table's map, Far-tile draft and Creature Bank
 * order unique (see adventure-setup.ts). Regression guard for the bug where
 * every fresh game/window opened on the identical map: makeRoom's nonce must
 * draw crypto entropy, NOT `Date.now()`+`Math.random()` — those can both be
 * frozen on a locked-down edge isolate, collapsing every fresh server to one
 * seed.
 */
describe("room seeds survive a frozen clock + frozen Math.random", () => {
  afterEach(() => vi.restoreAllMocks());

  it("two resets of the SAME room still mint different seeds (so different maps)", () => {
    const roomId = "seed-entropy-room";
    createRoom({ roomId });

    // Pin the clock and the RNG, as a sandboxed edge runtime can.
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456);

    const first = resetRoom(roomId).snapshot;
    const second = resetRoom(roomId).snapshot;

    // The roomId is identical across both resets, so the ONLY thing that can make
    // the seeds differ is the nonce's entropy source. With the old recipe both
    // seeds would be identical here.
    expect(first.state.seed).not.toBe(second.state.seed);
  });
});
