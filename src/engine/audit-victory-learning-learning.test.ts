/**
 * AUDIT (read-only probe, protocol v129) — Learning ability timing.
 *
 * Intended NEW rule:
 *  - classic Learning (and a Community-balance-only game, which does NOT
 *    reprint Learning) opens the offer ONLY when the gain crosses a level and
 *    the Hero is below the Experience cap.
 *  - the Polish reprint (`polish-card-balance`) keeps every-XP-gain timing,
 *    including AT the cap (its Basic side also draws a card).
 *
 * Every case is an observable engine outcome (the pending choice / the reward
 * queue / the Hero's Experience), paired with the rule-flip CONTROL.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getMainHero,
  levelOfExperience,
  pumpAdventureQueues,
  type GameAction,
  type GameState
} from "./index";
import { MAX_EXPERIENCE, gainExperience } from "./adventure";
import { balanceCard } from "./community-balance-cards";
import type { CardId } from "./state";

type Rules = Record<string, boolean>;

function makeGame(seed: string, houseRules: Rules = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    houseRules
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  return state;
}

/** Hero parked at `experience`, holding `hand`, then granted `amount` XP. */
function gain(
  seed: string,
  experience: number,
  amount: number,
  houseRules: Rules = {},
  hand: string[] = ["ability.learning"]
): GameState {
  const state = makeGame(seed, houseRules);
  const hero = getMainHero(state, "p1")!;
  hero.experience = experience;
  hero.level = levelOfExperience(experience);
  state.players.p1.hand = [...hand] as CardId[];
  state.players.p1.limits.expertUses = 1;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  gainExperience(state, "p1", amount);
  return state;
}

function learningOpen(state: GameState): boolean {
  return state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "learning-level-up";
}

function queuedLearningOffers(state: GameState): number {
  return (state.adventure?.rewardQueue ?? []).filter((reward) => reward.kind === "learning-level-up").length;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

describe("AUDIT v129 — classic Learning triggers on a LEVEL CROSSING only", () => {
  it("a half-level gain (no level crossed) opens NOTHING", () => {
    const state = gain("audit-learn-half", 4, 1); // exp 4 (lvl 3) -> 5, still lvl 3
    expect(getMainHero(state, "p1")!.level).toBe(3);
    expect(queuedLearningOffers(state)).toBe(0);
    pumpAdventureQueues(state);
    expect(learningOpen(state)).toBe(false);
  });

  it("CONTROL: the same gain that DOES cross a level opens the offer", () => {
    const state = gain("audit-learn-cross", 5, 1); // exp 5 (lvl 3) -> 6 (lvl 4)
    expect(getMainHero(state, "p1")!.level).toBe(4);
    // Queued, not opened inline.
    expect(queuedLearningOffers(state)).toBe(1);
    expect(state.pendingChoice).toBeNull();
    pumpAdventureQueues(state);
    expect(learningOpen(state)).toBe(true);
  });

  it("a MULTI-level gain opens exactly ONE offer", () => {
    const state = gain("audit-learn-multi", 0, 4); // exp 0 (lvl 1) -> 4 (lvl 3): 2 levels
    expect(getMainHero(state, "p1")!.level).toBe(3);
    expect(queuedLearningOffers(state)).toBe(1);
    pumpAdventureQueues(state);
    expect(learningOpen(state)).toBe(true);
  });

  it("the offer is queued AHEAD of the level's own Ability Search", () => {
    const state = gain("audit-learn-order", 1, 1); // exp 1 -> 2 = level 2 (an ABILITY_SEARCH level)
    const kinds = (state.adventure?.rewardQueue ?? []).map((reward) => reward.kind);
    expect(kinds.indexOf("learning-level-up")).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf("learning-level-up")).toBeLessThan(kinds.indexOf("shared-deck-search"));
  });

  it("a level crossing that lands EXACTLY on the cap is suppressed (lvl 6 -> 7)", () => {
    const state = gain("audit-learn-cap-cross", 11, 1); // exp 11 (lvl 6) -> 12 = MAX, lvl 7
    const hero = getMainHero(state, "p1")!;
    expect(hero.experience).toBe(MAX_EXPERIENCE);
    expect(hero.level).toBe(7);
    expect(queuedLearningOffers(state)).toBe(0);
    pumpAdventureQueues(state);
    expect(learningOpen(state)).toBe(false);
  });

  it("an overshooting gain that clamps to the cap is suppressed too", () => {
    const state = gain("audit-learn-cap-overshoot", 10, 5); // clamps to 12
    expect(getMainHero(state, "p1")!.experience).toBe(MAX_EXPERIENCE);
    expect(queuedLearningOffers(state)).toBe(0);
  });

  it("a gain at the cap (0 net Experience) opens nothing", () => {
    const state = gain("audit-learn-at-cap", MAX_EXPERIENCE, 1);
    expect(queuedLearningOffers(state)).toBe(0);
  });

  it("a queued offer whose card left the hand simply skips", () => {
    const state = gain("audit-learn-lost-card", 5, 1);
    expect(queuedLearningOffers(state)).toBe(1);
    state.players.p1.hand = state.players.p1.hand.filter((card) => card !== "ability.learning");
    pumpAdventureQueues(state);
    expect(learningOpen(state)).toBe(false);
  });

  it("playing the Basic side really advances a half level from the level-up window", () => {
    let state = gain("audit-learn-basic", 5, 1);
    pumpAdventureQueues(state);
    expect(learningOpen(state)).toBe(true);
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE") throw new Error("not an option choice");
    const basicIndex = choice.learningLevelUp!.modes.indexOf("basic");
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: basicIndex
    });
    expect(getMainHero(state, "p1")!.experience).toBe(7);
    expect(state.players.p1.discard).toContain("ability.learning");
  });

  it("the Expert side advances a FULL level, spends the crown and removes the card", () => {
    let state = gain("audit-learn-expert", 5, 1);
    pumpAdventureQueues(state);
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE") throw new Error("not an option choice");
    const expertIndex = choice.learningLevelUp!.modes.indexOf("expert");
    expect(expertIndex).toBeGreaterThanOrEqual(0);
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: expertIndex
    });
    expect(getMainHero(state, "p1")!.experience).toBe(8);
    expect(getMainHero(state, "p1")!.level).toBe(5);
    expect(state.players.p1.removed).toContain("ability.learning");
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("the classic prompt names the LEVEL-UP timing, not a bare gain", () => {
    const state = gain("audit-learn-wording", 5, 1);
    pumpAdventureQueues(state);
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE") throw new Error("not an option choice");
    expect(choice.prompt).toContain("leveling up");
    expect(choice.prompt).not.toContain("gained Experience");
  });
});

describe("AUDIT v129 — the Polish reprint keeps every-XP-gain timing", () => {
  const polish: Rules = { "polish-card-balance": true };

  it("opens on a half-level gain that crosses NO level", () => {
    const state = gain("audit-learn-polish-half", 4, 1, polish);
    expect(getMainHero(state, "p1")!.level).toBe(3);
    expect(queuedLearningOffers(state)).toBe(1);
    pumpAdventureQueues(state);
    expect(learningOpen(state)).toBe(true);
  });

  it("opens AT the Experience cap (its Basic side still draws)", () => {
    const state = gain("audit-learn-polish-cap", MAX_EXPERIENCE, 1, polish);
    expect(getMainHero(state, "p1")!.experience).toBe(MAX_EXPERIENCE);
    expect(queuedLearningOffers(state)).toBe(1);
    pumpAdventureQueues(state);
    expect(learningOpen(state)).toBe(true);
  });

  it("the Polish prompt names the gain timing", () => {
    const state = gain("audit-learn-polish-wording", 4, 1, polish);
    pumpAdventureQueues(state);
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE") throw new Error("not an option choice");
    expect(choice.prompt).toContain("gained Experience");
  });
});

describe("AUDIT v129 — Community balance does NOT reprint Learning", () => {
  it("balanceCard leaves Learning untouched under community-card-balance", () => {
    const state = makeGame("audit-learn-community-card", { "community-card-balance": true });
    const printed = balanceCard(state, "ability.learning" as CardId);
    expect(printed?.effect).toEqual({ type: "ADVANCE_EXPERIENCE", amount: 1, expertAmount: 2 });
    expect((printed?.tags ?? []).join(" ")).toContain("about to level up");
  });

  it("a Community-only game uses the CLASSIC level-crossing timing", () => {
    const community: Rules = { "community-card-balance": true };
    const noCross = gain("audit-learn-community-half", 4, 1, community);
    expect(queuedLearningOffers(noCross)).toBe(0);

    const cross = gain("audit-learn-community-cross", 5, 1, community);
    expect(queuedLearningOffers(cross)).toBe(1);

    const atCap = gain("audit-learn-community-cap", MAX_EXPERIENCE, 1, community);
    expect(queuedLearningOffers(atCap)).toBe(0);
  });

  it("CONTROL: both packs together still take the Polish (wider) timing", () => {
    const both = gain("audit-learn-both", 4, 1, {
      "community-card-balance": true,
      "polish-card-balance": true
    });
    expect(queuedLearningOffers(both)).toBe(1);
  });
});
