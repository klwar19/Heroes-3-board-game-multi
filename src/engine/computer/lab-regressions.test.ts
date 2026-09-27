import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "../adventure-setup";
import { addArmyUnit, getAdjacentSpaceIds, makeCombatUnitFromArmy, makeCombatUnitFromNeutral } from "../adventure";
import { getRuleset, unitSideRuleOverrides } from "../ruleset";
import { getLegalActions } from "../legal-actions";
import { applyUnitCurrentSide } from "../unit-transforms";
import type { CombatState, GameAction, GameState } from "../state";
import { collectMapObjectives, fieldSuppliesResource, FINISH_FROM_ROUND, FINISH_LATEST_ROUND, objectiveStrategicValue, primaryMapObjective } from "./map-navigation";
import { evadeStepScore, scoreMapAction } from "./map-policy";
import { scoreChoiceAction } from "./choice-policy";
import { chooseComputerAction } from "./policy";
import { scoreCardAction } from "./card-policy";
import { forecastNeutralFight } from "./fight-forecast";
import { bankFightRounds, pvpEngagementForecast, shouldAssaultEnemyHolding } from "./army-strength";
import { getComputerMemory } from "./memory";
import { rankedGoldUnits } from "./development";
import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { effectiveTownBuildingCost } from "../house-rules";
import type { ComputerObservation } from "./types";

// Regressions found by the 2026-09-27 self-play lab (E:\heroes-ai-lab). Each
// case pairs the fixed behaviour with a CONTROL that the fix must not change.

function baseState(): GameState {
  const state = createAdventureGameState({ seed: "lab-regressions", difficulty: "impossible", events: false, rollFirstPlayer: false });
  state.round = 6;
  return state;
}

function observe(state: GameState, playerId: string): ComputerObservation {
  return { playerId, state: state as unknown as ComputerObservation["state"], legalActions: [], memory: getComputerMemory(state, playerId) };
}

function mainHero(state: GameState, playerId: string) {
  return Object.values(state.heroes).find(hero => hero.controllerId === playerId && hero.kind === "main")!;
}

function setArmy(state: GameState, playerId: string, units: Array<[string, "few" | "pack"]>) {
  const player = state.players[playerId];
  player.army = [];
  for (const [unitDefId, side] of units) addArmyUnit(player, unitDefId, side);
}

describe("lab regressions 2026-09-27", () => {
  it("a Black-Cubed Water Wheel supplies no gold (spent until a map event clears it)", () => {
    const state = baseState();
    const field = Object.values(state.adventure!.fields)[0];
    field.location = "water_wheel";
    field.resource = "gold";
    field.amount = 3;
    field.flagOwnerId = null;
    field.blackCube = false;
    expect(fieldSuppliesResource(state, "p2", field, "gold")).toBe(true);
    field.blackCube = true;
    expect(fieldSuppliesResource(state, "p2", field, "gold")).toBe(false);
  });

  it("an enemy Settlement is a garrison fight, not a free re-flag — free only while its owner cannot pay the fee", () => {
    const state = baseState();
    const hero = mainHero(state, "p2");
    const next = getAdjacentSpaceIds(hero.spaceId!).find(id => state.adventure!.fields[id] && !Object.values(state.heroes).some(h => h.spaceId === id))!;
    const settlement = state.adventure!.fields[next];
    Object.assign(settlement, { location: "settlement", flagOwnerId: "p1", everFlagged: true, blackCube: false, difficulty: undefined });
    setArmy(state, "p1", [["castle.archangels", "pack"], ["castle.champions", "pack"], ["castle.crusaders", "pack"]]);
    setArmy(state, "p2", [["rampart.centaurs", "few"]]);
    state.players.p1.resources.gold = 20;
    expect(shouldAssaultEnemyHolding(state, "p2", settlement)).toBe(false);
    expect(collectMapObjectives(state, hero).some(objective => objective.spaceId === next && objective.kind !== "explore")).toBe(false);
    // CONTROL: a broke owner cannot pay the 8-gold garrison fee — the holding falls without a fight.
    state.players.p1.resources.gold = 5;
    expect(shouldAssaultEnemyHolding(state, "p2", settlement)).toBe(true);
    expect(collectMapObjectives(state, hero).some(objective => objective.spaceId === next && objective.kind !== "explore")).toBe(true);
  });

  it("a route step onto a stronger enemy hero's hex is refused; onto a beatable one it is not", () => {
    const state = baseState();
    const hero = mainHero(state, "p2");
    const enemy = mainHero(state, "p1");
    const next = getAdjacentSpaceIds(hero.spaceId!).find(id => state.adventure!.fields[id])!;
    Object.assign(state.adventure!.fields[next], { location: "empty_field", flagOwnerId: null, blackCube: false, difficulty: undefined });
    enemy.spaceId = next;
    hero.movementPoints = 3;
    state.activePlayerId = "p2";
    const move: Extract<GameAction, { type: "MOVE_HERO" }> = { type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to: next };
    setArmy(state, "p1", [["castle.archangels", "pack"], ["castle.champions", "pack"], ["castle.crusaders", "pack"]]);
    setArmy(state, "p2", [["rampart.centaurs", "few"]]);
    expect(scoreMapAction(observe(state, "p2"), move)?.policy).toBe("map.avoid-losing-pvp-step");
    // CONTROL: the roles reversed — a crushing army may step in.
    setArmy(state, "p2", [["rampart.gold_dragons", "pack"], ["rampart.dendroids", "pack"], ["rampart.unicorns", "pack"]]);
    setArmy(state, "p1", [["castle.halberdiers", "few"]]);
    expect(scoreMapAction(observe(state, "p2"), move)?.policy).not.toBe("map.avoid-losing-pvp-step");
  });

  it("a map draw-only play of a combat instant is a pure cycle held below END_TURN", () => {
    const state = baseState();
    state.combat = null;
    state.players.p2.hand = ["ability.armorer", "stat.power"];
    const armorer: Extract<GameAction, { type: "PLAY_CARD" }> = {
      type: "PLAY_CARD", playerId: "p2", cardId: "ability.armorer", mode: "basic", target: { type: "none" },
    };
    const scored = scoreCardAction(observe(state, "p2"), armorer)!;
    expect(scored.policy).toBe("card.map-draw-cycle");
    expect(scored.score).toBeLessThan(300);
  });

  it("the fight forecast counts a Stack Token as an extra life", () => {
    const state = baseState();
    const ruleset = getRuleset(state);
    const overrides = unitSideRuleOverrides(state);
    const attacker = makeCombatUnitFromArmy({ id: "a1", unitDefId: "castle.crusaders", side: "few" }, "p2", "own-1", 0, ruleset, overrides)!;
    const guardFor = (stacked: boolean) => {
      const guard = makeCombatUnitFromNeutral({ unitDefId: "neutral.dwarves", tier: "bronze", bankUnit: true }, "guard-1", 1, ruleset, overrides)!;
      if (stacked) {
        guard.stackToken = "health";
        applyUnitCurrentSide(guard, ruleset, overrides);
      }
      return guard;
    };
    const combatWith = (stacked: boolean): CombatState => ({
      id: `forecast-${stacked}`, round: 1, units: { [attacker.id]: { ...attacker }, "guard-1": guardFor(stacked) },
      obstacles: [], attackerPlayerId: "p2", defenderPlayerId: "neutral",
      context: { kind: "neutral", heroId: mainHero(state, "p2").id, fieldId: "none", difficulty: 3, hasAzure: false },
    }) as unknown as CombatState;
    // One round to fight (no movement left to continue): the token decides it.
    mainHero(state, "p2").movementPoints = 0;
    state.adventure!.houseRules = { ...state.adventure!.houseRules, "free-neutral-combat-extend": false, "hex-battlefield": false };
    state.players.p2.hand = [];
    const plain = forecastNeutralFight(state, "p2", combatWith(false))!;
    const stacked = forecastNeutralFight(state, "p2", combatWith(true))!;
    expect(plain).not.toBeNull();
    expect(stacked).not.toBeNull();
    expect(stacked.winChance).toBeLessThan(plain.winChance);
  });

  it("a bank fight lasts one round plus the movement kept, under bank-move-points", () => {
    const state = baseState();
    state.adventure!.houseRules = { ...state.adventure!.houseRules, "bank-move-points": true, "free-neutral-combat-extend": false };
    expect(bankFightRounds(state, "p2", 1)).toBe(2);
    expect(bankFightRounds(state, "p2", 0)).toBe(1);
    // CONTROL: without the rule the bank rolls on for free.
    state.adventure!.houseRules = { ...state.adventure!.houseRules, "bank-move-points": false };
    expect(bankFightRounds(state, "p2", 1)).toBe(4);
  });

  it("garrisons a holding only when the units-only defense is likely to hold", () => {
    const state = baseState();
    const attacker = mainHero(state, "p1");
    const settlement = Object.values(state.adventure!.fields).find(field => !field.flagOwnerId && field.location !== "town" &&
      !Object.values(state.heroes).some(hero => hero.spaceId === field.spaceId))!;
    Object.assign(settlement, { location: "settlement", flagOwnerId: "p2", everFlagged: true, blackCube: false, difficulty: undefined });
    state.players.p2.resources.gold = 20;
    state.adventure!.pendingGarrison = { attackerPlayerId: "p1", attackerHeroId: attacker.id, defenderPlayerId: "p2", fieldId: settlement.spaceId, goldCost: 8 };
    state.pendingChoice = { id: "choice_garrison", type: "OPTION_CHOICE", playerId: "p2", prompt: "",
      options: [{ label: "Pay 8 gold and defend" }, { label: "Let it fall" }], context: "garrison", returnPhase: "player-turn" } as GameState["pendingChoice"];
    const option = (optionIndex: number) => scoreChoiceAction(observe(state, "p2"),
      { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "choice_garrison", optionIndex })!.score;
    // A hopeless garrison (the town is still ours, so this is not the last base) is let go —
    // even with three cards and gold to spare (the old size-and-gold rule paid and lost).
    setArmy(state, "p1", [["castle.archangels", "pack"], ["castle.champions", "pack"], ["castle.crusaders", "pack"]]);
    setArmy(state, "p2", [["rampart.centaurs", "few"], ["rampart.dwarves", "few"], ["rampart.elves", "few"]]);
    expect(option(1)).toBeGreaterThan(option(0));
    // CONTROL: a garrison that holds is defended.
    setArmy(state, "p2", [["rampart.gold_dragons", "pack"], ["rampart.dendroids", "pack"], ["rampart.unicorns", "pack"]]);
    setArmy(state, "p1", [["castle.halberdiers", "few"]]);
    expect(option(0)).toBeGreaterThan(option(1));
  });

  it("a heroless garrison is forecast without its commander (WoG Commanders)", () => {
    // The commander stands only beside its MAIN hero (commanderStandsInCurrentCombat)
    // and a heroless garrison deploys its army cards alone. Read with the
    // commander, our units-only garrison looked far safer to pay for, and an
    // enemy garrison far harder to assault, than the real fight.
    const forecasts = (commanders: boolean) => {
      const state = createAdventureGameState({ seed: "garrison-commander", difficulty: "impossible", events: false,
        rollFirstPlayer: false, ...(commanders ? { wog: { enabled: true, commanders: true } } : {}) });
      expect(Boolean(state.players.p1.commander && state.players.p2.commander)).toBe(commanders);
      setArmy(state, "p1", [["castle.halberdiers", "pack"], ["castle.marksmen", "pack"]]);
      setArmy(state, "p2", [["rampart.centaurs", "pack"], ["rampart.dwarves", "pack"]]);
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      return {
        ownGarrison: pvpEngagementForecast(state, "p1", "p2", false, true)!.winChance,
        heroBattle: pvpEngagementForecast(state, "p1", "p2", false)!.winChance,
        assaultTheirGarrison: pvpEngagementForecast(state, "p1", "p2", true)!.winChance,
      };
    };
    const wog = forecasts(true);
    expect(wog.ownGarrison).toBeLessThan(wog.heroBattle);
    expect(wog.assaultTheirGarrison).toBeGreaterThan(wog.heroBattle);
    // CONTROL: without commanders (no hand on either side) the three reads are one fight.
    const plain = forecasts(false);
    expect(plain.ownGarrison).toBe(plain.heroBattle);
    expect(plain.assaultTheirGarrison).toBe(plain.heroBattle);
  });

  it("keeps the 8-gold garrison fee while an enemy hero can reach our unguarded last base next turn", () => {
    // Lab league 2026-09-27: a broke owner's Town falls without a fight. An
    // optional spend — here the Victory Points endgame building, a reliably
    // high (~988) score — waits below END_TURN while it would leave less than
    // the fee. The Town is p1's only base.
    const state = createAdventureGameState({ seed: "garrison-fee", difficulty: "impossible", events: false,
      rollFirstPlayer: false, victoryPoints: true, victoryPointsRoundLimit: 12 });
    state.round = 12;
    state.activePlayerId = "p1";
    const town = Object.values(state.towns).find(candidate => candidate.controllerId === "p1")!;
    const buildingId = coreFactionDefinitions[state.players.p1.factionId!].buildings.find(id =>
      !town.buildings.includes(id) && coreBuildingDefinitions[id]?.effect?.type === "ARTIFACT_SMITH")!;
    const price = effectiveTownBuildingCost(state, coreBuildingDefinitions[buildingId]!).gold ?? 0;
    const build: GameAction = { type: "BUILD_STRUCTURE", playerId: "p1", townId: town.id, buildingId };
    const end: GameAction = { type: "END_TURN", playerId: "p1" };
    const around = getAdjacentSpaceIds(town.fieldId!).filter(id => state.adventure!.fields[id] &&
      !Object.values(state.heroes).some(hero => hero.spaceId === id));
    const own = mainHero(state, "p1");
    own.spaceId = around[0];
    mainHero(state, "p2").spaceId = around[1];
    state.players.p1.resources = { gold: price + 7, buildingMaterials: 20, valuables: 10 };
    const decide = () => chooseComputerAction({ ...observe(state, "p1"),
      legalActions: [{ label: "build", action: build }, { label: "end", action: end }] })!.action.type;
    expect(decide()).toBe("END_TURN");
    // CONTROL: the fee is still in the purse after the build.
    state.players.p1.resources.gold = price + 8;
    expect(decide()).toBe("BUILD_STRUCTURE");
    // CONTROL: our hero stands on the Town — nothing needs a garrison.
    state.players.p1.resources.gold = price + 7;
    own.spaceId = town.fieldId!;
    expect(decide()).toBe("BUILD_STRUCTURE");
  });

  it("on the elimination clock an enemy Settlement becomes the top objective even behind a strong garrison", () => {
    const state = baseState();
    const hero = mainHero(state, "p2");
    const next = getAdjacentSpaceIds(hero.spaceId!).find(id => state.adventure!.fields[id] && !Object.values(state.heroes).some(h => h.spaceId === id))!;
    const settlement = state.adventure!.fields[next];
    Object.assign(settlement, { location: "settlement", flagOwnerId: "p1", everFlagged: true, blackCube: false, difficulty: undefined });
    setArmy(state, "p1", [["castle.archangels", "pack"], ["castle.champions", "pack"], ["castle.crusaders", "pack"]]);
    setArmy(state, "p2", [["rampart.centaurs", "few"], ["rampart.dwarves", "few"]]);
    state.players.p1.resources.gold = 20;
    const listed = () => collectMapObjectives(state, hero).find(objective => objective.spaceId === next && objective.kind !== "explore");
    expect(listed()).toBeUndefined();
    state.players.p2.eliminationCountdown = 2;
    const objective = listed();
    expect(objective).toBeDefined();
    expect(objectiveStrategicValue(state, hero, objective!, 1)).toBeGreaterThan(1_300);
  });

  it("on the elimination clock the step INTO an enemy base is taken; a hostile hero on it only on the last turn", () => {
    const state = baseState();
    state.activePlayerId = "p2";
    const hero = mainHero(state, "p2");
    const next = getAdjacentSpaceIds(hero.spaceId!).find(id => state.adventure!.fields[id] && !Object.values(state.heroes).some(h => h.spaceId === id))!;
    Object.assign(state.adventure!.fields[next], { location: "settlement", flagOwnerId: "p1", everFlagged: true, blackCube: false, difficulty: undefined });
    setArmy(state, "p1", [["castle.archangels", "pack"], ["castle.champions", "pack"], ["castle.crusaders", "pack"]]);
    setArmy(state, "p2", [["rampart.centaurs", "few"], ["rampart.dwarves", "few"]]);
    state.players.p1.resources.gold = 20;
    hero.movementPoints = 3;
    const step = () => scoreMapAction(observe(state, "p2"), { type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to: next })!;
    // CONTROL: off the clock the strong garrison keeps the hero out.
    expect(step().policy).toBe("map.avoid-losing-garrison-step");
    state.players.p2.eliminationCountdown = 2;
    expect(step().policy).not.toBe("map.avoid-losing-garrison-step");
    expect(step().score).toBeGreaterThan(300);
    // The enemy main hero stands on the Settlement: a turn early it may still walk away...
    const enemy = mainHero(state, "p1");
    enemy.spaceId = next;
    expect(step().policy).toBe("map.avoid-losing-pvp-step");
    // ...on the clock's last turn the long-odds battle beats certain elimination.
    state.players.p2.eliminationCountdown = 1;
    expect(step().policy).not.toBe("map.avoid-losing-pvp-step");
  });

  it("conquest finishing: past the development race a clearly beaten enemy hero in reach comes before the economy", () => {
    const state = baseState();
    const hero = mainHero(state, "p2");
    const enemy = mainHero(state, "p1");
    const around = getAdjacentSpaceIds(hero.spaceId!).filter(id => state.adventure!.fields[id] && !Object.values(state.heroes).some(h => h.spaceId === id));
    enemy.spaceId = around[0];
    Object.assign(state.adventure!.fields[around[0]], { location: "empty_field", flagOwnerId: null, everFlagged: false, blackCube: false, difficulty: undefined });
    // Economy pressure: a Far income capture already secured (the funding cascade
    // runs) and a free enemy Mine next door that supplies a missing resource.
    Object.assign(state.adventure!.fields[around[1]], { location: "mine", resource: "valuables", flagOwnerId: "p1", everFlagged: true, blackCube: false, difficulty: undefined });
    const farTile = Object.keys(state.adventure!.tiles)[0];
    state.adventure!.tiles[farTile] = { ...state.adventure!.tiles[farTile], group: "far", faceDown: false };
    const far = Object.values(state.adventure!.fields).find(field => field.tileInstanceId === farTile && field.spaceId !== hero.spaceId &&
      !around.includes(field.spaceId))!;
    Object.assign(far, { location: "mine", resource: "gold", flagOwnerId: "p2", everFlagged: true, difficulty: undefined });
    // p2's own faction Gold units (index 0 = the level-7), so the Pack gate reads them.
    const [top, second] = rankedGoldUnits(state, "p2");
    setArmy(state, "p2", [[top, "pack"], [second, "pack"], ["rampart.dendroids", "pack"], ["rampart.pegasi", "pack"]]);
    setArmy(state, "p1", [["castle.halberdiers", "few"]]);
    state.players.p2.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    hero.movementPoints = 3;
    const primary = () => primaryMapObjective(state, hero, collectMapObjectives(state, hero), around[1]);
    state.round = FINISH_FROM_ROUND;
    expect(primary()).toMatchObject({ spaceId: around[0], kind: "enemy-hero" });
    // CONTROL: during the development race the same board keeps its economy plan.
    state.round = FINISH_FROM_ROUND - 1;
    expect(primary()?.spaceId).not.toBe(around[0]);
    // CONTROL: the level-7 still a Few — the Pack is funded first until FINISH_LATEST_ROUND.
    setArmy(state, "p2", [[top, "few"], [second, "pack"], ["rampart.dendroids", "pack"], ["rampart.pegasi", "pack"]]);
    state.round = FINISH_FROM_ROUND;
    expect(primary()?.spaceId).not.toBe(around[0]);
    state.round = FINISH_LATEST_ROUND;
    expect(primary()).toMatchObject({ spaceId: around[0], kind: "enemy-hero" });
  });

  it("Clone is not cast below its Power-for-grade, and a refunded cast is not repeated this combat round", () => {
    const state = baseState();
    const ruleset = getRuleset(state);
    const overrides = unitSideRuleOverrides(state);
    const gold = makeCombatUnitFromArmy({ id: "g1", unitDefId: "castle.archangels", side: "pack" }, "p2", "own-gold", 12, ruleset, overrides)!;
    const bronze = makeCombatUnitFromArmy({ id: "b1", unitDefId: "castle.halberdiers", side: "pack" }, "p2", "own-bronze", 13, ruleset, overrides)!;
    const guard = makeCombatUnitFromNeutral({ unitDefId: "neutral.dwarves", tier: "bronze" }, "guard-1", 1, ruleset, overrides)!;
    state.combat = {
      id: "clone-loop", round: 2, units: { [gold.id]: gold, [bronze.id]: bronze, [guard.id]: guard },
      obstacles: [], attackerPlayerId: "p2", defenderPlayerId: "neutral", activeUnitId: gold.id,
      context: { kind: "neutral", heroId: mainHero(state, "p2").id, fieldId: "none", difficulty: 3, hasAzure: false },
    } as unknown as CombatState;
    state.activePlayerId = "p2";
    state.players.p2.hand = ["spell.clone", "stat.power"];
    state.players.p2.spellBook = [];
    const clone = (unitId: string): GameAction => ({ type: "CAST_SPELL", playerId: "p2", cardId: "spell.clone", target: { type: "unit", unitId } });
    // A Gold unit needs Power 5; one Power card cannot lift the cast there.
    expect(scoreCardAction(observe(state, "p2"), clone(gold.id))!.score).toBeLessThanOrEqual(200);
    // CONTROL: the same hand clones a Bronze unit (Power 1).
    expect(scoreCardAction(observe(state, "p2"), clone(bronze.id))!.score).toBeGreaterThan(400);
    // A cast refunded earlier in this combat round is held below END_ACTIVATION.
    const end: GameAction = { type: "END_ACTIVATION", playerId: "p2", unitId: bronze.id };
    const decide = () => chooseComputerAction({ ...observe(state, "p2"), legalActions: [{ label: "clone", action: clone(bronze.id) }, { label: "end", action: end }] })!;
    expect(decide().action.type).toBe("CAST_SPELL");
    state.eventLog.push({ id: "evt_round", type: "COMBAT_ROUND_STARTED", round: 2, activeUnitId: null } as GameState["eventLog"][number]);
    state.eventLog.push({ id: "evt_refund", type: "SPELL_CAST_REFUNDED", playerId: "p2", spellCardId: "spell.clone", reason: "test" } as GameState["eventLog"][number]);
    expect(decide().action.type).toBe("END_ACTIVATION");
  });

  it("a card replayed three times in one window is held below END_TURN (card-loop guard)", () => {
    const state = baseState();
    state.combat = null;
    state.activePlayerId = "p2";
    state.players.p2.hand = ["ability.scouting"];
    const play: GameAction = { type: "PLAY_CARD", playerId: "p2", cardId: "ability.scouting", mode: "basic", target: { type: "none" } };
    const end: GameAction = { type: "END_TURN", playerId: "p2" };
    const decide = () => chooseComputerAction({ ...observe(state, "p2"), legalActions: [{ label: "play", action: play }, { label: "end", action: end }] })!;
    const log = state.eventLog;
    log.push({ id: "evt_turn", type: "TURN_STARTED", playerId: "p2", round: state.round } as GameState["eventLog"][number]);
    const before = decide();
    for (const n of [0, 1, 2]) {
      log.push({ id: "evt_play_" + n, type: "CARD_PLAYED", playerId: "p2", cardId: "ability.scouting", timing: "instant", mode: "basic" } as GameState["eventLog"][number]);
    }
    const after = decide();
    expect(after.action.type).toBe("END_TURN");
    // CONTROL: without the replays the same card is still played.
    expect(before.action.type).toBe("PLAY_CARD");
  });

  /** p1 (defender) in the PvP pre-battle prep window, p2 already accepted. */
  function prepWindow(hand: string[]): GameState {
    const state = baseState();
    setArmy(state, "p1", [["castle.halberdiers", "pack"], ["castle.marksmen", "pack"], ["castle.griffins", "pack"]]);
    setArmy(state, "p2", [["castle.halberdiers", "pack"], ["castle.marksmen", "pack"]]);
    state.players.p1.hand = [...hand];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    state.activePlayerId = "p2";
    state.phase = "combat-setup";
    state.combat = {
      id: "combat_prep", round: 1, attackerPlayerId: "p2", defenderPlayerId: "p1", activeUnitId: null, units: {},
      prep: { accepted: ["p2"] },
      context: { kind: "player", attackerHeroId: mainHero(state, "p2").id, defenderHeroId: mainHero(state, "p1").id, fieldId: mainHero(state, "p1").spaceId! },
    } as unknown as CombatState;
    return state;
  }

  it("in the PvP prep window a draw-rider cycle sits below ACCEPT (the battle starts)", () => {
    // The prep window offers the map-turn plays: with an empty deck Armorer and
    // Offense (+stat that fizzles, draw 1) drew each other back forever — the
    // map draw-cycle score was skipped there (a combat exists) and the replay
    // guard's 280 still outranked ACCEPT (225): the defender never readied up.
    const state = prepWindow(["ability.armorer", "ability.offense"]);
    const legal = getLegalActions(state, "p1");
    expect(legal.some(({ action }) => action.type === "PLAY_CARD" && action.cardId === "ability.armorer")).toBe(true);
    expect(chooseComputerAction({ ...observe(state, "p1"), legalActions: legal })!.action.type).not.toBe("PLAY_CARD");
    const armorer = legal.find(({ action }) => action.type === "PLAY_CARD" && action.cardId === "ability.armorer")!.action;
    expect(scoreCardAction(observe(state, "p1"), armorer)).toMatchObject({ policy: "card.map-draw-cycle" });
    expect(scoreCardAction(observe(state, "p1"), armorer)!.score).toBeLessThan(225);
  });

  it("in the PvP prep window a card replayed three times is held below ACCEPT", () => {
    const state = prepWindow(["artifact.speculum"]);
    const discover: GameAction = { type: "PLAY_CARD", playerId: "p1", cardId: "artifact.speculum", mode: "basic", optionIndex: 0, target: { type: "none" } };
    const accept: GameAction = { type: "ACCEPT_COMBAT", playerId: "p1" };
    const decide = () => chooseComputerAction({ ...observe(state, "p1"), legalActions: [{ label: "discover", action: discover }, { label: "accept", action: accept }] })!;
    // CONTROL: a useful prep play still comes before readying up.
    expect(decide().action.type).toBe("PLAY_CARD");
    state.eventLog.push({ id: "evt_pvp", type: "PLAYER_COMBAT_STARTED" } as unknown as GameState["eventLog"][number]);
    for (const n of [0, 1, 2]) {
      state.eventLog.push({ id: "evt_prep_play_" + n, type: "CARD_PLAYED", playerId: "p1", cardId: "artifact.speculum", timing: "instant", mode: "basic" } as GameState["eventLog"][number]);
    }
    expect(decide()).toMatchObject({ action: { type: "ACCEPT_COMBAT" } });
  });

  it("steps out of a stronger enemy hero's next-turn reach, and not when the enemy is weaker", () => {
    const state = baseState();
    const hero = mainHero(state, "p2");
    const enemy = mainHero(state, "p1");
    // A straight corridor: the enemy two spaces west, open ground to the east.
    const template = Object.values(state.adventure!.fields)[0];
    state.adventure!.tiles = {};
    state.adventure!.fields = {};
    for (let column = 2; column <= 14; column += 1) {
      const spaceId = "h:10:" + column;
      state.adventure!.fields[spaceId] = { ...template, spaceId, tileInstanceId: "corridor", location: "empty_field",
        flagOwnerId: null, everFlagged: false, blackCube: false, difficulty: undefined };
    }
    hero.spaceId = "h:10:8";
    hero.movementPoints = 3;
    enemy.spaceId = "h:10:6";
    const around = getAdjacentSpaceIds(hero.spaceId).filter(id => state.adventure!.fields[id]);
    setArmy(state, "p1", [["castle.archangels", "pack"], ["castle.champions", "pack"], ["castle.crusaders", "pack"]]);
    setArmy(state, "p2", [["rampart.centaurs", "few"]]);
    const move = (to: string): Extract<GameAction, { type: "MOVE_HERO" }> => ({ type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to });
    expect(around.map(to => evadeStepScore(state, "p2", move(to))).some(score => score !== null && score >= 880)).toBe(true);
    // CONTROL: a weaker enemy is no threat — no evasion.
    setArmy(state, "p2", [["rampart.gold_dragons", "pack"], ["rampart.dendroids", "pack"], ["rampart.unicorns", "pack"]]);
    setArmy(state, "p1", [["castle.halberdiers", "few"]]);
    expect(around.every(to => evadeStepScore(state, "p2", move(to)) === null)).toBe(true);
  });

  it("never evades INTO a fight: an enemy Settlement its owner can garrison, or a guard", () => {
    const state = baseState();
    const hero = mainHero(state, "p2");
    const enemy = mainHero(state, "p1");
    const template = Object.values(state.adventure!.fields)[0];
    state.adventure!.tiles = {};
    state.adventure!.fields = {};
    for (let column = 2; column <= 14; column += 1) {
      const spaceId = "h:10:" + column;
      state.adventure!.fields[spaceId] = { ...template, spaceId, tileInstanceId: "corridor", location: "empty_field",
        flagOwnerId: null, everFlagged: false, blackCube: false, difficulty: undefined };
    }
    hero.spaceId = "h:10:8";
    hero.movementPoints = 3;
    enemy.spaceId = "h:10:6";
    setArmy(state, "p1", [["castle.archangels", "pack"], ["castle.champions", "pack"], ["castle.crusaders", "pack"]]);
    setArmy(state, "p2", [["rampart.centaurs", "few"]]);
    const move = (to: string): Extract<GameAction, { type: "MOVE_HERO" }> => ({ type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to });
    const east = "h:10:9";
    // CONTROL: the open eastern step is an evasion.
    expect(evadeStepScore(state, "p2", move(east))).not.toBeNull();
    Object.assign(state.adventure!.fields[east], { location: "settlement", flagOwnerId: "p1", everFlagged: true });
    expect(evadeStepScore(state, "p2", move(east))).toBeNull();
    Object.assign(state.adventure!.fields[east], { location: "mine", resource: "gold", flagOwnerId: null, everFlagged: false, difficulty: 2 });
    expect(evadeStepScore(state, "p2", move(east))).toBeNull();
    // CONTROL: our own Settlement is a shelter step, not a fight.
    Object.assign(state.adventure!.fields[east], { location: "settlement", flagOwnerId: "p2", everFlagged: true, difficulty: undefined });
    expect(evadeStepScore(state, "p2", move(east))).not.toBeNull();
    // The Elimination clock's last turn: no step is spent running away.
    state.players.p2.eliminationCountdown = 1;
    expect(evadeStepScore(state, "p2", move(east))).toBeNull();
  });
});
