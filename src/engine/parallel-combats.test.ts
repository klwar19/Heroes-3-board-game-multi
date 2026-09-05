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
  parallelContextOptions,
  parallelStateForPlayer,
  settleParallelCombatContext,
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
import { nextAfkDropAction, nextTurnTimeoutAction } from "./afk-drop";
import { getAfkState, turnClockPausedFor } from "./afk";
import { clearPolishArtifactAccess, polishArtifactDeckAllowed } from "./polish-random-artifacts";

describe("independent parallel battles", () => {
  it("lets a player who ended their adventure turn still command an assigned neutral army", () => {
    let state = makeGame("parallel-ended-controller", { parallelTurns: 4, players: 3, pvpNeutralControl: true });
    const field = emptyFieldNextTo(state, "hero_p3");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p3", field);
    for (let step = 0; step < 30 && !state.combat?.pendingNeutralPlacement; step++) state = driveFight(state, ["p3"], 1);
    expect(state.combat?.pendingNeutralPlacement).toBe("p1");
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.turn.completedPlayerIds).toContain("p1");
    expect(state.round).toBe(1);
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p3" });
    state = apply(state, { type: "FINISH_NEUTRAL_PLACEMENT", playerId: "p1" });
    expect(parallelStateForPlayer(state, "p1").combat?.pendingNeutralPlacement).toBeNull();
    expect(state.turn.completedPlayerIds).toContain("p1");
    expect(state.round).toBe(1);
  });

  it("disables parallel in single-player while preserving human control of the player's guards", () => {
    let state = createAdventureGameState({ seed: "solo-parallel-disabled", sessionMode: "single-player", computerOpponents: 1,
      parallelTurns: 4, manualGuardControl: true, pvpNeutralControl: true, rollFirstPlayer: false, events: false });
    expect(state.turn.mode).toBe("ordered");
    expect(state.adventure?.manualGuardControl).toBe(true);
    expect(state.adventure?.pvpNeutralControl).toBe(true);
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    const field = emptyFieldNextTo(state, "hero_p1");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p1", field);
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p1");
    expect(parallelContextOptions(state, "p1")).toEqual([]);
  });

  it("returns cards held by an eliminated player's parked search without clearing another player's choice", () => {
    let state = makeGame("parallel-eliminated-search", { parallelTurns: 4, players: 3 });
    state = parallelStateForPlayer(state, "p1");
    const deckId = Object.keys(state.decks).find(id => state.decks[id].drawPile.length > 2)!;
    const first = state.decks[deckId].drawPile.pop()!;
    state.pendingChoice = { id: "p1-search", type: "DECK_SEARCH", playerId: "p1", deckId, revealedCardIds: [first], returnPhase: "player-turn" };
    state.phase = "choice";
    state = parallelStateForPlayer(state, "p2");
    const second = state.decks[deckId].drawPile.pop()!;
    state.pendingChoice = { id: "p2-search", type: "DECK_SEARCH", playerId: "p2", deckId, revealedCardIds: [second], returnPhase: "player-turn" };
    state.phase = "choice";
    const otherChoice = structuredClone(state.pendingChoice);
    const discardCount = state.decks[deckId].discardPile.length;
    eliminatePlayer(state, "p1", "left while searching", false);
    expect(state.decks[deckId].discardPile.slice(discardCount)).toEqual([first]);
    expect(state.pendingChoice).toEqual(otherChoice);
    expect(state.phase).toBe("choice");
    expect(state.parallelCombats?.p1).toBeUndefined();
  });

  it("keeps forced turn resolution on the owner's turn and reassigns a departed neutral controller", () => {
    let state = makeGame("parallel-departed-controller", { parallelTurns: 4, players: 3, pvpNeutralControl: true });
    const field = emptyFieldNextTo(state, "hero_p3");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p3", field);
    for (let step = 0; step < 30 && !state.combat?.pendingNeutralPlacement; step++) {
      state = driveFight(state, ["p3"], 1);
    }
    expect(parallelStateForPlayer(state, "p3", "p3").combat?.pendingNeutralPlacement).toBe("p1");
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p3" });
    const battle = structuredClone(parallelStateForPlayer(state, "p3", "p3").combat);
    expect(turnClockPausedFor(state, "p1")).toBe(false);
    getAfkState(state).turnTimeoutPlayerId = "p1";
    expect(parallelStateForPlayer(state, "p1").combat).toBeNull();
    expect(nextTurnTimeoutAction(state, "p1")).toEqual({ type: "RESOLVE_TURN_TIMEOUT", playerId: "p1" });
    state.afk!.turnTimeoutPlayerId = null;
    state.afk!.droppingPlayerId = "p1";
    expect(nextAfkDropAction(state, "p1")).toEqual({ type: "RESOLVE_AFK_DROP", playerId: "p1" });
    state = parallelStateForPlayer(state, "p1");
    expect(state.parallelCombats?.p3.combat).toEqual(battle);
    // The controller left while the formation prompt was parked.
    eliminatePlayer(state, "p1", "left the game", false);
    settleParallelCombatContext(state);
    const reassigned = parallelStateForPlayer(state, "p3", "p3");
    expect(neutralCombatControllerId(reassigned, reassigned.combat!)).toBe("p2");
    expect(reassigned.combat?.pendingNeutralPlacement).toBe("p2");
    expect(state.parallelContextSelections?.p1).toBeUndefined();
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p2", ownerPlayerId: "p3" });
    expect(getLegalActions(state, "p2").some(l => l.action.type === "FINISH_NEUTRAL_PLACEMENT")).toBe(true);
  });

  it("returns a viewer home after a controlled battle closes instead of selecting a future battle", () => {
    let state = makeGame("parallel-finished-selection", { parallelTurns: 4, players: 3, pvpNeutralControl: true });
    const field = emptyFieldNextTo(state, "hero_p3");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p3", field);
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p3" });
    state = parallelStateForPlayer(state, "p3", "p3");
    state.combat = null;
    settleParallelCombatContext(state);
    expect(state.parallelContextSelections?.p1).toBeUndefined();
    expect(parallelStateForPlayer(state, "p1").combat).toBeNull();
  });

  it.each(["clash", "coop"] as const)("offers human-controlled computer battles alongside the human's own battle in %s", (mode) => {
    let state = makeGame(`parallel-computer-${mode}`, { parallelTurns: 4, players: 3, pvpNeutralControl: true });
    if (mode === "coop") state.gameMode = "coop";
    state.controllers = { p3: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    state.playerTeams = { p1: "allies", p2: "allies", p3: mode === "coop" ? "enemies" : "allies" };
    for (const id of ["p1", "p3"]) {
      const field = emptyFieldNextTo(state, `hero_${id}`);
      paintField(state, field, "empty_field", { difficulty: 1 });
      state = moveHero(state, id, field);
    }
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p1");
    const ownBattle = structuredClone(parallelStateForPlayer(state, "p1", "p1").combat);
    const run = driveComputerPlayers(state, undefined, { maxSteps: 80 });
    expect(run.stalled).toBe(false);
    state = run.state;
    const option = parallelContextOptions(state, "p1").find(o => o.ownerPlayerId === "p3");
    expect(option?.role).toBe("neutrals");
    expect(option?.needsInput).toBe(true);
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p3" });
    const selected = parallelStateForPlayer(state, "p1");
    expect(selected.combat?.attackerPlayerId).toBe("p3");
    expect(getLegalActions(state, "p1").some(l => l.action.type === "FINISH_NEUTRAL_PLACEMENT")).toBe(true);
    expect(parallelStateForPlayer(state, "p1", "p1").combat).toEqual(ownBattle);
    expect(state.turn.mode).toBe("parallel");
  });

  it("rejects another seat's battle and delayed commands, and sends only the selected private view", () => {
    let state = makeGame("parallel-switch-security", { parallelTurns: 4, players: 3, pvpNeutralControl: true });
    for (const id of ["p1", "p2", "p3"]) {
      const field = emptyFieldNextTo(state, `hero_${id}`);
      paintField(state, field, "empty_field", { difficulty: 1 });
      state = moveHero(state, id, field);
    }
    const invalid = applyAction(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p2" });
    expect(invalid.errors.length).toBeGreaterThan(0);
    expect(invalid.state).toBe(state);
    const own = parallelStateForPlayer(state, "p1");
    const oldAction = getLegalActions(state, "p1").find(l => l.action.type !== "SELECT_PARALLEL_CONTEXT")!.action;
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p1", ownerPlayerId: "p3" });
    const delayed = applyAction(state, { ...oldAction, parallelContextId: own.combat!.id });
    expect(delayed.errors[0]?.message).toMatch(/battle changed/);
    expect(delayed.state).toBe(state);
    const view = redactStateForSeat(state, "p1");
    expect(view.combat?.attackerPlayerId).toBe("p3");
    expect(view.parallelCombats).toBeUndefined();
    expect(view.players.p3.hand.every(card => card === "hidden")).toBe(true);
    expect(view.parallelContextSelections).toEqual({ p1: "p3" });
    expect(view.parallelContextOptions?.map(o => o.ownerPlayerId).sort()).toEqual(["p1", "p3"]);
    expect(parallelStateForPlayer(view, "p1").combat?.id).toBe(view.combat?.id);
    expect(parallelStateForPlayer(state, "p2").combat?.attackerPlayerId).toBe("p2");
  });
  it.each([
    { count: 2, mode: "clash", mixed: false },
    { count: 3, mode: "clash", mixed: false },
    { count: 4, mode: "clash", mixed: false },
    { count: 5, mode: "clash", mixed: false },
    { count: 6, mode: "clash", mixed: false },
    { count: 5, mode: "clash", mixed: true },
    { count: 5, mode: "coop", mixed: true },
  ] as const)("finishes $count battles with independent switching ($mode, computers: $mixed)", ({ count, mode, mixed }) => {
    let state = createAdventureGameState({ seed: `parallel-human-${count}`, parallelTurns: 4, pvpNeutralControl: true,
      rollFirstPlayer: false, events: false, players: Array.from({ length: count }, (_, i) => ({
        ...THREE_PLAYERS[i % THREE_PLAYERS.length], id: `p${i + 1}`, name: `Player ${i + 1}`,
      })) });
    const seats = state.turnOrder.filter(id => id !== NEUTRAL_PLAYER_ID);
    expect(seats).toHaveLength(count);
    if (mixed) {
      // GameState.gameMode is "coop" or ABSENT (absent = clash, the documented reading).
      if (mode === "coop") state.gameMode = mode;
      state.controllers = Object.fromEntries(seats.slice(2).map(id => [id, { kind: "computer", difficulty: "standard", policyVersion: 1 } as const]));
      state.playerTeams = Object.fromEntries(seats.map((id, index) => [id, index < 2 ? "humans" : "computers"]));
    }
    for (const id of seats) {
      state.players[id].canMulligan = false;
      state.players[id].needsHandRefresh = false;
      state.players[id].hand = [];
      const field = emptyFieldNextTo(state, `hero_${id}`);
      paintField(state, field, "empty_field", { difficulty: 1 });
      state = moveHero(state, id, field);
    }
    expect(state.turn.mode).toBe("parallel");
    if (mixed) {
      expect(parallelContextOptions(state, "p1").map(option => option.ownerPlayerId)).toEqual(expect.arrayContaining(["p1", "p2", "p3", "p4", "p5"]));
      expect(parallelContextOptions(state, "p2").map(option => option.ownerPlayerId)).toEqual(expect.arrayContaining(["p2", "p1"]));
      for (const id of seats.slice(2)) expect(parallelContextOptions(state, id)).toHaveLength(1);
    } else {
      for (const id of seats) expect(parallelContextOptions(state, id)).toHaveLength(2);
    }
    let steps = 0;
    for (; steps < 800; steps++) {
      let progressed = false;
      for (const id of seats) {
        for (const option of parallelContextOptions(state, id)) {
          if ((parallelStateForPlayer(state, id).parallelCombatOwnerId ?? id) !== option.ownerPlayerId)
            state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: id, ownerPlayerId: option.ownerPlayerId });
          const selected = parallelStateForPlayer(state, id);
          if (!selected.combat && !selected.pendingChoice && !selected.adventure?.pendingVisit && !selected.adventure?.pendingNecromancy) continue;
          const before = new Map(seats.filter(seat => seat !== option.ownerPlayerId).map(seat => [seat, structuredClone(parallelStateForPlayer(state, seat, seat).combat)]));
          const action = getLegalActions(state, id).find(l => ["PASS_REACTION", "ATTACK_UNIT", "ACKNOWLEDGE_COMBAT_END", "ACCEPT_COMBAT", "FINISH_COMBAT_PLACEMENT", "FINISH_NEUTRAL_PLACEMENT", "FINISH_COMMANDER_PLACEMENT"].includes(l.action.type)) ??
            getLegalActions(state, id).find(l => !["SELECT_PARALLEL_CONTEXT", "END_TURN", "GIVE_UP", "RETREAT_FROM_COMBAT", "SURRENDER_COMBAT", "MOVE_HERO"].includes(l.action.type));
          if (!action) continue;
          const next = apply(state, { ...action.action, parallelContextId: selected.combat?.id ?? `map:${option.ownerPlayerId}` });
          for (const [seat, battle] of before) expect(parallelStateForPlayer(next, seat, seat).combat).toEqual(battle);
          state = JSON.parse(JSON.stringify(next));
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    expect(steps).toBeLessThan(800);
    for (const id of seats) expect(parallelStateForPlayer(state, id, id).combat).toBeNull();
    expect(state.turn.mode).toBe("parallel");
    for (const [index, id] of seats.entries()) {
      state = apply(state, { type: "END_TURN", playerId: id });
      expect(state.round).toBe(index === seats.length - 1 ? 2 : 1);
    }
  }, 60000);
  it("teleports between the actor's holdings while another player's battle remains intact", () => {
    const state = openNeutralFightForP2("parallel-own-teleport");
    Object.values(state.towns).find(t => t.controllerId === "p1")!.buildings.push("inferno.castle_gate");
    const destination = emptyFieldNextTo(state, "hero_p1");
    paintField(state, destination, "settlement", { flagOwnerId: "p1", settlementResource: "gold" });
    const before = structuredClone(state.combat);
    const action = getLegalActions(state, "p1").find(l => l.action.type === "USE_TOWN_BUILDING" && l.action.buildingId === "inferno.castle_gate" && l.action.optionIndex === 1 && l.action.spaceId === destination);
    expect(action).toBeDefined();
    const next = apply(state, action!.action);
    expect(next.heroes.hero_p1.spaceId).toBe(destination);
    expect(next.turn.mode).toBe("parallel");
    expect(parallelStateForPlayer(next, "p2").combat).toEqual(before);
  });
  it("still presents the winner's card reward after the combat has closed", () => {
    const state = openNeutralFightForP2("parallel-final-reward");
    const reward = appendEvent(state, { type: "CARDS_DRAWN", playerId: "p2", count: 1, cardIds: ["ability.sorcery"] });
    expect(reward.combatContextId).toBe(state.combat?.id);
    state.combat = null;
    expect(parallelPresentationEvents(state, [reward], "p2")).toEqual([reward]);
    expect(parallelPresentationEvents(state, [reward], "p1")).toEqual([]);
  });
  it("pauses the fighter's map clock without resetting another player's independent turn", () => {
    const state = openNeutralFightForP2("parallel-clocks");
    expect(turnClockPausedFor(state, "p2")).toBe(true);
    expect(turnClockPausedFor(state, "p1")).toBe(false);
    expect(turnClockPausedFor(parallelStateForPlayer(state, "p1"), "p2")).toBe(true);
  });
  it("stops parallel play for an opponent discard and rejects it atomically while another battle waits", () => {
    const state = makeGame("parallel-player-impact", { parallelTurns: 4, players: 3 });
    Object.values(state.towns).find(t => t.controllerId === "p1")!.buildings.push("inferno.castle_gate");
    state.players.p1.resources.gold = 50;
    state.players.p2.hand = ["ability.sorcery"];
    const action: GameAction = { type: "USE_TOWN_BUILDING", playerId: "p1", buildingId: "inferno.castle_gate", optionIndex: 0, targetPlayerId: "p2" };
    const stopped = apply(state, action);
    expect(stopped.players.p2.hand).toEqual([]);
    expect(stopped.turn.mode).toBe("ordered");
    expect(stopped.activePlayerId).toBe("p1");
    expect(stopped.eventLog.some(e => e.type === "PARALLEL_TURNS_STOPPED" && e.reason === "pvp-interaction")).toBe(true);

    const field = emptyFieldNextTo(state, "hero_p3");
    paintField(state, field, "empty_field", { difficulty: 1 });
    const fighting = moveHero(state, "p3", field);
    const snapshot = JSON.stringify(fighting);
    const rejected = applyAction(fighting, action);
    expect(rejected.errors[0]?.message).toMatch(/wait until/);
    expect(rejected.state).toBe(fighting);
    expect(JSON.stringify(fighting)).toBe(snapshot);
  });

  it("keeps artifact eligibility and its die with the acquisition that owns them", () => {
    let state = openNeutralFightForP2("parallel-artifact-access");
    state.adventure!.houseRules = { ...state.adventure!.houseRules, "polish-random-artifacts": true };
    state.adventure!.polishArtifactAccess = { minor: true, major: false, relic: false };
    state.adventure!.polishRandomArtifactDie = -1;
    const field = emptyFieldNextTo(state, "hero_p1");
    paintField(state, field, "settlement");
    state = moveHero(state, "p1", field);
    expect(state.adventure?.polishArtifactAccess).toBeNull();
    state.adventure!.polishArtifactAccess = { minor: false, major: false, relic: true };
    state.adventure!.polishRandomArtifactDie = 1;
    state = JSON.parse(JSON.stringify(state));
    const p2 = parallelStateForPlayer(state, "p2");
    expect(polishArtifactDeckAllowed(p2, "artifacts-relic")).toBe(false);
    expect(polishArtifactDeckAllowed(p2, "artifacts-minor")).toBe(true);
    expect(p2.adventure?.polishRandomArtifactDie).toBe(-1);
    clearPolishArtifactAccess(p2);
    const p1 = parallelStateForPlayer(p2, "p1");
    expect(polishArtifactDeckAllowed(p1, "artifacts-relic")).toBe(true);
    expect(polishArtifactDeckAllowed(p1, "artifacts-minor")).toBe(false);
    expect(p1.adventure?.polishRandomArtifactDie).toBe(1);
  });

  it("opens each player's map choice immediately and preserves it across other choices and battles", () => {
    let state = makeGame("parallel-map-choices", { parallelTurns: 4, players: 3 });
    for (const id of ["p1", "p2"]) state.players[id].hand = ["spell.view_air", "ability.sorcery"];
    for (const id of ["p1", "p2"]) {
      const play = getLegalActions(state, id).find(l => l.action.type === "PLAY_CARD" && l.action.cardId === "spell.view_air");
      expect(play).toBeDefined();
      state = apply(state, play!.action);
      expect(getPlayerView(state, id).pendingChoice?.playerId).toBe(id);
    }
    const choices = ["p1", "p2"].map(id => structuredClone(getPlayerView(state, id).pendingChoice));
    const field = emptyFieldNextTo(state, "hero_p3");
    paintField(state, field, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p3", field);
    state = JSON.parse(JSON.stringify(state));
    for (const [i, id] of ["p1", "p2"].entries()) {
      expect(getPlayerView(state, id).pendingChoice).toEqual(choices[i]);
      expect(getPlayerView(state, id).combat).toBeNull();
      const commit = getLegalActions(state, id).find(l => /Commit Power/.test(l.label));
      expect(commit).toBeDefined();
      state = apply(state, commit!.action);
      state = apply(state, { type: "END_TURN", playerId: id });
      expect(state.round).toBe(1);
    }
    state = driveFight(parallelStateForPlayer(state, "p3"), ["p3"], 500);
    expect(state.combat).toBeNull();
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.round).toBe(2);
    expect(state.parallelCombatOwnerId).toBeUndefined();
  });

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

  it("switches a controller between its own battle and another player's neutral army", () => {
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
    expect(state.turn.mode).toBe("parallel");
    // FALLBACK 1 — the live-controller pin: p1 drives p3's guards and has no
    // battle of its own, so it stays on the loaded fight.
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p1");
    expect(parallelStateForPlayer(state, "p1").combat).toBeNull();

    const guard = emptyFieldNextTo(state, "hero_p2");
    paintField(state, guard, "empty_field", { difficulty: 1 });
    state = moveHero(state, "p2", guard);
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p2" });
    expect(parallelStateForPlayer(state, "p3").combat?.attackerPlayerId).toBe("p2");
    state = apply(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p3" });
    expect(parallelStateForPlayer(state, "p3").combat).toEqual(p3Battle);
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
        offers.find((l) => l.action.type === "FINISH_NEUTRAL_PLACEMENT") ??
        offers.find((l) => l.action.type === "FINISH_COMMANDER_PLACEMENT") ??
        offers.find(
          (l) =>
            l.action.type !== "RETREAT_FROM_COMBAT" &&
            l.action.type !== "SURRENDER_COMBAT" &&
            l.action.type !== "GIVE_UP" &&
            l.action.type !== "SELECT_PARALLEL_CONTEXT" &&
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
