import { describe, expect, it } from "vitest";
import type { GameState, LegalAction, MapFieldState, PlayerId, PlayerVisibleState } from "./state";
import { addArmyUnit, beginFieldVisit, getMainHero } from "./adventure";
import { getLegalActions } from "./legal-actions";
import { applyAction, createAdventureGameState } from "./index";
import { chooseComputerAction } from "./computer/policy";
import { nextTurnTimeoutAction } from "./afk-drop";

/**
 * Hill Fort ("Fort on the Hill") — the pick-and-pay window.
 *
 * USER BUG 2026-08-06: "Fort on the Hill didn't do anything. It should give a
 * pop up similar to Necromancy allowing to choose the unit you reinforce or
 * skip."
 *
 * Diagnosis of "didn't do anything": the visit used to offer ONE opaque option,
 * "Bank Hill Fort reinforcement discount (-3 gold; expires when you move)". It
 * banked a `ReinforcementDiscountBank` and emitted NO event whatsoever — the
 * visit simply closed with nothing changed on screen and nothing in the feed.
 * Spending it meant finding a per-card reinforce button inside the map Army
 * panel, and the bank was silently wiped the moment ANY of the player's heroes
 * took a step. The engine was not broken; the surface was invisible.
 *
 * New reading (rule-INDEPENDENT — both readings of
 * `immediate-reinforcement-prompts`): the visit opens the window right there,
 * one priced option per eligible bronze/silver Few card plus Skip, and paying
 * flips the card at once (a real UNIT_RECRUITED feed line).
 *
 * Every case below asserts an OBSERVABLE outcome (offered labels, card side,
 * resources spent, events) and names the line whose removal fails it.
 */

const FIELD_ID = "50,50";

function makeGame(seed: string, oldRule = false): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  const player = state.players.p1!;
  player.canMulligan = false;
  player.needsHandRefresh = false;
  if (oldRule) {
    state.adventure!.houseRules = {
      ...(state.adventure!.houseRules ?? {}),
      "immediate-reinforcement-prompts": true
    };
  }
  return state;
}

function injectHillFort(state: GameState): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "hill-fort-tile",
    slot: 0,
    location: "hill_fort",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  return field;
}

function visit(state: GameState, playerId: PlayerId, field: MapFieldState): void {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = field.spaceId;
  beginFieldVisit(state, hero.id, field.spaceId, false);
}

function offers(state: GameState, playerId: PlayerId = "p1"): LegalAction[] {
  return getLegalActions(state, playerId).filter((legal) => legal.action.type === "RESOLVE_VISIT_STEP");
}

function labels(state: GameState, playerId: PlayerId = "p1"): string[] {
  return offers(state, playerId).map((legal) => legal.label);
}

describe("Hill Fort opens a Necromancy-style reinforce window on the visit", () => {
  // Fails if the reducer's HILL_FORT case goes back to `bankReinforcementDiscount`
  // (or the legal-actions branch back to its "Bank Hill Fort …" single offer).
  it("offers one priced reinforce per eligible Few card plus Skip — no bank offer", () => {
    const state = makeGame("hill-fort-window-offers");
    const player = state.players.p1!;
    player.resources.gold = 50;
    player.army = [];
    addArmyUnit(player, "castle.halberdiers", "few"); // bronze, Pack 3 gold  → free
    addArmyUnit(player, "castle.crusaders", "few"); // silver, Pack 10 gold → 7
    addArmyUnit(player, "castle.champions", "few"); // gold — never offered

    visit(state, "p1", injectHillFort(state));

    const shown = labels(state);
    expect(shown.some((label) => /^Reinforce Halberdiers \(free\)/.test(label))).toBe(true);
    expect(shown.some((label) => /^Reinforce Crusaders \(7 gold\)/.test(label))).toBe(true);
    expect(shown.some((label) => /Champions/.test(label))).toBe(false); // gold tier excluded
    expect(shown).toContain("Skip");
    // The banked offer is gone: this IS the visible surface now.
    expect(shown.some((label) => /Bank Hill Fort/i.test(label))).toBe(false);
    expect(player.reinforcementDiscounts ?? []).toHaveLength(0);
  });

  // Fails if `resolveHillFort` stops being called (the old bank path left the
  // card a Few and spent nothing), or if its flatGoldDiscount argument (3) drops.
  it("paying flips the chosen Few to a Pack, spends printed gold minus 3, and says so in the feed", () => {
    const state = makeGame("hill-fort-window-pay");
    const player = state.players.p1!;
    player.resources.gold = 20;
    player.army = [];
    addArmyUnit(player, "castle.halberdiers", "few"); // decoy at index 0
    const target = addArmyUnit(player, "castle.crusaders", "few"); // Pack 10 gold → 7

    visit(state, "p1", injectHillFort(state));
    const pick = offers(state).find((legal) => /Reinforce Crusaders/.test(legal.label))!;
    const result = applyAction(state, pick.action);
    expect(result.errors).toEqual([]);

    const after = result.state.players.p1!;
    expect(after.army.find((unit) => unit.id === target.id)?.side).toBe("pack");
    // The un-chosen decoy is untouched (the pick really selects a card).
    expect(after.army[0]?.side).toBe("few");
    expect(after.resources.gold).toBe(13); // 20 − (10 − 3)
    // "Didn't do anything" fix: the visit now produces real feed lines.
    const tail = result.state.eventLog.slice(-4).map((event) => event.type);
    expect(tail).toContain("UNIT_RECRUITED");
    expect(tail).toContain("RESOURCES_SPENT");
    // Nothing is left banked for later — the transaction is complete.
    expect(after.reinforcementDiscounts ?? []).toHaveLength(0);
    expect(result.state.adventure!.pendingVisit).toBeNull();
  });

  // Fails if the window stops pricing through reinforceCostFor's additive
  // pipeline (Hill Fort −3 first, then every distinct Legion voucher).
  it("folds a Legion voucher reserved for that card on top of the -3", () => {
    const state = makeGame("hill-fort-window-legion");
    const player = state.players.p1!;
    player.resources.gold = 30;
    player.army = [];
    const unit = addArmyUnit(player, "castle.crusaders", "few"); // Pack 10 gold
    player.recruitDiscounts = [
      {
        cardId: "artifact.legs_of_legion",
        amount: 4,
        target: { kind: "reinforce", armyUnitId: unit.id }
      }
    ];

    visit(state, "p1", injectHillFort(state));
    const pick = offers(state).find((legal) => /Reinforce Crusaders/.test(legal.label))!;
    expect(pick.label).toContain("3 gold"); // 10 − 3 − 4
    const result = applyAction(state, pick.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p1!.resources.gold).toBe(27);
    expect(result.state.players.p1!.army[0]?.side).toBe("pack");
    // CONTROL: with no voucher the same card costs the plain 10 − 3 = 7.
    const plain = makeGame("hill-fort-window-legion-control");
    plain.players.p1!.resources.gold = 30;
    plain.players.p1!.army = [];
    addArmyUnit(plain.players.p1!, "castle.crusaders", "few");
    visit(plain, "p1", injectHillFort(plain));
    expect(offers(plain).find((legal) => /Reinforce Crusaders/.test(legal.label))!.label).toContain("7 gold");
  });

  // Fails if the decline arm starts charging / flipping (or re-banks).
  it("Skip pays nothing, flips nothing, and banks nothing", () => {
    const state = makeGame("hill-fort-window-skip");
    const player = state.players.p1!;
    player.resources.gold = 20;
    player.army = [];
    addArmyUnit(player, "castle.crusaders", "few");

    const field = injectHillFort(state);
    visit(state, "p1", field);
    const skip = offers(state).find((legal) => legal.label.startsWith("Skip"))!;
    const result = applyAction(state, skip.action);
    expect(result.errors).toEqual([]);

    const after = result.state.players.p1!;
    expect(after.resources.gold).toBe(20);
    expect(after.army[0]?.side).toBe("few");
    expect(after.reinforcementDiscounts ?? []).toHaveLength(0);
    expect(result.state.adventure!.fields[FIELD_ID]?.blackCube).toBe(true);
  });

  // Fails if the affordability gate (`hasRecruitResources`) is dropped from the
  // offer loop — the window would advertise a reinforce the resolver rejects.
  it("never offers a card the player cannot afford, and says why the window is empty", () => {
    const state = makeGame("hill-fort-window-broke");
    const player = state.players.p1!;
    player.resources.gold = 2; // Crusaders Pack 10 − 3 = 7 > 2
    player.army = [];
    addArmyUnit(player, "castle.crusaders", "few");

    visit(state, "p1", injectHillFort(state));
    const shown = labels(state);
    expect(shown.some((label) => /Reinforce/.test(label))).toBe(false);
    expect(shown).toEqual(["Skip (no bronze or silver Few unit you can afford to reinforce)"]);

    // CONTROL: the same board with the gold to pay DOES offer the reinforce,
    // and the Skip label drops back to the plain wording.
    const rich = makeGame("hill-fort-window-broke-control");
    rich.players.p1!.resources.gold = 7;
    rich.players.p1!.army = [];
    addArmyUnit(rich.players.p1!, "castle.crusaders", "few");
    visit(rich, "p1", injectHillFort(rich));
    expect(labels(rich).some((label) => /^Reinforce Crusaders \(7 gold\)/.test(label))).toBe(true);
    expect(labels(rich)).toContain("Skip");
  });

  // Fails if the reducer/legal-actions branches re-introduce a
  // `houseRuleEnabled(state, "immediate-reinforcement-prompts")` split.
  it("is the SAME window with the old-behaviour house rule ON", () => {
    for (const oldRule of [false, true]) {
      const state = makeGame(`hill-fort-window-rule-${oldRule}`, oldRule);
      const player = state.players.p1!;
      player.resources.gold = 20;
      player.army = [];
      addArmyUnit(player, "castle.crusaders", "few");
      visit(state, "p1", injectHillFort(state));
      expect(labels(state)).toEqual(["Reinforce Crusaders (7 gold) — Hill Fort −3 gold", "Skip"]);
      const result = applyAction(state, offers(state)[0]!.action);
      expect(result.errors).toEqual([]);
      expect(result.state.players.p1!.army[0]?.side).toBe("pack");
      expect(result.state.players.p1!.resources.gold).toBe(13);
    }
  });

  // The Hill Fort is a one-use `visitable` field (black cube on the visit), so
  // there is no 1-MP Revisit. What DOES re-open it is a cleared cube (the
  // designer `clear_tile_cubes` timed event / a re-opened field): the window
  // must come back, not stay dead. Fails if the step stops being derived from
  // the location on each fresh visit.
  it("re-opens the window whenever the field is visited again (cleared cube)", () => {
    const state = makeGame("hill-fort-window-revisit");
    const player = state.players.p1!;
    player.resources.gold = 40;
    player.army = [];
    addArmyUnit(player, "castle.crusaders", "few");
    addArmyUnit(player, "castle.halberdiers", "few");

    const field = injectHillFort(state);
    visit(state, "p1", field);
    let result = applyAction(state, offers(state).find((legal) => /Crusaders/.test(legal.label))!.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p1!.resources.gold).toBe(33);
    expect(result.state.adventure!.fields[FIELD_ID]!.blackCube).toBe(true);

    // Cube cleared (timed event / re-opened field) → the window is back.
    const next = result.state;
    next.adventure!.fields[FIELD_ID]!.blackCube = false;
    visit(next, "p1", next.adventure!.fields[FIELD_ID]!);
    expect(labels(next).some((label) => /^Reinforce Halberdiers \(free\)/.test(label))).toBe(true);
    result = applyAction(next, offers(next).find((legal) => /Halberdiers/.test(legal.label))!.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p1!.army.find((unit) => unit.unitDefId === "castle.halberdiers")?.side).toBe("pack");
  });
});

describe("Hill Fort window never strands an automated seat", () => {
  function observe(state: GameState, playerId: PlayerId) {
    return {
      playerId,
      state: state as unknown as PlayerVisibleState,
      legalActions: getLegalActions(state, playerId)
    };
  }

  // Fails if the window stops offering a priced reinforce at all (the old bank
  // default leaves only Bank/Skip, and the AI never reaches the flip). HONEST
  // LIMIT: it does NOT depend on the dedicated `HILL_FORT` branch of
  // resolveVisitStepScore (1_130) — verified by deleting that branch, after
  // which the generic visit-pick tail (1_090+) still outranks the decline exit
  // (1_050) and this case passes. The branch only fixes the pick ORDER.
  it("a computer seat reinforces rather than skipping when it can pay", () => {
    const state = makeGame("hill-fort-window-ai");
    const hero = getMainHero(state, "p2")!;
    const player = state.players.p2!;
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources.gold = 40;
    player.army = [];
    addArmyUnit(player, "necropolis.skeletons", "few");
    // A real open p2 turn, so the decision is taken under the same gates a live
    // seat has (the pendingVisit is exclusive in getLegalActions).
    state.activePlayerId = "p2";
    hero.spaceId = FIELD_ID;

    const field = injectHillFort(state);
    visit(state, "p2", field);
    const shown = labels(state, "p2");
    expect(shown.some((label) => /^Reinforce/.test(label))).toBe(true);

    const decision = chooseComputerAction(observe(state, "p2"));
    expect(decision).not.toBeNull();
    const chosen = decision!.action as { type: string; decline?: boolean; optionIndex?: number };
    expect(chosen.type).toBe("RESOLVE_VISIT_STEP");
    expect(chosen.decline ?? false).toBe(false);
    const result = applyAction(state, decision!.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p2!.army[0]?.side).toBe("pack");
  });

  // Fails if the "nothing affordable" case stopped offering the Skip exit — the
  // AI and the AFK/turn-timeout driver would both have no answer and the whole
  // table would freeze behind an unanswerable visit.
  it("a broke computer seat and the AFK driver both take the Skip exit", () => {
    const state = makeGame("hill-fort-window-ai-broke");
    const hero = getMainHero(state, "p2")!;
    const player = state.players.p2!;
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources.gold = 0;
    player.army = [];
    addArmyUnit(player, "castle.crusaders", "few");
    // A real open p2 turn, so the decision is taken under the same gates a live
    // seat has (the pendingVisit is exclusive in getLegalActions).
    state.activePlayerId = "p2";
    hero.spaceId = FIELD_ID;

    visit(state, "p2", injectHillFort(state));
    const decision = chooseComputerAction(observe(state, "p2"));
    expect(decision).not.toBeNull();
    expect((decision!.action as { decline?: boolean }).decline).toBe(true);

    // The shared forced-resolution driver (AFK kick / 10-minute turn timeout)
    // answers the same window with the skip-flavoured offer.
    const forced = nextTurnTimeoutAction(state, "p2");
    expect(forced?.type).toBe("RESOLVE_VISIT_STEP");
    expect((forced as { decline?: boolean }).decline).toBe(true);
    const result = applyAction(state, forced!);
    expect(result.errors).toEqual([]);
    expect(result.state.adventure!.pendingVisit).toBeNull();
  });
});
