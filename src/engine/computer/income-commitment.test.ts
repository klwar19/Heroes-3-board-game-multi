import { describe, expect, it, vi } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { applyAction } from "../reducer";
import { getPlayerView } from "../player-view";
import { getLegalActions } from "../legal-actions";
import type { CombatState, CombatUnitState, GameAction, MapTileState } from "../state";
import { chooseComputerAction } from "./policy";
import { primaryMapObjective } from "./map-navigation";
import { emptyComputerMemory, routeProgressKey, repeatsUnproductiveRoute } from "./memory";
import type { ComputerObservation } from "./types";
import * as mapPolicy from "./map-policy";
import { driveComputerPlayers } from "../../server/computer-runner";
import { pickHumanAction } from "../../server/single-player-soak-helpers";

function fixture() {
  const state = createAdventureGameState({ seed: "income-commitment", difficulty: "normal", events: false, rollFirstPlayer: false });
  const hero = Object.values(state.heroes).find(h => h.controllerId === "p2" && h.kind === "main")!;
  state.round = 4;
  state.activePlayerId = "p2";
  state.players.p2.needsHandRefresh = false;
  state.players.p2.canMulligan = false;
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingVisit = null;
  state.adventure!.houseRules = { ...state.adventure!.houseRules, "free-neutral-combat-extend": false, "polish-quick-combat": false };
  hero.spaceId = "h:10:7";
  hero.level = 3;
  hero.movementPoints = 1;
  hero.movementPointsMax = 3;
  for (const unit of state.players.p2.army) unit.side = "pack";
  const template = Object.values(state.adventure!.fields)[0];
  state.adventure!.fields = {};
  state.adventure!.tiles = {};
  state.adventure!.playerFarTiles.p2 = [];
  state.adventure!.farTilePool = [];
  for (const id of ["h:10:5", "h:10:6", "h:10:7", "h:10:8", "h:10:9"]) {
    state.adventure!.fields[id] = { ...template, spaceId: id, tileInstanceId: "income", location: "empty_field", flagOwnerId: null, everFlagged: false, blackCube: false, difficulty: undefined };
  }
  const target = state.adventure!.fields["h:10:6"];
  target.location = "settlement";
  target.difficulty = 3;
  const memory = emptyComputerMemory(4);
  memory.stickyObjectiveSpaceId = target.spaceId;
  const move = (to: string): GameAction => ({ type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to });
  const end: GameAction = { type: "END_TURN", playerId: "p2" };
  const discover: GameAction = { type: "DISCOVER_TILE", playerId: "p2", heroId: hero.id, tileInstanceId: "new-land" };
  const observe = (actions: GameAction[]): ComputerObservation => ({ playerId: "p2", state: getPlayerView(state, "p2"), memory,
    legalActions: actions.map(action => ({ action, label: action.type })) });
  const choose = (...actions: GameAction[]) => chooseComputerAction(observe(actions))!;
  return { state, hero, target, memory, move, end, discover, choose };
}

describe("income commitment regressions", () => {
  it("continues after a casualty when survivors can finish; CONTROL: retreats when the survivors are outmatched", () => {
    const f = fixture();
    const unit = (id: string, owner: string, attack: number, health: number, damage = 0): CombatUnitState => ({
      id, controllerId: owner, attack, defense: 2, maxHealth: health, damage, grade: "bronze", type: "ground",
      name: id, cardName: id, variant: "neutral", initiative: 5, position: 0, abilities: [],
      activatedThisRound: false, movedThisActivation: false, retaliatedThisRound: false, defenseToken: false,
    });
    const dead = unit("lost", "p2", 3, 5, 5);
    const a = unit("a", "p2", 9, 9, 1);
    const b = unit("b", "p2", 9, 9, 1);
    const enemy = unit("enemy", "neutrals", 2, 3);
    f.state.combat = { id: "casualty-control", context: { kind: "neutral", heroId: f.hero.id, fieldId: f.target.spaceId },
      units: { lost: dead, a, b, enemy }, attackerPlayerId: "p2", awaitingContinue: true } as unknown as CombatState;
    const continuation: GameAction = { type: "CONTINUE_NEUTRAL_COMBAT", playerId: "p2" };
    const retreat: GameAction = { type: "RETREAT_FROM_COMBAT", playerId: "p2" };
    expect(f.choose(continuation, retreat).action.type).toBe("CONTINUE_NEUTRAL_COMBAT");
    a.attack = b.attack = 1; a.damage = b.damage = 8;
    enemy.attack = 9; enemy.maxHealth = 20;
    expect(f.choose(continuation, retreat).action.type).toBe("RETREAT_FROM_COMBAT");
  });
  it("a high exploration score cannot excuse an empty repeated return; CONTROL: a real income route can", () => {
    const f = fixture();
    f.memory.routeHistory = [{ heroId: f.hero.id, to: "h:10:8", progress: routeProgressKey(f.state, "p2"), round: 4 }];
    const original = mapPolicy.scoreMapAction;
    vi.spyOn(mapPolicy, "scoreMapAction").mockImplementation((observation, action) =>
      action.type === "MOVE_HERO" ? { score: 720, policy: "map.move-to-objective" } : original(observation, action));
    expect(f.choose(f.move("h:10:8"), f.end).action.type).toBe("END_TURN");
    f.memory.routeHistory[0].to = f.target.spaceId;
    expect(f.choose(f.move(f.target.spaceId), f.end).action.type).toBe("MOVE_HERO");
  });

  it("home leftovers stop overriding income after round 2", () => {
    const f = fixture();
    f.state.players.p2.army = [];
    f.target.difficulty = undefined;
    const town = f.state.adventure!.fields["h:10:9"];
    town.location = "town"; town.flagOwnerId = "p2"; town.tileInstanceId = "home";
    f.state.adventure!.fields[f.hero.spaceId!].tileInstanceId = "home";
    const leftover = f.state.adventure!.fields["h:10:8"];
    leftover.location = "resource_symbol"; leftover.tileInstanceId = "home";
    f.state.adventure!.tiles.income = { id: "income", group: "far", faceDown: false } as MapTileState;
    f.state.round = 2;
    expect(primaryMapObjective(f.state, f.hero)?.spaceId).toBe(leftover.spaceId);
    f.state.round = 3;
    expect(primaryMapObjective(f.state, f.hero)?.spaceId).toBe(f.target.spaceId);
  });

  it("saves the final MP for a known guarded income target instead of another reveal; CONTROL: explores when no capture remains", () => {
    const f = fixture();
    expect(f.choose(f.discover, f.move(f.target.spaceId), f.end).action.type).toBe("END_TURN");
    f.target.flagOwnerId = "p2";
    f.target.everFlagged = true;
    expect(f.choose(f.discover, f.end).action.type).toBe("DISCOVER_TILE");
  });

  it("does not walk back toward home with the reserved attack MP; CONTROL: takes a productive income step", () => {
    const f = fixture();
    f.state.adventure!.fields["h:10:8"].location = "resource_symbol";
    expect(f.choose(f.move("h:10:8"), f.move(f.target.spaceId), f.end).action.type).toBe("END_TURN");
    f.hero.movementPoints = 3;
    expect(f.choose(f.move("h:10:8"), f.move(f.target.spaceId), f.end).action).toEqual(f.move(f.target.spaceId));
  });

  it("the opened-tile movement bonus cannot pull the hero away from a ready income route", () => {
    const f = fixture();
    f.state.round = 3;
    const town = f.state.adventure!.fields["h:10:9"];
    town.location = "town"; town.flagOwnerId = "p2"; town.tileInstanceId = "home";
    f.state.adventure!.fields[f.hero.spaceId!].tileInstanceId = "home";
    f.state.adventure!.fields["h:10:8"].tileInstanceId = "newly-opened";
    f.state.eventLog.push({ type: "TILE_PLACED", playerId: "p2", tileInstanceId: "newly-opened" } as typeof f.state.eventLog[number]);
    expect(f.choose(f.move("h:10:8"), f.move(f.target.spaceId), f.end).action.type).toBe("END_TURN");
    f.hero.movementPoints = 3;
    expect(f.choose(f.move("h:10:8"), f.move(f.target.spaceId), f.end).action).toEqual(f.move(f.target.spaceId));
  });

  it.each(["settlement", "gold", "valuables"] as const)("captures %s in round 4 through legal movement and the reducer, rather than idling into round 5", income => {
    const f = fixture();
    if (income !== "settlement") { f.target.location = "mine"; f.target.resource = income; }
    f.hero.level = 4; // CONTROLLED automatic win: isolate navigation from battle dice.
    const legal = getLegalActions(f.state, "p2").map(entry => entry.action);
    expect(legal).toContainEqual(f.move(f.target.spaceId));
    const decision = f.choose(...legal.filter(action => action.type === "MOVE_HERO" || action.type === "END_TURN"));
    expect(decision.action).toEqual(f.move(f.target.spaceId));
    let result = applyAction(f.state, decision.action);
    expect(result.errors).toEqual([]);
    for (let i = 0; i < 8 && result.state.adventure?.pendingVisit; i++) {
      const pending = result.state;
      const next = chooseComputerAction({ playerId: "p2", state: getPlayerView(pending, "p2"), legalActions: getLegalActions(pending, "p2"), memory: f.memory });
      expect(next).not.toBeNull();
      result = applyAction(pending, next!.action);
      expect(result.errors).toEqual([]);
    }
    expect(result.state.adventure!.fields[f.target.spaceId].flagOwnerId).toBe("p2");
    expect(result.state.round).toBe(4);
  });

  it("reveals and passive income do not erase an empty route, but an actual capture does", () => {
    const f = fixture();
    f.memory.routeHistory = [{ heroId: f.hero.id, to: "h:10:8", progress: routeProgressKey(f.state, "p2"), round: 2 }];
    f.state.adventure!.tiles.revealed = { id: "revealed", group: "far", faceDown: false } as MapTileState;
    f.state.players.p2.resources.gold += 10;
    expect(repeatsUnproductiveRoute(f.state, "p2", f.move("h:10:8"), f.memory)).toBe(true);
    f.target.flagOwnerId = "p2";
    expect(repeatsUnproductiveRoute(f.state, "p2", f.move("h:10:8"), f.memory)).toBe(false);
  });

  it("keeps a missing-income commitment even when another capture becomes one turn earlier", () => {
    const f = fixture();
    f.state.round = 5;
    f.state.adventure!.tiles.income = { id: "income", group: "far", faceDown: false } as MapTileState;
    f.target.location = "empty_field";
    f.target.difficulty = undefined;
    const distant = f.state.adventure!.fields["h:10:5"];
    distant.location = "settlement";
    const nearby = f.state.adventure!.fields["h:10:8"];
    nearby.location = "mine"; nearby.resource = "gold";
    expect(primaryMapObjective(f.state, f.hero, undefined, distant.spaceId)?.spaceId).toBe(distant.spaceId);
    // CONTROL: no commitment chooses the immediately attainable income.
    expect(primaryMapObjective(f.state, f.hero)?.spaceId).toBe(nearby.spaceId);
  });
});

describe("Fortress opening through the authoritative computer runner", () => {
  it.each(["normal", "impossible"] as const)("secures FAR income before round 5 on %s", difficulty => {
    let state = createAdventureGameState({ seed: "income-fortress-opening", difficulty, events: false, rollFirstPlayer: false,
      houseRules: { "free-neutral-combat-extend": false, "polish-quick-combat": false },
      sessionMode: "single-player", controllers: { p1: { kind: "human" }, p2: { kind: "computer", difficulty: "standard", policyVersion: 1 } },
      players: [{ id: "p1", name: "Human", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Gerwulf", factionId: "fortress", heroDefId: "gerwulf" }] });
    // Exhaust single-player smoothing before play: every equal-level guard
    // must be fought, including the home guards. No free opening victories.
    state.computerGuaranteedWins = { p2: 2 };
    const trail: string[] = [];
    let capturedRound: number | undefined;
    let capturedField: string | undefined;
    for (let step = 0; step < 1500 && state.round < 5 && !(state.phase === "game-over" && !state.combat); step++) {
      const run = driveComputerPlayers(state, undefined, { maxSteps: 1 });
      state = run.state;
      for (const decision of run.decisions) trail.push(`R${state.round} ${decision.action.type} ${decision.policy} ${JSON.stringify(decision.action)}`);
      const income = Object.values(state.adventure!.fields).find(field => field.flagOwnerId === "p2" &&
        state.adventure!.tiles[field.tileInstanceId]?.group === "far" &&
        (field.location === "settlement" || (field.location === "mine" && (field.resource === "gold" || field.resource === "valuables"))));
      if (income) { capturedRound = state.round; capturedField = income.spaceId; break; }
      if (!run.decisions.length) {
        const action = pickHumanAction(state);
        expect(action, trail.slice(-20).join("\n")).not.toBeNull();
        trail.push(`R${state.round} HUMAN ${JSON.stringify(action)} phase=${state.phase}`);
        const result = applyAction(state, action!);
        expect(result.errors).toEqual([]);
        state = result.state;
      }
    }
    console.log(JSON.stringify({ difficulty, capturedRound, capturedField, actions: trail.length,
      foughtIncome: state.eventLog.some(event => event.type === "NEUTRAL_COMBAT_STARTED" && event.fieldId === capturedField),
      continuations: state.eventLog.filter(event => event.type === "COMBAT_CONTINUED").length,
      casualties: state.eventLog.filter(event => event.type === "UNIT_REMOVED" && event.playerId === "p2").length,
    }));
    expect(state.eventLog.some(event => event.type === "COMPUTER_GUARANTEED_WIN")).toBe(false);
    expect(capturedRound, trail.slice(-40).join("\n")).toBeDefined();
    expect(capturedRound).toBeLessThan(5);
    expect(state.eventLog.some(event => event.type === "NEUTRAL_COMBAT_STARTED" && event.fieldId === capturedField)).toBe(true);
    expect(state.eventLog.some(event => event.type === "UNIT_REMOVED" && event.playerId === "p2")).toBe(true);
    if (difficulty === "impossible") {
      expect(state.eventLog.some(event => event.type === "COMBAT_CONTINUED")).toBe(true);
    }
  }, 120000);
});
