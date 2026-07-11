import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getLegalReactionsForTrigger } from "./legal-actions";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Knowledge / Mysticism recall for spell INSTANTS played as reactions into an
 * attack window (Stone Skin, Bloodlust, Curse, …). The cast-window recall
 * (CAST_SPELL → SPELL_CAST_STARTED window) has always worked; these pin the
 * attack-window path: a spell played via PLAY_REACTION never opens a cast
 * window, so the recall is offered inside the SAME attack window instead.
 * Every test asserts the observable game outcome (card zones, the damage the
 * attack actually deals), not just bookkeeping.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passPriority(state: GameState): GameState {
  const playerId = state.reactionWindow?.priorityPlayerId;
  if (!playerId) {
    throw new Error("Expected an open reaction window.");
  }
  return applyOk(state, { type: "PASS_REACTION", playerId });
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  while (current.reactionWindow) {
    current = passPriority(current);
  }
  return current;
}

function scriptDice(state: GameState, rolls: number[]): void {
  if (!state.combat) {
    throw new Error("Expected combat setup.");
  }
  state.combat.dice.scriptedRolls = rolls;
  state.combat.dice.rollCount = 0;
}

/** Declares the Griffins → Vampires attack with the die scripted to 0. */
function declareAttack(state: GameState): GameState {
  scriptDice(state, [0]);
  const moved = applyOk(state, {
    type: "MOVE_UNIT",
    playerId: "p1",
    unitId: "unit_p1_griffins",
    destination: 10
  });
  return applyOk(moved, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_vampires"
  });
}

function knowledgeOffers(state: GameState, playerId: PlayerId): GameAction[] {
  return getLegalActions(state, playerId)
    .filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.knowledge"
    )
    .map((legal) => legal.action);
}

describe("Knowledge recall of a spell instant played into an attack window", () => {
  it("returns the just-played Stone Skin to hand while its defense boost still applies", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.stone_skin", "stat.knowledge", "stat.knowledge"];

    const declared = declareAttack(state);
    // CONTROL: before any spell is played into the attack, Knowledge is not
    // offered (its printed trigger is the cast window, not the attack).
    expect(knowledgeOffers(declared, "p2")).toEqual([]);

    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    // The spell instant makes Knowledge legal in the SAME window, basic and
    // expert alike (p2 still holds crowns).
    const offers = knowledgeOffers(buffed, "p2");
    expect(offers.some((action) => action.type === "PLAY_REACTION" && action.mode === "basic")).toBe(true);
    expect(offers.some((action) => action.type === "PLAY_REACTION" && action.mode === "expert")).toBe(true);

    const recalled = applyOk(buffed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    // Knowledge itself is spent; the basic play raises no spell limit. The
    // take-back is DEFERRED to the attack's resolution — with no reaction left
    // to play, the window closes at once, the attack resolves, and only THEN
    // does Stone Skin come back ("instead of discarding it").
    expect(recalled.players.p2.hand).toContain("spell.stone_skin");
    expect(recalled.players.p2.discard).not.toContain("spell.stone_skin");
    expect(recalled.players.p2.discard).toContain("stat.knowledge");
    expect(recalled.players.p2.combatStats.spellLimitBonusThisRound).toBe(0);

    // The recall is consumed: the SECOND held Knowledge copy is no longer
    // offered (nothing of p2's is left to take back).
    expect(knowledgeOffers(recalled, "p2")).toEqual([]);

    // The attack resolved with Stone Skin's +1 defense still applied:
    // Griffins 3 + roll 0 vs Vampires 1 + 1 = damage 1 (2 without the spell).
    const resolved = passAllReactions(recalled);
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(1);
    // The recalled copy survived combat resolution in hand.
    expect(resolved.players.p2.hand).toContain("spell.stone_skin");
  });

  it("holds the take-back until the attack resolves — the recalled copy can NEVER be re-cast into the same attack, even with expert Knowledge's raised limit", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    // The spare Defense statistic keeps a reaction available so the buff window
    // stays OPEN after the recall — letting us observe that the take-back is held.
    state.players.p2.hand = ["spell.stone_skin", "stat.knowledge", "stat.defense"];

    const declared = declareAttack(state);
    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    const recalled = applyOk(buffed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.knowledge",
      mode: "expert"
    });
    // Expert Knowledge raised the round's Spell limit, but the recalled Stone
    // Skin is NOT back in hand while the attack is still open — it waits in the
    // discard pile ("only after the spell is used can it be taken back").
    expect(recalled.reactionWindow, "the buff window is still open").toBeTruthy();
    expect(recalled.players.p2.hand).not.toContain("spell.stone_skin");
    expect(recalled.players.p2.discard).toContain("spell.stone_skin");
    expect(recalled.players.p2.combatStats.spellLimitBonusThisRound).toBe(1);
    expect(recalled.players.p2.combatStats.expertUsesSpentThisRound).toBe(1);

    // So no second Stone Skin cast into THIS attack is offered…
    const reoffered = getLegalActions(recalled, "p2").some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.stone_skin"
    );
    expect(reoffered, "the recalled spell is not in hand, so it cannot be re-cast into this attack").toBe(false);

    // …and forcing it is rejected — the card is not in hand to play.
    const forced = applyAction(recalled, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    expect(forced.errors.length).toBeGreaterThan(0);

    // The attack resolves with only ONE Stone Skin: Griffins 3 + roll 0 vs
    // Vampires 1 + 1 → damage 1 (it would be 0 if a second had applied).
    const resolved = passAllReactions(recalled);
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(1);
    // Now — after the attack — the recalled copy is back in hand, and the raised
    // limit persists for a legitimate LATER cast this round.
    expect(resolved.players.p2.hand).toContain("spell.stone_skin");
    expect(resolved.players.p2.combatStats.spellLimitBonusThisRound).toBe(1);
  });

  it("never offers Knowledge to the player who cast NO spell into the attack", () => {
    const state = createInitialGameState();
    // The attacker holds Knowledge but casts nothing; the defender casts.
    // The defender's spare Defense statistic keeps the window open after the
    // spell play so the attacker's offers can be inspected.
    state.players.p1.hand = ["stat.knowledge"];
    state.players.p2.hand = ["spell.stone_skin", "stat.defense"];

    const declared = declareAttack(state);
    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });

    const trigger = buffed.reactionWindow?.triggerEvent;
    expect(trigger).toBeTruthy();
    const reactions = getLegalReactionsForTrigger(buffed, trigger!);
    const p1Knowledge = (reactions.p1 ?? []).filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.knowledge"
    );
    expect(p1Knowledge, "the attacker cast no spell — nothing to take back").toEqual([]);
  });

  it("rejects a forged Knowledge reaction when no own spell is on the attack", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["stat.knowledge", "stat.defense"];

    const declared = declareAttack(state);
    const result = applyAction(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    expect(result.errors.length).toBeGreaterThan(0);
    // Nothing moved: Knowledge stays in hand.
    expect(result.state.players.p2.hand).toContain("stat.knowledge");
  });
});

// ---------------------------------------------------------------------------
// Mysticism expert in the attack window sweeps every card played with the spell
// ---------------------------------------------------------------------------

describe("Mysticism expert recall in an attack window (deferred to the attack's end)", () => {
  it("takes the spell AND the other cards played with it back, after the attack resolves", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.stone_skin", "stat.defense", "ability.mysticism"];
    state.players.p2.limits.expertUses = 1;

    const declared = declareAttack(state);
    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    const buffed2 = applyOk(buffed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.defense",
      mode: "basic"
    });
    const recalled = applyOk(buffed2, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.mysticism",
      mode: "expert"
    });
    const resolved = passAllReactions(recalled);

    // Both +1-defense buffs applied: Griffins 3 + roll 0 vs Vampires 1 + 1 + 1 → 0.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(0);
    // The spell, the statistic played with it, AND the Mysticism card all
    // returned to hand once the attack finished (never left in the discard).
    expect(resolved.players.p2.hand).toContain("spell.stone_skin");
    expect(resolved.players.p2.hand).toContain("stat.defense");
    expect(resolved.players.p2.hand).toContain("ability.mysticism");
    expect(resolved.players.p2.discard).not.toContain("spell.stone_skin");
    expect(resolved.players.p2.discard).not.toContain("stat.defense");
  });

  it("CONTROL: BASIC Mysticism recalls only the spell — the statistic stays discarded", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.stone_skin", "stat.defense", "ability.mysticism"];

    const declared = declareAttack(state);
    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    const buffed2 = applyOk(buffed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.defense",
      mode: "basic"
    });
    const recalled = applyOk(buffed2, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.mysticism",
      mode: "basic"
    });
    const resolved = passAllReactions(recalled);
    // Only the spell comes back; the statistic played alongside stays discarded.
    expect(resolved.players.p2.hand).toContain("spell.stone_skin");
    expect(resolved.players.p2.hand).not.toContain("stat.defense");
    expect(resolved.players.p2.discard).toContain("stat.defense");
  });
});

// ---------------------------------------------------------------------------
// A recalled Book Spell returns to the Spell Book, not the hand
// ---------------------------------------------------------------------------

describe("Knowledge recall of a Book instant routes the Spell back into the Spell Book", () => {
  it("a Book Stone Skin recalled after the attack cycles back into the Book (not hand, not discard)", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["stat.knowledge"];
    // Stone Skin lives in the Spell Book, not the hand.
    state.players.p2.spellBook = ["spell.stone_skin"];

    const declared = declareAttack(state);
    // Play the Book Stone Skin as an attack-window reaction: it leaves the Book
    // for the discard while the attack is pending.
    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic",
      fromSpellBook: true
    });
    expect(buffed.players.p2.spellBook).not.toContain("spell.stone_skin");
    expect(buffed.players.p2.discard).toContain("spell.stone_skin");

    const recalled = applyOk(buffed, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    const resolved = passAllReactions(recalled);

    // Stone Skin's +1 defense still applied (damage 1, not 2).
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(1);
    // The recalled Book Spell went back into the BOOK — never the public hand.
    expect(resolved.players.p2.spellBook).toContain("spell.stone_skin");
    expect(resolved.players.p2.hand).not.toContain("spell.stone_skin");
    expect(resolved.players.p2.discard).not.toContain("spell.stone_skin");
  });

  it("CONTROL: the SAME Stone Skin played from the hand recalls to the hand, never the Book", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.stone_skin", "stat.knowledge"];
    state.players.p2.spellBook = [];

    const declared = declareAttack(state);
    const buffed = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.stone_skin",
      mode: "basic"
    });
    const resolved = passAllReactions(
      applyOk(buffed, { type: "PLAY_REACTION", playerId: "p2", cardId: "stat.knowledge", mode: "basic" })
    );
    expect(resolved.players.p2.hand).toContain("spell.stone_skin");
    expect(resolved.players.p2.spellBook).not.toContain("spell.stone_skin");
  });
});

// ---------------------------------------------------------------------------
// A lethal-save Resurrection is recallable, and Book Resurrection routes back
// ---------------------------------------------------------------------------

const GRIFFINS = "unit_p1_griffins";
const SKELETONS_ATTACKER = "unit_p2_skeletons";

/** A lethal melee attack on p1's Griffins, paused in the UNIT_LETHAL_HIT window. */
function lethalAttack(opts: { hand?: string[]; spellBook?: string[] }): GameState {
  const state = createInitialGameState("recall-lethal");
  state.players.p1.hand = opts.hand ?? [];
  state.players.p1.spellBook = opts.spellBook ?? [];
  state.players.p2.hand = [];

  const defender = state.combat!.units[GRIFFINS];
  defender.grade = "bronze";
  defender.position = 9;
  defender.defense = 0;
  defender.damage = defender.maxHealth - 1; // one hit from death

  const attacker = state.combat!.units[SKELETONS_ATTACKER];
  attacker.abilities = [];
  attacker.attack = 5; // clearly lethal
  attacker.position = 13; // adjacent below the defender
  state.combat!.dice.scriptedRolls = [0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = SKELETONS_ATTACKER;

  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p2",
    attackerId: SKELETONS_ATTACKER,
    defenderId: GRIFFINS
  });
}

function findSave(state: GameState, fromSpellBook: boolean): GameAction {
  const save = (state.reactionWindow?.legalReactions.p1 ?? []).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "spell.resurrection" &&
      Boolean(legal.action.fromSpellBook) === fromSpellBook
  );
  if (!save) {
    throw new Error("Expected a Resurrection save to be offered.");
  }
  return save.action;
}

function knowledgeInWindow(state: GameState, playerId: PlayerId): boolean {
  return (state.reactionWindow?.legalReactions[playerId] ?? []).some(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.knowledge"
  );
}

describe("Knowledge recall of a lethal-save Resurrection played into the attack", () => {
  it("takes a hand Resurrection back AFTER the attack, its save intact", () => {
    const declared = lethalAttack({ hand: ["spell.resurrection", "stat.knowledge"] });
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");

    // Play Resurrection to cancel the killing blow.
    const saved = applyOk(declared, findSave(declared, false));
    // Knowledge is NOW offered in the lethal-save window (the new UNIT_LETHAL_HIT path).
    expect(knowledgeInWindow(saved, "p1"), "Knowledge should be offered to recall the just-played Resurrection").toBe(
      true
    );

    const recalled = applyOk(saved, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    const resolved = passAllReactions(recalled);

    // The Griffins were saved (still one hit from death, not destroyed)…
    expect(resolved.combat?.units[GRIFFINS].damage).toBe(resolved.combat!.units[GRIFFINS].maxHealth - 1);
    // …and the Resurrection came back to hand once the attack finished.
    expect(resolved.players.p1.hand).toContain("spell.resurrection");
    expect(resolved.players.p1.discard).not.toContain("spell.resurrection");
  });

  it("CONTROL: with no Knowledge, the used Resurrection stays in the discard", () => {
    const declared = lethalAttack({ hand: ["spell.resurrection"] });
    const saved = applyOk(declared, findSave(declared, false));
    const resolved = passAllReactions(saved);
    expect(resolved.combat?.units[GRIFFINS].damage).toBe(resolved.combat!.units[GRIFFINS].maxHealth - 1); // still saved
    expect(resolved.players.p1.discard).toContain("spell.resurrection");
    expect(resolved.players.p1.hand).not.toContain("spell.resurrection");
  });

  it("a Book Resurrection recalled routes back into the Spell Book (work like spell and Power use)", () => {
    const declared = lethalAttack({ hand: ["stat.knowledge"], spellBook: ["spell.resurrection"] });
    const saved = applyOk(declared, findSave(declared, true));
    // The save left the Book for the discard.
    expect(saved.players.p1.spellBook).not.toContain("spell.resurrection");

    const recalled = applyOk(saved, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    const resolved = passAllReactions(recalled);

    expect(resolved.combat?.units[GRIFFINS].damage).toBe(resolved.combat!.units[GRIFFINS].maxHealth - 1); // saved
    // Recalled back into the Book, not the public hand.
    expect(resolved.players.p1.spellBook).toContain("spell.resurrection");
    expect(resolved.players.p1.hand).not.toContain("spell.resurrection");
    expect(resolved.players.p1.discard).not.toContain("spell.resurrection");
  });
});

// ---------------------------------------------------------------------------
// A Misfortune played into the attack is recallable with its negation intact
// ---------------------------------------------------------------------------

describe("Knowledge recall of a Misfortune played into the attack", () => {
  function declareBronzeAttack(state: GameState, die: number): GameState {
    state.combat!.units.unit_p1_griffins.grade = "bronze";
    scriptDice(state, [die]);
    const moved = applyOk(state, {
      type: "MOVE_UNIT",
      playerId: "p1",
      unitId: "unit_p1_griffins",
      destination: 10
    });
    return applyOk(moved, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires"
    });
  }

  function findMisfortune(state: GameState): GameAction {
    const play = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.misfortune"
    );
    if (!play) {
      throw new Error("Expected Misfortune to be offered in the pre-attack window.");
    }
    return play.action;
  }

  it("CONTROL: with a scripted +1 die and no Misfortune, the Griffins deal 3", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const declared = declareBronzeAttack(state, 1);
    const resolved = passAllReactions(declared);
    // Griffins 3 + die 1 vs Vampires defense 1 → damage 3.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(3);
  });

  it("negates the +1 die (damage 3 → 2) AND is taken back to hand after the attack", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = ["spell.misfortune", "stat.knowledge"];

    const declared = declareBronzeAttack(state, 1);
    const negated = applyOk(declared, findMisfortune(declared));

    // Knowledge is offered to recall the Misfortune just played into the attack.
    const recalled = applyOk(negated, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    const resolved = passAllReactions(recalled);

    // Misfortune negated the +1 die → damage 2 (would be 3 without it, see control).
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(2);
    // Misfortune returned to hand after the attack resolved.
    expect(resolved.players.p2.hand).toContain("spell.misfortune");
    expect(resolved.players.p2.discard).not.toContain("spell.misfortune");
  });
});

// ===========================================================================
// Cast-window recall: Knowledge (basic OR expert) takes back ANY spell you cast
// in combat on your own activation (the printed SPELL_CAST_STARTED trigger).
// ===========================================================================

describe("Knowledge recall of a spell cast on your own combat activation", () => {
  function p1CanCast(hand: string[]): GameState {
    const state = createInitialGameState("knowledge-cast-window");
    state.players.p1.hand = [...hand];
    state.players.p2.hand = [];
    // Make a fresh (un-acted) p1 unit the active one so it may cast.
    const active = state.combat!.units[state.combat!.activeUnitId!];
    if (active.controllerId !== "p1") {
      const p1Unit = Object.values(state.combat!.units).find(
        (u) => u.controllerId === "p1" && u.damage < u.maxHealth
      )!;
      state.combat!.activeUnitId = p1Unit.id;
    }
    const activeUnit = state.combat!.units[state.combat!.activeUnitId!];
    activeUnit.activatedThisRound = false;
    activeUnit.attackedThisActivation = false;
    activeUnit.movedThisActivation = false;
    return state;
  }

  function castMagicArrowAtEnemy(state: GameState): GameState {
    const target = Object.values(state.combat!.units).find(
      (u) => u.controllerId === "p2" && u.damage < u.maxHealth
    )!;
    return applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: target.id }
    });
  }

  it("offers BOTH basic and expert Knowledge in the cast window", () => {
    const state = p1CanCast(["spell.magic_arrow", "stat.knowledge"]);
    const cast = castMagicArrowAtEnemy(state);
    const offers = knowledgeOffers(cast, "p1");
    expect(offers.some((a) => a.type === "PLAY_REACTION" && a.mode === "basic")).toBe(true);
    expect(offers.some((a) => a.type === "PLAY_REACTION" && a.mode === "expert")).toBe(true);
  });

  it("basic Knowledge takes the cast spell back to hand (no crown spent)", () => {
    const state = p1CanCast(["spell.magic_arrow", "stat.knowledge"]);
    const cast = castMagicArrowAtEnemy(state);
    const recalled = applyOk(cast, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.knowledge",
      mode: "basic"
    });
    const resolved = passAllReactions(recalled);
    expect(resolved.players.p1.hand).toContain("spell.magic_arrow");
    expect(resolved.players.p1.discard).toContain("stat.knowledge");
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
  });

  it("expert Knowledge takes the spell back AND raises the spell limit (1 crown)", () => {
    const state = p1CanCast(["spell.magic_arrow", "stat.knowledge"]);
    const cast = castMagicArrowAtEnemy(state);
    const recalled = applyOk(cast, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.knowledge",
      mode: "expert"
    });
    const resolved = passAllReactions(recalled);
    expect(resolved.players.p1.hand).toContain("spell.magic_arrow");
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(resolved.players.p1.combatStats.spellLimitBonusThisRound).toBe(1);
  });
});
