import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { sampleCards } from "@/data/cards/sample";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  makeActiveEffect,
  unitDealsElementalDamage
} from "./index";
import { unitImmuneToSpellSchools } from "./unit-abilities";
import type { ActiveEffectModifier, CombatUnitState, GameAction, GameEvent, GameState } from "./state";

/**
 * End-to-end guarantees for EVERY Elemental (neutral guards + the four summon
 * sides), driven straight from the shipped unit data — not hand-set abilities.
 *
 * 1. Elemental damage is "die-proof": the Attack die never rolls, attack-card
 *    and Attack-token buffs are ignored, the defender's Defense is ignored, and
 *    the hit always lands for the unit's printed Attack value.
 * 2. Every Elemental is immune to Magic Arrow (school "any") AND to its own
 *    School of Magic — and to nothing else (Magic Elementals: Magic Arrow only).
 *
 * If a side ever loses its `elemental-damage` / `<school>-elemental-immunity`
 * tag, or a damaging Spell loses its school tag, a case here fails.
 */

// ---------------------------------------------------------------------------
// Inventory: every Elemental side that the data marks as dealing elemental
// damage, paired with its printed Attack. Collected from the real definitions.
// ---------------------------------------------------------------------------
type SideKey = "few" | "pack" | "neutral";

const elementalSides: { unitId: string; sideKey: SideKey; printedAttack: number; abilities: string[] }[] = [];
for (const [unitId, def] of Object.entries(coreUnitDefinitions)) {
  for (const sideKey of ["few", "pack", "neutral"] as SideKey[]) {
    const side = def[sideKey];
    if (side?.abilities?.includes("elemental-damage")) {
      elementalSides.push({ unitId, sideKey, printedAttack: side.attack, abilities: [...side.abilities] });
    }
  }
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
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

/** Drives the attack to completion, auto-resolving any reroll choice at 0. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
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
        candidateIndex: 0
      });
    }
  }
  return current;
}

function attackBonus(state: GameState, unitId: string, amount: number): void {
  const buff = makeActiveEffect(
    state,
    {
      name: "Offense",
      scope: "unit",
      duration: { type: "combat" },
      modifiers: [{ type: "ATTACK_BONUS", amount } satisfies ActiveEffectModifier]
    },
    { type: "system" },
    "p1",
    { type: "unit", unitId }
  );
  state.activeEffects.push(buff);
}

/**
 * A clean melee duel: p1's attacker (pos 9) strikes an undefended foe (pos 13).
 * The caller overrides the attacker from a real Elemental side.
 */
function duel(configure: (state: GameState) => void): GameState {
  const state = createInitialGameState("elemental-fixed-seed");
  const attacker = state.combat!.units.unit_p1_griffins;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.type = "ground";
  attacker.position = 9;
  attacker.attack = 3;
  attacker.defense = 1;
  attacker.maxHealth = 50;
  attacker.damage = 0;
  attacker.abilities = [];
  defender.type = "ground";
  defender.position = 13;
  defender.attack = 1;
  defender.defense = 0;
  defender.maxHealth = 50;
  defender.damage = 0;
  defender.abilities = [];
  state.combat!.units.unit_p1_marksmen.position = 0;
  state.combat!.units.unit_p1_crusaders.position = 3;
  state.combat!.units.unit_p2_vampires.position = 19;
  state.combat!.units.unit_p2_dread_knights.position = 16;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  configure(state);
  return state;
}

function firstAttack(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }> {
  const rolled = state.eventLog.find(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      event.type === "ATTACK_ROLLED" && !event.isRetaliation
  );
  if (!rolled) {
    throw new Error("no attack was rolled");
  }
  return rolled;
}

function runAttack(state: GameState): GameState {
  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    })
  );
}

describe("every Elemental deals die-proof, fixed damage (real unit data)", () => {
  it("covers every neutral guard AND both summon sides", () => {
    // Sanity on the inventory so a dropped side can't silently shrink coverage:
    // 9 neutral guards + Air/Earth/Water/Fire summon Few & Pack sides, plus the
    // recruitable Conflux faction elementals (Storm/Ice/Energy/Magma Few & Pack
    // and the Magic Elementals Pack — the Magic Few is not an elemental-damage
    // dealer per the wiki).
    const ids = new Set(elementalSides.map((entry) => entry.unitId));
    expect(ids).toEqual(
      new Set([
        "neutral.air_elementals",
        "neutral.earth_elementals",
        "neutral.water_elementals",
        "neutral.ice_elementals",
        "neutral.storm_elementals",
        "neutral.energy_elementals",
        "neutral.fire_elementals",
        "neutral.magma_elementals",
        "neutral.magic_elementals",
        "conflux.storm_elementals",
        "conflux.ice_elementals",
        "conflux.energy_elementals",
        "conflux.magma_elementals",
        "conflux.magic_elementals"
      ])
    );
    expect(elementalSides.length).toBe(26);
  });

  for (const { unitId, sideKey, printedAttack, abilities } of elementalSides) {
    it(`${unitId} (${sideKey}) ignores the die, a +4 buff and the foe's Defense`, () => {
      const state = duel((draft) => {
        const a = draft.combat!.units.unit_p1_griffins;
        a.attack = printedAttack;
        a.abilities = abilities; // straight from the shipped definition
        // A +1 die face is queued and a +4 attack buff is played; the foe has
        // Defense 4. An Elemental must ignore all three.
        draft.combat!.dice.scriptedRolls = [1, 1, 1, 1];
        draft.combat!.units.unit_p2_skeletons.defense = 4;
        attackBonus(draft, "unit_p1_griffins", 4);
      });

      const attacker = state.combat!.units.unit_p1_griffins;
      expect(unitDealsElementalDamage(state, attacker), `${unitId} should deal elemental damage`).toBe(true);

      const resolved = runAttack(state);
      const event = firstAttack(resolved);
      expect(event.noDie, "the die is skipped").toBe(true);
      expect(event.roll, "the queued +1 face is not applied").toBe(0);
      expect(event.attackValue, "buff and die both ignored").toBe(printedAttack);
      expect(event.defenseValue, "Defense is ignored entirely").toBe(0);
      expect(event.damage, "damage is exactly the printed Attack").toBe(printedAttack);
      expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(printedAttack);
    });
  }

  it("a Sorceress' Weakness still lowers an Elemental's fixed damage", () => {
    // The one modifier that DOES apply: a debuff lowers the Attack value.
    const air = coreUnitDefinitions["neutral.air_elementals"].neutral!;
    const state = duel((draft) => {
      const a = draft.combat!.units.unit_p1_griffins;
      a.attack = air.attack;
      a.abilities = [...(air.abilities ?? [])];
      a.tokens = [{ id: "tk", kind: "weakness", amount: -1, sourceName: "Sorceresses" }];
    });
    const event = firstAttack(runAttack(state));
    expect(event.damage).toBe(air.attack - 1);
  });
});

// ---------------------------------------------------------------------------
// Immunity: Magic Arrow + own School of Magic, for every Elemental.
// ---------------------------------------------------------------------------
const SCHOOL_BY_UNIT: Record<string, "air" | "earth" | "fire" | "water" | null> = {
  "neutral.air_elementals": "air",
  "neutral.storm_elementals": "air",
  "neutral.earth_elementals": "earth",
  "neutral.magma_elementals": "earth",
  "neutral.fire_elementals": "fire",
  "neutral.energy_elementals": "fire",
  "neutral.water_elementals": "water",
  "neutral.ice_elementals": "water",
  "neutral.magic_elementals": null // Magic Arrow only — never a school
};

const ALL_SCHOOLS = ["air", "earth", "fire", "water"] as const;

function sidesOf(unitId: string): CombatUnitState[] {
  const def = coreUnitDefinitions[unitId];
  return (["few", "pack", "neutral"] as SideKey[])
    .map((key) => def[key])
    .filter((side): side is NonNullable<typeof side> => Boolean(side))
    .map((side) => ({ abilities: side.abilities ?? [] }) as CombatUnitState);
}

describe("every Elemental is immune to Magic Arrow and its own School (real data)", () => {
  for (const [unitId, school] of Object.entries(SCHOOL_BY_UNIT)) {
    it(`${unitId}: Magic Arrow always; ${school ?? "no"} school; nothing else`, () => {
      for (const unit of sidesOf(unitId)) {
        // Magic Arrow (school "any") — every Elemental resists it.
        expect(unitImmuneToSpellSchools(unit, ["any"]), `${unitId} vs Magic Arrow`).toBe(true);

        for (const candidate of ALL_SCHOOLS) {
          const shouldResist = candidate === school;
          expect(unitImmuneToSpellSchools(unit, [candidate]), `${unitId} vs ${candidate}`).toBe(shouldResist);
        }
      }
    });
  }

  it("matches the immunity to the actual shipped Spell cards", () => {
    const magicArrow = sampleCards["spell.magic_arrow"]; // ["any"]
    const lightningBolt = sampleCards["spell.lightning_bolt"]; // ["air"]
    const fireball = sampleCards["spell.fireball"]; // ["fire"]

    const air = sidesOf("neutral.air_elementals")[0];
    const fire = sidesOf("neutral.fire_elementals")[0];
    const water = sidesOf("neutral.water_elementals")[0];
    const magic = sidesOf("neutral.magic_elementals")[0];

    // Air resists Magic Arrow + Lightning Bolt, but a Fireball lands.
    expect(unitImmuneToSpellSchools(air, magicArrow.spellSchools)).toBe(true);
    expect(unitImmuneToSpellSchools(air, lightningBolt.spellSchools)).toBe(true);
    expect(unitImmuneToSpellSchools(air, fireball.spellSchools)).toBe(false);

    // Fire resists Magic Arrow + Fireball, but a Lightning Bolt lands.
    expect(unitImmuneToSpellSchools(fire, fireball.spellSchools)).toBe(true);
    expect(unitImmuneToSpellSchools(fire, lightningBolt.spellSchools)).toBe(false);

    // Water resists only Magic Arrow among the shipped damaging Spells.
    expect(unitImmuneToSpellSchools(water, magicArrow.spellSchools)).toBe(true);
    expect(unitImmuneToSpellSchools(water, lightningBolt.spellSchools)).toBe(false);
    expect(unitImmuneToSpellSchools(water, fireball.spellSchools)).toBe(false);

    // Magic Elementals resist Magic Arrow ONLY — both schooled bolts land.
    expect(unitImmuneToSpellSchools(magic, magicArrow.spellSchools)).toBe(true);
    expect(unitImmuneToSpellSchools(magic, lightningBolt.spellSchools)).toBe(false);
    expect(unitImmuneToSpellSchools(magic, fireball.spellSchools)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the immunity actually removes the Elemental as a Spell target.
// ---------------------------------------------------------------------------
function spellTargets(state: GameState, cardId: string): string[] {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId)
    .flatMap((legal) =>
      legal.action.type === "CAST_SPELL" && legal.action.target?.type === "unit" ? [legal.action.target.unitId] : []
    );
}

describe("Elemental immunity blocks real Spell targeting (basic damaging Spells)", () => {
  function combatWithEnemy(unitId: string): GameState {
    const state = createInitialGameState("elemental-target-seed");
    const def = coreUnitDefinitions[unitId];
    const side = def.neutral ?? def.few ?? def.pack;
    state.combat!.units.unit_p2_skeletons.abilities = [...(side!.abilities ?? [])];
    state.players.p1.hand = ["spell.magic_arrow", "spell.lightning_bolt"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    return state;
  }

  for (const [unitId, school] of Object.entries(SCHOOL_BY_UNIT)) {
    it(`${unitId} cannot be hit by Magic Arrow; Lightning Bolt only blocked for Air`, () => {
      const state = combatWithEnemy(unitId);
      // Magic Arrow ("any") never targets an Elemental.
      expect(spellTargets(state, "spell.magic_arrow")).not.toContain("unit_p2_skeletons");
      // …yet a plain enemy stays targetable, proving the spell is otherwise live.
      expect(spellTargets(state, "spell.magic_arrow")).toContain("unit_p2_vampires");

      // Lightning Bolt (Air) is blocked only for the Air-school Elementals.
      const boltTargets = spellTargets(state, "spell.lightning_bolt");
      if (school === "air") {
        expect(boltTargets).not.toContain("unit_p2_skeletons");
      } else {
        expect(boltTargets).toContain("unit_p2_skeletons");
      }
    });
  }
});

describe("Fireball's area damage skips an immune Elemental (end-to-end)", () => {
  it("an adjacent Fire Elemental is never offered as a splash target", () => {
    const state = createInitialGameState("fireball-splash-seed");
    const combat = state.combat!;
    state.activePlayerId = "p1";
    combat.activeUnitId = "unit_p1_crusaders"; // caster (kept clear of the blast)
    state.players.p1.hand = ["spell.fireball"];
    state.players.p2.hand = [];

    // Primary target at 13; two units sit adjacent (9 and 14).
    combat.units.unit_p2_skeletons.abilities = [];
    combat.units.unit_p2_skeletons.position = 13;
    combat.units.unit_p1_griffins.abilities = []; // plain neighbour → a candidate
    combat.units.unit_p1_griffins.position = 9;
    combat.units.unit_p2_vampires.abilities = ["elemental-damage", "fire-elemental-immunity"];
    combat.units.unit_p2_vampires.position = 14; // immune neighbour → skipped
    // Keep everyone else out of the blast radius.
    combat.units.unit_p1_marksmen.position = 0;
    combat.units.unit_p1_crusaders.position = 3;
    combat.units.unit_p2_dread_knights.position = 17;

    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.fireball" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "Fireball should be castable at the primary target").toBeTruthy();

    const resolved = passAllReactions(applyOk(state, cast!.action));

    const choice = resolved.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    // The plain neighbour is offered; the immune Fire Elemental is not.
    expect(choice.candidateUnitIds).toContain("unit_p1_griffins");
    expect(choice.candidateUnitIds).not.toContain("unit_p2_vampires");
    // It also takes no damage from the blast.
    expect(resolved.combat!.units.unit_p2_vampires.damage).toBe(0);
  });
});
