import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * REPORTED BUG (live PvP): "Fire Shield on Minotaurs with +3 stack did NOT work
 * on counter attack vs Efreets."
 *
 * The printed rule carries NO retaliation exemption on ANY of its four sources:
 *   - `spell.fire_shield`  — "When the targeted unit is attacked by an adjacent
 *      unit during this Combat round, the attacking unit takes …"
 *   - `wog-fire-shield-1` / `commander-fire-shield` — "[unit_passive] An
 *      adjacent attacker takes 1 damage after attacking this unit."
 *   - Ironfist of the Ogre tier 3 (artifact set) — the same FIRE_SHIELD modifier.
 * A Retaliation Attack in this engine is a real declared attack, so a retaliator
 * that strikes a shielded unit IS "an adjacent unit attacking" it and must burn.
 *
 * Every case below drives a REAL retaliation (asserted by an ATTACK_ROLLED event
 * with isRetaliation) and asserts the OBSERVABLE outcome — the retaliator's
 * damage / removal / Stack peel — not merely that a cue event fired.
 *
 * The shielded unit opens with a 1-damage poke, so the enemy's total damage is
 * always `1 (the primary blow) + the burn`. Both halves are asserted separately
 * (`burnAmountOn` reads only "effect"-kind damage) so a change to either is
 * caught, and the CONTROL below pins the bare 1 with no burn at all.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  for (let guard = 0; current.reactionWindow && guard < 40; guard += 1) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Push a Fire Shield active effect (the SPELL / commander-cast / set arm). */
function pushFireShield(state: GameState, unitId: UnitId, amount: number): void {
  state.activeEffects.push({
    id: `fireshield_${unitId}`,
    name: "Fire Shield",
    scope: "unit",
    duration: { type: "current-combat-round" },
    polarity: "positive",
    removable: true,
    modifiers: [{ type: "FIRE_SHIELD", amount }],
    source: { type: "system" },
    controllerId: state.combat!.units[unitId].controllerId,
    target: { type: "unit", unitId },
    startedRound: state.round,
    startedCombatRound: state.combat!.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  });
}

/** Only "effect"-kind damage — i.e. the burn, never the attack itself. */
function burnAmountOn(state: GameState, attackerId: UnitId): number {
  let total = 0;
  for (const event of state.eventLog) {
    if (
      event.type === "DAMAGE_ASSIGNED" &&
      event.target.type === "unit" &&
      event.target.unitId === attackerId &&
      event.damageKind === "effect"
    ) {
      total += event.amount;
    }
  }
  return total;
}

function retaliated(state: GameState, retaliatorId: UnitId): boolean {
  return state.eventLog.some(
    (event) => event.type === "ATTACK_ROLLED" && event.attackerId === retaliatorId && event.isRetaliation === true
  );
}

/** Turn the Polish Unit Stacks layers on for a sandbox combat (adventure stub). */
function enablePolishUnitStacks(state: GameState): void {
  state.adventure = {
    ...(state.adventure ?? ({} as NonNullable<GameState["adventure"]>)),
    houseRules: { ...(state.adventure?.houseRules ?? {}), "polish-unit-stacks": true }
  } as GameState["adventure"];
  state.ruleset = "binh";
}

/**
 * The reported shape: the SHIELDED unit swings first, the enemy strikes back,
 * and the enemy's Retaliation Attack must trip the shield.
 *
 * `shieldSource` picks which of the shared seam's two readers is exercised — the
 * active-effect list (spell / commander cast / artifact set) or the printed
 * ability list (`wog-fire-shield-1` / `commander-fire-shield`).
 */
function retaliationScene(
  seed: string,
  options: {
    shieldSource: "spell" | "ability" | "none";
    amount?: number;
    shieldedStacks?: number;
    enemyHealth?: number;
    enemyDamage?: number;
    enemyVariant?: "few" | "pack";
    enemyStacks?: number;
  }
): GameState {
  const amount = options.amount ?? 2;
  const state = createInitialGameState(seed);
  state.combat!.obstacles = [];
  state.players.p1.hand = [];
  state.players.p2.hand = [];

  const shielded = state.combat!.units.unit_p1_crusaders; // swings first
  const enemy = state.combat!.units.unit_p2_skeletons; // strikes back

  shielded.abilities = options.shieldSource === "ability" ? ["wog-fire-shield-1"] : [];
  shielded.position = 9;
  shielded.attack = 1; // a light poke: the enemy survives to retaliate
  shielded.maxHealth = 40;
  shielded.damage = 0;
  if (options.shieldedStacks !== undefined) {
    shielded.variant = "pack";
    shielded.armyStacks = options.shieldedStacks;
  }

  enemy.abilities = [];
  enemy.position = 13; // vertically adjacent → both blows are melee
  enemy.attack = 1;
  enemy.defense = 0;
  enemy.maxHealth = options.enemyHealth ?? 40;
  enemy.damage = options.enemyDamage ?? 0;
  enemy.retaliatedThisRound = false;
  if (options.enemyVariant) {
    enemy.variant = options.enemyVariant;
  }
  if (options.enemyStacks !== undefined) {
    enemy.armyStacks = options.enemyStacks;
  }

  if (options.shieldSource === "spell") {
    pushFireShield(state, shielded.id, amount);
  }

  state.activePlayerId = "p1";
  state.combat!.activeUnitId = shielded.id;
  shielded.activatedThisRound = false;
  state.combat!.dice.scriptedRolls = Array.from({ length: 16 }, () => 0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function swing(state: GameState): GameState {
  return passAllReactions(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    })
  );
}

describe("Fire Shield burns a RETALIATING attacker (reported bug)", () => {
  it("the SPELL's shield burns the enemy's Retaliation Attack", () => {
    const result = swing(retaliationScene("fs-ret-spell", { shieldSource: "spell", amount: 2 }));

    // The enemy really did retaliate, so "burned" is meaningful.
    expect(retaliated(result, "unit_p2_skeletons")).toBe(true);
    // OBSERVABLE OUTCOME: the retaliator took the shield's 2…
    expect(burnAmountOn(result, "unit_p2_skeletons")).toBe(2);
    // …on top of the shielded unit's own 1-damage poke.
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("the printed ABILITY's shield (wog-fire-shield-1) burns a retaliator too", () => {
    const result = swing(retaliationScene("fs-ret-ability", { shieldSource: "ability" }));

    expect(retaliated(result, "unit_p2_skeletons")).toBe(true);
    // The ability arm is a flat 1, so 1 (poke) + 1 (burn).
    expect(burnAmountOn(result, "unit_p2_skeletons")).toBe(1);
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(2);
  });

  it("CONTROL: an UNSHIELDED unit's retaliation burns nobody", () => {
    const result = swing(retaliationScene("fs-ret-control", { shieldSource: "none" }));

    expect(retaliated(result, "unit_p2_skeletons")).toBe(true);
    expect(burnAmountOn(result, "unit_p2_skeletons")).toBe(0);
    // Only the 1-damage poke — no burn on top.
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("the burn can be LETHAL: a retaliator the burn finishes off is removed", () => {
    const result = swing(
      retaliationScene("fs-ret-lethal", {
        shieldSource: "spell",
        amount: 2,
        enemyVariant: "few", // single-sided: a kill removes it, no Pack→Few flip
        enemyHealth: 10,
        enemyDamage: 7 // 7 + 1 (poke) = 9, then the burn's 2 → dead
      })
    );

    expect(retaliated(result, "unit_p2_skeletons")).toBe(true);
    expect(
      result.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(true);
  });

  it("an EFREET retaliator is burned — its Fire immunity is Spell-CARD scoped", () => {
    // The exact reported matchup. `efreet-fire-immunity` is
    // IMMUNE_TO_SPELL_SCHOOLS(["any","fire"]), which this engine deliberately
    // scopes to a Spell CARD being cast at the unit (the Faerie Bolt precedent,
    // documented at applyActivationDamageSpell). The shield's burn is neither a
    // cast nor spell damage — it is the shielded unit's own effect damage — so it
    // lands in full. Only a Couatl-style "ignores all damage" ward turns it aside.
    const state = retaliationScene("fs-ret-efreet", { shieldSource: "spell", amount: 2 });
    state.combat!.units.unit_p2_skeletons.abilities = ["efreet-fire-immunity"];
    const result = swing(state);

    expect(retaliated(result, "unit_p2_skeletons")).toBe(true);
    expect(burnAmountOn(result, "unit_p2_skeletons")).toBe(2);
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("fires exactly ONCE per exchange — the shielded unit's own blow never burns itself", () => {
    const result = swing(retaliationScene("fs-ret-once", { shieldSource: "spell", amount: 2 }));

    // One burn on the retaliator…
    expect(
      result.eventLog.filter(
        (event) =>
          event.type === "UNIT_ABILITY_TRIGGERED" &&
          event.abilityId === "fire-shield" &&
          event.targetUnitId === "unit_p2_skeletons"
      ).length
    ).toBe(1);
    // …and none on the shielded unit itself (it takes only the retaliation's
    // "attack" damage, never its own recoil).
    expect(burnAmountOn(result, "unit_p1_crusaders")).toBe(0);
  });
});

describe("Fire Shield + Polish Unit Stacks (the reported Minotaurs case)", () => {
  it("a STACKED shielded unit still burns the retaliator", () => {
    const state = retaliationScene("fs-ret-stacked", {
      shieldSource: "spell",
      amount: 2,
      shieldedStacks: 3
    });
    enablePolishUnitStacks(state);
    const result = swing(state);

    expect(retaliated(result, "unit_p2_skeletons")).toBe(true);
    // The shielded unit's 3 layers are irrelevant to whether its shield fires.
    expect(result.combat!.units.unit_p1_crusaders.armyStacks).toBe(3);
    expect(burnAmountOn(result, "unit_p2_skeletons")).toBe(2);
    expect(result.combat!.units.unit_p2_skeletons.damage).toBe(3);
  });

  it("a burn that is lethal to the RETALIATOR is absorbed by its Stack layer, not its card", () => {
    const state = retaliationScene("fs-ret-absorb", {
      shieldSource: "spell",
      amount: 2,
      enemyVariant: "pack",
      enemyStacks: 1,
      enemyHealth: 10,
      enemyDamage: 8 // 8 + 1 (poke) = 9; the BURN is what crosses the bar
    });
    enablePolishUnitStacks(state);
    const result = swing(state);

    expect(retaliated(result, "unit_p2_skeletons")).toBe(true);
    // The layer soaked the killing burn: it peeled, and the card lives on.
    expect(
      result.eventLog.some((event) => event.type === "ARMY_STACK_LOST" && event.unitId === "unit_p2_skeletons")
    ).toBe(true);
    expect(result.combat!.units.unit_p2_skeletons.armyStacks).toBe(0);
    expect(
      result.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons")
    ).toBe(false);
  });
});
