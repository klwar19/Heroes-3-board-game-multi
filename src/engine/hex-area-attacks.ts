import { combatGeometry, isHexPosition, type BattlefieldGeometry } from "./battlefield";
import { areaAround, unitAdjacentToCell, unitInCells, unitsAdjacent } from "./hex-footprint";
import type { CombatState, CombatUnitState, UnitId } from "./state";
import {
  getFlatDamageFollowUps,
  getSecondAttackAbility,
  getSecondAttackCandidates,
  getUnitAbilityDefinitions
} from "./unit-abilities";

/**
 * PC-style AREA ATTACKS of Magogs and Liches on the optional hex battlefield
 * (house rule `hex-battlefield`, combat.geometry === "hex").
 *
 * User ruling 2026-09-26: "Magog and Lich on the new hex battle map: AoE like
 * PC. The centre is still the main damage, but everything around is the effect
 * (Magog 1 damage, Lich the 2-attack)" — and "make them able to target AoE,
 * not just unit click".
 *
 * On the hex board, for exactly the abilities in HEX_AREA_ATTACK_ABILITY_IDS:
 *  - every printed trigger gate is unchanged (Magogs: the target is not
 *    adjacent to them; Death Cloud: the first attack of the activation; the
 *    ability-attack follow-ups never chain further follow-ups);
 *  - the primary target takes the normal attack, unchanged;
 *  - EVERY unit of the printed candidate set — a living unit with a hex in the
 *    radius-1 ring around the target's body (a two-hex body is ringed as a
 *    whole), friend/foe exactly as printed, the Liches themselves included —
 *    receives the follow-up. There is no "choose a unit" pick for anyone
 *    (human, PvP Neutral Control, the neutral auto-resolver or the AI):
 *      Magogs: the printed flat damage to each (its own DAMAGE_ASSIGNED);
 *      Liches / Dracolich: a full separate ability attack against each, one at
 *      a time in board order (reducer: attackSequence.queuedAbilityAttacks);
 *  - the unit may instead aim its ranged attack at an EMPTY hex (ATTACK_HEX):
 *    no primary defender, and the ring around that hex receives the follow-ups;
 *  - siege Walls / Gate in the ring: the Magog blast never touches them (user
 *    ruling 2026-09-26, "only the main at centre counts" — and a Magog can
 *    never aim at a fortification); the Death Cloud keeps the older house rule
 *    that fells every enemy Wall/Gate around its target.
 *
 * Every other ability sharing these effect types (Forge Bruiser rockets / Tank
 * cannons, Kyrie Eleison, Royal Artillery, the veteran splashes, Doom's
 * Mastermind…) keeps its printed pick-one behaviour, and the 4×5 grid never
 * reads this module (every helper returns "no area" there).
 */
export const HEX_AREA_ATTACK_ABILITY_IDS: ReadonlySet<string> = new Set([
  "magog-fireball-splash",
  "lich-death-cloud",
  "wog-dracolich-death-cloud"
]);

/** Whether `abilityId` resolves as a PC area attack in this combat (hex board only). */
export function isHexAreaAttackAbility(
  combat: { geometry?: BattlefieldGeometry } | null | undefined,
  abilityId: string | null | undefined
): boolean {
  return typeof abilityId === "string" && combatGeometry(combat) === "hex" && HEX_AREA_ATTACK_ABILITY_IDS.has(abilityId);
}

/** A unit's PC area attack, read from its printed ability. */
export type HexAreaAttack =
  | {
      kind: "flat-damage";
      abilityId: string;
      abilityName: string;
      /** Printed flat damage dealt to each struck unit. */
      amount: number;
      enemiesOnly: boolean;
    }
  | {
      kind: "second-attack";
      abilityId: string;
      abilityName: string;
      /** Printed replacement Attack of each follow-up ability attack. */
      baseAttack: number;
      enemiesOnly: boolean;
    };

/** The unit's PC area attack in this combat (hex board only), else null. */
export function hexAreaAttackOf(
  combat: CombatState | null | undefined,
  unit: CombatUnitState | null | undefined
): HexAreaAttack | null {
  if (!unit || combatGeometry(combat) !== "hex") return null;
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (ability.implementationStatus !== "implemented" || !HEX_AREA_ATTACK_ABILITY_IDS.has(ability.id)) continue;
    const effect = ability.effect;
    if (effect?.type === "FLAT_DAMAGE_ADJACENT_TO_TARGET") {
      return {
        kind: "flat-damage",
        abilityId: ability.id,
        abilityName: ability.name,
        amount: effect.amount,
        enemiesOnly: Boolean(effect.enemiesOnly)
      };
    }
    if (effect?.type === "SECOND_ATTACK_ADJACENT_TO_TARGET") {
      return {
        kind: "second-attack",
        abilityId: ability.id,
        abilityName: ability.name,
        baseAttack: effect.useOwnAttack ? unit.attack : effect.baseAttack,
        enemiesOnly: Boolean(effect.enemiesOnly)
      };
    }
  }
  return null;
}

/**
 * The deterministic resolution order of the struck units: ascending hex of
 * each unit's head, then id.
 */
export function orderHexAreaTargets(combat: CombatState, unitIds: readonly UnitId[]): UnitId[] {
  const head = (unitId: UnitId) => combat.units[unitId]?.position ?? Number.MAX_SAFE_INTEGER;
  return [...new Set(unitIds)].sort(
    (left, right) => head(left) - head(right) || (left < right ? -1 : left > right ? 1 : 0)
  );
}

/** The radius-1 ring around an aimed hex (the centre excluded). */
export function hexAreaRing(combat: CombatState, centre: number): Set<number> {
  return areaAround(combat, centre, false, 1);
}

/** Whether `unit` may receive `attack`'s follow-up from `attacker` (the printed friend/foe filter). */
function eligibleAreaTarget(attacker: CombatUnitState, attack: HexAreaAttack, unit: CombatUnitState): boolean {
  return (
    unit.damage < unit.maxHealth &&
    // Magogs never splash themselves (getFlatDamageFollowUps); the Death Cloud
    // may engulf the Liches themselves (getSecondAttackCandidates).
    (attack.kind === "second-attack" || unit.id !== attacker.id) &&
    (!attack.enemiesOnly || unit.controllerId !== attacker.controllerId)
  );
}

/**
 * The units an ATTACK_HEX aimed at the empty hex `centre` strikes, in
 * resolution order: every eligible living unit with a hex in the ring around
 * `centre`.
 */
export function hexAreaAimedTargets(
  combat: CombatState,
  attacker: CombatUnitState,
  attack: HexAreaAttack,
  centre: number
): UnitId[] {
  const ring = hexAreaRing(combat, centre);
  return orderHexAreaTargets(
    combat,
    Object.values(combat.units)
      .filter((unit) => eligibleAreaTarget(attacker, attack, unit) && unitInCells(combat, unit, ring))
      .map((unit) => unit.id)
  );
}

/**
 * Every hex `attacker` could aim `attack` at, mapped to the units the shot
 * would strike (resolution order): hexes outside `blocked` (the caller's
 * occupied / obstacle / fortification cells), not adjacent to the attacker,
 * whose ring holds at least one eligible unit. Built once from each eligible
 * unit's own ring (a hex is in a unit's ring exactly when the unit has a hex
 * in that hex's ring), so it costs O(units), not O(board × units).
 */
export function hexAreaAimOptions(
  combat: CombatState,
  attacker: CombatUnitState,
  attack: HexAreaAttack,
  blocked: ReadonlySet<number>
): Map<number, UnitId[]> {
  const byCell = new Map<number, UnitId[]>();
  for (const unit of Object.values(combat.units)) {
    // The off-board Arrow Tower has no ring on the hex board.
    if (!isHexPosition(unit.position) || !eligibleAreaTarget(attacker, attack, unit)) continue;
    for (const cell of areaAround(combat, unit, false, 1)) {
      if (!isHexPosition(cell) || blocked.has(cell)) continue;
      const struck = byCell.get(cell);
      if (struck) struck.push(unit.id);
      else byCell.set(cell, [unit.id]);
    }
  }
  const options = new Map<number, UnitId[]>();
  for (const cell of [...byCell.keys()].sort((left, right) => left - right)) {
    if (unitAdjacentToCell(combat, attacker, cell)) continue;
    options.set(cell, orderHexAreaTargets(combat, byCell.get(cell)!));
  }
  return options;
}

/**
 * The units a declared ATTACK_UNIT's area follow-up will strike on the hex
 * board (certain — no pick), read BEFORE the attack resolves (its own attack
 * not yet counted in attacksThisActivation), with the printed gates. Null when
 * `attacker` has no hex area attack; an empty list when a gate fails. For the
 * AI and previews; the reducer resolves through its own follow-up table.
 */
export function hexAreaAttackStrikes(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged"
): { attack: HexAreaAttack; struckUnitIds: UnitId[] } | null {
  const attack = hexAreaAttackOf(combat, attacker);
  if (!attack) return null;
  if (attack.kind === "flat-damage") {
    const followUp = getFlatDamageFollowUps(combat, { attacker, defender, attackKind, damage: 0 }).find(
      (entry) => entry.abilityId === attack.abilityId && entry.zone === "target"
    );
    return { attack, struckUnitIds: followUp ? orderHexAreaTargets(combat, followUp.candidateUnitIds) : [] };
  }
  const printed = getSecondAttackAbility(attacker);
  if (
    !printed ||
    printed.abilityId !== attack.abilityId ||
    (attacker.attacksThisActivation ?? 0) !== 0 ||
    printed.onRoll !== undefined ||
    (printed.requiresNonAdjacentTarget && unitsAdjacent(combat, attacker, defender))
  ) {
    return { attack, struckUnitIds: [] };
  }
  return {
    attack,
    struckUnitIds: orderHexAreaTargets(
      combat,
      getSecondAttackCandidates(combat, attacker, defender, printed.enemiesOnly)
    )
  };
}
