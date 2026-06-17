import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { makeActiveEffect } from "./active-effects";
import type { GameAction, GameEvent, GameState, UnitId } from "./state";

/**
 * Engine coverage for the new-mechanic artifacts imported from the fan wiki.
 * Every test drives the real card through the engine and fails if the wiring is
 * removed — no decorative entries (CLAUDE.md rule #1).
 *
 *   • Thunder Helmet (Relic) — recover a Spell from your discard, OR draw a card
 *     after every Spell you cast this Combat (then remove the card).
 *   • Shaman's Puppet (Minor) — make an enemy unit roll the LOWER of two Attack
 *     dice for its activation (new "disadvantage" debuff), OR cleanse one of your
 *     own units (Cure-style).
 *   • Spirit of Oppression (Minor) — lock out EVERY Attack-die reroll for both
 *     players this Combat (new global reroll lock), OR +1 Power.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** The most recent main (non-retaliation) hit dealt by `attackerId`. */
function lastHitBy(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation
    );
}

function findPlay(state: GameState, playerId: "p1" | "p2", cardId: string, optionIndex: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

function findPlayOnUnit(state: GameState, playerId: "p1" | "p2", cardId: string, optionIndex: number, unitId: UnitId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function findCast(state: GameState, playerId: "p1" | "p2", cardId: string, unitId: UnitId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function reactionAction(
  state: GameState,
  playerId: "p1" | "p2",
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

/**
 * A clean adjacent melee duel (mirrors wiki-artifacts-batch3): p1 Griffins one
 * space from p2 Vampires, abilities stripped and health huge so nobody dies and
 * the only thing moving the reported `attackValue` is the buffs/debuffs in play.
 * Either unit can attack the other (adjacency is symmetric).
 */
function duel(seed: string): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat;
  if (!combat) {
    throw new Error("Expected combat setup.");
  }

  const griffins = combat.units.unit_p1_griffins;
  const vampires = combat.units.unit_p2_vampires;
  griffins.type = "ground";
  griffins.position = 9;
  griffins.attack = 3;
  griffins.defense = 0;
  griffins.maxHealth = 50;
  griffins.damage = 0;
  griffins.abilities = [];
  vampires.type = "ground";
  vampires.position = 13;
  vampires.attack = 5;
  vampires.defense = 0;
  vampires.maxHealth = 50;
  vampires.damage = 0;
  vampires.abilities = [];
  combat.units.unit_p1_marksmen.position = 0;
  combat.units.unit_p1_crusaders.position = 3;
  combat.units.unit_p2_skeletons.position = 19;
  combat.units.unit_p2_dread_knights.position = 16;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.deck = [];
  state.activePlayerId = "p1";
  combat.activeUnitId = "unit_p1_griffins";
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  combat.dice.rollCount = 0;
  return state;
}

/** Hands the attack over to p2's Vampires and scripts the upcoming dice. */
function handToVampires(state: GameState, scriptedRolls: number[]): GameState {
  const combat = state.combat;
  if (!combat) {
    throw new Error("Expected combat.");
  }
  state.activePlayerId = "p2";
  state.priorityPlayerId = "p2";
  state.phase = "combat";
  combat.activeUnitId = "unit_p2_vampires";
  combat.dice.scriptedRolls = scriptedRolls;
  combat.dice.rollCount = 0;
  return state;
}

function vampiresAttackGriffins(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p2",
    attackerId: "unit_p2_vampires",
    defenderId: "unit_p1_griffins"
  });
}

// ===========================================================================
// Card definitions — the truth about what runs (CLAUDE.md rule #2)
// ===========================================================================

describe("new-mechanic artifact definitions", () => {
  it("Thunder Helmet: relic, recover-spell + draw-on-cast, in the relic decks", () => {
    const card = cardLibrary["artifact.thunder_helmet"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.artifactTier).toBe("relic");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") return;
    expect(card.effect.options[0].effect).toMatchObject({ type: "TAKE_FROM_DISCARD", count: 1, filter: "spell" });
    expect(card.effect.options[1].cost?.removeSelf).toBe(true);
    expect(card.effect.options[1].effect).toMatchObject({
      type: "CREATE_ACTIVE_EFFECT",
      effect: { scope: "player", duration: { type: "combat" }, modifiers: [{ type: "DRAW_ON_SPELL_CAST", amount: 1 }] }
    });
    expect(artifactDeckLegacy).toContain("artifact.thunder_helmet");
    expect(artifactDeckBinhRelic).toContain("artifact.thunder_helmet");
  });

  it("Shaman's Puppet: minor, attack-disadvantage debuff + Cure cleanse, in the minor decks", () => {
    const card = cardLibrary["artifact.shamans_puppet"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.artifactTier).toBe("minor");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") return;
    expect(card.effect.options[0].target).toMatchObject({ type: "enemy-unit" });
    expect(card.effect.options[0].effect).toMatchObject({
      type: "CREATE_ACTIVE_EFFECT",
      effect: { scope: "unit", duration: { type: "next-activation" }, modifiers: [{ type: "ATTACK_ROLL_DISADVANTAGE" }] }
    });
    expect(card.effect.options[1].target).toMatchObject({ type: "friendly-unit" });
    expect(card.effect.options[1].effect).toMatchObject({
      type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
      removePolarity: "negative",
      removeParalysis: true
    });
    expect(artifactDeckLegacy).toContain("artifact.shamans_puppet");
    expect(artifactDeckBinhMinor).toContain("artifact.shamans_puppet");
  });

  it("Spirit of Oppression: minor, global reroll lock + power, in the minor decks", () => {
    const card = cardLibrary["artifact.spirit_of_oppression"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.artifactTier).toBe("minor");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") return;
    expect(card.effect.options[0].effect).toMatchObject({
      type: "CREATE_ACTIVE_EFFECT",
      effect: { scope: "global", duration: { type: "combat" }, modifiers: [{ type: "NO_ATTACK_DIE_REROLL" }] }
    });
    expect(card.effect.options[1].effect).toMatchObject({ type: "ADD_SPELL_POWER", amount: 1 });
    expect(artifactDeckLegacy).toContain("artifact.spirit_of_oppression");
    expect(artifactDeckBinhMinor).toContain("artifact.spirit_of_oppression");
  });
});

// ===========================================================================
// Thunder Helmet
// ===========================================================================

const THUNDER = "artifact.thunder_helmet";

describe("Thunder Helmet", () => {
  it("option A takes a Spell from the discard pile back into hand", () => {
    let state = createAdventureGameState({ seed: "thunder-recover", difficulty: "normal", rollFirstPlayer: false });
    state = state.players.p1.needsHandRefresh ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
    state.activePlayerId = "p1";
    state.players.p1.hand = [THUNDER];
    state.players.p1.discard = ["spell.magic_arrow"];

    const play = findPlay(state, "p1", THUNDER, 0);
    expect(play, "Thunder Helmet's recover-spell side should be offered").toBeTruthy();
    state = applyOk(state, play!.action);

    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("discard-pick");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });

    expect(state.players.p1.hand).toContain("spell.magic_arrow");
    expect(state.players.p1.discard).not.toContain("spell.magic_arrow");
  });

  it("option B draws a card after a Spell is cast this Combat, and removes the Helmet", () => {
    const state = createInitialGameState("thunder-draw");
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.players.p1.hand = [THUNDER, "spell.lightning_bolt"];
    state.players.p1.deck = ["stat.knowledge"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 30;
    target.damage = 0;

    const play = findPlay(state, "p1", THUNDER, 1);
    expect(play, "Thunder Helmet's draw-on-cast side should be offered in combat").toBeTruthy();
    const armed = applyOk(state, play!.action);
    // The Helmet is removed from the game (not discarded) when option B is played.
    expect(armed.players.p1.removed).toContain(THUNDER);
    expect(armed.players.p1.hand).not.toContain(THUNDER);
    // No draw has happened yet — the deck card is still on top.
    expect(armed.players.p1.deck).toContain("stat.knowledge");

    const cast = findCast(armed, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    expect(cast, "Lightning Bolt should be castable").toBeTruthy();
    const after = passAllReactions(applyOk(armed, cast!.action));

    // Casting the Spell triggered the draw: the deck card is now in hand.
    expect(after.players.p1.hand).toContain("stat.knowledge");
    expect(after.players.p1.deck).toHaveLength(0);
  });

  it("control: with no Helmet, casting a Spell does not draw", () => {
    const state = createInitialGameState("thunder-control");
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.players.p1.hand = ["spell.lightning_bolt"];
    state.players.p1.deck = ["stat.knowledge"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 30;
    target.damage = 0;

    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    const after = passAllReactions(applyOk(state, cast!.action));
    expect(after.players.p1.deck).toContain("stat.knowledge");
    expect(after.players.p1.hand).not.toContain("stat.knowledge");
  });
});

// ===========================================================================
// Shaman's Puppet
// ===========================================================================

const PUPPET = "artifact.shamans_puppet";

describe("Shaman's Puppet", () => {
  it("control: the Vampires attack for their base 5 + the (higher) first die", () => {
    // scriptedRolls [1, -1, …]: a normal attack rolls one die (1) → 5 + 1 = 6.
    const resolved = passAllReactions(vampiresAttackGriffins(handToVampires(duel("puppet-control"), [1, -1, 0, 0, 0, 0])));
    expect(lastHitBy(resolved, "unit_p2_vampires")?.attackValue).toBe(6);
  });

  it("option A: the puppeted unit rolls two dice and resolves the LOWER result", () => {
    let state = duel("puppet-disadvantage");
    state.players.p1.hand = [PUPPET];

    // p1 (active) puppets the enemy Vampires before they act.
    const play = findPlayOnUnit(state, "p1", PUPPET, 0, "unit_p2_vampires");
    expect(play, "Shaman's Puppet's debuff side should target an enemy unit").toBeTruthy();
    state = passAllReactions(applyOk(state, play!.action));

    // Hand the turn to the Vampires; the same [1, -1] dice are now read with
    // disadvantage → min(1, -1) = -1, so the attack is 5 + (-1) = 4 (not 6).
    const resolved = passAllReactions(vampiresAttackGriffins(handToVampires(state, [1, -1, 0, 0, 0, 0])));
    expect(lastHitBy(resolved, "unit_p2_vampires")?.attackValue).toBe(4);
  });

  it("option B cleanses a negative ongoing effect (and Paralysis) from your own unit", () => {
    const state = duel("puppet-cleanse");
    state.players.p1.hand = [PUPPET];
    const griffins = state.combat!.units.unit_p1_griffins;

    // Lay a removable negative effect (a Slow) and a Paralysis token on the Griffins.
    state.activeEffects.push(
      makeActiveEffect(
        state,
        {
          name: "Slow",
          scope: "unit",
          duration: { type: "combat" },
          polarity: "negative",
          removable: true,
          modifiers: [{ type: "INITIATIVE_BONUS", amount: -2 }]
        },
        { type: "card", cardId: "spell.slow", controllerId: "p2" },
        "p2",
        { type: "unit", unitId: "unit_p1_griffins" }
      )
    );
    griffins.tokens = [
      ...(griffins.tokens ?? []),
      { id: "tok_paralysis_test", kind: "paralysis", amount: 0, sourceName: "Blind" }
    ];
    expect(state.activeEffects.some((effect) => effect.name === "Slow")).toBe(true);

    const play = findPlayOnUnit(state, "p1", PUPPET, 1, "unit_p1_griffins");
    expect(play, "Shaman's Puppet's cleanse side should target your own unit").toBeTruthy();
    const after = applyOk(state, play!.action);

    // The negative effect and the Paralysis token are both gone.
    expect(after.activeEffects.some((effect) => effect.name === "Slow")).toBe(false);
    expect((after.combat!.units.unit_p1_griffins.tokens ?? []).some((token) => token.kind === "paralysis")).toBe(false);
  });
});

// ===========================================================================
// Spirit of Oppression
// ===========================================================================

const SPIRIT = "artifact.spirit_of_oppression";

/** Gives `unitId` a single-use Luck-style Attack-die reroll (a reroll source). */
function injectLuck(state: GameState, unitId: UnitId): void {
  state.activeEffects.push(
    makeActiveEffect(
      state,
      {
        name: "Luck",
        scope: "unit",
        duration: { type: "combat" },
        polarity: "positive",
        modifiers: [{ type: "ATTACK_DIE_REROLL", maxUsesPerRoll: 1, consumeEffectOnUse: false }]
      },
      { type: "card", cardId: "spell.fortune", controllerId: "p1" },
      "p1",
      { type: "unit", unitId }
    )
  );
}

function declareGriffinsAttack(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_vampires"
  });
}

describe("Spirit of Oppression", () => {
  it("control: with a Luck reroll in play, the attacker is offered a reroll", () => {
    const state = duel("spirit-control");
    injectLuck(state, "unit_p1_griffins");
    const resolved = passAllReactions(declareGriffinsAttack(state));
    expect(resolved.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
  });

  it("option A locks out the reroll for the whole Combat (no reroll offered)", () => {
    let state = duel("spirit-lock");
    injectLuck(state, "unit_p1_griffins");
    state.players.p1.hand = [SPIRIT];

    const play = findPlay(state, "p1", SPIRIT, 0);
    expect(play, "Spirit of Oppression's reroll-lock side should be offered in combat").toBeTruthy();
    state = passAllReactions(applyOk(state, play!.action));

    const resolved = passAllReactions(declareGriffinsAttack(state));
    // The Luck source is still on the unit, but the global lock removed every
    // reroll: the attack resolves with no reroll choice.
    expect(resolved.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
    expect(lastHitBy(resolved, "unit_p1_griffins")).toBeTruthy();
  });

  it("option B adds +1 Power to a spell cast (Lightning Bolt 2 → 3)", () => {
    const state = createInitialGameState("spirit-power");
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.players.p1.hand = ["spell.lightning_bolt", SPIRIT];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 30;
    target.damage = 0;

    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    const casted = applyOk(state, cast!.action);
    const power = reactionAction(casted, "p1", SPIRIT, 1);
    expect(power, "Spirit of Oppression's +1 Power side should be offered while casting").toBeTruthy();
    const resolved = passAllReactions(applyOk(casted, power!));
    // Lightning Bolt amountByPower {0:2,1:3,2:4}: +1 Power lifts it to 3.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });
});
