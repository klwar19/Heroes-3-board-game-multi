import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  type GameState,
  type RoomMember
} from "@/engine";
import {
  deriveLobbyRecord,
  isStaleRecord,
  LobbyRegistry,
  lobbyRecordSignature,
  MAX_ROOMS_PER_ACCOUNT,
  STALE_ROOM_TTL_MS,
  surplusRoomIds,
  toDirectoryEntry,
  viewerCanClose,
  type LobbyRoomRecord
} from "./lobby-registry";

function member(clientId: string, name: string, seat: RoomMember["seat"] = "observer"): RoomMember {
  return { clientId, name, seat, isHost: false };
}

/** A lobby record built straight from fields, for the registry-level tests. */
function record(overrides: Partial<LobbyRoomRecord> & { roomId: string }): LobbyRoomRecord {
  return {
    name: `Room ${overrides.roomId}`,
    mode: "adventure",
    phase: "setup",
    inProgress: false,
    memberCount: 0,
    seatedCount: 0,
    hosted: false,
    hostName: null,
    hostClientId: null,
    memberClientIds: [],
    ranked: true,
    createdByName: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

const META = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };

describe("deriveLobbyRecord", () => {
  it("summarises an open table with members, seats, and a host", () => {
    const state: GameState = createAdventureGameState({ seed: "derive-1", difficulty: "normal", rollFirstPlayer: false });
    state.room = {
      hosted: true,
      hostClientId: "c1",
      name: "Friday Night",
      members: [member("c1", "Binh", "p1"), member("c2", "Lan", "p2"), member("c3", "Watcher", "observer")]
    };
    state.room.members[0].isHost = true;

    const derived = deriveLobbyRecord({ roomId: "r1", state, ...META, createdByName: "Binh" });

    expect(derived.name).toBe("Friday Night");
    // A started game is "in progress" (it is NOT a fresh setup lobby).
    expect(derived.inProgress).toBe(true);
    expect(derived.memberCount).toBe(3);
    // Two of the three members hold a real seat; the observer does not count.
    expect(derived.seatedCount).toBe(2);
    expect(derived.hosted).toBe(true);
    expect(derived.hostName).toBe("Binh");
    expect(derived.hostClientId).toBe("c1");
    expect(derived.memberClientIds).toEqual(["c1", "c2", "c3"]);
    expect(derived.createdByName).toBe("Binh");
    expect(derived.createdAt).toBe(META.createdAt);
    // An adventure game reports the adventure mode.
    expect(derived.mode).toBe("adventure");
  });

  it("carries the room's mode so the lobby can tell adventures from battle tests", () => {
    const adventure = createAdventureLobbyState({ seed: "mode-adv" });
    expect(deriveLobbyRecord({ roomId: "a", state: adventure, ...META }).mode).toBe("adventure");
    // A combat sandbox is a "battle test" table. CONTROL: the same helper reads
    // it straight from state.mode, so the two diverge.
    const sandbox = createInitialGameState("mode-battle");
    expect(deriveLobbyRecord({ roomId: "b", state: sandbox, ...META }).mode).toBe("combat-sandbox");
  });

  it("falls back to the id-derived name and marks a fresh setup lobby not-in-progress", () => {
    const state = createAdventureLobbyState({ seed: "derive-2" });
    const derived = deriveLobbyRecord({ roomId: "abc", state, ...META });

    expect(derived.name).toBe("Room abc"); // no chosen name → default label
    expect(derived.inProgress).toBe(false); // fresh setup lobby
    expect(derived.memberCount).toBe(0);
    expect(derived.hosted).toBe(false);
    expect(derived.hostName).toBeNull();
    expect(derived.hostClientId).toBeNull();
    expect(derived.memberClientIds).toEqual([]);
    expect(derived.createdByName).toBeNull();
    // No explicit match type on a legacy/fresh room shows as Ranked (matching
    // the match-report default that only an explicit Normal table opts out).
    expect(derived.ranked).toBe(true);
  });

  it("carries the visible ROSTER — host first, guests labeled — so the lobby shows who is in which room", () => {
    const state = createAdventureLobbyState({ seed: "derive-roster" });
    state.room = {
      hosted: true,
      hostClientId: "c2",
      members: [
        { clientId: "c1", name: "Lan", seat: "p2", isHost: false }, // guest (no userId)
        { clientId: "c2", name: "Binh", seat: "p1", isHost: true, userId: "u_binh" },
        { clientId: "c3", name: "Watcher", seat: "observer", isHost: false, userId: "u_watch" }
      ]
    };
    const derived = deriveLobbyRecord({ roomId: "r", state, ...META });
    // Host first, then seated players, then observers; guest = no verified account.
    expect(derived.members).toEqual([
      { name: "Binh", host: true, guest: false, seated: true },
      { name: "Lan", host: false, guest: true, seated: true },
      { name: "Watcher", host: false, guest: false, seated: false }
    ]);
    // The directory row carries it through (legacy records read as empty).
    expect(toDirectoryEntry(derived).members).toEqual(derived.members);
    expect(toDirectoryEntry(record({ roomId: "legacy" })).members).toEqual([]);
    // A roster change (a rename, a guest signing in) re-reports to the lobby:
    // the signature must move with it.
    const renamed = deriveLobbyRecord({ roomId: "r", state, ...META });
    renamed.members = renamed.members!.map((entry) => (entry.name === "Lan" ? { ...entry, name: "Lan II" } : entry));
    expect(lobbyRecordSignature(renamed)).not.toBe(lobbyRecordSignature(derived));
  });

  it("reflects the room's match type: an explicit Normal table shows casual, Ranked shows ranked", () => {
    const casual = createAdventureLobbyState({ seed: "derive-casual" });
    casual.room = { hosted: false, hostClientId: null, members: [], ranked: false };
    expect(deriveLobbyRecord({ roomId: "n", state: casual, ...META }).ranked).toBe(false);

    const ranked = createAdventureLobbyState({ seed: "derive-ranked" });
    ranked.room = { hosted: false, hostClientId: null, members: [], ranked: true };
    expect(deriveLobbyRecord({ roomId: "r", state: ranked, ...META }).ranked).toBe(true);
  });

  it("reports whether the room is password-protected (a boolean only — never the hash)", () => {
    const locked = createAdventureLobbyState({ seed: "derive-locked" });
    locked.room = { hosted: false, hostClientId: null, members: [], passwordHash: "abc123def45678" };
    const record = deriveLobbyRecord({ roomId: "lk", state: locked, ...META });
    expect(record.locked).toBe(true);
    // The directory carries only the boolean, never the hash itself.
    expect(JSON.stringify(record)).not.toContain("abc123def45678");

    // CONTROL: an open, unlocked room reports locked === false.
    const open = createAdventureLobbyState({ seed: "derive-unlocked" });
    open.room = { hosted: false, hostClientId: null, members: [] };
    expect(deriveLobbyRecord({ roomId: "op", state: open, ...META }).locked).toBe(false);
  });
});

describe("deriveLobbyRecord — owner (per-account cap key)", () => {
  it("keys the owner off the HOST's verified account", () => {
    const state = createAdventureLobbyState({ seed: "owner-host" });
    state.room = {
      hosted: true,
      hostClientId: "c2",
      members: [
        { clientId: "c1", name: "Lan", seat: "p2", isHost: false, userId: "u_lan" },
        { clientId: "c2", name: "Binh", seat: "p1", isHost: true, userId: "u_binh" }
      ]
    };
    expect(deriveLobbyRecord({ roomId: "r", state, ...META }).ownerUserId).toBe("u_binh");
  });

  it("falls back to the first member when there is no host, and is null for a guest table", () => {
    const openAccount = createAdventureLobbyState({ seed: "owner-open" });
    openAccount.room = {
      hosted: false,
      hostClientId: null,
      members: [{ clientId: "c1", name: "Solo", seat: "p1", isHost: false, userId: "u_solo" }]
    };
    expect(deriveLobbyRecord({ roomId: "r", state: openAccount, ...META }).ownerUserId).toBe("u_solo");

    // A guest (no verified userId) yields a null owner — the cap never counts it.
    const guest = createAdventureLobbyState({ seed: "owner-guest" });
    guest.room = {
      hosted: false,
      hostClientId: null,
      members: [{ clientId: "c1", name: "Ghost", seat: "p1", isHost: false }]
    };
    expect(deriveLobbyRecord({ roomId: "r", state: guest, ...META }).ownerUserId).toBeNull();
  });

  it("moves the report signature when the owner changes (a guest host signing in)", () => {
    const base = record({ roomId: "s", ownerUserId: null, memberCount: 1, memberClientIds: ["c1"] });
    const signedIn = { ...base, ownerUserId: "u_new" };
    expect(lobbyRecordSignature(signedIn)).not.toBe(lobbyRecordSignature(base));
  });
});

describe("surplusRoomIds (per-account cap)", () => {
  it("returns nothing when every account is within the cap", () => {
    const records = [
      record({ roomId: "a", ownerUserId: "u", memberCount: 1, memberClientIds: ["1"] }),
      record({ roomId: "b", ownerUserId: "u", memberCount: 1, memberClientIds: ["2"] }),
      record({ roomId: "c", ownerUserId: "v", memberCount: 1, memberClientIds: ["3"] })
    ];
    expect(surplusRoomIds(records, 3)).toEqual([]);
  });

  it("evicts idle setup lobbies before in-progress GAMES, then the oldest", () => {
    // cap 2. Owner has a live game + 2 idle lobbies. The game must survive; the
    // two idle lobbies are the surplus (older one is not spared over the game).
    const records = [
      record({
        roomId: "game",
        ownerUserId: "u",
        inProgress: true,
        memberCount: 2,
        memberClientIds: ["a", "b"],
        createdAt: "2026-01-01T00:00:00.000Z"
      }),
      record({
        roomId: "lobby-old",
        ownerUserId: "u",
        inProgress: false,
        memberCount: 1,
        memberClientIds: ["c"],
        createdAt: "2026-02-01T00:00:00.000Z"
      }),
      record({
        roomId: "lobby-new",
        ownerUserId: "u",
        inProgress: false,
        memberCount: 1,
        memberClientIds: ["d"],
        createdAt: "2026-03-01T00:00:00.000Z"
      })
    ];
    // Keeps the in-progress game + the newest idle lobby; evicts the older lobby.
    expect(surplusRoomIds(records, 2)).toEqual(["lobby-old"]);
  });

  it("NEVER counts or evicts an ownerless (guest / not-yet-joined) room", () => {
    // Ten guest rooms, cap 3: none is evicted, because none has an account owner.
    const guests = Array.from({ length: 10 }, (_unused, index) =>
      record({ roomId: `g${index}`, ownerUserId: null, memberCount: 1, memberClientIds: [`c${index}`] })
    );
    expect(surplusRoomIds(guests, 3)).toEqual([]);
  });

  it("is deterministic regardless of input order (stable tie-break)", () => {
    const mk = () => [
      record({ roomId: "z", ownerUserId: "u", createdAt: "2026-01-01T00:00:00.000Z", memberCount: 1, memberClientIds: ["z"] }),
      record({ roomId: "a", ownerUserId: "u", createdAt: "2026-01-01T00:00:00.000Z", memberCount: 1, memberClientIds: ["a"] }),
      record({ roomId: "m", ownerUserId: "u", createdAt: "2026-01-01T00:00:00.000Z", memberCount: 1, memberClientIds: ["m"] })
    ];
    const forward = surplusRoomIds(mk(), 2);
    const reversed = surplusRoomIds([...mk()].reverse(), 2);
    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(1);
  });
});

describe("viewerCanClose", () => {
  it("lets only the host close a HOSTED room", () => {
    const hosted = record({ roomId: "h", hosted: true, hostClientId: "host", memberClientIds: ["host", "guest"], memberCount: 2 });
    expect(viewerCanClose(hosted, "host")).toBe(true);
    // The mutation control: a non-host member and a stranger and an anonymous
    // viewer must all be refused on a hosted room.
    expect(viewerCanClose(hosted, "guest")).toBe(false);
    expect(viewerCanClose(hosted, "stranger")).toBe(false);
    expect(viewerCanClose(hosted, undefined)).toBe(false);
  });

  it("lets ANYONE close an OPEN table (no host/ownership to protect)", () => {
    // A per-session clientId means the creator no longer "owns" an open room
    // after a browser restart, so open tables are closeable by anyone — members,
    // strangers and anonymous viewers alike — which is what keeps them from
    // becoming undeletable clutter. The HOSTED test above is the control that
    // proves this branch is open-table-only, not a blanket "always true".
    const populated = record({ roomId: "o", hosted: false, memberClientIds: ["a", "b"], memberCount: 2 });
    expect(viewerCanClose(populated, "a")).toBe(true);
    expect(viewerCanClose(populated, "stranger")).toBe(true);
    expect(viewerCanClose(populated, undefined)).toBe(true);

    const empty = record({ roomId: "e", hosted: false, memberClientIds: [], memberCount: 0 });
    expect(viewerCanClose(empty, "anyone")).toBe(true);
    expect(viewerCanClose(empty, undefined)).toBe(true);
  });
});

describe("isStaleRecord", () => {
  const now = Date.now();

  it("prunes an EMPTY room idle past the TTL but keeps a recent one", () => {
    const old = record({ roomId: "old", memberCount: 0, updatedAt: new Date(now - STALE_ROOM_TTL_MS - 60_000).toISOString() });
    const fresh = record({ roomId: "fresh", memberCount: 0, updatedAt: new Date(now).toISOString() });
    expect(isStaleRecord(old, now)).toBe(true);
    expect(isStaleRecord(fresh, now)).toBe(false);
  });

  it("never prunes an idle room that still has members (the control)", () => {
    const occupied = record({
      roomId: "occ",
      memberCount: 1,
      memberClientIds: ["c1"],
      updatedAt: new Date(now - STALE_ROOM_TTL_MS - 60_000).toISOString()
    });
    expect(isStaleRecord(occupied, now)).toBe(false);
  });
});

describe("toDirectoryEntry", () => {
  it("projects a record into a per-viewer row with canClose wired in", () => {
    const hosted = record({ roomId: "h", hosted: true, hostClientId: "host", memberClientIds: ["host"], memberCount: 1, hostName: "Host" });
    expect(toDirectoryEntry(hosted, "host").canClose).toBe(true);
    expect(toDirectoryEntry(hosted, "stranger").canClose).toBe(false);
    // The viewer-only field (canClose) is the only thing that varies by viewer.
    const a = toDirectoryEntry(hosted, "host");
    const b = toDirectoryEntry(hosted, "stranger");
    expect({ ...a, canClose: null }).toEqual({ ...b, canClose: null });
    // hostClientId / memberClientIds are deliberately NOT leaked into the row.
    expect("hostClientId" in a).toBe(false);
    expect("memberClientIds" in a).toBe(false);
  });
});

describe("lobbyRecordSignature", () => {
  it("ignores updatedAt but reacts to every directory-relevant change", () => {
    const base = record({ roomId: "s", memberCount: 1, memberClientIds: ["c1"], updatedAt: "2026-01-01T00:00:00.000Z" });
    const laterSameContent = { ...base, updatedAt: "2026-06-01T00:00:00.000Z" };
    // Only updatedAt moved → the room party must NOT re-report.
    expect(lobbyRecordSignature(laterSameContent)).toBe(lobbyRecordSignature(base));

    // A real change (a new member) DOES change the signature.
    const joined = { ...base, memberCount: 2, memberClientIds: ["c1", "c2"] };
    expect(lobbyRecordSignature(joined)).not.toBe(lobbyRecordSignature(base));

    // The room's mode is directory-relevant (adventure vs battle test), so it
    // must move the signature too.
    const battle = { ...base, mode: "combat-sandbox" as const };
    expect(lobbyRecordSignature(battle)).not.toBe(lobbyRecordSignature(base));
  });
});

describe("LobbyRegistry", () => {
  it("upserts by roomId without ever duplicating a room", () => {
    const registry = new LobbyRegistry();
    registry.upsert(record({ roomId: "r", name: "First", memberCount: 0 }));
    registry.upsert(record({ roomId: "r", name: "Renamed", memberCount: 2, memberClientIds: ["a", "b"] }));
    expect(registry.size).toBe(1);
    const [entry] = registry.list();
    expect(entry.name).toBe("Renamed");
    expect(entry.memberCount).toBe(2);
  });

  it("removes a room and reports whether it was present", () => {
    const registry = new LobbyRegistry([record({ roomId: "r" })]);
    expect(registry.remove("r")).toBe(true);
    expect(registry.remove("r")).toBe(false);
    expect(registry.list()).toHaveLength(0);
  });

  it("lists rooms newest-activity first", () => {
    const registry = new LobbyRegistry([
      record({ roomId: "older", updatedAt: "2026-01-01T00:00:00.000Z", memberCount: 1, memberClientIds: ["x"] }),
      record({ roomId: "newer", updatedAt: "2026-03-01T00:00:00.000Z", memberCount: 1, memberClientIds: ["y"] }),
      record({ roomId: "middle", updatedAt: "2026-02-01T00:00:00.000Z", memberCount: 1, memberClientIds: ["z"] })
    ]);
    expect(registry.list().map((entry) => entry.roomId)).toEqual(["newer", "middle", "older"]);
  });

  it("prunes stale empty rooms when listing, but keeps occupied ones", () => {
    const now = Date.now();
    const stale = new Date(now - STALE_ROOM_TTL_MS - 60_000).toISOString();
    const registry = new LobbyRegistry([
      record({ roomId: "ghost", memberCount: 0, updatedAt: stale }),
      record({ roomId: "occupied", memberCount: 1, memberClientIds: ["c1"], updatedAt: stale }),
      record({ roomId: "live", memberCount: 0, updatedAt: new Date(now).toISOString() })
    ]);
    const ids = registry.list(undefined, now).map((entry) => entry.roomId).sort();
    expect(ids).toEqual(["live", "occupied"]);
    // The ghost is gone from the registry itself, not just this view.
    expect(registry.has("ghost")).toBe(false);
    expect(registry.size).toBe(2);
  });

  it("computes canClose per viewer at list time (the directory's close gate)", () => {
    const registry = new LobbyRegistry([
      record({ roomId: "hosted", hosted: true, hostClientId: "host", hostName: "Host", memberClientIds: ["host", "guest"], memberCount: 2 })
    ]);
    expect(registry.list("host")[0].canClose).toBe(true);
    expect(registry.list("guest")[0].canClose).toBe(false);
    expect(registry.list("stranger")[0].canClose).toBe(false);
  });

  it("hides an account's rooms beyond the per-account cap from the directory", () => {
    // One owner opens cap+2 rooms; the directory shows only `cap`, newest first.
    const owner = "u_flood";
    const many = Array.from({ length: MAX_ROOMS_PER_ACCOUNT + 2 }, (_unused, index) =>
      record({
        roomId: `r${index}`,
        ownerUserId: owner,
        memberCount: 1,
        memberClientIds: [`c${index}`],
        // Older index = older createdAt, so the newest survive.
        createdAt: new Date(2026, 0, index + 1).toISOString(),
        updatedAt: new Date(2026, 0, index + 1).toISOString()
      })
    );
    const registry = new LobbyRegistry(many);
    const listed = registry.list().filter((entry) => entry.roomId.startsWith("r"));
    expect(listed).toHaveLength(MAX_ROOMS_PER_ACCOUNT);
    // The two OLDEST (r0, r1) are the ones hidden.
    expect(listed.map((entry) => entry.roomId).sort()).toEqual(["r2", "r3", "r4"]);

    // CONTROL: two DIFFERENT accounts each under the cap are all shown — the
    // limit is per-account, not global.
    const twoOwners = new LobbyRegistry([
      record({ roomId: "a1", ownerUserId: "u_a", memberCount: 1, memberClientIds: ["a"] }),
      record({ roomId: "a2", ownerUserId: "u_a", memberCount: 1, memberClientIds: ["b"] }),
      record({ roomId: "b1", ownerUserId: "u_b", memberCount: 1, memberClientIds: ["c"] }),
      record({ roomId: "b2", ownerUserId: "u_b", memberCount: 1, memberClientIds: ["d"] })
    ]);
    expect(twoOwners.list()).toHaveLength(4);
  });

  it("enforceOwnerCaps removes surplus rooms and returns the evicted ids", () => {
    const owner = "u_x";
    const registry = new LobbyRegistry(
      Array.from({ length: MAX_ROOMS_PER_ACCOUNT + 1 }, (_unused, index) =>
        record({
          roomId: `k${index}`,
          ownerUserId: owner,
          memberCount: 1,
          memberClientIds: [`c${index}`],
          createdAt: new Date(2026, 0, index + 1).toISOString()
        })
      )
    );
    const evicted = registry.enforceOwnerCaps();
    // Exactly one over the cap → exactly one evicted (the oldest, k0).
    expect(evicted).toEqual(["k0"]);
    expect(registry.has("k0")).toBe(false);
    expect(registry.size).toBe(MAX_ROOMS_PER_ACCOUNT);
  });

  it("round-trips its records for Durable Object persistence", () => {
    const original = new LobbyRegistry();
    original.upsert(record({ roomId: "r1", memberCount: 1, memberClientIds: ["a"] }));
    original.upsert(record({ roomId: "r2", hosted: true, hostClientId: "h", memberClientIds: ["h"], memberCount: 1 }));

    const restored = new LobbyRegistry(original.records());
    expect(restored.size).toBe(2);
    expect(restored.list("h").find((entry) => entry.roomId === "r2")?.canClose).toBe(true);
  });
});
