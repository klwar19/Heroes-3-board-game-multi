import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { effectAppliesToUnit, getActiveDefenseBonus, makeActiveEffect } from "./active-effects";
import { getLegalMoveDestinations } from "./legal-actions";
import type { GameAction, GameEvent, GameState, PlayerId, SourceRef } from "./state";

/**
 * Coverage for the formerly display-only ("decorative") expansion creature
 * abilities now backed by real engine behaviour:
 *   • Wyverns (Fortress)  — poison cubes: 1 damage at each activation (DoT)
 *   • Dwarves (Rampart)   — roll a die when targeted by a Spell/Specialty; "+1" negates it
 *   • Pegasi (Rampart)    — all enemy spells lose 1 Power (min 0)
 *   • Dendroids (Rampart) — enemies starting adjacent cannot move (Bind)
 *   • Gargoyles (Tower)   — ignore ongoing SPELL effects
 *   • Titans (Tower)      — ignore ALL ongoing effects on themselves
 *   • Genies (Tower)      — discard from your deck, take a Spell to hand
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function abilityEventIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => event.abilityId);
}

// ---------------------------------------------------------------------------
// Data integrity — the right ability ids ride the right unit sides, and every
// new ability is wired to an implemented engine effect.
// ---------------------------------------------------------------------------

describe("expansion creatures carry the newly implemented ability ids", () => {
  const expected: { unit: string; side: "few" | "pack"; ability: string }[] = [
    { unit: "fortress.wyverns", side: "few", ability: "wyvern-poison-cube-few" },
    { unit: "fortress.wyverns", side: "pack", ability: "wyvern-poison-cube-pack" },
    { unit: "rampart.dwarves", side: "few", ability: "dwarf-magic-resistance" },
    { unit: "rampart.dwarves", side: "pack", ability: "dwarf-magic-resistance" },
    { unit: "rampart.pegasi", side: "pack", ability: "pegasi-magic-damper" },
    { unit: "rampart.dendroids", side: "pack", ability: "dendroid-bind" },
    { unit: "tower.gargoyles", side: "few", ability: "gargoyle-spell-ward" },
    { unit: "tower.gargoyles", side: "pack", ability: "gargoyle-spell-ward" },
    { unit: "tower.titans", side: "few", ability: "titan-ignore-ongoing" },
    { unit: "tower.titans", side: "pack", ability: "titan-ignore-ongoing" },
    { unit: "tower.genies", side: "few", ability: "genie-spell-draw-few" },
    { unit: "tower.genies", side: "pack", ability: "genie-spell-draw-pack" }
  ];

  for (const { unit, side, ability } of expected) {
    it(`${unit} (${side}) → ${ability}`, () => {
      expect(coreUnitDefinitions[unit]?.[side]?.abilities ?? []).toContain(ability);
    });
  }

  it("every new ability is implemented with the right effect type", () => {
    const effects: Record<string, string> = {
      "wyvern-poison-cube-few": "ON_ATTACK_POISON_CUBES",
      "wyvern-poison-cube-pack": "ON_ATTACK_POISON_CUBES",
      "dwarf-magic-resistance": "NEGATE_CARD_ON_DIE",
      "pegasi-magic-damper": "REDUCE_ENEMY_SPELL_POWER",
      "dendroid-bind": "BIND_ADJACENT_ENEMIES",
      "gargoyle-spell-ward": "IGNORE_ONGOING_SPELL_EFFECTS",
      "titan-ignore-ongoing": "IGNORE_ONGOING_EFFECTS",
      "genie-spell-draw-few": "DECK_DISCARD_TAKE_SPELL",
      "genie-spell-draw-pack": "DECK_DISCARD_TAKE_SPELL"
    };
    for (const [abilityId, effectType] of Object.entries(effects)) {
      const ability = unitAbilities[abilityId];
      expect(ability, abilityId).toBeTruthy();
      expect(ability.implementationStatus, abilityId).toBe("implemented");
      expect(ability.effect?.type, abilityId).toBe(effectType);
    }
  });
});

// ---------------------------------------------------------------------------
// Wyverns — poison cubes (damage-over-time)
// ---------------------------------------------------------------------------

describe("Wyvern poison cubes", () => {
  function poisonAttack(abilities: string[]): GameState {
    const state = createInitialGameState("wyvern-seed");
    const attacker = state.combat!.units.unit_p1_marksmen; // ranged
    attacker.abilities = abilities;
    attacker.attack = 3;
    attacker.position = 1;
    const target = state.combat!.units.unit_p2_skeletons;
    target.position = 13; // non-adjacent → ranged, no retaliation
    target.maxHealth = 20;
    target.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [0]);
    setActive(state, "p1", "unit_p1_marksmen");
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
  }

  it("the Few plants 1 cube on its target, the Pack plants 2", () => {
    expect(poisonAttack(["wyvern-poison-cube-few"]).combat!.units.unit_p2_skeletons.poisonCubes).toBe(1);
    expect(poisonAttack(["wyvern-poison-cube-pack"]).combat!.units.unit_p2_skeletons.poisonCubes).toBe(2);
  });

  it("an ordinary attacker plants no cubes", () => {
    expect(poisonAttack([]).combat!.units.unit_p2_skeletons.poisonCubes ?? 0).toBe(0);
  });

  /**
   * Hand the activation to `targetId` (the only non-activated unit besides the
   * driver) so its activation-start effects tick. The p1 griffin defends to end
   * its turn and advance — DEFEND is legal for a unit that has not yet acted.
   */
  function activate(state: GameState, targetId: string): GameState {
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== targetId && unit.id !== "unit_p1_griffins";
    }
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActive(state, "p1", "unit_p1_griffins");
    return settle(applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: "unit_p1_griffins" }));
  }

  it("a poisoned unit loses 1 Health and 1 cube at the start of its activation", () => {
    const state = createInitialGameState("wyvern-tick-seed");
    const target = state.combat!.units.unit_p2_skeletons;
    target.poisonCubes = 2;
    target.maxHealth = 20;
    target.damage = 0;
    const next = activate(state, "unit_p2_skeletons");
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(next.combat!.units.unit_p2_skeletons.poisonCubes).toBe(1);
    expect(abilityEventIds(next)).toContain("wyvern-poison-cube");
  });

  it("a unit with no cubes takes no poison at activation", () => {
    const state = createInitialGameState("wyvern-no-tick-seed");
    const target = state.combat!.units.unit_p2_skeletons;
    target.poisonCubes = 0;
    target.maxHealth = 20;
    target.damage = 0;
    const next = activate(state, "unit_p2_skeletons");
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Dwarves — roll a die to shrug off a Spell that targets them
// ---------------------------------------------------------------------------

describe("Dwarf Magic Resistance", () => {
  function arrowAtDwarf(dieRoll: number): GameState {
    const state = createInitialGameState("dwarf-seed");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = ["dwarf-magic-resistance"];
    target.maxHealth = 20;
    target.damage = 0;
    script(state, [dieRoll]);
    setActive(state, "p1", "unit_p1_griffins");
    return passAllReactions(
      applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.magic_arrow",
        target: { type: "unit", unitId: "unit_p2_skeletons" }
      })
    );
  }

  it('shrugs off the spell on a "+1" roll (no damage), but the spell is still spent', () => {
    const next = arrowAtDwarf(1);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(abilityEventIds(next)).toContain("dwarf-magic-resistance");
    // The negated spell still resolved — it leaves the hand for the discard.
    expect(next.players.p1.discard).toContain("spell.magic_arrow");
    expect(next.players.p1.hand).not.toContain("spell.magic_arrow");
  });

  it("takes the spell on any other roll", () => {
    const next = arrowAtDwarf(0);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(abilityEventIds(next)).toContain("dwarf-magic-resistance");
  });

  it("an ordinary unit never rolls to resist", () => {
    const state = createInitialGameState("dwarf-control-seed");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = [];
    target.maxHealth = 20;
    target.damage = 0;
    script(state, [1]); // a "+1" would negate IF it were a Dwarf
    setActive(state, "p1", "unit_p1_griffins");
    const next = passAllReactions(
      applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p1",
        cardId: "spell.magic_arrow",
        target: { type: "unit", unitId: "unit_p2_skeletons" }
      })
    );
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(abilityEventIds(next)).not.toContain("dwarf-magic-resistance");
  });
});

// ---------------------------------------------------------------------------
// Pegasi — enemy spells lose 1 Power
// ---------------------------------------------------------------------------

describe("Pegasi Magic Damper", () => {
  function arrowAtPower1(withPegasi: boolean): number {
    const state = createInitialGameState("pegasi-seed");
    // Two Spells: cast the Magic Arrow and discard the Bless as "+1 Power".
    state.players.p1.hand = ["spell.magic_arrow", "spell.bless"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 20;
    target.damage = 0;
    if (withPegasi) {
      // A living enemy Pegasi pack damps the caster's spells.
      state.combat!.units.unit_p2_vampires.abilities = ["pegasi-magic-damper"];
    }
    setActive(state, "p1", "unit_p1_griffins");
    let next = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });
    // Spend a Power statistic as "+1 Power" toward the cast (take the offer the
    // engine actually exposes, so the test never guesses the action shape).
    const boost = (next.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.asPowerBoost === true
    );
    expect(boost, "a +1 Power boost should be offered for the cast").toBeTruthy();
    next = passAllReactions(applyOk(next, boost!.action));
    return next.combat!.units.unit_p2_skeletons.damage;
  }

  it("a +1-Power Magic Arrow deals 2 normally, but only 1 against an enemy Pegasi (power 1 → 0)", () => {
    expect(arrowAtPower1(false)).toBe(2);
    expect(arrowAtPower1(true)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dendroids — Bind: enemies starting adjacent cannot move
// ---------------------------------------------------------------------------

describe("Dendroid Bind", () => {
  function setup(): GameState {
    const state = createInitialGameState("dendroid-seed");
    // The Dendroid sits at 13; an enemy ground unit at 9 is orthogonally adjacent.
    state.combat!.units.unit_p2_skeletons.abilities = ["dendroid-bind"];
    state.combat!.units.unit_p2_skeletons.position = 13;
    return state;
  }

  it("an enemy that starts adjacent to a Dendroid pack cannot move", () => {
    const state = setup();
    const victim = state.combat!.units.unit_p1_marksmen;
    victim.type = "ground";
    victim.position = 9; // adjacent to 13
    expect(getLegalMoveDestinations(state.combat!, victim, state)).toEqual([]);
  });

  it("an enemy that is NOT adjacent can still move", () => {
    const state = setup();
    const mover = state.combat!.units.unit_p1_marksmen;
    mover.type = "ground";
    mover.position = 1; // far from 13
    expect(getLegalMoveDestinations(state.combat!, mover, state).length).toBeGreaterThan(0);
  });

  it("a friendly unit adjacent to the Dendroid is not bound", () => {
    const state = setup();
    const ally = state.combat!.units.unit_p2_vampires;
    ally.type = "ground";
    ally.position = 9; // adjacent to the friendly Dendroid at 13
    ally.activatedThisRound = false;
    expect(getLegalMoveDestinations(state.combat!, ally, state).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Gargoyles / Titans — ongoing-effect immunity
// ---------------------------------------------------------------------------

describe("Gargoyle / Titan ongoing-effect immunity", () => {
  function debuff(state: GameState, source: SourceRef, unitId: string) {
    return makeActiveEffect(
      state,
      { name: "Test debuff", scope: "unit", duration: { type: "combat" }, modifiers: [{ type: "DEFENSE_BONUS", amount: -3 }] },
      source,
      "p1",
      { type: "unit", unitId }
    );
  }

  const spellSource: SourceRef = { type: "card", cardId: "spell.curse", controllerId: "p1" };
  const systemSource: SourceRef = { type: "system" };

  it("Gargoyles ignore a Spell-sourced ongoing effect but keep non-Spell ones", () => {
    const state = createInitialGameState();
    const unit = state.combat!.units.unit_p2_skeletons;
    unit.abilities = ["gargoyle-spell-ward"];
    expect(effectAppliesToUnit(debuff(state, spellSource, unit.id), unit)).toBe(false);
    expect(effectAppliesToUnit(debuff(state, systemSource, unit.id), unit)).toBe(true);
  });

  it("Titans ignore every ongoing effect on them, whatever its source", () => {
    const state = createInitialGameState();
    const unit = state.combat!.units.unit_p2_skeletons;
    unit.abilities = ["titan-ignore-ongoing"];
    expect(effectAppliesToUnit(debuff(state, spellSource, unit.id), unit)).toBe(false);
    expect(effectAppliesToUnit(debuff(state, systemSource, unit.id), unit)).toBe(false);
  });

  it("an ordinary unit is affected by both", () => {
    const state = createInitialGameState();
    const unit = state.combat!.units.unit_p2_skeletons;
    unit.abilities = [];
    expect(effectAppliesToUnit(debuff(state, spellSource, unit.id), unit)).toBe(true);
    expect(effectAppliesToUnit(debuff(state, systemSource, unit.id), unit)).toBe(true);
  });

  it("a Curse's Defense penalty never touches a Titan's effective Defense", () => {
    const state = createInitialGameState();
    const titan = state.combat!.units.unit_p2_skeletons;
    titan.abilities = ["titan-ignore-ongoing"];
    state.activeEffects.push(debuff(state, spellSource, titan.id));
    expect(getActiveDefenseBonus(state, titan)).toBe(0);

    const normal = state.combat!.units.unit_p2_vampires;
    normal.abilities = [];
    state.activeEffects.push(debuff(state, spellSource, normal.id));
    expect(getActiveDefenseBonus(state, normal)).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// Genies — discard from your deck, take a Spell to hand
// ---------------------------------------------------------------------------

describe("Genie Wish (Few — other action)", () => {
  function genieFew(deck: string[]): GameState {
    const state = createInitialGameState("genie-few-seed");
    const genie = state.combat!.units.unit_p1_griffins;
    genie.abilities = ["genie-spell-draw-few"];
    state.players.p1.deck = deck;
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    setActive(state, "p1", "unit_p1_griffins");
    return state;
  }

  it("is offered as an other action while there is a deck to dig", () => {
    const state = genieFew(["stat.power", "spell.magic_arrow", "stat.defense"]);
    const offered = getLegalActions(state, "p1").some((legal) => legal.action.type === "USE_GENIE_DECK_DRAW");
    expect(offered).toBe(true);
  });

  it("discards 3 from the deck and auto-takes the lone Spell to hand, then ends the activation", () => {
    const state = genieFew(["stat.power", "spell.magic_arrow", "stat.defense"]);
    const next = applyOk(state, { type: "USE_GENIE_DECK_DRAW", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(next.players.p1.hand).toContain("spell.magic_arrow");
    expect(next.players.p1.deck).toEqual([]);
    expect(next.players.p1.discard).toEqual(expect.arrayContaining(["stat.power", "stat.defense"]));
    expect(next.players.p1.discard).not.toContain("spell.magic_arrow");
    // The Wish was the unit's whole activation (like the Ogres' token action).
    expect(next.combat!.units.unit_p1_griffins.activatedThisRound).toBe(true);
  });

  it("with several Spells, opens a choice; the picked Spell goes to hand, the rest to discard", () => {
    const state = genieFew(["stat.power", "spell.bless", "spell.magic_arrow"]);
    const opened = applyOk(state, { type: "USE_GENIE_DECK_DRAW", playerId: "p1", unitId: "unit_p1_griffins" });
    const choice = opened.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") return;
    expect(choice.context).toBe("genie-take-spell");
    const wanted = choice.genieTakeSpell!.spellCardIds.indexOf("spell.bless");
    const next = applyOk(opened, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: wanted });
    expect(next.players.p1.hand).toContain("spell.bless");
    expect(next.players.p1.discard).toContain("spell.magic_arrow");
    expect(next.players.p1.discard).toContain("stat.power");
    expect(next.pendingChoice).toBeNull();
  });

  it("with no Spell among the dug cards, takes nothing (all go to discard)", () => {
    const state = genieFew(["stat.power", "stat.defense", "stat.attack"]);
    const next = applyOk(state, { type: "USE_GENIE_DECK_DRAW", playerId: "p1", unitId: "unit_p1_griffins" });
    expect(next.players.p1.hand).toEqual([]);
    expect(next.players.p1.discard).toEqual(expect.arrayContaining(["stat.power", "stat.defense", "stat.attack"]));
  });
});

describe("Genie Wish (Pack — on attack)", () => {
  function packAttack(deck: string[]): GameState {
    const state = createInitialGameState("genie-pack-seed");
    const attacker = state.combat!.units.unit_p1_marksmen; // ranged
    attacker.abilities = ["genie-spell-draw-pack"];
    attacker.attack = 3;
    attacker.position = 1;
    const target = state.combat!.units.unit_p2_skeletons;
    target.position = 13; // non-adjacent → ranged, no retaliation
    target.maxHealth = 20;
    target.damage = 0;
    state.players.p1.deck = deck;
    state.players.p1.hand = [];
    state.players.p1.discard = [];
    state.players.p2.hand = [];
    script(state, [0]);
    setActive(state, "p1", "unit_p1_marksmen");
    return applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
  }

  it("digs Spells out of the deck after the Genie attacks and takes the lone one", () => {
    const next = settle(packAttack(["stat.power", "spell.magic_arrow", "stat.defense"]));
    expect(next.players.p1.hand).toContain("spell.magic_arrow");
    expect(next.players.p1.deck).toEqual([]);
    // The attack still landed for its normal damage.
    expect(next.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(0);
  });

  it("with several Spells, opens a choice mid-attack and resumes the sequence after the pick", () => {
    const opened = settle(packAttack(["stat.power", "spell.bless", "spell.magic_arrow"]));
    const choice = opened.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") return;
    expect(choice.context).toBe("genie-take-spell");
    const wanted = choice.genieTakeSpell!.spellCardIds.indexOf("spell.magic_arrow");
    const next = applyOk(opened, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: wanted });
    expect(next.players.p1.hand).toContain("spell.magic_arrow");
    expect(next.players.p1.discard).toContain("spell.bless");
    expect(next.pendingChoice).toBeNull();
    // The attack resolved normally and combat moved on (no dangling choice).
    expect(next.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(0);
  });
});
