import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, getMainHero } from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { getBattlefieldDistance, getOrthogonalNeighbors } from "./battlefield";
import type { CombatState, GameAction, GameState } from "./state";

/**
 * Isra's Necromancy IV (specialty.isra.4) — "When: On your turn, return your
 * units removed during this Combat to empty spaces (except Pack, Gold, and
 * Neutral units)."
 *
 *  - Reported 2026-09-30: "does not work at all". Cause: the removed-unit read
 *    demanded the ARMY CARD be Few, so a Pack card that was flipped to Few and
 *    then destroyed (every Pack death) could never return.
 *  - Placement ruling 2026-09-30: back to its OLD space; if that is taken, the
 *    nearest empty spaces only.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passWindows(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 10 && next.reactionWindow; guard += 1) {
    const pass = (["p1", "p2"] as const)
      .flatMap((playerId) => getLegalActions(next, playerId))
      .find((legal) => legal.action.type === "PASS_REACTION");
    if (!pass) break;
    next = applyOk(next, pass.action);
  }
  return next;
}

/**
 * p1's Griffins (on `side`, bronze) stand on cell 12 and are destroyed by a
 * real Skeletons attack; then it is p1's turn with Isra IV in hand.
 */
function griffinsKilled(side: "few" | "pack", options: { hex?: boolean } = {}): { state: GameState; oldSpace: number } {
  const state = createInitialGameState(`isra-return-${side}`, { hexBattlefield: options.hex });
  const units = state.combat!.units;
  state.players.p1.army = Object.values(units)
    .filter((unit) => unit.controllerId === "p1")
    .map((unit) => ({ id: unit.armyUnitId!, unitDefId: unit.unitDefId!, side }));
  for (const unit of Object.values(units)) {
    if (unit.controllerId === "p1") unit.variant = side;
  }
  state.players.p1.hand = ["specialty.isra.4"];
  state.players.p2.hand = [];
  const griffins = units.unit_p1_griffins;
  const skeletons = units.unit_p2_skeletons;
  const oldSpace = getOrthogonalNeighbors(skeletons.position).find(
    (cell) => !Object.values(units).some((unit) => unit.position === cell),
  )!;
  griffins.position = oldSpace;
  griffins.defense = 0;
  griffins.abilities = [];
  skeletons.attack = 12; // enough to flip a Pack and carry through its Few side
  skeletons.abilities = [];
  skeletons.activatedThisRound = false;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = skeletons.id;
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  let next = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: skeletons.id, defenderId: griffins.id });
  next = passWindows(next);
  const dead = next.combat!.units.unit_p1_griffins;
  expect(dead.damage, "the Griffins were destroyed").toBeGreaterThanOrEqual(dead.maxHealth);
  // p1's turn: the Marksmen activate.
  next.activePlayerId = "p1";
  next.combat!.activeUnitId = "unit_p1_marksmen";
  next.combat!.units.unit_p1_marksmen.activatedThisRound = false;
  next.combat!.units.unit_p1_marksmen.attackedThisActivation = false;
  return { state: next, oldSpace };
}

const israPlay = (state: GameState) =>
  getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.isra.4",
  );

/** Plays Isra IV and picks the Griffins; returns the state after that pick. */
function playAndPickGriffins(state: GameState): GameState {
  const play = israPlay(state);
  expect(play, "Isra IV is offered on p1's turn").toBeTruthy();
  let next = applyOk(state, play!.action);
  const choice = next.pendingChoice;
  expect(choice?.type === "OPTION_CHOICE" && choice.context === "isra-return-unit").toBe(true);
  if (choice?.type !== "OPTION_CHOICE" || !choice.israReturnUnit) throw new Error("no Isra choice");
  const index = choice.israReturnUnit.unitIds.indexOf("unit_p1_griffins");
  expect(index).toBeGreaterThanOrEqual(0);
  next = applyOk(next, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: index });
  return next;
}

describe("Isra's Necromancy IV — returning removed units", () => {
  it("REPORTED BUG: a Pack card flipped to Few and then destroyed can return (it was a Few unit when removed)", () => {
    const { state, oldSpace } = griffinsKilled("pack");
    expect(state.eventLog.some((event) => event.type === "UNIT_FLIPPED" && event.unitId === "unit_p1_griffins")).toBe(true);
    const next = playAndPickGriffins(state);
    const griffins = next.combat!.units.unit_p1_griffins;
    expect(griffins.damage).toBe(0);
    expect(griffins.position).toBe(oldSpace);
    expect(griffins.variant).toBe("few");
    expect(next.pendingChoice).toBeNull();
    expect(next.phase).toBe("combat");
  });

  it("CONTROL: a Gold unit (Dread Knights) is never offered; a Neutral-deck card is never offered", () => {
    const { state } = griffinsKilled("few");
    const knights = state.combat!.units.unit_p2_dread_knights;
    // Hand p1 a destroyed Gold Few unit and a destroyed Neutral-card unit.
    knights.controllerId = "p1";
    knights.armyUnitId = "army_gold";
    knights.variant = "few";
    knights.damage = knights.maxHealth;
    state.players.p1.army.push({ id: "army_gold", unitDefId: knights.unitDefId!, side: "few" });
    const griffinsCard = state.players.p1.army.find((card) => card.id === "army_unit_p1_griffins")!;
    griffinsCard.side = "neutral";
    state.combat!.units.unit_p1_griffins.variant = "neutral";
    expect(israPlay(state), "nothing returnable → no offer").toBeFalsy();
  });

  it("old space free: the unit goes straight back to it; the other empty spaces are NOT offered", () => {
    const { state, oldSpace } = griffinsKilled("few");
    const next = playAndPickGriffins(state);
    // Placed at once (single candidate) — the old read opened a pick over every
    // empty space on the board.
    expect(next.pendingChoice).toBeNull();
    expect(next.combat!.units.unit_p1_griffins.position).toBe(oldSpace);
    expect(next.combat!.units.unit_p1_griffins.damage).toBe(0);
  });

  it("old space taken: only the NEAREST empty spaces are offered (a far empty space is not)", () => {
    const { state, oldSpace } = griffinsKilled("few");
    // A friendly unit now stands on the Griffins' old space.
    state.combat!.units.unit_p1_crusaders.position = oldSpace;
    let next = playAndPickGriffins(state);
    const choice = next.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || !choice.israReturnUnit?.positions) throw new Error("no space choice");
    const positions = choice.israReturnUnit.positions;
    const occupied = new Set([
      ...Object.values(next.combat!.units).filter((unit) => unit.damage < unit.maxHealth).map((unit) => unit.position),
      ...(next.combat!.obstacles ?? []),
    ]);
    const nearestFree = getOrthogonalNeighbors(oldSpace).filter((cell) => !occupied.has(cell));
    expect(nearestFree.length).toBeGreaterThan(0);
    expect([...positions].sort((a, b) => a - b)).toEqual([...nearestFree].sort((a, b) => a - b));
    // CONTROL: an empty space farther away exists but is not offered.
    const farFree = Array.from({ length: 20 }, (_, cell) => cell).find(
      (cell) => !occupied.has(cell) && getBattlefieldDistance(oldSpace, cell) > 1,
    );
    expect(farFree).toBeDefined();
    expect(positions).not.toContain(farFree);
    expect(positions).not.toContain(oldSpace);

    next = applyOk(next, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(next.combat!.units.unit_p1_griffins.position).toBe(positions[0]);
    expect(next.combat!.units.unit_p1_griffins.damage).toBe(0);
  });

  it("hex board: old space taken → the free hexes at the smallest hex distance only", () => {
    const { state, oldSpace } = griffinsKilled("few", { hex: true });
    state.combat!.units.unit_p1_crusaders.position = oldSpace;
    const next = playAndPickGriffins(state);
    const choice = next.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || !choice.israReturnUnit?.positions) throw new Error("no space choice");
    const positions = choice.israReturnUnit.positions;
    expect(positions.length).toBeGreaterThan(0);
    expect(positions.every((cell) => getBattlefieldDistance(oldSpace, cell) === 1)).toBe(true);
    expect(positions).not.toContain(oldSpace);
  });
});

/**
 * Ruling 2026-10-01: a Pack unit that dies returns through Isra IV as its FEW
 * side. After the battle, a PvP fight in the lobby's no-casualty mode ("Keep
 * troops") keeps the army card as Pack; every other fight keeps only the Few.
 */
describe("Isra's Necromancy IV — the returned Pack card after the battle", () => {
  /** Ends the battle as a won PvP fight (p1 beats p2) with the given combat board. */
  function settlePvp(combat: CombatState, pvpTroopLoss: "normal" | "none"): GameState {
    const game = createAdventureGameState({
      seed: "isra-return-settle",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      pvpTroopLoss,
      players: [
        { id: "p1", name: "Isra", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      ],
    });
    const attacker = getMainHero(game, "p1")!;
    const defender = getMainHero(game, "p2")!;
    defender.spaceId = attacker.spaceId;
    game.players.p1.army = [{ id: "army_unit_p1_griffins", unitDefId: "castle.griffins", side: "pack" }];
    game.players.p2.army = [];
    const units = Object.fromEntries(
      Object.entries(combat.units).filter(([, unit]) => unit.id === "unit_p1_griffins"),
    );
    game.combat = {
      ...combat,
      units,
      context: { kind: "player", attackerHeroId: attacker.id, defenderHeroId: defender.id, fieldId: attacker.spaceId },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "p2", reason: "all-enemy-units-defeated" },
    } as CombatState;
    finalizeAdventureCombat(game);
    return game;
  }

  const griffinsCard = (game: GameState) =>
    game.players.p1.army.find((card) => card.id === "army_unit_p1_griffins");

  it("losing-troop PvP: the Pack died and returned as Few → the army card is Few", () => {
    const returned = playAndPickGriffins(griffinsKilled("pack").state);
    expect(returned.combat!.units.unit_p1_griffins.variant).toBe("few");
    expect(griffinsCard(settlePvp(returned.combat!, "normal"))?.side).toBe("few");
  });

  it("no-casualty PvP mode: the same returned Pack is kept as Pack", () => {
    const returned = playAndPickGriffins(griffinsKilled("pack").state);
    expect(griffinsCard(settlePvp(returned.combat!, "none"))?.side).toBe("pack");
  });

  it("CONTROL: not returned, the dead Pack leaves the army in losing-troop mode", () => {
    const { state } = griffinsKilled("pack");
    expect(griffinsCard(settlePvp(state.combat!, "normal"))).toBeUndefined();
  });
});
