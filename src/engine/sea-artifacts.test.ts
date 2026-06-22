import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, getMainHero } from "./index";
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
    // Top three after the Crown is discarded: stat.defense, stat.power, the Crown.
    expect(labels.length).toBe(3);
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

  it("the paralysis side is offered only at the opening round of a Neutral combat", () => {
    // Sandbox combat (createInitialGameState's default): not a Neutral combat.
    const sandbox = ringState("ring-sandbox");
    expect(
      findPlay(sandbox, "p1", "artifact.ring_of_the_wayfarer", 1),
      "the paralysis side must be hidden outside a Neutral combat"
    ).toBeFalsy();

    // Neutral combat, opening round: offered.
    const round1 = ringState("ring-neutral-1");
    round1.combat!.context = neutralContext();
    expect(
      findPlay(round1, "p1", "artifact.ring_of_the_wayfarer", 1),
      "the paralysis side must appear at the start of a Neutral combat"
    ).toBeTruthy();

    // Neutral combat, but a later round: no longer "at start of Combat".
    const round2 = ringState("ring-neutral-2");
    round2.combat!.context = neutralContext();
    round2.combat!.round = 2;
    expect(
      findPlay(round2, "p1", "artifact.ring_of_the_wayfarer", 1),
      "the paralysis side must be hidden after the opening round"
    ).toBeFalsy();
  });

  it("the paralysis side drops a Paralysis token on a chosen non-Azure unit", () => {
    const state = ringState("ring-paralyse");
    state.combat!.context = neutralContext();
    state.combat!.units.unit_p2_skeletons.grade = "bronze";

    const play = findPlay(state, "p1", "artifact.ring_of_the_wayfarer", 1, "unit_p2_skeletons");
    expect(play, "a bronze enemy should be a legal paralysis target").toBeTruthy();
    expect(hasParalysis(state, "unit_p2_skeletons")).toBe(false);

    const result = applyOk(state, play!);
    expect(hasParalysis(result, "unit_p2_skeletons")).toBe(true);
  });

  it("never offers an Azure unit as a paralysis target (any non-Azure unit is fine)", () => {
    const state = ringState("ring-azure");
    state.combat!.context = neutralContext();
    state.combat!.units.unit_p2_dread_knights.grade = "azure";
    state.combat!.units.unit_p2_skeletons.grade = "bronze";

    // "Any unit except Azure": the Azure unit is filtered out (its grade is
    // above the gradeByPower gate), while a bronze unit remains a legal target.
    expect(
      findPlay(state, "p1", "artifact.ring_of_the_wayfarer", 1, "unit_p2_dread_knights"),
      "an Azure unit must never be offered as a paralysis target"
    ).toBeFalsy();
    expect(findPlay(state, "p1", "artifact.ring_of_the_wayfarer", 1, "unit_p2_skeletons")).toBeTruthy();
  });

  it("offers the paralysis on any unit — including a friendly one (the 'any unit' wording)", () => {
    const state = ringState("ring-any-unit");
    state.combat!.context = neutralContext();
    // A friendly unit is also a legal target under "any unit except Azure".
    expect(
      findPlay(state, "p1", "artifact.ring_of_the_wayfarer", 1, "unit_p1_griffins"),
      "the paralysis side targets any unit, not only enemies"
    ).toBeTruthy();
  });
});
