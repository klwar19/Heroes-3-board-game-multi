import { describe, expect, it } from "vitest";
import {
  COMMANDER_DEFENSE_TOKEN_GRADE,
  COMMANDER_GRADE_VALUES,
  COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION,
  COMMANDER_SLUGS,
  COMMANDER_STAT_KEYS,
  commanderDefinitions,
  commanderDoublePointLevels,
  commanderGradePointsForLevelUp,
  commanderReviveCost,
  COMMANDER_SLUG_BY_FACTION,
  type CommanderSlug
} from "@/data/commanders";
import { unitAbilities } from "@/data/units/abilities";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  makeCommanderCombatUnit,
  commanderAbilityIds,
  commanderDeploymentCellsFor,
  commanderOnOwnFrontLine,
  commanderPreCombatSortAvailable,
  commanderUnitId,
  findCommanderUnit,
  gainExperience,
  nextAfkDropAction,
  placementCellsFor,
  spellLimitFor,
  DEFAULT_ANIME_OPTIONS,
  EQUIPMENT_IDS
} from "./index";
import { finalizeCommandersAfterCombat } from "./commanders";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import { warMachinesForSale } from "./permanents";
import { hasBallistaChooseTarget, effectiveInitiative } from "./active-effects";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { CommanderPlayerState, GameAction, GameState } from "./state";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function applyError(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected the action to be rejected").toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
}

/** Pass reactions / keep rolls until an attack settles. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = apply(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

const WOG_ON = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };

function adventureWithCommanders(seed: string, factionId = "castle", heroDefId = "catherine"): GameState {
  return createAdventureGameState({
    seed,
    ruleset: "binh",
    wog: WOG_ON,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "One", factionId: factionId as never, heroDefId },
      { id: "p2", name: "Two", factionId: factionId === "necropolis" ? "castle" : "necropolis" }
    ]
  });
}

function freshCommander(slug: CommanderSlug, grades: Partial<Record<(typeof COMMANDER_STAT_KEYS)[number], number>> = {}): CommanderPlayerState {
  return {
    slug,
    grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0, ...grades }
  };
}

/**
 * Combat-sandbox state with p1 owning a commander whose unit stands on the
 * battlefield — the harness for the combat-facing mechanics.
 */
function sandboxWithCommander(
  slug: CommanderSlug,
  grades: Partial<Record<(typeof COMMANDER_STAT_KEYS)[number], number>> = {},
  position = 9
): GameState {
  const state = createInitialGameState();
  state.wog = { ...WOG_ON };
  state.players.p1.commander = freshCommander(slug, grades);
  const unit = makeCommanderCombatUnit(state.players.p1, position);
  if (!unit) {
    throw new Error("expected a commander combat unit");
  }
  state.combat!.units[unit.id] = unit;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

// ===========================================================================
// Data integrity — the printed content is exactly what the engine consumes.
// ===========================================================================

describe("WOG commanders — content integrity", () => {
  it("all 16 factions map to a commander and back", () => {
    expect(Object.keys(COMMANDER_SLUG_BY_FACTION)).toHaveLength(16);
    expect(new Set(Object.values(COMMANDER_SLUG_BY_FACTION)).size).toBe(16);
    for (const slug of COMMANDER_SLUGS) {
      expect(commanderDefinitions[slug], slug).toBeTruthy();
    }
  });

  it("pins the grade ladders — Defense 1/2/2/3 (token at II), Damage as extra-dice counts", () => {
    expect(COMMANDER_GRADE_VALUES.attack).toEqual([2, 3, 4, 5]);
    expect(COMMANDER_GRADE_VALUES.defense).toEqual([1, 2, 2, 3]);
    expect(COMMANDER_GRADE_VALUES.health).toEqual([4, 5, 6, 8]);
    expect(COMMANDER_GRADE_VALUES.speed).toEqual([5, 6, 7, 10]);
    // Damage grade = the number of EXTRA attack dice; Magic grade = Power.
    // Per the module spec the Power ladder is 0/0/1/2 (grade 1 buys the
    // defensive package, not Power) and the spell ward is 0/1/1/3 (nothing at
    // grade 0, -1 from grade 1, -3 at grade 3).
    expect(COMMANDER_GRADE_VALUES.damage).toEqual([0, 1, 2, 3]);
    expect(COMMANDER_GRADE_VALUES.magic).toEqual([0, 0, 1, 2]);
    expect(COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION).toEqual([0, 1, 1, 3]);
    expect(COMMANDER_DEFENSE_TOKEN_GRADE).toBe(2);
  });

  it("every commander's cast ability id resolves to an implemented COMMANDER_CAST registry entry", () => {
    for (const slug of COMMANDER_SLUGS) {
      const cast = commanderDefinitions[slug].cast;
      const registered = unitAbilities[cast.abilityId];
      expect(registered, cast.abilityId).toBeTruthy();
      expect(registered.effect?.type, cast.abilityId).toBe("COMMANDER_CAST");
      expect(registered.implementationStatus, cast.abilityId).toBe("implemented");
      expect(cast.tierText).toHaveLength(3);
    }
  });

  it("the grade-derived unit ability ids all resolve to implemented registry entries", () => {
    const maxed = freshCommander("paladin", { attack: 3, defense: 3, health: 3, damage: 3, magic: 3, speed: 3 });
    const undead = freshCommander("soul_eater", { damage: 2 });
    for (const id of [...commanderAbilityIds(maxed), ...commanderAbilityIds(undead)]) {
      expect(unitAbilities[id], id).toBeTruthy();
      expect(unitAbilities[id].implementationStatus, id).toBe("implemented");
    }
  });

  it("the three originals carry the requested names (Sea Marshal / Artificer / Rune Keeper)", () => {
    expect(commanderDefinitions.corsair.name).toBe("Sea Marshal");
    expect(commanderDefinitions.factory.name).toBe("Artificer");
    expect(commanderDefinitions.bulwark.name).toBe("Rune Keeper");
  });
});

// ===========================================================================
// Setup gating — the module seeds one commander per player, or none.
// ===========================================================================

describe("WOG commanders — setup gating", () => {
  it("seeds each player's faction commander (all grades 0 — the base line) when the module is on", () => {
    const state = adventureWithCommanders("cmd-setup");
    expect(state.players.p1.commander).toMatchObject({ slug: "paladin" });
    expect(state.players.p2.commander).toMatchObject({ slug: "soul_eater" });
    for (const key of COMMANDER_STAT_KEYS) {
      expect(state.players.p1.commander?.grades[key], key).toBe(0);
    }
    expect(state.players.p1.commander?.dead).toBeFalsy();
  });

  it("CONTROL: no commander with the module off, wog disabled, or legacy rules", () => {
    const moduleOff = createAdventureGameState({
      seed: "cmd-off",
      ruleset: "binh",
      wog: { ...WOG_ON, commanders: false },
      rollFirstPlayer: false
    });
    expect(moduleOff.players.p1.commander).toBeUndefined();

    const legacy = createAdventureGameState({
      seed: "cmd-legacy",
      ruleset: "legacy",
      wog: WOG_ON,
      rollFirstPlayer: false
    });
    expect(legacy.players.p1.commander).toBeUndefined();
  });
});

// ===========================================================================
// Combat injection — the commander fights the main hero's battles.
// ===========================================================================

function intoNeutralFight(state: GameState, difficulty = 2): GameState {
  let current = state;
  if (current.players.p1.needsHandRefresh || current.players.p1.canMulligan) {
    current = apply(current, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  const hero = getMainHero(current, "p1")!;
  const field = current.adventure!.fields[hero.spaceId!];
  field.difficulty = difficulty;
  startNeutralEncounter(current, hero, field);
  const place = getLegalActions(current, "p1").find((legal) => legal.action.type === "PLACE_COMBAT_UNIT");
  expect(place, "a unit to place").toBeTruthy();
  current = apply(current, place!.action);
  return apply(current, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

describe("WOG commanders — combat injection", () => {
  it("puts the commander on the attacker's rows at grade-0 (base) stats when the fight starts", () => {
    const state = intoNeutralFight(adventureWithCommanders("cmd-inject"));
    const unit = state.combat!.units[commanderUnitId("p1")];
    expect(unit, "commander unit").toBeTruthy();
    expect(unit).toMatchObject({
      commanderSlug: "paladin",
      attack: 2,
      defense: 1,
      maxHealth: 4,
      initiative: 5,
      damage: 0,
      controllerId: "p1"
    });
    expect(unit.position).toBeGreaterThanOrEqual(12);
    // Magic grade 0 (base): the commander gets ONLY its cast — no spell ward,
    // no ongoing-effect immunity (both begin at Magic grade 1).
    expect(unit.abilities).not.toContain("reduce-spell-damage-1");
    expect(unit.abilities).not.toContain("titan-ignore-ongoing");
    expect(unit.abilities).toContain("commander-cast-paladin");
  });

  it("gains the magic package (ward + ongoing immunity) from Magic grade 1", () => {
    const state = adventureWithCommanders("cmd-inject-magic");
    state.players.p1.commander = freshCommander("paladin", { magic: 1 });
    const unit = intoNeutralFight(state).combat!.units[commanderUnitId("p1")];
    expect(unit.abilities).toContain("reduce-spell-damage-1");
    expect(unit.abilities).toContain("titan-ignore-ongoing");
  });

  it("CONTROL: no commander unit when the module is off, and none for a DEAD commander", () => {
    const off = createAdventureGameState({
      seed: "cmd-inject-off",
      ruleset: "binh",
      wog: { ...WOG_ON, commanders: false },
      rollFirstPlayer: false
    });
    const offFight = intoNeutralFight(off);
    expect(offFight.combat!.units[commanderUnitId("p1")]).toBeUndefined();

    const withDead = adventureWithCommanders("cmd-inject-dead");
    withDead.players.p1.commander!.dead = true;
    const deadFight = intoNeutralFight(withDead);
    expect(deadFight.combat!.units[commanderUnitId("p1")]).toBeUndefined();
  });

  it("builds the unit from the CURRENT grades (attack 5 / health 8 / init 10 at grade 3 — the adjusted grade-III bonuses)", () => {
    const state = adventureWithCommanders("cmd-inject-graded");
    state.players.p1.commander = freshCommander("paladin", { attack: 3, health: 3, speed: 3 });
    const fight = intoNeutralFight(state);
    const unit = fight.combat!.units[commanderUnitId("p1")];
    // Grade III bonuses are absolute, not summed: Attack +3, Health +4, Speed +5.
    expect(unit).toMatchObject({ attack: 5, maxHealth: 8, initiative: 10 });

    // Grades I/II are +1/+2 over the base (attack 3/4, health 5/6, init 6/7).
    const mid = adventureWithCommanders("cmd-inject-graded-mid");
    mid.players.p1.commander = freshCommander("paladin", { attack: 1, health: 2, speed: 2 });
    const midUnit = intoNeutralFight(mid).combat!.units[commanderUnitId("p1")];
    expect(midUnit).toMatchObject({ attack: 3, maxHealth: 6, initiative: 7 });
  });
});

// ===========================================================================
// Deployment limit — the commander is the army's 5th body, so a player
// deploys at most 4 army units while the module is on.
// ===========================================================================

describe("WOG commanders — the 4-unit deployment limit", () => {
  function openPlacement(state: GameState): GameState {
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const hero = getMainHero(state, "p1")!;
    const field = state.adventure!.fields[hero.spaceId!];
    field.difficulty = 2;
    startNeutralEncounter(state, hero, field);
    return state;
  }

  it("caps deployment at 4 army units with the module on (the commander takes the 5th slot)", () => {
    const state = openPlacement(adventureWithCommanders("cmd-deploy-cap"));
    const setup = state.combat!.setup!;
    expect(setup.unitLimit).toBe(4);

    // With 4 units already placed, a 5th placement is refused outright and
    // no further PLACE_COMBAT_UNIT is offered.
    setup.placedUnitIds.p1 = ["u1", "u2", "u3", "u4"];
    const armyUnit = state.players.p1.army[0]!;
    const cell = placementCellsFor(state, "p1")[0]!;
    const message = applyError(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: armyUnit.id,
      position: cell
    });
    expect(message).toContain("Only 4 units");
    expect(
      getLegalActions(state, "p1").some((legal) => legal.action.type === "PLACE_COMBAT_UNIT")
    ).toBe(false);
  });

  it("CONTROL: without the module the classic 5-unit limit stands", () => {
    const off = createAdventureGameState({
      seed: "cmd-deploy-cap-off",
      ruleset: "binh",
      wog: { ...WOG_ON, commanders: false },
      rollFirstPlayer: false
    });
    const state = openPlacement(off);
    expect(state.combat!.setup!.unitLimit).toBe(5);
  });
});

// ===========================================================================
// Stat points — every level-up gives 1 (2 at a milestone level: 3 & 6, or the
// Paladin's Wise 2 & 5). One point raises one stat by one grade.
// ===========================================================================

describe("WOG commanders — stat points from the hero's level", () => {
  it("pins the point schedule: 1 per level-up, 2 at the milestone levels", () => {
    // soul_eater (any non-Paladin) — milestones at levels 3 & 6.
    expect(commanderDoublePointLevels("soul_eater")).toEqual([3, 6]);
    expect([1, 2, 3, 4, 5, 6, 7].map((lvl) => commanderGradePointsForLevelUp("soul_eater", lvl)))
      .toEqual([0, 1, 2, 1, 1, 2, 1]);

    // Paladin (Castle) — Wise pulls the milestones EARLIER to levels 2 & 5 AND
    // adds a THIRD milestone at level 7.
    expect(commanderDoublePointLevels("paladin")).toEqual([2, 5, 7]);
    expect([1, 2, 3, 4, 5, 6, 7].map((lvl) => commanderGradePointsForLevelUp("paladin", lvl)))
      .toEqual([0, 2, 1, 1, 2, 1, 2]);

    // A full run to level 7 is 8 points for a normal commander but 9 for the
    // Paladin (its extra level-7 double).
    expect([2, 3, 4, 5, 6, 7].reduce((sum, lvl) => sum + commanderGradePointsForLevelUp("soul_eater", lvl), 0)).toBe(8);
    expect([2, 3, 4, 5, 6, 7].reduce((sum, lvl) => sum + commanderGradePointsForLevelUp("paladin", lvl), 0)).toBe(9);
  });

  it("awards points on level-up, spends each on one stat, and rejects abuse", () => {
    let state = adventureWithCommanders("cmd-points", "necropolis", undefined);
    // necropolis p1 → soul_eater (milestones at 3 & 6).
    gainExperience(state, "p1", 2); // level 1 → 2 → +1 point
    expect(state.players.p1.commander?.gradePoints).toBe(1);
    // The level-up emits a COMMANDER_POINTS_AWARDED event (drives the popup).
    const awarded = state.eventLog.find((event) => event.type === "COMMANDER_POINTS_AWARDED");
    expect(awarded, "a COMMANDER_POINTS_AWARDED event").toBeTruthy();
    if (awarded?.type === "COMMANDER_POINTS_AWARDED") {
      expect(awarded.points).toBe(1);
      expect(awarded.playerId).toBe("p1");
      expect(awarded.commanderSlug).toBe("soul_eater");
    }

    // An unknown stat is rejected.
    applyError(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "bogus" as never });

    state = apply(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "magic" });
    expect(state.players.p1.commander?.grades.magic).toBe(1);
    expect(state.players.p1.commander?.gradePoints).toBe(0);

    // No points left → rejected.
    applyError(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });

    // xp 2 → 8 crosses levels 3, 4 and 5: 2 + 1 + 1 = 4 points.
    gainExperience(state, "p1", 6);
    expect(state.players.p1.commander?.gradePoints).toBe(4);

    // Spend all 4 raising magic to grade 3, then attack once.
    state = apply(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "magic" });
    state = apply(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "magic" });
    expect(state.players.p1.commander?.grades.magic).toBe(3);
    // Magic is capped at grade 3 now — a 3rd raise is rejected.
    applyError(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "magic" });
    state = apply(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });
    state = apply(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });
    expect(state.players.p1.commander?.grades.attack).toBe(2);
    expect(state.players.p1.commander?.gradePoints).toBe(0);
  });

  it("Wise (Paladin): milestone points are levels 2, 5 & 7 — an extra one vs 3 & 6", () => {
    const paladin = adventureWithCommanders("cmd-wise"); // castle → paladin
    gainExperience(paladin, "p1", 2); // level 2 = milestone → +2
    expect(paladin.players.p1.commander?.gradePoints).toBe(2);

    // CONTROL: a non-Paladin at level 2 gets only 1 point.
    const other = adventureWithCommanders("cmd-wise-ctrl", "necropolis");
    gainExperience(other, "p1", 2);
    expect(other.players.p1.commander?.gradePoints).toBe(1);

    // Paladin level 3 is a normal +1 (its milestone was 2); soul_eater level 3
    // is the +2 milestone.
    gainExperience(paladin, "p1", 2); // level 3 → +1 (total 3)
    expect(paladin.players.p1.commander?.gradePoints).toBe(3);
    gainExperience(other, "p1", 2); // level 3 → +2 (total 3)
    expect(other.players.p1.commander?.gradePoints).toBe(3);

    // Level 6 → 7: the Paladin's THIRD milestone gives +2 where a normal
    // commander gets +1. Drive both to level 6 first (xp 10), then cross to 7.
    gainExperience(paladin, "p1", 6); // level 3 → 6 (+1 +2 +1 = +4, total 7)
    gainExperience(other, "p1", 6); // level 3 → 6 (+2 +1 +1 = +4, total 7)
    expect(paladin.players.p1.commander?.gradePoints).toBe(7);
    expect(other.players.p1.commander?.gradePoints).toBe(7);
    expect(getMainHero(paladin, "p1")?.level).toBe(6);

    gainExperience(paladin, "p1", 2); // level 6 → 7 → +2 (Paladin milestone)
    gainExperience(other, "p1", 2); // level 6 → 7 → +1 (normal)
    expect(getMainHero(paladin, "p1")?.level).toBe(7);
    // Paladin's level-7 milestone: 7 → 9 (+2). CONTROL soul_eater: 7 → 8 (+1).
    expect(paladin.players.p1.commander?.gradePoints).toBe(9);
    expect(other.players.p1.commander?.gradePoints).toBe(8);
  });

  it("offers one grade-up per raisable stat as map-turn legal actions", () => {
    const state = adventureWithCommanders("cmd-points-legal");
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.commander!.gradePoints = 1;
    const refreshed = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    const raises = getLegalActions(refreshed, "p1").filter(
      (legal) => legal.action.type === "COMMANDER_GRADE_UP"
    );
    // 6 stats below cap → one action each.
    expect(raises).toHaveLength(6);

    // A capped stat drops out of the offers.
    refreshed.players.p1.commander!.grades.attack = 3;
    const capped = getLegalActions(refreshed, "p1").filter(
      (legal) => legal.action.type === "COMMANDER_GRADE_UP"
    );
    expect(capped).toHaveLength(5);
    expect(
      capped.some((legal) => legal.action.type === "COMMANDER_GRADE_UP" && legal.action.stat === "attack")
    ).toBe(false);
  });

  it("mastery (grade 3) is gated to hero level 5 — grades 0→1 and 1→2 are not", () => {
    const state = adventureWithCommanders("cmd-mastery", "necropolis", undefined); // soul_eater
    expect(getMainHero(state, "p1")?.level).toBe(1);

    // A grade 0 → 1 raise is fine at level 1.
    state.players.p1.commander!.gradePoints = 1;
    let current = apply(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });
    expect(current.players.p1.commander?.grades.attack).toBe(1);
    // And a grade 1 → 2 raise is fine at level 1.
    current.players.p1.commander!.gradePoints = 1;
    current = apply(current, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });
    expect(current.players.p1.commander?.grades.attack).toBe(2);

    // But a grade 2 → 3 (mastery) raise is rejected below hero level 5.
    current.players.p1.commander!.gradePoints = 1;
    const err = applyError(current, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });
    expect(err).toMatch(/level 5/i);
    expect(current.players.p1.commander?.grades.attack, "the stat stays at grade 2").toBe(2);
    expect(current.players.p1.commander?.gradePoints, "the point is not spent").toBe(1);

    // Reaching hero level 5 unlocks the mastery raise.
    gainExperience(current, "p1", 8); // xp 0 → 8 = level 5
    expect(getMainHero(current, "p1")?.level).toBe(5);
    current.players.p1.commander!.gradePoints = 1;
    const mastered = apply(current, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });
    expect(mastered.players.p1.commander?.grades.attack).toBe(3);
  });

  it("hides the grade 2 → 3 mastery offer in legal actions until hero level 5", () => {
    let state = adventureWithCommanders("cmd-mastery-legal", "necropolis", undefined);
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const gradeUpsFor = (s: GameState, stat: string) =>
      getLegalActions(s, "p1").filter(
        (legal) => legal.action.type === "COMMANDER_GRADE_UP" && legal.action.stat === stat
      );

    // Damage at grade 2 with a point, hero still level 1.
    state.players.p1.commander!.grades.damage = 2;
    state.players.p1.commander!.gradePoints = 1;
    expect(gradeUpsFor(state, "damage"), "no mastery offer below level 5").toHaveLength(0);
    // A grade-0 stat is still offered — the gate only touches the grade 2 → 3 step.
    expect(gradeUpsFor(state, "attack"), "lower-grade raises stay offered").toHaveLength(1);

    // At hero level 5 the mastery offer appears.
    gainExperience(state, "p1", 8);
    expect(getMainHero(state, "p1")?.level).toBe(5);
    state.players.p1.commander!.grades.damage = 2;
    state.players.p1.commander!.gradePoints = 1;
    expect(gradeUpsFor(state, "damage"), "mastery offered at level 5").toHaveLength(1);
  });
});

// ===========================================================================
// Magic package — NOTHING at grade 0; -1 Spell damage + ongoing-effect
// immunity from grade 1, -3 at grade 3.
// ===========================================================================

describe("WOG commanders — the Magic grade package", () => {
  function findCast(state: GameState, playerId: "p1" | "p2", cardId: string, unitId: string) {
    return getLegalActions(state, playerId).find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === cardId &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === unitId
    );
  }

  function boltAt(state: GameState, unitId: string): GameState {
    state.players.p2.hand = ["spell.lightning_bolt"];
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.activePlayerId = "p2";
    const cast = findCast(state, "p2", "spell.lightning_bolt", unitId);
    expect(cast, `Lightning Bolt at ${unitId}`).toBeTruthy();
    return settle(apply(state, cast!.action));
  }

  it("takes FULL Spell damage at grade 0 and -1 from grade 1 (Lightning Bolt, Power 0: 2 damage)", () => {
    // Grade 0 (base): NO ward — the commander takes the full 2 damage.
    const state = boltAt(sandboxWithCommander("paladin"), commanderUnitId("p1"));
    expect(state.combat!.units[commanderUnitId("p1")].damage).toBe(2);

    // Grade 1: the -1 ward begins → 2 - 1 = 1 damage.
    const warded = boltAt(sandboxWithCommander("paladin", { magic: 1 }), commanderUnitId("p1"));
    expect(warded.combat!.units[commanderUnitId("p1")].damage).toBe(1);

    // Grade 2 keeps the -1 ward → 2 - 1 = 1 damage.
    const graded = boltAt(sandboxWithCommander("paladin", { magic: 2 }), commanderUnitId("p1"));
    expect(graded.combat!.units[commanderUnitId("p1")].damage).toBe(1);

    // Grade 3 carries the -3 ward (behaviour of the shared REDUCE_SPELL_DAMAGE
    // id is pinned by its own ability tests; here we pin WHICH ward is wired).
    const maxed = sandboxWithCommander("paladin", { magic: 3 });
    expect(maxed.combat!.units[commanderUnitId("p1")].abilities).toContain("reduce-spell-damage-3");
    // Grade 0 has NO reduce-spell-damage id at all.
    expect(sandboxWithCommander("paladin").combat!.units[commanderUnitId("p1")].abilities)
      .not.toContain("reduce-spell-damage-1");

    // CONTROL: a plain unit takes the full 2.
    const plain = createInitialGameState();
    plain.combat!.units.unit_p1_marksmen.abilities = [];
    const control = boltAt(plain, "unit_p1_marksmen");
    expect(control.combat!.units.unit_p1_marksmen.damage).toBe(2);
  });

  it("is immune to ongoing effects from Magic grade 1: an enemy Slow never shifts its initiative", () => {
    let state = sandboxWithCommander("paladin", { magic: 1 });
    state.players.p2.hand = ["spell.slow"];
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.activePlayerId = "p2";
    const before = effectiveInitiative(state.combat!.units[commanderUnitId("p1")], state.activeEffects);
    state = settle(
      apply(state, {
        type: "CAST_SPELL",
        playerId: "p2",
        cardId: "spell.slow",
        target: { type: "unit", unitId: commanderUnitId("p1") }
      })
    );
    const after = effectiveInitiative(state.combat!.units[commanderUnitId("p1")], state.activeEffects);
    expect(after).toBe(before);

    // CONTROL: the same Slow drags a plain unit down.
    let control = createInitialGameState();
    control.players.p2.hand = ["spell.slow"];
    control.combat!.activeUnitId = "unit_p2_skeletons";
    control.activePlayerId = "p2";
    const unit = control.combat!.units.unit_p1_marksmen;
    const baseline = effectiveInitiative(unit, control.activeEffects);
    control = settle(
      apply(control, {
        type: "CAST_SPELL",
        playerId: "p2",
        cardId: "spell.slow",
        target: { type: "unit", unitId: "unit_p1_marksmen" }
      })
    );
    expect(effectiveInitiative(control.combat!.units.unit_p1_marksmen, control.activeEffects)).toBeLessThan(baseline);

    // CONTROL 2: a Magic grade-0 commander is NOT immune — the same Slow drags
    // IT down too (the immunity is the grade-1 package, not a baseline).
    let unwarded = sandboxWithCommander("paladin"); // magic grade 0
    unwarded.players.p2.hand = ["spell.slow"];
    unwarded.combat!.activeUnitId = "unit_p2_skeletons";
    unwarded.activePlayerId = "p2";
    const rawBefore = effectiveInitiative(unwarded.combat!.units[commanderUnitId("p1")], unwarded.activeEffects);
    unwarded = settle(
      apply(unwarded, {
        type: "CAST_SPELL",
        playerId: "p2",
        cardId: "spell.slow",
        target: { type: "unit", unitId: commanderUnitId("p1") }
      })
    );
    expect(
      effectiveInitiative(unwarded.combat!.units[commanderUnitId("p1")], unwarded.activeEffects)
    ).toBeLessThan(rawBefore);
  });

  it("is tierless: tier-gated casts (Blind) never offer the commander as a target", () => {
    const state = sandboxWithCommander("paladin");
    state.players.p2.hand = ["spell.blind"];
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.activePlayerId = "p2";
    const targets = getLegalActions(state, "p2")
      .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.blind")
      .map((legal) => (legal.action.type === "CAST_SPELL" && legal.action.target?.type === "unit" ? legal.action.target.unitId : null));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets).not.toContain(commanderUnitId("p1"));
  });
});

// ===========================================================================
// Defense grade II — the "+1 def when attacked" Defense token.
// ===========================================================================

describe("WOG commanders — Defense grade II Defense token", () => {
  // Grade values: 1 / 2 / 2 / 3. Grade II is Defense 2 PLUS a Defense token
  // (rolls the Defend die when attacked); grade III is a reliable flat 3.
  function commanderTakes(defenseGrade: number, defendDie: number, attackerAttack = 5): number {
    const state = sandboxWithCommander("paladin", { defense: defenseGrade }, 9);
    const commander = state.combat!.units[commanderUnitId("p1")];
    commander.maxHealth = 20; // survive the blow so we can read the damage
    commander.retaliatedThisRound = true;
    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.abilities = [];
    attacker.attack = attackerAttack;
    attacker.position = 10; // adjacent to cell 9
    state.combat!.activeUnitId = attacker.id;
    state.activePlayerId = "p2";
    // Roll order: the attacker's main die (0), then the commander's Defend die.
    state.combat!.dice.scriptedRolls = [0, defendDie];
    state.combat!.dice.rollCount = 0;
    const after = settle(
      apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: attacker.id, defenderId: commander.id })
    );
    return after.combat!.units[commanderUnitId("p1")].damage;
  }

  it("only grade II carries commander-defense-token", () => {
    expect(commanderAbilityIds(freshCommander("paladin", { defense: 2 }))).toContain("commander-defense-token");
    expect(commanderAbilityIds(freshCommander("paladin", { defense: 1 }))).not.toContain("commander-defense-token");
    expect(commanderAbilityIds(freshCommander("paladin", { defense: 3 }))).not.toContain("commander-defense-token");
  });

  it("grade II rolls the Defend die when attacked (+1 def on a '+1' face)", () => {
    // Defense 2, Defend die '+1' → effective 3 → 5 - 3 = 2 damage.
    expect(commanderTakes(2, 1)).toBe(2);
    // Same commander, Defend die '0' → the die pays nothing → 5 - 2 = 3 damage.
    expect(commanderTakes(2, 0)).toBe(3);
  });

  it("grade I (no token) never rolls; grade III is a reliable flat 3 with no die", () => {
    // CONTROL: grade I is Defense 2 but NO token, so a scripted '+1' is ignored
    // (no Defend die is rolled): always 5 - 2 = 3.
    expect(commanderTakes(1, 1)).toBe(3);
    // Grade III is a flat Defense 3 with NO die — a scripted '+1' changes
    // nothing: 5 - 3 = 2, never 5 - 4 = 1.
    expect(commanderTakes(3, 1)).toBe(2);
  });
});

// ===========================================================================
// Damage grade (Might) and the two grade-3 combos.
// ===========================================================================

describe("WOG commanders — Might, Charge and Death Stare", () => {
  function meleeDuel(slug: CommanderSlug, grades: Partial<Record<(typeof COMMANDER_STAT_KEYS)[number], number>>): GameState {
    const state = sandboxWithCommander(slug, grades, 9);
    const commander = state.combat!.units[commanderUnitId("p1")];
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 10; // adjacent to cell 9
    defender.defense = 0;
    defender.maxHealth = 20;
    defender.damage = 0;
    defender.retaliatedThisRound = true; // keep the duel one-sided
    state.combat!.activeUnitId = commander.id;
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return state;
  }

  const COMMANDER_ATTACK: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: commanderUnitId("p1"),
    defenderId: "unit_p2_skeletons"
  };

  it("Might: Damage grade rolls that many EXTRA attack dice — each '+1' raises the attack, at most one '−1' counts", () => {
    // Roll order per attack: index 0 = the normal attack die, indices 1.. = the
    // Damage-grade Might dice. (No shield/defense die here to shift them.)

    // Grade 0 control: no extra dice → attack 2 + main die 0 = 2 damage.
    let control = meleeDuel("paladin", {});
    control = settle(apply(control, COMMANDER_ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(2);

    // Grade 1, the one extra die rolls '+1' → attack 2 + 1 = 3.
    let up = meleeDuel("paladin", { damage: 1 });
    up.combat!.dice.scriptedRolls = [0, 1];
    up = settle(apply(up, COMMANDER_ATTACK));
    expect(up.combat!.units.unit_p2_skeletons.damage).toBe(3);

    // Grade 1, the extra die rolls '−1' → attack 2 − 1 = 1 (a die can also lower).
    let down = meleeDuel("paladin", { damage: 1 });
    down.combat!.dice.scriptedRolls = [0, -1];
    down = settle(apply(down, COMMANDER_ATTACK));
    expect(down.combat!.units.unit_p2_skeletons.damage).toBe(1);

    // Grade 3, all three '+1' → attack 2 + 3 = 5 (the maximum).
    let mighty = meleeDuel("paladin", { damage: 3 });
    mighty.combat!.dice.scriptedRolls = [0, 1, 1, 1];
    mighty = settle(apply(mighty, COMMANDER_ATTACK));
    expect(mighty.combat!.units.unit_p2_skeletons.damage).toBe(5);

    // Grade 3, two '−1' and one '+1' → the '−1's are capped at ONE:
    // +1 − 1 = +0, so attack stays 2. (Summing every die would give 1 − 2 = −1
    // → only 1 damage, so this pins the "at most one −1" rule.)
    let capped = meleeDuel("paladin", { damage: 3 });
    capped.combat!.dice.scriptedRolls = [0, -1, -1, 1];
    capped = settle(apply(capped, COMMANDER_ATTACK));
    expect(capped.combat!.units.unit_p2_skeletons.damage).toBe(2);

    // The Might dice are ATTACK dice — they push through Defense: grade 3 with
    // three '+1' is attack 5, so vs Defense 4 it lands 1 damage…
    let pushes = meleeDuel("paladin", { damage: 3 });
    pushes.combat!.units.unit_p2_skeletons.defense = 4;
    pushes.combat!.dice.scriptedRolls = [0, 1, 1, 1];
    pushes = settle(apply(pushes, COMMANDER_ATTACK));
    expect(pushes.combat!.units.unit_p2_skeletons.damage).toBe(1);

    // …but a genuinely blocked hit (Defense 9 vs attack 5) is still 0.
    let blocked = meleeDuel("paladin", { damage: 3 });
    blocked.combat!.units.unit_p2_skeletons.defense = 9;
    blocked.combat!.dice.scriptedRolls = [0, 1, 1, 1];
    blocked = settle(apply(blocked, COMMANDER_ATTACK));
    expect(blocked.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("Charge (Damage grade 3 + Speed grade 2): +1 Attack only when attacking after moving", () => {
    // Script the Might dice to all '+1' so the extra dice add their full count
    // (Damage grade) and the Charge +1 is isolated. main die 0, then '+1's.
    function withFullMight(grades: Partial<Record<(typeof COMMANDER_STAT_KEYS)[number], number>>): GameState {
      const s = meleeDuel("paladin", grades);
      s.combat!.dice.scriptedRolls = [0, 1, 1, 1, 1, 1];
      return s;
    }

    // Stationary: attack 2 + Might 3 = 5 damage. Speed 2 is enough for the
    // combo under the grade-3 + grade-2 unlock rule — but Charge only fires
    // after a move.
    let still = withFullMight({ damage: 3, speed: 2 });
    still = settle(apply(still, COMMANDER_ATTACK));
    expect(still.combat!.units.unit_p2_skeletons.damage).toBe(5);

    // Move (13 → 9), then strike from the new cell in the same activation —
    // the player flow that sets movedThisActivation before the attack.
    function moveAndStrike(state: GameState): GameState {
      state.combat!.units[commanderUnitId("p1")].position = 13;
      let current = apply(state, {
        type: "MOVE_UNIT",
        playerId: "p1",
        unitId: commanderUnitId("p1"),
        destination: 9
      });
      expect(current.combat!.units[commanderUnitId("p1")].movedThisActivation).toBe(true);
      current = settle(apply(current, COMMANDER_ATTACK));
      return current;
    }

    const charging = moveAndStrike(withFullMight({ damage: 3, speed: 2 }));
    expect(charging.combat!.units.unit_p2_skeletons.damage).toBe(6);

    // The reversed orientation (Speed 3 + Damage 2) unlocks the combo too:
    // 2 attack + 1 Charge + 2 Might = 5 after moving.
    const reversed = moveAndStrike(withFullMight({ damage: 2, speed: 3 }));
    expect(reversed.combat!.units.unit_p2_skeletons.damage).toBe(5);

    // CONTROL: below the threshold (speed grade 1) the same move-then-attack
    // gains no Charge: 2 + 3 Might = 5.
    const noCombo = moveAndStrike(withFullMight({ damage: 3, speed: 1 }));
    expect(noCombo.combat!.units.unit_p2_skeletons.damage).toBe(5);
  });

  it("Death Stare (Damage grade 3 + Magic grade 2): a double '-1' follow-up destroys the target's side", () => {
    let state = meleeDuel("paladin", { damage: 3, magic: 2 });
    expect(state.combat!.units[commanderUnitId("p1")].abilities).toContain("gorgon-death-stare");
    // Roll order: main die 0, then the three Damage-grade Might dice (0/0/0 → no
    // bonus), then the two Death Stare dice both roll -1: the 20-Health PACK side
    // is destroyed outright — it flips down to its Few side.
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, -1, -1];
    state = settle(apply(state, COMMANDER_ATTACK));
    expect(state.combat!.units.unit_p2_skeletons.variant).toBe("few");

    // CONTROL: magic grade 1 stays below the combo threshold → no Death Stare,
    // so the same rolls only scratch the Pack (the plain 2-damage attack).
    let control = meleeDuel("paladin", { damage: 3, magic: 1 });
    expect(control.combat!.units[commanderUnitId("p1")].abilities).not.toContain("gorgon-death-stare");
    control.combat!.dice.scriptedRolls = [0, 0, 0, 0, -1, -1];
    control = settle(apply(control, COMMANDER_ATTACK));
    expect(control.combat!.units.unit_p2_skeletons.variant).toBe("pack");
    expect(control.combat!.units.unit_p2_skeletons.damage).toBeLessThan(20);
  });
});

// ===========================================================================
// Death persistence + revive (gold scales with hero level).
// ===========================================================================

describe("WOG commanders — death and revive", () => {
  it("a commander killed in combat stays dead; reviving costs 2 + 2x hero level gold", () => {
    const state = adventureWithCommanders("cmd-death");
    const fight = intoNeutralFight(state);
    const unit = fight.combat!.units[commanderUnitId("p1")];
    unit.damage = unit.maxHealth; // struck down mid-fight
    fight.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fight);
    expect(fight.players.p1.commander?.dead).toBe(true);

    // The won fight levelled the hero to 2 (difficulty 2 > level 1 → +2 XP),
    // so the revive costs 2 + 2x2 = 6 gold.
    const hero = getMainHero(fight, "p1")!;
    expect(hero.level).toBe(2);
    expect(commanderReviveCost(hero.level)).toBe(6);
    fight.players.p1.resources.gold = 7;
    const revived = apply(fight, { type: "REVIVE_COMMANDER", playerId: "p1" });
    expect(revived.players.p1.commander?.dead).toBeFalsy();
    expect(revived.players.p1.resources.gold).toBe(1);

    // An alive commander cannot be revived again.
    applyError(revived, { type: "REVIVE_COMMANDER", playerId: "p1" });
  });

  it("rejects a revive the player cannot pay, and scales the cost with the hero's level", () => {
    const state = adventureWithCommanders("cmd-revive-poor");
    state.players.p1.commander!.dead = true;
    state.players.p1.resources.gold = 3; // needs 4 at level 1
    applyError(state, { type: "REVIVE_COMMANDER", playerId: "p1" });
    expect(commanderReviveCost(6)).toBe(14);
  });

  it("CONTROL: a commander that SURVIVES a won combat stays alive", () => {
    const state = adventureWithCommanders("cmd-survive");
    const fight = intoNeutralFight(state);
    fight.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fight);
    expect(fight.players.p1.commander?.dead).toBeFalsy();
  });
});

// ===========================================================================
// Specialties (the passives not covered elsewhere).
// ===========================================================================

describe("WOG commanders — specialties", () => {
  it("Superior Combat (Shaman): the +1 Attack/Defense stance holds ONLY during combat rounds 1-2, not from round 3", () => {
    // The stance is a LIVE fold (not baked into the unit), so a fresh combat unit
    // reads the BASE stats — the +1 only shows up in resolved attacks.
    const injected = intoNeutralFight(adventureWithCommanders("cmd-stance-base", "fortress", undefined));
    const injectedUnit = injected.combat!.units[commanderUnitId("p1")];
    expect(injectedUnit.attack).toBe(2); // base — the +1 stance is not baked in
    expect(injectedUnit.defense).toBe(1);

    // Attack-stance commander (base Attack 2) vs a stripped skeleton, die 0. The
    // damage IS the effective attack, so the +1 stance is observable here.
    function attackDamage(round: number, artifacts?: Record<string, string>): number {
      const state = sandboxWithCommander("shaman", {}, 9); // stance defaults to Attack
      if (artifacts) {
        state.players.p1.commander!.artifacts = artifacts;
        const commander = makeCommanderCombatUnit(state.players.p1, 9)!;
        state.combat!.units[commander.id] = commander; // rebuild with the artifact folded
      }
      state.combat!.round = round;
      const skeletons = state.combat!.units.unit_p2_skeletons;
      skeletons.abilities = [];
      skeletons.position = 10;
      skeletons.defense = 0;
      skeletons.maxHealth = 20;
      skeletons.damage = 0;
      skeletons.retaliatedThisRound = true;
      state.combat!.activeUnitId = commanderUnitId("p1");
      state.activePlayerId = "p1";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      const next = settle(
        apply(state, {
          type: "ATTACK_UNIT",
          playerId: "p1",
          attackerId: commanderUnitId("p1"),
          defenderId: "unit_p2_skeletons"
        })
      );
      return next.combat!.units.unit_p2_skeletons.damage;
    }

    // Rounds 1 & 2: base Attack 2 + 1 stance = 3. Round 3: the stance is gone → 2.
    expect(attackDamage(1)).toBe(3);
    expect(attackDamage(2)).toBe(3);
    expect(attackDamage(3)).toBe(2);

    // Defense-stance commander (base Defense 1) struck by an Attack-4 enemy, die 0.
    function incomingDamage(round: number): number {
      const state = sandboxWithCommander("shaman", {}, 9);
      state.players.p1.commander!.stance = "defense";
      state.combat!.round = round;
      const skeletons = state.combat!.units.unit_p2_skeletons;
      skeletons.abilities = [];
      skeletons.position = 10;
      skeletons.attack = 4;
      const commander = state.combat!.units[commanderUnitId("p1")];
      commander.maxHealth = 20;
      commander.damage = 0;
      commander.retaliatedThisRound = true;
      state.combat!.activeUnitId = "unit_p2_skeletons";
      state.activePlayerId = "p2";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      const next = settle(
        apply(state, {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: "unit_p2_skeletons",
          defenderId: commanderUnitId("p1")
        })
      );
      return next.combat!.units[commanderUnitId("p1")].damage;
    }

    // Rounds 1 & 2: Defense 1 + 1 stance = 2 → 4 - 2 = 2 damage. Round 3: 4 - 1 = 3.
    expect(incomingDamage(1)).toBe(2);
    expect(incomingDamage(2)).toBe(2);
    expect(incomingDamage(3)).toBe(3);

    // CONTROL: a NON-stance bonus persists into round 3. A bound Axe (+2 Attack,
    // baked) keeps its +2 whether or not the stance holds: round 1 = base 2 + axe
    // 2 + stance 1 = 5, round 3 = base 2 + axe 2 = 4 (the +2 axe never lapses).
    const AXE = "wog.artifact.axe_of_smashing";
    expect(attackDamage(1, { weapon: AXE })).toBe(5);
    expect(attackDamage(3, { weapon: AXE })).toBe(4);

    // CONTROL: a Paladin commander has no stance and rejects the action.
    applyError(adventureWithCommanders("cmd-stance-ctrl2"), {
      type: "COMMANDER_SET_STANCE",
      playerId: "p1",
      stance: "defense"
    });
    // CONTROL: the Sea Marshal no longer shares the stance (it is the Vanguard
    // Marshal now) — COMMANDER_SET_STANCE is rejected for it too.
    applyError(adventureWithCommanders("cmd-stance-cove-reject", "cove", undefined), {
      type: "COMMANDER_SET_STANCE",
      playerId: "p1",
      stance: "defense"
    });
  });

  it("Tinkerer (Artificer): war machines cost 5 less gold (min 0); other players pay full price", () => {
    const state = adventureWithCommanders("cmd-tinker", "factory", undefined);
    const discounted = warMachinesForSale(state, "factory", "p1");
    const fullPrice = warMachinesForSale(state, "factory", "p2");
    expect(discounted.length).toBeGreaterThan(0);
    for (const offer of discounted) {
      const printed = fullPrice.find((candidate) => candidate.cardId === offer.cardId);
      expect(printed, offer.cardId).toBeTruthy();
      expect(offer.cost.gold).toBe(Math.max(0, (printed!.cost.gold ?? 0) - 5));
    }
    // Dead commander → full price again.
    state.players.p1.commander!.dead = true;
    for (const offer of warMachinesForSale(state, "factory", "p1")) {
      const printed = fullPrice.find((candidate) => candidate.cardId === offer.cardId);
      expect(offer.cost.gold).toBe(printed!.cost.gold);
    }
  });

  it("Ballista Master (Ogre Leader): the Ballista shot becomes a free target choice", () => {
    const state = adventureWithCommanders("cmd-ballista", "stronghold", undefined);
    expect(hasBallistaChooseTarget(state, "p1")).toBe(true);
    expect(hasBallistaChooseTarget(state, "p2")).toBe(false);
    state.players.p1.commander!.dead = true;
    expect(hasBallistaChooseTarget(state, "p1")).toBe(false);
  });

  it("Undead (Soul Eater): a petrifying attack can never Paralyze the commander", () => {
    // A Stacked Medusa-style attacker (Petrifying Gaze) melees the commander.
    function petrify(slug: "soul_eater" | "paladin"): GameState {
      let state = sandboxWithCommander(slug, {}, 9);
      const medusa = state.combat!.units.unit_p2_skeletons;
      medusa.abilities = ["bank-medusa-paralyze-stacked"];
      medusa.bankUnit = true;
      medusa.stackToken = "attack";
      medusa.position = 10;
      state.combat!.units[commanderUnitId("p1")].maxHealth = 9; // survive the hit
      state.combat!.activeUnitId = medusa.id;
      state.activePlayerId = "p2";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      state = settle(
        apply(state, {
          type: "ATTACK_UNIT",
          playerId: "p2",
          attackerId: medusa.id,
          defenderId: commanderUnitId("p1")
        })
      );
      return state;
    }

    const undead = petrify("soul_eater");
    expect(
      undead.combat!.units[commanderUnitId("p1")].tokens?.some((token) => token.kind === "paralysis") ?? false
    ).toBe(false);

    // CONTROL: the same gaze Paralyzes a non-undead commander (tokens are not
    // ongoing effects, so the Magic-grade immunity does not cover them).
    const paladin = petrify("paladin");
    expect(
      paladin.combat!.units[commanderUnitId("p1")].tokens?.some((token) => token.kind === "paralysis")
    ).toBe(true);
  });

  it("Soul Reformer (Brute): +2 gold after a WON combat; no gold on a loss", () => {
    const won = adventureWithCommanders("cmd-brute", "dungeon", undefined);
    const fight = intoNeutralFight(won);
    const goldBefore = fight.players.p1.resources.gold;
    fight.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fight);
    expect(fight.players.p1.resources.gold).toBe(goldBefore + 2);

    // CONTROL: a lost fight pays nothing.
    const lost = adventureWithCommanders("cmd-brute-loss", "dungeon", undefined);
    const losing = intoNeutralFight(lost);
    const before = losing.players.p1.resources.gold;
    losing.combat!.outcome = {
      winnerPlayerId: NEUTRAL_PLAYER_ID,
      defeatedPlayerId: "p1",
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(losing);
    expect(losing.players.p1.resources.gold).toBe(before);
  });

  it("CONTROL: a non-Brute winner gets no Soul Reformer gold", () => {
    const state = adventureWithCommanders("cmd-brute-ctrl"); // castle → paladin
    const fight = intoNeutralFight(state);
    const before = fight.players.p1.resources.gold;
    fight.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fight);
    expect(fight.players.p1.resources.gold).toBe(before);
  });

  it("Mana Magician (Temple Guardian): two per-combat charges let Spells exceed the round limit", () => {
    function arrowCast(state: GameState) {
      return getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "CAST_SPELL" &&
          legal.action.cardId === "spell.magic_arrow" &&
          legal.action.target?.type === "unit" &&
          legal.action.target.unitId === "unit_p2_skeletons"
      );
    }

    const state = sandboxWithCommander("temple_guardian");
    const player = state.players.p1;
    // Combat start seeds the charges (sandbox: seed manually like finalizeCombatStart does).
    player.combatStats.commanderManaCharges = 2;
    expect(spellLimitFor(state, player)).toBe(3); // 1 + 2 charges

    // Already at the base limit: an over-limit cast is OFFERED and burns a charge…
    player.combatStats.spellsCastThisRound = 1;
    player.hand = ["spell.magic_arrow", "spell.magic_arrow"];
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.activePlayerId = "p1";
    const first = arrowCast(state);
    expect(first, "an over-limit cast backed by a charge").toBeTruthy();
    let current = settle(apply(state, first!.action));
    expect(current.players.p1.combatStats.commanderManaCharges).toBe(1);
    expect(current.players.p1.combatStats.spellsCastThisRound).toBe(2);

    // …the second over-limit cast burns the last charge…
    const second = arrowCast(current);
    expect(second, "a second over-limit cast").toBeTruthy();
    current = settle(apply(current, second!.action));
    expect(current.players.p1.combatStats.commanderManaCharges).toBe(0);
    expect(current.players.p1.combatStats.spellsCastThisRound).toBe(3);

    // …and with both charges spent a third over-limit cast is no longer offered.
    current.players.p1.hand = ["spell.magic_arrow"];
    expect(arrowCast(current)).toBeUndefined();

    // CONTROL: without charges the FIRST over-limit cast is never offered.
    const control = sandboxWithCommander("temple_guardian");
    control.players.p1.combatStats.spellsCastThisRound = 1;
    control.players.p1.hand = ["spell.magic_arrow"];
    control.combat!.activeUnitId = "unit_p1_marksmen";
    control.activePlayerId = "p1";
    expect(arrowCast(control)).toBeUndefined();
  });

  it("Charming (Succubus): one random neutral defender opens the fight Paralyzed", () => {
    const state = adventureWithCommanders("cmd-charm", "inferno", undefined);
    const fight = intoNeutralFight(state);
    const paralyzed = Object.values(fight.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.tokens?.some((token) => token.kind === "paralysis")
    );
    expect(paralyzed).toHaveLength(1);

    // CONTROL: a paladin owner charms nobody.
    const control = intoNeutralFight(adventureWithCommanders("cmd-charm-ctrl"));
    const none = Object.values(control.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.tokens?.some((token) => token.kind === "paralysis")
    );
    expect(none).toHaveLength(0);
  });

  it("Elemental Scourge (Astral Spirit): every neutral unit takes 1 damage at the start of a neutral combat", () => {
    // Same seed, module OFF: the identical difficulty-3 fight leaves guards at
    // full health — nothing scorches them.
    const control = createAdventureGameState({
      seed: "cmd-scourge",
      ruleset: "binh",
      wog: { ...WOG_ON, commanders: false },
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "One", factionId: "conflux" },
        { id: "p2", name: "Two", factionId: "necropolis" }
      ]
    });
    const controlGuards = Object.values(intoNeutralFight(control, 3).combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    );
    expect(controlGuards.length).toBeGreaterThanOrEqual(2);
    for (const guard of controlGuards) {
      expect(guard.damage, guard.cardName).toBe(0);
    }

    // Astral Spirit owner, same seed: every neutral guard now carries exactly 1
    // damage before the first activation.
    const state = adventureWithCommanders("cmd-scourge", "conflux", undefined);
    const guards = Object.values(intoNeutralFight(state, 3).combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    );
    expect(guards.length).toBeGreaterThanOrEqual(2);
    for (const guard of guards) {
      expect(guard.damage, guard.cardName).toBe(1);
    }

    // MUTATION CONTROL: a Paladin (Castle) owner — module still ON — has no
    // scourge, so the same difficulty leaves every neutral guard undamaged.
    const paladin = adventureWithCommanders("cmd-scourge-castle", "castle", undefined);
    for (const guard of Object.values(intoNeutralFight(paladin, 3).combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
    )) {
      expect(guard.damage, guard.cardName).toBe(0);
    }
  });

  it("Rune Ritual (Rune Keeper): +1 Rune EVERY time it is attacked AND every time it moves", () => {
    function ritualState(slug: CommanderSlug): GameState {
      const state = sandboxWithCommander(slug, {}, 9);
      state.players.p1.factionId = "bulwark"; // gainRunes gates on the Bulwark faction
      const commander = state.combat!.units[commanderUnitId("p1")];
      commander.maxHealth = 20; // survive the assault
      commander.retaliatedThisRound = true; // no retaliation → no attack-earned Runes
      return state;
    }
    function attackCommander(state: GameState, attackerId: string, from: number): GameState {
      const attacker = state.combat!.units[attackerId];
      attacker.abilities = [];
      attacker.position = from;
      state.combat!.activeUnitId = attackerId;
      state.activePlayerId = "p2";
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      return settle(
        apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId, defenderId: commanderUnitId("p1") })
      );
    }
    function moveCommander(state: GameState, destination: number): GameState {
      state.combat!.activeUnitId = commanderUnitId("p1");
      state.activePlayerId = "p1";
      return apply(state, {
        type: "MOVE_UNIT",
        playerId: "p1",
        unitId: commanderUnitId("p1"),
        destination
      });
    }

    // Attacked half: EVERY incoming attack banks a Rune (no once-per-combat cap).
    const bulwark = ritualState("bulwark");
    expect(bulwark.combat!.runes?.p1?.count ?? 0).toBe(0); // no combat-start grant
    let s = attackCommander(bulwark, "unit_p2_skeletons", 10);
    expect(s.combat!.runes?.p1?.count).toBe(1); // first attack banks a Rune
    s = attackCommander(s, "unit_p2_vampires", 13);
    expect(s.combat!.runes?.p1?.count).toBe(2); // and so does the second

    // Moved half: moving the commander banks a Rune too (cell 9 → the free 10).
    const moved = moveCommander(ritualState("bulwark"), 10);
    expect(moved.combat!.units[commanderUnitId("p1")].position).toBe(10);
    expect(moved.combat!.runes?.p1?.count).toBe(1);

    // CONTROL: a Paladin commander (even for a Bulwark player) has no Rune Ritual,
    // so neither being attacked nor moving banks anything.
    const ctrlAttacked = attackCommander(ritualState("paladin"), "unit_p2_skeletons", 10);
    expect(ctrlAttacked.combat!.runes?.p1?.count ?? 0).toBe(0);
    const ctrlMoved = moveCommander(ritualState("paladin"), 10);
    expect(ctrlMoved.combat!.runes?.p1?.count ?? 0).toBe(0);
  });
});

// ===========================================================================
// Vanguard Marshal (Cove Sea Marshal) — the front-line +1 Attack and the
// generic pre-combat SORT window (a reusable capability; the Cove specialty
// is the only source today).
// ===========================================================================

describe("WOG commanders — Vanguard Marshal front-line +1 Attack", () => {
  // The attacker's front line on the 4x5 board is the row nearest the enemy
  // (cells 12-15); the backline is 16-19, the middle row 8-11.
  const ATTACKER_FRONT = [12, 13, 14, 15];

  /** Cove commander (base Attack 2) at `pos`, attacking a stripped adjacent enemy. */
  function coveAttackDamage(pos: number, enemyPos: number): number {
    const state = sandboxWithCommander("corsair", {}, pos);
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.abilities = [];
    skeletons.position = enemyPos;
    skeletons.defense = 0;
    skeletons.maxHealth = 20;
    skeletons.damage = 0;
    skeletons.retaliatedThisRound = true;
    state.combat!.activeUnitId = commanderUnitId("p1");
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    const next = settle(
      apply(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: commanderUnitId("p1"),
        defenderId: "unit_p2_skeletons"
      })
    );
    return next.combat!.units.unit_p2_skeletons.damage;
  }

  it("grants +1 Attack while the commander stands on its own front line, and none off it", () => {
    // On the front line (13) attacking an adjacent enemy (14): base 2 + 1 = 3.
    expect(coveAttackDamage(13, 14)).toBe(3);
    // CONTROL: off the front line (middle row 9, backline 17): base 2 only.
    expect(coveAttackDamage(9, 10)).toBe(2);
    expect(coveAttackDamage(17, 18)).toBe(2);
  });

  it("is a LIVE positional read: moving ONTO the front line mid-combat turns it on", () => {
    // The commander starts on the backline (17) — off the front line — then MOVES
    // onto a front cell (13) and attacks the adjacent enemy (14). The +1 applies
    // because the read is against its CURRENT (moved-to) position.
    const state = sandboxWithCommander("corsair", {}, 17);
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.abilities = [];
    skeletons.position = 14;
    skeletons.defense = 0;
    skeletons.maxHealth = 20;
    skeletons.damage = 0;
    skeletons.retaliatedThisRound = true;
    state.combat!.activeUnitId = commanderUnitId("p1");
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;

    // Sanity: the start cell (17) is off the front line, the destination (13) on it.
    expect(commanderOnOwnFrontLine(state, state.combat!.units[commanderUnitId("p1")])).toBe(false);
    expect(ATTACKER_FRONT).toContain(13);

    // Move onto the front line, then attack.
    let moved = apply(state, { type: "MOVE_UNIT", playerId: "p1", unitId: commanderUnitId("p1"), destination: 13 });
    expect(moved.combat!.units[commanderUnitId("p1")].position).toBe(13);
    expect(commanderOnOwnFrontLine(moved, moved.combat!.units[commanderUnitId("p1")])).toBe(true);
    moved = settle(
      apply(moved, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: commanderUnitId("p1"),
        defenderId: "unit_p2_skeletons"
      })
    );
    // On the front line after the move → base 2 + 1 = 3.
    expect(moved.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("CONTROL: a non-Vanguard-Marshal commander gets NO front-line bonus", () => {
    // A Paladin on the very same front cell deals only its base Attack 2.
    const state = sandboxWithCommander("paladin", {}, 13);
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.abilities = [];
    skeletons.position = 14;
    skeletons.defense = 0;
    skeletons.maxHealth = 20;
    skeletons.damage = 0;
    skeletons.retaliatedThisRound = true;
    state.combat!.activeUnitId = commanderUnitId("p1");
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    const next = settle(
      apply(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: commanderUnitId("p1"),
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});

describe("WOG commanders — pre-combat SORT capability & window", () => {
  it("commanderPreCombatSortAvailable is true for a Cove commander, false for others and module-off", () => {
    // A Cove (Vanguard Marshal) commander in combat has the capability.
    const cove = intoNeutralFight(adventureWithCommanders("cmd-sort-cap-cove", "cove", undefined));
    expect(commanderPreCombatSortAvailable(cove, "p1")).toBe(true);

    // CONTROL: a Shaman commander does NOT (its specialty is the stance, not sort).
    const shaman = sandboxWithCommander("shaman", {}, 9);
    expect(commanderPreCombatSortAvailable(shaman, "p1")).toBe(false);
    // CONTROL: a Cove commander with the module OFF has no capability.
    const off = sandboxWithCommander("corsair", {}, 9);
    off.wog = { enabled: false, commanders: false, newObjects: false, newCreatures: false, artifacts: false };
    expect(commanderPreCombatSortAvailable(off, "p1")).toBe(false);
  });

  it("opens the sort window for a human Cove owner; PLACE_COMMANDER lands it on the clicked cell and FINISH starts the fight", () => {
    const state = intoNeutralFight(adventureWithCommanders("cmd-sort-open", "cove", undefined));
    // The window is open for p1 (the fighter/owner), phase held in setup.
    expect(state.combat!.pendingCommanderPlacement).toEqual(["p1"]);
    expect(state.phase).toBe("combat-setup");
    expect(state.priorityPlayerId).toBe("p1");
    expect(state.eventLog.some((event) => event.type === "COMMANDER_PLACEMENT_OPENED")).toBe(true);

    const offers = getLegalActions(state, "p1");
    expect(offers.some((offer) => offer.action.type === "PLACE_COMMANDER")).toBe(true);
    expect(offers.some((offer) => offer.action.type === "FINISH_COMMANDER_PLACEMENT")).toBe(true);

    // Pick an empty own-zone cell and move the commander there.
    const zone = commanderDeploymentCellsFor(state, "p1");
    const occupied = new Set(Object.values(state.combat!.units).map((unit) => unit.position));
    const target = zone.find((cell) => !occupied.has(cell))!;
    expect(target).toBeGreaterThanOrEqual(0);

    let moved = apply(state, { type: "PLACE_COMMANDER", playerId: "p1", position: target });
    expect(moved.combat!.units[commanderUnitId("p1")].position).toBe(target);
    // Still the setup window — the sort is not the confirm.
    expect(moved.phase).toBe("combat-setup");

    // Ready → the window closes and the battle proceeds (round 1 begins).
    moved = apply(moved, { type: "FINISH_COMMANDER_PLACEMENT", playerId: "p1" });
    expect(moved.combat!.pendingCommanderPlacement ?? null).toBeNull();
    expect(moved.phase).not.toBe("combat-setup");
    // The deferred start-of-combat package ran (round 1 announced).
    expect(moved.eventLog.some((event) => event.type === "COMBAT_ROUND_STARTED")).toBe(true);
  });

  it("CONTROL: a non-Cove commander opens NO sort window (the fight starts directly)", () => {
    const shaman = intoNeutralFight(adventureWithCommanders("cmd-sort-none-shaman", "fortress", undefined));
    expect(shaman.combat!.pendingCommanderPlacement ?? null).toBeNull();
    expect(shaman.phase).not.toBe("combat-setup");
    const paladin = intoNeutralFight(adventureWithCommanders("cmd-sort-none-paladin"));
    expect(paladin.combat!.pendingCommanderPlacement ?? null).toBeNull();
  });

  it("CONTROL: with the Commanders module OFF a Cove fight opens no window", () => {
    const noModule = createAdventureGameState({
      seed: "cmd-sort-module-off",
      ruleset: "binh",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "One", factionId: "cove" as never, heroDefId: undefined },
        { id: "p2", name: "Two", factionId: "necropolis" }
      ]
    });
    const fought = intoNeutralFight(noModule);
    expect(fought.combat!.pendingCommanderPlacement ?? null).toBeNull();
    // No commander at all with the module off.
    expect(fought.combat!.units[commanderUnitId("p1")]).toBeUndefined();
  });

  it("a COMPUTER Cove seat AUTO-SKIPS the window (no stall) though the capability holds", () => {
    const state = adventureWithCommanders("cmd-sort-ai", "cove", undefined);
    // Make p1 a computer seat.
    state.controllers = { p1: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    const fought = intoNeutralFight(state);
    // The window never opened for the computer — it kept the auto-placement.
    expect(fought.combat!.pendingCommanderPlacement ?? null).toBeNull();
    expect(fought.phase).not.toBe("combat-setup");
    // ...and the capability WAS present (proving the skip is the computer check,
    // not an absent capability): the commander stands, Cove, in the fight.
    expect(commanderPreCombatSortAvailable(fought, "p1")).toBe(true);
  });

  it("the AFK/turn-timeout driver resolves an open sort window (FINISH_COMMANDER_PLACEMENT)", () => {
    const state = intoNeutralFight(adventureWithCommanders("cmd-sort-afk", "cove", undefined));
    expect(state.combat!.pendingCommanderPlacement).toEqual(["p1"]);
    // The shared forced-resolution driver finishes the window for the dropped seat.
    expect(nextAfkDropAction(state, "p1")).toEqual({ type: "FINISH_COMMANDER_PLACEMENT", playerId: "p1" });
    // Applying it starts the fight.
    const resumed = apply(state, { type: "FINISH_COMMANDER_PLACEMENT", playerId: "p1" });
    expect(resumed.combat!.pendingCommanderPlacement ?? null).toBeNull();
  });

  it("PLACE_COMMANDER rejects an out-of-zone cell and a forged non-owner", () => {
    const state = intoNeutralFight(adventureWithCommanders("cmd-sort-guard", "cove", undefined));
    // An enemy-zone cell (defender backline 0) is out of the attacker's zone.
    applyError(state, { type: "PLACE_COMMANDER", playerId: "p1", position: 0 });
    // A player who is not the window's head owner cannot place.
    applyError(state, { type: "PLACE_COMMANDER", playerId: "p2", position: 12 });
  });
});

// ===========================================================================
// Anime Equipment cross-mod: hero items that grant commander capabilities.
// ===========================================================================

const ANIME_EQUIP_ON = { ...DEFAULT_ANIME_OPTIONS, enabled: true, equipment: true };

describe("WOG commanders — anime Equipment cross-mod grants", () => {
  it("Marshal's War Horn grants the pre-combat SORT to a non-Cove commander (CONTROLs: no horn, module off)", () => {
    // A Shaman commander's specialty is Superior Combat, NOT Vanguard Marshal —
    // so ONLY the War Horn can grant the sort capability here.
    const wearing = sandboxWithCommander("shaman", {}, 9);
    wearing.anime = { ...ANIME_EQUIP_ON };
    getMainHero(wearing, "p1")!.equipment = { accessory: EQUIPMENT_IDS.marshalsWarHorn };
    expect(commanderPreCombatSortAvailable(wearing, "p1")).toBe(true);

    // CONTROL: same commander, no horn → the specialty grants nothing.
    const bare = sandboxWithCommander("shaman", {}, 9);
    bare.anime = { ...ANIME_EQUIP_ON };
    expect(commanderPreCombatSortAvailable(bare, "p1")).toBe(false);

    // CONTROL: horn worn but the anime.equipment module OFF → the read is inert.
    const moduleOff = sandboxWithCommander("shaman", {}, 9);
    getMainHero(moduleOff, "p1")!.equipment = { accessory: EQUIPMENT_IDS.marshalsWarHorn };
    expect(commanderPreCombatSortAvailable(moduleOff, "p1")).toBe(false);
  });

  it("Spirit Crane Mount revives a fallen commander FREE at combat end (CONTROL: no mount → it stays dead)", () => {
    function fallAndFinalize(withMount: boolean): GameState {
      const state = sandboxWithCommander("shaman", {}, 9);
      state.anime = { ...ANIME_EQUIP_ON };
      if (withMount) {
        getMainHero(state, "p1")!.equipment = { mount: EQUIPMENT_IDS.spiritCraneMount };
      }
      const unit = findCommanderUnit(state, "p1")!;
      unit.damage = unit.maxHealth; // the commander unit ended the fight at 0 Health
      finalizeCommandersAfterCombat(state);
      return state;
    }

    const saved = fallAndFinalize(true);
    // The mount revives it: death never persists, and a SAVED event names the mount.
    expect(saved.players.p1.commander!.dead ?? false).toBe(false);
    const savedEvent = saved.eventLog.find((event) => event.type === "COMMANDER_ARTIFACT_SAVED");
    expect(savedEvent && "cardId" in savedEvent ? savedEvent.cardId : null).toBe(EQUIPMENT_IDS.spiritCraneMount);

    // CONTROL: without the mount the commander is marked dead (revive for gold).
    const dead = fallAndFinalize(false);
    expect(dead.players.p1.commander!.dead).toBe(true);
    expect(dead.eventLog.some((event) => event.type === "COMMANDER_DIED")).toBe(true);
  });
});

// ===========================================================================
// First Aid Master (Hierophant) — the post-combat restoration window.
// ===========================================================================

describe("WOG commanders — Hierophant First Aid window", () => {
  function hierophantFight(seed: string): GameState {
    return intoNeutralFight(adventureWithCommanders(seed, "rampart", undefined));
  }

  function winFight(state: GameState): GameState {
    state.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);
    return state;
  }

  it("revives ONE bronze/silver unit that died — and blocks other map actions until resolved", () => {
    const fight = hierophantFight("cmd-firstaid");
    const fallen = Object.values(fight.combat!.units).find(
      (unit) => unit.controllerId === "p1" && !unit.commanderSlug && (unit.grade === "bronze" || unit.grade === "silver")
    );
    expect(fallen, "a bronze/silver army unit in the fight").toBeTruthy();
    const armySizeBefore = fight.players.p1.army.length;
    fallen!.damage = fallen!.maxHealth;
    winFight(fight);

    const pending = fight.adventure!.pendingCommanderFirstAid;
    expect(pending?.playerId).toBe("p1");
    expect(pending!.options.some((option) => option.kind === "revive")).toBe(true);
    // The window gates the map: every offered action is a First Aid answer.
    const offered = getLegalActions(fight, "p1");
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((legal) => legal.action.type === "COMMANDER_FIRST_AID")).toBe(true);

    const reviveIndex = pending!.options.findIndex((option) => option.kind === "revive");
    const revived = apply(fight, { type: "COMMANDER_FIRST_AID", playerId: "p1", optionIndex: reviveIndex });
    expect(revived.adventure!.pendingCommanderFirstAid).toBeFalsy();
    expect(revived.players.p1.army.length).toBe(armySizeBefore); // the casualty came back
  });

  /**
   * Manufacture a survived Pack→Few flip: the army card entered as a PACK
   * (armyUnit.side) while its combat unit ends the fight on the FEW side.
   */
  function withFlippedPack(fight: GameState): { fight: GameState; armyUnitId: string } {
    const unit = Object.values(fight.combat!.units).find(
      (candidate) =>
        candidate.controllerId === "p1" &&
        !candidate.commanderSlug &&
        candidate.armyUnitId &&
        (candidate.grade === "bronze" || candidate.grade === "silver")
    );
    expect(unit, "a bronze/silver army unit in the fight").toBeTruthy();
    const armyUnit = fight.players.p1.army.find((candidate) => candidate.id === unit!.armyUnitId)!;
    armyUnit.side = "pack";
    unit!.variant = "few";
    unit!.damage = 0;
    return { fight, armyUnitId: armyUnit.id };
  }

  it("flips a Pack that fell to Few back up, and declining restores nothing", () => {
    const { fight, armyUnitId } = withFlippedPack(hierophantFight("cmd-firstaid-flip"));
    winFight(fight);

    const pending = fight.adventure!.pendingCommanderFirstAid;
    const flipIndex = pending!.options.findIndex((option) => option.kind === "flip-up");
    expect(flipIndex).toBeGreaterThanOrEqual(0);
    expect(pending!.options[flipIndex].armyUnitId).toBe(armyUnitId);

    // Decline: the army keeps the fallen Few side.
    const declined = apply(fight, { type: "COMMANDER_FIRST_AID", playerId: "p1", optionIndex: null });
    const armyUnit = declined.players.p1.army.find((candidate) => candidate.id === armyUnitId);
    expect(armyUnit?.side).toBe("few");
  });

  it("restoring the flipped Pack actually writes the Pack side back", () => {
    const { fight, armyUnitId } = withFlippedPack(hierophantFight("cmd-firstaid-flip2"));
    winFight(fight);
    const pending = fight.adventure!.pendingCommanderFirstAid;
    const flipIndex = pending!.options.findIndex((option) => option.kind === "flip-up");
    const restored = apply(fight, { type: "COMMANDER_FIRST_AID", playerId: "p1", optionIndex: flipIndex });
    const armyUnit = restored.players.p1.army.find((candidate) => candidate.id === armyUnitId);
    expect(armyUnit?.side).toBe("pack");
  });

  it("CONTROL: no window when the commander died, when nothing was lost, or for a non-Hierophant", () => {
    // Commander died alongside the casualty.
    const fell = hierophantFight("cmd-firstaid-dead");
    const casualty = Object.values(fell.combat!.units).find(
      (unit) => unit.controllerId === "p1" && !unit.commanderSlug && unit.grade !== "gold"
    );
    casualty!.damage = casualty!.maxHealth;
    const commander = fell.combat!.units[commanderUnitId("p1")];
    commander.damage = commander.maxHealth;
    winFight(fell);
    expect(fell.adventure!.pendingCommanderFirstAid).toBeFalsy();

    // Nothing lost.
    const clean = winFight(hierophantFight("cmd-firstaid-clean"));
    expect(clean.adventure!.pendingCommanderFirstAid).toBeFalsy();

    // A Paladin owner with the same casualty gets no window.
    const paladin = intoNeutralFight(adventureWithCommanders("cmd-firstaid-ctrl"));
    const lost = Object.values(paladin.combat!.units).find(
      (unit) => unit.controllerId === "p1" && !unit.commanderSlug && unit.grade !== "gold"
    );
    lost!.damage = lost!.maxHealth;
    winFight(paladin);
    expect(paladin.adventure!.pendingCommanderFirstAid).toBeFalsy();
  });
});

// ===========================================================================
// Belfast (Azur Lane) — the SECOND First Aid commander. The post-combat window
// is keyed off the specialty id "first-aid" (not the "hierophant" slug), so
// Belfast opens it too. This suite FAILS if the reducer predicate is reverted
// to slug-keying (`playerHasLivingCommander(state, playerId, "hierophant")`).
// ===========================================================================

describe("WOG commanders — Belfast First Aid (specialty-keyed, not slug-keyed)", () => {
  function winFight(state: GameState): GameState {
    state.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);
    return state;
  }

  function killABronzeSilverCasualty(fight: GameState): void {
    const fallen = Object.values(fight.combat!.units).find(
      (unit) =>
        unit.controllerId === "p1" && !unit.commanderSlug && (unit.grade === "bronze" || unit.grade === "silver")
    );
    expect(fallen, "a bronze/silver army unit in the fight").toBeTruthy();
    fallen!.damage = fallen!.maxHealth;
  }

  it("Belfast (Azur Lane) opens the First Aid window after a WON combat with a bronze/silver casualty", () => {
    const fight = intoNeutralFight(adventureWithCommanders("belfast-firstaid", "azur_lane", "enterprise"));
    // The azur_lane seat's commander is Belfast (the mapping under test).
    expect(fight.players.p1.commander?.slug).toBe("belfast");
    killABronzeSilverCasualty(fight);
    winFight(fight);

    const pending = fight.adventure!.pendingCommanderFirstAid;
    expect(pending?.playerId).toBe("p1");
    expect(pending!.options.some((option) => option.kind === "revive")).toBe(true);
  });

  it("CONTROL: Might Guy (superior-combat) opens NO window; the Hierophant (first-aid) still DOES", () => {
    // Might Guy — a non-first-aid commander — gets no window with the same casualty.
    const guy = intoNeutralFight(adventureWithCommanders("belfast-firstaid-ctrl-guy", "hidden_leaf", "naruto"));
    expect(guy.players.p1.commander?.slug).toBe("might_guy");
    killABronzeSilverCasualty(guy);
    winFight(guy);
    expect(guy.adventure!.pendingCommanderFirstAid).toBeFalsy();

    // Hierophant — the ORIGINAL first-aid commander — still opens the window, so
    // the re-key generalised the trigger without regressing the Rampart owner.
    const hiero = intoNeutralFight(adventureWithCommanders("belfast-firstaid-ctrl-hiero", "rampart", undefined));
    expect(hiero.players.p1.commander?.slug).toBe("hierophant");
    killABronzeSilverCasualty(hiero);
    winFight(hiero);
    expect(hiero.adventure!.pendingCommanderFirstAid?.playerId).toBe("p1");
  });
});
