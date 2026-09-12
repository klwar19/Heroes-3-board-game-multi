import { expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  applyAction, createAdventureGameState, getLegalActions,
  getMainHero, type GameAction, type GameState,
} from "@/engine";
import { driveComputerPlayers } from "@/server/computer-runner";
import { effectiveHandLimit, isFieldGuarded } from "@/engine/adventure";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { canBeatGuardedField, collectMapObjectives, primaryMapObjective, distanceFromHeroTo } from "@/engine/computer/map-navigation";
import { premiumCombatMovementReserve } from "@/engine/computer/premium-approach";
import { chooseComputerAction } from "@/engine/computer/policy";
import { observeForComputer } from "@/engine/computer/observation";
import { neutralCombatControllerId } from "@/engine/neutral-control";
import { parallelStateForPlayer } from "@/engine/parallel-combats";

const factions = [
  { factionId: "necropolis", heroDefId: "sandro" },
  { factionId: "castle", heroDefId: "catherine" },
  { factionId: "conflux", heroDefId: "ciele" },
] as const;
const difficulty = (process.env.AI_DIFFICULTY ?? "hard") as "hard" | "normal" | "impossible" | "easy";
const humanNeutrals = process.env.AI_HUMAN_NEUTRALS;
const variant = (process.env.AI_POLICY_VARIANT ?? "current") + (humanNeutrals ? `-human-${humanNeutrals}` : "");
const maxRound = Number(process.env.AI_MAX_ROUND ?? 8);
const output = "artifacts/far-ai-verification";
mkdirSync(output, { recursive: true });

for (const config of factions.filter(f => !process.env.AI_FACTION || f.factionId === process.env.AI_FACTION)) {
  it(`${config.factionId} ${difficulty}: two FAR tiles, early capture and development`, () => {
    let state = createAdventureGameState({
      seed: `far-timing-${config.factionId}-1`, scenarioId: "skirmish",
      sessionMode: humanNeutrals ? "multiplayer" : "single-player", playerCount: 2, difficulty,
      ...(humanNeutrals ? { parallelTurns: 8, pvpNeutralControl: true,
        pvpNeutralControlMustAttack: humanNeutrals === "must",
        controllers: { p1: { kind: "human" as const }, p2: { kind: "computer" as const, difficulty: "standard" as const, policyVersion: 1 } } } : {}),
      players: [{ id: "p1", name: "Passive control", factionId: "tower", heroDefId: "solmyr" },
        { id: "p2", name: config.factionId, ...config }],
      events: false, rollFirstPlayer: false, rotateStartTiles: true, startingBonus: false,
      farTilesPerPlayer: 2,
      houseRules: { "free-neutral-combat-extend": false, "polish-quick-combat": false },
    });
    const trace: any[] = [];
    const attacks: any[] = [];
    const captures: any[] = [];
    const builds: any[] = [];
    const outcomes: any[] = [];
    const errors: unknown[] = [];
    const snapshots: unknown[] = [];
    const initial = { resources: state.players.p2.resources, production: state.players.p2.production,
      army: state.players.p2.army, towns: state.towns, houseRules: state.adventure?.houseRules, wog: state.wog };
    let steps = 0;
    let lastRound = 0;
    const save = () => writeFileSync(`${output}/${variant}-${difficulty}-${config.factionId}.json`, JSON.stringify({
      variant, difficulty, faction: config.factionId, initial, round: state.round, steps,
      attacks, captures, builds, outcomes, errors, snapshots, trace,
      final: { army: state.players.p2.army, resources: state.players.p2.resources,
        fields: state.adventure?.fields, tiles: state.adventure?.tiles,
        farSupply: state.adventure?.playerFarTiles.p2, memory: state.computerMemory?.p2,
        ...(errors.length ? { state } : {}) },
    }, null, 2));
    while (state.round <= maxRound && steps < 6000) {
      const before = humanNeutrals ? parallelStateForPlayer(state, "p2") : state;
      const hero = getMainHero(before, "p2")!;
      if (before.round !== lastRound) {
        lastRound = before.round;
        snapshots.push({ round: before.round, space: hero.spaceId, army: before.players.p2.army,
          resources: before.players.p2.resources });
        save();
        console.log(`${variant} ${difficulty} ${config.factionId} round ${before.round}, ${steps} actions`);
      }
      const run = driveComputerPlayers(before, (s, action, playerId) =>
        applyAction(s, action, { computerActorPlayerId: playerId }), { maxSteps: 1 });
      if (run.decisions.length > 0) {
        state = run.state;
        const decision = run.decisions[0];
        const action = decision.action;
        if (!before.combat || action.type === "CONTINUE_NEUTRAL_COMBAT" || action.type === "RETREAT_FROM_COMBAT") {
          const primary = !before.combat ? primaryMapObjective(before, hero, collectMapObjectives(before, hero), before.computerMemory?.p2?.stickyObjectiveSpaceId) : null;
          trace.push({ step: steps, round: before.round, action, policy: decision.policy, from: hero.spaceId,
            mp: hero.movementPoints, primary: primary?.spaceId,
            resources: before.players.p2.resources, resourcesAfter: state.players.p2.resources,
            primaryReady: primary && canBeatGuardedField(before, hero, before.adventure!.fields[primary.spaceId]),
            reserve: primary && before.adventure?.fields[primary.spaceId] &&
              premiumCombatMovementReserve(before, hero, before.adventure.fields[primary.spaceId]),
            distance: primary && distanceFromHeroTo(before, hero, primary.spaceId) });
        }
        if (action.type === "MOVE_HERO") {
          const field = before.adventure?.fields[action.to];
          const tile = field?.tileInstanceId && before.adventure?.tiles[field.tileInstanceId];
          if (field && isFieldGuarded(field)) attacks.push({ round: before.round, field: field.spaceId,
            location: field.location, resource: field.resource, difficulty: field.difficulty,
            group: tile && tile.group, entryMp: hero.movementPoints,
            remainingMp: getMainHero(state, "p2")?.movementPoints, battle: state.combat?.id,
            army: before.players.p2.army });
        }
        if (action.type === "BUILD_STRUCTURE") builds.push({ round: before.round, building: action.buildingId,
          effect: coreBuildingDefinitions[action.buildingId]?.effect });
        if (state.combat?.outcome && state.combat.id !== before.combat?.id ||
            (state.combat?.outcome && !before.combat?.outcome)) outcomes.push({ round: before.round,
          context: state.combat?.context, ...state.combat?.outcome });
        for (const field of Object.values(state.adventure?.fields ?? {})) {
          if (field.flagOwnerId === "p2" && before.adventure?.fields[field.spaceId]?.flagOwnerId !== "p2") {
            const tile = field.tileInstanceId && state.adventure?.tiles[field.tileInstanceId];
            captures.push({ round: before.round, field: field.spaceId, location: field.location,
              resource: field.resource, group: tile && tile.group });
          }
        }
      } else {
        const humanGuardWindow = before.combat && neutralCombatControllerId(before, before.combat) === "p1";
        if (run.stalled && !humanGuardWindow) { errors.push(run.reason); break; }
        const offers = getLegalActions(before, "p1");
        const priorities: GameAction["type"][] = ["ACKNOWLEDGE_FIRST_PLAYER_ROLL", "SET_TILE_ROTATION", "CHOOSE_OPTION",
          "CHOOSE_ABILITY_TARGET", "CHOOSE_PENDING_ROLL", "RESOLVE_VISIT_STEP", "RESOLVE_DECK_SEARCH",
          "RESOLVE_COMBAT_DISCARD", "RESOLVE_EXPLORERS_DISCARD", "REFRESH_HAND", "END_TURN"];
        const guardDecision = before.combat && neutralCombatControllerId(before, before.combat) === "p1"
          ? chooseComputerAction(observeForComputer(before, "p1")) : null;
        const pick = guardDecision ? { action: guardDecision.action } :
          priorities.map(type => offers.find(offer => offer.action.type === type)).find(Boolean);
        if (!pick) { errors.push({ phase: before.phase, offers: offers.map(o => o.action.type) }); break; }
        const humanAction = pick.action.type === "REFRESH_HAND" ? { ...pick.action,
          discardCardIds: before.players.p1.hand.slice(0, Math.max(0,
            before.players.p1.hand.length - effectiveHandLimit(before, "p1"))),
        } : pick.action;
        const result = applyAction(before, humanAction);
        if (result.errors.length) { errors.push(result.errors); break; }
        if (humanGuardWindow) trace.push({ round: before.round, humanGuardAction: humanAction });
        state = result.state;
      }
      steps++;
    }
    save();
    const farAttacks = attacks.filter(a => a.group === "far" && (a.location === "settlement" ||
      (a.location === "mine" && (a.resource === "gold" || a.resource === "valuables"))));
    console.log(JSON.stringify({ variant, difficulty, faction: config.factionId, steps, round: state.round,
      farAttacks, captures, builds, outcomes, errors }));
    expect(errors).toEqual([]);
    expect(steps).toBeLessThan(6000);
    expect(farAttacks[0]?.round, "first FAR economy attack by round 4").toBeLessThanOrEqual(4);
    expect(farAttacks.every(a => a.entryMp >= 2 || !a.battle), "no paid fight entered on last MP").toBe(true);
    if (difficulty === "impossible") expect(farAttacks.every(a => a.entryMp >= 3 || !a.battle),
      "Impossible FAR economy fights start with three MP").toBe(true);
    expect(captures.some(c => c.group === "far" && (c.location === "settlement" || c.location === "mine")), "actually capture FAR income").toBe(true);
    const cycles = trace.filter((entry, index) => index >= 2 && entry.action?.type === "MOVE_HERO" &&
      trace[index - 1].action?.type === "MOVE_HERO" && trace[index - 2].action?.type === "MOVE_HERO" &&
      entry.round === trace[index - 2].round && entry.action.to === trace[index - 2].action.to &&
      entry.from === trace[index - 2].from);
    expect.soft(cycles, "no consecutive A-B-A-B movement cycle").toEqual([]);
    if (difficulty === "impossible" && maxRound >= 6 && !humanNeutrals) expect.soft(
      new Set(captures.filter(c => c.group === "far" && (c.location === "settlement" ||
        (c.location === "mine" && (c.resource === "gold" || c.resource === "valuables"))))
        .map(c => c.field)).size, "capture economy from both FAR tiles").toBeGreaterThanOrEqual(2);
    if (maxRound >= 8) expect(state.players.p2.army.some(u => coreUnitDefinitions[u.unitDefId]?.tier === "gold"), "Gold army by round 8").toBe(true);
  });
}
