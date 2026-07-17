import { describe, expect, it } from "vitest";
import type { GameAction, GameState, MapFieldState, VisitStep } from "./state";
import {
  beginFieldVisit,
  classifyHeroStep,
  getMainHero
} from "./adventure";
import { carveFieldOverride } from "./field-overrides";
import { resolveVisitStep } from "./adventure-reducer";
import { getLegalActions } from "./legal-actions";
import { applyAction, createAdventureGameState } from "./index";
import { chooseComputerAction } from "./computer/policy";

/**
 * Wave-2 Field Override single-hex locations — EFFECT-level tests (CLAUDE.md
 * rule #1 / #1a). Each new location REUSES an existing LocationInteraction, so
 * every test asserts the observable game OUTCOME (gold moved, morale went X→X-1,
 * a war machine entered the hand, an Artifact search was queued) and fails if
 * the wiring is removed. Setup facts (shared with map-tile-effects-audit):
 *  - p1's default faction earns morale (a −1 shows as morale −1, not a no-op).
 *  - The Attack-die faces are `[-1,-1,0,0,1,1]`; seeds below were chosen so the
 *    "attack-die-field" roll lands the named face deterministically.
 */

const FIELD_ID = "50,50";

function makeGame(seed = "anime-loc"): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
}

function injectField(state: GameState, location: string, opts: { blackCube?: boolean } = {}): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "anime-loc-tile",
    slot: 0,
    location,
    blackCube: opts.blackCube ?? false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return field;
}

/** Carve a plain field into the anime override kind via the real FO carve path. */
function carveAt(state: GameState, kind: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "anime-loc-tile",
    slot: 0,
    location: "empty_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  carveFieldOverride(state.adventure!, field.spaceId, kind);
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return state.adventure!.fields[field.spaceId];
}

function visit(state: GameState): void {
  beginFieldVisit(state, getMainHero(state, "p1")!.id, FIELD_ID, false);
}

function firstStep(state: GameState): VisitStep | undefined {
  return state.adventure!.pendingVisit?.steps[0];
}

function chooseByLabel(state: GameState, match: (label: string) => boolean): void {
  const step = firstStep(state) as Extract<VisitStep, { type: "CHOOSE_ONE" }> | undefined;
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`expected CHOOSE_ONE, got ${step?.type ?? "none"}`);
  }
  const optionIndex = step.options.findIndex((o) => match(o.label));
  if (optionIndex < 0) {
    throw new Error(`no option matched: ${step.options.map((o) => o.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
  return result.state;
}

function queuedSearches(state: GameState, deckId: string): number {
  return state.adventure!.rewardQueue.filter(
    (reward) => reward.kind === "shared-deck-search" && (reward as { deckId?: string }).deckId === deckId
  ).length;
}

// ===========================================================================
// Sòng Bạc Quán (Gambling Den) — PAY_TO 2 gold → ATTACK_DIE_TABLE gamble
// ===========================================================================
describe("Gambling Den (anime.song_bac_quan)", () => {
  it("pay 2 → +1 face WINS 5 gold (net +3), morale untouched", () => {
    const state = makeGame("gd-4"); // seed → Attack die "+1"
    const player = state.players.p1;
    player.resources.gold = 20;
    player.morale = 0;
    const field = injectField(state, "anime.song_bac_quan");

    visit(state);
    expect(field.blackCube).toBe(true); // visitable: cube drops immediately
    expect(firstStep(state)?.type).toBe("PAY_TO");
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }); // pay 2

    expect(player.resources.gold).toBe(23); // 20 − 2 stake + 5 win
    expect(player.morale).toBe(0);
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("pay 2 → −1 face costs a MORALE token; CONTROL: no 5-gold win (gold unchanged from stake)", () => {
    const state = makeGame("gd-2"); // seed → Attack die "−1"
    const player = state.players.p1;
    player.resources.gold = 20;
    player.morale = 0;
    injectField(state, "anime.song_bac_quan");

    visit(state);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }); // pay 2

    expect(player.morale).toBe(-1); // the house takes a morale token
    expect(player.resources.gold).toBe(18); // ONLY the 2 stake left the purse — no win
  });

  it("pay 2 → 0 face returns the 2 (net even), no morale change", () => {
    const state = makeGame("gd-0"); // seed → Attack die "0"
    const player = state.players.p1;
    player.resources.gold = 20;
    player.morale = 0;
    injectField(state, "anime.song_bac_quan");

    visit(state);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(player.resources.gold).toBe(20);
    expect(player.morale).toBe(0);
  });

  it("PAY_TO GATES a broke hero: only Decline is offered, and declining charges nothing but still cubes", () => {
    const state = makeGame("gd-4");
    const player = state.players.p1;
    player.resources.gold = 1; // < the 2-gold stake
    player.morale = 0;
    const field = injectField(state, "anime.song_bac_quan");

    visit(state);
    expect(firstStep(state)?.type).toBe("PAY_TO");
    const resolves = getLegalActions(state, "p1").filter(
      (a) => a.action.type === "RESOLVE_VISIT_STEP"
    );
    // No affordable pay option (optionIndex present) — only the decline.
    expect(
      resolves.some((a) => (a.action as { optionIndex?: number }).optionIndex !== undefined)
    ).toBe(false);
    expect(resolves.some((a) => (a.action as { decline?: boolean }).decline === true)).toBe(true);

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
    expect(player.resources.gold).toBe(1); // charged nothing
    expect(field.blackCube).toBe(true); // visitable field still spent
    expect(state.adventure!.pendingVisit).toBeNull();
  });
});

// ===========================================================================
// Đài Luyện Khí (Qi Refinement Platform) — CHOOSE_ONE (meditate vs breakthrough)
// ===========================================================================
describe("Qi Refinement Platform (anime.dai_luyen_khi)", () => {
  it("Meditate gains +1 morale and leaves experience untouched", () => {
    const state = makeGame("qi-plain");
    const player = state.players.p1;
    player.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    injectField(state, "anime.dai_luyen_khi");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Meditate"));

    expect(player.morale).toBe(1);
    expect(hero.experience).toBe(0); // CONTROL: the OTHER branch did not run
  });

  it("Push a breakthrough on a +1 face gains 2 experience, morale untouched (distinct from Meditate)", () => {
    const state = makeGame("qi-0"); // seed → Attack die "+1"
    const player = state.players.p1;
    player.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    injectField(state, "anime.dai_luyen_khi");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Push"));

    expect(hero.experience).toBe(2);
    expect(player.morale).toBe(0); // CONTROL: a successful push costs no morale
  });

  it("Push a breakthrough on a −1 face costs a morale token and grants NO experience", () => {
    const state = makeGame("qi-1"); // seed → Attack die "−1"
    const player = state.players.p1;
    player.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    injectField(state, "anime.dai_luyen_khi");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Push"));

    expect(hero.experience).toBe(0);
    expect(player.morale).toBe(-1);
  });
});

// ===========================================================================
// Hot Spring Inn / Onsen — CHOOSE_ONE (morale vs movement) distinct outcomes
// ===========================================================================
describe("Hot Spring Inn (anime.onsen_ryokan)", () => {
  it("Long soak raises morale but NOT movement", () => {
    const state = makeGame("onsen-soak");
    const player = state.players.p1;
    player.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 3;
    injectField(state, "anime.onsen_ryokan");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Long soak"));

    expect(player.morale).toBe(1);
    expect(hero.movementPoints).toBe(3); // CONTROL: the movement branch did not run
  });

  it("Quick dip raises movement but NOT morale (the distinct sibling outcome)", () => {
    const state = makeGame("onsen-dip");
    const player = state.players.p1;
    player.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 3;
    injectField(state, "anime.onsen_ryokan");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Quick dip"));

    expect(hero.movementPoints).toBe(4);
    expect(player.morale).toBe(0); // CONTROL: the morale branch did not run
  });
});

// ===========================================================================
// Trạm Thương Hội (Merchant Guild Post) — TRADING_POST opens real trades
// ===========================================================================
describe("Merchant Guild Post (anime.thuong_hoi_tram)", () => {
  it("opens the Trading Post: a resource exchange actually resolves", () => {
    const state = makeGame("guild-trade");
    const player = state.players.p1;
    player.resources = { gold: 18, buildingMaterials: 0, valuables: 0 };
    injectField(state, "anime.thuong_hoi_tram");

    visit(state);
    expect(firstStep(state)?.type).toBe("TRADING_POST");

    const trade = getLegalActions(state, "p1").find(
      (a) => a.action.type === "TRADE_RESOURCES" && a.label.includes("6 gold for 1 valuables")
    );
    expect(trade, "the 6-gold→1-valuables exchange is offered").toBeDefined();
    const next = apply(state, trade!.action);
    expect(next.players.p1.resources.gold).toBe(12);
    expect(next.players.p1.resources.valuables).toBe(1);
  });
});

// ===========================================================================
// Capsule Corp Lab — WAR_MACHINE_SHOP sells a machine (gold down, machine gained)
// ===========================================================================
describe("Capsule Corp Lab (anime.capsule_lab)", () => {
  it("sells a war machine at the factory price: gold falls and the machine enters the hand", () => {
    const state = makeGame("capsule");
    for (const pl of Object.values(state.players)) {
      pl.canMulligan = false;
      pl.needsHandRefresh = false;
    }
    const player = state.players.p1;
    player.resources.gold = 7;
    injectField(state, "anime.capsule_lab");

    visit(state);
    expect(firstStep(state)?.type).toBe("WAR_MACHINE_SHOP");

    const buy = getLegalActions(state, "p1").find(
      (a) => a.action.type === "BUY_WAR_MACHINE" && a.action.cardId === "war_machine.ballista"
    );
    expect(buy, "a war machine is on sale").toBeDefined();
    const next = apply(state, buy!.action);
    expect(next.players.p1.hand).toContain("war_machine.ballista");
    expect(next.players.p1.resources.gold).toBeLessThan(7); // paid for it
  });
});

// ===========================================================================
// Urahara's Shop — CHOOSE_ONE of two PAY_TO arms (curio / bargain bin)
// ===========================================================================
describe("Urahara's Shop (anime.urahara_shop)", () => {
  it("Buy a curio: pay 3 gold → an Artifact Search is queued", () => {
    const state = makeGame("urahara-curio");
    const player = state.players.p1;
    player.resources.gold = 10;
    injectField(state, "anime.urahara_shop");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Buy a curio"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }); // pay 3

    expect(player.resources.gold).toBe(7);
    expect(queuedSearches(state, "artifacts")).toBe(1);
  });

  it("Bargain bin GATES a broke hero: paying is not offered, only Decline", () => {
    const state = makeGame("urahara-broke");
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    injectField(state, "anime.urahara_shop");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Bargain bin"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    const resolves = getLegalActions(state, "p1").filter((a) => a.action.type === "RESOLVE_VISIT_STEP");
    expect(
      resolves.some((a) => (a.action as { optionIndex?: number }).optionIndex !== undefined)
    ).toBe(false);
    expect(resolves.some((a) => (a.action as { decline?: boolean }).decline === true)).toBe(true);
  });
});

// ===========================================================================
// Category invariant: revisitable stays open, visitable cubes out
// ===========================================================================
describe("category behaviour (carved via the real Field Override path)", () => {
  it("revisitable kinds (guild post / capsule lab) never cube and keep stopping heroes", () => {
    for (const kind of ["thuong_hoi_tram", "capsule_lab"]) {
      const state = makeGame(`revisit-${kind}`);
      state.players.p1.resources = { gold: 30, buildingMaterials: 5, valuables: 5 };
      const field = carveAt(state, kind);
      const hero = getMainHero(state, "p1")!;
      visit(state);
      expect(field.blackCube, kind).toBe(false);
      // Can be used again next turn (revisit for 1 MP): still a stop, not a walk-through.
      expect(classifyHeroStep(state, hero, FIELD_ID), kind).toBe("stop");
    }
  });

  it("visitable kinds (gambling den / onsen) cube on visit and become inert walk-throughs", () => {
    for (const kind of ["song_bac_quan", "onsen_ryokan"]) {
      const state = makeGame(`cube-${kind}`);
      state.players.p1.resources = { gold: 30, buildingMaterials: 5, valuables: 5 };
      const field = carveAt(state, kind);
      const hero = getMainHero(state, "p1")!;
      visit(state);
      expect(field.blackCube, kind).toBe(true);
      // Resolve whatever pended, then confirm a re-visit does nothing (walk-through).
      state.adventure!.pendingVisit = null;
      field.blackCube = true;
      beginFieldVisit(state, hero.id, FIELD_ID, false);
      expect(state.adventure!.pendingVisit, kind).toBeNull();
      expect(classifyHeroStep(state, hero, FIELD_ID), kind).toBe("open");
    }
  });
});

// ===========================================================================
// AI never freezes on these fields (all interaction types are already scored)
// ===========================================================================
describe("computer policy resolves the new visit menus (no stall)", () => {
  function decideOn(state: GameState): GameAction | null {
    const legal = getLegalActions(state, "p1");
    const decision = chooseComputerAction({
      playerId: "p1",
      state: state as never,
      legalActions: legal
    });
    return decision?.action ?? null;
  }

  it("picks a resolving action for the Gambling Den PAY_TO", () => {
    const state = makeGame("ai-gd");
    state.round = 3;
    state.players.p1.resources = { gold: 20, buildingMaterials: 2, valuables: 0 };
    injectField(state, "anime.song_bac_quan");
    visit(state);
    expect(firstStep(state)?.type).toBe("PAY_TO");
    const action = decideOn(state);
    expect(action?.type).toBe("RESOLVE_VISIT_STEP");
  });

  it("picks a resolving option for the Onsen CHOOSE_ONE", () => {
    const state = makeGame("ai-onsen");
    state.round = 3;
    injectField(state, "anime.onsen_ryokan");
    visit(state);
    expect(firstStep(state)?.type).toBe("CHOOSE_ONE");
    const action = decideOn(state);
    expect(action?.type).toBe("RESOLVE_VISIT_STEP");
    expect((action as { optionIndex?: number }).optionIndex).toBeGreaterThanOrEqual(0);
  });

  it("picks a resolving action (trade or leave) for the Merchant Guild Post", () => {
    const state = makeGame("ai-guild");
    state.round = 5;
    state.players.p1.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
    injectField(state, "anime.thuong_hoi_tram");
    visit(state);
    expect(firstStep(state)?.type).toBe("TRADING_POST");
    const action = decideOn(state);
    expect(action).not.toBeNull();
    // A market always has a clean exit / trade — never a stall.
    expect(["TRADE_RESOURCES", "RESOLVE_VISIT_STEP", "BUY_WAR_MACHINE"]).toContain(action?.type);
  });
});
