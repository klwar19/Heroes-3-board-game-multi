import {
  fieldCreatureBankId, heroMovementMax, isBankStyleGuardLocation, isFieldGuarded,
  isTeleportObjectGuardLocation, neutralBattleLevel, polishQuickCombatFieldInfo,
} from "../adventure";
import { polishQuickCombatEnabled } from "../polish-quick-combat";
import { locationDefinitions } from "@/data/map/locations";
import type { GameAction, GameState, HeroState, MapFieldState } from "../state";
import { playersAreAllied } from "./control";
import { premiumCombatMovementReserve } from "./combat-movement";
export { premiumCombatMovementReserve } from "./combat-movement";
import {
  canBeatGuardedField, collectMapObjectives, distanceFromHeroTo,
  isFreeSeizeObjective, objectiveDistanceField, primaryMapObjective,
} from "./map-navigation";
import { repeatsFailedFight, type ComputerPolicyMemory } from "./memory";
import { isPremiumEconomyField } from "./army-strength";
import { isOpeningFarSweepField } from "./far-sweep";
import { forecastGuardField } from "./fight-forecast";

/**
 * USER RULING 2026-09-26 ("rounds 2-3 can go sideways a bit, attack lv 2 or get
 * things, then attack the level-3 neutral with confidence"): while the premium
 * fight must wait for next turn's fresh movement, the leftover movement may
 * take a SAFE side guard instead of parking — only when next turn's attack stays
 * in range from that field. "Safe" is a strict level advantage the army still
 * covers (no battle), or the pre-reveal forecast over the public guard
 * composition (fight-forecast.ts) at high confidence and low expected losses,
 * so the side fight never bleeds the core the premium fight needs.
 */
const SIDE_FIGHT_MAX_DIFFICULTY = 2;
const SIDE_FIGHT_MAX_ROUND = 6;
export const SIDE_FIGHT_MIN_WIN = 0.9;
export const SIDE_FIGHT_MAX_LOSSES = 0.25;

/**
 * The level shortcut is "no battle" only where the arrival really resolves as
 * Quick Combat (adventure.ts heroMoveResolvesAsQuickCombat): a designer's exact
 * army is never skipped, and under Polish Quick Combat the army strength must
 * also cover the field. Anything else is a real fight and needs the forecast.
 */
function sideFightResolvesQuick(state: GameState, hero: HeroState, field: MapFieldState): boolean {
  if (field.customGuardUnits?.length || neutralBattleLevel(state, hero) <= (field.difficulty ?? 0)) return false;
  return !polishQuickCombatEnabled(state) || Boolean(polishQuickCombatFieldInfo(state, hero, field)?.covered);
}

function sideFightSafe(state: GameState, hero: HeroState, field: MapFieldState, reserve: number): boolean {
  if (sideFightResolvesQuick(state, hero, field)) return canBeatGuardedField(state, hero, field);
  const forecast = forecastGuardField(state, hero, field, reserve);
  return Boolean(forecast && forecast.winChance >= SIDE_FIGHT_MIN_WIN &&
    forecast.expectedOwnLosses <= SIDE_FIGHT_MAX_LOSSES);
}

/** A known, fightable income route takes precedence over another reveal. */
export function hasCommittedIncomeRoute(
  state: GameState, heroId: string, memory: ComputerPolicyMemory,
): boolean {
  const hero = state.heroes[heroId];
  if (!hero?.spaceId || hero.kind !== "main") return false;
  const primary = primaryMapObjective(state, hero, undefined, memory.stickyObjectiveSpaceId);
  const field = primary && state.adventure?.fields[primary.spaceId];
  return Boolean(primary && primary.kind !== "explore" && field && (isPremiumEconomyField(field) || isOpeningFarSweepField(state, hero.controllerId, field)) &&
    (!isFieldGuarded(field) || canBeatGuardedField(state, hero, field)) &&
    distanceFromHeroTo(state, hero, primary.spaceId, true) !== undefined);
}

/** Convert the premium economy commitment into a current/next-turn movement budget. */
export function scorePremiumApproach(
  state: GameState,
  action: Extract<GameAction, { type: "MOVE_HERO" }>,
  memory: ComputerPolicyMemory,
): { score: number; policy: string } | null {
  const hero = state.heroes[action.heroId];
  if (!hero?.spaceId || hero.kind !== "main") return null;
  const objectives = collectMapObjectives(state, hero);
  const primary = primaryMapObjective(state, hero, objectives, memory.stickyObjectiveSpaceId);
  const field = primary && state.adventure?.fields[primary.spaceId];
  if (!primary || primary.kind === "explore" || !field || (field.location !== "settlement" && field.location !== "mine" &&
      !isOpeningFarSweepField(state, hero.controllerId, field)) ||
      (isFieldGuarded(field) && !canBeatGuardedField(state, hero, field))) return null;

  const distance = objectiveDistanceField(state, hero, [primary], true);
  const here = distance.get(hero.spaceId) ?? Infinity;
  const to = distance.get(action.to) ?? Infinity;
  if (!Number.isFinite(here)) return null;
  const reserve = premiumCombatMovementReserve(state, hero, field);
  const movement = hero.movementPoints;
  const nextMovement = heroMovementMax(state, hero);

  if (action.to === primary.spaceId) {
    // The entry itself costs one point. Never start a paid-continuation fight
    // on the last MP when a refreshed turn can afford entry plus the buffer.
    if (movement < 1 + reserve) {
      return { score: 250, policy: "map.premium-save-combat-movement" };
    }
    return { score: 945, policy: "map.premium-capture-now" };
  }

  // No diversion when the capture plus buffer fits THIS turn. Otherwise take
  // a real pickup that leaves the premium guard in next turn's strike range.
  if (here + reserve > movement && here + reserve <= nextMovement) {
    const pickups = objectives.filter(objective => {
      if (!isFreeSeizeObjective(objective, state) || objective.spaceId === hero.spaceId ||
          objective.spaceId === primary.spaceId) return false;
      const walk = distanceFromHeroTo(state, hero, objective.spaceId);
      const returnWalk = distance.get(objective.spaceId) ?? Infinity;
      // Never walk away from the guard to spend leftover MP. A pickup must
      // maintain or shorten the committed route and preserve next-turn entry.
      return walk !== undefined && walk <= movement && returnWalk <= here &&
        returnWalk + reserve <= nextMovement;
    }).sort((a, b) =>
      (distanceFromHeroTo(state, hero, a.spaceId) ?? Infinity) -
      (distanceFromHeroTo(state, hero, b.spaceId) ?? Infinity) ||
      a.spaceId.localeCompare(b.spaceId),
    );
    // Human-controlled guards (PvP Neutral Control) do not follow the script the
    // forecast models, so no side fight is planned against them.
    const sideFights = (state.round ?? 0) <= SIDE_FIGHT_MAX_ROUND && !state.adventure?.pvpNeutralControl ? objectives.filter(objective => {
      if (objective.kind !== "guard" || objective.spaceId === primary.spaceId) return false;
      const side = state.adventure?.fields[objective.spaceId];
      const difficulty = side?.difficulty ?? 0;
      if (!side || side.flagOwnerId || difficulty <= 0 || difficulty > SIDE_FIGHT_MAX_DIFFICULTY ||
          isPremiumEconomyField(side) || fieldCreatureBankId(side) || isBankStyleGuardLocation(side.location) ||
          isTeleportObjectGuardLocation(side.location) || side.unlimitedCombatRounds ||
          repeatsFailedFight(state, hero.controllerId, side.spaceId)) return false;
      const walk = distanceFromHeroTo(state, hero, objective.spaceId);
      const sideReserve = premiumCombatMovementReserve(state, hero, side);
      if (walk === undefined || walk + sideReserve > movement) return false;
      // From the side field, next turn's fresh movement must still open the
      // premium fight with its full combat reserve.
      const fromSide = distanceFromHeroTo(state, { ...hero, spaceId: objective.spaceId }, primary.spaceId, true);
      return fromSide !== undefined && fromSide + reserve <= nextMovement &&
        sideFightSafe(state, hero, side, sideReserve);
    }).sort((a, b) =>
      (distanceFromHeroTo(state, hero, a.spaceId) ?? Infinity) -
      (distanceFromHeroTo(state, hero, b.spaceId) ?? Infinity) ||
      a.spaceId.localeCompare(b.spaceId),
    ) : [];
    // A side fight that pays experience comes first, then a free pickup, then
    // a loot-only side fight.
    const experience = sideFights.find(objective =>
      (state.adventure?.fields[objective.spaceId]?.difficulty ?? 0) >= hero.level);
    const sideFight = experience ?? (pickups[0] ? undefined : sideFights[0]);
    if (sideFight) {
      if (action.to === sideFight.spaceId) {
        return { score: 942, policy: "map.premium-side-fight-before-next-turn" };
      }
      const destination = state.adventure?.fields[action.to];
      const sideDistance = objectiveDistanceField(state, hero, [sideFight]);
      // map-policy returns this score without its ordinary safety read, so the
      // walk step carries the pickup step's checks: never onto an enemy hero
      // (a PvP attack) or an enemy-held non-flaggable field. Every step must
      // also keep next turn's premium attack in range — a step that does not
      // drops out of this branch next decision and the approach walks back,
      // bouncing between the two until the movement is spent.
      const enemyThere = Object.values(state.heroes).some(other =>
        other.spaceId === action.to && !playersAreAllied(state, other.controllerId, hero.controllerId));
      if (destination && !isFieldGuarded(destination) && !enemyThere &&
          (!destination.flagOwnerId || playersAreAllied(state, destination.flagOwnerId, hero.controllerId) ||
            locationDefinitions[destination.location]?.category === "flaggable") &&
          to + reserve <= nextMovement &&
          (sideDistance.get(action.to) ?? Infinity) < (sideDistance.get(hero.spaceId) ?? Infinity)) {
        return { score: 940, policy: "map.premium-side-fight-before-next-turn" };
      }
    } else if (pickups[0]) {
      const pickupDistance = objectiveDistanceField(state, hero, [pickups[0]]);
      if ((pickupDistance.get(action.to) ?? Infinity) <
          (pickupDistance.get(hero.spaceId) ?? Infinity)) {
        return { score: 940, policy: "map.premium-pickup-before-next-turn" };
      }
    }
  }

  // Ordinary safe corridor steps only; existing scoring still handles guards,
  // enemy occupants and gate mechanics. The caller checks that safety score.
  if (to < here) return { score: 931 + Math.max(0, 8 - to), policy: "map.premium-approach" };
  // Do not let a fallback home/exploration move spend the reserved attack
  // turn or reverse this route. Safe, budgeted pickups were handled above.
  // The clamp exists for the PREMIUM income commitment only: an ordinary-mine
  // primary keeps normal scoring (free-pickup scoops stay collectable), and a
  // zero-distance stand (gate-slip re-entry, where no step can shorten the
  // route) must fall through so the guard-reentry setup score can win.
  if (here === 0 || (!isPremiumEconomyField(field) && !isOpeningFarSweepField(state, hero.controllerId, field))) return null;
  return { score: 200, policy: "map.premium-keep-commitment" };
}
