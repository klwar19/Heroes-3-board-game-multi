import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { artifactDeckBinhMajor, artifactDeckBinhMinor, artifactDeckLegacy } from "@/data/cards/artifacts";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { recruitDiscountAmount, startPlayerTurn } from "./adventure";
import type { GameAction, GameState, PlayerId } from "./state";

// ---------------------------------------------------------------------------
// Legion artifacts (Legs/Loins/Torso/Arms/Head of Legion). Each one's discount
// side is an INSTANT, one-shot effect: it banks a gold discount on the player
// (player.recruitDiscount) that comes off their next Recruitment/Reinforcement
// "to a minimum of 0" and is then consumed. The artifact card goes straight to
// the discard pile — it is NOT an ongoing effect and does NOT linger in play.
//
// These tests pin (1) the definitions of all five pieces, (2) that playing the
// discount side is instant (discarded at once, no active effect, no ongoing
// card), and (3) that the banked discount is read and consumed by the
// recruit/reinforce cost path — failing if the discount logic is removed.
// ---------------------------------------------------------------------------

const LEGION_DISCOUNTS: { cardId: string; tier: "minor" | "major"; amount: number; name: string }[] = [
  { cardId: "artifact.legs_of_legion", tier: "minor", amount: 4, name: "Legs of Legion" },
  { cardId: "artifact.loins_of_legion", tier: "minor", amount: 5, name: "Loins of Legion" },
  // House rule: Torso of Legion is a Major artifact.
  { cardId: "artifact.torso_of_legion", tier: "major", amount: 6, name: "Torso of Legion" },
  { cardId: "artifact.head_of_legion", tier: "major", amount: 6, name: "Head of Legion" },
  { cardId: "artifact.arms_of_legion", tier: "major", amount: 5, name: "Arms of Legion" }
];

function makeGame(): GameState {
  return createAdventureGameState({ seed: "legion-seed", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshP1(state: GameState): GameState {
  return state.players.p1.needsHandRefresh ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
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

/** Banks a Legion-style one-shot recruit discount, the same way the cards do. */
function bankRecruitDiscount(state: GameState, playerId: PlayerId, amount: number): void {
  const player = state.players[playerId];
  player.recruitDiscount = (player.recruitDiscount ?? 0) + amount;
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

describe("Legion artifact definitions", () => {
  it("each piece's discount side is an instant GAIN_RECRUIT_DISCOUNT of the right amount, plus a resource side", () => {
    for (const { cardId, tier, amount, name } of LEGION_DISCOUNTS) {
      const card = cardLibrary[cardId];
      expect(card, `${name} must exist in the card library`).toBeTruthy();
      expect(card.kind).toBe("artifact");
      expect(card.timing, `${name} is an instant artifact`).toBe("instant");
      expect(card.artifactTier).toBe(tier);
      expect(card.implementationStatus).toBe("implemented");

      const effect = card.effect;
      expect(effect.type, `${name} offers a CHOOSE_ONE`).toBe("CHOOSE_ONE");
      if (effect.type !== "CHOOSE_ONE") {
        throw new Error(`${name} should offer a CHOOSE_ONE.`);
      }

      // Exactly one discount side, wired to the instant one-shot effect — never
      // a CREATE_ACTIVE_EFFECT (which would keep the card in play as ongoing).
      const discountSides = effect.options.filter((option) => option.effect.type === "GAIN_RECRUIT_DISCOUNT");
      expect(discountSides, `${name} has one discount side`).toHaveLength(1);
      expect(discountSides[0]!.effect).toMatchObject({ type: "GAIN_RECRUIT_DISCOUNT", amount });
      expect(
        effect.options.some((option) => option.effect.type === "CREATE_ACTIVE_EFFECT"),
        `${name} discount must not be an ongoing CREATE_ACTIVE_EFFECT`
      ).toBe(false);

      // The other side(s) hand over resources immediately.
      expect(
        effect.options.some((option) => option.effect.type === "GAIN_RESOURCES"),
        `${name} has a resource side`
      ).toBe(true);
    }
  });

  it("all five pieces are dealt into the artifact decks (drawable, not orphaned)", () => {
    for (const { cardId, tier } of LEGION_DISCOUNTS) {
      expect(artifactDeckLegacy).toContain(cardId);
      const binhDeck = tier === "minor" ? artifactDeckBinhMinor : artifactDeckBinhMajor;
      expect(binhDeck).toContain(cardId);
    }
  });
});

describe("Playing a Legion discount side is instant, not ongoing", () => {
  it("banks the discount, discards the card at once, and creates no ongoing effect or held card", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.hand = ["artifact.torso_of_legion"];
    const activeEffectsBefore = state.activeEffects.length;

    const play = findPlay(state, "p1", "artifact.torso_of_legion", 0);
    expect(play, "the Torso of Legion discount side should be playable on the map").toBeTruthy();
    state = apply(state, play!);

    // Banked on the player and visible through the shared reader.
    expect(state.players.p1.recruitDiscount).toBe(6);
    expect(recruitDiscountAmount(state, "p1")).toBe(6);

    // Instant: the card is in the discard pile, not held in play, and it created
    // no active effect (so nothing shows up as an ongoing effect, and turn-end
    // effect expiry has nothing of its to drop).
    expect(state.players.p1.discard).toContain("artifact.torso_of_legion");
    expect(state.players.p1.hand).not.toContain("artifact.torso_of_legion");
    expect(state.players.p1.ongoingCards ?? []).not.toContainEqual(
      expect.objectContaining({ cardId: "artifact.torso_of_legion" })
    );
    expect(state.activeEffects.length).toBe(activeEffectsBefore);
  });
});

describe("Stacking, same-piece guard, and end-of-turn expiry", () => {
  it("pools DIFFERENT Legion pieces but never stacks the SAME piece with itself", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
    state.players.p1.hand = ["artifact.legs_of_legion", "artifact.torso_of_legion"];

    // Two different pieces pool: Legs (4) + Torso (6) = 10.
    state = apply(state, findPlay(state, "p1", "artifact.legs_of_legion", 0)!);
    state = apply(state, findPlay(state, "p1", "artifact.torso_of_legion", 0)!);
    expect(recruitDiscountAmount(state, "p1")).toBe(10);
    expect(state.players.p1.recruitDiscountSources).toEqual([
      "artifact.legs_of_legion",
      "artifact.torso_of_legion"
    ]);

    // Pull Legs back from the discard (as a discard-retrieval card would) and try
    // to bank it again. Its discount side is no longer offered…
    state.players.p1.hand = ["artifact.legs_of_legion"];
    expect(findPlay(state, "p1", "artifact.legs_of_legion", 0)).toBeUndefined();
    // …though the SAME card's resource side is still perfectly playable…
    expect(findPlay(state, "p1", "artifact.legs_of_legion", 1)).toBeTruthy();
    // …and a hand-crafted replay of the discount side is rejected, so the pooled
    // discount stays at 10 (no self-stack).
    const replay = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.legs_of_legion",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(replay.errors.length).toBeGreaterThan(0);
    expect(recruitDiscountAmount(state, "p1")).toBe(10);
  });

  it("expires the banked discount at the start of the player's next turn", () => {
    const state = setupRecruitTown();
    state.players.p1.recruitDiscount = 6;
    state.players.p1.recruitDiscountSources = ["artifact.torso_of_legion"];
    expect(recruitDiscountAmount(state, "p1")).toBe(6);

    // The discount is a current-turn voucher: the owner's next turn clears it.
    startPlayerTurn(state, "p1");
    expect(recruitDiscountAmount(state, "p1")).toBe(0);
    expect(state.players.p1.recruitDiscountSources).toEqual([]);
  });
});

describe("The banked discount is read and consumed by the recruit/reinforce cost path", () => {
  it("recruits at full price when no Legion discount is banked (baseline)", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };

    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
    });

    // Marksmen Few cost 3 gold — paid in full with no discount banked.
    expect(state.players.p1.resources.gold).toBe(7);
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);
  });

  it("knocks the banked discount off a recruit's gold (buying a unit) and spends it", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    bankRecruitDiscount(state, "p1", 2);

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

  it("ends after buying once even when the discount did not lower the gold bill", () => {
    // A no-gold recruit: the banked discount has nothing to reduce, but buying
    // once must still consume it (single-use, not "spent only when it helped").
    const fewSide = coreUnitDefinitions["castle.marksmen"]!.few!;
    const originalCost = fewSide.cost;
    fewSide.cost = { buildingMaterials: 1 };
    try {
      let state = setupRecruitTown();
      state.players.p1.resources = { gold: 10, buildingMaterials: 2, valuables: 0 };
      bankRecruitDiscount(state, "p1", 5);
      expect(recruitDiscountAmount(state, "p1")).toBe(5);

      state = apply(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
      });

      // No gold was reduced (none to reduce), yet the one-shot bank is spent.
      expect(state.players.p1.resources.gold).toBe(10);
      expect(state.players.p1.resources.buildingMaterials).toBe(1);
      expect(recruitDiscountAmount(state, "p1")).toBe(0);
    } finally {
      fewSide.cost = originalCost;
    }
  });

  it("knocks the banked discount off a reinforcement's gold (upgrading a unit) and spends it", () => {
    const state = setupRecruitTown();
    const town = state.towns.town_p1;
    town.buildings = [...new Set([...town.buildings, "castle.citadel"])]; // UNLOCK_REINFORCE
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.griffins");
    state.players.p1.army.push({ id: "u_griffins_test", unitDefId: "castle.griffins", side: "few" });
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    bankRecruitDiscount(state, "p1", 4);

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

  it("pools multiple Legion pieces and floors the gold paid at 0, consuming the whole bank at once", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    bankRecruitDiscount(state, "p1", 2);
    bankRecruitDiscount(state, "p1", 2);
    expect(recruitDiscountAmount(state, "p1")).toBe(4);

    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
    });

    // 3 gold - 4 pooled discount = 0 (never below 0); no gold leaves the purse.
    expect(state.players.p1.resources.gold).toBe(10);
    // The whole one-shot bank is consumed by the recruit.
    expect(recruitDiscountAmount(state, "p1")).toBe(0);
  });

  it("does not let the discount leak to another player", () => {
    const state = setupRecruitTown();
    bankRecruitDiscount(state, "p1", 5);
    expect(recruitDiscountAmount(state, "p1")).toBe(5);
    expect(recruitDiscountAmount(state, "p2")).toBe(0);
  });
});

describe("The banked discount affects what is offered and works end to end", () => {
  it("offers a recruit that only the Legion discount makes affordable", () => {
    const state = setupRecruitTown();
    state.players.p1.resources = { gold: 1, buildingMaterials: 0, valuables: 0 };

    // 1 gold cannot afford the 3-gold Marksmen on its own.
    expect(recruitActionFor(state, "castle.marksmen")).toBeUndefined();

    bankRecruitDiscount(state, "p1", 2);
    // 3 gold - 2 discount = 1 gold, now exactly affordable, so the action appears.
    expect(recruitActionFor(state, "castle.marksmen")).toBeTruthy();
  });

  it("applies the discount created by actually playing Legs of Legion, then spends it once", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.hand = ["artifact.legs_of_legion"];

    const play = findPlay(state, "p1", "artifact.legs_of_legion", 0);
    expect(play, "the Legs of Legion discount option should be playable on the map").toBeTruthy();
    state = apply(state, play!);
    // Legs of Legion banks a 4-gold one-shot discount.
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
