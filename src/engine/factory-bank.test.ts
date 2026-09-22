import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

/**
 * Factory Bank (RESOURCE_ROUND_BANK): at each Resource round the owner may
 * invest BEFORE the round's normal income (pay 3 → 5, 6 → 10, 11 → 18); the
 * return is paid before the NEXT Resource round's income. The Bank window
 * parks startAdventureRound; the `resource-round-income` divider resumes the
 * income and then starts the active player's turn.
 */
describe("Factory Bank — invest before Resource-round income", () => {
  function applyOk(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    return result.state;
  }

  /** A Factory (p1) adventure with the given town buildings and gold, ready for a Resource round. */
  function factoryGame(seed: string, buildings: string[], gold: number): GameState {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Henrietta", factionId: "factory", heroDefId: "henrietta" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    for (const town of Object.values(state.towns)) {
      town.buildings = town.controllerId === "p1" ? [...buildings] : [];
    }
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.players.p1.resources.gold = gold;
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
      state.adventure.pendingVisit = null;
    }
    return state;
  }

  function startResourceRound(state: GameState, round: number): void {
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = round; // odd round > 1 → Resource round
    startAdventureRound(state);
    pumpAdventureQueues(state);
  }

  function bankStep(state: GameState) {
    const step = state.adventure?.pendingVisit?.steps[0];
    return step?.type === "CHOOSE_ONE" && step.prompt.startsWith("Bank:") ? step : undefined;
  }

  function incomeDividerQueued(state: GameState): boolean {
    return state.adventure?.rewardQueue.some((reward) => reward.kind === "resource-round-income") ?? false;
  }

  function pick(state: GameState, labelPart: string): GameState {
    const legal = getLegalActions(state, "p1").find((candidate) => candidate.label.includes(labelPart));
    expect(legal, `a legal "${labelPart}" option`).toBeTruthy();
    return applyOk(state, legal!.action);
  }

  it("parks round 3 on the Bank choice before income; an 11-gold investment is unaffordable with 10 gold", () => {
    const state = factoryGame("factory-bank-prompt", ["factory.bank"], 10);
    startResourceRound(state, 3);

    const step = bankStep(state);
    expect(step, "the Bank CHOOSE_ONE is the pending visit").toBeTruthy();
    expect(state.adventure!.pendingVisit!.playerId).toBe("p1");
    // Income has NOT arrived yet: the choice sits before it.
    expect(state.players.p1.resources.gold).toBe(10);
    expect(incomeDividerQueued(state)).toBe(true);

    const labels = step!.options.map((option) => option.label);
    expect(labels).toEqual([
      "Pay 3 gold now → gain 5 gold next Resource round",
      "Pay 6 gold now → gain 10 gold next Resource round",
      "Pay 11 gold now → gain 18 gold next Resource round",
      "Do not invest"
    ]);
    expect(step!.options[0].disabledReason).toBeUndefined();
    expect(step!.options[1].disabledReason).toBeUndefined();
    expect(step!.options[2].disabledReason).toBeTruthy();

    const legalLabels = getLegalActions(state, "p1").map((legal) => legal.label);
    expect(legalLabels.some((label) => label.includes("Pay 3 gold"))).toBe(true);
    expect(legalLabels.some((label) => label.includes("Pay 11 gold")), "unaffordable option not legal").toBe(false);
  });

  it("investing 3 pays BEFORE income, banks the 5-gold return, then income arrives and p1's turn starts", () => {
    const state = factoryGame("factory-bank-invest", ["factory.bank"], 10);
    startResourceRound(state, 3);
    const income = state.players.p1.production.gold;

    const after = pick(state, "Pay 3 gold");
    expect(after.players.p1.factoryBankNextResourceGold).toBe(5);
    expect(after.players.p1.resources.gold).toBe(10 - 3 + income);
    // The investment is spent before the income is gained.
    const spent = after.eventLog.findIndex(
      (event) => event.type === "TOWN_BUILDING_USED" && (event as { buildingId?: string }).buildingId === "factory.bank"
    );
    expect(spent, "the Bank investment is logged").toBeGreaterThanOrEqual(0);

    // Not stuck: the divider resolved, the Bank prompt is gone, and p1 can act.
    expect(incomeDividerQueued(after)).toBe(false);
    expect(bankStep(after)).toBeUndefined();
    expect(after.activePlayerId).toBe("p1");
    const legalTypes = new Set(getLegalActions(after, "p1").map((legal) => legal.action.type));
    expect(legalTypes.size, "p1 has turn actions").toBeGreaterThan(0);
    expect(
      legalTypes.has("END_TURN") || legalTypes.has("REFRESH_HAND"),
      `p1's turn is open (got ${[...legalTypes].join(", ")})`
    ).toBe(true);
  });

  it("CONTROL: 'Do not invest' leaves gold untouched until the normal income", () => {
    const state = factoryGame("factory-bank-skip", ["factory.bank"], 10);
    startResourceRound(state, 3);
    const income = state.players.p1.production.gold;

    const after = pick(state, "Do not invest");
    expect(after.players.p1.factoryBankNextResourceGold ?? 0).toBe(0);
    expect(after.players.p1.resources.gold).toBe(10 + income);
    expect(incomeDividerQueued(after)).toBe(false);
    expect(bankStep(after)).toBeUndefined();
  });

  it("round 5 pays the matured 5 gold BEFORE that round's income and asks again", () => {
    let state = factoryGame("factory-bank-payout", ["factory.bank"], 10);
    startResourceRound(state, 3);
    const income = state.players.p1.production.gold;
    state = pick(state, "Pay 3 gold");
    const goldAfterRound3 = state.players.p1.resources.gold; // 10 - 3 + income

    startResourceRound(state, 5);
    // Payout arrived, the income did not yet: the Bank asks again first.
    expect(bankStep(state), "the Bank asks again at round 5").toBeTruthy();
    expect(state.players.p1.resources.gold).toBe(goldAfterRound3 + 5);
    expect(state.players.p1.factoryBankNextResourceGold ?? 0).toBe(0);

    state = pick(state, "Do not invest");
    expect(state.players.p1.resources.gold).toBe(goldAfterRound3 + 5 + income);
    expect(incomeDividerQueued(state)).toBe(false);
  });

  it("CONTROL: a Factory player WITHOUT a Bank gets no prompt and the income runs immediately", () => {
    const state = factoryGame("factory-no-bank", [], 10);
    const income = state.players.p1.production.gold;
    startResourceRound(state, 3);
    expect(bankStep(state)).toBeUndefined();
    expect(incomeDividerQueued(state)).toBe(false);
    expect(state.players.p1.resources.gold).toBe(10 + income);
  });

  it("CONTROL: an Astrologers (even) round never opens the Bank", () => {
    const state = factoryGame("factory-bank-even", ["factory.bank"], 10);
    startResourceRound(state, 4);
    expect(bankStep(state)).toBeUndefined();
    expect(incomeDividerQueued(state)).toBe(false);
    expect(state.players.p1.resources.gold).toBe(10);
  });
});
