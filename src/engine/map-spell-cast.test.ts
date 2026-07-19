import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { bestMapSpellTier, isMapPowerTierSpell, mapSpellPowerTiers } from "./map-spell-cast";
import { applyAction, createAdventureGameState, getLegalActions, type GameAction, type GameState } from "./index";

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

  it("Basic Air Magic expert offers +3 Power (permanent stays)", () => {
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
    // Expert offer +3 → valuables.
    const choice = state.pendingChoice!;
    const fetchIndex =
      choice.type === "OPTION_CHOICE" && choice.mapSpellBoost
        ? choice.mapSpellBoost.offers.findIndex(
            (offer) => offer.kind === "school-fetch-expert" && offer.school === "air"
          )
        : -1;
    expect(fetchIndex, "Basic Air Magic expert is offered").toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: fetchIndex
    });
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore + 1);
    expect(state.players.p1.permanents).toContain("ability.basic_air_magic"); // stays
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
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
