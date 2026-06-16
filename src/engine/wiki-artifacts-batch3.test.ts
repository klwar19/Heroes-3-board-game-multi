import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import type { CardPlayMode, GameAction, GameEvent, GameState, UnitId } from "./state";

/**
 * Engine coverage for the artifacts imported from the fan wiki in this batch.
 * Every test drives the real card through the engine and fails if the wiring is
 * removed — no decorative entries.
 *
 *   • Sword of Hellfire (Major) — +3 attack / 1 self-damage, or +4 attack /
 *     2 self-damage, on your own attacking unit.
 *   • Scales of the Greater Basilisk (Minor) — +3 Power, or +1 Power and draw.
 *   • Blackshard of the Dead Knight (Minor) — +2 attack and discard 1 (draw 1
 *     only if that discard was a Spell), or +1 attack.
 *   • Surcoat of Counterpoise (Major) — counter an enemy Spell cast with ≤1
 *     Power, or remove the card to Search (1) the Artifact deck.
 *   • Targ of the Rampaging Ogre (Major) — discard 2 for +2 defense and return
 *     the Targ to hand, or a plain +1 defense.
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

function passUntil(state: GameState, playerId: "p1" | "p2"): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
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

/** Total "effect" damage a named card dealt to a unit (e.g. Sword self-damage). */
function effectDamageFrom(state: GameState, cardId: string, unitId: string): number {
  return state.eventLog
    .filter(
      (event): event is Extract<GameEvent, { type: "DAMAGE_ASSIGNED" }> =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "card" &&
        event.source.cardId === cardId &&
        event.target.type === "unit" &&
        event.target.unitId === unitId
    )
    .reduce((sum, event) => sum + event.amount, 0);
}

/** Plays a Power statistic from `playerId`'s hand into the pending cast, n times. */
function commitPower(state: GameState, playerId: "p1" | "p2", times: number): GameState {
  let current = state;
  for (let index = 0; index < times; index += 1) {
    const legal = getLegalActions(current, playerId).find(
      (entry) => entry.action.type === "PLAY_REACTION" && entry.action.cardId === "stat.power"
    );
    expect(legal, "a Power statistic should be playable into the cast").toBeTruthy();
    current = applyOk(current, legal!.action);
  }
  return current;
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

function findPlay(state: GameState, cardId: string, optionIndex: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
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

function reactionOffered(state: GameState, playerId: "p1" | "p2", cardId: string, mode: CardPlayMode): boolean {
  return getLegalActions(state, playerId).some(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      (legal.action.mode ?? "basic") === mode &&
      !legal.action.asPowerBoost
  );
}

/**
 * A clean adjacent melee duel: p1 Griffins (attack 3, defense 0) one space from
 * p2 Vampires (attack 5, defense 1). Abilities are stripped and health pools are
 * huge so nobody dies and no retaliation/reroll noise touches the attack maths;
 * spare units are parked far away. The Attack die is scripted to 0 throughout so
 * a reported `attackValue` is exactly the unit's attack plus the buffs in play.
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
  vampires.defense = 1;
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

function declareGriffinsAttack(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_vampires"
  });
}

// ---------------------------------------------------------------------------
// Sword of Hellfire
// ---------------------------------------------------------------------------

describe("Sword of Hellfire", () => {
  it("control: the Griffins attack for their base 3 with no artifact", () => {
    const resolved = passAllReactions(declareGriffinsAttack(duel("hellfire-control")));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(3);
  });

  it("option 0 adds +3 attack and deals 1 self-damage to the attacker", () => {
    const state = duel("hellfire-three");
    state.players.p1.hand = ["artifact.sword_of_hellfire"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");

    const play = reactionAction(declared, "p1", "artifact.sword_of_hellfire", 0);
    expect(play, "Sword of Hellfire option 0 should be a legal attacker reaction").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));

    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(6);
    // The Sword dealt exactly 1 self-damage to its own attacking unit.
    expect(effectDamageFrom(resolved, "artifact.sword_of_hellfire", "unit_p1_griffins")).toBe(1);
  });

  it("option 1 adds +4 attack and deals 2 self-damage", () => {
    const state = duel("hellfire-four");
    state.players.p1.hand = ["artifact.sword_of_hellfire"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");

    const play = reactionAction(declared, "p1", "artifact.sword_of_hellfire", 1);
    expect(play).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));

    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(7);
    expect(effectDamageFrom(resolved, "artifact.sword_of_hellfire", "unit_p1_griffins")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scales of the Greater Basilisk
// ---------------------------------------------------------------------------

describe("Scales of the Greater Basilisk", () => {
  // Cast Lightning Bolt and play Scales as an empower instant; the Power it adds
  // pushes the bolt up its damage table (amountByPower 0:2, 1:3, 2:4).
  function boltWithScales(seed: string, optionIndex: number | null): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand =
      optionIndex === null
        ? ["spell.lightning_bolt"]
        : ["spell.lightning_bolt", "artifact.scales_of_the_greater_basilisk"];
    state.players.p2.hand = [];
    state.players.p1.deck = ["stat.knowledge"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 30;
    target.damage = 0;

    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    expect(cast, "Lightning Bolt should be castable").toBeTruthy();
    let casted = applyOk(state, cast!.action);
    if (optionIndex !== null) {
      const scales = reactionAction(casted, "p1", "artifact.scales_of_the_greater_basilisk", optionIndex);
      expect(scales, "Scales should be offered as an empower instant on the cast").toBeTruthy();
      casted = applyOk(casted, scales!);
    }
    return passAllReactions(casted);
  }

  it("control: Lightning Bolt at Power 0 deals 2", () => {
    expect(boltWithScales("scales-control", null).combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("option 0 (+3 Power) lifts the bolt to its capped 4 damage", () => {
    expect(boltWithScales("scales-three", 0).combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("option 1 (+1 Power) lifts the bolt to 3 damage and draws a card", () => {
    const resolved = boltWithScales("scales-one", 1);
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(3);
    // The draw fired: the lone deck card is now in hand.
    expect(resolved.players.p1.hand).toContain("stat.knowledge");
    expect(resolved.players.p1.deck).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Blackshard of the Dead Knight
// ---------------------------------------------------------------------------

describe("Blackshard of the Dead Knight", () => {
  it("option 0 paid with a Spell adds +2 attack, discards the Spell, and draws 1", () => {
    const state = duel("blackshard-spell");
    state.players.p1.hand = ["artifact.blackshard_of_the_dead_knight", "spell.lightning_bolt"];
    state.players.p1.deck = ["stat.knowledge"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");

    const play = reactionAction(declared, "p1", "artifact.blackshard_of_the_dead_knight", 0);
    expect(play, "Blackshard option 0 should be a legal attacker reaction").toBeTruthy();
    const after = passAllReactions(applyOk(declared, { ...play!, costCardIds: ["spell.lightning_bolt"] }));

    expect(lastHitBy(after, "unit_p1_griffins")?.attackValue).toBe(5);
    // The discarded Spell triggered the draw: the deck card is now in hand and
    // the Spell is in the discard pile.
    expect(after.players.p1.hand).toContain("stat.knowledge");
    expect(after.players.p1.discard).toContain("spell.lightning_bolt");
    expect(after.players.p1.deck).toHaveLength(0);
  });

  it("option 0 paid with a non-Spell adds +2 attack but draws nothing", () => {
    const state = duel("blackshard-stat");
    state.players.p1.hand = ["artifact.blackshard_of_the_dead_knight", "stat.attack"];
    state.players.p1.deck = ["stat.knowledge"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");

    const play = reactionAction(declared, "p1", "artifact.blackshard_of_the_dead_knight", 0);
    expect(play).toBeTruthy();
    const after = passAllReactions(applyOk(declared, { ...play!, costCardIds: ["stat.attack"] }));

    expect(lastHitBy(after, "unit_p1_griffins")?.attackValue).toBe(5);
    // No Spell was discarded, so the deck card stays put (no draw).
    expect(after.players.p1.deck).toContain("stat.knowledge");
    expect(after.players.p1.hand).not.toContain("stat.knowledge");
    expect(after.players.p1.discard).toContain("stat.attack");
  });

  it("option 1 adds a plain +1 attack with no cost", () => {
    const state = duel("blackshard-plain");
    state.players.p1.hand = ["artifact.blackshard_of_the_dead_knight"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");

    const play = reactionAction(declared, "p1", "artifact.blackshard_of_the_dead_knight", 1);
    expect(play).toBeTruthy();
    expect(lastHitBy(passAllReactions(applyOk(declared, play!)), "unit_p1_griffins")?.attackValue).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Surcoat of Counterpoise
// ---------------------------------------------------------------------------

const SURCOAT = "artifact.surcoat_of_counterpoise";

describe("Surcoat of Counterpoise", () => {
  // p1 casts Lightning Bolt on p2's skeletons; the helper hands p2 the Surcoat
  // (or not) and commits `castPower` real Power (Power statistics) into the cast
  // before priority reaches p2 — so getPendingSpellPower reads the genuine total.
  function enemyBolt(seed: string, p2Hand: string[], castPower: number): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.lightning_bolt", ...Array.from({ length: castPower }, () => "stat.power")];
    state.players.p2.hand = p2Hand;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 30;
    target.damage = 0;

    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    expect(cast, "Lightning Bolt should be castable").toBeTruthy();
    const casted = commitPower(applyOk(state, cast!.action), "p1", castPower);
    return passUntil(casted, "p2");
  }

  it("control: with no Surcoat the bolt resolves for 2 damage", () => {
    const onP2 = enemyBolt("surcoat-control", [], 0);
    expect(passAllReactions(onP2).combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("option 0 counters an enemy Spell cast with 1 Power or less (bolt deals 0)", () => {
    const onP2 = enemyBolt("surcoat-cancel", [SURCOAT], 0);
    expect(reactionOffered(onP2, "p2", SURCOAT, "basic"), "Surcoat should react to the enemy cast").toBe(true);
    const play = reactionAction(onP2, "p2", SURCOAT, 0);
    const after = passAllReactions(applyOk(onP2, play!));

    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(after.players.p2.discard).toContain(SURCOAT);
  });

  it("is NOT offered against a Spell cast with more than 1 Power (maxPower gate)", () => {
    const atPowerTwo = enemyBolt("surcoat-power2", [SURCOAT], 2);
    expect(reactionOffered(atPowerTwo, "p2", SURCOAT, "basic")).toBe(false);
  });

  it("is NOT offered to the caster against their own Spell", () => {
    const state = createInitialGameState("surcoat-friendly");
    state.players.p1.hand = ["spell.lightning_bolt", SURCOAT];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    const casted = applyOk(state, cast!.action);
    expect(reactionOffered(casted, "p1", SURCOAT, "basic")).toBe(false);
  });

  it("option 1 removes the card and searches the Artifact deck (map)", () => {
    const state = createAdventureGameState({ seed: "surcoat-search", difficulty: "normal", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    state.players.p1.hand = [SURCOAT];
    state.players.p1.removed = [];

    const play = findPlay(state, SURCOAT, 1);
    expect(play, "Surcoat's Search side should be offered on the map").toBeTruthy();
    const after = applyOk(state, play!.action);

    // The card leaves the game (removed), and an Artifact-deck search is started.
    expect(after.players.p1.removed).toContain(SURCOAT);
    expect(after.players.p1.hand).not.toContain(SURCOAT);
    const searching =
      Boolean(
        after.adventure?.rewardQueue.some(
          (reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts"
        )
      ) || after.pendingChoice?.type === "DECK_SEARCH";
    expect(searching, "an Artifact-deck search should be queued or open").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Targ of the Rampaging Ogre
// ---------------------------------------------------------------------------

const TARG = "artifact.targ_of_the_rampaging_ogre";

describe("Targ of the Rampaging Ogre", () => {
  it("option 0 discards 2 for +2 defense and returns the Targ to hand", () => {
    const state = duel("targ-return");
    state.players.p2.hand = [TARG, "stat.attack", "stat.defense"];
    state.players.p2.discard = [];
    const declared = passUntil(declareGriffinsAttack(state), "p2");

    const play = reactionAction(declared, "p2", TARG, 0);
    expect(play, "Targ option 0 should be a legal defender reaction").toBeTruthy();
    const after = applyOk(declared, { ...play!, costCardIds: ["stat.attack", "stat.defense"] });

    // The Targ is back in hand (reusable); the two paid cards are discarded.
    expect(after.players.p2.hand).toContain(TARG);
    expect(after.players.p2.discard).not.toContain(TARG);
    expect(after.players.p2.discard).toEqual(expect.arrayContaining(["stat.attack", "stat.defense"]));

    // The +2 defense reached the incoming hit: Griffins 3 vs Vampires 1 + 2 = 3.
    const resolved = passAllReactions(after);
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseBonus: 2, defenseValue: 3, damage: 0 });
  });

  it("option 1 grants a plain +1 defense and discards the Targ normally", () => {
    const state = duel("targ-plain");
    state.players.p2.hand = [TARG];
    state.players.p2.discard = [];
    const declared = passUntil(declareGriffinsAttack(state), "p2");

    const play = reactionAction(declared, "p2", TARG, 1);
    expect(play).toBeTruthy();
    const after = applyOk(declared, play!);

    // The plain side discards the Targ as usual (not returned to hand).
    expect(after.players.p2.discard).toContain(TARG);
    expect(after.players.p2.hand).not.toContain(TARG);

    const resolved = passAllReactions(after);
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseBonus: 1, defenseValue: 2 });
  });

  it("requires exactly 2 paid cards for option 0", () => {
    const state = duel("targ-underpay");
    state.players.p2.hand = [TARG, "stat.attack", "stat.defense"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = reactionAction(declared, "p2", TARG, 0);
    const underpaid = applyAction(declared, { ...play!, costCardIds: ["stat.attack"] });
    expect(underpaid.errors.length).toBeGreaterThan(0);
  });
});
