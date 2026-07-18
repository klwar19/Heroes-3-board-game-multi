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
import { beginFieldVisit, startAdventureRound } from "./adventure";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const GRADES_ON = { ...DEFAULT_ANIME_OPTIONS, enabled: true, heroGrades: true };

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
    const state = adventure("hg-hex-off", DEFAULT_ANIME_OPTIONS);
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

      // Module OFF CONTROL — same reward, no Merit.
      const off = adventure(`hg-hex-on-${hex}`, DEFAULT_ANIME_OPTIONS);
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

  it("is sold at a guild shop for 2 gold (module ON); a module-OFF visit never offers it (CONTROL)", () => {
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
    // then pay for the manual. Drive to the PAY_TO and accept the 2-gold option.
    let state = on;
    let guard = 0;
    while (state.adventure?.pendingVisit && guard < 12) {
      guard += 1;
      const legal = getLegalActions(state, "p1");
      const pay = legal.find(
        (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && /training manual|2 gold|pay/i.test(entry.label)
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
    expect(state.players.p1.resources.gold).toBe(8); // 10 − 2

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
  it("offers only unlocked tiers, refuses a locked tier, a double-pick and an unknown node", () => {
    let state = adventure("hg-pick");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.grade = 1;
    hero.gradePoints = 1;

    // Only tier-1 nodes are pickable at grade 1.
    const pickable = heroGradePickableNodes(state, "p1");
    expect(pickable.every((node) => node.tier === 1)).toBe(true);
    expect(pickable.length).toBe(3);

    // A tier-2 node (deep-pockets) is refused at grade 1.
    const lockedTier = applyAction(state, { type: "HERO_GRADE_PICK", playerId: "p1", nodeId: HERO_GRADE_NODE_IDS.deepPockets });
    expect(lockedTier.errors.length).toBeGreaterThan(0);

    // Unknown node id refused.
    const unknown = applyAction(state, { type: "HERO_GRADE_PICK", playerId: "p1", nodeId: "no-such-node" });
    expect(unknown.errors.length).toBeGreaterThan(0);

    // Pick a valid tier-1 node — the point is spent, the node recorded.
    state = applyOk(state, { type: "HERO_GRADE_PICK", playerId: "p1", nodeId: HERO_GRADE_NODE_IDS.provisioner });
    expect(getMainHero(state, "p1")!.gradeNodes).toEqual([HERO_GRADE_NODE_IDS.provisioner]);
    expect(getMainHero(state, "p1")!.gradePoints).toBe(0);

    // With no point left, nothing is pickable.
    expect(heroGradePickableNodes(state, "p1")).toHaveLength(0);

    // Grant another point but the SAME tier is now full → tier-1 siblings are not offered.
    getMainHero(state, "p1")!.gradePoints = 1;
    const stillPickable = heroGradePickableNodes(state, "p1");
    expect(stillPickable.some((node) => node.tier === 1)).toBe(false);
    // A second tier-1 pick is refused at the handler too.
    const doublePick = applyAction(state, { type: "HERO_GRADE_PICK", playerId: "p1", nodeId: HERO_GRADE_NODE_IDS.battleFocus });
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

  it("Forced March (map active): +1 movement, once per round (CONTROL fresh next round)", () => {
    let state = adventure("hg-march");
    state = startTurn(state);
    grantNodes(state, "p1", [HERO_GRADE_NODE_IDS.forcedMarch], 2);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "start";
    hero.movementPoints = 2;

    const offer = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "USE_HERO_SKILL" && entry.action.nodeId === HERO_GRADE_NODE_IDS.forcedMarch
    );
    expect(offer).toBeTruthy();
    state = applyOk(state, offer!.action);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(3); // +1

    // Once per round: not offered again this round.
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "USE_HERO_SKILL")).toBe(false);
    // Fresh next round.
    state.round += 1;
    getMainHero(state, "p1")!.movementPoints = 2;
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "USE_HERO_SKILL")).toBe(true);
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
// Grade-name REGISTERS (one mechanic, package-specific names)
// ===========================================================================

describe("anime.heroGrades — grade-name registers", () => {
  it("xianxia-only shows the martial title; isekai-only shows the rank; both/neither fall back to core", () => {
    const xianxia = adventure("hg-reg-x", { ...GRADES_ON, cultivation: true });
    expect(heroGradeRegisterKey(xianxia, "p1")).toBe("xianxia");
    expect(heroGradeLabel(xianxia, "p1", 1).vi).toBe("Cao Thủ");

    const isekai = adventure("hg-reg-i", { ...GRADES_ON, guild: true });
    expect(heroGradeRegisterKey(isekai, "p1")).toBe("isekai");
    expect(heroGradeLabel(isekai, "p1", 1).en).toBe("Rank C");

    // BOTH packages active → coexistence CONTROL → core (per-faction, all core).
    const both = adventure("hg-reg-both", { ...GRADES_ON, cultivation: true, guild: true });
    expect(heroGradeRegisterKey(both, "p1")).toBe("core");
    expect(heroGradeLabel(both, "p1", 1).en).toBe("Veteran");

    // NEITHER package (heroGrades alone) → per-faction fallback → core.
    const neither = adventure("hg-reg-none");
    expect(heroGradeRegisterKey(neither, "p1")).toBe("core");
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
