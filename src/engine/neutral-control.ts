import { isPveEncounterCombat } from "./pve-encounter";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { CombatState, CombatUnitState, GameState, PendingChoice, PlayerId } from "./state";

/**
 * PvP Neutral Control (OPTIONAL mode for any game with at least two seats,
 * including one human plus computer opponents,
 * `GameSetupOptions.pvpNeutralControl`): in every Neutral combat the NEXT live
 * player clockwise from the fighter becomes the NEUTRAL CONTROLLER — a human
 * plays the guards like a PvP side. The engine stops on each guard's
 * activation and the controller drives it with the normal combat actions
 * (move, attack, defend, hold), answers the guards' ability follow-ups
 * (activation choices, splash targets, attack-die rerolls) and breaks their
 * activation-order ties. NOT related to the WOG Commanders module — this is
 * purely "which SEAT plays the Neutral units".
 *
 * The `pvpNeutralControlMustAttack` sub-toggle (default ON) keeps the rulebook
 * spirit: a guard must attack when it can reach an enemy, may not Defend, and
 * may only approach (never wander) when no attack is reachable. Toggled OFF,
 * the controller plays the guards with no constraint at all.
 *
 * USER RULE: NEITHER mode ever reaches an optional PvE-director fight — a
 * Calamity Wave assault, a Raid-Boss lair fight or a Dungeon floor fight
 * (`isPveEncounterCombat`). Those are always played by the normal Neutral AI.
 *
 * This module holds only the pure "who controls / what counts as a
 * neutral-side decision" reads so parallel-turns.ts, afk.ts, reducer.ts and
 * adventure-reducer.ts can all consume them without import cycles.
 */

/**
 * CO-OP step 2 (USER RULE "nobody controls the computer enemy"): in a co-op
 * game (`GameState.gameMode === "coop"`) NEITHER manual-neutral-control mode
 * exists — the normal Neutral AI plays every guard. Both modes are clash-only
 * ideas: they hand the guards to "the next player clockwise" / "the fighter",
 * and in co-op that seat is either an ALLY (so the humans would be playing the
 * monsters attacking their own alliance) or a COMPUTER seat that has no
 * human-facing menu to drive.
 *
 * Shaped exactly like the `isPveEncounterCombat` exemption: ONE shared read,
 * an early `null` in BOTH controller derivations, and every downstream consumer
 * (`neutralCombatControllerId`, `combatUnitDecisionOwnerId`,
 * `neutralControlMustAttack`, `openNeutralPlacementWindow`,
 * `computerDecisionOwner`) simply falls back on that null. A CLASH table with
 * computer seats is UNCHANGED.
 */
export function coopDisablesManualNeutralControl(state: GameState): boolean {
  return state.gameMode === "coop";
}

/**
 * The seat controlling the Neutral side of `combat`, or null when the normal
 * Neutral AI plays it: the mode is off (or the snapshot predates it), the
 * combat is not a Neutral fight, or no OTHER live seat exists (solo table, or
 * everyone else eliminated — `turnOrder` holds live seats only, so the next
 * entry clockwise from the fighter is always a live controller). Derived fresh
 * on every read so a controller eliminated mid-fight hands the guards to the
 * next live seat (or back to the AI) automatically.
 */
export function neutralCombatControllerId(state: GameState, combat: CombatState): PlayerId | null {
  return pvpNeutralControllerId(state, combat) ?? manualGuardControllerId(state, combat);
}

/**
 * The seat that must make decisions for a combat unit right now.
 *
 * A Neutral guard deliberately keeps `controllerId === NEUTRAL_PLAYER_ID`: all
 * attack attribution, friendly/enemy checks, retaliation and effects must still
 * treat it as belonging to the Neutral army. When one of the optional manual
 * control modes is enabled, however, a real player seat owns the guard's INPUT.
 * Keeping that distinction in one helper prevents the engine, computer runner
 * and battlefield UI from disagreeing about whose activation is open.
 */
export function combatUnitDecisionOwnerId(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState
): PlayerId {
  if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
    return unit.controllerId;
  }
  return neutralCombatControllerId(state, combat) ?? NEUTRAL_PLAYER_ID;
}

/**
 * The PvP-Neutral-Control controller alone (a human OPPONENT plays the guards),
 * ignoring Manual guard control. Use this for the mode's opponent-only perks —
 * the pre-battle formation SORT window and the NEUTRAL_CONTROL_ASSIGNED notice
 * — which must NOT light up when the FIGHTER merely commands their own guards.
 */
export function pvpNeutralControllerId(state: GameState, combat: CombatState): PlayerId | null {
  if (combat.context.kind !== "neutral" || !state.adventure?.pvpNeutralControl) {
    return null;
  }
  // CO-OP: nobody controls the computer enemy — the Neutral AI plays every guard.
  if (coopDisablesManualNeutralControl(state)) {
    return null;
  }
  // USER RULE: the optional PvE director's own fights — a Calamity Wave
  // assault, a Raid-Boss lair, a Dungeon floor — are NEVER handed to a manual
  // controller. They always fall back to the normal Neutral AI pipeline.
  if (isPveEncounterCombat(combat)) {
    return null;
  }
  const order = state.turnOrder;
  const index = order.indexOf(combat.attackerPlayerId);
  if (index === -1 || order.length < 2) {
    return null;
  }
  const next = order[(index + 1) % order.length];
  return next && next !== combat.attackerPlayerId && next !== NEUTRAL_PLAYER_ID ? next : null;
}

/**
 * Manual guard control (`GameSetupOptions.manualGuardControl`, default OFF —
 * a Game-options toggle like Undo moves): the FIGHTER of a Neutral combat
 * commands the guards themselves with FULL free control (move, attack, Defend,
 * Wait, hold, tokens — never the must-attack AI menu; that sub-toggle only
 * binds a PvP Neutral Control opponent). They may still delegate single
 * activations back to the AI via AUTO_NEUTRAL_ACTIVATION. Null when the mode
 * is off, the fight is not Neutral, PvP Neutral Control already assigns a
 * human opponent (checked by the caller — pvp wins in
 * neutralCombatControllerId), or the fighter is a COMPUTER seat (the AI would
 * otherwise have to drive the guards through the human-facing menu and could
 * stall).
 */
export function manualGuardControllerId(state: GameState, combat: CombatState): PlayerId | null {
  if (combat.context.kind !== "neutral" || !state.adventure?.manualGuardControl) {
    return null;
  }
  // CO-OP: same rule as pvpNeutralControllerId — the Neutral AI plays every guard.
  if (coopDisablesManualNeutralControl(state)) {
    return null;
  }
  // Same USER RULE as pvpNeutralControllerId: never the fighter's to drive in a
  // wave / raid-boss / dungeon fight (which would let the attacked player play
  // the boss attacking them).
  if (isPveEncounterCombat(combat)) {
    return null;
  }
  const fighter = combat.attackerPlayerId;
  if (!fighter || fighter === NEUTRAL_PLAYER_ID || state.controllers?.[fighter]?.kind === "computer") {
    return null;
  }
  return fighter;
}

/**
 * The "must attack" sub-toggle of PvP Neutral Control (default ON): a
 * controlled guard must attack whenever it can, may not Defend, and may only
 * approach when no attack is reachable. OFF lets the controller play the
 * guards entirely freely.
 *
 * Manual guard control alone is ALWAYS free play — the fighter may Wait,
 * Defend, hold, move anywhere legal, and choose whether to attack. Only a
 * real PvP Neutral Control seat (a human OPPONENT playing the guards) is
 * bound by `pvpNeutralControlMustAttack`. Polish-wait re-activation and
 * Astrologers frenzy still force attack on their own paths.
 *
 * Pass `combat` where available: with the PvP option ON but NO live opponent
 * derivable for THIS fight (pvpNeutralControllerId null — eliminations left
 * nobody, so the manual fighter or the AI drives), the sub-toggle binds
 * nobody and free play applies.
 */
export function neutralControlMustAttack(state: GameState, combat?: CombatState): boolean {
  // Manual-only (no PvP Neutral Control): full free control of the guards.
  if (!state.adventure?.pvpNeutralControl) {
    return false;
  }
  // PvP option on, but this fight's controller is not a PvP opponent.
  if (combat && pvpNeutralControllerId(state, combat) === null) {
    return false;
  }
  return state.adventure?.pvpNeutralControlMustAttack ?? true;
}

/**
 * Whether an open pending choice is one of the NEUTRAL SIDE's own combat
 * decisions — a decision that under PvP Neutral Control belongs to the
 * controlling player rather than a bystander:
 *  - the guards' activation-order tie (side NEUTRAL_PLAYER_ID);
 *  - the AI-mode fighter picks (neutral-target tie, neutral-destination);
 *  - a neutral harpy's fly-back-or-stay reposition (combat-reposition whose
 *    unit is neutral — opened for the controller under free-play control);
 *  - a neutral unit's ability follow-up (ABILITY_TARGET_CHOICE whose source
 *    unit is neutral: splash targets, Magic Mirror redirect, activation
 *    choices) or its attack-die reroll window (ATTACK_DIE_REROLL whose
 *    attacker is neutral).
 *
 * Used by the parallel-turns bystander guard (the controller answering one of
 * these inside the open fight is that interaction's own input) and by
 * eliminatePlayer (a dead controller's open neutral-side choice is handed back
 * to the NEUTRAL seat instead of being dropped, so the fight never strands).
 */
export function isNeutralSideCombatChoice(combat: CombatState, choice: PendingChoice): boolean {
  if (!choice) {
    return false;
  }
  if (choice.type === "ABILITY_TARGET_CHOICE") {
    if (choice.kind === "neutral-target") {
      return true;
    }
    const source = choice.sourceUnitId ? combat.units[choice.sourceUnitId] : undefined;
    return source?.controllerId === NEUTRAL_PLAYER_ID;
  }
  if (choice.type === "ATTACK_DIE_REROLL") {
    return combat.units[choice.attackerId]?.controllerId === NEUTRAL_PLAYER_ID;
  }
  if (choice.type === "OPTION_CHOICE") {
    if (choice.context === "neutral-destination") {
      return true;
    }
    // The Random Town's choosable bronze Pack: the NEUTRAL side's own pre-battle
    // decision, merely re-stamped to the seat controlling the defense.
    if (choice.context === "random-town-pack") {
      return true;
    }
    if (choice.context === "combat-activation-order" && choice.activationOrder?.side === NEUTRAL_PLAYER_ID) {
      return true;
    }
    if (choice.context === "combat-reposition" && choice.reposition) {
      return combat.units[choice.reposition.unitId]?.controllerId === NEUTRAL_PLAYER_ID;
    }
    return false;
  }
  return false;
}

/**
 * Whether an open choice is a neutral unit's SPLASH / SPREAD second-attack
 * VICTIM pick — the Magog/Cerberi fireball splash (`flat-damage`) or the Lich
 * Death Cloud / Hydra pick-one second attack (`second-attack`). In a PLAIN
 * neutral fight (the AI plays the guards — no PvP Neutral Control seat) the
 * FIGHTER picks this victim instead of the AI auto-resolving it (BINH house
 * rule: "the player can choose who will get hit when an enemy neutral attacks").
 *
 * Deliberately NARROWER than `isNeutralSideCombatChoice`: the neutral's OWN
 * offense picks (Magic Mirror `spell-redirect`, Faerie `faerie-damage`, its
 * `[activation]` choices, the neutral-target/destination ties) are NOT included
 * — those are the AI's own aim, not a "who gets hit" the victim should steer, so
 * they keep auto-resolving. Only used by the reducer pump to re-stamp the choice
 * to the fighter; the choice is created NEUTRAL-owned exactly as before, so a
 * PvP Neutral Control seat (checked first) still wins ownership of it.
 */
export function isNeutralSplashVictimChoice(choice: PendingChoice): boolean {
  if (!choice || choice.type !== "ABILITY_TARGET_CHOICE") {
    return false;
  }
  return choice.kind === "flat-damage" || choice.kind === "second-attack";
}
