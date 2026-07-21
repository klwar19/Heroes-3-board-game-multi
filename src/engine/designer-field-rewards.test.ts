/**
 * Designer field-reward specials: morale, Ability Empower token, Statistic
 * empower, experience, movement, Resource dice — sanitiser, describe text,
 * and live grant outcomes (hex events + first-clear field stamps). Each claim
 * mutation-checked with CONTROLs.
 */
import { describe, expect, it } from "vitest";
import {
  beginFieldVisit,
  getMainHero,
  processPendingVisit
} from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import {
  applyAction,
  createAdventureGameState,
  describeFieldReward,
  getLegalActions,
  sanitizeFieldReward
} from "./index";
import type { GameAction, GameState, MapFieldState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function makeGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest"
  });
}

function injectField(
  state: GameState,
  location: string,
  spaceId: string,
  extra: Partial<MapFieldState> = {}
): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: "test-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    ...extra
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

function visitWithMainHero(state: GameState, playerId: PlayerId, spaceId: string): void {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = spaceId;
  beginFieldVisit(state, hero.id, spaceId, false);
}

/** Drain reward-queue visit-steps until the table is quiet (or a CHOICE opens). */
function drainRewards(state: GameState): GameState {
  let s = state;
  // Pump automations that open pending visits from the reward queue.
  pumpAdventureQueues(s);
  // Auto-resolve visit steps that need no input; stop when a CHOOSE_ONE / search waits.
  let guard = 0;
  while (s.adventure?.pendingVisit && guard++ < 40) {
    const steps = s.adventure.pendingVisit.steps;
    if (steps.length === 0) {
      processPendingVisit(s);
      pumpAdventureQueues(s);
      continue;
    }
    const head = steps[0];
    if (head.type === "CHOOSE_ONE" || head.type === "SEARCH_SHARED_DECK") {
      break;
    }
    processPendingVisit(s);
    pumpAdventureQueues(s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Sanitiser + describe
// ---------------------------------------------------------------------------

describe("sanitizeFieldReward — special arms", () => {
  it("keeps morale ±1, tokens, XP, movement, Resource dice; drops garbage", () => {
    expect(
      sanitizeFieldReward({
        gold: 3,
        morale: 1,
        abilityEmpowerToken: true,
        empowerStatistic: true,
        experience: 4,
        movement: 2,
        resourceDice: 3,
        treasureDice: 1
      })
    ).toEqual({
      gold: 3,
      treasureDice: 1,
      morale: 1,
      abilityEmpowerToken: true,
      empowerStatistic: true,
      experience: 4,
      movement: 2,
      resourceDice: 3
    });

    expect(sanitizeFieldReward({ morale: -1 })).toEqual({ morale: -1 });
    // Clamp extremes.
    expect(sanitizeFieldReward({ experience: 99, movement: 99, resourceDice: 99 })).toEqual({
      experience: 5,
      movement: 3,
      resourceDice: 3
    });
    // Flags must be literal true (not truthy string / 1).
    expect(sanitizeFieldReward({ abilityEmpowerToken: 1 as never })).toBeUndefined();
    expect(sanitizeFieldReward({ empowerStatistic: "yes" as never })).toBeUndefined();
    // Legacy resource-only still works (CONTROL).
    expect(sanitizeFieldReward({ gold: 7 })).toEqual({ gold: 7 });
  });

  it("describeFieldReward names every special arm", () => {
    const text = describeFieldReward({
      gold: 2,
      morale: 1,
      abilityEmpowerToken: true,
      empowerStatistic: true,
      experience: 2,
      movement: 1,
      resourceDice: 2
    });
    expect(text).toContain("2 gold");
    expect(text).toContain("+1 morale");
    expect(text).toContain("Ability Empower token");
    expect(text).toContain("Empower a Statistic");
    expect(text).toContain("+2 experience");
    expect(text).toContain("+1 movement");
    expect(text).toContain("2 Resource dice");

    expect(describeFieldReward({ morale: -1 })).toBe("−1 morale");
    expect(describeFieldReward(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Live grant via hex event (uses payDesignerFieldReward)
// ---------------------------------------------------------------------------

describe("designer field rewards — live grant", () => {
  function gameWithHexReward(
    seed: string,
    reward: Record<string, unknown>
  ): { state: GameState; spaceId: string } {
    const state = makeGame(seed);
    const spaceId = "55,55";
    injectField(state, "empty_field", spaceId);
    state.adventure!.hexEvents = {
      [spaceId]: {
        event: {
          id: "ev",
          placement: { row: 55, col: 55 },
          reward: sanitizeFieldReward(reward)!
        },
        firedPlayerIds: []
      }
    };
    return { state, spaceId };
  }

  it("grants +1 morale from a hex-event reward", () => {
    const { state, spaceId } = gameWithHexReward("hex-morale", { morale: 1 });
    state.players.p1.morale = 0;
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);
    expect(state.players.p1.morale).toBe(1);
  });

  it("CONTROL: no morale arm → morale unchanged", () => {
    const { state, spaceId } = gameWithHexReward("hex-morale-off", { gold: 1 });
    state.players.p1.morale = 0;
    const goldBefore = state.players.p1.resources.gold;
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);
    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 1);
  });

  it("grants an Ability Empower token (force — works even with bank house rule OFF)", () => {
    const { state, spaceId } = gameWithHexReward("hex-empower-token", {
      abilityEmpowerToken: true
    });
    // Explicitly disable the bank house rule — designer force must still grant.
    state.adventure!.houseRules = {
      ...(state.adventure!.houseRules ?? {}),
      "bank-empower-ability": false
    };
    state.players.p1.abilityEmpowerToken = 0;
    state.players.p1.hand = ["ability.archery"];
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);
    expect(state.players.p1.abilityEmpowerToken).toBe(1);
    expect(state.eventLog.some((e) => e.type === "ABILITY_EMPOWER_TOKEN_GAINED")).toBe(true);

    // Spend is still legal.
    const spend = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "USE_ABILITY_EMPOWER_TOKEN" && legal.action.cardId === "ability.archery"
    );
    expect(spend, "token spend offered after designer grant").toBeTruthy();
  });

  it("CONTROL: no abilityEmpowerToken arm → no token (and bank rule OFF is irrelevant)", () => {
    const { state, spaceId } = gameWithHexReward("hex-empower-token-off", { gold: 1 });
    state.players.p1.abilityEmpowerToken = 0;
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);
    expect(state.players.p1.abilityEmpowerToken ?? 0).toBe(0);
    expect(state.eventLog.some((e) => e.type === "ABILITY_EMPOWER_TOKEN_GAINED")).toBe(false);
  });

  it("opens a free Statistic empower menu (hand + discard)", () => {
    const { state, spaceId } = gameWithHexReward("hex-stat-empower", {
      empowerStatistic: true
    });
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.discard = [];
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);

    // STAT_EMPOWER_OFFER expands into a CHOOSE_ONE over hand/discard stats.
    const visit = state.adventure!.pendingVisit;
    expect(visit, "empower menu should still be open").toBeTruthy();
    const head = visit!.steps[0];
    expect(head?.type).toBe("CHOOSE_ONE");
    if (head?.type !== "CHOOSE_ONE") throw new Error("expected CHOOSE_ONE");
    expect(head.options.some((o) => o.label.includes("Attack"))).toBe(true);
    expect(head.options.some((o) => o.label === "Done")).toBe(true);

    // Pick the Attack empower.
    const pick = getLegalActions(state, "p1").find((legal) =>
      legal.label.includes("Empower") && legal.label.includes("Attack")
    );
    expect(pick).toBeTruthy();
    const after = applyOk(state, pick!.action);
    expect(after.players.p1.hand).toContain("stat.attack.empowered");
    expect(after.players.p1.hand).not.toContain("stat.attack");
    expect(after.players.p1.removed).toContain("stat.attack");
  });

  it("CONTROL: empowerStatistic with no Statistics is a quiet no-op", () => {
    const { state, spaceId } = gameWithHexReward("hex-stat-empty", {
      empowerStatistic: true
    });
    state.players.p1.hand = ["ability.archery"];
    state.players.p1.discard = [];
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);
    // No menu, no cards moved.
    expect(state.adventure!.pendingVisit?.steps.length ?? 0).toBe(0);
    expect(state.players.p1.hand).toEqual(["ability.archery"]);
  });

  it("grants experience to the main hero", () => {
    const { state, spaceId } = gameWithHexReward("hex-xp", { experience: 2 });
    const hero = getMainHero(state, "p1")!;
    const before = hero.experience ?? 0;
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);
    expect((getMainHero(state, "p1")!.experience ?? 0)).toBe(before + 2);
  });

  it("grants movement to the visiting main hero", () => {
    const { state, spaceId } = gameWithHexReward("hex-mp", { movement: 2 });
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 3;
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(5);
  });

  it("queues Resource dice from a designer reward", () => {
    const { state, spaceId } = gameWithHexReward("hex-rdice", { resourceDice: 1 });
    visitWithMainHero(state, "p1", spaceId);
    // Resource-die rolls resolve immediately into resources (or open a result
    // window). Either way, the visit step is consumed and a dice event is logged.
    drainRewards(state);
    expect(
      state.eventLog.some(
        (e) => e.type === "ADVENTURE_DICE_ROLLED" && "dice" in e && e.dice === "resource"
      )
    ).toBe(true);
  });

  it("first-clear designerReward on a field stamps and pays specials once", () => {
    const state = makeGame("field-stamp");
    const spaceId = "66,66";
    injectField(state, "mine", spaceId, {
      settlementResource: "gold",
      designerReward: sanitizeFieldReward({
        morale: 1,
        abilityEmpowerToken: true,
        experience: 1
      }),
      designerRewardClaimed: undefined
    });
    state.players.p1.morale = 0;
    state.players.p1.abilityEmpowerToken = 0;
    const xpBefore = getMainHero(state, "p1")!.experience ?? 0;

    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);

    expect(state.adventure!.fields[spaceId].designerRewardClaimed).toBe(true);
    expect(state.players.p1.morale).toBe(1);
    expect(state.players.p1.abilityEmpowerToken).toBe(1);
    expect((getMainHero(state, "p1")!.experience ?? 0)).toBe(xpBefore + 1);

    // CONTROL: second visit does not re-pay.
    state.players.p1.morale = 0;
    state.players.p1.abilityEmpowerToken = 0;
    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);
    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.abilityEmpowerToken ?? 0).toBe(0);
  });

  it("COMBINED package: resources inline + specials as visit-steps", () => {
    const { state, spaceId } = gameWithHexReward("hex-combo", {
      gold: 5,
      morale: 1,
      abilityEmpowerToken: true,
      movement: 1
    });
    state.players.p1.morale = 0;
    state.players.p1.abilityEmpowerToken = 0;
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 2;
    const goldBefore = state.players.p1.resources.gold;

    visitWithMainHero(state, "p1", spaceId);
    drainRewards(state);

    expect(state.players.p1.resources.gold).toBe(goldBefore + 5);
    expect(state.players.p1.morale).toBe(1);
    expect(state.players.p1.abilityEmpowerToken).toBe(1);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(3);
  });
});
