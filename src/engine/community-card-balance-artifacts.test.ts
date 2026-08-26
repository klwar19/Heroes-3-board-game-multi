/**
 * Community Balance Change (`community-card-balance`) — the 35 reprinted
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
import { beginFieldVisit, startAdventureRound, reinforceCostFor, getMainHero } from "./adventure";
import { openSharedDeckSearch } from "./adventure-reducer";
import { effectiveArtifactTier } from "./ruleset";
import { balancedPlayOptionCost, costNeedsCardPicker } from "./card-play-cost";
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
    houseRules: { "community-card-balance": community, "polish-card-balance": polish },
    fields: {}
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
    it(`${cardLibrary[entry.cardId]?.name}: option A is a ONE-TURN ongoing — pays ${entry.amount} at that turn's end, then the card is DISCARDED`, () => {
      const on = mapState(`turn-end-${entry.cardId}`, true);
      on.players.p1.hand = [entry.cardId as CardId];
      const before = on.players.p1.resources[entry.resource];
      const played = applyOk(on, findPlay(on, entry.cardId, 0)!);

      // Playing it pays NOTHING yet — the classic printing paid immediately.
      expect(played.players.p1.resources[entry.resource]).toBe(before);
      // …and the card is parked in the Ongoing tray, NOT in a permanent slot.
      expect(played.players.p1.ongoingCards?.some((held) => held.cardId === entry.cardId)).toBe(true);
      expect(played.players.p1.permanents ?? []).not.toContain(entry.cardId);
      expect(played.players.p1.discard).not.toContain(entry.cardId);

      // Ending the turn pays once…
      const firstEnd = applyOk(played, { type: "END_TURN", playerId: "p1" });
      expect(firstEnd.players.p1.resources[entry.resource]).toBe(before + entry.amount);
      // …and the card leaves the tray for the owner's DISCARD pile — not the
      // hand, not removed from the game (the 2026-08-23 report: "is an ongoing
      // that is never discarded but it should be discarded after receiving").
      expect(firstEnd.players.p1.ongoingCards?.some((held) => held.cardId === entry.cardId) ?? false).toBe(false);
      expect(firstEnd.players.p1.discard).toContain(entry.cardId);
      expect(firstEnd.players.p1.hand).not.toContain(entry.cardId);
      expect(firstEnd.activeEffects.some((effect) => effect.source.type === "card" && effect.source.cardId === entry.cardId)).toBe(
        false
      );

      // …and it NEVER pays again on a later turn of the same player.
      const backToP1 = { ...firstEnd, activePlayerId: "p1" } as GameState;
      backToP1.players.p1.canMulligan = false;
      backToP1.players.p1.needsHandRefresh = false;
      const secondEnd = applyOk(backToP1, { type: "END_TURN", playerId: "p1" });
      expect(secondEnd.players.p1.resources[entry.resource]).toBe(before + entry.amount);

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

  // The REPORTED bug (2026-08-22, "the ring still gives 2 minerals when crack
  // open"): the from-hand remove side above was already balanced, but CRACKING
  // an income permanent open while it sits in the permanent slot
  // (CRACK_PERMANENT) read the PRINTED library — so both the offer LABEL and
  // the resources actually paid were the printed numbers.
  // Sibling sweep (CLAUDE.md #1a.3): every income permanent whose crack-open
  // side the pack moves. The Cart of Ore's remove side is UNCHANGED at 3, so it
  // rides along as the "did not drift" sibling.
  const CRACK_IN_PLAY = [
    { cardId: "artifact.eversmoking_ring_of_sulfur", resource: "valuables", community: 1, classic: 2, unit: "valuables" },
    { cardId: "artifact.endless_sack_of_gold", resource: "gold", community: 5, classic: 8, unit: "gold" },
    {
      cardId: "artifact.inexhaustible_cart_of_ore",
      resource: "buildingMaterials",
      community: 3,
      classic: 3,
      unit: "building materials"
    }
  ] as const;

  for (const entry of CRACK_IN_PLAY) {
    it(`${cardLibrary[entry.cardId]?.name}: cracking it open IN PLAY pays ${entry.community} (was ${entry.classic})`, () => {
      const crack = (community: boolean) => {
        const state = mapState(`crack-${entry.cardId}-${community}`, community);
        state.players.p1.permanents = [entry.cardId as CardId];
        const before = state.players.p1.resources[entry.resource];
        const offer = getLegalActions(state, "p1").find(
          (legal) => legal.action.type === "CRACK_PERMANENT" && legal.action.cardId === entry.cardId
        );
        expect(offer, "an in-play income permanent offers a crack-open action").toBeTruthy();
        const played = applyOk(state, offer!.action);
        return {
          delta: played.players.p1.resources[entry.resource] - before,
          label: offer!.label,
          removed: played.players.p1.removed.includes(entry.cardId)
        };
      };

      const on = crack(true);
      expect(on.delta).toBe(entry.community);
      expect(on.label).toContain(`${entry.community} ${entry.unit}`);
      expect(on.removed).toBe(true);

      // CONTROL — pack OFF keeps the printed number at both seams.
      const off = crack(false);
      expect(off.delta).toBe(entry.classic);
      expect(off.label).toContain(`${entry.classic} ${entry.unit}`);
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

  it("Celestial Necklace of Bliss: the discards give +X ATTACK on the same blow (USER RULING 2026-08-23)", () => {
    const state = statFixture(true, false, "celestial");
    const base = plainAttackDamage(statFixture(true, false, "celestial-base"));
    const played = attackWithCard(state, "artifact.celestial_necklace_of_bliss", 0, [0, 0], [
      "ability.estates" as CardId,
      "ability.estates" as CardId
    ]);
    // The flat +1 AND +1 per discarded card ride the SAME attack: 2 discards
    // means +3 damage, not +1. (The superseded reading gave +1 here and put +2
    // Defense on the holder's own unit — this assertion fails under it.)
    expect(played.combat!.units.unit_p2_skeletons.damage).toBe(base + 3);
    // …and NO self-Defense buff is created any more.
    expect(
      played.activeEffects.some((effect) => effect.name === "Celestial Necklace of Bliss"),
      "the deleted self-Defense arm must not fire"
    ).toBe(false);

    // CONTROL: the classic card has no flat base — with 2 discards the blow is
    // +2 attack, not +3, and it lays no effect either.
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

  it("the revised +Power artifacts pay their Community values, with printed-value controls", () => {
    expect(powerPaidIntoCast("artifact.tunic_of_the_cyclops_king", 1, true)).toBe(3);
    expect(powerPaidIntoCast("artifact.tunic_of_the_cyclops_king", 1, false)).toBe(2);
    expect(powerPaidIntoCast("artifact.scales_of_the_greater_basilisk", 0, true)).toBe(2);
    expect(powerPaidIntoCast("artifact.scales_of_the_greater_basilisk", 0, false)).toBe(3);
    expect(powerPaidIntoCast("artifact.royal_armor_of_nix", 0, true)).toBe(3);
    expect(powerPaidIntoCast("artifact.royal_armor_of_nix", 0, false)).toBe(2);
  });

  it("Royal Armor of Nix keeps its Sea-only Search (2) side under the Community rule", () => {
    const cardId = "artifact.royal_armor_of_nix";
    const offSea = mapState("royal-armor-community-off-sea", true);
    offSea.players.p1.hand = [cardId as CardId];
    expect(findPlay(offSea, cardId, 1)).toBeFalsy();

    const onSea = mapState("royal-armor-community-on-sea", true);
    onSea.players.p1.hand = [cardId as CardId];
    onSea.decks.spells.discardPile = [];
    const hero = getMainHero(onSea, "p1");
    expect(hero?.spaceId).toBeTruthy();
    onSea.adventure!.fields[hero!.spaceId!].terrain = "water";

    const search = findPlay(onSea, cardId, 1);
    expect(search).toBeTruthy();
    const searching = applyOk(onSea, search!);
    expect(searching.pendingChoice?.type).toBe("DECK_SEARCH");
    if (searching.pendingChoice?.type === "DECK_SEARCH") {
      expect(searching.pendingChoice.deckId).toBe("spells");
      expect(searching.pendingChoice.revealedCardIds).toHaveLength(2);
    }
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
    // The paralysed unit is deliberately NOT the one holding the open activation
    // slot (`combat()` gives that to unit_p1_griffins): a Paralysis token sitting
    // on an untouched OPEN activation is consumed by the printed skip rule at the
    // action tail (enforceParalysisOnOpenActivation, reducer.ts), which would eat
    // the token this test is about before either printing could be compared.
    const PARALYSED = "unit_p1_crusaders" as const;
    const build = (community: boolean) => {
      const state = combat(community, `pendant-${community}`);
      state.players.p1.hand = ["artifact.pendant_of_second_sight" as CardId];
      state.combat!.units[PARALYSED].tokens = [
        ...(state.combat!.units[PARALYSED].tokens ?? []),
        { id: "tok-paralysis", kind: "paralysis", amount: 0, sourceName: "test" }
      ];
      return state;
    };
    const on = build(true);
    const offer = plays(on, "artifact.pendant_of_second_sight").find(
      (action) =>
        action.optionIndex === 0 && action.target?.type === "unit" && action.target.unitId === PARALYSED
    );
    expect(offer, "option A is offered on your paralysed unit").toBeTruthy();
    const played = applyOk(on, offer!);
    expect(
      (played.combat!.units[PARALYSED].tokens ?? []).some((token) => token.kind === "paralysis"),
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
        action.optionIndex === 0 && action.target?.type === "unit" && action.target.unitId === PARALYSED
    );
    const offPlayed = applyOk(off, offOffer!);
    expect(
      (offPlayed.combat!.units[PARALYSED].tokens ?? []).some((token) => token.kind === "paralysis")
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
      // NARROWED 2026-08-23: the Cards keep a hand offer in this same window —
      // their reprinted "Set a die on the side of your choice" half (see the
      // die-set test below). What must be gone is the REROLL.
      expect(
        rerollLabels(cardId, true).some((label) => label.includes(`Play ${name}`) && label.includes("reroll")),
        `${name} no longer offers a reroll under the pack`
      ).toBe(false);
      // CONTROL: with the pack OFF the classic reroll offer is right there.
      expect(
        rerollLabels(cardId, false).some((label) => label.includes(`Play ${name}`) && label.includes("reroll")),
        `${name} keeps its classic reroll with the pack off`
      ).toBe(true);
    }
    // …and the Sash, whose reprint is a morale gain, offers NOTHING in this
    // window at all under the pack.
    expect(
      rerollLabels("artifact.ambassadors_sash", true).some((label) => label.includes("Play Ambassador's Sash"))
    ).toBe(false);

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

  it("ships the sheet's 34 artifacts plus the Royal Armor follow-up", () => {
    expect(Object.keys(communityBalanceArtifactCards)).toHaveLength(35);
  });
});

// ===========================================================================
// 9. The 2026-08-23 playtest bug batch
// ===========================================================================

/**
 * Five sheet-feedback reports, each pinned by the OBSERVABLE outcome with a
 * pack-OFF (or printed-cost) CONTROL on the same setup.
 *
 * The three "you can't discard a card and resolve" / "doesn't work at all" /
 * "nothing happens" reports share ONE root cause and are pinned together below:
 * the surface that opens the discard picker read the RAW printed library, so it
 * asked for the printed number of cards (or, when the printed side is free, for
 * none at all) while the reducer charges the REPRINT's price. `costCardIds` then
 * never matched and every such play was rejected.
 */
describe("Community artifacts — the 2026-08-23 playtest reports", () => {
  /** Every reprinted side whose price DIFFERS from the printed side's. */
  const COSTED_REPRINTS: {
    cardId: string;
    optionIndex: number;
    /** Cards the REPRINT demands. */
    reprintDiscards: number;
    /** Cards the PRINTED side demands (undefined = the printed side is free). */
    printedDiscards: number | undefined;
  }[] = [
    // "You can't discard a card and resolve."
    { cardId: "artifact.endless_purse_of_gold", optionIndex: 0, reprintDiscards: 1, printedDiscards: undefined },
    // "Doesn't work at all." — both sides.
    { cardId: "artifact.everflowing_crystal_cloak", optionIndex: 0, reprintDiscards: 1, printedDiscards: 3 },
    { cardId: "artifact.everflowing_crystal_cloak", optionIndex: 1, reprintDiscards: 2, printedDiscards: undefined },
    // "Nothing happens."
    { cardId: "artifact.loins_of_legion", optionIndex: 1, reprintDiscards: 1, printedDiscards: undefined }
  ];

  for (const entry of COSTED_REPRINTS) {
    const name = cardLibrary[entry.cardId]!.name;
    it(`${name} side ${entry.optionIndex}: the price the picker asks for is the REPRINT's, so the play resolves`, () => {
      const build = () => {
        const state = mapState(`cost-read-${entry.cardId}-${entry.optionIndex}`, true);
        state.players.p1.hand = [
          entry.cardId as CardId,
          "ability.estates" as CardId,
          "ability.estates" as CardId,
          "ability.estates" as CardId
        ];
        state.players.p1.resources.gold = 40;
        return state;
      };

      // The shared client-facing read returns the REPRINT's price…
      const state = build();
      const offer = findPlay(state, entry.cardId, entry.optionIndex);
      expect(offer, "the reprinted side is offered on the map").toBeTruthy();
      const cost = balancedPlayOptionCost(state, offer!);
      expect(costNeedsCardPicker(cost)).toBe(true);
      expect(cost!.discardCards).toBe(entry.reprintDiscards);

      // …paying exactly that many cards really resolves the play.
      const paid = applyOk(state, {
        ...offer!,
        costCardIds: Array.from({ length: entry.reprintDiscards }, () => "ability.estates" as CardId)
      });
      expect(paid.players.p1.hand).not.toContain(entry.cardId);

      // …and the PRINTED price would have been REJECTED — the discriminator that
      // makes this test fail if the read goes back to the raw `cardLibrary`.
      const printedState = build();
      const printedOffer = findPlay(printedState, entry.cardId, entry.optionIndex)!;
      const printedPicks = Array.from(
        { length: entry.printedDiscards ?? 0 },
        () => "ability.estates" as CardId
      );
      const rejected = applyAction(printedState, { ...printedOffer, costCardIds: printedPicks });
      expect(rejected.errors.length, "the printed count is not a legal payment").toBeGreaterThan(0);
    });
  }

  it("Endless Purse of Gold / Everflowing Crystal Cloak: the discarded card really buys the resource", () => {
    const measure = (cardId: string, optionIndex: number, discards: number, community: boolean) => {
      const state = mapState(`payout-${cardId}-${optionIndex}-${community}`, community);
      state.players.p1.hand = [
        cardId as CardId,
        "ability.estates" as CardId,
        "ability.estates" as CardId,
        "ability.estates" as CardId
      ];
      const offer = findPlay(state, cardId, optionIndex)!;
      const before = {
        gold: state.players.p1.resources.gold,
        valuables: state.players.p1.resources.valuables,
        hand: state.players.p1.hand.length
      };
      const after = applyOk(state, {
        ...offer,
        costCardIds: Array.from({ length: discards }, () => "ability.estates" as CardId)
      });
      return {
        gold: after.players.p1.resources.gold - before.gold,
        valuables: after.players.p1.resources.valuables - before.valuables,
        handSpent: before.hand - after.players.p1.hand.length
      };
    };

    // Purse A: discard 1 → 3 gold (the card itself plus the paid card leave hand).
    expect(measure("artifact.endless_purse_of_gold", 0, 1, true)).toEqual({
      gold: 3,
      valuables: 0,
      handSpent: 2
    });
    // Cloak A: discard 1 → 1 valuables. Cloak B: remove self + discard 2 → 2.
    expect(measure("artifact.everflowing_crystal_cloak", 0, 1, true)).toEqual({
      gold: 0,
      valuables: 1,
      handSpent: 2
    });
    expect(measure("artifact.everflowing_crystal_cloak", 1, 2, true)).toEqual({
      gold: 0,
      valuables: 2,
      handSpent: 3
    });

    // CONTROL: with the pack OFF the SAME sides are the printed ones — Purse A
    // is a FREE 3 gold and Cloak A costs THREE cards for 2 valuables.
    expect(measure("artifact.endless_purse_of_gold", 0, 0, false)).toEqual({
      gold: 3,
      valuables: 0,
      handSpent: 1
    });
    expect(measure("artifact.everflowing_crystal_cloak", 0, 3, false)).toEqual({
      gold: 0,
      valuables: 2,
      handSpent: 4
    });
  });

  it("Loins of Legion side B: the discard is paid, the card is removed and the bronze Few really flips", () => {
    const state = mapState("loins-remove", true);
    state.players.p1.hand = ["artifact.loins_of_legion" as CardId, "ability.estates" as CardId];
    state.players.p1.resources.gold = 40;
    const offer = findPlay(state, "artifact.loins_of_legion", 1)!;
    const played = applyOk(state, { ...offer, costCardIds: ["ability.estates" as CardId] });
    expect(played.players.p1.removed).toContain("artifact.loins_of_legion");
    expect(played.players.p1.discard).toContain("ability.estates");

    const menu = played.adventure!.pendingVisit!.steps[0]!;
    expect(menu.type).toBe("CHOOSE_ONE");
    const firstStep = menu.type === "CHOOSE_ONE" ? menu.options[0]!.steps[0]! : undefined;
    expect(firstStep?.type).toBe("REINFORCE_FLAT_GOLD");
    const targetId = firstStep?.type === "REINFORCE_FLAT_GOLD" ? firstStep.armyUnitId : "";
    const fullPrice = reinforceCostFor(played, "p1", targetId, false, false, false, 0)!;
    const goldBefore = played.players.p1.resources.gold;
    const pick = getLegalActions(played, "p1").find(
      (legal) => legal.label === (menu.type === "CHOOSE_ONE" ? menu.options[0]!.label : "")
    )!;
    const chosen = applyOk(played, pick.action);
    // The observable outcome: the card flipped Few → Pack for 3 gold less.
    expect(chosen.players.p1.army.find((unit) => unit.id === targetId)?.side).toBe("pack");
    expect(goldBefore - chosen.players.p1.resources.gold).toBe(Math.max(0, (fullPrice.gold ?? 0) - 3));

    // CONTROL: with the pack OFF option 1 is the printed free "Gain 2 gold" —
    // no removal, no discard, no reinforce menu.
    const off = mapState("loins-remove-off", false);
    off.players.p1.hand = ["artifact.loins_of_legion" as CardId, "ability.estates" as CardId];
    const offBefore = off.players.p1.resources.gold;
    const offPlayed = applyOk(off, findPlay(off, "artifact.loins_of_legion", 1)!);
    expect(offPlayed.players.p1.resources.gold).toBe(offBefore + 2);
    expect(offPlayed.players.p1.removed ?? []).not.toContain("artifact.loins_of_legion");
    expect(offPlayed.adventure!.pendingVisit).toBeFalsy();
  });

  it("Cards of Prophecy side B is playable FROM HAND inside the Resource-die window", () => {
    const dieWindow = (community: boolean, holdsCard: boolean) => {
      const state = mapState(`prophecy-die-${community}-${holdsCard}`, community);
      state.players.p1.morale = 0;
      state.players.p1.hand = holdsCard ? ["artifact.cards_of_prophecy" as CardId] : [];
      const space = "51,51";
      state.adventure!.fields[space] = {
        spaceId: space,
        tileInstanceId: "prophecy-die-tile",
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
      return state;
    };

    const on = dieWindow(true, true);
    const step = on.adventure!.pendingVisit?.steps[0];
    const labels = step?.type === "CHOOSE_ONE" ? step.options.map((option) => option.label) : [];
    const setLabels = labels.filter((label) => label.startsWith("Play Cards of Prophecy: set the Resource die"));
    expect(setLabels.length, "one option per distinct Resource-die face").toBeGreaterThan(1);

    // Taking the 6-gold face really pays 6 gold and spends the card, whatever
    // the die actually rolled.
    const sixGold = labels.indexOf("Play Cards of Prophecy: set the Resource die to 6 gold");
    expect(sixGold, "the die's best face is on the menu").toBeGreaterThanOrEqual(0);
    const goldBefore = on.players.p1.resources.gold;
    const pick = getLegalActions(on, "p1").find((legal) => legal.label === labels[sixGold]);
    expect(pick, "the offer is dispatchable").toBeTruthy();
    const chosen = applyOk(on, pick!.action);
    expect(chosen.players.p1.resources.gold - goldBefore).toBe(6);
    // …and it is a single use: the card leaves hand for the discard pile.
    expect(chosen.players.p1.hand).not.toContain("artifact.cards_of_prophecy");
    expect(chosen.players.p1.discard).toContain("artifact.cards_of_prophecy");

    // CONTROL 1: with the pack OFF the Cards are a die REROLL, never a die SET.
    const off = dieWindow(false, true);
    const offStep = off.adventure!.pendingVisit?.steps[0];
    const offLabels = offStep?.type === "CHOOSE_ONE" ? offStep.options.map((option) => option.label) : [];
    expect(offLabels.some((label) => label.startsWith("Play Cards of Prophecy: set"))).toBe(false);
    expect(offLabels.some((label) => label.includes("Play Cards of Prophecy") && label.includes("reroll"))).toBe(
      true
    );

    // CONTROL 2: pack ON but the card NOT in hand — no set option is offered, so
    // the offer can never be a phantom the player has nothing to pay it with.
    const noCard = dieWindow(true, false);
    const noCardStep = noCard.adventure!.pendingVisit?.steps[0];
    const noCardLabels =
      noCardStep?.type === "CHOOSE_ONE" ? noCardStep.options.map((option) => option.label) : [];
    expect(noCardLabels.some((label) => label.startsWith("Play Cards of Prophecy"))).toBe(false);
  });

  it("Celestial Necklace of Bliss: the whole +1+X rides the ATTACK and shields NOTHING", () => {
    // The sheet's "Gives defense instead of Attack" is answered by the USER
    // RULING 2026-08-23: the flat +1 AND the per-discard +X are both ATTACK on
    // this blow, and the Retaliation Attack that follows is untouched (the
    // superseded reading shielded it by 2 — this test fails under it both ways).
    const measure = (community: boolean, play: boolean) => {
      const state = combat(community, `celestial-retal-${community}-${play}`);
      state.combat!.units.unit_p1_griffins.attack = 6;
      state.combat!.units.unit_p1_griffins.defense = 0;
      state.combat!.units.unit_p2_skeletons.defense = 0;
      state.combat!.units.unit_p2_skeletons.attack = 8;
      state.players.p1.hand = play
        ? [
            "artifact.celestial_necklace_of_bliss" as CardId,
            "ability.estates" as CardId,
            "ability.estates" as CardId
          ]
        : [];
      const declared = declareAttack(state, [0, 0, 0, 0]);
      let current = declared;
      if (play) {
        const offer = reaction(declared, "artifact.celestial_necklace_of_bliss", 0);
        expect(offer, "the reprinted side is offered in the attack window").toBeTruthy();
        current = applyOk(
          declared,
          withCost(offer!, "ability.estates" as CardId, "ability.estates" as CardId)
        );
      }
      current = passAllReactions(current);
      return {
        dealt: current.combat!.units.unit_p2_skeletons.damage,
        taken: current.combat!.units.unit_p1_griffins.damage
      };
    };

    const onBase = measure(true, false);
    const onPlayed = measure(true, true);
    expect(onPlayed.dealt - onBase.dealt, "flat +1 plus +1 per discarded card, all ATTACK").toBe(3);
    expect(onBase.taken - onPlayed.taken, "the Retaliation Attack is NOT shielded any more").toBe(0);

    // CONTROL: the classic card scales ATTACK per discard (+2 for 2 cards, no
    // flat base) and shields nothing either.
    const offBase = measure(false, false);
    const offPlayed = measure(false, true);
    expect(offPlayed.dealt - offBase.dealt).toBe(2);
    expect(offBase.taken - offPlayed.taken).toBe(0);
  });
});
