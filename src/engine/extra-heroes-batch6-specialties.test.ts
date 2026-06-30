import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  effectiveInitiative,
  getLegalActions
} from "./index";
import { beginFieldVisit, getMainHero, placeCreatureBank } from "./adventure";
import { finalizeAdventureCombat, resolveVisitStep, startNeutralEncounter } from "./adventure-reducer";
import { finishCombatIfNeeded } from "./combat-units";
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

const BATCH6_HEROES: Array<[string, keyof typeof coreFactionDefinitions]> = [
  ["octavia", "inferno"],
  ["melodia", "rampart"],
  ["tarnum_fortress", "fortress"],
  ["tarnum_rampart", "rampart"]
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

describe("batch-6 heroes are registered with PC-portrait art and implemented specialties", () => {
  it("each carries a real PC portrait, NO board scan, and 3 implemented face-less specialties", () => {
    for (const [heroId, factionId] of BATCH6_HEROES) {
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

// ===========================================================================
// Tarnum (Fortress) — "Basilisks": creature buffs + force-ability VI
// ===========================================================================

function hasParalysis(state: GameState, unitId: UnitId): boolean {
  return (state.combat?.units[unitId].tokens ?? []).some((token) => token.kind === "paralysis");
}

describe("Tarnum (Fortress)'s Basilisks specialty", () => {
  it("is the Beastmaster variant, distinct from the other Tarnums", () => {
    expect(coreHeroDefinitions.tarnum_fortress.name).toBe("Tarnum");
    expect(coreHeroDefinitions.tarnum_fortress.class).toBe("Beastmaster");
    expect(coreHeroDefinitions.tarnum_fortress.faction).toBe("fortress");
    expect(coreHeroDefinitions.tarnum_fortress.portrait).toBe("/assets/hero_portraits-tarnum_beastmaster.webp");
  });

  /**
   * p1's attacker (renamed `attackerName`, abilities `attackerAbilities`) strikes
   * p2's skeletons; the Attack die is scripted to `scriptedFace`. p1 may play
   * `cardId` (a reaction) into the declared attack. Both survive (40 HP).
   */
  function basiliskAttack(
    seed: string,
    cardId: string | null,
    opts: { attackerName?: string; attackerAbilities?: string[]; scriptedFace?: number; optionIndex?: number } = {}
  ) {
    const state = createInitialGameState(seed);
    state.players.p1.hand = cardId ? [cardId] : [];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = opts.attackerAbilities ?? ["fortress-basilisk-paralysis"];
    attacker.name = opts.attackerName ?? "Basilisks";
    attacker.type = "ground";
    attacker.position = 9;
    attacker.attack = 4;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.attack = 3;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = new Array(8).fill(opts.scriptedFace ?? 0);
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    if (!cardId) {
      return passAllReactions(declared);
    }
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === cardId &&
        (opts.optionIndex === undefined || legal.action.optionIndex === opts.optionIndex)
    );
    expect(reaction, `${cardId} should be offered on the declared attack`).toBeTruthy();
    return passAllReactions(applyOk(declared, reaction!.action));
  }

  it("I gives +1 attack, doubled to +2 for a Basilisks unit", () => {
    const plain = basiliskAttack("tf-1-plain", "specialty.tarnum_fortress.1", {
      attackerName: "Griffins",
      attackerAbilities: []
    });
    expect(
      lastAttackRolled(plain, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus,
      "non-Basilisk → +1"
    ).toBe(1);
    const basilisk = basiliskAttack("tf-1-basilisk", "specialty.tarnum_fortress.1", { attackerName: "Basilisks" });
    expect(
      lastAttackRolled(basilisk, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus,
      "a Basilisks unit → +2"
    ).toBe(2);
  });

  it("IV grants +1 health for the Combat, doubled for a Basilisks unit", () => {
    const state = createInitialGameState("tf-4");
    state.players.p1.hand = ["specialty.tarnum_fortress.4"];
    const unit = state.combat!.units.unit_p1_griffins;
    unit.name = "Basilisks";
    unit.abilities = [];
    const beforeMax = unit.maxHealth;
    const play = findPlay(state, "specialty.tarnum_fortress.4", undefined, "unit_p1_griffins");
    expect(play, "IV targets a friendly unit").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p1_griffins.maxHealth, "+2 HP for a Basilisks unit").toBe(beforeMax + 2);
  });

  it("VI is a CHOOSE_ONE: both the force-ability and the +2-attack options are offered on the declared attack", () => {
    const state = createInitialGameState("tf-6-or-offers");
    state.players.p1.hand = ["specialty.tarnum_fortress.6"];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.name = "Basilisks";
    attacker.abilities = ["fortress-basilisk-paralysis"];
    attacker.position = 9;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const offers = (declared.reactionWindow?.legalReactions.p1 ?? []).filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.tarnum_fortress.6"
    );
    expect(
      offers.map((o) => (o.action.type === "PLAY_REACTION" ? o.action.optionIndex : undefined)).sort(),
      "both option 0 (force ability) and option 1 (+2 attack) are offered"
    ).toEqual([0, 1]);
  });

  it("VI option A forces the Basilisk Paralysis regardless of the roll, with NO attack bonus", () => {
    // Control: a Basilisk attack with the die scripted to "0" (not "-1") does NOT
    // paralyse on its own.
    const control = basiliskAttack("tf-6-control", null, { scriptedFace: 0 });
    expect(hasParalysis(control, "unit_p2_skeletons"), "no paralysis on a '0' roll").toBe(false);

    // Option A: the Stone Gaze fires regardless of the rolled face, but the attack
    // gains NO attack bonus (this option is force-only, +0 attack).
    const forced = basiliskAttack("tf-6-forced", "specialty.tarnum_fortress.6", { scriptedFace: 0, optionIndex: 0 });
    expect(hasParalysis(forced, "unit_p2_skeletons"), "option A forces the Paralysis on a '0'").toBe(true);
    expect(
      lastAttackRolled(forced, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus,
      "option A grants no attack bonus"
    ).toBe(0);
  });

  it("VI option B adds +2 attack and does NOT force the ability (the OR is exclusive)", () => {
    // Option B on a Basilisk attack scripted to "0": +2 attack, and because this
    // option does NOT force ability rolls, the Paralysis still does not fire on "0".
    const buffed = basiliskAttack("tf-6-plus2", "specialty.tarnum_fortress.6", { scriptedFace: 0, optionIndex: 1 });
    expect(hasParalysis(buffed, "unit_p2_skeletons"), "option B does NOT force the Paralysis on a '0'").toBe(false);
    expect(
      lastAttackRolled(buffed, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus,
      "option B grants +2 attack"
    ).toBe(2);
  });

  it("VI option A on a unit with no die-gated ability does nothing observable (no paralysis, +0 attack)", () => {
    // A plain Griffins (no Stone Gaze) under option A: the force flag has no ability
    // to trigger, and option A grants no attack bonus.
    const forced = basiliskAttack("tf-6-noability", "specialty.tarnum_fortress.6", {
      attackerName: "Griffins",
      attackerAbilities: [],
      scriptedFace: 0,
      optionIndex: 0
    });
    expect(hasParalysis(forced, "unit_p2_skeletons"), "nothing to force without a die-gated ability").toBe(false);
    expect(
      lastAttackRolled(forced, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus,
      "option A still grants no attack bonus"
    ).toBe(0);
  });
});

// ===========================================================================
// Tarnum (Rampart) — "Sharpshooters": creature buffs + borrow-a-unit VI
// ===========================================================================

const SILVER_DECK = "neutral-silver";

function injectSilverSharpshooters(state: GameState, present = true): void {
  state.decks[SILVER_DECK] = {
    id: SILVER_DECK,
    drawPile: present ? ["neutral.sharpshooters"] : [],
    discardPile: []
  };
}

function borrowedSharpshooter(state: GameState) {
  return Object.values(state.combat!.units).find(
    (unit) => unit.name === "Sharpshooters" && unit.controllerId === "p1"
  );
}

describe("Tarnum (Rampart)'s Sharpshooters specialty", () => {
  it("is the Ranger variant, distinct from the other Tarnums", () => {
    expect(coreHeroDefinitions.tarnum_rampart.name).toBe("Tarnum");
    expect(coreHeroDefinitions.tarnum_rampart.class).toBe("Ranger");
    expect(coreHeroDefinitions.tarnum_rampart.faction).toBe("rampart");
    expect(coreHeroDefinitions.tarnum_rampart.portrait).toBe("/assets/hero_portraits-tarnum_ranger.webp");
  });

  it("I gives +1 attack, doubled to +2 for an Elves OR Sharpshooters unit", () => {
    function attackPlusOne(seed: string, attackerName: string): number | undefined {
      const state = createInitialGameState(seed);
      state.players.p1.hand = ["specialty.tarnum_rampart.1"];
      state.players.p2.hand = [];
      const attacker = state.combat!.units.unit_p1_griffins;
      attacker.abilities = [];
      attacker.name = attackerName;
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
          legal.action.cardId === "specialty.tarnum_rampart.1" &&
          legal.action.optionIndex === 0
      );
      expect(reaction, "the +1 attack option should be offered").toBeTruthy();
      const settled = passAllReactions(applyOk(declared, reaction!.action));
      return lastAttackRolled(settled, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus;
    }
    expect(attackPlusOne("tr-1-plain", "Griffins"), "non-signature → +1").toBe(1);
    expect(attackPlusOne("tr-1-elves", "Elves"), "Elves → +2").toBe(2);
    expect(attackPlusOne("tr-1-ss", "Sharpshooters"), "Sharpshooters → +2").toBe(2);
  });

  it("IV grants +1 initiative for the Combat, doubled for a Sharpshooters unit", () => {
    function initBuff(seed: string, name: string): number {
      const state = createInitialGameState(seed);
      state.players.p1.hand = ["specialty.tarnum_rampart.4"];
      const unit = state.combat!.units.unit_p1_griffins;
      unit.name = name;
      unit.abilities = [];
      const before = effectiveInitiative(unit, state.activeEffects);
      const play = findPlay(state, "specialty.tarnum_rampart.4", undefined, "unit_p1_griffins");
      expect(play, "IV targets a friendly unit").toBeTruthy();
      const after = applyOk(state, play!.action);
      return effectiveInitiative(after.combat!.units.unit_p1_griffins, after.activeEffects) - before;
    }
    expect(initBuff("tr-4-plain", "Griffins"), "non-signature → +1 initiative").toBe(1);
    expect(initBuff("tr-4-ss", "Sharpshooters"), "Sharpshooters → +2 initiative").toBe(2);
  });

  it("VI option A borrows a Sharpshooters onto the board and removes it from the silver deck", () => {
    const state = createInitialGameState("tr-6-borrow");
    injectSilverSharpshooters(state);
    state.players.p1.hand = ["specialty.tarnum_rampart.6"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    expect(borrowedSharpshooter(state), "no Sharpshooters before the borrow").toBeUndefined();
    const play = findPlay(state, "specialty.tarnum_rampart.6", 0);
    expect(play, "the borrow option is offered at the start of Combat").toBeTruthy();
    const after = applyOk(state, play!.action);
    const borrowed = borrowedSharpshooter(after);
    expect(borrowed, "a Sharpshooters joins the Combat").toBeTruthy();
    // A temporary unit: it carries no army card (never written back) and is
    // gradeless to the neutral AI, and it deploys on p1's side (attacker region).
    expect(borrowed!.temporary, "marked temporary").toBe(true);
    expect(borrowed!.armyUnitId, "carries no army card").toBeUndefined();
    expect(borrowed!.summoned, "gradeless to the AI").toBe(true);
    expect(borrowed!.position, "deploys on p1's (attacker) side").toBeGreaterThanOrEqual(12);
    // The card was pulled out of the silver Neutral deck.
    expect(after.decks[SILVER_DECK].drawPile, "card pulled from the silver deck").not.toContain(
      "neutral.sharpshooters"
    );
    // It never joins p1's permanent army.
    expect(after.players.p1.army.some((a) => a.unitDefId === "neutral.sharpshooters"), "not in the army").toBe(false);
  });

  it("VI option A is gated: not on a later round, and not when the deck has none", () => {
    const round2 = createInitialGameState("tr-6-round2");
    injectSilverSharpshooters(round2);
    round2.players.p1.hand = ["specialty.tarnum_rampart.6"];
    round2.activePlayerId = "p1";
    round2.combat!.activeUnitId = "unit_p1_griffins";
    round2.combat!.round = 2;
    expect(findPlay(round2, "specialty.tarnum_rampart.6", 0), "not offered after round 1").toBeFalsy();

    const empty = createInitialGameState("tr-6-empty");
    injectSilverSharpshooters(empty, false);
    empty.players.p1.hand = ["specialty.tarnum_rampart.6"];
    empty.activePlayerId = "p1";
    empty.combat!.activeUnitId = "unit_p1_griffins";
    expect(findPlay(empty, "specialty.tarnum_rampart.6", 0), "not offered with no card to borrow").toBeFalsy();
  });

  it("VI option B draws a card", () => {
    const state = mapFor("tr-6-draw", "tarnum_rampart", "rampart");
    state.players.p1.hand = ["specialty.tarnum_rampart.6"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    const before = state.players.p1.hand.length;
    const play = findPlay(state, "specialty.tarnum_rampart.6", 1);
    expect(play, "the draw option is offered (anytime)").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.hand.length, "-specialty +1 draw").toBe(before - 1 + 1);
  });

  it("the borrowed unit is discarded back to the silver Neutral pile after the Combat (not kept)", () => {
    let state = createAdventureGameState({ seed: "tr-6-e2e", difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    // A Creature Bank gives the simplest real adventure Neutral combat to drive.
    const hero = getMainHero(state, "p1")!;
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
    injectSilverSharpshooters(state);
    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);

    // Deploy one unit and lock placement → combat round 1.
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    state = applyOk(state, place!.action);
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    expect(state.combat?.round, "round 1").toBe(1);

    // Borrow a Sharpshooters into this fight.
    state.players.p1.hand = ["specialty.tarnum_rampart.6"];
    const borrow = findPlay(state, "specialty.tarnum_rampart.6", 0);
    expect(borrow, "the borrow option is offered in the bank fight").toBeTruthy();
    state = applyOk(state, borrow!.action);
    const borrowed = borrowedSharpshooter(state);
    expect(borrowed, "a Sharpshooters joined the fight").toBeTruthy();

    // Force the win and finalize.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);

    expect(state.combat, "the combat ended").toBeNull();
    // "Discard it afterwards": the borrowed card is back in the silver Neutral
    // discard pile, and it never entered p1's permanent army.
    expect(state.decks[SILVER_DECK].discardPile, "borrowed card returned to the silver discard").toContain(
      "neutral.sharpshooters"
    );
    expect(
      state.players.p1.army.some((entry) => entry.unitDefId === "neutral.sharpshooters"),
      "the borrowed unit is NOT kept in the army"
    ).toBe(false);
  });
});
