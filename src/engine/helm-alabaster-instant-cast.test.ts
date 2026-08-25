import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import type { CardId, GameAction, GameState, PlayerId } from "./state";

/**
 * Helm of the Alabaster Unicorn — option B, "Cast a spell from the top of the
 * [spell] deck discard pile and Remove this card" (both printed faces mark it a
 * ⚡ INSTANT; the Polish Balance reprint adds "Add casted [spell] to your
 * Spellbook").
 *
 * REPORTED 2026-08-26: "second part still not working (even if in the top of the
 * discard is a spell that can be casted), for both polish balance and normal
 * game." Two holes, both of which every earlier fix (and every earlier test —
 * they all used Magic Arrow / Lightning Bolt) walked straight past:
 *
 *  1. the cast was only ever enumerated by the ON-TURN path (`addSpellActions`),
 *     which skips every Spell carrying a printed trigger — a THIRD of the Spell
 *     deck (Precision, Weakness, Bless, Curse, Shield, Bloodlust, Stone Skin,
 *     Slayer, Frenzy). Those Spells are playable ONLY inside the reaction window
 *     their trigger names, so a perfectly castable discard top offered NOTHING;
 *  2. it read `decks.spells` alone, so the BINH split EXPERT Spell pile's face-up
 *     top — a second, equally visible "Spell-deck discard pile" — was never
 *     castable.
 *
 * Every case asserts the OBSERVABLE outcome (damage moved / the card really
 * changed zone) with a CONTROL on the same setup.
 */

const HELM = "artifact.helm_of_the_alabaster_unicorn" as CardId;
const ATTACKER = "unit_p1_griffins";
const DEFENDER = "unit_p2_skeletons";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A real-rules combat: the house rules come from a real adventure build. */
function combat(seed: string, houseRules: Record<string, boolean>): GameState {
  const state = createInitialGameState(seed);
  const adventure = createAdventureGameState({
    startingBuildings: [],
    seed: `${seed}-rules`,
    ruleset: "binh",
    rollFirstPlayer: false,
    houseRules: houseRules as never
  });
  state.adventure = adventure.adventure;
  state.ruleset = "binh";
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  state.players.p1.discard = [];
  state.players.p1.spellBook = [];
  state.players.p1.spellBookUsed = [];
  state.players.p2.hand = [];
  state.players.p2.discard = [];
  state.players.p2.spellBook = [];
  state.players.p2.spellBookUsed = [];
  for (const deckId of Object.keys(state.decks)) {
    if (deckId.startsWith("spells")) {
      state.decks[deckId]!.discardPile = [];
      state.decks[deckId]!.drawPile = [];
    }
  }
  const attacker = state.combat!.units[ATTACKER];
  attacker.position = 13;
  attacker.activatedThisRound = false;
  attacker.movedThisActivation = false;
  attacker.attackedThisActivation = false;
  const defender = state.combat!.units[DEFENDER];
  defender.position = 14;
  defender.abilities = [];
  defender.maxHealth = 40;
  defender.damage = 0;
  state.combat!.activeUnitId = ATTACKER;
  return state;
}

/** The Helm holder's Spell-deck cast offers in whatever window is open. */
function helmReactions(state: GameState, playerId: PlayerId) {
  return getLegalActions(state, playerId).filter(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.fromSpellDeck === HELM
  );
}

function declareAttack(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: ATTACKER,
    defenderId: DEFENDER
  });
}

/** Pass every open window / settle every reroll so the parked attack resolves. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety-- > 0) {
    if (current.reactionWindow) {
      current = applyOk(current, {
        type: "PASS_REACTION",
        playerId: current.reactionWindow.priorityPlayerId
      });
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
      continue;
    }
    return current;
  }
  return current;
}

const damageOf = (state: GameState): number => state.combat!.units[DEFENDER].damage;

describe("Helm of the Alabaster Unicorn — a TRIGGERED discard top is castable in the window", () => {
  /**
   * Curse (printed trigger: your own unit's declared attack, -1 defense on its target) is
   * the exact class of Spell the on-turn path can never offer. The Helm holder is
   * the ATTACKER here, so the whole reported flow runs: declare an attack, the
   * window must OPEN for the Helm, cast Curse off the discard top, and the
   * very attack that opened the window must hit harder.
   */
  const attackWithCurse = (
    houseRules: Record<string, boolean>,
    play: boolean
  ): GameState => {
    const state = combat(`helm-curse-${JSON.stringify(houseRules)}`, houseRules);
    state.players.p1.hand = [HELM];
    state.decks.spells!.discardPile = ["spell.curse" as CardId];
    const declared = declareAttack(state);
    expect(declared.reactionWindow, "the Helm's printed ⚡ instant must open the attack window").toBeTruthy();
    const offers = helmReactions(declared, "p1");
    expect(offers.length, "the Spell-deck cast must be offered").toBeGreaterThan(0);
    // Anti-stall: the holder can always decline, so no seat (human, AI or AFK
    // driver) can be trapped by the new window.
    expect(
      getLegalActions(declared, "p1").some((legal) => legal.action.type === "PASS_REACTION")
    ).toBe(true);
    return settle(play ? applyOk(declared, offers[0]!.action) : declared);
  };

  for (const [label, houseRules] of [
    ["the printed card (no balance pack)", {}],
    ["polish-card-balance ON", { "polish-card-balance": true }],
    ["community-card-balance ON", { "community-card-balance": true }]
  ] as [string, Record<string, boolean>][]) {
    it(`casts Curse off the discard top and the attack really hits harder — ${label}`, () => {
      const cast = attackWithCurse(houseRules, true);
      const passed = attackWithCurse(houseRules, false);

      // THE outcome: +1 attack landed on the very attack that opened the window.
      expect(damageOf(cast)).toBe(damageOf(passed) + 1);
      // "Remove this card": the Helm leaves the game — never to hand or discard.
      expect(cast.players.p1.removed).toContain(HELM);
      expect(cast.players.p1.hand).not.toContain(HELM);
      expect(cast.players.p1.discard).not.toContain(HELM);
      // The Spell is not the caster's: it stays on the shared Spell discard.
      expect(cast.decks.spells!.discardPile).toContain("spell.curse");
      expect(cast.players.p1.discard).not.toContain("spell.curse");
      expect(cast.players.p1.hand).not.toContain("spell.curse");
      // A free bonus cast: it never spends the one-Spell-per-combat-round limit.
      expect(cast.players.p1.combatStats.spellsCastThisRound).toBe(0);
    });
  }

  it("the DEFENDER may cast their own triggered top too — Weakness blunts the incoming attack", () => {
    const run = (play: boolean): GameState => {
      const state = combat("helm-weakness", {});
      state.players.p2.hand = [HELM];
      state.decks.spells!.discardPile = ["spell.weakness" as CardId];
      const declared = declareAttack(state);
      const offers = helmReactions(declared, "p2");
      expect(offers.length, "the attacked player's Helm cast must be offered").toBeGreaterThan(0);
      return settle(play ? applyOk(declared, offers[0]!.action) : declared);
    };

    const cast = run(true);
    const passed = run(false);
    expect(damageOf(cast)).toBe(damageOf(passed) - 1);
    expect(cast.players.p2.removed).toContain(HELM);
  });

  it("is a FREE cast — still offered after the round's Spell limit is spent", () => {
    const state = combat("helm-past-limit", {});
    state.players.p1.hand = [HELM];
    state.players.p1.combatStats.spellsCastThisRound = 1;
    state.decks.spells!.discardPile = ["spell.curse" as CardId];
    const declared = declareAttack(state);
    const offers = helmReactions(declared, "p1");
    expect(offers.length).toBeGreaterThan(0);
    const after = settle(applyOk(declared, offers[0]!.action));
    expect(after.players.p1.removed).toContain(HELM);
    // The counter is untouched: the bonus cast neither spends nor bumps it.
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("CONTROL: no Helm in hand ⇒ no window opens from a triggered top at all", () => {
    const state = combat("helm-control-nohelm", {});
    state.players.p1.hand = [];
    state.decks.spells!.discardPile = ["spell.curse" as CardId];
    const declared = declareAttack(state);
    expect(helmReactions(declared, "p1")).toHaveLength(0);
  });

  it("CONTROL: a MAP-only top (Town Portal) is refused honestly — no offer, on turn or in the window", () => {
    const state = combat("helm-control-map", {});
    state.players.p1.hand = [HELM];
    state.decks.spells!.discardPile = ["spell.town_portal" as CardId];
    expect(
      getLegalActions(state, "p1").filter(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromSpellDeck === HELM
      )
    ).toHaveLength(0);
    const declared = declareAttack(state);
    expect(helmReactions(declared, "p1")).toHaveLength(0);
  });

  it("CONTROL: every Spell discard empty ⇒ nothing is offered", () => {
    const state = combat("helm-control-empty", {});
    state.players.p1.hand = [HELM];
    const declared = declareAttack(state);
    expect(helmReactions(declared, "p1")).toHaveLength(0);
  });

  it("CONTROL: a 'Cast a Spell' enabler on the top is never offered (the reducer cannot cast it)", () => {
    const state = combat("helm-control-enabler", {});
    state.players.p1.hand = [HELM];
    state.decks.spells!.discardPile = ["spell.cast_a_spell" as CardId];
    expect(
      getLegalActions(state, "p1").filter(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromSpellDeck === HELM
      )
    ).toHaveLength(0);
  });

  // Fail-closed CONTROL. Two layers refuse these frames — `assertLegal`'s exact
  // offer match (which answers first) and the handler's own re-derivation of the
  // arm and its source Spell — so this pins the OUTCOME, not one of the two.
  it("a forged play is refused: the named Spell must be the pile's top and the Helm must be held", () => {
    const state = combat("helm-forgery", {});
    state.players.p1.hand = [HELM];
    state.decks.spells!.discardPile = ["spell.magic_arrow" as CardId, "spell.curse" as CardId];
    const declared = declareAttack(state);

    // Buried in the pile, not its top: refused.
    const buried = applyAction(declared, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.magic_arrow" as CardId,
      mode: "basic",
      fromSpellDeck: HELM
    });
    expect(buried.errors.length).toBeGreaterThan(0);
    expect(buried.state.players.p1.hand).toContain(HELM);

    // The enabler is not in this player's hand: refused.
    const notHeld = applyAction(declared, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.curse" as CardId,
      mode: "basic",
      fromSpellDeck: HELM
    });
    expect(notHeld.errors.length).toBeGreaterThan(0);
  });
});

describe("Helm of the Alabaster Unicorn — the split EXPERT Spell pile's top counts too", () => {
  it("casts the expert pile's face-up top even when the basic pile's top is uncastable", () => {
    const state = combat("helm-expert-pile", {});
    state.players.p1.hand = [HELM];
    // The basic pile shows a MAP spell (uncastable in combat); the expert pile
    // shows a real combat Spell. Both are "the Spell-deck discard pile".
    state.decks.spells!.discardPile = ["spell.town_portal" as CardId];
    expect(state.decks["spells-expert"], "BINH splits the Spell deck").toBeTruthy();
    state.decks["spells-expert"]!.discardPile = ["spell.lightning_bolt" as CardId];

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.fromSpellDeck === HELM &&
        legal.action.cardId === "spell.lightning_bolt" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === DEFENDER
    );
    expect(cast, "the expert pile's top must be castable").toBeTruthy();

    const after = settle(applyOk(state, cast!.action));
    // Lightning Bolt at Power 0 deals 2 — the real effect, not just an offer.
    expect(damageOf(after)).toBe(2);
    expect(after.players.p1.removed).toContain(HELM);
    // It stays on the pile it came from.
    expect(after.decks["spells-expert"]!.discardPile).toContain("spell.lightning_bolt");
  });

  it("CONTROL: with both Spell piles empty the Helm offers no cast", () => {
    const state = combat("helm-expert-control", {});
    state.players.p1.hand = [HELM];
    expect(
      getLegalActions(state, "p1").filter(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.fromSpellDeck === HELM
      )
    ).toHaveLength(0);
  });
});

describe("Helm of the Alabaster Unicorn — the Balance reprint inscribes a windowed cast too", () => {
  const castInWindow = (houseRules: Record<string, boolean>): GameState => {
    const state = combat(`helm-inscribe-${JSON.stringify(houseRules)}`, houseRules);
    state.players.p1.hand = [HELM];
    state.decks.spells!.discardPile = ["spell.curse" as CardId];
    const declared = declareAttack(state);
    const offers = helmReactions(declared, "p1");
    expect(offers.length, "the reprint's ⚡ instant half must be offered").toBeGreaterThan(0);
    return settle(applyOk(declared, offers[0]!.action));
  };

  it("Polish Balance + Spell Book: the cast Spell is inscribed on the Book's USED side", () => {
    const after = castInWindow({ "polish-card-balance": true, "polish-spell-book": true });
    expect(after.players.p1.spellBookUsed ?? []).toContain("spell.curse");
    expect(after.players.p1.spellBook).not.toContain("spell.curse");
    expect(after.decks.spells!.discardPile).not.toContain("spell.curse");
  });

  it("CONTROL: the printed Helm (no balance pack) leaves it on the shared discard", () => {
    const after = castInWindow({ "polish-spell-book": true });
    expect(after.players.p1.spellBookUsed ?? []).not.toContain("spell.curse");
    expect(after.decks.spells!.discardPile).toContain("spell.curse");
  });
});
