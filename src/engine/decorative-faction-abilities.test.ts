import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { applyAction, createInitialGameState, getLegalActions, makeActiveEffect } from "./index";
import {
  getActivationSpellPowerBoost,
  getOnAttackDieDraw,
  getSpellDamageReduction,
  getSpellDamageReductionAura,
  getUnitImmuneSpellSchools,
  hasSpellCastHandTax,
  unitImmuneToSpellSchools
} from "./unit-abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState } from "./state";

/**
 * Coverage for the faction (non-neutral) unit abilities de-decorated in this
 * batch — printed text that previously had no engine effect:
 *   • Efreet (Few/Pack)        — Magic Arrow / Fire spell immunity
 *   • Iron Golems, Unicorns Few — reduce spell damage by N (self)
 *   • Unicorns Pack            — reduce spell damage to itself AND adjacent allies
 *   • Minotaurs (Few/Pack)     — draw a card when the Attack die resolves "-1"
 *   • Familiars Pack           — tax each enemy Spell cast from hand
 *   • Magi Pack                — +1 power to the controller's first spell this round
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

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function unitWith(abilities: string[]): CombatUnitState {
  return { abilities } as CombatUnitState;
}

function abilityEventIds(state: GameState): string[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> => event.type === "UNIT_ABILITY_TRIGGERED")
    .map((event) => event.abilityId);
}

// ---------------------------------------------------------------------------
// Data integrity: every de-decorated faction side carries the right ability id,
// and each new ability id resolves to an implemented engine effect.
// ---------------------------------------------------------------------------

describe("faction rosters carry the newly implemented ability ids", () => {
  const expected: { unitId: string; side: "few" | "pack"; abilityId: string }[] = [
    { unitId: "inferno.efreet", side: "few", abilityId: "efreet-magic-arrow-immunity" },
    { unitId: "inferno.efreet", side: "pack", abilityId: "efreet-fire-immunity" },
    { unitId: "inferno.familiars", side: "pack", abilityId: "familiar-spell-tax" },
    { unitId: "tower.iron_golems", side: "few", abilityId: "reduce-spell-damage-1" },
    { unitId: "tower.iron_golems", side: "pack", abilityId: "reduce-spell-damage-2" },
    { unitId: "rampart.unicorns", side: "few", abilityId: "reduce-spell-damage-1" },
    { unitId: "rampart.unicorns", side: "pack", abilityId: "unicorn-spell-ward-aura" },
    { unitId: "dungeon.minotaurs", side: "few", abilityId: "minotaur-draw-on-miss" },
    { unitId: "dungeon.minotaurs", side: "pack", abilityId: "minotaur-draw-on-miss" },
    { unitId: "tower.magi", side: "pack", abilityId: "magi-power-boost" },
    // Vampires Pack: wiki "Ignore the Retaliation Attack. Then remove up to 2
    // damage from this unit." — the self-heal half (previously only on the
    // neutral guard) is now wired on the faction Pack too.
    { unitId: "necropolis.vampires", side: "pack", abilityId: "vampire-heal-on-attack" }
  ];

  for (const { unitId, side, abilityId } of expected) {
    it(`${unitId} ${side} has ${abilityId}`, () => {
      const def = coreUnitDefinitions[unitId];
      expect(def, unitId).toBeTruthy();
      expect(def[side]?.abilities ?? [], `${unitId}.${side}`).toContain(abilityId);
    });
  }

  it("Vampires Few does NOT self-heal — only the Pack gained the heal (divergence control)", () => {
    const def = coreUnitDefinitions["necropolis.vampires"];
    expect(def.few?.abilities ?? []).not.toContain("vampire-heal-on-attack");
    expect(def.few?.abilities ?? []).toEqual(["ignores-retaliation"]);
    expect(def.pack?.abilities ?? []).toEqual(["ignores-retaliation", "vampire-heal-on-attack"]);
  });

  it("each new ability id is registered and implemented", () => {
    const ids = [
      "efreet-magic-arrow-immunity",
      "reduce-spell-damage-1",
      "unicorn-spell-ward-aura",
      "minotaur-draw-on-miss",
      "magi-power-boost",
      "vampire-heal-on-attack"
    ];
    for (const id of ids) {
      const ability = unitAbilities[id];
      expect(ability, id).toBeTruthy();
      expect(ability.implementationStatus, id).toBe("implemented");
      expect(ability.effect?.type, id).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Efreet immunity — Few = Magic Arrow only; Pack = Magic Arrow + Fire.
// ---------------------------------------------------------------------------

describe("Efreet spell immunity scope", () => {
  it("Few resists Magic Arrow only (never a school)", () => {
    const few = unitWith(["efreet-magic-arrow-immunity"]);
    expect(getUnitImmuneSpellSchools(few)).toEqual(["any"]);
    expect(unitImmuneToSpellSchools(few, ["any"])).toBe(true); // Magic Arrow
    expect(unitImmuneToSpellSchools(few, ["fire"])).toBe(false); // a Fire spell lands
    expect(unitImmuneToSpellSchools(few, ["air"])).toBe(false);
  });

  it("Pack resists Magic Arrow AND the Fire school", () => {
    const pack = unitWith(["efreet-fire-immunity"]);
    expect(getUnitImmuneSpellSchools(pack).sort()).toEqual(["any", "fire"]);
    expect(unitImmuneToSpellSchools(pack, ["any"])).toBe(true);
    expect(unitImmuneToSpellSchools(pack, ["fire"])).toBe(true);
    expect(unitImmuneToSpellSchools(pack, ["air"])).toBe(false);
  });

  function targetsOf(state: GameState, cardId: string): string[] {
    return getLegalActions(state, "p1")
      .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId)
      .flatMap((legal) =>
        legal.action.type === "CAST_SPELL" && legal.action.target?.type === "unit" ? [legal.action.target.unitId] : []
      );
  }

  function combatWithEnemy(abilities: string[]): GameState {
    const state = createInitialGameState("efreet-faction-seed");
    state.combat!.units.unit_p2_skeletons.abilities = abilities;
    // Magic Arrow (school "any") and Lightning Bolt (air) are standalone casts;
    // the fire-scope difference between Few and Pack is covered by the helper
    // tests above (Curse/other Fire spells are instants, not standalone casts).
    state.players.p1.hand = ["spell.magic_arrow", "spell.lightning_bolt"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  it("Few Efreet blocks Magic Arrow targeting but an Air spell still lands", () => {
    const state = combatWithEnemy(["efreet-magic-arrow-immunity"]);
    expect(targetsOf(state, "spell.magic_arrow")).not.toContain("unit_p2_skeletons");
    expect(targetsOf(state, "spell.lightning_bolt")).toContain("unit_p2_skeletons");
  });

  it("Pack Efreet also blocks Magic Arrow targeting; an Air spell still lands", () => {
    const state = combatWithEnemy(["efreet-fire-immunity"]);
    expect(targetsOf(state, "spell.magic_arrow")).not.toContain("unit_p2_skeletons");
    expect(targetsOf(state, "spell.lightning_bolt")).toContain("unit_p2_skeletons");
  });
});

// ---------------------------------------------------------------------------
// Spell-damage reduction — Iron Golems / Unicorns Few (self), Unicorns Pack (aura).
// ---------------------------------------------------------------------------

describe("faction spell-damage reduction", () => {
  it("reduce-spell-damage-1 reports 1; the aura reports 1 via its own accessor", () => {
    expect(getSpellDamageReduction(unitWith(["reduce-spell-damage-1"]))).toBe(1);
    expect(getSpellDamageReductionAura(unitWith(["unicorn-spell-ward-aura"]))).toBe(1);
    // The aura is not counted as a self REDUCE_SPELL_DAMAGE.
    expect(getSpellDamageReduction(unitWith(["unicorn-spell-ward-aura"]))).toBe(0);
  });

  /** p1 casts a 1-damage Magic Arrow (scroll, power 0) at a p2 unit. */
  function arrowAt(setup: (state: GameState) => void): GameState {
    const state = createInitialGameState("faction-reduction-seed");
    state.players.p1.hand = [];
    state.players.p1.scrolls = [{ id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const target = state.combat!.units.unit_p2_vampires;
    target.maxHealth = 20;
    target.damage = 0;
    setup(state);
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

  it("a Unicorn/Iron Golem Few (reduce 1) takes 0 from a 1-damage Magic Arrow", () => {
    const next = arrowAt((state) => {
      state.combat!.units.unit_p2_vampires.abilities = ["reduce-spell-damage-1"];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(0);
  });

  it("an ordinary unit takes the full 1 damage", () => {
    const next = arrowAt((state) => {
      state.combat!.units.unit_p2_vampires.abilities = [];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
  });

  it("the Unicorn Pack aura shields an ADJACENT friendly unit (−1), but not a distant one", () => {
    // Aura on skeletons; target the friendly vampires beside it.
    const adjacent = arrowAt((state) => {
      const aura = state.combat!.units.unit_p2_skeletons;
      aura.abilities = ["unicorn-spell-ward-aura"];
      aura.maxHealth = 20;
      aura.damage = 0;
      aura.position = 4; // row 1, col 0
      state.combat!.units.unit_p2_vampires.position = 5; // row 1, col 1 → adjacent
      state.combat!.units.unit_p2_vampires.abilities = [];
    });
    expect(adjacent.combat!.units.unit_p2_vampires.damage).toBe(0); // 1 − 1 (aura)

    const distant = arrowAt((state) => {
      const aura = state.combat!.units.unit_p2_skeletons;
      aura.abilities = ["unicorn-spell-ward-aura"];
      aura.maxHealth = 20;
      aura.damage = 0;
      aura.position = 0; // far corner
      state.combat!.units.unit_p2_vampires.position = 11; // not adjacent to 0
      state.combat!.units.unit_p2_vampires.abilities = [];
    });
    expect(distant.combat!.units.unit_p2_vampires.damage).toBe(1); // aura out of range
  });
});

// ---------------------------------------------------------------------------
// Minotaurs — draw a card when this unit's Attack die resolves "-1".
// ---------------------------------------------------------------------------

describe("Minotaurs draw on a '-1' Attack die", () => {
  it("getOnAttackDieDraw reports the -1 trigger", () => {
    const draws = getOnAttackDieDraw(unitWith(["minotaur-draw-on-miss"]));
    expect(draws).toHaveLength(1);
    expect(draws[0]).toMatchObject({ onRoll: -1, amount: 1 });
    expect(getOnAttackDieDraw(unitWith([]))).toHaveLength(0);
  });

  function attackWithRoll(rolls: number[]): GameState {
    const state = createInitialGameState("minotaur-draw-seed");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.name = "Minotaurs";
    attacker.abilities = ["minotaur-draw-on-miss"];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.position = 2; // adjacent to 1
    defender.maxHealth = 30;
    defender.damage = 0;
    state.players.p1.hand = [];
    state.players.p1.deck = ["stat.attack"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    script(state, rolls);
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
  }

  it("draws 1 card on a '-1' (and logs the ability)", () => {
    const next = attackWithRoll([-1, 0]); // attack -1 → draw; retaliation 0 → no draw (defender lacks it)
    expect(next.players.p1.hand).toContain("stat.attack");
    expect(abilityEventIds(next)).toContain("minotaur-draw-on-miss");
  });

  it("does not draw on a '0'", () => {
    const next = attackWithRoll([0, 0]);
    expect(next.players.p1.hand).toEqual([]);
    expect(abilityEventIds(next)).not.toContain("minotaur-draw-on-miss");
  });
});

// ---------------------------------------------------------------------------
// Familiars (faction Pack) — tax each enemy Spell cast from hand by one card.
// ---------------------------------------------------------------------------

describe("faction Familiars 'Mana Leech' spell tax", () => {
  it("hasSpellCastHandTax reflects the ability", () => {
    expect(hasSpellCastHandTax(unitWith(["familiar-spell-tax"]))).toBe(true);
  });

  it("an enemy Familiar costs the caster one extra random card", () => {
    const state = createInitialGameState("faction-familiar-seed");
    state.players.p1.hand = ["spell.magic_arrow", "stat.power"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.abilities = ["familiar-spell-tax"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && !legal.action.fromScroll && legal.action.cardId === "spell.magic_arrow"
    );
    expect(cast).toBeTruthy();
    const next = passAllReactions(applyOk(state, cast!.action));
    expect(next.players.p1.hand).toEqual([]); // spell + taxed card both gone
    expect(abilityEventIds(next)).toContain("familiar-spell-tax");
  });
});

// ---------------------------------------------------------------------------
// Magi (Pack) — +1 power to the controller's first spell of the combat round.
// ---------------------------------------------------------------------------

describe("Magi 'Mage's Insight' first-spell power (only on the Magi's turn)", () => {
  it("getActivationSpellPowerBoost reports the unit's boost", () => {
    expect(getActivationSpellPowerBoost(unitWith(["magi-power-boost"]))).toBe(1);
    expect(getActivationSpellPowerBoost(unitWith([]))).toBe(0);
  });

  /**
   * Cast a hand Magic Arrow (base power 0 → 1 damage; +1 power → 2). The Magi
   * is the active unit `unit_p1_griffins` unless `setup` says otherwise.
   */
  function castArrow(setup: (state: GameState) => void): GameState {
    const state = createInitialGameState("magi-power-seed");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const target = state.combat!.units.unit_p2_vampires;
    target.maxHealth = 20;
    target.damage = 0;
    setup(state);
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        !legal.action.fromScroll &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    expect(cast, "hand cast of Magic Arrow at the target should be legal").toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("an ordinary active unit casting deals 1 (no boost)", () => {
    const next = castArrow(() => {});
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
  });

  it("when the Magi is the active unit, its first spell gains +1 power (deals 2)", () => {
    const next = castArrow((state) => {
      state.combat!.units.unit_p1_griffins.abilities = ["magi-power-boost"];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("no boost when the Magi is on the board but NOT the active unit (not its turn)", () => {
    const next = castArrow((state) => {
      // The Magi sits idle; a different friendly unit is the one acting.
      state.combat!.units.unit_p1_crusaders.abilities = ["magi-power-boost"];
      state.combat!.units.unit_p1_griffins.abilities = [];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
  });

  it("no boost on a later spell even on the Magi's turn (only the round's first)", () => {
    const next = castArrow((state) => {
      state.combat!.units.unit_p1_griffins.abilities = ["magi-power-boost"];
      // Raise the per-round spell limit so the cast is legal, then pretend one
      // spell was already cast this round — the "first spell" gate must close.
      // The gate tracks first-spell consumption with anySpellCastThisRound (so a
      // limit-free Helm cast also closes it), which a real prior cast sets.
      state.activeEffects.push(
        makeActiveEffect(
          state,
          {
            name: "limit",
            scope: "player",
            duration: { type: "combat" },
            modifiers: [{ type: "SPELL_LIMIT_BONUS", amount: 2 }]
          },
          { type: "unit", unitId: "unit_p1_griffins", controllerId: "p1" },
          "p1"
        )
      );
      state.players.p1.combatStats.spellsCastThisRound = 1;
      state.players.p1.combatStats.anySpellCastThisRound = true;
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
  });
});
