import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  NEUTRAL_PLAYER_ID
} from "./index";
import { getAttackRollMode } from "./legal-actions";
import { applyPermanentCombatEffects } from "./permanents";
import { startNeutralEncounter } from "./adventure-reducer";
import { makeActiveEffect } from "./active-effects";
import type { GameState } from "./state";
import { coreUnitDefinitions } from "@/data/factions/units";

/**
 * Ranged combat-penalty waivers (Evil Eyes / Medusas / Zealots / Titans vs.
 * Magi / Sharpshooters / Halflings).
 *
 * A ranged attack rolls at disadvantage when it strikes an ADJACENT unit, and
 * separately when it shoots from the back row across to the opposite back row
 * (the long-range / behind-wall penalty). The two abilities differ:
 *
 *   • "ignore-combat-penalties"      (card: "...against adjacent units") waives
 *      ONLY the adjacent-attack penalty — the long-range one still applies.
 *   • "ignore-all-combat-penalties"  (card: "Ignore the combat penalties")
 *      waives BOTH.
 *
 * In the default combat setup p1's Marksmen sit in their own back row (1) and
 * the enemy Dread Knights in the opposite back row (18) — a long-range shot.
 * Moving the Skeletons next to the Marksmen (2) makes an adjacent shot.
 */

function combatWith(abilities: string[]): GameState {
  const state = createInitialGameState();
  if (!state.combat) {
    throw new Error("Expected combat setup.");
  }
  const marksmen = state.combat.units.unit_p1_marksmen;
  marksmen.type = "ranged";
  marksmen.abilities = abilities;
  // Put the Skeletons directly beside the Marksmen so they are an adjacent shot.
  state.combat.units.unit_p2_skeletons.position = 2;
  return state;
}

function adjacentMode(state: GameState): ReturnType<typeof getAttackRollMode> {
  const combat = state.combat!;
  return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_skeletons, state);
}

function longRangeMode(state: GameState): ReturnType<typeof getAttackRollMode> {
  const combat = state.combat!;
  return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_dread_knights, state);
}

/** The same adjacent shot, but resolved as this unit's Retaliation Attack. */
function adjacentRetaliationMode(state: GameState): ReturnType<typeof getAttackRollMode> {
  const combat = state.combat!;
  return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_skeletons, state, true);
}

describe("ranged combat-penalty waivers", () => {
  it("baseline: a ranged unit with no waiver suffers both the adjacent and the long-range penalty", () => {
    const state = combatWith([]);
    expect(adjacentMode(state)).toBe("disadvantage");
    expect(longRangeMode(state)).toBe("disadvantage");
  });

  it("Evil Eyes' ability waives the adjacent penalty but NOT the long-range one", () => {
    const state = combatWith(["ignore-combat-penalties"]);
    // The reported Evil Eye fix: adjacent shot is unpenalised…
    expect(adjacentMode(state)).toBe("normal");
    // …but a too-far / behind-wall shot still rolls at disadvantage.
    expect(longRangeMode(state)).toBe("disadvantage");
  });

  it("the general 'ignore the combat penalties' ability waives BOTH penalties", () => {
    const state = combatWith(["ignore-all-combat-penalties"]);
    expect(adjacentMode(state)).toBe("normal");
    expect(longRangeMode(state)).toBe("normal");
  });

  // The Sharpshooter / Magi / Halfling waiver is printed "[unit_attack] Ignore the
  // combat penalties" — it fires only when this unit ATTACKS, never on its
  // Retaliation Attack. A retaliating Sharpshooter that must hit its adjacent
  // attacker therefore rolls at the melee penalty like any other ranged unit.
  it("the [unit_attack] full waiver applies on the unit's own attack but NOT on a retaliation", () => {
    const state = combatWith(["ignore-all-combat-penalties"]);
    // Its own attack: unpenalised (the control).
    expect(adjacentMode(state)).toBe("normal");
    // Retaliating against the adjacent attacker: the melee penalty is back.
    expect(adjacentRetaliationMode(state)).toBe("disadvantage");
  });

  // The "[unit_passive] … against adjacent units" melee waiver (Evil Eyes /
  // Medusas / Zealots / Titans) is passive, not attack-gated, so it keeps
  // waiving the adjacent penalty even on a Retaliation Attack — the CONTROL that
  // proves only the [unit_attack] waiver is scoped to attacks.
  it("the [unit_passive] adjacent waiver still applies on a retaliation", () => {
    const state = combatWith(["ignore-combat-penalties"]);
    expect(adjacentMode(state)).toBe("normal");
    expect(adjacentRetaliationMode(state)).toBe("normal");
  });
});

/**
 * "Roll 2 Attack dice and resolve the higher one" (attack-roll-advantage). The
 * two printed variants differ by icon:
 *   • Leprechaun / Halflings — "[unit_attack] Roll 2 Attack dice …": fires ONLY
 *     on the unit's own declared attack, NOT on a Retaliation Attack.
 *   • Crusaders — "[unit_passive] During any attack …": applies to every attack,
 *     retaliations included (the CONTROL that proves only the [unit_attack]
 *     variant is attack-scoped).
 */
describe("twin Attack dice advantage", () => {
  // A ground melee attacker (no ranged penalty to muddy the mode) hitting an
  // adjacent enemy, carrying the given unit's real ability list.
  function groundAttackerWith(abilities: readonly string[] | undefined): GameState {
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    const attacker = state.combat.units.unit_p1_marksmen;
    attacker.type = "ground";
    attacker.abilities = [...(abilities ?? [])];
    state.combat.units.unit_p2_skeletons.position = 2;
    return state;
  }

  function ownAttackMode(state: GameState): ReturnType<typeof getAttackRollMode> {
    const combat = state.combat!;
    return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_skeletons, state);
  }

  function retaliationMode(state: GameState): ReturnType<typeof getAttackRollMode> {
    const combat = state.combat!;
    return getAttackRollMode(combat.units.unit_p1_marksmen, combat.units.unit_p2_skeletons, state, true);
  }

  it("the neutral Leprechaun rolls advantage on its own attack but NORMAL on a retaliation", () => {
    const state = groundAttackerWith(coreUnitDefinitions["neutral.leprechaun"].neutral?.abilities);
    expect(ownAttackMode(state)).toBe("advantage");
    expect(retaliationMode(state)).toBe("normal");
  });

  it("the Factory Halflings' [unit_attack] advantage is likewise dropped on a retaliation", () => {
    const state = groundAttackerWith(coreUnitDefinitions["factory.halflings"].few?.abilities);
    expect(ownAttackMode(state)).toBe("advantage");
    expect(retaliationMode(state)).toBe("normal");
  });

  it("CONTROL: the Crusaders' [unit_passive] advantage still applies on a retaliation", () => {
    const state = groundAttackerWith(coreUnitDefinitions["neutral.crusaders"].neutral?.abilities);
    expect(ownAttackMode(state)).toBe("advantage");
    expect(retaliationMode(state)).toBe("advantage");
  });
});

/**
 * Ammo Cart (war machine) — the PLAYER-SCOPED ranged penalty waiver.
 *
 * User rule (2026-07-24): "Ammo cart should work properly: ignores all penalties
 * for ranged units (also from close combat and from shooting above the walls)."
 *
 * The Ammo Cart in play seeds a player-scoped `RANGED_IGNORE_ALL_PENALTIES`
 * active effect for its owner (applyPermanentCombatEffects). It is the war-machine
 * equivalent of the `ignore-all-combat-penalties` unit ability — it drops BOTH the
 * adjacent ("close combat") and the backline-to-backline ("shooting above the
 * walls") ranged penalties for EVERY ranged unit the owner fields. Unlike the
 * printed `[unit_attack]` waivers (Sharpshooters / Magi / Halflings), the cart's
 * effect is a standing, non-attack-gated effect, so it also applies on a
 * Retaliation Attack. These assertions read the observable attack-roll MODE (the
 * `getAttackRollMode` decision that determines the dice actually thrown), not the
 * effect object, and each fails if the waiver wiring is removed.
 */
function combatWithAmmoCart(hasCart: boolean, marksmenAbilities: string[] = []): GameState {
  const state = createInitialGameState();
  const combat = state.combat!;
  const marksmen = combat.units.unit_p1_marksmen;
  marksmen.type = "ranged";
  marksmen.abilities = marksmenAbilities;
  // Skeletons next to the Marksmen (position 2) = an adjacent shot; Dread Knights
  // stay in the opposite back row (18) for the long-range shot.
  combat.units.unit_p2_skeletons.position = 2;
  if (hasCart) {
    state.players.p1.permanents = ["war_machine.ammo_cart"];
    applyPermanentCombatEffects(state);
  }
  return state;
}

describe("Ammo Cart — player-scoped ranged penalty waiver", () => {
  it("waives the adjacent (close-combat) penalty for the owner's ranged unit", () => {
    // Without the cart the adjacent shot rolls at disadvantage (the CONTROL)…
    expect(adjacentMode(combatWithAmmoCart(false))).toBe("disadvantage");
    // …with the Ammo Cart in play the same shot rolls normally.
    expect(adjacentMode(combatWithAmmoCart(true))).toBe("normal");
  });

  it("waives the long-range (backline-to-backline / 'above the walls') penalty", () => {
    expect(longRangeMode(combatWithAmmoCart(false))).toBe("disadvantage");
    expect(longRangeMode(combatWithAmmoCart(true))).toBe("normal");
  });

  it("still waives the penalty on the owner's ranged unit's Retaliation Attack (player-scoped, not attack-gated)", () => {
    // The [unit_attack] unit-ability waiver is dropped on a retaliation; the Ammo
    // Cart's standing player-scoped effect keeps waiving even when retaliating.
    expect(adjacentRetaliationMode(combatWithAmmoCart(false))).toBe("disadvantage");
    expect(adjacentRetaliationMode(combatWithAmmoCart(true))).toBe("normal");
  });

  it("does NOT help the OPPONENT's ranged units (the waiver is scoped to the owner)", () => {
    // p1 owns the cart; p2's ranged unit still suffers its own adjacent penalty.
    // The Marksmen sit at position 1; put the enemy shooter at the adjacent 2.
    const state = combatWithAmmoCart(true);
    const combat = state.combat!;
    const enemyShooter = combat.units.unit_p2_dread_knights;
    enemyShooter.type = "ranged";
    enemyShooter.position = 2; // adjacent to the p1 Marksmen at 1
    expect(getAttackRollMode(enemyShooter, combat.units.unit_p1_marksmen, state)).toBe("disadvantage");
  });

  it("leaves a MELEE (ground) unit's roll unchanged — the cart is inert for non-ranged units", () => {
    // A ground unit hitting an adjacent enemy rolls normally with OR without the
    // cart: the cart neither adds a penalty nor grants advantage to a melee unit.
    const groundNoCart = combatWithAmmoCart(false);
    groundNoCart.combat!.units.unit_p1_marksmen.type = "ground";
    expect(adjacentMode(groundNoCart)).toBe("normal");

    const groundWithCart = combatWithAmmoCart(true);
    groundWithCart.combat!.units.unit_p1_marksmen.type = "ground";
    expect(adjacentMode(groundWithCart)).toBe("normal");
  });
});

describe("Ammo Cart — interactions with unit-roll abilities", () => {
  // Factory Halflings' [unit_attack] "roll 2 Attack dice, keep the higher"
  // advantage. On the unit's OWN attack it already overrides the ranged penalty.
  const HALFLING = [...(coreUnitDefinitions["factory.halflings"].few?.abilities ?? [])];

  it("Factory Halfling own attack: still a plain advantage roll with the cart (no regression)", () => {
    // With or without the cart the Halfling rolls advantage on its own attack —
    // the cart just means the advantage is no longer overriding a penalty.
    expect(adjacentMode(combatWithAmmoCart(false, HALFLING))).toBe("advantage");
    expect(adjacentMode(combatWithAmmoCart(true, HALFLING))).toBe("advantage");
  });

  it("Factory Halfling RETALIATION: the cart lifts the penalty where the [unit_attack] advantage is gone", () => {
    // On a retaliation the [unit_attack] advantage is dropped: without the cart
    // the ranged penalty reappears (disadvantage); the cart still waives it.
    expect(adjacentRetaliationMode(combatWithAmmoCart(false, HALFLING))).toBe("disadvantage");
    expect(adjacentRetaliationMode(combatWithAmmoCart(true, HALFLING))).toBe("normal");
  });

  it("Shaman's Puppet forced disadvantage still beats the cart's waiver", () => {
    const state = combatWithAmmoCart(true);
    const combat = state.combat!;
    const puppet = makeActiveEffect(
      state,
      {
        name: "Shaman's Puppet",
        scope: "unit",
        duration: { type: "next-activation" },
        polarity: "negative",
        removable: true,
        modifiers: [{ type: "ATTACK_ROLL_DISADVANTAGE" }]
      },
      { type: "card", cardId: "artifact.shamans_puppet", controllerId: "p2" },
      "p2",
      { type: "unit", unitId: combat.units.unit_p1_marksmen.id }
    );
    state.activeEffects.push(puppet);
    // The long-range shot would be NORMAL under the cart; the puppet forces the
    // worst roll regardless.
    expect(longRangeMode(state)).toBe("disadvantage");
    // CONTROL: the same shot with the cart but no puppet is normal.
    expect(longRangeMode(combatWithAmmoCart(true))).toBe("normal");
  });

  it("a unit that already prints the full waiver + the cart: no double-count, still a normal roll", () => {
    // ignore-all-combat-penalties AND the cart both waive; the result is a clean
    // normal roll (idempotent, no crash).
    expect(adjacentMode(combatWithAmmoCart(true, ["ignore-all-combat-penalties"]))).toBe("normal");
    // CONTROL: the same unit-ability alone (no cart) is already normal on its own attack.
    expect(adjacentMode(combatWithAmmoCart(false, ["ignore-all-combat-penalties"]))).toBe("normal");
  });
});

/**
 * The waiver must fire in a REAL adventure combat when the Ammo Cart is a
 * standing PERMANENT the hero already owns BEFORE the fight — not only when
 * played mid-combat. `finalizeCombatStart` (adventure-reducer.ts) runs
 * `applyPermanentCombatEffects`, which seeds the player-scoped
 * `RANGED_IGNORE_ALL_PENALTIES` active effect for every in-play permanent at the
 * start of every neutral / bank / PvP combat. This drives a real Neutral guard
 * fight to just after placement and reads the observable roll mode.
 */
function ammoCartNeutralFight(seed: string, ownsCart: boolean): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    const refreshed = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(refreshed.errors).toHaveLength(0);
    state = refreshed.state;
  }

  const hero = getMainHero(state, "p1")!;
  hero.level = 1; // below the field difficulty → a real fight (no Quick Combat)
  hero.spaceId = "guard-field";
  if (ownsCart) {
    // The Ammo Cart is already in play (bought before the fight), the case the
    // user hits in a real game — not a mid-combat PLAY_CARD.
    state.players.p1.permanents = ["war_machine.ammo_cart"];
  }
  state.adventure!.fields["guard-field"] = {
    spaceId: "guard-field",
    tileInstanceId: "t",
    slot: 0,
    location: "empty_field",
    difficulty: 3, // bronze/silver guards — a normal fought battle
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };

  startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  const placed = applyAction(state, place!.action);
  expect(placed.errors).toHaveLength(0);
  const finished = applyAction(placed.state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  expect(finished.errors).toHaveLength(0);
  return finished.state;
}

/** After the fight starts, force a p1 unit ranged adjacent (positions 1 & 2) to a guard. */
function adventureAdjacentShotMode(state: GameState): ReturnType<typeof getAttackRollMode> {
  const combat = state.combat!;
  const shooter = Object.values(combat.units).find((unit) => unit.controllerId === "p1");
  const guard = Object.values(combat.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID);
  expect(shooter, "a p1 unit is deployed").toBeTruthy();
  expect(guard, "a Neutral guard is deployed").toBeTruthy();
  shooter!.type = "ranged";
  shooter!.position = 1;
  guard!.position = 2; // adjacent → the "close combat" penalty
  return getAttackRollMode(shooter!, guard!, state);
}

describe("Ammo Cart — standing permanent waives penalties in a REAL adventure combat", () => {
  it("finalizeCombatStart seeds the waiver from the pre-owned permanent; the adjacent shot rolls normal", () => {
    const state = ammoCartNeutralFight("ammo-cart-adventure", true);
    // The player-scoped waiver was seeded at adventure combat start.
    const waiver = state.activeEffects.find(
      (effect) =>
        effect.controllerId === "p1" &&
        effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_ALL_PENALTIES")
    );
    expect(waiver, "the Ammo Cart's ranged penalty waiver should be seeded at combat start").toBeTruthy();
    // Observable outcome: the ranged shot at an adjacent guard rolls normally.
    expect(adventureAdjacentShotMode(state)).toBe("normal");
  });

  it("CONTROL: the same adventure fight WITHOUT the Ammo Cart keeps the adjacent penalty", () => {
    const state = ammoCartNeutralFight("ammo-cart-adventure", false);
    expect(
      state.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_ALL_PENALTIES")
      )
    ).toBe(false);
    expect(adventureAdjacentShotMode(state)).toBe("disadvantage");
  });
});
