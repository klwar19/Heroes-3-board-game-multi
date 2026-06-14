import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { abilityFxPlans } from "@/data/fx";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { discountedReinforceCost, queueSkeletonReinforce, reinforceArmyUnit, reinforceGoldDiscount } from "./adventure";
import { openSkeletonReinforceChoice, resolveSkeletonReinforceChoice } from "./adventure-reducer";
import {
  getForcedAttackerDie,
  getRollTwoDiceApplyBoth,
  getUnitAttackRerollSources,
  getUnitImmuneSpellSchools,
  hasIgnoreOwnAttackDie,
  hasImmuneToSpecialtyDamage,
  unitImmuneToSpellSchools
} from "./unit-abilities";
import type { CombatUnitState, GameAction, GameState, PlayerId } from "./state";

/**
 * Second batch of de-decorated neutral/faction abilities, per the wiki + the
 * rules the user supplied: Champions (Stables discount / movement reroll /
 * roll-2-and-sum), Mummies (die manipulation), Azure & Black Dragons (total
 * Spell + Specialty-damage immunity, spell-damage reduction), the Phoenix
 * resurrection sound, and the Skeletons necro-reinforce.
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

/** A non-adjacent (no-retaliation) attack from p1 marksmen at p2 skeletons. */
function duel(options: {
  attackerAbilities?: string[];
  attackerAttack?: number;
  defenderAbilities?: string[];
  defenderDefense?: number;
  rolls: number[];
}): GameState {
  const state = createInitialGameState();
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = options.attackerAbilities ?? [];
  attacker.attack = options.attackerAttack ?? 3;
  attacker.position = 1;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = options.defenderAbilities ?? [];
  defender.position = 13; // non-adjacent → no retaliation
  defender.defense = options.defenderDefense ?? 0;
  defender.maxHealth = 30;
  defender.damage = 0;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  script(state, options.rolls);
  setActive(state, "p1", "unit_p1_marksmen");
  return passAllReactions(
    applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" })
  );
}

function defenderDamage(state: GameState): number {
  return state.combat!.units.unit_p2_skeletons.damage;
}

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------

describe("batch-2 roster wiring", () => {
  const expected: Record<string, { side: "few" | "pack" | "neutral"; abilities: string[] }[]> = {
    "castle.champions": [
      { side: "few", abilities: ["champion-stables-discount"] },
      { side: "pack", abilities: ["champion-move-reroll"] }
    ],
    "neutral.champions": [{ side: "neutral", abilities: ["champion-roll-two-dice-reroll"] }],
    "neutral.mummies": [{ side: "neutral", abilities: ["mummy-ignore-own-die", "mummy-force-attacker-die"] }],
    "neutral.black_dragons": [{ side: "neutral", abilities: ["dragon-line-attack-2"] }],
    "dungeon.black_dragons": [
      { side: "few", abilities: ["reduce-spell-damage-2"] },
      { side: "pack", abilities: ["immune-all-spells", "immune-specialty-damage"] }
    ],
    "neutral.azure_dragons": [
      { side: "neutral", abilities: ["azure-dragon-paralysis", "immune-all-spells", "immune-specialty-damage"] }
    ]
  };

  for (const [unitId, sides] of Object.entries(expected)) {
    for (const { side, abilities } of sides) {
      it(`${unitId} (${side}) → [${abilities.join(", ")}]`, () => {
        const def = coreUnitDefinitions[unitId];
        expect(def, unitId).toBeTruthy();
        expect(def[side]?.abilities ?? []).toEqual(abilities);
      });
    }
  }

  it("the new abilities are implemented with the right effect", () => {
    const effects: Record<string, string> = {
      "champion-stables-discount": "MAP_REINFORCE_DISCOUNT",
      "champion-move-reroll": "ATTACK_DIE_REROLL",
      "champion-roll-two-dice-reroll": "ROLL_TWO_DICE_APPLY_BOTH",
      "mummy-ignore-own-die": "IGNORE_OWN_ATTACK_DIE",
      "mummy-force-attacker-die": "FORCE_ATTACKER_DIE",
      "immune-all-spells": "IMMUNE_TO_SPELL_SCHOOLS",
      "immune-specialty-damage": "IMMUNE_TO_SPECIALTY_DAMAGE"
    };
    for (const [abilityId, effectType] of Object.entries(effects)) {
      const ability = unitAbilities[abilityId];
      expect(ability, abilityId).toBeTruthy();
      expect(ability.implementationStatus, abilityId).toBe("implemented");
      const type = ability.effect?.type ?? ability.mapEffect?.type;
      expect(type, abilityId).toBe(effectType);
    }
  });
});

// ---------------------------------------------------------------------------
// Champions — roll 2 dice, apply both, reroll each "-1" once
// ---------------------------------------------------------------------------

describe("Champion 'roll 2 dice and apply both outcomes'", () => {
  it("sums both dice into the attack", () => {
    expect(getRollTwoDiceApplyBoth(unitWith(["champion-roll-two-dice-reroll"]))?.rerollMinusOnce).toBe(true);
    // attack 4, dice +1 and +1 → +2 total → 6 damage.
    expect(defenderDamage(duel({ attackerAbilities: ["champion-roll-two-dice-reroll"], attackerAttack: 4, rolls: [1, 1] }))).toBe(6);
  });

  it("rerolls each '-1' once before summing", () => {
    // d1 -1 → reroll 0; d2 +1 (no reroll). Sum = +1 → attack 4 + 1 = 5.
    expect(defenderDamage(duel({ attackerAbilities: ["champion-roll-two-dice-reroll"], attackerAttack: 4, rolls: [-1, 0, 1] }))).toBe(5);
  });
});

describe("Champion 'Charge' movement reroll (Pack)", () => {
  it("is offered only when the unit moved", () => {
    const champ = unitWith(["champion-move-reroll"]);
    expect(getUnitAttackRerollSources(champ, false)).toEqual([]);
    expect(getUnitAttackRerollSources(champ, true)).toEqual([{ name: "Charge", rerolls: 1, onlyOnRoll: undefined }]);
  });
});

// ---------------------------------------------------------------------------
// Mummies — own die counts as 0; attacker's die forced to -1
// ---------------------------------------------------------------------------

describe("Mummy die manipulation", () => {
  it("its own Attack die always counts as 0 (offence)", () => {
    expect(hasIgnoreOwnAttackDie(unitWith(["mummy-ignore-own-die"]))).toBe(true);
    // attack 3, scripted +1 — but the die is ignored → 3 damage, not 4.
    expect(defenderDamage(duel({ attackerAbilities: ["mummy-ignore-own-die"], attackerAttack: 3, rolls: [1] }))).toBe(3);
  });

  it("forces an attacker's die to -1 (defence)", () => {
    expect(getForcedAttackerDie(unitWith(["mummy-force-attacker-die"]))).toBe(-1);
    // Plain attacker (attack 3) vs a Mummy: die forced to -1 → 3 - 1 = 2 damage.
    expect(defenderDamage(duel({ attackerAbilities: [], attackerAttack: 3, defenderAbilities: ["mummy-force-attacker-die"], rolls: [1] }))).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Azure / Black Dragons — total Spell immunity + Specialty-damage immunity
// ---------------------------------------------------------------------------

describe("Dragon spell & specialty immunity", () => {
  it("immune-all-spells covers every school (helper)", () => {
    const dragon = unitWith(["immune-all-spells"]);
    expect(getUnitImmuneSpellSchools(dragon).sort()).toEqual(["air", "any", "earth", "fire", "water"]);
    for (const school of ["any", "air", "earth", "fire", "water"] as const) {
      expect(unitImmuneToSpellSchools(dragon, [school])).toBe(true);
    }
    expect(hasImmuneToSpecialtyDamage(dragon)).toBe(false);
    expect(hasImmuneToSpecialtyDamage(unitWith(["immune-specialty-damage"]))).toBe(true);
  });

  it("an all-spell-immune unit cannot be targeted by any spell in combat", () => {
    const state = createInitialGameState("dragon-immunity-seed");
    state.combat!.units.unit_p2_skeletons.abilities = ["immune-all-spells", "immune-specialty-damage"];
    state.players.p1.hand = ["spell.magic_arrow", "spell.curse", "spell.lightning_bolt"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const targets = (cardId: string) =>
      getLegalActions(state, "p1")
        .filter((legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === cardId)
        .flatMap((legal) =>
          legal.action.type === "CAST_SPELL" && legal.action.target?.type === "unit" ? [legal.action.target.unitId] : []
        );
    for (const card of ["spell.magic_arrow", "spell.curse", "spell.lightning_bolt"]) {
      expect(targets(card), card).not.toContain("unit_p2_skeletons");
    }
    // …while an ordinary enemy stays targetable.
    expect(targets("spell.magic_arrow")).toContain("unit_p2_vampires");
  });

  it("Black Dragon Few reduces spell damage by 2 (Magic Arrow → 0)", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p1.scrolls = [{ id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const target = state.combat!.units.unit_p2_vampires;
    target.abilities = coreUnitDefinitions["dungeon.black_dragons"].few?.abilities ?? [];
    target.maxHealth = 20;
    target.damage = 0;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.fromScroll === "scroll_1" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    const next = passAllReactions(applyOk(state, cast!.action));
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phoenix rebirth sound
// ---------------------------------------------------------------------------

describe("Phoenix rebirth plays the resurrection sound", () => {
  it("maps phoenix-rebirth to the resurrection cue", () => {
    expect(abilityFxPlans["phoenix-rebirth"]?.sound).toBe("spells/resurrection");
  });
});

// ---------------------------------------------------------------------------
// Champions — Stables reinforcement discount
// ---------------------------------------------------------------------------

describe("Champion 'Stable Master' reinforcement discount", () => {
  function adventureWithChampion(): { state: GameState; spaceId: string } {
    const state = createAdventureGameState({ seed: "stables-seed", difficulty: "normal", rollFirstPlayer: false });
    const hero = state.heroes.hero_p1;
    const spaceId = hero.spaceId!;
    state.players.p1.army.push({ id: "champ_few", unitDefId: "castle.champions", side: "few" });
    return { state, spaceId };
  }

  it("knocks 6 gold off the Champion's reinforcement while the hero is on a Stables field", () => {
    const { state, spaceId } = adventureWithChampion();
    state.adventure!.fields[spaceId].location = "stables";
    expect(reinforceGoldDiscount(state, "p1", "castle.champions")).toBe(6);
    const packCost = coreUnitDefinitions["castle.champions"].pack!.cost;
    const discounted = discountedReinforceCost(state, "p1", "castle.champions", packCost);
    expect(discounted.gold).toBe(Math.max(0, (packCost.gold ?? 0) - 6));
  });

  it("no discount when the hero is not on a Stables field", () => {
    const { state, spaceId } = adventureWithChampion();
    state.adventure!.fields[spaceId].location = "empty";
    expect(reinforceGoldDiscount(state, "p1", "castle.champions")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Skeletons — necro-reinforce a bronze unit for free
// ---------------------------------------------------------------------------

describe("Skeletons necro-reinforce", () => {
  it("flags a destroyed neutral Skeleton guard during combat", () => {
    const state = createInitialGameState();
    const guard = state.combat!.units.unit_p2_skeletons;
    guard.controllerId = "neutrals";
    guard.unitDefId = "neutral.skeletons";
    guard.variant = "few";
    guard.maxHealth = 3;
    guard.damage = 3; // already lethal
    markUnitRemovedIfNeeded(state, guard);
    expect(state.combat!.skeletonGuardDefeated).toBe(true);
  });

  it("queues a free bronze Few→Pack choice and the free reinforce spends nothing", () => {
    const state = createAdventureGameState({ seed: "skeleton-seed", difficulty: "normal", rollFirstPlayer: false });
    // Give p1 a bronze Few unit with a pack side.
    state.players.p1.army.push({ id: "bones_few", unitDefId: "necropolis.skeletons", side: "few" });
    const goldBefore = state.players.p1.resources.gold;

    queueSkeletonReinforce(state, "p1");
    const reward = state.adventure!.rewardQueue.at(-1);
    expect(reward?.kind).toBe("visit-steps");
    const step = reward && reward.kind === "visit-steps" ? reward.steps[0] : undefined;
    expect(step?.type).toBe("CHOOSE_ONE");
    if (step?.type !== "CHOOSE_ONE") return;
    const freeOption = step.options.find((option) =>
      option.steps.some((inner) => inner.type === "REINFORCE_FREE")
    );
    expect(freeOption, "a free reinforce option for the bronze unit").toBeTruthy();

    // The free reinforce flips Few→Pack and spends no resources.
    reinforceArmyUnit(state, "p1", "bones_few", false, false, false, true);
    expect(state.players.p1.army.find((unit) => unit.id === "bones_few")?.side).toBe("pack");
    expect(state.players.p1.resources.gold).toBe(goldBefore);
  });

  it("mid-combat pop-up offers any bronze unit and reinforces it free on pick", () => {
    const state = createAdventureGameState({ seed: "skeleton-popup", difficulty: "normal", rollFirstPlayer: false });
    state.players.p1.army.push({ id: "bones_few", unitDefId: "necropolis.skeletons", side: "few" });
    const goldBefore = state.players.p1.resources.gold;

    openSkeletonReinforceChoice(state, "p1");
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") return;
    expect(choice.context).toBe("skeleton-reinforce");
    expect(choice.returnPhase).toBe("combat");
    expect(choice.skeletonReinforce?.armyUnitIds).toContain("bones_few");
    // Last option is always "Skip".
    expect(choice.options.at(-1)?.label).toBe("Skip");

    const pick = choice.skeletonReinforce!.armyUnitIds.indexOf("bones_few");
    resolveSkeletonReinforceChoice(state, "p1", pick);
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p1.army.find((unit) => unit.id === "bones_few")?.side).toBe("pack");
    expect(state.players.p1.resources.gold).toBe(goldBefore);
  });

  it("mid-combat pop-up is a no-op when the player has no bronze Few unit", () => {
    const state = createAdventureGameState({ seed: "skeleton-none", difficulty: "normal", rollFirstPlayer: false });
    // Remove any bronze Few from the starting army so nothing is eligible.
    state.players.p1.army = state.players.p1.army.filter((unit) => {
      const def = coreUnitDefinitions[unit.unitDefId];
      return !(unit.side === "few" && def?.tier === "bronze");
    });
    openSkeletonReinforceChoice(state, "p1");
    expect(state.pendingChoice).toBeNull();
  });
});
