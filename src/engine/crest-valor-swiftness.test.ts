import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, getMainHero } from "./index";
import { consumeIgnoreFieldNegativeMorale, effectiveInitiative, makeActiveEffect } from "./active-effects";
import { processPendingVisit } from "./adventure";
import type { ActiveEffectDefinition, GameAction, GameState, PlayerId, SourceRef, UnitId } from "./state";

/**
 * Engine coverage for two minor artifacts imported from the fan wiki. Every
 * rule is engine-enforced and each test fails if the wiring is removed.
 *
 *  - Crest of Valor (Fortress) — gain a positive morale token — OR — (map)
 *    ignore the negative morale a Field would hand you.
 *  - Necklace of Swiftness (Stretch Goals 2024) — this Combat your GROUND units
 *    gain +1 initiative — OR — move one of your units 1 space.
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

// ---------------------------------------------------------------------------
// Crest of Valor (Minor artifact)
// ---------------------------------------------------------------------------

describe("Crest of Valor", () => {
  function valorAdventure(seed: string): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    // p1 is Castle (does not ignore morale); start neutral so changes show.
    state.players.p1.morale = 0;
    state.players.p1.hand = ["artifact.crest_of_valor"];
    return state;
  }

  /** A Field's negative-morale token (the Grave's GAIN_MORALE -1 step). */
  function queueFieldMorale(state: GameState, amount: number): void {
    const hero = getMainHero(state, "p1");
    const fieldId = hero?.spaceId;
    if (!state.adventure || !fieldId) {
      throw new Error("Expected the main hero to stand on a known field.");
    }
    state.adventure.pendingVisit = {
      heroId: hero!.id,
      playerId: "p1",
      fieldId,
      steps: [{ type: "GAIN_MORALE", amount }]
    };
  }

  it("the morale side gains a positive morale token", () => {
    const state = valorAdventure("valor-morale");
    const play = findPlay(state, "p1", "artifact.crest_of_valor", 0);
    expect(play, "the gain-morale side should be offered").toBeTruthy();

    const result = applyOk(state, play!);
    expect(result.players.p1.morale).toBe(1);
    expect(result.players.p1.discard).toContain("artifact.crest_of_valor");
  });

  it("the ignore side is a map play and arms a one-turn shield", () => {
    const state = valorAdventure("valor-shield");
    const play = findPlay(state, "p1", "artifact.crest_of_valor", 1);
    expect(play, "the ignore-field-morale side should be offered on the map").toBeTruthy();

    const result = applyOk(state, play!);
    const shield = result.activeEffects.find(
      (effect) =>
        effect.controllerId === "p1" &&
        effect.modifiers.some((modifier) => modifier.type === "IGNORE_FIELD_NEGATIVE_MORALE")
    );
    expect(shield, "playing the map side should arm the ignore-morale shield").toBeTruthy();
    expect(shield?.duration.type).toBe("current-turn");
  });

  it("the ignore side is never offered during combat (it is a map effect)", () => {
    const combat = createInitialGameState("valor-combat");
    combat.players.p1.hand = ["artifact.crest_of_valor"];
    combat.activePlayerId = "p1";
    expect(
      findPlay(combat, "p1", "artifact.crest_of_valor", 1),
      "the map ignore side must not appear during combat"
    ).toBeFalsy();
    // The morale side is still usable in combat (like Glyph of Gallantry).
    expect(findPlay(combat, "p1", "artifact.crest_of_valor", 0)).toBeTruthy();
  });

  it("without the shield, a Field's negative morale lowers morale (baseline)", () => {
    const state = valorAdventure("valor-baseline");
    queueFieldMorale(state, -1);
    processPendingVisit(state);
    expect(state.players.p1.morale).toBe(-1);
  });

  it("with the shield, a Field's negative morale is ignored and the shield is spent", () => {
    const state = valorAdventure("valor-ignore");
    const play = findPlay(state, "p1", "artifact.crest_of_valor", 1);
    const armed = applyOk(state, play!);
    expect(armed.players.p1.morale).toBe(0);

    queueFieldMorale(armed, -1);
    processPendingVisit(armed);

    // The wiring under test: the negative token is ignored, morale stays put,
    // the shield is consumed, and the log records the ignore.
    expect(armed.players.p1.morale).toBe(0);
    expect(
      armed.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "IGNORE_FIELD_NEGATIVE_MORALE")
      )
    ).toBe(false);
    expect(armed.eventLog.some((event) => event.type === "FIELD_MORALE_IGNORED")).toBe(true);
  });

  it("the shield blocks only a single field token and never a positive one", () => {
    // Positive field morale is untouched by the shield.
    const positive = valorAdventure("valor-positive");
    positive.activeEffects.push(
      makeActiveEffect(
        positive,
        {
          name: "Crest of Valor",
          scope: "player",
          duration: { type: "current-turn" },
          polarity: "positive",
          modifiers: [{ type: "IGNORE_FIELD_NEGATIVE_MORALE" }]
        },
        { type: "card", cardId: "artifact.crest_of_valor", controllerId: "p1" } satisfies SourceRef,
        "p1"
      )
    );
    queueFieldMorale(positive, 1);
    processPendingVisit(positive);
    expect(positive.players.p1.morale).toBe(1);
    // The shield is still armed — a positive token never spends it.
    expect(
      positive.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "IGNORE_FIELD_NEGATIVE_MORALE")
      )
    ).toBe(true);

    // A single shield negates one token only; the consumer returns false after.
    expect(consumeIgnoreFieldNegativeMorale(positive, "p1")).toBe(true);
    expect(consumeIgnoreFieldNegativeMorale(positive, "p1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Necklace of Swiftness (Minor artifact)
// ---------------------------------------------------------------------------

describe("Necklace of Swiftness", () => {
  function swiftnessState(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["artifact.necklace_of_swiftness"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_crusaders";
    return state;
  }

  /** The ground-initiative ActiveEffectDefinition straight off the real card. */
  function groundInitiativeEffect(): ActiveEffectDefinition {
    const effect = cardLibrary["artifact.necklace_of_swiftness"]?.effect;
    if (effect?.type !== "CHOOSE_ONE") {
      throw new Error("Necklace of Swiftness should be a CHOOSE_ONE card");
    }
    const option = effect.options[0]?.effect;
    if (option?.type !== "CREATE_ACTIVE_EFFECT") {
      throw new Error("Option 0 should create an active effect");
    }
    return option.effect;
  }

  it("option 0 carries a GROUND_INITIATIVE_BONUS of +1", () => {
    const ground = groundInitiativeEffect();
    expect(ground.scope).toBe("player");
    expect(ground.duration.type).toBe("combat");
    const modifier = ground.modifiers.find((entry) => entry.type === "GROUND_INITIATIVE_BONUS");
    expect(modifier?.type === "GROUND_INITIATIVE_BONUS" && modifier.amount).toBe(1);
  });

  it("effectiveInitiative raises only the player's GROUND units (direct wiring)", () => {
    const state = createInitialGameState("swift-initiative-unit");
    const ground = state.combat!.units.unit_p1_crusaders;
    const ranged = state.combat!.units.unit_p1_marksmen;
    const flying = state.combat!.units.unit_p1_griffins;
    const enemyGround = state.combat!.units.unit_p2_skeletons;
    ground.type = "ground";
    ranged.type = "ranged";
    flying.type = "flying";
    enemyGround.type = "ground";

    const baseGround = ground.initiative;
    const baseRanged = ranged.initiative;
    const baseFlying = flying.initiative;
    const baseEnemy = enemyGround.initiative;

    state.activeEffects.push(
      makeActiveEffect(
        state,
        groundInitiativeEffect(),
        { type: "card", cardId: "artifact.necklace_of_swiftness", controllerId: "p1" } satisfies SourceRef,
        "p1"
      )
    );

    expect(effectiveInitiative(ground, state.activeEffects)).toBe(baseGround + 1);
    expect(effectiveInitiative(ranged, state.activeEffects)).toBe(baseRanged);
    expect(effectiveInitiative(flying, state.activeEffects)).toBe(baseFlying);
    // Player-scoped: the enemy's ground unit is untouched.
    expect(effectiveInitiative(enemyGround, state.activeEffects)).toBe(baseEnemy);
  });

  it("playing option 0 buffs the player's ground units for the combat", () => {
    const state = swiftnessState("swift-initiative-play");
    state.combat!.units.unit_p1_crusaders.type = "ground";
    state.combat!.units.unit_p1_griffins.type = "flying";
    const groundBase = state.combat!.units.unit_p1_crusaders.initiative;
    const flyingBase = state.combat!.units.unit_p1_griffins.initiative;

    const play = findPlay(state, "p1", "artifact.necklace_of_swiftness", 0);
    expect(play, "the ground-initiative side should be offered in combat").toBeTruthy();

    const result = applyOk(state, play!);
    const buff = result.activeEffects.find(
      (effect) =>
        effect.name === "Necklace of Swiftness" &&
        effect.scope === "player" &&
        effect.controllerId === "p1" &&
        effect.modifiers.some((modifier) => modifier.type === "GROUND_INITIATIVE_BONUS")
    );
    expect(buff, "a player-scoped ground-initiative buff should be created").toBeTruthy();
    expect(effectiveInitiative(result.combat!.units.unit_p1_crusaders, result.activeEffects)).toBe(groundBase + 1);
    expect(effectiveInitiative(result.combat!.units.unit_p1_griffins, result.activeEffects)).toBe(flyingBase);
  });

  it("neither side is offered on the adventure map (both are combat-only)", () => {
    const adventure = createAdventureGameState({ seed: "swift-map", difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(adventure.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    adventure.activePlayerId = "p1";
    adventure.players.p1.hand = ["artifact.necklace_of_swiftness"];
    expect(findPlay(adventure, "p1", "artifact.necklace_of_swiftness", 0)).toBeFalsy();
    expect(findPlay(adventure, "p1", "artifact.necklace_of_swiftness", 1)).toBeFalsy();
  });

  it("the move side relocates a chosen unit to an empty adjacent space", () => {
    const state = swiftnessState("swift-move");
    // Marksmen sit at B1 (position 1); A1 (0) and C1 (2) are empty, B2 (5)
    // holds the Griffins, so only A1 and C1 are legal destinations.
    expect(state.combat!.units.unit_p1_marksmen.position).toBe(1);

    const play = findPlay(state, "p1", "artifact.necklace_of_swiftness", 1, "unit_p1_marksmen");
    expect(play, "the move side should target a friendly unit").toBeTruthy();

    const opened = applyOk(state, play!);
    expect(opened.pendingChoice?.type).toBe("OPTION_CHOICE");
    const labels = choiceLabels(opened);
    expect(labels).toContain("Move to A1");
    expect(labels).toContain("Move to C1");
    // The occupied neighbour (B2, the Griffins) is never offered.
    expect(labels.some((label) => label.includes("B2"))).toBe(false);

    const moved = applyOk(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: labels.indexOf("Move to A1")
    });
    expect(moved.combat!.units.unit_p1_marksmen.position).toBe(0);
    expect(
      moved.eventLog.some(
        (event) => event.type === "UNIT_MOVED" && event.unitId === "unit_p1_marksmen" && event.to === 0
      )
    ).toBe(true);
    expect(moved.pendingChoice).toBeNull();
  });

  it("the move side never offers a unit hemmed in with no empty neighbour", () => {
    const state = swiftnessState("swift-hemmed");
    const combat = state.combat!;
    // Box the Crusaders into the A1 corner (position 0): Marksmen to its right
    // (1) and Griffins below (4) leave it with no empty orthogonal neighbour.
    combat.units.unit_p1_crusaders.position = 0;
    combat.units.unit_p1_marksmen.position = 1;
    combat.units.unit_p1_griffins.position = 4;

    expect(
      findPlay(state, "p1", "artifact.necklace_of_swiftness", 1, "unit_p1_crusaders"),
      "a unit with no empty neighbour must not be a move target"
    ).toBeFalsy();
    // The Marksmen at B1 still have empty neighbours (C1, B2), so they qualify.
    expect(findPlay(state, "p1", "artifact.necklace_of_swiftness", 1, "unit_p1_marksmen")).toBeTruthy();
  });

  it("the move side cannot target an enemy unit", () => {
    const state = swiftnessState("swift-enemy");
    expect(
      findPlay(state, "p1", "artifact.necklace_of_swiftness", 1, "unit_p2_skeletons"),
      "Move one of YOUR units — enemies are never targets"
    ).toBeFalsy();
  });
});
