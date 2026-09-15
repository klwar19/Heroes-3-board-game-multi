import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { createAdventureGameState } from "../adventure-setup";
import { getUnitSide } from "../adventure";
import { canUnitAttack, canUnitMoveAndAttack, getLegalMoveDestinations, getLegalActions } from "../legal-actions";
import { startNeutralEncounter } from "../adventure-reducer";
import { applyAction } from "../reducer";
import type { CombatState, CombatUnitState, GameAction, GameState } from "../state";
import { chooseComputerAction } from "./policy";
import { formationFitScore } from "./combat-policy";
import { canBeatGuardedField, primaryMapObjective } from "./map-navigation";
import type { ComputerObservation } from "./types";

function unit(id: string, defId: string, position: number, controllerId = "p2", pack = true): CombatUnitState {
  const def = coreUnitDefinitions[defId];
  const side = getUnitSide(defId, pack ? "pack" : "few")!;
  return { id, unitDefId: defId, controllerId, name: id, cardName: id,
    variant: pack ? "pack" : "few", grade: def.tier, type: side.type ?? def.type,
    attack: side.attack, defense: side.defense, maxHealth: side.health,
    initiative: side.initiative, abilities: side.abilities ?? [], position, damage: 0,
    activatedThisRound: false, movedThisActivation: false, retaliatedThisRound: false,
    defenseToken: false } as CombatUnitState;
}
function game() {
  return createAdventureGameState({ seed: "nav-map", difficulty: "normal", events: false, rollFirstPlayer: false });
}
function battle(units: CombatUnitState[]) {
  const state = game();
  state.combat = { id: "growth-pvp", round: 1, attackerPlayerId: "p2", defenderPlayerId: "p1",
    context: { kind: "player" }, obstacles: [], units: Object.fromEntries(units.map(u => [u.id, u])) } as unknown as CombatState;
  return state;
}
function decide(state: GameState, actions: GameAction[]) {
  return chooseComputerAction({ state, playerId: "p2", legalActions: actions.map(action => ({ action, label: action.type })) } as unknown as ComputerObservation)!.action;
}
const move = (id: string, destination: number): GameAction => ({ type: "MOVE_UNIT", playerId: "p2", unitId: id, destination });
const defend = (id: string): GameAction => ({ type: "DEFEND_UNIT", playerId: "p2", unitId: id });

describe("PvP army coordination and post-Far growth", () => {
  it("chooses the actual XP battle over optional Quick Combat when ready, but takes the shortcut without an army", () => {
    const state = game();
    state.round = 10;
    state.activePlayerId = "p2";
    state.adventure!.houseRules = { ...state.adventure!.houseRules, "polish-quick-combat": true };
    const hero = state.heroes.hero_p2;
    hero.level = 4;
    hero.movementPoints = 3;
    state.players.p2.army = ["castle.archangels", "castle.champions", "castle.crusaders", "castle.marksmen", "castle.halberdiers"]
      .map((unitDefId, index) => ({ id: `ready-${index}`, unitDefId, side: "pack" as const }));
    const field = state.adventure!.fields["h:10:6"];
    field.location = "settlement";
    field.difficulty = 4;
    field.flagOwnerId = null;
    startNeutralEncounter(state, hero, field);
    expect(state.pendingChoice).toMatchObject({ context: "polish-quick-combat" });
    const actions = getLegalActions(state, "p2").map(item => item.action);
    const choice = decide(state, actions);
    expect(choice).toMatchObject({ type: "CHOOSE_OPTION", optionIndex: 1 });
    const result = applyAction(state, choice);
    expect(result.errors).toEqual([]);
    expect(result.state.combat?.context).toMatchObject({ kind: "neutral", difficulty: 4 });
    // The same prompt with a destroyed army must retain its safe exit.
    state.players.p2.army = [];
    expect(decide(state, actions)).toMatchObject({ type: "CHOOSE_OPTION", optionIndex: 0 });
  });
  it.each(["castle.champions", "rampart.unicorns", "tower.nagas"])(
    "%s opens allied attack lanes in PvP, neutral fights and human-driven guard control", defId => {
      for (const mode of ["player", "neutral", "guard-control"] as const) {
        const side = mode === "guard-control" ? "neutrals" : "p2";
        const ally = unit("ally", defId, 16, side);
        const screen = unit("screen", "castle.griffins", 12, side);
        const wall = unit("wall", "castle.halberdiers", 17, side);
        wall.activatedThisRound = true;
        const enemy = unit("enemy", "stronghold.thunderbirds", 4, "p1", false);
        enemy.activatedThisRound = true;
        const state = battle([ally, screen, wall, enemy]);
        if (mode !== "player") state.combat!.context = { kind: "neutral", heroId: "unused" } as CombatState["context"];
        if (mode === "guard-control") {
          state.combat!.attackerPlayerId = "p1";
          state.combat!.defenderPlayerId = side;
        }
        expect(decide(state, [move(screen.id, 13), defend(screen.id)]), mode).toEqual(move(screen.id, 13));
        state.combat!.units.screen.position = 13;
        expect(getLegalMoveDestinations(state.combat!, ally, state).some(p =>
          canUnitMoveAndAttack(state.combat!, ally, p, enemy, state)), mode).toBe(true);
      }
    });

  it("deploys a reserved Dread Knight in front, while a flyer retains its back-row reserve", () => {
    const state = battle([]);
    state.players.p2.army = [
      { id: "knight", unitDefId: "necropolis.dread_knights", side: "pack" },
      { id: "wraith", unitDefId: "necropolis.wraiths", side: "pack" },
    ];
    const placements: GameAction[] = [13, 17].map(position => ({ type: "PLACE_COMBAT_UNIT",
      playerId: "p2", armyUnitId: "knight", position }));
    expect(decide(state, placements)).toEqual(placements[0]);
    expect(formationFitScore(state.combat!, "p2", "melee", 13, "knight", 9, 40, true))
      .toBeGreaterThan(formationFitScore(state.combat!, "p2", "melee", 17, "knight", 9, 40, true));
    expect(formationFitScore(state.combat!, "p2", "flying", 17, "dragon", 12, 50, true))
      .toBeGreaterThan(formationFitScore(state.combat!, "p2", "flying", 13, "dragon", 12, 50, true));
  });

  it("opens the knight's blocked route instead of defending the blocking Wraith", () => {
    const knight = unit("knight", "necropolis.dread_knights", 16);
    const wraith = unit("wraith", "necropolis.wraiths", 12);
    const bird = unit("bird", "stronghold.thunderbirds", 4, "p1", false);
    bird.activatedThisRound = true;
    const blocker = unit("blocker", "necropolis.skeletons", 17);
    blocker.activatedThisRound = true;
    const state = battle([knight, wraith, bird, blocker]);
    const reaches = () => getLegalMoveDestinations(state.combat!, knight, state).some(p =>
      canUnitMoveAndAttack(state.combat!, knight, p, bird, state));
    expect(reaches()).toBe(false);
    expect(getLegalMoveDestinations(state.combat!, wraith, state)).toContain(13);
    const action = decide(state, [move("wraith", 13), defend("wraith")]);
    expect(action).toEqual(move("wraith", 13));
    state.combat!.units.wraith = { ...wraith, position: 13, movedThisActivation: true };
    expect(reaches()).toBe(true);
    // CONTROL: an exhausted knight has no attack to release this round.
    state.combat!.units.wraith = wraith;
    knight.activatedThisRound = true;
    expect(decide(state, [move("wraith", 13), defend("wraith")])).toEqual(defend("wraith"));
  });

  it("moves the knight to attack a reachable Thunderbird instead of holding as a reserve", () => {
    const knight = unit("knight", "necropolis.dread_knights", 13);
    const bird = unit("bird", "stronghold.thunderbirds", 5, "p1", false);
    const decoy = unit("decoy", "stronghold.behemoths", 12, "p1");
    decoy.activatedThisRound = true;
    const state = battle([knight, bird, decoy, unit("wraith", "necropolis.wraiths", 15)]);
    expect(canUnitMoveAndAttack(state.combat!, knight, 9, bird, state)).toBe(true);
    expect(decide(state, [move("knight", 9), defend("knight")])).toEqual(move("knight", 9));
    state.combat!.units.knight = { ...knight, position: 9, movedThisActivation: true };
    expect(canUnitAttack(state.combat!, state.combat!.units.knight, bird, state.activeEffects)).toBe(true);
    expect(decide(state, [{ type: "ATTACK_UNIT", playerId: "p2", attackerId: "knight", defenderId: "bird" }, defend("knight")]).type).toBe("ATTACK_UNIT");
  });

  it("checks allied lanes for combined move-and-attack actions too", () => {
    const knight = unit("knight", "necropolis.dread_knights", 16);
    const screen = unit("screen", "necropolis.wraiths", 13);
    const wall = unit("wall", "necropolis.skeletons", 17);
    wall.activatedThisRound = true;
    const bird = unit("bird", "stronghold.thunderbirds", 8, "p1", false);
    bird.activatedThisRound = true;
    const state = battle([knight, screen, wall, bird]);
    const blocked: GameAction = { type: "MOVE_AND_ATTACK_UNIT", playerId: "p2",
      attackerId: screen.id, defenderId: bird.id, destination: 12 };
    expect(canUnitMoveAndAttack(state.combat!, screen, 12, bird, state)).toBe(true);
    expect(decide(state, [blocked, defend(screen.id)])).toEqual(defend(screen.id));
    const open: GameAction = { ...blocked, destination: 9 };
    expect(canUnitMoveAndAttack(state.combat!, screen, 9, bird, state)).toBe(true);
    expect(decide(state, [open, defend(screen.id)])).toEqual(open);
  });

  it("does not sacrifice a Ghost Dragon for half of a Behemoth Pack's first bar", () => {
    const dragon = unit("dragon", "necropolis.ghost_dragons", 9);
    const behemoth = unit("behemoth", "stronghold.behemoths", 5, "p1");
    const bird = unit("bird", "stronghold.thunderbirds", 18, "p1");
    const state = battle([dragon, behemoth, bird]);
    const attack: GameAction = { type: "ATTACK_UNIT", playerId: "p2", attackerId: dragon.id, defenderId: behemoth.id };
    expect(decide(state, [attack, defend(dragon.id)])).toEqual(defend(dragon.id));
    behemoth.activatedThisRound = true;
    bird.activatedThisRound = true;
    expect(decide(state, [attack, defend(dragon.id)])).toEqual(attack);
  });

  it("takes a level-four XP fight over sticky Far cleanup; excludes banks and no-XP guards", () => {
    const state = game();
    state.round = 10;
    const hero = Object.values(state.heroes).find(h => h.controllerId === "p2" && h.kind === "main")!;
    hero.level = 4;
    state.players.p2.army.push({ id: "gold", unitDefId: "necropolis.ghost_dragons", side: "pack" });
    state.players.p2.army.push({ id: "knight", unitDefId: "necropolis.dread_knights", side: "pack" });
    for (const card of state.players.p2.army) card.side = "pack";
    const fields = state.adventure!.fields;
    const far = { ...Object.values(state.adventure!.tiles)[0], id: "secured-far", group: "far" as const,
      faceDown: false, centerRow: 100, centerCol: 100 };
    state.adventure!.tiles[far.id] = far;
    fields["h:100:100"] = { ...fields["h:10:6"], spaceId: "h:100:100", tileInstanceId: far.id,
      location: "settlement", flagOwnerId: "p2", difficulty: 0 };
    const xp = fields["h:10:6"];
    const cleanup = fields["h:11:6"];
    xp.location = cleanup.location;
    xp.difficulty = 4;
    cleanup.difficulty = 1;
    expect(canBeatGuardedField(state, hero, xp)).toBe(true);
    const objectives = [{ kind: "guard", spaceId: cleanup.spaceId }, { kind: "guard", spaceId: xp.spaceId }] as const;
    expect(primaryMapObjective(state, hero, objectives, cleanup.spaceId)?.spaceId).toBe(xp.spaceId);
    const xpMove: GameAction = { type: "MOVE_HERO", playerId: "p2", heroId: hero.id, to: xp.spaceId };
    const cleanupMove: GameAction = { ...xpMove, to: cleanup.spaceId };
    expect(decide(state, [xpMove, cleanupMove])).toEqual(xpMove);
    xp.noExperience = true;
    expect(primaryMapObjective(state, hero, objectives, cleanup.spaceId)?.spaceId).toBe(cleanup.spaceId);
    const frontier = { kind: "explore", spaceId: "h:9:7" } as const;
    expect(primaryMapObjective(state, hero, [objectives[0], frontier], cleanup.spaceId)?.spaceId).toBe(frontier.spaceId);
    xp.noExperience = false;
    xp.location = "creature_bank";
    xp.bankId = "imp_cache";
    expect(primaryMapObjective(state, hero, objectives, cleanup.spaceId)?.spaceId).toBe(cleanup.spaceId);
  });
});
