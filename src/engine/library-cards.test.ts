import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions
} from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Engine coverage for cards that used to ship as inert `DRAW_CARDS amount: 0`
 * stubs (they did nothing and were once kept out of every deck so no one could
 * play a non-functional card). They are now fully implemented and dealt into
 * the shared draw decks. Each test plays the real card through the engine and
 * fails if its wiring is removed.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    const playerId = current.reactionWindow.priorityPlayerId;
    current = applyOk(current, { type: "PASS_REACTION", playerId });
  }
  return current;
}

function findCast(state: GameState, cardId: string, unitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function hasToken(state: GameState, unitId: UnitId, kind: "paralysis" | "corrosion"): boolean {
  return (state.combat?.units[unitId]?.tokens ?? []).some((token) => token.kind === kind);
}

// ---------------------------------------------------------------------------
// Chain Lightning (Expert Air spell): the selected enemy takes the first bolt,
// the rest fork to the two units closest to it. The allocation scales with the
// Power paid: 0 → 1/1/1, 2 → 2/1/1, 4 → 3/2/1.
//
// Board mirrors the Solmyr specialty fixture: skeletons(13) is the primary,
// vampires(14) and dread_knights(9) are its two closest; the p1 units sit far.
// ---------------------------------------------------------------------------

describe("Chain Lightning spell", () => {
  function chainState(seed: string): GameState {
    const state = createInitialGameState(seed);
    // The spare Power statistics open the caster's Empower window so the spell
    // waits on the stack (where the test can set the Power actually paid).
    state.players.p1.hand = ["spell.chain_lightning", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_vampires.position = 14; // distance 1
    state.combat!.units.unit_p2_dread_knights.position = 9; // distance 1
    state.combat!.units.unit_p1_marksmen.position = 0; // distance 4 — the caster
    state.combat!.units.unit_p1_griffins.position = 1; // distance 3
    state.combat!.units.unit_p1_crusaders.position = 2; // distance 3
    for (const unit of Object.values(state.combat!.units)) {
      unit.maxHealth = 20;
    }
    return state;
  }

  it("at Power 0 deals 1/1/1 to the selected unit and the two closest", () => {
    const state = chainState("chain-0");
    const cast = findCast(state, "spell.chain_lightning", "unit_p2_skeletons");
    expect(cast, "Chain Lightning should be a legal cast on an enemy unit").toBeTruthy();
    const result = passAllReactions(applyOk(state, cast!.action));
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(result.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(result.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    // Exactly two equally-close units take exactly two bolts → no choice opens.
    expect(result.pendingChoice).toBeNull();
  });

  it("scales with Power: at Power 4 deals 3 to the selected unit and 2/1 to the closest", () => {
    const state = chainState("chain-4");
    const cast = findCast(state, "spell.chain_lightning", "unit_p2_skeletons");
    const casted = applyOk(state, cast!.action);
    // Stand in for paying 4 Power into the cast (Empower / Power statistics).
    casted.stack[0]!.modifiers.spellPowerBonus = 4;
    const result = passAllReactions(casted);
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(3);
    // The closest-by-tiebreak (dread_knights) takes the 2, vampires the 1.
    expect(result.combat!.units.unit_p2_dread_knights.damage).toBe(2);
    expect(result.combat!.units.unit_p2_vampires.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Blind (Basic Fire spell): place a Paralysis token on the selected enemy,
// gated by Power (0 → bronze, 1 → silver, 2 → gold). A paralysed unit skips
// its next activation; the token is removed if it takes damage first.
// ---------------------------------------------------------------------------

describe("Blind spell", () => {
  function blindState(seed: string, targetGrade: "bronze" | "silver" | "gold"): GameState {
    const state = createInitialGameState(seed);
    // Spare Power statistics open the caster's Empower window (see Chain Lightning).
    state.players.p1.hand = ["spell.blind", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p2_skeletons.grade = targetGrade;
    return state;
  }

  it("at Power 0 paralyses a bronze unit", () => {
    const state = blindState("blind-bronze", "bronze");
    const cast = findCast(state, "spell.blind", "unit_p2_skeletons");
    expect(cast, "Blind should be a legal cast on an enemy unit").toBeTruthy();
    const result = passAllReactions(applyOk(state, cast!.action));
    expect(hasToken(result, "unit_p2_skeletons", "paralysis")).toBe(true);
  });

  it("is grade-gated: Power 0 cannot blind a gold unit, but Power 2 can", () => {
    // Power 0 against a gold unit: the gate blocks it, no token lands.
    const gated = blindState("blind-gate", "gold");
    const cast = findCast(gated, "spell.blind", "unit_p2_skeletons");
    const noToken = passAllReactions(applyOk(gated, cast!.action));
    expect(hasToken(noToken, "unit_p2_skeletons", "paralysis")).toBe(false);

    // The same cast with 2 Power paid reaches gold and paralyses it.
    const powered = blindState("blind-power", "gold");
    const poweredCast = findCast(powered, "spell.blind", "unit_p2_skeletons");
    const casted = applyOk(powered, poweredCast!.action);
    casted.stack[0]!.modifiers.spellPowerBonus = 2;
    const result = passAllReactions(casted);
    expect(hasToken(result, "unit_p2_skeletons", "paralysis")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Greater Gnoll's Flail (Minor artifact): played while your unit attacks.
//   Option 0: +2 attack, then a Corrosion token (−1 defense for the Combat).
//   Option 1: +1 attack, no downside.
// ---------------------------------------------------------------------------

describe("Greater Gnoll's Flail artifact", () => {
  function flailAttack(optionIndex: number): GameState {
    const state = createInitialGameState(`flail-${optionIndex}`);
    state.players.p1.hand = ["artifact.greater_gnolls_flail"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13; // adjacent → melee
    state.combat!.units.unit_p1_griffins.maxHealth = 30; // survive any retaliation
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    const attacked = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    return applyOk(attacked, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "artifact.greater_gnolls_flail",
      optionIndex,
      mode: "basic"
    });
  }

  it("the +2 attack option leaves a Corrosion token on the attacker", () => {
    const played = flailAttack(0);
    expect(hasToken(played, "unit_p1_griffins", "corrosion")).toBe(true);
    const token = played.combat!.units.unit_p1_griffins.tokens!.find((entry) => entry.kind === "corrosion");
    expect(token?.amount).toBe(1); // −1 defense
  });

  it("the +1 attack option has no Corrosion downside", () => {
    const played = flailAttack(1);
    expect(hasToken(played, "unit_p1_griffins", "corrosion")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mystic Orb of Mana (Major artifact, map play):
//   Option 0: Search (4) — look at the top 4 of your discard pile, take 1.
//   Option 1: only if your discard pile is empty, draw 2 cards.
// ---------------------------------------------------------------------------

describe("Mystic Orb of Mana artifact", () => {
  function orbState(seed: string): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    state.players.p1.hand = ["artifact.mystic_orb_of_mana"];
    return state;
  }

  function findPlay(state: GameState, optionIndex: number) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.mystic_orb_of_mana" &&
        legal.action.optionIndex === optionIndex
    );
  }

  it("Search (4) takes one of the top four discarded cards into hand", () => {
    const state = orbState("orb-search");
    // bottom → top; only the top four (the last four) are eligible.
    state.players.p1.discard = ["spell.haste", "stat.attack", "stat.defense", "stat.power", "spell.bless"];
    const play = findPlay(state, 0);
    expect(play, "Search option should be offered while the discard has cards").toBeTruthy();
    const opened = applyOk(state, play!.action);
    expect(opened.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(opened.pendingChoice && "context" in opened.pendingChoice ? opened.pendingChoice.context : null).toBe(
      "discard-pick"
    );
    // The bottom card ("spell.haste") is below the top four — not a candidate.
    const choice = opened.pendingChoice!;
    const labels = choice.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
    expect(labels.some((label) => label.includes("Haste"))).toBe(false);
    expect(labels.length).toBe(4);

    const choiceId = choice.id;
    const took = applyOk(opened, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 0 });
    // One card was taken into hand. The discard started at 5, gained the Orb on
    // play (6), and lost the taken card (5).
    expect(took.players.p1.hand.length).toBe(1);
    expect(took.players.p1.discard.length).toBe(5);
    // The taken card is one of the eligible top-four (never the buried Haste).
    expect(took.players.p1.hand[0]).not.toBe("spell.haste");
  });

  it("the draw-2 option is gated to an empty discard pile", () => {
    // Non-empty discard: the draw-2 side is not offered, the Search side is.
    const withDiscard = orbState("orb-gate");
    withDiscard.players.p1.discard = ["stat.attack"];
    expect(findPlay(withDiscard, 1), "draw-2 must be hidden while the discard has cards").toBeFalsy();
    expect(findPlay(withDiscard, 0), "Search must be offered while the discard has cards").toBeTruthy();

    // Empty discard: the draw-2 side appears and draws two cards.
    const empty = orbState("orb-draw");
    empty.players.p1.discard = [];
    empty.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    const draw = findPlay(empty, 1);
    expect(draw, "draw-2 must be offered on an empty discard").toBeTruthy();
    const result = applyOk(empty, draw!.action);
    // Orb left the hand (→ discard) and two cards were drawn in its place.
    expect(result.players.p1.hand.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Charm of Mana (Minor artifact, map play):
//   Option 0: discard 2 cards, then draw 3 (net +1).
//   Option 1: draw 2 cards, then discard 1 (a follow-up hand-discard choice).
// ---------------------------------------------------------------------------

describe("Charm of Mana artifact", () => {
  function charmState(seed: string): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    state.activePlayerId = "p1";
    return state;
  }

  it("Option 0 discards 2 cards as a cost, then draws 3", () => {
    const state = charmState("charm-cycle");
    state.players.p1.hand = ["artifact.charm_of_mana", "stat.attack", "stat.defense"];
    state.players.p1.discard = [];
    state.players.p1.deck = ["spell.haste", "spell.bless", "stat.power", "spell.cure"];
    const legal = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "artifact.charm_of_mana" && l.action.optionIndex === 0
    );
    expect(legal, "discard-2-draw-3 option should be offered").toBeTruthy();
    const action = legal!.action;
    if (action.type !== "PLAY_CARD") {
      throw new Error("expected a PLAY_CARD action");
    }
    const result = applyOk(state, { ...action, costCardIds: ["stat.attack", "stat.defense"] });
    // Hand: [charm, attack, defense] → play removes charm, cost discards 2,
    // then draws 3 → exactly the 3 drawn cards remain.
    expect(result.players.p1.hand.length).toBe(3);
    // The Charm and the two cost cards are now in the discard pile.
    expect(result.players.p1.discard).toContain("artifact.charm_of_mana");
    expect(result.players.p1.discard).toContain("stat.attack");
    expect(result.players.p1.discard).toContain("stat.defense");
    expect(result.pendingChoice).toBeNull();
  });

  it("Option 1 draws 2, then opens a hand-discard choice for 1 card", () => {
    const state = charmState("charm-draw-discard");
    state.players.p1.hand = ["artifact.charm_of_mana"];
    state.players.p1.discard = [];
    state.players.p1.deck = ["spell.haste", "spell.bless"];
    const legal = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "artifact.charm_of_mana" && l.action.optionIndex === 1
    );
    expect(legal, "draw-2-discard-1 option should be offered").toBeTruthy();
    const drew = applyOk(state, legal!.action);
    // Drew 2 (Bless + Haste), now a hand-discard choice waits.
    expect(drew.players.p1.hand.length).toBe(2);
    expect(drew.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(drew.pendingChoice && "context" in drew.pendingChoice ? drew.pendingChoice.context : null).toBe(
      "hand-discard"
    );

    const choiceId = drew.pendingChoice!.id;
    const done = applyOk(drew, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 0 });
    // One of the two drawn cards was discarded; one remains in hand.
    expect(done.players.p1.hand.length).toBe(1);
    expect(done.players.p1.discard.length).toBe(2); // the Charm + the discarded card
    expect(done.pendingChoice).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shackles of War (Major artifact) + the player-vs-player escape it blocks:
//   Option 0 (start of PvP combat): the enemy hero can neither Retreat nor
//   Surrender. Option 1: draw 2, keep 1, discard the other.
// ---------------------------------------------------------------------------

describe("Shackles of War + PvP retreat/surrender", () => {
  function pvpState(seed: string): GameState {
    // PvP combats only happen in adventure mode; borrow the sim's fully-formed
    // battlefield into an adventure game and reframe it as player-vs-player.
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    state.combat = createInitialGameState(seed).combat;
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: state.heroes.hero_p1.spaceId ?? "0,0"
    };
    state.phase = "combat";
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    return state;
  }

  function escapeOptions(state: GameState, playerId: "p1" | "p2") {
    const actions = getLegalActions(state, playerId);
    return {
      retreat: actions.some((l) => l.action.type === "RETREAT_FROM_COMBAT"),
      surrender: actions.some((l) => l.action.type === "SURRENDER_COMBAT")
    };
  }

  it("a hero may Retreat or Surrender at the start of a player-vs-player combat", () => {
    const state = pvpState("pvp-escape");
    expect(escapeOptions(state, "p1")).toEqual({ retreat: true, surrender: true });
    // Retreat ends the combat with the retreating player as the loser.
    const retreated = applyOk(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });
    expect(retreated.combat?.outcome).toMatchObject({
      winnerPlayerId: "p2",
      defeatedPlayerId: "p1",
      reason: "retreat"
    });
    // Surrender works the same way (fresh state).
    const surrendered = applyOk(pvpState("pvp-surrender"), { type: "SURRENDER_COMBAT", playerId: "p2" });
    expect(surrendered.combat?.outcome).toMatchObject({
      winnerPlayerId: "p1",
      defeatedPlayerId: "p2",
      reason: "surrender"
    });
  });

  it("Option 0 stops the enemy hero Surrendering but NOT Retreating (house rule) — and a surrender attempt is rejected", () => {
    const state = pvpState("pvp-shackles");
    state.players.p2.hand = ["artifact.shackles_of_war"];
    const play = getLegalActions(state, "p2").find(
      (l) =>
        l.action.type === "PLAY_CARD" &&
        l.action.cardId === "artifact.shackles_of_war" &&
        l.action.optionIndex === 0
    );
    expect(play, "Shackles option 0 should be playable at the start of PvP combat").toBeTruthy();
    const locked = applyOk(state, play!.action);
    // p1 (the enemy) can no longer Surrender, but may still Retreat (house rule).
    expect(escapeOptions(locked, "p1")).toEqual({ retreat: true, surrender: false });
    // A direct Surrender attempt is rejected…
    const surrenderRejected = applyAction(locked, { type: "SURRENDER_COMBAT", playerId: "p1" });
    expect(surrenderRejected.errors.length).toBeGreaterThan(0);
    // …while Retreat still goes through, ending the combat with p1 as the loser.
    const retreated = applyOk(locked, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });
    expect(retreated.combat?.outcome).toMatchObject({ defeatedPlayerId: "p1", reason: "retreat" });
    // p2 (who played it) is unaffected.
    expect(escapeOptions(locked, "p2")).toEqual({ retreat: true, surrender: true });
  });

  it("Option 1 draws 2 and discards one of the two drawn cards", () => {
    const state = pvpState("pvp-shackles-draw");
    state.players.p1.hand = ["artifact.shackles_of_war"];
    state.players.p1.deck = ["spell.haste", "spell.bless", "stat.power"];
    state.players.p1.discard = [];
    const play = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "PLAY_CARD" &&
        l.action.cardId === "artifact.shackles_of_war" &&
        l.action.optionIndex === 1
    );
    expect(play, "draw-2-keep-1 option should be offered").toBeTruthy();
    const drew = applyOk(state, play!.action);
    expect(drew.players.p1.hand.length).toBe(2); // drew 2
    const choice = drew.pendingChoice!;
    expect(choice.type === "OPTION_CHOICE" ? choice.context : null).toBe("hand-discard");
    // Only the two just-drawn cards are candidates (drawn-only).
    expect(choice.type === "OPTION_CHOICE" ? choice.options.length : 0).toBe(2);
    const done = applyOk(drew, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(done.players.p1.hand.length).toBe(1);
    expect(done.pendingChoice).toBeNull();
  });
});
