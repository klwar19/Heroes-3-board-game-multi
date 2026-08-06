import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, getMainHero } from "./index";
import { maybeOpenWayfarerParalysisDecision, resolveWayfarerParalysisChoice } from "./adventure-reducer";
import type { CombatContext, GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Engine coverage for two sea-themed artifacts imported from the fan wiki. Each
 * rule is engine-enforced and every test fails if the wiring is removed.
 *
 *  - Crown of the Five Seas (Major): take a Spell from your discard pile — OR —
 *    "If this Hero is on a Sea tile" look at the top 3 of your discard and take
 *    1 (gated by the playing Hero standing on a water-terrain field).
 *  - Ring of the Wayfarer (Minor): for this Combat a chosen friendly unit gains
 *    +1 initiative — OR — at the start of a Combat with Neutral Units, place a
 *    Paralysis token on any unit except Azure.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number,
  targetUnitId?: UnitId
): Extract<GameAction, { type: "PLAY_CARD" }> | undefined {
  for (const entry of getLegalActions(state, playerId)) {
    const action = entry.action;
    if (action.type !== "PLAY_CARD" || action.cardId !== cardId || action.optionIndex !== optionIndex) {
      continue;
    }
    if (targetUnitId !== undefined && !(action.target?.type === "unit" && action.target.unitId === targetUnitId)) {
      continue;
    }
    return action;
  }
  return undefined;
}

function choiceLabels(state: GameState): string[] {
  const choice = state.pendingChoice;
  return choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
}

function hasParalysis(state: GameState, unitId: UnitId): boolean {
  return (state.combat?.units[unitId]?.tokens ?? []).some((token) => token.kind === "paralysis");
}

// ---------------------------------------------------------------------------
// Crown of the Five Seas (Major artifact, map play)
// ---------------------------------------------------------------------------

describe("Crown of the Five Seas", () => {
  function crownState(seed: string): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    state.players.p1.hand = ["artifact.crown_of_the_five_seas"];
    return state;
  }

  /** Puts the player's main Hero on (or off) a Sea (water-terrain) field. */
  function setHeroSeaTile(state: GameState, onSea: boolean): void {
    const hero = getMainHero(state, "p1");
    if (!hero?.spaceId || !state.adventure?.fields[hero.spaceId]) {
      throw new Error("Expected the main hero to stand on a known field.");
    }
    if (onSea) {
      state.adventure.fields[hero.spaceId].terrain = "water";
    } else {
      delete state.adventure.fields[hero.spaceId].terrain;
    }
  }

  it("the Spell side returns a Spell from anywhere in the discard pile", () => {
    const state = crownState("crown-spell");
    // Only the Spell is a candidate; the two Statistic cards are filtered out.
    state.players.p1.discard = ["stat.attack", "stat.defense", "spell.haste"];

    const play = findPlay(state, "p1", "artifact.crown_of_the_five_seas", 0);
    expect(play, "the Spell-from-discard side should be offered").toBeTruthy();

    const opened = applyOk(state, play!);
    expect(opened.pendingChoice?.type).toBe("OPTION_CHOICE");
    const labels = choiceLabels(opened);
    // Spell Book (house rule, default ON) adds a second "→ Spell Book" option for
    // the Spell candidate alongside the "to hand" one; both name Haste.
    expect(labels.length).toBe(2);
    expect(labels.every((label) => label.includes("Haste"))).toBe(true);
    expect(labels.some((label) => label.includes("Spell Book"))).toBe(true);

    // optionIndex 0 is the "to hand" route.
    const took = applyOk(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 0
    });
    expect(took.players.p1.hand).toContain("spell.haste");
    // The Crown itself went to the discard pile on play.
    expect(took.players.p1.discard).toContain("artifact.crown_of_the_five_seas");
  });

  it("the Sea side is offered only while the Hero stands on a Sea tile", () => {
    const offSea = crownState("crown-offsea");
    offSea.players.p1.discard = ["spell.haste", "stat.attack", "stat.defense"];
    setHeroSeaTile(offSea, false);
    expect(
      findPlay(offSea, "p1", "artifact.crown_of_the_five_seas", 1),
      "the Sea side must be hidden when the Hero is not on a Sea tile"
    ).toBeFalsy();
    // The Spell side is still available off the sea.
    expect(findPlay(offSea, "p1", "artifact.crown_of_the_five_seas", 0)).toBeTruthy();

    const onSea = crownState("crown-onsea");
    onSea.players.p1.discard = ["spell.haste", "stat.attack", "stat.defense"];
    setHeroSeaTile(onSea, true);
    expect(
      findPlay(onSea, "p1", "artifact.crown_of_the_five_seas", 1),
      "the Sea side must appear once the Hero is on a Sea tile"
    ).toBeTruthy();
  });

  it("the Sea side looks at only the top 3 cards of the discard pile", () => {
    const state = crownState("crown-top3");
    setHeroSeaTile(state, true);
    // bottom → top. Only the top three (plus the Crown placed on top on play)
    // are eligible; the two buried Spells must not appear as candidates.
    state.players.p1.discard = ["spell.haste", "spell.bless", "stat.attack", "stat.defense", "stat.power"];

    const play = findPlay(state, "p1", "artifact.crown_of_the_five_seas", 1);
    expect(play, "the Sea side should be offered on a Sea tile with cards in discard").toBeTruthy();

    const opened = applyOk(state, play!);
    const labels = choiceLabels(opened);
    // Top three counted from the pile as it stands (Crown on top): the Crown,
    // stat.power, stat.defense — but since the 2026-08 instant-lifecycle batch
    // a played card can never pick ITSELF out of its own window (the Scholar
    // self-exclusion rule, instant-card-gain-legality.test.ts), so two
    // candidates remain.
    expect(labels.length).toBe(2);
    expect(labels.some((label) => label.includes("Crown"))).toBe(false);
    expect(labels.some((label) => label.includes("Haste"))).toBe(false);
    expect(labels.some((label) => label.includes("Bless"))).toBe(false);

    const took = applyOk(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 0
    });
    // One of the top-three cards landed in hand (never a buried Spell).
    expect(took.players.p1.hand.length).toBe(1);
    expect(took.players.p1.hand[0]).not.toBe("spell.haste");
    expect(took.players.p1.hand[0]).not.toBe("spell.bless");
  });
});

// ---------------------------------------------------------------------------
// Ring of the Wayfarer (Minor artifact, combat play)
// ---------------------------------------------------------------------------

describe("Ring of the Wayfarer", () => {
  function neutralContext(): CombatContext {
    return { kind: "neutral", heroId: "hero_p1", fieldId: "h:8:2", difficulty: 1, hasAzure: false };
  }

  function ringState(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["artifact.ring_of_the_wayfarer"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  it("the initiative side buffs a chosen friendly unit for the combat", () => {
    const state = ringState("ring-initiative");
    const play = findPlay(state, "p1", "artifact.ring_of_the_wayfarer", 0, "unit_p1_griffins");
    expect(play, "the +1 initiative side should target a friendly unit").toBeTruthy();

    const result = applyOk(state, play!);
    const buff = result.activeEffects.find(
      (effect) =>
        effect.name === "Ring of the Wayfarer" &&
        effect.target?.type === "unit" &&
        effect.target.unitId === "unit_p1_griffins"
    );
    expect(buff, "an initiative buff should sit on the chosen friendly unit").toBeTruthy();
  });

  it("the paralysis side is NOT played from hand — it is a dedicated start-of-combat decision", () => {
    // Even in a Neutral combat's opening round, the paralysis side must not be a
    // hand play: a hand play could only fire mid-round-1, after a faster guard had
    // already acted. It is offered as a start-of-combat decision instead (below).
    const round1 = ringState("ring-neutral-1");
    round1.combat!.context = neutralContext();
    expect(
      findPlay(round1, "p1", "artifact.ring_of_the_wayfarer", 1),
      "the paralysis side must never be a hand play"
    ).toBeFalsy();
    // The initiative side (option 0) is still a normal hand play.
    expect(
      findPlay(round1, "p1", "artifact.ring_of_the_wayfarer", 0),
      "the +1 initiative side stays a hand play"
    ).toBeTruthy();
  });

  it("the start-of-combat decision paralyses the CHOSEN non-Azure unit and discards the Ring", () => {
    const state = ringState("ring-paralyse");
    state.combat!.context = neutralContext();
    state.combat!.attackerPlayerId = "p1";
    state.combat!.units.unit_p2_skeletons.grade = "bronze";

    // The decision opens at combat start (a Neutral fight, Ring in hand).
    expect(maybeOpenWayfarerParalysisDecision(state)).toBe(true);
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("wayfarer-paralysis");
    if (choice?.type !== "OPTION_CHOICE" || !choice.wayfarerParalysis) {
      return;
    }
    // The bronze enemy is among the offered targets; a "keep" option trails them.
    const targetIndex = choice.wayfarerParalysis.unitIds.indexOf("unit_p2_skeletons");
    expect(targetIndex, "a bronze enemy is a legal paralysis target").toBeGreaterThanOrEqual(0);
    expect(choiceLabels(state).at(-1)).toMatch(/keep/i);
    expect(hasParalysis(state, "unit_p2_skeletons")).toBe(false);

    resolveWayfarerParalysisChoice(state, "p1", targetIndex);
    // The chosen unit is paralysed, the Ring is spent, and combat proceeds.
    expect(hasParalysis(state, "unit_p2_skeletons")).toBe(true);
    expect(state.players.p1.hand).not.toContain("artifact.ring_of_the_wayfarer");
    expect(state.players.p1.discard).toContain("artifact.ring_of_the_wayfarer");
    expect(state.pendingChoice).toBeNull();
  });

  it("never offers an Azure unit as a target (any OTHER unit, incl. a friendly one, is fine)", () => {
    const state = ringState("ring-azure");
    state.combat!.context = neutralContext();
    state.combat!.attackerPlayerId = "p1";
    state.combat!.units.unit_p2_dread_knights.grade = "azure";
    state.combat!.units.unit_p2_skeletons.grade = "bronze";
    state.combat!.units.unit_p1_griffins.grade = "bronze";

    expect(maybeOpenWayfarerParalysisDecision(state)).toBe(true);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || !choice.wayfarerParalysis) {
      throw new Error("expected the wayfarer-paralysis decision");
    }
    const offered = choice.wayfarerParalysis.unitIds;
    // "Any unit except Azure": the Azure unit is excluded; a bronze enemy AND a
    // friendly bronze unit are both offered.
    expect(offered).not.toContain("unit_p2_dread_knights");
    expect(offered).toContain("unit_p2_skeletons");
    expect(offered).toContain("unit_p1_griffins");
  });

  it("keeping the Ring paralyses nothing and leaves the card in hand", () => {
    const state = ringState("ring-keep");
    state.combat!.context = neutralContext();
    state.combat!.attackerPlayerId = "p1";
    state.combat!.units.unit_p2_skeletons.grade = "bronze";

    expect(maybeOpenWayfarerParalysisDecision(state)).toBe(true);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || !choice.wayfarerParalysis) {
      throw new Error("expected the wayfarer-paralysis decision");
    }
    // The trailing option is "keep" (index === number of unit targets).
    const keepIndex = choice.wayfarerParalysis.unitIds.length;
    resolveWayfarerParalysisChoice(state, "p1", keepIndex);

    expect(hasParalysis(state, "unit_p2_skeletons")).toBe(false);
    expect(state.players.p1.hand).toContain("artifact.ring_of_the_wayfarer");
    expect(state.players.p1.discard).not.toContain("artifact.ring_of_the_wayfarer");
    expect(state.pendingChoice).toBeNull();
  });

  it("CONTROL: without the Ring in hand, no start-of-combat decision opens", () => {
    const state = ringState("ring-none");
    state.players.p1.hand = [];
    state.combat!.context = neutralContext();
    state.combat!.attackerPlayerId = "p1";
    expect(maybeOpenWayfarerParalysisDecision(state)).toBe(false);
    expect(state.pendingChoice).toBeNull();
  });
});
