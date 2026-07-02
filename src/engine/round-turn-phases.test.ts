import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  type GameAction,
  type GameState
} from "./index";
import { startAdventureRound, startPlayerTurn } from "./adventure";

// ---------------------------------------------------------------------------
// Round-start / turn-start phase ordering.
//
// A Round resolves in distinct phases before any player acts:
//   1. Astrologers' Proclaim resolves (even rounds) — its immediate effects
//      apply and its per-player rewards queue FIRST.
//   2. "Beginning of the round" town-building effects (City Hall income/draws,
//      Mystic Pond die, faction cubes, Wall of Knowledge, Blood Obelisk, …).
//   3. The Turn then begins: "beginning of your turn" building effects, and
//      finally the hand step — if the round-start effects pushed the hand over
//      the limit the player MUST discard back down before acting.
//
// The first player of a Round is the tricky case: their Turn starts in the same
// engine step that just queued the round-start effects, so the hand-limit
// snapshot must be taken AFTER those effects run, not before. The engine does
// this with a "start-turn-hand" reward queued LAST by startPlayerTurn.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "phase-test", difficulty: "normal", rollFirstPlayer: false, events: false });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/**
 * Advances from the round-1 opening (p1 active) to round 3 — a Resource round —
 * with p1 active again. END_TURN never refills a hand, so p1's hand stays
 * exactly where the test put it until the round-3 building effects fire.
 */
function toResourceRoundP1(state: GameState): GameState {
  state.decks.astrologers!.drawPile.push("astrologers.dead_silence"); // benign round-2 Proclaim
  state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 1 → p2
  state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 2 (astrologers), p1
  state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 2 → p2
  state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 3 (resource), p1
  return state;
}

/** Advances to round 2 (Astrologers) with p1 active, drawing `cardId` as the Proclaim. */
function toAstrologersRoundP1(state: GameState, cardId: string): GameState {
  state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 1 → p2
  state.decks.astrologers!.drawPile.push(cardId); // top of the draw pile (popped next)
  state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 2 (astrologers), p1
  return state;
}

describe("first player of a Resource round — City Hall draw vs. the hand limit", () => {
  it("forces the first player to discard down when a round-start City Hall draw pushes them over the limit", () => {
    let state = makeGame();
    // Give p1 a City Hall whose Resource-round bonus is "draw 2 cards" (the
    // Stronghold board); the engine resolves a building by id regardless of the
    // town's own faction, so this is a clean, faction-agnostic fixture.
    state.towns.town_p1.buildings = ["stronghold.city_hall"];
    const limit = state.players.p1.limits.hand;
    state.players.p1.hand = state.players.p1.hand.slice(0, limit);
    expect(state.players.p1.hand).toHaveLength(limit);

    state = toResourceRoundP1(state);

    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      throw new Error("expected p1's City Hall choice at the start of the Resource round");
    }
    expect(choice.cityHall?.options[0]).toMatchObject({ drawCards: 2 });

    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });

    // The draw happened during the round-start phase, before p1's turn proper.
    expect(state.players.p1.hand.length).toBe(limit + 2);
    // The turn only "really starts" after the round-start draws, so the hand is
    // now over the limit and p1 must discard back down before acting.
    expect(state.players.p1.needsHandRefresh).toBe(true);

    // A map action is rejected until p1 discards down.
    const blocked = applyAction(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:8:3" });
    expect(blocked.errors.length).toBeGreaterThan(0);

    state = apply(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: state.players.p1.hand.slice(0, 2)
    });
    expect(state.players.p1.hand).toHaveLength(limit);
    expect(state.players.p1.needsHandRefresh).toBe(false);
  });

  it("does not force a discard when the round-start draw keeps the hand at or under the limit", () => {
    let state = makeGame();
    state.towns.town_p1.buildings = ["stronghold.city_hall"];
    const limit = state.players.p1.limits.hand;
    state.players.p1.hand = state.players.p1.hand.slice(0, limit - 2); // +2 lands exactly on the limit

    state = toResourceRoundP1(state);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      throw new Error("expected p1's City Hall choice");
    }
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });

    expect(state.players.p1.hand.length).toBe(limit);
    expect(state.players.p1.needsHandRefresh).toBe(false);
  });
});

describe("first player of a Resource round — Blood Obelisk take-to-hand vs. the hand limit", () => {
  it("forces a discard when Blood Obelisk pulls a card from the discard pile over the limit", () => {
    let state = makeGame();
    // Fortress Blood Obelisk: at each Resource round, Search(4) your discard
    // pile and take 1 card to hand. That take can put the first player over.
    state.towns.town_p1.buildings = ["fortress.blood_obelisk"];
    const limit = state.players.p1.limits.hand;
    state.players.p1.hand = state.players.p1.hand.slice(0, limit);
    state.players.p1.discard = ["stat.attack"]; // a single card to recover

    state = toResourceRoundP1(state);

    // The Blood Obelisk discard-pick is waiting for p1.
    const pick = getLegalActions(state, "p1").find((legal) => legal.label.startsWith("Take "));
    expect(pick, "Blood Obelisk should offer a card to take from the discard pile").toBeTruthy();
    state = apply(state, pick!.action);

    expect(state.players.p1.hand).toContain("stat.attack");
    expect(state.players.p1.hand.length).toBe(limit + 1);
    expect(state.players.p1.needsHandRefresh).toBe(true);
  });
});

describe("start-of-turn hand snapshot is the last phase", () => {
  it("queues the start-turn-hand reward AFTER every round-start and start-of-turn reward (Resource round)", () => {
    const state = makeGame();
    state.towns.town_p1.buildings = ["stronghold.city_hall"]; // a round-start (City Hall) reward
    state.adventure!.rewardQueue = [];
    state.round = 3; // Resource round
    startAdventureRound(state); // queues round-start rewards (no pump)
    startPlayerTurn(state, "p1"); // queues start-of-turn rewards + the hand marker (no pump)

    const queue = state.adventure!.rewardQueue;
    const cityHallIndex = queue.findIndex((reward) => reward.kind === "city-hall-choice" && reward.playerId === "p1");
    const markerIndex = queue.findIndex((reward) => reward.kind === "start-turn-hand" && reward.playerId === "p1");

    expect(cityHallIndex).toBeGreaterThanOrEqual(0);
    expect(markerIndex).toBe(queue.length - 1); // the marker is dead last
    expect(cityHallIndex).toBeLessThan(markerIndex);
  });

  it("orders an Astrologers' round as: Proclaim reward → round-start building reward → hand marker", () => {
    const state = makeGame();
    // Tower Wall of Knowledge is a round-start (Astrologers) building reward; it
    // only queues when a Knowledge/Power Statistic sits in the discard pile.
    state.towns.town_p1.buildings = ["tower.wall_of_knowledge"];
    state.players.p1.discard = ["stat.power"];
    state.adventure!.rewardQueue = [];
    // White Raven = ROLL_DICE_ALL: an unconditional per-player Proclaim reward.
    state.decks.astrologers!.drawPile.push("astrologers.white_raven");
    state.round = 2; // Astrologers round
    startAdventureRound(state);
    startPlayerTurn(state, "p1");

    const queue = state.adventure!.rewardQueue;
    const indexOf = (predicate: (reward: (typeof queue)[number]) => boolean) => queue.findIndex(predicate);
    const proclaimIndex = indexOf(
      (reward) =>
        reward.playerId === "p1" &&
        reward.kind === "visit-steps" &&
        reward.steps.some((step) => step.type === "ROLL_RESOURCE_DICE")
    );
    const wallIndex = indexOf(
      (reward) =>
        reward.playerId === "p1" &&
        reward.kind === "visit-steps" &&
        reward.steps.some((step) => step.type === "CHOOSE_ONE" && step.prompt.includes("Wall of Knowledge"))
    );
    const markerIndex = indexOf((reward) => reward.playerId === "p1" && reward.kind === "start-turn-hand");

    expect(proclaimIndex).toBeGreaterThanOrEqual(0);
    expect(wallIndex).toBeGreaterThanOrEqual(0);
    expect(markerIndex).toBe(queue.length - 1);
    // Astrology resolves first, then the building, then the hand snapshot.
    expect(proclaimIndex).toBeLessThan(wallIndex);
    expect(wallIndex).toBeLessThan(markerIndex);
  });
});

describe("Astrologers round — building take-to-hand vs. the hand limit (end-to-end)", () => {
  it("forces a discard when Wall of Knowledge recovers a Statistic over the limit", () => {
    let state = makeGame();
    state.towns.town_p1.buildings = ["tower.wall_of_knowledge"];
    const limit = state.players.p1.limits.hand;
    state.players.p1.hand = state.players.p1.hand.slice(0, limit);
    state.players.p1.discard = ["stat.power"];

    state = toAstrologersRoundP1(state, "astrologers.dead_silence");

    // Wall of Knowledge offers its take-a-Statistic choice (round-start phase).
    const offer = getLegalActions(state, "p1").find((legal) =>
      legal.label.includes("Take a Knowledge or Power Statistic")
    );
    expect(offer, "Wall of Knowledge should offer to recover a Statistic").toBeTruthy();
    state = apply(state, offer!.action);

    const take = getLegalActions(state, "p1").find((legal) => legal.label.startsWith("Take "));
    expect(take).toBeTruthy();
    state = apply(state, take!.action);

    expect(state.players.p1.hand).toContain("stat.power");
    expect(state.players.p1.hand.length).toBe(limit + 1);
    // The hand snapshot ran after the building recovery → discard required.
    expect(state.players.p1.needsHandRefresh).toBe(true);
  });
});

describe("the opening turn's hand step is live straight out of setup", () => {
  it("offers the optional draw on turn 1 without needing a prior action to pump the queue", () => {
    const state = makeGame();
    // The setup drains the opening start-of-turn rewards, so the hand step is
    // already armed: the active player MAY discard-and-draw on their first turn.
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p1.needsHandRefresh).toBe(false);
    const drawOption = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "REFRESH_HAND" && legal.action.playerId === "p1"
    );
    expect(drawOption, "the start-of-turn draw should be offered on turn 1").toBeTruthy();
  });
});

describe("special buildings fire on the correct round phase", () => {
  it("grants Brotherhood of the Sword morale on Resource rounds, never on Astrologers rounds", () => {
    let state = makeGame(); // p1 = Castle, which does not ignore morale
    state.towns.town_p1.buildings = ["castle.brotherhood_of_the_sword"];
    state.players.p1.morale = 0;
    state.decks.astrologers!.drawPile.push("astrologers.dead_silence");

    state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 1 → p2
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 2 (astrologers)
    expect(state.round).toBe(2);
    // An Astrologers round must not trigger the Resource-round morale gain.
    expect(state.players.p1.morale).toBe(0);

    state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 2 → p2
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 3 (resource)
    expect(state.round).toBe(3);
    expect(state.players.p1.morale).toBe(1);
  });

  it("stores a Brimstone cube on Astrologers rounds and a Cage cube on Resource rounds — each only on its own", () => {
    let state = makeGame();
    // The engine resolves a building by id, so co-locating the two cube
    // buildings on one town is a clean fixture for their opposite timings.
    state.towns.town_p1.buildings = ["inferno.brimstone_stormclouds", "fortress.cage_of_warlords"];
    state.towns.town_p1.factionCubes = {};
    state.decks.astrologers!.drawPile.push("astrologers.dead_silence");
    const cubes = () => state.towns.town_p1.factionCubes ?? {};

    state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 1 → p2
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 2 (astrologers)
    expect(state.round).toBe(2);
    // Brimstone gains its cube on Astrologers rounds; Cage (Resource) does not.
    expect(cubes()["inferno.brimstone_stormclouds"]).toBe(1);
    expect(cubes()["fortress.cage_of_warlords"] ?? 0).toBe(0);

    state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 2 → p2
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 3 (resource)
    expect(state.round).toBe(3);
    // Cage gains its cube on Resource rounds; Brimstone (Astrologers) holds.
    expect(cubes()["inferno.brimstone_stormclouds"]).toBe(1);
    expect(cubes()["fortress.cage_of_warlords"]).toBe(1);
  });
});

describe("multiplayer (PvP) — round-start City Hall draw forces each seat to discard on its own turn", () => {
  it("resolves both seats' round-start draws, then surfaces the over-limit discard per seat in their own view", () => {
    // Two real seats, each with a "draw 2" City Hall, each sitting at the limit.
    let state = createAdventureGameState({
      seed: "mp-phase",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Crag Hack", factionId: "stronghold", heroDefId: "crag_hack" },
        { id: "p2", name: "Yog", factionId: "stronghold", heroDefId: "yog" }
      ]
    });
    state.towns.town_p1.buildings = ["stronghold.city_hall"];
    state.towns.town_p2.buildings = ["stronghold.city_hall"];
    const limit = state.players.p1.limits.hand;
    state.players.p1.hand = state.players.p1.hand.slice(0, limit);
    state.players.p2.hand = state.players.p2.hand.slice(0, limit);

    // Drive both seats to round 3 (a Resource round). A benign round-2 Proclaim
    // keeps the path clean.
    state.decks.astrologers!.drawPile.push("astrologers.dead_silence");
    state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 1 → p2
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 2 (astrologers), p1
    state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 2 → p2
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 3 (resource), p1

    // Round-start phase: p1's City Hall choice opens first, then — still inside
    // p1's turn-start — p2's, before p1 is allowed to act. Both draw 2.
    let choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context === "city-hall").toBe(true);
    expect(choice?.playerId).toBe("p1");
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 0 });

    choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context === "city-hall").toBe(true);
    expect(choice?.playerId).toBe("p2");
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice!.id, optionIndex: 0 });

    // p1 (first player) is over the limit and must discard before acting; their
    // own redacted player view reports it too.
    expect(state.activePlayerId).toBe("p1");
    expect(state.players.p1.hand.length).toBe(limit + 2);
    expect(state.players.p1.needsHandRefresh).toBe(true);
    expect(getPlayerView(state, "p1").players.p1.needsHandRefresh).toBe(true);
    // p2 already drew (round-start, all seats) but is not active yet — their
    // forced discard waits for their own turn to begin.
    expect(state.players.p2.hand.length).toBe(limit + 2);

    // p1 discards down and ends their turn.
    state = apply(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: state.players.p1.hand.slice(0, 2)
    });
    expect(state.players.p1.needsHandRefresh).toBe(false);
    state = apply(state, { type: "END_TURN", playerId: "p1" });

    // p2's turn begins; the round-start draw it already took now forces the
    // discard at its own start-of-turn, and only p2 is gated.
    expect(state.activePlayerId).toBe("p2");
    expect(state.players.p2.needsHandRefresh).toBe(true);
    expect(getPlayerView(state, "p2").players.p2.needsHandRefresh).toBe(true);
    // The forced discard is offered and gates p2's turn: the refresh is the
    // first action and no movement is allowed until p2 discards down. (Town /
    // morale actions stay available — they may be taken on any player's turn.)
    const p2Actions = getLegalActions(state, "p2");
    expect(p2Actions[0]?.action.type).toBe("REFRESH_HAND");
    expect(p2Actions.some((legal) => legal.action.type === "MOVE_HERO")).toBe(false);
  });
});

describe("hand draw/discard and recurring events keep working for the whole game", () => {
  it("re-arms the start-of-turn draw for the active player on every turn through six rounds", () => {
    let state = makeGame();
    // Benign Proclaims for the Astrologers rounds 2, 4, 6.
    state.decks.astrologers!.drawPile.push(
      "astrologers.dead_silence",
      "astrologers.dead_silence",
      "astrologers.dead_silence"
    );

    for (let turn = 0; turn < 12; turn += 1) {
      const active = state.activePlayerId;
      const where = `turn ${turn}, round ${state.round}, ${active}`;
      // Each turn of each round the snapshot has resolved cleanly: the optional
      // draw is armed, a hand at/under the limit is not force-discarded, and no
      // start-of-turn choice is left dangling (no stale markers / pending input).
      expect(state.players[active]?.canMulligan, where).toBe(true);
      expect(state.players[active]?.needsHandRefresh, where).toBe(false);
      expect(state.pendingChoice, where).toBeNull();
      // Exercise the optional draw on even turns, plain end on odd ones — both end
      // the turn cleanly and the next turn re-arms.
      if (turn % 2 === 0) {
        state = apply(state, { type: "REFRESH_HAND", playerId: active, discardCardIds: [] });
      }
      state = apply(state, { type: "END_TURN", playerId: active });
    }
    expect(state.round).toBe(7); // 12 turns = six full rounds
  });

  it("re-fires the City Hall draw at each later Resource round (3 and 5), forcing a discard each time", () => {
    let state = makeGame();
    state.towns.town_p1.buildings = ["stronghold.city_hall"];
    const limit = state.players.p1.limits.hand;
    state.players.p1.hand = state.players.p1.hand.slice(0, limit);
    state.decks.astrologers!.drawPile.push("astrologers.dead_silence", "astrologers.dead_silence");

    const endTurn = (s: GameState, playerId: "p1" | "p2"): GameState => {
      const p = s.players[playerId]!;
      if (p.needsHandRefresh || p.canMulligan) {
        s = apply(s, { type: "REFRESH_HAND", playerId, discardCardIds: p.hand.slice(0, p.hand.length - limit) });
      }
      return apply(s, { type: "END_TURN", playerId });
    };
    const resolveCityHallDraw = (s: GameState, round: number): GameState => {
      const choice = s.pendingChoice;
      expect(choice?.type === "OPTION_CHOICE" && choice.context === "city-hall", `round ${round}`).toBe(true);
      expect(choice?.playerId).toBe("p1");
      s = apply(s, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 0 });
      expect(s.round, `round ${round}`).toBe(round);
      expect(s.players.p1.hand.length).toBe(limit + 2);
      // The later-round draw still forces the discard — the fix is not round-1 only.
      expect(s.players.p1.needsHandRefresh, `round ${round} forced discard`).toBe(true);
      return apply(s, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: s.players.p1.hand.slice(0, 2) });
    };

    // Round 1 → round 3 (each round opens with p1, turn order is fixed [p1, p2]).
    state = endTurn(state, "p1");
    state = endTurn(state, "p2"); // wrap → round 2
    state = endTurn(state, "p1");
    state = endTurn(state, "p2"); // wrap → round 3, City Hall pending for p1
    state = resolveCityHallDraw(state, 3);

    // Round 3 → round 5: the same building event must recur.
    state = endTurn(state, "p1");
    state = endTurn(state, "p2"); // wrap → round 4
    state = endTurn(state, "p1");
    state = endTurn(state, "p2"); // wrap → round 5, City Hall pending for p1 again
    state = resolveCityHallDraw(state, 5);
  });

  it("does not force a discard for a mid-turn draw, but the next turn-start snapshot does", () => {
    let state = makeGame();
    const limit = state.players.p1.limits.hand;
    state.players.p1.morale = 1; // a token to spend mid-turn
    state.players.p1.hand = state.players.p1.hand.slice(0, limit);

    // Opening turn: armed, at the limit → no forced discard.
    expect(state.players.p1.canMulligan).toBe(true);
    expect(state.players.p1.needsHandRefresh).toBe(false);
    // Take the optional draw (no discards), which closes the start-of-turn window.
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(state.players.p1.canMulligan).toBe(false);
    expect(state.players.p1.hand.length).toBe(limit);

    // Spend morale to draw mid-turn → over the limit, but NOT force-discarded: the
    // hand limit is only enforced by the start-of-turn snapshot, never mid-turn.
    state = apply(state, { type: "SPEND_MORALE", playerId: "p1", benefit: "draw" });
    expect(state.players.p1.hand.length).toBe(limit + 1);
    expect(state.players.p1.needsHandRefresh).toBe(false);

    // It carries over: at p1's NEXT turn start the snapshot finally forces it down.
    state.decks.astrologers!.drawPile.push("astrologers.dead_silence");
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 2, p1
    expect(state.players.p1.hand.length).toBe(limit + 1);
    expect(state.players.p1.needsHandRefresh).toBe(true);
  });

  it("forces a discard when an expiring +1 hand-limit Proclaim drops the limit below the held hand", () => {
    let state = makeGame();
    const base = state.players.p1.limits.hand;
    // pop() draws the LAST pushed card first: Profuse Growth at round 2 (+1 hand
    // limit), then a benign card at round 4 when Profuse Growth expires.
    state.decks.astrologers!.drawPile.push("astrologers.dead_silence", "astrologers.profuse_growth");

    state = apply(state, { type: "END_TURN", playerId: "p1" }); // round 1 → p2
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 2 (Profuse Growth)
    expect(state.round).toBe(2);
    // The raised limit lets p1 draw an extra card.
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(state.players.p1.hand.length).toBe(base + 1);

    // Round 3 (Resource): Profuse Growth is still face up, so base + 1 is legal.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 3
    expect(state.round).toBe(3);
    expect(state.players.p1.needsHandRefresh).toBe(false);

    // Round 4 (Astrologers): Profuse Growth expires before the snapshot, so the
    // limit reverts to base and the held base + 1 hand is now over it.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    state = apply(state, { type: "END_TURN", playerId: "p2" }); // wrap → round 4, Profuse Growth expires
    expect(state.round).toBe(4);
    expect(state.players.p1.hand.length).toBe(base + 1);
    expect(state.players.p1.needsHandRefresh).toBe(true);
  });
});
