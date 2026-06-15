import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { makeActiveEffect } from "./active-effects";
import type { ActiveEffectDefinition, GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * Two artifacts that touch the deepest parts of the combat engine:
 *
 *   • Shield of the Dwarven Lords (minor) — option A is a defender reaction
 *     played AFTER the Attack die roll. It ignores the rolled die (the face
 *     counts as 0) and every additional effect that face triggered. Option B is
 *     a plain +1 defense reaction.
 *   • Orb of Vulnerability (relic) — option A switches off, for the rest of the
 *     Combat, every unit's innate spell-related ability (magic resistance,
 *     spell-damage reduction, printed spell-school immunity, the Pegasi power
 *     drain). Option B is +2 Power.
 */

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

function abilityEventIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => event.abilityId);
}

/** Pass/resolve every open window or attack-die reroll until combat is idle. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety-- > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
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
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

const SHIELD = "artifact.shield_of_the_dwarven_lords";

type AttackOpts = {
  attackerAttack?: number;
  attackerAbilities?: string[];
  attackerDeck?: string[];
  defenderDefense?: number;
  p2Hand?: string[];
};

/** Griffins (p1) melee the Skeletons (p2); returns the declared-attack state. */
function declareAttack(seed: string, rolls: number[], opts: AttackOpts = {}): GameState {
  const state = createInitialGameState(seed);
  const attacker = state.combat!.units.unit_p1_griffins;
  attacker.type = "ground";
  attacker.position = 9;
  attacker.attack = opts.attackerAttack ?? 5;
  attacker.abilities = opts.attackerAbilities ?? [];
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.position = 13; // adjacent to 9
  defender.defense = opts.defenderDefense ?? 1;
  defender.maxHealth = 40;
  defender.damage = 0;
  defender.abilities = [];
  state.players.p1.hand = [];
  if (opts.attackerDeck) {
    state.players.p1.deck = opts.attackerDeck;
  }
  state.players.p2.hand = opts.p2Hand ?? [];
  script(state, rolls);
  setActive(state, "p1", "unit_p1_griffins");
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
}

/** Pass every attack-declared window until the post-roll die-settled window. */
function passToDieSettledWindow(state: GameState): GameState {
  let current = state;
  let safety = 12;
  while (
    safety-- > 0 &&
    current.reactionWindow &&
    current.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED"
  ) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function skeletonDamage(state: GameState): number {
  return state.combat!.units.unit_p2_skeletons.damage;
}

// ---------------------------------------------------------------------------
// Shield of the Dwarven Lords
// ---------------------------------------------------------------------------

describe("Shield of the Dwarven Lords — ignore the Attack die (option A)", () => {
  it("opens a post-roll window for the defender once the die is rolled", () => {
    const declared = declareAttack("dwarven-lords-window", [1, 0, 0], { p2Hand: [SHIELD] });
    const atDie = passToDieSettledWindow(declared);

    expect(atDie.reactionWindow?.triggerEvent.type).toBe("ATTACK_DIE_SETTLED");
    const offered = atDie.reactionWindow?.legalReactions.p2 ?? [];
    expect(
      offered.some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === SHIELD && legal.action.optionIndex === 0
      )
    ).toBe(true);
  });

  it("ignoring a '+1' die drops the die bonus from the resolved hit", () => {
    // Control: nobody cancels, the +1 die lands → 5 attack + 1 − 1 defense = 5.
    const control = settle(passToDieSettledWindow(declareAttack("dwarven-lords-control", [1, 0, 0], { p2Hand: [] })));
    expect(skeletonDamage(control)).toBe(5);

    // The defender ignores the die → 5 attack + 0 − 1 defense = 4.
    const atDie = passToDieSettledWindow(declareAttack("dwarven-lords-cancel", [1, 0, 0], { p2Hand: [SHIELD] }));
    const shield = (atDie.reactionWindow?.legalReactions.p2 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === SHIELD && legal.action.optionIndex === 0
    );
    expect(shield, "the die-cancel option should be offered").toBeTruthy();
    const after = settle(applyOk(atDie, shield!.action));

    expect(skeletonDamage(after)).toBe(4);
    // The card is spent and the window is gone.
    expect(after.players.p2.hand).not.toContain(SHIELD);
    expect(after.reactionWindow).toBeNull();
  });

  it("ignores the additional effect the die triggered (Minotaurs' draw) and the die's own −1", () => {
    // The attacker draws a card on a '-1'. Control: the −1 lands, the draw fires,
    // and 5 attack − 1 − 1 defense = 3 damage.
    const control = settle(
      passToDieSettledWindow(
        declareAttack("dwarven-lords-minotaur-control", [-1, 0, 0], {
          attackerAbilities: ["minotaur-draw-on-miss"],
          attackerDeck: ["stat.attack"],
          p2Hand: []
        })
      )
    );
    expect(control.players.p1.hand).toContain("stat.attack");
    expect(abilityEventIds(control)).toContain("minotaur-draw-on-miss");
    expect(skeletonDamage(control)).toBe(3);

    // The defender ignores the die: no draw, no '-1' — 5 attack + 0 − 1 = 4.
    const atDie = passToDieSettledWindow(
      declareAttack("dwarven-lords-minotaur-cancel", [-1, 0, 0], {
        attackerAbilities: ["minotaur-draw-on-miss"],
        attackerDeck: ["stat.attack"],
        p2Hand: [SHIELD]
      })
    );
    const shield = (atDie.reactionWindow?.legalReactions.p2 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === SHIELD && legal.action.optionIndex === 0
    );
    const after = settle(applyOk(atDie, shield!.action));

    expect(after.players.p1.hand).not.toContain("stat.attack");
    expect(abilityEventIds(after)).not.toContain("minotaur-draw-on-miss");
    expect(skeletonDamage(after)).toBe(4);
  });

  it("never offers option A in the ordinary attack-declared window (only the +1 defense side)", () => {
    const declared = declareAttack("dwarven-lords-declared", [1, 0, 0], { p2Hand: [SHIELD] });
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_ATTACK_DECLARED");
    const offered = declared.reactionWindow?.legalReactions.p2 ?? [];
    const shieldOffers = offered.filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === SHIELD
    );
    expect(shieldOffers).toHaveLength(1);
    expect(shieldOffers[0]?.action.type === "PLAY_REACTION" && shieldOffers[0].action.optionIndex).toBe(1);
  });

  it("never offers option A as a free combat play", () => {
    const state = createInitialGameState("dwarven-lords-no-combat-play");
    state.players.p1.hand = [SHIELD];
    setActive(state, "p1", "unit_p1_griffins");
    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === SHIELD && legal.action.optionIndex === 0
    );
    expect(plays).toHaveLength(0);
  });
});

describe("Shield of the Dwarven Lords — +1 defense (option B)", () => {
  it("adds +1 defense to the incoming attack", () => {
    // Control: 5 attack + 0 die − 1 defense = 4.
    const control = settle(passToDieSettledWindow(declareAttack("dwarven-lords-def-control", [0, 0, 0], { p2Hand: [] })));
    expect(skeletonDamage(control)).toBe(4);

    // Play +1 defense in the attack-declared window → 5 − (1 + 1) = 3.
    const declared = declareAttack("dwarven-lords-def", [0, 0, 0], { p2Hand: [SHIELD] });
    const defense = (declared.reactionWindow?.legalReactions.p2 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === SHIELD && legal.action.optionIndex === 1
    );
    expect(defense, "the +1 defense option should be offered").toBeTruthy();
    const after = settle(applyOk(declared, defense!.action));
    expect(skeletonDamage(after)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Orb of Vulnerability
// ---------------------------------------------------------------------------

const ORB = "artifact.orb_of_vulnerability";

const ORB_EFFECT: ActiveEffectDefinition = {
  name: "Orb of Vulnerability",
  scope: "global",
  duration: { type: "combat" },
  modifiers: [{ type: "SUPPRESS_SPELL_ABILITIES" }]
};

function addOrbSuppression(state: GameState): void {
  state.activeEffects.push(
    makeActiveEffect(state, ORB_EFFECT, { type: "card", cardId: ORB, controllerId: "p1" }, "p1")
  );
}

function castArrow(state: GameState): GameState {
  setActive(state, "p1", "unit_p1_griffins");
  const next = applyOk(state, {
    type: "CAST_SPELL",
    playerId: "p1",
    cardId: "spell.magic_arrow",
    target: { type: "unit", unitId: "unit_p2_skeletons" }
  });
  return settle(next);
}

describe("Orb of Vulnerability — negate spell-related abilities (option A)", () => {
  it("negates the Dwarves' Magic Resistance (no roll, the spell takes hold)", () => {
    const state = createInitialGameState("orb-dwarf");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = ["dwarf-magic-resistance"];
    target.maxHealth = 20;
    target.damage = 0;
    script(state, [1]); // a "+1" would normally negate the spell
    addOrbSuppression(state);

    const next = castArrow(state);
    expect(skeletonDamage(next)).toBe(1);
    expect(abilityEventIds(next)).not.toContain("dwarf-magic-resistance");
  });

  it("negates 'reduce Spell damage' passives so the full hit lands", () => {
    function arrow(withOrb: boolean): number {
      const state = createInitialGameState(`orb-reduce-${withOrb}`);
      state.players.p1.hand = ["spell.magic_arrow"];
      state.players.p2.hand = [];
      const target = state.combat!.units.unit_p2_skeletons;
      target.abilities = ["reduce-spell-damage-2"];
      target.maxHealth = 20;
      target.damage = 0;
      if (withOrb) {
        addOrbSuppression(state);
      }
      return skeletonDamage(castArrow(state));
    }

    // Magic Arrow deals 1; "reduce Spell damage 2" floors it at 0 without the
    // Orb, but the Orb restores the full point.
    expect(arrow(false)).toBe(0);
    expect(arrow(true)).toBe(1);
  });

  it("negates printed spell-school immunity (the spell can now target and damage it)", () => {
    const state = createInitialGameState("orb-immunity");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = ["magic-elemental-immunity"]; // immune to Magic Arrow ("any")
    target.maxHealth = 20;
    target.damage = 0;
    setActive(state, "p1", "unit_p1_griffins");

    // Without the Orb the immune unit is not even a legal target.
    const blocked = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(blocked.errors.length).toBeGreaterThan(0);

    addOrbSuppression(state);
    const next = castArrow(state);
    expect(skeletonDamage(next)).toBe(1);
  });

  it("negates the Pegasi enemy-spell Power drain", () => {
    function arrowAtPower1(withOrb: boolean): number {
      const state = createInitialGameState(`orb-pegasi-${withOrb}`);
      state.players.p1.hand = ["spell.magic_arrow", "spell.bless"];
      state.players.p2.hand = [];
      const target = state.combat!.units.unit_p2_skeletons;
      target.maxHealth = 20;
      target.damage = 0;
      state.combat!.units.unit_p2_vampires.abilities = ["pegasi-magic-damper"];
      if (withOrb) {
        addOrbSuppression(state);
      }
      setActive(state, "p1", "unit_p1_griffins");
      let next = applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.magic_arrow",
        target: { type: "unit", unitId: "unit_p2_skeletons" }
      });
      const boost = (next.reactionWindow?.legalReactions.p1 ?? []).find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.asPowerBoost === true
      );
      next = settle(applyOk(next, boost!.action));
      return skeletonDamage(next);
    }

    // Power-1 Magic Arrow deals 2; the enemy Pegasi damps it to power 0 (1
    // damage) — unless the Orb has switched the damper off.
    expect(arrowAtPower1(false)).toBe(1);
    expect(arrowAtPower1(true)).toBe(2);
  });

  it("playing option A creates the combat-wide effect and discards the card normally", () => {
    const state = createInitialGameState("orb-play");
    state.players.p1.hand = [ORB];
    state.players.p1.removed = [];
    setActive(state, "p1", "unit_p1_griffins");

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === ORB && legal.action.optionIndex === 0
    );
    expect(play, "Orb option A should be a legal combat play").toBeTruthy();
    const after = applyOk(state, play!.action);

    expect(
      after.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "SUPPRESS_SPELL_ABILITIES")
      )
    ).toBe(true);
    // The printed card has no remove-from-game clause. Its combat-long
    // suppression effect keeps the card physically in play; once the effect
    // ends it returns to the discard pile — never to the removed-from-game zone.
    expect(after.players.p1.removed).not.toContain(ORB);
    expect(after.players.p1.hand).not.toContain(ORB);
    const held = (after.players.p1.ongoingCards ?? []).find((entry) => entry.cardId === ORB);
    expect(held, "Orb should be held in play by its ongoing suppression effect").toBeTruthy();
    expect(held?.returnTo).toBe("discard");
  });
});

describe("Orb of Vulnerability — +2 Power (option B)", () => {
  it("adds +2 Power to a spell being cast", () => {
    const state = createInitialGameState("orb-power");
    state.players.p1.hand = ["spell.magic_arrow", ORB];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 20;
    target.damage = 0;
    setActive(state, "p1", "unit_p1_griffins");

    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    const power = (cast.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === ORB && legal.action.optionIndex === 1
    );
    expect(power, "Orb's +2 Power option should be offered toward the cast").toBeTruthy();
    const after = settle(applyOk(cast, power!.action));

    // Magic Arrow at power 2 deals 3 damage.
    expect(skeletonDamage(after)).toBe(3);
  });
});
