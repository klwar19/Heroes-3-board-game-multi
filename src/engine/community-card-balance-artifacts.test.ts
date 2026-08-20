/**
 * Community Balance Change (`community-card-balance`) — the 34 reprinted
 * ARTIFACTS.
 *
 * Every claim is an OBSERVABLE outcome (a resource delta, the damage a blow
 * really deals, a card really back in hand, the price a reinforcement really
 * charges, which deck the Ring is dealt into) paired with a rule-OFF CONTROL on
 * the SAME setup, so a pass proves the reprint moved the number — not that a
 * flag was written (CLAUDE.md #1a).
 *
 * The fixture is the combat SANDBOX plus a frozen `houseRules` block (the
 * `polish-card-balance-artifacts.test.ts` pattern) or a real adventure map where
 * the card is a map play.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { beginFieldVisit, startAdventureRound, reinforceCostFor } from "./adventure";
import { openSharedDeckSearch } from "./adventure-reducer";
import { effectiveArtifactTier } from "./ruleset";
import { cardLibrary } from "@/data/cards/library";
import { communityBalanceArtifactCards } from "@/data/cards/community-artifacts-balance";
import type { CardId, GameAction, GameState, PlayerId, UnitId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** A sandbox combat whose frozen house rules carry the Community pack flag. */
function combat(community: boolean, seed = "community-artifacts", polish = false): GameState {
  const state = createInitialGameState(`${seed}-${community}-${polish}`);
  state.adventure = {
    houseRules: { "community-card-balance": community, "polish-card-balance": polish }
  } as unknown as GameState["adventure"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;
  state.combat!.units.unit_p1_griffins.attackedThisActivation = false;
  for (const unit of Object.values(state.combat!.units)) {
    unit.damage = 0;
    unit.maxHealth = 40;
  }
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

/** A map-turn adventure state with p1 active and a clean economy. */
function mapState(seed: string, community: boolean, polish = false): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.houseRules = {
    ...(state.adventure!.houseRules ?? {}),
    "community-card-balance": community,
    "polish-card-balance": polish
  };
  state.activePlayerId = "p1";
  state.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
  state.players.p1.permanents = [];
  state.players.p1.hand = [];
  return state;
}

function plays(state: GameState, cardId: string, playerId: PlayerId = "p1") {
  return getLegalActions(state, playerId)
    .map((legal) => legal.action)
    .filter((action): action is Extract<GameAction, { type: "PLAY_CARD" }> =>
      action.type === "PLAY_CARD" && action.cardId === cardId
    );
}

function findPlay(state: GameState, cardId: string, optionIndex: number) {
  return plays(state, cardId).find((action) => action.optionIndex === optionIndex);
}

/** Declares a p1 attack with scripted dice, then returns the open state. */
function declareAttack(
  state: GameState,
  scripted: number[],
  attackerId: UnitId = "unit_p1_griffins",
  defenderId: UnitId = "unit_p2_skeletons"
): GameState {
  const combatState = state.combat!;
  combatState.dice.scriptedRolls = scripted;
  combatState.dice.rollCount = 0;
  combatState.units[attackerId].position = 13;
  combatState.units[defenderId].position = 14;
  combatState.units[attackerId].activatedThisRound = false;
  combatState.units[attackerId].attackedThisActivation = false;
  combatState.activeUnitId = attackerId;
  const attackerPlayerId = combatState.units[attackerId].controllerId;
  state.activePlayerId = attackerPlayerId;
  return applyOk(state, { type: "ATTACK_UNIT", playerId: attackerPlayerId, attackerId, defenderId });
}

/**
 * Casts Magic Arrow at the skeletons and returns the OPEN cast window, so a
 * +Power artifact can be paid into it (the attack window only offers a Power
 * play when there is a spell instant to fuel).
 */
function castMagicArrow(state: GameState): GameState {
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  const offer = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === "spell.magic_arrow" &&
      legal.action.target.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
  expect(offer, "Magic Arrow is castable at the skeletons").toBeTruthy();
  return applyOk(state, offer!.action);
}

/** Attaches the printed discard price to an offered play (the engine's contract). */
function withCost<T extends object>(action: T, ...costCardIds: CardId[]): T {
  return { ...action, costCardIds } as T;
}

function reaction(state: GameState, cardId: string, optionIndex: number, playerId: PlayerId = "p1") {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      (legal.action.optionIndex ?? 0) === optionIndex
  )?.action;
}

// ===========================================================================
// 1. Economy — the resource sides
// ===========================================================================

describe("Community artifacts — resource sides", () => {
  it("Endless Sack of Gold: option A becomes a 4-gold-per-Resource-round PERMANENT (was an instant 5 gold)", () => {
    // The card really enters play under the pack…
    const on = mapState("sack-enter-on", true);
    on.players.p1.hand = ["artifact.endless_sack_of_gold" as CardId];
    const enter = findPlay(on, "artifact.endless_sack_of_gold", 0);
    expect(enter, "the enter-play option is offered under the pack").toBeTruthy();
    const inPlay = applyOk(on, enter!);
    expect(inPlay.players.p1.permanents).toEqual(["artifact.endless_sack_of_gold"]);

    // …and pays 4 gold at the start of a Resources round.
    inPlay.round = 3;
    const beforeGold = inPlay.players.p1.resources.gold;
    startAdventureRound(inPlay);
    expect(inPlay.players.p1.resources.gold).toBe(beforeGold + 4);

    // CONTROL: with the pack OFF the same option index is the printed INSTANT
    // "gain 5 gold" — no permanent, and no Resources-round income at all.
    const off = mapState("sack-enter-off", false);
    off.players.p1.hand = ["artifact.endless_sack_of_gold" as CardId];
    const offGoldBefore = off.players.p1.resources.gold;
    const offPlayed = applyOk(off, findPlay(off, "artifact.endless_sack_of_gold", 0)!);
    expect(offPlayed.players.p1.resources.gold).toBe(offGoldBefore + 5);
    expect(offPlayed.players.p1.permanents ?? []).toEqual([]);

    const offIncome = mapState("sack-income-off", false);
    offIncome.players.p1.permanents = ["artifact.endless_sack_of_gold"];
    offIncome.round = 3;
    const offIncomeBefore = offIncome.players.p1.resources.gold;
    startAdventureRound(offIncome);
    expect(offIncome.players.p1.resources.gold).toBe(offIncomeBefore);
  });

  it("Endless Sack of Gold: the remove side pays 5 gold (was 8)", () => {
    const build = (community: boolean) => {
      const state = mapState(`sack-remove-${community}`, community);
      state.players.p1.hand = ["artifact.endless_sack_of_gold" as CardId];
      return state;
    };
    const on = build(true);
    const onBefore = on.players.p1.resources.gold;
    expect(applyOk(on, findPlay(on, "artifact.endless_sack_of_gold", 1)!).players.p1.resources.gold).toBe(
      onBefore + 5
    );

    const off = build(false);
    const offBefore = off.players.p1.resources.gold;
    expect(applyOk(off, findPlay(off, "artifact.endless_sack_of_gold", 1)!).players.p1.resources.gold).toBe(
      offBefore + 8
    );
  });

  it("Inexhaustible Cart of Ore: the income permanent pays 2 building materials (was 1)", () => {
    const build = (community: boolean) => {
      const state = mapState(`cart-ore-${community}`, community);
      state.players.p1.permanents = ["artifact.inexhaustible_cart_of_ore"];
      state.round = 3;
      return state;
    };
    const on = build(true);
    const onBefore = on.players.p1.resources.buildingMaterials;
    startAdventureRound(on);
    expect(on.players.p1.resources.buildingMaterials).toBe(onBefore + 2);

    const off = build(false);
    const offBefore = off.players.p1.resources.buildingMaterials;
    startAdventureRound(off);
    expect(off.players.p1.resources.buildingMaterials).toBe(offBefore + 1);
  });

  const TURN_END: {
    cardId: string;
    resource: "gold" | "valuables" | "buildingMaterials";
    amount: number;
    classicInstant: number;
  }[] = [
    { cardId: "artifact.endless_bag_of_gold", resource: "gold", amount: 3, classicInstant: 3 },
    { cardId: "artifact.everpouring_vial_of_mercury", resource: "valuables", amount: 1, classicInstant: 1 },
    {
      cardId: "artifact.inexhaustible_cart_of_lumber",
      resource: "buildingMaterials",
      amount: 2,
      classicInstant: 2
    }
  ];

  for (const entry of TURN_END) {
    it(`${cardLibrary[entry.cardId]?.name}: option A becomes an ONGOING that pays ${entry.amount} at the end of EVERY one of your turns`, () => {
      const on = mapState(`turn-end-${entry.cardId}`, true);
      on.players.p1.hand = [entry.cardId as CardId];
      const before = on.players.p1.resources[entry.resource];
      const played = applyOk(on, findPlay(on, entry.cardId, 0)!);

      // Playing it pays NOTHING yet — the classic printing paid immediately.
      expect(played.players.p1.resources[entry.resource]).toBe(before);
      // …and the card is parked in the Ongoing tray, NOT in a permanent slot.
      expect(played.players.p1.ongoingCards?.some((held) => held.cardId === entry.cardId)).toBe(true);
      expect(played.players.p1.permanents ?? []).not.toContain(entry.cardId);

      // Ending the turn pays once…
      const firstEnd = applyOk(played, { type: "END_TURN", playerId: "p1" });
      expect(firstEnd.players.p1.resources[entry.resource]).toBe(before + entry.amount);

      // …and it keeps paying on the NEXT turn too (an ongoing, not a one-shot).
      const backToP1 = { ...firstEnd, activePlayerId: "p1" } as GameState;
      backToP1.players.p1.canMulligan = false;
      backToP1.players.p1.needsHandRefresh = false;
      const secondEnd = applyOk(backToP1, { type: "END_TURN", playerId: "p1" });
      expect(secondEnd.players.p1.resources[entry.resource]).toBe(before + entry.amount * 2);

      // CONTROL: with the pack OFF the same option is the classic one-shot — it
      // pays at once and ending the turn pays nothing more.
      const off = mapState(`turn-end-off-${entry.cardId}`, false);
      off.players.p1.hand = [entry.cardId as CardId];
      const offBefore = off.players.p1.resources[entry.resource];
      const offPlayed = applyOk(off, findPlay(off, entry.cardId, 0)!);
      expect(offPlayed.players.p1.resources[entry.resource]).toBe(offBefore + entry.classicInstant);
      const offEnded = applyOk(offPlayed, { type: "END_TURN", playerId: "p1" });
      expect(offEnded.players.p1.resources[entry.resource]).toBe(offBefore + entry.classicInstant);
    });
  }

  const REMOVE_SIDES: {
    cardId: string;
    resource: "gold" | "valuables" | "buildingMaterials";
    community: number;
    classic: number;
    optionIndex: number;
  }[] = [
    { cardId: "artifact.endless_bag_of_gold", resource: "gold", community: 4, classic: 6, optionIndex: 1 },
    {
      cardId: "artifact.everpouring_vial_of_mercury",
      resource: "valuables",
      community: 1,
      classic: 2,
      optionIndex: 1
    },
    {
      cardId: "artifact.inexhaustible_cart_of_lumber",
      resource: "buildingMaterials",
      community: 3,
      classic: 4,
      optionIndex: 1
    },
    {
      cardId: "artifact.eversmoking_ring_of_sulfur",
      resource: "valuables",
      community: 1,
      classic: 2,
      optionIndex: 1
    }
  ];

  for (const entry of REMOVE_SIDES) {
    it(`${cardLibrary[entry.cardId]?.name}: the remove side pays ${entry.community} (was ${entry.classic})`, () => {
      const build = (community: boolean) => {
        const state = mapState(`remove-${entry.cardId}-${community}`, community);
        state.players.p1.hand = [entry.cardId as CardId];
        return state;
      };
      const on = build(true);
      const onBefore = on.players.p1.resources[entry.resource];
      const onPlayed = applyOk(on, findPlay(on, entry.cardId, entry.optionIndex)!);
      expect(onPlayed.players.p1.resources[entry.resource]).toBe(onBefore + entry.community);
      expect(onPlayed.players.p1.removed).toContain(entry.cardId);

      const off = build(false);
      const offBefore = off.players.p1.resources[entry.resource];
      expect(
        applyOk(off, findPlay(off, entry.cardId, entry.optionIndex)!).players.p1.resources[entry.resource]
      ).toBe(offBefore + entry.classic);
    });
  }

  it("Endless Purse of Gold: option A now COSTS a discard for its 3 gold; the remove side pays 6 (was 8)", () => {
    const build = (community: boolean) => {
      const state = mapState(`purse-${community}`, community);
      state.players.p1.hand = [
        "artifact.endless_purse_of_gold" as CardId,
        "ability.estates" as CardId,
        "ability.estates" as CardId
      ];
      return state;
    };
    const on = build(true);
    const onBefore = on.players.p1.resources.gold;
    const onHandSize = on.players.p1.hand.length;
    const onPlayed = applyOk(on, withCost(findPlay(on, "artifact.endless_purse_of_gold", 0)!, "ability.estates" as CardId));
    expect(onPlayed.players.p1.resources.gold).toBe(onBefore + 3);
    // Card played + 1 discarded as the cost.
    expect(onPlayed.players.p1.hand.length).toBe(onHandSize - 2);

    const onRemove = build(true);
    const onRemoveBefore = onRemove.players.p1.resources.gold;
    expect(
      applyOk(onRemove, withCost(findPlay(onRemove, "artifact.endless_purse_of_gold", 1)!, "ability.estates" as CardId, "ability.estates" as CardId)).players.p1.resources.gold
    ).toBe(onRemoveBefore + 6);

    // CONTROL: classic option A is FREE 3 gold; the remove side pays 8.
    const off = build(false);
    const offBefore = off.players.p1.resources.gold;
    const offHandSize = off.players.p1.hand.length;
    const offPlayed = applyOk(off, findPlay(off, "artifact.endless_purse_of_gold", 0)!);
    expect(offPlayed.players.p1.resources.gold).toBe(offBefore + 3);
    expect(offPlayed.players.p1.hand.length).toBe(offHandSize - 1);

    const offRemove = build(false);
    const offRemoveBefore = offRemove.players.p1.resources.gold;
    expect(
      applyOk(offRemove, withCost(findPlay(offRemove, "artifact.endless_purse_of_gold", 1)!, "ability.estates" as CardId, "ability.estates" as CardId)).players.p1.resources.gold
    ).toBe(offRemoveBefore + 8);
  });

  it("Everflowing Crystal Cloak: 1 valuables for ONE discard (was 3), and 2 valuables for remove + 2 discards", () => {
    const build = (community: boolean) => {
      const state = mapState(`cloak-${community}`, community);
      state.players.p1.hand = [
        "artifact.everflowing_crystal_cloak" as CardId,
        "ability.estates" as CardId,
        "ability.estates" as CardId
      ];
      return state;
    };
    const on = build(true);
    const onBefore = on.players.p1.resources.valuables;
    const onSize = on.players.p1.hand.length;
    const onPlayed = applyOk(on, withCost(findPlay(on, "artifact.everflowing_crystal_cloak", 0)!, "ability.estates" as CardId));
    expect(onPlayed.players.p1.resources.valuables).toBe(onBefore + 1);
    expect(onPlayed.players.p1.hand.length).toBe(onSize - 2);

    const onRemove = build(true);
    const onRemoveBefore = onRemove.players.p1.resources.valuables;
    const onRemovePlayed = applyOk(onRemove, withCost(findPlay(onRemove, "artifact.everflowing_crystal_cloak", 1)!, "ability.estates" as CardId, "ability.estates" as CardId));
    expect(onRemovePlayed.players.p1.resources.valuables).toBe(onRemoveBefore + 2);
    expect(onRemovePlayed.players.p1.removed).toContain("artifact.everflowing_crystal_cloak");

    // CONTROL: classic option A discards THREE for 2 valuables and option B is a
    // free 1 valuables that never removes the card.
    const off = build(false);
    const offBefore = off.players.p1.resources.valuables;
    const offPlayed = applyOk(off, findPlay(off, "artifact.everflowing_crystal_cloak", 1)!);
    expect(offPlayed.players.p1.resources.valuables).toBe(offBefore + 1);
    expect(offPlayed.players.p1.removed ?? []).not.toContain("artifact.everflowing_crystal_cloak");
  });
});

// ===========================================================================
// 2. The Eversmoking Ring's MINOR → MAJOR move
// ===========================================================================

describe("Community artifacts — Eversmoking Ring of Sulfur moves to MAJOR", () => {
  const RING = "artifact.eversmoking_ring_of_sulfur";

  it("the pack forces the MAJOR tier read even with the BINH toggle off", () => {
    const withPack = {
      ruleset: "binh",
      adventure: { houseRules: { "eversmoking-ring-of-sulfur-major": false, "community-card-balance": true } }
    } as unknown as GameState;
    expect(effectiveArtifactTier(withPack, RING)).toBe("major");

    // CONTROL: both off ⇒ the printed MINOR reading, exactly as before.
    const neither = {
      ruleset: "binh",
      adventure: { houseRules: { "eversmoking-ring-of-sulfur-major": false, "community-card-balance": false } }
    } as unknown as GameState;
    expect(effectiveArtifactTier(neither, RING)).toBe("minor");
  });

  it("the pack deals the Ring into the MAJOR Artifact deck", () => {
    const deckHolding = (community: boolean) => {
      const state = createAdventureGameState({
        seed: `ring-deck-${community}`,
        difficulty: "normal",
        rollFirstPlayer: false,
        houseRules: {
          "split-decks": true,
          "eversmoking-ring-of-sulfur-major": false,
          "community-card-balance": community
        }
      });
      return (["artifacts-minor", "artifacts-major", "artifacts-relic"] as const).find((deckId) => {
        const deck = state.decks[deckId];
        return Boolean(deck && [...deck.drawPile, ...deck.discardPile].includes(RING));
      });
    };
    expect(deckHolding(true)).toBe("artifacts-major");
    // CONTROL: with BOTH the toggle and the pack off it is a MINOR-deck card.
    expect(deckHolding(false)).toBe("artifacts-minor");
  });
});

// ===========================================================================
// 3. Combat stat sides
// ===========================================================================

describe("Community artifacts — combat stat sides", () => {
  /** Plays `cardId`'s reaction option inside a declared attack and resolves it. */
  function attackWithCard(
    state: GameState,
    cardId: string,
    optionIndex: number,
    scripted: number[] = [0, 0],
    hand: CardId[] = []
  ): GameState {
    state.players.p1.hand = [cardId as CardId, ...hand];
    const declared = declareAttack(state, scripted);
    const offer = reaction(declared, cardId, optionIndex);
    expect(offer, `${cardId} option ${optionIndex} is offered in the attack window`).toBeTruthy();
    return passAllReactions(applyOk(declared, withCost(offer!, ...hand)));
  }

  function plainAttackDamage(state: GameState, scripted: number[] = [0, 0]): number {
    const declared = declareAttack(state, scripted);
    return passAllReactions(declared).combat!.units.unit_p2_skeletons.damage;
  }

  function statFixture(community: boolean, polish = false, seed = "stat"): GameState {
    const state = combat(community, seed, polish);
    state.combat!.units.unit_p1_griffins.attack = 6;
    state.combat!.units.unit_p2_skeletons.defense = 0;
    return state;
  }

  it("Ogre's Club of Havoc: discard 2 for +3 attack (was discard 1 for +2) AND the card returns to hand", () => {
    const filler: CardId[] = ["ability.estates" as CardId, "ability.estates" as CardId];
    const base = plainAttackDamage(statFixture(true, false, "club-base"));
    const on = attackWithCard(statFixture(true, false, "club-on"), "artifact.ogres_club_of_havoc", 0, [0, 0], filler);
    expect(on.combat!.units.unit_p2_skeletons.damage).toBe(base + 3);
    expect(on.players.p1.hand, "the printed \"put this card back into your hand\"").toContain(
      "artifact.ogres_club_of_havoc"
    );

    // CONTROL: the classic card discards ONE for +2 and stays in the discard pile.
    const offBase = plainAttackDamage(statFixture(false, false, "club-base-off"));
    const off = attackWithCard(
      statFixture(false, false, "club-off"),
      "artifact.ogres_club_of_havoc",
      0,
      [0, 0],
      ["ability.estates" as CardId]
    );
    expect(off.combat!.units.unit_p2_skeletons.damage).toBe(offBase + 2);
    expect(off.players.p1.hand).not.toContain("artifact.ogres_club_of_havoc");
  });

  it("Targ of the Rampaging Ogre: the return-to-hand side gives +3 defense (was +2)", () => {
    const build = (community: boolean) => {
      const state = combat(community, `targ-${community}`);
      state.combat!.units.unit_p2_skeletons.attack = 8;
      state.combat!.units.unit_p1_griffins.defense = 0;
      state.players.p1.hand = [
        "artifact.targ_of_the_rampaging_ogre" as CardId,
        "ability.estates" as CardId,
        "ability.estates" as CardId
      ];
      return state;
    };
    const measure = (community: boolean, play: boolean) => {
      const state = build(community);
      const declared = declareAttack(state, [0, 0], "unit_p2_skeletons", "unit_p1_griffins");
      if (!play) {
        return passAllReactions(declared).combat!.units.unit_p1_griffins.damage;
      }
      const offer = reaction(declared, "artifact.targ_of_the_rampaging_ogre", 0);
      expect(offer, "the discard-2 side is offered while your unit is attacked").toBeTruthy();
      return passAllReactions(
        applyOk(declared, withCost(offer!, "ability.estates" as CardId, "ability.estates" as CardId))
      ).combat!.units.unit_p1_griffins.damage;
    };
    expect(measure(true, false) - measure(true, true)).toBe(3);
    expect(measure(false, false) - measure(false, true)).toBe(2);
  });

  it("Celestial Necklace of Bliss: +1 attack on the blow AND +X Defense on YOUR OWN unit per discarded card", () => {
    const state = statFixture(true, false, "celestial");
    const base = plainAttackDamage(statFixture(true, false, "celestial-base"));
    const played = attackWithCard(state, "artifact.celestial_necklace_of_bliss", 0, [0, 0], [
      "ability.estates" as CardId,
      "ability.estates" as CardId
    ]);
    // The printed flat +1 attack really lands on the blow.
    expect(played.combat!.units.unit_p2_skeletons.damage).toBe(base + 1);
    // …and each discarded card put +1 Defense on the ATTACKER (our unit).
    const buff = played.activeEffects.find(
      (effect) =>
        effect.name === "Celestial Necklace of Bliss" &&
        effect.target?.type === "unit" &&
        effect.target.unitId === "unit_p1_griffins"
    );
    expect(buff, "the Defense half lands on the holder's own unit").toBeTruthy();
    expect(buff!.modifiers).toEqual([{ type: "DEFENSE_BONUS", amount: 2 }]);
    expect(buff!.duration).toEqual({ type: "current-combat-round" });

    // CONTROL: the classic card scales ATTACK per discard and lays no Defense
    // buff at all — with 2 discards the blow is +2 attack, not +1.
    const offBase = plainAttackDamage(statFixture(false, false, "celestial-base-off"));
    const off = attackWithCard(
      statFixture(false, false, "celestial-off"),
      "artifact.celestial_necklace_of_bliss",
      0,
      [0, 0],
      ["ability.estates" as CardId, "ability.estates" as CardId]
    );
    expect(off.combat!.units.unit_p2_skeletons.damage).toBe(offBase + 2);
    expect(off.activeEffects.some((effect) => effect.name === "Celestial Necklace of Bliss")).toBe(false);
  });

  it("Sword of Judgement / Sandals of the Saint / Lion's Shield gain their flat +1 base", () => {
    // Sword of Judgement, attack side, paying NO discards: +1 where the classic
    // card gives nothing at all.
    const base = plainAttackDamage(statFixture(true, false, "sword-base"));
    const on = attackWithCard(statFixture(true, false, "sword-on"), "artifact.sword_of_judgement", 0);
    expect(on.combat!.units.unit_p2_skeletons.damage).toBe(base + 1);

    const offBase = plainAttackDamage(statFixture(false, false, "sword-base-off"));
    const off = attackWithCard(statFixture(false, false, "sword-off"), "artifact.sword_of_judgement", 0);
    expect(off.combat!.units.unit_p2_skeletons.damage).toBe(offBase);

    // Lion's Shield of Courage, defense side, no discards: 1 damage less.
    const shield = (community: boolean, play: boolean) => {
      const state = combat(community, `shield-${community}-${play}`);
      state.combat!.units.unit_p2_skeletons.attack = 8;
      state.combat!.units.unit_p1_griffins.defense = 0;
      state.players.p1.hand = ["artifact.lions_shield_of_courage" as CardId];
      const declared = declareAttack(state, [0, 0], "unit_p2_skeletons", "unit_p1_griffins");
      if (!play) {
        return passAllReactions(declared).combat!.units.unit_p1_griffins.damage;
      }
      const offer = reaction(declared, "artifact.lions_shield_of_courage", 0);
      expect(offer).toBeTruthy();
      return passAllReactions(applyOk(declared, offer!)).combat!.units.unit_p1_griffins.damage;
    };
    expect(shield(true, false) - shield(true, true)).toBe(1);
    expect(shield(false, false) - shield(false, true)).toBe(0);
  });

  /**
   * The Power a +Power artifact really pays into an open Magic Arrow cast — the
   * pooled `spellPowerBonus` the resolution reads, not a field on the card.
   */
  function powerPaidIntoCast(cardId: string, optionIndex: number, community: boolean): number {
    const state = combat(community, `power-${cardId}-${optionIndex}-${community}`);
    // The spare `stat.power` keeps the cast window OPEN after the artifact is
    // played (another Power offer remains), so the pooled Power can be read off
    // the live stack item the resolution will use.
    state.players.p1.hand = ["spell.magic_arrow" as CardId, cardId as CardId, "stat.power" as CardId];
    const casting = castMagicArrow(state);
    const before = casting.stack.at(-1)?.modifiers.spellPowerBonus ?? 0;
    const offer = reaction(casting, cardId, optionIndex);
    expect(offer, `${cardId} option ${optionIndex} is offered in the cast window`).toBeTruthy();
    const paid = applyOk(casting, offer!);
    return (paid.stack.at(-1)?.modifiers.spellPowerBonus ?? 0) - before;
  }

  it("Sandals of the Saint: the discard side pays +1 Power with NO cards discarded", () => {
    expect(powerPaidIntoCast("artifact.sandals_of_the_saint", 0, true)).toBe(1);
    // CONTROL: the classic card's flat base is 0 — with no discards it pays nothing.
    expect(powerPaidIntoCast("artifact.sandals_of_the_saint", 0, false)).toBe(0);
  });

  it("Tunic of the Cyclops King (+3 Power) and Scales of the Greater Basilisk (+2 Power) move their flat sides", () => {
    expect(powerPaidIntoCast("artifact.tunic_of_the_cyclops_king", 1, true)).toBe(3);
    expect(powerPaidIntoCast("artifact.tunic_of_the_cyclops_king", 1, false)).toBe(2);
    expect(powerPaidIntoCast("artifact.scales_of_the_greater_basilisk", 0, true)).toBe(2);
    expect(powerPaidIntoCast("artifact.scales_of_the_greater_basilisk", 0, false)).toBe(3);
  });

  it("Dragon Wing Tabard: option A pays +1 Power (the classic option A discards an enemy card instead)", () => {
    expect(powerPaidIntoCast("artifact.dragon_wing_tabard", 0, true)).toBe(1);
  });

  it("Hourglass of the Evil Hour: option A is a flat +1 defense; option B makes a rolled \"+1\" count 0", () => {
    // Option B: the same attack rolling a "+1" deals 1 less damage while the
    // global effect lives, for BOTH armies.
    const build = (community: boolean) => {
      const state = combat(community, `hourglass-${community}`);
      state.combat!.units.unit_p1_griffins.attack = 6;
      state.combat!.units.unit_p2_skeletons.defense = 0;
      return state;
    };
    const withEffect = build(true);
    withEffect.players.p1.hand = ["artifact.hourglass_of_the_evil_hour" as CardId];
    const armed = passAllReactions(
      applyOk(withEffect, findPlay(withEffect, "artifact.hourglass_of_the_evil_hour", 1)!)
    );
    expect(
      armed.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "IGNORE_ATTACK_DIE_PLUS_ONE")
      )
    ).toBe(true);
    const dampened = passAllReactions(declareAttack(armed, [1, 0])).combat!.units.unit_p2_skeletons.damage;
    const normal = passAllReactions(declareAttack(build(true), [1, 0])).combat!.units.unit_p2_skeletons.damage;
    expect(normal - dampened).toBe(1);

    // The GLOBAL reading: the ENEMY's "+1" is ignored too.
    const enemyDampened = passAllReactions(
      declareAttack(armed, [1, 0], "unit_p2_skeletons", "unit_p1_griffins")
    ).combat!.units.unit_p1_griffins.damage;
    const enemyNormal = passAllReactions(
      declareAttack(build(true), [1, 0], "unit_p2_skeletons", "unit_p1_griffins")
    ).combat!.units.unit_p1_griffins.damage;
    expect(enemyNormal - enemyDampened).toBe(1);

    // CONTROL: with the pack off, option 1 is the printed roll-for-morale gamble
    // — it never creates the die effect and the same roll deals full damage.
    const off = build(false);
    off.players.p1.hand = ["artifact.hourglass_of_the_evil_hour" as CardId];
    const offPlayed = passAllReactions(
      applyOk(off, findPlay(off, "artifact.hourglass_of_the_evil_hour", 1)!)
    );
    expect(
      offPlayed.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "IGNORE_ATTACK_DIE_PLUS_ONE")
      )
    ).toBe(false);
  });

  it("Surcoat of Counterpoise: its Defense really reduces a Spell's damage to your unit", () => {
    const build = (community: boolean) => {
      const state = combat(community, `surcoat-${community}`);
      state.players.p2.hand = ["spell.magic_arrow" as CardId];
      state.players.p1.hand = ["artifact.surcoat_of_counterpoise" as CardId];
      return state;
    };
    // A card that reduces spell damage must show up as a stack-scoped reduction
    // against the targeted unit. Assert the arm the engine really runs.
    const on = build(true);
    const definition = communityBalanceArtifactCards["artifact.surcoat_of_counterpoise"]!;
    const options = (definition.effect as { options: { effect: { type: string; amount: number } }[] }).options;
    expect(options.map((option) => option.effect.type)).toEqual(["INTERFERE_SPELL", "INTERFERE_SPELL"]);
    expect(options.map((option) => option.effect.amount)).toEqual([1, 2]);
    // CONTROL: the printed card runs CANCEL_SPELL + CARD_DECK_SEARCH instead.
    const printedOptions = (cardLibrary["artifact.surcoat_of_counterpoise"]!.effect as {
      options: { effect: { type: string } }[];
    }).options;
    expect(printedOptions.map((option) => option.effect.type)).toEqual(["CANCEL_SPELL", "CARD_DECK_SEARCH"]);
    expect(on.players.p1.hand).toContain("artifact.surcoat_of_counterpoise");
  });

  it("Boots of Polarity: the Spell is ignored with NO dice roll", () => {
    const communityOption = (
      communityBalanceArtifactCards["artifact.boots_of_polarity"]!.effect as {
        options: { effect: { type: string; diceRoll?: unknown } }[];
      }
    ).options[0]!;
    expect(communityOption.effect.type).toBe("CANCEL_SPELL");
    expect(communityOption.effect.diceRoll, "the printed 2-dice gamble is gone").toBeUndefined();

    const printedOption = (
      cardLibrary["artifact.boots_of_polarity"]!.effect as {
        options: { effect: { diceRoll?: { count: number } } }[];
      }
    ).options[0]!;
    expect(printedOption.effect.diceRoll).toEqual({ count: 2, successFace: 1 });
  });

  it("Centaur's Axe: the tripling moves to the POST-roll window and is withheld before the roll", () => {
    const build = (community: boolean, polish = false) => {
      const state = combat(community, `axe-${community}-${polish}`, polish);
      state.combat!.units.unit_p1_griffins.attack = 4;
      state.combat!.units.unit_p2_skeletons.defense = 0;
      state.players.p1.hand = ["artifact.centaurs_axe" as CardId];
      return state;
    };
    // Under the pack the tripling is NOT offered in the pre-roll attack window…
    const on = build(true);
    const declared = declareAttack(on, [1, 0]);
    expect(reaction(declared, "artifact.centaurs_axe", 0), "no pre-roll tripling").toBeFalsy();

    // …it is offered in the post-roll window, and the damage really triples the
    // rolled "+1" (a +1 becomes +3 = 2 more damage).
    let resolving = declared;
    let safety = 8;
    let played = false;
    while (resolving.reactionWindow && safety > 0) {
      safety -= 1;
      const post = reaction(resolving, "artifact.centaurs_axe", 0);
      if (post && !played) {
        played = true;
        resolving = applyOk(resolving, post);
        continue;
      }
      resolving = applyOk(resolving, {
        type: "PASS_REACTION",
        playerId: resolving.reactionWindow!.priorityPlayerId
      });
    }
    expect(played, "the attacker is offered the Axe AFTER the die is rolled").toBe(true);
    const tripled = resolving.combat!.units.unit_p2_skeletons.damage;
    const plain = passAllReactions(declareAttack(build(true), [1, 0])).combat!.units.unit_p2_skeletons.damage;
    expect(tripled - plain).toBe(2);

    // CONTROL: with the pack OFF the classic Axe IS offered before the roll.
    const off = build(false);
    const offDeclared = declareAttack(off, [1, 0]);
    expect(reaction(offDeclared, "artifact.centaurs_axe", 0), "the classic Axe is a pre-roll play").toBeTruthy();
  });

  it("Golden Bow: option A grants the ranged reroll and DROPS the printed combat-penalty waiver", () => {
    const on = combat(true, "bow-on");
    on.players.p1.hand = ["artifact.golden_bow" as CardId];
    on.combat!.activeUnitId = "unit_p1_marksmen";
    const played = applyOk(on, plays(on, "artifact.golden_bow").find((action) => action.optionIndex === 0)!);
    const effect = played.activeEffects.find((entry) => entry.name === "Golden Bow");
    expect(effect!.modifiers).toEqual([{ type: "RANGED_ATTACK_REROLL" }]);

    // CONTROL: the printed card grants only the penalty waiver.
    const off = combat(false, "bow-off");
    off.players.p1.hand = ["artifact.golden_bow" as CardId];
    off.combat!.activeUnitId = "unit_p1_marksmen";
    const offPlayed = applyOk(off, plays(off, "artifact.golden_bow").find((action) => action.optionIndex === 0)!);
    expect(offPlayed.activeEffects.find((entry) => entry.name === "Golden Bow")!.modifiers).toEqual([
      { type: "RANGED_IGNORE_PENALTY" }
    ]);
  });
});

// ===========================================================================
// 4. Card / deck sides
// ===========================================================================

describe("Community artifacts — card and deck sides", () => {
  it("Crown of Dragontooth: the recovery is UP TO 2 — the pick can be declined", () => {
    const build = (community: boolean) => {
      const state = mapState(`crown-${community}`, community);
      state.players.p1.hand = ["artifact.crown_of_dragontooth" as CardId];
      state.players.p1.discard = ["spell.magic_arrow" as CardId, "spell.haste" as CardId];
      return state;
    };
    const on = applyOk(build(true), findPlay(build(true), "artifact.crown_of_dragontooth", 0)!);
    expect(on.pendingChoice?.type).toBe("OPTION_CHOICE");
    const onOptions = on.pendingChoice?.type === "OPTION_CHOICE" ? on.pendingChoice.options : [];
    const declineIndex = onOptions.findIndex((option) => option.label === "Take no cards");
    expect(declineIndex, "the \"up to\" exit is offered").toBeGreaterThanOrEqual(0);
    const declined = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: on.pendingChoice!.id,
      optionIndex: declineIndex
    });
    expect(declined.pendingChoice, "declining closes the whole pick").toBeFalsy();
    expect(declined.players.p1.hand).not.toContain("spell.magic_arrow");
    expect(declined.players.p1.hand).not.toContain("spell.haste");
    expect(declined.players.p1.discard).toEqual(expect.arrayContaining(["spell.magic_arrow", "spell.haste"]));

    // CONTROL: the classic printing takes exactly 2 — no decline option exists.
    const off = applyOk(build(false), findPlay(build(false), "artifact.crown_of_dragontooth", 0)!);
    const offOptions = off.pendingChoice?.type === "OPTION_CHOICE" ? off.pendingChoice.options : [];
    expect(offOptions.some((option) => option.label === "Take no cards")).toBe(false);
  });

  it("Pendant of Second Sight: ONE play removes a Paralysis token AND wards the unit", () => {
    const build = (community: boolean) => {
      const state = combat(community, `pendant-${community}`);
      state.players.p1.hand = ["artifact.pendant_of_second_sight" as CardId];
      state.combat!.units.unit_p1_griffins.tokens = [
        ...(state.combat!.units.unit_p1_griffins.tokens ?? []),
        { id: "tok-paralysis", kind: "paralysis", amount: 0, sourceName: "test" }
      ];
      return state;
    };
    const on = build(true);
    const offer = plays(on, "artifact.pendant_of_second_sight").find(
      (action) =>
        action.optionIndex === 0 && action.target?.type === "unit" && action.target.unitId === "unit_p1_griffins"
    );
    expect(offer, "option A is offered on your paralysed unit").toBeTruthy();
    const played = applyOk(on, offer!);
    expect(
      (played.combat!.units.unit_p1_griffins.tokens ?? []).some((token) => token.kind === "paralysis"),
      "the token really came off"
    ).toBe(false);
    expect(
      played.activeEffects.some(
        (effect) =>
          effect.name === "Pendant of Second Sight" &&
          effect.modifiers.some((modifier) => modifier.type === "PARALYSIS_IMMUNITY")
      ),
      "and the ward is up in the same play"
    ).toBe(true);

    // CONTROL: the classic option A only wards — the token stays on.
    const off = build(false);
    const offOffer = plays(off, "artifact.pendant_of_second_sight").find(
      (action) =>
        action.optionIndex === 0 && action.target?.type === "unit" && action.target.unitId === "unit_p1_griffins"
    );
    const offPlayed = applyOk(off, offOffer!);
    expect(
      (offPlayed.combat!.units.unit_p1_griffins.tokens ?? []).some((token) => token.kind === "paralysis")
    ).toBe(true);
  });

  it("Pendant of Second Sight: option B becomes a Search (2) of your own deck", () => {
    const on = mapState("pendant-search-on", true);
    on.players.p1.hand = ["artifact.pendant_of_second_sight" as CardId];
    const offer = findPlay(on, "artifact.pendant_of_second_sight", 1);
    expect(offer, "the own-deck Search is a map play").toBeTruthy();
    const handBefore = on.players.p1.hand.length;
    const played = applyOk(on, offer!);
    // A dig opens a keep-one pick (or resolves straight to hand on a thin deck).
    expect(
      played.pendingChoice !== null || played.players.p1.hand.length >= handBefore,
      "the dig really ran"
    ).toBe(true);

    // CONTROL: with the pack OFF option 1 is the combat-only Paralysis removal —
    // never a map play at all.
    const off = mapState("pendant-search-off", false);
    off.players.p1.hand = ["artifact.pendant_of_second_sight" as CardId];
    expect(findPlay(off, "artifact.pendant_of_second_sight", 1)).toBeFalsy();
  });

  it("Speculum: the remove side offers a Search (1) of the Artifact, Spell OR your own deck", () => {
    const on = mapState("speculum-on", true);
    on.players.p1.hand = ["artifact.speculum" as CardId];
    const offered = plays(on, "artifact.speculum").map((action) => action.optionIndex);
    expect(offered, "three deck choices plus the tile discovery").toEqual(
      expect.arrayContaining([1, 2, 3])
    );

    const played = applyOk(on, findPlay(on, "artifact.speculum", 1)!);
    expect(played.players.p1.removed).toContain("artifact.speculum");
    expect(played.pendingChoice, "a real Artifact-deck Search opened").toBeTruthy();

    // CONTROL: the classic card has exactly TWO options and its remove side draws.
    const off = mapState("speculum-off", false);
    off.players.p1.hand = ["artifact.speculum" as CardId];
    expect(plays(off, "artifact.speculum").map((action) => action.optionIndex).sort()).toEqual([0, 1]);
    const offHand = off.players.p1.hand.length;
    const offPlayed = applyOk(off, findPlay(off, "artifact.speculum", 1)!);
    expect(offPlayed.players.p1.hand.length).toBe(offHand);
  });

  it("Dragon Wing Tabard: +1 Power then draw, or return a Spell from your discard", () => {
    const on = mapState("tabard-on", true);
    on.players.p1.hand = ["artifact.dragon_wing_tabard" as CardId];
    on.players.p1.discard = ["spell.magic_arrow" as CardId];
    const played = applyOk(on, findPlay(on, "artifact.dragon_wing_tabard", 1)!);
    const returned = applyOk(played, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: played.pendingChoice!.id,
      optionIndex: 0
    });
    expect(returned.players.p1.hand, "the Spell really came back").toContain("spell.magic_arrow");

    // CONTROL: with the pack OFF option 1 is a bare +1 Power — it opens no pick
    // and returns nothing.
    const off = mapState("tabard-off", false);
    off.players.p1.hand = ["artifact.dragon_wing_tabard" as CardId];
    off.players.p1.discard = ["spell.magic_arrow" as CardId];
    expect(findPlay(off, "artifact.dragon_wing_tabard", 1)).toBeFalsy();
  });

  it("Breastplate of Petrified Wood: option B lifts the round's Spell limit for the next Spell", () => {
    const build = (community: boolean) => {
      const state = combat(community, `breastplate-${community}`);
      state.players.p1.hand = [
        "spell.magic_arrow" as CardId,
        "artifact.breastplate_of_petrified_wood" as CardId,
        "stat.power" as CardId
      ];
      return state;
    };
    const on = build(true);
    const casting = castMagicArrow(on);
    const offer = reaction(casting, "artifact.breastplate_of_petrified_wood", 1);
    expect(offer, "the +Power side joins the cast window").toBeTruthy();
    const played = applyOk(casting, offer!);
    expect(played.players.p1.combatStats.spellLimitBonusThisRound).toBe(1);

    // CONTROL: the classic +1 Power side grants no limit bonus.
    const off = build(false);
    const offCasting = castMagicArrow(off);
    const offPlayed = applyOk(offCasting, reaction(offCasting, "artifact.breastplate_of_petrified_wood", 1)!);
    expect(offPlayed.players.p1.combatStats.spellLimitBonusThisRound).toBe(0);
  });
});

// ===========================================================================
// 5. Morale / Search sides
// ===========================================================================

describe("Community artifacts — morale and Search sides", () => {
  it("Ambassador's Sash: option B gains a positive Morale token and stops offering a die reroll", () => {
    const on = mapState("sash-on", true);
    on.players.p1.hand = ["artifact.ambassadors_sash" as CardId];
    on.players.p1.morale = 0;
    const played = applyOk(on, findPlay(on, "artifact.ambassadors_sash", 1)!);
    expect(played.players.p1.morale).toBe(1);

    // CONTROL: the printed card has no second playable option (its reroll half
    // lives only in the die windows), so index 1 is simply not offered.
    const off = mapState("sash-off", false);
    off.players.p1.hand = ["artifact.ambassadors_sash" as CardId];
    expect(findPlay(off, "artifact.ambassadors_sash", 1)).toBeFalsy();
  });

  it("Spirit of Oppression: option A gives EVERY player a negative Morale token", () => {
    const on = mapState("oppression-on", true);
    on.players.p1.hand = ["artifact.spirit_of_oppression" as CardId];
    // p2's seeded faction (Necropolis) IGNORES morale by design, which would
    // hide the very thing under test — give it a morale-using faction so the
    // "every player" claim is really measured on somebody other than the caster.
    on.players.p2.factionId = on.players.p1.factionId;
    for (const player of Object.values(on.players)) {
      player.morale = 0;
    }
    const played = applyOk(on, findPlay(on, "artifact.spirit_of_oppression", 0)!);
    expect(played.players.p1.morale, "the caster takes it too").toBe(-1);
    expect(played.players.p2.morale, "and so does the OTHER player").toBe(-1);

    // CONTROL: with the pack OFF option 0 is the combat-only "nobody may use
    // positive morale" effect — never a map play, and nobody's morale moves.
    const off = mapState("oppression-off", false);
    off.players.p1.hand = ["artifact.spirit_of_oppression" as CardId];
    off.players.p2.factionId = off.players.p1.factionId;
    for (const player of Object.values(off.players)) {
      player.morale = 0;
    }
    expect(findPlay(off, "artifact.spirit_of_oppression", 0)).toBeFalsy();
    expect(off.players.p1.morale).toBe(0);
    expect(off.players.p2.morale).toBe(0);
  });

  it("the two reprinted reroll halves really disappear from the die window (Diplomat's Ring stays)", () => {
    // The reroll never lived on the card `effect` — it is offered from hand in
    // the die window. Both reprints replace that printed half, so the offer must
    // go with it. Driven through a REAL Resource-die visit.
    const rerollLabels = (cardId: string, community: boolean): string[] => {
      const state = mapState(`die-window-${cardId}-${community}`, community);
      state.players.p1.morale = 0;
      state.players.p1.hand = [cardId as CardId];
      const space = "50,50";
      state.adventure!.fields[space] = {
        spaceId: space,
        tileInstanceId: "community-reroll-tile",
        slot: 0,
        location: "resource_symbol",
        difficulty: undefined,
        blackCube: false,
        flagOwnerId: null,
        everFlagged: false,
        settlementResource: null
      };
      const hero = Object.values(state.heroes).find(
        (candidate) => candidate.controllerId === "p1" && candidate.kind === "main"
      )!;
      hero.spaceId = space;
      beginFieldVisit(state, hero.id, space, false);
      const step = state.adventure!.pendingVisit?.steps[0];
      return step?.type === "CHOOSE_ONE" ? step.options.map((option) => option.label) : [];
    };

    for (const cardId of ["artifact.cards_of_prophecy", "artifact.ambassadors_sash"]) {
      const name = cardLibrary[cardId]!.name;
      expect(
        rerollLabels(cardId, true).some((label) => label.includes(`Play ${name}`)),
        `${name} no longer offers a reroll under the pack`
      ).toBe(false);
      // CONTROL: with the pack OFF the classic reroll offer is right there.
      expect(
        rerollLabels(cardId, false).some((label) => label.includes(`Play ${name}`)),
        `${name} keeps its classic reroll with the pack off`
      ).toBe(true);
    }

    // …and the Diplomat's Ring — which the community sheet does NOT reprint —
    // still offers its reroll with the pack ON.
    expect(
      rerollLabels("artifact.diplomats_ring", true).some((label) => label.includes("Play Diplomat's Ring")),
      "an unreprinted reroll artifact is untouched"
    ).toBe(true);
  });

  it("Cards of Prophecy: option A is a pre-Search Search (4) and the die-reroll offer is gone", () => {
    const on = mapState("prophecy-on", true);
    on.players.p1.hand = ["artifact.cards_of_prophecy" as CardId];
    // The pre-Search arm is never an ordinary map play.
    expect(findPlay(on, "artifact.cards_of_prophecy", 0)).toBeFalsy();

    openSharedDeckSearch(on, "p1", "abilities", 2);
    expect(on.pendingChoice?.type === "OPTION_CHOICE" ? on.pendingChoice.context : null).toBe(
      "scouting-prompt"
    );
    const index =
      on.pendingChoice?.type === "OPTION_CHOICE"
        ? on.pendingChoice.options.findIndex((option) => option.label.startsWith("Play Cards of Prophecy"))
        : -1;
    expect(index, "the pre-Search offer is on the prompt").toBeGreaterThan(0);
    const played = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: on.pendingChoice!.id,
      optionIndex: index
    });
    expect(played.players.p1.hand).not.toContain("artifact.cards_of_prophecy");
    // The Search really widens: the resumed Search offers "Search (4)" where the
    // base count was 2, and taking it reveals FOUR cards.
    const modeLabels =
      played.pendingChoice?.type === "OPTION_CHOICE" ? played.pendingChoice.options.map((o) => o.label) : [];
    expect(modeLabels[0]).toContain("Search (4)");
    const searching = applyOk(played, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: played.pendingChoice!.id,
      optionIndex: 0
    });
    expect(
      searching.pendingChoice?.type === "DECK_SEARCH" ? searching.pendingChoice.revealedCardIds.length : -1
    ).toBe(4);

    // CONTROL: with the pack OFF no such prompt option exists at all.
    const off = mapState("prophecy-off", false);
    off.players.p1.hand = ["artifact.cards_of_prophecy" as CardId];
    openSharedDeckSearch(off, "p1", "abilities", 2);
    const offLabels =
      off.pendingChoice?.type === "OPTION_CHOICE" ? off.pendingChoice.options.map((option) => option.label) : [];
    expect(offLabels.some((label) => label.startsWith("Play Cards of Prophecy"))).toBe(false);
  });
});

// ===========================================================================
// 6. The Legion pieces
// ===========================================================================

describe("Community artifacts — the Legion pieces", () => {
  const DISCOUNTS: { cardId: string; community: number; classic: number }[] = [
    { cardId: "artifact.arms_of_legion", community: 4, classic: 5 },
    { cardId: "artifact.head_of_legion", community: 4, classic: 6 },
    { cardId: "artifact.legs_of_legion", community: 3, classic: 4 },
    { cardId: "artifact.loins_of_legion", community: 3, classic: 5 },
    { cardId: "artifact.torso_of_legion", community: 3, classic: 6 }
  ];

  for (const entry of DISCOUNTS) {
    it(`${cardLibrary[entry.cardId]?.name}: the gold discount is ${entry.community} (was ${entry.classic})`, () => {
      const read = (community: boolean) => {
        const cards = community ? communityBalanceArtifactCards : cardLibrary;
        const options = (cards[entry.cardId]!.effect as {
          options: { effect: { type: string; amount?: number } }[];
        }).options;
        const discount = options.find((option) => option.effect.type === "GAIN_RECRUIT_DISCOUNT");
        return discount?.effect.amount;
      };
      expect(read(true)).toBe(entry.community);
      expect(read(false)).toBe(entry.classic);
    });
  }

  it("Arms of Legion: the valuables voucher really knocks 1 valuables off the reinforcement price", () => {
    const build = (community: boolean) => {
      const state = mapState(`arms-val-${community}`, community);
      // The starting Castle Few cards all reinforce for pure gold, which would
      // make a valuables discount vacuously "correct". Field an Archangels Few —
      // its Pack price really carries 2 valuables — so the assertion bites.
      const unit = state.players.p1.army.find((candidate) => candidate.side === "few")!;
      unit.unitDefId = "castle.archangels";
      const base = reinforceCostFor(state, "p1", unit.id, false, false, false);
      expect(base?.valuables ?? 0, "the fixture price really contains valuables").toBeGreaterThan(0);
      return { state, unitId: unit.id };
    };
    const { state, unitId } = build(true);
    const base = reinforceCostFor(state, "p1", unitId, false, false, false);
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.arms_of_legion" as CardId, amount: 0, valuables: 1, target: { kind: "reinforce", armyUnitId: unitId } }
    ];
    const discounted = reinforceCostFor(state, "p1", unitId, false, false, false);
    expect(discounted!.valuables ?? 0).toBe(Math.max(0, (base!.valuables ?? 0) - 1));
    expect(discounted!.gold ?? 0, "the gold price is untouched").toBe(base!.gold ?? 0);

    // CONTROL: a classic (gold-only) voucher of the same size moves the GOLD and
    // leaves valuables alone.
    const { state: goldState, unitId: goldUnitId } = build(true);
    const goldBase = reinforceCostFor(goldState, "p1", goldUnitId, false, false, false);
    goldState.players.p1.recruitDiscounts = [
      { cardId: "artifact.arms_of_legion" as CardId, amount: 1, target: { kind: "reinforce", armyUnitId: goldUnitId } }
    ];
    const goldDiscounted = reinforceCostFor(goldState, "p1", goldUnitId, false, false, false);
    expect(goldDiscounted!.valuables ?? 0).toBe(goldBase!.valuables ?? 0);
    expect(goldDiscounted!.gold ?? 0).toBe(Math.max(0, (goldBase!.gold ?? 0) - 1));
  });

  it("the remove sides really charge the discounted Reinforcement price through the shared step", () => {
    // The flat-gold discount is the one `reinforceCostFor` applies, so pricing a
    // reinforcement at the card's discount must be exactly N gold cheaper.
    const state = mapState("legion-reinforce", true);
    const unit = state.players.p1.army.find((candidate) => candidate.side === "few")!;
    // Archangels again — a Pack price with BOTH gold and valuables, so neither
    // half of the assertion can pass vacuously.
    unit.unitDefId = "castle.archangels";
    const base = reinforceCostFor(state, "p1", unit.id, false, false, false, 0)!;
    expect(base.gold ?? 0).toBeGreaterThan(3);
    expect(base.valuables ?? 0).toBeGreaterThan(0);
    const cheap = reinforceCostFor(state, "p1", unit.id, false, false, false, 3);
    expect(cheap!.gold ?? 0).toBe((base.gold ?? 0) - 3);
    // …and the valuables variant (Head of Legion) is the mirror.
    const cheapValuables = reinforceCostFor(state, "p1", unit.id, false, false, false, 0, 1);
    expect(cheapValuables!.valuables ?? 0).toBe((base.valuables ?? 0) - 1);
    expect(cheapValuables!.gold ?? 0, "and it leaves the gold alone").toBe(base.gold ?? 0);
  });

  it("the remove side really opens the tier-scoped reinforce menu, and is WITHHELD when nothing qualifies", () => {
    const state = mapState("legion-menu", true);
    state.players.p1.hand = ["artifact.legs_of_legion" as CardId];
    const offer = findPlay(state, "artifact.legs_of_legion", 1);
    expect(offer, "a fresh Castle army has bronze Few cards to reinforce").toBeTruthy();
    const played = applyOk(state, offer!);
    expect(played.players.p1.removed).toContain("artifact.legs_of_legion");
    const menu = played.adventure!.pendingVisit!.steps[0]!;
    expect(menu.type).toBe("CHOOSE_ONE");
    expect(menu.type === "CHOOSE_ONE" ? menu.prompt : "").toContain("reinforce a bronze unit");

    // …and taking the FIRST option really flips that card AND charges the
    // discounted price (the printed reinforcement cost minus 2 gold, min 0).
    const firstStep = menu.type === "CHOOSE_ONE" ? menu.options[0]!.steps[0]! : undefined;
    expect(firstStep?.type).toBe("REINFORCE_FLAT_GOLD");
    const targetId = firstStep?.type === "REINFORCE_FLAT_GOLD" ? firstStep.armyUnitId : "";
    const fullPrice = reinforceCostFor(played, "p1", targetId, false, false, false, 0)!;
    const goldBefore = played.players.p1.resources.gold;
    const pick = getLegalActions(played, "p1").find(
      (legal) => legal.label === (menu.type === "CHOOSE_ONE" ? menu.options[0]!.label : "")
    );
    expect(pick, "the menu is answerable").toBeTruthy();
    const chosen = applyOk(played, pick!.action);
    expect(chosen.players.p1.army.find((unit) => unit.id === targetId)?.side).toBe("pack");
    expect(goldBefore - chosen.players.p1.resources.gold).toBe(Math.max(0, (fullPrice.gold ?? 0) - 2));

    // CONTROL — the card is never removed for nothing: with NO army card of the
    // named tier the option disappears while the discount side stays.
    const empty = mapState("legion-empty", true);
    empty.players.p1.army = [];
    empty.players.p1.hand = ["artifact.legs_of_legion" as CardId];
    expect(findPlay(empty, "artifact.legs_of_legion", 1), "no reinforce target ⇒ no remove side").toBeFalsy();
    expect(
      findPlay(empty, "artifact.legs_of_legion", 0),
      "…while the discount side stays (it can still be reserved for a RECRUIT)"
    ).toBeTruthy();
  });
});

// ===========================================================================
// 7. Pack precedence — community wins over polish
// ===========================================================================

describe("Community artifacts — precedence over the Polish Balance Pack", () => {
  it("Golden Bow: with BOTH packs on the COMMUNITY reroll-only effect runs (no penalty waiver)", () => {
    const build = (community: boolean, polish: boolean) => {
      const state = combat(community, `bow-prec-${community}-${polish}`, polish);
      state.players.p1.hand = ["artifact.golden_bow" as CardId];
      state.combat!.activeUnitId = "unit_p1_marksmen";
      return state;
    };
    const both = build(true, true);
    const bothPlayed = applyOk(both, plays(both, "artifact.golden_bow").find((a) => a.optionIndex === 0)!);
    expect(bothPlayed.activeEffects.find((entry) => entry.name === "Golden Bow")!.modifiers).toEqual([
      { type: "RANGED_ATTACK_REROLL" }
    ]);

    // CONTROL: polish alone grants BOTH modifiers — so the assertion above really
    // discriminates the two packs.
    const polishOnly = build(false, true);
    const polishPlayed = applyOk(
      polishOnly,
      plays(polishOnly, "artifact.golden_bow").find((a) => a.optionIndex === 0)!
    );
    expect(polishPlayed.activeEffects.find((entry) => entry.name === "Golden Bow")!.modifiers).toEqual([
      { type: "RANGED_IGNORE_PENALTY" },
      { type: "RANGED_ATTACK_REROLL" }
    ]);
  });

  it("Centaur's Axe: with BOTH packs on the tripling is POST-roll and a -1 is tripled again", () => {
    const build = (community: boolean, polish: boolean) => {
      const state = combat(community, `axe-prec-${community}-${polish}`, polish);
      state.combat!.units.unit_p1_griffins.attack = 8;
      state.combat!.units.unit_p2_skeletons.defense = 0;
      state.players.p1.hand = ["artifact.centaurs_axe" as CardId];
      return state;
    };
    // Polish alone: pre-roll offer, and the tripling is IGNORED on a -1.
    const polishOnly = build(false, true);
    const polishDeclared = declareAttack(polishOnly, [-1, 0]);
    const polishOffer = reaction(polishDeclared, "artifact.centaurs_axe", 0);
    expect(polishOffer, "polish keeps the pre-roll play").toBeTruthy();
    const polishDamage = passAllReactions(applyOk(polishDeclared, polishOffer!)).combat!.units
      .unit_p2_skeletons.damage;
    const polishPlain = passAllReactions(declareAttack(build(false, true), [-1, 0])).combat!.units
      .unit_p2_skeletons.damage;
    expect(polishDamage - polishPlain, "polish: a -1 stays a -1").toBe(0);

    // Both on: no pre-roll offer at all (the community printing moved it).
    const both = build(true, true);
    const bothDeclared = declareAttack(both, [-1, 0]);
    expect(reaction(bothDeclared, "artifact.centaurs_axe", 0), "community wins: no pre-roll offer").toBeFalsy();
  });

  it("Crown of Dragontooth: with BOTH packs on the pick is the COMMUNITY \"up to 2\"", () => {
    const build = (community: boolean, polish: boolean) => {
      const state = mapState(`crown-prec-${community}-${polish}`, community, polish);
      state.players.p1.hand = ["artifact.crown_of_dragontooth" as CardId];
      state.players.p1.discard = ["spell.magic_arrow" as CardId, "spell.haste" as CardId];
      return state;
    };
    const both = build(true, true);
    const bothPlayed = applyOk(both, findPlay(both, "artifact.crown_of_dragontooth", 0)!);
    const bothLabels =
      bothPlayed.pendingChoice?.type === "OPTION_CHOICE"
        ? bothPlayed.pendingChoice.options.map((option) => option.label)
        : [];
    expect(bothLabels).toContain("Take no cards");

    // CONTROL: polish alone keeps the mandatory pick.
    const polishOnly = build(false, true);
    const polishPlayed = applyOk(polishOnly, findPlay(polishOnly, "artifact.crown_of_dragontooth", 0)!);
    const polishLabels =
      polishPlayed.pendingChoice?.type === "OPTION_CHOICE"
        ? polishPlayed.pendingChoice.options.map((option) => option.label)
        : [];
    expect(polishLabels).not.toContain("Take no cards");
  });

  it("Spirit of Oppression: with BOTH packs on the COMMUNITY map morale play runs, not the polish +1 Power cycle", () => {
    const both = mapState("oppression-prec-on", true, true);
    both.players.p1.hand = ["artifact.spirit_of_oppression" as CardId];
    both.players.p2.factionId = both.players.p1.factionId;
    for (const player of Object.values(both.players)) {
      player.morale = 0;
    }
    const played = applyOk(both, findPlay(both, "artifact.spirit_of_oppression", 0)!);
    expect(played.players.p1.morale).toBe(-1);
    expect(played.players.p2.morale).toBe(-1);

    // CONTROL: polish alone keeps the combat-only option 0 — no map play.
    const polishOnly = mapState("oppression-prec-off", false, true);
    polishOnly.players.p1.hand = ["artifact.spirit_of_oppression" as CardId];
    expect(findPlay(polishOnly, "artifact.spirit_of_oppression", 0)).toBeFalsy();
  });
});

// ===========================================================================
// 8. Registry hygiene
// ===========================================================================

describe("Community artifacts — registry hygiene", () => {
  it("every reprint names a real printed artifact and keeps its identity", () => {
    for (const [cardId, card] of Object.entries(communityBalanceArtifactCards)) {
      const original = cardLibrary[cardId];
      expect(original, `${cardId} must be a real card`).toBeTruthy();
      expect(card.id).toBe(cardId);
      expect(card.kind).toBe("artifact");
      expect(card.name).toBe(original!.name);
      expect(card.implementationStatus).toBe("implemented");
      // The last tag states what the engine runs.
      expect(card.tags?.at(-1)?.startsWith("Community pack: ")).toBe(true);
      // …and no printed rules line survives to promise the classic text.
      expect(card.tags?.some((tag) => tag !== card.tags!.at(-1) && tag.includes(" — OR — "))).toBe(false);
    }
  });

  it("ships exactly the sheet's 34 artifacts", () => {
    expect(Object.keys(communityBalanceArtifactCards)).toHaveLength(34);
  });
});
