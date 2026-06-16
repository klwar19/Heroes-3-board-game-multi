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
      legal.action.optionIndex === optionIndex &&
      // The card's effect play, never its "discard for +1 Power" alternative.
      !legal.action.asPowerBoost
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

  /** Any "discard a Spell for +1 Power" reaction offered to p1 right now. */
  function anyPowerBoost(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.asPowerBoost === true
    );
  }

  it("offers the FREE bronze skip against a bronze unit (and no +1 Power clutter)", () => {
    let state = aboutToActivate("unit_p2_skeletons", ["spell.sorrow"]);

    expect(state.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(state.reactionWindow, "an activation-skip window should open").toBeTruthy();
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");

    // Only the matching (bronze) option is offered — option 0, free.
    expect(reactionFor(state, "p1", "spell.sorrow", 0), "the free bronze skip is offered").toBeTruthy();
    expect(reactionFor(state, "p1", "spell.sorrow", 1), "the silver option is NOT offered for a bronze unit").toBeUndefined();
    // The unusable "+1 Power" discard is not dangled in this window.
    expect(anyPowerBoost(state), "no +1 Power discard in the activation-skip window").toBeUndefined();

    state = applyOk(state, reactionFor(state, "p1", "spell.sorrow", 0)!.action);
    const skeletons = state.combat!.units.unit_p2_skeletons;
    expect(skeletons.activatedThisRound).toBe(true); // its turn was skipped
    expect(skeletons.movedThisActivation).toBe(false);
    expect(skeletons.attackedThisActivation).toBeFalsy();
    expect(state.combat!.activeUnitId).not.toBe("unit_p2_skeletons");
  });

  it("skips a silver unit by paying the option's 2 Power cost", () => {
    let state = aboutToActivate("unit_p2_vampires", ["spell.sorrow", "stat.power", "stat.power"]);
    expect(state.reactionWindow, "the silver skip is affordable, so the window opens").toBeTruthy();

    // The matching option is the silver one (index 1); bronze (0) can't reach silver.
    expect(reactionFor(state, "p1", "spell.sorrow", 0), "bronze cannot reach a silver unit").toBeUndefined();
    const silver = reactionFor(state, "p1", "spell.sorrow", 1);
    expect(silver, "the silver skip (pay 2) is offered").toBeTruthy();

    state = applyOk(state, {
      ...silver!.action,
      costCardIds: ["stat.power", "stat.power"]
    } as GameAction);
    expect(state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);
  });

  it("skips a gold unit by paying the option's 4 Power cost", () => {
    let state = aboutToActivate("unit_p2_dread_knights", [
      "spell.sorrow",
      "stat.power",
      "stat.power",
      "stat.power",
      "stat.power"
    ]);
    expect(state.reactionWindow, "the gold skip is affordable, so the window opens").toBeTruthy();
    const gold = reactionFor(state, "p1", "spell.sorrow", 2);
    expect(gold, "the gold skip (pay 4) is offered").toBeTruthy();

    state = applyOk(state, {
      ...gold!.action,
      costCardIds: ["stat.power", "stat.power", "stat.power", "stat.power"]
    } as GameAction);
    expect(state.combat!.units.unit_p2_dread_knights.activatedThisRound).toBe(true);
  });

  it("cannot afford a gold unit with no Power, so no window opens", () => {
    const state = aboutToActivate("unit_p2_dread_knights", ["spell.sorrow"]);
    expect(state.combat!.activeUnitId).toBe("unit_p2_dread_knights");
    // The gold option costs 4 power-source cards and none are in hand, so it is
    // never offered, the window does not open and the gold unit keeps its turn.
    expect(state.reactionWindow).toBeNull();
    expect(state.combat!.units.unit_p2_dread_knights.activatedThisRound).toBe(false);
  });

  it("never offers a window when the opponent holds no Sorrow", () => {
    const state = aboutToActivate("unit_p2_skeletons", []);
    expect(state.combat!.activeUnitId).toBe("unit_p2_skeletons");
    expect(state.reactionWindow).toBeNull();
  });

  // The grade cost is a Power VALUE, not a card count: a single +2 artifact
  // (Necklace of Dragonteeth) pays the whole 2-Power silver skip on its own,
  // where the old "discard 2 cards" rule would have demanded two cards.
  it("reaches the silver skip with one +2 Power artifact (value, not card count)", () => {
    let state = aboutToActivate("unit_p2_vampires", ["spell.sorrow", "artifact.necklace_of_dragonteeth"]);
    expect(state.reactionWindow, "+2 Power covers the silver skip, so the window opens").toBeTruthy();
    const silver = reactionFor(state, "p1", "spell.sorrow", 1);
    expect(silver, "the silver skip is affordable from one +2 artifact").toBeTruthy();
    state = applyOk(state, { ...silver!.action, costCardIds: ["artifact.necklace_of_dragonteeth"] } as GameAction);
    expect(state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);
  });

  it("a single +2 Power artifact still cannot reach a gold unit (needs 4 Power)", () => {
    const state = aboutToActivate("unit_p2_dread_knights", ["spell.sorrow", "artifact.necklace_of_dragonteeth"]);
    // 2 Power < the 4 the gold skip needs, so its window never opens.
    expect(state.reactionWindow).toBeNull();
    expect(state.combat!.units.unit_p2_dread_knights.activatedThisRound).toBe(false);
  });

  it("counts standing School-of-Magic Power toward the grade, shrinking the discard", () => {
    // Earth Magic in play grants +1 standing Power to Sorrow (an Earth spell).
    // That +1, plus one Spell discarded for +1, reaches the 2-Power silver skip.
    const withSchool = createInitialGameState("sorrow-school-seed");
    withSchool.players.p1.hand = ["spell.sorrow", "spell.haste"];
    withSchool.players.p1.permanents = ["ability.earth_magic"];
    withSchool.players.p2.hand = [];
    withSchool.activePlayerId = "p1";
    withSchool.combat!.activeUnitId = "unit_p1_griffins";
    for (const unit of Object.values(withSchool.combat!.units)) {
      unit.activatedThisRound = unit.id !== "unit_p1_griffins" && unit.id !== "unit_p2_vampires";
    }
    let state = applyOk(withSchool, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(state.reactionWindow, "standing +1 plus one discard reaches silver").toBeTruthy();
    const silver = reactionFor(state, "p1", "spell.sorrow", 1);
    expect(silver, "silver is affordable with standing Power + one discard").toBeTruthy();
    state = applyOk(state, { ...silver!.action, costCardIds: ["spell.haste"] } as GameAction);
    expect(state.combat!.units.unit_p2_vampires.activatedThisRound).toBe(true);

    // Without the School permanent the very same hand (one +1 discard = 1 Power)
    // falls short of the 2-Power silver skip, so no window opens (guard).
    const noSchool = aboutToActivate("unit_p2_vampires", ["spell.sorrow", "spell.haste"]);
    expect(noSchool.reactionWindow, "one +1 discard alone cannot reach silver").toBeNull();
  });

  it("rejects over-paying the silver skip (a redundant Power card must be dropped)", () => {
    const state = aboutToActivate("unit_p2_vampires", [
      "spell.sorrow",
      "artifact.necklace_of_dragonteeth",
      "artifact.necklace_of_dragonteeth"
    ]);
    const silver = reactionFor(state, "p1", "spell.sorrow", 1)!;
    // Two +2 artifacts (4 Power) for a 2-Power skip — the second is redundant.
    const result = applyAction(state, {
      ...silver.action,
      costCardIds: ["artifact.necklace_of_dragonteeth", "artifact.necklace_of_dragonteeth"]
    } as GameAction);
    expect(result.errors[0]?.message).toContain("more Power than it needs");
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

    // The attack rolls ONLY the Slayer dice (two here) — there is no separate
    // original single die. Two "+1" faces → die contributes +2.
    const rolled = state.eventLog.find(
      (event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation
    );
    expect(rolled?.type === "ATTACK_ROLLED" ? rolled.rolls : []).toEqual([1, 1]);
    expect(rolled?.type === "ATTACK_ROLLED" ? rolled.roll : -99).toBe(2);

    // 3 attack + 2 (two "+1"s) - 2 defense = 3 damage. (A normal single die
    // would add only roll[0]=+1, dealing 2.)
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

  it("scales the roll count with Power added AFTER it is played (not one chunk)", () => {
    let state = slayerSetup("unit_p2_dread_knights", ["spell.slayer", "spell.haste", "spell.haste"]);
    state.combat!.dice.scriptedRolls = [1, 1, 1, 1, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_dread_knights"
    });
    state = applyOk(state, reactionFor(state, "p1", "spell.slayer")!.action);

    // The Slayer instant stays empowerable: +1 Power discards are offered after it.
    const boost = (current: GameState) =>
      getLegalActions(current, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.asPowerBoost === true &&
          legal.action.cardId === "spell.haste"
      );
    expect(boost(state), "Power can still be added after Slayer is played").toBeTruthy();
    state = applyOk(state, boost(state)!.action);
    state = applyOk(state, boost(state)!.action);
    state = passAllReactions(state);

    // Power 0 → 2 rolls; the two +1 Power discards lift it to Power 2 → 4 rolls.
    const rolled = state.eventLog.find((event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation);
    expect(rolled?.type === "ATTACK_ROLLED" ? rolled.rolls.length : -1).toBe(4);
    expect(rolled?.type === "ATTACK_ROLLED" ? rolled.sumAllDice : undefined).toBe(true);
  });

  it("a gold unit's Magic Resistance shrugs Slayer off (normal die, no extra rolls, no draw)", () => {
    let state = slayerSetup("unit_p2_dread_knights", ["spell.slayer"]);
    state.combat!.units.unit_p2_dread_knights.abilities = ["dwarf-magic-resistance"];
    // Resistance rolls first: a "+1" negates the Spell; then the attack rolls its
    // single normal die ("0" here), so the gold unit takes just 3 atk − 2 def = 1.
    state.combat!.dice.scriptedRolls = [1, 0];
    state.combat!.dice.rollCount = 0;
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_dread_knights"
    });
    state = applyOk(state, reactionFor(state, "p1", "spell.slayer")!.action);
    state = passAllReactions(state);

    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "dwarf-magic-resistance"
      ),
      "the gold Dwarf should roll its Magic Resistance against Slayer"
    ).toBe(true);
    const rolled = state.eventLog.find((event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation);
    expect(rolled?.type === "ATTACK_ROLLED" ? rolled.rolls : []).toEqual([0]); // a single normal die, not Slayer's pool
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(
      state.eventLog.some((event) => event.type === "CARDS_DRAWN" && event.playerId === "p1"),
      "the negated Slayer draws no card"
    ).toBe(false);
  });

  // School-restricted Power (an Orb) may empower a matching-school spell instant
  // played into an attack. Slayer is Fire, so the Fire Orb's +5 lifts its roll
  // count (Power 4+ → 6 dice); a Water Orb is never offered against it.
  it("a Fire Orb (+5, Fire-only) empowers a reaction-played Slayer; a Water Orb does not", () => {
    let state = slayerSetup("unit_p2_dread_knights", ["spell.slayer", "artifact.orb_of_tempestuous_fire"]);
    state.players.p1.hand.push("artifact.orb_of_driving_rain"); // Water Orb (+5 Water-only)
    state.combat!.dice.scriptedRolls = [1, 1, 0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_dread_knights"
    });

    // Before Slayer is on the attack, no Orb is offered (no Fire spell yet).
    expect(reactionFor(state, "p1", "artifact.orb_of_tempestuous_fire", 1)).toBeUndefined();

    state = applyOk(state, reactionFor(state, "p1", "spell.slayer")!.action);

    // Now the Fire Orb may fuel the Fire Slayer; the Water Orb still may not.
    expect(reactionFor(state, "p1", "artifact.orb_of_tempestuous_fire", 1), "Fire Orb fuels Fire Slayer").toBeTruthy();
    expect(
      reactionFor(state, "p1", "artifact.orb_of_driving_rain", 1),
      "a Water Orb never empowers a Fire spell"
    ).toBeUndefined();

    state = applyOk(state, reactionFor(state, "p1", "artifact.orb_of_tempestuous_fire", 1)!.action);
    state = passAllReactions(state);

    // Power 0 → 2 rolls; the Orb's +5 lifts Slayer to its Power-4 row → 6 dice.
    const rolled = state.eventLog.find((event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation);
    expect(rolled?.type === "ATTACK_ROLLED" ? rolled.rolls.length : -1).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Magic Resistance vs the instant attack/defense Spells (Curse, Bless, …)
// ---------------------------------------------------------------------------

describe("Instant attack/defense Spells vs Magic Resistance", () => {
  /** p1 griffins (attack 4) attacks a Dwarf p2 skeletons (defense 4). */
  function curseAttack(resistRoll: number): GameState {
    const state = createInitialGameState("curse-resist");
    state.players.p1.hand = ["spell.curse"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = [];
    griffins.attack = 4;
    griffins.position = 17;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.abilities = ["dwarf-magic-resistance"];
    skeletons.position = 18;
    skeletons.defense = 4;
    skeletons.maxHealth = 20;
    skeletons.damage = 0;
    // First die = the Dwarf's resistance roll; second = the attack die (always "0").
    state.combat!.dice.scriptedRolls = [resistRoll, 0];
    state.combat!.dice.rollCount = 0;
    let next = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    next = applyOk(next, reactionFor(next, "p1", "spell.curse")!.action);
    return passAllReactions(next);
  }

  it("a Dwarf shrugs Curse off on a '+1' — its defense is not lowered", () => {
    const resisted = curseAttack(1);
    expect(
      resisted.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "dwarf-magic-resistance"
      )
    ).toBe(true);
    // Curse negated → 4 attack vs the full 4 defense → no damage.
    expect(resisted.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("Curse lands when the Dwarf does not roll the resist face", () => {
    const cursed = curseAttack(0);
    // Curse applied → defense 4 − 1 = 3, so 4 attack lands 1 damage.
    expect(cursed.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("a Dwarf shrugs Bless off too (the Attack die is still rolled, not ignored)", () => {
    const state = createInitialGameState("bless-resist");
    state.players.p1.hand = ["spell.bless"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = ["dwarf-magic-resistance"]; // a Dwarf casting Bless on itself
    griffins.attack = 5;
    griffins.position = 17;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.abilities = [];
    skeletons.position = 18;
    skeletons.defense = 4;
    skeletons.maxHealth = 20;
    skeletons.damage = 0;
    // Resistance "+1" negates Bless; the attack then rolls a real "-1" die. Were
    // Bless not negated it would ignore the die (treat it as 0) for 1 damage.
    state.combat!.dice.scriptedRolls = [1, -1];
    state.combat!.dice.rollCount = 0;
    let next = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    next = applyOk(next, reactionFor(next, "p1", "spell.bless")!.action);
    next = passAllReactions(next);

    expect(
      next.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "dwarf-magic-resistance"
      )
    ).toBe(true);
    // Bless negated → the "-1" die applies: 5 − 1 = 4 attack vs 4 defense = 0 damage.
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(0);
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

  it("logs the dice roll BEFORE the damage so the table can show the dice first", () => {
    const state = castInferno(2, [1, 1, 1, 0]);
    const diceIndex = state.eventLog.findIndex((event) => event.type === "SPELL_DICE_ROLLED");
    const firstDamageIndex = state.eventLog.findIndex((event) => event.type === "DAMAGE_ASSIGNED");
    expect(diceIndex, "Inferno logs a SPELL_DICE_ROLLED event").toBeGreaterThanOrEqual(0);
    expect(diceIndex, "the dice are logged before any damage lands").toBeLessThan(firstDamageIndex);

    const diceEvent = state.eventLog[diceIndex];
    expect(diceEvent.type === "SPELL_DICE_ROLLED" ? diceEvent.spellCardId : "").toBe("spell.inferno");
    expect(diceEvent.type === "SPELL_DICE_ROLLED" ? diceEvent.rolls : []).toEqual([1, 1, 1, 0]);
    expect(diceEvent.type === "SPELL_DICE_ROLLED" ? diceEvent.hits : -1).toBe(3); // three "+1"s
    expect(diceEvent.type === "SPELL_DICE_ROLLED" ? diceEvent.position : -1).toBe(9);
  });

  it("still shows the dice on a complete whiff (no '+1' rolled)", () => {
    const state = castInferno(0, [-1, 0, 0, 0]);
    const diceEvent = state.eventLog.find((event) => event.type === "SPELL_DICE_ROLLED");
    expect(diceEvent, "a whiff is still rolled out for the player to see").toBeTruthy();
    expect(diceEvent?.type === "SPELL_DICE_ROLLED" ? diceEvent.hits : -1).toBe(0);
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

// ---------------------------------------------------------------------------
// Opponent's Resistance cancels an instant Spell buff played into an attack
// ---------------------------------------------------------------------------

describe("Resistance vs instant combat Spells", () => {
  /** p1 griffins (attack 5) attacks `defenderId` (defense 4); p1 plays `buff`. */
  function attackWithBuff(buff: string, defenderId: string, scripted: number[]): GameState {
    const state = createInitialGameState("resist-instant-seed");
    state.players.p1.hand = [buff];
    state.players.p2.hand = ["ability.resistance"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.abilities = [];
    griffins.attack = 5;
    griffins.position = 17;
    const defender = state.combat!.units[defenderId];
    defender.abilities = [];
    defender.position = 18;
    defender.defense = 4;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = scripted;
    state.combat!.dice.rollCount = 0;
    let next = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId
    });
    next = applyOk(next, reactionFor(next, "p1", buff)!.action);
    // Hand the window to p2 (p1 has finished its plays).
    while (next.reactionWindow && next.reactionWindow.priorityPlayerId === "p1") {
      next = applyOk(next, { type: "PASS_REACTION", playerId: "p1" });
    }
    return next;
  }

  function p2Resistance(state: GameState) {
    return getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "ability.resistance" &&
        legal.action.mode === "basic"
    );
  }

  it("the attacked side may Resistance a Curse, reversing the -1 defense", () => {
    // Attack die "0": Curse drops defense 4→3, so 5 vs 3 = 2 damage if it holds.
    let state = attackWithBuff("spell.curse", "unit_p2_skeletons", [0, 0]);
    const resist = p2Resistance(state);
    expect(resist, "Resistance is offered against the enemy Curse").toBeTruthy();
    state = applyOk(state, resist!.action);
    state = passAllReactions(state);
    // Curse reversed: 5 vs the full 4 defense = 1 damage.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(
      state.eventLog.some((event) => event.type === "SPELL_CAST_CANCELLED" && event.spellCardId === "spell.curse")
    ).toBe(true);
  });

  it("the Curse holds for 2 damage when the opponent does not Resistance it", () => {
    const state = passAllReactions(attackWithBuff("spell.curse", "unit_p2_skeletons", [0, 0]));
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("Resistance on a Slayer drops the extra rolls and the draw (normal single die)", () => {
    // Slayer would roll twice (two +1s → +2); resisted, the attack rolls one die.
    let state = attackWithBuff("spell.slayer", "unit_p2_dread_knights", [1, 1, 1, 1]);
    const resist = p2Resistance(state);
    expect(resist, "Resistance is offered against the enemy Slayer").toBeTruthy();
    state = applyOk(state, resist!.action);
    state = passAllReactions(state);

    const rolled = state.eventLog.find((event) => event.type === "ATTACK_ROLLED" && !event.isRetaliation);
    expect(rolled?.type === "ATTACK_ROLLED" ? rolled.rolls.length : -1).toBe(1); // one die, not Slayer's pool
    expect(
      state.eventLog.some((event) => event.type === "CARDS_DRAWN" && event.playerId === "p1"),
      "the cancelled Slayer draws no card"
    ).toBe(false);
  });

  it("Resistance is not offered when the attacker played no Spell buff", () => {
    const state = createInitialGameState("resist-none-seed");
    state.players.p1.hand = [];
    state.players.p2.hand = ["ability.resistance"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.combat!.units.unit_p1_griffins.abilities = [];
    state.combat!.units.unit_p1_griffins.position = 17;
    state.combat!.units.unit_p2_skeletons.position = 18;
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    // A bare attack offers p2 no Resistance (there is no Spell to end).
    expect(p2Resistance(declared)).toBeUndefined();
  });
});
