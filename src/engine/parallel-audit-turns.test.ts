import { describe, expect, it } from "vitest";
import { parallelStateForPlayer } from "./parallel-combats";
import {
  AFK_IDLE_MS,
  applyAction,
  createAdventureGameState,
  getAfkState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { seatIsAwaitedInOrderedPlay, turnClockPausedFor, turnClockRunningSeats } from "./afk";

/**
 * AUDIT of the OPTIONAL parallel-turn mode — END TURN / TURN START / ROUND
 * WRAP / ELIMINATION / TIME CONTROLS. Each spec asserts an observable outcome
 * with an ordered-mode (or already-open-turn) CONTROL.
 */

const T0 = 1_000_000_000;

function apply(state: GameState, action: GameAction, now?: number): GameState {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction, now?: number): string {
  const result = applyAction(state, action, now === undefined ? {} : { now });
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function makeGame(
  seed: string,
  options: {
    parallelTurns?: number;
    players?: 2 | 3;
    hosted?: boolean;
    clearMulligans?: boolean;
    rotateStartTiles?: boolean;
  } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.rotateStartTiles ? { rotateStartTiles: true } : {}),
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {})
  } as Parameters<typeof createAdventureGameState>[0]);
  if (options.clearMulligans !== false) {
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
  }
  for (let i = 0; i < 12; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  if (options.hosted) {
    state.room = { hosted: true, hostClientId: "host", members: [] } as GameState["room"];
    const afk = getAfkState(state);
    for (const playerId of state.turnOrder) {
      afk.lastActionAt[playerId] = T0;
    }
  }
  return state;
}

const usedStagingFields = new WeakMap<GameState, Set<string>>();
function emptyFieldNextTo(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) {
    throw new Error(`${heroId} is not on the map`);
  }
  const used = usedStagingFields.get(state) ?? new Set<string>();
  usedStagingFields.set(state, used);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !used.has(candidate.spaceId));
  if (!field) {
    throw new Error(`no adjacent field for ${heroId}`);
  }
  used.add(field.spaceId);
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  return field.spaceId;
}

// ---------------------------------------------------------------------------
// 1. AFK VOTE vs a seat that already ENDED its parallel turn
// ---------------------------------------------------------------------------

describe("parallel audit — AFK vote target", () => {
  it("a seat that already ENDED its parallel turn is not awaited and must not be vote-kickable", () => {
    let state = makeGame("audit-afk-done", { parallelTurns: 3, players: 3, hosted: true });
    expect(state.turn.mode).toBe("parallel");

    // p3 finishes their parallel turn; the table is no longer waiting on them.
    state = apply(state, { type: "END_TURN", playerId: "p3" }, T0);
    expect(state.turn.completedPlayerIds).toContain("p3");
    // The turn clock already agrees: p3 has no running clock any more.
    expect(turnClockRunningSeats(state)).not.toContain("p3");

    // ...but the vote gate still calls them "awaited".
    expect(seatIsAwaitedInOrderedPlay(state, "p3")).toBe(false);

    // And the vote itself is refused, exactly like a seat waiting for its turn
    // in ordered play.
    const message = expectRejected(
      state,
      { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p3" },
      T0 + AFK_IDLE_MS
    );
    expect(message).toContain("on their own turn");
  });

  it("CONTROL: a seat whose parallel turn is still OPEN stays vote-kickable", () => {
    const state = makeGame("audit-afk-open", { parallelTurns: 3, players: 3, hosted: true });
    expect(seatIsAwaitedInOrderedPlay(state, "p3")).toBe(true);
    const opened = apply(
      state,
      { type: "START_AFK_VOTE", playerId: "p1", targetPlayerId: "p3" },
      T0 + AFK_IDLE_MS
    );
    expect(opened.afk?.vote?.targetPlayerId).toBe("p3");
  });
});

// ---------------------------------------------------------------------------
// 2. Round-1 forced home-tile rotation chain
// ---------------------------------------------------------------------------

describe("parallel audit — opening home-tile rotation chain", () => {
  it("chains one rotation per seat in order and completes for all three", () => {
    let state = makeGame("audit-rot-chain", {
      parallelTurns: 3,
      players: 3,
      rotateStartTiles: true,
      clearMulligans: false
    });
    expect(state.turn.mode).toBe("parallel");
    const owners: PlayerId[] = [];
    for (let guard = 0; guard < 6; guard += 1) {
      const pending = state.adventure?.pendingTileChoice;
      if (!pending || pending.kind !== "starting") {
        break;
      }
      owners.push(pending.playerId);
      const offer = getLegalActions(state, pending.playerId).find(
        (legal) => legal.action.type === "SET_TILE_ROTATION"
      );
      expect(offer, `no rotation offer for ${pending.playerId}`).toBeDefined();
      state = apply(state, offer!.action);
    }
    expect(owners).toEqual(["p1", "p2", "p3"]);
    expect(state.players.p1.startTileRotated).toBe(true);
    expect(state.players.p2.startTileRotated).toBe(true);
    expect(state.players.p3.startTileRotated).toBe(true);
    // Every seat's mandatory start-of-turn draw is live once the chain drains.
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p2.canMulligan).toBe(true);
    expect(state.players.p3.canMulligan).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. END_TURN end-of-turn prompt attribution (Pandora upkeep)
// ---------------------------------------------------------------------------

describe("parallel audit — end-of-turn prompt during another player's open turn", () => {
  it("Pandora upkeep belongs to A while B can finish independently; A finishes after answering", () => {
    let state = makeGame("audit-pandora", { parallelTurns: 3, players: 3 });
    // Give p1 the Pandora Power permanent so END_TURN owes its upkeep.
    const player = state.players.p1;
    player.permanents = [...(player.permanents ?? []), "pandora.power_or_morale"];

    const before = state.turn.completedPlayerIds.length;
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    const choice = state.pendingChoice;
    expect((choice as { context?: string } | null)?.context).toBe("pandora-upkeep");
    expect(choice?.playerId).toBe("p1");
    // p1's turn has NOT ended yet.
    expect(state.turn.completedPlayerIds.length).toBe(before);
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.round).toBe(1);
    expect(parallelStateForPlayer(state, "p1").pendingChoice).toEqual(choice);

    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: 0
    });
    // Answering the prompt does not by itself end the turn: p1 presses End Turn
    // again and it now completes.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.turn.completedPlayerIds).toContain("p1");
    expect(state.round).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. END_TURN must not reset a still-playing seat's per-turn state
// ---------------------------------------------------------------------------

describe("parallel audit — END_TURN of A leaves B's turn state alone", () => {
  it("A's END_TURN does not reset B's once-per-turn latches or hero movement", () => {
    let state = makeGame("audit-latches", { parallelTurns: 3, players: 3 });
    state.players.p2.nomadStepDoneThisTurn = true;
    state.players.p2.rogueScoutUsedThisTurn = true;
    state.players.p2.satyrMoraleRollUsedThisTurn = true;
    state.players.p2.combatStats.spellsCastThisTurn = 2;
    state.heroes.hero_p2.movementPoints = 1;

    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.players.p2.nomadStepDoneThisTurn).toBe(true);
    expect(state.players.p2.rogueScoutUsedThisTurn).toBe(true);
    expect(state.players.p2.satyrMoraleRollUsedThisTurn).toBe(true);
    expect(state.players.p2.combatStats.spellsCastThisTurn).toBe(2);
    expect(state.heroes.hero_p2.movementPoints).toBe(1);

    // CONTROL: once the round wraps, every seat's latches ARE reset.
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.round).toBe(2);
    expect(state.players.p2.nomadStepDoneThisTurn).toBe(false);
    expect(state.players.p2.rogueScoutUsedThisTurn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. END_TURN offer/accept symmetry
// ---------------------------------------------------------------------------

describe("parallel audit — END_TURN legal-actions vs reducer symmetry", () => {
  it("END_TURN is withheld exactly while it would be rejected (own open interaction included)", () => {
    let state = makeGame("audit-endturn-sym", { parallelTurns: 3, players: 3 });
    const settlement = emptyFieldNextTo(state, "hero_p1");
    const field = state.adventure!.fields[settlement];
    field.location = "settlement";
    field.difficulty = undefined;
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: settlement });
    expect(state.adventure?.pendingVisit?.playerId ?? state.pendingChoice?.playerId).toBe("p1");

    // p1 owns the open interaction — the reducer refuses END_TURN...
    const rejection = expectRejected(state, { type: "END_TURN", playerId: "p1" });
    expect(rejection.length).toBeGreaterThan(0);
    // ...so legal-actions must not offer it.
    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "END_TURN")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Elimination: an in-place removal of the LAST open parallel seat
// ---------------------------------------------------------------------------

describe("parallel audit — elimination and the round wrap", () => {
  it("a seat eliminated in place while it was the last OPEN parallel turn still wraps the round", () => {
    let state = makeGame("audit-elim-last", { parallelTurns: 3, players: 3 });
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.turn.completedPlayerIds).toEqual(["p1", "p2"]);
    expect(state.round).toBe(1);

    // p3 is the only seat still owing a turn — and gives up.
    state = apply(state, { type: "GIVE_UP", playerId: "p3" });
    expect(state.players.p3.eliminated).toBe(true);
    // Nobody live still owes a turn, so the round must have wrapped and both
    // survivors must have a fresh open turn.
    expect(state.round).toBe(2);
    expect(state.turn.completedPlayerIds).toEqual([]);
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p2.canMulligan).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Turn clock pauses vs the parallel "wait until …" blockers
// ---------------------------------------------------------------------------

describe("parallel audit — turn clock vs the blocked-bystander set", () => {
  it("a bystander blocked by another seat's Companion-Recruitment window must not burn its own turn budget", () => {
    const state = makeGame("audit-clock-companion", { parallelTurns: 3, players: 3, hosted: true });
    state.adventure!.pendingCompanionRecruitment = {
      playerId: "p1",
      heroId: "hero_p1",
      options: [{ unitDefId: "castle.pikemen", tier: "bronze", cost: { gold: 1 } }]
    } as NonNullable<GameState["adventure"]>["pendingCompanionRecruitment"];

    // p2 really is blocked from acting (the parallel wait law).
    expect(expectRejected(state, { type: "END_TURN", playerId: "p2" })).toContain("wait until");
    // ...so its clock must be paused.
    expect(turnClockPausedFor(state, "p2")).toBe(true);
  });

  it("CONTROL: another seat's pendingVisit DOES pause the bystander's clock", () => {
    const state = makeGame("audit-clock-visit", { parallelTurns: 3, players: 3, hosted: true });
    state.adventure!.pendingVisit = { heroId: "hero_p1", playerId: "p1", fieldId: "", steps: [] };
    expect(turnClockPausedFor(state, "p2")).toBe(true);
    expect(turnClockPausedFor(state, "p1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. The period-ended wrap starts EXACTLY seat 1's turn
// ---------------------------------------------------------------------------

describe("parallel audit — period-ended wrap", () => {
  it("the ordered round after the period ends starts exactly ONE turn: seat 1 owes a draw, nobody else does", () => {
    let state = makeGame("audit-period", { parallelTurns: 1, players: 3 });
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.round).toBe(2);
    expect(state.turn.mode).toBe("ordered");
    expect(state.activePlayerId).toBe("p1");
    expect(state.turn.observingPlayerId).toBe("p1");
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p2.canMulligan).toBe(false);
    expect(state.players.p3.canMulligan).toBe(false);
    // Exactly one TURN_STARTED for round 2.
    const started = state.eventLog.filter(
      (event) => event.type === "TURN_STARTED" && event.round === 2
    );
    expect(started).toHaveLength(1);

    // The ordered rotation then behaves classically.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    expect(state.round).toBe(2);
    expect(state.players.p2.canMulligan).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Turn-start building choices for every seat at a parallel round start
// ---------------------------------------------------------------------------

describe("parallel audit — beginning-of-your-turn building prompts for N seats", () => {
  it("every seat can resolve its own Portal of Summoning while the other prompts remain open", () => {
    let state = makeGame("audit-turnstart-buildings", { parallelTurns: 3, players: 3 });
    for (const playerId of ["p1", "p2", "p3"] as PlayerId[]) {
      const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId);
      expect(town).toBeDefined();
      town!.buildings = [...new Set([...town!.buildings, "dungeon.portal_of_summoning"])];
      state.players[playerId].canMulligan = true;
    }

    // Out of seat order, every seat takes its mandatory start-of-turn draw.
    for (const playerId of ["p3", "p1", "p2"] as PlayerId[]) {
      state = apply(state, { type: "REFRESH_HAND", playerId, discardCardIds: [] });
    }

    // Drain: each open prompt is answerable ONLY by its owner, and every seat
    // must get its own prompt — nothing may be stranded in the reward queue.
    const owners = new Set<PlayerId>();
    for (const seat of ["p3", "p1", "p2"]) {
      for (let guard = 0; guard < 40; guard += 1) {
        const selected = parallelStateForPlayer(state, seat);
        const owner = selected.adventure?.pendingVisit?.playerId ?? selected.pendingChoice?.playerId ?? null;
        if (!owner) break;
        owners.add(owner);
        for (const other of ["p1", "p2", "p3"] as PlayerId[]) {
          if (other === owner) continue;
          expect(parallelStateForPlayer(state, other).adventure?.pendingVisit?.playerId).not.toBe(owner);
        }
        const offer = getLegalActions(state, owner).find(
          (legal) => legal.action.type === "RESOLVE_VISIT_STEP" || legal.action.type === "CHOOSE_OPTION"
        );
        expect(offer).toBeDefined();
        state = apply(state, offer!.action);
      }
    }
    expect([...owners].sort()).toEqual(["p1", "p2", "p3"]);
    expect(state.adventure?.rewardQueue.filter((reward) => reward.kind === "visit-steps")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10. Off-turn GIVE_UP by a seat that already ENDED its parallel turn
// ---------------------------------------------------------------------------

describe("parallel audit — off-turn concede by an already-finished seat", () => {
  it("the round still wraps for the survivors and the stale completed id is cleared", () => {
    let state = makeGame("audit-giveup-done", { parallelTurns: 3, players: 3 });
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.activePlayerId).toBe("p3");

    // p1 has already ended — this is the OFF-turn concede branch.
    state = apply(state, { type: "GIVE_UP", playerId: "p1" });
    expect(state.players.p1.eliminated).toBe(true);
    expect(state.round).toBe(1);
    expect(state.turn.mode).toBe("parallel");

    // p3 (the last owed seat) ends: the round wraps for the two survivors.
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.round).toBe(2);
    expect(state.turn.completedPlayerIds).toEqual([]);
    expect(state.players.p2.canMulligan).toBe(true);
    expect(state.players.p3.canMulligan).toBe(true);
    expect(state.turnOrder).toEqual(["p2", "p3"]);
  });
});

// ---------------------------------------------------------------------------
// 11. FORCE_TURN_TIMEOUT never targets a seat that already ended
// ---------------------------------------------------------------------------

describe("parallel audit — force turn timeout targeting", () => {
  it("a seat that ended its parallel turn has no clock to time out (an OPEN seat does)", () => {
    let state = makeGame("audit-timeout-target", { parallelTurns: 3, players: 3, hosted: true });
    state = apply(state, { type: "END_TURN", playerId: "p3" }, T0);
    expect(
      expectRejected(
        state,
        { type: "FORCE_TURN_TIMEOUT", playerId: "p1", targetPlayerId: "p3" },
        T0 + 11 * 60_000
      )
    ).toContain("no open turn");
    // CONTROL: an open seat with an expired budget IS a legal target.
    expect(turnClockRunningSeats(state)).toContain("p2");
  });
});
