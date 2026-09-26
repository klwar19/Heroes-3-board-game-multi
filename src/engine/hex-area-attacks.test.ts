import { describe, expect, it } from "vitest";
import { hexPosition } from "./battlefield";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { makeHexSiegeFortifications } from "./siege";
import { previewActionTargets } from "./target-preview";
import { chooseComputerAction } from "./computer/policy";
import type { GameAction, GameEvent, GameState, LegalAction, PlayerVisibleState, UnitId } from "./state";

/**
 * Hex battlefield PC area attacks (user ruling 2026-09-26, hex-area-attacks.ts):
 * "Magog and Lich on the new hex battle map: AoE like PC. The centre is still
 * the main damage, but everything around is the effect (Magog 1 damage, Lich
 * the 2-attack)" + "make them able to target AoE, not just unit click".
 * Every hex assertion has a 4×5 CONTROL where the printed pick-one rule (or no
 * aimed shot at all) diverges, so removing the hex branch fails the test.
 */

const hex = (column: number, row: number): number => {
  const position = hexPosition(column, row);
  if (position === null) throw new Error(`off board ${column},${row}`);
  return position;
};

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass every instant window and keep every offered attack roll. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: 0
      });
    }
  }
  return current;
}

const UNIT_IDS = [
  "unit_p1_marksmen",
  "unit_p1_griffins",
  "unit_p1_crusaders",
  "unit_p2_skeletons",
  "unit_p2_vampires",
  "unit_p2_dread_knights"
] as const;
type DemoUnitId = (typeof UNIT_IDS)[number];

/**
 * p1's Marksmen become the tested shooter (`abilityId`), active; every other
 * printed ability is cleared, every body is sturdy and Defense 0 so a Death
 * Cloud strike (Attack 2, die 0) always lands 2 damage.
 */
function shooterCombat(
  seed: string,
  abilityId: string,
  place: Record<DemoUnitId, number>,
  hexBoard = true
): GameState {
  const state = createInitialGameState(seed, hexBoard ? { hexBattlefield: true } : {});
  expect(state.combat?.geometry ?? "grid").toBe(hexBoard ? "hex" : "grid");
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.obstacles = [];
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  for (const id of UNIT_IDS) {
    const unit = state.combat!.units[id];
    expect(unit, id).toBeTruthy();
    unit.position = place[id];
    unit.damage = 0;
    unit.maxHealth = 20;
    unit.defense = 0;
    unit.abilities = [];
    unit.activatedThisRound = false;
  }
  const shooter = state.combat!.units.unit_p1_marksmen;
  shooter.abilities = [abilityId];
  shooter.type = "ranged";
  shooter.attack = 1;
  return state;
}

const damage = (state: GameState, unitId: UnitId) => state.combat!.units[unitId].damage;

const areaEvents = (state: GameState) =>
  state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "HEX_AREA_ATTACK" }> => event.type === "HEX_AREA_ATTACK"
  );

const cloudDeclarations = (state: GameState, abilityId = "lich-death-cloud") =>
  state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> =>
      event.type === "UNIT_ATTACK_DECLARED" && event.abilityAttack?.abilityId === abilityId
  );

const abilityChoicesOpened = (state: GameState) =>
  state.eventLog.filter(
    (event) => event.type === "PENDING_CHOICE_CREATED" && event.choiceType === "ABILITY_TARGET_CHOICE"
  ).length;

const shoot = (state: GameState, defenderId: UnitId): GameState =>
  settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId }));

/**
 * Hex layout: the shooter far left; the target Skeletons at E7 (column 6,
 * row 4) with the enemy Vampires east of it and p1's own Crusaders west of it
 * (both in its ring); Griffins / Dread Knights far away.
 */
const RING_LAYOUT: Record<DemoUnitId, number> = {
  unit_p1_marksmen: hex(1, 4),
  unit_p1_griffins: hex(2, 8),
  unit_p1_crusaders: hex(5, 4),
  unit_p2_skeletons: hex(6, 4),
  unit_p2_vampires: hex(7, 4),
  unit_p2_dread_knights: hex(10, 0)
};

/**
 * 4×5 CONTROL layout (position = row × 4 + column): shooter at 1, target
 * Skeletons at 13 with Vampires (14) and Crusaders (12) beside it.
 */
const GRID_RING_LAYOUT: Record<DemoUnitId, number> = {
  unit_p1_marksmen: 1,
  unit_p1_griffins: 3,
  unit_p1_crusaders: 12,
  unit_p2_skeletons: 13,
  unit_p2_vampires: 14,
  unit_p2_dread_knights: 18
};

describe("hex battlefield: Magog Fireball hits the whole ring", () => {
  it("every unit around the target — friend and foe — takes 1, with no pick", () => {
    const state = shoot(shooterCombat("hex-magog-ring", "magog-fireball-splash", RING_LAYOUT), "unit_p2_skeletons");
    expect(state.pendingChoice).toBeFalsy();
    expect(abilityChoicesOpened(state)).toBe(0);
    expect(damage(state, "unit_p2_vampires")).toBe(1);
    expect(damage(state, "unit_p1_crusaders")).toBe(1);
    expect(damage(state, "unit_p2_dread_knights")).toBe(0);
    expect(damage(state, "unit_p1_griffins")).toBe(0);
    const [area] = areaEvents(state);
    expect(area).toMatchObject({
      attackerId: "unit_p1_marksmen",
      abilityId: "magog-fireball-splash",
      centre: hex(6, 4),
      centreUnitId: "unit_p2_skeletons",
      // Board order: E6 (Crusaders) before E8 (Vampires).
      struckUnitIds: ["unit_p1_crusaders", "unit_p2_vampires"]
    });
  });

  it("CONTROL (4×5): the printed splash still asks for ONE unit", () => {
    const state = shoot(
      shooterCombat("grid-magog-ring", "magog-fireball-splash", GRID_RING_LAYOUT, false),
      "unit_p2_skeletons"
    );
    expect(state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(damage(state, "unit_p2_vampires") + damage(state, "unit_p1_crusaders")).toBe(0);
    expect(areaEvents(state)).toHaveLength(0);
  });

  it("the target preview reports the ring as certain splash on hex, a pick on the grid", () => {
    const hexState = shooterCombat("hex-magog-preview", "magog-fireball-splash", RING_LAYOUT);
    const attack: GameAction = {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    };
    const onHex = previewActionTargets(hexState, attack);
    expect(new Set(onHex?.splashUnitIds)).toEqual(new Set(["unit_p1_crusaders", "unit_p2_vampires"]));
    expect(onHex?.cells).toContain(hex(7, 4));
    const onGrid = previewActionTargets(
      shooterCombat("grid-magog-preview", "magog-fireball-splash", GRID_RING_LAYOUT, false),
      attack
    );
    expect(onGrid?.splashUnitIds ?? []).toEqual([]);
    expect(new Set(onGrid?.possibleUnitIds)).toEqual(new Set(["unit_p1_crusaders", "unit_p2_vampires"]));
  });
});

describe("hex battlefield: Death Cloud attacks the whole ring, one after another", () => {
  it("each unit around the target gets its own Attack-2 strike, sequentially, with no pick", () => {
    const state = shoot(shooterCombat("hex-lich-ring", "lich-death-cloud", RING_LAYOUT), "unit_p2_skeletons");
    expect(state.pendingChoice).toBeFalsy();
    expect(abilityChoicesOpened(state)).toBe(0);
    const clouds = cloudDeclarations(state);
    expect(clouds.map((event) => event.defenderId)).toEqual(["unit_p1_crusaders", "unit_p2_vampires"]);
    expect(clouds.every((event) => event.abilityAttack?.baseAttack === 2)).toBe(true);
    // 2 Attack + die 0 vs Defense 0.
    expect(damage(state, "unit_p1_crusaders")).toBe(2);
    expect(damage(state, "unit_p2_vampires")).toBe(2);
    expect(damage(state, "unit_p2_dread_knights")).toBe(0);
    // Sequential: the second cloud is declared only after the first has rolled.
    const firstRoll = state.eventLog.findIndex(
      (event) => event.type === "ATTACK_ROLLED" && event.defenderId === "unit_p1_crusaders"
    );
    const secondDeclared = state.eventLog.indexOf(clouds[1]);
    expect(firstRoll).toBeGreaterThan(-1);
    expect(secondDeclared).toBeGreaterThan(firstRoll);
    expect(areaEvents(state)[0]?.struckUnitIds).toEqual(["unit_p1_crusaders", "unit_p2_vampires"]);
  });

  it("CONTROL (4×5): the printed Death Cloud still asks for ONE unit", () => {
    const state = shoot(
      shooterCombat("grid-lich-ring", "lich-death-cloud", GRID_RING_LAYOUT, false),
      "unit_p2_skeletons"
    );
    expect(state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(cloudDeclarations(state)).toHaveLength(0);
  });

  it("scope: another second-attack ability (Royal Artillery) keeps its pick on hex", () => {
    const state = shoot(
      shooterCombat("hex-royal-artillery", "kivotos-royal-artillery", RING_LAYOUT),
      "unit_p2_skeletons"
    );
    expect(state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(areaEvents(state)).toHaveLength(0);
    expect(
      getLegalActions(shooterCombat("hex-royal-artillery-offers", "kivotos-royal-artillery", RING_LAYOUT), "p1").some(
        (legal) => legal.action.type === "ATTACK_HEX"
      )
    ).toBe(false);
  });
});

/**
 * Aimed-shot layout: the empty hex E9 (column 8, row 4) has the Vampires
 * (north-west of it) and the Skeletons (east) in its ring; the Dread Knights
 * stand two hexes from the shooter, so the hex between them is in their ring
 * but touches the shooter.
 */
const AIM_LAYOUT: Record<DemoUnitId, number> = {
  unit_p1_marksmen: hex(1, 4),
  unit_p1_griffins: hex(2, 8),
  unit_p1_crusaders: hex(4, 0),
  unit_p2_skeletons: hex(9, 4),
  unit_p2_vampires: hex(8, 3),
  unit_p2_dread_knights: hex(3, 3)
};

const aimedShot = (state: GameState, position: number) =>
  getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "ATTACK_HEX" && legal.action.position === position
  );

describe("hex battlefield: Magog / Lich may aim at an empty hex", () => {
  it("offers empty hexes whose ring holds a unit, never one touching the shooter, never on the grid", () => {
    const state = shooterCombat("hex-aim-offers", "magog-fireball-splash", AIM_LAYOUT);
    const offer = aimedShot(state, hex(8, 4));
    expect(offer).toBeTruthy();
    expect(offer!.label).toContain("hits 2 units");
    // E3 touches the shooter (E2) although the Dread Knights are in its ring.
    expect(aimedShot(state, hex(2, 4))).toBeUndefined();
    // An occupied hex is an ATTACK_UNIT, not an aimed shot.
    expect(aimedShot(state, hex(9, 4))).toBeUndefined();
    const grid = shooterCombat("grid-aim-offers", "magog-fireball-splash", GRID_RING_LAYOUT, false);
    expect(getLegalActions(grid, "p1").some((legal) => legal.action.type === "ATTACK_HEX")).toBe(false);
  });

  it("Magog: the aimed Fireball deals 1 to every unit around the hex and spends the attack", () => {
    let state = shooterCombat("hex-aim-magog", "magog-fireball-splash", AIM_LAYOUT);
    state = settle(applyOk(state, aimedShot(state, hex(8, 4))!.action));
    expect(damage(state, "unit_p2_vampires")).toBe(1);
    expect(damage(state, "unit_p2_skeletons")).toBe(1);
    expect(damage(state, "unit_p2_dread_knights")).toBe(0);
    // No primary defender: nothing rolled, nothing retaliated.
    expect(state.eventLog.some((event) => event.type === "ATTACK_ROLLED")).toBe(false);
    const [area] = areaEvents(state);
    expect(area.centre).toBe(hex(8, 4));
    expect(area.centreUnitId).toBeUndefined();
    expect(area.struckUnitIds).toEqual(["unit_p2_vampires", "unit_p2_skeletons"]);
    expect(state.combat!.units.unit_p1_marksmen.attackedThisActivation).toBe(true);
    const after = getLegalActions(state, "p1");
    expect(after.some((legal) => legal.action.type === "ATTACK_UNIT" || legal.action.type === "ATTACK_HEX")).toBe(false);
  });

  it("Lich: the aimed Death Cloud attacks every unit around the hex in turn", () => {
    let state = shooterCombat("hex-aim-lich", "lich-death-cloud", AIM_LAYOUT);
    state = settle(applyOk(state, aimedShot(state, hex(8, 4))!.action));
    expect(state.pendingChoice).toBeFalsy();
    expect(cloudDeclarations(state).map((event) => event.defenderId)).toEqual([
      "unit_p2_vampires",
      "unit_p2_skeletons"
    ]);
    expect(damage(state, "unit_p2_vampires")).toBe(2);
    expect(damage(state, "unit_p2_skeletons")).toBe(2);
    expect(state.eventLog.some((event) => event.type === "RETALIATION_ATTACKED")).toBe(false);
    expect(state.combat!.attackSequence ?? null).toBeNull();
  });
});

/**
 * User ruling 2026-09-26: "Siege walls: let's not make Magog AoE shoot affect
 * it, only the main at centre counts." The besieger (p1) shoots next to the
 * defender's Wall 2 (column 10, row 2 — the same row, so always in the ring).
 * Before the ruling the blast felled that Wall (the pick-one splash house
 * rule's Wall/Gate option), so each assertion fails on the old behaviour.
 */
function siegeShooterCombat(seed: string, place: Record<DemoUnitId, number>): GameState {
  const state = shooterCombat(seed, "magog-fireball-splash", place);
  state.combat!.siege = { townPlayerId: "p2", arrowTowerUnitId: null, ...makeHexSiegeFortifications() };
  return state;
}

const WALL_2 = hex(10, 2);

const fortificationsFelled = (state: GameState) =>
  state.eventLog.filter((event) => event.type === "FORTIFICATION_DESTROYED").length;

describe("hex battlefield: Magog Fireball leaves siege walls standing", () => {
  it("a Wall in the ring around the struck unit stays; the units there are still hit", () => {
    let state = siegeShooterCombat("hex-magog-wall", {
      ...RING_LAYOUT,
      unit_p2_vampires: hex(9, 2),
      unit_p2_skeletons: hex(8, 2),
      // Off Wall 1 (RING_LAYOUT parks them on its hex), behind the walls.
      unit_p2_dread_knights: hex(11, 6)
    });
    const walls = [...state.combat!.siege!.walls];
    expect(walls).toContain(WALL_2);
    state = shoot(state, "unit_p2_vampires");
    expect(damage(state, "unit_p2_skeletons")).toBe(1);
    expect(state.pendingChoice?.type).not.toBe("ABILITY_TARGET_CHOICE");
    expect(state.combat!.siege!.walls).toEqual(walls);
    expect(fortificationsFelled(state)).toBe(0);
  });

  it("an aimed Fireball next to a Wall strikes the unit there and leaves the Wall", () => {
    let state = siegeShooterCombat("hex-magog-wall-aim", {
      ...RING_LAYOUT,
      unit_p2_vampires: hex(6, 7),
      unit_p2_skeletons: hex(8, 2),
      unit_p2_dread_knights: hex(11, 6)
    });
    const walls = [...state.combat!.siege!.walls];
    const offer = aimedShot(state, hex(9, 2));
    expect(offer).toBeTruthy();
    state = settle(applyOk(state, offer!.action));
    expect(damage(state, "unit_p2_skeletons")).toBe(1);
    expect(state.combat!.siege!.walls).toEqual(walls);
    expect(fortificationsFelled(state)).toBe(0);
  });
});

/**
 * A lethal save that cancels the LAST Death Cloud strike of the ring must not
 * swallow the rest of the attack: the primary target's parked Retaliation
 * still fires and the attack sequence closes, exactly as when that strike
 * lands (or when an earlier ring strike is the cancelled one).
 */
describe("hex battlefield: a saved ring strike does not swallow the parked retaliation", () => {
  /**
   * The Lich stands next to its target (a melee-kind shot, so the Skeletons
   * owe a Retaliation). The ring = the Lich itself (E6) then the Vampires (E8);
   * p2's Dread Knights carry the Archangel save.
   */
  function adjacentCloud(seed: string, vampiresDamage: number): GameState {
    const state = shooterCombat(seed, "lich-death-cloud", {
      ...RING_LAYOUT,
      unit_p1_marksmen: hex(5, 4),
      unit_p1_crusaders: hex(0, 0)
    });
    state.combat!.units.unit_p2_vampires.damage = vampiresDamage;
    state.combat!.units.unit_p2_dread_knights.abilities = ["archangel-lethal-save"];
    return state;
  }

  /** settle(), but p2 spends the Archangel save in a lethal-hit window. */
  function settleWithSave(state: GameState): GameState {
    let current = state;
    let safety = 80;
    while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
      safety -= 1;
      const window = current.reactionWindow;
      if (window) {
        const save =
          window.triggerEvent.type === "UNIT_LETHAL_HIT"
            ? (window.legalReactions[window.priorityPlayerId] ?? []).find(
                (legal) => legal.action.type === "USE_UNIT_RESURRECTION"
              )
            : undefined;
        current = applyOk(current, save ? save.action : { type: "PASS_REACTION", playerId: window.priorityPlayerId });
        continue;
      }
      current = settle(current);
    }
    return current;
  }

  const skeletonRetaliations = (state: GameState) =>
    state.eventLog.filter(
      (event) =>
        event.type === "UNIT_ATTACK_DECLARED" &&
        event.isRetaliation &&
        event.attackerId === "unit_p2_skeletons"
    ).length;

  const strike = (state: GameState): GameState =>
    settleWithSave(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );

  it("CONTROL: with no save the ring lands and the Skeletons retaliate afterwards", () => {
    const state = strike(adjacentCloud("hex-cloud-nosave", 0));
    expect(cloudDeclarations(state).map((event) => event.defenderId)).toEqual([
      "unit_p1_marksmen",
      "unit_p2_vampires"
    ]);
    expect(damage(state, "unit_p2_vampires")).toBe(2);
    expect(skeletonRetaliations(state)).toBe(1);
    expect(state.combat!.attackSequence ?? null).toBeNull();
  });

  it("the last ring strike is saved: the Vampires live, the Skeletons still retaliate", () => {
    const state = strike(adjacentCloud("hex-cloud-save", 19));
    expect(cloudDeclarations(state).map((event) => event.defenderId)).toEqual([
      "unit_p1_marksmen",
      "unit_p2_vampires"
    ]);
    expect(state.combat!.units.unit_p2_dread_knights.usedLethalSaveThisCombat).toBe(true);
    expect(damage(state, "unit_p2_vampires")).toBe(19);
    expect(skeletonRetaliations(state)).toBe(1);
    expect(state.combat!.attackSequence ?? null).toBeNull();
  });
});

/**
 * Hover preview = what the action affects: the Death Cloud fells every ENEMY
 * Wall / Gate card touching its ring, whole (Wall 1 = column 10 rows 0-1, the
 * Gate = four hexes down to column 10 row 5). Target: the Vampires at column 9
 * row 2, whose ring touches Wall 1's lower hex, Wall 2 and the Gate. The
 * Magog blast (CONTROL) leaves them standing and never marks the far hexes.
 */
describe("hex battlefield: the Death Cloud preview marks the walls it fells", () => {
  const WALL_1_TOP = hex(10, 0);
  const GATE_BOTTOM = hex(10, 5);
  function siegeCloud(seed: string, abilityId: string): GameState {
    const state = shooterCombat(seed, abilityId, {
      ...RING_LAYOUT,
      unit_p2_vampires: hex(9, 2),
      unit_p2_skeletons: hex(6, 7),
      unit_p2_dread_knights: hex(12, 8)
    });
    state.combat!.siege = { townPlayerId: "p2", arrowTowerUnitId: null, ...makeHexSiegeFortifications() };
    return state;
  }
  const attackVampires: GameAction = {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_marksmen",
    defenderId: "unit_p2_vampires"
  };

  it("unit-targeted cloud: the preview holds each felled card's far hexes, and the reducer fells exactly those", () => {
    const state = siegeCloud("hex-cloud-preview", "lich-death-cloud");
    const cells = previewActionTargets(state, attackVampires)?.cells ?? [];
    expect(cells).toContain(WALL_1_TOP);
    expect(cells).toContain(GATE_BOTTOM);
    const after = shoot(state, "unit_p2_vampires");
    expect(after.combat!.siege!.walls).not.toContain(WALL_1_TOP);
    expect(after.combat!.siege!.gatePosition).toBeNull();
  });

  it("aimed cloud: the preview holds the felled card's far hexes too", () => {
    const state = siegeCloud("hex-cloud-aim-preview", "lich-death-cloud");
    // Column 9 row 1 is empty, touches Wall 1 and has the Vampires in its ring.
    const offer = aimedShot(state, hex(9, 1));
    expect(offer).toBeTruthy();
    const cells = previewActionTargets(state, offer!.action)?.cells ?? [];
    expect(cells).toContain(WALL_1_TOP);
    const after = settle(applyOk(state, offer!.action));
    expect(after.combat!.siege!.walls).not.toContain(WALL_1_TOP);
  });

  it("CONTROL: the Magog preview never marks them, and they stand", () => {
    const state = siegeCloud("hex-magog-preview-walls", "magog-fireball-splash");
    const cells = previewActionTargets(state, attackVampires)?.cells ?? [];
    expect(cells).not.toContain(WALL_1_TOP);
    expect(cells).not.toContain(GATE_BOTTOM);
    const after = shoot(state, "unit_p2_vampires");
    expect(after.combat!.siege!.walls).toContain(WALL_1_TOP);
    expect(after.combat!.siege!.gatePosition).not.toBeNull();
  });
});

/**
 * Computer policy: an aimed blast that is not a clean multi-enemy hit is the
 * "skip" case — it must lose to simply holding (END_ACTIVATION), never fire
 * into the AI's own unit.
 */
describe("computer: aimed Fireball priorities on hex", () => {
  const decide = (state: GameState, legal: LegalAction[]) =>
    chooseComputerAction({
      playerId: "p1",
      state: state as unknown as PlayerVisibleState,
      legalActions: legal
    })?.action;

  it("holds instead of aiming at a hex whose ring holds only its own unit", () => {
    const state = shooterCombat("hex-ai-aim-own", "magog-fireball-splash", AIM_LAYOUT);
    const hold = getLegalActions(state, "p1").find((legal) => legal.action.type === "END_ACTIVATION");
    // Column 5, row 0: its ring holds only p1's own Crusaders (column 4, row 0).
    const ownOnly = aimedShot(state, hex(5, 0));
    expect(hold).toBeTruthy();
    expect(ownOnly?.label).toContain("hits 1 unit");
    expect(decide(state, [ownOnly!, hold!])).toEqual(hold!.action);
  });

  it("CONTROL: a clean two-enemy blast is taken over holding", () => {
    const state = shooterCombat("hex-ai-aim-clean", "magog-fireball-splash", AIM_LAYOUT);
    const hold = getLegalActions(state, "p1").find((legal) => legal.action.type === "END_ACTIVATION");
    const clean = aimedShot(state, hex(8, 4));
    expect(decide(state, [clean!, hold!])).toEqual(clean!.action);
  });

  /**
   * A unit-targeted Fireball at the Skeletons (column 6, row 4). `friendly`:
   * p1's Crusaders and Griffins stand in its ring on their last Health (Few
   * side, so the 1 damage removes them); otherwise only the enemy Vampires do.
   */
  function targetedShot(seed: string, friendly: boolean) {
    const state = shooterCombat(seed, "magog-fireball-splash", {
      ...RING_LAYOUT,
      unit_p1_crusaders: friendly ? hex(5, 4) : hex(0, 0),
      unit_p1_griffins: friendly ? hex(6, 3) : hex(0, 8),
      unit_p2_vampires: friendly ? hex(11, 8) : hex(7, 4)
    });
    if (friendly) {
      for (const id of ["unit_p1_crusaders", "unit_p1_griffins"] as const) {
        const unit = state.combat!.units[id];
        unit.variant = "few";
        unit.attack = 30;
        unit.damage = unit.maxHealth - 1;
      }
    }
    const legal = getLegalActions(state, "p1");
    const hold = legal.find((entry) => entry.action.type === "END_ACTIVATION");
    const attack = legal.find(
      (entry) => entry.action.type === "ATTACK_UNIT" && entry.action.defenderId === "unit_p2_skeletons"
    );
    expect(hold).toBeTruthy();
    expect(attack).toBeTruthy();
    return { state, hold: hold!, attack: attack! };
  }

  it("a unit-targeted shot whose ring would kill its own units does not beat holding", () => {
    const { state, hold, attack } = targetedShot("hex-ai-ring-friendly", true);
    expect(decide(state, [attack, hold])).toEqual(hold.action);
  });

  it("CONTROL: the same shot with a clean ring (only an enemy beside the target) is taken", () => {
    const { state, hold, attack } = targetedShot("hex-ai-ring-clean", false);
    expect(decide(state, [attack, hold])).toEqual(attack.action);
  });
});
