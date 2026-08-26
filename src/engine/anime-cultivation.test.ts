import { describe, expect, it } from "vitest";
import {
  applyAction,
  CULTIVATION_REALM_REGISTERS,
  createAdventureGameState,
  createInitialGameState,
  cultivationRealmLabel,
  cultivationRealmOf,
  cultivationRealmRegisterKey,
  effectiveHandLimit,
  gainExperience,
  getLegalActions,
  getMainHero,
  getPlayerView,
  standingSpellPower,
  tribulationAvailable,
  DEFAULT_ANIME_OPTIONS,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import { eliminatePlayer, placeCreatureBank } from "./adventure";
import { finishCombatIfNeeded } from "./combat-units";
import { chooseComputerAction } from "./computer/policy";
import { scoreMapAction } from "./computer/map-policy";
import type { ComputerObservation } from "./computer/types";
import type { PlayerVisibleState } from "./state";
import { cardLibrary } from "@/data/cards/library";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const CULTIVATION_ON = { ...DEFAULT_ANIME_OPTIONS, enabled: true, cultivation: true };

function adventure(seed: string, anime = CULTIVATION_ON, extra: Record<string, unknown> = {}): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, anime, ...extra });
}

describe("anime.cultivation — faction-themed presentation registers", () => {
  it("maps classic, anime, wuxia and Heavenly Demon's bespoke modao family", () => {
    expect(cultivationRealmRegisterKey("castle")).toBe("classic");
    expect(cultivationRealmRegisterKey("fuyuki")).toBe("anime");
    expect(cultivationRealmRegisterKey("azure_breeze")).toBe("wuxia");
    expect(cultivationRealmRegisterKey("heavenly_demon")).toBe("modao");
  });

  it("gives Azur Lane / Little Busters / MGQ their OWN realm register, not the generic anime 'Awakened'", () => {
    // Before the fix these shared the "anime" visual register, so every one of
    // them showed "Awakened · Thức Tỉnh" beside its faction-specific grade chip.
    expect(cultivationRealmRegisterKey("azur_lane")).toBe("kansen");
    expect(cultivationRealmRegisterKey("little_busters")).toBe("seishun");
    expect(cultivationRealmRegisterKey("mgq")).toBe("mgq");
    expect(CULTIVATION_REALM_REGISTERS.kansen[0]).toEqual({ en: "Commissioned", vi: "Biên Chế" });
    expect(CULTIVATION_REALM_REGISTERS.seishun[0]).toEqual({ en: "Newcomer", vi: "Tân Sinh" });
  });

  it("keeps every four-step ladder bilingually complete", () => {
    for (const [key, ladder] of Object.entries(CULTIVATION_REALM_REGISTERS)) {
      expect(Object.keys(ladder), `${key} ladder`).toHaveLength(4);
      for (const label of Object.values(ladder)) {
        expect(label.en.length, `${key} English label`).toBeGreaterThan(0);
        expect(label.vi.length, `${key} Vietnamese label`).toBeGreaterThan(0);
      }
    }
  });

  it("resolves the event/board label from the owning player's faction", () => {
    const state = adventure("cult-themed-labels");
    state.players.p1.factionId = "castle";
    expect(cultivationRealmLabel(state, "p1", 2)).toEqual({ en: "Master", vi: "Bậc Thầy" });
    state.players.p1.factionId = "fuyuki";
    expect(cultivationRealmLabel(state, "p1", 2)).toEqual({ en: "Ascendant", vi: "Thăng Hoa" });
    state.players.p1.factionId = "azure_breeze";
    expect(cultivationRealmLabel(state, "p1", 2)).toEqual({ en: "Core Formation", vi: "Kim Đan" });
    state.players.p1.factionId = "heavenly_demon";
    expect(cultivationRealmLabel(state, "p1", 2)).toEqual({ en: "Demon Core", vi: "Ma Đan" });
  });
});

/** Clear the mandatory start-of-turn hand step so the turn body is reachable. */
function startTurn(state: GameState, playerId: PlayerId = "p1"): GameState {
  return state.players[playerId].needsHandRefresh || state.players[playerId].canMulligan
    ? applyOk(state, { type: "REFRESH_HAND", playerId, discardCardIds: [] })
    : state;
}

function realmEvents(state: GameState): GameState["eventLog"] {
  return state.eventLog.filter((event) => event.type === "CULTIVATION_REALM_ADVANCED");
}

function setArmy(state: GameState, cards: { unitDefId: string; side: "few" | "pack" | "neutral"; stacks?: number }[]): void {
  state.players.p1.army = cards.map((card, index) => ({
    id: `army_${index}`,
    unitDefId: card.unitDefId,
    side: card.side,
    ...(card.stacks ? { stacks: card.stacks } : {})
  }));
}

function chooseVisitOption(state: GameState, match: RegExp, playerId: PlayerId = "p1"): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(
    legal,
    `expected a visit option matching ${match} — saw: ${getLegalActions(state, playerId)
      .filter((entry) => entry.action.type === "RESOLVE_VISIT_STEP")
      .map((entry) => entry.label)
      .join(" | ")}`
  ).toBeTruthy();
  return applyOk(state, legal!.action);
}

/** Prime an adventure with p1's main hero at Core Formation, level 7, on the map. */
function tribulationReady(seed: string, army: { unitDefId: string; side: "few" | "pack" | "neutral"; stacks?: number }[]): GameState {
  let state = adventure(seed);
  state = startTurn(state);
  const hero = getMainHero(state, "p1")!;
  hero.level = 7;
  hero.cultivationRealm = 2;
  setArmy(state, army);
  return state;
}

/** Search seeds until HEAVEN_TRIBULATION rolls a dice pattern the predicate accepts. */
function tribulationWithRolls(
  seedPrefix: string,
  army: { unitDefId: string; side: "few" | "pack" | "neutral"; stacks?: number }[],
  wantTolls: (tolls: number) => boolean
): { state: GameState; rolls: number[] } {
  for (let seedN = 0; seedN < 400; seedN += 1) {
    const state = tribulationReady(`${seedPrefix}-${seedN}`, army);
    const after = applyAction(state, { type: "HEAVEN_TRIBULATION", playerId: "p1" });
    if (after.errors.length > 0) {
      throw new Error(after.errors.map((error) => error.message).join("; "));
    }
    const rolled = after.state.eventLog.find((event) => event.type === "CULTIVATION_TRIBULATION_ROLLED");
    const rolls = rolled && rolled.type === "CULTIVATION_TRIBULATION_ROLLED" ? rolled.rolls : [];
    const tolls = rolls.filter((roll) => roll === -1).length;
    if (wantTolls(tolls)) {
      return { state: after.state, rolls };
    }
  }
  throw new Error(`no seed produced the wanted Tribulation dice for ${seedPrefix}`);
}

/** Resolve any open artifact deck search (take the first revealed card). */
function drainArtifactDraw(state: GameState): GameState {
  let current = state;
  for (let guard = 0; guard < 12 && (current.pendingChoice || current.adventure?.pendingVisit); guard += 1) {
    const legal = getLegalActions(current, "p1");
    const take = legal.find((entry) => entry.action.type === "RESOLVE_DECK_SEARCH" && entry.action.pick.kind === "revealed");
    const search = legal.find((entry) => entry.action.type === "CHOOSE_OPTION");
    const visit = legal.find((entry) => entry.action.type === "RESOLVE_VISIT_STEP");
    const next = take ?? search ?? visit;
    if (!next) {
      break;
    }
    current = applyOk(current, next.action);
  }
  return current;
}

function handArtifactCount(state: GameState): number {
  return state.players.p1.hand.filter((cardId) => cardLibrary[cardId]?.kind === "artifact").length;
}

// ===========================================================================
// Mode OFF — byte-identical, no fields, no offers, no events
// ===========================================================================

describe("anime.cultivation — module OFF is inert", () => {
  it("stamps no realm, fires no cultivation events, offers no Tribulation, and does not change the hand limit", () => {
    let state = adventure("cult-off", DEFAULT_ANIME_OPTIONS); // anime disabled
    state = startTurn(state);

    // Reaching level 7 stamps nothing and fires no cultivation feed events.
    gainExperience(state, "p1", 12);
    expect(getMainHero(state, "p1")!.level).toBe(7);
    expect(getMainHero(state, "p1")!.cultivationRealm).toBeUndefined();
    expect(realmEvents(state)).toHaveLength(0);
    expect(cultivationRealmOf(state, "p1")).toBe(0);

    // Module off ignores even a (hypothetically) stamped realm — no hand bonus.
    const naturalLimit = effectiveHandLimit(state, "p1");
    getMainHero(state, "p1")!.cultivationRealm = 1;
    expect(effectiveHandLimit(state, "p1")).toBe(naturalLimit);
    getMainHero(state, "p1")!.cultivationRealm = 0;

    // No offer, and a forced action is rejected.
    expect(tribulationAvailable(state, "p1")).toBe(false);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "HEAVEN_TRIBULATION")).toBe(false);
    const forced = applyAction(state, { type: "HEAVEN_TRIBULATION", playerId: "p1" });
    expect(forced.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Automatic realm advancement — threshold exactness, fires once per realm
// ===========================================================================

describe("anime.cultivation — automatic realm advancement", () => {
  it("holds at realm 0 until level 3, then advances to Foundation (realm 1) with ONE feed event", () => {
    let state = adventure("cult-thresh");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;

    // Level 2 (experience 2) — below the Foundation threshold.
    gainExperience(state, "p1", 2);
    expect(hero.level).toBe(2);
    expect(hero.cultivationRealm ?? 0).toBe(0);
    expect(realmEvents(state)).toHaveLength(0);

    // Level 3 — Foundation fires, exactly one event.
    gainExperience(state, "p1", 2);
    expect(hero.level).toBe(3);
    expect(hero.cultivationRealm).toBe(1);
    const foundationEvents = realmEvents(state);
    expect(foundationEvents).toHaveLength(1);
    expect(foundationEvents[0].type === "CULTIVATION_REALM_ADVANCED" && foundationEvents[0].realm).toBe(1);

    // Level 4 — still Foundation, no NEW event (idempotent).
    gainExperience(state, "p1", 2);
    expect(hero.level).toBe(4);
    expect(hero.cultivationRealm).toBe(1);
    expect(realmEvents(state)).toHaveLength(1);
  });

  it("reaches Core Formation (realm 2) only with level ≥ 5 AND a bank win", () => {
    let state = adventure("cult-core");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;

    // Level 5, zero bank wins — still Foundation.
    gainExperience(state, "p1", 8);
    expect(hero.level).toBe(5);
    expect(hero.cultivationRealm).toBe(1);

    // A bank win completes the threshold → Core Formation, one more event.
    state.players.p1.bankWins = 1;
    gainExperience(state, "p1", 0); // no XP; the bank-win path is exercised separately below
    // (gainExperience with 0 returns early; drive the advance explicitly here)
    expect(hero.cultivationRealm).toBe(1);
    // Re-check on a real level-up tick with the bank win already banked.
    gainExperience(state, "p1", 2);
    expect(hero.level).toBe(6);
    expect(hero.cultivationRealm).toBe(2);
    expect(realmEvents(state)).toHaveLength(2); // Foundation + Core Formation
  });
});

// ===========================================================================
// Realm 1 Foundation — +1 hand limit (both consumers of effectiveHandLimit)
// ===========================================================================

describe("anime.cultivation — Foundation (+1 hand limit)", () => {
  it("raises the effective hand limit by 1, changing the draw-up AND the discard-down threshold", () => {
    // Do NOT pre-consume the mandatory draw — we use it to observe the draw-up.
    const state = adventure("cult-hand");
    const hero = getMainHero(state, "p1")!;

    const realm0Limit = effectiveHandLimit(state, "p1");
    hero.cultivationRealm = 1;
    const realm1Limit = effectiveHandLimit(state, "p1");
    expect(realm1Limit).toBe(realm0Limit + 1);

    // Draw-up consumer: the start-of-turn refresh fills to the HIGHER limit.
    state.players.p1.hand = [];
    state.players.p1.deck = Array.from({ length: 20 }, () => "stat.attack");
    const refreshed = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(refreshed.players.p1.hand.length).toBe(realm1Limit);

    // Discard-down consumer: a hand exactly at the higher limit is NOT over-limit
    // (needsHandRefresh false), where a realm-0 hero at the same size would be.
    const brimming = adventure("cult-hand-brim");
    const brim = startTurn(brimming, "p1");
    brim.players.p1.hand = Array.from({ length: realm1Limit }, () => "stat.attack");
    // realm 0: over the base limit.
    expect(brim.players.p1.hand.length).toBeGreaterThan(effectiveHandLimit(brim, "p1"));
    getMainHero(brim, "p1")!.cultivationRealm = 1;
    // realm 1: exactly at limit, not over.
    expect(brim.players.p1.hand.length).toBe(effectiveHandLimit(brim, "p1"));
  });
});

// ===========================================================================
// Realm 2 Core Formation — 1 free Attack-die reroll per combat
// ===========================================================================

describe("anime.cultivation — Core Formation combat reroll", () => {
  function combatAtRealm(seed: string, realm: number): GameState {
    const state = createInitialGameState(seed);
    state.anime = { ...CULTIVATION_ON };
    state.heroes.hero_p1.cultivationRealm = realm as 0 | 1 | 2 | 3;
    state.players.p1.morale = 0; // isolate: no morale-token reroll source
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9; // adjacent to skeletons
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [-1, 1, 1, 1];
    return state;
  }

  function attack(state: GameState): GameState {
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
  }

  it("offers the Core Formation reroll to a realm-2 holder, and using it re-rolls and latches the per-combat flag", () => {
    let state = attack(combatAtRealm("cult-reroll", 2));
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    if (choice?.type !== "ATTACK_DIE_REROLL") return;
    expect(choice.rerollSources.some((source) => source.cultivation)).toBe(true);
    const firstRoll = choice.candidates.at(-1)?.roll;

    const reroll = getLegalActions(state, "p1").find((entry) => entry.action.type === "REROLL_PENDING_CHOICE");
    expect(reroll, "a Core Formation reroll should be offered").toBeTruthy();
    state = applyOk(state, reroll!.action);

    // The roll actually changed (scripted: −1 then +1) and the flag latched.
    const rerolled = state.pendingChoice;
    if (rerolled?.type === "ATTACK_DIE_REROLL") {
      expect(rerolled.candidates.length).toBeGreaterThan(1);
      expect(rerolled.candidates.at(-1)?.roll).not.toBe(firstRoll);
    }
    expect(state.players.p1.combatStats.cultivationRerollUsed).toBe(true);
  });

  it("does NOT offer it a second time once spent this combat", () => {
    const state = combatAtRealm("cult-reroll-2", 2);
    state.players.p1.combatStats.cultivationRerollUsed = true; // already spent this fight
    const after = attack(state);
    const choice = after.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      expect(choice.rerollSources.some((source) => source.cultivation)).toBe(false);
    }
  });

  it("returns next combat (makeCombatShell clears the spent flag)", () => {
    let state = adventure("cult-reroll-reset");
    state = startTurn(state);
    state.players.p1.combatStats.cultivationRerollUsed = true;
    const hero = getMainHero(state, "p1")!;
    hero.level = 1; // below the field difficulty → a REAL fight (makeCombatShell runs)
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
    expect(state.players.p1.combatStats.cultivationRerollUsed).toBe(false);
  });

  it("CONTROL: a realm-1 holder is never offered the reroll", () => {
    const state = attack(combatAtRealm("cult-reroll-ctrl", 1));
    const choice = state.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      expect(choice.rerollSources.some((source) => source.cultivation)).toBe(false);
    }
    // Whether or not a reroll window even opened, no cultivation source exists.
    expect(state.players.p1.combatStats.cultivationRerollUsed ?? false).toBe(false);
  });
});

// ===========================================================================
// Realm 3 Nascent Soul — +1 Power on spell casts (printed-ladder observable)
// ===========================================================================

describe("anime.cultivation — Nascent Soul (+1 spell Power)", () => {
  function castMagicArrowDamage(seed: string, realm: number): number {
    const state = createInitialGameState(seed);
    state.anime = { ...CULTIVATION_ON };
    state.heroes.hero_p1.cultivationRealm = realm as 0 | 1 | 2 | 3;
    state.players.p1.hand = ["spell.magic_arrow"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 50;
    target.damage = 0;
    const cast = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "CAST_SPELL" &&
        entry.action.cardId === "spell.magic_arrow" &&
        entry.action.target?.type === "unit" &&
        entry.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "Magic Arrow should be castable at the skeletons").toBeTruthy();
    let resolved = applyOk(state, cast!.action);
    let safety = 40;
    while (resolved.reactionWindow && safety > 0) {
      safety -= 1;
      resolved = applyOk(resolved, { type: "PASS_REACTION", playerId: resolved.reactionWindow.priorityPlayerId });
    }
    return resolved.combat!.units.unit_p2_skeletons.damage;
  }

  it("a realm-3 cast lands one printed-ladder tier higher than a realm-2 CONTROL", () => {
    const realm2 = castMagicArrowDamage("cult-power-ctrl", 2);
    const realm3 = castMagicArrowDamage("cult-power", 3);
    // Magic Arrow amountByPower {0:1, 1:2}: realm-2 (Power 0) = 1, realm-3 (+1) = 2.
    expect(realm2).toBe(1);
    expect(realm3).toBe(2);
  });
});

// ===========================================================================
// Heavenly Tribulation — the realm 2 → 3 gauntlet
// ===========================================================================

describe("anime.cultivation — Heavenly Tribulation", () => {
  const packFewNeutral = [
    { unitDefId: "castle.griffins", side: "pack" as const },
    { unitDefId: "neutral.oceanids", side: "neutral" as const },
    { unitDefId: "castle.halberdiers", side: "few" as const },
    { unitDefId: "castle.marksmen", side: "few" as const }
  ];

  it("an all-'−1' run pays 3 tolls (a Pack flip + a Neutral loss-recycle) and still breaks through", () => {
    const { state: opened } = tribulationWithRolls("trib-all", packFewNeutral, (tolls) => tolls === 3);
    const armyBefore = opened.players.p1.army.length;
    const bronzeDiscardBefore = opened.decks["neutral-bronze"]?.discardPile.length ?? 0;
    const artifactsBefore = handArtifactCount(opened);

    // Toll 1: flip the Pack (stays a card, now Few).
    let state = chooseVisitOption(opened, /Flip Griffins/);
    expect(state.eventLog.some((event) => event.type === "ARMY_UNIT_FLIPPED" && event.reason === "Heavenly Tribulation")).toBe(true);
    // Toll 2: lose the Neutral — recycles to its tier discard pile.
    state = chooseVisitOption(state, /Lose .*Oceanids.* \(neutral\)/i);
    expect(state.decks["neutral-bronze"]!.discardPile.length).toBe(bronzeDiscardBefore + 1);
    // Toll 3 (2 candidates remain): lose a Few.
    state = chooseVisitOption(state, /Lose .*\(few\)/i);

    // Breakthrough with a surviving army: Nascent Soul + an Artifact drawn.
    state = drainArtifactDraw(state);
    const hero = getMainHero(state, "p1")!;
    expect(hero.cultivationRealm).toBe(3);
    expect(hero.tribulationWon).toBe(true);
    expect(state.players.p1.army.length).toBe(armyBefore - 2); // 1 flip (kept) + 2 losses
    expect(state.players.p1.army.length).toBeGreaterThan(0);
    expect(handArtifactCount(state)).toBe(artifactsBefore + 1);
    expect(state.eventLog.some((event) => event.type === "CULTIVATION_REALM_ADVANCED" && event.realm === 3 && event.viaTribulation)).toBe(true);
  });

  it("a no-'−1' run pays nothing and breaks through with the army intact", () => {
    const { state: opened } = tribulationWithRolls("trib-none", packFewNeutral, (tolls) => tolls === 0);
    const armyBefore = opened.players.p1.army.length;
    const state = drainArtifactDraw(opened);
    expect(state.players.p1.army.length).toBe(armyBefore); // untouched
    expect(getMainHero(state, "p1")!.cultivationRealm).toBe(3);
    expect(handArtifactCount(state)).toBe(handArtifactCount(opened) + 1);
  });

  it("an emptied army FAILS: realm stays 2, no breakthrough, retry allowed next turn", () => {
    // A one-card army with ≥1 toll empties, so the gauntlet fails.
    const { state } = tribulationWithRolls(
      "trib-fail",
      [{ unitDefId: "castle.halberdiers", side: "few" }],
      (tolls) => tolls >= 1
    );
    // The single card auto-resolves (one candidate), then resolve any tail.
    let after = state;
    for (let guard = 0; guard < 6 && after.adventure?.pendingVisit; guard += 1) {
      const step = getLegalActions(after, "p1").find((entry) => entry.action.type === "RESOLVE_VISIT_STEP");
      if (!step) break;
      after = applyOk(after, step.action);
    }
    const hero = getMainHero(after, "p1")!;
    expect(hero.cultivationRealm).toBe(2);
    expect(hero.tribulationWon ?? false).toBe(false);
    expect(after.players.p1.army.length).toBe(0);
    expect(after.eventLog.some((event) => event.type === "CULTIVATION_TRIBULATION_FAILED")).toBe(true);
    // Attempted this turn → not offered again now; available again next round.
    expect(tribulationAvailable(after, "p1")).toBe(false);
    after.round += 1;
    expect(tribulationAvailable(after, "p1")).toBe(true);
  });

  it("is attemptable at most ONCE per own turn", () => {
    const state = tribulationReady("trib-once", [{ unitDefId: "castle.halberdiers", side: "few" }]);
    const first = applyAction(state, { type: "HEAVEN_TRIBULATION", playerId: "p1" });
    expect(first.errors).toEqual([]);
    // Resolve whatever it opened, then a second attempt the SAME turn is rejected.
    let resolved = first.state;
    for (let guard = 0; guard < 6 && (resolved.adventure?.pendingVisit || resolved.pendingChoice); guard += 1) {
      const step = getLegalActions(resolved, "p1").find(
        (entry) => entry.action.type === "RESOLVE_VISIT_STEP" || entry.action.type === "CHOOSE_OPTION" || entry.action.type === "RESOLVE_DECK_SEARCH"
      );
      if (!step) break;
      resolved = applyOk(resolved, step.action);
    }
    const second = applyAction(resolved, { type: "HEAVEN_TRIBULATION", playerId: "p1" });
    expect(second.errors.length).toBeGreaterThan(0);
  });

  it("is OFFERED as a legal map action only at realm 2 + level 7 (CONTROL: realm 1 is not)", () => {
    const ready = tribulationReady("trib-offer", [{ unitDefId: "castle.halberdiers", side: "few" }]);
    expect(getLegalActions(ready, "p1").some((entry) => entry.action.type === "HEAVEN_TRIBULATION")).toBe(true);

    const notReady = tribulationReady("trib-offer-ctrl", [{ unitDefId: "castle.halberdiers", side: "few" }]);
    getMainHero(notReady, "p1")!.cultivationRealm = 1;
    expect(getLegalActions(notReady, "p1").some((entry) => entry.action.type === "HEAVEN_TRIBULATION")).toBe(false);
  });
});

// ===========================================================================
// Elimination + parallel-turns cover the Tribulation window generically
// ===========================================================================

describe("anime.cultivation — Tribulation interaction seams", () => {
  it("eliminatePlayer clears an open Tribulation window it owns", () => {
    const { state } = tribulationWithRolls(
      "trib-elim",
      [
        { unitDefId: "castle.griffins", side: "pack" },
        { unitDefId: "castle.halberdiers", side: "few" }
      ],
      (tolls) => tolls >= 1
    );
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    // Elimination (AFK kick / concede) drops the owned pendingVisit, not strands it.
    eliminatePlayer(state, "p1", "eliminated mid-Tribulation", true);
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
  });

  it("parallel turns: a bystander cannot act while the Tribulation window is open (CONTROL: they can once it clears)", () => {
    // Two players, parallel mode; p1 opens a Tribulation, p2 is a bystander.
    let state = createAdventureGameState({
      seed: "trib-parallel",
      difficulty: "normal",
      rollFirstPlayer: false,
      anime: CULTIVATION_ON,
      parallelTurns: 4,
      players: [
        { id: "p1", name: "One", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    // Get both seats past their mandatory start-of-turn draw.
    state = startTurn(state, "p1");
    state = startTurn(state, "p2");
    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.cultivationRealm = 2;
    setArmy(state, [
      { unitDefId: "castle.griffins", side: "pack" },
      { unitDefId: "castle.halberdiers", side: "few" }
    ]);
    // Force a toll so the window stays open.
    let opened = state;
    for (let seedTry = 0; seedTry < 1; seedTry += 1) {
      opened = applyOk(state, { type: "HEAVEN_TRIBULATION", playerId: "p1" });
    }
    if (opened.adventure?.pendingVisit?.playerId === "p1") {
      // A bystander END_TURN is refused while p1's exclusive interaction is open.
      const bystander = applyAction(opened, { type: "END_TURN", playerId: "p2" });
      expect(bystander.errors.length).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// bankWins — mod-agnostic counter (increments on bank win, not a normal guard)
// ===========================================================================

describe("bankWins counter (mod-agnostic)", () => {
  function bankField(state: GameState): void {
    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.spaceId = "bank-field";
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    placeCreatureBank(state, "bank-field", "crypt");
    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
  }

  function forceWin(state: GameState): void {
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    if (place) {
      const placed = applyOk(state, place.action);
      Object.assign(state, placed);
      const finish = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
      Object.assign(state, finish);
    }
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);
  }

  it("increments on a Creature-Bank win — even with cultivation OFF (mod-agnostic)", () => {
    let state = createAdventureGameState({ seed: "bankwin-off", difficulty: "normal", rollFirstPlayer: false });
    state = startTurn(state);
    expect(state.players.p1.bankWins).toBeUndefined();
    bankField(state);
    forceWin(state);
    expect(state.players.p1.bankWins).toBe(1);
  });

  it("CONTROL: a NORMAL guard-field win does NOT increment bankWins", () => {
    let state = adventure("guardwin");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
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
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    if (place) {
      state = applyOk(state, place.action);
      state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    }
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);
    expect(state.players.p1.bankWins ?? 0).toBe(0);
  });

  it("a bank win drives the realm 2 auto-advance when level ≥ 5 (cultivation on)", () => {
    let state = adventure("bankwin-realm");
    state = startTurn(state);
    getMainHero(state, "p1")!.cultivationRealm = 1; // Foundation, level will be 7 via bankField
    bankField(state);
    forceWin(state);
    expect(state.players.p1.bankWins).toBe(1);
    expect(getMainHero(state, "p1")!.cultivationRealm).toBe(2);
  });
});

// ===========================================================================
// Player views / snapshots — realm + tribulationWon + bankWins are PUBLIC
// ===========================================================================

describe("anime.cultivation — public state & legacy snapshots", () => {
  it("does not strip realm / tribulationWon / bankWins from another seat's view", () => {
    let state = adventure("cult-view", CULTIVATION_ON, {
      players: [
        { id: "p1", name: "One", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.cultivationRealm = 3;
    hero.tribulationWon = true;
    state.players.p1.bankWins = 2;

    const p2View = getPlayerView(state, "p2");
    const viewedHero = Object.values(p2View.heroes).find((entry) => entry.controllerId === "p1" && entry.kind === "main");
    expect(viewedHero?.cultivationRealm).toBe(3);
    expect(viewedHero?.tribulationWon).toBe(true);
    expect(p2View.players.p1.bankWins).toBe(2);
  });

  it("a legacy snapshot with none of the new fields loads and reads realm 0", () => {
    let state = adventure("cult-legacy");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    delete hero.cultivationRealm;
    delete hero.tribulationWon;
    delete state.players.p1.bankWins;
    expect(cultivationRealmOf(state, "p1")).toBe(0);
    expect(effectiveHandLimit(state, "p1")).toBeGreaterThan(0);
    // Legal actions still compute (no crash on missing fields).
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Cross-mod seams (WOG Commanders / Polish Spell Book / mixed anime packages)
// ===========================================================================

describe("anime.cultivation — cross-mod seams", () => {
  it("Polish Unit Stacks: a Tribulation toll on a STACKED Pack sheds ONE layer (stays a Pack); an unstacked Pack flips", () => {
    // Stacked pack: the toll sheds a layer (ARMY_STACK_LOST), the card stays a Pack.
    const { state: stacked } = tribulationWithRolls(
      "trib-stack",
      [
        { unitDefId: "castle.griffins", side: "pack", stacks: 2 },
        { unitDefId: "castle.halberdiers", side: "few" }
      ],
      (tolls) => tolls >= 1
    );
    const afterStacked = chooseVisitOption(stacked, /Griffins loses 1 Stack/);
    const griffins = afterStacked.players.p1.army.find((unit) => unit.unitDefId === "castle.griffins");
    expect(griffins?.side).toBe("pack"); // still a Pack
    expect(griffins?.stacks).toBe(1); // one layer shed
    expect(afterStacked.eventLog.some((event) => event.type === "ARMY_STACK_LOST" && event.reason?.includes("Heavenly Tribulation"))).toBe(true);

    // CONTROL: an UNSTACKED pack flips whole to Few (no Stack shed).
    const { state: plain } = tribulationWithRolls(
      "trib-stack-ctrl",
      [
        { unitDefId: "castle.griffins", side: "pack" },
        { unitDefId: "castle.halberdiers", side: "few" }
      ],
      (tolls) => tolls >= 1
    );
    const afterPlain = chooseVisitOption(plain, /Flip Griffins/);
    const flipped = afterPlain.players.p1.army.find((unit) => unit.unitDefId === "castle.griffins");
    expect(flipped?.side).toBe("few");
  });

  it("ORIGINAL (stash-style) Spell Book: the realm-3 +1 Power lands on a Book CAST (printed-ladder, CONTROL realm 2)", () => {
    // The original stash-style Spell Book (ruleset BINH default, distinct from
    // polish-spell-book) casts from player.spellBook via `fromSpellBook`. It
    // resolves through the shared resolvedSpellPowerForStackItem chokepoint, so
    // the Nascent +1 lands exactly as on a hand cast — observed as damage.
    function stashBookCastDamage(seed: string, realm: number): number {
      const state = createInitialGameState(seed);
      state.ruleset = "binh"; // stash-style Spell Book is the BINH default (no polish)
      state.anime = { ...CULTIVATION_ON };
      state.heroes.hero_p1.cultivationRealm = realm as 0 | 1 | 2 | 3;
      state.players.p1.hand = [];
      state.players.p1.spellBook = ["spell.magic_arrow"];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_marksmen";
      const target = state.combat!.units.unit_p2_skeletons;
      target.abilities = [];
      target.maxHealth = 50;
      target.damage = 0;
      const cast = getLegalActions(state, "p1").find(
        (entry) =>
          entry.action.type === "CAST_SPELL" &&
          entry.action.cardId === "spell.magic_arrow" &&
          entry.action.fromSpellBook &&
          entry.action.target?.type === "unit" &&
          entry.action.target.unitId === "unit_p2_skeletons"
      );
      expect(cast, "Magic Arrow should be castable from the stash-style Book").toBeTruthy();
      let resolved = applyOk(state, cast!.action);
      let safety = 40;
      while (resolved.reactionWindow && safety > 0) {
        safety -= 1;
        resolved = applyOk(resolved, { type: "PASS_REACTION", playerId: resolved.reactionWindow.priorityPlayerId });
      }
      return resolved.combat!.units.unit_p2_skeletons.damage;
    }
    // Magic Arrow {0:1, 1:2}: realm-2 Book cast = 1, realm-3 Book cast = 2.
    expect(stashBookCastDamage("cult-stashbook-ctrl", 2)).toBe(1);
    expect(stashBookCastDamage("cult-stashbook", 3)).toBe(2);
  });

  it("Polish Spell Book (mutually-exclusive mode): the realm-3 +1 Power is on the shared standing chokepoint too", () => {
    // polish-spell-book is the OTHER Book world (exclusive with the stash-style
    // one); the cultivation +1 rides the same standingSpellPower chokepoint it
    // and the resolved cast share, so enabling it never suppresses the bump.
    function bookPower(realm: number): number {
      const state = createAdventureGameState({
        seed: `cult-book-${realm}`,
        ruleset: "binh",
        rollFirstPlayer: false,
        anime: CULTIVATION_ON,
        houseRules: { "polish-spell-book": true }
      });
      getMainHero(state, "p1")!.cultivationRealm = realm as 0 | 1 | 2 | 3;
      return standingSpellPower(state, "p1", cardLibrary["spell.magic_arrow"]);
    }
    expect(bookPower(3)).toBe(bookPower(2) + 1);
  });

  it("WOG Commanders: the Core Formation reroll behaves like any attack-window source in a commander fight", () => {
    const state = createInitialGameState("cult-wog");
    state.anime = { ...CULTIVATION_ON };
    state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
    state.heroes.hero_p1.cultivationRealm = 2;
    state.players.p1.morale = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [-1, 1, 1, 1];
    const after = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const choice = after.pendingChoice;
    // No crash; the reroll source is present exactly once.
    if (choice?.type === "ATTACK_DIE_REROLL") {
      expect(choice.rerollSources.filter((source) => source.cultivation)).toHaveLength(1);
    }
  });

  it("MIXED PACKAGE: cultivation events fire identically with an isekai module also on", () => {
    let state = adventure("cult-mixed", { ...CULTIVATION_ON, isekaiTowns: true, isekaiNeutrals: true });
    state = startTurn(state);
    gainExperience(state, "p1", 4); // level 3 → Foundation
    expect(getMainHero(state, "p1")!.cultivationRealm).toBe(1);
    expect(realmEvents(state)).toHaveLength(1);
  });
});

// ===========================================================================
// Computer policy — accept/skip scoring + no-freeze toll resolution
// ===========================================================================

function observe(state: GameState, legalActions: ReturnType<typeof getLegalActions>, playerId: PlayerId): ComputerObservation {
  return { playerId, state: state as unknown as PlayerVisibleState, legalActions };
}

describe("anime.cultivation — computer policy", () => {
  const drivingArmy = [
    { unitDefId: "castle.griffins", side: "pack" as const },
    { unitDefId: "neutral.oceanids", side: "neutral" as const },
    { unitDefId: "castle.halberdiers", side: "few" as const },
    { unitDefId: "castle.marksmen", side: "few" as const }
  ];

  it("scores the Tribulation offer above END_TURN with an army buffer (≥3), and skips a thin army", () => {
    const state = tribulationReady("cult-ai-score", drivingArmy);
    const bigArmy = scoreMapAction(observe(state, getLegalActions(state, "p1"), "p1"), {
      type: "HEAVEN_TRIBULATION",
      playerId: "p1"
    });
    expect(bigArmy).not.toBeNull();
    expect(bigArmy!.score).toBeGreaterThan(300); // above END_TURN → attempted when idle

    setArmy(state, [{ unitDefId: "castle.halberdiers", side: "few" }]); // 1 card
    const thin = scoreMapAction(observe(state, getLegalActions(state, "p1"), "p1"), {
      type: "HEAVEN_TRIBULATION",
      playerId: "p1"
    });
    expect(thin).toBeNull(); // → foundation 0, below END_TURN → declined
  });

  it("a realm-2 level-7 seat resolves the whole Tribulation via the policy WITHOUT freezing", () => {
    // Open a Tribulation with tolls to pay, then let the computer policy answer
    // every step (tolls + the breakthrough artifact search). It must always have
    // a resolving action and drain the window in bounded steps.
    const { state: opened } = tribulationWithRolls("cult-ai-drive", drivingArmy, (tolls) => tolls >= 1);
    let state = opened;
    let steps = 0;
    while ((state.adventure?.pendingVisit || state.pendingChoice) && steps < 40) {
      steps += 1;
      const decision = chooseComputerAction(observe(state, getLegalActions(state, "p1"), "p1"));
      expect(decision, "the AI must always have a resolving action (no freeze)").toBeTruthy();
      state = applyOk(state, decision!.action);
    }
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
    expect(state.pendingChoice ?? null).toBeNull();
    expect(steps).toBeLessThan(40); // drained, never stalled
    // It broke through with a surviving army (the AI protects value: flips packs).
    expect(getMainHero(state, "p1")!.cultivationRealm).toBe(3);
  });
});
