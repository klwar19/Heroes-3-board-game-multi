import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Two Tower-expansion artifacts imported from the fan wiki, each driven through
 * the real engine so a test fails if the wiring is removed:
 *
 *   • Pendant of Negativity (Major) — option A ends an enemy Air Magic spell
 *     (CANCEL_SPELL{air}, no Power/level gate); option B places a combat-long Air
 *     immunity on one of your units (an Air spell can no longer target or splash
 *     it).
 *   • Orb of Inhibition (Relic) — option A makes every Spell/Specialty CARD deal
 *     0 damage this Combat (removing the card); option B switches off every
 *     unit's special abilities for the current Combat round.
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

function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function passUntil(state: GameState, playerId: PlayerId): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function reactionAction(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === cardId &&
      entry.action.optionIndex === optionIndex &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

function reactionOffered(state: GameState, playerId: PlayerId, cardId: string): boolean {
  return getLegalActions(state, playerId).some(
    (entry) => entry.action.type === "PLAY_REACTION" && entry.action.cardId === cardId && !entry.action.asPowerBoost
  );
}

function skeletonDamage(state: GameState): number {
  return state.combat!.units.unit_p2_skeletons.damage;
}

function castAtSkeletons(state: GameState, playerId: PlayerId, cardId: string) {
  return applyAction(state, {
    type: "CAST_SPELL",
    playerId,
    cardId,
    target: { type: "unit", unitId: "unit_p2_skeletons" }
  });
}

// ---------------------------------------------------------------------------
// Pendant of Negativity
// ---------------------------------------------------------------------------

const PENDANT = "artifact.pendant_of_negativity";

describe("Pendant of Negativity — counter an Air Magic spell (option A)", () => {
  // p1 casts the (Air) Lightning Bolt at p2's Skeletons; p2 may answer with the
  // Pendant. The helper hands p2 the Pendant (or not) and stops once priority
  // reaches p2.
  function enemyBolt(seed: string, spellId: string, p2Hand: string[]): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [spellId];
    state.players.p2.hand = p2Hand;
    setActive(state, "p1", "unit_p1_marksmen");
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 30;
    target.damage = 0;
    script(state, [0, 0, 0]);

    const result = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: spellId,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    return passUntil(result.state, "p2");
  }

  it("control: with no Pendant the Air bolt resolves for 2 damage", () => {
    expect(settle(enemyBolt("pendant-control", "spell.lightning_bolt", [])).combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("option A ends an enemy Air spell (the bolt deals 0)", () => {
    const onP2 = enemyBolt("pendant-cancel", "spell.lightning_bolt", [PENDANT]);
    expect(reactionOffered(onP2, "p2", PENDANT), "the Pendant should react to the Air cast").toBe(true);
    const play = reactionAction(onP2, "p2", PENDANT, 0);
    expect(play, "the Air-cancel side should be a legal reaction").toBeTruthy();
    const after = settle(applyOk(onP2, play!));

    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(after.players.p2.discard).toContain(PENDANT);
  });

  it("is NOT offered against a non-Air spell (Earth Implosion)", () => {
    const onP2 = enemyBolt("pendant-wrong-school", "spell.implosion", [PENDANT]);
    expect(reactionOffered(onP2, "p2", PENDANT)).toBe(false);
  });

  it("is NOT offered to the caster against their own Air spell", () => {
    const state = createInitialGameState("pendant-friendly");
    state.players.p1.hand = ["spell.lightning_bolt", PENDANT];
    state.players.p2.hand = [];
    setActive(state, "p1", "unit_p1_marksmen");
    const casted = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.lightning_bolt",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    expect(reactionOffered(casted, "p1", PENDANT)).toBe(false);
  });
});

describe("Pendant of Negativity — ongoing Air immunity (option B)", () => {
  // p1 holds the Pendant and plays its option B onto one of its own units in
  // combat; the unit then carries a combat-long Air immunity.
  function playImmunityOn(seed: string, unitId: UnitId): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [PENDANT];
    setActive(state, "p1", "unit_p1_griffins");

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === PENDANT &&
        legal.action.optionIndex === 1 &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === unitId
    );
    expect(play, "the immunity side should be playable on a friendly unit").toBeTruthy();
    return applyOk(state, play!.action);
  }

  it("playing option B places an Air SPELL_SCHOOL_IMMUNE effect on the chosen unit", () => {
    const after = playImmunityOn("pendant-immunity-play", "unit_p1_griffins");
    const effect = after.activeEffects.find(
      (entry) =>
        entry.target?.type === "unit" &&
        entry.target.unitId === "unit_p1_griffins" &&
        entry.modifiers.some((modifier) => modifier.type === "SPELL_SCHOOL_IMMUNE")
    );
    expect(effect, "an Air immunity effect should be on the Griffins").toBeTruthy();
    const modifier = effect!.modifiers.find((entry) => entry.type === "SPELL_SCHOOL_IMMUNE");
    expect(modifier?.type === "SPELL_SCHOOL_IMMUNE" && modifier.schools).toEqual(["air"]);
    expect(after.players.p1.hand).not.toContain(PENDANT);
  });

  it("an Air immunity blocks an Air spell from targeting the unit, but not an Earth spell", () => {
    const base = createInitialGameState("pendant-immunity-target");
    // Drop the Air immunity straight onto p2's Skeletons, then let p1 try to hit
    // it with Air vs Earth spells.
    const target = base.combat!.units.unit_p2_skeletons;
    target.maxHealth = 30;
    target.damage = 0;
    setActive(base, "p1", "unit_p1_marksmen");
    base.activeEffects.push({
      id: "effect_pendant_immunity",
      name: "Pendant of Negativity",
      scope: "unit",
      duration: { type: "combat" },
      modifiers: [{ type: "SPELL_SCHOOL_IMMUNE", schools: ["air"] }],
      source: { type: "card", cardId: PENDANT, controllerId: "p2" },
      controllerId: "p2",
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      startedRound: base.round,
      startedCombatRound: base.combat!.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });

    base.players.p1.hand = ["spell.lightning_bolt", "spell.implosion", "spell.magic_arrow"];

    // Air (Lightning Bolt) cannot target the protected unit.
    expect(castAtSkeletons(base, "p1", "spell.lightning_bolt").errors.length).toBeGreaterThan(0);
    // Magic Arrow (school-agnostic "any") counts as Air too — also blocked.
    expect(castAtSkeletons(base, "p1", "spell.magic_arrow").errors.length).toBeGreaterThan(0);
    // Earth (Implosion) is unaffected — it targets normally.
    expect(castAtSkeletons(base, "p1", "spell.implosion").errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Orb of Inhibition
// ---------------------------------------------------------------------------

const ORB_INHIB = "artifact.orb_of_inhibition";

function playOrbOption(state: GameState, optionIndex: number): GameState {
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" && legal.action.cardId === ORB_INHIB && legal.action.optionIndex === optionIndex
  );
  expect(play, `Orb of Inhibition option ${optionIndex} should be a legal combat play`).toBeTruthy();
  return applyOk(state, play!.action);
}

describe("Orb of Inhibition — all card damage is 0 (option A)", () => {
  function arrowSetup(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [ORB_INHIB, "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p1.removed = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 20;
    target.damage = 0;
    setActive(state, "p1", "unit_p1_griffins");
    return state;
  }

  it("control: Magic Arrow deals 1 without the Orb", () => {
    const state = arrowSetup("inhib-a-control");
    expect(skeletonDamage(settle(castAtSkeletons(state, "p1", "spell.magic_arrow").state))).toBe(1);
  });

  it("option A makes Spell card damage 0 for the rest of the Combat and removes the card", () => {
    const played = playOrbOption(arrowSetup("inhib-a-nullify"), 0);

    // The global nullify effect is on the table and the card left the game.
    expect(
      played.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "NULLIFY_CARD_DAMAGE")
      )
    ).toBe(true);
    expect(played.players.p1.removed).toContain(ORB_INHIB);
    expect(played.players.p1.hand).not.toContain(ORB_INHIB);

    // Magic Arrow now lands for 0.
    expect(skeletonDamage(settle(castAtSkeletons(played, "p1", "spell.magic_arrow").state))).toBe(0);
  });
});

describe("Orb of Inhibition — units lose their abilities this round (option B)", () => {
  // Skeletons carry "reduce Spell damage 2": Magic Arrow's 1 point is normally
  // floored to 0. Option B switches the passive off for the round, so the point
  // lands.
  function reduceSetup(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [ORB_INHIB, "spell.magic_arrow"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = ["reduce-spell-damage-2"];
    target.maxHealth = 20;
    target.damage = 0;
    setActive(state, "p1", "unit_p1_griffins");
    return state;
  }

  it("control: the Skeletons' damage reduction floors Magic Arrow at 0", () => {
    const state = reduceSetup("inhib-b-control");
    expect(skeletonDamage(settle(castAtSkeletons(state, "p1", "spell.magic_arrow").state))).toBe(0);
  });

  it("option B suppresses every unit's abilities for the round (the point lands)", () => {
    const played = playOrbOption(reduceSetup("inhib-b-suppress"), 1);

    // A global, current-combat-round ability suppression is on the table and
    // flags every unit on both sides.
    const effect = played.activeEffects.find((entry) =>
      entry.modifiers.some((modifier) => modifier.type === "UNIT_ABILITY_SUPPRESSED")
    );
    expect(effect, "a global ability-suppression effect should exist").toBeTruthy();
    expect(effect!.scope).toBe("global");
    expect(effect!.expiresAtCombatRoundEnd).toBe(played.combat!.round);
    expect(played.combat!.units.unit_p2_skeletons.abilitiesSuppressed).toBe(true);
    expect(played.combat!.units.unit_p1_griffins.abilitiesSuppressed).toBe(true);

    // With the reduction switched off, Magic Arrow's full point lands.
    expect(skeletonDamage(settle(castAtSkeletons(played, "p1", "spell.magic_arrow").state))).toBe(1);
  });
});
