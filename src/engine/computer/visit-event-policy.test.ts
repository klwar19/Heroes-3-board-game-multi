import { describe, expect, it } from "vitest";
import type {
  GameAction,
  GameState,
  LegalAction,
  PendingChoice,
  PlayerVisibleState,
  VisitStep,
} from "../state";
import { createAdventureGameState } from "../adventure-setup";
import { chooseComputerAction } from "./policy";
import { scoreMapAction } from "./map-policy";
import type { ComputerObservation } from "./types";

/**
 * Visit / Event / Astrologers policy: the AI must always pick a resolving action
 * (never freeze) and must rank options by nested step utility — e.g. modest
 * auction bids, positive morale over dumping a unit, gold income when broke.
 */

function observe(
  state: GameState,
  legalActions: LegalAction[],
  playerId = "p2",
): ComputerObservation {
  return {
    playerId,
    state: state as unknown as PlayerVisibleState,
    legalActions,
  };
}

function visitState(
  steps: VisitStep[],
  resources: { gold: number; buildingMaterials: number; valuables: number } = {
    gold: 12,
    buildingMaterials: 2,
    valuables: 0,
  },
  extras: Partial<GameState> = {},
): GameState {
  return {
    seed: "visit-event-policy",
    round: 3,
    eventCounter: 0,
    combat: null,
    heroes: {},
    players: {
      p2: {
        id: "p2",
        hand: ["stat.attack", "spell.haste"],
        resources,
        army: [
          { id: "a1", unitDefId: "castle.pikemen", side: "few" },
          { id: "a2", unitDefId: "castle.archers", side: "few" },
        ],
        discard: [],
      },
    },
    decks: {},
    adventure: {
      fields: {},
      pendingVisit: {
        playerId: "p2",
        heroId: "h2",
        fieldId: "h:0:0",
        steps,
      },
    },
    ...extras,
  } as unknown as GameState;
}

function resolveOption(optionIndex: number): LegalAction {
  return {
    label: `option ${optionIndex}`,
    action: {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      optionIndex,
    } as GameAction,
  };
}

function declineAction(): LegalAction {
  return {
    label: "Decline",
    action: {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      decline: true,
    } as GameAction,
  };
}

describe("visit step policy — Events / settlements", () => {
  function auctionState(lotCardId: string): {
    state: GameState;
    legal: LegalAction[];
  } {
    const options: { label: string; steps: VisitStep[] }[] = [];
    for (let amount = 0; amount <= 20; amount += 1) {
      options.push({
        label: amount === 0 ? "No bid" : `Bid ${amount} gold`,
        steps: [{ type: "EVENT_AUCTION_SET_BID", amount }],
      });
    }
    const state = visitState(
      [{ type: "CHOOSE_ONE", prompt: "Auction", options }],
      { gold: 20, buildingMaterials: 2, valuables: 0 },
    );
    state.adventure!.events = {
      activeCardId: "event.a_shady_auction",
      nextDrawerIndex: 0,
      pool: [],
      poolCleanup: "shuffle-into-deck",
      dicePool: [],
      auction: { lotCardId, lotDeckId: "artifacts-minor", bids: {} },
      deal: null,
    };
    return { state, legal: options.map((_, index) => resolveOption(index)) };
  }

  it("auction: bids materially more for a great Artifact, without dumping the treasury", () => {
    const nice = auctionState("artifact.helm_of_heavenly_enlightenment");
    const decision = chooseComputerAction(observe(nice.state, nice.legal));
    expect(decision?.action.type).toBe("RESOLVE_VISIT_STEP");
    const pick = (decision!.action as { optionIndex?: number }).optionIndex ?? -1;
    expect(pick, "an S-tier Relic should not get the old automatic 1-gold bid").toBeGreaterThanOrEqual(8);
    expect(pick, "the AI still preserves cash rather than bidding all 20").toBeLessThanOrEqual(12);

    const ordinary = auctionState("artifact.speculum");
    const ordinaryDecision = chooseComputerAction(observe(ordinary.state, ordinary.legal));
    const ordinaryPick =
      (ordinaryDecision!.action as { optionIndex?: number }).optionIndex ?? -1;
    expect(ordinaryPick).toBeLessThan(pick);

    // CONTROL: even for the great lot, bid-20 is below its quality-aware bid.
    const bidAtTarget = scoreMapAction(observe(nice.state, []), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      optionIndex: pick,
    } as GameAction);
    const bid20 = scoreMapAction(observe(nice.state, []), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      optionIndex: 20,
    } as GameAction);
    expect(bidAtTarget!.score).toBeGreaterThan(bid20!.score);
  });

  it("Messenger / markets buy a premium card but take the resource fallback over weak junk", () => {
    const optionsFor = (cardId: string): VisitStep[] => [
      {
        type: "CHOOSE_ONE",
        prompt: "Messenger",
        options: [
          {
            label: "Buy",
            steps: [{ type: "EVENT_TAKE_CARD", cardId, deckId: "artifacts", cost: { gold: 7 } }],
          },
          { label: "Take resources", steps: [{ type: "ROLL_RESOURCE_DICE", count: 2 }] },
        ],
      },
    ];
    const rich = { gold: 20, buildingMaterials: 2, valuables: 0 };
    const premium = visitState(optionsFor("artifact.helm_of_heavenly_enlightenment"), rich);
    expect(
      (chooseComputerAction(observe(premium, [resolveOption(0), resolveOption(1)]))!.action as {
        optionIndex: number;
      }).optionIndex,
    ).toBe(0);

    const junk = visitState(optionsFor("artifact.speculum"), rich);
    expect(
      (chooseComputerAction(observe(junk, [resolveOption(0), resolveOption(1)]))!.action as {
        optionIndex: number;
      }).optionIndex,
    ).toBe(1);
  });

  it("penalty and gamble Events protect valuable cards and scarce development resources", () => {
    const plea = visitState(
      [
        {
          type: "CHOOSE_ONE",
          prompt: "Villagers' Plea",
          options: [
            {
              label: "Remove premium artifact",
              steps: [{ type: "REMOVE_CARD_FROM_PILE", cardId: "artifact.helm_of_heavenly_enlightenment", source: "hand" }],
            },
            { label: "Pay material", steps: [{ type: "LOSE_RESOURCES", buildingMaterials: 1, reason: "plea" }] },
            { label: "Pay gold", steps: [{ type: "LOSE_RESOURCES", gold: 5, reason: "plea" }] },
          ],
        },
      ],
      { gold: 10, buildingMaterials: 2, valuables: 0 },
    );
    const pleaPick = chooseComputerAction(observe(plea, [0, 1, 2].map(resolveOption)));
    expect((pleaPick!.action as { optionIndex: number }).optionIndex).toBe(1);

    const hermit = visitState(
      [
        {
          type: "CHOOSE_ONE",
          prompt: "Withered Hermit",
          options: (["gold", "buildingMaterials", "valuables"] as const).map((resource) => ({
            label: resource,
            steps: [{ type: "EVENT_HERMIT_GAMBLE", resource }],
          })),
        },
      ],
      { gold: 20, buildingMaterials: 0, valuables: 4 },
    );
    const hermitPick = chooseComputerAction(observe(hermit, [0, 1, 2].map(resolveOption)));
    expect((hermitPick!.action as { optionIndex: number }).optionIndex).toBe(1);
  });

  it("Event menu: positive morale outranks discarding the cheapest unit", () => {
    const state = visitState([
      {
        type: "CHOOSE_ONE",
        prompt: "Cursed Swamp-like",
        options: [
          {
            label: "Negative morale then treasure",
            steps: [
              { type: "EVENT_CHANGE_MORALE", amount: -1 },
              { type: "ROLL_TREASURE_DICE", count: 2 },
            ],
          },
          {
            label: "Positive morale",
            steps: [{ type: "EVENT_CHANGE_MORALE", amount: 1 }],
          },
          {
            label: "Discard cheapest unit",
            steps: [{ type: "EVENT_DISCARD_CHEAPEST_UNIT" }],
          },
        ],
      },
    ]);
    const legal = [0, 1, 2].map(resolveOption);
    const decision = chooseComputerAction(observe(state, legal));
    expect((decision!.action as { optionIndex: number }).optionIndex).toBe(1);

    // CONTROL: discard-unit alone scores below positive morale.
    const pos = scoreMapAction(observe(state, []), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      optionIndex: 1,
    } as GameAction);
    const dump = scoreMapAction(observe(state, []), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      optionIndex: 2,
    } as GameAction);
    expect(pos!.score).toBeGreaterThan(dump!.score);
  });

  it("settlement income: prefers gold when broke", () => {
    const state = visitState(
      [{ type: "SETTLEMENT_CHOICE" }],
      { gold: 2, buildingMaterials: 4, valuables: 1 },
    );
    const legal = [0, 1, 2].map(resolveOption);
    const decision = chooseComputerAction(observe(state, legal));
    expect((decision!.action as { optionIndex: number }).optionIndex).toBe(0);

    // CONTROL: materials win when gold is flush and mats are zero.
    const flush = visitState(
      [{ type: "RESOURCE_GAIN_LEVEL" }],
      { gold: 25, buildingMaterials: 0, valuables: 1 },
    );
    const matsPick = chooseComputerAction(observe(flush, legal));
    expect((matsPick!.action as { optionIndex: number }).optionIndex).toBe(1);
  });

  it("Witch Hut: takes the revealed ability into hand over discarding it", () => {
    const state = visitState([
      {
        type: "CHOOSE_ONE",
        prompt: "Witch Hut: the top Ability card is Luck — take it or discard it?",
        options: [
          { label: "Take Luck into hand", steps: [{ type: "WITCH_HUT_TAKE", cardId: "ability.luck" }] },
          {
            label: "Put Luck into the Ability discard pile",
            steps: [{ type: "WITCH_HUT_DISCARD", cardId: "ability.luck" }],
          },
        ],
      },
    ]);
    const legal = [resolveOption(0), resolveOption(1)];
    const decision = chooseComputerAction(observe(state, legal));
    expect(decision?.action).toMatchObject({
      type: "RESOLVE_VISIT_STEP",
      optionIndex: 0,
    });
  });

  it("PAY_TO: declines expensive costs that break the gold reserve", () => {
    const state = visitState(
      [
        {
          type: "PAY_TO",
          prompt: "Pay?",
          costOptions: [{ gold: 10 }, { gold: 2 }],
          steps: [{ type: "GAIN_EXPERIENCE", amount: 1 }],
        },
      ],
      { gold: 12, buildingMaterials: 1, valuables: 0 },
    );
    const legal = [resolveOption(0), resolveOption(1), declineAction()];
    const decision = chooseComputerAction(observe(state, legal));
    // 10 gold leaves only 2 (< reserve 5) → reject; 2 gold is affordable.
    expect((decision!.action as { optionIndex?: number }).optionIndex).toBe(1);
  });

  it("never freezes: every visit option scores above END_TURN", () => {
    const state = visitState([
      {
        type: "CHOOSE_ONE",
        prompt: "Anything",
        options: [
          { label: "A", steps: [{ type: "GAIN_RESOURCES", gold: 1 }] },
          { label: "Leave", steps: [] },
        ],
      },
    ]);
    const take = scoreMapAction(observe(state, []), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      optionIndex: 0,
    } as GameAction);
    const leave = scoreMapAction(observe(state, []), {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p2",
      optionIndex: 1,
    } as GameAction);
    expect(take!.score).toBeGreaterThan(300);
    expect(leave!.score).toBeGreaterThan(300);
  });
});

describe("choice policy — map discovery / garrison", () => {
  it("place-creature-bank: prefers placing over leaving blocked", () => {
    const choice: PendingChoice = {
      id: "bank1",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Place bank?",
      options: [
        { label: "Place the Imp Cache Creature Bank" },
        { label: "Leave it blocked" },
      ],
      context: "place-creature-bank",
      returnPhase: "map",
    };
    const state = {
      seed: "bank-place",
      round: 1,
      eventCounter: 0,
      combat: null,
      pendingChoice: choice,
      players: { p2: { id: "p2", hand: [], resources: { gold: 10, buildingMaterials: 1, valuables: 0 }, army: [] } },
    } as unknown as GameState;
    const legal: LegalAction[] = [
      {
        label: "place",
        action: { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "bank1", optionIndex: 0 },
      },
      {
        label: "leave",
        action: { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "bank1", optionIndex: 1 },
      },
    ];
    const decision = chooseComputerAction(observe(state, legal));
    expect((decision!.action as { optionIndex: number }).optionIndex).toBe(0);
    expect(decision?.policy).toContain("place-creature-bank");
  });

  it("Polish bank sizes: picks the largest beatable A/B candidate; leaves when neither is", () => {
    // Polish house rule: reveal peeks two rolled sizes; the AI evaluates army
    // strength vs each deterministic layer bulk and takes the best win it can.
    const fullArmy = createAdventureGameState({
      seed: "polish-bank-pick",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
    }).players.p2.army;

    const choice: PendingChoice = {
      id: "bank-ab",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Which bank?",
      options: [
        { label: "A: Imp Cache size I" },
        { label: "B: Imp Cache size IV" },
        { label: "Leave it blocked" },
      ],
      context: "place-creature-bank",
      returnPhase: "map",
      creatureBank: {
        fieldId: "h:0:0",
        tier: "far",
        candidates: [
          { bankId: "imp_cache", size: 1 },
          { bankId: "imp_cache", size: 4 },
        ],
      },
    };

    const strong = {
      seed: "polish-bank-strong",
      round: 2,
      eventCounter: 0,
      combat: null,
      pendingChoice: choice,
      players: {
        p2: {
          id: "p2",
          hand: [],
          resources: { gold: 20, buildingMaterials: 2, valuables: 0 },
          army: fullArmy,
        },
      },
    } as unknown as GameState;
    const legal: LegalAction[] = [0, 1, 2].map((optionIndex) => ({
      label: `opt-${optionIndex}`,
      action: {
        type: "CHOOSE_OPTION" as const,
        playerId: "p2",
        choiceId: "bank-ab",
        optionIndex,
      },
    }));
    const strongPick = chooseComputerAction(observe(strong, legal));
    // Full starting army clears size Ⅰ but not size Ⅳ — pick the beatable one.
    expect((strongPick!.action as { optionIndex: number }).optionIndex).toBe(0);

    // CONTROL: gutted army cannot beat either → leave blocked.
    const weak = {
      ...strong,
      players: {
        p2: {
          id: "p2",
          hand: [],
          resources: { gold: 20, buildingMaterials: 2, valuables: 0 },
          army: fullArmy.slice(0, 1),
        },
      },
    } as unknown as GameState;
    const weakPick = chooseComputerAction(observe(weak, legal));
    expect((weakPick!.action as { optionIndex: number }).optionIndex).toBe(2);
  });

  it("garrison: lets the holding fall when broke, defends when funded", () => {
    const choice: PendingChoice = {
      id: "gar1",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "Defend?",
      options: [{ label: "Pay 8 gold and defend" }, { label: "Let it fall" }],
      context: "garrison",
      returnPhase: "map",
    };
    const broke = {
      seed: "gar-broke",
      round: 2,
      eventCounter: 0,
      combat: null,
      pendingChoice: choice,
      players: {
        p2: {
          id: "p2",
          hand: [],
          resources: { gold: 3, buildingMaterials: 0, valuables: 0 },
          army: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
        },
      },
    } as unknown as GameState;
    const legal: LegalAction[] = [
      {
        label: "defend",
        action: { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "gar1", optionIndex: 0 },
      },
      {
        label: "fall",
        action: { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "gar1", optionIndex: 1 },
      },
    ];
    const brokePick = chooseComputerAction(observe(broke, legal));
    expect((brokePick!.action as { optionIndex: number }).optionIndex).toBe(1);

    const funded = {
      ...broke,
      players: {
        p2: {
          id: "p2",
          hand: [],
          resources: { gold: 20, buildingMaterials: 2, valuables: 0 },
          army: [{ id: "a1" }, { id: "a2" }, { id: "a3" }, { id: "a4" }],
        },
      },
    } as unknown as GameState;
    const fundedPick = chooseComputerAction(observe(funded, legal));
    expect((fundedPick!.action as { optionIndex: number }).optionIndex).toBe(0);
  });

  it("garrison: the fee is read from pendingGarrison — a 3-gold MINE defense is kept where an 8-gold town would fall", () => {
    // `mine-army-defense`: a Mine defense costs 3, not 8. The scorer reads the
    // real cost so a modest purse (6 gold, army 3) DEFENDS the cheap mine but
    // would CONCEDE the same holding at the town's 8-gold fee.
    const choice: PendingChoice = {
      id: "gar-mine",
      type: "OPTION_CHOICE",
      playerId: "p2",
      prompt: "An enemy contests your mine — pay 3 gold to defend?",
      options: [{ label: "Pay 3 gold and defend" }, { label: "Let it fall" }],
      context: "garrison",
      returnPhase: "map",
    };
    const legal: LegalAction[] = [
      { label: "defend", action: { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "gar-mine", optionIndex: 0 } },
      { label: "fall", action: { type: "CHOOSE_OPTION", playerId: "p2", choiceId: "gar-mine", optionIndex: 1 } },
    ];
    const seat = {
      p2: {
        id: "p2",
        hand: [],
        resources: { gold: 6, buildingMaterials: 0, valuables: 0 },
        army: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
      },
    };
    // Mine (cost 3): a 6-gold owner defends.
    const mineState = {
      seed: "gar-mine",
      round: 2,
      eventCounter: 0,
      combat: null,
      pendingChoice: choice,
      adventure: { pendingGarrison: { defenderPlayerId: "p2", goldCost: 3 } },
      players: seat,
    } as unknown as GameState;
    const minePick = chooseComputerAction(observe(mineState, legal));
    expect((minePick!.action as { optionIndex: number }).optionIndex, "defends the cheap mine").toBe(0);

    // CONTROL: the SAME purse at the town's 8-gold fee concedes the holding.
    const townState = {
      ...mineState,
      adventure: { pendingGarrison: { defenderPlayerId: "p2", goldCost: 8 } },
    } as unknown as GameState;
    const townPick = chooseComputerAction(observe(townState, legal));
    expect((townPick!.action as { optionIndex: number }).optionIndex, "concedes at the 8-gold fee").toBe(1);
  });
});

describe("visit step policy — Creature Bank Stack-Token reward", () => {
  it("answers the Hive/Conservatory token choice instead of stalling on it", () => {
    // A won Dragon Fly Hive with 2+ Stacked defenders opens a MANDATORY
    // four-option CHOOSE_ONE before the bank card joins the army. There is no
    // decline branch, so a computer winner that could not score it would park
    // the whole table on an unanswerable window.
    const options: { label: string; steps: VisitStep[] }[] = (
      ["attack", "defense", "health", "initiative"] as const
    ).map((stackToken) => ({
      label: stackToken === "initiative" ? "+2 Initiative" : `+1 ${stackToken}`,
      steps: [
        { type: "RECRUIT_FREE", unitDefId: "neutral.dragon_flies", side: "bank", stackToken } as VisitStep,
      ],
    }));
    const state = visitState([
      { type: "CHOOSE_ONE", prompt: "Dragon Flies: choose its Stack Token bonus", options },
    ]);
    const legal = options.map((_, index) => resolveOption(index));

    const decision = chooseComputerAction(observe(state, legal));
    expect(decision?.action.type).toBe("RESOLVE_VISIT_STEP");
    const pick = (decision!.action as { optionIndex?: number }).optionIndex ?? -1;
    expect(pick).toBeGreaterThanOrEqual(0);
    expect(pick).toBeLessThanOrEqual(3);
    // Scored as a real gain (the RECRUIT_FREE utility band), not the
    // leave/cancel floor a decline branch would sit at.
    expect(decision!.score).toBeGreaterThan(1_050);
  });
});

describe("decision owner — post-combat gates", () => {
  it("SKIP_NECROMANCY is scored as a mandatory resolve (not foundation 0)", () => {
    const state = visitState([]);
    // No pending visit — only the skip action.
    (state.adventure as { pendingVisit: null }).pendingVisit = null;
    const legal: LegalAction[] = [
      {
        label: "Skip Necromancy",
        action: { type: "SKIP_NECROMANCY", playerId: "p2" },
      },
      {
        label: "End turn",
        action: { type: "END_TURN", playerId: "p2" },
      },
    ];
    const decision = chooseComputerAction(observe(state, legal));
    expect(decision?.action.type).toBe("SKIP_NECROMANCY");
    expect(decision!.score).toBeGreaterThan(300);
  });
});
