import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { beginFieldVisit, getMainHero, getTownOfPlayer } from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { artifactDeckBinhMajor, artifactDeckLegacy, REROLL_REACTION_ARTIFACT_IDS } from "@/data/cards/artifacts";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameState, VisitStep } from "./state";

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
    // Every Resource-die face is offered as a "set" option.
    expect(step.options.some((option) => /set the Resource die to 6 gold/i.test(option.label))).toBe(true);
    expect(step.options.some((option) => /set the Resource die to 2 valuables/i.test(option.label))).toBe(true);
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
