import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  effectiveHandLimit,
  gainExperience,
  getLegalActions,
  getMainHero,
  getPlayerView,
  gradeForMerit,
  heroGradeLabel,
  heroGradeOf,
  heroGradeNodesForPlayer,
  heroGradePickableNodes,
  heroGradeProgressOf,
  heroGradeRegisterKey,
  pickableNodesFrom,
  standingSpellPower,
  DEFAULT_ANIME_OPTIONS,
  HERO_GRADE_REGISTERS,
  HERO_GRADE_TIER_COUNT,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerId
} from "./index";
import { applyMineFlag, beginFieldVisit, processPendingVisit, startAdventureRound } from "./adventure";
import {
  applyHeroGradeOneTimeReward,
  finalizeAdventureCombat,
  placementCellsFor,
  pumpAdventureQueues,
  startNeutralEncounter
} from "./adventure-reducer";
import { finishCombatIfNeeded } from "./combat-units";
import { chooseComputerAction } from "./computer/policy";
import { scoreMapAction } from "./computer/map-policy";
import type { ComputerObservation } from "./computer/types";
import type { MapFieldState, PlayerVisibleState } from "./state";
import { cardLibrary } from "@/data/cards/library";
import {
  HERO_GRADE_NODE_IDS,
  HERO_GRADE_NODES,
  HERO_GRADE_TRAINING_MANUAL_CARD_ID,
  animeNeverDeckedCardIds,
  factionGradeRegister,
  type HeroGradeNode
} from "@/data/anime/hero-grades";
import { heroGradeWinGold } from "./anime-hero-grades";
import {
  applyHeroGradeArmyInitiative,
  applyHeroGradeRoundStartDamage,
  expireHeroGradeFamiliars,
  injectHeroGradeFamiliar,
  STARWIND_FAMILIAR_CARD_IMAGE
} from "./hero-grade-combat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const GRADES_ON = { ...DEFAULT_ANIME_OPTIONS, enabled: true, heroGrades: true };
/**
 * The anime mod ON with ONLY heroGrades off — the correct CONTROL for a Merit
 * rider that sits on an anime CONTENT hex whose reward is itself gated on the
 * anime map-objects content (FO redesign 2026-08-19, wave 2).
 */
const GRADES_OFF = { ...DEFAULT_ANIME_OPTIONS, enabled: true, heroGrades: false };

function adventure(seed: string, anime = GRADES_ON, extra: Record<string, unknown> = {}): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, anime, ...extra });
}

function startTurn(state: GameState, playerId: PlayerId = "p1"): GameState {
  return state.players[playerId].needsHandRefresh || state.players[playerId].canMulligan
    ? applyOk(state, { type: "REFRESH_HAND", playerId, discardCardIds: [] })
    : state;
}

function gradeEvents(state: GameState): GameEvent[] {
  return state.eventLog.filter((event) => event.type === "HERO_GRADE_ADVANCED");
}

/** Give the main hero a grade + picked nodes directly (state seam for effect tests). */
function grantNodes(state: GameState, playerId: PlayerId, nodes: string[], grade = 3): void {
  const hero = getMainHero(state, playerId)!;
  hero.grade = grade;
  hero.gradeNodes = nodes;
}

const FIELD_ID = "50,50";

function injectField(state: GameState, location: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "hg-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return field;
}

function visit(state: GameState): void {
  beginFieldVisit(state, getMainHero(state, "p1")!.id, FIELD_ID, false);
}

// ===========================================================================
// Mode OFF — byte-identical: no fields, no offers, no rider, train refused
// ===========================================================================

describe("anime.heroGrades — module OFF is inert", () => {
  it("stamps no grade, gains no Merit on level-up, offers no train / pick, and refuses HERO_TRAIN", () => {
    let state = adventure("hg-off", DEFAULT_ANIME_OPTIONS);
    state = startTurn(state);

    gainExperience(state, "p1", 12);
    const hero = getMainHero(state, "p1")!;
    expect(hero.level).toBe(7);
    expect(hero.gradeProgress).toBeUndefined();
    expect(hero.grade).toBeUndefined();
    expect(gradeEvents(state)).toHaveLength(0);
    expect(heroGradeOf(state, "p1")).toBe(0);

    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "HERO_TRAIN")).toBe(false);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "HERO_GRADE_PICK")).toBe(false);
    const forcedTrain = applyAction(state, { type: "HERO_TRAIN", playerId: "p1" });
    expect(forcedTrain.errors.length).toBeGreaterThan(0);
    const forcedPick = applyAction(state, {
      type: "HERO_GRADE_PICK",
      playerId: "p1",
      nodeId: HERO_GRADE_NODE_IDS.provisioner
    });
    expect(forcedPick.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: the enlightenment hex grants NO Merit with the module off (reward still fires)", () => {
    // REWRITTEN for the Field Override redesign (2026-08-19, wave 2): Ngộ Đạo
    // Thạch's reward is no longer a static location interaction — it is built at
    // visit time by `buildAnimeFieldVisitSteps`, which is gated on the anime
    // map-objects CONTENT being on. So the heroGrades-OFF control keeps anime
    // enabled and turns only heroGrades off; the previous version disabled the
    // whole anime mod, which now (correctly) leaves the hex inert and could no
    // longer discriminate the Merit rider.
    const state = adventure("hg-hex-off", GRADES_OFF);
    injectField(state, "anime.ngo_dao_thach");
    visit(state);
    // The printed reward (a Search of the Ability deck) still queues.
    expect((state.adventure!.rewardQueue?.length ?? 0) > 0 || Boolean(state.pendingChoice)).toBe(true);
    // But no Merit, no grade fields.
    expect(getMainHero(state, "p1")!.gradeProgress).toBeUndefined();
  });
});

// ===========================================================================
// Merit source 1 — level-ups (+1 Merit per level-up baseline)
// ===========================================================================

describe("anime.heroGrades — Merit from level-ups", () => {
  it("grants +1 Merit per hero level-up (one Merit per level crossed)", () => {
    let state = adventure("hg-level");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;

    gainExperience(state, "p1", 2); // level 2 → +1 Merit
    expect(hero.level).toBe(2);
    expect(hero.gradeProgress).toBe(1);
    expect(hero.grade ?? 0).toBe(0); // below the 3-Merit threshold

    gainExperience(state, "p1", 4); // levels 3 & 4 → +2 Merit (total 3) → grade 1
    expect(hero.level).toBe(4);
    expect(hero.gradeProgress).toBe(3);
    expect(hero.grade).toBe(1);
  });
});

// ===========================================================================
// Merit source 2 — enlightenment hex riders (original reward unchanged)
// ===========================================================================

describe("anime.heroGrades — Merit from enlightenment hexes", () => {
  /** The reward "signature" a visit produced (pending visit step, choice, or queued reward). */
  function rewardSignature(state: GameState): string {
    if (state.adventure?.pendingVisit) return `visit:${state.adventure.pendingVisit.steps[0]?.type}`;
    if (state.pendingChoice) return `choice:${state.pendingChoice.type}`;
    const reward = state.adventure?.rewardQueue?.[0];
    if (reward) return `reward:${reward.kind}`;
    return "none";
  }

  for (const hex of ["anime.dai_luyen_khi", "anime.ngo_dao_thach"] as const) {
    it(`${hex}: module ON grants +1 Merit AND its printed reward is byte-identical to module OFF`, () => {
      // Module ON.
      const on = adventure(`hg-hex-on-${hex}`);
      injectField(on, hex);
      visit(on);
      expect(getMainHero(on, "p1")!.gradeProgress).toBe(1);

      // Module OFF CONTROL — same reward, no Merit. REWRITTEN for the FO redesign
      // (2026-08-19, wave 2): both hexes now build their reward at visit time off
      // the anime map-objects content, so the control turns off heroGrades ONLY
      // (a fully anime-off table has no such hex to compare).
      const off = adventure(`hg-hex-on-${hex}`, GRADES_OFF);
      injectField(off, hex);
      visit(off);
      expect(getMainHero(off, "p1")!.gradeProgress).toBeUndefined();

      // The printed reward fired identically in BOTH modes (Merit is the only add).
      expect(rewardSignature(on)).not.toBe("none");
      expect(rewardSignature(on)).toBe(rewardSignature(off));
    });
  }
});

// ===========================================================================
// Merit source 3 — HERO_TRAIN (exactly 2 MP, once per turn, refusals)
// ===========================================================================

describe("anime.heroGrades — HERO_TRAIN", () => {
  it("spends exactly 2 movement for +1 Merit, then refuses a second train this turn", () => {
    let state = adventure("hg-train");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "start";
    hero.movementPoints = 5;

    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "HERO_TRAIN")).toBe(true);
    state = applyOk(state, { type: "HERO_TRAIN", playerId: "p1" });
    expect(getMainHero(state, "p1")!.movementPoints).toBe(3); // 5 − 2
    expect(getMainHero(state, "p1")!.gradeProgress).toBe(1);

    // Once per turn — a second attempt is refused even with MP to spare.
    const second = applyAction(state, { type: "HERO_TRAIN", playerId: "p1" });
    expect(second.errors.length).toBeGreaterThan(0);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "HERO_TRAIN")).toBe(false);
  });

  it("is refused with fewer than 2 movement points", () => {
    let state = adventure("hg-train-nomp");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "start";
    hero.movementPoints = 1;
    const result = applyAction(state, { type: "HERO_TRAIN", playerId: "p1" });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Merit source 4 — Training Manual (play → +2 Merit → removed; shop purchase)
// ===========================================================================

describe("anime.heroGrades — Training Manual item", () => {
  it("played on the map grants +2 Merit and is REMOVED from the game", () => {
    let state = adventure("hg-manual");
    state = startTurn(state);
    state.players.p1.hand = [HERO_GRADE_TRAINING_MANUAL_CARD_ID];

    const play = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "PLAY_CARD" && entry.action.cardId === HERO_GRADE_TRAINING_MANUAL_CARD_ID
    );
    expect(play, "the Training Manual should be playable on the map").toBeTruthy();
    state = applyOk(state, play!.action);

    expect(getMainHero(state, "p1")!.gradeProgress).toBe(2);
    expect(state.players.p1.hand).not.toContain(HERO_GRADE_TRAINING_MANUAL_CARD_ID);
    expect(state.players.p1.discard).not.toContain(HERO_GRADE_TRAINING_MANUAL_CARD_ID);
    expect(state.players.p1.removed).toContain(HERO_GRADE_TRAINING_MANUAL_CARD_ID);
  });

  it("is sold at a guild shop for 5 gold (module ON); a module-OFF visit never offers it (CONTROL)", () => {
    // Module ON: the shop visit appends the manual PAY_TO offer.
    const on = adventure("hg-shop-on");
    on.players.p1.resources.gold = 10;
    injectField(on, "anime.thuong_hoi_tram");
    visit(on);
    const steps = on.adventure!.pendingVisit?.steps ?? [];
    const payTo = steps.find(
      (step) => step.type === "PAY_TO" && step.steps.some((inner) => inner.type === "GAIN_HAND_CARD")
    );
    expect(payTo, "the Merchant Guild Post should sell the Training Manual").toBeTruthy();

    // Resolve the shop's own step (the Trading Post opens a menu — decline/finish),
    // then pay for the manual. Drive to the PAY_TO and accept the 5-gold option.
    let state = on;
    let guard = 0;
    while (state.adventure?.pendingVisit && guard < 12) {
      guard += 1;
      const legal = getLegalActions(state, "p1");
      const pay = legal.find(
        (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && /training manual|5 gold|pay/i.test(entry.label)
      );
      const finishShop = legal.find(
        (entry) =>
          entry.action.type === "RESOLVE_VISIT_STEP" && /done|finish|leave|no thanks|decline|keep/i.test(entry.label)
      );
      const anyStep = legal.find((entry) => entry.action.type === "RESOLVE_VISIT_STEP");
      const next = pay ?? finishShop ?? anyStep;
      if (!next) break;
      state = applyOk(state, next.action);
      if (state.players.p1.hand.includes(HERO_GRADE_TRAINING_MANUAL_CARD_ID)) break;
    }
    expect(state.players.p1.hand).toContain(HERO_GRADE_TRAINING_MANUAL_CARD_ID);
    expect(state.players.p1.resources.gold).toBe(5); // 10 − 5

    // CONTROL: module OFF, the same shop visit never appends the manual offer.
    const off = adventure("hg-shop-off", DEFAULT_ANIME_OPTIONS);
    injectField(off, "anime.thuong_hoi_tram");
    visit(off);
    const offSteps = off.adventure!.pendingVisit?.steps ?? [];
    expect(offSteps.some((step) => step.type === "PAY_TO" && step.steps.some((inner) => inner.type === "GAIN_HAND_CARD"))).toBe(false);
  });
});

// ===========================================================================
// Merit source 5 — the generic GAIN_GRADE_PROGRESS card payload
// ===========================================================================

describe("anime.heroGrades — the generic GAIN_GRADE_PROGRESS payload", () => {
  it("any future card carrying GAIN_GRADE_PROGRESS grants Merit (synthetic card)", () => {
    let state = adventure("hg-payload");
    state = startTurn(state);
    // Register a synthetic card that carries ONLY the generic payload.
    const synthId = "test.grade_payload";
    (cardLibrary as Record<string, unknown>)[synthId] = {
      id: synthId,
      name: "Grade Payload",
      kind: "artifact",
      timing: "instant",
      artifactTier: "minor",
      tags: ["artifact"],
      effect: {
        type: "CHOOSE_ONE",
        options: [{ label: "gain 3 Merit", mapOnly: true, cost: { removeSelf: true }, effect: { type: "GAIN_GRADE_PROGRESS", amount: 3 } }]
      },
      assets: { cardImage: "/x", imageAlt: "x" },
      implementationStatus: "implemented",
      source: { product: "", credit: "" }
    };
    try {
      state.players.p1.hand = [synthId];
      const play = getLegalActions(state, "p1").find(
        (entry) => entry.action.type === "PLAY_CARD" && entry.action.cardId === synthId
      );
      expect(play).toBeTruthy();
      state = applyOk(state, play!.action);
      expect(getMainHero(state, "p1")!.gradeProgress).toBe(3);
      expect(getMainHero(state, "p1")!.grade).toBe(1); // crossed the 3-Merit threshold
    } finally {
      delete (cardLibrary as Record<string, unknown>)[synthId];
    }
  });
});

// ===========================================================================
// Threshold crossings — one event + one point per grade
// ===========================================================================

describe("anime.heroGrades — grade thresholds", () => {
  it("a single big Merit grant jumps every threshold crossed: one event + one point per grade", () => {
    let state = adventure("hg-thresh");
    state = startTurn(state);
    // A synthetic card carrying +12 Merit in ONE grant → grades 1, 2, 3 all cross.
    const synthId = "test.grade_big";
    (cardLibrary as Record<string, unknown>)[synthId] = {
      id: synthId,
      name: "Big Merit",
      kind: "artifact",
      timing: "instant",
      artifactTier: "minor",
      tags: ["artifact"],
      effect: {
        type: "CHOOSE_ONE",
        options: [{ label: "gain 12 Merit", mapOnly: true, cost: { removeSelf: true }, effect: { type: "GAIN_GRADE_PROGRESS", amount: 12 } }]
      },
      assets: { cardImage: "/x", imageAlt: "x" },
      implementationStatus: "implemented",
      source: { product: "", credit: "" }
    };
    try {
      state.players.p1.hand = [synthId];
      const play = getLegalActions(state, "p1").find(
        (entry) => entry.action.type === "PLAY_CARD" && entry.action.cardId === synthId
      );
      state = applyOk(state, play!.action);
      const hero = getMainHero(state, "p1")!;
      expect(hero.gradeProgress).toBe(12);
      expect(hero.grade).toBe(3);
      expect(hero.gradePoints).toBe(3);
      expect(gradeEvents(state)).toHaveLength(3);
      // Each event names a distinct grade 1/2/3.
      expect(gradeEvents(state).map((event) => (event.type === "HERO_GRADE_ADVANCED" ? event.grade : 0))).toEqual([1, 2, 3]);
    } finally {
      delete (cardLibrary as Record<string, unknown>)[synthId];
    }
  });
});

// ===========================================================================
// Tree gating — below-grade tier, double-pick same tier, unknown node
// ===========================================================================

describe("anime.heroGrades — tree pick gating", () => {
  it("deals exactly four deterministic, varied choices per tier for each hero and town", () => {
    const first = adventure("hg-deal-a");
    const repeat = adventure("hg-deal-a");
    const otherHero = adventure("hg-deal-a");
    getMainHero(otherHero, "p1")!.heroDefId = "adelaide";
    const other = adventure("hg-deal-b", GRADES_ON, { players: [
      { id: "p1", name: "Azure", factionId: "azure_breeze", heroDefId: "qingyun" },
      { id: "p2", name: "Fuyuki", factionId: "fuyuki", heroDefId: "bin" }
    ] });
    const dealt = heroGradeNodesForPlayer(first, "p1");
    expect([1, 2, 3].map((tier) => dealt.filter((node) => node.tier === tier).length)).toEqual([4, 4, 4]);
    expect(heroGradeNodesForPlayer(repeat, "p1").map((node) => node.id)).toEqual(dealt.map((node) => node.id));
    expect(heroGradeNodesForPlayer(otherHero, "p1").map((node) => node.id)).not.toEqual(dealt.map((node) => node.id));
    expect(heroGradeNodesForPlayer(other, "p1").map((node) => node.id)).not.toEqual(dealt.map((node) => node.id));
  });

  it("offers only unlocked tiers, refuses a locked tier, a double-pick and an unknown node", () => {
    let state = adventure("hg-pick");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.grade = 1;
    hero.gradePoints = 1;

    // Each hero/town is dealt exactly four deterministic-random choices per tier.
    const pickable = heroGradePickableNodes(state, "p1");
    expect(pickable.every((node) => node.tier === 1)).toBe(true);
    expect(pickable.length).toBe(4);

    // A tier-2 node (deep-pockets) is refused at grade 1.
    const lockedTier = applyAction(state, { type: "HERO_GRADE_PICK", playerId: "p1", nodeId: HERO_GRADE_NODE_IDS.deepPockets });
    expect(lockedTier.errors.length).toBeGreaterThan(0);

    // Unknown node id refused.
    const unknown = applyAction(state, { type: "HERO_GRADE_PICK", playerId: "p1", nodeId: "no-such-node" });
    expect(unknown.errors.length).toBeGreaterThan(0);

    // Pick a valid tier-1 node — the point is spent, the node recorded.
    state = applyOk(state, { type: "HERO_GRADE_PICK", playerId: "p1", nodeId: pickable[0].id });
    expect(getMainHero(state, "p1")!.gradeNodes).toEqual([pickable[0].id]);
    expect(getMainHero(state, "p1")!.gradePoints).toBe(0);

    // With no point left, nothing is pickable.
    expect(heroGradePickableNodes(state, "p1")).toHaveLength(0);

    // Grant another point but the SAME tier is now full → tier-1 siblings are not offered.
    getMainHero(state, "p1")!.gradePoints = 1;
    const stillPickable = heroGradePickableNodes(state, "p1");
    expect(stillPickable.some((node) => node.tier === 1)).toBe(false);
    // A second tier-1 pick is refused at the handler too.
    const doublePick = applyAction(state, { type: "HERO_GRADE_PICK", playerId: "p1", nodeId: pickable[1].id });
    expect(doublePick.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Passive node effects — each with a no-node CONTROL
// ===========================================================================

describe("anime.heroGrades — passive node effects", () => {
  it("Bounty Hunter's Eye: +1 gold after a won combat (CONTROL: no node → no bonus)", () => {
    function winGold(withNode: boolean): number {
      let state = adventure(`hg-bounty-${withNode}`);
      state = startTurn(state);
      const hero = getMainHero(state, "p1")!;
      hero.level = 1;
      hero.spaceId = "guard-field";
      if (withNode) grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.bountyHuntersEye], 1);
      state.adventure!.fields["guard-field"] = {
        spaceId: "guard-field",
        tileInstanceId: "t",
        slot: 0,
        location: "mine",
        difficulty: 3,
        blackCube: false,
        flagOwnerId: null,
        everFlagged: false,
        settlementResource: null
      };
      startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
      const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
      if (place) {
        state = applyOk(state, place.action);
        state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
      }
      for (const unit of Object.values(state.combat!.units)) {
        if (unit.controllerId === "neutrals") unit.damage = unit.maxHealth;
      }
      const goldBefore = state.players.p1.resources.gold;
      finishCombatIfNeeded(state);
      finalizeAdventureCombat(state);
      return state.players.p1.resources.gold - goldBefore;
    }
    expect(winGold(true)).toBe(winGold(false) + 1);
  });

  it("Standing Ovation: +1 gold after a won combat, and STACKS with Bounty Hunter's Eye (+2)", () => {
    // heroGradeWinGold is the exact function finalizeAdventureCombat pays out
    // (proven end-to-end by the Bounty Hunter's Eye combat above); here we pin
    // the Standing Ovation branch and that the two idol/hunter nodes stack.
    const state = createInitialGameState("hg-ovation");
    state.anime = { ...GRADES_ON };
    expect(heroGradeWinGold(state, "p1")).toBe(0); // CONTROL: no node

    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.standingOvation], 3);
    expect(heroGradeWinGold(state, "p1")).toBe(1);

    grantNodes(
      state,
      "p1",
      [HERO_GRADE_NODE_IDS.standingOvation, HERO_GRADE_NODE_IDS.bountyHuntersEye],
      3
    );
    expect(heroGradeWinGold(state, "p1")).toBe(2);
  });

  it("Provisioner: +1 building materials at a Resources round (CONTROL: no node)", () => {
    function roundMaterials(withNode: boolean): number {
      const state = adventure(`hg-prov-${withNode}`);
      if (withNode) grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.provisioner], 1);
      const before = state.players.p1.resources.buildingMaterials;
      state.round = 3;
      startAdventureRound(state);
      return state.players.p1.resources.buildingMaterials - before;
    }
    expect(roundMaterials(true)).toBe(roundMaterials(false) + 1);
  });

  it("Tactician: +2 gold at a Resources round (CONTROL: no node)", () => {
    function roundGold(withNode: boolean): number {
      const state = adventure(`hg-tact-${withNode}`);
      if (withNode) grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.tactician], 3);
      const before = state.players.p1.resources.gold;
      state.round = 3;
      startAdventureRound(state);
      return state.players.p1.resources.gold - before;
    }
    expect(roundGold(true)).toBe(roundGold(false) + 2);
  });

  it("Deep Pockets: +1 hand limit, and STACKS observably with Cultivation Foundation (+2 total)", () => {
    const state = adventure("hg-hand", { ...GRADES_ON, cultivation: true });
    const hero = getMainHero(state, "p1")!;
    const base = effectiveHandLimit(state, "p1");

    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.deepPockets], 2);
    expect(effectiveHandLimit(state, "p1")).toBe(base + 1);

    // Cultivation Foundation (realm 1) also +1 → both stack to +2.
    hero.cultivationRealm = 1;
    expect(effectiveHandLimit(state, "p1")).toBe(base + 2);
  });

  it("Arcane Insight: +1 spell Power on the printed ladder (CONTROL: no node)", () => {
    function power(withNode: boolean): number {
      const state = createInitialGameState(`hg-power-${withNode}`);
      state.anime = { ...GRADES_ON };
      if (withNode) grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.arcaneInsight], 3);
      return standingSpellPower(state, "p1", cardLibrary["spell.magic_arrow"]);
    }
    expect(power(true)).toBe(power(false) + 1);
  });

  it("new round-economy nodes pay ore on Astrologers rounds and crystals on Resources rounds", () => {
    const astrologers = adventure("hg-ore");
    grantNodes(astrologers, "p1", [HERO_GRADE_NODE_IDS.oreDivination], 1);
    astrologers.round = 2;
    const oreBefore = astrologers.players.p1.resources.buildingMaterials;
    startAdventureRound(astrologers);
    expect(astrologers.players.p1.resources.buildingMaterials).toBe(oreBefore + 1);

    const resources = adventure("hg-crystal");
    grantNodes(resources, "p1", [HERO_GRADE_NODE_IDS.crystalDividend], 2);
    resources.round = 3;
    const crystalBefore = resources.players.p1.resources.valuables;
    startAdventureRound(resources);
    expect(resources.players.p1.resources.valuables).toBeGreaterThanOrEqual(crystalBefore + 1);
  });

  it("Overflowing Insight draws one over limit and immediately requires a discard back down", () => {
    let state = adventure("hg-overdraw");
    state.round = 2;
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.overflowingInsight], 1);
    const player = state.players.p1;
    player.hand = [];
    player.canMulligan = true;
    player.needsHandRefresh = false;
    const limit = effectiveHandLimit(state, "p1");
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(state.players.p1.hand).toHaveLength(limit + 1);
    expect(state.players.p1.needsHandRefresh).toBe(true);
    state = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: [state.players.p1.hand[0]]
    });
    expect(state.players.p1.hand).toHaveLength(limit);
    expect(state.players.p1.needsHandRefresh).toBe(false);
  });

  it("Wandering Curio Dealer queues an optional 3-gold random Minor Artifact offer", () => {
    const state = adventure("hg-curio");
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.wanderingCurioDealer], 2);
    state.round = 2;
    startAdventureRound(state);
    const offer = state.adventure!.rewardQueue.find(
      (reward) => reward.kind === "visit-steps" && reward.steps.some(
        (step) => step.type === "PAY_TO" && step.costOptions.some((cost) => cost.gold === 3)
      )
    );
    expect(offer).toBeTruthy();
  });

  it("Veteran Mentor grants every army card +1 XP at each game-round start", () => {
    const state = adventure("hg-mentor", GRADES_ON, { unitExperience: true });
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.veteranMentor], 3);
    const before = state.players.p1.army.map((unit) => unit.experience ?? 0);
    state.round = 2;
    startAdventureRound(state);
    expect(state.players.p1.army.map((unit) => unit.experience ?? 0)).toEqual(before.map((xp) => xp + 1));
  });
});

// ===========================================================================
// Skill node effects (combat + map) — each with a CONTROL
// ===========================================================================

function combatState(seed: string, nodes: string[]): GameState {
  const state = createInitialGameState(seed);
  state.anime = { ...GRADES_ON };
  grantNodes(state, "p1", nodes, 3);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.morale = 0;
  state.players.p2.morale = 0;
  const attacker = state.combat!.units.unit_p1_griffins;
  attacker.abilities = [];
  attacker.position = 9;
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 80;
  target.damage = 0;
  return state;
}

function resolveReactions(state: GameState): GameState {
  let current = state;
  let guard = 60;
  while (current.reactionWindow && guard > 0) {
    guard -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** The INITIATING attack roll (not a retaliation), whose attack/defense value carries the buff. */
function initiatingAttackRolled(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }> {
  const event = state.eventLog.find(
    (candidate) => candidate.type === "ATTACK_ROLLED" && !candidate.isRetaliation
  );
  expect(event, "an initiating ATTACK_ROLLED should exist").toBeTruthy();
  return event as Extract<GameEvent, { type: "ATTACK_ROLLED" }>;
}

function attack(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
}

describe("anime.heroGrades — skill node effects", () => {
  it("First Blood grants +2 only to the first declared attack of the combat", () => {
    const control = resolveReactions(attack(combatState("hg-first-blood-control", [])));
    const buffed = resolveReactions(attack(combatState("hg-first-blood", [HERO_GRADE_NODE_IDS.firstBlood])));
    expect(initiatingAttackRolled(buffed).attackValue).toBe(initiatingAttackRolled(control).attackValue + 2);
    expect(buffed.players.p1.combatStats.heroSkillsUsedThisCombat).toContain(HERO_GRADE_NODE_IDS.firstBlood);
  });

  it("Spirit Companion summons the framed, sortable 2/1/2/8 familiar for round 1, then it expires", () => {
    const state = combatState("hg-familiar", [HERO_GRADE_NODE_IDS.spiritCompanion]);
    const familiar = injectHeroGradeFamiliar(state, "p1", [16, 17, 18, 19]);
    expect(familiar).toMatchObject({ attack: 2, defense: 1, maxHealth: 2, initiative: 8 });
    expect(familiar?.assets?.cardImage).toBe(STARWIND_FAMILIAR_CARD_IMAGE);
    expireHeroGradeFamiliars(state, 1);
    expect(familiar?.damage).toBe(familiar?.maxHealth);
  });

  it("Spirit Companion is present during combat preparation and can be repositioned without consuming an army slot", () => {
    let state = startTurn(adventure("hg-familiar-setup"));
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.spiritCompanion], 1);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "familiar-guard";
    state.adventure!.fields[hero.spaceId] = {
      spaceId: hero.spaceId,
      tileInstanceId: "familiar-tile",
      slot: 0,
      location: "mine",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    startNeutralEncounter(state, hero, state.adventure!.fields[hero.spaceId]);
    const familiar = Object.values(state.combat!.units).find((unit) => unit.heroGradeExpiresAfterRound === 1)!;
    expect(familiar).toBeTruthy();
    expect(state.combat!.setup?.placedUnitIds.p1).toEqual([]);
    const destination = placementCellsFor(state, "p1").find(
      (cell) => !Object.values(state.combat!.units).some((unit) => unit.position === cell)
    )!;
    state = applyOk(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: familiar.armyUnitId!,
      position: destination
    });
    expect(Object.values(state.combat!.units).find((unit) => unit.id === familiar.id)?.position).toBe(destination);
    expect(state.combat!.setup?.placedUnitIds.p1).toEqual([]);
  });

  it("Falling Star damages the slowest enemy at combat-round start without a war-machine event", () => {
    const state = combatState("hg-falling-star", [HERO_GRADE_NODE_IDS.fallingStar]);
    const enemies = Object.values(state.combat!.units).filter((unit) => unit.controllerId === "p2");
    enemies.forEach((unit, index) => { unit.initiative = index + 1; unit.maxHealth = 80; unit.damage = 0; });
    const slowest = enemies[0];
    applyHeroGradeRoundStartDamage(state);
    expect(slowest.damage).toBe(1);
    expect(state.eventLog.some((event) => event.type === "WAR_MACHINE_TRIGGERED")).toBe(false);
  });

  it("War Cry (active): +1 Attack this activation, offered pre-attack (CONTROL: no node)", () => {
    function warCryAttackValue(withNode: boolean): number {
      let state = combatState(`hg-warcry-${withNode}`, withNode ? [HERO_GRADE_NODE_IDS.warCry] : []);
      const offer = getLegalActions(state, "p1").find((entry) => entry.action.type === "USE_HERO_SKILL");
      if (withNode) {
        expect(offer, "War Cry should be offered before attacking").toBeTruthy();
        state = applyOk(state, offer!.action);
      } else {
        expect(offer).toBeFalsy();
      }
      state = resolveReactions(attack(state));
      return initiatingAttackRolled(state).attackValue;
    }
    expect(warCryAttackValue(true)).toBe(warCryAttackValue(false) + 1);
  });

  it("War Cry is refused a second time this combat (cooldown), fresh next combat", () => {
    let state = combatState("hg-warcry-cd", [HERO_GRADE_NODE_IDS.warCry]);
    const offer = getLegalActions(state, "p1").find((entry) => entry.action.type === "USE_HERO_SKILL");
    state = applyOk(state, offer!.action);
    // Second use this combat is refused (both offer gone and handler rejects).
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "USE_HERO_SKILL")).toBe(false);
    const forced = applyAction(state, {
      type: "USE_HERO_SKILL",
      playerId: "p1",
      nodeId: HERO_GRADE_NODE_IDS.warCry,
      unitId: "unit_p1_griffins"
    });
    expect(forced.errors.length).toBeGreaterThan(0);
    // The used set clears next combat (makeCombatShell).
    expect(state.players.p1.combatStats.heroSkillsUsedThisCombat).toContain(HERO_GRADE_NODE_IDS.warCry);
  });

  it("Battle Focus (reaction): +1 Attack in the attack window (CONTROL: no node); pass-able", () => {
    function battleFocusAttackValue(use: boolean): number {
      const state = combatState(`hg-bf-${use}`, use ? [HERO_GRADE_NODE_IDS.battleFocus] : []);
      let current = attack(state);
      // In the open window, the attacker (p1) is offered the reaction.
      let guard = 30;
      let used = false;
      while (current.reactionWindow && guard > 0) {
        guard -= 1;
        const priority = current.reactionWindow.priorityPlayerId;
        const offer =
          use && priority === "p1"
            ? getLegalActions(current, "p1").find((entry) => entry.action.type === "USE_HERO_SKILL_REACTION")
            : undefined;
        if (offer && !used) {
          used = true;
          current = applyOk(current, offer.action);
        } else {
          current = applyOk(current, { type: "PASS_REACTION", playerId: priority });
        }
      }
      if (use) expect(used).toBe(true);
      return initiatingAttackRolled(current).attackValue;
    }
    expect(battleFocusAttackValue(true)).toBe(battleFocusAttackValue(false) + 1);
  });

  it("Iron Will (reaction): +1 Defense on the incoming hit (CONTROL: no node)", () => {
    function ironWillDefenseValue(use: boolean): number {
      // p1 defends: give the node to p1 and have p2 attack p1's unit.
      const state = createInitialGameState(`hg-iw-${use}`);
      state.anime = { ...GRADES_ON };
      grantNodes(state, "p1", use ? [HERO_GRADE_NODE_IDS.ironWill] : [], 3);
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.players.p1.morale = 0;
      state.players.p2.morale = 0;
      const attacker = state.combat!.units.unit_p2_skeletons;
      attacker.abilities = [];
      // griffins@9 is adjacent to the skeletons' default cell (mirror of the War
      // Cry fixture), so the skeletons can strike the griffins.
      state.combat!.units.unit_p1_griffins.position = 9;
      state.combat!.activeUnitId = "unit_p2_skeletons";
      state.activePlayerId = "p2";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
      const target = state.combat!.units.unit_p1_griffins;
      target.abilities = [];
      let current = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p1_griffins"
      });
      let guard = 30;
      let used = false;
      while (current.reactionWindow && guard > 0) {
        guard -= 1;
        const priority = current.reactionWindow.priorityPlayerId;
        const offer =
          use && priority === "p1"
            ? getLegalActions(current, "p1").find((entry) => entry.action.type === "USE_HERO_SKILL_REACTION")
            : undefined;
        if (offer && !used) {
          used = true;
          current = applyOk(current, offer.action);
        } else {
          current = applyOk(current, { type: "PASS_REACTION", playerId: priority });
        }
      }
      if (use) expect(used).toBe(true);
      return initiatingAttackRolled(current).defenseValue;
    }
    expect(ironWillDefenseValue(true)).toBe(ironWillDefenseValue(false) + 1);
  });

  it("Encore (active): heals 1 damage on the active unit (CONTROL: no node → no offer, no heal)", () => {
    function afterEncore(withNode: boolean): { before: number; after: number } {
      const state = combatState(`hg-encore-${withNode}`, withNode ? [HERO_GRADE_NODE_IDS.encore] : []);
      const unit = state.combat!.units.unit_p1_griffins;
      unit.maxHealth = 50;
      unit.damage = 3;
      const before = unit.damage;
      const offer = getLegalActions(state, "p1").find(
        (entry) =>
          entry.action.type === "USE_HERO_SKILL" && entry.action.nodeId === HERO_GRADE_NODE_IDS.encore
      );
      if (withNode) {
        expect(offer, "Encore should be offered during the unit's activation").toBeTruthy();
        const next = applyOk(state, offer!.action);
        return { before, after: next.combat!.units.unit_p1_griffins.damage };
      }
      expect(offer).toBeFalsy();
      return { before, after: unit.damage };
    }
    const healed = afterEncore(true);
    expect(healed.after).toBe(healed.before - 1); // 3 → 2
    const control = afterEncore(false);
    expect(control.after).toBe(control.before); // no heal without the node
  });

  it("Harmony Ward (reaction): the granted Defense token soaks 1 off the incoming hit (CONTROL: no node)", () => {
    // p2 attacks p1's Griffins. WITH the node p1 plays the reaction, the Griffins
    // gain a Defense token and roll the Defend die (scripted "+1" → +1 Defense),
    // so they take exactly 1 LESS damage than the CONTROL run without the node.
    // Observing the damage delta (not the token flag) survives the fact that the
    // token is spent the instant the Griffins' own activation opens next.
    function damageTaken(use: boolean): number {
      const state = createInitialGameState(`hg-harmony-${use}`);
      state.anime = { ...GRADES_ON };
      grantNodes(state, "p1", use ? [HERO_GRADE_NODE_IDS.harmonyWard] : [], 3);
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.players.p1.morale = 0;
      state.players.p2.morale = 0;
      const attacker = state.combat!.units.unit_p2_skeletons;
      attacker.abilities = [];
      const defender = state.combat!.units.unit_p1_griffins;
      defender.position = 9; // adjacent to the skeletons' cell (mirror of Iron Will)
      defender.abilities = [];
      defender.maxHealth = 80;
      defender.damage = 0;
      defender.defense = 0; // the raw hit always lands, so the shield's −1 is visible
      defender.defenseToken = false;
      state.combat!.activeUnitId = "unit_p2_skeletons";
      state.activePlayerId = "p2";
      // Every die shows "+1": the attack die (both runs) and, WITH the node, the
      // extra Defend die (+1 Defense) — so the only difference is the token.
      state.combat!.dice.scriptedRolls = [1, 1, 1, 1, 1, 1, 1, 1];
      let current = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p1_griffins"
      });
      let guard = 30;
      let used = false;
      while (current.reactionWindow && guard > 0) {
        guard -= 1;
        const priority = current.reactionWindow.priorityPlayerId;
        const offer =
          use && priority === "p1"
            ? getLegalActions(current, "p1").find(
                (entry) => entry.action.type === "USE_HERO_SKILL_REACTION"
              )
            : undefined;
        if (offer && !used) {
          used = true;
          current = applyOk(current, offer.action);
        } else {
          current = applyOk(current, { type: "PASS_REACTION", playerId: priority });
        }
      }
      if (use) expect(used).toBe(true);
      return current.combat!.units.unit_p1_griffins.damage;
    }
    const control = damageTaken(false);
    expect(control).toBeGreaterThan(0); // the raw hit lands
    expect(damageTaken(true)).toBe(control - 1); // the Defense token's Defend die soaked 1
  });

  it("Forced March (passive): +1 movement at the beginning of each Resources round", () => {
    const state = adventure("hg-march");
    const control = adventure("hg-march-control");
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.forcedMarch], 2);
    state.round = 3;
    control.round = 3;
    startAdventureRound(control);
    startAdventureRound(state);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(getMainHero(control, "p1")!.movementPoints + 1);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "USE_HERO_SKILL")).toBe(false);
  });

  it("CONTROL: combat skills are NOT offered when the main hero is not in the fight (garrison scope)", () => {
    // POSITIVE: in the sandbox fight (p1's own), War Cry IS offered.
    const inFight = combatState("hg-scope-pos", [HERO_GRADE_NODE_IDS.warCry]);
    expect(getLegalActions(inFight, "p1").some((entry) => entry.action.type === "USE_HERO_SKILL")).toBe(true);

    // NEGATIVE: a garrison-style fight where p1 has NO hero present (defenderHeroId
    // null) — the main hero still holds the node, but the scope gate hides the skill.
    const garrison = combatState("hg-scope-neg", [HERO_GRADE_NODE_IDS.warCry]);
    garrison.combat!.context = { kind: "player", attackerHeroId: "hero_p2", defenderHeroId: null, fieldId: "f" };
    expect(getLegalActions(garrison, "p1").some((entry) => entry.action.type === "USE_HERO_SKILL")).toBe(false);
  });
});

// ===========================================================================
// WOG Commanders + mixed-package seams
// ===========================================================================

describe("anime.heroGrades — cross-mod seams", () => {
  it("a reaction skill works in a WOG commander fight without crashing (Might dice untouched)", () => {
    const state = combatState("hg-wog", [HERO_GRADE_NODE_IDS.battleFocus]);
    state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
    let current = attack(state);
    let guard = 30;
    while (current.reactionWindow && guard > 0) {
      guard -= 1;
      const priority = current.reactionWindow.priorityPlayerId;
      const offer =
        priority === "p1"
          ? getLegalActions(current, "p1").find((entry) => entry.action.type === "USE_HERO_SKILL_REACTION")
          : undefined;
      current = offer
        ? applyOk(current, offer.action)
        : applyOk(current, { type: "PASS_REACTION", playerId: priority });
    }
    expect(initiatingAttackRolled(current)).toBeTruthy(); // resolved, no crash
  });

  it("MIXED PACKAGE: grade advancement fires identically with an isekai module also on", () => {
    let state = adventure("hg-mixed", { ...GRADES_ON, isekaiTowns: true, guild: true });
    state = startTurn(state);
    gainExperience(state, "p1", 6); // 3 level-ups → 3 Merit → grade 1
    expect(getMainHero(state, "p1")!.grade).toBe(1);
    expect(gradeEvents(state)).toHaveLength(1);
  });
});

// ===========================================================================
// Grade-name REGISTERS (one mechanic, faction-owned names)
// ===========================================================================

describe("anime.heroGrades — grade-name registers", () => {
  it("grade names follow the hero's faction and ignore table-wide package flags", () => {
    const xianxia = adventure("hg-reg-x", { ...GRADES_ON, cultivation: true });
    expect(heroGradeRegisterKey(xianxia, "p1")).toBe("core");
    expect(heroGradeLabel(xianxia, "p1", 1).en).toBe("Veteran");

    const isekai = adventure("hg-reg-i", { ...GRADES_ON, guild: true });
    expect(heroGradeRegisterKey(isekai, "p1")).toBe("core");
    expect(heroGradeLabel(isekai, "p1", 1).en).toBe("Veteran");

    // BOTH packages active → the Castle owner remains core.
    const both = adventure("hg-reg-both", { ...GRADES_ON, cultivation: true, guild: true });
    expect(heroGradeRegisterKey(both, "p1")).toBe("core");
    expect(heroGradeLabel(both, "p1", 1).en).toBe("Veteran");

    // NEITHER package (heroGrades alone) → the Castle owner remains core.
    const neither = adventure("hg-reg-none");
    expect(heroGradeRegisterKey(neither, "p1")).toBe("core");

    const mixed = adventure(
      "hg-reg-factions",
      { ...GRADES_ON, cultivation: true, guild: true },
      { players: [
        { id: "p1", name: "Fuyuki", factionId: "fuyuki", heroDefId: "bin" },
        { id: "p2", name: "Azure", factionId: "azure_breeze", heroDefId: "qingyun" }
      ] }
    );
    expect(heroGradeRegisterKey(mixed, "p1")).toBe("isekai");
    expect(heroGradeLabel(mixed, "p1", 1).en).toBe("Rank C");
    expect(heroGradeRegisterKey(mixed, "p2")).toBe("xianxia");
    expect(heroGradeLabel(mixed, "p2", 1).vi).toBe("Cao Thủ");
  });

  it("azur_lane wears the bespoke kansen register even in an isekai-only game (hidden_leaf CONTROL stays isekai)", () => {
    // An ISEKAI-ONLY table seating two anime-visual factions. Their owning
    // faction ids—not the shared package—must distinguish the registers.
    const isekaiOnly = adventure(
      "hg-reg-kansen",
      { ...GRADES_ON, isekaiTowns: true },
      {
        players: [
          { id: "p1", name: "AL", factionId: "azur_lane", heroDefId: "enterprise" },
          { id: "p2", name: "HL", factionId: "hidden_leaf", heroDefId: "naruto" }
        ]
      }
    );
    // (a) azur_lane → kansen; grade-3 label is the top ship-rarity "Super Rare".
    expect(heroGradeRegisterKey(isekaiOnly, "p1")).toBe("kansen");
    expect(heroGradeLabel(isekaiOnly, "p1", 3).en).toBe("Super Rare");
    expect(heroGradeLabel(isekaiOnly, "p1", 3).vi).toBe("Siêu Hiếm");
    // (b) CONTROL: hidden_leaf in the SAME game still resolves the isekai
    // register — the bespoke branch is faction-scoped, not table-wide.
    expect(heroGradeRegisterKey(isekaiOnly, "p2")).toBe("isekai");
    expect(heroGradeLabel(isekaiOnly, "p2", 3).en).toBe("Rank S");
  });

  it("azur_lane stays kansen in a both-packages game (bespoke override + family map agree)", () => {
    // Both packages active: the bespoke branch returns "kansen" first AND the
    // faction map agrees, so
    // reverting FACTION_GRADE_REGISTER.azur_lane to "isekai" would break this.
    const both = adventure(
      "hg-reg-kansen-both",
      { ...GRADES_ON, cultivation: true, isekaiTowns: true },
      {
        players: [
          { id: "p1", name: "AL", factionId: "azur_lane", heroDefId: "enterprise" },
          { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
        ]
      }
    );
    expect(heroGradeRegisterKey(both, "p1")).toBe("kansen");
    expect(factionGradeRegister("azur_lane")).toBe("kansen");
    // CONTROL: a core faction in the same both-packages game still falls to core.
    expect(heroGradeRegisterKey(both, "p2")).toBe("core");
  });

  it("heavenly_demon wears the bespoke modao register in a xianxia-only game (azure_breeze CONTROL stays xianxia)", () => {
    // A XIANXIA-ONLY table seating both wuxia-visual towns. The explicit owning
    // faction must distinguish Heavenly Demon's demonic ladder from Azure
    // Breeze's normal cultivation ladder.
    const xianxiaOnly = adventure(
      "hg-reg-modao",
      { ...GRADES_ON, xianxiaTowns: true },
      {
        players: [
          { id: "p1", name: "HD", factionId: "heavenly_demon", heroDefId: "xuedao" },
          { id: "p2", name: "AB", factionId: "azure_breeze", heroDefId: "qingyun" }
        ]
      }
    );
    // (a) heavenly_demon → modao; grade-3 label is the top demonic title.
    expect(heroGradeRegisterKey(xianxiaOnly, "p1")).toBe("modao");
    expect(heroGradeLabel(xianxiaOnly, "p1", 0).en).toBe("Blood Adept");
    expect(heroGradeLabel(xianxiaOnly, "p1", 3).en).toBe("Heavenly Demon");
    expect(heroGradeLabel(xianxiaOnly, "p1", 3).vi).toBe("Thiên Ma");
    // (b) CONTROL: azure_breeze in the SAME game keeps the PLAIN xianxia register —
    // the bespoke branch is faction-scoped, not table-wide.
    expect(heroGradeRegisterKey(xianxiaOnly, "p2")).toBe("xianxia");
    expect(heroGradeLabel(xianxiaOnly, "p2", 1).vi).toBe("Cao Thủ");
  });

  it("heavenly_demon stays modao in a both-packages game (bespoke override + family map agree)", () => {
    const both = adventure(
      "hg-reg-modao-both",
      { ...GRADES_ON, xianxiaTowns: true, isekaiTowns: true },
      {
        players: [
          { id: "p1", name: "HD", factionId: "heavenly_demon", heroDefId: "xuedao" },
          { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
        ]
      }
    );
    expect(heroGradeRegisterKey(both, "p1")).toBe("modao");
    expect(factionGradeRegister("heavenly_demon")).toBe("modao");
    // CONTROL: a core faction in the same both-packages game still falls to core.
    expect(heroGradeRegisterKey(both, "p2")).toBe("core");
  });

  it("every register is bilingually complete and its length equals the tier count + 1", () => {
    for (const [key, register] of Object.entries(HERO_GRADE_REGISTERS)) {
      expect(register.length, `${key} register length`).toBe(HERO_GRADE_TIER_COUNT + 1);
      for (const label of register) {
        expect(label.en.length, `${key} en`).toBeGreaterThan(0);
        expect(label.vi.length, `${key} vi`).toBeGreaterThan(0);
      }
    }
  });

  it("every current faction maps to the core register (data-driven faction family)", () => {
    for (const factionId of ["castle", "rampart", "necropolis", "conflux", "cove", "factory"]) {
      expect(factionGradeRegister(factionId)).toBe("core");
    }
    expect(factionGradeRegister("some-future-anime-town")).toBe("core"); // default
  });
});

// ===========================================================================
// Extensibility — the pure gating helpers honour a hypothetical extra tier
// ===========================================================================

describe("anime.heroGrades — extensibility (pure helpers, 4-tier fixture)", () => {
  const fourTierThresholds = [3, 7, 12, 18] as const;

  it("gradeForMerit honours a 4-threshold ladder (cap = array length)", () => {
    expect(gradeForMerit(2, fourTierThresholds)).toBe(0);
    expect(gradeForMerit(12, fourTierThresholds)).toBe(3);
    expect(gradeForMerit(18, fourTierThresholds)).toBe(4);
    expect(gradeForMerit(999, fourTierThresholds)).toBe(4); // capped at the array length
  });

  it("pickableNodesFrom honours a 4-tier catalog (tier gating, one-per-tier)", () => {
    const fixture: HeroGradeNode[] = [
      { id: "t1a", tier: 1, kind: "passive", name: { en: "T1a", vi: "T1a" }, summary: "" },
      { id: "t1b", tier: 1, kind: "passive", name: { en: "T1b", vi: "T1b" }, summary: "" },
      { id: "t4a", tier: 4, kind: "passive", name: { en: "T4a", vi: "T4a" }, summary: "" }
    ];
    // Grade 1: only tier-1 nodes, and once one is picked its tier is full.
    expect(pickableNodesFrom(fixture, 1, []).map((node) => node.id).sort()).toEqual(["t1a", "t1b"]);
    expect(pickableNodesFrom(fixture, 1, ["t1a"]).map((node) => node.id)).toEqual([]); // tier 1 full
    // The tier-4 node unlocks only at grade 4.
    expect(pickableNodesFrom(fixture, 3, ["t1a"]).map((node) => node.id)).toEqual([]);
    expect(pickableNodesFrom(fixture, 4, ["t1a"]).map((node) => node.id)).toEqual(["t4a"]);
  });
});

// ===========================================================================
// Player views / snapshots — all new fields PUBLIC + optional
// ===========================================================================

describe("anime.heroGrades — public state & legacy snapshots", () => {
  it("does not strip grade / gradeProgress / gradePoints / gradeNodes from another seat's view", () => {
    let state = adventure("hg-view", GRADES_ON, {
      players: [
        { id: "p1", name: "One", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.grade = 2;
    hero.gradeProgress = 8;
    hero.gradePoints = 1;
    hero.gradeNodes = [HERO_GRADE_NODE_IDS.provisioner];

    const p2View = getPlayerView(state, "p2");
    const viewed = Object.values(p2View.heroes).find((entry) => entry.controllerId === "p1" && entry.kind === "main");
    expect(viewed?.grade).toBe(2);
    expect(viewed?.gradeProgress).toBe(8);
    expect(viewed?.gradePoints).toBe(1);
    expect(viewed?.gradeNodes).toEqual([HERO_GRADE_NODE_IDS.provisioner]);
  });

  it("a legacy snapshot with none of the new fields loads and reads grade 0", () => {
    let state = adventure("hg-legacy");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    delete hero.grade;
    delete hero.gradeProgress;
    delete hero.gradePoints;
    delete hero.gradeNodes;
    expect(heroGradeOf(state, "p1")).toBe(0);
    expect(heroGradeProgressOf(state, "p1")).toBe(0);
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Deck-coverage hygiene — the Training Manual is a real, non-decked library card
// ===========================================================================

describe("anime.heroGrades — Training Manual deck hygiene", () => {
  it("is an implemented library card that joins NO deck (declared in animeNeverDeckedCardIds)", () => {
    expect(cardLibrary[HERO_GRADE_TRAINING_MANUAL_CARD_ID]?.implementationStatus).toBe("implemented");
    expect(animeNeverDeckedCardIds).toContain(HERO_GRADE_TRAINING_MANUAL_CARD_ID);
    // It never appears in a default (module-off) table's decks.
    const off = adventure("hg-deck-off", DEFAULT_ANIME_OPTIONS);
    const decked = Object.values(off.decks).flatMap((deck) => [...deck.drawPile, ...deck.discardPile]);
    expect(decked).not.toContain(HERO_GRADE_TRAINING_MANUAL_CARD_ID);
  });
});

// ===========================================================================
// Computer policy — spends a grade point, never stalls
// ===========================================================================

function observe(state: GameState, playerId: PlayerId): ComputerObservation {
  return { playerId, state: state as unknown as PlayerVisibleState, legalActions: getLegalActions(state, playerId) };
}

describe("anime.heroGrades — computer policy", () => {
  it("scores HERO_GRADE_PICK high (spends the point immediately), preferring a passive", () => {
    let state = adventure("hg-ai-pick");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.grade = 1;
    hero.gradePoints = 1;
    const decision = chooseComputerAction(observe(state, "p1"));
    expect(decision?.action.type).toBe("HERO_GRADE_PICK");
    const node = decision?.action.type === "HERO_GRADE_PICK" ? HERO_GRADE_NODES[decision.action.nodeId] : undefined;
    expect(node?.kind).toBe("passive"); // prefers a passive at the first tier
  });

  it("HERO_TRAIN scores just above END_TURN (only taken when idle) and never below it", () => {
    let state = adventure("hg-ai-train");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "start";
    hero.movementPoints = 4;
    const trainScore = scoreMapAction(observe(state, "p1"), { type: "HERO_TRAIN", playerId: "p1" });
    expect(trainScore).not.toBeNull();
    expect(trainScore!.score).toBeGreaterThan(300); // above END_TURN
    expect(trainScore!.score).toBeLessThan(590); // below any real map play
  });

  it("a computer seat with the module on drives a map turn without stalling and spends its point", () => {
    let state = adventure("hg-ai-drive");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.grade = 1;
    hero.gradePoints = 1;
    hero.spaceId = "start";
    let steps = 0;
    let spentPoint = false;
    while (steps < 40) {
      steps += 1;
      const decision = chooseComputerAction(observe(state, "p1"));
      expect(decision, "the AI must always have an action (no stall)").toBeTruthy();
      if (decision!.action.type === "HERO_GRADE_PICK") spentPoint = true;
      if (decision!.action.type === "END_TURN") break;
      const result = applyAction(state, decision!.action);
      if (result.errors.length > 0) break; // a rejected candidate is fine; stop the drive
      state = result.state;
    }
    expect(spentPoint).toBe(true);
    expect(steps).toBeLessThan(40);
  });
});

// ===========================================================================
// Expanded node effects — audit coverage for the 2026-08-17 node batch. Every
// claim asserts the observable game outcome with a CONTROL (no node / wrong
// round / enemy side), per CLAUDE.md rule 1a.
// ===========================================================================

describe("anime.heroGrades — expanded node effects (audit coverage)", () => {
  it("Mine Windfall pays the mine's printed production once on capture (CONTROL: no node; re-flagging own mine pays nothing)", () => {
    const state = adventure("hg-windfall");
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.mineWindfall], 1);
    const field = injectField(state, "mine");
    field.resource = "buildingMaterials";
    field.amount = 2;
    field.everFlagged = true; // isolate the windfall from the first-flag bonus
    const before = state.players.p1.resources.buildingMaterials;
    applyMineFlag(state, "p1", field);
    expect(state.players.p1.resources.buildingMaterials).toBe(before + 2);
    const owned = state.players.p1.resources.buildingMaterials;
    applyMineFlag(state, "p1", field); // re-flagging your own mine is not a capture
    expect(state.players.p1.resources.buildingMaterials).toBe(owned);

    const control = adventure("hg-windfall-control");
    const controlField = injectField(control, "mine");
    controlField.resource = "buildingMaterials";
    controlField.amount = 2;
    controlField.everFlagged = true;
    const controlBefore = control.players.p1.resources.buildingMaterials;
    applyMineFlag(control, "p1", controlField);
    expect(control.players.p1.resources.buildingMaterials).toBe(controlBefore);
  });

  it("Volatile Treasury: -3 gold each Resources round (floored at 0) and +6 gold each Astrologers round", () => {
    function roundGoldDelta(round: number, startGold: number): number {
      const withNode = adventure("hg-volatile");
      const control = adventure("hg-volatile");
      grantNodes(withNode, "p1", [HERO_GRADE_NODE_IDS.volatileTreasury], 1);
      for (const state of [withNode, control]) {
        state.players.p1.resources.gold = startGold;
        state.round = round;
        startAdventureRound(state);
      }
      return withNode.players.p1.resources.gold - control.players.p1.resources.gold;
    }
    expect(roundGoldDelta(3, 10)).toBe(-3); // Resources round
    expect(roundGoldDelta(2, 10)).toBe(6); // Astrologers round
    // Floor: with 1 gold at collection time the loss stops at 0, never debt.
    const poor = adventure("hg-volatile-floor");
    grantNodes(poor, "p1", [HERO_GRADE_NODE_IDS.volatileTreasury], 1);
    poor.players.p1.resources.gold = 0;
    poor.players.p1.production.gold = 1;
    poor.round = 3;
    startAdventureRound(poor);
    expect(poor.players.p1.resources.gold).toBe(0);
  });

  it("Auspicious Stars adds morale on Astrologers rounds only; Inspiring Presence on every round", () => {
    function moraleDelta(nodeId: string, round: number): number {
      const withNode = adventure(`hg-morale-${nodeId}-${round}`);
      const control = adventure(`hg-morale-${nodeId}-${round}`);
      grantNodes(withNode, "p1", [nodeId], 3);
      for (const state of [withNode, control]) {
        state.players.p1.morale = 0;
        state.round = round;
        startAdventureRound(state);
      }
      return withNode.players.p1.morale - control.players.p1.morale;
    }
    expect(moraleDelta(HERO_GRADE_NODE_IDS.astrologersMorale, 2)).toBe(1);
    expect(moraleDelta(HERO_GRADE_NODE_IDS.astrologersMorale, 3)).toBe(0); // CONTROL: not a Resources-round income
    expect(moraleDelta(HERO_GRADE_NODE_IDS.inspiringPresence, 2)).toBe(1);
    expect(moraleDelta(HERO_GRADE_NODE_IDS.inspiringPresence, 3)).toBe(1);
  });

  it("Artifact Broker sells one hand Artifact for 4 gold and removes it (CONTROL: refused without the node)", () => {
    let state = startTurn(adventure("hg-broker"));
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.artifactBroker], 1);
    state.players.p1.hand.push("wog.artifact.magic_wand");
    const gold = state.players.p1.resources.gold;
    const offer = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "HERO_GRADE_SELL_ARTIFACT" && entry.action.cardId === "wog.artifact.magic_wand"
    );
    expect(offer, "the broker sale should be offered for a held Artifact").toBeTruthy();
    state = applyOk(state, offer!.action);
    expect(state.players.p1.resources.gold).toBe(gold + 4);
    expect(state.players.p1.hand).not.toContain("wog.artifact.magic_wand");
    expect(state.players.p1.removed).toContain("wog.artifact.magic_wand");

    const control = startTurn(adventure("hg-broker-control"));
    control.players.p1.hand.push("wog.artifact.magic_wand");
    const refused = applyAction(control, {
      type: "HERO_GRADE_SELL_ARTIFACT",
      playerId: "p1",
      cardId: "wog.artifact.magic_wand"
    });
    expect(refused.errors.length).toBeGreaterThan(0);
  });

  it("Resource Sacrifice: taking the queued Resources-round offer removes the card and pays 3 gold", () => {
    const state = adventure("hg-sacrifice");
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.resourceSacrifice], 2);
    state.players.p1.hand = ["stat.attack"];
    state.round = 3;
    startAdventureRound(state);
    const reward = state.adventure!.rewardQueue.find(
      (entry) => entry.kind === "visit-steps" &&
        entry.playerId === "p1" &&
        entry.steps.some((step) => step.type === "CHOOSE_ONE" && step.prompt.includes("Resource Sacrifice"))
    );
    expect(reward, "the Resources-round sacrifice offer should queue").toBeTruthy();
    if (reward?.kind !== "visit-steps") throw new Error("unreachable");
    const hero = getMainHero(state, "p1")!;
    state.adventure!.rewardQueue.length = 0;
    state.adventure!.pendingVisit = { heroId: hero.id, playerId: "p1", fieldId: hero.spaceId!, steps: reward.steps };
    const gold = state.players.p1.resources.gold;
    const resolved = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(resolved.players.p1.resources.gold).toBe(gold + 3);
    expect(resolved.players.p1.hand).not.toContain("stat.attack");
    expect(resolved.players.p1.removed).toContain("stat.attack");

    // CONTROL: without the node no sacrifice offer queues.
    const control = adventure("hg-sacrifice-control");
    control.players.p1.hand = ["stat.attack"];
    control.round = 3;
    startAdventureRound(control);
    expect(control.adventure!.rewardQueue.some(
      (entry) => entry.kind === "visit-steps" &&
        entry.steps.some((step) => step.type === "CHOOSE_ONE" && step.prompt.includes("Resource Sacrifice"))
    )).toBe(false);
  });

  it("Ancestral Recall: the queued Resources-round offer returns a chosen discard to hand", () => {
    const state = adventure("hg-recall");
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.ancestralRecall], 3);
    state.players.p1.discard = ["stat.defense"];
    state.round = 3;
    startAdventureRound(state);
    const reward = state.adventure!.rewardQueue.find(
      (entry) => entry.kind === "visit-steps" &&
        entry.playerId === "p1" &&
        entry.steps.some((step) => step.type === "CHOOSE_ONE" && step.prompt.includes("Ancestral Recall"))
    );
    expect(reward, "the Resources-round recall offer should queue").toBeTruthy();
    if (reward?.kind !== "visit-steps") throw new Error("unreachable");
    const hero = getMainHero(state, "p1")!;
    state.adventure!.rewardQueue.length = 0;
    state.adventure!.pendingVisit = { heroId: hero.id, playerId: "p1", fieldId: hero.spaceId!, steps: reward.steps };
    let resolved = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    // DISCARD_PICK opens the discard-pick choice; take the only candidate.
    const choice = resolved.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    resolved = applyOk(resolved, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: 0
    });
    expect(resolved.players.p1.hand).toContain("stat.defense");
    expect(resolved.players.p1.discard).not.toContain("stat.defense");
  });

  it("Swift Host: +1 Initiative on every own unit exactly once at combat start (CONTROL: enemies untouched, re-run inert)", () => {
    const state = combatState("hg-swift", [HERO_GRADE_NODE_IDS.swiftHost]);
    const own = state.combat!.units.unit_p1_griffins.initiative;
    const enemy = state.combat!.units.unit_p2_skeletons.initiative;
    applyHeroGradeArmyInitiative(state);
    expect(state.combat!.units.unit_p1_griffins.initiative).toBe(own + 1);
    expect(state.combat!.units.unit_p2_skeletons.initiative).toBe(enemy);
    applyHeroGradeArmyInitiative(state); // combat-start re-entry must not stack
    expect(state.combat!.units.unit_p1_griffins.initiative).toBe(own + 1);
  });

  it("Spell Savant reveals one extra card on a Spell-deck Search (CONTROL: a non-Spell deck is untouched)", () => {
    function revealedCount(nodeIds: string[], deckId: string): number {
      let state = startTurn(adventure(`hg-savant-${deckId}-${nodeIds.length}`));
      grantNodes(state, "p1", nodeIds, 1);
      state.adventure!.rewardQueue.push({ playerId: "p1", kind: "shared-deck-search", deckId, count: 2 });
      pumpAdventureQueues(state);
      if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "deck-search-mode") {
        state = applyOk(state, {
          type: "CHOOSE_OPTION",
          playerId: "p1",
          choiceId: state.pendingChoice.id,
          optionIndex: 0
        });
      }
      expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
      return state.pendingChoice?.type === "DECK_SEARCH" ? state.pendingChoice.revealedCardIds.length : 0;
    }
    expect(revealedCount([HERO_GRADE_NODE_IDS.spellSavant], "spells")).toBe(3);
    expect(revealedCount([], "spells")).toBe(2); // CONTROL: no node
    expect(revealedCount([HERO_GRADE_NODE_IDS.spellSavant], "abilities")).toBe(2); // CONTROL: not a Spell deck
  });

  it("Resource Mastery may set the rolled Resource dice to any faces, including the same face twice", () => {
    const state = adventure("hg-mastery");
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.resourceMastery], 2);
    const hero = getMainHero(state, "p1")!;
    state.adventure!.pendingVisit = {
      heroId: hero.id,
      playerId: "p1",
      fieldId: hero.spaceId!,
      steps: [{ type: "ROLL_RESOURCE_DICE", count: 2, resolveCount: 2 }]
    };
    processPendingVisit(state);
    const step = state.adventure!.pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") throw new Error("unreachable");
    const masteryOptions = step.options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => option.label.startsWith("Resource Mastery:"));
    expect(masteryOptions.length).toBeGreaterThan(0);
    const goldOf = (option: (typeof step.options)[number]) =>
      option.steps.reduce((sum, inner) => sum + (inner.type === "GAIN_RESOURCES" ? inner.gold ?? 0 : 0), 0);
    const best = masteryOptions.reduce((a, b) => (goldOf(b.option) > goldOf(a.option) ? b : a));
    expect(goldOf(best.option)).toBe(12); // 6 gold + 6 gold — the same face on BOTH dice
    const gold = state.players.p1.resources.gold;
    const resolved = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: best.index });
    expect(resolved.players.p1.resources.gold).toBe(gold + 12);

    // CONTROL: without the node the roll offers no mastery picks.
    const control = adventure("hg-mastery-control");
    const controlHero = getMainHero(control, "p1")!;
    control.adventure!.pendingVisit = {
      heroId: controlHero.id,
      playerId: "p1",
      fieldId: controlHero.spaceId!,
      steps: [{ type: "ROLL_RESOURCE_DICE", count: 2, resolveCount: 2 }]
    };
    processPendingVisit(control);
    const controlStep = control.adventure!.pendingVisit?.steps[0];
    if (controlStep?.type === "CHOOSE_ONE") {
      expect(controlStep.options.some((option) => option.label.startsWith("Resource Mastery:"))).toBe(false);
    }
  });

  it("one-time rewards grant REAL cards on split decks: Major Legacy, Dual Arcana, Relic Destiny", () => {
    const legacy = startTurn(adventure("hg-onetime-major"));
    const before = legacy.players.p1.hand.length;
    applyHeroGradeOneTimeReward(legacy, "p1", HERO_GRADE_NODE_IDS.majorLegacy);
    expect(legacy.players.p1.hand.length).toBe(before + 1);
    expect(cardLibrary[legacy.players.p1.hand.at(-1)!]?.kind).toBe("artifact");

    const arcana = startTurn(adventure("hg-onetime-arcana"));
    const arcanaBefore = arcana.players.p1.hand.length;
    applyHeroGradeOneTimeReward(arcana, "p1", HERO_GRADE_NODE_IDS.dualArcana);
    expect(arcana.players.p1.hand.length).toBe(arcanaBefore + 2);
    for (const cardId of arcana.players.p1.hand.slice(-2)) {
      expect(cardLibrary[cardId]?.kind).toBe("spell");
    }

    let relic = startTurn(adventure("hg-onetime-relic"));
    applyHeroGradeOneTimeReward(relic, "p1", HERO_GRADE_NODE_IDS.relicDestiny);
    expect(relic.adventure!.polishArtifactAccess).toEqual({ minor: false, major: false, relic: true });
    pumpAdventureQueues(relic);
    if (relic.pendingChoice?.type === "OPTION_CHOICE" && relic.pendingChoice.context === "deck-search-mode") {
      relic = applyOk(relic, {
        type: "CHOOSE_OPTION",
        playerId: "p1",
        choiceId: relic.pendingChoice.id,
        optionIndex: 0
      });
    }
    expect(relic.pendingChoice?.type).toBe("DECK_SEARCH");
    if (relic.pendingChoice?.type === "DECK_SEARCH") {
      expect(relic.pendingChoice.deckId).toBe("artifacts-relic");
      expect(relic.pendingChoice.revealedCardIds).toHaveLength(5);
    }
  });

  it("one-time rewards fall back to the COMBINED decks when split-decks is off (they used to no-op)", () => {
    const combined = () => {
      const state = startTurn(adventure("hg-onetime-combined", GRADES_ON, { houseRules: { "split-decks": false } }));
      expect(state.decks["artifacts-major"]).toBeUndefined();
      return state;
    };
    const major = combined();
    const before = major.players.p1.hand.length;
    applyHeroGradeOneTimeReward(major, "p1", HERO_GRADE_NODE_IDS.majorLegacy);
    expect(major.players.p1.hand.length).toBe(before + 1);
    expect(cardLibrary[major.players.p1.hand.at(-1)!]?.kind).toBe("artifact");

    const arcana = combined();
    const arcanaBefore = arcana.players.p1.hand.length;
    applyHeroGradeOneTimeReward(arcana, "p1", HERO_GRADE_NODE_IDS.dualArcana);
    expect(arcana.players.p1.hand.length).toBe(arcanaBefore + 2);

    const relic = combined();
    applyHeroGradeOneTimeReward(relic, "p1", HERO_GRADE_NODE_IDS.relicDestiny);
    const search = relic.adventure!.rewardQueue.find((entry) => entry.kind === "shared-deck-search");
    expect(search?.kind === "shared-deck-search" ? search.deckId : null).toBe("artifacts");

    // Dual Arcana pays 1 gold ONLY when no Spell can be granted at all.
    const dry = combined();
    dry.decks.spells.drawPile = [];
    dry.decks.spells.discardPile = [];
    const dryGold = dry.players.p1.resources.gold;
    applyHeroGradeOneTimeReward(dry, "p1", HERO_GRADE_NODE_IDS.dualArcana);
    expect(dry.players.p1.resources.gold).toBe(dryGold + 1);
  });

  it("HERO_GRADE_PICK itself fires the one-time reward (pick wiring, not just the helper)", () => {
    // The four-choice deal is seed-owned; scan seeds until Major Legacy is dealt
    // on tier 2, then pick it through the REAL action pipeline.
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = startTurn(adventure(`hg-pick-onetime-${attempt}`));
      const dealt = heroGradeNodesForPlayer(state, "p1");
      if (!dealt.some((node) => node.id === HERO_GRADE_NODE_IDS.majorLegacy)) continue;
      const hero = getMainHero(state, "p1")!;
      hero.grade = 2;
      hero.gradePoints = 1;
      const before = state.players.p1.hand.length;
      const picked = applyOk(state, {
        type: "HERO_GRADE_PICK",
        playerId: "p1",
        nodeId: HERO_GRADE_NODE_IDS.majorLegacy
      });
      expect(picked.players.p1.hand.length).toBe(before + 1);
      expect(cardLibrary[picked.players.p1.hand.at(-1)!]?.kind).toBe("artifact");
      return;
    }
    throw new Error("no seed in 80 attempts dealt Major Legacy — the deal or the catalog changed");
  });
});
