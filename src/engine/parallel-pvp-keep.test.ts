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
import { parallelPvpPinOwner, parallelStateForPlayer } from "./parallel-combats";
import { seatIsAwaitedInOrderedPlay } from "./afk";
import { getPlayerView } from "./player-view";

/**
 * Parallel turns, PvP option "keep" (turn.pvpKeepsParallel): a PvP battle /
 * holding assault / flag steal resolves between the two players inside the
 * attacker's parallel context while everyone else keeps playing. The defender
 * is PINNED into that context until it resolves; a seat busy elsewhere cannot
 * be attacked or robbed; the aggressor waits while the defender answers.
 * Every test carries a CONTROL where the rule's absence would diverge ("stop"
 * or an absent option keeps the classic stop, a free seat is not refused…).
 */

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function makeGame(seed: string, parallelPvp?: "keep" | "stop"): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: 3,
    players: THREE_PLAYERS,
    ...(parallelPvp ? { parallelPvp } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Inert Astrologers proclamations so even rounds resolve without a choice.
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function rejected(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

const usedFields = new WeakMap<GameState, Set<string>>();
/** A DIFFERENT adjacent field of the hero per call, rewritten to plain empty terrain. */
function emptyFieldNextTo(state: GameState, heroId: string): string {
  const coord = parseHexSpaceId(state.heroes[heroId].spaceId ?? "");
  if (!coord) throw new Error(`${heroId} is not on the map`);
  const used = usedFields.get(state) ?? new Set<string>();
  usedFields.set(state, used);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !used.has(candidate.spaceId));
  if (!field) throw new Error(`no adjacent field for ${heroId}`);
  used.add(field.spaceId);
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  return field.spaceId;
}

function paintField(state: GameState, spaceId: string, location: string, extra: Record<string, unknown> = {}): void {
  const field = state.adventure!.fields[spaceId] as unknown as Record<string, unknown>;
  Object.assign(field, { location, difficulty: undefined, flagOwnerId: null, blackCube: false, everFlagged: false }, extra);
  delete field.bankId;
}

/** p1's hero steps onto p2's hero: the PvP battle opens. */
function p1AttacksP2(state: GameState): GameState {
  const staging = emptyFieldNextTo(state, "hero_p1");
  state.heroes.hero_p2.spaceId = staging;
  return apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: staging });
}

/** Plays the two fighters' offers (ready, place, attack, pass, acknowledge) until p2 is free again. */
function finishBattle(state: GameState): GameState {
  let current = state;
  for (let step = 0; step < 300 && parallelPvpPinOwner(current, "p2"); step += 1) {
    let progressed = false;
    for (const participant of ["p1", "p2"] as PlayerId[]) {
      const offers = getLegalActions(current, participant);
      const pick =
        offers.find((offer) => offer.action.type === "PASS_REACTION") ??
        offers.find((offer) => offer.action.type === "ATTACK_UNIT") ??
        offers.find((offer) => offer.action.type === "ACKNOWLEDGE_COMBAT_END") ??
        offers.find((offer) => offer.action.type === "ACCEPT_COMBAT") ??
        offers.find((offer) => offer.action.type === "FINISH_COMBAT_PLACEMENT") ??
        offers.find((offer) => offer.action.type === "FINISH_COMMANDER_PLACEMENT") ??
        offers.find((offer) => ![
          "RETREAT_FROM_COMBAT", "SURRENDER_COMBAT", "GIVE_UP", "SELECT_PARALLEL_CONTEXT", "END_TURN", "MOVE_HERO"
        ].includes(offer.action.type));
      if (!pick) continue;
      const result = applyAction(current, pick.action);
      if (result.errors.length > 0) continue;
      current = result.state;
      progressed = true;
      break;
    }
    if (!progressed) break;
  }
  return current;
}

describe("parallel PvP 'keep' — the battle runs inside parallel turns", () => {
  it("a hero attack keeps parallel turns; 'stop' and an absent option still stop them (CONTROL)", () => {
    const kept = p1AttacksP2(makeGame("keep-battle", "keep"));
    expect(kept.turn.mode).toBe("parallel");
    expect(kept.eventLog.some((event) => event.type === "PARALLEL_TURNS_STOPPED")).toBe(false);
    // The battle lives in the ATTACKER's context: the fighters see it, the
    // bystander's own frame does not.
    expect(parallelStateForPlayer(kept, "p1").combat?.context.kind).toBe("player");
    expect(parallelStateForPlayer(kept, "p2").combat?.id).toBe(parallelStateForPlayer(kept, "p1").combat?.id);
    expect(parallelStateForPlayer(kept, "p3").combat).toBeNull();

    for (const option of ["stop", undefined] as const) {
      const stopped = p1AttacksP2(makeGame(`keep-battle-ctrl-${option ?? "absent"}`, option));
      expect(stopped.turn.mode).toBe("ordered");
      expect(stopped.turn.parallelStopped?.reason).toBe("pvp-battle");
    }
  });

  it("pins the defender into the battle (no own-map step / End Turn) while a bystander keeps playing, and frees it afterwards", () => {
    let state = makeGame("keep-pin", "keep");
    const p2Step = emptyFieldNextTo(state, "hero_p3");
    const p3Step = emptyFieldNextTo(state, "hero_p3");
    state = p1AttacksP2(state);
    // p2's hero stands next to p1's; give it a quiet field of its own too.
    const p2Home = emptyFieldNextTo(state, "hero_p2");

    expect(parallelPvpPinOwner(state, "p2")).toBe("p1");
    const p2Offers = getLegalActions(state, "p2").map((offer) => offer.action.type);
    expect(p2Offers).not.toContain("MOVE_HERO");
    expect(p2Offers).not.toContain("END_TURN");
    rejected(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p2Home });
    rejected(state, { type: "END_TURN", playerId: "p2" });
    void p2Step;

    // CONTROL: the uninvolved seat is not pinned and moves on its own map.
    expect(parallelPvpPinOwner(state, "p3")).toBeNull();
    state = apply(state, { type: "MOVE_HERO", playerId: "p3", heroId: "hero_p3", to: p3Step });
    expect(state.heroes.hero_p3.spaceId).toBe(p3Step);

    state = finishBattle(state);
    expect(parallelPvpPinOwner(state, "p2")).toBeNull();
    expect(parallelStateForPlayer(state, "p2").combat).toBeNull();
    expect(state.turn.mode).toBe("parallel");
    // Free again: p2 may end its own turn (it was refused while pinned).
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.turn.completedPlayerIds).toContain("p2");
  });

  it("a seat busy in a battle cannot be robbed; once free the same steal resolves without stopping the mode (CONTROL)", () => {
    let state = makeGame("keep-busy-steal", "keep");
    const mine = emptyFieldNextTo(state, "hero_p3");
    paintField(state, mine, "mine", { resource: "gold", amount: 1, flagOwnerId: "p2", everFlagged: true });
    state = p1AttacksP2(state);

    const message = rejected(state, { type: "MOVE_HERO", playerId: "p3", heroId: "hero_p3", to: mine });
    expect(message).toContain("busy");
    expect(state.adventure!.fields[mine].flagOwnerId).toBe("p2");
    expect(getLegalActions(state, "p3").some((offer) =>
      offer.action.type === "MOVE_HERO" && offer.action.to === mine)).toBe(false);

    state = finishBattle(state);
    state = apply(state, { type: "MOVE_HERO", playerId: "p3", heroId: "hero_p3", to: mine });
    expect(state.adventure!.fields[mine].flagOwnerId).toBe("p3");
    expect(state.turn.mode).toBe("parallel");
  });

  it("a seat that already ended its turn is AWAITED while pinned into a battle (AFK vote/kick reach it), not before", () => {
    let state = makeGame("keep-awaited", "keep");
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.turn.completedPlayerIds).toContain("p2");
    // CONTROL: an ended, unpinned seat is idle by design.
    expect(seatIsAwaitedInOrderedPlay(state, "p2")).toBe(false);
    state = p1AttacksP2(state);
    expect(state.turn.mode).toBe("parallel");
    expect(parallelPvpPinOwner(state, "p2")).toBe("p1");
    expect(seatIsAwaitedInOrderedPlay(state, "p2")).toBe(true);
  });
});

describe("parallel PvP 'keep' — a pinned defender commanding neutrals elsewhere", () => {
  /**
   * PvP Neutral Control: p2 commands the guards of p1's Neutral fight. When
   * `pinned`, p3 first attacked p2, so p2's hero is fighting in p3's context.
   */
  function controllerInP1Battle(pinned: boolean): { state: GameState; quiet: string } {
    let state = createAdventureGameState({
      seed: `keep-pinned-controller-${pinned}`,
      difficulty: "normal",
      ruleset: "binh",
      rollFirstPlayer: false,
      events: false,
      parallelTurns: 3,
      pvpNeutralControl: true,
      parallelPvp: "keep",
      players: THREE_PLAYERS
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    const staging = emptyFieldNextTo(state, "hero_p3");
    const quiet = emptyFieldNextTo(state, "hero_p2");
    if (pinned) {
      state.heroes.hero_p2.spaceId = staging;
      state = apply(state, { type: "MOVE_HERO", playerId: "p3", heroId: "hero_p3", to: staging });
      expect(parallelPvpPinOwner(state, "p2")).toBe("p3");
    }
    const guard = emptyFieldNextTo(state, "hero_p1");
    paintField(state, guard, "empty_field", { difficulty: 1 });
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: guard });
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p2", ownerPlayerId: "p1" });
    expect(parallelStateForPlayer(state, "p2").parallelCombatOwnerId).toBe("p1");
    return { state, quiet: pinned ? emptyFieldNextTo(state, "hero_p2") : quiet };
  }

  it("may not walk its fighting hero (or touch its map) from the commanded battle; an unpinned controller may (CONTROL)", () => {
    const { state, quiet } = controllerInP1Battle(true);
    const heroBefore = state.heroes.hero_p2.spaceId;
    expect(getLegalActions(state, "p2").some((offer) => offer.action.type === "MOVE_HERO")).toBe(false);
    rejected(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: quiet });
    expect(state.heroes.hero_p2.spaceId).toBe(heroBefore);
    // The hosted view (no parked contexts on the wire) withholds the same moves.
    const view = getPlayerView(state, "p2") as unknown as GameState;
    expect(getLegalActions(view, "p2").some((offer) => offer.action.type === "MOVE_HERO")).toBe(false);
    // It can still go back to its own battle.
    expect(getLegalActions(state, "p2").some((offer) =>
      offer.action.type === "SELECT_PARALLEL_CONTEXT" && offer.action.ownerPlayerId === "p3")).toBe(true);

    // CONTROL: a controller that is NOT pinned keeps its quiet map moves there.
    const free = controllerInP1Battle(false);
    expect(getLegalActions(free.state, "p2").some((offer) => offer.action.type === "MOVE_HERO")).toBe(true);
    const freeView = getPlayerView(free.state, "p2") as unknown as GameState;
    expect(getLegalActions(freeView, "p2").some((offer) => offer.action.type === "MOVE_HERO")).toBe(true);
    const moved = apply(free.state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: free.quiet });
    expect(moved.heroes.hero_p2.spaceId).toBe(free.quiet);
  });
});

describe("parallel turns (classic PvP option) — a hero fighting a parked battle stays on its battlefield", () => {
  it("its seat, commanding another player's neutrals, may move its OTHER hero (CONTROL) but never the fighter", () => {
    let state = createAdventureGameState({
      seed: "parallel-fighter-stays",
      difficulty: "normal",
      ruleset: "binh",
      rollFirstPlayer: false,
      events: false,
      parallelTurns: 3,
      pvpNeutralControl: true,
      players: THREE_PLAYERS
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    // p2 hires a second hero first.
    const hire = getLegalActions(state, "p2").find((offer) => offer.action.type === "HIRE_SECONDARY_HERO");
    expect(hire, "p2 may hire a secondary hero").toBeTruthy();
    state = apply(state, hire!.action);
    const second = Object.values(state.heroes).find((hero) => hero.controllerId === "p2" && hero.id !== "hero_p2");
    expect(second).toBeTruthy();
    // p2's main hero opens its OWN neutral fight (parked once p2 looks elsewhere).
    const guard2 = emptyFieldNextTo(state, "hero_p2");
    paintField(state, guard2, "empty_field", { difficulty: 1 });
    state = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: guard2 });
    expect(parallelStateForPlayer(state, "p2").combat?.context).toMatchObject({ kind: "neutral", heroId: "hero_p2" });
    // p1's neutral fight — p2 commands its guards and switches there.
    const guard1 = emptyFieldNextTo(state, "hero_p1");
    paintField(state, guard1, "empty_field", { difficulty: 1 });
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: guard1 });
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p2", ownerPlayerId: "p1" });
    expect(parallelStateForPlayer(state, "p2").parallelCombatOwnerId).toBe("p1");
    expect(state.turn.pvpKeepsParallel).toBeUndefined();

    const fighterStep = emptyFieldNextTo(state, "hero_p2");
    state.heroes[second!.id].movementPoints = Math.max(1, state.heroes[second!.id].movementPoints);
    const moves = getLegalActions(state, "p2").filter((offer) => offer.action.type === "MOVE_HERO");
    expect(moves.some((offer) => offer.action.type === "MOVE_HERO" && offer.action.heroId === "hero_p2")).toBe(false);
    expect(rejected(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: fighterStep })).toContain("fighting a battle");
    expect(rejected(state, { type: "MOVE_HERO_PATH", playerId: "p2", heroId: "hero_p2", path: [fighterStep] })).toContain("fighting a battle");
    expect(state.heroes.hero_p2.spaceId).toBe(guard2);

    // CONTROL: the same seat's other hero keeps its quiet step there.
    const secondMove = moves.find((offer) => offer.action.type === "MOVE_HERO" && offer.action.heroId === second!.id);
    expect(secondMove).toBeTruthy();
    const moved = apply(state, secondMove!.action);
    expect(moved.heroes[second!.id].spaceId).toBe(secondMove!.action.type === "MOVE_HERO" ? secondMove!.action.to : null);
  });
});

describe("parallel PvP 'keep' — two players' windows in one context never freeze each other", () => {
  /**
   * The aftermath of a PvP battle in the attacker's context: the winner's
   * Necromancy next to the loser's First Aid. The topmost window (First Aid,
   * served before Necromancy) decides who acts; everyone else waits.
   */
  function aftermath(keep: boolean): GameState {
    const state = parallelStateForPlayer(p1AttacksP2(makeGame(`keep-aftermath-${keep}`, "keep")), "p1");
    state.combat = null;
    state.phase = "player-turn";
    state.priorityPlayerId = null;
    state.adventure!.pendingNecromancy = { playerId: "p1", remaining: 1 };
    state.adventure!.pendingCommanderFirstAid = { playerId: "p2", options: [] };
    state.turn.pvpKeepsParallel = keep;
    return state;
  }

  it("the First Aid owner answers first, then the Necromancy owner (CONTROL without the option: neither is offered its window)", () => {
    let state = aftermath(true);
    expect(parallelPvpPinOwner(state, "p2")).toBe("p1");
    const decline = getLegalActions(state, "p2").find((offer) => offer.action.type === "COMMANDER_FIRST_AID");
    expect(decline).toBeTruthy();
    expect(getLegalActions(state, "p1").some((offer) => offer.action.type === "SKIP_NECROMANCY")).toBe(false);
    state = apply(state, decline!.action);
    expect(getLegalActions(state, "p1").some((offer) => offer.action.type === "SKIP_NECROMANCY")).toBe(true);

    // CONTROL: the classic "first slot that is not mine" blocker names each
    // seat as the other's blocker — nobody is offered their own window.
    const classic = aftermath(false);
    expect(getLegalActions(classic, "p2").some((offer) => offer.action.type === "COMMANDER_FIRST_AID")).toBe(false);
    expect(getLegalActions(classic, "p1").some((offer) => offer.action.type === "SKIP_NECROMANCY")).toBe(false);
  });
});

describe("parallel PvP 'keep' — holding assault: the aggressor waits for the defender's answer", () => {
  function assaultSettlement(seed: string, parallelPvp: "keep" | "stop"): { state: GameState; settlement: string } {
    const state = makeGame(seed, parallelPvp);
    const settlement = emptyFieldNextTo(state, "hero_p1");
    paintField(state, settlement, "settlement", { flagOwnerId: "p2", everFlagged: true });
    state.players.p2.resources.gold = 20;
    return { state: apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: settlement }), settlement };
  }

  it("keep: the garrison prompt opens for the owner inside the attacker's context; the attacker is frozen, the owner pinned", () => {
    const { state, settlement } = assaultSettlement("keep-garrison", "keep");
    expect(state.turn.mode).toBe("parallel");
    const p2View = parallelStateForPlayer(state, "p2");
    expect(p2View.adventure?.pendingGarrison?.defenderPlayerId).toBe("p2");
    expect(parallelPvpPinOwner(state, "p2")).toBe("p1");
    expect(getLegalActions(state, "p2").some((offer) => offer.action.type === "CHOOSE_OPTION")).toBe(true);

    // The aggressor has nothing to do and every attempt is refused.
    const p1Step = emptyFieldNextTo(state, "hero_p1");
    expect(getLegalActions(state, "p1").map((offer) => offer.action.type)).not.toContain("MOVE_HERO");
    expect(rejected(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: p1Step })).toContain("wait for");
    // The hosted view p1's client computes its offers from withholds them too.
    const p1View = getPlayerView(state, "p1") as unknown as GameState;
    expect(getLegalActions(p1View, "p1").some((offer) => offer.action.type === "MOVE_HERO")).toBe(false);
    // CONTROL: a bystander keeps its quiet moves meanwhile (engine and view).
    const p3Step = emptyFieldNextTo(state, "hero_p3");
    expect(applyAction(state, { type: "MOVE_HERO", playerId: "p3", heroId: "hero_p3", to: p3Step }).errors).toEqual([]);
    const p3View = getPlayerView(state, "p3") as unknown as GameState;
    expect(getLegalActions(p3View, "p3").some((offer) => offer.action.type === "MOVE_HERO")).toBe(true);

    // The owner lets it fall: the owner is released, the attacker's settlement
    // visit opens, and taking the flag from p2 keeps parallel turns going.
    const choice = p2View.pendingChoice!;
    let fallen = apply(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: 1 });
    expect(parallelPvpPinOwner(fallen, "p2")).toBeNull();
    expect(parallelStateForPlayer(fallen, "p1").adventure?.pendingVisit?.playerId).toBe("p1");
    const visitStep = getLegalActions(fallen, "p1").find((offer) => offer.action.type === "RESOLVE_VISIT_STEP");
    expect(visitStep).toBeTruthy();
    fallen = apply(fallen, visitStep!.action);
    expect(fallen.adventure!.fields[settlement].flagOwnerId).toBe("p1");
    expect(fallen.turn.mode).toBe("parallel");
  });

  it("the waiting aggressor's Wandering Merchant offer (an independent purchase) is not refused by the wait", () => {
    const { state } = assaultSettlement("keep-garrison-merchant", "keep");
    // An even Astrologers round with the Wandering Merchant active.
    state.round = 2;
    state.adventure!.astrologers = {
      ...(state.adventure!.astrologers ?? {}),
      activeCardId: "astrologers.wandering_merchant"
    } as NonNullable<GameState["adventure"]>["astrologers"];
    state.players.p1.resources.gold = 30;
    const offer = getLegalActions(state, "p1").find((entry) => entry.action.type === "BUY_WANDERING_MERCHANT");
    expect(offer, "the merchant stays offered while p1 waits").toBeTruthy();
    const goldBefore = state.players.p1.resources.gold;
    const bought = apply(state, offer!.action);
    expect(bought.players.p1.resources.gold).toBeLessThan(goldBefore);
    // CONTROL: the wait still refuses p1's map actions in the same state.
    const p1Step = emptyFieldNextTo(state, "hero_p1");
    expect(rejected(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: p1Step })).toContain("wait for");
  });

  it("CONTROL 'stop': the same assault stops parallel turns before the prompt opens", () => {
    const { state } = assaultSettlement("keep-garrison-stop", "stop");
    expect(state.turn.mode).toBe("ordered");
    expect(state.turn.parallelStopped?.reason).toBe("pvp-battle");
  });
});
