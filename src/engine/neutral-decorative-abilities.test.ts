import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  NEUTRAL_PLAYER_ID
} from "./index";
import {
  getOnAttackSelfHeal,
  getSpellDamageReduction,
  getUnitImmuneSpellSchools,
  hasDefenseTokenAura,
  hasSpellCastHandTax,
  unitImmuneToSpellSchools
} from "./unit-abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * Coverage for the neutral abilities wired in this batch — previously
 * display-only ("decorative") ability text now backed by engine behaviour:
 *   • Minotaurs — reroll a "-1" Attack die (incl. the neutral auto-resolution)
 *   • Efreet / Phoenixes — Fire (and Magic-Arrow) Spell immunity
 *   • Iron / Gold / Diamond Golems, Black Dragons — reduce Spell damage
 *   • Vampires — heal after their own attack
 *   • Phoenixes — once-per-combat Rebirth (survive a killing blow at 1 HP)
 *   • Halberdiers — lend adjacent allies a virtual Defense token
 *   • Familiars — tax each enemy Spell cast from hand by one card
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

/** Pass instant windows; for a reroll choice keep the latest (resolved) roll. */
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

function unitWith(abilities: string[]): CombatUnitState {
  return { abilities } as CombatUnitState;
}

function removedUnitIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_REMOVED" }> => event.type === "UNIT_REMOVED")
    .map((event) => event.unitId);
}

function abilityEventIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => event.abilityId);
}

// ---------------------------------------------------------------------------
// Data integrity — every de-decorated neutral carries the right ability id,
// and every new ability is wired to an implemented engine effect.
// ---------------------------------------------------------------------------

describe("neutral roster carries the newly implemented ability ids", () => {
  const expected: Record<string, string[]> = {
    "neutral.minotaurs": ["minotaur-reroll"],
    "neutral.efreet": ["efreet-fire-immunity"],
    "neutral.phoenixes": ["phoenix-rebirth", "phoenix-fire-immunity"],
    "neutral.iron_golems": ["reduce-spell-damage-2"],
    "neutral.gold_golems": ["reduce-spell-damage-2"],
    "neutral.diamond_golems": ["reduce-spell-damage-3"],
    "neutral.black_dragons": ["dragon-line-attack-2"],
    "neutral.vampires": ["ignores-retaliation", "vampire-heal-on-attack"],
    "neutral.halberdiers": ["halberdier-defense-aura"],
    "neutral.familiars": ["familiar-spell-tax"]
  };

  for (const [unitId, abilities] of Object.entries(expected)) {
    it(`${unitId} → [${abilities.join(", ")}]`, () => {
      const def = coreUnitDefinitions[unitId];
      expect(def, unitId).toBeTruthy();
      expect(def.neutral?.abilities ?? []).toEqual(abilities);
    });
  }

  it("all newly added abilities are marked implemented with the right effect", () => {
    const effects: Record<string, string> = {
      "minotaur-reroll": "ATTACK_DIE_REROLL",
      "efreet-fire-immunity": "IMMUNE_TO_SPELL_SCHOOLS",
      "phoenix-fire-immunity": "IMMUNE_TO_SPELL_SCHOOLS",
      "phoenix-rebirth": "SELF_REBIRTH_ONCE",
      "reduce-spell-damage-2": "REDUCE_SPELL_DAMAGE",
      "reduce-spell-damage-3": "REDUCE_SPELL_DAMAGE",
      "vampire-heal-on-attack": "ON_ATTACK_HEAL_SELF",
      "halberdier-defense-aura": "DEFENSE_TOKEN_AURA",
      "familiar-spell-tax": "SPELL_CAST_HAND_TAX"
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
// Efreet / Phoenix — Fire & Magic-Arrow Spell immunity
// ---------------------------------------------------------------------------

describe("Efreet / Phoenix spell-school immunity (helper)", () => {
  it("Efreet is immune to Magic Arrow (any) and Fire, but not other schools", () => {
    const efreet = unitWith(["efreet-fire-immunity"]);
    expect(getUnitImmuneSpellSchools(efreet).sort()).toEqual(["any", "fire"]);
    expect(unitImmuneToSpellSchools(efreet, ["any"])).toBe(true); // Magic Arrow
    expect(unitImmuneToSpellSchools(efreet, ["fire"])).toBe(true);
    expect(unitImmuneToSpellSchools(efreet, ["air"])).toBe(false);
    expect(unitImmuneToSpellSchools(efreet, ["water"])).toBe(false);
  });

  it("Phoenix is immune to Fire only — NOT to Magic Arrow", () => {
    const phoenix = unitWith(["phoenix-rebirth", "phoenix-fire-immunity"]);
    expect(getUnitImmuneSpellSchools(phoenix)).toEqual(["fire"]);
    expect(unitImmuneToSpellSchools(phoenix, ["fire"])).toBe(true);
    expect(unitImmuneToSpellSchools(phoenix, ["any"])).toBe(false); // Magic Arrow lands
    expect(unitImmuneToSpellSchools(phoenix, ["air"])).toBe(false);
  });
});

describe("Efreet / Phoenix immunity blocks spell targeting in combat", () => {
  function combatWithEnemy(abilities: string[]): GameState {
    const state = createInitialGameState("fire-immunity-seed");
    state.combat!.units.unit_p2_skeletons.abilities = abilities;
    // Magic Arrow (any), Curse (fire), Lightning Bolt (air).
    state.players.p1.hand = ["spell.magic_arrow", "spell.curse", "spell.lightning_bolt"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  function targetsOf(state: GameState, cardId: string): string[] {
    return getLegalActions(state, "p1")
      .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId)
      .flatMap((legal) =>
        legal.action.type === "CAST_SPELL" && legal.action.target?.type === "unit" ? [legal.action.target.unitId] : []
      );
  }

  it("Efreet cannot be targeted by Magic Arrow or Fire spells, but stays open to Air", () => {
    const state = combatWithEnemy(["efreet-fire-immunity"]);
    expect(targetsOf(state, "spell.magic_arrow")).not.toContain("unit_p2_skeletons");
    expect(targetsOf(state, "spell.curse")).not.toContain("unit_p2_skeletons");
    expect(targetsOf(state, "spell.lightning_bolt")).toContain("unit_p2_skeletons");
  });

  it("Phoenix blocks Fire spells but a Magic Arrow still lands (fire-only immunity)", () => {
    const state = combatWithEnemy(["phoenix-rebirth", "phoenix-fire-immunity"]);
    expect(targetsOf(state, "spell.curse")).not.toContain("unit_p2_skeletons");
    expect(targetsOf(state, "spell.magic_arrow")).toContain("unit_p2_skeletons");
  });
});

// ---------------------------------------------------------------------------
// Spell damage reduction — Iron / Gold / Diamond Golems, Black Dragons
// ---------------------------------------------------------------------------

describe("spell damage reduction (helper)", () => {
  it("reports the printed reduction and 0 for ordinary units", () => {
    expect(getSpellDamageReduction(unitWith(["reduce-spell-damage-2"]))).toBe(2);
    expect(getSpellDamageReduction(unitWith(["reduce-spell-damage-3"]))).toBe(3);
    expect(getSpellDamageReduction(unitWith(["dragon-line-attack-2", "reduce-spell-damage-2"]))).toBe(2);
    expect(getSpellDamageReduction(unitWith(["lich-death-cloud"]))).toBe(0);
  });
});

describe("spell damage reduction in combat (Magic Arrow scroll cast)", () => {
  function arrowAt(targetAbilities: string[]): GameState {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p1.scrolls = [{ id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const target = state.combat!.units.unit_p2_vampires;
    target.abilities = targetAbilities;
    target.maxHealth = 20;
    target.damage = 0;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.fromScroll === "scroll_1" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    expect(cast, "scroll cast at the target should be legal").toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("an Iron Golem (reduce 2) takes 0 from a 1-damage Magic Arrow", () => {
    const next = arrowAt(["reduce-spell-damage-2"]);
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(0);
  });

  it("an ordinary unit takes the full 1 damage", () => {
    const next = arrowAt([]);
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Vampires — heal after their own attack (never a retaliation)
// ---------------------------------------------------------------------------

describe("Vampire self-heal after attacking", () => {
  it("removes up to 2 damage after the vampire's own ranged attack", () => {
    expect(getOnAttackSelfHeal(unitWith(["vampire-heal-on-attack"]))?.amount).toBe(2);

    const state = createInitialGameState();
    const vamp = state.combat!.units.unit_p1_marksmen;
    vamp.abilities = ["vampire-heal-on-attack"];
    vamp.attack = 3;
    vamp.position = 1;
    vamp.maxHealth = 10;
    vamp.damage = 5;
    const target = state.combat!.units.unit_p2_skeletons;
    target.position = 13; // non-adjacent → no retaliation
    target.maxHealth = 20;
    target.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [1]);
    setActive(state, "p1", "unit_p1_marksmen");

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
    expect(next.combat!.units.unit_p1_marksmen.damage).toBe(3); // 5 − 2 healed
  });

  it("an undamaged vampire stays at 0 (never over-heals)", () => {
    const state = createInitialGameState();
    const vamp = state.combat!.units.unit_p1_marksmen;
    vamp.abilities = ["vampire-heal-on-attack"];
    vamp.attack = 3;
    vamp.position = 1;
    vamp.damage = 0;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_skeletons.maxHealth = 20;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [1]);
    setActive(state, "p1", "unit_p1_marksmen");

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
    expect(next.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(abilityEventIds(next)).not.toContain("vampire-heal-on-attack");
  });

  it("does NOT heal from a Retaliation Attack", () => {
    const state = createInitialGameState();
    // p1 attacker is adjacent to the vampire, which retaliates.
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.type = "ground";
    attacker.attack = 1;
    attacker.position = 12;
    attacker.maxHealth = 20;
    attacker.damage = 0;
    const vamp = state.combat!.units.unit_p2_skeletons;
    vamp.abilities = ["vampire-heal-on-attack"]; // a vampire that only retaliates here
    vamp.attack = 2;
    vamp.position = 13; // adjacent to 12 → retaliates
    vamp.maxHealth = 10;
    vamp.damage = 4;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [0, 0, 0, 0]);
    setActive(state, "p1", "unit_p1_marksmen");

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
    // The vampire retaliated but its on-attack heal never fired.
    expect(abilityEventIds(next)).not.toContain("vampire-heal-on-attack");
    expect(next.combat!.units.unit_p2_skeletons.damage).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Phoenixes — once-per-combat Rebirth
// ---------------------------------------------------------------------------

describe("Phoenix Rebirth", () => {
  function lethalAttackOnPhoenix(prepare: (phoenix: CombatUnitState) => void): GameState {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = []; // drop the printed double-attack — one clean hit
    attacker.attack = 10;
    attacker.position = 1;
    const phoenix = state.combat!.units.unit_p2_skeletons;
    phoenix.abilities = ["phoenix-rebirth"];
    phoenix.variant = "few"; // single-sided: no Pack→Few flip in the way
    phoenix.position = 13; // non-adjacent → clean ranged kill
    phoenix.defense = 0;
    phoenix.maxHealth = 5;
    phoenix.damage = 0;
    prepare(phoenix);
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [1]); // +1 → 11 damage, lethal
    setActive(state, "p1", "unit_p1_marksmen");
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
  }

  it("survives a killing blow at 1 Health, once per combat", () => {
    const next = lethalAttackOnPhoenix(() => {});
    const phoenix = next.combat!.units.unit_p2_skeletons;
    expect(phoenix.damage).toBe(4); // maxHealth(5) − 1
    expect(phoenix.usedRebirthThisCombat).toBe(true);
    expect(removedUnitIds(next)).not.toContain("unit_p2_skeletons");
    expect(abilityEventIds(next)).toContain("phoenix-rebirth");
  });

  it("does not trigger twice — a second killing blow removes it", () => {
    const next = lethalAttackOnPhoenix((phoenix) => {
      phoenix.usedRebirthThisCombat = true; // already spent earlier this combat
    });
    expect(removedUnitIds(next)).toContain("unit_p2_skeletons");
  });
});

// ---------------------------------------------------------------------------
// Halberdiers — adjacent allies gain a virtual Defense token
// ---------------------------------------------------------------------------

describe("Halberdier 'Phalanx' aura", () => {
  it("hasDefenseTokenAura reflects the ability", () => {
    expect(hasDefenseTokenAura(unitWith(["halberdier-defense-aura"]))).toBe(true);
    expect(hasDefenseTokenAura(unitWith([]))).toBe(false);
  });

  function duelWithAura(allyAbilities: string[]): GameState {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = []; // drop the printed double-attack — one clean hit
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.defense = 0;
    defender.defenseToken = false;
    defender.maxHealth = 20;
    defender.damage = 0;
    // A friendly (p2) Halberdier adjacent to the defender.
    const ally = state.combat!.units.unit_p2_vampires;
    ally.abilities = allyAbilities;
    ally.position = 14; // adjacent to 13
    ally.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [1, 1]); // attack die +1, then the Defend die +1
    setActive(state, "p1", "unit_p1_marksmen");
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
  }

  it("lets an adjacent ally roll the Defend die (a +1 face shaves 1 damage)", () => {
    const withAura = duelWithAura(["halberdier-defense-aura"]);
    // attack 3 +1 = 4; defense 0 + Defend(+1) = 1 → 3 damage.
    expect(withAura.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("without the aura the same attack lands for the full 4", () => {
    const noAura = duelWithAura([]);
    expect(noAura.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Familiars — tax each enemy Spell cast from hand
// ---------------------------------------------------------------------------

describe("Familiar 'Mana Leech' spell tax", () => {
  it("hasSpellCastHandTax reflects the ability", () => {
    expect(hasSpellCastHandTax(unitWith(["familiar-spell-tax"]))).toBe(true);
    expect(hasSpellCastHandTax(unitWith([]))).toBe(false);
  });

  function castArrowFromHand(enemyAbilities: string[]): GameState {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow", "stat.power"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.abilities = enemyAbilities;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" && !legal.action.fromScroll && legal.action.cardId === "spell.magic_arrow"
    );
    expect(cast, "hand cast of Magic Arrow should be legal").toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("an enemy Familiar costs the caster one extra random card", () => {
    const next = castArrowFromHand(["familiar-spell-tax"]);
    expect(next.players.p1.hand).toEqual([]); // the spell + the taxed card are both gone
    expect(next.players.p1.discard).toContain("spell.magic_arrow");
    expect(next.players.p1.discard).toContain("stat.power");
    expect(abilityEventIds(next)).toContain("familiar-spell-tax");
  });

  it("no Familiar → only the spell itself leaves the hand", () => {
    const next = castArrowFromHand([]);
    expect(next.players.p1.hand).toEqual(["stat.power"]);
    expect(abilityEventIds(next)).not.toContain("familiar-spell-tax");
  });
});

// ---------------------------------------------------------------------------
// Minotaurs — reroll a "-1" Attack die
// ---------------------------------------------------------------------------

describe("Minotaur 'Fury' reroll", () => {
  function duel(rolls: number[], drive: (state: GameState) => GameState): GameState {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_marksmen;
    attacker.abilities = ["minotaur-reroll"];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 20;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, rolls);
    setActive(state, "p1", "unit_p1_marksmen");
    return drive(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
    );
  }

  it("opens a reroll choice on a '-1' and the rerolled face replaces it", () => {
    const afterAttack = duel([-1, 1], (state) => passAllReactions(state));
    const choice = afterAttack.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    if (choice?.type !== "ATTACK_DIE_REROLL") return;

    const rerolled = applyOk(afterAttack, { type: "REROLL_PENDING_CHOICE", playerId: "p1", choiceId: choice.id });
    const resolved = applyOk(rerolled, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p1",
      choiceId: choice.id,
      candidateIndex: 1
    });
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4); // attack 3 + rerolled +1
  });

  it("does NOT open a reroll on a non-'-1' face", () => {
    const afterAttack = duel([0], (state) => passAllReactions(state));
    expect(afterAttack.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
    expect(afterAttack.combat!.units.unit_p2_skeletons.damage).toBe(3); // attack 3 + 0
  });
});

// ---------------------------------------------------------------------------
// Minotaurs — a NEUTRAL guard auto-resolves its own reroll (no hang)
// ---------------------------------------------------------------------------

describe("neutral Minotaur auto-rerolls its own '-1'", () => {
  function neutralFightWithGuard(reshape: (guard: CombatUnitState) => void): GameState {
    let state = createAdventureGameState({ seed: "minotaur-seed", difficulty: "normal", rollFirstPlayer: false });
    state = state.players.p1.needsHandRefresh ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }) : state;
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
    const armyUnit = state.players.p1.army[0];
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
    for (const unit of Object.values(state.combat!.units)) {
      unit.initiative = 99; // the player unit moves first; the guard stays put
    }
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    reshape(guard);
    return state;
  }

  function defendThrough(state: GameState): GameState {
    let current = state;
    let safety = 40;
    while (safety > 0) {
      safety -= 1;
      if (current.reactionWindow) {
        current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
        continue;
      }
      const pre = current.combat?.pendingNeutralStep;
      if (pre?.kind === "pre-activation") {
        current = applyOk(current, { type: "CONTINUE_NEUTRAL_STEP", playerId: pre.reactingPlayerId ?? "p1" });
        continue;
      }
      const active = current.combat?.activeUnitId ? current.combat.units[current.combat.activeUnitId] : null;
      if (!active || active.controllerId !== "p1" || current.pendingChoice || !current.combat || current.combat.outcome) {
        return current;
      }
      current = applyOk(current, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
    }
    return current;
  }

  it("rerolls the guard's '-1' attack die automatically and never hangs", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.name = "Minotaur";
      guard.cardName = "Minotaurs";
      guard.type = "ground";
      guard.abilities = ["minotaur-reroll"];
      guard.attack = 3;
      guard.initiative = 1; // acts after the player unit
      guard.position = 14; // adjacent to the placed unit at 13
    });
    // First attack die "-1" (auto-rerolled by Fury), then a "+1".
    script(state, [-1, 1, 0, 0, 0, 0]);

    state = defendThrough(state);

    // The neutral never left a reroll choice dangling, and the reroll fired.
    expect(state.pendingChoice).toBeNull();
    expect(
      state.eventLog.some((event) => event.type === "ATTACK_REROLLED" && event.sourceName === "Minotaur Fury")
    ).toBe(true);
  });
});
