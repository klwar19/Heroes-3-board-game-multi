import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  NEUTRAL_PLAYER_ID
} from "./index";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function abilityEvents(state: GameState, abilityId: string): Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
      event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === abilityId
  );
}

/**
 * Marks every unit but the named one as already-activated, sets the starter
 * active, and defends it so the named unit comes up next — firing the player
 * "[activation]" choice opener through a real activation transition.
 */
function makeNextActive(state: GameState, starterId: string, nextId: string): GameState {
  const combat = state.combat!;
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = unit.id !== starterId && unit.id !== nextId;
  }
  setActive(state, combat.units[starterId].controllerId, starterId);
  return applyOk(state, { type: "DEFEND_UNIT", playerId: combat.units[starterId].controllerId, unitId: starterId });
}

// ---------------------------------------------------------------------------
// Enchanters — heal a friendly OR +1 Attack to self
// ---------------------------------------------------------------------------

describe("Enchanters activation (heal-a-friendly or +1 Attack)", () => {
  function enchanterSandbox(): GameState {
    const state = createInitialGameState();
    const combat = state.combat!;
    const enchanter = combat.units.unit_p1_marksmen;
    enchanter.name = "Enchanters";
    enchanter.cardName = "Enchanters";
    enchanter.type = "ranged";
    enchanter.abilities = ["enchanter-heal-or-buff"];
    enchanter.attack = 4;
    enchanter.damage = 0;
    // A wounded friendly to offer as a heal target.
    combat.units.unit_p1_crusaders.damage = 2;
    combat.units.unit_p1_crusaders.position = 18;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    return state;
  }

  it("forces a heal (mandatory, no skip-to-buff) when a wounded friendly exists", () => {
    let state = enchanterSandbox();
    state = makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("enchanter-activation");
    expect(choice.playerId).toBe("p1");
    expect(choice.candidateUnitIds).toEqual(["unit_p1_crusaders"]);
    // Wiki: the heal can NOT be skipped in favor of +1 Attack — the choice is
    // mandatory (pick which ally), never optional.
    expect(choice.optional).toBe(false);

    // Heal the wounded crusaders (up to 2 damage).
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_crusaders"
    });
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(0);
    // The Enchanters stay active to act, and gained no Attack buff.
    expect(state.combat!.activeUnitId).toBe("unit_p1_marksmen");
    expect(state.combat!.units.unit_p1_marksmen.activationAbilityDone).toBe(true);
    expect(state.activeEffects.some((effect) => effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS"))).toBe(false);
  });

  it("offers NO skip-to-buff option while a wounded friendly exists (heal mandatory)", () => {
    let state = enchanterSandbox();
    state = makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");
    const choice = state.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected the enchanter choice");
    }

    // The wiki forbids skipping the heal for +1 Attack: no "skip" action exists,
    // and the only legal target is the wounded ally.
    const skip = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === "skip"
    );
    expect(skip).toBeUndefined();

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_crusaders"
    });
    expect(state.combat!.units.unit_p1_crusaders.damage).toBe(0); // healed, not buffed
    expect(
      state.activeEffects.some((effect) => effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS"))
    ).toBe(false);
  });

  it("auto-buys +1 Attack with no prompt when no friendly is wounded", () => {
    let state = enchanterSandbox();
    state.combat!.units.unit_p1_crusaders.damage = 0; // nothing to heal
    state = makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");

    expect(state.pendingChoice).toBeNull();
    expect(state.combat!.units.unit_p1_marksmen.activationAbilityDone).toBe(true);
    expect(
      state.activeEffects.some(
        (effect) =>
          effect.target?.type === "unit" &&
          effect.target.unitId === "unit_p1_marksmen" &&
          effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS")
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Faerie Dragons — activation damage-spell (Ice Bolt)
// ---------------------------------------------------------------------------

describe("Faerie Dragons activation damage-spell", () => {
  function faerieSandbox(): GameState {
    const state = createInitialGameState();
    const combat = state.combat!;
    const faerie = combat.units.unit_p1_marksmen;
    faerie.name = "Faerie Dragons";
    faerie.cardName = "Faerie Dragons";
    faerie.type = "flying";
    faerie.abilities = ["faerie-dragon-spell"];
    faerie.attack = 5;
    combat.units.unit_p2_skeletons.maxHealth = 10;
    combat.units.unit_p2_skeletons.damage = 0;
    combat.units.unit_p2_skeletons.defense = 4; // proves the 2 damage ignores defense
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    return state;
  }

  it("opens an enemy-target choice, then deals 2 spell damage (ignoring defense) and stays active", () => {
    let state = faerieSandbox();
    state = makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("faerie-damage");
    expect(choice.optional).not.toBe(true);
    // Only enemy (p2) units are candidates.
    expect(choice.candidateUnitIds).toContain("unit_p2_skeletons");
    expect(choice.candidateUnitIds.every((id) => state.combat!.units[id].controllerId === "p2")).toBe(true);

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_skeletons"
    });

    // Flat spell damage, not reduced by the high defense.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
    // The Ice Bolt ability event fired (drives the projectile + sound on screen).
    expect(abilityEvents(state, "faerie-dragon-spell")).toHaveLength(1);
    const damage = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "DAMAGE_ASSIGNED" }> => event.type === "DAMAGE_ASSIGNED"
    );
    expect(damage.at(-1)?.damageKind).toBe("spell");
    // The dragon then acts normally — still the active unit, can attack/move.
    expect(state.combat!.activeUnitId).toBe("unit_p1_marksmen");
    expect(state.combat!.units.unit_p1_marksmen.activationAbilityDone).toBe(true);
    const acts = getLegalActions(state, "p1");
    expect(acts.some((legal) => legal.action.type === "ATTACK_UNIT" || legal.action.type === "MOVE_UNIT")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Harpies — "Strike and Return" repositioning
// ---------------------------------------------------------------------------

describe("Harpies return after retaliation", () => {
  function harpySandbox(): GameState {
    const state = createInitialGameState();
    const combat = state.combat!;
    const harpy = combat.units.unit_p1_griffins;
    harpy.name = "Harpies";
    harpy.cardName = "Harpies";
    harpy.type = "flying";
    harpy.abilities = ["harpy-return"];
    harpy.attack = 0;
    harpy.maxHealth = 20;
    harpy.damage = 0;
    // Origin 12 (row 3, col 0) — a clear cell (obstacles sit at 8 and 11).
    harpy.position = 12;
    harpy.activationStartPosition = 12;
    const target = combat.units.unit_p2_skeletons;
    target.position = 4; // row 1, col 0
    target.attack = 0;
    target.maxHealth = 20;
    target.damage = 0;
    // Clear the lane / other units out of the way.
    combat.units.unit_p1_marksmen.position = 19;
    combat.units.unit_p1_crusaders.position = 18;
    combat.units.unit_p2_vampires.position = 15;
    combat.units.unit_p2_dread_knights.position = 17;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [0, 0, 0, 0]);
    setActive(state, "p1", "unit_p1_griffins");
    return state;
  }

  function flyInAndAttack(state: GameState): GameState {
    // Fly from 12 to 5 (adjacent to the target at 4), then strike — the
    // player issues this as a move followed by an attack.
    const next = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 5
    });
    return applyOk(next, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
  }

  it("offers the player a fly-back-or-stay choice after the attack resolves", () => {
    const state = flyInAndAttack(harpySandbox());
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      return;
    }
    expect(choice.context).toBe("combat-reposition");
    expect(choice.reposition).toEqual({ unitId: "unit_p1_griffins", originPosition: 12 });
    expect(choice.options).toHaveLength(2);
    // The harpy is still standing where it attacked while the choice is open.
    expect(state.combat!.units.unit_p1_griffins.position).toBe(5);
  });

  it("flies back to the origin on option 0", () => {
    let state = flyInAndAttack(harpySandbox());
    const choice = state.pendingChoice!;
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(state.combat!.units.unit_p1_griffins.position).toBe(12);
    expect(state.combat!.units.unit_p1_griffins.activatedThisRound).toBe(true);
    expect(state.pendingChoice).toBeNull();
  });

  it("stays where it attacked on option 1", () => {
    let state = flyInAndAttack(harpySandbox());
    const choice = state.pendingChoice!;
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });
    expect(state.combat!.units.unit_p1_griffins.position).toBe(5);
    expect(state.combat!.units.unit_p1_griffins.activatedThisRound).toBe(true);
    expect(state.pendingChoice).toBeNull();
  });

  it("does not offer a return when the harpy attacked without moving", () => {
    const state = harpySandbox();
    // Start already adjacent to the target so no move is needed.
    state.combat!.units.unit_p1_griffins.position = 5;
    state.combat!.units.unit_p1_griffins.activationStartPosition = 5;
    const next = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(next.pendingChoice).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Neutral AI behaviour (the adventure pump drives these automatically)
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false });
}

function refreshP1(state: GameState): GameState {
  return (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
}

function moveOntoGuardedMine(state: GameState): GameState {
  return applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
}

/** Defends every player unit so the neutral guard's activation comes up. */
function defendThrough(state: GameState): GameState {
  let safety = 25;
  while (safety > 0) {
    safety -= 1;
    if (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      continue;
    }
    // The pre-activation reaction pause: this driver does not react, it just
    // lets the guard act.
    const pre = state.combat?.pendingNeutralStep;
    if (pre?.kind === "pre-activation") {
      state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: pre.reactingPlayerId ?? "p1" });
      continue;
    }
    const choice = state.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      state = applyOk(state, { type: "CHOOSE_PENDING_ROLL", playerId: choice.playerId, choiceId: choice.id, candidateIndex: 0 });
      continue;
    }
    const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
    if (!active || active.controllerId !== "p1" || state.pendingChoice) {
      return state;
    }
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
  }
  return state;
}

/** Sets up a one-guard neutral fight and hands back the revealed guard. */
function neutralFightWithGuard(reshape: (guard: CombatUnitState, state: GameState) => void): GameState {
  let state = moveOntoGuardedMine(refreshP1(makeGame()));
  const armyUnit = state.players.p1.army[0];
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
  // The player unit activates first (frozen high initiative) so the guard
  // still sits on its starting space when it comes up.
  for (const unit of Object.values(state.combat!.units)) {
    unit.initiative = 99;
  }
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
  reshape(guard, state);
  return state;
}

describe("neutral Enchanters heal a wounded ally when possible", () => {
  // Wiki Note: "If possible, the healing effect has to be chosen. The healing
  // effect can not be skipped in favor of +1 Attack." Applies to neutral guards
  // too — they heal their most-wounded ally rather than self-buffing.
  it("heals its most-wounded ally (3 → 1) and takes NO Attack buff", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Enchanters";
      guard.cardName = "Enchanters";
      guard.type = "ranged";
      guard.abilities = ["enchanter-heal-or-buff"];
      guard.attack = 1;
      guard.initiative = 1; // acts after the player unit
      guard.position = 1;
    });

    // Inject a wounded friendly neutral so healing is possible.
    const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    const ally: CombatUnitState = {
      ...JSON.parse(JSON.stringify(guard)),
      id: "neutral_ally",
      name: "Wounded Ally",
      cardName: "Wounded Ally",
      abilities: [],
      attack: 1,
      maxHealth: 9,
      damage: 3,
      position: 2,
      initiative: 0,
      activatedThisRound: true
    };
    state.combat!.units.neutral_ally = ally;
    script(state, [0, 0, 0, 0, 0, 0]);

    state = defendThrough(state);

    // The heal fired (3 → 1, up to 2 removed) and NO Attack buff was taken.
    expect(state.eventLog.some((event) => event.type === "DAMAGE_HEALED")).toBe(true);
    expect(state.combat?.units.neutral_ally?.damage).toBe(1);
    expect(
      state.activeEffects.some((effect) => effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS"))
    ).toBe(false);
  });

  it("buffs itself only when there is no ally to heal (control)", () => {
    // No wounded ally injected — the only meaningful action is the self buff.
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Enchanters";
      guard.cardName = "Enchanters";
      guard.type = "ranged";
      guard.abilities = ["enchanter-heal-or-buff"];
      guard.attack = 1;
      guard.initiative = 1;
      guard.position = 1;
    });
    script(state, [0, 0, 0, 0, 0, 0]);
    state = defendThrough(state);

    expect(abilityEvents(state, "enchanter-heal-or-buff").length).toBeGreaterThanOrEqual(1);
    expect(state.eventLog.some((event) => event.type === "DAMAGE_HEALED")).toBe(false);
  });
});

describe("neutral Faerie Dragons zap a target then act", () => {
  it("deals 2 spell damage via the Ice Bolt event before attacking", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Faerie Dragons";
      guard.cardName = "Faerie Dragons";
      guard.type = "flying";
      guard.abilities = ["faerie-dragon-spell"];
      guard.attack = 0; // isolate the Ice Bolt from the melee attack
      guard.initiative = 1;
      guard.position = 1;
    });
    script(state, [0, 0, 0, 0, 0, 0]);

    state = defendThrough(state);

    // The Ice Bolt fired against the player unit and dealt its flat 2 damage.
    const bolts = abilityEvents(state, "faerie-dragon-spell");
    expect(bolts).toHaveLength(1);
    const target = state.combat?.units[bolts[0].targetUnitId ?? ""] ?? Object.values(state.combat?.units ?? {}).find((unit) => unit.controllerId === "p1");
    expect(target?.controllerId).toBe("p1");
    expect((target?.damage ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it("logs the Ice Bolt cast AND its damage BEFORE the dragon moves (the order the FX preamble needs)", () => {
    // The FX layer presents the cast first and holds the glide behind it, relying
    // on the engine logging cast -> spell damage -> move within the one pump. If
    // the engine ever moved first, that preamble would animate a bolt the table
    // should have seen already. A flying dragon two squares from its prey must
    // step in to melee, so a real UNIT_MOVED is produced to order against.
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Faerie Dragons";
      guard.cardName = "Faerie Dragons";
      guard.type = "flying";
      guard.abilities = ["faerie-dragon-spell"];
      guard.attack = 5;
      guard.initiative = 1;
      guard.position = 5; // two squares above the player unit at 13: it must move in
    });
    const guardId = Object.values(state.combat!.units).find(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    )!.id;
    // The player unit must survive the 2-damage bolt so the dragon then steps in
    // to melee it — otherwise the bolt ends the fight and there is no move.
    const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    prey.maxHealth = 20;
    prey.damage = 0;
    script(state, [0, 0, 0, 0, 0, 0]);

    state = defendThrough(state);

    const log = state.eventLog;
    const boltIndex = log.findIndex(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "faerie-dragon-spell"
    );
    const moveIndex = log.findIndex((event) => event.type === "UNIT_MOVED" && event.unitId === guardId);
    expect(boltIndex, "the dragon should cast its bolt").toBeGreaterThanOrEqual(0);
    expect(moveIndex, "the dragon should step in to melee").toBeGreaterThanOrEqual(0);
    // The cast leads the glide.
    expect(boltIndex).toBeLessThan(moveIndex);
    // The bolt's damage is logged immediately after the cast (applyActivation-
    // DamageSpell), so it too precedes the move.
    expect(log[boltIndex + 1]?.type).toBe("DAMAGE_ASSIGNED");
    expect(boltIndex + 1).toBeLessThan(moveIndex);
  });
});

describe("neutral Harpies always fly back", () => {
  it("returns to its starting space after attacking, with no choice", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Harpies";
      guard.cardName = "Harpies";
      guard.type = "flying";
      guard.abilities = ["ignores-retaliation", "harpy-return"];
      guard.attack = 0;
      guard.maxHealth = 20;
      guard.initiative = 1;
      guard.position = 1; // origin to return to
    });
    script(state, [0, 0, 0, 0]);

    const guardId = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!.id;
    state = defendThrough(state);

    const guard = state.combat?.units[guardId];
    // It moved out to strike the player unit (at 13) and flew back to 1.
    expect(guard?.position).toBe(1);
    expect(state.pendingChoice).toBeNull();
    expect(state.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === guardId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Card data + implementation visibility
// ---------------------------------------------------------------------------

describe("unit ability data", () => {
  it("Few Medusas carry only Paralyzing Gaze — never the No Range Penalty", () => {
    const medusas = coreUnitDefinitions["dungeon.medusas"];
    expect(medusas.few?.abilities).toEqual(["medusa-paralyze-retaliation-die"]);
    expect(medusas.few?.abilities).not.toContain("ignore-combat-penalties");
    // The Pack does carry both, for contrast.
    expect(medusas.pack?.abilities).toContain("ignore-combat-penalties");
  });

  it("wires the new activation/return abilities onto their units", () => {
    expect(coreUnitDefinitions["neutral.enchanters"].neutral?.abilities).toContain("enchanter-heal-or-buff");
    expect(coreUnitDefinitions["neutral.faerie_dragons"].neutral?.abilities).toContain("faerie-dragon-spell");
    expect(coreUnitDefinitions["dungeon.harpies"].few?.abilities).toContain("harpy-return");
    expect(coreUnitDefinitions["dungeon.harpies"].pack?.abilities).toContain("harpy-return");
    expect(coreUnitDefinitions["neutral.harpies"].neutral?.abilities).toContain("harpy-return");
    for (const id of ["enchanter-heal-or-buff", "faerie-dragon-spell", "harpy-return"]) {
      expect(unitAbilities[id]?.implementationStatus).toBe("implemented");
      expect(unitAbilities[id]?.text.length).toBeGreaterThan(0);
    }
  });
});
