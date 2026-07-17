import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { legionDiscountTargets, openPandoraSilverRefresh, queueNecromancyReinforce, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { FactionId } from "@/data/factions/types";
import type { GameAction, GameState } from "./state";

/**
 * Polish Unit Stacks — building/skill/artifact/astrology extensions. Each
 * feature extends an EXISTING flow to also cover Stack purchases, and each is
 * pinned with a rule-off (or divergent-input) CONTROL that fails if the wiring
 * is removed:
 *   1. Necropolis City Hall — its "reinforce 1 bronze unit for free" pick also
 *      offers a FREE Stack on a bronze Pack/Neutral card.
 *   2. Necromancy — the after-combat play also sells ONE Stack at half gold
 *      (rounded down): bronze/silver on basic, any tier on expert.
 *   3. Rampart Saplings — the Astrologers'-round half-gold deal also sells ONE
 *      Stack (half the Stack gold, rounded up) on its bronze/silver tiers.
 *   4. Stronghold Freelancer's Guild — Stack purchases pay through the recruit
 *      path, so materials/valuables substitute for missing gold.
 *   5. Conflux Garden of Life — the round-start Sprite freebie can be a FREE
 *      Stack on the owned Sprites Pack.
 *   6. Cove Pub — the Astrologers'-round −3-gold deal also sells ONE Stack.
 *   7. Legion artifacts — a voucher can be reserved for (and spent on) a Stack
 *      purchase.
 *   8. Terrible Plague (Astrologers) — a Stacked pack is WEAKENED: it sheds one
 *      Stack layer instead of flipping to Few. CONTROL: Pandora's Silver-Muster
 *      reverse shares the FLIP_PACK_TO_FEW step but stays a plain whole flip.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

type Seat = { id: string; name: string; factionId: FactionId; heroDefId: string };
const NECRO: Seat = { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" };
const CASTLE: Seat = { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" };

function makeGame(seed: string, stacksOn: boolean, p1: Seat = NECRO): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    events: false,
    players: [p1, CASTLE],
    houseRules: { "polish-unit-stacks": stacksOn }
  });
  state.pendingChoice = null;
  if (state.adventure) {
    state.adventure.rewardQueue = [];
  }
  return state;
}

function p1Town(state: GameState) {
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
  if (!town) {
    throw new Error("no p1 town");
  }
  return town;
}

/** The RESOLVE_VISIT_STEP action whose label contains `text` (or undefined). */
function visitAction(state: GameState, text: string) {
  return getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.includes(text)
  );
}

// ===========================================================================
// 1. Necropolis City Hall — free bronze Stack
// ===========================================================================

describe("Necropolis City Hall: free Stack for a bronze card", () => {
  function cityHallPick(state: GameState): GameState {
    state.adventure!.rewardQueue.push({ playerId: "p1", kind: "city-hall-choice", buildingId: "necropolis.city_hall" });
    pumpAdventureQueues(state);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    const pick = getLegalActions(state, "p1").find((legal) => legal.label.includes("Reinforce 1 bronze unit for free"));
    expect(pick, "the reinforce-free City Hall option is offered").toBeTruthy();
    return applyOk(state, pick!.action);
  }

  it("the free-bronze pick offers a FREE Stack on a bronze Pack and adds it at zero cost", () => {
    let state = makeGame("necro-ch-stack", true);
    p1Town(state).buildings = ["necropolis.city_hall"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack" }];
    const goldBefore = state.players.p1.resources.gold;

    state = cityHallPick(state);
    const stackPick = visitAction(state, "Add a Stack to Skeletons (free)");
    expect(stackPick, "the free Stack option is offered on the bronze Pack").toBeTruthy();
    state = applyOk(state, stackPick!.action);

    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold, "the City Hall Stack is free").toBe(goldBefore);
    expect(state.eventLog.some((event) => event.type === "ARMY_STACK_PURCHASED")).toBe(true);
  });

  it("a stack-only army still qualifies for the option (no Few bronze needed)", () => {
    // The army holds ONLY a bronze Pack — nothing to reinforce, but the new
    // hasFreeBronzeStackTarget gate keeps the City Hall option meaningful.
    let state = makeGame("necro-ch-stack-only", true);
    p1Town(state).buildings = ["necropolis.city_hall"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack" }];
    state = cityHallPick(state);
    expect(visitAction(state, "Add a Stack to Skeletons (free)")).toBeTruthy();
  });

  it("CONTROL: with the rule OFF the pick offers only the Few→Pack flip, never a Stack", () => {
    let state = makeGame("necro-ch-stack-off", false);
    p1Town(state).buildings = ["necropolis.city_hall"];
    state.players.p1.army = [
      { id: "army_skel_few", unitDefId: "necropolis.skeletons", side: "few" },
      { id: "army_zombies", unitDefId: "necropolis.zombies", side: "pack" }
    ];
    state = cityHallPick(state);
    expect(visitAction(state, "Reinforce Skeletons (free)")).toBeTruthy();
    expect(visitAction(state, "Add a Stack to")).toBeUndefined();
  });
});

// ===========================================================================
// 2. Necromancy — half-price Stacks (basic: bronze/silver; expert: any tier)
// ===========================================================================

describe("Necromancy: half-price Stack purchases", () => {
  function necroState(seed: string, stacksOn = true): GameState {
    const state = makeGame(seed, stacksOn);
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.resources.gold = 50;
    state.players.p1.army = [
      // Skeletons Pack: Stack gold 4 (3 printed + bronze 1) → half, floored = 2.
      { id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack" },
      // Archangels Pack: gold tier — Stack gold 33 → half, floored = 16.
      { id: "army_arch", unitDefId: "castle.archangels", side: "pack" }
    ];
    return state;
  }

  it("basic offers half-gold (rounded down) Stacks on bronze/silver, NOT gold tier", () => {
    let state = necroState("necromancy-basic");
    queueNecromancyReinforce(state, "p1", "basic", "ability.necromancy");
    pumpAdventureQueues(state);

    expect(visitAction(state, "Add a Stack to Skeletons (2 gold)")).toBeTruthy();
    expect(visitAction(state, "Add a Stack to Archangels"), "gold tier is expert-only").toBeUndefined();

    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, visitAction(state, "Add a Stack to Skeletons (2 gold)")!.action);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(goldBefore - 2);
    // The Necromancy card is spent ONLY because the Stack was really added.
    expect(state.players.p1.hand).not.toContain("ability.necromancy");
    expect(state.players.p1.discard).toContain("ability.necromancy");
  });

  it("expert extends the half-price Stack to gold-tier cards (floor(33/2) = 16)", () => {
    let state = necroState("necromancy-expert");
    queueNecromancyReinforce(state, "p1", "expert", "ability.necromancy");
    pumpAdventureQueues(state);

    const archStack = visitAction(state, "Add a Stack to Archangels (16 gold)");
    expect(archStack, "expert Necromancy reaches the gold tier").toBeTruthy();
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, archStack!.action);
    expect(state.players.p1.army[1].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(goldBefore - 16);
  });

  it("Skip keeps the Necromancy card (the Stack option never pre-spends it)", () => {
    let state = necroState("necromancy-skip");
    queueNecromancyReinforce(state, "p1", "basic", "ability.necromancy");
    pumpAdventureQueues(state);
    state = applyOk(state, visitAction(state, "Skip (keep the card)")!.action);
    expect(state.players.p1.hand).toContain("ability.necromancy");
  });

  it("CONTROL: with the rule OFF no Stack options are queued", () => {
    const state = necroState("necromancy-off", false);
    queueNecromancyReinforce(state, "p1", "expert", "ability.necromancy");
    pumpAdventureQueues(state);
    expect(visitAction(state, "Add a Stack to")).toBeUndefined();
  });
});

// ===========================================================================
// 3. Rampart Saplings — half-gold Stack (bronze/silver, rounded up)
// ===========================================================================

describe("Rampart Saplings: half-gold Stack purchases", () => {
  function saplingsRound(seed: string, stacksOn: boolean): GameState {
    const state = makeGame(seed, stacksOn, {
      id: "p1",
      name: "Ryland",
      factionId: "rampart",
      heroDefId: "ryland"
    });
    p1Town(state).buildings = ["rampart.saplings"];
    state.players.p1.resources.gold = 20;
    state.players.p1.army = [
      // Centaurs Pack: Stack gold 4 → half, rounded up = 2.
      { id: "army_cent", unitDefId: "rampart.centaurs", side: "pack" },
      // Gold Dragons Pack: gold tier — outside the Saplings' bronze/silver list.
      { id: "army_gd", unitDefId: "rampart.gold_dragons", side: "pack" }
    ];
    state.round = 2; // Astrologers' round
    state.decks.astrologers!.drawPile = ["astrologers.dead_silence"]; // inert
    startAdventureRound(state);
    pumpAdventureQueues(state);
    return state;
  }

  it("offers a half-gold Stack on its bronze/silver tiers and charges it", () => {
    let state = saplingsRound("saplings-stack", true);
    const stackPick = visitAction(state, "Add a Stack to Centaurs (2 gold)");
    expect(stackPick, "the Saplings deal covers a bronze Pack's Stack").toBeTruthy();
    expect(visitAction(state, "Add a Stack to Gold Dragons"), "gold tier stays outside the Saplings deal").toBeUndefined();

    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, stackPick!.action);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(goldBefore - 2);
  });

  it("CONTROL: with the rule OFF the Saplings offer contains no Stack options", () => {
    const state = saplingsRound("saplings-stack-off", false);
    expect(visitAction(state, "Add a Stack to")).toBeUndefined();
  });
});

// ===========================================================================
// 4. Freelancer's Guild — Stacks payable with materials/valuables
// ===========================================================================

describe("Freelancer's Guild: Stack purchases substitute resources for gold", () => {
  function guildState(seed: string, withGuild: boolean): GameState {
    const state = makeGame(seed, true, {
      id: "p1",
      name: "Crag Hack",
      factionId: "stronghold",
      heroDefId: "crag_hack"
    });
    p1Town(state).buildings = withGuild
      ? ["stronghold.citadel", "stronghold.freelancers_guild"]
      : ["stronghold.citadel"];
    state.players.p1.townTokens.population = true;
    // Goblins Pack: Stack gold 3 — but the player holds NO gold at all.
    state.players.p1.army = [{ id: "army_gob", unitDefId: "stronghold.goblins", side: "pack" }];
    state.players.p1.resources = { gold: 0, buildingMaterials: 10, valuables: 10 };
    return state;
  }

  it("with the Guild, a gold-less player buys a Stack paying materials/valuables", () => {
    let state = guildState("guild-stack", true);
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.kind === "stack"
    );
    expect(offer, "the Stack purchase is offered on substituted resources").toBeTruthy();

    state = applyOk(state, offer!.action);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(0);
    expect(
      state.players.p1.resources.buildingMaterials + state.players.p1.resources.valuables,
      "the 3 missing gold was paid in substituted resources"
    ).toBeLessThan(20);
  });

  it("CONTROL: without the Guild the same purchase is neither offered nor accepted", () => {
    const state = guildState("guild-stack-off", false);
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "POPULATION_ACTION" && legal.action.purchases[0]?.kind === "stack"
      )
    ).toBe(false);
    const result = applyAction(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "stronghold.goblins", armyUnitId: "army_gob" }]
    });
    expect(result.errors[0]?.message).toContain("Not enough resources");
  });
});

// ===========================================================================
// 5. Conflux Garden of Life — free Sprite Stack
// ===========================================================================

describe("Conflux Garden of Life: free Stack on the Sprites Pack", () => {
  function gardenRound(seed: string, stacksOn: boolean): GameState {
    const state = makeGame(seed, stacksOn, {
      id: "p1",
      name: "Luna",
      factionId: "conflux",
      heroDefId: "luna"
    });
    p1Town(state).buildings = ["conflux.garden_of_life"];
    state.players.p1.army = [{ id: "army_spr", unitDefId: "conflux.sprites", side: "pack" }];
    state.round = 2;
    state.decks.astrologers!.drawPile = ["astrologers.dead_silence"];
    startAdventureRound(state);
    pumpAdventureQueues(state);
    return state;
  }

  it("offers (and grants) a FREE Stack on the owned Sprites Pack", () => {
    let state = gardenRound("garden-stack", true);
    const stackPick = visitAction(state, "Add a Stack to Sprites (free)");
    expect(stackPick, "the Garden freebie covers a Sprite Stack").toBeTruthy();
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, stackPick!.action);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(goldBefore);
  });

  it("CONTROL: with the rule OFF a Sprites Pack gets NO Garden offer at all", () => {
    // A Pack cannot be recruited (owned) nor reinforced (not Few) — without the
    // Stack extension the Garden queues nothing for it.
    const state = gardenRound("garden-stack-off", false);
    expect(visitAction(state, "Add a Stack to")).toBeUndefined();
    expect(visitAction(state, "Sprites")).toBeUndefined();
  });
});

// ===========================================================================
// 6. Cove Pub — −3 gold Stack
// ===========================================================================

describe("Cove Pub: flat −3 gold Stack purchases", () => {
  function pubRound(seed: string, stacksOn: boolean): GameState {
    const state = makeGame(seed, stacksOn, { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" });
    p1Town(state).buildings = ["cove.pub"];
    state.players.p1.resources.gold = 20;
    // Sea Dogs Pack: Stack gold 7 (6 printed + bronze 1) → −3 = 4.
    state.players.p1.army = [{ id: "army_sd", unitDefId: "cove.sea_dogs", side: "pack" }];
    state.round = 2;
    state.decks.astrologers!.drawPile = ["astrologers.dead_silence"];
    startAdventureRound(state);
    pumpAdventureQueues(state);
    return state;
  }

  it("offers the Stack at 3 less gold and charges the discounted price", () => {
    let state = pubRound("pub-stack", true);
    const stackPick = visitAction(state, "Add a Stack to Sea Dogs (4 gold)");
    expect(stackPick, "the Pub deal covers the Sea Dogs Stack at 7−3").toBeTruthy();
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, stackPick!.action);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.resources.gold).toBe(goldBefore - 4);
  });

  it("CONTROL: with the rule OFF the Pub offer contains no Stack options", () => {
    const state = pubRound("pub-stack-off", false);
    expect(visitAction(state, "Add a Stack to")).toBeUndefined();
  });
});

// ===========================================================================
// 7. Legion artifacts — a voucher reserved for (and spent on) a Stack
// ===========================================================================

describe("Legion artifacts: vouchers apply to Stack purchases", () => {
  function legionState(seed: string, stacksOn: boolean): GameState {
    const state = makeGame(seed, stacksOn, { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" });
    p1Town(state).buildings = ["cove.citadel"];
    state.players.p1.townTokens.population = true;
    state.players.p1.resources.gold = 20;
    state.players.p1.army = [{ id: "army_sd", unitDefId: "cove.sea_dogs", side: "pack" }];
    return state;
  }

  it("legionDiscountTargets lists the Stack purchase (rule on) and not with the rule off", () => {
    const on = legionState("legion-stack-targets", true);
    expect(
      legionDiscountTargets(on, "p1").some((target) => target.purchase.kind === "stack"),
      "a stack-eligible Pack is a Legion target"
    ).toBe(true);

    const off = legionState("legion-stack-targets-off", false);
    expect(legionDiscountTargets(off, "p1").some((target) => target.purchase.kind === "stack")).toBe(false);
  });

  it("a banked stack voucher knocks its gold off the purchase and is consumed", () => {
    let state = legionState("legion-stack-buy", true);
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "stack", armyUnitId: "army_sd" } }
    ];
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "cove.sea_dogs", armyUnitId: "army_sd" }]
    });
    // Sea Dogs Stack gold 7 − 4 voucher = 3.
    expect(state.players.p1.resources.gold).toBe(goldBefore - 3);
    expect(state.players.p1.army[0].stacks).toBe(1);
    expect(state.players.p1.recruitDiscounts, "the voucher is single-use").toHaveLength(0);
  });

  it("CONTROL: a REINFORCE voucher for the same card never discounts its Stack", () => {
    let state = legionState("legion-stack-wrong-kind", true);
    state.players.p1.recruitDiscounts = [
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "reinforce", armyUnitId: "army_sd" } }
    ];
    const goldBefore = state.players.p1.resources.gold;
    state = applyOk(state, {
      type: "POPULATION_ACTION",
      playerId: "p1",
      purchases: [{ kind: "stack", unitDefId: "cove.sea_dogs", armyUnitId: "army_sd" }]
    });
    expect(state.players.p1.resources.gold, "full price — the reinforce voucher does not match").toBe(goldBefore - 7);
    expect(state.players.p1.recruitDiscounts, "the mismatched voucher is kept").toHaveLength(1);
  });
});

// ===========================================================================
// 8. Terrible Plague — weakened by Stacks
// ===========================================================================

describe("Terrible Plague: a Stacked pack sheds one layer instead of flipping", () => {
  function plagueRound(seed: string, p1Army: GameState["players"]["p1"]["army"]): GameState {
    const state = makeGame(seed, true);
    state.players.p1.army = p1Army;
    // CONTROL seat in the SAME game: p2's unstacked pack must still flip.
    state.players.p2.army = [{ id: "army_p2_griffins", unitDefId: "castle.griffins", side: "pack" }];
    state.round = 2;
    state.decks.astrologers!.drawPile = ["astrologers.terrible_plague"];
    startAdventureRound(state);
    pumpAdventureQueues(state);
    return state;
  }

  it("auto-resolution: the lone Stacked pack loses 1 Stack and stays a Pack; the unstacked control flips", () => {
    const state = plagueRound("plague-weak", [
      { id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack", stacks: 2 }
    ]);

    const skeletons = state.players.p1.army[0];
    expect(skeletons.side, "the Stacked pack survives as a Pack").toBe("pack");
    expect(skeletons.stacks).toBe(1);
    expect(
      state.eventLog.some(
        (event) => event.type === "ARMY_STACK_LOST" && event.reason?.includes("Terrible Plague")
      )
    ).toBe(true);

    // CONTROL: p2's plain pack takes the printed flip.
    expect(state.players.p2.army[0].side).toBe("few");
    expect(
      state.eventLog.some((event) => event.type === "ARMY_UNIT_FLIPPED" && event.playerId === "p2")
    ).toBe(true);
  });

  it("CONTROL: Pandora's Silver Muster reverse is a PLAIN flip — a Stack never absorbs it", () => {
    // The shared FLIP_PACK_TO_FEW step is also created by Pandora 173's
    // "Reverse 1 Silver unit to its Handful side". Only the PLAGUE flip is
    // weakened by Stacks; the Pandora reverse must flip a Stacked pack whole.
    const silverId = Object.entries(coreUnitDefinitions).find(
      ([, def]) => def.tier === "silver" && def.pack
    )?.[0];
    expect(silverId, "a silver unit with a Pack side must exist").toBeTruthy();
    const state = makeGame("plague-vs-pandora", true);
    state.players.p1.army = [{ id: "army_silver", unitDefId: silverId!, side: "pack", stacks: 2 }];

    openPandoraSilverRefresh(state, "p1");
    const reverse = visitAction(state, "Reverse 1 Silver unit");
    expect(reverse, "the reverse option is offered").toBeTruthy();
    const after = applyOk(state, reverse!.action);

    const unit = after.players.p1.army[0];
    expect(unit.side, "the Stacked silver pack flips whole").toBe("few");
    expect(unit.stacks ?? 0).toBe(0);
    expect(
      after.eventLog.some((event) => event.type === "ARMY_STACK_LOST"),
      "no Stack layer absorbs a Pandora reverse"
    ).toBe(false);
    const flipped = after.eventLog.find((event) => event.type === "ARMY_UNIT_FLIPPED");
    expect(flipped?.type === "ARMY_UNIT_FLIPPED" && flipped.reason).toBe("Pandora's Box");
  });

  it("multi-pack choice: the Stacked pick is labeled 'Weakened by Stacks' and absorbs the flip", () => {
    let state = plagueRound("plague-weak-choice", [
      { id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack", stacks: 1 },
      { id: "army_zomb", unitDefId: "necropolis.zombies", side: "pack" }
    ]);

    const weakened = visitAction(state, "Weakened by Stacks: Skeletons loses 1 Stack");
    expect(weakened, "the Stacked pack advertises the absorb").toBeTruthy();
    expect(visitAction(state, "Flip Zombies"), "the unstacked pack keeps the plain flip label").toBeTruthy();

    state = applyOk(state, weakened!.action);
    const skeletons = state.players.p1.army.find((unit) => unit.id === "army_skel")!;
    expect(skeletons.side).toBe("pack");
    expect(skeletons.stacks ?? 0).toBe(0);
  });
});
