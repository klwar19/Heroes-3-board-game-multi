import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  getInnateFlatAttackBonus,
  makeCombatUnitFromArmy,
  markUnitRemovedIfNeeded,
  unitFlipSidePreview
} from "./index";
import { getDisplayAttackBonus } from "./active-effects";
import { tokenAttackBonus } from "./tokens";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import type { CombatUnitState, GameAction, GameState } from "./state";

/**
 * REPORTED BUG (2026-08-10): "Haspid when go from pack to few, not show the +2
 * attack in stats — only show the +1 attack from unit experience buff."
 *
 * The flip itself was never broken (the Few side, its `haspid-vengeance`
 * ability, the `flippedDownThisCombat` flag and the veteran rank fold all
 * survive `applyUnitCurrentSide`), and the +2 was always folded into the real
 * attack roll. What was missing is the DISPLAY: `getDisplayAttackBonus` summed
 * only active-effect ATTACK_BONUS modifiers, so every INNATE printed-ability
 * flat Attack bonus was invisible — the player read Attack 6 on a card that
 * strikes for 8.
 *
 * The fix is one shared seam, `getInnateFlatAttackBonus`, folded BOTH by the
 * attack resolver (`getAttackStackDetails`) and by the display reads, so the
 * number on the card and the number the dice use cannot drift apart. These
 * tests assert that equality as the observable outcome — real damage dealt vs
 * the displayed total — never an intermediate field.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass every instant window and decline every reroll so a scripted die stands. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
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

/**
 * THE display formula, copied from the two board.tsx read sites so this engine
 * test and the DOM test measure the same thing (the DOM half is pinned in
 * `src/components/table/haspid-flip-attack-display.test.tsx`).
 */
function displayedAttack(state: GameState, unit: CombatUnitState): number {
  return unit.attack + getDisplayAttackBonus(state, unit) + tokenAttackBonus(unit);
}

/**
 * A sandbox combat with p1's Marksmen slot replaced by a REAL army-minted unit
 * (`makeCombatUnitFromArmy` — the same factory a live combat uses, so the
 * veteran-rank fold is produced by the shipped machinery rather than hand-set)
 * standing adjacent to a defenceless p2 punching bag.
 */
function duel(options: {
  unitDefId: string;
  side: "few" | "pack" | "neutral";
  experience?: number;
}): { state: GameState; attacker: CombatUnitState; defender: CombatUnitState } {
  const state = createInitialGameState("innate-flat-attack-seed");
  const slot = state.combat!.units.unit_p1_marksmen;
  const minted = makeCombatUnitFromArmy(
    {
      id: "army_test_unit",
      unitDefId: options.unitDefId,
      side: options.side,
      ...(options.experience !== undefined ? { experience: options.experience } : {})
    },
    "p1",
    slot.id,
    0,
    "binh",
    {}
  )!;
  Object.assign(slot, minted, { id: slot.id, controllerId: slot.controllerId, position: 12 });

  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13; // adjacent → a melee strike
  defender.defense = 0;
  defender.attack = 0; // never kills the attacker on the counter-attack
  defender.maxHealth = 40;
  defender.damage = 0;

  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = slot.id;
  return { state, attacker: slot, defender };
}

/** Strike with a scripted "0" die so the damage dealt is exactly the Attack value. */
function strike(state: GameState, attackerId: string, defenderId: string): GameState {
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId, defenderId })
  );
}

/** Kill the Pack side through the real lethal-damage path so it flips to Few. */
function flipDown(state: GameState, unit: CombatUnitState): void {
  unit.damage = unit.maxHealth;
  markUnitRemovedIfNeeded(state, unit);
}

// ---------------------------------------------------------------------------
// The reported bug: a flipped Haspid's displayed Attack must be the one it hits with.
// ---------------------------------------------------------------------------

describe("Haspid Pack→Few: the displayed Attack is the Attack it strikes with", () => {
  it("shows the Vengeance +2 on top of the veteran Aggressive Drill +1 after a real mid-combat flip", () => {
    // Gold tier at 10 XP = rank 2. Under the veterancy redesign cove.haspids'
    // R1 and R2 are both ABILITY ranks, and R2 grants Aggressive Drill
    // (veteran-attack-when-attacking) — an INNATE flat own-attack bonus. So the
    // veteran +1 arrives through the ability list rather than the printed stat,
    // which is precisely the class of bonus this display fix exists for.
    const { state, attacker, defender } = duel({
      unitDefId: "cove.haspids",
      side: "pack",
      experience: 10
    });
    expect(attacker.unitRank).toBe(2);

    flipDown(state, attacker);

    // The flip itself is (and always was) correct: the printed Few side plus
    // the surviving rank fold (rank 2 moves no printed stat here).
    const printedFew = coreUnitDefinitions["cove.haspids"].few!;
    expect(attacker.variant).toBe("few");
    expect(attacker.flippedDownThisCombat).toBe(true);
    expect(attacker.abilities).toContain("haspid-vengeance");
    expect(attacker.abilities).toContain("veteran-attack-when-attacking");
    expect(attacker.attack).toBe(printedFew.attack);

    // THE FIX: the display now includes the veteran drill +1 AND the +2 the
    // Vengeance ability is live for.
    expect(displayedAttack(state, attacker)).toBe(printedFew.attack + 1 + 2);

    // …and that displayed number is EXACTLY what the dice deal (defence 0,
    // scripted "0" die), which is the invariant this whole change exists for.
    const shown = displayedAttack(state, attacker);
    const after = strike(state, attacker.id, defender.id);
    expect(after.combat!.units[defender.id].damage).toBe(shown);
  });

  it("CONTROL — the same flip at rank 0 (unit experience off) is right too", () => {
    const { state, attacker, defender } = duel({ unitDefId: "cove.haspids", side: "pack" });
    expect(attacker.unitRank).toBeUndefined();

    flipDown(state, attacker);
    const printedFew = coreUnitDefinitions["cove.haspids"].few!;
    expect(attacker.attack).toBe(printedFew.attack);
    expect(displayedAttack(state, attacker)).toBe(printedFew.attack + 2);

    const shown = displayedAttack(state, attacker);
    const after = strike(state, attacker.id, defender.id);
    expect(after.combat!.units[defender.id].damage).toBe(shown);
  });

  it("CONTROL — an UNflipped Haspid Few shows no Vengeance (a fresh recruit never earned it)", () => {
    const { state, attacker, defender } = duel({ unitDefId: "cove.haspids", side: "few" });
    expect(attacker.abilities).toContain("haspid-vengeance");
    expect(attacker.flippedDownThisCombat ?? false).toBe(false);

    const printedFew = coreUnitDefinitions["cove.haspids"].few!;
    expect(getInnateFlatAttackBonus(attacker, false)).toBe(0);
    expect(displayedAttack(state, attacker)).toBe(printedFew.attack);

    const after = strike(state, attacker.id, defender.id);
    expect(after.combat!.units[defender.id].damage).toBe(printedFew.attack);
  });

  it("CONTROL — a unit WITHOUT any innate flat-Attack ability is unchanged", () => {
    // Castle Crusaders carry no ATTACK_BONUS_IF_FLIPPED / OWN_ATTACK_FLAT_BONUS /
    // FLAT_ATTACK_BONUS, so their flipped Few side displays its bare printed value.
    const { state, attacker, defender } = duel({ unitDefId: "castle.crusaders", side: "pack" });
    flipDown(state, attacker);
    expect(attacker.variant).toBe("few");
    expect(attacker.flippedDownThisCombat).toBe(true);

    const printedFew = coreUnitDefinitions["castle.crusaders"].few!;
    expect(getInnateFlatAttackBonus(attacker, false)).toBe(0);
    expect(displayedAttack(state, attacker)).toBe(printedFew.attack);

    const after = strike(state, attacker.id, defender.id);
    expect(after.combat!.units[defender.id].damage).toBe(printedFew.attack);
  });

  it("the Vengeance +2 stays OFF a Retaliation Attack (the printed [unit_attack] icon)", () => {
    // The display deliberately shows the OWN-attack reading; the resolver drops
    // it on a counter-attack, and the shared helper is what encodes that split.
    const { state, attacker } = duel({ unitDefId: "cove.haspids", side: "pack" });
    flipDown(state, attacker);
    expect(getInnateFlatAttackBonus(attacker, false)).toBe(2);
    expect(getInnateFlatAttackBonus(attacker, true)).toBe(0);
  });

  it("a suppressed ability (Disrupting Ray) hides the bonus from the card AND the dice together", () => {
    const { state, attacker, defender } = duel({ unitDefId: "cove.haspids", side: "pack" });
    flipDown(state, attacker);
    attacker.abilitiesSuppressed = true;

    const printedFew = coreUnitDefinitions["cove.haspids"].few!;
    expect(displayedAttack(state, attacker)).toBe(printedFew.attack);
    const after = strike(state, attacker.id, defender.id);
    expect(after.combat!.units[defender.id].damage).toBe(printedFew.attack);
  });
});

// ---------------------------------------------------------------------------
// The class, not the one unit: every innate flat-Attack ability, and the
// registry sweep that keeps a future member from being dropped silently.
// ---------------------------------------------------------------------------

describe("innate flat Attack bonuses — the whole class reaches the display", () => {
  it("the WoG own-attack +1 (OWN_ATTACK_FLAT_BONUS) shows and lands", () => {
    const { state, attacker, defender } = duel({ unitDefId: "castle.crusaders", side: "few" });
    const base = attacker.attack;
    attacker.abilities = [...attacker.abilities, "wog-attack-when-attacking-1"];

    expect(getInnateFlatAttackBonus(attacker, false)).toBe(1);
    expect(displayedAttack(state, attacker)).toBe(base + 1);
    const after = strike(state, attacker.id, defender.id);
    expect(after.combat!.units[defender.id].damage).toBe(base + 1);
  });

  it("the Stacked-only FLAT_ATTACK_BONUS shows only while the Stack Token is live", () => {
    // Black Dragons' "+3 Attack while Stacked": the requiresStacked gate lives in
    // getUnitAbilityDefinitions, so the display inherits it for free.
    const { state, attacker } = duel({ unitDefId: "castle.crusaders", side: "few" });
    const base = attacker.attack;
    attacker.bankUnit = true;
    attacker.abilities = [...attacker.abilities, "bank-black-dragon-stacked-attack"];

    expect(displayedAttack(state, attacker)).toBe(base); // no token yet — CONTROL
    attacker.stackToken = "attack";
    // The token itself adds its own +1 through tokenAttackBonus-independent
    // machinery, so measure the innate half directly and the total on top.
    expect(getInnateFlatAttackBonus(attacker, false)).toBe(3);
    attacker.stackToken = null;
    expect(getInnateFlatAttackBonus(attacker, false)).toBe(0);
  });

  it("registry sweep — every implemented ability in the innate class is folded by the shared helper", () => {
    const innateTypes = new Set(["ATTACK_BONUS_IF_FLIPPED", "OWN_ATTACK_FLAT_BONUS", "FLAT_ATTACK_BONUS"]);
    const members = Object.values(unitAbilities).filter(
      (ability) => ability.effect && innateTypes.has(ability.effect.type) && ability.implementationStatus === "implemented"
    );
    expect(members.length).toBeGreaterThan(0);

    for (const ability of members) {
      const effect = ability.effect!;
      const amount =
        effect.type === "ATTACK_BONUS_IF_FLIPPED" ||
        effect.type === "OWN_ATTACK_FLAT_BONUS" ||
        effect.type === "FLAT_ATTACK_BONUS"
          ? effect.amount
          : 0;
      const unit = {
        abilities: [ability.id],
        // Every gate the registry can impose, satisfied so the ability is live:
        // the flip gate (ATTACK_BONUS_IF_FLIPPED), the Stack Token (the Stacked
        // FLAT_ATTACK_BONUS) and `damage > 0` (a `requiresDamaged` FLAT_ATTACK_BONUS
        // such as MGQ's Wild Hair — folded only while the side is wounded).
        flippedDownThisCombat: true,
        stackToken: "attack",
        bankUnit: true,
        armyStacks: 0,
        damage: 1
      } as unknown as CombatUnitState;
      expect(getInnateFlatAttackBonus(unit, false), ability.id).toBe(amount);
    }
  });
});

// ---------------------------------------------------------------------------
// Preview == reality: what the Pack card promises the flip will produce.
// ---------------------------------------------------------------------------

describe("the Pack→Few flip PREVIEW matches what the real flip produces", () => {
  it("a Haspid Pack's preview reports the Vengeance the flip itself will grant", () => {
    const { state, attacker } = duel({ unitDefId: "cove.haspids", side: "pack" });
    const preview = unitFlipSidePreview(attacker, "binh")!;
    expect(preview.flippedAttackBonus).toBe(2);

    // Now really flip it: printed preview + the previewed bonus is exactly the
    // Attack the flipped card displays (and, per the tests above, strikes with).
    flipDown(state, attacker);
    expect(displayedAttack(state, attacker)).toBe(preview.attack + preview.flippedAttackBonus);
  });

  it("CONTROL — a Pack with no flip-triggered ability previews a zero bonus", () => {
    const { state, attacker } = duel({ unitDefId: "castle.crusaders", side: "pack" });
    const preview = unitFlipSidePreview(attacker, "binh")!;
    expect(preview.flippedAttackBonus).toBe(0);

    flipDown(state, attacker);
    expect(displayedAttack(state, attacker)).toBe(preview.attack);
  });
});
