import { describe, expect, it } from "vitest";
import { CREATURE_BANKS } from "@/data/map/creature-banks";
import { beginFieldVisit, getMainHero, grantCreatureBankReward } from "./adventure";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import type {
  CombatState,
  CustomMapTilePlan,
  GameDifficulty,
  GameState,
  MapFieldState
} from "./state";

// ---------------------------------------------------------------------------
// Ⅶ Dragon-Utopia FIELD artifact reward (USER RULE 2026-08-03, reported in live
// play: "Utopia VII field Is still giving too much artifacts. Should be 3. First
// you take Search(3) and then 2 times Search(5) (search properly according to
// VI-VII tile)").
//
// SCOPE — the rule covers the Ⅶ OBJECTIVE FIELD only: the map-designed / hidden
// Grail & Dragon Utopia package, the `polish-grail-utopia` house rule, and the
// plain conquest/grail Ⅶ field. Those pay a FIXED ladder of three Artifact-deck
// Searches (3, then 5, then 5) = exactly three Artifact cards.
//
// The Creature-Bank `dragon_utopia` TOKEN is DELIBERATELY UNTOUCHED and keeps its
// printed card: 40 gold + Search (3) + X × the "Search (5) the Artifact or Spell
// Deck" choice, X = the number of Stacked defenders. The bank test below is the
// CONTROL proving the Ⅶ ladder never leaks onto it.
//
// Every test asserts an OBSERVABLE outcome — the reveal counts the real Search
// pipeline opens and how many Artifact cards the winner ends up owning — with a
// CONTROL that diverges, so it fails if the wiring is removed.
// ---------------------------------------------------------------------------

const START_A = { row: 8, col: 2 } as const;
const START_B = { row: 10, col: 7 } as const;
const CENTER = { row: 9, col: 4 } as const;

function startPlans(): CustomMapTilePlan[] {
  return [
    { row: START_A.row, col: START_A.col, group: "starting", faceDown: false },
    { row: START_B.row, col: START_B.col, group: "starting", faceDown: false }
  ];
}

/**
 * A two-seat map whose single face-up CENTRE tile carries a designated Ⅶ Dragon
 * Utopia. A designer-placed Utopia auto-activates the Grail & Dragon Utopia
 * field-rules package, so this is the live "hidden package" path.
 */
function utopiaCentreMap(seed: string, difficulty: GameDifficulty = "normal"): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty,
    rollFirstPlayer: false,
    victoryMode: "conquest",
    customMap: [
      ...startPlans(),
      {
        row: CENTER.row,
        col: CENTER.col,
        group: "center",
        faceDown: false,
        tileDefId: "C4",
        viiField: "dragon_utopia"
      }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.phase = "player-turn";
  return state;
}

function objectiveField(state: GameState): MapFieldState {
  return Object.values(state.adventure!.fields).find((field) => field.difficulty === 7)!;
}

function artifactsOwned(state: GameState, playerId: "p1" | "p2"): string[] {
  const player = state.players[playerId]!;
  return [...player.hand, ...player.deck, ...player.discard].filter((cardId) =>
    cardId.startsWith("artifact.")
  );
}

type DriveResult = {
  /** How many cards each Search actually revealed, in order. */
  revealCounts: number[];
  /** The deck-family options each Search offered (split-deck access). */
  deckPickLabels: string[][];
};

/**
 * Drives the queued reward chain through the REAL pipeline: answer every
 * deck-family pick / Search-or-take-the-discard prompt by SEARCHING, keep the
 * first revealed card, and record what each Search revealed.
 */
function driveSearches(state: GameState): DriveResult {
  const revealCounts: number[] = [];
  const deckPickLabels: string[][] = [];
  pumpAdventureQueues(state);
  for (let guard = 0; guard < 60; guard += 1) {
    const choice = state.pendingChoice;
    if (!choice) {
      // A visit-step CHOOSE_ONE (the bank's printed "Artifact or Spell" Extra)
      // is answered through RESOLVE_VISIT_STEP, not a pendingChoice. Always take
      // the Artifact arm so the artifact count is the observable.
      const visitStep = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Artifact/i.test(legal.label)
      );
      if (!visitStep) break;
      const next = applyAction(state, visitStep.action);
      expect(next.errors.map((error) => error.message).join("; ")).toBe("");
      Object.assign(state, next.state);
      continue;
    }
    if (choice.type === "DECK_SEARCH") {
      revealCounts.push(choice.revealedCardIds.length);
      const next = applyAction(state, {
        type: "RESOLVE_DECK_SEARCH",
        playerId: choice.playerId,
        choiceId: choice.id,
        pick: { kind: "revealed", index: 0 }
      });
      expect(next.errors.map((error) => error.message).join("; ")).toBe("");
      Object.assign(state, next.state);
      continue;
    }
    if (choice.type !== "OPTION_CHOICE") break;
    if (choice.context === "deck-pick") {
      deckPickLabels.push(choice.options.map((option) => option.label));
    }
    // Option 0 is always "Search (N)" on a deck-search-mode prompt and the
    // weakest deck on a deck-pick; either way it keeps the chain going.
    const next = applyAction(state, {
      type: "CHOOSE_OPTION",
      playerId: choice.playerId,
      choiceId: choice.id,
      optionIndex: 0
    });
    expect(next.errors.map((error) => error.message).join("; ")).toBe("");
    Object.assign(state, next.state);
  }
  return { revealCounts, deckPickLabels };
}

/** Queued Artifact-family Searches, in queue order. */
function queuedArtifactSearchCounts(state: GameState): number[] {
  return (state.adventure!.rewardQueue ?? [])
    .filter((reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts")
    .map((reward) => (reward.kind === "shared-deck-search" ? reward.count : 0));
}

describe("Ⅶ Dragon-Utopia FIELD — the artifact reward is fixed at Search 3 / 5 / 5", () => {
  it("a won Ⅶ Utopia field opens exactly three Searches (3, 5, 5) and the winner keeps exactly 3 Artifacts", () => {
    const state = utopiaCentreMap("utopia-reward-3");
    const hero = getMainHero(state, "p1")!;
    const field = objectiveField(state);
    expect(field.location).toBe("dragon_utopia");
    hero.spaceId = field.spaceId;
    const before = artifactsOwned(state, "p1").length;

    beginFieldVisit(state, hero.id, field.spaceId, false);
    const { revealCounts, deckPickLabels } = driveSearches(state);

    // The observable outcome: three Searches revealing 3, then 5, then 5 cards…
    expect(revealCounts).toEqual([3, 5, 5]);
    // …and exactly three more Artifact cards owned (one kept per Search).
    expect(artifactsOwned(state, "p1").length - before).toBe(3);

    // "Search properly according to VI-VII tile": each Search ran through the
    // normal eligible-deck pick for a CENTRE tile, so the Relic deck is reachable
    // (a hardcoded deck would offer no pick at all).
    expect(deckPickLabels).toHaveLength(3);
    for (const labels of deckPickLabels) {
      expect(labels.some((label) => /Relic Artifacts/.test(label))).toBe(true);
      expect(labels.some((label) => /Minor Artifacts/.test(label))).toBe(true);
    }
  });

  it("the Ⅶ field's ladder does NOT scale with the scenario difficulty", () => {
    // An Impossible game (where a bank would field 4 Stacked defenders and pay
    // 1 + 4 Searches) pays the Ⅶ field's same three Searches as an Easy one.
    for (const difficulty of ["easy", "impossible"] as const) {
      const state = utopiaCentreMap(`utopia-scale-${difficulty}`, difficulty);
      const hero = getMainHero(state, "p1")!;
      const field = objectiveField(state);
      hero.spaceId = field.spaceId;
      beginFieldVisit(state, hero.id, field.spaceId, false);
      expect(queuedArtifactSearchCounts(state), difficulty).toEqual([3, 5, 5]);
    }
  });

  it("CONTROL: the Creature-Bank Dragon Utopia TOKEN is untouched — printed X-scaling with the Artifact-or-Spell choice", () => {
    // The Ⅶ ladder must never leak onto the bank token: its printed reward is
    // 40 gold + Search (3) + X × "Search (5) the Artifact OR Spell Deck".
    for (const stacked of [0, 1, 2, 3, 4]) {
      const reward = CREATURE_BANKS.dragon_utopia.buildReward(stacked);
      expect(reward.type).toBe("SEQUENCE");
      if (reward.type !== "SEQUENCE") return;
      expect(reward.interactions[0]).toEqual({ type: "GAIN_RESOURCES", gold: 40 });
      expect(reward.interactions[1]).toEqual({
        type: "SEARCH_SHARED_DECK",
        deckId: "artifacts",
        count: 3
      });
      const extras = reward.interactions.slice(2);
      expect(extras, `stacked ${stacked}`).toHaveLength(stacked);
      for (const extra of extras) {
        expect(extra.type).toBe("CHOOSE_ONE");
        if (extra.type !== "CHOOSE_ONE") return;
        expect(extra.options.map((option) => option.interaction)).toEqual([
          { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 5 },
          { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 }
        ]);
      }
    }

    // …and through the real grant path: an Impossible bank with all four
    // defenders Stacked pays Search (3) plus FOUR Artifact-or-Spell choices, so
    // its Artifact ceiling is five — never the Ⅶ field's fixed three.
    const state = utopiaCentreMap("utopia-bank-token");
    const hero = getMainHero(state, "p1")!;
    const bankField: MapFieldState = {
      spaceId: "77,77",
      tileInstanceId: "bank-tile",
      slot: 0,
      location: "creature_bank",
      bankId: "dragon_utopia",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    state.adventure!.fields[bankField.spaceId] = bankField;
    hero.spaceId = bankField.spaceId;
    const gold = state.players.p1.resources.gold;

    grantCreatureBankReward(state, hero.id, bankField.spaceId, 4);

    expect(state.players.p1.resources.gold - gold).toBe(40);
    // The base Search (3) is queued; the four Extras are still pending as visit
    // steps / an open choice, because each is a player pick.
    expect(queuedArtifactSearchCounts(state)).toEqual([3]);
    const extraChoices =
      state.adventure!.pendingVisit?.steps.filter((step) => step.type === "CHOOSE_ONE").length ??
      0;
    const openChoice = state.pendingChoice?.type === "OPTION_CHOICE" ? 1 : 0;
    expect(extraChoices + openChoice).toBe(4);
  });

  it("a plain-mode Ⅶ Utopia (no field-rules package) pays the same three Searches through the Artifact FAMILY", () => {
    // No designer designation ⇒ the field-rules package stays off, so this is the
    // classic "Lvl-VII creature bank" branch. It used to pay a hardcoded
    // Search (2) of the RELIC deck, which bypassed the eligible-deck pick.
    const state = createAdventureGameState({
      seed: "utopia-plain-mode",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest"
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    const hero = getMainHero(state, "p1")!;
    const field: MapFieldState = {
      spaceId: "66,66",
      tileInstanceId: "t-plain",
      slot: 0,
      location: "dragon_utopia",
      difficulty: 7,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    state.adventure!.fields[field.spaceId] = field;
    hero.spaceId = field.spaceId;
    const gold = state.players.p1.resources.gold;

    beginFieldVisit(state, hero.id, field.spaceId, false);

    expect(state.players.p1.resources.gold - gold).toBe(10);
    expect(queuedArtifactSearchCounts(state)).toEqual([3, 5, 5]);
    // CONTROL for the "family, not a hardcoded deck" half: nothing is queued
    // against a split Artifact deck id.
    expect(
      (state.adventure!.rewardQueue ?? []).filter(
        (reward) =>
          reward.kind === "shared-deck-search" && String(reward.deckId).startsWith("artifacts-")
      )
    ).toHaveLength(0);
  });

  it("both guard modes pay the same reward; the designer's utopiaBonusSearch is the only extra", () => {
    for (const utopiaGuards of ["four", "by-difficulty"] as const) {
      const state = utopiaCentreMap(`utopia-guards-${utopiaGuards}`);
      state.adventure!.mapPreset = {
        ...(state.adventure!.mapPreset ?? {}),
        objectives: { ...(state.adventure!.mapPreset?.objectives ?? {}), utopiaGuards }
      };
      const hero = getMainHero(state, "p1")!;
      const field = objectiveField(state);
      hero.spaceId = field.spaceId;
      beginFieldVisit(state, hero.id, field.spaceId, false);
      expect(queuedArtifactSearchCounts(state), utopiaGuards).toEqual([3, 5, 5]);
    }

    // The opt-in designer knob still adds its EXTRA Search on top (plain mode —
    // the only branch that reads it), so the DEFAULT stays exactly three.
    const bonus = createAdventureGameState({
      seed: "utopia-bonus-knob",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest"
    });
    bonus.adventure!.mapPreset = { objectives: { utopiaBonusSearch: 2 } };
    const bonusHero = getMainHero(bonus, "p1")!;
    const bonusField: MapFieldState = {
      spaceId: "65,65",
      tileInstanceId: "t-bonus",
      slot: 0,
      location: "dragon_utopia",
      difficulty: 7,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    bonus.adventure!.fields[bonusField.spaceId] = bonusField;
    bonusHero.spaceId = bonusField.spaceId;
    beginFieldVisit(bonus, bonusHero.id, bonusField.spaceId, false);
    expect(queuedArtifactSearchCounts(bonus)).toEqual([3, 5, 5, 2]);
  });

  it("CONTROL: the bank token's atomic Necromancy deferral still pays its PRINTED 1 + X reward on Resolve", () => {
    const state = createAdventureGameState({
      seed: "utopia-necro-defer",
      ruleset: "binh",
      difficulty: "impossible",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.players.p1.hand = ["ability.necromancy"];
    state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    state.players.p1.resources.gold = 0;
    const hero = getMainHero(state, "p1")!;
    const fieldId = "bank,utopia";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "test-tile",
      slot: 0,
      location: "creature_bank",
      bankId: "dragon_utopia",
      difficulty: 1,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    hero.spaceId = fieldId;
    state.activePlayerId = "p1";
    state.combat = {
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId,
        difficulty: 1,
        hasAzure: false,
        bankId: "dragon_utopia",
        // Impossible: all four defenders Stacked ⇒ the printed 1 + X = 5 Searches.
        bankStackCount: 4
      },
      outcome: {
        winnerPlayerId: "p1",
        defeatedPlayerId: "neutral",
        reason: "all-enemy-units-defeated"
      },
      units: {}
    } as unknown as CombatState;

    finalizeAdventureCombat(state);

    // Withheld behind the window: no gold, no cube, no Searches yet.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    expect(state.players.p1.resources.gold).toBe(0);
    expect(queuedArtifactSearchCounts(state)).toEqual([]);
    expect(getLegalActions(state, "p1").some((l) => l.action.type === "SKIP_NECROMANCY")).toBe(true);

    const resolved = applyAction(state, { type: "SKIP_NECROMANCY", playerId: "p1" });
    expect(resolved.errors.map((error) => error.message).join("; ")).toBe("");
    expect(resolved.state.players.p1.resources.gold).toBe(40);
    expect(resolved.state.adventure!.fields[fieldId]!.blackCube).toBe(true);
    // The deferred reward pays the PRINTED bank reward: the base Search (3) plus
    // one Search (5) per Stacked defender (Artifact chosen on each choice), so
    // FIVE Artifacts here — the Ⅶ field's fixed three never applies to a bank.
    const after = resolved.state;
    const beforeArtifacts = artifactsOwned(after, "p1").length;
    const { revealCounts } = driveSearches(after);
    expect([...revealCounts].sort((a, b) => a - b)).toEqual([3, 5, 5, 5, 5]);
    expect(artifactsOwned(after, "p1").length - beforeArtifacts).toBe(5);
  });
});
