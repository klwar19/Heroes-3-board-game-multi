import { describe, expect, it } from "vitest";

import { LUCKY_E_SPECIALTY_SOURCES } from "@/data/cards/adventure";
import { commanderDefinitions } from "@/data/commanders";
import { unitAbilities } from "@/data/units/abilities";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  makeCommanderCombatUnit
} from "./index";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId, UnitId } from "./state";

/**
 * Azur Lane Naval Base — the 2026-07 upgrade's FOUR bespoke mechanics, each
 * pinned by an OBSERVABLE combat outcome with a CONTROL (CLAUDE.md §1a):
 *
 *  1. `kansen-full-barrage` — AFTER_ATTACK_SPLASH anchored on the attack's
 *     TARGET, enemies only (printed on Honolulu's Pack; Laffey's veterancy
 *     signature). The Chakra Burst around-self read is the anchor CONTROL.
 *  2. `kansen-fleet-formation` — ADJACENT_ALLY_ATTACK_AURA: +1 Attack on a
 *     friendly unit's OWN declared attack while adjacent to the carrier
 *     (Unicorn's veterancy signature). Never on a Retaliation Attack, never
 *     the carrier itself.
 *  3. Belfast "Royal Salvo" — the `enemy-damage` commander cast: flat effect
 *     damage to an enemy unit, adjacent-only below Power 1, 2 damage at
 *     Power 2, once per combat round.
 *  4. Enterprise "Lucky E" — held specialty levels join the Attack-die reroll
 *     window: I/VI a reroll, IV/VI a set-die-to-"+1"; taking a half discards
 *     the card, and VI's two halves share one card (spending either retires
 *     the other).
 *
 * Board: 4 columns × 5 rows (positions 0–19), orthogonal adjacency.
 */

const BARRAGE = "kansen-full-barrage";
const AURA = "kansen-fleet-formation";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Drain reaction windows and keep the ORIGINAL roll in any reroll window. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 80;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

type UnitOverrides = {
  position?: number;
  controllerId?: PlayerId;
  abilities?: string[];
  attack?: number;
  defense?: number;
  maxHealth?: number;
  damage?: number;
  type?: CombatUnitState["type"];
  variant?: CombatUnitState["variant"];
};

/** Combat sandbox, empty hands, scripted "0" dice → damage = attack − defense. */
function freshCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 40 }, () => 0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function place(state: GameState, id: string, overrides: UnitOverrides): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, overrides);
  return unit;
}

function unitAt(state: GameState, id: string): CombatUnitState {
  return state.combat!.units[id];
}

function attack(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId })
  );
}

/** Declare the attack but STOP at the reroll window (reactions passed). */
function attackToRerollWindow(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  let current = applyOk(state, { type: "ATTACK_UNIT", playerId: attacker.controllerId, attackerId, defenderId });
  let safety = 40;
  while (safety > 0 && current.reactionWindow) {
    safety -= 1;
    current = passAllReactions(current);
  }
  return current;
}

function barrageEvents(state: GameState): GameEvent[] {
  return state.eventLog.filter(
    (event: GameEvent) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === BARRAGE
  );
}

function wasRemoved(state: GameState, id: UnitId): boolean {
  return state.eventLog.some((event: GameEvent) => event.type === "UNIT_REMOVED" && event.unitId === id);
}

// ---------------------------------------------------------------------------
// registration
// ---------------------------------------------------------------------------

describe("kansen arms — registration", () => {
  it("full-barrage is an implemented around-target, enemies-only AFTER_ATTACK_SPLASH", () => {
    const ability = unitAbilities[BARRAGE];
    expect(ability?.implementationStatus).toBe("implemented");
    expect(ability.effect).toEqual({
      type: "AFTER_ATTACK_SPLASH",
      amount: 1,
      around: "target",
      enemiesOnly: true
    });
  });

  it("fleet-formation is an implemented ADJACENT_ALLY_ATTACK_AURA { amount: 1 }", () => {
    const ability = unitAbilities[AURA];
    expect(ability?.implementationStatus).toBe("implemented");
    expect(ability.effect).toEqual({ type: "ADJACENT_ALLY_ATTACK_AURA", amount: 1 });
  });

  it("Honolulu's real Pack data carries full-barrage (the printed-side wiring under test)", () => {
    expect(coreUnitDefinitions["azur_lane.honolulu"].pack!.abilities).toContain(BARRAGE);
  });
});

// ---------------------------------------------------------------------------
// 1. Full Barrage — around the TARGET, enemies only
// ---------------------------------------------------------------------------

describe("Full Barrage — splashes enemies adjacent to the TARGET only", () => {
  /**
   * Attacker @9 hits the foe @10 (Defense 50 soaks the attack → every later
   * damage read is pure splash). Target's neighbours: foe @6, friend @14,
   * attacker @9. Foe @13 is adjacent to the ATTACKER but NOT the target — the
   * anchor CONTROL (Chakra Burst would splash it; Full Barrage must not).
   */
  function layout(state: GameState, attackerAbilities: string[]): void {
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: attackerAbilities,
      attack: 3,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], defense: 50, maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 6, controllerId: "p2", abilities: [], defense: 0, maxHealth: 20, damage: 0 });
    place(state, "unit_p1_griffins", { position: 14, controllerId: "p1", abilities: [], defense: 0, maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 13, controllerId: "p2", abilities: [], defense: 0, maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
  }

  it("uses the REAL Honolulu Pack ability list: 1 damage to the target's other adjacent ENEMY only", () => {
    const state = freshCombat("kansen-barrage-anchor");
    layout(state, [...coreUnitDefinitions["azur_lane.honolulu"].pack!.abilities]);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");

    expect(unitAt(after, "unit_p2_vampires").damage).toBe(1); // enemy adjacent to the TARGET
    expect(unitAt(after, "unit_p1_griffins").damage).toBe(0); // FRIEND adjacent to the target (enemiesOnly)
    expect(unitAt(after, "unit_p2_dread_knights").damage).toBe(0); // enemy adjacent to the ATTACKER only (anchor)
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(0); // the target took only the (soaked) attack — never the splash
    expect(barrageEvents(after)).toHaveLength(1);
  });

  it("CONTROL: same layout without the tag — nobody takes splash damage", () => {
    const state = freshCombat("kansen-barrage-control");
    layout(state, ["ignore-combat-penalties"]);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(after, "unit_p2_vampires").damage).toBe(0);
    expect(barrageEvents(after)).toHaveLength(0);
  });

  it("ANCHOR CONTROL: the SAME layout with Chakra Burst instead splashes around the ATTACKER", () => {
    const state = freshCombat("kansen-barrage-vs-chakra");
    layout(state, ["jinchuriki-chakra-burst"]);
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    // Around-self: the attacker's neighbours are the target @10 and the foe @13.
    expect(unitAt(after, "unit_p2_dread_knights").damage).toBe(1); // adjacent to attacker → hit
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(1); // the adjacent target IS splashed by Chakra Burst
    expect(unitAt(after, "unit_p2_vampires").damage).toBe(0); // adjacent to target only → NOT hit
  });

  it("never fires on a Retaliation Attack", () => {
    const state = freshCombat("kansen-barrage-retaliation");
    // UNTAGGED attacker hits the TAGGED defender; the defender retaliates.
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [],
      attack: 2,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: [BARRAGE],
      attack: 3,
      defense: 0,
      maxHealth: 30,
      damage: 0,
      type: "ground"
    });
    // Adjacent to the retaliation's target (the original attacker @9): foe @5.
    place(state, "unit_p1_griffins", { position: 5, controllerId: "p1", abilities: [], defense: 0, maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });

    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(after, "unit_p1_marksmen").damage).toBe(3); // the retaliation landed…
    expect(unitAt(after, "unit_p1_griffins").damage).toBe(0); // …but no barrage around its target
    expect(barrageEvents(after)).toHaveLength(0);
  });

  it("a lethal barrage removes through the normal path and grants no retaliation", () => {
    const state = freshCombat("kansen-barrage-kill");
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [BARRAGE],
      attack: 3,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    // attack 0: the soaked target must not retaliate for real damage, so the
    // attacker's 0 damage below isolates the BARRAGE victim's (absent) retaliation.
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], attack: 0, defense: 50, maxHealth: 20, damage: 0 });
    const victim = place(state, "unit_p2_vampires", {
      position: 6,
      controllerId: "p2",
      abilities: [],
      attack: 5,
      defense: 0,
      maxHealth: 1,
      damage: 0,
      variant: "few",
      type: "ground"
    });
    place(state, "unit_p1_griffins", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 2, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });

    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(wasRemoved(after, victim.id)).toBe(true);
    expect(unitAt(after, "unit_p1_marksmen").damage).toBe(0); // a barrage kill provokes nothing
  });
});

// ---------------------------------------------------------------------------
// 2. Fleet Formation — the escort aura
// ---------------------------------------------------------------------------

describe("Fleet Formation — +1 Attack on an ally's own attack while adjacent to the carrier", () => {
  function baseLayout(state: GameState, carrierPosition: number): void {
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [],
      attack: 3,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p1_griffins", {
      position: carrierPosition,
      controllerId: "p1",
      abilities: [AURA],
      attack: 2,
      defense: 0,
      maxHealth: 20,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], attack: 3, defense: 0, maxHealth: 30, damage: 0, type: "ground" });
    place(state, "unit_p1_crusaders", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
  }

  it("adjacent carrier: the ally's attack deals +1 (CONTROL: carrier far away → base damage)", () => {
    const near = freshCombat("kansen-aura-near");
    baseLayout(near, 5); // 5 is adjacent to the attacker @9
    const afterNear = attack(near, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(afterNear, "unit_p2_skeletons").damage).toBe(4); // 3 + 1 aura

    const far = freshCombat("kansen-aura-far");
    baseLayout(far, 2); // NOT adjacent to the attacker
    const afterFar = attack(far, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(afterFar, "unit_p2_skeletons").damage).toBe(3); // base
  });

  it("two adjacent carriers stack (+2)", () => {
    const state = freshCombat("kansen-aura-stack");
    baseLayout(state, 5);
    place(state, "unit_p1_crusaders", {
      position: 13, // also adjacent to the attacker @9
      controllerId: "p1",
      abilities: [AURA],
      attack: 2,
      defense: 0,
      maxHealth: 20,
      damage: 0,
      type: "ground"
    });
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(5); // 3 + 2
  });

  it("the carrier itself gains nothing from its own aura", () => {
    const state = freshCombat("kansen-aura-self");
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [AURA],
      attack: 3,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], attack: 0, defense: 0, maxHealth: 30, damage: 0, type: "ground" });
    place(state, "unit_p1_griffins", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 2, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    const after = attack(state, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(after, "unit_p2_skeletons").damage).toBe(3); // no self-buff
  });

  it("never applies to a Retaliation Attack (the enemy carrier CONTROL proves the fold is live)", () => {
    // p2's carrier stands adjacent to p2's skeletons. The skeletons' OWN attack
    // gets +1; their RETALIATION does not.
    function layout(state: GameState): void {
      place(state, "unit_p1_marksmen", {
        position: 9,
        controllerId: "p1",
        abilities: [],
        attack: 2,
        defense: 0,
        maxHealth: 100,
        damage: 0,
        type: "ground"
      });
      place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], attack: 3, defense: 0, maxHealth: 30, damage: 0, type: "ground" });
      place(state, "unit_p2_vampires", {
        position: 6, // adjacent to the skeletons @10
        controllerId: "p2",
        abilities: [AURA],
        attack: 2,
        defense: 0,
        maxHealth: 20,
        damage: 0,
        type: "ground"
      });
      place(state, "unit_p1_griffins", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
      place(state, "unit_p1_crusaders", { position: 2, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
      place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    }

    // Retaliation: p1 attacks the skeletons; their retaliation stays base 2… wait,
    // attack 3 − defense 0 = 3 flat — WITH the aura it would be 4.
    const retaliationRun = freshCombat("kansen-aura-retaliation");
    layout(retaliationRun);
    const afterRetaliation = attack(retaliationRun, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(unitAt(afterRetaliation, "unit_p1_marksmen").damage).toBe(3); // retaliation NOT buffed

    // Own attack: the same skeletons declaring the attack DO get the aura.
    const ownRun = freshCombat("kansen-aura-own-attack");
    layout(ownRun);
    const afterOwn = attack(ownRun, "unit_p2_skeletons", "unit_p1_marksmen");
    expect(unitAt(afterOwn, "unit_p1_marksmen").damage).toBe(4); // 3 + 1 aura
  });
});

// ---------------------------------------------------------------------------
// 3. Belfast "Royal Salvo" — the enemy-damage commander cast
// ---------------------------------------------------------------------------

describe("Royal Salvo — Belfast's enemy-damage cast", () => {
  function castState(magicGrade: 0 | 3): GameState {
    const state = createInitialGameState();
    state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
    state.players.p1.commander = {
      slug: "belfast",
      grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: magicGrade, speed: 0 }
    };
    const unit = makeCommanderCombatUnit(state.players.p1, 9);
    if (!unit) {
      throw new Error("expected a commander combat unit");
    }
    state.combat!.units[unit.id] = unit;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    // Adjacent enemy @10 with heavy Defense (the salvo must ignore it); a far
    // enemy @18 for the adjacency gate; strip everything else.
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], attack: 0, defense: 5, maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], attack: 0, defense: 0, maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], attack: 0, defense: 0, maxHealth: 20, damage: 0 });
    place(state, "unit_p1_marksmen", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_griffins", { position: 2, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 1, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    state.combat!.activeUnitId = unit.id;
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return state;
  }

  function castOffer(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "USE_UNIT_ABILITY" &&
        legal.action.abilityId === commanderDefinitions.belfast.cast.abilityId
    );
  }

  function openCast(state: GameState): GameState {
    const offer = castOffer(state);
    expect(offer, "Royal Salvo offered").toBeTruthy();
    return applyOk(state, offer!.action);
  }

  it("Power 0: only ADJACENT enemies are candidates; the salvo deals 1 through Defense 5", () => {
    const opened = openCast(castState(0));
    const choice = opened.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the cast target choice");
    expect(choice.kind).toBe("commander-cast");
    expect(choice.candidateUnitIds).toContain("unit_p2_skeletons"); // adjacent enemy
    expect(choice.candidateUnitIds).not.toContain("unit_p2_vampires"); // far enemy — adjacency gate
    expect(choice.candidateUnitIds).not.toContain("unit_p1_marksmen"); // never a friend

    const after = applyOk(opened, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_skeletons"
    });
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1); // Defense 5 did nothing
    // Once per combat round: the offer is gone.
    expect(castOffer(after)).toBeFalsy();
  });

  it("Power 2 (Magic grade 3): anywhere, 2 damage", () => {
    const opened = openCast(castState(3));
    const choice = opened.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the cast target choice");
    expect(choice.candidateUnitIds).toContain("unit_p2_vampires"); // far enemy now legal
    const after = applyOk(opened, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(after.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("a lethal salvo removes the enemy through the normal path", () => {
    const state = castState(3);
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 2, damage: 0, variant: "few" });
    const opened = openCast(state);
    const choice = opened.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the cast target choice");
    const after = applyOk(opened, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(wasRemoved(after, "unit_p2_vampires")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Enterprise "Lucky E" — held specialty halves in the die window
// ---------------------------------------------------------------------------

describe("Lucky E — held Enterprise specialty levels join the Attack-die reroll window", () => {
  function layout(state: GameState): void {
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [],
      attack: 3,
      defense: 0,
      maxHealth: 100,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", { position: 10, controllerId: "p2", abilities: [], attack: 0, defense: 0, maxHealth: 30, damage: 0, type: "ground" });
    place(state, "unit_p1_griffins", { position: 0, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p1_crusaders", { position: 2, controllerId: "p1", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_vampires", { position: 18, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
    place(state, "unit_p2_dread_knights", { position: 19, controllerId: "p2", abilities: [], maxHealth: 20, damage: 0 });
  }

  it("data contract: the three levels and their halves", () => {
    expect(LUCKY_E_SPECIALTY_SOURCES.map((spec) => [spec.cardId, spec.reroll, spec.setDie])).toEqual([
      ["specialty.enterprise.1", true, false],
      ["specialty.enterprise.4", false, true],
      ["specialty.enterprise.6", true, true]
    ]);
  });

  it("Lucky E I (held): the window opens, taking the reroll plays/discards the card (CONTROL: no card → no window)", () => {
    const state = freshCombat("lucky-e-one");
    layout(state);
    state.players.p1.hand = ["specialty.enterprise.1"];
    const windowState = attackToRerollWindow(state, "unit_p1_marksmen", "unit_p2_skeletons");
    const choice = windowState.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    if (choice?.type !== "ATTACK_DIE_REROLL") throw new Error("expected the reroll window");
    const source = choice.rerollSources.find((candidate) => candidate.cardId === "specialty.enterprise.1");
    expect(source?.name).toBe("Lucky E I");
    expect(source?.setDieFace).toBeUndefined();

    const rerolled = applyOk(windowState, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: choice.id
    });
    expect(rerolled.players.p1.hand).not.toContain("specialty.enterprise.1");
    expect(rerolled.players.p1.discard).toContain("specialty.enterprise.1");
    expect(
      rerolled.eventLog.some(
        (event: GameEvent) => event.type === "ATTACK_REROLLED" && event.sourceName === "Lucky E I"
      )
    ).toBe(true);
    settle(rerolled); // the window still resolves cleanly

    // CONTROL: with an empty hand the attack resolves with NO reroll window.
    const control = freshCombat("lucky-e-one-control");
    layout(control);
    const afterControl = attackToRerollWindow(control, "unit_p1_marksmen", "unit_p2_skeletons");
    expect(afterControl.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
    expect(afterControl.combat!.units.unit_p2_skeletons.damage).toBe(3); // resolved straight through
  });

  it('Lucky E IV (held): "set a die to +1" lifts the kept roll — damage rises by 1', () => {
    const state = freshCombat("lucky-e-four");
    layout(state);
    state.players.p1.hand = ["specialty.enterprise.4"];
    const windowState = attackToRerollWindow(state, "unit_p1_marksmen", "unit_p2_skeletons");
    const choice = windowState.pendingChoice;
    if (choice?.type !== "ATTACK_DIE_REROLL") throw new Error("expected the reroll window");
    const source = choice.rerollSources.find((candidate) => candidate.cardId === "specialty.enterprise.4");
    expect(source?.setDieFace).toBe(1);

    const setState = applyOk(windowState, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: choice.id,
      useSetDie: true
    });
    const setChoice = setState.pendingChoice;
    if (setChoice?.type !== "ATTACK_DIE_REROLL") throw new Error("window stays open on the set die");
    expect(setChoice.candidates.at(-1)?.roll).toBe(1); // the scripted 0 was set to +1
    expect(setState.players.p1.discard).toContain("specialty.enterprise.4");

    const after = applyOk(setState, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: setChoice.id,
      candidateIndex: setChoice.candidates.length - 1
    });
    const settled = settle(after);
    expect(settled.combat!.units.unit_p2_skeletons.damage).toBe(4); // 3 + the set "+1"
  });

  it("Lucky E VI (held): BOTH halves are offered, spending one retires the other (one physical card)", () => {
    const state = freshCombat("lucky-e-six");
    layout(state);
    state.players.p1.hand = ["specialty.enterprise.6"];
    const windowState = attackToRerollWindow(state, "unit_p1_marksmen", "unit_p2_skeletons");
    const choice = windowState.pendingChoice;
    if (choice?.type !== "ATTACK_DIE_REROLL") throw new Error("expected the reroll window");
    const halves = choice.rerollSources.filter((candidate) => candidate.cardId === "specialty.enterprise.6");
    expect(halves).toHaveLength(2);
    expect(halves.some((half) => half.setDieFace === 1)).toBe(true);
    expect(halves.some((half) => half.setDieFace === undefined)).toBe(true);

    const rerolled = applyOk(windowState, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: choice.id
    });
    // The card left the hand ONCE; the set-die sibling is retired with it.
    expect(rerolled.players.p1.discard.filter((cardId) => cardId === "specialty.enterprise.6")).toHaveLength(1);
    const openChoice = rerolled.pendingChoice;
    if (openChoice?.type !== "ATTACK_DIE_REROLL") throw new Error("window stays open after the reroll");
    const setDieAttempt = applyAction(rerolled, {
      type: "REROLL_PENDING_CHOICE",
      playerId: "p1",
      choiceId: openChoice.id,
      useSetDie: true
    });
    expect(setDieAttempt.errors.length).toBeGreaterThan(0); // the sibling half is gone
  });
});
