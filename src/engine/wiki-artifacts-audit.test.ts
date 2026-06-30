import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero
} from "./index";
import { effectiveInitiative } from "./active-effects";
import type { GameAction, GameEvent, GameState, UnitId } from "./state";

/**
 * Audit coverage for the artifacts that previously had NO engine test (CLAUDE.md
 * rule #1: an effect is "done" only if a test fails when its wiring is removed).
 *
 * Each card here was checked verbatim against the fan wiki
 * (https://en.homm3bg.wiki/artifacts/<slug>/) for its two "— OR —" sides, their
 * timing tags (<instant>/<ongoing>/<map_effect>) and any duration phrase. The
 * tests drive the REAL card through the engine and assert the observable game
 * outcome (a stat value reached, gold gained, damage dealt), not an intermediate
 * token — so a wrong magnitude or a dropped option fails the test, not just a
 * removed one.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function passUntil(state: GameState, playerId: "p1" | "p2"): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** The most recent main (non-retaliation) hit dealt by `attackerId`. */
function lastHitBy(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation
    );
}

/** Total "effect"/card damage a named card dealt to a unit (e.g. Sword self-damage). */
function effectDamageFrom(state: GameState, cardId: string, unitId: string): number {
  return state.eventLog
    .filter(
      (event): event is Extract<GameEvent, { type: "DAMAGE_ASSIGNED" }> =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "card" &&
        event.source.cardId === cardId &&
        event.target.type === "unit" &&
        event.target.unitId === unitId
    )
    .reduce((sum, event) => sum + event.amount, 0);
}

function reactionAction(
  state: GameState,
  playerId: "p1" | "p2",
  cardId: string,
  optionIndex: number
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === cardId &&
      entry.action.optionIndex === optionIndex &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

function findPlay(state: GameState, cardId: string, optionIndex: number, targetUnitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex &&
      (targetUnitId === undefined ||
        (legal.action.target?.type === "unit" && legal.action.target.unitId === targetUnitId))
  );
}

function findCast(state: GameState, playerId: "p1" | "p2", cardId: string, unitId: UnitId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

/** A map turn with p1 active and mulligan/refresh prompts cleared. */
function mapState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  return state;
}

/**
 * A clean adjacent melee duel: p1 Griffins (attack 3, defense 0) one space from
 * p2 Vampires (attack 5, defense 1). Abilities/health are neutralised so the
 * Attack die (scripted to 0) is the only roll and a reported attackValue is
 * exactly the unit's attack plus the buffs in play.
 */
function duel(seed: string): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat;
  if (!combat) throw new Error("Expected combat setup.");

  const griffins = combat.units.unit_p1_griffins;
  const vampires = combat.units.unit_p2_vampires;
  griffins.type = "ground";
  griffins.position = 9;
  griffins.attack = 3;
  griffins.defense = 0;
  griffins.maxHealth = 50;
  griffins.damage = 0;
  griffins.abilities = [];
  vampires.type = "ground";
  vampires.position = 13;
  vampires.attack = 5;
  vampires.defense = 1;
  vampires.maxHealth = 50;
  vampires.damage = 0;
  vampires.abilities = [];
  combat.units.unit_p1_marksmen.position = 0;
  combat.units.unit_p1_crusaders.position = 3;
  combat.units.unit_p2_skeletons.position = 19;
  combat.units.unit_p2_dread_knights.position = 16;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.deck = [];
  state.activePlayerId = "p1";
  combat.activeUnitId = "unit_p1_griffins";
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  combat.dice.rollCount = 0;
  return state;
}

function declareGriffinsAttack(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_vampires"
  });
}

/** A combat with p1's Marksmen active and the p2 Skeletons a soft target. */
function castCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  const target = state.combat!.units.unit_p2_skeletons;
  target.maxHealth = 30;
  target.damage = 0;
  target.abilities = [];
  return state;
}

// ===========================================================================
// Flat attack reactions on your own attacking unit (Griffins attack = 3)
// ===========================================================================

describe("Flat +attack reactions (attacker side)", () => {
  const cases: Array<[string, string, number, number]> = [
    // [card, id, optionIndex, expected attackValue from base 3]
    ["Dragon Scale Shield +2 attack", "artifact.dragon_scale_shield", 0, 5],
    ["Dragon Scale Armor +2 attack", "artifact.dragon_scale_armor", 0, 5],
    ["Red Dragon Flame Tongue +1 attack (OR side)", "artifact.red_dragon_flame_tongue", 1, 4],
    ["Titan's Gladius +2 attack (plain side)", "artifact.titans_gladius", 1, 5]
  ];

  it.each(cases)("%s", (_label, cardId, optionIndex, expected) => {
    const state = duel(`atk-${cardId}-${optionIndex}`);
    state.players.p1.hand = [cardId];
    const declared = passUntil(declareGriffinsAttack(state), "p1");
    const play = reactionAction(declared, "p1", cardId, optionIndex);
    expect(play, `${cardId} option ${optionIndex} should be an attacker reaction`).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(expected);
  });

  it("control: the Griffins attack for their base 3 with no artifact", () => {
    const resolved = passAllReactions(declareGriffinsAttack(duel("atk-control")));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(3);
  });
});

// ===========================================================================
// Discard-for-attack reactions (cost 1 card)
// ===========================================================================

describe("Discard-1-for-attack reactions", () => {
  const cases: Array<[string, string, number, number]> = [
    // [label, card, big-option index, expected attack]
    ["Titan's Gladius discard 1 → +3", "artifact.titans_gladius", 0, 6],
    ["Ogre's Club of Havoc discard 1 → +2", "artifact.ogres_club_of_havoc", 0, 5]
  ];

  it.each(cases)("%s (and a plain control)", (_label, cardId, bigIndex, expected) => {
    const state = duel(`disc-atk-${cardId}`);
    state.players.p1.hand = [cardId, "stat.power"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");
    const play = reactionAction(declared, "p1", cardId, bigIndex);
    expect(play).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, { ...play!, costCardIds: ["stat.power"] }));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(expected);
    // The paid card went to the discard pile.
    expect(resolved.players.p1.discard).toContain("stat.power");
  });

  it("Ogre's Club plain side (+1) needs no discard", () => {
    const state = duel("ogre-plain");
    state.players.p1.hand = ["artifact.ogres_club_of_havoc"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");
    const play = reactionAction(declared, "p1", "artifact.ogres_club_of_havoc", 1);
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(4);
  });
});

// ===========================================================================
// "Discard X / remove for +X" attack relics (perCostCard, removeSelf)
// ===========================================================================

describe("Sword of Judgement — discard X for +X attack OR +X defense", () => {
  it("option 0: discard 2 cards → +2 attack", () => {
    const state = duel("judgement-atk");
    state.players.p1.hand = ["artifact.sword_of_judgement", "stat.power", "stat.knowledge"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");
    const play = reactionAction(declared, "p1", "artifact.sword_of_judgement", 0);
    expect(play).toBeTruthy();
    const resolved = passAllReactions(
      applyOk(declared, { ...play!, costCardIds: ["stat.power", "stat.knowledge"] })
    );
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(5);
  });

  it("option 1: discard 2 cards → +2 defense (defender side)", () => {
    const state = duel("judgement-def");
    state.players.p2.hand = ["artifact.sword_of_judgement", "stat.power", "stat.knowledge"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = reactionAction(declared, "p2", "artifact.sword_of_judgement", 1);
    expect(play).toBeTruthy();
    const resolved = passAllReactions(
      applyOk(declared, { ...play!, costCardIds: ["stat.power", "stat.knowledge"] })
    );
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseBonus: 2, defenseValue: 3 });
  });
});

describe("Celestial Necklace of Bliss — discard X / remove for attack", () => {
  it("option 0: discard 2 → +2 attack", () => {
    const state = duel("celestial-x");
    state.players.p1.hand = ["artifact.celestial_necklace_of_bliss", "stat.power", "stat.knowledge"];
    const declared = passUntil(declareGriffinsAttack(state), "p1");
    const play = reactionAction(declared, "p1", "artifact.celestial_necklace_of_bliss", 0);
    const resolved = passAllReactions(
      applyOk(declared, { ...play!, costCardIds: ["stat.power", "stat.knowledge"] })
    );
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(5);
  });

  it("option 1: remove the card → +4 attack", () => {
    const state = duel("celestial-remove");
    state.players.p1.hand = ["artifact.celestial_necklace_of_bliss"];
    state.players.p1.removed = [];
    const declared = passUntil(declareGriffinsAttack(state), "p1");
    const play = reactionAction(declared, "p1", "artifact.celestial_necklace_of_bliss", 1);
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(7);
    expect(resolved.players.p1.removed).toContain("artifact.celestial_necklace_of_bliss");
    expect(resolved.players.p1.discard).not.toContain("artifact.celestial_necklace_of_bliss");
  });
});

// ===========================================================================
// Flat defense reactions on your attacked unit (Vampires defense = 1)
// ===========================================================================

describe("Flat +defense reactions (defender side)", () => {
  const cases: Array<[string, string, number, number]> = [
    // [label, card, optionIndex, expected defenseValue from base 1]
    ["Dragon Scale Shield +2 defense", "artifact.dragon_scale_shield", 1, 3],
    ["Dragon Scale Armor +2 defense", "artifact.dragon_scale_armor", 1, 3],
    ["Red Dragon Flame Tongue +1 defense", "artifact.red_dragon_flame_tongue", 0, 2],
    ["Glyph of Gallantry +1 defense (OR side)", "artifact.glyph_of_gallantry", 1, 2],
    ["Quiet Eye of the Dragon +1 defense (OR side)", "artifact.quiet_eye_of_the_dragon", 1, 2],
    ["Sentinel's Shield +2 defense (plain side)", "artifact.sentinels_shield", 1, 3]
  ];

  it.each(cases)("%s", (_label, cardId, optionIndex, expected) => {
    const state = duel(`def-${cardId}-${optionIndex}`);
    state.players.p2.hand = [cardId];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = reactionAction(declared, "p2", cardId, optionIndex);
    expect(play, `${cardId} option ${optionIndex} should be a defender reaction`).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.defenseValue).toBe(expected);
  });
});

describe("Discard-1-for-defense reactions", () => {
  const cases: Array<[string, string, number]> = [
    ["Shield of the Yawning Dead discard 1 → +2", "artifact.shield_of_the_yawning_dead", 3],
    ["Sentinel's Shield discard 1 → +3", "artifact.sentinels_shield", 4]
  ];

  it.each(cases)("%s", (_label, cardId, expected) => {
    const state = duel(`disc-def-${cardId}`);
    state.players.p2.hand = [cardId, "stat.power"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = reactionAction(declared, "p2", cardId, 0);
    expect(play).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, { ...play!, costCardIds: ["stat.power"] }));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.defenseValue).toBe(expected);
    expect(resolved.players.p2.discard).toContain("stat.power");
  });
});

describe("Lion's Shield of Courage — discard X / remove for defense", () => {
  it("option 0: discard 2 → +2 defense", () => {
    const state = duel("lion-x");
    state.players.p2.hand = ["artifact.lions_shield_of_courage", "stat.power", "stat.knowledge"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = reactionAction(declared, "p2", "artifact.lions_shield_of_courage", 0);
    const resolved = passAllReactions(
      applyOk(declared, { ...play!, costCardIds: ["stat.power", "stat.knowledge"] })
    );
    expect(lastHitBy(resolved, "unit_p1_griffins")?.defenseValue).toBe(3);
  });

  it("option 1: remove the card → +4 defense", () => {
    const state = duel("lion-remove");
    state.players.p2.hand = ["artifact.lions_shield_of_courage"];
    state.players.p2.removed = [];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = reactionAction(declared, "p2", "artifact.lions_shield_of_courage", 1);
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.defenseValue).toBe(5);
    expect(resolved.players.p2.removed).toContain("artifact.lions_shield_of_courage");
  });
});

describe("Shield of the Damned — +defense paid in self-damage", () => {
  it("option 0: +3 defense and the defended unit suffers 1 damage", () => {
    const state = duel("damned-3");
    state.players.p2.hand = ["artifact.shield_of_the_damned"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = reactionAction(declared, "p2", "artifact.shield_of_the_damned", 0);
    expect(play).toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.defenseValue).toBe(4);
    expect(effectDamageFrom(resolved, "artifact.shield_of_the_damned", "unit_p2_vampires")).toBe(1);
  });

  it("option 1: +5 defense and the defended unit suffers 2 damage", () => {
    const state = duel("damned-5");
    state.players.p2.hand = ["artifact.shield_of_the_damned"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = reactionAction(declared, "p2", "artifact.shield_of_the_damned", 1);
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.defenseValue).toBe(6);
    expect(effectDamageFrom(resolved, "artifact.shield_of_the_damned", "unit_p2_vampires")).toBe(2);
  });
});

// ===========================================================================
// Combat buffs that last "for this Combat" (initiative / attack)
// ===========================================================================

describe("For-this-Combat initiative buffs on a selected unit", () => {
  const cases: Array<[string, string, number, number]> = [
    // [label, card, optionIndex (the initiative side), +amount]
    ["Boots of Speed +1 initiative (OR side)", "artifact.boots_of_speed", 1, 1],
    ["Equestrian's Gloves +1 initiative", "artifact.equestrians_gloves", 0, 1],
    ["Cape of Velocity +2 initiative", "artifact.cape_of_velocity", 0, 2]
  ];

  it.each(cases)("%s lasts the Combat", (_label, cardId, optionIndex, amount) => {
    const state = duel(`init-${cardId}`);
    state.players.p1.hand = [cardId];
    const griffins = state.combat!.units.unit_p1_griffins;
    const before = effectiveInitiative(griffins, state.activeEffects);

    const play = findPlay(state, cardId, optionIndex, "unit_p1_griffins");
    expect(play, `${cardId} initiative side should target a friendly unit in combat`).toBeTruthy();
    const after = applyOk(state, play!.action);

    const buffed = after.combat!.units.unit_p1_griffins;
    expect(effectiveInitiative(buffed, after.activeEffects)).toBe(before + amount);
    const effect = after.activeEffects.find((entry) => entry.target?.type === "unit" && entry.target.unitId === "unit_p1_griffins" && entry.modifiers.some((modifier) => modifier.type === "INITIATIVE_BONUS"));
    expect(effect?.duration).toEqual({ type: "combat" });
  });
});

describe("Quiet Eye of the Dragon — +1 attack for this Combat (option 0)", () => {
  it("the buffed unit then attacks for +1 (3 → 4)", () => {
    const state = duel("quiet-eye-attack");
    state.players.p1.hand = ["artifact.quiet_eye_of_the_dragon"];
    const play = findPlay(state, "artifact.quiet_eye_of_the_dragon", 0, "unit_p1_griffins");
    expect(play, "Quiet Eye's +attack side should target a friendly unit").toBeTruthy();
    const buffed = applyOk(state, play!.action);
    const resolved = passAllReactions(declareGriffinsAttack(buffed));
    expect(lastHitBy(resolved, "unit_p1_griffins")?.attackValue).toBe(4);
  });
});

// ===========================================================================
// Golden Bow (ranged): ignore-the-penalty (ongoing) and +2 attack to a ranged unit
// ===========================================================================

describe("Golden Bow", () => {
  // A ranged Marksmen forced into a melee attack (adjacent enemy) rolls at
  // disadvantage; the scripted dice make the lower face (-1) and the higher (+1)
  // distinguishable.
  function rangedMelee(seed: string): GameState {
    const state = createInitialGameState(seed);
    const combat = state.combat!;
    const marksmen = combat.units.unit_p1_marksmen;
    const vampires = combat.units.unit_p2_vampires;
    marksmen.type = "ranged";
    marksmen.attack = 5;
    marksmen.position = 9;
    marksmen.maxHealth = 50;
    marksmen.damage = 0;
    marksmen.abilities = [];
    vampires.position = 13;
    vampires.defense = 0;
    vampires.maxHealth = 50;
    vampires.damage = 0;
    vampires.abilities = [];
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    combat.activeUnitId = "unit_p1_marksmen";
    combat.dice.scriptedRolls = [1, -1, 0, 0, 0, 0];
    combat.dice.rollCount = 0;
    return state;
  }

  function declareMarksmenMelee(state: GameState): GameState {
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_vampires"
    });
  }

  it("control: a ranged unit's melee attack rolls at disadvantage (keeps the -1)", () => {
    const resolved = passAllReactions(declareMarksmenMelee(rangedMelee("bow-control")));
    expect(lastHitBy(resolved, "unit_p1_marksmen")?.attackValue).toBe(4); // 5 + (-1)
  });

  it("option 0 (ongoing) lifts the ranged penalty for the Combat (roll becomes normal)", () => {
    const state = rangedMelee("bow-penalty");
    state.players.p1.hand = ["artifact.golden_bow"];
    const play = findPlay(state, "artifact.golden_bow", 0);
    expect(play, "Golden Bow's ignore-penalty side should be a combat play").toBeTruthy();
    const inPlay = applyOk(state, play!.action);
    const effect = inPlay.activeEffects.find((entry) =>
      entry.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_PENALTY")
    );
    expect(effect?.duration).toEqual({ type: "combat" });

    const resolved = passAllReactions(declareMarksmenMelee(inPlay));
    // Penalty lifted → normal roll keeps the first die (+1): 5 + 1 = 6.
    expect(lastHitBy(resolved, "unit_p1_marksmen")?.attackValue).toBe(6);
  });

  it("option 1 grants +2 attack to a ranged attacker", () => {
    const state = rangedMelee("bow-attack");
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.players.p1.hand = ["artifact.golden_bow"];
    const declared = passUntil(declareMarksmenMelee(state), "p1");
    const play = reactionAction(declared, "p1", "artifact.golden_bow", 1);
    expect(play, "Golden Bow's +2 attack side should be offered for a ranged attacker").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    // Marksmen attack 5 + 2, melee disadvantage lifted off by no penalty waiver
    // here, so the scripted-0 die keeps it exact: but disadvantage on [0,0] = 0.
    expect(lastHitBy(resolved, "unit_p1_marksmen")?.attackValue).toBe(7);
  });
});

// ===========================================================================
// +Power spell reactions (cast a spell, empower it as you cast)
// ===========================================================================

describe("+Power spell reactions", () => {
  // Implosion amountByPower {0:0,1:2,3:4,5:6} distinguishes +2 vs +4 cleanly.
  function castImplosion(seed: string, hand: string[]): GameState {
    const state = castCombat(seed);
    state.players.p1.hand = ["spell.implosion", ...hand];
    const cast = findCast(state, "p1", "spell.implosion", "unit_p2_skeletons");
    expect(cast, "Implosion should be castable").toBeTruthy();
    return applyOk(state, cast!.action);
  }

  // Lightning Bolt amountByPower {0:2,1:3,2:4} for the smaller +1 boosts.
  function castBolt(seed: string, hand: string[]): GameState {
    const state = castCombat(seed);
    state.players.p1.hand = ["spell.lightning_bolt", ...hand];
    const cast = findCast(state, "p1", "spell.lightning_bolt", "unit_p2_skeletons");
    expect(cast, "Lightning Bolt should be castable").toBeTruthy();
    return applyOk(state, cast!.action);
  }

  it("Titan's Cuirass: +2 Power (option 1) vs discard-1 +4 Power (option 0)", () => {
    const two = castImplosion("cuirass-2", ["artifact.titans_cuirass"]);
    const play2 = reactionAction(two, "p1", "artifact.titans_cuirass", 1);
    expect(play2).toBeTruthy();
    expect(passAllReactions(applyOk(two, play2!)).combat!.units.unit_p2_skeletons.damage).toBe(2);

    const four = castImplosion("cuirass-4", ["artifact.titans_cuirass", "stat.knowledge"]);
    const play4 = reactionAction(four, "p1", "artifact.titans_cuirass", 0);
    expect(play4).toBeTruthy();
    const resolved = passAllReactions(applyOk(four, { ...play4!, costCardIds: ["stat.knowledge"] }));
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("Sandals of the Saint: discard 2 → +2 Power (option 0) vs remove → +4 Power (option 1)", () => {
    const two = castImplosion("sandals-2", ["artifact.sandals_of_the_saint", "stat.attack", "stat.defense"]);
    const play2 = reactionAction(two, "p1", "artifact.sandals_of_the_saint", 0);
    expect(play2).toBeTruthy();
    expect(
      passAllReactions(applyOk(two, { ...play2!, costCardIds: ["stat.attack", "stat.defense"] })).combat!.units
        .unit_p2_skeletons.damage
    ).toBe(2);

    const four = castImplosion("sandals-4", ["artifact.sandals_of_the_saint"]);
    four.players.p1.removed = [];
    const play4 = reactionAction(four, "p1", "artifact.sandals_of_the_saint", 1);
    expect(play4).toBeTruthy();
    const resolved = passAllReactions(applyOk(four, play4!));
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
    expect(resolved.players.p1.removed).toContain("artifact.sandals_of_the_saint");
  });

  it("Breastplate of Brimstone (option 1): +1 Power, +1 more per discarded card", () => {
    // 0 discards → +1 Power → Implosion power 1 → 2 damage.
    const plain = castImplosion("brimstone-1", ["artifact.breastplate_of_brimstone"]);
    const playPlain = reactionAction(plain, "p1", "artifact.breastplate_of_brimstone", 1);
    expect(playPlain).toBeTruthy();
    expect(passAllReactions(applyOk(plain, playPlain!)).combat!.units.unit_p2_skeletons.damage).toBe(2);

    // 2 discards → +3 Power → Implosion power 3 → 4 damage.
    const big = castImplosion("brimstone-3", [
      "artifact.breastplate_of_brimstone",
      "stat.attack",
      "stat.defense"
    ]);
    const playBig = reactionAction(big, "p1", "artifact.breastplate_of_brimstone", 1);
    expect(playBig).toBeTruthy();
    const resolved = passAllReactions(
      applyOk(big, { ...playBig!, costCardIds: ["stat.attack", "stat.defense"] })
    );
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("Dragon Wing Tabard (option 1) and Rib Cage (option 1) each add +1 Power (Bolt 2 → 3)", () => {
    for (const cardId of ["artifact.dragon_wing_tabard", "artifact.rib_cage"]) {
      const casted = castBolt(`pow1-${cardId}`, [cardId]);
      const play = reactionAction(casted, "p1", cardId, 1);
      expect(play, `${cardId} +1 Power side should be offered`).toBeTruthy();
      expect(passAllReactions(applyOk(casted, play!)).combat!.units.unit_p2_skeletons.damage).toBe(3);
    }
  });
});

describe("Breastplate of Brimstone (option 0) searches the Spell deck", () => {
  it("queues a 2-card Spell-deck Search on the map", () => {
    const state = mapState("brimstone-search");
    state.players.p1.hand = ["artifact.breastplate_of_brimstone"];
    const play = findPlay(state, "artifact.breastplate_of_brimstone", 0);
    expect(play, "the Search side should be offered").toBeTruthy();
    const after = applyOk(state, play!.action);
    const searching =
      Boolean(
        after.adventure?.rewardQueue.some(
          (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells"
        )
      ) || after.pendingChoice?.type === "DECK_SEARCH";
    expect(searching, "a Spell-deck search should be queued or open").toBe(true);
  });
});

// ===========================================================================
// Resource / gold map artifacts (the "gain X — OR — remove for more" shape)
// ===========================================================================

type ResKey = "gold" | "buildingMaterials" | "valuables";

describe("Gain / remove-for-more resource artifacts", () => {
  const cases: Array<{
    label: string;
    card: string;
    res: ResKey;
    small: number;
    big: number;
    removes: boolean;
  }> = [
    { label: "Endless Bag of Gold", card: "artifact.endless_bag_of_gold", res: "gold", small: 3, big: 6, removes: true },
    { label: "Endless Sack of Gold", card: "artifact.endless_sack_of_gold", res: "gold", small: 5, big: 8, removes: true },
    {
      label: "Inexhaustible Cart of Lumber",
      card: "artifact.inexhaustible_cart_of_lumber",
      res: "buildingMaterials",
      small: 2,
      big: 4,
      removes: true
    },
    {
      label: "Everpouring Vial of Mercury",
      card: "artifact.everpouring_vial_of_mercury",
      res: "valuables",
      small: 1,
      big: 2,
      removes: true
    }
  ];

  it.each(cases)("$label option 0 gains $small (card discarded)", ({ card, res, small }) => {
    const state = mapState(`res-small-${card}`);
    state.players.p1.hand = [card];
    state.players.p1.resources[res] = 0;
    const play = findPlay(state, card, 0);
    expect(play, `${card} option 0 should be a map play`).toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.resources[res]).toBe(small);
    expect(after.players.p1.discard).toContain(card);
  });

  it.each(cases)("$label option 1 removes the card and gains $big", ({ card, res, big }) => {
    const state = mapState(`res-big-${card}`);
    state.players.p1.hand = [card];
    state.players.p1.removed = [];
    state.players.p1.resources[res] = 0;
    const play = findPlay(state, card, 1);
    expect(play, `${card} option 1 should be a map play`).toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.resources[res]).toBe(big);
    expect(after.players.p1.removed).toContain(card);
    expect(after.players.p1.discard).not.toContain(card);
  });
});

describe("Everflowing Crystal Cloak — discard 3 for 2 valuables OR gain 1", () => {
  it("option 0: discard 3 cards → +2 valuables", () => {
    const state = mapState("cloak-discard");
    state.players.p1.hand = ["artifact.everflowing_crystal_cloak", "stat.attack", "stat.defense", "stat.power"];
    state.players.p1.resources.valuables = 0;
    const play = findPlay(state, "artifact.everflowing_crystal_cloak", 0);
    expect(play).toBeTruthy();
    const after = applyOk(state, {
      ...play!.action,
      costCardIds: ["stat.attack", "stat.defense", "stat.power"]
    } as GameAction);
    expect(after.players.p1.resources.valuables).toBe(2);
    for (const paid of ["stat.attack", "stat.defense", "stat.power"]) {
      expect(after.players.p1.discard).toContain(paid);
    }
  });

  it("option 1: plain +1 valuables (no cost)", () => {
    const state = mapState("cloak-plain");
    state.players.p1.hand = ["artifact.everflowing_crystal_cloak"];
    state.players.p1.resources.valuables = 0;
    const play = findPlay(state, "artifact.everflowing_crystal_cloak", 1);
    const after = applyOk(state, play!.action);
    expect(after.players.p1.resources.valuables).toBe(1);
  });

  it("requires exactly 3 paid cards for option 0 (underpay is rejected)", () => {
    const state = mapState("cloak-underpay");
    state.players.p1.hand = [
      "artifact.everflowing_crystal_cloak",
      "stat.attack",
      "stat.defense",
      "stat.power"
    ];
    state.players.p1.resources.valuables = 0;
    const play = findPlay(state, "artifact.everflowing_crystal_cloak", 0);
    expect(play, "with 3 spare cards the discard-3 side is offered").toBeTruthy();
    // Underpaying (only 2 of the required 3) is rejected; no valuables are gained.
    const result = applyAction(state, { ...play!.action, costCardIds: ["stat.attack", "stat.defense"] } as GameAction);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.players.p1.resources.valuables).toBe(0);
  });

  it("option 0 is hidden when the player cannot afford to discard 3", () => {
    const state = mapState("cloak-cantpay");
    state.players.p1.hand = ["artifact.everflowing_crystal_cloak", "stat.attack", "stat.defense"];
    // Only 2 other cards: the discard-3 side must not be offered.
    expect(findPlay(state, "artifact.everflowing_crystal_cloak", 0)).toBeFalsy();
    // The plain +1 valuables side is still available.
    expect(findPlay(state, "artifact.everflowing_crystal_cloak", 1)).toBeTruthy();
  });
});

describe("Cape of Velocity — OR side gains 2 gold (map)", () => {
  it("option 1 gains 2 gold", () => {
    const state = mapState("cape-gold");
    state.players.p1.hand = ["artifact.cape_of_velocity"];
    state.players.p1.resources.gold = 0;
    const play = findPlay(state, "artifact.cape_of_velocity", 1);
    expect(play, "Cape of Velocity's gold side should be a map play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.resources.gold).toBe(2);
  });
});

// ===========================================================================
// Hero-movement map sides (Boots of Speed / Equestrian's Gloves)
// ===========================================================================

describe("Hero +1 movement sides", () => {
  const cases: Array<[string, string, number]> = [
    ["Boots of Speed (option 0)", "artifact.boots_of_speed", 0],
    ["Equestrian's Gloves (option 1)", "artifact.equestrians_gloves", 1]
  ];

  it.each(cases)("%s grants the Hero +1 movement", (_label, card, optionIndex) => {
    const state = mapState(`move-${card}`);
    state.players.p1.hand = [card];
    const before = getMainHero(state, "p1")!.movementPoints;
    const play = findPlay(state, card, optionIndex);
    expect(play, `${card} movement side should be a map play`).toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(before + 1);
  });
});

// ===========================================================================
// Card economy: discard-pick, search, expert use, draw
// ===========================================================================

/** Repeatedly take the first option of any open discard-pick / option choice. */
function resolveOptionChoices(state: GameState): GameState {
  let current = state;
  let safety = 8;
  while (current.pendingChoice?.type === "OPTION_CHOICE" && safety-- > 0) {
    current = applyOk(current, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: current.pendingChoice.id,
      optionIndex: 0
    });
  }
  return current;
}

describe("Skull Helmet", () => {
  it("option 0 returns a non-Artifact card from the discard pile to hand", () => {
    const state = mapState("skull-take");
    state.adventure!.spellBook = false; // keep the discard-pick to a single 'to hand' route
    state.players.p1.hand = ["artifact.skull_helmet"];
    state.players.p1.discard = ["stat.attack"];
    const play = findPlay(state, "artifact.skull_helmet", 0);
    expect(play).toBeTruthy();
    const after = resolveOptionChoices(applyOk(state, play!.action));
    expect(after.players.p1.hand).toContain("stat.attack");
  });

  it("option 1 strips a morale-using enemy's positive token (control: 0 stays 0)", () => {
    const state = mapState("skull-morale");
    state.players.p1.hand = ["artifact.skull_helmet"];
    state.players.p2.factionId = "castle"; // a faction that uses morale (Necropolis ignores it)
    state.players.p2.morale = 1;
    const play = findPlay(state, "artifact.skull_helmet", 1);
    expect(play).toBeTruthy();
    expect(applyOk(state, play!.action).players.p2.morale).toBe(0);

    const noMorale = mapState("skull-morale-zero");
    noMorale.players.p1.hand = ["artifact.skull_helmet"];
    noMorale.players.p2.factionId = "castle";
    noMorale.players.p2.morale = 0;
    const play2 = findPlay(noMorale, "artifact.skull_helmet", 1);
    expect(applyOk(noMorale, play2!.action).players.p2.morale).toBe(0);
  });

  it("option 0 (take a card from discard) is usable IN COMBAT, not just on the map", () => {
    // Reported bug: in battle the player could not use Skull Helmet's "take 1
    // non-Artifact card from your discard" side. An instant artifact is a
    // click-to-use combat play, so option 0 must be offered + resolve mid-Combat.
    const state = createInitialGameState("skull-take-combat");
    state.players.p1.hand = ["artifact.skull_helmet"];
    state.players.p2.hand = [];
    state.players.p1.discard = ["stat.attack"]; // a non-artifact card to recover
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const play = findPlay(state, "artifact.skull_helmet", 0);
    expect(play, "option 0 must be offered mid-Combat (instant artifact)").toBeTruthy();

    const opened = applyOk(state, play!.action);
    expect((opened.pendingChoice as { context?: string } | null)?.context).toBe("discard-pick");
    const took = applyOk(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 0
    });
    expect(took.players.p1.hand).toContain("stat.attack");
  });
});

describe("Hourglass of the Evil Hour", () => {
  it("option 0 strips a morale-using enemy's positive token (+1 → 0)", () => {
    const state = mapState("hourglass-strip");
    state.players.p1.hand = ["artifact.hourglass_of_the_evil_hour"];
    state.players.p2.factionId = "castle"; // Necropolis ignores morale; Castle uses it
    state.players.p2.morale = 1; // positive morale caps at +1 in this engine
    const play = findPlay(state, "artifact.hourglass_of_the_evil_hour", 0);
    expect(play).toBeTruthy();
    expect(applyOk(state, play!.action).players.p2.morale).toBe(0);
  });

  it("option 1 rolls the Attack die and gains morale only on a 0", () => {
    const state = mapState("hourglass-roll");
    state.players.p1.hand = ["artifact.hourglass_of_the_evil_hour"];
    state.players.p1.morale = 0;
    const play = findPlay(state, "artifact.hourglass_of_the_evil_hour", 1);
    expect(play).toBeTruthy();
    const after = applyOk(state, play!.action);
    const rolled = [...after.eventLog]
      .reverse()
      .find((event): event is Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> => event.type === "ADVENTURE_DICE_ROLLED");
    expect(rolled, "the Attack die should have been rolled").toBeTruthy();
    const face = rolled!.attackRolls?.[0];
    // Engine contract: gain +1 morale iff the rolled face is exactly 0.
    expect(after.players.p1.morale).toBe(face === 0 ? 1 : 0);
  });
});

describe("Crown of Dragontooth", () => {
  it("option 0 returns 2 Spell cards from the discard pile to hand", () => {
    const state = mapState("dragontooth-take2");
    state.adventure!.spellBook = false;
    state.players.p1.hand = ["artifact.crown_of_dragontooth"];
    state.players.p1.discard = ["spell.haste", "spell.bless"];
    const play = findPlay(state, "artifact.crown_of_dragontooth", 0);
    expect(play).toBeTruthy();
    const after = resolveOptionChoices(applyOk(state, play!.action));
    expect(after.players.p1.hand).toEqual(expect.arrayContaining(["spell.haste", "spell.bless"]));
  });

  it("option 1 removes 1 Spell from hand and Searches the Spell deck", () => {
    const state = mapState("dragontooth-search");
    state.players.p1.hand = ["artifact.crown_of_dragontooth", "spell.haste"];
    state.players.p1.removed = [];
    const play = findPlay(state, "artifact.crown_of_dragontooth", 1);
    expect(play).toBeTruthy();
    const after = applyOk(state, { ...play!.action, costCardIds: ["spell.haste"] } as GameAction);
    // The paid Spell is removed from the game (not discarded), and a Spell Search opens.
    expect(after.players.p1.removed).toContain("spell.haste");
    expect(after.players.p1.discard).not.toContain("spell.haste");
    const searching =
      Boolean(
        after.adventure?.rewardQueue.some(
          (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells"
        )
      ) || after.pendingChoice?.type === "DECK_SEARCH";
    expect(searching, "a Spell-deck search should be queued or open").toBe(true);
  });
});

describe("Rib Cage (option 0): recover a Spell and reshuffle the discard pile", () => {
  it("returns a Spell to hand and shuffles the rest of the discard into the deck", () => {
    const state = mapState("ribcage-recover");
    state.adventure!.spellBook = false;
    state.players.p1.hand = ["artifact.rib_cage"];
    state.players.p1.discard = ["spell.haste", "stat.attack"];
    state.players.p1.deck = [];
    const play = findPlay(state, "artifact.rib_cage", 0);
    expect(play).toBeTruthy();
    const after = resolveOptionChoices(applyOk(state, play!.action));
    expect(after.players.p1.hand).toContain("spell.haste");
    // The non-Spell leftover was shuffled back into the deck (not left in discard).
    expect(after.players.p1.discard).not.toContain("stat.attack");
    expect(after.players.p1.deck).toContain("stat.attack");
  });
});

describe("Dragon Wing Tabard (option 0): discard a random card from the enemy hand", () => {
  it("the enemy loses exactly one card from hand to their discard", () => {
    const state = mapState("tabard-discard");
    state.players.p1.hand = ["artifact.dragon_wing_tabard"];
    state.players.p2.hand = ["stat.attack", "stat.defense"];
    state.players.p2.discard = [];
    const play = findPlay(state, "artifact.dragon_wing_tabard", 0);
    expect(play).toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p2.hand).toHaveLength(1);
    expect(after.players.p2.discard).toHaveLength(1);
  });
});

describe("Expert-use / draw relics", () => {
  it("Helm of Heavenly Enlightenment option 0 grants an expert use", () => {
    const state = mapState("helm-expert");
    state.players.p1.hand = ["artifact.helm_of_heavenly_enlightenment"];
    const before = state.players.p1.combatStats.expertUseBonusThisRound ?? 0;
    const play = findPlay(state, "artifact.helm_of_heavenly_enlightenment", 0);
    expect(play).toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.combatStats.expertUseBonusThisRound ?? 0).toBe(before + 1);
  });

  it("Helm of Heavenly Enlightenment option 1 draws 2 cards", () => {
    const state = mapState("helm-draw");
    state.players.p1.hand = ["artifact.helm_of_heavenly_enlightenment"];
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    const play = findPlay(state, "artifact.helm_of_heavenly_enlightenment", 1);
    const after = applyOk(state, play!.action);
    expect(after.players.p1.hand).toEqual(expect.arrayContaining(["stat.power", "stat.defense"]));
    expect(after.players.p1.deck).toEqual(["stat.attack"]);
  });

  it("Pendant of Courage option 1 grants an expert use", () => {
    const state = mapState("pendant-courage-expert");
    state.players.p1.hand = ["artifact.pendant_of_courage"];
    const before = state.players.p1.combatStats.expertUseBonusThisRound ?? 0;
    const play = findPlay(state, "artifact.pendant_of_courage", 1);
    expect(play).toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(after.players.p1.combatStats.expertUseBonusThisRound ?? 0).toBe(before + 1);
  });

  it("Pendant of Courage option 0 arms a one-shot Search repeat for this turn", () => {
    const state = mapState("pendant-courage-repeat");
    state.players.p1.hand = ["artifact.pendant_of_courage"];
    const play = findPlay(state, "artifact.pendant_of_courage", 0);
    expect(play).toBeTruthy();
    const after = applyOk(state, play!.action);
    const effect = after.activeEffects.find((entry) =>
      entry.modifiers.some((modifier) => modifier.type === "SEARCH_REPEAT_ONCE")
    );
    expect(effect, "a SEARCH_REPEAT_ONCE effect should be created").toBeTruthy();
    expect(effect!.duration).toEqual({ type: "current-turn" });
  });
});

// ===========================================================================
// Orb of Silt (Earth) — parity with the other three elemental Orbs
// ===========================================================================

describe("Orb of Silt (Earth Magic)", () => {
  function castImplosion(seed: string, hand: string[]): GameState {
    const state = castCombat(seed);
    state.players.p1.hand = ["spell.implosion", ...hand];
    const cast = findCast(state, "p1", "spell.implosion", "unit_p2_skeletons");
    expect(cast, "Implosion should be castable").toBeTruthy();
    return applyOk(state, cast!.action);
  }

  it("option 0 doubles the Power of an Earth spell for the Combat (2 → 4 damage)", () => {
    // Spare Power statistics keep p1's empower window open so the cast waits on
    // the stack while we set the Power actually paid (the batch-orb pattern).
    // Control: Implosion at Power 2 deals 2 (amountByPower {0:0,1:2,3:4,5:6}).
    const control = castImplosion("silt-control", ["stat.power", "stat.power"]);
    control.stack[0]!.modifiers.spellPowerBonus = 2;
    expect(passAllReactions(control).combat!.units.unit_p2_skeletons.damage).toBe(2);

    // Play Orb of Silt option A in combat, then cast: Power 2 doubles to 4 → 4 damage.
    const setup = castCombat("silt-double");
    setup.players.p1.hand = ["artifact.orb_of_silt"];
    const play = findPlay(setup, "artifact.orb_of_silt", 0);
    expect(play, "Orb of Silt option A should be a combat play").toBeTruthy();
    const inPlay = applyOk(setup, play!.action);
    const doubling = inPlay.activeEffects.find((entry) =>
      entry.modifiers.some((modifier) => modifier.type === "SPELL_POWER_DOUBLE" && modifier.school === "earth")
    );
    expect(doubling?.duration).toEqual({ type: "combat" });

    inPlay.players.p1.hand = ["spell.implosion", "stat.power", "stat.power"];
    const cast = findCast(inPlay, "p1", "spell.implosion", "unit_p2_skeletons");
    const casted = applyOk(inPlay, cast!.action);
    casted.stack[0]!.modifiers.spellPowerBonus = 2;
    expect(passAllReactions(casted).combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("option 1 removes the Orb for +5 Power on an Earth cast (Implosion 0 → 6)", () => {
    const casted = castImplosion("silt-plus5", ["artifact.orb_of_silt"]);
    casted.players.p1.removed = [];
    const play = reactionAction(casted, "p1", "artifact.orb_of_silt", 1);
    expect(play, "Orb of Silt option B should be offered toward an Earth cast").toBeTruthy();
    const resolved = passAllReactions(applyOk(casted, play!));
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(6);
    expect(resolved.players.p1.removed).toContain("artifact.orb_of_silt");
  });
});

// ===========================================================================
// Interference (ability) + Plate of the Dying Light (relic): their "+X defense"
// base also works as a plain defense reaction to a PHYSICAL attack (like
// Armorer), not only as a spell-damage reduction.
// ===========================================================================

function attackReaction(
  state: GameState,
  playerId: "p1" | "p2",
  cardId: string,
  opts: { optionIndex?: number; mode?: "basic" | "expert" } = {}
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const wantMode = opts.mode ?? "basic";
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === cardId &&
      entry.action.optionIndex === opts.optionIndex &&
      (entry.action.mode ?? "basic") === wantMode &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

describe("Interference (ability) as a defense reaction vs a physical attack", () => {
  it("control: Griffins (3) vs Vampires (defense 1) deal 2 damage", () => {
    const resolved = passAllReactions(declareGriffinsAttack(duel("interf-control")));
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseValue: 1, damage: 2 });
  });

  it("basic +1 defense reduces the incoming hit (2 → 1 damage)", () => {
    const state = duel("interf-basic");
    state.players.p2.hand = ["ability.interference"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = attackReaction(declared, "p2", "ability.interference");
    expect(play, "Interference should be offered to the defender in the attack window").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseValue: 2, damage: 1 });
  });

  it("expert +2 defense reduces the incoming hit to 0 (needs an expert use)", () => {
    const state = duel("interf-expert");
    state.players.p2.hand = ["ability.interference"];
    state.players.p2.limits.expertUses = 1;
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = attackReaction(declared, "p2", "ability.interference", { mode: "expert" });
    expect(play, "expert Interference should be offered with an expert use available").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseValue: 3, damage: 0 });
  });

  it("the +defense lands on the reacting defender's OWN attacked unit, for the Combat", () => {
    const state = duel("interf-target");
    state.players.p2.hand = ["ability.interference"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = attackReaction(declared, "p2", "ability.interference");
    expect(play).toBeTruthy();
    const after = applyOk(declared, play!);
    const effect = after.activeEffects.find((entry) =>
      entry.modifiers.some((modifier) => modifier.type === "DEFENSE_BONUS")
    );
    // Buffs the defender's own unit (the Vampires being attacked), never the enemy,
    // and lasts the whole Combat (so it also softens later hits on that unit).
    expect(effect?.target).toEqual({ type: "unit", unitId: "unit_p2_vampires" });
    expect(effect?.duration).toEqual({ type: "combat" });
  });
});

describe("Plate of the Dying Light as a defense reaction vs a physical attack", () => {
  it("option 0 grants +1 defense against the attack (2 → 1 damage)", () => {
    const state = duel("plate-atk-1");
    state.players.p2.hand = ["artifact.plate_of_the_dying_light"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = attackReaction(declared, "p2", "artifact.plate_of_the_dying_light", { optionIndex: 0 });
    expect(play, "Plate option 0 should be a defender reaction to an attack").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseValue: 2, damage: 1 });
  });

  it("option 1 grants +4 defense (damage to 0) and removes the card", () => {
    const state = duel("plate-atk-4");
    state.players.p2.hand = ["artifact.plate_of_the_dying_light"];
    state.players.p2.removed = [];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = attackReaction(declared, "p2", "artifact.plate_of_the_dying_light", { optionIndex: 1 });
    expect(play, "Plate option 1 should be a defender reaction to an attack").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseValue: 5, damage: 0 });
    expect(resolved.players.p2.removed).toContain("artifact.plate_of_the_dying_light");
  });

  it("the +defense is a Combat-long effect on the attacked unit (persists past the hit)", () => {
    const state = duel("plate-atk-persist");
    state.players.p2.hand = ["artifact.plate_of_the_dying_light"];
    const declared = passUntil(declareGriffinsAttack(state), "p2");
    const play = attackReaction(declared, "p2", "artifact.plate_of_the_dying_light", { optionIndex: 0 });
    const afterFirst = passAllReactions(applyOk(declared, play!));
    // A combat-duration DEFENSE_BONUS (+ inert spell-reduction) remains on the
    // attacked unit, so later hits on it are softened too.
    const effect = afterFirst.activeEffects.find(
      (entry) =>
        entry.target?.type === "unit" &&
        entry.target.unitId === "unit_p2_vampires" &&
        entry.modifiers.some((modifier) => modifier.type === "DEFENSE_BONUS")
    );
    expect(effect?.duration).toEqual({ type: "combat" });
    expect(effect!.modifiers.some((modifier) => modifier.type === "SPELL_DAMAGE_REDUCTION")).toBe(true);
  });
});
