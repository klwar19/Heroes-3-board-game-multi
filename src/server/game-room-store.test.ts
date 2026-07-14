import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AFK_IDLE_MS,
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  getAfkState,
  getLegalActions,
  redactStateForSeat,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";
import { EVENTS_DECK_ID, getEventsState, startAdventureRound } from "@/engine/adventure";
import { pumpAdventureQueues } from "@/engine/adventure-reducer";
import {
  closeRoom,
  createRoom,
  enforceRoomCaps,
  getRoomSnapshot,
  handleRoomDisconnect,
  listRooms,
  markRoomClientConnected,
  markRoomClientDisconnected,
  resetRoom,
  restoreRoom,
  STALE_ROOM_TTL_MS,
  submitRoomAction
} from "./game-room-store";
import { MAX_ROOMS_PER_ACCOUNT } from "./lobby-registry";

/** A fresh id per case so disk-persisted rooms from earlier runs never bleed in. */
function uniqueRoom(name: string): string {
  return `test-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The same persist dir the store reads (no HOMM3BG_ROOM_DIR set under vitest). */
const persistDir = process.env.HOMM3BG_ROOM_DIR ?? join(tmpdir(), "homm3bg-rooms");

function entryFor(roomId: string, viewerClientId?: string) {
  return listRooms(viewerClientId).find((entry) => entry.roomId === roomId) ?? null;
}

function totalResources(state: GameState, playerId: PlayerId): number {
  const resources = state.players[playerId]?.resources;
  return resources ? resources.gold + resources.buildingMaterials + resources.valuables : 0;
}

function whiteRavenState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.decks.astrologers.drawPile = ["astrologers.white_raven"];
  state.activeEffects = [];
  for (const playerId of ["p1", "p2"] as const) {
    state.players[playerId].hand = [];
    state.players[playerId].morale = 0;
    state.players[playerId].canMulligan = false;
    state.players[playerId].needsHandRefresh = false;
  }
  return state;
}

function dancingImpState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.decks.astrologers.drawPile = ["astrologers.dancing_imp"];
  state.decks.astrologers.discardPile = [];
  state.activeEffects = [];
  state.players.p1.hand = ["stat.attack"];
  state.players.p1.deck = [];
  state.players.p1.discard = [];
  state.players.p1.removed = [];
  state.players.p2.hand = ["stat.defense"];
  state.players.p2.deck = [];
  state.players.p2.discard = [];
  state.players.p2.removed = [];
  for (const playerId of ["p1", "p2"] as const) {
    state.players[playerId].morale = 0;
    state.players[playerId].canMulligan = false;
    state.players[playerId].needsHandRefresh = false;
  }
  return state;
}

function shadyAuctionEventState(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: true
  });
  const eventDeck = state.decks[EVENTS_DECK_ID];
  if (!eventDeck) {
    throw new Error("Event deck was not created");
  }
  eventDeck.drawPile = eventDeck.drawPile.filter((cardId) => cardId !== "event.a_shady_auction");
  eventDeck.drawPile.push("event.a_shady_auction");
  state.pendingChoice = null;
  state.adventure!.pendingVisit = null;
  state.adventure!.rewardQueue = [];
  for (const playerId of ["p1", "p2"] as const) {
    const player = state.players[playerId];
    player.hand = [];
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources = { gold: 30, buildingMaterials: 0, valuables: 0 };
    player.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
  }
  state.round = 3;
  startAdventureRound(state);
  pumpAdventureQueues(state);
  return state;
}

function submitAs(roomId: string, action: GameAction, actor?: { clientId?: string; userId?: string }) {
  return submitRoomAction(roomId, action, actor?.clientId, actor?.userId);
}

describe("room recovery (restoreRoom)", () => {
  it("re-seeds a fresh lobby with a cached in-progress game", () => {
    const roomId = uniqueRoom("restore");
    const lobby = getRoomSnapshot(roomId);
    expect(lobby.state.phase).toBe("setup");
    expect(Boolean(lobby.state.setupLobby)).toBe(true);

    const saved = createAdventureGameState({ seed: "restore-seed", difficulty: "normal", rollFirstPlayer: false });
    expect(saved.phase).not.toBe("setup");

    const restored = restoreRoom(roomId, saved);
    expect(restored.state.phase).toBe(saved.phase);
    expect(restored.state.seed).toBe(saved.seed);
    expect(restored.version).toBeGreaterThan(lobby.version);

    // The room now holds the recovered game.
    expect(getRoomSnapshot(roomId).state.phase).toBe(saved.phase);
  });

  it("never clobbers a game already in progress", () => {
    const roomId = uniqueRoom("noclobber");
    const first = createAdventureGameState({ seed: "first-game", difficulty: "normal", rollFirstPlayer: false });
    restoreRoom(roomId, first);

    const second = createAdventureGameState({ seed: "second-game", difficulty: "normal", rollFirstPlayer: false });
    const result = restoreRoom(roomId, second);

    // Refused — the room still holds the first game.
    expect(result.state.seed).toBe(first.seed);
  });

  it("creates a battle-test room in combat-sandbox mode and reports it in the directory", () => {
    const battleId = uniqueRoom("battle");
    const created = createRoom({ roomId: battleId, mode: "combat-sandbox", name: "Arena" });
    expect(created.state.mode).toBe("combat-sandbox");
    // The lobby directory carries the mode so /battle can list it (and /play can
    // filter it out). CONTROL: a default room stays an adventure.
    expect(entryFor(battleId)?.mode).toBe("combat-sandbox");
    const adventureId = uniqueRoom("adv");
    createRoom({ roomId: adventureId, name: "Table" });
    expect(entryFor(adventureId)?.mode).toBe("adventure");
  });

  it("refuses to restore a bare lobby (nothing to recover)", () => {
    const roomId = uniqueRoom("barelobby");
    const before = getRoomSnapshot(roomId);
    const result = restoreRoom(roomId, createAdventureLobbyState({ seed: "another-lobby" }));
    // No real game in the payload, so the room is left untouched.
    expect(result.version).toBe(before.version);
    expect(result.state.phase).toBe("setup");
  });

  it("only a member may restore over a HOSTED lobby (an outsider cannot stomp it)", () => {
    const roomId = uniqueRoom("restoreauth");
    getRoomSnapshot(roomId);
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    const before = getRoomSnapshot(roomId);
    const fabricated = createAdventureGameState({ seed: "fabricated", difficulty: "normal", rollFirstPlayer: false });

    // An outsider (and an anonymous caller) bounce off — the hosted lobby stays.
    for (const actor of ["stranger", undefined] as const) {
      const denied = restoreRoom(roomId, fabricated, actor);
      expect(denied.version).toBe(before.version);
      expect(denied.state.phase).toBe("setup");
    }

    // Any member of the hosted table may push the recovered game (the CONTROL —
    // recovery can come from whichever participant's tab reconnects first).
    const restored = restoreRoom(roomId, fabricated, "c2");
    expect(restored.state.seed).toBe("fabricated");
    expect(restored.version).toBeGreaterThan(before.version);
  });
});

describe("room membership through the store", () => {
  it("carries host and seats across a game reset", () => {
    const roomId = uniqueRoom("carry");
    getRoomSnapshot(roomId); // create the room (fresh lobby)
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    const hosted = submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }).snapshot;
    expect(hosted.state.room?.hosted).toBe(true);

    const reset = resetRoom(roomId, { mode: "adventure" }, "c1").snapshot;
    expect(reset.state.room?.hosted).toBe(true);
    expect(reset.state.room?.hostClientId).toBe("c1");
    expect(reset.state.room?.members.some((member) => member.clientId === "c1")).toBe(true);
  });

  it("hosted-room reset: host's word while connected, members once the host is gone, strangers never", () => {
    const roomId = uniqueRoom("resetauth");
    getRoomSnapshot(roomId);
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    markRoomClientConnected(roomId, "c1"); // the host holds a live stream
    const before = getRoomSnapshot(roomId);

    // While the host is connected: a member, a stranger and an anonymous
    // caller all bounce off — the game is untouched.
    for (const actor of ["c2", "stranger", undefined] as const) {
      const denied = resetRoom(roomId, { mode: "adventure" }, actor);
      expect(denied.reset, `${actor} must be denied`).toBe(false);
      expect(denied.reason).toMatch(/host|member/i);
      expect(denied.snapshot.version).toBe(before.version);
      expect(denied.snapshot.state.seed).toBe(before.state.seed);
    }

    // The host's own reset goes through (the CONTROL for the guard above).
    const allowed = resetRoom(roomId, { mode: "adventure" }, "c1");
    expect(allowed.reset).toBe(true);
    expect(allowed.snapshot.state.seed).not.toBe(before.state.seed);

    // Host gone (browser restart lost the per-tab id): a MEMBER may now wipe
    // the table — the self-service escape — but a stranger still may not.
    markRoomClientDisconnected(roomId, "c1");
    const afterHostReset = getRoomSnapshot(roomId);
    expect(resetRoom(roomId, { mode: "adventure" }, "stranger").reset).toBe(false);
    const memberReset = resetRoom(roomId, { mode: "adventure" }, "c2");
    expect(memberReset.reset).toBe(true);
    expect(memberReset.snapshot.state.seed).not.toBe(afterHostReset.state.seed);
  });

  it("an in-progress game refuses a direct reset until the all-players vote passes, then only the opener fires it", () => {
    const roomId = uniqueRoom("resetvote");
    // A real in-progress adventure (past the setup lobby), so the "New
    // adventure" reset must be confirmed by every seat first.
    createRoom({
      roomId,
      players: [
        { id: "p1", name: "Ann", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Bob", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    const before = getRoomSnapshot(roomId);
    expect(before.state.setupLobby ?? null).toBeNull();

    // A direct reset (no vote) is refused — the running game is protected.
    const blocked = resetRoom(roomId, { mode: "adventure" }, "cA");
    expect(blocked.reset).toBe(false);
    expect(blocked.reason).toMatch(/confirm a new adventure/i);
    expect(getRoomSnapshot(roomId).state.seed).toBe(before.state.seed);

    // Open + pass the vote through the normal action pipeline.
    submitRoomAction(roomId, { type: "REQUEST_ROOM_RESET", playerId: "p1", clientId: "cA" }, "cA");
    submitRoomAction(roomId, { type: "CONFIRM_ROOM_RESET", playerId: "p2" }, "cB");

    // CONTROL: a DIFFERENT browser still cannot fire the approved reset — exactly
    // one client (the opener) completes it.
    expect(resetRoom(roomId, { mode: "adventure" }, "cB").reset).toBe(false);
    expect(getRoomSnapshot(roomId).state.seed).toBe(before.state.seed);

    // The opening browser completes it: a fresh game (new seed), vote cleared.
    const done = resetRoom(roomId, { mode: "adventure" }, "cA");
    expect(done.reset).toBe(true);
    expect(done.snapshot.state.seed).not.toBe(before.state.seed);
    expect(done.snapshot.state.resetVote ?? null).toBeNull();
  });

  it("the HOST of a hosted in-progress game may start a new adventure directly (override); a non-host member cannot", () => {
    const roomId = uniqueRoom("resethost");
    createRoom({
      roomId,
      players: [
        { id: "p1", name: "Ann", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Bob", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    // Host the running game: c1 is the host, c2 an ordinary member.
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" }, undefined);
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }, undefined);
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "Player" }, undefined);
    markRoomClientConnected(roomId, "c1");
    const before = getRoomSnapshot(roomId);
    expect(before.state.setupLobby ?? null).toBeNull();

    // CONTROL: a non-host member still cannot wipe the running game without the
    // vote (the host is connected, so the member-when-host-gone path is closed).
    const blocked = resetRoom(roomId, { mode: "adventure" }, "c2");
    expect(blocked.reset).toBe(false);
    expect(blocked.reason).toMatch(/confirm a new adventure|host can start/i);
    expect(getRoomSnapshot(roomId).state.seed).toBe(before.state.seed);

    // The HOST starts the new adventure directly — no vote needed. This is the
    // escape hatch that keeps a stuck vote from being a dead end.
    const done = resetRoom(roomId, { mode: "adventure" }, "c1");
    expect(done.reset).toBe(true);
    expect(done.snapshot.state.seed).not.toBe(before.state.seed);
  });

  it("the developer's HOMM3BG_ADMIN_KEY resets any table; a wrong or unconfigured key never does", () => {
    const roomId = uniqueRoom("resetadmin");
    getRoomSnapshot(roomId);
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    markRoomClientConnected(roomId, "c1");
    const before = getRoomSnapshot(roomId);

    const previousKey = process.env.HOMM3BG_ADMIN_KEY;
    try {
      // No key configured: an adminKey argument matches nothing (even "").
      delete process.env.HOMM3BG_ADMIN_KEY;
      expect(resetRoom(roomId, {}, "stranger", "").reset).toBe(false);
      expect(resetRoom(roomId, {}, "stranger", "anything").reset).toBe(false);

      process.env.HOMM3BG_ADMIN_KEY = "sekret";
      expect(resetRoom(roomId, {}, "stranger", "wrong").reset).toBe(false);
      expect(getRoomSnapshot(roomId).state.seed).toBe(before.state.seed);

      // The configured key wipes the table regardless of host connectivity.
      const wiped = resetRoom(roomId, {}, "stranger", "sekret");
      expect(wiped.reset).toBe(true);
      expect(wiped.snapshot.state.seed).not.toBe(before.state.seed);
    } finally {
      if (previousKey === undefined) {
        delete process.env.HOMM3BG_ADMIN_KEY;
      } else {
        process.env.HOMM3BG_ADMIN_KEY = previousKey;
      }
      markRoomClientDisconnected(roomId, "c1");
    }
  });

  it("a signed-in platform admin resets/closes ANY hosted table (control: the same stranger without admin is refused)", () => {
    const roomId = uniqueRoom("adminacct");
    getRoomSnapshot(roomId);
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    markRoomClientConnected(roomId, "c1"); // host present, so no member self-service
    const before = getRoomSnapshot(roomId);

    try {
      // Control: a stranger who is NOT an admin cannot touch the hosted table.
      expect(resetRoom(roomId, { mode: "adventure" }, "stranger", undefined, false).reset).toBe(false);
      expect(closeRoom(roomId, "stranger", undefined, false).closed).toBe(false);
      expect(getRoomSnapshot(roomId).state.seed).toBe(before.state.seed);

      // The SAME stranger, now a verified admin (isAdmin=true), resets it —
      // exactly the flag the API route derives from the admin's session cookie.
      const wiped = resetRoom(roomId, { mode: "adventure" }, "stranger", undefined, true);
      expect(wiped.reset).toBe(true);
      expect(wiped.snapshot.state.seed).not.toBe(before.state.seed);

      // And an admin may close (delete) it outright.
      expect(closeRoom(roomId, "stranger", undefined, true).closed).toBe(true);
    } finally {
      markRoomClientDisconnected(roomId, "c1");
    }
  });

  it("carries the room name and creation stamp across a game reset", () => {
    const roomId = uniqueRoom("namekeep");
    const created = createRoom({ roomId, name: "Friday Night", createdByName: "Binh" });
    expect(created.state.room?.name).toBe("Friday Night");
    const createdAt = created.createdAt;

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Binh" });
    const reset = resetRoom(roomId, { mode: "adventure" }).snapshot;
    // The name survives (carried via state.room) and the creation stamp is not re-minted.
    expect(reset.state.room?.name).toBe("Friday Night");
    expect(reset.createdAt).toBe(createdAt);
    expect(reset.createdByName).toBe("Binh");
  });

  it("enforces seat ownership end-to-end when actorClientId is supplied", () => {
    const roomId = uniqueRoom("seatlock");
    // Seed a started game into the room (restore over the fresh lobby).
    restoreRoom(roomId, createAdventureGameState({ seed: "store-seat", difficulty: "normal", rollFirstPlayer: false }));
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" });

    // The p2 occupant cannot end p1's turn; the wrong-seat owner cannot either.
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p1" }, "c2").result.errors.length).toBeGreaterThan(0);
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p2" }, "c1").result.errors.length).toBeGreaterThan(0);

    // The p1 occupant may end p1's turn.
    const allowed = submitRoomAction(roomId, { type: "END_TURN", playerId: "p1" }, "c1");
    expect(allowed.result.errors).toHaveLength(0);
    expect(allowed.snapshot.state.activePlayerId).toBe("p2");
  });

  it("RECLAIM_HOST through the store honours live presence (refused while host connected, allowed once gone)", () => {
    const roomId = uniqueRoom("reclaim");
    getRoomSnapshot(roomId);
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "Guest" });
    markRoomClientConnected(roomId, "c1"); // the host holds a live stream
    markRoomClientConnected(roomId, "c2");

    try {
      // CONTROL: while the store still sees the host's stream, a member cannot
      // seize host — the store injects the live set into applyAction.
      const refused = submitRoomAction(roomId, { type: "RECLAIM_HOST", clientId: "c2" }, "c2");
      expect(refused.result.errors.length).toBeGreaterThan(0);
      expect(getRoomSnapshot(roomId).state.room?.hostClientId).toBe("c1");

      // The host's browser dies: its stream drops. Now the member may reclaim.
      markRoomClientDisconnected(roomId, "c1");
      const taken = submitRoomAction(roomId, { type: "RECLAIM_HOST", clientId: "c2" }, "c2");
      expect(taken.result.errors).toHaveLength(0);
      expect(taken.snapshot.state.room?.hostClientId).toBe("c2");
      expect(taken.snapshot.state.room?.members.find((m) => m.clientId === "c2")?.isHost).toBe(true);
    } finally {
      markRoomClientDisconnected(roomId, "c2");
    }
  });

  it("keeps player 2's settlement reroll and tile rotation with player 2 when player 2 is host", () => {
    const roomId = uniqueRoom("p2-host-far-tile");
    let seeded = createAdventureGameState({ seed: "p2-host-far", difficulty: "normal", rollFirstPlayer: false });
    for (const player of Object.values(seeded.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    seeded.activePlayerId = "p2";
    seeded.heroes.hero_p2.spaceId = "h:7:2";
    seeded.heroes.hero_p2.movementPoints = 5;
    seeded.adventure!.farTilesOpenedByPlayer!.p2 = 1;
    seeded.adventure!.farTileScriptedDraws = ["F4", "F1"];

    const placed = applyAction(seeded, {
      type: "PLACE_TILE",
      playerId: "p2",
      heroId: "hero_p2",
      supplyIndex: 0,
      centerRow: 6,
      centerCol: 4
    });
    expect(placed.errors).toHaveLength(0);
    seeded = placed.state;
    expect(seeded.pendingChoice).toMatchObject({ playerId: "p2", context: "far-tile-flip" });
    restoreRoom(roomId, seeded);

    // Joining player 2 first makes them the host — the reported failure mode.
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2 Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1 Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c2", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c1", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p2" });

    let choice = getRoomSnapshot(roomId).state.pendingChoice!;
    expect(
      submitRoomAction(
        roomId,
        { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: 1 },
        "c1"
      ).result.errors.length
    ).toBeGreaterThan(0);

    let accepted = submitRoomAction(
      roomId,
      { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: 1 },
      "c2"
    );
    expect(accepted.result.errors).toHaveLength(0);
    expect(accepted.snapshot.state.pendingChoice).toMatchObject({ playerId: "p2", context: "far-tile-flip" });

    choice = accepted.snapshot.state.pendingChoice!;
    accepted = submitRoomAction(
      roomId,
      { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: 0 },
      "c2"
    );
    expect(accepted.result.errors).toHaveLength(0);
    expect(accepted.snapshot.state.adventure!.pendingTileChoice?.playerId).toBe("p2");

    const rotation = getLegalActions(accepted.snapshot.state, "p2").find(
      (legal) => legal.action.type === "SET_TILE_ROTATION"
    );
    expect(rotation).toBeTruthy();
    expect(submitRoomAction(roomId, rotation!.action, "c1").result.errors.length).toBeGreaterThan(0);
    expect(submitRoomAction(roomId, rotation!.action, "c2").result.errors).toHaveLength(0);
  });

  it("does not let a player-2 host answer player 1's City Hall choice", () => {
    const roomId = uniqueRoom("p2-host-city-hall");
    const seeded = createAdventureGameState({ seed: "city-hall-owner", difficulty: "normal", rollFirstPlayer: false });
    seeded.phase = "choice";
    seeded.priorityPlayerId = "p1";
    seeded.pendingChoice = {
      id: "choice_city_hall_owner",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Choose your City Hall income",
      options: [{ label: "Gain 2 gold" }],
      context: "city-hall",
      cityHall: { options: [{ label: "Gain 2 gold", gold: 2 }] },
      returnPhase: "player-turn"
    };
    const goldBefore = seeded.players.p1.resources.gold;
    restoreRoom(roomId, seeded);

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2 Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1 Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c2", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c1", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p2" });

    const choiceAction = {
      type: "CHOOSE_OPTION" as const,
      playerId: "p1",
      choiceId: "choice_city_hall_owner",
      optionIndex: 0
    };
    expect(submitRoomAction(roomId, choiceAction, "c2").result.errors.length).toBeGreaterThan(0);
    const allowed = submitRoomAction(roomId, choiceAction, "c1");
    expect(allowed.result.errors).toHaveLength(0);
    expect(allowed.snapshot.state.players.p1.resources.gold).toBe(goldBefore + 2);
    expect(allowed.snapshot.state.players.p2.resources.gold).toBe(seeded.players.p2.resources.gold);
  });

  it("keeps a map event/visit selection with its owning player", () => {
    const roomId = uniqueRoom("event-choice-owner");
    const seeded = createAdventureGameState({ seed: "event-choice-owner", difficulty: "normal", rollFirstPlayer: false });
    const fieldId = seeded.heroes.hero_p1.spaceId!;
    seeded.phase = "player-turn";
    seeded.activePlayerId = "p1";
    seeded.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId,
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Choose this event's reward",
          options: [
            { label: "Gain 1 gold", steps: [{ type: "GAIN_RESOURCES", gold: 1 }] },
            { label: "Gain 1 movement", steps: [{ type: "GAIN_MOVEMENT", amount: 1 }] }
          ]
        }
      ]
    };
    const goldBefore = seeded.players.p1.resources.gold;
    restoreRoom(roomId, seeded);

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2 Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1 Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c2", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c1", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p2" });

    const eventAction = getLegalActions(getRoomSnapshot(roomId).state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === 0
    )?.action;
    expect(eventAction).toBeTruthy();
    expect(submitRoomAction(roomId, eventAction!, "c2").result.errors.length).toBeGreaterThan(0);

    const allowed = submitRoomAction(roomId, eventAction!, "c1");
    expect(allowed.result.errors).toHaveLength(0);
    expect(allowed.snapshot.state.players.p1.resources.gold).toBe(goldBefore + 1);
    expect(allowed.snapshot.state.adventure!.pendingVisit).toBeNull();
  });
});

describe("room Astrologers resolution", () => {
  const roomModes: {
    label: string;
    hosted: boolean;
    ranked: boolean;
    actors: { p1?: { clientId?: string; userId?: string }; p2?: { clientId?: string; userId?: string } };
  }[] = [
    { label: "open ranked guest table", hosted: false, ranked: true, actors: {} },
    {
      label: "hosted normal guest table",
      hosted: true,
      ranked: false,
      actors: { p1: { clientId: "c1" }, p2: { clientId: "c2" } }
    },
    {
      label: "hosted ranked account table",
      hosted: true,
      ranked: true,
      actors: {
        p1: { clientId: "c1", userId: "u_p1" },
        p2: { clientId: "c2", userId: "u_p2" }
      }
    }
  ];

  for (const mode of roomModes) {
    it(`resolves White Raven for every seat in a ${mode.label}`, () => {
      const roomId = uniqueRoom(`white-raven-${mode.label.replace(/\s+/g, "-")}`);
      createRoom({ roomId, name: mode.label, ranked: mode.ranked });
      restoreRoom(roomId, whiteRavenState(roomId));

      submitAs(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1" }, mode.actors.p1);
      submitAs(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2" }, mode.actors.p2);
      if (mode.hosted) {
        submitAs(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }, mode.actors.p1);
        submitAs(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" }, mode.actors.p1);
        submitAs(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" }, mode.actors.p1);
      }

      const before = getRoomSnapshot(roomId).state;
      const p1Before = totalResources(before, "p1");
      const p2Before = totalResources(before, "p2");

      expect(submitAs(roomId, { type: "END_TURN", playerId: "p1" }, mode.actors.p1).result.errors).toHaveLength(0);
      const wrapped = submitAs(roomId, { type: "END_TURN", playerId: "p2" }, mode.actors.p2);
      expect(wrapped.result.errors).toHaveLength(0);

      const final = wrapped.snapshot.state;
      expect(final.room?.ranked).toBe(mode.ranked);
      expect(final.room?.hosted ?? false).toBe(mode.hosted);
      expect(final.round).toBe(2);
      expect(final.adventure?.astrologers?.activeCardId).toBe("astrologers.white_raven");
      expect(final.adventure?.eventResolution ?? null).toBeNull();
      expect(final.adventure?.pendingVisit ?? null).toBeNull();
      expect(totalResources(final, "p1")).toBeGreaterThan(p1Before);
      expect(totalResources(final, "p2")).toBeGreaterThan(p2Before);
      expect(final.eventLog.some((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.playerId === "p1")).toBe(true);
      expect(final.eventLog.some((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.playerId === "p2")).toBe(true);
    });

    it(`hands Dancing Imp's optional prompt across seats in a ${mode.label}`, () => {
      const roomId = uniqueRoom(`dancing-imp-${mode.label.replace(/\s+/g, "-")}`);
      createRoom({ roomId, name: mode.label, ranked: mode.ranked });
      restoreRoom(roomId, dancingImpState(roomId));

      submitAs(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1" }, mode.actors.p1);
      submitAs(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2" }, mode.actors.p2);
      if (mode.hosted) {
        submitAs(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }, mode.actors.p1);
        submitAs(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" }, mode.actors.p1);
        submitAs(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" }, mode.actors.p1);
      }

      expect(submitAs(roomId, { type: "END_TURN", playerId: "p1" }, mode.actors.p1).result.errors).toHaveLength(0);
      const opened = submitAs(roomId, { type: "END_TURN", playerId: "p2" }, mode.actors.p2);
      expect(opened.result.errors).toHaveLength(0);

      let canonical = getRoomSnapshot(roomId).state;
      expect(canonical.room?.ranked).toBe(mode.ranked);
      expect(canonical.room?.hosted ?? false).toBe(mode.hosted);
      expect(canonical.round).toBe(2);
      expect(canonical.adventure?.astrologers?.activeCardId).toBe("astrologers.dancing_imp");
      expect(canonical.adventure?.pendingVisit?.playerId).toBe("p1");

      const p1Empower = getLegalActions(canonical, "p1").find(
        (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Empower Attack \(hand\)/.test(legal.label)
      );
      expect(p1Empower).toBeTruthy();
      expect(submitAs(roomId, p1Empower!.action, mode.actors.p1).result.errors).toHaveLength(0);

      canonical = getRoomSnapshot(roomId).state;
      expect(canonical.adventure?.pendingVisit?.playerId).toBe("p2");
      const p1Frame = redactStateForSeat(canonical, "p1");
      expect(p1Frame.adventure?.pendingVisit?.steps).toEqual([]);
      expect(JSON.stringify(p1Frame)).not.toContain("Empower Defense");

      const p2Frame = redactStateForSeat(canonical, "p2");
      const p2Empower = getLegalActions(p2Frame, "p2").find(
        (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Empower Defense \(hand\)/.test(legal.label)
      );
      expect(p2Empower).toBeTruthy();
      const done = submitAs(roomId, p2Empower!.action, mode.actors.p2);
      expect(done.result.errors).toHaveLength(0);

      const final = getRoomSnapshot(roomId).state;
      expect(final.players.p1.hand).toContain("stat.attack.empowered");
      expect(final.players.p2.hand).toContain("stat.defense.empowered");
      expect(final.players.p1.removed).toContain("stat.attack");
      expect(final.players.p2.removed).toContain("stat.defense");
      expect(final.adventure?.pendingVisit ?? null).toBeNull();
      expect(final.adventure?.eventResolution ?? null).toBeNull();
    });
  }

  it("passes White Raven's die choice from player 1 to player 2 in a hosted room", () => {
    const roomId = uniqueRoom("white-raven-choice-chain");
    const state = whiteRavenState(roomId);
    state.players.p1.morale = 1;
    state.players.p2.morale = 1;
    createRoom({ roomId, name: "White Raven chain", ranked: false });
    restoreRoom(roomId, state);

    const p1 = { clientId: "c1" };
    const p2 = { clientId: "c2" };
    submitAs(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1" }, p1);
    submitAs(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2" }, p2);
    submitAs(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }, p1);
    submitAs(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" }, p1);
    submitAs(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" }, p1);

    expect(submitAs(roomId, { type: "END_TURN", playerId: "p1" }, p1).result.errors).toHaveLength(0);
    const opened = submitAs(roomId, { type: "END_TURN", playerId: "p2" }, p2);
    expect(opened.result.errors).toHaveLength(0);
    expect(opened.snapshot.state.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(opened.snapshot.state.adventure?.eventResolution?.round).toBe(2);
    expect(getLegalActions(opened.snapshot.state, "p2")).toEqual([]);

    const p1TakeDie = getLegalActions(opened.snapshot.state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === 0
    );
    expect(p1TakeDie).toBeTruthy();
    const handedToP2 = submitAs(roomId, p1TakeDie!.action, p1);
    expect(handedToP2.result.errors).toHaveLength(0);
    expect(handedToP2.snapshot.state.adventure?.pendingVisit?.playerId).toBe("p2");
    expect(getLegalActions(handedToP2.snapshot.state, "p1")).toEqual([]);

    const p2TakeDie = getLegalActions(handedToP2.snapshot.state, "p2").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === 0
    );
    expect(p2TakeDie).toBeTruthy();
    const done = submitAs(roomId, p2TakeDie!.action, p2);
    expect(done.result.errors).toHaveLength(0);
    expect(done.snapshot.state.adventure?.pendingVisit ?? null).toBeNull();
    expect(done.snapshot.state.adventure?.eventResolution ?? null).toBeNull();
  });
});

describe("room Event resolution", () => {
  it("keeps A Shady Auction secret, seat-owned, and resolvable for guest/account hosted seats", () => {
    const roomId = uniqueRoom("shady-auction-hosted");
    const p1Guest = { clientId: "c1" };
    const p2Account = { clientId: "c2", userId: "u_p2" };
    const p2AccountOtherTab = { clientId: "c2-other-tab", userId: "u_p2" };
    const outsider = { clientId: "c3", userId: "u_p3" };

    createRoom({ roomId, name: "Event Auction", ranked: true });
    submitAs(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1" }, p1Guest);
    submitAs(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2" }, p2Account);
    submitAs(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }, p1Guest);
    submitAs(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" }, p1Guest);
    submitAs(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" }, p1Guest);
    restoreRoom(roomId, shadyAuctionEventState(roomId), "c1");

    let canonical = getRoomSnapshot(roomId).state;
    expect(canonical.room?.ranked).toBe(true);
    expect(canonical.room?.hosted).toBe(true);
    expect(canonical.adventure?.events?.activeCardId).toBe("event.a_shady_auction");
    expect(canonical.adventure?.eventResolution?.round).toBe(3);
    expect(canonical.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(getLegalActions(canonical, "p2")).toEqual([]);

    const lot1 = getEventsState(canonical)!.auction!.lotCardId;
    const p1Bid = getLegalActions(canonical, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /^Bid 3 gold$/.test(legal.label)
    );
    expect(p1Bid).toBeTruthy();
    expect(submitAs(roomId, p1Bid!.action, p2Account).result.errors).toHaveLength(1);
    expect(submitAs(roomId, p1Bid!.action, outsider).result.errors).toHaveLength(1);
    expect(submitAs(roomId, p1Bid!.action, p1Guest).result.errors).toHaveLength(0);

    canonical = getRoomSnapshot(roomId).state;
    expect(getEventsState(canonical)!.auction!.bids).toEqual({ p1: 3 });
    expect(canonical.adventure?.pendingVisit?.playerId).toBe("p2");

    const p1Frame = redactStateForSeat(canonical, "p1");
    expect(p1Frame.adventure?.events?.auction?.bids).toEqual({ p1: 3 });
    expect(p1Frame.adventure?.pendingVisit?.steps).toEqual([]);

    const p2Frame = redactStateForSeat(canonical, "p2");
    expect(p2Frame.adventure?.events?.auction?.bids).toEqual({});
    const p2Bid = getLegalActions(p2Frame, "p2").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /^Bid 5 gold$/.test(legal.label)
    );
    expect(p2Bid).toBeTruthy();
    expect(submitAs(roomId, p2Bid!.action, p1Guest).result.errors).toHaveLength(1);

    const awarded = submitAs(roomId, p2Bid!.action, p2AccountOtherTab);
    expect(awarded.result.errors).toHaveLength(0);
    const afterLot = awarded.snapshot.state;
    expect(afterLot.players.p2.hand).toContain(lot1);
    expect(afterLot.players.p2.resources.gold).toBe(25);
    expect(afterLot.players.p1.resources.gold).toBe(30);
    expect(afterLot.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(getEventsState(afterLot)!.auction!.bids).toEqual({});
  });
});

describe("lobby directory (listRooms / createRoom)", () => {
  it("lists a created room with its name, host, and member counts", () => {
    const roomId = uniqueRoom("dir");
    createRoom({ roomId, name: "Binh's Game", createdByName: "Binh" });

    let entry = entryFor(roomId);
    expect(entry).not.toBeNull();
    expect(entry?.name).toBe("Binh's Game");
    expect(entry?.createdByName).toBe("Binh");
    expect(entry?.inProgress).toBe(false); // fresh setup lobby
    expect(entry?.memberCount).toBe(0);
    expect(entry?.hosted).toBe(false);

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Binh" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });

    entry = entryFor(roomId);
    expect(entry?.memberCount).toBe(1);
    expect(entry?.seatedCount).toBe(1);
    expect(entry?.hosted).toBe(true);
    expect(entry?.hostName).toBe("Binh");

    // canClose is per-viewer: the host may close a hosted room, others may not.
    expect(entryFor(roomId, "c1")?.canClose).toBe(true);
    expect(entryFor(roomId, "stranger")?.canClose).toBe(false);
    expect(entryFor(roomId)?.canClose).toBe(false); // no viewer → not closeable
  });

  it("seeds the chosen match type at creation and shows it in the directory", () => {
    // A Normal room created explicitly casual: seeded onto state.room and shown
    // as not-ranked in the directory.
    const casualId = uniqueRoom("casual");
    const casual = createRoom({ roomId: casualId, name: "Casual", ranked: false });
    expect(casual.state.room?.ranked).toBe(false);
    expect(entryFor(casualId)?.ranked).toBe(false);

    // A Ranked room, and a room created with no choice (legacy default → ranked).
    const rankedId = uniqueRoom("ranked");
    createRoom({ roomId: rankedId, name: "Ranked", ranked: true });
    expect(entryFor(rankedId)?.ranked).toBe(true);

    const defaultId = uniqueRoom("default");
    createRoom({ roomId: defaultId, name: "Default" });
    expect(entryFor(defaultId)?.ranked).toBe(true);
  });

  it("reflects a live SET_ROOM_NAME rename in the directory", () => {
    const roomId = uniqueRoom("rename");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    // Default label before naming.
    expect(entryFor(roomId)?.name).toBe(`Room ${roomId}`);

    submitRoomAction(roomId, { type: "SET_ROOM_NAME", clientId: "c1", name: "Renamed" });
    expect(entryFor(roomId)?.name).toBe("Renamed");
  });

  it("mints a unique id when none is given and never overwrites an existing room", () => {
    const a = createRoom({ name: "A" });
    const b = createRoom({ name: "B" });
    expect(a.roomId).not.toBe(b.roomId);
    expect(entryFor(a.roomId)?.name).toBe("A");
    expect(entryFor(b.roomId)?.name).toBe("B");

    // Re-creating a pinned, existing id returns the existing room (no clobber):
    // its members and original name are untouched, NOT replaced.
    submitRoomAction(a.roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Keep" });
    const again = createRoom({ roomId: a.roomId, name: "Should Not Replace" });
    expect(again.state.room?.members.some((m) => m.clientId === "c1")).toBe(true);
    expect(again.state.room?.name).toBe("A"); // unchanged: never renamed to "Should Not Replace"
  });
});

describe("closing a room (closeRoom)", () => {
  it("hosted-room close: host's word while connected, members once the host is gone, strangers never", () => {
    const roomId = uniqueRoom("close");
    createRoom({ roomId, name: "Closable" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    markRoomClientConnected(roomId, "c1"); // the host holds a live stream

    // While the host is connected: a member and a stranger cannot close it.
    expect(closeRoom(roomId, "c2").closed).toBe(false);
    expect(closeRoom(roomId, "stranger").closed).toBe(false);
    expect(entryFor(roomId)).not.toBeNull(); // still there

    // Host gone (per-tab id lost to a browser restart): a stranger still
    // cannot, but a MEMBER can — the room is never stranded undeletable.
    markRoomClientDisconnected(roomId, "c1");
    expect(closeRoom(roomId, "stranger").closed).toBe(false);
    expect(closeRoom(roomId, "c2").closed).toBe(true);
    expect(entryFor(roomId)).toBeNull(); // gone from the directory
  });

  it("the host can always close their hosted room (the CONTROL)", () => {
    const roomId = uniqueRoom("closehost");
    createRoom({ roomId, name: "Closable" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    markRoomClientConnected(roomId, "c1");
    try {
      expect(closeRoom(roomId, "c1").closed).toBe(true);
      expect(entryFor(roomId)).toBeNull();
    } finally {
      markRoomClientDisconnected(roomId, "c1");
    }
  });

  it("lets ANYONE close an open table (a fresh session no longer owns it)", () => {
    const roomId = uniqueRoom("closeopen");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "A" });

    // An outsider (e.g. the SAME person on a new browser session with a fresh
    // clientId) can close an open table — the fix for undeletable rooms. The
    // hosted test above is the control that a hosted room still refuses them.
    expect(closeRoom(roomId, "outsider").closed).toBe(true);
    expect(entryFor(roomId)).toBeNull();
  });

  it("lets a member close their own open table too", () => {
    const roomId = uniqueRoom("closeopen-self");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "A" });
    expect(closeRoom(roomId, "c1").closed).toBe(true);
    expect(entryFor(roomId)).toBeNull();
  });

  it("is idempotent when the room is already gone", () => {
    const roomId = uniqueRoom("closegone");
    expect(closeRoom(roomId).closed).toBe(true);
  });
});

describe("presence cleanup on disconnect (handleRoomDisconnect)", () => {
  it("keeps one computer from being counted as many after rejoining", () => {
    const roomId = uniqueRoom("ghosts");
    createRoom({ roomId, name: "Rejoin" });

    // Same computer joins, leaves (tab close → stream drop), then rejoins under a
    // NEW per-tab client id — the exact "keep joining back and forth" loop.
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "tab-1", name: "Solo" });
    expect(entryFor(roomId)?.memberCount).toBe(1);

    handleRoomDisconnect(roomId, "tab-1"); // the stream for tab-1 dropped
    expect(entryFor(roomId)?.memberCount).toBe(0);

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "tab-2", name: "Solo" });
    handleRoomDisconnect(roomId, "tab-2");
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "tab-3", name: "Solo" });

    // Without the reap this would read 3; the ghosts are gone, so it is 1.
    const entry = entryFor(roomId);
    expect(entry?.memberCount).toBe(1);
    expect(entry?.memberCount).not.toBe(3);

    // An emptied, abandoned room is closeable again by anyone browsing the lobby.
    handleRoomDisconnect(roomId, "tab-3");
    expect(entryFor(roomId)?.memberCount).toBe(0);
    expect(entryFor(roomId, "any-browser")?.canClose).toBe(true);
  });

  it("broadcasts the corrected snapshot to the other clients in the room", () => {
    const roomId = uniqueRoom("disc-broadcast");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "a", name: "A" });
    const before = submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "b", name: "B" }).snapshot;

    handleRoomDisconnect(roomId, "b");
    const after = getRoomSnapshot(roomId);
    expect(after.version).toBeGreaterThan(before.version); // a new frame was produced
    expect(after.state.room?.members.map((member) => member.clientId)).toEqual(["a"]);
  });

  it("never reaps a seated player on a hosted-game disconnect (no lost turns)", () => {
    const roomId = uniqueRoom("disc-seated");
    restoreRoom(roomId, createAdventureGameState({ seed: "disc-seat", difficulty: "normal", rollFirstPlayer: false }));
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "host", name: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "p2", name: "Two" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "host", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "host", targetClientId: "host", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "host", targetClientId: "p2", seat: "p2" });

    // p2's socket blips: their seat (and its action authority) must survive.
    handleRoomDisconnect(roomId, "p2");
    const snapshot = getRoomSnapshot(roomId);
    expect(snapshot.state.room?.members.find((member) => member.clientId === "p2")?.seat).toBe("p2");
    // The seat lock still binds p2's seat to client "p2" alone — nobody else can
    // act for it, and p2 cannot act for p1.
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p2" }, "host").result.errors.length).toBeGreaterThan(0);
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p1" }, "p2").result.errors.length).toBeGreaterThan(0);
    // ...and the seated owner still acts for their own seat.
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p1" }, "host").result.errors).toHaveLength(0);
  });
});

describe("lobby disk-scan cache", () => {
  /** Writes a room file straight to the persist dir, bypassing the store. */
  function writeDiskRoom(roomId: string, name: string) {
    if (!existsSync(persistDir)) {
      mkdirSync(persistDir, { recursive: true });
    }
    const state = createAdventureLobbyState({ seed: `cache-${roomId}` });
    state.room = { hosted: false, hostClientId: null, members: [], name };
    const record = {
      roomId,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      state
    };
    writeFileSync(join(persistDir, `${roomId}.json`), JSON.stringify(record));
  }

  it("serves rewritten room files fresh (the mtime/size cache never goes stale)", () => {
    const roomId = uniqueRoom("cachefresh");
    writeDiskRoom(roomId, "First Name");
    expect(entryFor(roomId)?.name).toBe("First Name");

    // Rewrite the file on disk (e.g. a newer copy landed after a restart):
    // the next listing must reflect the new content, not the cached parse.
    writeDiskRoom(roomId, "Second, Longer Name");
    expect(entryFor(roomId)?.name).toBe("Second, Longer Name");

    // And a deleted file drops out of the listing entirely.
    unlinkSync(join(persistDir, `${roomId}.json`));
    expect(entryFor(roomId)).toBeNull();
  });
});

describe("stale-room expiry", () => {
  /** Writes a record straight to the persist dir with a chosen updatedAt. */
  function seedDiskRoom(roomId: string, updatedAt: string, members: { clientId: string; name: string }[]) {
    if (!existsSync(persistDir)) {
      mkdirSync(persistDir, { recursive: true });
    }
    const state = createAdventureLobbyState({ seed: `stale-${roomId}` });
    state.room = {
      hosted: false,
      hostClientId: null,
      members: members.map((m) => ({ ...m, seat: "observer" as const, isHost: false }))
    };
    const record = { roomId, version: 1, createdAt: updatedAt, updatedAt, state };
    writeFileSync(join(persistDir, `${roomId}.json`), JSON.stringify(record));
  }

  it("prunes an empty room idle past the TTL but keeps a recent one", () => {
    const oldEmpty = uniqueRoom("oldempty");
    const freshEmpty = uniqueRoom("freshempty");
    const oldStamp = new Date(Date.now() - STALE_ROOM_TTL_MS - 60_000).toISOString();
    const freshStamp = new Date().toISOString();
    seedDiskRoom(oldEmpty, oldStamp, []);
    seedDiskRoom(freshEmpty, freshStamp, []);

    const ids = listRooms().map((entry) => entry.roomId);
    expect(ids).not.toContain(oldEmpty); // pruned
    expect(ids).toContain(freshEmpty); // kept (recent)
    // The pruned room's file is deleted too.
    expect(existsSync(join(persistDir, `${oldEmpty}.json`))).toBe(false);
  });

  it("prunes an idle room even with members (24h from last activity, not emptiness)", () => {
    // BINH rule: the clock is inactivity. An abandoned game whose seated players
    // never return ages out one day after its last action, members or not.
    const oldOccupied = uniqueRoom("oldoccupied");
    const oldStamp = new Date(Date.now() - STALE_ROOM_TTL_MS - 60_000).toISOString();
    seedDiskRoom(oldOccupied, oldStamp, [{ clientId: "c1", name: "Stayed" }]);

    expect(listRooms().map((entry) => entry.roomId)).not.toContain(oldOccupied);
    expect(existsSync(join(persistDir, `${oldOccupied}.json`))).toBe(false);
  });

  it("keeps a recently-active room with members (activity resets the clock — the control)", () => {
    const freshOccupied = uniqueRoom("freshoccupied");
    const freshStamp = new Date(Date.now() - 60_000).toISOString();
    seedDiskRoom(freshOccupied, freshStamp, [{ clientId: "c1", name: "Playing" }]);

    expect(listRooms().map((entry) => entry.roomId)).toContain(freshOccupied);
  });
});

describe("AFK vote-kick through the store (transport wiring)", () => {
  it("stamps the server wall clock and drives a passed kick to completion in one submit", () => {
    // A 2-player game whose p1 clock reads 10+ minutes ago: the opponent's
    // START_AFK_VOTE alone passes the vote, and submitRoomAction must then run
    // the drop driver — p1 eliminated, p2 the last faction standing — without
    // any further client input. Fails if the transport forgets the `now`
    // stamp OR the driveAfkDrop call.
    const roomId = uniqueRoom("afkkick");
    getRoomSnapshot(roomId);
    const game = createAdventureGameState({ seed: "store-afk", difficulty: "normal", rollFirstPlayer: false });
    for (const player of Object.values(game.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    // The AFK vote / turn timer run only on a CLOSED (hosted) table.
    game.room = { hosted: true, hostClientId: "c1", members: [] };
    const afk = getAfkState(game);
    afk.lastActionAt.p1 = Date.now() - AFK_IDLE_MS - 60_000;
    afk.lastActionAt.p2 = Date.now();
    restoreRoom(roomId, game);

    const { result, snapshot } = submitRoomAction(roomId, {
      type: "START_AFK_VOTE",
      playerId: "p2",
      targetPlayerId: "p1"
    });
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    expect(snapshot.state.players.p1.eliminated).toBe(true);
    expect(snapshot.state.players.p1.kickedByVote).toBe(true);
    expect(snapshot.state.adventure?.winnerPlayerId).toBe("p2");
    expect(snapshot.state.afk?.droppingPlayerId ?? null).toBeNull();
  });

  it("CONTROL: a freshly active seat cannot be voted on (the server clock is authoritative)", () => {
    const roomId = uniqueRoom("afkfresh");
    getRoomSnapshot(roomId);
    const game = createAdventureGameState({ seed: "store-afk-fresh", difficulty: "normal", rollFirstPlayer: false });
    // The AFK vote / turn timer run only on a CLOSED (hosted) table.
    game.room = { hosted: true, hostClientId: "c1", members: [] };
    const afk = getAfkState(game);
    afk.lastActionAt.p1 = Date.now();
    afk.lastActionAt.p2 = Date.now();
    restoreRoom(roomId, game);

    const { result } = submitRoomAction(roomId, {
      type: "START_AFK_VOTE",
      playerId: "p2",
      targetPlayerId: "p1"
    });
    expect(result.errors[0]?.message).toContain("has not been away");
  });
});

describe("per-account room cap (auto-delete surplus)", () => {
  it("auto-deletes an account's rooms beyond the cap, keeping the newest", () => {
    const userId = `u-${Math.random().toString(36).slice(2, 8)}`;
    const roomIds: string[] = [];
    for (let index = 0; index < MAX_ROOMS_PER_ACCOUNT + 1; index += 1) {
      const roomId = uniqueRoom(`cap${index}`);
      createRoom({ roomId, name: `Room ${index}`, mode: "adventure" });
      // Join AS a verified account (server-stamped userId), which makes this
      // account the room's owner — the key the cap counts by.
      const joined = submitRoomAction(
        roomId,
        { type: "JOIN_ROOM", clientId: `client-${index}`, name: "Owner" },
        `client-${index}`,
        userId
      );
      // Sanity: the owner really is bound to the verified account.
      expect(joined.snapshot.state.room?.members.some((member) => member.userId === userId)).toBe(true);
      roomIds.push(roomId);
    }

    // Enforcement runs on every directory list (and on create). After it, the
    // account holds exactly the cap — the surplus room was really deleted.
    enforceRoomCaps();
    const survivors = roomIds.filter((roomId) => listRooms().some((entry) => entry.roomId === roomId));
    expect(survivors).toHaveLength(MAX_ROOMS_PER_ACCOUNT);

    // The evicted room is gone from the store: fetching it now mints a FRESH,
    // memberless lobby (version 1), proving the owner's game was really deleted.
    const evicted = roomIds.find((roomId) => !survivors.includes(roomId))!;
    const evictedSnapshot = getRoomSnapshot(evicted);
    expect(evictedSnapshot.version).toBe(1);
    expect(evictedSnapshot.state.room?.members ?? []).toEqual([]);
  });

  it("CONTROL: GUEST rooms (no verified account) are never capped", () => {
    const roomIds: string[] = [];
    for (let index = 0; index < MAX_ROOMS_PER_ACCOUNT + 2; index += 1) {
      const roomId = uniqueRoom(`guestcap${index}`);
      createRoom({ roomId, name: `Guest Room ${index}`, mode: "adventure" });
      // Join with NO userId → a guest member → an ownerless room.
      submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: `guest-${index}`, name: "Guest" });
      roomIds.push(roomId);
    }
    enforceRoomCaps();
    const survivors = roomIds.filter((roomId) => listRooms().some((entry) => entry.roomId === roomId));
    // All survive — a per-tab guest is not an account, so the cap never binds.
    expect(survivors).toHaveLength(MAX_ROOMS_PER_ACCOUNT + 2);
  });
});

describe("single-player rooms cannot flood the public lobby", () => {
  const spId = (name: string) => `sp-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  it("an sp- room id auto-creates PRIVATE single-player, even with no sessionMode passed", () => {
    // Gap B: a bare snapshot/action request for an sp- id auto-creates the room
    // via makeRoom with no options. Without the id-prefix default it would be
    // born as a PUBLIC listed lobby; it must instead be private single-player.
    const roomId = spId("autocreate");
    const snapshot = getRoomSnapshot(roomId); // triggers getRoomRecord → makeRoom(roomId)
    expect(snapshot.state.sessionMode).toBe("single-player");
    expect(snapshot.state.room?.visibility).toBe("private");
    // CONTROL: a normal room id auto-creates a public multiplayer lobby (no mode).
    const normal = getRoomSnapshot(uniqueRoom("normalauto"));
    expect(normal.state.sessionMode).not.toBe("single-player");
  });

  it("many single-player rooms never appear in the directory and are never capped", () => {
    const ids: string[] = [];
    for (let index = 0; index < MAX_ROOMS_PER_ACCOUNT + 5; index += 1) {
      const roomId = spId(`flood${index}`);
      createRoom({ roomId, sessionMode: "single-player", computerOpponents: 2 });
      ids.push(roomId);
    }
    enforceRoomCaps();
    // None list (private), and none was force-closed by the cap (all still exist).
    expect(listRooms().filter((entry) => ids.includes(entry.roomId))).toHaveLength(0);
    for (const roomId of ids) {
      expect(getRoomSnapshot(roomId).state.sessionMode).toBe("single-player");
    }
  });

  it("an ABANDONED single-player room is garbage-collected on the idle TTL (Gap A)", () => {
    if (!existsSync(persistDir)) {
      mkdirSync(persistDir, { recursive: true });
    }
    // A stale single-player room persisted long ago — the cap never touches it,
    // so without the SP idle-prune it would linger forever as a leaked record.
    const staleId = spId("stale");
    const staleState = createAdventureLobbyState({ seed: `sp-stale-${staleId}` });
    staleState.sessionMode = "single-player";
    staleState.room = { hosted: true, hostClientId: null, members: [], visibility: "private", ranked: false };
    const staleAgeMs = Date.now() - (STALE_ROOM_TTL_MS + 60_000);
    writeFileSync(
      join(persistDir, `${staleId}.json`),
      JSON.stringify({
        roomId: staleId,
        version: 3,
        createdAt: new Date(staleAgeMs).toISOString(),
        updatedAt: new Date(staleAgeMs).toISOString(),
        state: staleState
      })
    );
    // A CONTROL fresh single-player room persisted just now must survive.
    const freshId = spId("fresh");
    createRoom({ roomId: freshId, sessionMode: "single-player", computerOpponents: 1 });

    listRooms(); // the sweep runs here

    // The stale SP room's record is gone from disk; the fresh one remains.
    expect(existsSync(join(persistDir, `${staleId}.json`))).toBe(false);
    expect(existsSync(join(persistDir, `${freshId}.json`))).toBe(true);
    unlinkSync(join(persistDir, `${freshId}.json`));
  });
});
