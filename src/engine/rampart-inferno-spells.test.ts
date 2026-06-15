import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Engine tests for five new spells (each rule is engine-enforced; every test
 * fails if its logic is removed):
 *  - Mirth        — player-scoped Attack-die reroll with a power-scaled
 *                   "this Activation / Combat round / Combat" duration.
 *  - Sorrow       — Instant reaction that skips an about-to-activate unit
 *                   (the new UNIT_ACTIVATION_STARTED trigger).
 *  - Slayer       — Instant on a gold defender: roll the Attack die N times,
 *                   apply every result but a "-1", then draw 1 card.
 *  - Inferno      — Activation area blast: 1 damage per "+1" rolled to a space
 *                   and the adjacent ones (friend or foe).
 *  - Forgetfulness — the selected enemy ranged unit cannot attack during its
 *                   next activation (the new "next-activation" duration).
 *
 * Sandbox grades/types (createInitialGameState):
 *   p1 marksmen bronze/ranged, griffins bronze/flying, crusaders silver/ground;
 *   p2 skeletons bronze/ground, vampires silver/flying, dread_knights gold/ground.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function reactionFor(state: GameState, playerId: PlayerId, cardId: string, optionIndex?: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

function castFor(state: GameState, playerId: PlayerId, cardId: string) {
  return getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId
  );
}

function rerollEffects(state: GameState) {
  return state.activeEffects.filter((effect) =>
    effect.modifiers.some((modifier) => modifier.type === "ATTACK_DIE_REROLL")
  );
}

// ---------------------------------------------------------------------------
// Mirth — player-scoped reroll with a power-scaled duration
// ---------------------------------------------------------------------------

describe("Mirth", () => {
  function castMirth(power: number): GameState {
    let state = createInitialGameState("mirth-seed");
    state.players.p1.hand = ["spell.mirth", ...Array.from({ length: power }, () => "stat.power")];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;

    const cast = castFor(state, "p1", "spell.mirth");
    expect(cast, "Mirth should be castable during your unit's activation").toBeTruthy();
    state = applyOk(state, cast!.action);

    for (let i = 0; i < power; i += 1) {
      const boost = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
      );
      expect(boost, `Power boost ${i + 1} should be offered`).toBeTruthy();
      state = applyOk(state, boost!.action);
    }
    return passAllReactions(state);
  }

  it("creates a player-scoped reroll the caster owns", () => {
    const state = castMirth(0);
    const effects = rerollEffects(state);
    expect(effects).toHaveLength(1);
    expect(effects[0].scope).toBe("player");
    expect(effects[0].controllerId).toBe("p1");
    const modifier = effects[0].modifiers.find((m) => m.type === "ATTACK_DIE_REROLL");
    expect(modifier).toMatchObject({ type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 1, consumeEffectOnUse: false });
  });

  it("scales only its DURATION with Power (this Activation / round / Combat)", () => {
    expect(rerollEffects(castMirth(0))[0].duration.type).toBe("current-activation");
    expect(rerollEffects(castMirth(2))[0].duration.type).toBe("current-combat-round");
    expect(rerollEffects(castMirth(4))[0].duration.type).toBe("combat");
  });

  it("actually offers the caster a reroll on their next Attack die", () => {
    let state = castMirth(0);
    const griffins = state.combat!.units.unit_p1_griffins;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    griffins.abilities = [];
    griffins.position = 9;
    skeletons.position = 13; // adjacent to 9
    skeletons.abilities = [];
    state.combat!.dice.scriptedRolls = [-1, 1, 0, 0];
    state.combat!.dice.rollCount = 0;

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    state = passAllReactions(state);

    // The -1 face opened the reroll choice, sourced from Mirth.
    expect(state.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    if (state.pendingChoice?.type === "ATTACK_DIE_REROLL") {
      expect(state.pendingChoice.rerollSources.some((source) => source.name === "Mirth")).toBe(true);
    }
  });

  it("the 'this Activation' duration expires when the caster's unit ends its turn", () => {
    let state = castMirth(0);
    expect(rerollEffects(state)).toHaveLength(1);
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(rerollEffects(state)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sorrow — skip an about-to-activate unit (UNIT_ACTIVATION_STARTED trigger)
// ---------------------------------------------------------------------------

describe("Sorrow", () => {
  /**
   * Leaves exactly `targetId` (a p2 unit) fresh, then ends p1's griffins so the
   * target becomes the active unit and the Sorrow window settles around it.
   */
  function aboutToActivate(targetId: string, p1Hand: string[]): GameState {
    const state = createInitialGameState("sorrow-seed");
    state.players.p1.hand = [...p1Hand];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== targetId;
    }
    return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
  }

  it("opens an activation-skip window for the opponent and skips the bronze unit", () => {
    let state = aboutToActivate("unit_p2_skeletons", ["spell.sorrow"]);

    expect(state.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(state.reactionWindow, "an activation-skip window should open").toBeTruthy();
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");

    const bronze = reactionFor(state, "p1", "spell.sorrow", 0);
    expect(bronze, "the bronze (free) skip should be offered").toBeTruthy();
    state = applyOk(state, bronze!.action);

    const skeletons = state.combat!.units.unit_p2_skeletons;
    expect(skeletons.activatedThisRound).toBe(true); // its turn was skipped
    expect(skeletons.movedThisActivation).toBe(false);
    expect(skeletons.attackedThisActivation).toBeFalsy();
    expect(state.combat!.activeUnitId).not.toBe("unit_p2_skeletons");
  });

  it("a bronze Sorrow cannot reach a gold unit, so no window opens", () => {
    const state = aboutToActivate("unit_p2_dread_knights", ["spell.sorrow"]);
    expect(state.combat!.activeUnitId).toBe("unit_p2_dread_knights");
    // No affordable skip reaction exists, so the window never opens and the
    // gold unit keeps its activation.
    expect(state.reactionWindow).toBeNull();
    expect(state.combat!.units.unit_p2_dread_knights.activatedThisRound).toBe(false);
  });

  it("paying 4 Power reaches a gold unit and skips it", () => {
    let state = aboutToActivate("unit_p2_dread_knights", [
      "spell.sorrow",
      "stat.power",
      "stat.power",
      "stat.power",
      "stat.power"
    ]);
    expect(state.reactionWindow, "the paid gold skip opens the window").toBeTruthy();

    const gold = reactionFor(state, "p1", "spell.sorrow", 2);
    expect(gold, "the gold (pay 4) skip should be offered").toBeTruthy();
    state = applyOk(state, {
      ...gold!.action,
      costCardIds: ["stat.power", "stat.power", "stat.power", "stat.power"]
    } as GameAction);

    expect(state.combat!.units.unit_p2_dread_knights.activatedThisRound).toBe(true);
  });

  it("never offers a window when the opponent holds no Sorrow", () => {
    const state = aboutToActivate("unit_p2_skeletons", []);
    expect(state.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(state.reactionWindow).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Slayer — roll N dice on a gold defender, apply every result but a -1, draw 1
// ---------------------------------------------------------------------------

describe("Slayer", () => {
  function slayerSetup(defenderId: string, p1Hand: string[]): GameState {
    const state = createInitialGameState("slayer-seed");
    state.players.p1.hand = [...p1Hand];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = [];
    griffins.attack = 3;
    griffins.position = 17;
    const defender = state.combat!.units[defenderId];
    defender.abilities = [];
    defender.position = 18; // adjacent to 17
    defender.defense = 2;
    defender.maxHealth = 20;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = [1, 1, 0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return state;
  }

  it("applies every '+1' as attack and draws a card (gold defender)", () => {
    let state = slayerSetup("unit_p2_dread_knights", ["spell.slayer"]);
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_dread_knights"
    });

    const slayer = reactionFor(state, "p1", "spell.slayer");
    expect(slayer, "Slayer should be offered against a gold defender").toBeTruthy();
    state = applyOk(state, slayer!.action);
    state = passAllReactions(state);

    // Two scripted "+1" faces → die contributes +2: 3 attack + 2 - 2 defense = 3.
    // (A normal single die would add only roll[0]=+1, dealing 2.)
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(3);
    expect(
      state.eventLog.some((event) => event.type === "CARDS_DRAWN" && event.playerId === "p1" && event.count === 1)
    ).toBe(true);
  });

  it("is not offered when the defender is not gold", () => {
    let state = slayerSetup("unit_p2_skeletons", ["spell.slayer"]);
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(reactionFor(state, "p1", "spell.slayer")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Inferno — area blast, 1 damage per "+1" to a space and its neighbours
// ---------------------------------------------------------------------------

describe("Inferno", () => {
  function castInferno(power: number, scripted: number[]): GameState {
    let state = createInitialGameState("inferno-seed");
    state.players.p1.hand = ["spell.inferno", ...Array.from({ length: power }, () => "stat.power")];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.position = 0; // out of the blast at space 9
    const marksmen = state.combat!.units.unit_p1_marksmen;
    marksmen.position = 8; // friendly, adjacent to 9
    marksmen.damage = 0;
    marksmen.maxHealth = 20;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.position = 9; // enemy, on the centre space
    skeletons.damage = 0;
    skeletons.maxHealth = 20;
    skeletons.abilities = [];
    state.combat!.dice.scriptedRolls = scripted;
    state.combat!.dice.rollCount = 0;

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.inferno" &&
        legal.action.target.type === "space" &&
        legal.action.target.position === 9
    );
    expect(cast, "Inferno should target the occupied space 9").toBeTruthy();
    state = applyOk(state, cast!.action);

    for (let i = 0; i < power; i += 1) {
      const boost = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
      );
      state = applyOk(state, boost!.action);
    }
    return passAllReactions(state);
  }

  it("damages every unit on and adjacent to the space — friend and foe", () => {
    // Power 0 → 1 roll; one "+1" → 1 damage each.
    const state = castInferno(0, [1, 0, 0, 0]);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1); // enemy on the space
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(1); // friendly, adjacent
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0); // outside the blast
  });

  it("rolls more dice with Power, dealing 1 per '+1'", () => {
    // Power 2 → 4 rolls; three "+1" faces → 3 damage each.
    const state = castInferno(2, [1, 1, 1, 0]);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(3);
  });

  it("deals no damage when no '+1' is rolled", () => {
    const state = castInferno(0, [-1, 0, 0, 0]);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Forgetfulness — an enemy ranged unit cannot attack during its next activation
// ---------------------------------------------------------------------------

describe("Forgetfulness", () => {
  function castForgetfulness(targetId: string, p1Hand: string[]): GameState {
    let state = createInitialGameState("forget-seed");
    state.players.p1.hand = [...p1Hand];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    // The target is a ranged unit sitting away from every enemy, so without the
    // spell it could freely shoot.
    const target = state.combat!.units[targetId];
    target.type = "ranged";
    target.movedThisActivation = false;

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.forgetfulness" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === targetId
    );
    if (!cast) {
      return passAllReactions(state); // grade too high to target — no legal cast
    }
    state = applyOk(state, cast.action);
    return passAllReactions(state);
  }

  function p2CanAttackWith(state: GameState, attackerId: string): boolean {
    return getLegalActions(state, "p2").some(
      (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === attackerId
    );
  }

  it("a forgotten ranged unit cannot attack on its next activation, but a normal one can", () => {
    // Control: a ranged skeletons unit can shoot when active.
    const control = createInitialGameState("forget-control");
    control.players.p1.hand = [];
    control.players.p2.hand = [];
    control.combat!.units.unit_p2_skeletons.type = "ranged";
    control.combat!.units.unit_p2_skeletons.movedThisActivation = false;
    control.activePlayerId = "p2";
    control.combat!.activeUnitId = "unit_p2_skeletons";
    control.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    expect(p2CanAttackWith(control, "unit_p2_skeletons")).toBe(true);

    // With Forgetfulness on it, the same activation offers no attack.
    const state = castForgetfulness("unit_p2_skeletons", ["spell.forgetfulness"]);
    expect(
      state.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "UNIT_CANNOT_ATTACK")
      ),
      "the cast should create a UNIT_CANNOT_ATTACK effect"
    ).toBe(true);

    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.movedThisActivation = false;
    expect(p2CanAttackWith(state, "unit_p2_skeletons")).toBe(false);
  });

  it("uses the 'next-activation' duration and clears once that activation ends", () => {
    let state = castForgetfulness("unit_p2_skeletons", ["spell.forgetfulness"]);
    const effect = state.activeEffects.find((e) =>
      e.modifiers.some((m) => m.type === "UNIT_CANNOT_ATTACK")
    );
    expect(effect?.duration.type).toBe("next-activation");

    // The skeletons take their (attack-less) activation and end it.
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: "unit_p2_skeletons" });

    expect(
      state.activeEffects.some((e) => e.modifiers.some((m) => m.type === "UNIT_CANNOT_ATTACK"))
    ).toBe(false);
  });

  it("a basic (Power 0) cast cannot reach a silver unit", () => {
    const state = castForgetfulness("unit_p2_vampires", ["spell.forgetfulness"]);
    // vampires is silver and flying; even forcing the type, Power 0 only reaches
    // bronze, so no UNIT_CANNOT_ATTACK effect is created.
    expect(
      state.activeEffects.some((e) => e.modifiers.some((m) => m.type === "UNIT_CANNOT_ATTACK"))
    ).toBe(false);
  });
});
