import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { artifactDeckBinhMajor, artifactDeckBinhMinor, artifactDeckLegacy } from "@/data/cards/artifacts";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import {
  applyBestRecruitDiscount,
  bestRecruitGoldDiscount,
  legionVoucherDiscount,
  queueNecromancyReinforce,
  reinforceArmyUnit,
  reinforceGoldDiscount,
  startPlayerTurn,
  townHasBuildingEffect,
  type RecruitPurchaseRef
} from "./adventure";
import type { GameAction, GameState, PlayerId, RecruitDiscountVoucher } from "./state";

// ---------------------------------------------------------------------------
// Legion artifacts (Legs/Loins/Torso/Arms/Head of Legion). Each one's discount
// side is an INSTANT, map-only effect: playing it opens a blocking prompt to
// pick the ONE unit whose Recruitment/Reinforcement cost it reduces, then banks
// a one-shot voucher reserved for that exact unit. The card is discarded at
// once — it is NOT ongoing and does NOT linger in play.
//
// The cardinal rule these tests pin: discounts NEVER stack. For any single unit
// the cost path applies the SINGLE LARGEST applicable gold discount — never the
// sum — whether the rival is another Legion piece on the same unit, the
// Champions' Stables discount, or the Necromancy half-cost (still figured from
// the ORIGINAL price). A voucher is consumed when its unit is bought and expires
// at the owner's next turn.
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

/** Adds the Citadel so Few→Pack reinforcement is unlocked at the town. */
function withCitadel(state: GameState): GameState {
  const town = state.towns.town_p1;
  town.buildings = [...new Set([...town.buildings, "castle.citadel"])];
  return state;
}

/** Banks a Legion voucher directly, the same way the BANK_RECRUIT_DISCOUNT step does. */
function bankVoucher(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  amount: number,
  target: RecruitDiscountVoucher["target"]
): void {
  const player = state.players[playerId];
  player.recruitDiscounts = [...(player.recruitDiscounts ?? []), { cardId, amount, target }];
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

/** Resolves the open Legion "pick a unit" prompt for the named unit + kind. */
function resolveLegionPick(state: GameState, unitName: string, kind: "recruit" | "reinforce"): GameState {
  const verb = kind === "recruit" ? "Recruit" : "Reinforce";
  const legal = getLegalActions(state, "p1").find(
    (entry) =>
      entry.action.type === "RESOLVE_VISIT_STEP" && entry.label.startsWith(verb) && entry.label.includes(unitName)
  );
  expect(legal, `a Legion pick for ${verb} ${unitName} should be offered`).toBeTruthy();
  return apply(state, legal!.action);
}

/** Every CHOOSE_ONE option label currently queued (e.g. a Necromancy prompt). */
function queuedOptionLabels(state: GameState): string[] {
  const labels: string[] = [];
  for (const reward of state.adventure?.rewardQueue ?? []) {
    if (reward.kind === "visit-steps") {
      for (const step of reward.steps) {
        if (step.type === "CHOOSE_ONE") {
          labels.push(...step.options.map((option) => option.label));
        }
      }
    }
  }
  return labels;
}

function recruitActionFor(state: GameState, unitDefId: string): GameAction | undefined {
  return getLegalActions(state, "p1").find(
    (entry) =>
      entry.action.type === "POPULATION_ACTION" &&
      entry.action.purchases.some((purchase) => purchase.kind === "recruit" && purchase.unitDefId === unitDefId)
  )?.action;
}

describe("Legion artifact definitions", () => {
  it("each piece's discount side is an instant, map-only GAIN_RECRUIT_DISCOUNT of the right amount, plus a resource side", () => {
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
      // a CREATE_ACTIVE_EFFECT (which would keep the card in play as ongoing) —
      // and map-only (the unit-selection prompt only exists on the map).
      const discountSides = effect.options.filter((option) => option.effect.type === "GAIN_RECRUIT_DISCOUNT");
      expect(discountSides, `${name} has one discount side`).toHaveLength(1);
      expect(discountSides[0]!.effect).toMatchObject({ type: "GAIN_RECRUIT_DISCOUNT", amount });
      expect(discountSides[0]!.mapOnly, `${name} discount side is map-only`).toBe(true);
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

describe("Playing a Legion discount side opens a unit-selection window (no immediate bank)", () => {
  it("discards the card, creates no ongoing effect, and opens a blocking pick-a-unit prompt — banking nothing yet", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.hand = ["artifact.torso_of_legion"];
    const activeEffectsBefore = state.activeEffects.length;

    const play = findPlay(state, "p1", "artifact.torso_of_legion", 0);
    expect(play, "the Torso of Legion discount side should be playable on the map").toBeTruthy();
    state = apply(state, play!);

    // Instant: the card is in the discard pile, not held, and made no active effect.
    expect(state.players.p1.discard).toContain("artifact.torso_of_legion");
    expect(state.players.p1.hand).not.toContain("artifact.torso_of_legion");
    expect(state.players.p1.ongoingCards ?? []).not.toContainEqual(
      expect.objectContaining({ cardId: "artifact.torso_of_legion" })
    );
    expect(state.activeEffects.length).toBe(activeEffectsBefore);

    // Nothing is banked until the player chooses a unit.
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);

    // A blocking CHOOSE_ONE field-visit prompt is now open, listing units…
    const visit = state.adventure?.pendingVisit;
    expect(visit?.playerId).toBe("p1");
    expect(visit?.steps[0]?.type).toBe("CHOOSE_ONE");
    const legal = getLegalActions(state, "p1");
    expect(legal.length).toBeGreaterThan(0);
    // …and that prompt is exclusive: every legal action resolves the pick.
    expect(legal.every((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(true);
    expect(legal.some((entry) => entry.label.startsWith("Recruit") && entry.label.includes("Marksmen"))).toBe(true);
  });

  it("banks a voucher reserved for the chosen unit, then the recruit spends it (floored at 0)", () => {
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.hand = ["artifact.legs_of_legion"];

    state = apply(state, findPlay(state, "p1", "artifact.legs_of_legion", 0)!);
    state = resolveLegionPick(state, "Marksmen", "recruit");

    // A single voucher, reserved for the Marksmen recruit, is now banked.
    expect(state.players.p1.recruitDiscounts).toEqual([
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "recruit", unitDefId: "castle.marksmen" } }
    ]);
    expect(legionVoucherDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.marksmen" })).toBe(4);

    // 3 gold - 4 discount = 0 paid; the voucher is then consumed.
    state = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
    });
    expect(state.players.p1.resources.gold).toBe(10);
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
    expect(state.players.p1.army.some((unit) => unit.unitDefId === "castle.marksmen")).toBe(true);
  });

  it("a voucher reserved for one unit does NOT discount a different unit", () => {
    const state = setupRecruitTown();
    bankVoucher(state, "p1", "artifact.torso_of_legion", 6, { kind: "recruit", unitDefId: "castle.marksmen" });

    expect(bestRecruitGoldDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.marksmen" })).toBe(6);
    // Griffins were never selected, so their cost is untouched.
    expect(bestRecruitGoldDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.griffins" })).toBe(0);
    expect(applyBestRecruitDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.griffins" }, { gold: 4 })).toEqual({
      gold: 4
    });
  });
});

describe("Discounts never stack — the cost path takes the single largest", () => {
  it("two Legion pieces aimed at the SAME unit take the bigger, not the sum", () => {
    const state = setupRecruitTown();
    bankVoucher(state, "p1", "artifact.legs_of_legion", 4, { kind: "recruit", unitDefId: "castle.griffins" });
    bankVoucher(state, "p1", "artifact.head_of_legion", 6, { kind: "recruit", unitDefId: "castle.griffins" });

    // Legs (4) + Head (6) on the same Griffins → 6, never 10.
    expect(legionVoucherDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.griffins" })).toBe(6);
    expect(applyBestRecruitDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.griffins" }, { gold: 4 })).toEqual({
      gold: 0
    });
  });

  it("two Legion pieces aimed at DIFFERENT units each apply to their own unit", () => {
    const state = setupRecruitTown();
    bankVoucher(state, "p1", "artifact.legs_of_legion", 4, { kind: "recruit", unitDefId: "castle.marksmen" });
    bankVoucher(state, "p1", "artifact.head_of_legion", 6, { kind: "recruit", unitDefId: "castle.griffins" });

    expect(legionVoucherDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.marksmen" })).toBe(4);
    expect(legionVoucherDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.griffins" })).toBe(6);
  });

  it("Legion does not stack with the Champions' Stables discount — only the bigger applies", () => {
    const state = setupRecruitTown();
    const hero = state.heroes.hero_p1;
    const spaceId = hero.spaceId!;
    state.adventure!.fields[spaceId].location = "stables";
    state.players.p1.army.push({ id: "champ_few", unitDefId: "castle.champions", side: "few" });
    const ref: RecruitPurchaseRef = { kind: "reinforce", unitDefId: "castle.champions", armyUnitId: "champ_few" };

    // Champions on a Stables field already knock 6 gold off the reinforcement.
    expect(reinforceGoldDiscount(state, "p1", "castle.champions")).toBe(6);

    // A 4-gold Legion voucher reserved for the same Champion does NOT add to it.
    bankVoucher(state, "p1", "artifact.legs_of_legion", 4, { kind: "reinforce", armyUnitId: "champ_few" });
    expect(bestRecruitGoldDiscount(state, "p1", ref)).toBe(6); // max(4, 6), never 10
    const packCost = coreUnitDefinitions["castle.champions"].pack!.cost;
    expect(applyBestRecruitDiscount(state, "p1", ref, packCost).gold).toBe(Math.max(0, (packCost.gold ?? 0) - 6));

    // Even a 6-gold Legion voucher only ties — the result stays at a single −6.
    state.players.p1.recruitDiscounts = [];
    bankVoucher(state, "p1", "artifact.head_of_legion", 6, { kind: "reinforce", armyUnitId: "champ_few" });
    expect(bestRecruitGoldDiscount(state, "p1", ref)).toBe(6); // max(6, 6), never 12
  });

  it("Necromancy's half is figured from the ORIGINAL price; the bigger of half vs Legion wins, and the voucher is spent", () => {
    // Griffins Pack costs 6 gold. Necromancy = reinforceArmyUnit(halfGoldOnly,
    // roundDown): floor(6/2) = 3 gold. A 2-gold Legion voucher (→ pay 4) is the
    // smaller discount, so Necromancy's 3 wins — proving the half is taken from
    // the ORIGINAL 6, not from a Legion-reduced price (which would be floor(4/2)=2).
    let state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.army.push({ id: "u_griffins", unitDefId: "castle.griffins", side: "few" });
    bankVoucher(state, "p1", "artifact.legs_of_legion", 2, { kind: "reinforce", armyUnitId: "u_griffins" });

    reinforceArmyUnit(state, "p1", "u_griffins", false, true, true); // Necromancy mode
    expect(state.players.p1.resources.gold).toBe(7); // paid 3 (original half), not 2 (would be a stack)
    expect(state.players.p1.army.find((unit) => unit.id === "u_griffins")?.side).toBe("pack");
    // The reserved voucher is spent on this unit even though Necromancy beat it.
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);

    // Now the other way: a 4-gold Legion voucher (→ pay 2) beats Necromancy's 3.
    state = setupRecruitTown();
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    state.players.p1.army.push({ id: "u_griffins2", unitDefId: "castle.griffins", side: "few" });
    bankVoucher(state, "p1", "artifact.legs_of_legion", 4, { kind: "reinforce", armyUnitId: "u_griffins2" });

    reinforceArmyUnit(state, "p1", "u_griffins2", false, true, true); // Necromancy mode
    expect(state.players.p1.resources.gold).toBe(8); // paid 2 (6 - 4 Legion), the bigger discount
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });
});

describe("The voucher is read and consumed by the recruit/reinforce cost path", () => {
  it("knocks the banked discount off a reinforcement's gold (upgrading a unit) and spends only that unit's voucher", () => {
    const state = withCitadel(setupRecruitTown());
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.griffins");
    state.players.p1.army.push({ id: "u_griffins_test", unitDefId: "castle.griffins", side: "few" });
    state.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    bankVoucher(state, "p1", "artifact.legs_of_legion", 4, { kind: "reinforce", armyUnitId: "u_griffins_test" });

    const next = apply(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "reinforce", unitDefId: "castle.griffins", armyUnitId: "u_griffins_test" }]
    });

    // Griffins Pack cost 6 gold - 4 discount = 2 gold paid.
    expect(next.players.p1.resources.gold).toBe(8);
    expect(next.players.p1.army.find((unit) => unit.id === "u_griffins_test")?.side).toBe("pack");
    expect(next.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });

  it("spends the voucher once even when it did not lower the gold bill (single-use)", () => {
    // A no-gold recruit: the banked voucher has nothing to reduce, but buying
    // the unit must still consume it.
    const fewSide = coreUnitDefinitions["castle.marksmen"]!.few!;
    const originalCost = fewSide.cost;
    fewSide.cost = { buildingMaterials: 1 };
    try {
      let state = setupRecruitTown();
      state.players.p1.resources = { gold: 10, buildingMaterials: 2, valuables: 0 };
      bankVoucher(state, "p1", "artifact.loins_of_legion", 5, { kind: "recruit", unitDefId: "castle.marksmen" });

      state = apply(state, {
        type: "POPULATION_ACTION",
        playerId: "p1",
        purchases: [{ kind: "recruit", unitDefId: "castle.marksmen" }]
      });

      expect(state.players.p1.resources.gold).toBe(10);
      expect(state.players.p1.resources.buildingMaterials).toBe(1);
      expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
    } finally {
      fewSide.cost = originalCost;
    }
  });

  it("does not let a voucher leak to another player", () => {
    const state = setupRecruitTown();
    bankVoucher(state, "p1", "artifact.loins_of_legion", 5, { kind: "recruit", unitDefId: "castle.marksmen" });
    expect(bestRecruitGoldDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.marksmen" })).toBe(5);
    expect(bestRecruitGoldDiscount(state, "p2", { kind: "recruit", unitDefId: "castle.marksmen" })).toBe(0);
  });
});

describe("Same-piece guard, the no-target gate, and end-of-turn expiry", () => {
  it("never banks the SAME piece twice — its discount side disappears once a voucher is banked (resource side stays)", () => {
    let state = setupRecruitTown();
    state.players.p1.hand = ["artifact.legs_of_legion"];

    state = apply(state, findPlay(state, "p1", "artifact.legs_of_legion", 0)!);
    state = resolveLegionPick(state, "Marksmen", "recruit");
    expect(state.players.p1.recruitDiscounts).toHaveLength(1);

    // Pull Legs back from the discard (as a retrieval card would) and try again:
    // its discount side (option 0) is gone, but its resource side (option 1) stays.
    state.players.p1.hand = ["artifact.legs_of_legion"];
    expect(findPlay(state, "p1", "artifact.legs_of_legion", 0)).toBeUndefined();
    expect(findPlay(state, "p1", "artifact.legs_of_legion", 1)).toBeTruthy();

    // A hand-crafted replay of the discount side is rejected (no second voucher).
    const replay = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "artifact.legs_of_legion",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" }
    });
    expect(replay.errors.length).toBeGreaterThan(0);
    expect(state.players.p1.recruitDiscounts).toHaveLength(1);
  });

  it("hides the discount side when there is no unit to spend it on (the resource side still plays)", () => {
    // No Dwelling built (nothing to recruit) and no Few unit (nothing to
    // reinforce by any path): only the resource side of a Legion piece is offered.
    const state = refreshP1(makeGame());
    state.towns.town_p1.buildings = [];
    state.players.p1.army = [{ id: "u_pack", unitDefId: "castle.griffins", side: "pack" }];
    state.players.p1.hand = ["artifact.legs_of_legion"];
    expect(findPlay(state, "p1", "artifact.legs_of_legion", 0)).toBeUndefined();
    expect(findPlay(state, "p1", "artifact.legs_of_legion", 1)).toBeTruthy();
  });

  it("offers a Few unit's reinforce as a target even with NO Citadel (Necromancy/Isra/settlements upgrade without one)", () => {
    // The bug: a Citadel must NOT be required to aim a Legion discount at a unit
    // you will reinforce by Necromancy/Isra/a Settlement (none of which need it).
    const state = setupRecruitTown();
    expect(townHasBuildingEffect(state, "p1", "UNLOCK_REINFORCE")).toBe(false); // no Citadel
    state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.griffins");
    state.players.p1.army.push({ id: "u_griffins", unitDefId: "castle.griffins", side: "few" });
    state.players.p1.hand = ["artifact.legs_of_legion"];

    const played = apply(state, findPlay(state, "p1", "artifact.legs_of_legion", 0)!);
    const reinforceGriffins = getLegalActions(played, "p1").find(
      (entry) =>
        entry.action.type === "RESOLVE_VISIT_STEP" && entry.label.startsWith("Reinforce") && entry.label.includes("Griffins")
    );
    expect(reinforceGriffins, "a Few Griffins reinforce should be a Legion target with no Citadel").toBeTruthy();

    // Picking it banks a reinforce voucher reserved for that exact army unit.
    const next = apply(played, reinforceGriffins!.action);
    expect(next.players.p1.recruitDiscounts).toEqual([
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "reinforce", armyUnitId: "u_griffins" } }
    ]);
  });

  it("expires the banked vouchers at the start of the player's next turn", () => {
    const state = setupRecruitTown();
    bankVoucher(state, "p1", "artifact.torso_of_legion", 6, { kind: "recruit", unitDefId: "castle.marksmen" });
    expect(bestRecruitGoldDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.marksmen" })).toBe(6);

    // The voucher is a current-turn voucher: the owner's next turn clears it.
    startPlayerTurn(state, "p1");
    expect(state.players.p1.recruitDiscounts).toEqual([]);
    expect(bestRecruitGoldDiscount(state, "p1", { kind: "recruit", unitDefId: "castle.marksmen" })).toBe(0);
  });
});

describe("The banked voucher affects what is offered", () => {
  it("offers a recruit that only the Legion voucher makes affordable", () => {
    const state = setupRecruitTown();
    state.players.p1.resources = { gold: 1, buildingMaterials: 0, valuables: 0 };

    // 1 gold cannot afford the 3-gold Marksmen on its own.
    expect(recruitActionFor(state, "castle.marksmen")).toBeUndefined();

    bankVoucher(state, "p1", "artifact.legs_of_legion", 2, { kind: "recruit", unitDefId: "castle.marksmen" });
    // 3 gold - 2 discount = 1 gold, now exactly affordable, so the action appears.
    expect(recruitActionFor(state, "castle.marksmen")).toBeTruthy();
  });

  it("the selection prompt warns when the chosen unit is already discounted (no stacking)", () => {
    // A Champion Few standing on a Stables field is already −6. Playing a Legion
    // piece must surface a warning on that unit's option and not stack — and the
    // reinforce target shows up with NO Citadel.
    const state = setupRecruitTown();
    expect(townHasBuildingEffect(state, "p1", "UNLOCK_REINFORCE")).toBe(false);
    const hero = state.heroes.hero_p1;
    state.adventure!.fields[hero.spaceId!].location = "stables";
    state.players.p1.army.push({ id: "champ_few", unitDefId: "castle.champions", side: "few" });
    state.players.p1.hand = ["artifact.legs_of_legion"];

    const played = apply(state, findPlay(state, "p1", "artifact.legs_of_legion", 0)!);
    const championOption = getLegalActions(played, "p1").find(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && entry.label.includes("Champions")
    );
    expect(championOption, "the Champions reinforce should be offered as a Legion target").toBeTruthy();
    expect(championOption!.label).toContain("already −6");
    expect(championOption!.label).toContain("does not stack");
  });

  it("the Necromancy prompt prices a reinforce with the voucher — non-stacking, half still from the original gold", () => {
    function necropolisGriffinTurn(): GameState {
      const state = setupRecruitTown();
      state.players.p1.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
      state.players.p1.army = state.players.p1.army.filter((unit) => unit.unitDefId !== "castle.griffins");
      state.players.p1.army.push({ id: "u_griffins", unitDefId: "castle.griffins", side: "few" });
      return state;
    }

    // No voucher: Griffins Pack 6 gold → Necromancy half (rounded down) = 3 gold.
    const plain = necropolisGriffinTurn();
    queueNecromancyReinforce(plain, "p1", "basic");
    expect(queuedOptionLabels(plain).some((label) => label.includes("Griffins") && label.includes("3 gold"))).toBe(true);

    // A 4-gold voucher beats the half: the flat 6 − 4 = 2 wins (and Necromancy's
    // half is still figured from the original 6, not floor((6−4)/2)=1), so the
    // prompt prices it at 2 gold.
    const withVoucher = necropolisGriffinTurn();
    bankVoucher(withVoucher, "p1", "artifact.legs_of_legion", 4, { kind: "reinforce", armyUnitId: "u_griffins" });
    queueNecromancyReinforce(withVoucher, "p1", "basic");
    const labels = queuedOptionLabels(withVoucher);
    expect(labels.some((label) => label.includes("Griffins") && label.includes("2 gold"))).toBe(true);
    expect(labels.some((label) => label.includes("Griffins") && label.includes("1 gold"))).toBe(false);
  });
});
