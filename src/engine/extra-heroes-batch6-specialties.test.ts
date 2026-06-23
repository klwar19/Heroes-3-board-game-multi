import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { beginFieldVisit, getMainHero } from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import type { FactionId } from "@/data/factions/types";
import type { GameAction, GameEvent, GameState, UnitId, VisitStep } from "./state";

// ---------------------------------------------------------------------------
// Additional heroes, batch 6 — the four remaining fan-wiki heroes (minus Tarnum
// Conflux) that complete every playable Town's roster. This file covers the two
// economic specialists; the Rampart/Fortress Tarnum variants live alongside.
//
//   Octavia (Inferno, Demoniac) — "Gold": Resource-die manipulation. I is a
//     REACTION offered the moment a Resource die is rolled — discard it to set a
//     rolled die to "6 gold"; IV/VI roll Resource dice on the map (resolving one
//     of two for VI), each with a combat / draw alternative (NEW
//     RESOURCE_FORTUNE_PLAY + octaviaGoldReactionOption).
//   Melodia (Rampart, Druid) — "Fortune": single-option economic map plays. I
//     gains a positive morale token + gold; IV rolls 2 Resource dice (resolve
//     one) + gold; VI raises the dice rolled & resolved at locations by 1 this
//     turn + gold (NEW LOCATION_DICE_BONUS).
// ---------------------------------------------------------------------------

const assetPath = (src: string) => fileURLToPath(new URL(`../../public${src}`, import.meta.url));

const BATCH6_ECONOMY_HEROES: Array<[string, keyof typeof coreFactionDefinitions]> = [
  ["octavia", "inferno"],
  ["melodia", "rampart"]
];

const SPACE = "50,50";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A clean map turn: p1 active, no leftover morale token (keeps die rolls clean). */
function mapFor(seed: string, heroDefId: string, factionId: FactionId): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "P1", factionId, heroDefId },
      { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  for (const _pl of Object.values(state.players)) {
    _pl.canMulligan = false;
    _pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.players.p1.morale = 0;
  return state;
}

/** Drops a single visitable field under p1's hero so a visit can be driven. */
function injectField(state: GameState, location: string): void {
  state.adventure!.fields[SPACE] = {
    spaceId: SPACE,
    tileInstanceId: "batch6-tile",
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

function visitField(state: GameState, location: string): void {
  injectField(state, location);
  beginFieldVisit(state, getMainHero(state, "p1")!.id, SPACE, false);
}

function visitChoice(state: GameState): Extract<VisitStep, { type: "CHOOSE_ONE" }> | undefined {
  const step = state.adventure!.pendingVisit?.steps[0];
  return step?.type === "CHOOSE_ONE" ? step : undefined;
}

function resolveByLabel(state: GameState, match: (label: string) => boolean): void {
  const step = visitChoice(state);
  if (!step) {
    throw new Error(`Expected a CHOOSE_ONE visit step, got ${state.adventure!.pendingVisit?.steps[0]?.type ?? "none"}`);
  }
  const optionIndex = step.options.findIndex((option) => match(option.label));
  if (optionIndex < 0) {
    throw new Error(`No option matched among: ${step.options.map((option) => option.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
}

function findPlay(state: GameState, cardId: string, optionIndex?: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (unitId === undefined || (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

function totalResources(state: GameState): number {
  const r = state.players.p1.resources;
  return r.gold + r.buildingMaterials + r.valuables;
}

function lastDiceRolled(
  state: GameState,
  dice: "resource" | "treasure"
): Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> =>
        event.type === "ADVENTURE_DICE_ROLLED" && event.dice === dice
    );
}

function lastAttackRolled(
  state: GameState,
  predicate: (event: Extract<GameEvent, { type: "ATTACK_ROLLED" }>) => boolean
): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && predicate(event)
    );
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

const RESOURCE_FACE_AMOUNTS = new Set([1, 2, 3, 4, 6]);

// ===========================================================================
// Roster + art wiring
// ===========================================================================

describe("batch-6 economy heroes are registered with PC-portrait art and implemented specialties", () => {
  it("Octavia and Melodia carry a real PC portrait, NO board scan, and 3 implemented face-less specialties", () => {
    for (const [heroId, factionId] of BATCH6_ECONOMY_HEROES) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, `${heroId} should be defined`).toBeTruthy();
      expect(coreFactionDefinitions[factionId].heroes, `${factionId} roster`).toContain(heroId);
      expect(hero.faction, `${heroId} faction`).toBe(factionId);
      expect(hero.portrait, `${heroId} portrait path`).toMatch(/^\/assets\/hero_portraits-/);
      expect(hero.boardScan, `${heroId} has no board scan`).toBeUndefined();
      expect(existsSync(assetPath(hero.portrait!)), `${heroId} portrait file on disk`).toBe(true);
      for (const level of [1, 4, 6] as const) {
        const card = adventureCards[hero.specialtyCardIds[level]];
        expect(card, `${hero.specialtyCardIds[level]} should exist`).toBeTruthy();
        expect(card.implementationStatus, `${card.id} implemented`).toBe("implemented");
        expect(card.tags, `${card.id} not flagged needs-implementation`).not.toContain("needs-implementation");
        expect(card.assets?.cardImage, `${card.id} omits a missing image`).toBeUndefined();
      }
    }
  });
});

// ===========================================================================
// Octavia (Inferno) — "Gold" Resource-die specialist
// ===========================================================================

describe("Octavia's Gold specialty", () => {
  it("I is a held reaction that sets a rolled Resource die to 6 gold and discards the card", () => {
    // Control: WITHOUT Octavia I in hand, a 1-die Resource field auto-resolves to
    // its rolled face — no set-to-6-gold option, no choice opens.
    const control = mapFor("octavia-1-control", "octavia", "inferno");
    control.players.p1.hand = [];
    visitField(control, "resource_symbol");
    expect(visitChoice(control), "no choice without Octavia I").toBeUndefined();

    // With Octavia I in hand the roll opens a choice that includes "set to 6 gold".
    const state = mapFor("octavia-1", "octavia", "inferno");
    state.players.p1.hand = ["specialty.octavia.1"];
    state.players.p1.resources.gold = 0;
    visitField(state, "resource_symbol");
    const choice = visitChoice(state);
    expect(choice, "a choice opens while Octavia I is held").toBeTruthy();
    expect(
      choice!.options.some((option) => /6 gold/i.test(option.label)),
      "the set-this-die-to-6-gold reaction is offered"
    ).toBe(true);

    resolveByLabel(state, (label) => /set this Resource die to 6 gold/i.test(label));
    expect(state.players.p1.resources.gold, "die set to 6 gold overrides the roll").toBe(6);
    expect(state.players.p1.discard, "Octavia I is discarded when used").toContain("specialty.octavia.1");
    expect(state.players.p1.hand, "Octavia I leaves the hand").not.toContain("specialty.octavia.1");
    expect(state.adventure!.pendingVisit, "the visit completes").toBeNull();
  });

  it("I's other half is a normal 'Draw 1 card' play on the map", () => {
    const state = mapFor("octavia-1-draw", "octavia", "inferno");
    state.players.p1.hand = ["specialty.octavia.1"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    const before = state.players.p1.hand.length;
    const play = findPlay(state, "specialty.octavia.1", 0);
    expect(play, "the Draw 1 option is offered on the map").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.hand.length, "-specialty +1 draw").toBe(before - 1 + 1);
  });

  it("IV option A rolls and resolves 1 Resource die on the map", () => {
    const state = mapFor("octavia-4a", "octavia", "inferno");
    state.players.p1.hand = ["specialty.octavia.4"];
    const before = totalResources(state);
    const play = findPlay(state, "specialty.octavia.4", 0);
    expect(play, "the roll-a-Resource-die option is offered on the map").toBeTruthy();
    const after = applyOk(state, play!.action);
    // A single die auto-resolves: exactly one Resource roll event, and the player
    // gains that face's resources.
    const rolled = lastDiceRolled(after, "resource");
    expect(rolled, "a Resource die was rolled").toBeTruthy();
    expect(rolled!.results.length, "exactly one die").toBe(1);
    const delta = totalResources(after) - before;
    expect(RESOURCE_FACE_AMOUNTS.has(delta), `gained a die face (got ${delta})`).toBe(true);
  });

  it("IV option B adds +1 attack to a declared attack (combat reaction)", () => {
    const state = createInitialGameState("octavia-4b");
    state.players.p1.hand = ["specialty.octavia.4"];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.type = "ground";
    attacker.position = 9;
    attacker.attack = 4;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = new Array(8).fill(0);
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.octavia.4" &&
        legal.action.optionIndex === 1
    );
    expect(reaction, "+1 attack offered on the declared attack").toBeTruthy();
    const settled = passAllReactions(applyOk(declared, reaction!.action));
    expect(
      lastAttackRolled(settled, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus
    ).toBe(1);
  });

  it("VI option A rolls 2 Resource dice and resolves one of them on the map", () => {
    const state = mapFor("octavia-6a", "octavia", "inferno");
    state.players.p1.hand = ["specialty.octavia.6"];
    const before = totalResources(state);
    const play = findPlay(state, "specialty.octavia.6", 0);
    expect(play, "the roll-2-Resource-dice option is offered on the map").toBeTruthy();
    const after = applyOk(state, play!.action);
    const rolled = lastDiceRolled(after, "resource");
    expect(rolled!.results.length, "two dice are rolled").toBe(2);
    // "resolve one of them": a choice with one option per rolled die.
    const choice = visitChoice(after);
    expect(choice, "a resolve-one-of-two choice opens").toBeTruthy();
    expect(choice!.options.length, "one option per rolled die").toBe(2);
    resolveVisitStep(after, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    const delta = totalResources(after) - before;
    expect(RESOURCE_FACE_AMOUNTS.has(delta), `resolved exactly one die (got ${delta})`).toBe(true);
  });

  it("VI option B draws 2 cards", () => {
    const state = mapFor("octavia-6b", "octavia", "inferno");
    state.players.p1.hand = ["specialty.octavia.6"];
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    const before = state.players.p1.hand.length;
    const after = applyOk(state, findPlay(state, "specialty.octavia.6", 1)!.action);
    expect(after.players.p1.hand.length, "-specialty +2 draws").toBe(before - 1 + 2);
  });
});

// ===========================================================================
// Melodia (Rampart) — "Fortune" specialist
// ===========================================================================

describe("Melodia's Fortune specialty", () => {
  it("I gains a positive morale token AND 1 gold on the map", () => {
    const state = mapFor("melodia-1", "melodia", "rampart");
    state.players.p1.hand = ["specialty.melodia.1"];
    state.players.p1.morale = 0;
    state.players.p1.resources.gold = 0;
    const play = findPlay(state, "specialty.melodia.1", 0);
    expect(play, "Fortune I is a map play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.morale, "+1 positive morale").toBe(1);
    expect(after.players.p1.resources.gold, "+1 gold").toBe(1);
  });

  it("IV rolls 2 Resource dice (resolve one) AND gains 1 gold", () => {
    const state = mapFor("melodia-4", "melodia", "rampart");
    state.players.p1.hand = ["specialty.melodia.4"];
    state.players.p1.resources.gold = 0;
    const beforeTotal = totalResources(state);
    const after = applyOk(state, findPlay(state, "specialty.melodia.4", 0)!.action);
    const rolled = lastDiceRolled(after, "resource");
    expect(rolled!.results.length, "two dice are rolled").toBe(2);
    const choice = visitChoice(after);
    expect(choice!.options.length, "resolve exactly one of the two").toBe(2);
    resolveVisitStep(after, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    // Net gain = 1 die face + the flat 1 gold rider.
    const delta = totalResources(after) - beforeTotal;
    expect([...RESOURCE_FACE_AMOUNTS].some((face) => delta === face + 1), `die face + 1 gold (got ${delta})`).toBe(
      true
    );
    expect(after.adventure!.pendingVisit, "the visit completes after resolving").toBeNull();
  });

  it("VI raises the dice rolled & resolved at locations by 1 this turn AND gains 1 gold", () => {
    // Baseline: a Resource-die field rolls exactly one die.
    const baseline = mapFor("melodia-6-base", "melodia", "rampart");
    baseline.players.p1.hand = [];
    visitField(baseline, "resource_symbol");
    expect(lastDiceRolled(baseline, "resource")!.results.length, "1 die without Fortune VI").toBe(1);

    // With Fortune VI played this turn, the same field rolls TWO dice (+1) and the
    // play also gives 1 gold and an active LOCATION_DICE_BONUS effect.
    const state = mapFor("melodia-6", "melodia", "rampart");
    state.players.p1.hand = ["specialty.melodia.6"];
    state.players.p1.resources.gold = 0;
    const after = applyOk(state, findPlay(state, "specialty.melodia.6", 0)!.action);
    expect(after.players.p1.resources.gold, "+1 gold from Fortune VI").toBe(1);
    expect(
      after.activeEffects.some(
        (effect) =>
          effect.scope === "player" &&
          effect.controllerId === "p1" &&
          effect.modifiers.some((modifier) => modifier.type === "LOCATION_DICE_BONUS")
      ),
      "a current-turn location-dice bonus is active"
    ).toBe(true);

    visitField(after, "resource_symbol");
    expect(lastDiceRolled(after, "resource")!.results.length, "Fortune VI rolls +1 die at the location").toBe(2);
  });
});
