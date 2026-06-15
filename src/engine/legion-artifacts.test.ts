import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { artifactDeckBinhMajor, artifactDeckLegacy } from "@/data/cards/artifacts";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { recruitDiscountAmount } from "./adventure";
import { makeActiveEffect } from "./active-effects";
import type { GameAction, GameState, PlayerId } from "./state";

// ---------------------------------------------------------------------------
// Legion artifacts (Legs/Loins/Torso/Arms/Head of Legion). Each one's discount
// side creates a one-shot RECRUIT_DISCOUNT effect that knocks gold off the
// player's next Recruitment/Reinforcement "to a minimum of 0". These tests pin
// (1) the Arms of Legion definition and (2) that the discount is actually read
// and consumed by the recruit/reinforce cost path — the bug being fixed is that
// the modifier was created but never applied.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "legion-seed", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshP1(state: GameState): GameState {
  return apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
}

/** A p1 map-turn with a Castle Bronze dwelling standing, so Bronze units recruit. */
function setupRecruitTown(): GameState {
  const state = refreshP1(makeGame());
  const town = state.towns.town_p1;
  if (!town.buildings.includes("castle.dwelling_bronze")) {
    town.buildings = [...town.buildings, "castle.dwelling_bronze"];
  }
  // Each unit card exists once: clear Marksmen so they can be recruited fresh.
  state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.marksmen");
  return state;
}

/** Injects a Legion-style one-shot recruit discount, the same shape the cards make. */
function giveRecruitDiscount(state: GameState, playerId: PlayerId, amount: number): void {
  state.activeEffects.push(
    makeActiveEffect(
      state,
      {
        name: "Legion discount (test)",
        scope: "player",
        duration: { type: "current-turn" },
        modifiers: [{ type: "RECRUIT_DISCOUNT", amount }]
      },
      { type: "card", cardId: "artifact.legs_of_legion", controllerId: playerId },
      playerId
    )
  );
}

function findPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number
): Extract<GameAction, { type: "PLAY_CARD" }> | undefined {
  for (const entry of getLegalActions(state, playerId)) {
    const action = entry.action;
    if (action.type === "PLAY_CARD" && action.cardId === cardId && action.optionIndex === optionIndex) {
      return action;
    }
  }
  return undefined;
}

function recruitActionFor(state: GameState, unitDefId: string): GameAction | undefined {
  return getLegalActions(state, "p1").find(
    (entry) =>
      entry.action.type === "POPULATION_ACTION" &&
      entry.action.purchases.some((purchase) => purchase.kind === "recruit" && purchase.unitDefId === unitDefId)
  )?.action;
}

describe("Arms of Legion (definition)", () => {
  it("is a Major artifact wired to the 5-gold discount and a 2 building-materials option", () => {
    const card = cardLibrary["artifact.arms_of_legion"];
    expect(card, "Arms of Legion must exist in the card library").toBeTruthy();
    expect(card.kind).toBe("artifact");
    expect(card.artifactTier).toBe("major");
    expect(card.implementationStatus).toBe("implemented");

    const effect = card.effect;
    expect(effect.type).toBe("CHOOSE_ONE");
    if (effect.type !== "CHOOSE_ONE") {
      throw new Error("Arms of Legion should offer a CHOOSE_ONE.");
    }

    const [discountOption, materialsOption] = effect.options;
    expect(discountOption.effect).toMatchObject({
      type: "CREATE_ACTIVE_EFFECT",
      effect: {
        scope: "player",
        duration: { type: "current-turn" },
        modifiers: [{ type: "RECRUIT_DISCOUNT", amount: 5 }]
      }
    });
    expect(materialsOption.effect).toMatchObject({
      type: "GAIN_RESOURCES",
      gain: { buildingMaterials: 2 }
    });
  });

  it("is dealt into the legacy and BINH Major artifact decks (drawable, not orphaned)", () => {
    expect(artifactDeckLegacy).toContain("artifact.arms_of_legion");
    expect(artifactDeckBinhMajor).toContain("artifact.arms_of_legion");
  });
});

describe("RECRUIT_DISCOUNT is read by the recruit/reinforce cost path", () => {
  it("recruits at full price when no Legion discount is held (baseline)", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };

    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
    });

    // Marksmen Few cost 3 gold — paid in full with no discount active.
    expect(state.players.p1.resources.gold).toBe(7);
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);
  });

  it("knocks the held discount off a recruit's gold and spends the artifact's effect", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    giveRecruitDiscount(state, "p1", 2);

    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
    });

    // 3 gold - 2 discount = 1 gold paid.
    expect(state.players.p1.resources.gold).toBe(9);
    // The one-shot discount is consumed once it has been used.
    expect(recruitDiscountAmount(state, "p1")).toBe(0);
  });

  it("pools multiple Legion discounts and floors the gold paid at 0", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    giveRecruitDiscount(state, "p1", 2);
    giveRecruitDiscount(state, "p1", 2);
    expect(recruitDiscountAmount(state, "p1")).toBe(4);

    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
    });

    // 3 gold - 4 pooled discount = 0 (never below 0); no gold leaves the purse.
    expect(state.players.p1.resources.gold).toBe(10);
    // Both pooled discounts are consumed by the recruit.
    expect(recruitDiscountAmount(state, "p1")).toBe(0);
  });

  it("knocks the held discount off a reinforcement's gold too", () => {
    const state = setupRecruitTown();
    const town = state.towns.town_p1;
    town.buildings = [...new Set([...town.buildings, "castle.citadel"])]; // UNLOCK_REINFORCE
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.griffins");
    state.players.p1.army.push({ id: "u_griffins_test", unitDefId: "castle.griffins", side: "few" });
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    giveRecruitDiscount(state, "p1", 4);

    const next = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "castle.griffins", armyUnitId: "u_griffins_test" }]
    });

    // Griffins Pack cost 6 gold - 4 discount = 2 gold paid.
    expect(next.players.p1.resources.gold).toBe(8);
    expect(next.players.p1.army.find((unit) => unit.id === "u_griffins_test")?.side).toBe("pack");
    expect(recruitDiscountAmount(next, "p1")).toBe(0);
  });

  it("does not let the discount leak to another player", () => {
    const state = setupRecruitTown();
    giveRecruitDiscount(state, "p1", 5);
    expect(recruitDiscountAmount(state, "p1")).toBe(5);
    expect(recruitDiscountAmount(state, "p2")).toBe(0);
  });
});

describe("RECRUIT_DISCOUNT affects what is offered and works end to end", () => {
  it("offers a recruit that only the Legion discount makes affordable", () => {
    const state = setupRecruitTown();
    state.players.p1.resources = { gold: 1, buildingMaterials: 0, valuables: 0 };

    // 1 gold cannot afford the 3-gold Marksmen on its own.
    expect(recruitActionFor(state, "castle.marksmen")).toBeUndefined();

    giveRecruitDiscount(state, "p1", 2);
    // 3 gold - 2 discount = 1 gold, now exactly affordable, so the action appears.
    expect(recruitActionFor(state, "castle.marksmen")).toBeTruthy();
  });

  it("applies the discount created by actually playing Legs of Legion", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.hand = ["artifact.legs_of_legion"];

    const play = findPlay(state, "p1", "artifact.legs_of_legion", 0);
    expect(play, "the Legs of Legion discount option should be playable on the map").toBeTruthy();
    state = apply(state, play!);
    // Legs of Legion grants a 4-gold one-shot discount.
    expect(recruitDiscountAmount(state, "p1")).toBe(4);

    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
    });

    // 3 gold - 4 discount = 0 gold paid; the discount is then consumed.
    expect(state.players.p1.resources.gold).toBe(10);
    expect(recruitDiscountAmount(state, "p1")).toBe(0);
  });
});
