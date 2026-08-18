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

function chooseByLabel(
  state: GameState,
  match: (label: string) => boolean,
  playerId: "p1" | "p2" = "p1"
): void {
  const step = firstStep(state) as Extract<VisitStep, { type: "CHOOSE_ONE" }> | undefined;
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`expected CHOOSE_ONE, got ${step?.type ?? "none"}`);
  }
  const optionIndex = step.options.findIndex((o) => match(o.label));
  if (optionIndex < 0) {
    throw new Error(`no option matched: ${step.options.map((o) => o.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex });
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
// Sòng Bạc Quán (Gambling Den) — FO redesign 2026-08-19: choose-your-stake
// gamble with the persistent HOUSE POT (field.denGoldPot). The Attack-die face
// is not seed-pinned: each test plays the real flow, reads the rolled face
// from the event log, and asserts the EXACT payout for that face — hunting a
// bounded seed list only where a specific face SEQUENCE is required.
// ===========================================================================

/** The face of the last Attack die rolled, from the event log. */
function lastAttackRoll(state: GameState): number {
  const rolled = [...state.eventLog]
    .reverse()
    .find((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "attack");
  const rolls = (rolled as { attackRolls?: number[] } | undefined)?.attackRolls;
  if (!rolls || rolls.length === 0) {
    throw new Error("no Attack-die roll in the event log");
  }
  return rolls[0];
}

/** Anime map-objects content gate ON (the dynamic FO menus require it). */
function enableAnime(state: GameState): void {
  (state as { anime?: { enabled: boolean } }).anime = { enabled: true };
}

/** Play one full den gamble as `playerId`; returns the rolled face. */
function playDenStake(state: GameState, playerId: "p1" | "p2", stake: number): number {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = FIELD_ID;
  beginFieldVisit(state, hero.id, FIELD_ID, false);
  chooseByLabel(state, (l) => l.startsWith(`Stake ${stake} gold`), playerId);
  // PAY_TO: pay the stake (optionIndex 0) → the ATTACK_DIE_TABLE auto-rolls.
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 });
  expect(state.adventure!.pendingVisit).toBeNull();
  return lastAttackRoll(state);
}

describe("Gambling Den (anime.song_bac_quan) — stakes + house pot", () => {
  it("every face pays exactly its printed outcome (2×stake+pot / stake back / stake→pot), across seeds all three faces are covered", () => {
    const facesSeen = new Set<number>();
    for (const seed of ["gd-a", "gd-b", "gd-c", "gd-d", "gd-e", "gd-f", "gd-g", "gd-h"]) {
      const state = makeGame(seed);
      enableAnime(state);
      const player = state.players.p1;
      player.resources.gold = 20;
      player.morale = 0;
      const field = injectField(state, "anime.song_bac_quan");
      const face = playDenStake(state, "p1", 3);
      facesSeen.add(face);
      if (face > 0) {
        expect(player.resources.gold, seed).toBe(20 - 3 + 6); // 2×stake, pot was 0
        expect(field.denGoldPot, seed).toBeUndefined();
      } else if (face === 0) {
        expect(player.resources.gold, seed).toBe(20); // stake returned exactly
        expect(field.denGoldPot, seed).toBeUndefined();
      } else {
        expect(player.resources.gold, seed).toBe(17); // stake lost…
        expect(field.denGoldPot, seed).toBe(3); // …into the pot
      }
      // The redesign removed the morale forfeit: no face touches morale.
      expect(player.morale, seed).toBe(0);
    }
    expect([...facesSeen].sort()).toEqual([-1, 0, 1]);
  });

  it("the POT TRANSFERS across players: a lost stake waits on the hex until a later winner takes 2×stake + pot", () => {
    let proven = false;
    for (const seed of ["pot-a", "pot-b", "pot-c", "pot-d", "pot-e", "pot-f", "pot-g", "pot-h", "pot-i", "pot-j", "pot-k", "pot-l"]) {
      const state = makeGame(seed);
      enableAnime(state);
      state.players.p1.resources.gold = 20;
      state.players.p2.resources.gold = 20;
      const field = injectField(state, "anime.song_bac_quan");
      if (playDenStake(state, "p1", 5) !== -1) {
        continue; // need p1 to feed the pot first
      }
      expect(state.players.p1.resources.gold).toBe(15);
      expect(field.denGoldPot).toBe(5);
      if (playDenStake(state, "p2", 1) !== 1) {
        continue; // need p2 to win
      }
      // p2 staked 1 and won 2×1 + the 5-gold pot; the pot then cleared.
      expect(state.players.p2.resources.gold).toBe(20 - 1 + 2 + 5);
      expect(field.denGoldPot).toBeUndefined();
      proven = true;
      break;
    }
    expect(proven, "no seed in the list produced a −1 then +1 sequence — widen the list").toBe(true);
  });

  it("unaffordable stakes are ABSENT (a 2-gold purse sees only the 1-gold stake) and the den never cubes (revisitable)", () => {
    const state = makeGame("gd-gate");
    enableAnime(state);
    state.players.p1.resources.gold = 2;
    const field = injectField(state, "anime.song_bac_quan");
    visit(state);
    const step = firstStep(state) as Extract<VisitStep, { type: "CHOOSE_ONE" }>;
    expect(step.type).toBe("CHOOSE_ONE");
    expect(step.options.filter((o) => o.label.startsWith("Stake")).map((o) => o.label[6])).toEqual(["1"]);
    chooseByLabel(state, (l) => l === "Leave");
    expect(field.blackCube).toBe(false); // revisitable now — no cube ever
    expect(state.players.p1.resources.gold).toBe(2);
  });

  it("CONTROL: with the anime map-objects content off, a carved den offers no menu", () => {
    const state = makeGame("gd-off");
    // anime NOT enabled
    injectField(state, "anime.song_bac_quan");
    visit(state);
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

  it("visitable kinds (onsen) cube on visit and become inert walk-throughs", () => {
    // FO redesign 2026-08-19: the Gambling Den left this class (it is a
    // revisitable stake-and-pot den now, pinned in its own describe above).
    for (const kind of ["onsen_ryokan"]) {
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

  it("picks a resolving option for the Gambling Den stake menu (no stall)", () => {
    const state = makeGame("ai-gd");
    enableAnime(state);
    state.round = 3;
    state.players.p1.resources = { gold: 20, buildingMaterials: 2, valuables: 0 };
    injectField(state, "anime.song_bac_quan");
    visit(state);
    expect(firstStep(state)?.type).toBe("CHOOSE_ONE");
    const action = decideOn(state);
    expect(action?.type).toBe("RESOLVE_VISIT_STEP");
    expect((action as { optionIndex?: number }).optionIndex).toBeGreaterThanOrEqual(0);
  });

  it("picks a resolving option for the Bí Cảnh wager depth pick (no stall)", () => {
    const state = makeGame("ai-wager");
    enableAnime(state);
    state.round = 3;
    carveAt(state, "bi_canh");
    visit(state);
    expect(firstStep(state)?.type).toBe("CHOOSE_ONE");
    const action = decideOn(state);
    expect(action?.type).toBe("RESOLVE_VISIT_STEP");
    expect((action as { optionIndex?: number }).optionIndex).toBeGreaterThanOrEqual(0);
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

// ===========================================================================
// Wager Guard sites (FO redesign 2026-08-19): Bí Cảnh Ⅲ–Ⅶ · Dungeon Gate Ⅰ–Ⅳ
// ===========================================================================
describe("Wager Guard (anime.bi_canh / anime.dungeon_gate)", () => {
  it("picking depth Ⅴ stamps a difficulty-5 guard and opens a REAL combat immediately", () => {
    const state = makeGame("wager-pick");
    enableAnime(state);
    const field = carveAt(state, "bi_canh");
    expect(field.difficulty).toBeUndefined(); // wager sites carve unguarded
    visit(state);
    chooseByLabel(state, (l) => l.includes("depth Ⅴ"));
    expect(field.difficulty).toBe(5);
    expect(state.combat).toBeTruthy(); // the encounter hook opened the fight NOW
  });

  it("'Leave' declines the trial: no guard, no combat, the site stays fresh for later", () => {
    const state = makeGame("wager-leave");
    enableAnime(state);
    const field = carveAt(state, "bi_canh");
    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Leave"));
    expect(field.difficulty).toBeUndefined();
    expect(state.combat).toBeNull();
    // A later visit re-offers the full depth pick.
    visit(state);
    expect(firstStep(state)?.type).toBe("CHOOSE_ONE");
  });

  it("post-win ladder pays BY DEPTH (Ⅴ: two artifact searches; Ⅳ: one search + 3 valuables — a mutation of the ladder fails one of these), then the site is SPENT", () => {
    // Depth Ⅴ — simulate the just-won re-visit (guard standing on a wager site).
    const won5 = makeGame("wager-won5");
    enableAnime(won5);
    const field5 = carveAt(won5, "bi_canh");
    field5.difficulty = 5;
    visit(won5);
    expect(queuedSearches(won5, "artifacts")).toBe(2);
    expect(field5.difficulty).toBeUndefined();
    expect(field5.wagerCleared).toBe(true);
    // Spent: a later visit offers NOTHING (CONTROL).
    won5.adventure!.pendingVisit = null;
    visit(won5);
    expect(won5.adventure!.pendingVisit).toBeNull();

    // Depth Ⅳ — the ladder genuinely discriminates by depth.
    const won4 = makeGame("wager-won4");
    enableAnime(won4);
    const field4 = carveAt(won4, "bi_canh");
    field4.difficulty = 4;
    const before = won4.players.p1.resources.valuables;
    visit(won4);
    expect(queuedSearches(won4, "artifacts")).toBe(1);
    expect(won4.players.p1.resources.valuables).toBe(before + 3);
    expect(field4.wagerCleared).toBe(true);
  });

  it("depth Ⅶ pays two Search (1) + one Search (3) — the counts ride the queued searches", () => {
    const state = makeGame("wager-won7");
    enableAnime(state);
    const field = carveAt(state, "bi_canh");
    field.difficulty = 7;
    visit(state);
    const counts = state
      .adventure!.rewardQueue.filter((r) => r.kind === "shared-deck-search")
      .map((r) => (r as { count?: number }).count ?? 1)
      .sort();
    expect(counts).toEqual([1, 1, 3]);
  });

  it("Dungeon Gate: floor pick is Ⅰ–Ⅳ; a floor-Ⅰ win pays exactly +2 gold; floor Ⅳ without the Equipment module pays Search (1) + 2 gold (the documented fallback)", () => {
    const state = makeGame("gate-pick");
    enableAnime(state);
    const field = carveAt(state, "dungeon_gate");
    visit(state);
    const step = firstStep(state) as Extract<VisitStep, { type: "CHOOSE_ONE" }>;
    expect(step.options.filter((o) => o.label.startsWith("Enter at depth"))).toHaveLength(4);
    state.adventure!.pendingVisit = null;

    field.difficulty = 1;
    const gold = state.players.p1.resources.gold;
    visit(state);
    expect(state.players.p1.resources.gold).toBe(gold + 2);
    expect(field.wagerCleared).toBe(true);

    const state4 = makeGame("gate-won4");
    enableAnime(state4); // equipment module NOT on
    const field4 = carveAt(state4, "dungeon_gate");
    field4.difficulty = 4;
    const gold4 = state4.players.p1.resources.gold;
    visit(state4);
    expect(queuedSearches(state4, "artifacts")).toBe(1);
    expect(state4.players.p1.resources.gold).toBe(gold4 + 2);
  });

  it("a RETREAT leaves the wagered guard standing: the hex is a normal guarded field (no re-pick, movement classifies it as a fight)", () => {
    const state = makeGame("wager-retreat");
    enableAnime(state);
    const field = carveAt(state, "bi_canh");
    visit(state);
    chooseByLabel(state, (l) => l.includes("depth Ⅲ"));
    expect(field.difficulty).toBe(3);
    // The fight opened; simulate a retreat by dropping the combat wholesale.
    state.combat = null;
    // The guard STANDS and a fresh arrival must fight it — not re-pick.
    // "stop" is how classifyHeroStep marks a guarded field (ending there opens
    // the guard combat — the same classification an escalating-fight guard gets);
    // the visit (and with it the depth pick) only ever runs after a WIN.
    expect(field.difficulty).toBe(3);
    expect(classifyHeroStep(state, getMainHero(state, "p1")!, FIELD_ID)).toBe("stop");
  });
});

// ===========================================================================
// Linh Điền / Spirit Field (FO redesign 2026-08-19): plant → harvest → raid
// ===========================================================================
describe("Spirit Field (anime.linh_dien) — planted reward", () => {
  function plant(state: GameState): MapFieldState {
    const field = carveAt(state, "linh_dien");
    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Plant"));
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }); // pay 2
    return field;
  }

  it("planting costs exactly 2 gold and records planter + round", () => {
    const state = makeGame("ld-plant");
    enableAnime(state);
    state.players.p1.resources.gold = 20;
    state.round = 2;
    const field = plant(state);
    expect(state.players.p1.resources.gold).toBe(18);
    expect(field.plantedBy).toBe("p1");
    expect(field.plantedRound).toBe(2);
  });

  it("CONTROL — immature crop (before +3 rounds) offers NO harvest arm", () => {
    const state = makeGame("ld-immature");
    enableAnime(state);
    state.players.p1.resources.gold = 20;
    state.round = 2;
    plant(state);
    state.round = 4; // only +2
    visit(state);
    const step = firstStep(state) as Extract<VisitStep, { type: "CHOOSE_ONE" }>;
    expect(step.options.some((o) => o.label.startsWith("Harvest"))).toBe(false);
  });

  it("at +3 rounds the harvest pays exactly +3 valuables +1 building materials and clears the crop", () => {
    const state = makeGame("ld-harvest");
    enableAnime(state);
    state.players.p1.resources.gold = 20;
    state.round = 2;
    const field = plant(state);
    state.round = 5;
    const { valuables, buildingMaterials } = state.players.p1.resources;
    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Harvest"));
    expect(state.players.p1.resources.valuables).toBe(valuables + 3);
    expect(state.players.p1.resources.buildingMaterials).toBe(buildingMaterials + 1);
    expect(field.plantedBy).toBeUndefined();
    expect(field.plantedRound).toBeUndefined();
  });

  it("a RIVAL may raid a planted field for +1 valuables, trampling it — the planter's harvest is GONE (CONTROL)", () => {
    const state = makeGame("ld-raid");
    enableAnime(state);
    state.players.p1.resources.gold = 20;
    state.round = 2;
    const field = plant(state);
    // p2 raids (any age — even immature).
    const rival = getMainHero(state, "p2")!;
    rival.spaceId = FIELD_ID;
    const rivalValuables = state.players.p2.resources.valuables;
    beginFieldVisit(state, rival.id, FIELD_ID, false);
    chooseByLabel(state, (l) => l.startsWith("Raid"), "p2");
    expect(state.players.p2.resources.valuables).toBe(rivalValuables + 1);
    expect(field.plantedBy).toBeUndefined();
    // CONTROL: the planter returns at maturity to a fallow field — Plant, no Harvest.
    state.round = 5;
    visit(state);
    const step = firstStep(state) as Extract<VisitStep, { type: "CHOOSE_ONE" }>;
    expect(step.options.some((o) => o.label.startsWith("Harvest"))).toBe(false);
    expect(step.options.some((o) => o.label.startsWith("Plant"))).toBe(true);
  });
});
