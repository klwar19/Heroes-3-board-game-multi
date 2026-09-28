import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { addArmyUnit } from "../adventure";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import type { CombatState, GameAction, GameState } from "../state";
import { controlledBuildingCount } from "../victory-points";
import { scoreMapAction } from "./map-policy";
import { scoreCombatAction } from "./combat-policy";
import { shouldEngageEnemy } from "./army-strength";
import { chooseComputerAction } from "./policy";
import { getComputerMemory } from "./memory";
import type { ComputerObservation } from "./types";
import { VP_PROTECT_LEAD_MARGIN, VP_TAKE_LEAD_DISCOUNT, vpEngageBarShift, vpLead, vpRoundsLeft } from "./vp-plan";

// Victory Points mode (victory-points.ts): the most VP at the round-limit
// wrap wins. Each rule is checked against a CONTROL outside VP mode or
// outside the endgame, where the pre-VP behaviour must stand.

const ROUND_LIMIT = 12;

function gameState(vp: boolean, round = ROUND_LIMIT): GameState {
  const state = createAdventureGameState({
    seed: "vp-endgame", difficulty: "impossible", events: false, rollFirstPlayer: false,
    ...(vp ? { victoryPoints: true, victoryPointsRoundLimit: ROUND_LIMIT } : {}),
  });
  state.round = round;
  state.activePlayerId = "p1";
  return state;
}

function observe(state: GameState, playerId: string, legal: GameAction[] = []): ComputerObservation {
  return {
    playerId, state: state as unknown as ComputerObservation["state"],
    legalActions: legal.map(action => ({ label: action.type, action })),
    memory: getComputerMemory(state, playerId),
  };
}

function mainHero(state: GameState, playerId: string) {
  return Object.values(state.heroes).find(hero => hero.controllerId === playerId && hero.kind === "main")!;
}

/** p1's (Castle) unbuilt Blacksmith — an optional, non-dwelling building — and its build action. */
function buildAction(state: GameState): Extract<GameAction, { type: "BUILD_STRUCTURE" }> {
  const town = Object.values(state.towns).find(candidate => candidate.controllerId === "p1")!;
  const buildingId = coreFactionDefinitions[state.players.p1.factionId!].buildings.find(id =>
    !town.buildings.includes(id) && coreBuildingDefinitions[id]?.effect?.type === "ARTIFACT_SMITH")!;
  expect(buildingId, "Castle has an unbuilt Blacksmith").toBeTruthy();
  state.players.p1.resources = { gold: 40, buildingMaterials: 20, valuables: 10 };
  return { type: "BUILD_STRUCTURE", playerId: "p1", townId: town.id, buildingId };
}

/** Give p1 a lead of exactly `lead` VP through surrendered-hero points
 * (1 VP each), which change nothing else about either army or hero. */
function setLead(state: GameState, lead: number) {
  const ledger = (state.adventure!.vpLedger ??= {});
  ledger.p1 = { ...ledger.p1, surrenders: 0 };
  ledger.p2 = { ...ledger.p2, surrenders: 0 };
  const delta = lead - vpLead(state, "p1", "p2")!;
  if (delta >= 0) ledger.p1.surrenders = delta;
  else ledger.p2.surrenders = -delta;
  expect(vpLead(state, "p1", "p2")).toBe(lead);
}

function setArmy(state: GameState, playerId: string, units: Array<[string, "few" | "pack"]>) {
  const player = state.players[playerId];
  player.army = [];
  player.hand = [];
  for (const [unitDefId, side] of units) addArmyUnit(player, unitDefId, side);
}

describe("computer Victory Points endgame", () => {
  it("knows how many rounds are left only when VP mode ends the game on a round", () => {
    expect(vpRoundsLeft(gameState(true, 10))).toBe(2);
    expect(vpRoundsLeft(gameState(true, ROUND_LIMIT))).toBe(0);
    expect(vpRoundsLeft(gameState(false, 10))).toBeNull();
  });

  it("spends the last rounds' build token on a building (1 VP) — not before the endgame, not outside VP mode, not past the cap", () => {
    const vp = gameState(true);
    const endgame = scoreMapAction(observe(vp, "p1"), buildAction(vp))!.score;
    expect(endgame).toBeGreaterThanOrEqual(975);

    // CONTROL: the same build without VP scoring keeps its development score.
    const plain = gameState(false);
    const normal = scoreMapAction(observe(plain, "p1"), buildAction(plain))!.score;
    expect(normal).toBeLessThan(975);

    // CONTROL: four rounds before the scoring the development plan decides.
    const early = gameState(true, ROUND_LIMIT - 4);
    const earlyPlain = gameState(false, ROUND_LIMIT - 4);
    expect(scoreMapAction(observe(early, "p1"), buildAction(early))!.score)
      .toBe(scoreMapAction(observe(earlyPlain, "p1"), buildAction(earlyPlain))!.score);

    // CONTROL: the Towns p1 controls already hold the 8-building VP maximum
    // (its own Town plus p2's, flagged by p1).
    const capped = gameState(true);
    const action = buildAction(capped);
    const rivalTown = Object.values(capped.towns).find(candidate => candidate.controllerId === "p2")!;
    capped.adventure!.fields[rivalTown.fieldId!].flagOwnerId = "p1";
    capped.towns[action.townId].buildings.push("castle.city_hall", "castle.dwelling_silver");
    expect(controlledBuildingCount(capped, "p1")).toBeGreaterThanOrEqual(8);
    expect(scoreMapAction(observe(capped, "p1"), action)!.score).toBeLessThan(975);
  });

  it("shifts the PvP bar by what the 3-VP Main Hero defeat does to the lead in the last two rounds", () => {
    const state = gameState(true);
    setLead(state, 2);
    expect(vpEngageBarShift(state, "p1", "p2")).toBe(VP_PROTECT_LEAD_MARGIN);
    setLead(state, 5);
    expect(vpEngageBarShift(state, "p1", "p2")).toBe(0);
    setLead(state, -2);
    expect(vpEngageBarShift(state, "p1", "p2")).toBe(-VP_TAKE_LEAD_DISCOUNT);
    setLead(state, -5);
    expect(vpEngageBarShift(state, "p1", "p2")).toBe(0);

    // CONTROL: p2 already scored our Main Hero once (its 3 VP are in the
    // lead) — a loss gives it nothing more.
    state.adventure!.vpLedger = { p2: { mainHeroDefeats: ["p1"] } };
    setLead(state, 2);
    expect(state.adventure!.vpLedger.p2.mainHeroDefeats).toEqual(["p1"]);
    expect(vpEngageBarShift(state, "p1", "p2")).toBe(0);

    // CONTROL: three rounds before the scoring, and outside VP mode.
    const early = gameState(true, ROUND_LIMIT - 3);
    setLead(early, 2);
    expect(vpEngageBarShift(early, "p1", "p2")).toBe(0);
    expect(vpEngageBarShift(gameState(false), "p1", "p2")).toBe(0);
  });

  it("the VP endgame bar decides close Main Hero fights", () => {
    // Forecasts (no cards on either side): ~0.50 vs Liches + Zombies, ~0.33 vs
    // Liches + Wraiths Pack. USER RULING (2026-09-28): the normal duel bar is the
    // coin flip (0.45), so the ~0.50 fight is the normal-bar CONTROL and the VP
    // margins (+0.2 / -0.15) apply on top of it (the ~0.67 fixture this test
    // used under the old 0.55 bar clears 0.45 + 0.2 and no longer discriminates).
    const coinFlip: Array<[string, "few" | "pack"]> = [["necropolis.liches", "few"], ["necropolis.zombies", "pack"]];
    const behind: Array<[string, "few" | "pack"]> = [["necropolis.liches", "few"], ["necropolis.wraiths", "pack"]];
    const engage = (vp: boolean, lead: number | null, foe: Array<[string, "few" | "pack"]>) => {
      const state = gameState(vp);
      setArmy(state, "p1", [["castle.griffins", "pack"], ["castle.marksmen", "pack"]]);
      setArmy(state, "p2", foe);
      if (lead !== null) setLead(state, lead);
      return shouldEngageEnemy(state, "p1", "p2");
    };
    expect(engage(false, null, coinFlip), "CONTROL: a ~50% fight clears the normal (coin-flip) bar").toBe(true);
    expect(engage(true, 2, coinFlip), "a loss would hand over a 2-VP lead").toBe(false);
    expect(engage(true, 5, coinFlip), "a loss cannot flip a 5-VP lead").toBe(true);
    expect(engage(false, null, behind), "CONTROL: a ~33% fight stays under the normal bar").toBe(false);
    expect(engage(true, -2, behind), "a win takes the lead from 2 VP behind").toBe(true);
  });

  it("leaves a hopeless PvP fight by Surrender (1 VP) instead of Retreat (3 VP) while the Main Hero defeat is still open", () => {
    const setup = (vp: boolean) => {
      const state = gameState(vp, 10);
      const own = state.players.p1;
      own.army = [];
      for (const id of ["castle.halberdiers", "castle.marksmen", "castle.griffins"]) addArmyUnit(own, id, "few");
      own.resources.gold = 20;
      const enemy = state.players.p2;
      enemy.army = [];
      for (const id of ["castle.archangels", "castle.champions", "castle.crusaders", "castle.zealots"]) addArmyUnit(enemy, id, "pack");
      state.combat = {
        id: "combat_vp", round: 1, attackerPlayerId: "p2", defenderPlayerId: "p1", activeUnitId: null, units: {},
        context: { kind: "player", attackerHeroId: mainHero(state, "p2").id, defenderHeroId: mainHero(state, "p1").id, fieldId: mainHero(state, "p1").spaceId! },
      } as unknown as CombatState;
      return state;
    };
    const retreat: GameAction = { type: "RETREAT_FROM_COMBAT", playerId: "p1" };
    const surrender: GameAction = { type: "SURRENDER_COMBAT", playerId: "p1" };
    const scores = (state: GameState) => {
      const observation = observe(state, "p1", [retreat, surrender]);
      return { retreat: scoreCombatAction(observation, retreat)!, surrender: scoreCombatAction(observation, surrender)! };
    };

    const vp = scores(setup(true));
    expect(vp.surrender.policy).toBe("combat.pvp-escape-vp-surrender");
    expect(vp.surrender.score).toBeGreaterThan(vp.retreat.score);

    // CONTROL: outside VP mode the cheaper Retreat stays the exit.
    const plain = scores(setup(false));
    expect(plain.retreat.policy).toBe("combat.pvp-escape-hopeless");
    expect(plain.retreat.score).toBeGreaterThan(plain.surrender.score);

    // CONTROL: once p2 has scored our Main Hero, a Retreat gives it nothing more.
    const credited = setup(true);
    credited.adventure!.vpLedger = { p2: { mainHeroDefeats: ["p1"] } };
    const after = scores(credited);
    expect(after.retreat.score).toBeGreaterThan(after.surrender.score);
  });

  it("the full chooser surrenders in the pre-battle prep window, where Surrender is offered", () => {
    // Surrender is a prep-only option by default (legal-actions), and the prep
    // floor caps every exit but the hopeless escape: the VP Surrender must keep
    // its lead over that Retreat there too.
    const prepState = (vp: boolean) => {
      const state = gameState(vp, 10);
      state.players.p1.army = [];
      for (const id of ["castle.halberdiers", "castle.marksmen", "castle.griffins"]) addArmyUnit(state.players.p1, id, "few");
      state.players.p1.resources.gold = 20;
      state.players.p2.army = [];
      for (const id of ["castle.archangels", "castle.champions", "castle.crusaders", "castle.zealots"]) addArmyUnit(state.players.p2, id, "pack");
      state.combat = {
        id: "combat_vp_prep", round: 1, attackerPlayerId: "p2", defenderPlayerId: "p1", activeUnitId: null, units: {},
        prep: { accepted: [] },
        context: { kind: "player", attackerHeroId: mainHero(state, "p2").id, defenderHeroId: mainHero(state, "p1").id, fieldId: mainHero(state, "p1").spaceId! },
      } as unknown as CombatState;
      return state;
    };
    const legal: GameAction[] = [
      { type: "ACCEPT_COMBAT", playerId: "p1" },
      { type: "RETREAT_FROM_COMBAT", playerId: "p1" },
      { type: "SURRENDER_COMBAT", playerId: "p1" },
    ];
    const vp = chooseComputerAction(observe(prepState(true), "p1", legal))!;
    expect(vp.action.type).toBe("SURRENDER_COMBAT");
    // CONTROL: outside VP mode the hopeless fight is still left by Retreat.
    const plain = chooseComputerAction(observe(prepState(false), "p1", legal))!;
    expect(plain.action.type).toBe("RETREAT_FROM_COMBAT");
  });
});
