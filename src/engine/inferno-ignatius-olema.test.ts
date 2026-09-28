import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { expireEffectsForCombatEnd, getActiveAttackBonus, unitCardTargetLocked } from "./active-effects";
import { makeCombatUnitFromArmy } from "./adventure";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { chooseComputerAction } from "./computer/policy";
import { applyAction, createInitialGameState, getLegalActions, getLegalReactionsForTrigger, getPlayerView } from "./index";
import { unitRankFold } from "./unit-experience";
import type { CombatUnitState, GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Ignatius + Olema (Inferno, Gamefound preview). Player rulings (2026-09-27):
 *  - Ignatius I/IV cover a Familiars card EXACTLY like Sandro's Cloak (Horde of
 *    Imps A3 D1 HP2 I7 on the Pack; Legion of Imps A3 D1 HP3 I8 on Few/Pack/
 *    Horde, always on top); the covers keep the Pack's printed ability (Mana
 *    Leech) and must work with Unit Experience. VI: +2 Attack / +1 Health to
 *    all your Familiars for this Combat.
 *  - Olema I: "Set all dice to -1" (the defender's post-roll instant); IV: the
 *    selected (attacking) unit has -2 Attack; VI: the selected enemy unit has
 *    -1 Attack and cannot be targeted by its side's Spell / Ability /
 *    Specialty / Statistic / Artifact cards this Combat.
 * Every behaviour test asserts the observable outcome against a control.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (safety-- > 0 && current.reactionWindow) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function passUntil(state: GameState, trigger: string): GameState {
  let current = state;
  let safety = 30;
  while (safety-- > 0 && current.reactionWindow && current.reactionWindow.triggerEvent.type !== trigger) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function familiars(
  unitId: UnitId,
  controllerId: PlayerId,
  side: "few" | "pack",
  position: number,
  extra: { experience?: number } = {},
): CombatUnitState {
  const unit = makeCombatUnitFromArmy(
    { id: `army_${unitId}`, unitDefId: "inferno.familiars", side, ...extra },
    controllerId,
    unitId,
    position,
    "binh",
  );
  if (!unit) throw new Error("Familiars definition missing");
  return unit;
}

/** p1's own activation with a Pack of Familiars (active) and a Few Familiars on the board. */
function ignatiusCombat(seed: string, hand: string[], extra: { experience?: number } = {}): GameState {
  const state = createInitialGameState(seed);
  const units = state.combat!.units;
  delete units.unit_p1_marksmen;
  units.unit_p1_familiars = familiars("unit_p1_familiars", "p1", "pack", 1, extra);
  units.unit_p1_few_familiars = familiars("unit_p1_few_familiars", "p1", "few", 2);
  state.players.p1.hand = [...hand];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_familiars";
  return state;
}

function cardPlays(state: GameState, playerId: PlayerId, cardId: string) {
  return getLegalActions(state, playerId).filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId,
  );
}

function playOn(state: GameState, playerId: PlayerId, cardId: string, unitId: UnitId): GameState {
  const play = cardPlays(state, playerId, cardId).find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" && legal.action.target.unitId === unitId,
  );
  expect(play, `${cardId} should be playable on ${unitId}`).toBeTruthy();
  return applyOk(state, play!.action);
}

/** Active-effect Attack modifier on `unit` for a melee attack on any enemy. */
function attackBonus(state: GameState, unit: CombatUnitState): number {
  const enemy = Object.values(state.combat!.units).find((candidate) => candidate.controllerId !== unit.controllerId)!;
  return getActiveAttackBonus(state, { attacker: unit, defender: enemy, attackKind: "melee" });
}

const targetIds = (plays: ReturnType<typeof cardPlays>) =>
  plays.flatMap((legal) =>
    legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" ? [legal.action.target.unitId] : [],
  );

describe("Ignatius + Olema registration", () => {
  it("are Inferno heroes with the supplied stats, skills and I/IV/VI specialty track", () => {
    expect(coreFactionDefinitions.inferno.heroes).toEqual(expect.arrayContaining(["ignatius", "olema"]));
    expect(coreHeroDefinitions.ignatius).toMatchObject({
      faction: "inferno",
      class: "Demoniac",
      type: "might",
      startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
      startingAbilityCardId: "ability.tactics",
      specialtyCardIds: { 1: "specialty.ignatius.1", 4: "specialty.ignatius.4", 6: "specialty.ignatius.6" },
    });
    expect(coreHeroDefinitions.olema).toMatchObject({
      faction: "inferno",
      class: "Heretic",
      type: "magic",
      startingStats: { attack: 1, defense: 1, power: 2, knowledge: 1 },
      startingAbilityCardId: "ability.wisdom",
      specialtyCardIds: { 1: "specialty.olema.1", 4: "specialty.olema.4", 6: "specialty.olema.6" },
    });
    expect(cardLibrary["specialty.ignatius.1"].timing).toBe("instant");
    expect(cardLibrary["specialty.ignatius.4"].timing).toBe("instant");
    expect(cardLibrary["specialty.ignatius.6"].timing).toBe("ongoing");
    expect(cardLibrary["specialty.olema.1"].timing).toBe("instant");
    expect(cardLibrary["specialty.olema.4"].timing).toBe("instant");
    expect(cardLibrary["specialty.olema.6"].timing).toBe("ongoing");
  });
});

describe("Ignatius I / IV — Horde and Legion of Imps (Sandro-style covers)", () => {
  it("Horde of Imps goes on the Pack of Familiars only and keeps the Pack's Mana Leech", () => {
    const state = ignatiusCombat("ign-horde", ["specialty.ignatius.1"]);
    expect(targetIds(cardPlays(state, "p1", "specialty.ignatius.1")).sort(), "Pack of Familiars only").toEqual([
      "unit_p1_familiars",
    ]);

    const after = playOn(state, "p1", "specialty.ignatius.1", "unit_p1_familiars");
    const unit = after.combat!.units.unit_p1_familiars;
    expect(unit).toMatchObject({
      name: "Familiars",
      cardName: "Horde of Imps",
      attack: 3,
      defense: 1,
      maxHealth: 2,
      initiative: 7,
    });
    expect(unit.abilities, "the cover keeps the Pack's printed Mana Leech").toContain("familiar-spell-tax");
    expect(unit.assets?.cardImage).toBe("/assets/hero_specialties-ignatius-1.webp");
    expect(after.players.p1.hand).not.toContain("specialty.ignatius.1");
  });

  it("the covered Familiars' Mana Leech really taxes an enemy Spell cast from hand", () => {
    const state = ignatiusCombat("ign-horde-tax", ["specialty.ignatius.1"]);
    const covered = playOn(state, "p1", "specialty.ignatius.1", "unit_p1_familiars");
    // p2 (the enemy) casts Magic Arrow from hand during its own activation.
    delete covered.combat!.units.unit_p1_few_familiars;
    covered.players.p2.hand = ["spell.magic_arrow", "stat.attack"];
    covered.activePlayerId = "p2";
    covered.combat!.activeUnitId = "unit_p2_skeletons";
    const cast = getLegalActions(covered, "p2").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow",
    );
    expect(cast).toBeTruthy();
    const taxed = applyOk(covered, cast!.action);
    expect(taxed.pendingChoice).toMatchObject({ type: "COMBAT_HAND_DISCARD", kind: "familiar-choose-discard" });
  });

  it("CONTROL: Sandro's Horde of Zombies still leaves the Pack's printed ability inactive", () => {
    const state = createInitialGameState("zombie-horde-control");
    const zombies = makeCombatUnitFromArmy(
      { id: "army_z", unitDefId: "necropolis.zombies", side: "pack" },
      "p2",
      "unit_p2_zombies",
      17,
      "binh",
    )!;
    expect(zombies.abilities).toContain("zombie-resilience");
    state.combat!.units.unit_p2_zombies = zombies;
    state.players.p2.hand = ["specialty.sandro.4"];
    state.players.p1.hand = [];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_zombies";
    const after = playOn(state, "p2", "specialty.sandro.4", "unit_p2_zombies");
    expect(after.combat!.units.unit_p2_zombies.cardName).toBe("Horde of Zombies");
    expect(after.combat!.units.unit_p2_zombies.abilities).not.toContain("zombie-resilience");
  });

  it("Legion of Imps goes on a Few Familiars (A3 D1 HP3 I8) and still carries the Pack's Mana Leech", () => {
    const state = ignatiusCombat("ign-legion-few", ["specialty.ignatius.4"]);
    expect(targetIds(cardPlays(state, "p1", "specialty.ignatius.4")).sort()).toEqual([
      "unit_p1_familiars",
      "unit_p1_few_familiars",
    ]);
    const after = playOn(state, "p1", "specialty.ignatius.4", "unit_p1_few_familiars");
    const unit = after.combat!.units.unit_p1_few_familiars;
    expect(unit).toMatchObject({ cardName: "Legion of Imps", attack: 3, defense: 1, maxHealth: 3, initiative: 8 });
    expect(unit.abilities).toContain("familiar-spell-tax");
  });

  it("the Legion stays on top of a Horde; its defeat reveals the Horde with the excess damage", () => {
    const state = ignatiusCombat("ign-legion-horde", ["specialty.ignatius.1", "specialty.ignatius.4"]);
    const horde = playOn(state, "p1", "specialty.ignatius.1", "unit_p1_familiars");
    const legion = playOn(horde, "p1", "specialty.ignatius.4", "unit_p1_familiars");
    const unit = legion.combat!.units.unit_p1_familiars;
    expect(unit.transforms?.map((entry) => entry.name)).toEqual(["Horde of Imps", "Legion of Imps"]);
    expect(unit.cardName).toBe("Legion of Imps");

    unit.damage = 4; // Legion bar 3 + 1 excess
    markUnitRemovedIfNeeded(legion, unit);
    expect(unit.cardName).toBe("Horde of Imps");
    expect(unit.damage).toBe(1);
    expect(unit.maxHealth).toBe(2);
    expect(legion.players.p1.discard).toContain("specialty.ignatius.4");
  });

  it("a veteran Familiars keeps its rank statistics on top of the cover (Unit Experience)", () => {
    const xp = 999;
    const fold = unitRankFold("inferno.familiars", "bronze", xp);
    expect(fold.rank, "precondition: the XP reaches a rank").toBeGreaterThan(0);
    const foldTotal = fold.attack + fold.defense + fold.health + fold.initiative;
    expect(foldTotal, "precondition: the rank folds a stat").toBeGreaterThan(0);

    const state = ignatiusCombat("ign-horde-xp", ["specialty.ignatius.1"], { experience: xp });
    const after = playOn(state, "p1", "specialty.ignatius.1", "unit_p1_familiars");
    const unit = after.combat!.units.unit_p1_familiars;
    expect(unit.cardName).toBe("Horde of Imps");
    expect(unit.attack).toBe(3 + fold.attack);
    expect(unit.defense).toBe(1 + fold.defense);
    expect(unit.maxHealth).toBe(2 + fold.health);
    expect(unit.initiative).toBe(7 + fold.initiative);
    expect(unit.unitRank).toBe(fold.rank);
    for (const abilityId of fold.abilityIds) expect(unit.abilities).toContain(abilityId);
    expect(unit.abilities).toContain("familiar-spell-tax");
  });
});

describe("Ignatius VI — Familiars rally", () => {
  it("a Horde placed AFTER the rally still carries its +1 Health (the cover folds combat HP)", () => {
    const state = ignatiusCombat("ign-rally-then-horde", ["specialty.ignatius.1", "specialty.ignatius.6"]);
    const rallied = applyOk(state, cardPlays(state, "p1", "specialty.ignatius.6")[0]!.action);
    expect(rallied.combat!.units.unit_p1_familiars.maxHealth).toBe(3);
    const covered = playOn(rallied, "p1", "specialty.ignatius.1", "unit_p1_familiars");
    expect(covered.combat!.units.unit_p1_familiars.cardName).toBe("Horde of Imps");
    expect(covered.combat!.units.unit_p1_familiars.maxHealth, "Horde 2 + rally 1").toBe(3);
    expect(attackBonus(covered, covered.combat!.units.unit_p1_familiars)).toBe(2);
  });

  it("+2 Attack and +1 Health to every Familiars unit (a covered one included), nobody else", () => {
    const state = ignatiusCombat("ign-rally", ["specialty.ignatius.1", "specialty.ignatius.6"]);
    const covered = playOn(state, "p1", "specialty.ignatius.1", "unit_p1_familiars");
    const griffinsHp = covered.combat!.units.unit_p1_griffins.maxHealth;
    const fewHp = covered.combat!.units.unit_p1_few_familiars.maxHealth;
    const play = cardPlays(covered, "p1", "specialty.ignatius.6")[0];
    expect(play, "Familiars VI is an ongoing play at your own activation").toBeTruthy();
    const after = applyOk(covered, play!.action);
    const units = after.combat!.units;

    expect(attackBonus(after, units.unit_p1_familiars)).toBe(2);
    expect(attackBonus(after, units.unit_p1_few_familiars)).toBe(2);
    expect(attackBonus(after, units.unit_p1_griffins), "other units untouched").toBe(0);
    expect(units.unit_p1_familiars.maxHealth, "the Horde's bar gains +1").toBe(3);
    expect(units.unit_p1_few_familiars.maxHealth).toBe(fewHp + 1);
    expect(units.unit_p1_griffins.maxHealth).toBe(griffinsHp);
  });

  it("the +1 Health rides the cover's bar: defeat excess is measured against the real 3-HP Horde", () => {
    const state = ignatiusCombat("ign-rally-excess", ["specialty.ignatius.1", "specialty.ignatius.6"]);
    const covered = playOn(state, "p1", "specialty.ignatius.1", "unit_p1_familiars");
    const after = applyOk(covered, cardPlays(covered, "p1", "specialty.ignatius.6")[0]!.action);
    const unit = after.combat!.units.unit_p1_familiars;
    expect(unit.maxHealth).toBe(3);

    unit.damage = 4; // 3 on the Horde, 1 excess onto the revealed Pack (2 + 1 HP)
    markUnitRemovedIfNeeded(after, unit);
    expect(unit.cardName).toBe("Pack of Familiars");
    expect(unit.maxHealth).toBe(3);
    expect(unit.damage, "excess is 4 - 3 (the Horde's real bar), not 4 - 2 (printed)").toBe(1);
    expect(unit.variant).toBe("pack");
  });
});

/** p1's griffins attack p2's skeletons (adjacent melee) with a scripted die. */
function declareAttack(seed: string, rolls: number[], p2Hand: string[], attackerAttack = 4): GameState {
  const state = createInitialGameState(seed);
  const attacker = state.combat!.units.unit_p1_griffins;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.position = 9;
  attacker.attack = attackerAttack;
  attacker.abilities = [];
  defender.position = 13;
  defender.defense = 1;
  defender.maxHealth = 40;
  defender.abilities = [];
  state.players.p1.hand = [];
  state.players.p2.hand = [...p2Hand];
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attacker.id;
  return applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id });
}

const olemaOneOffer = (state: GameState) =>
  (state.reactionWindow?.legalReactions.p2 ?? []).find(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.olema.1",
  );

describe("Olema I — set all dice to -1", () => {
  it("the defender sets the rolled +1 to -1 after the roll (control: passing keeps the +1)", () => {
    const control = passAll(declareAttack("olema-1-control", [1], ["specialty.olema.1"]));
    // 4 Attack + 1 - 1 Defense = 4.
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(4);

    const atRoll = passUntil(declareAttack("olema-1-set", [1], ["specialty.olema.1"]), "ATTACK_DIE_SETTLED");
    expect(atRoll.reactionWindow?.triggerEvent.type).toBe("ATTACK_DIE_SETTLED");
    const offer = olemaOneOffer(atRoll);
    expect(offer, "offered to the defender in the post-roll window").toBeTruthy();
    const after = passAll(applyOk(atRoll, offer!.action));
    // 4 Attack - 1 - 1 Defense = 2.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(after.players.p2.hand).not.toContain("specialty.olema.1");
    const rolled = after.eventLog.find(
      (event) => event.type === "ATTACK_ROLLED" && event.attackerId === "unit_p1_griffins",
    );
    expect(rolled?.type === "ATTACK_ROLLED" && rolled.roll).toBe(-1);
  });

  it("is never a free play: not offered before the roll, nor when the die already shows -1", () => {
    // stat.defense keeps a pre-roll window open for p2, so the pre-roll offer list is real.
    const declared = passUntil(
      declareAttack("olema-1-preroll", [-1], ["specialty.olema.1", "stat.defense"]),
      "UNIT_ATTACK_DECLARED",
    );
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_ATTACK_DECLARED");
    expect(olemaOneOffer(declared), "no pre-roll offer").toBeUndefined();
    const afterRoll = passUntil(
      applyOk(declared, { type: "PASS_REACTION", playerId: declared.reactionWindow!.priorityPlayerId }),
      "ATTACK_DIE_SETTLED",
    );
    expect(olemaOneOffer(afterRoll), "nothing to lower on a -1: no post-roll offer").toBeUndefined();
    const settled = passAll(afterRoll);
    expect(settled.players.p2.hand).toContain("specialty.olema.1");
    expect(settled.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});

describe("Olema IV — -2 Attack on the attacking enemy", () => {
  it("lowers the declared attacker's Attack by 2 (control: without it the hit is 2 higher)", () => {
    const control = passAll(declareAttack("olema-4-control", [0], ["specialty.olema.4"]));
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(3);

    const declared = passUntil(declareAttack("olema-4", [0], ["specialty.olema.4"]), "UNIT_ATTACK_DECLARED");
    const offer = (declared.reactionWindow?.legalReactions.p2 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.olema.4",
    );
    expect(offer).toBeTruthy();
    const after = passAll(applyOk(declared, offer!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });
});

/** p1 (Olema) plays Weakness VI on p2's Vampires during p1's activation. */
function olemaLocked(seed: string, lockedUnitId: UnitId = "unit_p2_vampires"): { before: GameState; after: GameState } {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["specialty.olema.6"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  const before = structuredClone(state);
  return { before, after: playOn(state, "p1", "specialty.olema.6", lockedUnitId) };
}

function asP2Activation(state: GameState, hand: string[], activeUnitId: UnitId = "unit_p2_skeletons"): GameState {
  const next = structuredClone(state);
  next.players.p2.hand = [...hand];
  next.activePlayerId = "p2";
  next.combat!.activeUnitId = activeUnitId;
  next.combat!.units[activeUnitId].activatedThisRound = false;
  return next;
}

const castTargets = (state: GameState, playerId: PlayerId, cardId: string) =>
  getLegalActions(state, playerId).flatMap((legal) =>
    legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId && legal.action.target.type === "unit"
      ? [legal.action.target.unitId]
      : [],
  );

describe("Olema VI — the selected enemy unit is cut off from its own side's cards", () => {
  it("-1 Attack for the Combat, and its owner can no longer target it with a Spell", () => {
    const { before, after } = olemaLocked("olema-6-spell");
    expect(attackBonus(after, after.combat!.units.unit_p2_vampires)).toBe(-1);

    const controlTargets = castTargets(asP2Activation(before, ["spell.haste"]), "p2", "spell.haste");
    expect(controlTargets, "CONTROL: without the lock the owner may buff it").toContain("unit_p2_vampires");
    const lockedTargets = castTargets(asP2Activation(after, ["spell.haste"]), "p2", "spell.haste");
    expect(lockedTargets).not.toContain("unit_p2_vampires");
    expect(lockedTargets, "other friendly units stay targetable").toContain("unit_p2_skeletons");
  });

  it("Olema's own side can still target the locked unit", () => {
    const { after } = olemaLocked("olema-6-own-side");
    after.players.p1.hand = ["spell.magic_arrow"];
    expect(castTargets(after, "p1", "spell.magic_arrow")).toContain("unit_p2_vampires");
  });

  it("the owner cannot land an attack-window Statistic on the locked attacker (control: on another attacker)", () => {
    const { before, after } = olemaLocked("olema-6-reaction");
    const statOffer = (state: GameState, attackerId: UnitId) => {
      const next = asP2Activation(state, ["stat.attack"], attackerId);
      next.combat!.units[attackerId].position = 9;
      next.combat!.units.unit_p1_griffins.position = 5;
      next.combat!.units[attackerId].abilities = [];
      next.combat!.dice.scriptedRolls = [0];
      next.combat!.dice.rollCount = 0;
      const declared = applyOk(next, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId,
        defenderId: "unit_p1_griffins",
      });
      const window = passUntil(declared, "UNIT_ATTACK_DECLARED");
      return (window.reactionWindow?.legalReactions.p2 ?? []).some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.attack",
      );
    };
    expect(statOffer(before, "unit_p2_vampires"), "CONTROL: unlocked vampires take the +Attack").toBe(true);
    expect(statOffer(after, "unit_p2_vampires"), "locked vampires cannot").toBe(false);
    expect(statOffer(after, "unit_p2_skeletons"), "another p2 attacker still can").toBe(true);
  });
});

describe("Olema VI — targeted instants and follow-up pickers respect the lock", () => {
  /** p1's Griffins attack p2's Vampires (adjacent); p2 holds `hand`. */
  function attackVampires(state: GameState, hand: string[]): GameState {
    const next = structuredClone(state);
    next.players.p2.hand = [...hand];
    next.players.p1.hand = [];
    const units = next.combat!.units;
    units.unit_p1_griffins.position = 5;
    units.unit_p1_griffins.abilities = [];
    units.unit_p2_vampires.position = 9;
    units.unit_p2_vampires.damage = 1;
    units.unit_p2_skeletons.damage = 1;
    next.activePlayerId = "p1";
    next.combat!.activeUnitId = "unit_p1_griffins";
    next.combat!.dice.scriptedRolls = [0];
    next.combat!.dice.rollCount = 0;
    const declared = applyOk(next, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires",
    });
    return passUntil(declared, "UNIT_ATTACK_DECLARED");
  }

  const reactionTargets = (state: GameState, cardId: string) =>
    (state.reactionWindow?.legalReactions.p2 ?? []).flatMap((legal) =>
      legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
        ? [legal.action.target?.type === "unit" ? legal.action.target.unitId : "none"]
        : [],
    );

  it("a pre-hit heal instant (First Aid) cannot pick the locked unit", () => {
    const { before, after } = olemaLocked("olema-6-first-aid");
    expect(reactionTargets(attackVampires(before, ["ability.first_aid"]), "ability.first_aid"), "CONTROL").toContain(
      "unit_p2_vampires",
    );
    const locked = reactionTargets(attackVampires(after, ["ability.first_aid"]), "ability.first_aid");
    expect(locked).not.toContain("unit_p2_vampires");
    expect(locked, "another wounded unit may still be healed").toContain("unit_p2_skeletons");
  });

  it("Interference cannot land its +Defense on the locked defender", () => {
    const { before, after } = olemaLocked("olema-6-interference");
    expect(reactionTargets(attackVampires(before, ["ability.interference"]), "ability.interference").length, "CONTROL").toBeGreaterThan(0);
    expect(reactionTargets(attackVampires(after, ["ability.interference"]), "ability.interference")).toEqual([]);
  });

  it("Sacrifice's follow-up pick never offers the locked unit", () => {
    const sacrificeCandidates = (state: GameState) => {
      const next = asP2Activation(state, ["spell.sacrifice"]);
      next.combat!.units.unit_p2_skeletons.damage = 1;
      const cast = getLegalActions(next, "p2").find(
        (legal) =>
          legal.action.type === "CAST_SPELL" &&
          legal.action.cardId === "spell.sacrifice" &&
          legal.action.target.type === "unit" &&
          legal.action.target.unitId === "unit_p2_skeletons",
      );
      expect(cast).toBeTruthy();
      const resolved = passAll(applyOk(next, cast!.action));
      const choice = resolved.pendingChoice;
      return choice?.type === "ABILITY_TARGET_CHOICE" && choice.kind === "sacrifice-transfer" ? choice.candidateUnitIds : [];
    };
    const { before, after } = olemaLocked("olema-6-sacrifice");
    expect(sacrificeCandidates(before), "CONTROL").toContain("unit_p2_vampires");
    const locked = sacrificeCandidates(after);
    expect(locked).not.toContain("unit_p2_vampires");
    expect(locked).toContain("unit_p2_dread_knights");
  });

  it("Verdish's First Aid IV transfer never picks the locked unit as the recipient", () => {
    const recipients = (state: GameState) => {
      const next = asP2Activation(state, ["specialty.verdish.4"]);
      next.combat!.units.unit_p2_skeletons.damage = 1;
      const after = playOn(next, "p2", "specialty.verdish.4", "unit_p2_skeletons");
      const choice = after.pendingChoice;
      return choice?.type === "ABILITY_TARGET_CHOICE" ? choice.candidateUnitIds : [];
    };
    const { before, after } = olemaLocked("olema-6-verdish");
    expect(recipients(before), "CONTROL").toContain("unit_p2_vampires");
    const locked = recipients(after);
    expect(locked).not.toContain("unit_p2_vampires");
    expect(locked).toContain("unit_p2_dread_knights");
  });

  it("Uland's Cure IV (select any 2 units) never offers the locked unit", () => {
    const cureUnits = (state: GameState) => {
      const next = asP2Activation(state, ["specialty.uland.4"]);
      const play = cardPlays(next, "p2", "specialty.uland.4")[0];
      expect(play).toBeTruthy();
      const after = applyOk(next, play!.action);
      const choice = after.pendingChoice;
      return choice?.type === "OPTION_CHOICE" && choice.ulandCure ? choice.ulandCure.unitIds : [];
    };
    const { before, after } = olemaLocked("olema-6-uland");
    expect(cureUnits(before), "CONTROL").toContain("unit_p2_vampires");
    const locked = cureUnits(after);
    expect(locked).not.toContain("unit_p2_vampires");
    expect(locked).toContain("unit_p2_skeletons");
  });

  it("the lock ends with the Combat", () => {
    const { after } = olemaLocked("olema-6-expiry");
    const vampires = after.combat!.units.unit_p2_vampires;
    const haste = cardLibrary["spell.haste"];
    expect(unitCardTargetLocked(after, vampires, "p2", haste)).toBe(true);
    expect(unitCardTargetLocked(after, vampires, "p1", haste), "never against Olema herself").toBe(false);
    expireEffectsForCombatEnd(after);
    expect(unitCardTargetLocked(after, vampires, "p2", haste)).toBe(false);
  });
});

/** p1 (Olema's side) casts Slow at `targetId`; p2 holds Resistance + Magic Mirror. */
function slowCastAt(state: GameState, targetId: UnitId): GameState {
  const next = structuredClone(state);
  next.players.p1.hand = ["spell.slow"];
  next.players.p2.hand = ["ability.resistance", "spell.magic_mirror"];
  const cast = getLegalActions(next, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === "spell.slow" &&
      legal.action.target.type === "unit" &&
      legal.action.target.unitId === targetId,
  );
  expect(cast, `Slow should be castable on ${targetId}`).toBeTruthy();
  return applyOk(next, cast!.action);
}

/** The counters p2 is offered on the pending Slow. A cast nobody can answer
 * opens no reaction window at all (it resolves at once): nothing offered. */
const p2CounterCards = (state: GameState) =>
  new Set(
    state.reactionWindow?.triggerEvent.type === "SPELL_CAST_STARTED"
      ? (getLegalReactionsForTrigger(state, state.reactionWindow.triggerEvent).p2 ?? []).flatMap((legal) =>
          legal.action.type === "PLAY_REACTION" ? [legal.action.cardId] : [],
        )
      : [],
  );

const slowLandedOn = (state: GameState, unitId: UnitId) =>
  state.activeEffects.some(
    (effect) =>
      effect.source.type === "card" &&
      effect.source.cardId === "spell.slow" &&
      effect.target?.type === "unit" &&
      effect.target.unitId === unitId,
  );

describe("Olema VI — the owner cannot cancel or redirect a Spell aimed at the locked unit", () => {
  it("Resistance / Magic Mirror are withheld (CONTROLS: no lock; aimed at another unit)", () => {
    const { before, after } = olemaLocked("olema-6-counter");
    const control = p2CounterCards(slowCastAt(before, "unit_p2_vampires"));
    expect(control.has("ability.resistance"), "CONTROL: Resistance without the lock").toBe(true);
    expect(control.has("spell.magic_mirror"), "CONTROL: Magic Mirror without the lock").toBe(true);

    const lockedCast = slowCastAt(after, "unit_p2_vampires");
    const locked = p2CounterCards(lockedCast);
    expect(locked.has("ability.resistance")).toBe(false);
    expect(locked.has("spell.magic_mirror")).toBe(false);
    // With both counters withheld p2 has no answer: the Slow lands on the locked unit.
    expect(lockedCast.reactionWindow).toBeNull();
    expect(slowLandedOn(lockedCast, "unit_p2_vampires")).toBe(true);

    const other = p2CounterCards(slowCastAt(after, "unit_p2_skeletons"));
    expect(other.has("ability.resistance"), "a Spell aimed at another unit may still be resisted").toBe(true);
    expect(other.has("spell.magic_mirror"), "a Spell aimed at another unit may still be reflected").toBe(true);
  });

  it("a forged Resistance against a Spell aimed at the locked unit is rejected", () => {
    const { before, after } = olemaLocked("olema-6-counter-forged");
    // The lock leaves p2 no counter, so no window opens on its own: open it
    // before the lock (Resistance offered), then lay the lock on the table —
    // the reducer's backstop must refuse the now-stale offer.
    const casting = slowCastAt(before, "unit_p2_vampires");
    expect(casting.reactionWindow?.triggerEvent.type).toBe("SPELL_CAST_STARTED");
    expect(p2CounterCards(casting).has("ability.resistance"), "CONTROL: offered before the lock").toBe(true);
    const lock = after.activeEffects.filter((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "ENEMY_CARD_TARGET_LOCK"),
    );
    expect(lock).toHaveLength(1);
    casting.activeEffects.push(...structuredClone(lock));
    const forged = applyAction(casting, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "ability.resistance",
      mode: "basic",
    } as GameAction);
    expect(forged.errors.map((error) => error.message).join("; ")).toMatch(/cannot be targeted/);
  });
});

describe("Olema VI — the owner's covers and lethal saves", () => {
  it("the owner cannot put a Sandro cover on its locked Skeletons", () => {
    const coverTargets = (state: GameState) =>
      targetIds(cardPlays(asP2Activation(state, ["specialty.sandro.1"], "unit_p2_dread_knights"), "p2", "specialty.sandro.1"));
    const { before, after } = olemaLocked("olema-6-cover", "unit_p2_skeletons");
    expect(coverTargets(before), "CONTROL").toEqual(["unit_p2_skeletons"]);
    expect(coverTargets(after)).toEqual([]);
  });

  it("a card lethal save (Resurrection) cannot reach the locked unit", () => {
    const saves = (state: GameState) => {
      const next = structuredClone(state);
      next.players.p2.hand = ["spell.resurrection"];
      const offers = getLegalReactionsForTrigger(next, {
        id: "lethal-probe",
        type: "UNIT_LETHAL_HIT",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons",
      });
      return (offers.p2 ?? []).filter(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.resurrection",
      );
    };
    const { before, after } = olemaLocked("olema-6-lethal", "unit_p2_skeletons");
    expect(saves(before).length, "CONTROL: the save is offered").toBeGreaterThan(0);
    expect(saves(after)).toEqual([]);
  });
});

describe("AI use of Olema I", () => {
  function aiChoiceAtRoll(seed: string, rolls: number[], defenderPatch: Partial<CombatUnitState>) {
    const declared = declareAttack(seed, rolls, ["specialty.olema.1"]);
    Object.assign(declared.combat!.units.unit_p2_skeletons, defenderPatch);
    const atRoll = passUntil(declared, "ATTACK_DIE_SETTLED");
    expect(atRoll.reactionWindow?.priorityPlayerId).toBe("p2");
    return chooseComputerAction({
      playerId: "p2",
      state: getPlayerView(atRoll, "p2"),
      legalActions: getLegalActions(atRoll, "p2"),
    })?.action;
  }

  it("sets the dice to -1 when the rolled +1 would destroy its unit", () => {
    // 4 Attack + 1 - 1 Defense = 4 = the defender's whole bar; after the set only 2.
    const action = aiChoiceAtRoll("olema-ai-save", [1], { maxHealth: 4 });
    expect(action?.type === "PLAY_REACTION" && action.cardId).toBe("specialty.olema.1");
  });

  it("CONTROL: holds it when a 0 on a cheap, healthy unit is barely changed", () => {
    // 3 damage vs 5 HP either way it survives; the set saves only 1 damage.
    expect(aiChoiceAtRoll("olema-ai-hold", [0], { maxHealth: 5, attack: 1, initiative: 2 })?.type).toBe("PASS_REACTION");
  });
});

describe("Olema VI — a damage transfer cannot shield the locked unit", () => {
  it("Riki's Little Busters' Bond VI is not offered to protect the locked defender (control: unlocked)", () => {
    const transfers = (state: GameState) => {
      const next = structuredClone(state);
      next.players.p2.hand = ["specialty.riki_naoe.6"];
      const offers = getLegalReactionsForTrigger(next, {
        id: "die-probe",
        type: "ATTACK_DIE_SETTLED",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_vampires",
        rolls: [1],
        roll: 1,
      });
      return (offers.p2 ?? []).filter(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.riki_naoe.6",
      );
    };
    const { before, after } = olemaLocked("olema-6-transfer");
    expect(transfers(before).length, "CONTROL: the shield is offered").toBeGreaterThan(0);
    expect(transfers(after)).toEqual([]);
  });
});
