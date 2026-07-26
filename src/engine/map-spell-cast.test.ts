import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { bestMapSpellTier, isMapPowerTierSpell, mapSpellPowerTiers } from "./map-spell-cast";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getPlayerView,
  spellPowerSourceDrawCards,
  spellPowerValueOfCard,
  type GameAction,
  type GameState
} from "./index";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function mapHand(cards: string[]): GameState {
  let state = createAdventureGameState({ seed: "map-cast-then-boost", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.hand = [...cards];
  return state;
}

describe("mapSpellPowerTiers — which map spells use cast-then-boost", () => {
  it("recognises the six Power-tier map spells", () => {
    for (const id of [
      "spell.view_air",
      "spell.view_earth",
      "spell.fly",
      "spell.dimension_door",
      "spell.water_walk",
      "spell.town_portal"
    ]) {
      expect(isMapPowerTierSpell(cardLibrary[id]), id).toBe(true);
      const tiers = mapSpellPowerTiers(cardLibrary[id])!;
      expect(tiers.tiers[0]!.minPower).toBe(0);
      expect(tiers.maxPower).toBeGreaterThan(0);
    }
  });

  it("CONTROL: Visions is NOT a CHOOSE_ONE power-tier spell (its own boost path)", () => {
    expect(isMapPowerTierSpell(cardLibrary["spell.visions"])).toBe(false);
  });

  it("CONTROL: combat Sorrow (powerCost CHOOSE_ONE) is not a map power-tier spell", () => {
    expect(isMapPowerTierSpell(cardLibrary["spell.sorrow"])).toBe(false);
  });

  it("bestMapSpellTier picks the highest reachable tier (Dimension Door 0/2/4)", () => {
    const tiers = mapSpellPowerTiers(cardLibrary["spell.dimension_door"])!;
    expect(bestMapSpellTier(tiers, 0).minPower).toBe(0);
    expect(bestMapSpellTier(tiers, 1).minPower).toBe(0);
    expect(bestMapSpellTier(tiers, 2).minPower).toBe(2);
    expect(bestMapSpellTier(tiers, 3).minPower).toBe(2);
    expect(bestMapSpellTier(tiers, 4).minPower).toBe(4);
    expect(bestMapSpellTier(tiers, 99).minPower).toBe(4);
  });
});

describe("Map cast-then-boost — one cast, then add Power", () => {
  it("offers a single Cast action with no optionIndex / costCardIds", () => {
    const state = mapHand(["spell.view_air", "spell.haste", "spell.slow"]);
    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.view_air"
    );
    expect(plays).toHaveLength(1);
    const action = plays[0]!.action;
    expect(action.type).toBe("PLAY_CARD");
    if (action.type === "PLAY_CARD") {
      expect(action.optionIndex).toBeUndefined();
      expect(action.costCardIds).toBeUndefined();
    }
  });

  it("casting opens map-spell-boost; resolve-now keeps Power sources; discard then resolve raises the tier", () => {
    let state = mapHand(["spell.view_air", "spell.haste"]);
    const goldBefore = state.players.p1.resources.gold;
    const materialsBefore = state.players.p1.resources.buildingMaterials;

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    expect(state.players.p1.discard).toContain("spell.view_air");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("map-spell-boost");

    // Discard Haste (+1) → Power 1 → materials (auto-resolves, no sources left).
    const choice = state.pendingChoice!;
    const hasteIndex =
      choice.type === "OPTION_CHOICE" && choice.mapSpellBoost
        ? choice.mapSpellBoost.offers.findIndex(
            (offer) => offer.kind === "card" && offer.cardId === "spell.haste"
          )
        : -1;
    expect(hasteIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: hasteIndex
    });
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
    expect(state.players.p1.resources.gold).toBe(goldBefore); // not the free tier
  });

  it("CONTROL: resolve-now at Power 0 never spends held Spells", () => {
    let state = mapHand(["spell.view_air", "spell.haste", "spell.slow"]);
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    const choice = state.pendingChoice!;
    expect(choice.type === "OPTION_CHOICE" && choice.context).toBe("map-spell-boost");
    const resolveIndex =
      choice.type === "OPTION_CHOICE" && choice.mapSpellBoost
        ? choice.mapSpellBoost.offers.length
        : choice.type === "OPTION_CHOICE"
          ? choice.options.length - 1
          : 0;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: resolveIndex
    });
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    expect(state.players.p1.hand).toEqual(expect.arrayContaining(["spell.haste", "spell.slow"]));
  });
});

describe("Map cast — School of Magic expert + Basic Magic expert (combat parity)", () => {
  it("Air Magic permanent: basic +1 is free starting Power (materials with no cards)", () => {
    let state = mapHand(["spell.view_air"]); // View Air is Air school
    state.players.p1.permanents = ["ability.air_magic"];
    const materialsBefore = state.players.p1.resources.buildingMaterials;
    const goldBefore = state.players.p1.resources.gold;

    // Standing basic school +1 → Power 1 auto-resolves materials (no boost sources).
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    // With only school permanent (no hand power, no expert crown), starting Power 1
    // auto-resolves if no school-expert offer (needs crown) and no card offers.
    // Actually school-expert needs crown — without crown, only starting +1, auto-resolve.
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
    expect(state.players.p1.resources.gold).toBe(goldBefore);
    expect(state.players.p1.permanents).toContain("ability.air_magic"); // basic never discards
  });

  it("School of Magic expert discards the permanent for +2 more (basic already counted)", () => {
    let state = mapHand(["spell.view_air"]);
    state.players.p1.permanents = ["ability.air_magic"];
    state.players.p1.limits.expertUses = 1;
    const valuablesBefore = state.players.p1.resources.valuables;

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    // Starting Power 1 (basic school). Boost offers school permanent expert (+2).
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe(
      "map-spell-boost"
    );
    const choice = state.pendingChoice!;
    const expertIndex =
      choice.type === "OPTION_CHOICE" && choice.mapSpellBoost
        ? choice.mapSpellBoost.offers.findIndex((offer) => offer.kind === "school-permanent-expert")
        : -1;
    expect(expertIndex, "School of Magic expert is offered").toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: expertIndex
    });
    // Power 1 + 2 = 3 → valuables tier (minPower 2). Permanent discarded, crown spent.
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
    expect(state.players.p1.permanents ?? []).not.toContain("ability.air_magic");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("CONTROL: School expert is absent without a crown", () => {
    const state = mapHand(["spell.view_air"]);
    state.players.p1.permanents = ["ability.air_magic"];
    state.players.p1.limits.expertUses = 0;
    const casted = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    // Starting Power 1 auto-resolves (no boost sources) — permanent still in play.
    expect(casted.players.p1.permanents).toContain("ability.air_magic");
    expect(casted.pendingChoice).toBeNull();
  });

  it("Basic Air Magic expert offers +3 Power (from the in-play permanent, which is discarded)", () => {
    let state = mapHand(["spell.view_air"]);
    state.players.p1.permanents = ["ability.basic_air_magic"];
    state.players.p1.limits.expertUses = 1;
    const valuablesBefore = state.players.p1.resources.valuables;

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    // Basic Magic has no standing +1 (only schoolFetch) — starting Power 0.
    // Expert offer +3 → valuables. The permanent-source offer carries no
    // fromHandCardId (the hand offer, if any, would).
    const choice = state.pendingChoice!;
    const fetchIndex =
      choice.type === "OPTION_CHOICE" && choice.mapSpellBoost
        ? choice.mapSpellBoost.offers.findIndex(
            (offer) =>
              offer.kind === "school-fetch-expert" && offer.school === "air" && !offer.fromHandCardId
          )
        : -1;
    expect(fetchIndex, "Basic Air Magic expert (from the permanent) is offered").toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: fetchIndex
    });
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
    // USER RULING: the +3 consumes the fetch permanent (combat parity:
    // USE_SCHOOL_FETCH_EXPERT) — to the owner's DISCARD pile, never removed.
    expect(state.players.p1.permanents ?? []).not.toContain("ability.basic_air_magic");
    expect(state.players.p1.discard).toContain("ability.basic_air_magic");
    expect(state.players.p1.removed ?? []).not.toContain("ability.basic_air_magic");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("Basic Air Magic +3 is ALSO offered from a card held in HAND (crown-gated) — discards the card", () => {
    let state = mapHand(["spell.view_air", "ability.basic_air_magic"]);
    state.players.p1.limits.expertUses = 1;
    const valuablesBefore = state.players.p1.resources.valuables;

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    const choice = state.pendingChoice!;
    const handIndex =
      choice.type === "OPTION_CHOICE" && choice.mapSpellBoost
        ? choice.mapSpellBoost.offers.findIndex(
            (offer) =>
              offer.kind === "school-fetch-expert" &&
              offer.school === "air" &&
              offer.fromHandCardId === "ability.basic_air_magic"
          )
        : -1;
    expect(handIndex, "the hand Basic Air Magic +3 is offered").toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: handIndex
    });
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1); // Power 0 → 3 → valuables
    expect(state.players.p1.hand).not.toContain("ability.basic_air_magic");
    expect(state.players.p1.discard).toContain("ability.basic_air_magic");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("CONTROL: a hand Basic X Magic +3 is WITHHELD without a crown (no more crown-free +3 on the map)", () => {
    let state = mapHand(["spell.view_air", "ability.basic_air_magic"]);
    state.players.p1.limits.expertUses = 0;
    const goldBefore = state.players.p1.resources.gold;

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    // Power 0 with no crown and no other power source → auto-resolves to the gold tier.
    const fetchOffered =
      state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.mapSpellBoost
        ? state.pendingChoice.mapSpellBoost.offers.some((offer) => offer.kind === "school-fetch-expert")
        : false;
    expect(fetchOffered, "no crown → no Basic X Magic +3 offer (hand or permanent)").toBe(false);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    expect(state.players.p1.hand).toContain("ability.basic_air_magic"); // card kept, not burned
  });

  it("CONTROL: Fire Magic does not boost View Air (Air school); Basic Fire expert is withheld", () => {
    let state = mapHand(["spell.view_air"]);
    state.players.p1.permanents = ["ability.fire_magic", "ability.basic_fire_magic"];
    state.players.p1.limits.expertUses = 1;
    const goldBefore = state.players.p1.resources.gold;

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    // Wrong school → Power 0, no school offers → auto-resolve gold.
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    expect(state.players.p1.permanents).toEqual(
      expect.arrayContaining(["ability.fire_magic", "ability.basic_fire_magic"])
    );
  });
});

describe("Map casts share the non-combat spell lifecycle", () => {
  it("Grim Warlock boosts only the first map Spell of the turn", () => {
    let state = mapHand(["spell.view_air", "spell.view_air"]);
    state.adventure!.astrologers = {
      activeCardId: "astrologers.grim_warlock",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    const goldBefore = state.players.p1.resources.gold;
    const materialsBefore = state.players.p1.resources.buildingMaterials;

    for (let cast = 0; cast < 2; cast += 1) {
      state = applyOk(state, {
        type: "PLAY_CARD",
        playerId: "p1",
        cardId: "spell.view_air",
        mode: "basic",
        target: { type: "none" }
      });
      if (
        state.pendingChoice?.type === "OPTION_CHOICE" &&
        state.pendingChoice.context === "map-spell-boost"
      ) {
        state = applyOk(state, {
          type: "CHOOSE_OPTION",
          playerId: "p1",
          choiceId: state.pendingChoice.id,
          optionIndex:
            state.pendingChoice.mapSpellBoost?.offers.length ??
            state.pendingChoice.options.length - 1
        });
      }
    }

    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 3);
    expect(state.players.p1.combatStats.spellsCastThisTurn).toBe(2);
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
    expect(state.players.p1.combatStats.anySpellCastThisRound).not.toBe(true);
  });

  it("Crazy Wizard returns the first resolved map Spell to hand", () => {
    let state = mapHand(["spell.view_air"]);
    state.adventure!.astrologers = {
      activeCardId: "astrologers.crazy_wizard",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });

    expect(state.players.p1.hand).toContain("spell.view_air");
    expect(state.players.p1.discard).not.toContain("spell.view_air");
    expect(state.adventure!.astrologers!.crazyWizardUsedBy).toContain("p1");
  });

  it("CONTROL: an ONGOING map Spell is held, so Crazy Wizard neither returns it nor spends its charge", () => {
    let state = mapHand(["spell.fly"]);
    state.adventure!.astrologers = {
      activeCardId: "astrologers.crazy_wizard",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fly",
      mode: "basic",
      target: { type: "none" }
    });

    expect(state.players.p1.ongoingCards ?? []).toEqual(
      expect.arrayContaining([expect.objectContaining({ cardId: "spell.fly" })])
    );
    expect(state.players.p1.hand).not.toContain("spell.fly");
    expect(state.adventure!.astrologers!.crazyWizardUsedBy).toEqual([]);
  });

  it("DRAW_ON_SPELL_CAST fires on the map without recycling the resolving Spell", () => {
    let state = mapHand(["spell.view_air"]);
    state.players.p1.deck = [];
    state.players.p1.discard = ["stat.attack"];
    state.activeEffects.push({
      id: "map-draw-on-cast",
      name: "Draw after casting",
      scope: "player",
      duration: { type: "permanent" },
      modifiers: [{ type: "DRAW_ON_SPELL_CAST", amount: 1 }],
      source: { type: "system" },
      controllerId: "p1",
      startedRound: state.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });

    expect(state.players.p1.hand).toEqual(["stat.attack"]);
    expect(state.players.p1.deck).toEqual([]);
    expect(state.players.p1.discard).toContain("spell.view_air");
  });
});

// Per-side offers (combat parity): every printed "+Power" side of a CHOOSE_ONE
// card is its own offer — never one collapsed value. The reported bug: the
// Tunic of the Cyclops King only ever offered its "+1, draw 1" side; the "+2
// Power" side was missing from the map boost window.
describe("map-spell-boost — every printed power side is offered", () => {
  function castViewAir(state: GameState): GameState {
    return applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
  }

  function cardOffers(state: GameState, cardId: string) {
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || !choice.mapSpellBoost) {
      throw new Error("expected an open map-spell-boost choice");
    }
    return choice.mapSpellBoost.offers
      .map((offer, index) => ({ offer, index }))
      .filter((entry) => entry.offer.kind === "card" && entry.offer.cardId === cardId);
  }

  it("Tunic of the Cyclops King offers BOTH sides; the +2 side adds 2 and never draws", () => {
    let state = mapHand(["spell.view_air", "artifact.tunic_of_the_cyclops_king"]);
    const valuablesBefore = state.players.p1.resources.valuables;
    state = castViewAir(state);

    const offers = cardOffers(state, "artifact.tunic_of_the_cyclops_king");
    const plusTwo = offers.find((entry) => entry.offer.kind === "card" && entry.offer.value === 2);
    const drawSide = offers.find((entry) => entry.offer.kind === "card" && entry.offer.value === 1);
    expect(plusTwo, "the +2 Power side is offered (the reported bug)").toBeTruthy();
    expect(drawSide, "the +1/draw side is still offered").toBeTruthy();
    if (drawSide?.offer.kind === "card") {
      expect(drawSide.offer.drawCards).toBe(1);
    }

    const deckBefore = state.players.p1.deck.length;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: plusTwo!.index
    });
    // Power 0 + 2 = 2 → valuables tier; the +2 side has NO draw rider.
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
    expect(state.players.p1.deck.length, "the +2 side never draws").toBe(deckBefore);
    expect(state.players.p1.discard).toContain("artifact.tunic_of_the_cyclops_king");
  });

  it("CONTROL: the Tunic's +1 side still draws its card", () => {
    let state = mapHand(["spell.view_air", "artifact.tunic_of_the_cyclops_king"]);
    const materialsBefore = state.players.p1.resources.buildingMaterials;
    state = castViewAir(state);
    const drawSide = cardOffers(state, "artifact.tunic_of_the_cyclops_king").find(
      (entry) => entry.offer.kind === "card" && entry.offer.value === 1
    );
    const deckBefore = state.players.p1.deck.length;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: drawSide!.index
    });
    // The printed "draw 1" fired — and if the drawn card is itself a power
    // source the window re-opens (battle parity: a Sorcery-style draw can
    // refresh fuel into the same cast). Resolve at Power 1 → materials tier.
    expect(state.players.p1.deck.length).toBe(deckBefore - 1);
    expect(state.players.p1.hand).toHaveLength(1);
    if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.mapSpellBoost) {
      state = applyOk(state, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: state.pendingChoice.id,
        optionIndex: state.pendingChoice.mapSpellBoost.offers.length
      });
    }
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 2);
  });

  it("at the highest useful tier, draw-rider boosts remain playable and protect every resolving card", () => {
    let state = mapHand(["spell.view_air", "artifact.tunic_of_the_cyclops_king"]);
    state.players.p1.mapSpellPowerBank = 2;
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    const valuablesBefore = state.players.p1.resources.valuables;

    state = castViewAir(state);
    const offers = cardOffers(state, "artifact.tunic_of_the_cyclops_king");
    expect(offers).toHaveLength(1);
    expect(offers[0]!.offer).toMatchObject({ kind: "card", value: 1, drawCards: 1 });

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: offers[0]!.index
    });

    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
    expect(state.players.p1.hand).toEqual([]);
    expect(state.players.p1.deck).toEqual([]);
    expect(state.players.p1.discard).toEqual(
      expect.arrayContaining(["spell.view_air", "artifact.tunic_of_the_cyclops_king"])
    );
  });

  it("an ongoing map Spell is held correctly after an empty-deck support draw", () => {
    let state = mapHand(["spell.fly", "artifact.tunic_of_the_cyclops_king"]);
    state.players.p1.mapSpellPowerBank = 4;
    state.players.p1.deck = [];
    state.players.p1.discard = [];

    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fly",
      mode: "basic",
      target: { type: "none" }
    });
    const offers = cardOffers(state, "artifact.tunic_of_the_cyclops_king");
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: offers[0]!.index
    });

    expect(state.players.p1.ongoingCards).toEqual(
      expect.arrayContaining([expect.objectContaining({ cardId: "spell.fly" })])
    );
    expect(state.players.p1.discard).toContain("artifact.tunic_of_the_cyclops_king");
    expect(state.players.p1.discard).not.toContain("spell.fly");
  });

  it("Scales of the Greater Basilisk offers +3 AND +1/draw as separate sides", () => {
    let state = mapHand(["spell.view_air", "artifact.scales_of_the_greater_basilisk"]);
    const valuablesBefore = state.players.p1.resources.valuables;
    state = castViewAir(state);
    const offers = cardOffers(state, "artifact.scales_of_the_greater_basilisk");
    const values = offers.map((entry) => (entry.offer.kind === "card" ? entry.offer.value : 0)).sort();
    expect(values).toEqual([1, 3]);
    const plusThree = offers.find((entry) => entry.offer.kind === "card" && entry.offer.value === 3)!;
    const deckBefore = state.players.p1.deck.length;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: plusThree.index
    });
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
    expect(state.players.p1.deck.length, "the +3 side never draws").toBe(deckBefore);
  });

  it("Orb of Driving Rain: 'Remove this card: +5 Power' works on a Water spell and LEAVES THE GAME", () => {
    let state = mapHand(["spell.water_walk", "artifact.orb_of_driving_rain"]);
    const hero = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
    const movementBefore = hero.movementPoints;
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.water_walk",
      mode: "basic",
      target: { type: "none" }
    });
    const offers = cardOffers(state, "artifact.orb_of_driving_rain");
    expect(offers.length, "the +5 Water side is offered on a Water spell").toBe(1);
    if (offers[0]!.offer.kind === "card") {
      expect(offers[0]!.offer.removeSelf).toBe(true);
      expect(offers[0]!.offer.value).toBe(5);
    }
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: offers[0]!.index
    });
    // Power 5 → the +2 movement tier; the Orb is REMOVED, never discarded.
    const heroAfter = Object.values(state.heroes).find((h) => h.controllerId === "p1" && h.kind === "main")!;
    expect(heroAfter.movementPoints).toBe(movementBefore + 2);
    expect(state.players.p1.removed).toContain("artifact.orb_of_driving_rain");
    expect(state.players.p1.discard).not.toContain("artifact.orb_of_driving_rain");
  });

  it("CONTROL: the Orb's water-only +5 is NOT offered on an Air spell", () => {
    let state = mapHand(["spell.view_air", "artifact.orb_of_driving_rain"]);
    state = castViewAir(state);
    // View Air is Air school — the water-only side must be absent; with no other
    // source the cast auto-resolved at Power 0 (no pending choice at all).
    if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.mapSpellBoost) {
      expect(cardOffers(state, "artifact.orb_of_driving_rain")).toHaveLength(0);
    } else {
      expect(state.pendingChoice).toBeNull();
    }
    expect(state.players.p1.hand).toContain("artifact.orb_of_driving_rain");
  });

  it("Titan's Cuirass: the +4 side demands its printed discard before the spell may resolve", () => {
    let state = mapHand(["spell.view_air", "artifact.titans_cuirass", "spell.haste"]);
    const valuablesBefore = state.players.p1.resources.valuables;
    state = castViewAir(state);
    const offers = cardOffers(state, "artifact.titans_cuirass");
    const plusFour = offers.find((entry) => entry.offer.kind === "card" && entry.offer.value === 4);
    const plusTwo = offers.find((entry) => entry.offer.kind === "card" && entry.offer.value === 2);
    expect(plusFour, "the 'Discard 1 card: +4' side is offered").toBeTruthy();
    expect(plusTwo, "the plain +2 side is offered").toBeTruthy();

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: plusFour!.index
    });
    // The printed cost is owed: only cost discards are offered, NO resolve.
    const costChoice = state.pendingChoice;
    if (costChoice?.type !== "OPTION_CHOICE" || !costChoice.mapSpellBoost) {
      throw new Error("expected the cost-discard window");
    }
    expect(costChoice.mapSpellBoost.offers.every((offer) => offer.kind === "cost-discard")).toBe(true);
    expect(costChoice.options).toHaveLength(costChoice.mapSpellBoost.offers.length); // no trailing Resolve
    // A forged resolve past the offers is refused while a hand card can pay.
    const forged = applyAction(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: costChoice.id,
      optionIndex: costChoice.mapSpellBoost.offers.length
    });
    expect(forged.errors.length).toBeGreaterThan(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: costChoice.id,
      optionIndex: 0
    });
    // Power 4 (cap 2) → valuables tier; Haste paid the cost to the discard.
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
    expect(state.players.p1.discard).toEqual(
      expect.arrayContaining(["artifact.titans_cuirass", "spell.haste"])
    );
  });

  it("CONTROL: with no other hand card, the Cuirass +4 side is withheld (the +2 stays)", () => {
    let state = mapHand(["spell.view_air", "artifact.titans_cuirass"]);
    state = castViewAir(state);
    const values = cardOffers(state, "artifact.titans_cuirass").map((entry) =>
      entry.offer.kind === "card" ? entry.offer.value : 0
    );
    expect(values).toEqual([2]);
  });

  it("Breastplate of Brimstone: +1, then up-to-3 optional discards at +1 each (resolve stays open)", () => {
    let state = mapHand(["spell.view_air", "artifact.breastplate_of_brimstone", "spell.slow", "spell.haste"]);
    const valuablesBefore = state.players.p1.resources.valuables;
    state = castViewAir(state);
    const brimstone = cardOffers(state, "artifact.breastplate_of_brimstone")[0]!;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: brimstone.index
    });
    // Power 1; the optional discards join the normal offers AND resolve stays.
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || !choice.mapSpellBoost) {
      throw new Error("expected the reopened boost window");
    }
    const costOffers = choice.mapSpellBoost.offers
      .map((offer, index) => ({ offer, index }))
      .filter((entry) => entry.offer.kind === "cost-discard");
    expect(costOffers.length).toBeGreaterThan(0);
    expect(choice.options.length).toBe(choice.mapSpellBoost.offers.length + 1); // Resolve now present
    const slowDiscard = costOffers.find((entry) => entry.offer.kind === "cost-discard" && entry.offer.cardId === "spell.slow")!;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: slowDiscard.index
    });
    // Power 2 = the cap → auto-resolves at the valuables tier; Haste is KEPT.
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
    expect(state.players.p1.discard).toEqual(
      expect.arrayContaining(["artifact.breastplate_of_brimstone", "spell.slow"])
    );
    expect(state.players.p1.hand).toContain("spell.haste");
  });

  it("an Empowered Sorcery plays its expert +2 side CROWN-FREE on the map", () => {
    let state = mapHand(["spell.view_air", "ability.sorcery"]);
    state.players.p1.limits.expertUses = 0;
    state.players.p1.empoweredAbilities = ["ability.sorcery"];
    const valuablesBefore = state.players.p1.resources.valuables;
    state = castViewAir(state);
    const expert = cardOffers(state, "ability.sorcery").find(
      (entry) => entry.offer.kind === "card" && entry.offer.mode === "expert"
    );
    expect(expert, "the Empowered expert +2 is offered with zero crowns").toBeTruthy();
    if (expert?.offer.kind === "card") {
      expect(expert.offer.crownFree).toBe(true);
    }
    const deckBefore = state.players.p1.deck.length;
    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: expert!.index
    });
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1); // Power 2
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0); // no crown spent
    expect(state.players.p1.deck.length).toBe(deckBefore - 1); // Sorcery's draw rider
  });

  it("CONTROL: an un-Empowered Sorcery with zero crowns offers only its basic +1", () => {
    let state = mapHand(["spell.view_air", "ability.sorcery"]);
    state.players.p1.limits.expertUses = 0;
    state = castViewAir(state);
    const modes = cardOffers(state, "ability.sorcery").map((entry) =>
      entry.offer.kind === "card" ? entry.offer.mode : ""
    );
    expect(modes).toEqual(["basic"]);
  });
});

// The COST channel (Sorrow / lethal saves / affordability / UI pickers) values
// a CHOOSE_ONE card through ONE collapsed side. Sibling cross-check: the Tunic
// must pay its best cost-free side (+2, no draw) exactly like its twin Scales
// pays +3 — not whichever side is printed first — and a "Remove this card"
// side is never valued (discarding a relic for its +5 was an exploit: the
// printed removal was skipped and the card recycled).
describe("power-source cost valuation — collapsed side is the best HONEST one", () => {
  it("Tunic of the Cyclops King pays 2 with NO draw rider (Scales stays 3)", () => {
    const tunic = cardLibrary["artifact.tunic_of_the_cyclops_king"];
    const scales = cardLibrary["artifact.scales_of_the_greater_basilisk"];
    expect(spellPowerValueOfCard(tunic, ["air"], "basic")).toBe(2);
    expect(spellPowerSourceDrawCards(tunic, ["air"]), "the +2 side has no draw").toBe(0);
    expect(spellPowerValueOfCard(scales, ["air"], "basic")).toBe(3);
    expect(spellPowerSourceDrawCards(scales, ["air"])).toBe(0);
  });

  it("a 'Remove this card: +5' side is never a discard value (Orb of Driving Rain pays 0)", () => {
    const orb = cardLibrary["artifact.orb_of_driving_rain"];
    expect(spellPowerValueOfCard(orb, ["water"], "basic")).toBe(0);
  });

  it("CONTROL: a discard-cost side still values its flat base (Breastplate of Brimstone pays 1)", () => {
    const brimstone = cardLibrary["artifact.breastplate_of_brimstone"];
    expect(spellPowerValueOfCard(brimstone, ["water"], "basic")).toBe(1);
  });
});

describe("map-spell-boost — hidden-info safety", () => {
  it("other viewers never learn the caster's hand power cards from the boost window (owner keeps real labels)", () => {
    let state = mapHand(["spell.view_air", "spell.haste"]);
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.view_air",
      mode: "basic",
      target: { type: "none" }
    });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("map-spell-boost");

    // The OWNER sees the real offer naming the hand card.
    const own = getPlayerView(state, "p1").pendingChoice;
    if (own?.type !== "OPTION_CHOICE") {
      throw new Error("expected the owner's choice");
    }
    expect(own.options.some((option) => /Haste/i.test(option.label))).toBe(true);

    // ANOTHER viewer sees only that the decision is open — no card names, no ids.
    const other = getPlayerView(state, "p2").pendingChoice;
    if (other?.type !== "OPTION_CHOICE") {
      throw new Error("expected the masked choice");
    }
    expect(other.options.every((option) => option.label === "Hidden option")).toBe(true);
    expect(JSON.stringify(other)).not.toContain("spell.haste");
  });
});
