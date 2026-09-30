// Vey (Stronghold, Battle Mage) — the "Ogres" specialist.
//  IV — Ongoing: for this Combat, the selected friendly unit's FIRST Attack roll
//       of EACH Combat round is made with advantage (an ATTACK_ROLL_ADVANTAGE
//       effect flagged firstAttackRollOnly; consumeFirstAttackRollAdvantage marks
//       the round spent when that unit's first attack or Retaliation Attack of
//       the round resolves, so e.g. a Wolf Raiders' second strike rolls normally).
//  VI — Ongoing: for this Combat, after your Ogres finish an activation, you may
//       perform their token "other action" (the Bloodlust / Attack token) once
//       more, immediately. The offer rides the post-activation choice queue
//       (combat.elementalChoices, kind "vey-extra-token"), so turn order resumes
//       only after the pick (or Skip) resolves. The extra token is the Ogres'
//       CURRENT side's token (Few +1 / Pack +2, read when the pick resolves) and
//       obeys the normal no-stacking rule: a unit holds at most one Attack
//       token (placeCombatToken keeps the better one), so a unit already holding
//       a better Attack token is not offered.
import type { CombatState, CombatUnitState, GameState } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";
import { effectAppliesToUnit } from "./active-effects";
import { getUnitAbilityDefinitions } from "./unit-abilities";
import { isArrowTowerUnit } from "./siege";
import { unitsAdjacent } from "./hex-footprint";
import { placeCombatToken } from "./tokens";
import { appendEvent } from "./events";
import { townVeterancy } from "./town-veterancy";
import { veteranTrigger } from "./faction-veterancy";

type AbilityDefinition = ReturnType<typeof getUnitAbilityDefinitions>[number];
type TokenEffect = Extract<NonNullable<AbilityDefinition["effect"]>, { type: "PLACE_TOKEN_ACTION" }>;

export const VEY_OGRES_VI_CARD_ID = "specialty.vey.6";

const alive = (unit: CombatUnitState) => unit.damage < unit.maxHealth;

function tokenAbility(
  unit: CombatUnitState,
  abilityId?: string,
): { id: string; name: string; effect: TokenEffect } | undefined {
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (ability.effect?.type === "PLACE_TOKEN_ACTION" && (!abilityId || ability.id === abilityId)) {
      return { id: ability.id, name: ability.name, effect: ability.effect };
    }
  }
  return undefined;
}

/**
 * The same recipients the unit's own token action offers (the reducer's
 * PLACE_TOKEN_ACTION picker): side, alive, the Arrow Tower only for an enemy
 * debuff, adjacency and unit-type limits.
 */
function tokenTargetOk(
  combat: CombatState,
  placer: CombatUnitState,
  target: CombatUnitState,
  effect: TokenEffect,
): boolean {
  const sideOk =
    effect.targets === "any" ||
    (effect.targets === "friendly" && target.controllerId === placer.controllerId) ||
    (effect.targets === "enemy" && target.controllerId !== placer.controllerId);
  return (
    sideOk &&
    alive(target) &&
    (effect.targets === "enemy" || !isArrowTowerUnit(target)) &&
    (!effect.adjacentOnly || unitsAdjacent(combat, placer, target)) &&
    (!effect.targetTypes || effect.targetTypes.includes(target.type))
  );
}

/**
 * Called from advanceActiveUnit for the unit whose activation just ended. Only
 * a REAL activation counts: the flag is armed when the activation opens (after
 * the Paralysis / Morale / Temptation skips) and cleared by a Sorrow-style skip.
 * A Polish Wait is not the end of the turn, so the flag survives until the
 * waited re-activation finishes.
 */
export function veyTokenAfterActivation(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || combat.outcome || !unit.veyTokenOfferArmed || unit.waitPending) return;
  unit.veyTokenOfferArmed = false;
  if (!alive(unit) || unit.controllerId === NEUTRAL_PLAYER_ID) return;
  const ability = tokenAbility(unit);
  if (!ability) return;
  const granted = state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "TOKEN_ACTION_AFTER_ACTIVATION"),
  );
  if (!granted) return;
  (combat.elementalChoices ??= []).push({
    kind: "vey-extra-token",
    unitId: unit.id,
    abilityId: ability.id,
    cardId: VEY_OGRES_VI_CARD_ID,
    optional: true,
  });
}

/** The token the unit already holds of this kind (tokens of one kind never stack). */
function heldToken(target: CombatUnitState, effect: TokenEffect) {
  return (target.tokens ?? []).find((token) => token.kind === effect.token);
}

/**
 * Option list for the queued Ogres VI offer (one pick per legal recipient). The
 * token is the Ogres' current side's (a Pack that flipped to Few offers +1). A
 * unit whose held token of that kind is already better would keep it unchanged
 * (no stacking), so it is not offered; an equal one is only refreshed.
 */
export function veyTokenPicks(
  state: GameState,
  placer: CombatUnitState,
): Array<{ targetId: string; label: string }> {
  const combat = state.combat;
  const ability = tokenAbility(placer);
  if (!combat || !ability) return [];
  const amount = `${ability.effect.amount >= 0 ? "+" : ""}${ability.effect.amount}`;
  return Object.values(combat.units)
    .filter((target) => tokenTargetOk(combat, placer, target, ability.effect) &&
      !((heldToken(target, ability.effect)?.amount ?? -Infinity) > ability.effect.amount))
    .map((target) => ({
      targetId: target.id,
      label: heldToken(target, ability.effect)
        ? `Refresh the ${ability.name} (${amount}) on ${target.cardName} (tokens don't stack)`
        : `Place a ${ability.name} (${amount}) on ${target.cardName}`,
    }));
}

/**
 * Resolves the Ogres VI pick: the Ogres perform their token action again, with
 * their current side's token (Few +1 / Pack +2).
 */
export function resolveVeyExtraToken(
  state: GameState,
  placer: CombatUnitState,
  targetId: string | undefined,
): void {
  const combat = state.combat;
  const ability = tokenAbility(placer);
  const target = combat && targetId ? combat.units[targetId] : undefined;
  if (!combat || !ability || !target || !tokenTargetOk(combat, placer, target, ability.effect) ||
      (heldToken(target, ability.effect)?.amount ?? -Infinity) > ability.effect.amount) {
    throw new Error("Choose a legal unit for the Ogres token.");
  }
  placeCombatToken(state, target, ability.effect.token, ability.effect.amount, ability.name, ability.effect.rounds);
  // The same riders the reducer applies when the unit places its token itself.
  if (ability.effect.token === "attack" && townVeterancy(placer, "ogre-guard") && !placer.townVeterancy?.defense) {
    (placer.townVeterancy ??= {}).defense = 1;
    veteranTrigger(state, placer, "town-ogre-guard");
  }
  if (ability.effect.sourceDefenseToken) placer.defenseToken = true;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: placer.id,
    abilityId: ability.id,
    targetUnitId: target.id,
    message: `Ogres VI: ${placer.cardName} places a ${ability.name} on ${target.cardName}.`,
  });
}

/**
 * Vey's Ogres IV: the advantage covers only the unit's first Attack roll of each
 * Combat round. Called when an attack by `attacker` resolves (its roll mode is
 * already fixed on the declaration): the round is marked spent, so any later
 * roll this round is normal and the next round's first roll has advantage again.
 */
export function consumeFirstAttackRollAdvantage(state: GameState, attacker: CombatUnitState): void {
  const round = state.combat?.round;
  if (round === undefined || attacker.veyFirstRollSpentRound === round) return;
  const held = state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, attacker) &&
      effect.modifiers.some((modifier) => modifier.type === "ATTACK_ROLL_ADVANTAGE" && modifier.firstAttackRollOnly),
  );
  if (held) attacker.veyFirstRollSpentRound = round;
}
