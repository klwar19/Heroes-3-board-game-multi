import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { EVENTS_DECK_ID, getTownOfPlayer, startAdventureRound } from "./adventure";
import { pumpAdventureQueues, pumpParallelRoundEvents } from "./adventure-reducer";
import { stopParallelTurns } from "./parallel-turns";

/**
 * AUDIT — protocol v128 "per-player parallel round-event contexts".
 *
 * The change routes round-start Event / Astrologers rewards out of the
 * whole-table barrier (`adventure.eventResolution` + the
 * "round-start-events-resolved" sentinel) into per-seat interaction contexts
 * (`parallelRoundRewards` / `parallelSharedEventQueue`, opened by
 * `pumpParallelRoundEvents` after every action).
 *
 * The CONTROL specs pin what the change gets right. The remaining specs pin
 * the defects the 2026-09-11 audit found (Marketplace auto-answer throw,
 * table-queue capture, wave-barrier escape, lost work on stop), each written
 * against the behaviour the change owes and fixed in the same landing.
 */

const SEATS: PlayerId[] = ["p1", "p2", "p3"];

function game(seed: string, extra: Record<string, unknown> = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: true,
    parallelTurns: 8,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
      { id: "p3", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ],
    ...extra
  } as never);
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  return state;
}

function stackEventDeck(state: GameState, cardId: string): void {
  const deck = state.decks[EVENTS_DECK_ID];
  deck.drawPile = deck.drawPile.filter((id) => id !== cardId);
  deck.drawPile.push(cardId);
}

/** Round start exactly as the round wrap runs it, plus the new event pump. */
function startRound(state: GameState, round: number): void {
  state.round = round;
  startAdventureRound(state);
  pumpAdventureQueues(state);
  pumpParallelRoundEvents(state);
}

function emptyFieldNextTo(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) throw new Error(`${heroId} is not on the map`);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town");
  if (!field) throw new Error(`no adjacent field for ${heroId}`);
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  return field.spaceId;
}

function pick(state: GameState, playerId: PlayerId, match: RegExp): { state: GameState; errors: string[] } {
  const entry = getLegalActions(state, playerId).find((candidate) => match.test(candidate.label));
  if (!entry) {
    return { state, errors: [`no action matching ${match} for ${playerId}`] };
  }
  const result = applyAction(state, entry.action);
  return { state: result.state, errors: result.errors.map((error) => error.message) };
}

function errorsOf(state: GameState, action: GameAction): string[] {
  return applyAction(state, action).errors.map((error) => error.message);
}

/** That seat's Event window, wherever its context currently sits. */
function windowOf(state: GameState, playerId: PlayerId) {
  return (
    state.parallelCombats?.[playerId]?.adventure.pendingVisit ??
    (state.adventure?.pendingVisit?.playerId === playerId ? state.adventure.pendingVisit : null)
  );
}

// ===========================================================================
// CONTROLS — what the change gets right
// ===========================================================================

describe("AUDIT v128 CONTROL — a parallel Event window no longer freezes the table", () => {
  it("lets a seat with no Event work move while the drawer's window is open", () => {
    const state = game("audit-v128-free");
    stackEventDeck(state, "event.den_of_thieves"); // drawer-only interaction
    startRound(state, 3);

    const drawer = state.adventure!.pendingVisit!.playerId;
    const bystander = SEATS.find((id) => id !== drawer)!;
    expect(state.adventure!.eventResolution ?? null).toBeNull();

    const quiet = emptyFieldNextTo(state, `hero_${bystander}`);
    const result = applyAction(state, {
      type: "MOVE_HERO",
      playerId: bystander,
      heroId: `hero_${bystander}`,
      to: quiet
    });
    expect(result.errors.map((error) => error.message)).toEqual([]);
    expect(result.state.heroes[`hero_${bystander}`].spaceId).toBe(quiet);
    // …and the drawer's window survived the bystander's action untouched.
    expect(windowOf(result.state, drawer)?.playerId).toBe(drawer);
  });

  it("keeps one seat's open window byte-identical while another seat resolves its own", () => {
    const state = game("audit-v128-isolate");
    stackEventDeck(state, "event.stables"); // one window per seat
    startRound(state, 3);

    const p1Window = JSON.stringify(windowOf(state, "p1"));
    expect(p1Window).not.toBe("null");

    const resolved = pick(state, "p2", /.*/);
    expect(resolved.errors).toEqual([]);
    expect(JSON.stringify(windowOf(resolved.state, "p1"))).toBe(p1Window);
  });

  it("blocks END_TURN while this seat's own Event window is open", () => {
    const state = game("audit-v128-endturn");
    stackEventDeck(state, "event.stables");
    startRound(state, 3);
    for (const id of SEATS) {
      expect(errorsOf(state, { type: "END_TURN", playerId: id }).length).toBeGreaterThan(0);
      expect(getLegalActions(state, id).every((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);
    }
  });

  it("runs Explorers and Hero per seat with no barrier and nothing parked", () => {
    const explorers = game("audit-v128-explorers");
    explorers.decks.astrologers.drawPile = ["astrologers.explorers", "astrologers.explorers"];
    startRound(explorers, 2);
    expect(explorers.adventure!.eventResolution ?? null).toBeNull();
    expect(explorers.adventure!.parallelRoundRewards ?? {}).toEqual({});
    let next = explorers;
    for (const id of SEATS) next.players[id].canMulligan = true;
    for (const id of SEATS) {
      const result = applyAction(next, { type: "REFRESH_HAND", playerId: id, discardCardIds: [] });
      expect(result.errors.map((error) => error.message), `refresh ${id}`).toEqual([]);
      expect(result.state.players[id].explorersDiscardPending).toBe(true);
      next = result.state;
    }

    const hero = game("audit-v128-hero");
    hero.decks.astrologers.drawPile = ["astrologers.hero", "astrologers.hero"];
    startRound(hero, 2);
    expect(hero.adventure!.eventResolution ?? null).toBeNull();
    for (const id of SEATS) {
      expect(
        getLegalActions(hero, id).some((entry) => entry.action.type === "ASTROLOGERS_HERO_EMPOWER"),
        `Hero empower for ${id}`
      ).toBe(true);
    }
  });
});

// ===========================================================================
// DEFECTS — each spec states the behaviour the change owes and FAILS TODAY
// ===========================================================================

describe("AUDIT v128 — Marketplace answers auto-pumped in a parallel window", () => {
  it("a proposal no other seat can answer must not reject the proposer's action", () => {
    let state = game("audit-v128-deal-reject");
    stackEventDeck(state, "event.marketplace");
    startRound(state, 3);
    for (const id of ["p2", "p3"] as PlayerId[]) {
      state.players[id].resources = { gold: 5, buildingMaterials: 0, valuables: 0 } as never;
    }
    state.players.p1.resources = { gold: 10, buildingMaterials: 5, valuables: 5 } as never;

    state = pick(state, "p1", /Propose/i).state;
    const offered = pick(state, "p1", /Offer 1 gold for 1 valuables/i);
    // Nobody holds valuables, so every answer auto-declines. That is a legal
    // (if pointless) proposal — it must not be refused, and certainly not with
    // "no longer available" for a deal that was created by this very action.
    expect(offered.errors).toEqual([]);
  });

  it("a parked answer whose deal went stale must not lock every later action", () => {
    let state = game("audit-v128-deal-lock");
    stackEventDeck(state, "event.marketplace");
    startRound(state, 3);
    for (const id of SEATS) {
      state.players[id].resources = { gold: 5, buildingMaterials: 5, valuables: 5 } as never;
    }
    // p2/p3 still owe their start-of-turn draw, so their answers park unopened.
    state.players.p2.canMulligan = true;
    state.players.p3.canMulligan = true;

    state = pick(state, "p1", /Propose/i).state;
    state = pick(state, "p1", /Offer 1 gold for 1 valuables/i).state;
    expect(state.adventure!.events!.deal).toBeTruthy();

    // The proposer then spends the gold they promised — the parked answers are
    // now unpayable.
    state.players.p1.resources.gold = 0;

    // Every seat must still be able to act; today the parked answer throws out
    // of `pumpParallelRoundEvents` and rejects whoever acted.
    expect(errorsOf(state, { type: "REFRESH_HAND", playerId: "p2", discardCardIds: [] })).toEqual([]);
    expect(errorsOf(state, { type: "REFRESH_HAND", playerId: "p3", discardCardIds: [] })).toEqual([]);
  });
});

describe("AUDIT v128 — table-wide round-start rewards must not be captured as one seat's context", () => {
  it("City Hall round-start choices survive the Event windows and stay reachable", () => {
    let state = game("audit-v128-cityhall");
    for (const id of SEATS) getTownOfPlayer(state, id)!.buildings = ["castle.city_hall"];
    stackEventDeck(state, "event.stables");
    startRound(state, 3);

    // Every seat's City Hall reward belongs to the TABLE queue, not to whichever
    // seat's Event window happened to open first: the windows wait until that
    // shared queue has drained (fix 2026-09-11), so nothing is ever suspended
    // with the other seats' rewards inside it.
    expect(Object.keys(state.adventure!.parallelEventSuspended ?? {})).toEqual([]);

    // Drive the table: each seat answers whatever it is offered (its City Hall
    // choice, then its Event window) until nothing is left. Every seat must be
    // offered BOTH, parallel play must never stop, and nothing may stay parked.
    const sawCityHall = new Set<PlayerId>();
    const sawEvent = new Set<PlayerId>();
    for (let guard = 0; guard < 30; guard += 1) {
      let progressed = false;
      for (const id of SEATS) {
        const offers = getLegalActions(state, id);
        if (offers.some((entry) => entry.action.type === "CHOOSE_OPTION")) sawCityHall.add(id);
        if (offers.some((entry) => entry.action.type === "RESOLVE_VISIT_STEP")) sawEvent.add(id);
        const next = offers.find((entry) => entry.action.type === "CHOOSE_OPTION" || entry.action.type === "RESOLVE_VISIT_STEP");
        if (!next) continue;
        const result = applyAction(state, next.action);
        expect(result.errors, `${id} answering ${next.label}`).toEqual([]);
        state = result.state;
        progressed = true;
        expect(Object.keys(state.adventure!.parallelEventSuspended ?? {})).toEqual([]);
        expect(state.turn.parallelStopped ?? null).toBeNull();
        expect(state.turn.mode).toBe("parallel");
      }
      if (!progressed) break;
    }
    expect([...sawCityHall].sort()).toEqual([...SEATS].sort());
    expect([...sawEvent].sort()).toEqual([...SEATS].sort());
    expect(state.adventure!.parallelEventOpenPlayers ?? []).toEqual([]);
    expect(Object.values(state.adventure!.parallelRoundRewards ?? {}).flat()).toEqual([]);
    expect(state.adventure!.rewardQueue.filter((reward) => reward.kind !== "start-turn-hand")).toEqual([]);
    expect(
      Object.entries(state.parallelCombats ?? {}).filter(([, context]) => context.adventure.pendingVisit || context.pendingChoice)
    ).toEqual([]);
  });
});

describe("AUDIT v128 — a separate wave barrier still freezes seats with no OPEN window", () => {
  it("a seat whose shared Event turn is only queued stays frozen under the wave barrier", () => {
    const state = game("audit-v128-wave", { wog: { enabled: true, monsterWaves: true, waveCadence: 3 } });
    stackEventDeck(state, "event.marketplace"); // shared + serialized: one open owner
    startRound(state, 3);

    expect(state.adventure!.eventResolution?.round).toBe(3); // the wave barrier
    const open = state.adventure!.parallelEventOpenPlayers ?? [];
    const queued = (state.adventure!.parallelEventPlayers ?? []).find(
      (id) => !open.includes(id) && id !== state.combat?.attackerPlayerId
    );
    expect(queued, "a seat waiting its shared Event turn").toBeTruthy();

    const quiet = emptyFieldNextTo(state, `hero_${queued}`);
    const message = errorsOf(state, {
      type: "MOVE_HERO",
      playerId: queued!,
      heroId: `hero_${queued}`,
      to: quiet
    }).join("; ");
    expect(message).toContain("Event is still being resolved");
  });
});

describe("AUDIT v128 — stopping parallel play must not lose parked Event work", () => {
  it("period-ended returns open windows and suspended interactions to the ordered queue", () => {
    const state = game("audit-v128-stop");
    for (const id of SEATS) getTownOfPlayer(state, id)!.buildings = ["castle.city_hall"];
    stackEventDeck(state, "event.stables");
    startRound(state, 3);
    expect(Object.keys(state.parallelCombats ?? {}).length).toBeGreaterThan(0);

    stopParallelTurns(state, "period-ended");

    // Nothing may stay stranded in a parked context: ordered play never projects
    // one again, so anything left there is lost for good.
    expect(
      Object.entries(state.parallelCombats ?? {}).filter(([, context]) => context.adventure.pendingVisit)
    ).toEqual([]);
    // Every seat must still have something to do.
    for (const id of SEATS) {
      const reachable =
        getLegalActions(state, id).length > 0 ||
        state.adventure!.rewardQueue.some((reward) => reward.playerId === id);
      expect(reachable, `${id} still has reachable work`).toBe(true);
    }
  });
});
