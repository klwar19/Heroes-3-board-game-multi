import { describe, expect, it } from "vitest";
import { createInitialGameState, effectiveInitiative, getActivationOrder, getActivationStep } from "./index";
import { applyPermanentCombatEffects } from "./permanents";
import { markUnitRemovedIfNeeded } from "./combat-units";
import type { GameState } from "./state";

/**
 * Ammo Cart — the printed "+2 [speed] to your [ranged] units" must genuinely
 * MOVE the activation order, and must survive a mid-combat stat recompute.
 *
 * USER BUG REPORT (2026-08-22): "Ammo Cart in play — Sharp (speed 9) starts
 * before Air elemental (speed 10 with ammo cart)". A boosted shooter (a Conflux
 * Pack of Storm Elementals is ranged at printed Initiative 8, so 10 with the
 * cart) activated AFTER a speed-9 enemy.
 *
 * ROOT CAUSE: the bonus was written straight into `unit.initiative`, which is a
 * DERIVED cache of the printed side. `applyUnitCurrentSide` rebuilds that field
 * from the printed data on every Pack→Few flip, Stack-Token absorb, Polish
 * Stack layer lost, specialty cover placed/defeated and mid-combat Few→Pack
 * reinforce — silently erasing the +2 mid-fight. It now rides the card's own
 * player-scoped active effect as a `RANGED_INITIATIVE_BONUS` modifier, the arm
 * `effectiveInitiative` (and therefore `getActivationOrder` /
 * `getActivationStep` / the initiative rail) folds live.
 *
 * Every assertion below reads the ORDER the units actually activate in, not a
 * stat field, and each has a cart-OFF or non-eligible-unit CONTROL.
 */

const SHOOTER = "unit_p1_marksmen";
const ENEMY = "unit_p2_skeletons";

/**
 * p1 fields one RANGED unit at its printed Initiative; one enemy sits exactly
 * ONE point above it (the reported "Sharp 9 vs base-8 shooter"), everything else
 * is far slower. With the Ammo Cart the shooter must lead; without it the enemy does.
 */
function combatWithShooter(hasCart: boolean): { state: GameState; base: number } {
  const state = createInitialGameState("ammo-cart-order");
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  const combat = state.combat!;
  const shooter = combat.units[SHOOTER]!;
  expect(shooter.type, "the fixture's p1 unit must be a shooter for the cart to reach it").toBe("ranged");

  const base = shooter.initiative;
  for (const unit of Object.values(combat.units)) {
    unit.initiative = 1;
  }
  shooter.initiative = base;
  combat.units[ENEMY]!.initiative = base + 1;

  if (hasCart) {
    state.players.p1.permanents = ["war_machine.ammo_cart"];
    applyPermanentCombatEffects(state);
  }
  return { state, base };
}

function order(state: GameState): string[] {
  return getActivationOrder(state.combat!, state.activeEffects).map((unit) => unit.id);
}

function nextToAct(state: GameState): string | undefined {
  return getActivationStep(state.combat!, state.activeEffects)?.candidates[0]?.id;
}

describe("Ammo Cart — the +2 ranged initiative moves the ACTIVATION ORDER", () => {
  it("lifts the owner's shooter ahead of a one-point-faster enemy (CONTROL: no cart → the enemy leads)", () => {
    // CONTROL — no Ammo Cart: the enemy's higher printed initiative wins.
    const without = combatWithShooter(false).state;
    expect(order(without)[0]).toBe(ENEMY);
    expect(nextToAct(without)).toBe(ENEMY);

    // With the cart in play the shooter's +2 puts it a full point ahead.
    const { state, base } = combatWithShooter(true);
    expect(order(state)[0]).toBe(SHOOTER);
    expect(nextToAct(state)).toBe(SHOOTER);
    // The displayed badge (the initiative rail and the board card both read
    // effectiveInitiative) shows the same number the order used.
    expect(effectiveInitiative(state.combat!.units[SHOOTER]!, state.activeEffects, state.combat)).toBe(base + 2);
  });

  it("KEEPS the shooter ahead after a mid-combat stat recompute (the reported bug)", () => {
    const { state } = combatWithShooter(true);
    const shooter = state.combat!.units[SHOOTER]!;
    expect(order(state)[0]).toBe(SHOOTER);

    // A REAL recompute trigger: a Stack Token absorbs a lethal blow, so
    // markUnitRemovedIfNeeded discards the token and re-derives the unit's
    // statistics from its printed side (applyUnitCurrentSide). Before the fix
    // this wiped the cart's +2 and the shooter fell behind the slower enemy.
    shooter.stackToken = "attack";
    shooter.damage = shooter.maxHealth;
    markUnitRemovedIfNeeded(state, shooter);
    expect(shooter.stackToken, "the token should have absorbed the blow").toBeNull();
    expect(shooter.damage, "the unit survives the absorb").toBeLessThan(shooter.maxHealth);

    expect(order(state)[0]).toBe(SHOOTER);
    expect(nextToAct(state)).toBe(SHOOTER);
  });

  it("CONTROL: a GROUND unit of the same owner gains nothing, and the enemy's shooter gains nothing", () => {
    const { state } = combatWithShooter(true);
    const combat = state.combat!;

    // Same owner, same combat, but ground: the printed card says [ranged] only.
    const ownGround = combat.units.unit_p1_griffins!;
    expect(ownGround.type).not.toBe("ranged");
    expect(effectiveInitiative(ownGround, state.activeEffects, combat)).toBe(ownGround.initiative);

    // The OPPONENT's shooter is untouched — the effect is scoped to the owner.
    const enemyShooter = combat.units.unit_p2_dread_knights!;
    enemyShooter.type = "ranged";
    expect(effectiveInitiative(enemyShooter, state.activeEffects, combat)).toBe(enemyShooter.initiative);
  });

  it("stops applying when the Ammo Cart leaves play mid-combat", () => {
    const { state, base } = combatWithShooter(true);
    expect(order(state)[0]).toBe(SHOOTER);

    // Replaced/discarded permanent: dropping its active effect drops the bonus.
    state.activeEffects = state.activeEffects.filter(
      (effect) => !(effect.source.type === "card" && effect.source.cardId === "war_machine.ammo_cart")
    );
    expect(effectiveInitiative(state.combat!.units[SHOOTER]!, state.activeEffects, state.combat)).toBe(base);
    expect(order(state)[0]).toBe(ENEMY);
  });
});
