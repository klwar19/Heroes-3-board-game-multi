import { describe, expect, it } from "vitest";

import { adventureCards } from "@/data/cards/adventure";
import { coreUnitDefinitions } from "@/data/factions/units";
import { neutralUnitIdsByTier } from "@/data/factions/core";
import { rankScheduleFor } from "@/data/units/experience-rank-abilities";
import { unitSoundKey } from "@/data/unit-sounds";
import { unitShotFxPlan } from "@/data/fx";
import { getActiveDefenseBonus } from "./active-effects";
import { NEUTRAL_DECK_IDS } from "./adventure";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Henrietta's redesigned HALFLINGS specialty (user design 2026-09-23, after the
 * printed Factory cards) and the neutral Grenadiers card it can fetch. Every
 * test asserts the observable engine outcome next to a control the old rule
 * (or a broken gate) would fail.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, optionIndex: number | undefined) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex,
  );
}

const defenseBonus = (state: GameState, unitId: UnitId): number =>
  getActiveDefenseBonus(state, state.combat!.units[unitId]);

/** Round-1 combat, nobody has acted, p1 holds Halflings I and fields the named units. */
function rallyCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  const units = state.combat!.units;
  units.unit_p1_marksmen.name = "Halflings";
  units.unit_p1_marksmen.variant = "neutral"; // a Diplomacy/Halflings-IV recruit
  units.unit_p1_griffins.name = "Grenadiers";
  units.unit_p1_griffins.variant = "pack"; // the Factory roster unit
  units.unit_p1_crusaders.name = "Crusaders"; // control: not a Halfling family unit
  state.players.p1.hand = ["specialty.henrietta.1"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

describe("Henrietta — Halflings I (start of Combat rally)", () => {
  it("+1 Defense to every friendly Halflings/Grenadiers unit, +1 Health only to the NEUTRAL ones", () => {
    const state = rallyCombat("hen-rally");
    const neutralHpBefore = state.combat!.units.unit_p1_marksmen.maxHealth;
    const packHpBefore = state.combat!.units.unit_p1_griffins.maxHealth;
    expect(defenseBonus(state, "unit_p1_marksmen"), "no bonus before the play").toBe(0);

    const play = findPlay(state, "specialty.henrietta.1", 0);
    expect(play, "Halflings I should be playable at the start of Combat").toBeTruthy();
    const after = applyOk(state, play!.action);

    expect(defenseBonus(after, "unit_p1_marksmen"), "neutral Halflings +1 Defense").toBe(1);
    expect(defenseBonus(after, "unit_p1_griffins"), "Factory Grenadiers +1 Defense").toBe(1);
    expect(defenseBonus(after, "unit_p1_crusaders"), "other friendly unit untouched (name gate)").toBe(0);
    expect(defenseBonus(after, "unit_p2_skeletons"), "enemy untouched").toBe(0);

    expect(after.combat!.units.unit_p1_marksmen.maxHealth, "neutral Halflings +1 Health").toBe(neutralHpBefore + 1);
    expect(after.combat!.units.unit_p1_griffins.maxHealth, "faction Grenadiers get NO Health").toBe(packHpBefore);
    // The card is an ongoing play: it leaves the hand and its effect is bound to it.
    expect(after.players.p1.hand).not.toContain("specialty.henrietta.1");
  });

  it("is only offered while the start-of-Combat window is open (closes once a unit has acted)", () => {
    const state = rallyCombat("hen-rally-late");
    expect(findPlay(state, "specialty.henrietta.1", 0), "open window").toBeTruthy();
    state.combat!.units.unit_p2_skeletons.activatedThisRound = true;
    expect(findPlay(state, "specialty.henrietta.1", 0), "window closed after an activation").toBeUndefined();
  });

  it("the printed card is the ongoing rally (no more attack/defense reaction), drawn natively", () => {
    const card = adventureCards["specialty.henrietta.1"];
    expect(card.name).toBe("Halflings I");
    expect(card.timing).toBe("ongoing");
    expect(card.effect.type === "CHOOSE_ONE" && card.effect.options).toHaveLength(1);
    const option = card.effect.type === "CHOOSE_ONE" ? card.effect.options[0] : undefined;
    expect(option?.combatStartOnly).toBe(true);
    expect(option?.effect).toMatchObject({
      type: "HALFLINGS_RALLY",
      unitNames: ["Halflings", "Grenadiers"],
      defense: 1,
      neutralHealth: 1,
    });
    expect(card.assets?.cardImage, "keeps the native Factory symbol render").toBeUndefined();
  });
});

/** A map turn: p1 active, holding `cardId`, with a scripted bronze Neutral deck. */
function searchMap(seed: string, drawPile: string[], discardPile: string[]): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.hand = ["specialty.henrietta.4"];
  state.players.p1.resources = { gold: 7, buildingMaterials: 7, valuables: 7 };
  const bronze = state.decks[NEUTRAL_DECK_IDS.bronze]!;
  bronze.drawPile = [...drawPile];
  bronze.discardPile = [...discardPile];
  return state;
}

describe("Henrietta — Halflings IV (Global search + free recruit)", () => {
  it("finds Halflings/Grenadiers in BOTH the bronze deck and its discard, recruits one free, then shuffles the deck", () => {
    const state = searchMap(
      "hen-search",
      ["neutral.cerberi", "neutral.halflings", "neutral.familiars", "neutral.boars"],
      ["neutral.grenadiers"],
    );
    const armyBefore = state.players.p1.army.length;
    const resourcesBefore = { ...state.players.p1.resources };

    const play = findPlay(state, "specialty.henrietta.4", 0); // option 0 = the Global search
    expect(play, "the Global side should be offered on the map").toBeTruthy();
    const opened = applyOk(state, play!.action);

    const step = opened.adventure!.pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    const labels = step?.type === "CHOOSE_ONE" ? step.options.map((option) => option.label) : [];
    expect(labels.filter((label) => label.startsWith("Recruit Halflings"))).toHaveLength(1);
    expect(labels.filter((label) => label.startsWith("Recruit Grenadiers"))).toHaveLength(1);
    expect(labels.some((label) => label.includes("Cerberi") || label.includes("Boars")), "only the Halfling family is searchable").toBe(false);

    // Take the Grenadiers copy that sits in the DISCARD pile.
    const grenadiersIndex = labels.findIndex((label) => label.startsWith("Recruit Grenadiers"));
    const recruited = applyOk(opened, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: grenadiersIndex });

    expect(recruited.players.p1.army).toHaveLength(armyBefore + 1);
    expect(recruited.players.p1.army.at(-1)).toMatchObject({ unitDefId: "neutral.grenadiers", side: "neutral" });
    expect(recruited.players.p1.resources, "recruited for free").toEqual(resourcesBefore);
    const bronze = recruited.decks[NEUTRAL_DECK_IDS.bronze]!;
    expect(bronze.discardPile, "the copy left the discard").toEqual([]);
    // The searched draw pile keeps the same cards (nothing taken from it) but was shuffled.
    expect([...bronze.drawPile].sort()).toEqual(["neutral.boars", "neutral.cerberi", "neutral.familiars", "neutral.halflings"]);
    expect(bronze.drawPile).not.toEqual(["neutral.cerberi", "neutral.halflings", "neutral.familiars", "neutral.boars"]);
    expect(recruited.adventure!.pendingVisit, "the visit resolved").toBeFalsy();
  });

  it("recruiting from the draw pile removes exactly that copy; declining recruits nothing but still shuffles", () => {
    const state = searchMap("hen-search-deck", ["neutral.halflings", "neutral.cerberi", "neutral.halflings"], []);
    const opened = applyOk(state, findPlay(state, "specialty.henrietta.4", 0)!.action);
    const step = opened.adventure!.pendingVisit!.steps[0];
    const labels = step.type === "CHOOSE_ONE" ? step.options.map((option) => option.label) : [];
    expect(labels.filter((label) => label.startsWith("Recruit Halflings")), "duplicates collapse to one offer").toHaveLength(1);

    const taken = applyOk(opened, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(taken.players.p1.army.at(-1)!.unitDefId).toBe("neutral.halflings");
    expect([...taken.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile].sort()).toEqual(["neutral.cerberi", "neutral.halflings"]);

    const declineState = searchMap("hen-search-decline", ["neutral.halflings", "neutral.cerberi", "neutral.boars"], []);
    const armyBefore = declineState.players.p1.army.length;
    const declineOpened = applyOk(declineState, findPlay(declineState, "specialty.henrietta.4", 0)!.action);
    const declineStep = declineOpened.adventure!.pendingVisit!.steps[0];
    const declineIndex = declineStep.type === "CHOOSE_ONE" ? declineStep.options.length - 1 : -1;
    const declined = applyOk(declineOpened, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: declineIndex });
    expect(declined.players.p1.army).toHaveLength(armyBefore);
    expect([...declined.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile].sort()).toEqual(["neutral.boars", "neutral.cerberi", "neutral.halflings"]);
  });

  it("is NOT offered when no Halfling/Grenadier is in the bronze deck or discard (control), and keeps its +2 Defense reaction", () => {
    const state = searchMap("hen-search-none", ["neutral.cerberi", "neutral.boars"], ["neutral.familiars"]);
    expect(findPlay(state, "specialty.henrietta.4", 0)).toBeUndefined();
    const card = adventureCards["specialty.henrietta.4"];
    const reaction = card.effect.type === "CHOOSE_ONE" ? card.effect.options[1] : undefined;
    expect(reaction?.trigger).toEqual({ event: "UNIT_ATTACK_DECLARED", controller: "opponent" });
    expect(reaction?.effect).toEqual({ type: "ADD_COMBAT_STAT", stat: "defense", amount: 2 });
    expect(card.assets?.cardImage, "keeps the native Factory symbol render").toBeUndefined();
  });
});

describe("Neutral Grenadiers — the bronze Neutral twin of the Factory Grenadiers Pack", () => {
  it("copies the Pack's stats and abilities with +1 Initiative and its own art, and joins the bronze Neutral deck", () => {
    const pack = coreUnitDefinitions["factory.halflings"].pack!;
    const neutral = coreUnitDefinitions["neutral.grenadiers"].neutral!;
    expect(coreUnitDefinitions["neutral.grenadiers"].name).toBe("Grenadiers");
    expect(coreUnitDefinitions["neutral.grenadiers"].tier).toBe("bronze");
    expect(coreUnitDefinitions["neutral.grenadiers"].type).toBe("ranged");
    expect({ attack: neutral.attack, defense: neutral.defense, health: neutral.health }).toEqual({
      attack: pack.attack,
      defense: pack.defense,
      health: pack.health,
    });
    expect(neutral.initiative).toBe(pack.initiative + 1);
    expect(neutral.abilities).toEqual(pack.abilities);
    expect(neutral.cardImage).toBe("/assets/units-neutral-bronze-grenadiers.webp");
    expect(neutral.cardImage).not.toBe(pack.cardImage);
    expect(neutralUnitIdsByTier.bronze).toContain("neutral.grenadiers");
    // Fresh decks actually hold one copy.
    const state = createAdventureGameState({ seed: "grenadier-deck", difficulty: "normal", rollFirstPlayer: false });
    expect(state.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile.filter((id) => id === "neutral.grenadiers")).toHaveLength(1);
  });

  it("has a veteran rank ladder, a voice and a shot effect like every other neutral shooter", () => {
    const rank3 = rankScheduleFor("neutral.grenadiers")[3];
    expect(rank3.kind).toBe("ability");
    expect(rank3.kind === "ability" && rank3.choices).toContain("factory-grenadier-high-roll");
    expect(unitSoundKey("neutral.grenadiers", "shoot")).toBe(unitSoundKey("neutral.halflings", "shoot"));
    expect(unitShotFxPlan("neutral.grenadiers")).toEqual(unitShotFxPlan("neutral.halflings"));
  });
});
