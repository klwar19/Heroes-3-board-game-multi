import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId,
} from "./index";
import { describe, expect, it } from "vitest";
import {
  hasParkedParallelInteractions,
  parallelPresentationEvents,
  parallelStateForPlayer,
} from "./parallel-combats";
import { eliminatePlayer } from "./adventure";
import { stopParallelTurns } from "./parallel-turns";
import { neutralCombatControllerId } from "./neutral-control";
import type { CustomMapPreset } from "./map-preset";
import { appendEvent } from "./events";
import { getPlayerView, redactStateForSeat } from "./player-view";
import { makeActiveEffect } from "./active-effects";
import { NEUTRAL_PLAYER_ID } from "./state";
import { computerDecisionOwner } from "./computer/window";
import { driveComputerPlayers } from "../server/computer-runner";
import { nextAfkDropAction } from "./afk-drop";

describe("independent parallel battles", () => {
  it.each(["interleave-a", "interleave-b", "interleave-c"])(
    "interleaves three complete battles without cross-battle mutations (%s)",
    (seed) => {
      let state = makeGame(seed, { parallelTurns: 4, players: 3 });
      const seats = ["p1", "p2", "p3"];
      for (const seat of seats) {
        const field = emptyFieldNextTo(state, `hero_${seat}`);
        paintField(state, field, "empty_field", { difficulty: 2 });
        state = moveHero(state, seat, field);
      }
      let actions = 0;
      for (let step = 0; step < 500; step++) {
        let progressed = false;
        for (const seat of seats) {
          const selected = parallelStateForPlayer(state, seat);
          if (
            !selected.combat &&
            !selected.pendingChoice &&
            !selected.adventure?.pendingVisit &&
            !selected.adventure?.pendingNecromancy
          )
            continue;
          const otherBattles = seats
            .filter((id) => id !== seat)
            .map(
              (id) =>
                [
                  id,
                  structuredClone(parallelStateForPlayer(state, id).combat),
                ] as const,
            );
          const next = driveFight(selected, [seat], 1);
          expect(
            next,
            JSON.stringify({
              seat,
              phase: selected.phase,
              choice: selected.pendingChoice,
              offers: getLegalActions(selected, seat).map((l) => l.action),
              combat: selected.combat?.outcome,
            }),
          ).not.toBe(selected);
          for (const [other, battle] of otherBattles)
            expect(parallelStateForPlayer(next, other).combat).toEqual(battle);
          state = JSON.parse(JSON.stringify(next));
          actions++;
          progressed = true;
        }
        if (!progressed) break;
      }
      expect(actions).toBeGreaterThan(12);
      for (const seat of seats)
        expect(parallelStateForPlayer(state, seat).combat).toBeNull();
      expect(state.parallelCombats).toBeUndefined();
    },
  );

  it("only presents events from the viewer's battle while retaining the shared log", () => {
    let state = openNeutralFightForP2("parallel-presentation");
    const otherEvent = appendEvent(state, {
      type: "COMBAT_ROUND_STARTED",
      round: 1,
      activeUnitId: null,
    });
    const field = emptyFieldNextTo(state, "hero_p1");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p1", field);
    const ownEvent = appendEvent(state, {
      type: "COMBAT_ROUND_STARTED",
      round: 1,
      activeUnitId: null,
    });
    const events = [otherEvent, ownEvent];
    expect(parallelPresentationEvents(state, events)).toEqual([ownEvent]);
    expect(
      parallelPresentationEvents(parallelStateForPlayer(state, "p2"), events),
    ).toEqual([otherEvent]);
    expect(state.eventLog).toContainEqual(otherEvent);
    expect(state.eventLog).toContainEqual(ownEvent);
  });

  it("isolates combat effects, ongoing cards, and neutral bookkeeping", () => {
    let state = openNeutralFightForP2("parallel-effects");
    const effect = makeActiveEffect(
      state,
      {
        name: "Battle-only bonus",
        scope: "global",
        modifiers: [{ type: "ATTACK_BONUS", amount: 1 }],
        duration: { type: "combat" },
      },
      { type: "card", cardId: "spell.bless", controllerId: "p2" },
      "p2",
    );
    state.activeEffects.push(effect);
    state.players.p2.ongoingCards = [
      { cardId: "spell.bless", effectIds: [effect.id], returnTo: "discard" },
    ];
    state.players[NEUTRAL_PLAYER_ID].combatStats.spellsCastThisRound = 7;
    state.players.p2.combatStats.spellsCastThisRound = 1;
    state.players.p2.combatStats.equipmentKillDrawsThisRound = 2;
    const field = emptyFieldNextTo(state, "hero_p1");
    paintField(state, field, "empty_field", { difficulty: 1 });
    const p2Before = structuredClone(state.players.p2);
    state = moveHero(state, "p1", field);
    expect(state.activeEffects).not.toContainEqual(effect);
    expect(
      state.players[NEUTRAL_PLAYER_ID].combatStats.spellsCastThisRound,
    ).toBe(0);
    expect(state.players.p2).toEqual(p2Before);
    state = driveFight(state, ["p1"], 500);
    expect(state.combat).toBeNull();
    expect(state.players.p2).toEqual(p2Before);
    const resumed = parallelStateForPlayer(state, "p2");
    expect(resumed.activeEffects).toContainEqual(effect);
    expect(
      resumed.players[NEUTRAL_PLAYER_ID].combatStats.spellsCastThisRound,
    ).toBe(7);
  });

  it("drives an AI battle while a human battle waits and finds parked AFK work", () => {
    let state = openNeutralFightForP2("parallel-computer");
    state.controllers = {
      ...state.controllers,
      p1: { kind: "computer", difficulty: "standard", policyVersion: 1 },
    };
    const field = emptyFieldNextTo(state, "hero_p1");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p1", field);
    state = parallelStateForPlayer(state, "p2");
    const humanCombat = structuredClone(state.combat);
    expect(computerDecisionOwner(state)).toBe("p1");
    const run = driveComputerPlayers(state, undefined, { maxSteps: 3 });
    expect(run.decisions.length).toBeGreaterThan(0);
    expect(run.decisions).toHaveLength(3);
    expect(run.reason).toBe(
      "Computer runner reached its 3-action safety limit.",
    );
    expect(parallelStateForPlayer(run.state, "p2").combat).toEqual(humanCombat);
    expect(nextAfkDropAction(run.state, "p2")).toMatchObject({
      playerId: "p2",
    });
  });

  it("rejects PvP collapse while another battle is parked", () => {
    const state = openNeutralFightForP2("parallel-pvp-collision");
    const target = emptyFieldNextTo(state, "hero_p1");
    state.heroes.hero_p3.spaceId = target;
    const before = JSON.stringify(state);
    const result = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: target,
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state).toBe(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(state.turn.mode).toBe("parallel");
  });

  it("opens and advances two battles, preserving the other battle and private views", () => {
    let state = makeGame("two-parallel-fights", {
      parallelTurns: 4,
      players: 3,
    });
    const first = emptyFieldNextTo(state, "hero_p1");
    const second = emptyFieldNextTo(state, "hero_p2");
    paintField(state, first, "empty_field", { difficulty: 1 });
    paintField(state, second, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p1", first);
    const firstCombat = structuredClone(state.combat);
    state = moveHero(state, "p2", second);
    expect(state.combat?.attackerPlayerId).toBe("p2");
    expect(parallelStateForPlayer(state, "p1").combat).toEqual(firstCombat);
    expect(state.combat?.id).not.toBe(firstCombat?.id);
    for (const playerId of ["p1", "p2"]) {
      const view = getPlayerView(state, playerId);
      expect(view.combat?.attackerPlayerId).toBe(playerId);
      expect(
        redactStateForSeat(state, playerId).parallelCombats,
      ).toBeUndefined();
      const beforeOther = structuredClone(
        parallelStateForPlayer(state, playerId === "p1" ? "p2" : "p1").combat,
      );
      const ready =
        getLegalActions(state, playerId).find(
          (l) =>
            l.action.type === "ACCEPT_COMBAT" ||
            l.action.type === "FINISH_COMBAT_PLACEMENT",
        ) ?? getLegalActions(state, playerId)[0];
      expect(ready).toBeDefined();
      state = apply(state, ready!.action);
      expect(
        parallelStateForPlayer(state, playerId === "p1" ? "p2" : "p1").combat,
      ).toEqual(beforeOther);
    }
    const p2Battle = structuredClone(
      parallelStateForPlayer(state, "p2").combat,
    );
    state = driveFight(parallelStateForPlayer(state, "p1"), ["p1"], 500);
    expect(parallelStateForPlayer(state, "p1").combat).toBeNull();
    expect(parallelStateForPlayer(state, "p2").combat).toEqual(p2Battle);
    state = driveFight(parallelStateForPlayer(state, "p2"), ["p2"], 500);
    expect(parallelStateForPlayer(state, "p2").combat).toBeNull();
    expect(state.turn.mode).toBe("parallel");
    expect(state.parallelCombats).toBeUndefined();
    for (const playerId of ["p1", "p2", "p3"])
      state = apply(state, { type: "END_TURN", playerId });
    expect(state.round).toBe(2);
  });

  // An eliminated seat can never resume its battle (`parallelStateForPlayer`
  // refuses an eliminated seat) and nothing else deletes a parked context — so
  // before this fix the orphan kept `hasParkedParallelInteractions` true
  // forever: every turn clock stayed paused and `stopParallelTurns` threw on
  // every later PvP crossing / flag steal.
  it("drops an eliminated owner's parked battle instead of orphaning the table", () => {
    let state = openNeutralFightForP2("parallel-eliminate-owner");
    const field = emptyFieldNextTo(state, "hero_p1");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p1", field);
    const orphan = structuredClone(state.parallelCombats!.p2);
    expect(orphan?.combat?.attackerPlayerId).toBe("p2");
    expect(hasParkedParallelInteractions(state)).toBe(true);

    // `eliminatePlayer` is THE chokepoint every removal funnels through (the AFK
    // vote, a give-up, a hero defeat, the no-base elimination clock, the
    // last-alliance check), so driving it directly covers all of them.
    eliminatePlayer(state, "p2", "left the table", false);
    expect(state.parallelCombats?.p2).toBeUndefined();

    // Defensive twin for a SNAPSHOT that already carries such an orphan: a
    // context whose owner is eliminated never counts as parked work.
    state.parallelCombats = { p2: orphan };
    expect(hasParkedParallelInteractions(state)).toBe(false);
    delete state.parallelCombats;

    state = driveFight(state, ["p1"], 500);
    expect(state.combat).toBeNull();
    expect(hasParkedParallelInteractions(state)).toBe(false);
    // The mode can stop again: PvP and flag steals are reachable.
    expect(state.turn.mode).toBe("parallel");
    expect(() =>
      stopParallelTurns(state, "pvp-interaction", "p1", "took a flag"),
    ).not.toThrow();
    expect(state.turn.mode).toBe("ordered");
  });

  it("never declares a custom-condition win while another battle is parked", () => {
    let state = openNeutralFightForP2("parallel-custom-win");
    const preset: CustomMapPreset = {
      ...(state.adventure!.mapPreset ?? {}),
      customWinConditions: [{ kind: "gold", amount: 20 }],
    };
    state.adventure!.mapPreset = preset;
    state.players.p1.resources.gold = 100;
    // A QUIET map step by a bystander: no combat is loaded afterwards, but p2's
    // battle is PARKED — the game must not end out from under it.
    const open = emptyFieldNextTo(state, "hero_p1");
    paintField(state, open, "empty_field");
    state = moveHero(state, "p1", open);
    expect(state.combat).toBeNull();
    expect(hasParkedParallelInteractions(state)).toBe(true);
    expect(state.adventure!.winnerPlayerId).toBeFalsy();

    // Once the parked battle resolves the very same threshold wins.
    state = driveFight(parallelStateForPlayer(state, "p2"), ["p2"], 500);
    expect(state.adventure!.winnerPlayerId).toBe("p1");
  });

  it("routes a neutral CONTROLLER to its own battle first, controlling as the fallback", () => {
    let state = makeGame("parallel-controller-own-battle", {
      parallelTurns: 4,
      players: 3,
      pvpNeutralControl: true,
    });
    const own = emptyFieldNextTo(state, "hero_p3");
    paintField(state, own, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p3", own);
    const p3Battle = structuredClone(state.combat);
    expect(p3Battle?.attackerPlayerId).toBe("p3");
    // FALLBACK 1 — the live-controller pin: p1 drives p3's guards and has no
    // battle of its own, so it stays on the loaded fight.
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p1");
    expect(parallelStateForPlayer(state, "p1")).toBe(state);

    const guard = emptyFieldNextTo(state, "hero_p2");
    paintField(state, guard, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p2", guard);
    const p2Battle = structuredClone(state.combat);
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p3");

    // p3 both CONTROLS the loaded fight and OWNS a parked one: its own fight
    // wins the routing (before the fix it was pinned to the guards forever).
    expect(parallelStateForPlayer(state, "p3").combat?.id).toBe(p3Battle?.id);
    // FALLBACK 2 — the parked-controller search: p1 still reaches the guards it
    // controls in p3's parked battle.
    expect(parallelStateForPlayer(state, "p1").combat?.id).toBe(p3Battle?.id);
    // p2 keeps its own loaded fight either way.
    expect(parallelStateForPlayer(state, "p2").combat?.id).toBe(p2Battle?.id);
  });

  it("CONTROL: ordered turns never park a battle and refuse the second fight", () => {
    let state = makeGame("ordered-no-parallel-contexts", { players: 3 });
    expect(state.turn.mode).toBe("ordered");
    const first = emptyFieldNextTo(state, "hero_p1");
    paintField(state, first, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p1", first);
    expect(state.combat?.attackerPlayerId).toBe("p1");
    expect(state.parallelCombats).toBeUndefined();
    expect(state.parallelCombatOwnerId).toBeUndefined();
    expect(hasParkedParallelInteractions(state)).toBe(false);

    const second = emptyFieldNextTo(state, "hero_p2");
    paintField(state, second, "empty_field", { difficulty: 1 });
    const before = JSON.stringify(state);
    const rejected = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "hero_p2",
      to: second,
    });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.state).toBe(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(state.parallelCombats).toBeUndefined();
    // p1's own second step gets the ordinary refusal, byte-identical routing.
    const ownRejected = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p1",
      heroId: "hero_p1",
      to: second,
    });
    expect(
      ownRejected.errors.map((error) => error.message).join("; "),
    ).toMatch(/Finish the current combat first/);
    expect(state.parallelCombats).toBeUndefined();
  });

  it("keeps rejected actions atomic and survives a serialized snapshot", () => {
    let state = openNeutralFightForP2("parallel-save");
    const snapshot = JSON.stringify(state);
    const rejected = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "wrong",
      defenderId: "wrong",
    });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.state).toBe(state);
    expect(JSON.stringify(state)).toBe(snapshot);
    const field = emptyFieldNextTo(state, "hero_p1");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p1", field);
    state.adventure!.pendingNecromancy = { playerId: "p1", remaining: 1 };
    const restored: GameState = JSON.parse(JSON.stringify(state));
    expect(
      parallelStateForPlayer(restored, "p2").adventure?.pendingNecromancy,
    ).toBeNull();
    expect(
      parallelStateForPlayer(restored, "p1").adventure?.pendingNecromancy
        ?.playerId,
    ).toBe("p1");
    for (const player of ["p1", "p2"]) {
      expect(getLegalActions(restored, player)).toEqual(
        getLegalActions(state, player),
      );
      expect(getPlayerView(restored, player).combat?.attackerPlayerId).toBe(
        player,
      );
    }
  });
});

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(
    result.errors,
    result.errors.map((error) => error.message).join("; "),
  ).toEqual([]);
  return result.state;
}

const THREE_PLAYERS = [
  {
    id: "p1",
    name: "Catherine",
    factionId: "castle" as const,
    heroDefId: "catherine",
  },
  {
    id: "p2",
    name: "Sandro",
    factionId: "necropolis" as const,
    heroDefId: "sandro",
  },
  {
    id: "p3",
    name: "Alamar",
    factionId: "dungeon" as const,
    heroDefId: "alamar",
  },
];

function makeGame(
  seed: string,
  options: {
    parallelTurns?: number;
    players?: 2 | 3;
    pvpNeutralControl?: boolean;
  } = {},
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    ruleset: "binh",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.pvpNeutralControl ? { pvpNeutralControl: true } : {}),
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {}),
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
    .find(
      (candidate) =>
        candidate &&
        candidate.location !== "town" &&
        !used.has(candidate.spaceId),
    );
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

function paintField(
  state: GameState,
  spaceId: string,
  location: string,
  extra: Record<string, unknown> = {},
): void {
  const field = state.adventure!.fields[spaceId] as unknown as Record<
    string,
    unknown
  >;
  field.location = location;
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  Object.assign(field, extra);
}

function moveHero(state: GameState, playerId: PlayerId, to: string): GameState {
  return apply(state, {
    type: "MOVE_HERO",
    playerId,
    heroId: `hero_${playerId}`,
    to,
  });
}

/**
 * Drives an open combat forward as `fighter` (and, in a PvP fight, the other
 * participant) would, preferring to ready up and attack. Stops when the
 * battlefield and every follow-up window are closed.
 */
function driveFight(
  state: GameState,
  participants: PlayerId[],
  steps = 120,
): GameState {
  let current = state;
  for (let i = 0; i < steps; i += 1) {
    if (
      !current.combat &&
      !current.pendingChoice &&
      !current.adventure?.pendingVisit &&
      !current.adventure?.pendingNecromancy
    ) {
      return current;
    }
    let progressed = false;
    for (const participant of participants) {
      const offers = getLegalActions(current, participant);
      const pick =
        offers.find((l) => l.action.type === "PASS_REACTION") ??
        offers.find((l) => l.action.type === "ATTACK_UNIT") ??
        offers.find((l) => l.action.type === "ACKNOWLEDGE_COMBAT_END") ??
        offers.find((l) => l.action.type === "ACCEPT_COMBAT") ??
        offers.find((l) => l.action.type === "FINISH_COMBAT_PLACEMENT") ??
        offers.find(
          (l) =>
            l.action.type !== "RETREAT_FROM_COMBAT" &&
            l.action.type !== "SURRENDER_COMBAT" &&
            l.action.type !== "GIVE_UP" &&
            l.action.type !== "END_TURN",
        );
      if (!pick) continue;
      const result = applyAction(current, pick.action);
      if (result.errors.length > 0) continue;
      current = result.state;
      progressed = true;
      break;
    }
    if (!progressed) return current;
  }
  return current;
}

/** p2 walks onto a difficulty-1 guard field: a NEUTRAL fight opens for p2. */
function openNeutralFightForP2(
  seed: string,
  options: {
    players?: 2 | 3;
    pvpNeutralControl?: boolean;
    difficulty?: number;
  } = {},
): GameState {
  let state = makeGame(seed, {
    parallelTurns: 4,
    players: options.players ?? 3,
    pvpNeutralControl: options.pvpNeutralControl,
  });
  const guard = emptyFieldNextTo(state, "hero_p2");
  paintField(state, guard, "empty_field", {
    difficulty: options.difficulty ?? 1,
  });
  state = moveHero(state, "p2", guard);
  expect(state.combat).toBeTruthy();
  return state;
}
