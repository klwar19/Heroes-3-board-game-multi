import { describe, expect, it } from "vitest";
import { hasMediaFile } from "@/lib/media-manifest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  effectiveInitiative,
  getLegalActions
} from "./index";
import { startWarMachineRound } from "./permanents";
import { getOffTurnCombatReactions } from "./legal-actions";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { adventureCards } from "@/data/cards/adventure";
import type { FactionId } from "@/data/factions/types";
import type { GameAction, GameEvent, GameState, UnitId } from "./state";

// ---------------------------------------------------------------------------
// Additional heroes, batch 5 — eight placeholder-art wiki heroes that complete
// every already-playable Town's roster on the fan wiki. All specialties are
// engine-wired and mutation-checked (each test fails if the specialty's wiring
// is removed). New mechanics introduced in this batch:
//
//   Ash (Inferno, Heretic) — Bloodlust: +attack to a ground/flying unit and
//     "place a Black cube" on it (NEW: it spends its Retaliation for the round);
//     VI's attack also "ignores Retaliation Attacks" (NEW one-off override).
// ---------------------------------------------------------------------------


/** Batch-5 heroes registered so far (grown as each is implemented + tested). */
const BATCH5_HEROES: Array<[string, keyof typeof coreFactionDefinitions]> = [
  ["ash", "inferno"],
  ["gerwulf", "fortress"],
  ["tarnum_dungeon", "dungeon"],
  ["sephinroth", "dungeon"]
];

function lastEventOfType<T extends GameEvent["type"]>(
  state: GameState,
  type: T
): Extract<GameEvent, { type: T }> | undefined {
  return [...state.eventLog].reverse().find((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

/** A two-player adventure (map) game with `heroDefId` controlling p1. */
function adventureFor(seed: string, heroDefId: string, factionId: FactionId): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "P1", factionId, heroDefId },
      { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  return state;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
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

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
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

/** Did `retaliatorId` perform a Retaliation Attack in this combat? */
function retaliationHappened(state: GameState, retaliatorId: UnitId): boolean {
  return state.eventLog.some(
    (event) => event.type === "ATTACK_ROLLED" && event.attackerId === retaliatorId && event.isRetaliation
  );
}

// ===========================================================================
// Roster + art wiring (CLAUDE.md rule #2: data states exactly what runs)
// ===========================================================================

describe("batch-5 heroes are registered with printed board art and implemented specialties", () => {
  // They shipped PC portraits and art-less specialty cards until the fan wiki
  // published the "Regular Stretch Goals 2024" art pack; each now carries the
  // printed board scan, the portrait cropped from it, and all three printed
  // specialty faces (scripts/fetch-hero-art-refresh.py).
  it("each carries a real board scan, a cropped portrait, and 3 implemented specialties with printed faces", () => {
    for (const [heroId, factionId] of BATCH5_HEROES) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, `${heroId} should be defined`).toBeTruthy();
      expect(coreFactionDefinitions[factionId].heroes, `${factionId} roster`).toContain(heroId);
      expect(hero.faction, `${heroId} faction`).toBe(factionId);
      expect(hero.portrait, `${heroId} portrait path`).toBe(`/assets/hero_boardart-${heroId}.webp`);
      expect(hero.boardScan, `${heroId} board scan`).toBe(
        `/assets/heroes-${factionId}-${hero.type}-${heroId}.webp`
      );
      expect(hasMediaFile(hero.portrait!), `${heroId} portrait file is not published (npm run media:publish)`).toBe(true);
      expect(hasMediaFile(hero.boardScan!), `${heroId} board file is not published (npm run media:publish)`).toBe(true);
      for (const level of [1, 4, 6] as const) {
        const card = adventureCards[hero.specialtyCardIds![level]];
        expect(card, `${hero.specialtyCardIds![level]} should exist`).toBeTruthy();
        expect(card.implementationStatus, `${card.id} implemented`).toBe("implemented");
        expect(card.tags, `${card.id} not flagged needs-implementation`).not.toContain("needs-implementation");
        // The printed face ships now, so the card must point at it and the file
        // must exist (never a broken <img>).
        expect(card.assets?.cardImage, `${card.id} art`).toBe(`/assets/hero_specialties-${heroId}-${level}.webp`);
        expect(hasMediaFile(card.assets!.cardImage!), `${card.id} face is not published (npm run media:publish)`).toBe(true);
      }
    }
  });
});

// ===========================================================================
// Ash (Inferno) — Bloodlust: ground/flying attack buff + Black cube + no-retal
// ===========================================================================

describe("Ash's Bloodlust specialty", () => {
  /**
   * p1's griffins (attack 4) attack p2's skeletons; p1 may react with `cardId`.
   * The attack die is scripted to 0 so the reported attackBonus/damage isolates
   * the specialty's contribution. Both units survive (40 HP) so a retaliation
   * can fire (or be suppressed).
   */
  function attackWith(
    seed: string,
    cardId: string | null,
    attackerType: "ground" | "flying" | "ranged" = "ground"
  ) {
    const state = createInitialGameState(seed);
    state.players.p1.hand = cardId ? [cardId] : [];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.type = attackerType;
    attacker.position = 9;
    attacker.attack = 4;
    attacker.retaliatedThisRound = false;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13; // orthogonally adjacent to 9 → melee, can retaliate
    defender.defense = 0;
    defender.attack = 3;
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
    if (!cardId) {
      return passAllReactions(declared);
    }
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
    );
    expect(reaction, `${cardId} should be offered on the declared attack`).toBeTruthy();
    return passAllReactions(applyOk(declared, reaction!.action));
  }

  it("I adds +2 attack to a ground attack AND places a Black cube (spends its Retaliation)", () => {
    // Baseline: a plain attack deals 4, and the attacker keeps its Retaliation.
    const base = attackWith("ash-1-base", null);
    expect(lastAttackRolled(base, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.damage).toBe(4);
    expect(base.combat!.units.unit_p1_griffins.retaliatedThisRound, "no cube without Ash I").toBe(false);

    const buffed = attackWith("ash-1-buff", "specialty.ash.1");
    const hit = lastAttackRolled(buffed, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation);
    expect(hit?.attackBonus, "+2 attack").toBe(2);
    expect(hit?.damage, "4 attack +2 = 6 damage").toBe(6);
    expect(buffed.combat!.units.unit_p1_griffins.retaliatedThisRound, "Black cube placed on attacker").toBe(true);
  });

  it("I is a flying-unit option too, but is NOT offered for a ranged attacker", () => {
    const flying = attackWith("ash-1-fly", "specialty.ash.1", "flying");
    expect(lastAttackRolled(flying, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus).toBe(2);

    // A ranged attacker: the ground/flying-only Bloodlust must not be offered.
    const state = createInitialGameState("ash-1-ranged");
    state.players.p1.hand = ["specialty.ash.1"];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.type = "ranged";
    attacker.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    const offered = (declared.reactionWindow?.legalReactions.p1 ?? []).some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.ash.1"
    );
    expect(offered, "ranged attacker cannot receive Bloodlust").toBe(false);
  });

  it("IV grants an ongoing +2 attack / +1 initiative this combat AND places a Black cube", () => {
    const state = createInitialGameState("ash-4");
    state.players.p1.hand = ["specialty.ash.4"];
    const unit = state.combat!.units.unit_p1_griffins;
    unit.type = "ground";
    unit.retaliatedThisRound = false;
    const beforeInit = effectiveInitiative(unit, state.activeEffects);
    const play = findPlay(state, "specialty.ash.4", undefined, "unit_p1_griffins");
    expect(play, "IV should target a friendly ground/flying unit").toBeTruthy();
    const after = applyOk(state, play!.action);
    const buffed = after.combat!.units.unit_p1_griffins;
    expect(effectiveInitiative(buffed, after.activeEffects), "+1 initiative").toBe(beforeInit + 1);
    const effect = after.activeEffects.find(
      (eff) => eff.target?.type === "unit" && eff.target.unitId === "unit_p1_griffins" && eff.name === "Bloodlust IV"
    );
    expect(effect, "an active Bloodlust IV effect on the unit").toBeTruthy();
    expect(effect!.modifiers.find((m) => m.type === "ATTACK_BONUS")?.["amount" as never], "+2 attack modifier").toBe(2);
    expect(buffed.retaliatedThisRound, "Black cube placed on the unit").toBe(true);
  });

  it("IV is NOT offered targeting a ranged unit", () => {
    const state = createInitialGameState("ash-4-ranged");
    state.players.p1.hand = ["specialty.ash.4"];
    state.combat!.units.unit_p1_griffins.type = "ranged";
    expect(findPlay(state, "specialty.ash.4", undefined, "unit_p1_griffins")).toBeFalsy();
  });

  it("VI adds +3 attack, the attack ignores Retaliation, AND places a Black cube", () => {
    // Baseline: a plain melee attack DOES provoke the skeletons' Retaliation.
    const base = attackWith("ash-6-base", null);
    expect(retaliationHappened(base, "unit_p2_skeletons"), "baseline retaliation fires").toBe(true);

    const buffed = attackWith("ash-6-buff", "specialty.ash.6");
    const hit = lastAttackRolled(buffed, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation);
    expect(hit?.attackBonus, "+3 attack").toBe(3);
    expect(hit?.damage, "4 attack +3 = 7 damage").toBe(7);
    expect(retaliationHappened(buffed, "unit_p2_skeletons"), "Bloodlust VI suppresses the retaliation").toBe(false);
    expect(buffed.combat!.units.unit_p1_griffins.retaliatedThisRound, "Black cube placed on attacker").toBe(true);
  });
});

// ===========================================================================
// Gerwulf (Fortress) — Ballista: reuse + discard-for-damage + aim-your-Ballista
// ===========================================================================

describe("Gerwulf's Ballista specialty", () => {
  /** A combat where p1 owns a Ballista and the three p2 units have set initiatives. */
  function combatWithBallista(seed: string, ownsBallista = true): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [];
    state.players.p1.permanents = ownsBallista ? ["war_machine.ballista"] : [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    for (const id of ["unit_p2_skeletons", "unit_p2_vampires", "unit_p2_dread_knights"] as const) {
      const unit = state.combat!.units[id];
      unit.abilities = [];
      unit.maxHealth = 40;
      unit.damage = 0;
    }
    return state;
  }

  it("I option B activates an owned Ballista (1 damage to the slowest enemy); not offered without one", () => {
    const state = combatWithBallista("gerwulf-1");
    state.players.p1.hand = ["specialty.gerwulf.1"];
    state.combat!.units.unit_p2_skeletons.initiative = 1; // slowest
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;
    const activate = findPlay(state, "specialty.gerwulf.1", 1);
    expect(activate, "activate needs a Ballista in play").toBeTruthy();
    const fired = applyOk(state, activate!.action);
    expect(fired.combat!.units.unit_p2_skeletons.damage).toBe(1);

    const none = combatWithBallista("gerwulf-1-none", false);
    none.players.p1.hand = ["specialty.gerwulf.1"];
    expect(findPlay(none, "specialty.gerwulf.1", 1), "no activate without a Ballista").toBeFalsy();
  });

  it("I option A pays 5 gold to take a Ballista from the supply into hand (map)", () => {
    const state = createAdventureGameState({
      seed: "gerwulf-map",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Gerwulf", factionId: "fortress", heroDefId: "gerwulf" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = ["specialty.gerwulf.1"];
    state.players.p1.resources.gold = 12;
    expect(state.adventure?.warMachineSupply).toContain("war_machine.ballista");
    const gain = findPlay(state, "specialty.gerwulf.1", 0);
    expect(gain, "the gain-a-Ballista option is offered on the map").toBeTruthy();
    const next = applyOk(state, gain!.action);
    expect(next.players.p1.hand).toContain("war_machine.ballista");
    expect(next.players.p1.resources.gold).toBe(7);
  });

  it("IV option A deals 1 damage to the sole remaining enemy unit", () => {
    const state = combatWithBallista("gerwulf-4a");
    state.players.p1.hand = ["specialty.gerwulf.4"];
    // Leave exactly one living enemy so the count-1 hit lands automatically.
    state.combat!.units.unit_p2_vampires.damage = state.combat!.units.unit_p2_vampires.maxHealth;
    state.combat!.units.unit_p2_dread_knights.damage = state.combat!.units.unit_p2_dread_knights.maxHealth;
    const play = findPlay(state, "specialty.gerwulf.4", 0);
    expect(play, "the 1-damage option is a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p2_skeletons.damage, "1 damage to the only enemy").toBe(1);
  });

  it("IV option B discards the Ballista to deal 2 damage to the selected enemy; gated on owning one", () => {
    const state = combatWithBallista("gerwulf-4b");
    state.players.p1.hand = ["specialty.gerwulf.4"];
    const play = findPlay(state, "specialty.gerwulf.4", 1, "unit_p2_vampires");
    expect(play, "discard option targets an enemy unit").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p2_vampires.damage, "2 damage from the discarded Ballista").toBe(2);
    expect(after.players.p1.permanents ?? [], "the Ballista is discarded out of play").not.toContain(
      "war_machine.ballista"
    );
    expect((after.players.p1.discard ?? []).includes("war_machine.ballista"), "Ballista to discard pile").toBe(true);

    // Without a Ballista the discard option is not offered.
    const none = combatWithBallista("gerwulf-4b-none", false);
    none.players.p1.hand = ["specialty.gerwulf.4"];
    expect(findPlay(none, "specialty.gerwulf.4", 1, "unit_p2_vampires")).toBeFalsy();
  });

  it("VI option B discards the Ballista to deal 3 damage to the selected enemy", () => {
    const state = combatWithBallista("gerwulf-6b");
    state.players.p1.hand = ["specialty.gerwulf.6"];
    const play = findPlay(state, "specialty.gerwulf.6", 1, "unit_p2_dread_knights");
    expect(play, "discard option targets an enemy unit").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p2_dread_knights.damage, "3 damage from the discarded Ballista").toBe(3);
    expect(after.players.p1.permanents ?? []).not.toContain("war_machine.ballista");
  });

  it("VI option A lets the owner aim the Ballista at ANY enemy at round start (NEW)", () => {
    // Baseline: a unique slowest enemy auto-takes the shot — no choice opens.
    const base = combatWithBallista("gerwulf-6a-base");
    base.combat!.units.unit_p2_skeletons.initiative = 1; // unique slowest
    base.combat!.units.unit_p2_vampires.initiative = 8;
    base.combat!.units.unit_p2_dread_knights.initiative = 8;
    startWarMachineRound(base);
    expect(base.pendingChoice, "no aim choice without Ballista VI").toBeNull();
    expect(base.combat!.units.unit_p2_skeletons.damage, "auto-fires the slowest").toBe(1);

    // With Ballista VI active, the round-start shot opens a choice over EVERY enemy.
    const aimed = combatWithBallista("gerwulf-6a");
    aimed.players.p1.hand = ["specialty.gerwulf.6"];
    aimed.combat!.units.unit_p2_skeletons.initiative = 1; // still the slowest
    aimed.combat!.units.unit_p2_vampires.initiative = 8;
    aimed.combat!.units.unit_p2_dread_knights.initiative = 8;
    const withAura = applyOk(aimed, findPlay(aimed, "specialty.gerwulf.6", 0)!.action);
    expect(
      withAura.activeEffects.some(
        (eff) => eff.controllerId === "p1" && eff.modifiers.some((m) => m.type === "BALLISTA_CHOOSE_TARGET")
      ),
      "the aim-your-Ballista effect is active"
    ).toBe(true);
    startWarMachineRound(withAura);
    expect(withAura.pendingChoice?.type, "an aim choice opens").toBe("ABILITY_TARGET_CHOICE");
    const candidates =
      withAura.pendingChoice && "candidateUnitIds" in withAura.pendingChoice
        ? withAura.pendingChoice.candidateUnitIds
        : [];
    expect(candidates, "a faster (non-slowest) enemy is a legal aim").toContain("unit_p2_vampires");
    expect(candidates).toContain("unit_p2_dread_knights");
  });
});

// ===========================================================================
// Tarnum (Dungeon) — Dragons: might-spec doubling + line damage + cube toggle
// ===========================================================================

describe("Tarnum (Dungeon)'s Dragons specialty", () => {
  it("is the Overlord variant of Tarnum, distinct from the other Tarnums", () => {
    expect(coreHeroDefinitions.tarnum_dungeon.name).toBe("Tarnum");
    expect(coreHeroDefinitions.tarnum_dungeon.class).toBe("Overlord");
    expect(coreHeroDefinitions.tarnum_dungeon.faction).toBe("dungeon");
    expect(coreHeroDefinitions.tarnum_dungeon.portrait).toBe("/assets/hero_boardart-tarnum_dungeon.webp");
  });

  /** p1's attacker (renamed to `attackerName`) strikes skeletons; p1 plays option 0 (+1 attack). */
  function attackPlusOne(seed: string, attackerName: string): number | undefined {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["specialty.tarnum_dungeon.1"];
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
        legal.action.cardId === "specialty.tarnum_dungeon.1" &&
        legal.action.optionIndex === 0
    );
    expect(reaction, "the +1 attack option should be offered").toBeTruthy();
    const settled = passAllReactions(applyOk(declared, reaction!.action));
    return lastAttackRolled(settled, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus;
  }

  it("I gives +1 attack, doubled to +2 for a Dragons unit", () => {
    expect(attackPlusOne("tarnum-d-1-plain", "Griffins"), "non-Dragon → +1").toBe(1);
    expect(attackPlusOne("tarnum-d-1-dragon", "Black Dragons"), "a Dragons unit → +2").toBe(2);
  });

  it("I also doubles the defense reaction for a Dragons unit", () => {
    const state = createInitialGameState("tarnum-d-1-defense");
    state.players.p1.hand = ["specialty.tarnum_dungeon.1"];
    state.players.p2.hand = [];
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    attacker.position = 13;
    const defender = state.combat!.units.unit_p1_griffins;
    defender.abilities = [];
    defender.name = "Black Dragons";
    defender.position = 9;
    defender.maxHealth = 40;
    state.combat!.dice.scriptedRolls = new Array(8).fill(0);
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = attacker.id;
    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: attacker.id,
      defenderId: defender.id
    });
    const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.tarnum_dungeon.1" &&
        legal.action.optionIndex === 1
    );
    expect(reaction).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, reaction!.action));
    expect(lastAttackRolled(resolved, (event) => event.attackerId === attacker.id)?.defenseBonus).toBe(2);
  });

  it("IV damages every unit (friend and foe) in the chosen vertical line of 5", () => {
    const state = createInitialGameState("tarnum-d-4");
    state.players.p1.hand = ["specialty.tarnum_dungeon.4"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    // Column 1 = positions 1, 5, 9, 13, 17. Put a friend and two foes in it,
    // and one foe in column 2 (position 2) as the control.
    const place = (id: string, position: number) => {
      const unit = state.combat!.units[id];
      unit.abilities = [];
      unit.maxHealth = 40;
      unit.damage = 0;
      unit.position = position;
    };
    place("unit_p1_griffins", 9); // col 1, friendly
    place("unit_p2_skeletons", 1); // col 1
    place("unit_p2_vampires", 13); // col 1
    place("unit_p2_dread_knights", 2); // col 2 (spared)
    state.combat!.units.unit_p1_marksmen.position = 0; // col 0 (spared)
    state.combat!.units.unit_p1_crusaders.position = 3; // col 3 (spared)
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.tarnum_dungeon.4" &&
        legal.action.target?.type === "space" &&
        legal.action.target.position === 5 // a space in column 1
    );
    expect(play, "a column-1 space target should be offered").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.combat!.units.unit_p1_griffins.damage, "friendly in the line is hit").toBe(2);
    expect(after.combat!.units.unit_p2_skeletons.damage, "foe in the line is hit").toBe(2);
    expect(after.combat!.units.unit_p2_vampires.damage, "foe in the line is hit").toBe(2);
    expect(after.combat!.units.unit_p2_dread_knights.damage, "a different column is spared").toBe(0);
    expect(after.combat!.units.unit_p1_marksmen.damage, "a different column is spared").toBe(0);
  });

  it("IV is a real Instant and offers its five-space row during an enemy activation", () => {
    const state = createInitialGameState("tarnum-d-4-off-turn");
    state.players.p1.hand = ["specialty.tarnum_dungeon.4"];
    state.players.p2.hand = [];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    const plays = getOffTurnCombatReactions(state, "p1").filter(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.tarnum_dungeon.4" &&
        legal.action.optionIndex === 0 &&
        legal.action.target?.type === "space"
    );
    expect(plays).toHaveLength(20);
  });

  it("VI option A toggles the Black cube only on a Dragons unit", () => {
    const state = createInitialGameState("tarnum-d-6a");
    state.players.p1.hand = ["specialty.tarnum_dungeon.6"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const dragon = state.combat!.units.unit_p1_griffins;
    dragon.name = "Black Dragons";
    dragon.retaliatedThisRound = true; // already spent its Retaliation
    // A non-Dragon friendly unit must NOT be a legal target for the toggle.
    state.combat!.units.unit_p1_crusaders.name = "Crusaders";
    const onDragon = findPlay(state, "specialty.tarnum_dungeon.6", 0, "unit_p1_griffins");
    expect(onDragon, "the toggle targets the Dragons unit").toBeTruthy();
    expect(
      findPlay(state, "specialty.tarnum_dungeon.6", 0, "unit_p1_crusaders"),
      "a non-Dragon unit is not a legal toggle target"
    ).toBeFalsy();
    const removed = applyOk(state, onDragon!.action);
    expect(removed.combat!.units.unit_p1_griffins.retaliatedThisRound, "cube removed → may retaliate again").toBe(false);

    // Placing: a Dragons unit that has NOT retaliated gains a cube (cannot retaliate).
    const fresh = createInitialGameState("tarnum-d-6a-place");
    fresh.players.p1.hand = ["specialty.tarnum_dungeon.6"];
    fresh.players.p2.hand = [];
    fresh.activePlayerId = "p1";
    fresh.combat!.activeUnitId = "unit_p1_griffins";
    fresh.combat!.units.unit_p1_griffins.name = "Gold Dragons";
    fresh.combat!.units.unit_p1_griffins.retaliatedThisRound = false;
    const placed = applyOk(fresh, findPlay(fresh, "specialty.tarnum_dungeon.6", 0, "unit_p1_griffins")!.action);
    expect(placed.combat!.units.unit_p1_griffins.retaliatedThisRound, "cube placed → cannot retaliate").toBe(true);
  });

  it("VI option B adds +2 attack to a declared attack", () => {
    const state = createInitialGameState("tarnum-d-6b");
    state.players.p1.hand = ["specialty.tarnum_dungeon.6"];
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
        legal.action.cardId === "specialty.tarnum_dungeon.6" &&
        legal.action.optionIndex === 1
    );
    expect(reaction, "+2 attack option offered on the declared attack").toBeTruthy();
    const settled = passAllReactions(applyOk(declared, reaction!.action));
    expect(lastAttackRolled(settled, (e) => e.attackerId === "unit_p1_griffins" && !e.isRetaliation)?.attackBonus).toBe(2);
  });
});

// ===========================================================================
// Sephinroth (Dungeon) — Valuables: pay-gold / gain-valuables map economy
// ===========================================================================

describe("Sephinroth's Valuables specialty", () => {
  it("I option A pays 1 gold to gain 1 valuables on the map; hidden when unaffordable", () => {
    const state = adventureFor("seph-1", "sephinroth", "dungeon");
    state.players.p1.hand = ["specialty.sephinroth.1"];
    state.players.p1.resources.gold = 5;
    state.players.p1.resources.valuables = 0;
    const play = findPlay(state, "specialty.sephinroth.1", 0);
    expect(play, "the pay-gold option is offered with enough gold").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.resources.gold, "1 gold spent").toBe(4);
    expect(after.players.p1.resources.valuables, "1 valuables gained").toBe(1);

    const broke = adventureFor("seph-1-broke", "sephinroth", "dungeon");
    broke.players.p1.hand = ["specialty.sephinroth.1"];
    broke.players.p1.resources.gold = 0; // < 1
    expect(findPlay(broke, "specialty.sephinroth.1", 0), "pay-gold hidden when too poor").toBeFalsy();
  });

  it("I option B draws 1 card", () => {
    const state = adventureFor("seph-1b", "sephinroth", "dungeon");
    state.players.p1.hand = ["specialty.sephinroth.1"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    const before = state.players.p1.hand.length;
    const play = findPlay(state, "specialty.sephinroth.1", 1);
    expect(play, "draw option offered").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.hand.length).toBe(before - 1 + 1); // -specialty +draw
  });

  it("IV option A gains 1 valuables; VI option A gains 2 valuables (map)", () => {
    const four = adventureFor("seph-4", "sephinroth", "dungeon");
    four.players.p1.hand = ["specialty.sephinroth.4"];
    four.players.p1.resources.valuables = 0;
    const afterFour = applyOk(four, findPlay(four, "specialty.sephinroth.4", 0)!.action);
    expect(afterFour.players.p1.resources.valuables).toBe(1);

    const six = adventureFor("seph-6", "sephinroth", "dungeon");
    six.players.p1.hand = ["specialty.sephinroth.6"];
    six.players.p1.resources.valuables = 0;
    const afterSix = applyOk(six, findPlay(six, "specialty.sephinroth.6", 0)!.action);
    expect(afterSix.players.p1.resources.valuables).toBe(2);
  });

  it("VI option B draws 2 cards", () => {
    const state = adventureFor("seph-6b", "sephinroth", "dungeon");
    state.players.p1.hand = ["specialty.sephinroth.6"];
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    const before = state.players.p1.hand.length;
    const after = applyOk(state, findPlay(state, "specialty.sephinroth.6", 1)!.action);
    expect(after.players.p1.hand.length).toBe(before - 1 + 2);
  });

  it("IV option B adds +2 Power to a spell cast", () => {
    let state = createInitialGameState("seph-4-power");
    state.players.p1.hand = ["spell.magic_arrow", "specialty.sephinroth.4"];
    state.players.p2.hand = [];
    state = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });
    expect(state.reactionWindow?.priorityPlayerId).toBe("p1");
    const power = (state.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.sephinroth.4" &&
        legal.action.optionIndex === 1
    );
    expect(power, "the +2 Power option is offered into the caster's own spell window").toBeTruthy();
    state = passAllReactions(applyOk(state, power!.action));
    expect(lastEventOfType(state, "SPELL_CAST_RESOLVED"), "Magic Arrow resolves at +2 Power").toMatchObject({
      power: 2
    });
  });
});
