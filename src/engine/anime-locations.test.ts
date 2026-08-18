import { describe, expect, it } from "vitest";
import type { GameAction, GameState, MapFieldState, VisitStep } from "./state";
import {
  beginFieldVisit,
  classifyHeroStep,
  getMainHero
} from "./adventure";
import { carveFieldOverride } from "./field-overrides";
import { resolveVisitStep, startNeutralEncounter } from "./adventure-reducer";
import { getLegalActions } from "./legal-actions";
import { applyAction, createAdventureGameState, DEFAULT_ANIME_OPTIONS } from "./index";
import { expireEffectsForCombatRoundEnd } from "./active-effects";
import { chooseComputerAction } from "./computer/policy";
import { listEquipmentDefinitions } from "@/data/anime/equipment";
import { marketGoldValueOf } from "@/data/map/locations";

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
// Đài Luyện Khí (Qi Refinement Platform) — REWRITTEN for the FO redesign
// (2026-08-19, wave 2). The Attack-die "breakthrough for hero experience" gamble
// is RETIRED; the menu is now Meditate (+1 morale) vs "Temper the body" (spend 1
// hero movement → a banked +1 Attack for ROUND 1 of the next combat). The
// consumption half is pinned in the round-1 attack test further down.
// ===========================================================================
describe("Qi Refinement Platform (anime.dai_luyen_khi)", () => {
  it("Meditate gains +1 morale and banks NO combat boost / spends no movement", () => {
    const state = makeGame("qi-plain");
    enableAnime(state);
    const player = state.players.p1;
    player.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 3;
    injectField(state, "anime.dai_luyen_khi");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Meditate"));

    expect(player.morale).toBe(1);
    expect(player.pendingCombatAttackBoost).toBeUndefined(); // CONTROL: other arm inert
    expect(hero.movementPoints).toBe(3);
  });

  it("Temper the body spends exactly 1 hero movement and banks the boost — morale untouched (the distinct sibling)", () => {
    const state = makeGame("qi-temper");
    enableAnime(state);
    const player = state.players.p1;
    player.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 3;
    injectField(state, "anime.dai_luyen_khi");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Temper the body"));

    expect(hero.movementPoints).toBe(2);
    expect(player.pendingCombatAttackBoost).toBe(true);
    expect(player.morale).toBe(0); // CONTROL: the morale branch did not run
  });

  it("the temper arm is ABSENT with no movement left, and ABSENT while one is already banked", () => {
    const noMove = makeGame("qi-nomove");
    enableAnime(noMove);
    getMainHero(noMove, "p1")!.movementPoints = 0;
    injectField(noMove, "anime.dai_luyen_khi");
    visit(noMove);
    expect(
      (firstStep(noMove) as Extract<VisitStep, { type: "CHOOSE_ONE" }>).options.some((o) =>
        o.label.includes("Temper the body")
      )
    ).toBe(false);

    const banked = makeGame("qi-banked");
    enableAnime(banked);
    getMainHero(banked, "p1")!.movementPoints = 3;
    banked.players.p1.pendingCombatAttackBoost = true;
    injectField(banked, "anime.dai_luyen_khi");
    visit(banked);
    expect(
      (firstStep(banked) as Extract<VisitStep, { type: "CHOOSE_ONE" }>).options.some((o) =>
        o.label.includes("Temper the body")
      )
    ).toBe(false);
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

// ===========================================================================
// FO redesign wave 2 (2026-08-19) — the rest of the xianxia objects.
// Every assertion is an observable OUTCOME (a resource/morale/XP/movement delta,
// a real damage delta in combat, a slot swap) with a CONTROL for the rule-off /
// already-claimed / wrong-round case.
// ===========================================================================

/** An adventure game with the anime mod on (plus any extra module flags). */
function makeAnimeGame(seed: string, extra: Record<string, unknown> = {}): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, mapObjects: true, ...extra }
  });
}

function menuOf(state: GameState): Extract<VisitStep, { type: "CHOOSE_ONE" }> {
  const step = firstStep(state);
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`expected a CHOOSE_ONE menu, got ${step?.type ?? "none"}`);
  }
  return step;
}

/** The `count` values of the shared-deck searches queued for a deck. */
function queuedSearchCounts(state: GameState, deckId: string): number[] {
  return state.adventure!.rewardQueue
    .filter((reward) => reward.kind === "shared-deck-search" && (reward as { deckId?: string }).deckId === deckId)
    .map((reward) => (reward as { count?: number }).count ?? 1);
}

// ---------------------------------------------------------------------------
// Kiem Trung (Sword Mound) — guard II, Search (1) Artifact, UE teaching, no -1 morale
// ---------------------------------------------------------------------------
describe("Sword Mound (anime.kiem_trung) — FO redesign wave 2", () => {
  it("carves GUARDED II; the post-win visit draws 1 Artifact, clears the guard and costs NO morale (the old -1 is gone)", () => {
    const state = makeAnimeGame("km-win");
    const field = carveAt(state, "kiem_trung");
    expect(field.difficulty).toBe(2); // stamped at carve, like the Trial Tower
    state.players.p1.morale = 0;

    visit(state); // beginFieldVisit runs only on a WIN

    expect(queuedSearchCounts(state, "artifacts")).toEqual([1]);
    expect(state.players.p1.morale).toBe(0); // REWRITTEN: the sword intent no longer demoralises
    expect(field.difficulty).toBeFalsy(); // the beaten guard is cleared
    expect(field.blackCube).toBe(true); // still a visitable one-shot
  });

  it("Unit Experience ON: the mound teaches exactly +2 unit XP to the CHOSEN card only", () => {
    const state = makeAnimeGame("km-ue", { unitExperience: true });
    state.players.p1.army = [
      { id: "army_0", unitDefId: "castle.halberdiers", side: "few" },
      { id: "army_1", unitDefId: "castle.marksmen", side: "few" }
    ];
    carveAt(state, "kiem_trung");

    visit(state);
    const step = menuOf(state);
    expect(step.options.some((o) => o.label.startsWith("Decline")), "AI-safe decline arm").toBe(true);
    chooseByLabel(state, (l) => l.includes("Marksmen"));

    const army = state.players.p1.army;
    expect(army.find((u) => u.id === "army_1")!.experience).toBe(2);
    expect(army.find((u) => u.id === "army_0")!.experience ?? 0).toBe(0); // CONTROL: only the pick moved
  });

  it("CONTROL: with Unit Experience OFF there is NO teaching arm at all (only the Artifact search runs)", () => {
    const state = makeAnimeGame("km-ue-off");
    state.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
    carveAt(state, "kiem_trung");
    visit(state);
    expect(state.adventure!.pendingVisit).toBeNull(); // nothing to decide
    expect(queuedSearchCounts(state, "artifacts")).toEqual([1]);
    expect(state.players.p1.army[0].experience ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Linh Tuyen (Spirit Spring) — cleanse ALL negative morale, else +1; +1 movement
// ---------------------------------------------------------------------------
describe("Spirit Spring (anime.linh_tuyen) — FO redesign wave 2", () => {
  it("washes away EVERY negative morale token: -2 to 0 (two MORALE_CHANGED steps) and pays +1 movement", () => {
    const state = makeAnimeGame("ls-cleanse");
    const player = state.players.p1;
    player.morale = -2;
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 3;
    const moraleEventsBefore = state.eventLog.filter((e) => e.type === "MORALE_CHANGED").length;
    carveAt(state, "linh_tuyen");

    visit(state);

    expect(player.morale).toBe(0);
    expect(state.eventLog.filter((e) => e.type === "MORALE_CHANGED").length).toBe(moraleEventsBefore + 2);
    expect(hero.movementPoints).toBe(4);
  });

  it("a -1 visitor is cleansed to exactly 0 — never overshot into a positive token", () => {
    const state = makeAnimeGame("ls-one");
    state.players.p1.morale = -1;
    carveAt(state, "linh_tuyen");
    visit(state);
    expect(state.players.p1.morale).toBe(0);
    expect(state.players.p1.moraleOverflow ?? 0).toBe(0);
  });

  it("CONTROL: nothing to cleanse (morale already 0) pays EXACTLY +1 morale, plus the movement", () => {
    const state = makeAnimeGame("ls-fallback");
    state.players.p1.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 2;
    carveAt(state, "linh_tuyen");
    visit(state);
    expect(state.players.p1.morale).toBe(1);
    expect(hero.movementPoints).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Ngo Dao Thach (Enlightenment Stone) — first visit per player: Search(2) + token
// ---------------------------------------------------------------------------
describe("Enlightenment Stone (anime.ngo_dao_thach) — FO redesign wave 2", () => {
  it("a player's FIRST visit is Search (2) the Ability deck AND one Ability Empower token, then it latches", () => {
    const state = makeAnimeGame("nd-first");
    const field = carveAt(state, "ngo_dao_thach");
    expect(state.players.p1.abilityEmpowerToken ?? 0).toBe(0);

    visit(state);

    expect(queuedSearchCounts(state, "abilities")).toEqual([2]);
    expect(state.players.p1.abilityEmpowerToken).toBe(1);
    expect(field.fieldClaimedBy).toEqual(["p1"]);
  });

  it("CONTROL: a LATER visit by the same player is a plain Search (1) — no second Empower token", () => {
    const state = makeAnimeGame("nd-second");
    const field = carveAt(state, "ngo_dao_thach");
    visit(state);
    state.adventure!.rewardQueue.length = 0;
    // The stone is `visitable`, so a repeat is only reachable once its Black Cube
    // is cleared (a designer `clear_tile_cubes` timed event) — do exactly that.
    field.blackCube = false;

    visit(state);

    expect(queuedSearchCounts(state, "abilities")).toEqual([1]); // 1, not 2
    expect(state.players.p1.abilityEmpowerToken).toBe(1); // unchanged: no second token
  });

  it("CONTROL: with the anime map-objects content off a carved stone offers nothing", () => {
    const state = makeGame("nd-off"); // anime NOT enabled
    injectField(state, "anime.ngo_dao_thach");
    visit(state);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(queuedSearchCounts(state, "abilities")).toEqual([]);
    expect(state.players.p1.abilityEmpowerToken ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tran Phap Truyen Tong (Teleportation Array) — once-per-player attune, travel kept
// ---------------------------------------------------------------------------
describe("Teleportation Array (anime.tran_phap_truyen_tong) — FO redesign wave 2", () => {
  it("offers Attune BEFORE the travel step: +1 movement once per player, then it latches", () => {
    const state = makeAnimeGame("tp-attune");
    const field = carveAt(state, "tran_phap_truyen_tong");
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 2;

    visit(state);
    // Ordering matters: the attune menu is UNSHIFTED ahead of TOKEN_TELEPORT.
    expect(state.adventure!.pendingVisit!.steps.map((s) => s.type)).toEqual(["CHOOSE_ONE", "TOKEN_TELEPORT"]);
    chooseByLabel(state, (l) => l.startsWith("Attune"));

    expect(hero.movementPoints).toBe(3);
    expect(field.fieldClaimedBy).toEqual(["p1"]);
  });

  it("CONTROL: once claimed the visit is the plain travel step again — no attune menu, no free movement", () => {
    // A fresh visit with the latch set: the ONLY step is TOKEN_TELEPORT, which
    // auto-resolves (a lone Monolith "leads nowhere"), so the visit closes with
    // no prompt at all — the attune arm is genuinely gone, not merely skipped.
    const state = makeAnimeGame("tp-claimed");
    const field = carveAt(state, "tran_phap_truyen_tong");
    field.fieldClaimedBy = ["p1"];
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 2;

    visit(state);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(
      state.eventLog.some(
        (e) => e.type === "EVENT_NOTE" && /Monolith/i.test((e as { message?: string }).message ?? "")
      ),
      "the travel step really ran"
    ).toBe(true);
    expect(hero.movementPoints).toBe(2); // no free movement a second time
  });

  it("declining the attunement costs nothing and does NOT latch (travel still available)", () => {
    const state = makeAnimeGame("tp-decline");
    const field = carveAt(state, "tran_phap_truyen_tong");
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 2;
    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Step straight onto"));
    expect(hero.movementPoints).toBe(2);
    expect(field.fieldClaimedBy ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tram Thuong Hoi (Merchant Guild Post) — the per-round double-rate contract
// ---------------------------------------------------------------------------
describe("Merchant Guild Post contract (anime.thuong_hoi_tram) — FO redesign wave 2", () => {
  /** Finish the Trading Post ("Done trading") so the appended contract arm is next. */
  function pastTheMarket(state: GameState): void {
    expect(firstStep(state)?.type).toBe("TRADING_POST");
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
  }

  /** The resource kind named in the contract prompt of the current menu. */
  function wantedKind(state: GameState): "buildingMaterials" | "valuables" {
    const prompt = menuOf(state).prompt ?? "";
    return /valuables/i.test(prompt) ? "valuables" : "buildingMaterials";
  }

  it("pays EXACTLY double the market gold rate for 1 of the wanted resource, and only once per round", () => {
    const state = makeAnimeGame("gc-pay");
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 4, valuables: 4 };
    const field = carveAt(state, "thuong_hoi_tram");

    visit(state);
    pastTheMarket(state);
    const kind = wantedKind(state);
    const expected = 2 * marketGoldValueOf(kind);
    const heldBefore = player.resources[kind];

    chooseByLabel(state, (l) => l.startsWith("Fill the contract"));
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }); // pay 1 of it

    expect(player.resources[kind]).toBe(heldBefore - 1);
    expect(player.resources.gold).toBe(expected); // DOUBLE the market rate, exactly
    expect(field.fieldRoundClaims).toEqual({ round: state.round, playerIds: ["p1"] });

    // CONTROL: a SECOND sale in the same round is refused — no contract arm at all.
    state.adventure!.pendingVisit = null;
    visit(state);
    pastTheMarket(state);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(player.resources.gold).toBe(expected); // unchanged
  });

  it("the NEXT game round re-opens the contract (the round latch is per-round, not per-game)", () => {
    const state = makeAnimeGame("gc-round");
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 4, valuables: 4 };
    const field = carveAt(state, "thuong_hoi_tram");
    field.fieldRoundClaims = { round: state.round, playerIds: ["p1"] };

    state.round += 1;
    visit(state);
    pastTheMarket(state);
    expect(menuOf(state).options.some((o) => o.label.startsWith("Fill the contract"))).toBe(true);
  });

  it("the wanted kind is stable within a round but genuinely VARIES across rounds (both kinds appear)", () => {
    const state = makeAnimeGame("gc-vary");
    state.players.p1.resources = { gold: 0, buildingMaterials: 4, valuables: 4 };
    carveAt(state, "thuong_hoi_tram");
    const seen = new Set<string>();
    for (let round = 1; round <= 12; round += 1) {
      state.round = round;
      state.adventure!.pendingVisit = null;
      visit(state);
      pastTheMarket(state);
      const first = wantedKind(state);
      seen.add(first);
      // Stable within the round: re-reading the menu names the same kind.
      state.adventure!.pendingVisit = null;
      visit(state);
      pastTheMarket(state);
      expect(wantedKind(state), `round ${round}`).toBe(first);
      state.adventure!.pendingVisit = null;
    }
    expect([...seen].sort()).toEqual(["buildingMaterials", "valuables"]);
  });

  it("CONTROL: holding none of the wanted resource offers no contract arm (never a dead button)", () => {
    const state = makeAnimeGame("gc-broke");
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    carveAt(state, "thuong_hoi_tram");
    visit(state);
    pastTheMarket(state);
    expect(state.adventure!.pendingVisit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dai Luyen Khi "Temper the body" — the banked boost is a REAL round-1 +1 Attack
// ---------------------------------------------------------------------------
describe("Tempered body (anime.dai_luyen_khi) — the banked boost in combat", () => {
  const GUARD_FIELD = "guard-field";

  /**
   * Open a REAL neutral combat (through startNeutralEncounter to
   * finalizeCombatStart, the seam that consumes the boost), normalise the two
   * bodies to Attack 4 vs Defense 1 with a scripted "0" die, and return the
   * state plus the two unit ids.
   */
  function boostGame(seed: string, boost: boolean): GameState {
    const state = makeAnimeGame(seed);
    state.players.p1.hand = [];
    state.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
    if (boost) {
      state.players.p1.pendingCombatAttackBoost = true;
    }
    return state;
  }

  function openFightIn(state: GameState): { state: GameState; mine: string; foe: string } {
    const hero = getMainHero(state, "p1")!;
    state.adventure!.fields[GUARD_FIELD] = {
      spaceId: GUARD_FIELD,
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    hero.spaceId = GUARD_FIELD;
    startNeutralEncounter(state, hero, state.adventure!.fields[GUARD_FIELD]);
    let current = state;
    for (let guard = 0; guard < 6; guard += 1) {
      const place = getLegalActions(current, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
      if (!place) break;
      current = apply(current, place.action);
    }
    const finish = getLegalActions(current, "p1").find((entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT");
    if (finish) {
      current = apply(current, finish.action);
    }
    const combat = current.combat!;
    expect(combat.round).toBe(1);
    combat.dice.scriptedRolls = Array.from({ length: 200 }, () => 0);
    combat.dice.rollCount = 0;
    // Normalise BOTH sides: my body is Attack 4 / Defense 0 and the fastest on
    // the board (so round 1 opens on it); every guard is Attack 0 / Defense 1 and
    // 60 health, so nothing dies and the only damage on the board is my blow.
    const mine = Object.values(combat.units).find((u) => u.controllerId === "p1")!;
    const foes = Object.values(combat.units).filter((u) => u.controllerId !== "p1");
    Object.assign(mine, {
      abilities: [],
      attack: 4,
      defense: 0,
      maxHealth: 60,
      damage: 0,
      type: "ground",
      initiative: 99,
      position: 9
    });
    foes.forEach((foe, index) =>
      Object.assign(foe, {
        abilities: [],
        attack: 0,
        defense: 1,
        maxHealth: 60,
        damage: 0,
        type: "ground",
        initiative: 1,
        position: 10 + index
      })
    );
    return { state: current, mine: mine.id, foe: foes[0].id };
  }

  function openFight(seed: string, boost: boolean): { state: GameState; mine: string; foe: string } {
    return openFightIn(boostGame(seed, boost));
  }

  const FILLER_STEPS = ["CONTINUE_NEUTRAL_STEP", "ADVANCE_COMPUTER", "END_ACTIVATION", "CONTINUE_NEUTRAL_COMBAT"];

  function settle(state: GameState): GameState {
    let current = state;
    let safety = 40;
    while (current.reactionWindow && safety > 0) {
      safety -= 1;
      current = apply(current, {
        type: "PASS_REACTION",
        playerId: current.reactionWindow.priorityPlayerId
      });
    }
    return current;
  }

  /**
   * Drive the real combat until the ENGINE offers my body's attack on the guard,
   * take it, and return the damage dealt. Uses the OFFERED action (never a forged
   * one), so activation order / neutral pauses are honoured.
   */
  function hit(state: GameState, mine: string, foe: string): { state: GameState; damage: number } {
    let current = settle(state);
    for (let guard = 0; guard < 80; guard += 1) {
      current = settle(current);
      const legal = getLegalActions(current, "p1");
      const attack = legal.find(
        (entry) =>
          entry.action.type === "ATTACK_UNIT" &&
          (entry.action as { attackerId?: string }).attackerId === mine &&
          (entry.action as { defenderId?: string }).defenderId === foe
      );
      if (attack) {
        // Zero the target IMMEDIATELY before the measured blow: the guard may have
        // opened the round and eaten my RETALIATION first (which the boost also
        // lifts), and that would double the delta being measured here.
        current.combat!.units[foe].damage = 0;
        current = settle(apply(current, attack.action));
        return { state: current, damage: current.combat!.units[foe].damage };
      }
      const filler = legal.find((entry) => FILLER_STEPS.includes(entry.action.type));
      if (!filler) break;
      current = apply(current, filler.action);
    }
    throw new Error("the engine never offered the staged attack");
  }

  /** Play out combat round 1 (no attack) so the boost's round expires naturally. */
  function intoRound2(state: GameState): GameState {
    let current = state;
    for (let guard = 0; guard < 200 && (current.combat?.round ?? 9) < 2 && !current.combat?.outcome; guard += 1) {
      current = settle(current);
      const legal = getLegalActions(current, "p1");
      const filler = legal.find((entry) => FILLER_STEPS.includes(entry.action.type));
      if (!filler) break;
      current = apply(current, filler.action);
    }
    return current;
  }

  it("round-1 attacks land +1 damage vs an identical CONTROL fight without the boost, and the flag is consumed at combat start", () => {
    const control = openFight("tb-control", false);
    const baseline = hit(control.state, control.mine, control.foe).damage;
    expect(baseline).toBeGreaterThan(0); // Attack 4 - Defense 1, die 0

    const boosted = openFight("tb-control", true);
    expect(boosted.state.players.p1.pendingCombatAttackBoost, "consumed at combat start").toBeUndefined();
    expect(hit(boosted.state, boosted.mine, boosted.foe).damage).toBe(baseline + 1);
  });

  it("the boost is ROUND 1 only: the SAME body's blow in combat round 2 is back to the control value", () => {
    const control = openFight("tb-round", false);
    const baseline = hit(control.state, control.mine, control.foe).damage;

    // Round 1 with the boost: +1.
    const round1 = openFight("tb-round", true);
    expect(hit(round1.state, round1.mine, round1.foe).damage).toBe(baseline + 1);

    // A separate identical fight, played out through the END of combat round 1
    // (the real round advance, which expires a `current-combat-round` effect)
    // before the same blow is struck.
    const staged = openFight("tb-round", true);
    const inRound2 = intoRound2(staged.state);
    expect(inRound2.combat!.round, "the fight really reached round 2").toBe(2);
    expect(hit(inRound2, staged.mine, staged.foe).damage).toBe(baseline);
  });

  it("CONTROL: the boost is spent once — the SAME player's SECOND combat is unboosted", () => {
    const baselineFight = openFight("tb-twice", false);
    const baseline = hit(baselineFight.state, baselineFight.mine, baselineFight.foe).damage;

    const first = openFightIn(boostGame("tb-twice", true));
    const afterFirst = hit(first.state, first.mine, first.foe);
    expect(afterFirst.damage).toBe(baseline + 1);
    expect(afterFirst.state.players.p1.pendingCombatAttackBoost, "spent at the first combat start").toBeUndefined();

    // Same player, same game: tear the fight down (combat end normally clears the
    // effects) and walk into the next one. No flag left ⇒ no boost.
    const next = afterFirst.state;
    next.combat = null;
    next.activeEffects = [];
    next.phase = "map";
    next.priorityPlayerId = null;
    next.adventure!.pendingVisit = null;
    next.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
    const second = openFightIn(next);
    expect(hit(second.state, second.mine, second.foe).damage).toBe(baseline);
  });
});

// ---------------------------------------------------------------------------
// The outfitters' REFORGE bench (anime.ren_binh_cac / anime.adventurer_outfitter)
// ---------------------------------------------------------------------------
describe("Outfitter reforge bench — FO redesign wave 2", () => {
  const OWNED = listEquipmentDefinitions().find((def) => def.grade === "I" && !def.requiresContext)!;

  function equippedGame(seed: string, gold = 10): GameState {
    const state = makeAnimeGame(seed, { equipment: true });
    state.players.p1.resources = { gold, buildingMaterials: 0, valuables: 0 };
    const hero = getMainHero(state, "p1")!;
    hero.equipment = { [OWNED.slot]: OWNED.id };
    hero.equipmentInventory = [];
    return state;
  }

  /** Walk past the outfitter's own buy menu to the reforge menu. */
  function atTheBench(state: GameState): void {
    chooseByLabel(state, (l) => l === "Leave"); // the shop's own Leave arm
    expect(menuOf(state).prompt).toMatch(/Reforge/);
  }

  for (const kind of ["ren_binh_cac", "adventurer_outfitter"] as const) {
    it(`${kind}: pays 2 gold and swaps EXACTLY the picked items — old gone, new worn, grade preserved`, () => {
      const state = equippedGame(`rf-${kind}`);
      carveAt(state, kind);
      visit(state);
      atTheBench(state);

      chooseByLabel(state, (l) => l.startsWith(`Reforge ${OWNED.name.en}`));
      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }); // pay 2 gold
      const replacements = menuOf(state).options.filter((o) => o.label.startsWith("Take "));
      expect(replacements.length).toBeGreaterThan(0);
      const takenLabel = replacements[0].label;
      chooseByLabel(state, (l) => l === takenLabel);

      const hero = getMainHero(state, "p1")!;
      const worn = Object.values(hero.equipment ?? {});
      expect(state.players.p1.resources.gold).toBe(8); // exactly the 2-gold fee
      expect(worn, "the traded-away item is GONE from the slots").not.toContain(OWNED.id);
      expect(hero.equipmentInventory ?? [], "and was NOT bagged (it is a trade)").not.toContain(OWNED.id);
      const gained = listEquipmentDefinitions().find((def) => takenLabel.includes(def.name.en))!;
      expect(worn).toContain(gained.id);
      expect(gained.grade, "grade preserved").toBe(OWNED.grade);
      expect(gained.id).not.toBe(OWNED.id);
    });
  }

  it("CONTROL: no bench with the equipment module off, with nothing owned, or with too little gold", () => {
    // Module off — the whole outfitter is inert (no shop, no bench).
    const moduleOff = makeAnimeGame("rf-off");
    carveAt(moduleOff, "ren_binh_cac");
    visit(moduleOff);
    expect(moduleOff.adventure!.pendingVisit).toBeNull();

    // Module on, nothing owned — the shop opens, but the bench arm is absent.
    const nothingOwned = makeAnimeGame("rf-empty", { equipment: true });
    nothingOwned.players.p1.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    carveAt(nothingOwned, "ren_binh_cac");
    visit(nothingOwned);
    chooseByLabel(nothingOwned, (l) => l === "Leave");
    expect(nothingOwned.adventure!.pendingVisit).toBeNull();

    // Module on, item owned, but only 1 gold — cannot cover the 2-gold fee.
    const broke = equippedGame("rf-broke", 1);
    carveAt(broke, "ren_binh_cac");
    visit(broke);
    chooseByLabel(broke, (l) => l === "Leave");
    expect(broke.adventure!.pendingVisit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AI safety: every new menu has a resolving option (no stall)
// ---------------------------------------------------------------------------
describe("computer policy resolves the wave-2 menus (no stall)", () => {
  function decideOn(state: GameState): GameAction | null {
    const legal = getLegalActions(state, "p1");
    const decision = chooseComputerAction({ playerId: "p1", state: state as never, legalActions: legal });
    return decision?.action ?? null;
  }

  const cases: { kind: string; setup?: (state: GameState) => void; extra?: Record<string, unknown> }[] = [
    {
      kind: "kiem_trung",
      extra: { unitExperience: true },
      setup: (state) => {
        state.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
      }
    },
    { kind: "tran_phap_truyen_tong" },
    {
      kind: "dai_luyen_khi",
      setup: (state) => {
        getMainHero(state, "p1")!.movementPoints = 3;
      }
    },
    {
      kind: "ren_binh_cac",
      extra: { equipment: true },
      setup: (state) => {
        state.players.p1.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
        const def = listEquipmentDefinitions().find((d) => d.grade === "I" && !d.requiresContext)!;
        getMainHero(state, "p1")!.equipment = { [def.slot]: def.id };
      }
    }
  ];

  for (const { kind, setup, extra } of cases) {
    it(`${kind}: picks a resolving option`, () => {
      const state = makeAnimeGame(`ai-w2-${kind}`, extra);
      state.round = 3;
      setup?.(state);
      carveAt(state, kind);
      visit(state);
      expect(firstStep(state)?.type).toBe("CHOOSE_ONE");
      const action = decideOn(state);
      expect(action?.type).toBe("RESOLVE_VISIT_STEP");
    });
  }
});
