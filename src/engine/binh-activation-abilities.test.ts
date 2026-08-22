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
import { makeActiveEffect } from "./active-effects";
import type {
  ActiveEffectDefinition,
  CardId,
  CombatUnitState,
  GameAction,
  GameEvent,
  GameState,
  PlayerId
} from "./state";

/**
 * Orb of Vulnerability, option A: "During this Combat, negate all units'
 * special abilities related to spells." Global scope, both armies.
 */
const ORB_OF_VULNERABILITY: CardId = "artifact.orb_of_vulnerability";
const ORB_SUPPRESSION_EFFECT: ActiveEffectDefinition = {
  name: "Orb of Vulnerability",
  scope: "global",
  duration: { type: "combat" },
  modifiers: [{ type: "SUPPRESS_SPELL_ABILITIES" }]
};

function addOrbSuppression(state: GameState, controllerId: PlayerId = "p1"): void {
  state.activeEffects.push(
    makeActiveEffect(
      state,
      ORB_SUPPRESSION_EFFECT,
      { type: "card", cardId: ORB_OF_VULNERABILITY, controllerId },
      controllerId
    )
  );
}

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

  // Polish Balance Pack — Eagle Eye EXPERT reaches SPELL-CASTING UNITS (user
  // ruling 2026-08-20). A Faerie Dragon's bolt against your unit lets you "cast
  // back" the same damage at a new enemy unit.
  it("balance Eagle Eye copies a Faerie bolt: the damaged owner casts back 2 damage at a new target", () => {
    let state = faerieSandbox();
    // p2 (the unit the bolt will hit) holds Eagle Eye with a crown, balance ON.
    state.adventure = { houseRules: { "polish-card-balance": true } } as GameState["adventure"];
    state.players.p2.hand = ["ability.eagle_eye" as CardId];
    state.players.p2.limits.expertUses = 1;
    // A second p2 body is irrelevant; add a p1 unit to cast BACK at.
    state.combat!.units.unit_p1_griffins.damage = 0;
    state.combat!.units.unit_p1_griffins.maxHealth = 10;

    state = makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");
    const choice = state.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the faerie target choice");
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_skeletons"
    });

    // The bolt dealt 2 → p2 banked a copy of exactly that amount.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(state.players.p2.combatStats.eagleEyeCopyUnitBolt?.amount).toBe(2);

    // p2 is offered the copy at the p1 griffins (a NEW enemy target).
    const copy = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "USE_EAGLE_EYE_UNIT_COPY" && legal.action.targetUnitId === "unit_p1_griffins"
    );
    expect(copy, "the unit-bolt copy is offered to the damaged owner").toBeTruthy();

    const after = applyOk(state, copy!.action);
    // The copied bolt deals 2 to the new target, spends the crown, discards Eagle
    // Eye, and the opportunity is consumed.
    expect(after.combat!.units.unit_p1_griffins.damage).toBe(2);
    expect(after.players.p2.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(after.players.p2.discard).toContain("ability.eagle_eye");
    expect(after.players.p2.combatStats.eagleEyeCopyUnitBolt ?? null).toBeNull();
    // No copy is offered a second time.
    expect(
      getLegalActions(after, "p2").some((legal) => legal.action.type === "USE_EAGLE_EYE_UNIT_COPY")
    ).toBe(false);
  });

  it("CONTROL: with the balance rule OFF a Faerie bolt banks no Eagle Eye copy", () => {
    let state = faerieSandbox();
    state.players.p2.hand = ["ability.eagle_eye" as CardId];
    state.players.p2.limits.expertUses = 1;
    state = makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");
    const choice = state.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the faerie target choice");
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_skeletons"
    });
    expect(state.players.p2.combatStats.eagleEyeCopyUnitBolt ?? null).toBeNull();
    expect(
      getLegalActions(state, "p2").some((legal) => legal.action.type === "USE_EAGLE_EYE_UNIT_COPY")
    ).toBe(false);
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

    // Buff fallback announces under `${id}-buff` so the heal FX plan never
    // flashes the Cure shimmer on a pure Attack buff.
    expect(abilityEvents(state, "enchanter-heal-or-buff-buff").length).toBeGreaterThanOrEqual(1);
    expect(abilityEvents(state, "enchanter-heal-or-buff")).toHaveLength(0);
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

  it("does NOT hit a target immune to all Spells (Black/Azure Dragons) — the bolt is a magic attack", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Faerie Dragons";
      guard.cardName = "Faerie Dragons";
      guard.type = "flying";
      guard.abilities = ["faerie-dragon-spell"];
      guard.attack = 0; // isolate the Ice Bolt from the melee attack
      guard.initiative = 1;
      guard.position = 1;
    });
    // The player's unit is "Immune to all Spells" (Black Dragons Pack).
    const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    const preyId = prey.id;
    prey.abilities = ["immune-all-spells"];
    prey.maxHealth = 20;
    prey.damage = 0;
    script(state, [0, 0, 0, 0, 0, 0]);

    state = defendThrough(state);

    // The bolt was turned aside: no faerie-dragon-spell cast, an immunity event
    // fired instead, and the immune unit took 0 damage from it.
    expect(abilityEvents(state, "faerie-dragon-spell")).toHaveLength(0);
    expect(abilityEvents(state, "immune-all-spells").some((event) => event.targetUnitId === preyId)).toBe(true);
    expect(state.combat!.units[preyId].damage).toBe(0);
  });

  it("is REDUCED (not blocked) by a spell-damage-reduction passive", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Faerie Dragons";
      guard.cardName = "Faerie Dragons";
      guard.type = "flying";
      guard.abilities = ["faerie-dragon-spell"];
      guard.attack = 0;
      guard.initiative = 1;
      guard.position = 1;
    });
    // The player's unit reduces spell damage by 1 (not immune): the 2-damage
    // bolt lands for 1 — proving reduction applies without turning it aside.
    const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    const preyId = prey.id;
    prey.abilities = ["reduce-spell-damage-1"];
    prey.maxHealth = 20;
    prey.damage = 0;
    script(state, [0, 0, 0, 0, 0, 0]);

    state = defendThrough(state);

    expect(abilityEvents(state, "faerie-dragon-spell")).toHaveLength(1);
    expect(state.combat!.units[preyId].damage).toBe(1);
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

    // The dragon zapped first (its activation ability), THEN — several cells
    // reach its prey — a destination choice opens (BINH house rule). Resolve it
    // so the guard steps in to melee, producing the UNIT_MOVED this test orders
    // against. The zap+damage were logged before the choice, so they still lead.
    const destChoice = state.pendingChoice;
    if (destChoice?.type === "OPTION_CHOICE" && destChoice.context === "neutral-destination") {
      expect(destChoice.neutralDestination?.defenderId).toBe(prey.id);
      state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: destChoice.id, optionIndex: 0 });
    }

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

// ---------------------------------------------------------------------------
// Orb of Vulnerability turns the Faerie Dragons' casting OFF (USER RULING
// 2026-08-22). Printed card: "During this Combat, negate all units' special
// abilities related to spells" — GLOBAL, both armies. The Faerie Bolt's own
// printed text calls itself "a spell that does not count towards your spell
// limit", so it is exactly such an ability.
// ---------------------------------------------------------------------------

describe("Orb of Vulnerability switches off the Faerie Dragons' spell ability", () => {
  function faerieOrbSandbox(seed: string): GameState {
    const state = createInitialGameState(seed);
    const combat = state.combat!;
    const faerie = combat.units.unit_p1_marksmen;
    faerie.name = "Faerie Dragons";
    faerie.cardName = "Faerie Dragons";
    faerie.type = "flying";
    faerie.abilities = ["faerie-dragon-spell"];
    faerie.attack = 5;
    combat.units.unit_p2_skeletons.maxHealth = 10;
    combat.units.unit_p2_skeletons.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    return state;
  }

  it("a PLAYER dragon opens no bolt choice and deals NO bolt damage while the Orb is in play", () => {
    let state = faerieOrbSandbox("orb-faerie-player");
    addOrbSuppression(state);
    state = makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");

    // No "[activation]" target choice at all — the ability does not exist now.
    expect(state.pendingChoice).toBeNull();
    expect(abilityEvents(state, "faerie-dragon-spell")).toHaveLength(0);
    // The observable outcome: the enemy took no damage.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(
      state.eventLog.some((event) => event.type === "DAMAGE_ASSIGNED" && event.damageKind === "spell")
    ).toBe(false);
    // No stall: the dragon is still up and can act normally.
    expect(state.combat!.activeUnitId).toBe("unit_p1_marksmen");
    const acts = getLegalActions(state, "p1");
    expect(acts.some((legal) => legal.action.type === "ATTACK_UNIT" || legal.action.type === "MOVE_UNIT")).toBe(true);
  });

  it("CONTROL: with NO Orb the same dragon opens the choice and its bolt deals 2 damage", () => {
    let state = faerieOrbSandbox("orb-faerie-player-control");
    state = makeNextActive(state, "unit_p1_griffins", "unit_p1_marksmen");

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected the faerie target choice");
    }
    expect(choice.kind).toBe("faerie-damage");
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_skeletons"
    });
    expect(abilityEvents(state, "faerie-dragon-spell")).toHaveLength(1);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  // The printed scope is "ALL units", not "enemy units": a NEUTRAL dragon is
  // silenced by the player's own Orb too.
  it("a NEUTRAL dragon fires no bolt while the Orb is in play (the card says 'all units')", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Faerie Dragons";
      guard.cardName = "Faerie Dragons";
      guard.type = "flying";
      guard.abilities = ["faerie-dragon-spell"];
      guard.attack = 0; // isolate the Ice Bolt from the melee attack
      guard.initiative = 1;
      guard.position = 1;
    });
    const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    const preyId = prey.id;
    prey.maxHealth = 20;
    prey.damage = 0;
    addOrbSuppression(state);
    script(state, [0, 0, 0, 0, 0, 0]);

    state = defendThrough(state);

    expect(abilityEvents(state, "faerie-dragon-spell")).toHaveLength(0);
    expect(state.combat!.units[preyId].damage).toBe(0);
  });

  it("CONTROL: the SAME neutral setup without the Orb does bolt the prey for 2", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Faerie Dragons";
      guard.cardName = "Faerie Dragons";
      guard.type = "flying";
      guard.abilities = ["faerie-dragon-spell"];
      guard.attack = 0;
      guard.initiative = 1;
      guard.position = 1;
    });
    const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    const preyId = prey.id;
    prey.maxHealth = 20;
    prey.damage = 0;
    script(state, [0, 0, 0, 0, 0, 0]);

    state = defendThrough(state);

    expect(abilityEvents(state, "faerie-dragon-spell")).toHaveLength(1);
    expect(state.combat!.units[preyId].damage).toBe(2);
  });

  // RECONCILIATION with the 2026-08-20 behaviour ("the Orb lifts a target's
  // printed all-spell immunity so the bolt lands"). Both directions coexist, and
  // this is the case that DISCRIMINATES them: under the old rule the Orb made the
  // bolt land on an immune unit for 2; under the ruling there is no bolt at all,
  // so the immune unit takes nothing AND no immunity event fires either.
  it("against an immune-to-all-Spells target the Orb no longer makes the bolt land — there is no bolt", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Faerie Dragons";
      guard.cardName = "Faerie Dragons";
      guard.type = "flying";
      guard.abilities = ["faerie-dragon-spell"];
      guard.attack = 0;
      guard.initiative = 1;
      guard.position = 1;
    });
    const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    const preyId = prey.id;
    prey.abilities = ["immune-all-spells"];
    prey.maxHealth = 20;
    prey.damage = 0;
    addOrbSuppression(state);
    script(state, [0, 0, 0, 0, 0, 0]);

    state = defendThrough(state);

    expect(abilityEvents(state, "faerie-dragon-spell")).toHaveLength(0);
    expect(abilityEvents(state, "immune-all-spells")).toHaveLength(0);
    expect(state.combat!.units[preyId].damage).toBe(0);
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
