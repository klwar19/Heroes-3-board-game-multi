import { describe, expect, it } from "vitest";

import {
  ARTIFACT_SETS,
  ARTIFACT_SET_BY_MEMBER,
  SET_ARTIFACT_MEMBERS_NOT_IN_GAME,
  activeTiersForPieces,
  applyAction,
  artifactSetActiveTierCount,
  artifactSetPieceCount,
  artifactSetPowerOffers,
  artifactSetRecruitGoldDiscount,
  artifactSetSpellDamageReduction,
  createAdventureGameState,
  effectiveInitiative,
  getActivationOrder,
  getAttackRollMode,
  getLegalActions,
  getPlayerView,
  makeCombatUnitFromArmy,
  NEUTRAL_PLAYER_ID,
  playerArtifactSetStatuses,
  redactStateForSeat,
  setArtifactsEnabled,
  unitSideRuleOverrides,
  type ArtifactSetId
} from "./index";
import { eliminatePlayer, reinforceArmyUnit, startAdventureRound } from "./adventure";
import { computerDecisionOwner } from "./computer/window";
import { standardComputerController } from "./computer/control";
import { chooseComputerAction } from "./computer/policy";
import { nextTurnTimeoutAction } from "./afk-drop";
import { startNeutralEncounter } from "./adventure-reducer";
import {
  artifactSetCombatStartWindowOpen,
  artifactSetEnemySpellPowerDrain,
  markArtifactSetSpellDrain
} from "./artifact-sets";
import { COMBAT_START_TEXT_PATTERN } from "@/data/cards/artifact-sets";
import { cardLibrary } from "@/data/cards/library";
import type { CardId, CombatState, GameAction, GameState, PlayerId } from "./state";

// ===========================================================================
// Harness
// ===========================================================================

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function makeState(enabled = true, seed = "artifact-sets"): GameState {
  let state = createAdventureGameState({
    startingBuildings: [],
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    ruleset: "legacy",
    houseRules: { "polish-set-artifacts": enabled }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.resources = { gold: 500, buildingMaterials: 100, valuables: 100 };
  return state;
}

/** Put exactly `cards` in the player's hand and clear every other owning zone. */
function ownOnly(state: GameState, cards: CardId[], playerId: PlayerId = "p1"): void {
  const player = state.players[playerId];
  player.hand = [...cards];
  player.deck = [];
  player.discard = [];
  player.removed = [];
  player.permanents = [];
  player.ongoingCards = [];
}

const AA = "angelic_alliance";
const AA_MEMBERS = ARTIFACT_SETS.find((set) => set.id === AA)!.members;
const TT_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "titans_thunder")!.members;
const IOTO_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "ironfist_of_the_ogre")!.members;
const AOTD_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "armor_of_the_damned")!.members;
const POR_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "pendant_of_reflection")!.members;
const WW_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "wizards_well")!.members;
const DC_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "diplomats_cloak")!.members;
const COR_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "cornucopia")!.members;
const SOL_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "statue_of_legion")!.members;
const GG_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "golden_goose")!.members;
const PODF_MEMBERS = ARTIFACT_SETS.find((set) => set.id === "power_of_the_dragon_father")!.members;

/**
 * Stage a REAL two-sided combat inside an adventure state: p1's units from
 * `own`, the neutral side's from `foe`. Real `makeCombatUnitFromArmy` bodies, so
 * initiative / grade / health are the printed ones.
 */
function stageCombat(
  state: GameState,
  own: { unitDefId: string; side: "few" | "pack" | "neutral" }[],
  foe: { unitDefId: string; side: "few" | "pack" | "neutral" }[]
): CombatState {
  const overrides = unitSideRuleOverrides(state);
  const units: CombatState["units"] = {};
  own.forEach((card, index) => {
    const unit = makeCombatUnitFromArmy(
      { id: `own_${index}`, unitDefId: card.unitDefId, side: card.side },
      "p1",
      `u_own_${index}`,
      index,
      "legacy",
      overrides
    )!;
    units[unit.id] = unit;
  });
  foe.forEach((card, index) => {
    const unit = makeCombatUnitFromArmy(
      { id: `foe_${index}`, unitDefId: card.unitDefId, side: card.side },
      NEUTRAL_PLAYER_ID,
      `u_foe_${index}`,
      10 + index,
      "legacy",
      overrides
    )!;
    units[unit.id] = unit;
  });
  const hero = state.heroes.hero_p1;
  const combat: CombatState = {
    id: "combat_sets",
    round: 1,
    attackerPlayerId: "p1",
    defenderPlayerId: NEUTRAL_PLAYER_ID,
    activeUnitId: Object.keys(units)[0] ?? null,
    setup: null,
    awaitingContinue: false,
    outcome: null,
    units,
    context: {
      kind: "neutral",
      heroId: hero.id,
      fieldId: hero.spaceId ?? "field",
      difficulty: 1,
      hasAzure: false
    }
  } as CombatState;
  state.combat = combat;
  state.phase = "combat";
  return combat;
}

function offerLabels(state: GameState, playerId: PlayerId = "p1"): string[] {
  return artifactSetPowerOffers(state, playerId).map((offer) => offer.label);
}

// ===========================================================================
// 1. DATA — registry hygiene
// ===========================================================================

describe("Set Artifacts — set data registry", () => {
  it("resolves every member id to a real artifact card in the library", () => {
    for (const set of ARTIFACT_SETS) {
      for (const member of set.members) {
        const card = cardLibrary[member];
        expect(card, `${set.id} member ${member}`).toBeTruthy();
        expect(card.kind, `${member} kind`).toBe("artifact");
      }
    }
  });

  it("never puts one card in two sets", () => {
    const seen = new Map<CardId, ArtifactSetId>();
    for (const set of ARTIFACT_SETS) {
      for (const member of set.members) {
        expect(seen.get(member), `${member} already in ${seen.get(member)}`).toBeUndefined();
        seen.set(member, set.id);
      }
    }
    expect(Object.keys(ARTIFACT_SET_BY_MEMBER)).toHaveLength(seen.size);
  });

  it("gives every set contiguous thresholds from 2 up to its member count", () => {
    for (const set of ARTIFACT_SETS) {
      expect(set.members.length, `${set.id} needs 2+ members to ever activate`).toBeGreaterThanOrEqual(2);
      expect(set.tiers.length, `${set.id} tier count`).toBe(set.members.length - 1);
      set.tiers.forEach((tier, index) => {
        expect(tier.threshold, `${set.id} tier ${index}`).toBe(index + 2);
        expect(tier.text.length).toBeGreaterThan(0);
      });
      // The top tier must be reachable: a set can never print an effect that
      // needs more pieces than the game actually ships.
      expect(set.tiers[set.tiers.length - 1].threshold).toBeLessThanOrEqual(set.members.length);
    }
  });

  it("keeps the missing-member registry hygienic (no id that really exists)", () => {
    for (const missing of SET_ARTIFACT_MEMBERS_NOT_IN_GAME) {
      const slug = missing.name.toLowerCase().replace(/[^a-z]+/g, "_");
      expect(cardLibrary[`artifact.${slug}`], `${missing.name} is actually in the library`).toBeUndefined();
    }
    // Today every spec member ships, so the registry is empty. If that ever
    // changes, the set's tier list above must shrink with it.
    expect(SET_ARTIFACT_MEMBERS_NOT_IN_GAME).toEqual([]);
  });

  it("gives every tier effect kind an engine branch (no decorative tiers)", () => {
    // Every kind listed here is driven by a behaviour test in this file. A NEW
    // kind must be wired AND covered before it may be added to the data.
    const wired = new Set([
      "select-unit",
      "attack-roll-advantage",
      "attack-roll-disadvantage",
      "defense-token",
      "attack-bonus",
      "defense-bonus",
      "fire-shield",
      "spell-zap",
      "spell-damage-reduction",
      "enemy-spell-power-drain",
      "draw-then-discard",
      "neutral-scry",
      "income",
      "recruit-discount"
    ]);
    for (const set of ARTIFACT_SETS) {
      for (const tier of set.tiers) {
        expect(wired.has(tier.effect.kind), `${set.id}:${tier.threshold} kind ${tier.effect.kind}`).toBe(true);
      }
    }
  });

  it("activates tiers cumulatively from 2 pieces (the printed ladder)", () => {
    const aa = ARTIFACT_SETS.find((set) => set.id === AA)!;
    expect(activeTiersForPieces(aa, 0)).toBe(0);
    expect(activeTiersForPieces(aa, 1)).toBe(0);
    expect(activeTiersForPieces(aa, 2)).toBe(1);
    expect(activeTiersForPieces(aa, 3)).toBe(2);
    expect(activeTiersForPieces(aa, 6)).toBe(5);
    // Never past the printed list, whatever the count.
    expect(activeTiersForPieces(aa, 99)).toBe(5);
  });
});

// ===========================================================================
// 2. COUNTING — every owning zone, distinct only, removed CONTROL
// ===========================================================================

describe("Set Artifacts — piece counting across zones", () => {
  it("counts a member in deck, hand, discard, an in-play permanent AND the ongoing tray", () => {
    const state = makeState();
    const player = state.players.p1;
    player.deck = [AA_MEMBERS[0]];
    player.hand = [AA_MEMBERS[1]];
    player.discard = [AA_MEMBERS[2]];
    player.permanents = [AA_MEMBERS[3]];
    player.ongoingCards = [{ cardId: AA_MEMBERS[4], effectIds: [], returnTo: "discard" }];
    player.removed = [];
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(5);
    expect(artifactSetActiveTierCount(state, "p1", AA)).toBe(4);
  });

  it("CONTROL: a REMOVED copy never counts", () => {
    const state = makeState();
    ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(2);

    // Move one member from the hand to `removed`: the set drops below 2 and
    // every tier switches off.
    state.players.p1.hand = [AA_MEMBERS[0]];
    state.players.p1.removed = [AA_MEMBERS[1]];
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(1);
    expect(artifactSetActiveTierCount(state, "p1", AA)).toBe(0);
  });

  it("counts DISTINCT members only — two copies of one card are one piece", () => {
    const state = makeState();
    ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[0], AA_MEMBERS[0]]);
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(1);
  });

  it("counts only that set's members (a foreign artifact never helps)", () => {
    const state = makeState();
    ownOnly(state, [AA_MEMBERS[0], "artifact.boots_of_speed", "artifact.speculum"]);
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(1);
  });

  it("is per-player: an opponent's members never count for you", () => {
    const state = makeState();
    ownOnly(state, [AA_MEMBERS[0]]);
    ownOnly(state, [AA_MEMBERS[1], AA_MEMBERS[2]], "p2");
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(1);
    expect(artifactSetPieceCount(state, "p2", AA)).toBe(2);
  });

  it("RULE OFF: counts 0 whatever the player owns, and no set status exists", () => {
    const state = makeState(false, "sets-off-count");
    ownOnly(state, [...AA_MEMBERS]);
    expect(setArtifactsEnabled(state)).toBe(false);
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(0);
    expect(artifactSetActiveTierCount(state, "p1", AA)).toBe(0);
    expect(playerArtifactSetStatuses(state, "p1")).toEqual([]);
    expect(artifactSetPowerOffers(state, "p1")).toEqual([]);
  });
});

// ===========================================================================
// 3. PUBLIC status on the player view
// ===========================================================================

describe("Set Artifacts — the public status on every player view", () => {
  it("shows an OPPONENT's set progress even though their hand and deck are hidden", () => {
    const state = makeState();
    ownOnly(state, []);
    // p2's pieces sit in their PRIVATE zones (deck + hand).
    state.players.p2.deck = [AA_MEMBERS[0], AA_MEMBERS[1]];
    state.players.p2.hand = [AA_MEMBERS[2]];
    state.players.p2.discard = [];
    state.players.p2.removed = [];

    // The status is synced at the applyAction tail, so drive one real action.
    const synced = applyOk(state, { type: "END_TURN", playerId: "p1" });
    const p1View = getPlayerView(synced, "p1");
    // The zones themselves stay hidden…
    expect(p1View.players.p2.hand).toEqual([]);
    expect(p1View.players.p2.deck).toEqual([]);
    // …but the derived set status is public and correct.
    expect(p1View.players.p2.artifactSetStatus).toEqual([
      { setId: AA, pieces: 3, activeTiers: 2, memberCount: 6 }
    ]);
  });

  it("survives redactStateForSeat — a hosted client can still read an opponent's progress", () => {
    // On a hosted table the client only ever holds a redacted frame with every
    // opponent's deck and hand masked. The status must therefore ride REAL
    // state, not a view-time recompute, or every opponent would read 0.
    const state = makeState(true, "sets-redaction");
    ownOnly(state, []);
    state.players.p2.deck = [AA_MEMBERS[0], AA_MEMBERS[1]];
    state.players.p2.hand = [AA_MEMBERS[2]];
    state.players.p2.discard = [];
    state.players.p2.removed = [];
    // Sync runs at the applyAction tail, so drive one real action.
    const synced = applyOk(state, { type: "END_TURN", playerId: "p1" });
    expect(synced.players.p2.artifactSetStatus).toEqual([
      { setId: AA, pieces: 3, activeTiers: 2, memberCount: 6 }
    ]);

    const redacted = redactStateForSeat(synced, "p1");
    expect(redacted.players.p2.hand.every((cardId) => cardId === "hidden")).toBe(true);
    // Re-deriving the view from the redacted frame still shows the true count.
    expect(getPlayerView(redacted, "p1").players.p2.artifactSetStatus).toEqual([
      { setId: AA, pieces: 3, activeTiers: 2, memberCount: 6 }
    ]);
  });

  it("CONTROL: rule OFF puts an empty status on every view", () => {
    const state = makeState(false, "sets-off-view");
    state.players.p2.hand = [...AA_MEMBERS];
    expect(getPlayerView(state, "p1").players.p2.artifactSetStatus).toEqual([]);
  });
});

// ===========================================================================
// 4. INCOME — Cornucopia (Resource round) and Golden Goose (every round)
// ===========================================================================

describe("Set Artifacts — income", () => {
  function roundIncome(state: GameState, round: number, playerId: PlayerId = "p1"): Record<string, number> {
    state.round = round;
    const before = { ...state.players[playerId].resources };
    startAdventureRound(state);
    const after = state.players[playerId].resources;
    return {
      gold: after.gold - before.gold,
      buildingMaterials: after.buildingMaterials - before.buildingMaterials,
      valuables: after.valuables - before.valuables
    };
  }

  it("Cornucopia pays +2 materials at 2 pieces and +1 valuable more at 3 — on the RESOURCE round", () => {
    const state = makeState(true, "sets-cornucopia");
    state.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
    ownOnly(state, [COR_MEMBERS[0], COR_MEMBERS[1]]);
    expect(roundIncome(state, 3).buildingMaterials).toBe(2);
    expect(roundIncome(state, 5).valuables).toBe(0);

    ownOnly(state, [...COR_MEMBERS]);
    const third = roundIncome(state, 7);
    expect(third.buildingMaterials).toBe(2);
    expect(third.valuables).toBe(1);
  });

  it("CONTROL: Cornucopia pays NOTHING on an Astrologers round, and nothing at 1 piece", () => {
    const state = makeState(true, "sets-cornucopia-ctrl");
    state.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
    ownOnly(state, [...COR_MEMBERS]);
    expect(roundIncome(state, 4).buildingMaterials).toBe(0);

    ownOnly(state, [COR_MEMBERS[0]]);
    expect(roundIncome(state, 5).buildingMaterials).toBe(0);
  });

  it("Golden Goose pays +2 gold at 2 pieces and +4 at 3 — on EVERY round, Astrologers included", () => {
    const state = makeState(true, "sets-goose");
    state.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
    ownOnly(state, [GG_MEMBERS[0], GG_MEMBERS[1]]);
    expect(roundIncome(state, 4).gold, "Astrologers round").toBe(2);
    expect(roundIncome(state, 5).gold, "Resource round").toBe(2);

    ownOnly(state, [...GG_MEMBERS]);
    expect(roundIncome(state, 6).gold).toBe(4);
  });

  it("CONTROL: rule OFF pays nothing on either round kind", () => {
    const state = makeState(false, "sets-income-off");
    state.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
    ownOnly(state, [...GG_MEMBERS, ...COR_MEMBERS]);
    expect(roundIncome(state, 4).gold).toBe(0);
    expect(roundIncome(state, 5)).toEqual({ gold: 0, buildingMaterials: 0, valuables: 0 });
  });
});

// ===========================================================================
// 5. STATUE OF LEGION — the once-per-round recruit/reinforce discount
// ===========================================================================

describe("Set Artifacts — Statue of Legion recruit discount", () => {
  it("reduces the gold ACTUALLY spent on a real reinforce by (active tiers)", () => {
    const state = makeState(true, "sets-legion");
    ownOnly(state, [SOL_MEMBERS[0], SOL_MEMBERS[1], SOL_MEMBERS[2]]); // 3 pieces ⇒ −2 gold
    expect(artifactSetRecruitGoldDiscount(state, "p1")).toBe(2);

    const control = makeState(false, "sets-legion-off");
    ownOnly(control, [SOL_MEMBERS[0], SOL_MEMBERS[1], SOL_MEMBERS[2]]);
    expect(artifactSetRecruitGoldDiscount(control, "p1")).toBe(0);
  });

  it("scales 2..5 pieces to −1..−4 gold and is spent ONCE per round", () => {
    const state = makeState(true, "sets-legion-scale");
    for (let pieces = 2; pieces <= 5; pieces += 1) {
      ownOnly(state, SOL_MEMBERS.slice(0, pieces));
      state.players.p1.artifactSetRoundUses = {};
      expect(artifactSetRecruitGoldDiscount(state, "p1"), `${pieces} pieces`).toBe(pieces - 1);
    }
    // Spent for this round ⇒ 0 until the round number moves.
    state.players.p1.artifactSetRoundUses = { "statue_of_legion:2": state.round };
    expect(artifactSetRecruitGoldDiscount(state, "p1")).toBe(0);
    state.round += 1;
    expect(artifactSetRecruitGoldDiscount(state, "p1")).toBe(4);
  });

  it("CONTROL: 1 piece is no discount at all", () => {
    const state = makeState(true, "sets-legion-one");
    ownOnly(state, [SOL_MEMBERS[0]]);
    expect(artifactSetRecruitGoldDiscount(state, "p1")).toBe(0);
  });

  it("EFFECT: a REAL reinforce spends (discount) less gold, and only once per round", () => {
    /** Reinforce a Few→Pack through the shared cost seam and report the gold spent. */
    function reinforceGoldSpent(pieces: CardId[]): { first: number; second: number } {
      const state = makeState(true, `sets-legion-real-${pieces.length}`);
      ownOnly(state, pieces);
      state.players.p1.army = [
        { id: "a1", unitDefId: "castle.griffins", side: "few" },
        { id: "a2", unitDefId: "castle.griffins", side: "few" }
      ];
      const before = state.players.p1.resources.gold;
      // reinforceArmyUnit is the ONE spend path every reinforce surface uses.
      reinforceArmyUnit(state, "p1", "a1", false);
      const first = before - state.players.p1.resources.gold;
      const mid = state.players.p1.resources.gold;
      reinforceArmyUnit(state, "p1", "a2", false);
      return { first, second: mid - state.players.p1.resources.gold };
    }

    const none = reinforceGoldSpent([]);
    const three = reinforceGoldSpent(SOL_MEMBERS.slice(0, 3)); // 3 pieces ⇒ −2 gold
    expect(three.first, "the set really cut the gold actually spent").toBe(none.first - 2);
    // The discount is once per ROUND, so the very next reinforce pays full price.
    expect(three.second).toBe(none.second);
  });
});

// ===========================================================================
// 6. COMBAT — the selection tier really shifts the activation order
// ===========================================================================

describe("Set Artifacts — Angelic Alliance / Ironfist selection (+initiative)", () => {
  /** Two own units whose printed Initiative differs by exactly 1. */
  function stageOrderCombat(state: GameState): CombatState {
    const combat = stageCombat(
      state,
      [
        { unitDefId: "castle.halberdiers", side: "few" },
        { unitDefId: "castle.griffins", side: "few" }
      ],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    // Force a clean, tight ordering so a +1 really flips two neighbours.
    combat.units.u_own_0.initiative = 4;
    combat.units.u_own_1.initiative = 5;
    combat.units.u_foe_0.initiative = 1;
    return combat;
  }

  it("2 pieces: selecting a unit really moves it up the activation order", () => {
    const state = makeState(true, "sets-aa-order");
    ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    const combat = stageOrderCombat(state);

    // Before: the initiative-5 unit acts first.
    expect(getActivationOrder(combat, state.activeEffects).map((unit) => unit.id)[0]).toBe("u_own_1");

    const offer = artifactSetPowerOffers(state, "p1").find(
      (entry) => entry.kind === "select" && entry.setId === AA && entry.unitId === "u_own_0"
    );
    expect(offer, `expected an AA selection offer — saw ${offerLabels(state).join(" | ")}`).toBeTruthy();
    const next = applyOk(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });

    // The +1 lands live: the selected unit is now initiative 5 and, on the tie,
    // it has genuinely moved ahead of where it was (it is no longer last).
    const slow = next.combat!.units.u_own_0;
    expect(effectiveInitiative(slow, next.activeEffects)).toBe(5);
    const order = getActivationOrder(next.combat!, next.activeEffects).map((unit) => unit.id);
    expect(order.indexOf("u_own_0")).toBeLessThan(order.indexOf("u_foe_0"));
    expect(order.indexOf("u_own_0")).toBe(0);
  });

  it("Ironfist grants +2 initiative (the printed larger shift)", () => {
    const state = makeState(true, "sets-ioto-order");
    ownOnly(state, [IOTO_MEMBERS[0], IOTO_MEMBERS[1]]);
    const combat = stageOrderCombat(state);
    const before = effectiveInitiative(combat.units.u_own_0, state.activeEffects);
    const next = applyOk(state, {
      type: "SELECT_ARTIFACT_SET_UNIT",
      playerId: "p1",
      setId: "ironfist_of_the_ogre",
      unitId: "u_own_0"
    });
    expect(effectiveInitiative(next.combat!.units.u_own_0, next.activeEffects)).toBe(before + 2);
  });

  it("Armor of the Damned selects an ENEMY unit for −1 initiative", () => {
    const state = makeState(true, "sets-aotd-order");
    ownOnly(state, [AOTD_MEMBERS[0], AOTD_MEMBERS[1]]);
    const combat = stageOrderCombat(state);
    combat.units.u_foe_0.initiative = 6;
    const next = applyOk(state, {
      type: "SELECT_ARTIFACT_SET_UNIT",
      playerId: "p1",
      setId: "armor_of_the_damned",
      unitId: "u_foe_0"
    });
    expect(effectiveInitiative(next.combat!.units.u_foe_0, next.activeEffects)).toBe(5);
    // …and only an ENEMY unit is ever offered for this set.
    const enemyOffers = artifactSetPowerOffers(state, "p1").filter(
      (entry) => entry.kind === "select" && entry.setId === "armor_of_the_damned"
    );
    expect(enemyOffers.map((entry) => entry.unitId)).toEqual(["u_foe_0"]);
  });

  it("CONTROL: at 1 piece there is no selection offer and a forged selection is refused", () => {
    const state = makeState(true, "sets-aa-one-piece");
    ownOnly(state, [AA_MEMBERS[0]]);
    stageOrderCombat(state);
    expect(artifactSetPowerOffers(state, "p1")).toEqual([]);
    const forged = applyAction(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });
    expect(forged.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: the selection is once per combat and round-1 only", () => {
    const state = makeState(true, "sets-aa-once");
    ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    stageOrderCombat(state);
    const next = applyOk(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });
    // Spent: no second selection offer this combat.
    expect(artifactSetPowerOffers(next, "p1").some((entry) => entry.kind === "select")).toBe(false);
    const again = applyAction(next, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_1" });
    expect(again.errors.length).toBeGreaterThan(0);

    // A fresh state in combat ROUND 2 offers no selection at all.
    const late = makeState(true, "sets-aa-round2");
    ownOnly(late, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    stageCombat(late, [{ unitDefId: "castle.halberdiers", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    late.combat!.round = 2;
    expect(artifactSetPowerOffers(late, "p1").some((entry) => entry.kind === "select")).toBe(false);
  });
});

// ===========================================================================
// 7. COMBAT — the once-per-combat unit powers
// ===========================================================================

describe("Set Artifacts — once-per-combat unit powers", () => {
  function aaCombat(seed: string, pieces: number): GameState {
    const state = makeState(true, seed);
    ownOnly(state, AA_MEMBERS.slice(0, pieces));
    stageCombat(
      state,
      [{ unitDefId: "castle.marksmen", side: "few" }],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    return state;
  }

  function useAa(state: GameState, tier: number): GameState {
    return applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: AA,
      tier,
      unitId: "u_own_0"
    });
  }

  it("tier 3: the SELECTED unit really rolls with advantage (2 dice, keep the higher)", () => {
    let state = aaCombat("sets-aa-adv", 3);
    const attacker = state.combat!.units.u_own_0;
    const defender = state.combat!.units.u_foe_0;
    expect(getAttackRollMode(attacker, defender, state, false)).toBe("normal");

    state = applyOk(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });
    state = useAa(state, 3);
    expect(getAttackRollMode(state.combat!.units.u_own_0, state.combat!.units.u_foe_0, state, false)).toBe("advantage");
  });

  it("CONTROL: at 2 pieces tier 3 is not offered, and a forged use is refused", () => {
    let state = aaCombat("sets-aa-adv-ctrl", 2);
    state = applyOk(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });
    expect(artifactSetPowerOffers(state, "p1").some((entry) => entry.threshold === 3)).toBe(false);
    const forged = applyAction(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: AA,
      tier: 3,
      unitId: "u_own_0"
    });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(getAttackRollMode(state.combat!.units.u_own_0, state.combat!.units.u_foe_0, state, false)).toBe("normal");
  });

  it("tier 4 grants a real Defense token, tier 5 +1 Attack, tier 6 +1 Defense", () => {
    let state = aaCombat("sets-aa-full", 6);
    state = applyOk(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });
    expect(state.combat!.units.u_own_0.defenseToken).toBe(false);

    state = useAa(state, 4);
    expect(state.combat!.units.u_own_0.defenseToken).toBe(true);

    state = useAa(state, 5);
    const attackEffect = state.activeEffects.filter((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS" && modifier.amount === 1)
    );
    expect(attackEffect).toHaveLength(1);
    expect(attackEffect[0].target).toEqual({ type: "unit", unitId: "u_own_0" });

    state = useAa(state, 6);
    expect(
      state.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "DEFENSE_BONUS" && modifier.amount === 1)
      )
    ).toBe(true);
  });

  it("each tier is once per combat (the second use is refused)", () => {
    let state = aaCombat("sets-aa-once-per-tier", 6);
    state = applyOk(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });
    state = useAa(state, 5);
    const again = applyAction(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: AA,
      tier: 5,
      unitId: "u_own_0"
    });
    expect(again.errors.length).toBeGreaterThan(0);
  });

  it("a NEW combat re-arms every per-combat charge and clears the selection", () => {
    const state = makeState(true, "sets-combat-reset");
    ownOnly(state, [...AA_MEMBERS]);
    state.players.p1.combatStats.artifactSetUsesThisCombat = ["angelic_alliance:2", "angelic_alliance:5"];
    state.players.p1.combatStats.artifactSetSelections = { angelic_alliance: "stale_unit" };

    const hero = state.heroes.hero_p1;
    hero.level = 1; // below the field difficulty ⇒ a REAL fight, so makeCombatShell runs
    hero.spaceId = "guard-field";
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
    expect(state.players.p1.combatStats.artifactSetUsesThisCombat).toEqual([]);
    expect(state.players.p1.combatStats.artifactSetSelections).toEqual({});
  });

  it("a 'selected unit' tier is UNUSABLE until the selection tier picks one", () => {
    const state = aaCombat("sets-aa-needs-selection", 5);
    expect(artifactSetPowerOffers(state, "p1").some((entry) => entry.threshold === 5)).toBe(false);
    const forged = applyAction(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: AA,
      tier: 5,
      unitId: "u_own_0"
    });
    expect(forged.errors.length).toBeGreaterThan(0);
  });

  it("Power of the Dragon Father picks its target at USE time (it prints no selection tier)", () => {
    const state = makeState(true, "sets-podf-free-target");
    ownOnly(state, PODF_MEMBERS.slice(0, 2));
    stageCombat(
      state,
      [
        { unitDefId: "castle.marksmen", side: "few" },
        { unitDefId: "castle.halberdiers", side: "few" }
      ],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    const targets = artifactSetPowerOffers(state, "p1")
      .filter((entry) => entry.setId === "power_of_the_dragon_father" && entry.threshold === 2)
      .map((entry) => entry.unitId)
      .sort();
    expect(targets).toEqual(["u_own_0", "u_own_1"]);
    // No selection tier is ever offered for this set.
    expect(artifactSetPowerOffers(state, "p1").some((entry) => entry.kind === "select")).toBe(false);
  });

  it("Ironfist tier 3 grants a real FIRE_SHIELD for the current combat round", () => {
    const state = makeState(true, "sets-ioto-shield");
    ownOnly(state, [...IOTO_MEMBERS]);
    stageCombat(state, [{ unitDefId: "castle.halberdiers", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    const next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "ironfist_of_the_ogre",
      tier: 3,
      unitId: "u_own_0"
    });
    const shield = next.activeEffects.find((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "FIRE_SHIELD")
    );
    expect(shield?.target).toEqual({ type: "unit", unitId: "u_own_0" });
    expect(shield?.duration.type).toBe("current-combat-round");
  });
});

// ===========================================================================
// 8. ARMOR OF THE DAMNED — the enemy debuffs really bite
// ===========================================================================

describe("Set Artifacts — Armor of the Damned enemy debuffs", () => {
  function aotdCombat(seed: string, pieces: number): GameState {
    const state = makeState(true, seed);
    ownOnly(state, AOTD_MEMBERS.slice(0, pieces));
    stageCombat(state, [{ unitDefId: "castle.halberdiers", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    return applyOk(state, {
      type: "SELECT_ARTIFACT_SET_UNIT",
      playerId: "p1",
      setId: "armor_of_the_damned",
      unitId: "u_foe_0"
    });
  }

  it("tier 3: the cursed enemy really rolls with DISADVANTAGE on its attack", () => {
    let state = aotdCombat("sets-aotd-disadv", 3);
    const foe = () => state.combat!.units.u_foe_0;
    const mine = () => state.combat!.units.u_own_0;
    expect(getAttackRollMode(foe(), mine(), state, false)).toBe("normal");

    state = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "armor_of_the_damned",
      tier: 3,
      unitId: "u_foe_0"
    });
    expect(getAttackRollMode(foe(), mine(), state, false)).toBe("disadvantage");
  });

  it("tier 4: the cursed enemy's attack really resolves 1 lower", () => {
    let state = aotdCombat("sets-aotd-atk", 4);
    state = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "armor_of_the_damned",
      tier: 4,
      unitId: "u_foe_0"
    });
    const debuff = state.activeEffects.find((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS" && modifier.amount === -1)
    );
    expect(debuff?.target).toEqual({ type: "unit", unitId: "u_foe_0" });
    expect(debuff?.duration.type, "the 'during an attack' reading is the combat ROUND").toBe("current-combat-round");
  });

  it("CONTROL: at 2 pieces neither debuff tier is offered", () => {
    const state = aotdCombat("sets-aotd-ctrl", 2);
    expect(artifactSetPowerOffers(state, "p1").filter((entry) => entry.threshold >= 3)).toEqual([]);
  });
});

// ===========================================================================
// 9. TITAN'S THUNDER — the zap, its tier gate and the Spell-damage routing
// ===========================================================================

describe("Set Artifacts — Titan's Thunder zap", () => {
  function ttCombat(seed: string, pieces: number): GameState {
    const state = makeState(true, seed);
    ownOnly(state, TT_MEMBERS.slice(0, pieces));
    stageCombat(
      state,
      [{ unitDefId: "castle.halberdiers", side: "few" }],
      [
        { unitDefId: "neutral.skeletons", side: "neutral" }, // bronze
        { unitDefId: "neutral.champions", side: "neutral" } // gold
      ]
    );
    return state;
  }

  it("2 pieces: the bronze enemy really takes 1 damage; the gold one is not even offered", () => {
    const state = ttCombat("sets-tt-bronze", 2);
    expect(state.combat!.units.u_foe_0.grade).toBe("bronze");
    expect(state.combat!.units.u_foe_1.grade).toBe("gold");

    const offers = artifactSetPowerOffers(state, "p1").filter((entry) => entry.setId === "titans_thunder");
    expect(offers.map((entry) => entry.unitId)).toEqual(["u_foe_0"]);

    const before = state.combat!.units.u_foe_0.damage;
    const next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "titans_thunder",
      tier: 2,
      unitId: "u_foe_0"
    });
    expect(next.combat!.units.u_foe_0.damage).toBe(before + 1);
  });

  it("CONTROL: a forged zap at the GOLD unit at 2 pieces is refused and deals nothing", () => {
    const state = ttCombat("sets-tt-gate", 2);
    const before = state.combat!.units.u_foe_1.damage;
    const forged = applyAction(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "titans_thunder",
      tier: 2,
      unitId: "u_foe_1"
    });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.combat!.units.u_foe_1.damage).toBe(before);
  });

  it("4 pieces: the ANY-tier zap reaches the gold unit", () => {
    const state = ttCombat("sets-tt-any", 4);
    const before = state.combat!.units.u_foe_1.damage;
    const next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "titans_thunder",
      tier: 4,
      unitId: "u_foe_1"
    });
    expect(next.combat!.units.u_foe_1.damage).toBe(before + 1);
  });

  it("the zap is SPELL damage — a spell-damage-reducing target shrugs it off", () => {
    const state = ttCombat("sets-tt-spell-damage", 4);
    // Give the bronze target the shared "reduce spell damage 1" passive.
    state.combat!.units.u_foe_0.abilities = ["reduce-spell-damage-1"];
    const before = state.combat!.units.u_foe_0.damage;
    const next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "titans_thunder",
      tier: 4,
      unitId: "u_foe_0"
    });
    expect(next.combat!.units.u_foe_0.damage, "1 damage − 1 reduction = 0").toBe(before);
  });
});

// ===========================================================================
// 10. POWER OF THE DRAGON FATHER — the stacking spell ward
// ===========================================================================

describe("Set Artifacts — Power of the Dragon Father spell ward", () => {
  it("reduces spell damage by 1 at 4 pieces and by 2 at 7", () => {
    const state = makeState(true, "sets-podf-ward");
    ownOnly(state, PODF_MEMBERS.slice(0, 4));
    stageCombat(state, [{ unitDefId: "castle.halberdiers", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    expect(artifactSetSpellDamageReduction(state, "p1")).toBe(1);

    ownOnly(state, [...PODF_MEMBERS]);
    expect(artifactSetSpellDamageReduction(state, "p1")).toBe(2);
  });

  it("CONTROL: 3 pieces is no ward at all, and the ward never covers the enemy", () => {
    const state = makeState(true, "sets-podf-ward-ctrl");
    ownOnly(state, PODF_MEMBERS.slice(0, 3));
    stageCombat(state, [{ unitDefId: "castle.halberdiers", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    expect(artifactSetSpellDamageReduction(state, "p1")).toBe(0);

    ownOnly(state, [...PODF_MEMBERS]);
    expect(artifactSetSpellDamageReduction(state, NEUTRAL_PLAYER_ID)).toBe(0);
  });

  it("EFFECT: the ward really cancels a Titan's Thunder zap aimed at the holder's unit", () => {
    // p2 holds the full Dragon Father set; p1 holds Titan's Thunder and zaps.
    const state = makeState(true, "sets-podf-vs-zap");
    ownOnly(state, [...TT_MEMBERS]);
    ownOnly(state, [...PODF_MEMBERS], "p2");
    const combat = stageCombat(
      state,
      [{ unitDefId: "castle.halberdiers", side: "few" }],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    // Re-home the "enemy" unit onto p2 so the ward's controller owns it.
    combat.units.u_foe_0.controllerId = "p2";
    combat.defenderPlayerId = "p2";
    const before = combat.units.u_foe_0.damage;
    const next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "titans_thunder",
      tier: 4,
      unitId: "u_foe_0"
    });
    expect(next.combat!.units.u_foe_0.damage, "1 damage − the 2-point ward = 0").toBe(before);
  });
});

// ===========================================================================
// 11. WIZARD'S WELL and DIPLOMAT'S CLOAK — the map tiers
// ===========================================================================

describe("Set Artifacts — Wizard's Well draw-then-discard", () => {
  it("draws 1, opens the discard pick, and refuses a second use the same round", () => {
    const state = makeState(true, "sets-ww");
    ownOnly(state, [...WW_MEMBERS]);
    state.players.p1.deck = ["artifact.boots_of_speed", "artifact.speculum"];
    const handBefore = state.players.p1.hand.length;

    const next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "wizards_well",
      tier: 2
    });
    expect(next.players.p1.hand.length).toBe(handBefore + 1);
    expect(next.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(next.pendingChoice && next.pendingChoice.type === "OPTION_CHOICE" ? next.pendingChoice.context : null).toBe(
      "hand-discard"
    );

    // Answer the discard pick, then a second use this round is refused.
    const discarded = applyOk(next, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: next.pendingChoice!.id, optionIndex: 0 });
    expect(discarded.players.p1.hand.length).toBe(handBefore);
    const again = applyAction(discarded, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "wizards_well",
      tier: 2
    });
    expect(again.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: 1 piece offers nothing and a forged use is refused", () => {
    const state = makeState(true, "sets-ww-ctrl");
    ownOnly(state, [WW_MEMBERS[0]]);
    state.players.p1.deck = ["artifact.boots_of_speed"];
    expect(artifactSetPowerOffers(state, "p1")).toEqual([]);
    const forged = applyAction(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "wizards_well",
      tier: 2
    });
    expect(forged.errors.length).toBeGreaterThan(0);
  });
});

describe("Set Artifacts — Diplomat's Cloak Neutral scry", () => {
  it("looks at the top card WITHOUT lifting it, then sends it to the bottom on request", () => {
    const state = makeState(true, "sets-dc");
    ownOnly(state, [...DC_MEMBERS]);
    const deck = state.decks["neutral-bronze"]!;
    const sizeBefore = deck.drawPile.length;
    const top = deck.drawPile[deck.drawPile.length - 1];

    let next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "diplomats_cloak",
      tier: 2,
      neutralTier: "bronze"
    });
    // The card was only LOOKED at: nothing left the deck.
    expect(next.decks["neutral-bronze"]!.drawPile).toHaveLength(sizeBefore);
    expect(next.decks["neutral-bronze"]!.drawPile[sizeBefore - 1]).toBe(top);
    const choice = next.pendingChoice;
    expect(choice && choice.type === "OPTION_CHOICE" ? choice.context : null).toBe("artifact-set-scry");

    // "Put it on the bottom" moves it — and only it.
    next = applyOk(next, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 1 });
    const after = next.decks["neutral-bronze"]!.drawPile;
    expect(after).toHaveLength(sizeBefore);
    expect(after[0]).toBe(top);
    expect(after[sizeBefore - 1]).not.toBe(top);
    expect(next.pendingChoice).toBeNull();
  });

  it("'leave it on top' is a pure no-op, and the scry is once per round", () => {
    const state = makeState(true, "sets-dc-top");
    ownOnly(state, [...DC_MEMBERS]);
    const before = [...state.decks["neutral-silver"]!.drawPile];

    let next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "diplomats_cloak",
      tier: 2,
      neutralTier: "silver"
    });
    next = applyOk(next, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: next.pendingChoice!.id, optionIndex: 0 });
    expect(next.decks["neutral-silver"]!.drawPile).toEqual(before);

    const again = applyAction(next, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "diplomats_cloak",
      tier: 2,
      neutralTier: "gold"
    });
    expect(again.errors.length).toBeGreaterThan(0);
  });

  it("hides the revealed card from every OTHER seat", () => {
    const state = makeState(true, "sets-dc-secret");
    ownOnly(state, [...DC_MEMBERS]);
    const next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "diplomats_cloak",
      tier: 2,
      neutralTier: "bronze"
    });
    const mine = getPlayerView(next, "p1").pendingChoice;
    const theirs = getPlayerView(next, "p2").pendingChoice;
    expect(mine && mine.type === "OPTION_CHOICE" ? mine.artifactSetScry?.cardId : null).not.toBe("hidden");
    expect(theirs && theirs.type === "OPTION_CHOICE" ? theirs.artifactSetScry?.cardId : null).toBe("hidden");
  });
});

// ===========================================================================
// 12. PENDANT OF REFLECTION — the enemy's cast really resolves lower
// ===========================================================================

describe("Set Artifacts — Pendant of Reflection spell-power drain", () => {
  it("drains the first enemy cast by 1 and only the first", () => {
    // p2 holds the set; p1 is the caster.
    const state = makeState(true, "sets-por");
    ownOnly(state, []);
    ownOnly(state, [...POR_MEMBERS], "p2");
    const combat = stageCombat(
      state,
      [{ unitDefId: "castle.marksmen", side: "few" }],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    combat.defenderPlayerId = "p2";
    combat.units.u_foe_0.controllerId = "p2";

    // Directly exercise the drain read + charge, the exact pair the cast locks in.
    expect(artifactSetEnemySpellPowerDrain(state, "p1")).toBe(1);
    markArtifactSetSpellDrain(state, "p1");
    expect(artifactSetEnemySpellPowerDrain(state, "p1"), "once per combat").toBe(0);
  });

  it("EFFECT: an enemy Magic Arrow really resolves at 1 less Power", () => {
    // Magic Arrow's printed ladder is Power 0 → 1 damage, 1 → 2, 2 → 3. The
    // caster banks 2 Power, so an undrained cast really deals 3 and a drained
    // one really deals 2 — an OBSERVABLE damage difference, not a field read.
    function castArrow(seed: string, holderPieces: CardId[]): number {
      const state = makeState(true, seed);
      ownOnly(state, []);
      ownOnly(state, holderPieces, "p2");
      const combat = stageCombat(
        state,
        [{ unitDefId: "castle.marksmen", side: "few" }],
        [{ unitDefId: "neutral.skeletons", side: "neutral" }]
      );
      combat.defenderPlayerId = "p2";
      combat.units.u_foe_0.controllerId = "p2";
      combat.activeUnitId = "u_own_0";
      combat.units.u_foe_0.abilities = [];
      combat.units.u_foe_0.maxHealth = 50;
      combat.units.u_foe_0.damage = 0;
      state.players.p1.hand = ["spell.magic_arrow"];
      state.players.p1.combatStats.pendingDrawRiderSpellPower = 2;
      state.activePlayerId = "p1";

      const cast = getLegalActions(state, "p1").find(
        (entry) =>
          entry.action.type === "CAST_SPELL" &&
          entry.action.cardId === "spell.magic_arrow" &&
          entry.action.target?.type === "unit" &&
          entry.action.target.unitId === "u_foe_0"
      );
      expect(cast, "Magic Arrow should be castable").toBeTruthy();
      let next = applyOk(state, cast!.action);
      // Drain the reaction window (nobody has a reaction; pass it out).
      for (let guard = 0; guard < 8 && next.reactionWindow; guard += 1) {
        const priority = next.reactionWindow.priorityPlayerId;
        const pass = getLegalActions(next, priority).find((entry) => entry.action.type === "PASS_REACTION");
        if (!pass) {
          break;
        }
        next = applyOk(next, pass.action);
      }
      return next.combat!.units.u_foe_0.damage;
    }

    const undrained = castArrow("sets-por-cast-none", []);
    const drained = castArrow("sets-por-cast-set", [...POR_MEMBERS]);
    expect(undrained, "Power 2 Magic Arrow").toBe(3);
    expect(drained, "the same cast, drained to Power 1").toBe(2);
  });

  it("CONTROL: rule OFF / 1 piece drains nothing", () => {
    const off = makeState(false, "sets-por-off");
    ownOnly(off, [], "p1");
    ownOnly(off, [...POR_MEMBERS], "p2");
    stageCombat(off, [{ unitDefId: "castle.marksmen", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    off.combat!.defenderPlayerId = "p2";
    off.combat!.units.u_foe_0.controllerId = "p2";
    expect(artifactSetEnemySpellPowerDrain(off, "p1")).toBe(0);

    const one = makeState(true, "sets-por-one");
    ownOnly(one, [], "p1");
    ownOnly(one, [POR_MEMBERS[0]], "p2");
    stageCombat(one, [{ unitDefId: "castle.marksmen", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    one.combat!.defenderPlayerId = "p2";
    one.combat!.units.u_foe_0.controllerId = "p2";
    expect(artifactSetEnemySpellPowerDrain(one, "p1")).toBe(0);
  });
});

// ===========================================================================
// 13. FEED events + rule-OFF inertness of the whole feature
// ===========================================================================

describe("Set Artifacts — feed events and rule-OFF inertness", () => {
  it("announces a tier change the first time the count crosses a threshold", () => {
    const state = makeState(true, "sets-events");
    ownOnly(state, [AA_MEMBERS[0]]);
    // Prime the ledger so the very next action reports only the real change.
    let next = applyOk(state, { type: "END_TURN", playerId: "p1" });
    next.players.p1.hand = [AA_MEMBERS[0], AA_MEMBERS[1]];
    next = applyOk(next, { type: "END_TURN", playerId: next.activePlayerId! });

    const changes = next.eventLog.filter((event) => event.type === "ARTIFACT_SET_TIERS_CHANGED");
    const unlock = changes.find((event) => event.type === "ARTIFACT_SET_TIERS_CHANGED" && event.setId === AA);
    expect(unlock, `expected an AA unlock — saw ${changes.length} change events`).toBeTruthy();
    if (unlock?.type === "ARTIFACT_SET_TIERS_CHANGED") {
      expect(unlock.pieces).toBe(2);
      expect(unlock.tiers).toBe(1);
      expect(unlock.previousTiers).toBe(0);
    }
  });

  it("CONTROL: with the rule OFF no set event is ever emitted and no set state is written", () => {
    const state = makeState(false, "sets-events-off");
    ownOnly(state, [...AA_MEMBERS, ...GG_MEMBERS]);
    const next = applyOk(state, { type: "END_TURN", playerId: "p1" });
    expect(next.eventLog.some((event) => event.type.startsWith("ARTIFACT_SET_"))).toBe(false);
    expect(next.players.p1.artifactSetStatus).toBeUndefined();
    expect(next.players.p1.artifactSetRoundUses).toBeUndefined();
  });

  it("CONTROL: with the rule OFF no set action is ever legal", () => {
    const state = makeState(false, "sets-actions-off");
    ownOnly(state, [...AA_MEMBERS]);
    stageCombat(state, [{ unitDefId: "castle.halberdiers", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    expect(
      getLegalActions(state, "p1").some(
        (entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT" || entry.action.type === "USE_ARTIFACT_SET_POWER"
      )
    ).toBe(false);
    const forged = applyAction(state, { type: "SELECT_ARTIFACT_SET_UNIT", playerId: "p1", setId: AA, unitId: "u_own_0" });
    expect(forged.errors.length).toBeGreaterThan(0);
  });

  it("renders the MAP tiers as legal actions on the player's own turn", () => {
    const state = makeState(true, "sets-map-offers");
    ownOnly(state, [...WW_MEMBERS, ...DC_MEMBERS]);
    state.players.p1.deck = ["artifact.boots_of_speed"];
    const labels = getLegalActions(state, "p1")
      .filter((entry) => entry.action.type === "USE_ARTIFACT_SET_POWER")
      .map((entry) => entry.label);
    expect(labels.some((label) => label.startsWith("Wizard's Well"))).toBe(true);
    expect(labels.some((label) => label.startsWith("Diplomat's Cloak"))).toBe(true);
  });

  it("a computer seat and the AFK driver both resolve the scry instead of stalling", () => {
    const state = makeState(true, "sets-scry-drivers");
    ownOnly(state, [...DC_MEMBERS]);
    const scrying = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "diplomats_cloak",
      tier: 2,
      neutralTier: "bronze"
    });
    // The window is a plain OPTION_CHOICE owned by the acting seat, so both
    // shared drivers see it and can answer it.
    const asComputer = { ...scrying, controllers: { p1: standardComputerController() } } as GameState;
    expect(computerDecisionOwner(asComputer)).toBe("p1");
    const aiPick = chooseComputerAction({
      playerId: "p1",
      state: getPlayerView(asComputer, "p1"),
      legalActions: getLegalActions(asComputer, "p1")
    });
    expect(aiPick?.action.type).toBe("CHOOSE_OPTION");
    const afkPick = nextTurnTimeoutAction(scrying, "p1");
    expect(afkPick?.type).toBe("CHOOSE_OPTION");
    // Both really close the window.
    expect(applyOk(scrying, aiPick!.action).pendingChoice).toBeNull();
  });

  it("eliminating the scrying player drops the window and destroys no card", () => {
    const state = makeState(true, "sets-scry-elim");
    ownOnly(state, [...DC_MEMBERS]);
    const scrying = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "diplomats_cloak",
      tier: 2,
      neutralTier: "bronze"
    });
    const before = [...scrying.decks["neutral-bronze"]!.drawPile];
    eliminatePlayer(scrying, "p1", "test", true);
    expect(scrying.pendingChoice).toBeNull();
    // Nothing was ever lifted off the deck, so nothing can be lost.
    expect(scrying.decks["neutral-bronze"]!.drawPile).toEqual(before);
  });

  it("renders every offer as a legal action the engine will actually accept", () => {
    // The offer derivation and the two handlers must never disagree: EVERY
    // offered set action, applied, must succeed.
    const state = makeState(true, "sets-offers-execute");
    ownOnly(state, [...AA_MEMBERS, ...TT_MEMBERS, ...IOTO_MEMBERS]);
    stageCombat(
      state,
      [{ unitDefId: "castle.halberdiers", side: "few" }],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    const offered = getLegalActions(state, "p1").filter(
      (entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT" || entry.action.type === "USE_ARTIFACT_SET_POWER"
    );
    expect(offered.length).toBeGreaterThan(0);
    for (const entry of offered) {
      const result = applyAction(state, entry.action);
      expect(result.errors, `${entry.label}: ${result.errors.map((error) => error.message).join("; ")}`).toEqual([]);
    }
  });
});

// ===========================================================================
// 14. A HOSTED (redacted) client must offer EXACTLY what the server accepts
//
// The 2026-08-08 live bug: "Angelic Alliance — for now not working during
// combat." On a hosted table (every single-player room and every CLOSED
// multiplayer table) the browser holds a per-seat REDACTED state in which even
// the viewer's OWN deck is a row of `hidden` placeholders. The piece count is
// derived from the card zones, so the client under-counted, activated fewer
// tiers, and rendered NO buttons for tiers the server would have accepted —
// while the status panel (which reads the synced `artifactSetStatus`) kept
// showing the true "6/6 · 5 effects".
//
// The whole class is pinned here by deriving the offers from the REDACTED state
// (what the browser does) and applying them to the SERVER state.
// ===========================================================================

describe("Set Artifacts — a hosted (redacted) client offers what the server accepts", () => {
  /** The live shape: 2 pieces in hand, the other 4 still in the (masked) deck. */
  function hostedCombat(seed: string): GameState {
    const state = makeState(true, seed);
    ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1]]);
    state.players.p1.deck = [AA_MEMBERS[2], AA_MEMBERS[3], AA_MEMBERS[4], AA_MEMBERS[5]];
    // What the applyAction tail stamps on the real server before the snapshot
    // goes out — the only piece information that survives redaction.
    state.players.p1.artifactSetStatus = playerArtifactSetStatuses(state, "p1");
    stageCombat(
      state,
      [{ unitDefId: "castle.halberdiers", side: "few" }],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    return state;
  }

  function setActions(state: GameState): string[] {
    return getLegalActions(state, "p1")
      .filter(
        (entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT" || entry.action.type === "USE_ARTIFACT_SET_POWER"
      )
      .map((entry) => entry.label);
  }

  it("counts the pieces hidden in the viewer's OWN masked deck", () => {
    const state = hostedCombat("sets-hosted-count");
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(6);

    const seat = redactStateForSeat(state, "p1");
    // The masking really happened (the CONTROL that keeps this test honest):
    // only the 2 hand members are visible, the deck is placeholders.
    expect(seat.players.p1.deck).toEqual(["hidden", "hidden", "hidden", "hidden"]);
    expect(seat.players.p1.hand).toEqual([AA_MEMBERS[0], AA_MEMBERS[1]]);
    // …and the client still reads all SIX pieces / five live tiers.
    expect(artifactSetPieceCount(seat, "p1", AA)).toBe(6);
    expect(artifactSetActiveTierCount(seat, "p1", AA)).toBe(5);
  });

  it("EFFECT: the client offers the tier 3-6 combat powers, and the server accepts every one", () => {
    let state = hostedCombat("sets-hosted-offers");
    // Round 1 — the client (redacted) must see the selection offer.
    const seatBefore = redactStateForSeat(state, "p1");
    const select = getLegalActions(seatBefore, "p1").find(
      (entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT"
    );
    expect(select, `no selection offer — saw ${setActions(seatBefore).join(" | ")}`).toBeTruthy();
    state = applyOk(state, select!.action);

    // With the pick made, the four bound tiers are live. THIS is what the live
    // report was about: before the fix the redacted client offered NONE of them.
    const seat = redactStateForSeat(state, "p1");
    const clientOffers = setActions(seat);
    expect(clientOffers.length).toBe(4);
    for (const threshold of [3, 4, 5, 6]) {
      expect(
        clientOffers.some((label) => label.startsWith(`Angelic Alliance (${threshold})`)),
        `tier ${threshold} missing — saw ${clientOffers.join(" | ")}`
      ).toBe(true);
    }
    // The client and the SERVER agree exactly, so nothing is offered that the
    // reducer's own re-derivation would refuse — and nothing is withheld.
    expect(clientOffers).toEqual(setActions(state));
    for (const entry of getLegalActions(seat, "p1").filter(
      (candidate) => candidate.action.type === "USE_ARTIFACT_SET_POWER"
    )) {
      const result = applyAction(state, entry.action);
      expect(result.errors, `${entry.label}: ${result.errors.map((error) => error.message).join("; ")}`).toEqual([]);
    }
  });

  it("EFFECT: the MAP tiers survive redaction too (deck-only pieces)", () => {
    const state = makeState(true, "sets-hosted-map");
    ownOnly(state, []);
    // Every piece of BOTH map sets sits in the deck — nothing visible at all.
    state.players.p1.deck = [...WW_MEMBERS, ...DC_MEMBERS];
    state.players.p1.artifactSetStatus = playerArtifactSetStatuses(state, "p1");
    const seat = redactStateForSeat(state, "p1");
    expect(seat.players.p1.hand).toEqual([]);
    const labels = getLegalActions(seat, "p1")
      .filter((entry) => entry.action.type === "USE_ARTIFACT_SET_POWER")
      .map((entry) => entry.label);
    expect(labels.some((label) => label.startsWith("Wizard's Well"))).toBe(true);
    expect(labels.some((label) => label.startsWith("Diplomat's Cloak"))).toBe(true);
  });

  it("CONTROL: an UNMASKED state is untouched — the zone scan alone decides", () => {
    const state = hostedCombat("sets-hosted-control");
    // A stale-HIGH status can never inflate an open table's count…
    state.players.p1.deck = [];
    state.players.p1.artifactSetStatus = [
      { setId: AA, pieces: 6, activeTiers: 5, memberCount: AA_MEMBERS.length }
    ];
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(2);
    expect(artifactSetActiveTierCount(state, "p1", AA)).toBe(1);
    // …and owning nothing at all still reads 0 behind a masked deck.
    ownOnly(state, []);
    state.players.p1.deck = ["hidden", "hidden"];
    state.players.p1.artifactSetStatus = [];
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(0);
  });

  it("CONTROL: a masked read never LOWERS a count the visible cards already prove", () => {
    const state = makeState(true, "sets-hosted-floor");
    ownOnly(state, [AA_MEMBERS[0], AA_MEMBERS[1], AA_MEMBERS[2]]);
    state.players.p1.deck = ["hidden"];
    // A status that has not caught up (2) must not overrule three visible pieces.
    state.players.p1.artifactSetStatus = [
      { setId: AA, pieces: 2, activeTiers: 1, memberCount: AA_MEMBERS.length }
    ];
    expect(artifactSetPieceCount(state, "p1", AA)).toBe(3);
  });
});

// ===========================================================================
// 15. "AT THE BEGINNING OF THE COMBAT" really means BEFORE the fight begins
//
// The live report: "If an artifact set has feature that it works only at the
// beginning of the combat it should be done properly so. So you cannot use it
// later in a combat."
//
// REPRODUCED before the fix. The gate was `combat.round === 1` alone — but in
// this engine a default neutral fight IS one round, extended a round at a time,
// so "round 1" is the WHOLE battle: the selection was offered (and accepted)
// after the player's own unit had already attacked, and again at the
// continue-or-retreat window with the entire round resolved. The gate is now
// `combatStartWindowOpen` (combat-timing.ts) — the SAME "has the fighting begun"
// read `pvpEscapeWindowOpen` uses for the no-casualties PvP flee.
// ===========================================================================

describe("Set Artifacts — 'at the beginning of the combat' closes when the fighting starts", () => {
  /** Two own units + one guard, no unit has acted (the window is open). */
  function beginningCombat(seed: string): GameState {
    const state = makeState(true, seed);
    ownOnly(state, [...AA_MEMBERS]);
    const combat = stageCombat(
      state,
      [
        { unitDefId: "castle.halberdiers", side: "few" },
        { unitDefId: "castle.griffins", side: "few" }
      ],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    combat.units.u_own_0.initiative = 4;
    combat.units.u_own_1.initiative = 5;
    combat.units.u_foe_0.initiative = 1;
    state.activePlayerId = "p1";
    state.priorityPlayerId = "p1";
    return state;
  }

  function selectOffers(state: GameState) {
    return artifactSetPowerOffers(state, "p1").filter((offer) => offer.kind === "select");
  }

  function selectLegalActions(state: GameState) {
    return getLegalActions(state, "p1").filter((entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT");
  }

  const SELECT_AA: GameAction = {
    type: "SELECT_ARTIFACT_SET_UNIT",
    playerId: "p1",
    setId: AA,
    unitId: "u_own_0"
  };

  it("REPRO: once one of your units has fought this round the selection is gone — offer AND handler", () => {
    const state = beginningCombat("sets-begin-repro");
    // CONTROL first: nobody has acted, so the window is open on BOTH surfaces.
    expect(selectOffers(state).length).toBeGreaterThan(0);
    expect(selectLegalActions(state).length).toBeGreaterThan(0);

    // The fast unit takes its turn; the slow one is still to act. This is the
    // reported moment — the player now knows how round 1 went.
    const combat = state.combat!;
    combat.units.u_own_1.activatedThisRound = true;
    combat.units.u_own_1.attackedThisActivation = true;
    combat.activeUnitId = "u_own_0";

    expect(selectOffers(state)).toEqual([]);
    expect(selectLegalActions(state)).toEqual([]);

    const forged = applyAction(state, SELECT_AA);
    expect(forged.errors.map((error) => error.message)).toEqual([
      "That Set Artifact selection is not available."
    ]);
    // EFFECT, not just the refusal: nothing was stamped and no initiative moved.
    expect(forged.state.players.p1.combatStats.artifactSetSelections ?? {}).toEqual({});
    expect(effectiveInitiative(forged.state.combat!.units.u_own_0, forged.state.activeEffects)).toBe(4);
  });

  it("REPRO: a MOVE alone (no attack yet) already closes the window", () => {
    const state = beginningCombat("sets-begin-move");
    state.combat!.units.u_own_1.movedThisActivation = true;
    expect(selectOffers(state)).toEqual([]);
    expect(applyAction(state, SELECT_AA).errors.length).toBeGreaterThan(0);
  });

  it("REPRO: the continue-or-retreat window — a whole round fought, still combat round 1", () => {
    const state = beginningCombat("sets-begin-await");
    const combat = state.combat!;
    for (const unit of Object.values(combat.units)) {
      unit.activatedThisRound = true;
      unit.attackedThisActivation = true;
    }
    combat.awaitingContinue = true;
    expect(combat.round, "the round counter has NOT moved — this is why round-1 was not enough").toBe(1);
    expect(selectOffers(state)).toEqual([]);
    const forged = applyAction(state, SELECT_AA);
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.players.p1.combatStats.artifactSetSelections ?? {}).toEqual({});
  });

  it("stays closed after a REAL round advance (CONTINUE_NEUTRAL_COMBAT)", () => {
    const state = beginningCombat("sets-begin-round2");
    const combat = state.combat!;
    for (const unit of Object.values(combat.units)) {
      unit.activatedThisRound = true;
    }
    combat.awaitingContinue = true;
    state.heroes.hero_p1.movementPoints = 3;

    const next = applyOk(state, { type: "CONTINUE_NEUTRAL_COMBAT", playerId: "p1" });
    expect(next.combat!.round, "the real continue really advanced the round").toBe(2);
    // The round reset clears activatedThisRound, so ONLY the round check can
    // close the window here — both halves of the gate are load-bearing.
    expect(Object.values(next.combat!.units).every((unit) => !unit.activatedThisRound)).toBe(true);
    expect(selectOffers(next)).toEqual([]);
    expect(applyAction(next, SELECT_AA).errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: a NON-round-gated tier still works after the fighting has begun", () => {
    // "Once per combat" tiers must NOT be over-locked by this fix. Titan's
    // Thunder prints no timing at all, so its zap stays legal all fight.
    const state = makeState(true, "sets-begin-not-overlocked");
    ownOnly(state, [TT_MEMBERS[0], TT_MEMBERS[1]]);
    const combat = stageCombat(
      state,
      [{ unitDefId: "castle.halberdiers", side: "few" }],
      [{ unitDefId: "neutral.skeletons", side: "neutral" }]
    );
    // The fight is well under way: everyone has fought, and it is combat round 3.
    for (const unit of Object.values(combat.units)) {
      unit.activatedThisRound = true;
      unit.attackedThisActivation = true;
    }
    combat.round = 3;
    state.activePlayerId = "p1";
    state.priorityPlayerId = "p1";

    const zap = artifactSetPowerOffers(state, "p1").find(
      (offer) => offer.setId === "titans_thunder" && offer.unitId === "u_foe_0"
    );
    expect(zap, "the once-per-combat zap must survive the combat-start gate").toBeTruthy();
    const damageBefore = combat.units.u_foe_0.damage;
    const next = applyOk(state, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: "titans_thunder",
      tier: 2,
      unitId: "u_foe_0"
    });
    expect(next.combat!.units.u_foe_0.damage).toBe(damageBefore + 1);
  });

  it("CONTROL: the 'selected unit' tiers are NOT round-gated either (they print 'Once per combat')", () => {
    const state = beginningCombat("sets-begin-bound-tiers");
    const picked = applyOk(state, SELECT_AA);
    const combat = picked.combat!;
    // Now play the fight out into round 4 with everyone having fought.
    combat.round = 4;
    for (const unit of Object.values(combat.units)) {
      unit.activatedThisRound = true;
      unit.attackedThisActivation = true;
    }
    const bound = applyOk(picked, {
      type: "USE_ARTIFACT_SET_POWER",
      playerId: "p1",
      setId: AA,
      tier: 5,
      unitId: "u_own_0"
    });
    expect(
      bound.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS" && modifier.amount === 1)
      )
    ).toBe(true);
  });

  it("is REACHABLE in a real neutral fight where a guard is faster than every own unit", () => {
    // Without the pre-activation-pause offer this fix would make the power
    // unusable in any fight the guards open — the pause is the only moment the
    // human is offered anything before the first swing.
    let state = makeState(true, "sets-begin-reachable");
    ownOnly(state, [...AA_MEMBERS]);
    const hero = state.heroes.hero_p1;
    hero.level = 1;
    hero.spaceId = "guard-field";
    state.adventure!.fields["guard-field"] = {
      spaceId: "guard-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 2,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as never;
    startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);

    // Deploy through the real placement flow.
    for (let step = 0; step < 40 && state.combat?.setup; step += 1) {
      const legal = getLegalActions(state, "p1");
      const next =
        legal.find((entry) => entry.action.type === "PLACE_COMBAT_UNIT") ??
        legal.find((entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT");
      if (!next) {
        break;
      }
      state = applyOk(state, next.action);
    }
    expect(state.combat!.setup).toBeNull();
    // A guard opened the fight, so the human's only surface is the pause.
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    expect(state.combat!.units[state.combat!.activeUnitId!].controllerId).toBe(NEUTRAL_PLAYER_ID);
    expect(
      Object.values(state.combat!.units).some(
        (unit) => unit.activatedThisRound || unit.movedThisActivation || Boolean(unit.attackedThisActivation)
      ),
      "nothing has acted yet — the window is genuinely still open"
    ).toBe(false);

    const offered = selectLegalActions(state);
    expect(offered.length, "the selection must be reachable at the pre-activation pause").toBeGreaterThan(0);
    const applied = applyOk(state, offered[0].action);
    expect(Object.keys(applied.players.p1.combatStats.artifactSetSelections ?? {})).toContain(AA);
    // …and the pause offers ONLY the combat-start tiers, never the
    // once-per-combat ones (which belong to the holder's own activation).
    expect(
      getLegalActions(state, "p1").some((entry) => entry.action.type === "USE_ARTIFACT_SET_POWER")
    ).toBe(false);
  });

  it("a hosted (redacted) client sees the SAME closed window the server enforces", () => {
    const state = beginningCombat("sets-begin-hosted");
    state.players.p1.deck = [];
    state.players.p1.artifactSetStatus = playerArtifactSetStatuses(state, "p1");
    const combat = state.combat!;
    combat.units.u_own_1.activatedThisRound = true;
    combat.units.u_own_1.attackedThisActivation = true;

    const seat = redactStateForSeat(state, "p1");
    expect(getLegalActions(seat, "p1").filter((entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT")).toEqual(
      []
    );
    // CONTROL: with the flags cleared the same redacted client DOES see it, so
    // the emptiness above is the timing gate and not the redaction.
    const open = beginningCombat("sets-begin-hosted-open");
    open.players.p1.deck = [];
    open.players.p1.artifactSetStatus = playerArtifactSetStatuses(open, "p1");
    expect(
      getLegalActions(redactStateForSeat(open, "p1"), "p1").filter(
        (entry) => entry.action.type === "SELECT_ARTIFACT_SET_UNIT"
      ).length
    ).toBeGreaterThan(0);
  });

  it("a SECOND fight re-opens the window that the first one closed", () => {
    const state = makeState(true, "sets-begin-two-fights");
    ownOnly(state, [...AA_MEMBERS]);
    // Fight 1 is over and its window was spent AND closed.
    state.players.p1.combatStats.artifactSetUsesThisCombat = ["angelic_alliance:2"];
    state.players.p1.combatStats.artifactSetSelections = { angelic_alliance: "stale_unit" };

    const hero = state.heroes.hero_p1;
    hero.level = 1;
    hero.spaceId = "guard-field-2";
    state.adventure!.fields["guard-field-2"] = {
      spaceId: "guard-field-2",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 3,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as never;
    startNeutralEncounter(state, hero, state.adventure!.fields["guard-field-2"]);

    expect(state.players.p1.combatStats.artifactSetUsesThisCombat).toEqual([]);
    expect(state.players.p1.combatStats.artifactSetSelections).toEqual({});
    expect(state.combat!.round).toBe(1);
    expect(
      Object.values(state.combat!.units).some(
        (unit) => unit.activatedThisRound || unit.movedThisActivation || Boolean(unit.attackedThisActivation)
      )
    ).toBe(false);
    expect(artifactSetCombatStartWindowOpen(state)).toBe(true);
  });

  it("DATA: the printed text and the declared timing agree, in BOTH directions", () => {
    // The gate used to key off `effect.kind === "select-unit"`, which happened to
    // cover today's three tiers. This invariant is what stops a FUTURE
    // beginning-of-the-combat tier from silently running all fight long.
    let declared = 0;
    for (const set of ARTIFACT_SETS) {
      for (const tier of set.tiers) {
        const printed = COMBAT_START_TEXT_PATTERN.test(tier.text);
        expect(tier.timing === "combat-start", `${set.id}:${tier.threshold} — "${tier.text}"`).toBe(printed);
        if (printed) {
          declared += 1;
        }
        // Every `select-unit` effect IS a beginning-of-the-combat tier.
        if (tier.effect.kind === "select-unit") {
          expect(tier.timing, `${set.id}:${tier.threshold} select tier`).toBe("combat-start");
        }
      }
    }
    // Angelic Alliance, Ironfist of the Ogre, Armor of the Damned.
    expect(declared).toBe(3);
  });

  it("RULE OFF / no combat: the window read is inert", () => {
    const off = makeState(false, "sets-begin-off");
    ownOnly(off, [...AA_MEMBERS]);
    stageCombat(off, [{ unitDefId: "castle.halberdiers", side: "few" }], [{ unitDefId: "neutral.skeletons", side: "neutral" }]);
    expect(artifactSetPowerOffers(off, "p1")).toEqual([]);
    const mapOnly = makeState(true, "sets-begin-nocombat");
    ownOnly(mapOnly, [...AA_MEMBERS]);
    expect(artifactSetCombatStartWindowOpen(mapOnly)).toBe(false);
    expect(artifactSetPowerOffers(mapOnly, "p1").some((offer) => offer.kind === "select")).toBe(false);
  });
});
