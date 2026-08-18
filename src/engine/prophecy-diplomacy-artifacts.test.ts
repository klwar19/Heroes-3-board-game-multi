import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { beginFieldVisit, getMainHero, getTownOfPlayer } from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { artifactDeckBinhMajor, artifactDeckLegacy, REROLL_REACTION_ARTIFACT_IDS } from "@/data/cards/artifacts";
import { cardLibrary } from "@/data/cards/library";
import {
  expireEffectsForGameRoundEnd,
  expireEffectsForTurnEnd,
  makeActiveEffect
} from "./active-effects";
import type { GameAction, GameEvent, GameState, VisitStep } from "./state";

// ---------------------------------------------------------------------------
// Three Major wiki artifacts that manipulate dice / recruit Neutral Units:
//   - Cards of Prophecy (Tower):    Reroll any die — OR — Set a Resource or
//                                   Treasure die to the side of your choice.
//   - Diplomat's Ring (Stronghold): Reroll any die or any roll — OR — Dwelling
//                                   Neutral recruit.
//   - Ambassador's Sash (Rampart):  Dwelling Neutral recruit — OR — Reroll a die.
//
// "Reroll" reuses the Expert-Luck reroll model (a one-shot ATTACK_DIE_REROLL +
// ADVENTURE_DIE_REROLL "any" effect). "Set a die" is a new ADVENTURE_DIE_SET
// modifier offered in rollResourceDice/rollTreasureDice. The Dwelling recruit
// reuses Cyra's Diplomacy DIPLOMACY_RECRUIT.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A map turn with p1 active and no leftover morale token (keeps die rolls clean). */
function mapState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";
  state.players.p1.morale = 0;
  return state;
}

const SPACE = "50,50";

/** Drops a single visitable field under p1's hero so a visit can be driven. */
function injectField(state: GameState, location: string): void {
  state.adventure!.fields[SPACE] = {
    spaceId: SPACE,
    tileInstanceId: "prophecy-tile",
    slot: 0,
    location,
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  getMainHero(state, "p1")!.spaceId = SPACE;
}

function findPlay(state: GameState, cardId: string, optionIndex: number): GameAction | undefined {
  for (const entry of getLegalActions(state, "p1")) {
    const action = entry.action;
    if (action.type === "PLAY_CARD" && action.cardId === cardId && action.optionIndex === optionIndex) {
      return action;
    }
  }
  return undefined;
}

function visitChoice(state: GameState): Extract<VisitStep, { type: "CHOOSE_ONE" }> {
  const step = state.adventure!.pendingVisit?.steps[0];
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`Expected a CHOOSE_ONE visit step, got ${step?.type ?? "none"}`);
  }
  return step;
}

function resolveByLabel(state: GameState, match: (label: string) => boolean): void {
  const step = visitChoice(state);
  const optionIndex = step.options.findIndex((option) => match(option.label));
  if (optionIndex < 0) {
    throw new Error(`No option matched among: ${step.options.map((option) => option.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
}

function countRolls(state: GameState, dice: "resource" | "treasure"): number {
  return state.eventLog.filter((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === dice).length;
}

function hasDieSetEffect(state: GameState): boolean {
  return state.activeEffects.some((effect) => effect.modifiers.some((modifier) => modifier.type === "ADVENTURE_DIE_SET"));
}

// ===========================================================================
// Card definitions
// ===========================================================================

describe("Prophecy / Diplomacy artifacts — definitions", () => {
  it("Cards of Prophecy: only the map set-die is a proactive option (reroll is a held reaction)", () => {
    const card = cardLibrary["artifact.cards_of_prophecy"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.artifactTier).toBe("major");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") return;

    expect(card.effect.options).toHaveLength(1);
    const [setDie] = card.effect.options;
    // Set-die side: the only proactive play — a map-only ADVENTURE_DIE_SET effect.
    expect(setDie.mapOnly).toBe(true);
    expect(setDie.effect.type).toBe("CREATE_ACTIVE_EFFECT");
    if (setDie.effect.type === "CREATE_ACTIVE_EFFECT") {
      const setMod = setDie.effect.effect.modifiers.find((modifier) => modifier.type === "ADVENTURE_DIE_SET");
      expect(setMod?.type === "ADVENTURE_DIE_SET" && setMod.dice).toBe("any");
    }
    // No pre-armed reroll option — the reroll fires from hand after a die roll.
    expect(card.effect.options.some((option) => option.effect.type === "CREATE_ACTIVE_EFFECT" &&
      option.effect.effect.modifiers.some((modifier) => modifier.type === "ATTACK_DIE_REROLL"))).toBe(false);
    expect(REROLL_REACTION_ARTIFACT_IDS).toContain("artifact.cards_of_prophecy");
  });

  it("Diplomat's Ring: only the map Dwelling recruit is a proactive option (reroll is a held reaction)", () => {
    const card = cardLibrary["artifact.diplomats_ring"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.artifactTier).toBe("major");
    if (card.effect.type !== "CHOOSE_ONE") throw new Error("expected CHOOSE_ONE");
    expect(card.effect.options).toHaveLength(1);
    expect(card.effect.options[0].effect.type).toBe("DIPLOMACY_RECRUIT");
    expect(card.effect.options[0].mapOnly).toBe(true);
    // No pre-armed reroll option — the reroll fires from hand after a die roll.
    expect(card.effect.options.some((option) => option.effect.type === "CREATE_ACTIVE_EFFECT")).toBe(false);
    expect(REROLL_REACTION_ARTIFACT_IDS).toContain("artifact.diplomats_ring");
  });

  it("Ambassador's Sash: only the map Dwelling recruit is a proactive option (reroll is a held reaction)", () => {
    const card = cardLibrary["artifact.ambassadors_sash"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.artifactTier).toBe("major");
    if (card.effect.type !== "CHOOSE_ONE") throw new Error("expected CHOOSE_ONE");
    expect(card.effect.options).toHaveLength(1);
    expect(card.effect.options[0].effect.type).toBe("DIPLOMACY_RECRUIT");
    expect(card.effect.options[0].mapOnly).toBe(true);
    expect(card.effect.options.some((option) => option.effect.type === "CREATE_ACTIVE_EFFECT")).toBe(false);
    expect(REROLL_REACTION_ARTIFACT_IDS).toContain("artifact.ambassadors_sash");
  });

  it("all three are decked in the legacy and BINH Major artifact decks", () => {
    for (const id of ["artifact.cards_of_prophecy", "artifact.diplomats_ring", "artifact.ambassadors_sash"]) {
      expect(artifactDeckLegacy).toContain(id);
      expect(artifactDeckBinhMajor).toContain(id);
    }
  });
});

// ===========================================================================
// Reroll-any-die (functional, adventure map)
// ===========================================================================

describe("Reroll-any-die option (map adventure die)", () => {
  // All three reroll artifacts (Cards of Prophecy, Diplomat's Ring, Ambassador's
  // Sash) expose their reroll as an instant REACTION: hold the card, roll the
  // die, THEN the reroll is offered — the card is never pre-played for a reroll.
  function holdThenVisit(cardId: string, location: string): GameState {
    const state = mapState(`react-${cardId}`);
    state.players.p1.hand = [cardId];
    injectField(state, location);
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
    return state;
  }

  it("Cards of Prophecy reroll is offered after the Resource die is rolled, then discarded", () => {
    const state = holdThenVisit("artifact.cards_of_prophecy", "resource_symbol");
    expect(
      visitChoice(state).options.some((option) => /Cards of Prophecy: reroll the Resource/i.test(option.label))
    ).toBe(true);

    const before = countRolls(state, "resource");
    resolveByLabel(state, (label) => /Cards of Prophecy: reroll the Resource/i.test(label));

    // A second Resource roll happened, and the artifact is spent to the discard.
    expect(countRolls(state, "resource")).toBe(before + 1);
    expect(state.players.p1.hand).not.toContain("artifact.cards_of_prophecy");
    expect(state.players.p1.discard).toContain("artifact.cards_of_prophecy");
  });

  it("Diplomat's Ring is NOT a proactive reroll play — there is nothing to pre-select", () => {
    const state = mapState("ring-no-prearm");
    state.players.p1.hand = ["artifact.diplomats_ring"];
    // The only card option is the Dwelling recruit (option 0). No option ever
    // pre-arms a reroll, so clicking the card before a roll cannot select one.
    const card = cardLibrary["artifact.diplomats_ring"];
    if (card.effect.type !== "CHOOSE_ONE") throw new Error("expected CHOOSE_ONE");
    expect(card.effect.options).toHaveLength(1);
    expect(findPlay(state, "artifact.diplomats_ring", 1)).toBeUndefined();
  });

  it("Diplomat's Ring reroll is offered after the Resource die is rolled, then discarded", () => {
    const state = holdThenVisit("artifact.diplomats_ring", "resource_symbol");
    // The roll already happened; the reroll is an after-the-roll instant.
    expect(visitChoice(state).options.some((option) => /Diplomat's Ring: reroll the Resource/i.test(option.label))).toBe(
      true
    );

    const before = countRolls(state, "resource");
    resolveByLabel(state, (label) => /Diplomat's Ring: reroll the Resource/i.test(label));

    // A second Resource roll happened, and the artifact is spent to the discard.
    expect(countRolls(state, "resource")).toBe(before + 1);
    expect(state.players.p1.hand).not.toContain("artifact.diplomats_ring");
    expect(state.players.p1.discard).toContain("artifact.diplomats_ring");
  });

  it("Ambassador's Sash reroll is offered after the Treasure die is rolled, then discarded", () => {
    const state = holdThenVisit("artifact.ambassadors_sash", "treasure_symbol");
    expect(
      visitChoice(state).options.some((option) => /Ambassador's Sash: reroll the Treasure/i.test(option.label))
    ).toBe(true);

    const before = countRolls(state, "treasure");
    resolveByLabel(state, (label) => /Ambassador's Sash: reroll the Treasure/i.test(label));

    expect(countRolls(state, "treasure")).toBe(before + 1);
    expect(state.players.p1.hand).not.toContain("artifact.ambassadors_sash");
    expect(state.players.p1.discard).toContain("artifact.ambassadors_sash");
  });

  it("without any reroll source, a single Resource die auto-resolves with no choice", () => {
    const state = mapState("reroll-none");
    injectField(state, "resource_symbol");
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
    // No reroll/set effect and no held reroll artifact: the single die resolves
    // immediately, no pending visit.
    expect(state.adventure!.pendingVisit).toBeNull();
  });
});

// ===========================================================================
// Cards of Prophecy option B on the MAP — "roll it 3 times, resolve 1 chosen"
// (Polish Balance Pack). Under the rule the artifact's map-die reroll throws the
// die THREE times and lets the owner keep any of the three, instead of the plain
// single re-throw every other reroll artifact (and the classic Prophecy) takes.
// ===========================================================================

/** Latest map-dice event of a kind, for reading how many candidate faces a roll threw. */
function lastDiceEvent(state: GameState, dice: "resource" | "treasure") {
  return [...state.eventLog]
    .reverse()
    .find((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === dice) as
    | Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }>
    | undefined;
}

describe("Cards of Prophecy option B on the map — roll 3 times, keep one (polish-card-balance)", () => {
  function balanceHold(cardId: string, location: string, seed: string, treasureDice?: 1 | 2): GameState {
    const state = mapState(seed);
    (state.adventure as unknown as { houseRules: Record<string, boolean> }).houseRules = {
      ...((state.adventure as unknown as { houseRules?: Record<string, boolean> }).houseRules ?? {}),
      "polish-card-balance": true
    };
    state.players.p1.hand = [cardId];
    injectField(state, location);
    if (treasureDice !== undefined) {
      state.adventure!.fields[SPACE].treasureDice = treasureDice;
    }
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
    return state;
  }

  it("a single Resource die is thrown THREE times and the owner keeps a CHOSEN one", () => {
    // Seed pins the three candidate faces to 1 valuables / 3 gold / 6 gold — three
    // distinct outcomes, so the pick is real, not a formality.
    const state = balanceHold("artifact.cards_of_prophecy", "resource_symbol", "pfx-resource_symbol-0");

    // The offer names the 3-throw pick, NOT the plain single reroll.
    expect(visitChoice(state).options.some((option) => /roll the Resource die 3 times/i.test(option.label))).toBe(true);
    expect(visitChoice(state).options.some((option) => /reroll the Resource die/i.test(option.label))).toBe(false);

    resolveByLabel(state, (label) => /roll the Resource die 3 times/i.test(label));

    // The re-throw event carries THREE candidate faces (one die, rolled thrice).
    const rerollEvent = lastDiceEvent(state, "resource");
    expect(rerollEvent?.results).toEqual(["1 valuables", "3 gold", "6 gold"]);

    // All three are pickable — an ordinary reroll would offer only the latest.
    const pick = visitChoice(state);
    expect(pick.options.map((option) => option.label)).toEqual(
      expect.arrayContaining(["1 valuables", "3 gold", "6 gold"])
    );

    // OBSERVABLE: keep the 6-gold candidate and only that resource lands.
    const goldBefore = state.players.p1.resources.gold;
    const valuablesBefore = state.players.p1.resources.valuables;
    resolveByLabel(state, (label) => label === "6 gold");
    expect(state.players.p1.resources.gold).toBe(goldBefore + 6);
    expect(state.players.p1.resources.valuables).toBe(valuablesBefore);
  });

  it("CONTROL: with the rule OFF the Resource-die reroll is a single re-throw (one face), no pick", () => {
    const state = mapState("pfx-resource_symbol-0");
    state.players.p1.hand = ["artifact.cards_of_prophecy"];
    injectField(state, "resource_symbol");
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);

    // Classic reroll wording, and no 3-throw offer.
    expect(visitChoice(state).options.some((option) => /roll the Resource die 3 times/i.test(option.label))).toBe(false);
    expect(visitChoice(state).options.some((option) => /reroll the Resource die/i.test(option.label))).toBe(true);

    resolveByLabel(state, (label) => /reroll the Resource die/i.test(label));
    // One die, one re-throw: exactly one candidate face.
    expect(lastDiceEvent(state, "resource")?.results).toHaveLength(1);
  });

  it("CONTROL: Diplomat's Ring under the rule still does a single re-throw (only Prophecy gets the 3-pick)", () => {
    const state = balanceHold("artifact.diplomats_ring", "resource_symbol", "pfx-resource_symbol-0");
    expect(visitChoice(state).options.some((option) => /roll the Resource die 3 times/i.test(option.label))).toBe(false);
    expect(visitChoice(state).options.some((option) => /Diplomat's Ring: reroll the Resource die/i.test(option.label))).toBe(
      true
    );
    resolveByLabel(state, (label) => /Diplomat's Ring: reroll the Resource die/i.test(label));
    expect(lastDiceEvent(state, "resource")?.results).toHaveLength(1);
  });

  it("2-die roll: exactly ONE die becomes the 3-pick, the other keeps its single face", () => {
    // Two Treasure dice (treasureDice = 2). Seed pins die 0 = Search-the-Artifact-deck,
    // die 1 = Roll-1-Resource-die, with die 0's two extra candidates both "Gain 1
    // experience". So die 1 stays a lone option while die 0 offers three faces.
    const state = balanceHold("artifact.cards_of_prophecy", "treasure_symbol", "t2-1", 2);
    resolveByLabel(state, (label) => /roll the Treasure die 3 times/i.test(label));

    // TWO base dice + TWO extra candidates for ONE of them = 4 faces total. A
    // whole-roll re-throw ×3 would be 6 — this proves only one die was tripled.
    const rerollEvent = lastDiceEvent(state, "treasure");
    expect(rerollEvent?.results).toHaveLength(4);

    // The untouched second die's face is still a standalone option (it "stays
    // random"), alongside die 0's expanded candidates.
    const labels = visitChoice(state).options.map((option) => option.label);
    expect(labels).toContain("Roll 1 Resource die"); // die 1, kept as-is
    expect(labels).toContain("Search (2) the Artifact deck"); // die 0, candidate 1
    expect(labels).toContain("Gain 1 experience"); // die 0, candidates 2-3
  });
});

// ===========================================================================
// Luck (basic & expert) — map-die rerolls last through the game round
// ===========================================================================

describe("Luck on the adventure map — lasts through the game round", () => {
  // Build the real Luck effect (basic or expert) from the card library so the
  // test tracks the shipped card data, then drop it on p1 for the round.
  function addLuck(state: GameState, mode: "basic" | "expert"): void {
    const card = cardLibrary["ability.luck"];
    if (card.effect.type !== "CREATE_ACTIVE_EFFECT") {
      throw new Error("ability.luck must be a CREATE_ACTIVE_EFFECT card");
    }
    const definition = mode === "expert" ? card.effect.expertEffect : card.effect.effect;
    if (!definition) {
      throw new Error(`ability.luck is missing its ${mode} effect`);
    }
    state.activeEffects.push(
      makeActiveEffect(state, definition, { type: "card", cardId: "ability.luck", controllerId: "p1" }, "p1")
    );
  }

  function visitWith(mode: "basic" | "expert", location: string, seed: string): GameState {
    const state = mapState(seed);
    state.players.p1.hand = [];
    addLuck(state, mode);
    injectField(state, location);
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
    return state;
  }

  function luckEffect(state: GameState) {
    return state.activeEffects.find((effect) => effect.name === "Luck" || effect.name === "Expert Luck");
  }

  it("basic and Expert Luck survive player-turn end and expire at game-round end", () => {
    for (const mode of ["basic", "expert"] as const) {
      const state = mapState(`luck-${mode}-duration`);
      addLuck(state, mode);
      const effectName = mode === "expert" ? "Expert Luck" : "Luck";

      expect(expireEffectsForTurnEnd(state, "p1")).toEqual([]);
      expect(state.activeEffects.map((effect) => effect.name)).toContain(effectName);

      state.round += 1;
      expect(expireEffectsForGameRoundEnd(state).map((effect) => effect.name)).toContain(effectName);
      expect(state.activeEffects.map((effect) => effect.name)).not.toContain(effectName);
    }
  });

  // The case above drives the two expiry helpers directly, which cannot prove
  // production reaches them. This one plays the REAL card through the reducer and
  // wraps the game round through the REAL `END_TURN` path.
  //
  // It deliberately gives Luck to the LAST seat, because that is the only shape
  // that tells the round rule from the OLD turn rule. A first-seat holder is
  // indistinguishable: the wrap runs `startAdventureRound` (round expiry) AND
  // `startPlayerTurn(seat 1)` (turn expiry) in the same action, so Luck vanishes
  // either way. The last seat's turn does NOT start at the wrap — so under the
  // round rule its Luck is already gone, while the turn rule would keep it live
  // into the new round until that seat acts again. Reverting the card to
  // `current-turn` fails this test.
  //
  // Also pins the physical card: Luck is an ongoing card, so an expired effect
  // whose card is never released leaves a dead card on the table forever.
  // Verified by throwaway probe (not shipped) to behave the same in
  // single-player, under parallel turns, and when Luck is played mid-combat.
  it("a LAST-seat holder's Luck is gone the moment the ROUND wraps, not when that seat next acts", () => {
    for (const mode of ["basic", "expert"] as const) {
      const effectName = mode === "expert" ? "Expert Luck" : "Luck";
      const luckLive = (current: GameState) => current.activeEffects.some((effect) => effect.name === effectName);
      let state = createAdventureGameState({
        seed: `luck-${mode}-last-seat`,
        difficulty: "normal",
        rollFirstPlayer: false,
        players: [
          { id: "p1", name: "First", factionId: "castle", heroDefId: "catherine" },
          { id: "p2", name: "Second", factionId: "tower", heroDefId: "solmyr" },
          { id: "p3", name: "Last", factionId: "rampart", heroDefId: "gelu" }
        ]
      });
      for (const player of Object.values(state.players)) {
        player.canMulligan = false;
        player.needsHandRefresh = false;
        player.morale = 0;
      }

      // Walk to the LAST seat's turn without wrapping the round.
      const startRound = state.round;
      for (let guard = 0; guard < 20 && state.activePlayerId !== "p3"; guard += 1) {
        const active = state.activePlayerId!;
        const legal = getLegalActions(state, active);
        const step = legal.find((option) => option.action.type === "END_TURN") ?? legal[0];
        expect(step, `no action available for ${active}`).toBeTruthy();
        state = applyOk(state, step!.action);
      }
      expect(state.activePlayerId, "expected to reach the last seat's turn").toBe("p3");
      expect(state.round).toBe(startRound);

      // The last seat's own turn opened with the mandatory hand step: take it,
      // or no card play is legal.
      if (state.players.p3.needsHandRefresh || state.players.p3.canMulligan) {
        state = applyOk(state, { type: "REFRESH_HAND", playerId: "p3", discardCardIds: [] });
      }
      state.players.p3.hand = ["ability.luck"];
      if (mode === "expert") {
        state.players.p3.limits.expertUses = 1;
      }
      const play = getLegalActions(state, "p3").find(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "ability.luck" &&
          legal.action.mode === mode
      );
      expect(play, `${mode} Luck must be playable on the map`).toBeTruthy();
      state = applyOk(state, play!.action);
      expect(luckLive(state)).toBe(true);
      // Held in play, NOT in the discard, while the effect lives.
      expect(state.players.p3.ongoingCards?.map((held) => held.cardId)).toContain("ability.luck");
      expect(state.players.p3.discard).not.toContain("ability.luck");

      // The last seat ends its turn → the round wraps and seat 1 acts next.
      for (let guard = 0; guard < 20 && state.round === startRound; guard += 1) {
        const active = state.activePlayerId!;
        const legal = getLegalActions(state, active);
        const step = legal.find((option) => option.action.type === "END_TURN") ?? legal[0];
        expect(step, `no action available for ${active}`).toBeTruthy();
        state = applyOk(state, step!.action);
      }
      expect(state.round, "the round must actually have wrapped").toBe(startRound + 1);
      expect(state.activePlayerId, "the holder's own turn must NOT have started yet").not.toBe("p3");
      expect(luckLive(state), "round-scoped Luck must be gone at the wrap").toBe(false);
      expect(state.players.p3.ongoingCards ?? []).toEqual([]);
      expect(state.players.p3.discard).toContain("ability.luck");
    }
  });

  it("basic Luck rerolls a map die and is NOT spent — it stays for the rest of the round", () => {
    const state = visitWith("basic", "resource_symbol", "luck-basic-resource");
    expect(visitChoice(state).options.some((option) => /^Luck: reroll the Resource/i.test(option.label))).toBe(true);

    const before = countRolls(state, "resource");
    resolveByLabel(state, (label) => /^Luck: reroll the Resource/i.test(label));
    // The reroll happened …
    expect(countRolls(state, "resource")).toBe(before + 1);
    // … and the Luck card is still on the table (round duration), with only
    // the Resource reroll spent — the Treasure reroll remains for this round.
    const effect = luckEffect(state);
    expect(effect, "basic Luck must persist after a map reroll").toBeDefined();
    expect(effect!.usedChoiceIds).toContain("luck:resource");
    expect(effect!.usedChoiceIds).not.toContain("luck:treasure");
  });

  it("basic Luck offers the Resource reroll only once per round", () => {
    const state = visitWith("basic", "resource_symbol", "luck-basic-once");
    resolveByLabel(state, (label) => /^Luck: reroll the Resource/i.test(label));

    // A second Resource field this same round: the one-per-round Resource reroll
    // is gone, so no Luck option is offered (and the single die auto-resolves).
    injectField(state, "resource_symbol");
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
    const step = state.adventure!.pendingVisit?.steps[0];
    if (step?.type === "CHOOSE_ONE") {
      expect(step.options.some((option) => /Luck: reroll/i.test(option.label))).toBe(false);
    } else {
      expect(state.adventure!.pendingVisit).toBeNull();
    }
  });

  it("Expert Luck is NOT consumed by a map reroll — it survives for later fights/dice this round", () => {
    const state = visitWith("expert", "resource_symbol", "luck-expert-resource");
    // "any die": the Expert Luck card offers the Resource reroll on the map too.
    expect(visitChoice(state).options.some((option) => /^Expert Luck: reroll the Resource/i.test(option.label))).toBe(
      true
    );

    const before = countRolls(state, "resource");
    resolveByLabel(state, (label) => /^Expert Luck: reroll the Resource/i.test(label));
    expect(countRolls(state, "resource")).toBe(before + 1);

    // The fix: the WHOLE Expert Luck card is no longer deleted on a single map
    // reroll (the old bug). It persists — keeping its Attack-die reroll alive for
    // every fight later this round — with only the Resource map reroll marked
    // used. A test fails if the delete-the-whole-card behaviour is restored.
    const effect = luckEffect(state);
    expect(effect, "Expert Luck must persist after a map reroll").toBeDefined();
    expect(effect!.usedChoiceIds).toContain("luck:resource");
    expect(
      effect!.modifiers.some((modifier) => modifier.type === "ATTACK_DIE_REROLL"),
      "Expert Luck keeps its Attack-die reroll for combats this round"
    ).toBe(true);
  });

  it("Expert Luck still rerolls a DIFFERENT map die kind after spending one (it persists)", () => {
    const state = visitWith("expert", "resource_symbol", "luck-expert-both");
    resolveByLabel(state, (label) => /^Expert Luck: reroll the Resource/i.test(label));

    // Same round, a Treasure field: Expert Luck ("any die") still offers a reroll
    // because only the Resource kind was spent and the card was not deleted.
    injectField(state, "treasure_symbol");
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
    expect(visitChoice(state).options.some((option) => /^Expert Luck: reroll the Treasure/i.test(option.label))).toBe(
      true
    );
  });
});

// ===========================================================================
// Cards of Prophecy — Set a Resource / Treasure die (functional)
// ===========================================================================

describe("Cards of Prophecy — set a Resource/Treasure die", () => {
  function playSetThenVisit(seed: string, location: string): GameState {
    let state = mapState(seed);
    state.players.p1.hand = ["artifact.cards_of_prophecy"];
    const play = findPlay(state, "artifact.cards_of_prophecy", 0);
    expect(play, "the set-die map option should be offered").toBeTruthy();
    state = applyOk(state, play!);
    expect(hasDieSetEffect(state)).toBe(true);
    injectField(state, location);
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
    return state;
  }

  it("sets the Resource die to a chosen face (6 gold), ignoring the roll, and is spent", () => {
    const state = playSetThenVisit("set-resource", "resource_symbol");
    const step = visitChoice(state);
    // Every DISTINCT Resource-die face is offered as a "set" option. Per the house
    // rule the die has no "2 valuables" face anymore (it was reduced to 1), so only
    // "1 valuables" is offered — and it appears exactly once (the two 1-valuable
    // faces are deduped).
    expect(step.options.some((option) => /set the Resource die to 6 gold/i.test(option.label))).toBe(true);
    expect(step.options.some((option) => /set the Resource die to 1 valuables/i.test(option.label))).toBe(true);
    expect(step.options.some((option) => /set the Resource die to 2 valuables/i.test(option.label))).toBe(false);
    expect(step.options.filter((option) => /set the Resource die to 1 valuables/i.test(option.label))).toHaveLength(1);
    expect(step.options.some((option) => /set the Resource die to 4 materials/i.test(option.label))).toBe(true);

    const goldBefore = state.players.p1.resources.gold;
    resolveByLabel(state, (label) => /set the Resource die to 6 gold/i.test(label));

    expect(state.players.p1.resources.gold).toBe(goldBefore + 6);
    expect(hasDieSetEffect(state)).toBe(false); // single use, spent
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("offers every distinct Treasure-die face and spends the effect when one is set", () => {
    const state = playSetThenVisit("set-treasure", "treasure_symbol");
    const labels = visitChoice(state).options.map((option) => option.label);
    expect(labels.some((label) => /set the Treasure die to Gain 1 experience/i.test(label))).toBe(true);
    expect(labels.some((label) => /set the Treasure die to Search \(2\) the Artifact deck/i.test(label))).toBe(true);
    expect(labels.some((label) => /set the Treasure die to Roll 1 Resource die/i.test(label))).toBe(true);
    expect(labels.some((label) => /set the Treasure die to Roll 2 Resource dice/i.test(label))).toBe(true);

    // Set it to "Roll 1 Resource die": the effect is spent first, then a normal
    // Resource die is rolled (which can no longer be set — single use).
    resolveByLabel(state, (label) => /set the Treasure die to Roll 1 Resource die/i.test(label));
    expect(hasDieSetEffect(state)).toBe(false);
  });

  it("setting one die does not let the chained Resource roll be set again (single use)", () => {
    // Set the Treasure die to "Roll 1 Resource die": the chained Resource roll
    // must auto-resolve (the die-set effect was already spent), so the visit
    // finishes without offering another "set the Resource die" choice.
    const state = playSetThenVisit("set-chain", "treasure_symbol");
    resolveByLabel(state, (label) => /set the Treasure die to Roll 1 Resource die/i.test(label));
    expect(hasDieSetEffect(state)).toBe(false);
    expect(state.adventure!.pendingVisit).toBeNull();
  });
});

// ===========================================================================
// Diplomat's Ring / Ambassador's Sash — Dwelling Neutral recruit (map)
// ===========================================================================

describe("Diplomat's Ring / Ambassador's Sash — Dwelling recruit", () => {
  function withDwelling(seed: string, cardId: string): GameState {
    const state = mapState(seed);
    const player = state.players.p1;
    player.resources.gold = 50;
    player.resources.buildingMaterials = 50;
    player.resources.valuables = 50;
    player.hand = [cardId];
    getTownOfPlayer(state, "p1")!.buildings.push("castle.dwelling_bronze");
    return state;
  }

  it("Diplomat's Ring (recruit option) draws Neutrals per Dwelling and recruits the chosen unit", () => {
    let state = withDwelling("ring-recruit", "artifact.diplomats_ring");
    const armyBefore = state.players.p1.army.length;
    const goldBefore = state.players.p1.resources.gold;

    const play = findPlay(state, "artifact.diplomats_ring", 0);
    expect(play, "the Dwelling recruit option should be offered with a Dwelling").toBeTruthy();
    state = applyOk(state, play!);

    expect(state.players.p1.hand).not.toContain("artifact.diplomats_ring");
    expect(state.eventLog.some((event) => event.type === "DIPLOMACY_NEUTRALS_DRAWN")).toBe(true);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("diplomacy-recruit");

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (state.pendingChoice as { id: string }).id,
      optionIndex: 0
    });

    expect(state.players.p1.army.length).toBe(armyBefore + 1);
    expect(state.players.p1.army.at(-1)!.side).toBe("neutral");
    expect(state.players.p1.resources.gold).toBeLessThan(goldBefore);
  });

  it("Ambassador's Sash exposes the same recruit on option 0", () => {
    let state = withDwelling("sash-recruit", "artifact.ambassadors_sash");
    const play = findPlay(state, "artifact.ambassadors_sash", 0);
    expect(play).toBeTruthy();
    state = applyOk(state, play!);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("diplomacy-recruit");
  });

  it("without a Dwelling the recruit is gated out, but the reroll reaction still fires after a roll", () => {
    const state = mapState("ring-no-dwelling");
    state.players.p1.hand = ["artifact.diplomats_ring"];
    const town = getTownOfPlayer(state, "p1")!;
    town.buildings = town.buildings.filter(
      (id) => id !== "castle.dwelling_bronze" && id !== "castle.dwelling_silver" && id !== "castle.dwelling_gold"
    );

    // No Dwelling → the only card option (recruit) is gated out: no proactive play.
    expect(findPlay(state, "artifact.diplomats_ring", 0)).toBeUndefined();

    // The reroll is independent of the recruit: rolling a Resource die still
    // offers it from hand.
    injectField(state, "resource_symbol");
    beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
    expect(visitChoice(state).options.some((option) => /Diplomat's Ring: reroll the Resource/i.test(option.label))).toBe(
      true
    );
  });
});
