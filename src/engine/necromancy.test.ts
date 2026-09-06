import { describe, expect, it } from "vitest";
import {
  applyAction,
  canPlaceTransformOn,
  createAdventureGameState,
  findEvent,
  getLegalActions,
  getMainHero,
  insertUnitTransform,
  makeCombatUnitFromArmy,
  makeUnitTransformState,
  markUnitRemovedIfNeeded,
  specialtyTransformHealth,
  type CombatUnitState,
  type GameAction,
  type GameState,
  type UnitTransformState
} from "./index";
import {
  finalizeAdventureCombat,
  pumpAdventureQueues,
  startNeutralEncounter
} from "./adventure-reducer";
import type { CombatState, MapFieldState } from "./state";
import { cardLibrary } from "@/data/cards/library";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** Preserve the pre-change blocking flow for the legacy-behavior regression tests below. */
function withImmediateReinforcementPrompts(state: GameState): GameState {
  if (state.adventure) {
    state.adventure.houseRules = {
      ...(state.adventure.houseRules ?? {}),
      "immediate-reinforcement-prompts": true
    };
  }
  return state;
}

const HORDE = makeTransformEffect("specialty.sandro.1");
const HORDE_ZOMBIES = makeTransformEffect("specialty.sandro.4");
const LEGION = makeTransformEffect("specialty.sandro.6");

function makeTransformEffect(cardId: string) {
  const effect = cardLibrary[cardId]?.effect;
  if (effect?.type !== "TRANSFORM_UNIT") {
    throw new Error(`${cardId} is not a TRANSFORM_UNIT card`);
  }
  return effect;
}

describe("Sandro's Cloak — BINH skeleton HP house rule", () => {
  it("gives the Horde and Legion of Skeletons 3 HP in BINH, printed 2 in legacy; Zombies keep 3", () => {
    expect(specialtyTransformHealth("binh", "specialty.sandro.1", 2)).toBe(3);
    expect(specialtyTransformHealth("binh", "specialty.sandro.6", 2)).toBe(3);
    expect(specialtyTransformHealth("binh", "specialty.sandro.4", 3)).toBe(3);
    expect(specialtyTransformHealth("legacy", "specialty.sandro.1", 2)).toBe(2);
    expect(specialtyTransformHealth("legacy", "specialty.sandro.6", 2)).toBe(2);
  });

  it("the level I card text and the Necromancy card are implemented", () => {
    expect(cardLibrary["specialty.sandro.4"].implementationStatus).toBe("implemented");
    expect(cardLibrary["specialty.sandro.6"].implementationStatus).toBe("implemented");
    expect(cardLibrary["ability.necromancy"].implementationStatus).toBe("implemented");
    expect(cardLibrary["ability.necromancy"].effect.type).toBe("NECROMANCY_REINFORCE");
  });
});

describe("Sandro's Cloak — stacking rules (wiki FAQ)", () => {
  it("level I/IV go on a bare pack; the Legion goes on Few, Pack, or even a Horde and stays on top", () => {
    // Level I needs a Pack of Skeletons.
    expect(canPlaceTransformOn("Skeletons", "few", undefined, HORDE)).toBe(false);
    expect(canPlaceTransformOn("Skeletons", "pack", undefined, HORDE)).toBe(true);
    // Wrong unit name is rejected.
    expect(canPlaceTransformOn("Zombies", "pack", undefined, HORDE)).toBe(false);
    expect(canPlaceTransformOn("Zombies", "pack", undefined, HORDE_ZOMBIES)).toBe(true);

    // Level VI Legion goes on a Few or a Pack.
    expect(canPlaceTransformOn("Skeletons", "few", undefined, LEGION)).toBe(true);
    expect(canPlaceTransformOn("Skeletons", "pack", undefined, LEGION)).toBe(true);

    // "even a Horde": a Legion may be added over an existing Horde.
    const horde = [makeUnitTransformState(HORDE, "specialty.sandro.1", "binh")];
    expect(canPlaceTransformOn("Skeletons", "pack", horde, LEGION)).toBe(true);
    // But not a second Legion.
    const legion = [makeUnitTransformState(LEGION, "specialty.sandro.6", "binh")];
    expect(canPlaceTransformOn("Skeletons", "pack", legion, LEGION)).toBe(false);
    // And the Horde cannot go on while a Horde is already there.
    expect(canPlaceTransformOn("Skeletons", "pack", horde, HORDE)).toBe(false);
  });

  it("keeps the alwaysOnTop Legion above a later Horde", () => {
    const legion = makeUnitTransformState(LEGION, "specialty.sandro.6", "binh");
    const horde = makeUnitTransformState(HORDE, "specialty.sandro.1", "binh");
    const stack = insertUnitTransform([legion], horde);
    expect(stack.at(-1)?.cardId).toBe("specialty.sandro.6"); // Legion still on top
    expect(stack[0]?.cardId).toBe("specialty.sandro.1"); // Horde tucked underneath
  });
});

describe("Sandro's Cloak — defeat cascade", () => {
  function makeSkeletonCombatState(transforms: UnitTransformState[]): { state: GameState; unit: CombatUnitState } {
    const unit = makeCombatUnitFromArmy(
      { id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack", transforms },
      "p1",
      "unit_skel",
      1,
      "binh"
    );
    if (!unit) {
      throw new Error("Expected a skeleton combat unit.");
    }
    const state = {
      ruleset: "binh",
      players: {
        p1: { id: "p1", discard: [], army: [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "pack", transforms: transforms.map((entry) => ({ ...entry })) }] }
      },
      combat: { units: { unit_skel: unit } },
      eventLog: [],
      eventCounter: 0
    } as unknown as GameState;
    return { state, unit };
  }

  it("discards a defeated Cloak and reveals the Pack underneath with the excess damage", () => {
    const horde = makeUnitTransformState(HORDE, "specialty.sandro.1", "binh");
    const { state, unit } = makeSkeletonCombatState([horde]);
    // BINH Horde HP is 3; the Pack of Skeletons underneath has its printed HP.
    expect(unit.maxHealth).toBe(3);
    expect(unit.cardName).toBe("Horde of Skeletons");

    unit.damage = 4; // lethal to the Horde (3 HP), 1 carries over
    markUnitRemovedIfNeeded(state, unit);

    expect(state.players.p1.discard).toContain("specialty.sandro.1");
    expect(unit.transforms ?? []).toHaveLength(0);
    expect(unit.cardName).toBe("Pack of Skeletons");
    expect(unit.damage).toBe(1);
    expect(findEvent(state, "SPECIALTY_CARD_DEFEATED")).toMatchObject({
      cardId: "specialty.sandro.1",
      revealedName: "Pack of Skeletons"
    });
  });
});

describe("Necromancy ability — after-combat window", () => {
  function startSandroGame(): GameState {
    {
      const _g = createAdventureGameState({
      seed: "necro-seed",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
      for (const _pl of Object.values(_g.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
      return withImmediateReinforcementPrompts(_g);
    }
  }

  it("only offers Necromancy while the after-combat window is open", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];

    const before = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(before).toHaveLength(0);

    // The window is the now-or-never gate opened right after a non-Quick win.
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    const during = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(during.length).toBeGreaterThan(0);
  });

  it("CAN be played even when the copy was drawn from the shared Ability deck (Necropolis hero — wiki p.24)", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    // This copy came out of the shared Ability-deck search (a level-up Ability
    // Search). The printed "keep it without being able to play it" clause is for
    // NON-Necropolis heroes ONLY, so a Necropolis hero (Sandro) may still play a
    // deck-drawn copy. (Re-adding the old exclusion makes this offer 0 again.)
    state.players.p1.deckDrawnAbilityCardIds = ["ability.necromancy"];

    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(plays.length).toBeGreaterThan(0);
  });

  it("is Necropolis-only — a Castle hero who holds it can never play it", () => {
    const state = startSandroGame();
    state.players.p2.hand = ["ability.necromancy"];
    state.players.p2.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p2" };
    state.activePlayerId = "p2";

    const plays = getLegalActions(state, "p2").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(plays).toHaveLength(0);
  });

  it("playing Necromancy queues the half-gold choice and keeps the window open for more bonuses", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    // Give Sandro a Few skeleton to reinforce and the gold to do it.
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.necromancy" &&
        (legal.action.mode ?? "basic") === "basic"
    );
    expect(play).toBeDefined();

    const next = apply(state, play!.action);
    expect(next.players.p1.necromancyWindow).toBe(true);
    expect(next.adventure?.pendingNecromancy?.playerId).toBe("p1");
    // The card is consumed ONLY on a successful upgrade — until the reinforce is
    // resolved it stays in hand, never the discard.
    expect(next.players.p1.discard).not.toContain("ability.necromancy");
    expect(next.players.p1.hand).toContain("ability.necromancy");
    // A reinforce prompt is now waiting for the player.
    const hasReinforcePrompt =
      Boolean(next.adventure?.pendingVisit) || (next.adventure?.rewardQueue.length ?? 0) > 0;
    expect(hasReinforcePrompt).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // The reported bug: Necromancy was discarded the instant it was played, so a
  // play with no eligible target — or a declined reinforce — LOST the card for
  // nothing. House rule (owner): you lose Necromancy ONLY when it actually
  // upgrades a unit; skipping or reinforcing nothing keeps the card in hand.
  // Each case below fails if the deferred-discard logic is removed.
  // ---------------------------------------------------------------------------
  function reinforceActions(state: GameState) {
    return getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP"
    );
  }

  it("discards Necromancy ONLY after a successful reinforce (card leaves hand on the upgrade, not the play)", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    let next = apply(state, play!.action);
    // Still in hand right after the play (the reinforce is pending).
    expect(next.players.p1.hand).toContain("ability.necromancy");
    // The hand→discard flight (CARD_PLAYED) must NOT fire yet — the card hasn't moved.
    const playedBefore = next.eventLog.filter(
      (event) => event.type === "CARD_PLAYED" && event.cardId === "ability.necromancy"
    );
    expect(playedBefore).toHaveLength(0);

    const reinforce = getLegalActions(next, "p1").find((legal) => /Skeletons/.test(legal.label));
    expect(reinforce, "the affordable Skeleton reinforce should be offered").toBeTruthy();
    next = apply(next, reinforce!.action);

    // The unit upgraded Few → Pack, and NOW the card is spent.
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("pack");
    expect(next.players.p1.discard).toContain("ability.necromancy");
    expect(next.players.p1.hand).not.toContain("ability.necromancy");
    // CARD_PLAYED fires exactly once, now, at the real hand→discard move.
    const playedAfter = next.eventLog.filter(
      (event) => event.type === "CARD_PLAYED" && event.cardId === "ability.necromancy"
    );
    expect(playedAfter).toHaveLength(1);
  });

  it("keeps Necromancy when the player plays it but chooses Skip in the reinforce prompt", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    let next = apply(state, play!.action);

    const skip = reinforceActions(next).find((legal) => /Skip/.test(legal.label));
    expect(skip, "the reinforce prompt should offer a Skip").toBeTruthy();
    next = apply(next, skip!.action);

    // Nothing upgraded; the card survives in hand for a later combat.
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("few");
    expect(next.players.p1.hand).toContain("ability.necromancy");
    expect(next.players.p1.discard).not.toContain("ability.necromancy");
    // No hand→discard flight is ever emitted for a card that was never consumed.
    const played = next.eventLog.filter(
      (event) => event.type === "CARD_PLAYED" && event.cardId === "ability.necromancy"
    );
    expect(played).toHaveLength(0);
  });

  it("keeps Necromancy when it is played with NO eligible/affordable target", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    // A Few skeleton exists, but 0 gold means no reinforce is affordable.
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;

    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    let next = apply(state, play!.action);

    // No reinforce option — only an acknowledgement prompt — and the card is kept.
    const reinforce = reinforceActions(next).filter((legal) => /Reinforce/.test(legal.label));
    expect(reinforce).toHaveLength(0);
    const ack = reinforceActions(next).find((legal) => /OK/.test(legal.label));
    if (ack) {
      next = apply(next, ack.action);
    }
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("few");
    expect(next.players.p1.hand).toContain("ability.necromancy");
    expect(next.players.p1.discard).not.toContain("ability.necromancy");
  });
});

describe("Necromancy — adjustable reinforcement bank (new default)", () => {
  function startAdjustableGame(): GameState {
    const state = createAdventureGameState({
      seed: "necro-adjustable",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.players.p1.army = [{ id: "army_wraiths", unitDefId: "necropolis.wraiths", side: "few" }];
    state.players.p1.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
    state.players.p1.hand = ["ability.necromancy", "artifact.legs_of_legion"];
    state.players.p1.necromancyWindow = true;
    state.adventure!.pendingNecromancy = { playerId: "p1" };
    return state;
  }

  it("allows the ability and a Necromancy specialty after the same combat", () => {
    const state = startAdjustableGame();
    state.players.p1.hand = ["ability.necromancy", "specialty.vidomina.1"];
    state.adventure!.pendingNecromancy = { playerId: "p1", remaining: 2 };

    const first = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(first).toBeTruthy();
    let next = apply(state, first!.action);
    expect(next.adventure?.pendingNecromancy?.remaining).toBe(1);
    expect(
      getLegalActions(next, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.vidomina.1"
      )
    ).toBe(true);

    const second = getLegalActions(next, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.vidomina.1"
    );
    expect(second).toBeTruthy();
    next = apply(next, second!.action);
    expect(next.adventure?.pendingNecromancy?.remaining).toBe(0);
    expect(next.players.p1.reinforcementDiscounts).toHaveLength(2);
    expect(
      getLegalActions(next, "p1").some(
        (legal) => legal.action.type === "SKIP_NECROMANCY"
      )
    ).toBe(true);
  });

  // Resolving the window expires the offers it banked (otherwise the exploit is
  // back: collect the field reward, THEN reinforce with it). The sweep is scoped
  // by `pendingNecromancy.discountIds` — the ids stamped as each card is played.
  // Without that read the field is dead state and the sweep is source-wide,
  // destroying any Necromancy bank the player still holds from elsewhere.
  it("Resolve expires the offers THIS window banked, and only those", () => {
    let state = startAdjustableGame();
    const necromancy = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    state = apply(state, necromancy!.action);

    const banked = state.players.p1.reinforcementDiscounts ?? [];
    expect(banked).toHaveLength(1);
    expect(
      state.adventure?.pendingNecromancy?.discountIds,
      "the window must record the offer it created"
    ).toEqual([banked[0]!.id]);

    // Stands in for a bank this window did NOT create (it is not in discountIds).
    state.players.p1.reinforcementDiscounts = [
      ...banked,
      { ...banked[0]!, id: "bank_from_elsewhere" }
    ];

    state = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(state.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(
      (state.players.p1.reinforcementDiscounts ?? []).map((discount) => discount.id),
      "the window's own unredeemed offer expires; a foreign one survives"
    ).toEqual(["bank_from_elsewhere"]);
  });

  it("banks Necromancy without forcing a target, lets Legion stack, then redeems source-first", () => {
    let state = startAdjustableGame();
    const necromancy = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    expect(necromancy).toBeTruthy();
    state = apply(state, necromancy!.action);

    expect(state.pendingChoice).toBeNull();
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
    expect(state.players.p1.discard).toContain("ability.necromancy");
    expect(state.players.p1.reinforcementDiscounts).toHaveLength(1);

    const legion = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.legs_of_legion" &&
        legal.action.optionIndex === 0
    );
    expect(legion, "Legion remains playable while Necromancy is banked").toBeTruthy();
    state = apply(state, legion!.action);
    const target = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.includes("Wraiths")
    );
    expect(target).toBeTruthy();
    state = apply(state, target!.action);

    const redeem = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "REDEEM_REINFORCEMENT_DISCOUNT" &&
        legal.action.armyUnitId === "army_wraiths"
    );
    // Wraiths Pack 6 → Necromancy floor-half 3 → Legs −4 = free.
    expect(redeem?.label).toContain("free");
    state = apply(state, redeem!.action);
    expect(state.players.p1.resources.gold).toBe(20);
    expect(state.players.p1.army[0]?.side).toBe("pack");
    expect(state.players.p1.reinforcementDiscounts).toEqual([]);
    expect(state.players.p1.recruitDiscounts).toEqual([]);
  });

  it("allows Estates to fund the same atomic purchase before Resolve", () => {
    let state = startAdjustableGame();
    state.players.p1.army = [
      {
        id: "army_skel",
        unitDefId: "necropolis.skeletons",
        side: "few"
      }
    ];
    state.players.p1.resources.gold = 0;
    state.players.p1.hand = ["ability.necromancy", "ability.estates"];

    const necromancy = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.necromancy"
    );
    state = apply(state, necromancy!.action);
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "REDEEM_REINFORCEMENT_DISCOUNT"
      )
    ).toBe(false);

    const estates = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.estates" &&
        (legal.action.mode ?? "basic") === "basic"
    );
    expect(estates, "Estates must be offered inside the window").toBeTruthy();
    state = apply(state, estates!.action);
    expect(state.players.p1.resources.gold).toBe(2);

    const redeem = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "REDEEM_REINFORCEMENT_DISCOUNT" &&
        legal.action.armyUnitId === "army_skel"
    );
    expect(redeem).toBeTruthy();
    state = apply(state, redeem!.action);
    expect(state.players.p1.army[0]?.side).toBe("pack");
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");

    state = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(state.adventure?.pendingNecromancy ?? null).toBeNull();
  });

  it("does not release a deferred field after redeeming; only the explicit Resolve pays it", () => {
    let state = startAdjustableGame();
    const hero = getMainHero(state, "p1")!;
    const fieldId = "atomic-water-wheel";
    hero.spaceId = fieldId;
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "atomic-tile",
      slot: 0,
      location: "water_wheel",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.pendingNecromancy = {
      playerId: "p1",
      remaining: 1,
      heroId: hero.id,
      fieldId,
      deferredReward: { kind: "field-visit", heroId: hero.id, fieldId }
    };
    state.players.p1.army = [
      {
        id: "army_skel",
        unitDefId: "necropolis.skeletons",
        side: "few"
      }
    ];
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.resources.gold = 5;

    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.necromancy"
    );
    state = apply(state, play!.action);
    const redeem = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "REDEEM_REINFORCEMENT_DISCOUNT" &&
        legal.action.armyUnitId === "army_skel"
    );
    state = apply(state, redeem!.action);

    expect(state.players.p1.resources.gold).toBe(4);
    expect(state.adventure?.fields[fieldId].blackCube).toBe(false);
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");

    state = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(state.players.p1.resources.gold).toBe(7);
    expect(state.adventure?.fields[fieldId].blackCube).toBe(true);
  });

  it("blocks movement and expires an unused Necromancy bank on explicit Resolve", () => {
    let state = startAdjustableGame();
    const necromancy = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
    );
    state = apply(state, necromancy!.action);
    expect(state.players.p1.reinforcementDiscounts).toHaveLength(1);

    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "MOVE_HERO"
      )
    ).toBe(false);
    state = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(state.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(state.players.p1.reinforcementDiscounts).toEqual([]);
  });
});

describe("Necromancy ability — now-or-never timing (BINH house rule)", () => {
  function startSandroGame(): GameState {
    {
      const _g = createAdventureGameState({
      seed: "necro-timing",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
      for (const _pl of Object.values(_g.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
      return withImmediateReinforcementPrompts(_g);
    }
  }

  /**
   * Stages a just-finished neutral combat won by p1 standing on a Water Wheel
   * (a visit that pays out 3 gold). finalizeAdventureCombat then runs the real
   * after-combat flow: the win, the (deferred) field visit, and the window.
   */
  function stageNeutralWinOnGoldField(state: GameState): { fieldId: string; heroId: string } {
    const hero = getMainHero(state, "p1")!;
    const fieldId = "99,1";
    const field: MapFieldState = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "water_wheel", // pays 3 gold when visited
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.adventure!.fields[fieldId] = field;
    hero.spaceId = fieldId;
    state.activePlayerId = "p1";
    state.combat = {
      context: { kind: "neutral", heroId: hero.id, fieldId, difficulty: 1, hasAzure: false },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;
    return { fieldId, heroId: hero.id };
  }

  /** Every reinforce-choice label currently waiting (prompt + reward queue). */
  function reinforceLabels(state: GameState): string[] {
    const labels: string[] = [];
    for (const step of state.adventure?.pendingVisit?.steps ?? []) {
      if (step.type === "CHOOSE_ONE") {
        labels.push(...step.options.map((option) => option.label));
      }
    }
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

  it("withholds the just-won field's reward, and allows nothing but Necromancy or Skip", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    const { fieldId } = stageNeutralWinOnGoldField(state);

    finalizeAdventureCombat(state);

    // The window is open and the 3-gold Water Wheel is NOT paid out yet.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(state.players.p1.resources.gold).toBe(0);
    expect(state.adventure?.fields[fieldId].blackCube).toBe(false);

    // The only legal moves are play-Necromancy or skip — no movement, no end turn.
    const legal = getLegalActions(state, "p1");
    expect(
      legal.some((l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy")
    ).toBe(true);
    expect(legal.some((l) => l.action.type === "SKIP_NECROMANCY")).toBe(true);
    expect(legal.some((l) => l.action.type === "MOVE_HERO" || l.action.type === "END_TURN")).toBe(false);
  });

  it("Resolve releases the withheld field reward and closes the window for good", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    const { fieldId } = stageNeutralWinOnGoldField(state);
    finalizeAdventureCombat(state);

    const next = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });

    expect(next.players.p1.resources.gold).toBe(3); // Water Wheel paid out, but only now
    expect(next.adventure?.fields[fieldId].blackCube).toBe(true);
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(next.players.p1.necromancyWindow).toBe(false);
    // Skipping never costs the card — it stays in hand for a later combat.
    expect(next.players.p1.hand).toContain("ability.necromancy");
    expect(next.players.p1.discard).not.toContain("ability.necromancy");
    // It never reopens on its own — Necromancy is no longer offered.
    expect(
      getLegalActions(next, "p1").some(
        (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
      )
    ).toBe(false);
  });

  it("prices the reinforce on the gold held BEFORE the field reward (no 'collect then reinforce')", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    // A Few Skeleton reinforces for 1 gold (half the 3-gold Pack). The player
    // holds 0; ONLY the withheld 3-gold Water Wheel would make it affordable —
    // and that reward must be out of reach while deciding.
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    stageNeutralWinOnGoldField(state);
    finalizeAdventureCombat(state);

    const play = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
    );
    const afterPlay = apply(state, play!.action);

    // Options were built on 0 gold: the Skeleton reinforce is NOT offered. If the
    // field reward had landed first (the bug this rule prevents) it would be.
    expect(reinforceLabels(afterPlay).some((label) => /Skeletons/.test(label))).toBe(false);
    expect(afterPlay.players.p1.resources.gold).toBe(0);
  });

  it("after a paid reinforce, the field reward lands — and only then", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 2; // covers the 1-gold Skeleton reinforce
    stageNeutralWinOnGoldField(state);
    finalizeAdventureCombat(state);

    const play = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
    );
    let next = apply(state, play!.action);

    const reinforce = getLegalActions(next, "p1").find((l) => /Skeletons/.test(l.label));
    expect(reinforce, "the 1-gold Skeleton reinforce should be affordable on the 2 gold held").toBeTruthy();
    next = apply(next, reinforce!.action);

    // The first card paid 1 for the reinforce (2 -> 1). The second-card window
    // stays open until the player skips it, then the withheld Water Wheel adds 3.
    expect(next.players.p1.resources.gold).toBe(1);
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("pack");
    expect(next.adventure?.pendingNecromancy?.remaining).toBe(0);
    next = apply(next, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(next.players.p1.resources.gold).toBe(4);
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
  });

  it("keeps a free Skeleton reinforce and the field reward behind the window", () => {
    const state = startSandroGame();
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    const { fieldId } = stageNeutralWinOnGoldField(state);
    // The last guard killed was a Skeleton — a Necropolis hero earns a free
    // bronze reinforce. Both that combat reward and the field gold wait.
    state.combat!.skeletonGuardDefeated = true;

    finalizeAdventureCombat(state);
    pumpAdventureQueues(state);

    // Every queued combat reward stays behind the atomic window.
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
    expect(getLegalActions(state, "p1").some((l) => /Skeleton/i.test(l.label))).toBe(false);
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(state.players.p1.resources.gold).toBe(0);
    expect(state.adventure?.fields[fieldId].blackCube).toBe(false);

    // Once Resolve is pressed, the field may pay and the queued Skeleton reward
    // can surface; neither was usable to fund Necromancy.
    const next = apply(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(next.players.p1.resources.gold).toBe(3);
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-combat coverage: fought PvP wins open for an off-turn winner, while
// Quick Combat remains the one combat-win path that never opens Necromancy.
// ---------------------------------------------------------------------------
describe("Necromancy prompt coverage across combat kinds", () => {
  function coverageGame(seed: string, withThirdPlayer = false): GameState {
    const state = createAdventureGameState({
      seed,
      ruleset: "binh",
      difficulty: "normal",
      players: [
        {
          id: "p1",
          name: "Catherine",
          factionId: "castle",
          heroDefId: "catherine"
        },
        {
          id: "p2",
          name: "Sandro",
          factionId: "necropolis",
          heroDefId: "sandro"
        },
        ...(withThirdPlayer ? [{ id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }] : []),
      ],
      rollFirstPlayer: false
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    return state;
  }

  function stageSpecialNeutralWin(
    state: GameState,
    context: {
      waveAssault?: { wave: number };
      raidBossId?: string;
      dungeonFloor?: number;
    }
  ): string {
    const hero = getMainHero(state, "p2")!;
    const fieldId = `special-necro-${context.waveAssault ? "wave" : context.raidBossId ? "raid" : "dungeon"}`;
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "special-necro-tile",
      slot: 0,
      location: "empty_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    hero.spaceId = fieldId;
    state.players.p2.hand = ["ability.necromancy"];
    state.combat = {
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId,
        difficulty: 0,
        hasAzure: false,
        ...context
      },
      attackerPlayerId: "p2",
      defenderPlayerId: "neutral",
      outcome: {
        winnerPlayerId: "p2",
        defeatedPlayerId: "neutral",
        reason: "all-enemy-units-defeated"
      },
      units: {}
    } as unknown as CombatState;
    return fieldId;
  }

  it("opens for an off-turn PvP defender and allows hand bonuses there", () => {
    // Keep an unbeaten rival alive so this battle does not finish Conquest.
    const state = coverageGame("necro-pvp-defender", true);
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    const fieldId = "pvp-necro-field";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "pvp-tile",
      slot: 0,
      location: "water_wheel",
      difficulty: 0,
      blackCube: true,
      flagOwnerId: "p2",
      everFlagged: true,
      settlementResource: null
    };
    attacker.spaceId = fieldId;
    defender.spaceId = fieldId;
    state.activePlayerId = "p1";
    state.players.p2.hand = ["ability.necromancy", "ability.estates"];
    state.players.p2.army = [
      {
        id: "p2-skeletons",
        unitDefId: "necropolis.skeletons",
        side: "few"
      }
    ];
    state.combat = {
      context: {
        kind: "player",
        attackerHeroId: attacker.id,
        defenderHeroId: defender.id,
        fieldId
      },
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      outcome: {
        winnerPlayerId: "p2",
        defeatedPlayerId: "p1",
        reason: "all-enemy-units-defeated"
      },
      units: {}
    } as unknown as CombatState;

    finalizeAdventureCombat(state);

    expect(state.activePlayerId).toBe("p1");
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p2");
    const legal = getLegalActions(state, "p2");
    expect(
      legal.some(
        (entry) =>
          entry.action.type === "PLAY_CARD" &&
          entry.action.cardId === "ability.necromancy"
      )
    ).toBe(true);
    expect(
      legal.some(
        (entry) =>
          entry.action.type === "PLAY_CARD" &&
          entry.action.cardId === "ability.estates"
      )
    ).toBe(true);
    expect(
      legal.some((entry) => entry.action.type === "SKIP_NECROMANCY")
    ).toBe(true);
  });

  it("defers a Calamity Wave payout behind the same window", () => {
    let state = coverageGame("necro-wave");
    const goldBefore = state.players.p2.resources.gold;
    stageSpecialNeutralWin(state, { waveAssault: { wave: 1 } });

    finalizeAdventureCombat(state);

    expect(state.adventure?.pendingNecromancy?.deferredReward).toEqual({
      kind: "wave",
      wave: 1
    });
    expect(state.players.p2.resources.gold).toBe(goldBefore);

    state = apply(state, { type: "SKIP_NECROMANCY", playerId: "p2" });
    expect(state.players.p2.resources.gold).toBeGreaterThan(goldBefore);
  });

  it("defers a Raid Boss kill payout and lair clear behind the same window", () => {
    let state = coverageGame("necro-raid");
    const fieldId = stageSpecialNeutralWin(state, { raidBossId: "boss-1" });
    state.adventure!.fields[fieldId].location = "rift_lair";
    state.adventure!.fields[fieldId].riftLair = "boss-1";
    state.adventure!.raidBosses = {
      "boss-1": {
        defId: "goblin_king",
        fieldId,
        layersLeft: 1,
        layerBreaks: {},
        spawnedRound: state.round
      }
    };
    const goldBefore = state.players.p2.resources.gold;

    finalizeAdventureCombat(state);

    expect(state.adventure?.pendingNecromancy?.deferredReward).toEqual({
      kind: "raid-boss",
      bossInstanceId: "boss-1"
    });
    expect(state.adventure?.raidBosses?.["boss-1"].slainBy).toBeUndefined();
    expect(state.adventure?.fields[fieldId].blackCube).toBe(false);
    expect(state.players.p2.resources.gold).toBe(goldBefore);

    state = apply(state, { type: "SKIP_NECROMANCY", playerId: "p2" });
    expect(state.adventure?.raidBosses?.["boss-1"].slainBy).toBe("p2");
    expect(state.adventure?.fields[fieldId].blackCube).toBe(true);
    expect(state.players.p2.resources.gold).toBeGreaterThan(goldBefore);
  });

  it("defers Dungeon floor advancement and rewards behind the same window", () => {
    let state = coverageGame("necro-dungeon");
    state.players.p2.dungeonFloor = 1;
    const fieldId = stageSpecialNeutralWin(state, { dungeonFloor: 1 });
    const heroId = getMainHero(state, "p2")!.id;

    finalizeAdventureCombat(state);

    expect(state.adventure?.pendingNecromancy?.deferredReward).toEqual({
      kind: "dungeon-floor",
      floor: 1,
      heroId,
      fieldId
    });
    expect(state.players.p2.dungeonFloor).toBe(1);

    state = apply(state, { type: "SKIP_NECROMANCY", playerId: "p2" });
    expect(state.players.p2.dungeonFloor).toBe(2);
  });

  it("never opens after Quick Combat", () => {
    const state = coverageGame("necro-quick-control");
    const hero = getMainHero(state, "p2")!;
    const fieldId = "quick-necro-field";
    hero.level = 7;
    hero.spaceId = fieldId;
    state.activePlayerId = "p2";
    state.players.p2.hand = ["ability.necromancy"];
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "quick-tile",
      slot: 0,
      location: "mine",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };

    startNeutralEncounter(state, hero, state.adventure!.fields[fieldId]);

    expect(state.combat ?? null).toBeNull();
    expect(state.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(
      getLegalActions(state, "p2").some(
        (entry) => entry.action.type === "SKIP_NECROMANCY"
      )
    ).toBe(false);
  });
});

describe("Old-rule Legion voucher × Necromancy reinforce (real end-to-end)", () => {
  function startSandroGame(): GameState {
    {
      const _g = createAdventureGameState({
      seed: "legion-necro",
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
      for (const _pl of Object.values(_g.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
      return withImmediateReinforcementPrompts(_g);
    }
  }

  /** Stages a just-won neutral combat for p1 on an already-collected field (no
   *  payout), so the gold change isolates the Necromancy reinforce cost. */
  function stageNeutralWin(state: GameState): void {
    const hero = getMainHero(state, "p1")!;
    const fieldId = "99,1";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "water_wheel",
      difficulty: 1,
      blackCube: true,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    hero.spaceId = fieldId;
    state.activePlayerId = "p1";
    state.combat = {
      context: { kind: "neutral", heroId: hero.id, fieldId, difficulty: 1, hasAzure: false },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;
  }

  /** Plays a Legion piece on the map and picks `unitName`'s reinforce in the prompt. */
  function bankLegionOnReinforceViaPlay(state: GameState, cardId: string, unitName: string): GameState {
    state.activePlayerId = "p1";
    let next = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
      ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
    next.players.p1.hand = [cardId];

    const play = getLegalActions(next, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId && legal.action.optionIndex === 0
    );
    expect(play, `${cardId} discount side should be playable`).toBeTruthy();
    next = apply(next, play!.action);

    const pick = getLegalActions(next, "p1").find(
      (legal) =>
        legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.startsWith("Reinforce") && legal.label.includes(unitName)
    );
    expect(pick, `the prompt should offer a reinforce of ${unitName} (no Citadel needed)`).toBeTruthy();
    return apply(next, pick!.action);
  }

  /** The Necromancy reinforce option label for `unitName` (or undefined). */
  function necromancyReinforceLabel(state: GameState, unitName: string): string | undefined {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.startsWith("Reinforce") && legal.label.includes(unitName)
    )?.label;
  }

  it("old rule keeps Necromancy half and Legion as competing discounts", () => {
    // Vampires Pack = 12 gold. Necromancy half = 6. Legs alone would leave 8,
    // so the old-rule prompt charges the better competing price: 6.
    let state = startSandroGame();
    state.players.p1.army = [{ id: "army_vamp", unitDefId: "necropolis.vampires", side: "few" }];
    state.players.p1.resources.gold = 20;

    state = bankLegionOnReinforceViaPlay(state, "artifact.legs_of_legion", "Vampires");
    expect(state.players.p1.recruitDiscounts).toEqual([
      { cardId: "artifact.legs_of_legion", amount: 4, target: { kind: "reinforce", armyUnitId: "army_vamp" } }
    ]);

    // Hold Necromancy for the after-combat window, then stage + finalize the win.
    state.players.p1.hand = ["ability.necromancy"];
    stageNeutralWin(state);
    finalizeAdventureCombat(state);

    const playAction = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy" && (legal.action.mode ?? "basic") === "basic"
    );
    expect(playAction, "Necromancy should be playable in the open window").toBeTruthy();
    state = apply(state, playAction!.action);

    expect(necromancyReinforceLabel(state, "Vampires")).toContain("6 gold");

    const reinforce = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.includes("Vampires")
    );
    state = apply(state, reinforce!.action);

    expect(state.players.p1.resources.gold).toBe(14);
    expect(state.players.p1.army.find((unit) => unit.id === "army_vamp")?.side).toBe("pack");
    // The voucher is single-use: spent on this unit even though Necromancy won.
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });

  it("old rule lets the larger Legion discount beat Necromancy's half", () => {
    // Wraiths Pack = 6 gold. Necromancy leaves 3; Legs leaves 2, so old behavior
    // chooses the better competing discount and charges 2.
    let state = startSandroGame();
    state.players.p1.army = [{ id: "army_wraith", unitDefId: "necropolis.wraiths", side: "few" }];
    state.players.p1.resources.gold = 20;

    state = bankLegionOnReinforceViaPlay(state, "artifact.legs_of_legion", "Wraiths");
    state.players.p1.hand = ["ability.necromancy"];
    stageNeutralWin(state);
    finalizeAdventureCombat(state);

    const playAction = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy" && (legal.action.mode ?? "basic") === "basic"
    );
    expect(playAction, "Necromancy should be playable in the open window").toBeTruthy();
    state = apply(state, playAction!.action);

    expect(necromancyReinforceLabel(state, "Wraiths")).toContain("2 gold");
    const reinforce = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.label.includes("Wraiths")
    );
    state = apply(state, reinforce!.action);

    expect(state.players.p1.resources.gold).toBe(18);
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The reported bug: "done fighting a creature bank, no choice to upgrade after
// battle." A Creature Bank win is a non-Quick Combat win, so a Necropolis hero
// holding Necromancy must still get the now-or-never after-combat window — but
// the bank branch of finalizeAdventureCombat only granted the (immediate) bank
// reward and never opened `pendingNecromancy`, so the prompt never appeared.
// Bank rewards are part of the atomic deferral: the window must appear first,
// then its gold/search/choice may begin only after explicit Resolve.
// Each assertion below fails if the bank-window wiring is removed.
// ---------------------------------------------------------------------------
describe("Necromancy ability — after a Creature Bank win (reported bug)", () => {
  function startGame(seed: string): GameState {
    const g = createAdventureGameState({
      seed,
      ruleset: "binh",
      difficulty: "normal",
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ],
      rollFirstPlayer: false
    });
    for (const pl of Object.values(g.players)) {
      pl.canMulligan = false;
      pl.needsHandRefresh = false;
    }
    return withImmediateReinforcementPrompts(g);
  }

  /**
   * Stages a just-won Crypt creature-bank fight for `playerId` standing on the
   * bank field. Crypt pays a flat gold reward (no choice prompt), so after
   * finalize the only thing left waiting is the Necromancy window itself.
   */
  function stageBankWin(state: GameState, playerId: "p1" | "p2"): { fieldId: string; heroId: string } {
    const hero = getMainHero(state, playerId)!;
    const fieldId = "bank,1";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "creature_bank",
      bankId: "crypt",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    hero.spaceId = fieldId;
    state.activePlayerId = playerId;
    state.combat = {
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId,
        difficulty: 1,
        hasAzure: false,
        bankId: "crypt",
        bankStackCount: 0
      },
      outcome: { winnerPlayerId: playerId, defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;
    return { fieldId, heroId: hero.id };
  }

  it("opens Necromancy after a Bank win and withholds the Bank reward until Resolve", () => {
    const state = startGame("bank-necro-open");
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    const { fieldId } = stageBankWin(state, "p1");

    finalizeAdventureCombat(state);

    // Crypt's gold and field cube are withheld until explicit Resolve.
    expect(state.players.p1.resources.gold).toBe(0);
    expect(state.adventure?.fields[fieldId].blackCube).toBe(false);

    // ...and the now-or-never Necromancy window is open for the bank winner.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    const legal = getLegalActions(state, "p1");
    expect(
      legal.some((l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy")
    ).toBe(true);
    expect(legal.some((l) => l.action.type === "SKIP_NECROMANCY")).toBe(true);
    // Nothing else is legal until the window is resolved (now-or-never).
    expect(legal.some((l) => l.action.type === "MOVE_HERO" || l.action.type === "END_TURN")).toBe(false);

    const resolved = apply(state, {
      type: "SKIP_NECROMANCY",
      playerId: "p1"
    });
    expect(resolved.players.p1.resources.gold).toBe(6);
    expect(resolved.adventure?.fields[fieldId].blackCube).toBe(true);
  });

  it("opens the window for a Necropolis winner whose Necromancy copy was drawn from the shared Ability deck (the repeated-report bug)", () => {
    const state = startGame("bank-necro-deckdrawn");
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    // The hand copy was searched/drawn out of the shared Ability deck (a level-up
    // Ability Search — the common Necropolis play). The removed house-rule
    // exclusion silently killed the after-combat window on EVERY win for such a
    // copy; the printed "kept but unplayable" clause is for NON-Necropolis heroes
    // only (wiki p.24), so Sandro may still play it.
    state.players.p1.deckDrawnAbilityCardIds = ["ability.necromancy"];
    stageBankWin(state, "p1");

    finalizeAdventureCombat(state);

    // The now-or-never window opens for the deck-drawn copy (re-adding the
    // exclusion leaves pendingNecromancy null again).
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(
      getLegalActions(state, "p1").some(
        (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
      )
    ).toBe(true);
    // A real, playable window — NOT the withheld-note fallback.
    expect(
      state.eventLog.some((e) => e.type === "EVENT_NOTE" && /only a Necropolis hero/.test(e.message))
    ).toBe(false);
  });

  it("lets the bank winner actually reinforce — Few → Pack — and spends the card", () => {
    const state = startGame("bank-necro-reinforce");
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;
    stageBankWin(state, "p1");
    finalizeAdventureCombat(state);

    const play = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
    );
    expect(play, "Necromancy should be playable in the open bank window").toBeTruthy();
    let next = apply(state, play!.action);

    const reinforce = getLegalActions(next, "p1").find(
      (l) => l.action.type === "RESOLVE_VISIT_STEP" && /Skeletons/.test(l.label)
    );
    expect(reinforce, "the bank window must offer a real Skeleton reinforce").toBeTruthy();
    next = apply(next, reinforce!.action);

    // The observable outcome: the unit upgraded and the card is now spent.
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("pack");
    expect(next.players.p1.discard).toContain("ability.necromancy");
    expect(next.players.p1.hand).not.toContain("ability.necromancy");
    next = apply(next, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
  });

  it("CONTROL: a non-Necropolis bank winner gets the reward but no Necromancy window", () => {
    const state = startGame("bank-necro-control");
    // Even handed the card, a Castle hero can never play it — and a bank win
    // must NOT open the now-or-never gate for them (it would freeze their turn).
    state.players.p2.hand = ["ability.necromancy"];
    const goldBefore = state.players.p2.resources.gold;
    const { fieldId } = stageBankWin(state, "p2");

    finalizeAdventureCombat(state);

    expect(state.players.p2.resources.gold).toBe(goldBefore + 6); // bank reward still paid
    expect(state.adventure?.fields[fieldId].blackCube).toBe(true);
    expect(state.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(
      getLegalActions(state, "p2").some(
        (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
      )
    ).toBe(false);
    // Visibility: the withheld window is no longer silent — a feed note names the
    // reason (only a Necropolis hero may play Necromancy) so a held-back copy can
    // never again read as a random "missing prompt" bug. (Removing the
    // noteWithheldNecromancyWindow call fails this.)
    expect(
      state.eventLog.some((e) => e.type === "EVENT_NOTE" && /only a Necropolis hero/.test(e.message))
    ).toBe(true);
  });

  it("CONTROL: a Necropolis bank winner holding NO Necromancy card opens no window", () => {
    const state = startGame("bank-necro-nocard");
    // Sandro (Necropolis) but the Necromancy card is NOT in hand — the window is
    // gated on actually holding a playable card, so a bank win must NOT open it.
    state.players.p1.hand = ["ability.attack"];
    const goldBefore = state.players.p1.resources.gold;
    const { fieldId } = stageBankWin(state, "p1");

    finalizeAdventureCombat(state);

    expect(state.players.p1.resources.gold).toBe(goldBefore + 6); // bank reward still paid
    expect(state.adventure?.fields[fieldId].blackCube).toBe(true);
    expect(state.adventure?.pendingNecromancy ?? null).toBeNull();
    // The turn is not frozen behind a phantom window — normal map play resumes.
    expect(
      getLegalActions(state, "p1").some((l) => l.action.type === "SKIP_NECROMANCY")
    ).toBe(false);
  });

  /**
   * Stages a just-won Medusa Stores fight with ONE Stacked defender: its reward
   * is a SEQUENCE ending in a "+3 gold OR +1 valuables" CHOICE. This is the
   * realistic bug shape: the entire prompt-producing reward must stay behind
   * Necromancy and surface only after explicit Resolve.
   */
  function stageMedusaStoresWin(state: GameState, playerId: "p1" | "p2"): { fieldId: string } {
    const hero = getMainHero(state, playerId)!;
    const fieldId = "bank,medusa";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "creature_bank",
      bankId: "medusa_stores",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    hero.spaceId = fieldId;
    state.activePlayerId = playerId;
    state.combat = {
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId,
        difficulty: 1,
        hasAzure: false,
        bankId: "medusa_stores",
        bankStackCount: 1
      },
      outcome: { winnerPlayerId: playerId, defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;
    return { fieldId };
  }

  it("a prompt-producing Bank keeps its choice behind Necromancy until Resolve", () => {
    const state = startGame("bank-necro-choice");
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;
    stageMedusaStoresWin(state, "p1");

    finalizeAdventureCombat(state);

    // Only Necromancy surfaces; the Bank choice has not started.
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");

    // The Bank choice is absent while Necromancy remains fully usable.
    const beforeChoice = getLegalActions(state, "p1");
    const rewardChoice = beforeChoice.find(
      (l) => l.action.type === "RESOLVE_VISIT_STEP" && /gold/i.test(l.label)
    );
    expect(rewardChoice, "the Bank reward choice must still be withheld").toBeFalsy();
    expect(
      beforeChoice.some((l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy")
    ).toBe(true);

    // Play and redeem Necromancy before the Bank choice is released.
    let next = state;
    expect(next.adventure?.pendingVisit ?? null).toBeNull();
    expect(next.adventure?.pendingNecromancy?.playerId).toBe("p1");
    const play = getLegalActions(next, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
    );
    expect(play, "Necromancy must be playable before the Bank choice").toBeTruthy();

    // ...and the reinforce actually upgrades the Skeletons (the real outcome).
    next = apply(next, play!.action);
    const reinforce = getLegalActions(next, "p1").find(
      (l) => l.action.type === "RESOLVE_VISIT_STEP" && /Skeletons/.test(l.label)
    );
    expect(reinforce, "the bank window must offer a real Skeleton reinforce").toBeTruthy();
    next = apply(next, reinforce!.action);
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("pack");
    next = apply(next, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(next.adventure?.pendingVisit?.playerId).toBe("p1");
  });

  /**
   * The USER-REPORTED shape (2026-07-20): a Derelict Ship (near sea bank) under
   * Polish Bank Sizes. Its reward "−1 morale, 7 gold, +2X gold, Search (X) the
   * Spell Deck" resolves the Search NOT as a pendingVisit CHOOSE_ONE (like Medusa
   * above) but as a top-level `state.pendingChoice` (DECK_SEARCH) queued through
   * the reward QUEUE and opened by the real pump (`pumpAdventureQueues`). That is
   * the code path the Crypt (flat) and Medusa (pendingVisit) tests never exercise.
   * This drives the REAL post-combat pump and proves the Search cannot hide or
   * pre-empt Necromancy: the transaction resolves first, then the Search opens.
   */
  function stageDerelictShipWin(state: GameState, stackCount: number): { fieldId: string } {
    const hero = getMainHero(state, "p1")!;
    hero.level = 7; // able to Search the Spell deck (so a real DECK_SEARCH opens)
    const fieldId = "bank,derelict";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "creature_bank",
      bankId: "derelict_ship",
      bankSize: stackCount, // Polish Bank Sizes: X = the rolled size
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    hero.spaceId = fieldId;
    state.activePlayerId = "p1";
    state.combat = {
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId,
        difficulty: 1,
        hasAzure: false,
        bankId: "derelict_ship",
        bankStackCount: stackCount
      },
      outcome: { winnerPlayerId: "p1", defeatedPlayerId: "neutral", reason: "all-enemy-units-defeated" },
      units: {}
    } as unknown as CombatState;
    return { fieldId };
  }

  it("a Derelict Ship Spell Search stays frozen until Necromancy resolves", () => {
    const state = startGame("bank-necro-derelict-search");
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 20;
    stageDerelictShipWin(state, 2);

    finalizeAdventureCombat(state);
    // The bank reward's Spell Search is deferred to the reward QUEUE — the real
    // pump opens it as a top-level pendingChoice (NOT a pendingVisit).
    pumpAdventureQueues(state);

    // The Search is still frozen; Necromancy owns the interaction slot.
    expect(state.pendingChoice ?? null).toBeNull();
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");

    // No reward Search can be answered yet.
    const cur = state;

    // The window is already present before any Bank Search (the exact
    // "no proposal of using necromancy after a bank fight" regression).
    expect(cur.pendingChoice ?? null).toBeNull();
    expect(cur.adventure?.pendingNecromancy?.playerId).toBe("p1");
    const legal = getLegalActions(cur, "p1");
    const play = legal.find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "ability.necromancy"
    );
    expect(play, "Necromancy must be playable before the reward Search opens").toBeTruthy();
    expect(legal.some((l) => l.action.type === "SKIP_NECROMANCY")).toBe(true);

    // ...and playing it opens the real reinforce choice and upgrades the unit.
    let next = apply(cur, play!.action);
    const reinforce = getLegalActions(next, "p1").find(
      (l) => l.action.type === "RESOLVE_VISIT_STEP" && /Skeletons/.test(l.label)
    );
    expect(reinforce, "the bank window must offer a real Skeleton reinforce").toBeTruthy();
    next = apply(next, reinforce!.action);
    expect(next.players.p1.army.find((u) => u.id === "army_skel")?.side).toBe("pack");
    next = apply(next, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(next.adventure?.pendingNecromancy ?? null).toBeNull();
    expect(next.pendingChoice, "the Spell Search opens only after Resolve").toBeTruthy();
  });
});
