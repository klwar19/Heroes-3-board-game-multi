import { describe, expect, it } from "vitest";
import {
  LobbyPresenceBoard,
  LobbyPresenceError,
  MAX_PRESENCE_ENTRIES,
  PRESENCE_TTL_MS
} from "./lobby-presence";

// ---------------------------------------------------------------------------
// Lobby presence board. A deterministic clock drives the TTL so every rule is
// pinned by an observable outcome (who is / isn't in the list), each with a
// CONTROL that diverges if the rule is removed.
// ---------------------------------------------------------------------------

function boardAt(start = 1_000_000) {
  let clock = start;
  const board = new LobbyPresenceBoard({ now: () => clock });
  return {
    board,
    advance(ms: number) {
      clock += ms;
    },
    now: () => clock
  };
}

describe("heartbeat + list", () => {
  it("adds a heartbeat and returns the online list", () => {
    const { board } = boardAt();
    board.heartbeat({ clientId: "c1", name: "Alice", userId: "uA" });
    board.heartbeat({ clientId: "c2", name: "Bob" }); // guest

    const list = board.list();
    expect(list.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
    // The account is flagged verified; the guest is not — the badge the panel shows.
    expect(list.find((p) => p.name === "Alice")?.verified).toBe(true);
    expect(list.find((p) => p.name === "Bob")?.verified).toBe(false);
  });

  it("rejects a heartbeat with no client id", () => {
    const { board } = boardAt();
    expect(() => board.heartbeat({ clientId: "", name: "X" })).toThrow(LobbyPresenceError);
  });

  it("carries the room a player is in (and drops the room name when idle in the lobby)", () => {
    const { board } = boardAt();
    board.heartbeat({ clientId: "c1", name: "Alice", roomId: "r1", roomName: "Friday Night" });
    board.heartbeat({ clientId: "c2", name: "Bob" });

    const inRoom = board.list().find((p) => p.name === "Alice");
    expect(inRoom?.roomId).toBe("r1");
    expect(inRoom?.roomName).toBe("Friday Night");
    // CONTROL: a lobby-idle player carries no room at all.
    const idle = board.list().find((p) => p.name === "Bob");
    expect(idle?.roomId).toBeUndefined();
    expect(idle?.roomName).toBeUndefined();
  });

  it("carries setup vs playing roomStatus so the online list can tell a live game from seating", () => {
    const { board } = boardAt();
    board.heartbeat({
      clientId: "c1",
      name: "Alice",
      roomId: "r1",
      roomName: "Friday Night",
      roomStatus: "playing"
    });
    board.heartbeat({
      clientId: "c2",
      name: "Bob",
      roomId: "r2",
      roomName: "New Table",
      roomStatus: "setup"
    });
    // CONTROL: idle in the lobby has no status; garbage status is dropped.
    board.heartbeat({ clientId: "c3", name: "Cara", roomStatus: "playing" });
    board.heartbeat({ clientId: "c4", name: "Dan", roomId: "r3", roomStatus: "nope" });

    expect(board.list().find((p) => p.name === "Alice")?.roomStatus).toBe("playing");
    expect(board.list().find((p) => p.name === "Bob")?.roomStatus).toBe("setup");
    expect(board.list().find((p) => p.name === "Cara")?.roomStatus).toBeUndefined();
    expect(board.list().find((p) => p.name === "Dan")?.roomStatus).toBeUndefined();
  });

  it("never leaks the verified userId into the public entry", () => {
    const { board } = boardAt();
    board.heartbeat({ clientId: "c1", name: "Alice", userId: "u_secret" });
    const [entry] = board.list();
    expect(entry.verified).toBe(true);
    expect(JSON.stringify(entry)).not.toContain("u_secret");
  });
});

describe("TTL expiry (self-healing when a tab vanishes)", () => {
  it("drops an entry once it stops beating for longer than the TTL", () => {
    const ctx = boardAt();
    ctx.board.heartbeat({ clientId: "c1", name: "Alice", userId: "uA" });
    ctx.board.heartbeat({ clientId: "c2", name: "Bob", userId: "uB" });

    // Bob keeps beating; Alice goes silent.
    ctx.advance(PRESENCE_TTL_MS - 1);
    ctx.board.heartbeat({ clientId: "c2", name: "Bob", userId: "uB" });
    ctx.advance(2);

    const names = ctx.board.list().map((p) => p.name);
    // Alice expired (silent past the TTL); Bob, who re-beat, survives — the control.
    expect(names).toEqual(["Bob"]);
    expect(ctx.board.count()).toBe(1);
  });
});

describe("dedup: one account, many tabs", () => {
  it("collapses a signed-in player's tabs to a single entry (latest clientId wins)", () => {
    const { board } = boardAt();
    board.heartbeat({ clientId: "tab1", name: "Alice", userId: "uA" });
    board.heartbeat({ clientId: "tab2", name: "Alice", userId: "uA" });

    const alice = board.list().filter((p) => p.name === "Alice");
    expect(alice).toHaveLength(1);
    // The entry tracks the most recent tab (for "you" styling / React keys).
    expect(alice[0].clientId).toBe("tab2");
    // CONTROL: two DIFFERENT accounts are two entries.
    board.heartbeat({ clientId: "tab3", name: "Bob", userId: "uB" });
    expect(board.list()).toHaveLength(2);
  });

  it("moves a guest entry onto its account key when that tab signs in (no duplicate)", () => {
    const { board } = boardAt();
    board.heartbeat({ clientId: "c1", name: "Guest" }); // guest first
    expect(board.list()).toHaveLength(1);
    expect(board.list()[0].verified).toBe(false);

    // Same tab, now signed in: the guest entry must not linger beside the account.
    board.heartbeat({ clientId: "c1", name: "Alice", userId: "uA" });
    const list = board.list();
    expect(list).toHaveLength(1);
    expect(list[0].verified).toBe(true);
    expect(list[0].name).toBe("Alice");
  });
});

describe("remove (clean leave)", () => {
  it("drops a guest by clientId and a verified player by either id", () => {
    const { board } = boardAt();
    board.heartbeat({ clientId: "g1", name: "Guest" });
    board.heartbeat({ clientId: "c1", name: "Alice", userId: "uA" });

    board.remove("g1");
    expect(board.list().map((p) => p.name)).toEqual(["Alice"]);

    // A verified entry is keyed by userId, but removing by its latest clientId
    // still finds it (the client may not know its own userId).
    board.remove("c1");
    expect(board.list()).toHaveLength(0);
  });
});

describe("sorting + bounds", () => {
  it("lists verified players first, then those in a room, then by name", () => {
    const { board } = boardAt();
    board.heartbeat({ clientId: "g2", name: "Zed" }); // guest, lobby
    board.heartbeat({ clientId: "c1", name: "Yara", userId: "uY", roomId: "r1" }); // verified, in room
    board.heartbeat({ clientId: "c2", name: "Xena", userId: "uX" }); // verified, lobby
    board.heartbeat({ clientId: "g1", name: "Wade", roomId: "r2" }); // guest, in room

    // Verified (Yara in-room, then Xena lobby), then guests (Wade in-room, Zed lobby).
    expect(board.list().map((p) => p.name)).toEqual(["Yara", "Xena", "Wade", "Zed"]);
  });

  it("stays bounded, evicting the least-recently-seen entries past the cap", () => {
    const ctx = boardAt();
    for (let i = 0; i < MAX_PRESENCE_ENTRIES + 5; i += 1) {
      ctx.advance(1);
      ctx.board.heartbeat({ clientId: `c${i}`, name: `P${i}` });
    }
    expect(ctx.board.count()).toBe(MAX_PRESENCE_ENTRIES);
    // The five oldest were evicted; the newest survive — the control on which end drops.
    const names = new Set(ctx.board.list().map((p) => p.name));
    expect(names.has("P0")).toBe(false);
    expect(names.has(`P${MAX_PRESENCE_ENTRIES + 4}`)).toBe(true);
  });
});
