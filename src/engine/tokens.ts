import { appendEvent, nextEventNumber } from "./events";
import type { CombatState, CombatTokenKind, CombatTokenState, CombatUnitState, GameState } from "./state";

/**
 * Combat-token rules ("Tokens on Units", rulebook p.89):
 *  - Attack token (+1/+2 attack) — one per unit, the better one is kept.
 *  - Weakness token (−1/−2 attack) — one per unit, the milder one is kept by
 *    its controller; we keep the milder one automatically.
 *  - Corrosion token (−1 defense, min 0) — one per unit, lasts all combat.
 *  - Paralysis token — skip the next activation (remove the token instead);
 *    removed when the unit takes damage. Retaliations still happen.
 *  - Temptation token (MGQ) — up to two per unit. Two skip the next
 *    activation and then both clear; one alone is visible pressure only.
 */

export function getUnitTokens(unit: CombatUnitState): CombatTokenState[] {
  return unit.tokens ?? [];
}

/** Net attack delta from Attack and Weakness tokens held by the unit. */
export function tokenAttackBonus(unit: CombatUnitState): number {
  return getUnitTokens(unit).reduce(
    (total, token) => (token.kind === "attack" || token.kind === "weakness" ? total + token.amount : total),
    0
  );
}

/**
 * Defense reduction from Corrosion tokens, already floored so the printed
 * defense never drops below 0 (fold the result into the defense bonus).
 *
 * A Corrosion token ALWAYS reduces defense; its magnitude is the reduction.
 * Different sources store the amount with inconsistent signs — the Behemoth's
 * Corrosion uses −1, while the Greater Gnoll's Flail uses +1 — so we normalize
 * to the magnitude here. (The old
 * `total - token.amount` quietly ADDED defense for the positive-amount sources,
 * i.e. positive-magnitude corrosion made the target tankier; no test caught it because none asserted the
 * resulting defense, only the stored token amount.)
 */
export function tokenDefenseDelta(unit: CombatUnitState): number {
  const reduction = getUnitTokens(unit).reduce(
    (total, token) => (token.kind === "corrosion" ? total + Math.abs(token.amount) : total),
    0
  );
  return -Math.min(unit.defense, reduction);
}

export function hasToken(unit: CombatUnitState, kind: CombatTokenKind): boolean {
  return getUnitTokens(unit).some((token) => token.kind === kind);
}

/** Number of tokens of one kind. Most kinds cap at one; MGQ Temptation caps at two. */
export function tokenCount(unit: CombatUnitState, kind: CombatTokenKind): number {
  return getUnitTokens(unit).filter((token) => token.kind === kind).length;
}

/**
 * Places a combat token, enforcing the one-token-per-kind cap: a second
 * Attack token keeps the higher bonus, a second Weakness token the milder
 * malus ("the player controlling it chooses which one to keep" — the engine
 * keeps the better one for the unit's controller), a second Corrosion or
 * Paralysis token is simply not added.
 */
export function placeCombatToken(
  state: GameState,
  unit: CombatUnitState,
  kind: CombatTokenKind,
  amount: number,
  sourceName: string,
  rounds?: number
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const tokens = [...getUnitTokens(unit)];
  const existingIndex = tokens.findIndex((token) => token.kind === kind);
  const expiresAtCombatRoundEnd = rounds !== undefined ? combat.round + Math.max(1, rounds) - 1 : undefined;

  const next: CombatTokenState = {
    id: `token_${nextEventNumber(state)}`,
    kind,
    amount,
    sourceName,
    ...(expiresAtCombatRoundEnd !== undefined ? { expiresAtCombatRoundEnd } : {})
  };

  // MGQ Temptation is deliberately the sole stackable combat token. Each
  // marker stays independently visible, but pressure is capped at two because
  // two already guarantee the activation skip. Existing token replacement
  // semantics remain exactly as before in the branch below.
  if (kind === "temptation") {
    if (tokenCount(unit, kind) >= 2) {
      return;
    }
    tokens.push(next);
    unit.tokens = tokens;
    appendEvent(state, {
      type: "COMBAT_TOKEN_PLACED",
      unitId: unit.id,
      playerId: unit.controllerId,
      kind,
      amount,
      sourceName
    });
    return;
  }

  if (existingIndex >= 0) {
    const existing = tokens[existingIndex];
    // Keep the token that is better for the unit (higher signed amount); on a
    // tie the fresher duration wins.
    const keepNew = next.amount > existing.amount || (next.amount === existing.amount && rounds !== undefined);
    if (!keepNew) {
      return;
    }
    appendEvent(state, {
      type: "COMBAT_TOKEN_REMOVED",
      unitId: unit.id,
      kind: existing.kind,
      reason: "replaced"
    });
    tokens.splice(existingIndex, 1);
  }

  tokens.push(next);
  unit.tokens = tokens;

  appendEvent(state, {
    type: "COMBAT_TOKEN_PLACED",
    unitId: unit.id,
    playerId: unit.controllerId,
    kind,
    amount,
    sourceName
  });
}

export function removeToken(
  state: GameState,
  unit: CombatUnitState,
  kind: CombatTokenKind,
  reason: "expired" | "replaced" | "damage" | "activation-skipped" | "dispelled"
): boolean {
  const tokens = getUnitTokens(unit);
  const index = tokens.findIndex((token) => token.kind === kind);
  if (index === -1) {
    return false;
  }

  unit.tokens = tokens.filter((_, candidate) => candidate !== index);
  appendEvent(state, {
    type: "COMBAT_TOKEN_REMOVED",
    unitId: unit.id,
    kind,
    reason
  });
  return true;
}

/** Paralysis clears on damage, and an attack clears it even when damage is 0. */
export function noteUnitDamagedForTokens(
  state: GameState,
  unit: CombatUnitState,
  damage: number,
  attacked = false
): void {
  if ((damage > 0 || attacked) && hasToken(unit, "paralysis")) {
    removeToken(state, unit, "paralysis", "damage");
  }
}

/** Expires timed tokens at the end of the given combat round. */
export function expireTokensAtRoundEnd(state: GameState, combat: CombatState, round: number): void {
  for (const unit of Object.values(combat.units)) {
    const tokens = getUnitTokens(unit);
    if (tokens.length === 0) {
      continue;
    }

    const expiring = tokens.filter((token) => token.expiresAtCombatRoundEnd === round);
    if (expiring.length === 0) {
      continue;
    }

    unit.tokens = tokens.filter((token) => token.expiresAtCombatRoundEnd !== round);
    for (const token of expiring) {
      appendEvent(state, {
        type: "COMBAT_TOKEN_REMOVED",
        unitId: unit.id,
        kind: token.kind,
        reason: "expired"
      });
    }
  }
}
