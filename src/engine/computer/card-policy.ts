import { cardLibrary } from "@/data/cards/library";
import type {
  CardDefinition,
  CardPlayMode,
  EffectDefinition,
  GameAction,
  GameState,
  TargetRef,
} from "../state";
import type { ComputerActionScore } from "./map-policy";
import { unitRemainingHealth, unitThreatValue } from "./score";
import type { ComputerObservation } from "./types";

/**
 * Scores PLAY_CARD / CAST_SPELL / PLAY_REACTION / USE_ACTIVE_EFFECT from the
 * printed effect type and PUBLIC combat/map state. Never reads an opponent's
 * hand or deck — card definitions are shared data, and targets come only from
 * the offered legal action (already validated by getLegalActions).
 *
 * Score bands (must stay consistent with policy foundation scores):
 *   - lethal-save / cancel-spell reactions: 1_060–1_180  (above PASS_REACTION 1_050)
 *   - attack/defense stat reactions that matter: 1_060–1_140
 *   - combat damage spells / strong combat cards: 640–860  (compete with attacks)
 *   - combat buffs / unit abilities via cards: 600–780
 *   - map economy / search / movement cards: 520–700  (below recruit/build, above end-turn)
 *   - inert / wasteful plays: below END_TURN (300) so they are never preferred
 *
 * Only already-legal actions are scored; an approximation error can never
 * produce an illegal move.
 */

// --- effect family tables ----------------------------------------------------

const COMBAT_DAMAGE_EFFECTS = new Set<EffectDefinition["type"]>([
  "DEAL_DAMAGE",
  "AREA_DAMAGE_ADJACENT",
  "AREA_DAMAGE_ALL_ADJACENT",
  "AREA_DAMAGE_PICK_ADJACENT",
  "CHAIN_LIGHTNING",
  "INFERNO",
  "SLAYER_ATTACK",
  "DAMAGE_LOWEST_INITIATIVE_ENEMY",
  "DAMAGE_ENEMY_UNITS_BY_GRADE",
  "DAMAGE_CHOSEN_ENEMIES",
  "DAMAGE_BATTLEFIELD_LINE",
  "DISCARD_WAR_MACHINE_DAMAGE",
  "EARTHQUAKE",
  "SIEGE_DEMOLISH",
  "BALLISTICS_BOMBARD",
  "ARTILLERY_BALLISTA_VOLLEY",
]);

const COMBAT_BUFF_EFFECTS = new Set<EffectDefinition["type"]>([
  "CREATE_ATTACK_BUFF",
  "CREATE_VARIANT_ATTACK_BUFF",
  "CREATE_DEFENSE_BUFF",
  "CREATE_INITIATIVE_BUFF",
  "CREATE_FIRE_SHIELD",
  "CREATE_SPELL_WARD",
  "CREATE_SPELL_IMMUNITY",
  "CREATE_ATTACK_DIE_REROLL",
  "ADD_UNIT_MAX_HEALTH",
  "HEAL_DAMAGE",
  "HEAL_DAMAGE_AND_REMOVE_EFFECTS",
  "GRANT_DEFENSE_TOKENS",
  "STONE_SKIN_AURA",
  "CLEAR_RETALIATION",
  "IGNORE_ATTACK_DIE",
  "IGNORE_ATTACK_DIE_RESULT",
  "IGNORE_DEFENSE",
  "ACTIVATE_RANGED_UNIT",
  "FIRST_AID_TENT_VOLLEY",
  "DOUBLE_FIRST_AID_TENT",
  "CLONE_UNIT",
  "SUMMON_ELEMENTAL",
  "GRANT_ELEMENTAL_DAMAGE",
  "TOGGLE_RETALIATION_MARKER",
  "REDUCE_RETALIATION_DAMAGE",
]);

const COMBAT_DEBUFF_EFFECTS = new Set<EffectDefinition["type"]>([
  "PLACE_PARALYSIS",
  "PLACE_WEAKNESS_TOKEN",
  "SKIP_ACTIVATION",
  "FORGETFULNESS",
  "BERSERK",
  "DISPEL_EFFECTS",
  "DISRUPTING_RAY",
  "BLOCK_ENEMY_SURRENDER",
  "FORCE_ATTACK_ROLL",
  "PLACE_FORCE_FIELD",
  "PLACE_FIRE_WALL",
  "PLACE_FIRE_WALL_FIXED",
  "PLACE_HIDDEN_TOKENS",
  "TELEPORT_UNIT",
  "MOVE_UNIT_ADJACENT",
  "REMOVE_OBSTACLE",
]);

const SAVE_EFFECTS = new Set<EffectDefinition["type"]>([
  "CANCEL_LETHAL_ATTACK",
  "CANCEL_SPELL",
  "NEGATE_ATTACK",
  "REDIRECT_SPELL",
  "INTERFERE_SPELL",
]);

const MAP_ECONOMY_EFFECTS = new Set<EffectDefinition["type"]>([
  "GAIN_RESOURCES",
  "DRAW_CARDS",
  "DRAW_NEUTRAL_RECRUIT_OFFER",
  "RESOURCE_FORTUNE_PLAY",
  "GAIN_RECRUIT_DISCOUNT",
  "GAIN_EXPERT_USE",
  "GAIN_WAR_MACHINE",
  "GAIN_RUNES",
  "GAIN_STARTING_RUNES",
  "GAIN_MORALE",
  "ADVANCE_EXPERIENCE",
  "DIPLOMACY_RECRUIT",
  "DIPLOMACY_SKIP_COMBAT",
  "CONVERT_ARMY_UNIT",
  "BORROW_NEUTRAL_UNIT",
  "NECROMANCY_REINFORCE",
]);

const MAP_SEARCH_EFFECTS = new Set<EffectDefinition["type"]>([
  "CARD_DECK_SEARCH",
  "REMOVE_HAND_CARD_THEN_SEARCH",
  "SEARCH_DECK_THEN_RESHUFFLE",
  "DECK_DIG_KEEP_ONE",
  "DECK_DIG_KEEP_MATCHING",
  "DRAW_TOP_ARTIFACT",
  "EAGLE_EYE_DIG",
  "TAKE_FROM_DISCARD",
  "VISIONS_SCRY",
  "PANDORA_VISIT",
  "PANDORA_SCRY",
  "PANDORA_SILVER_REFRESH",
  "TARNUM_OVERLIMIT_SEARCH",
  "CAST_FROM_SPELL_DISCARD",
  "SCHOLAR_EMPOWER_SWAP",
  "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD",
]);

const MAP_MOVEMENT_EFFECTS = new Set<EffectDefinition["type"]>([
  "GAIN_HERO_MOVEMENT",
  "TELEPORT_HERO_TO_TOWN",
  "DIMENSION_DOOR",
  "VIEW_EARTH",
  "DISCOVER_TILE_CARD",
  "CONTINUE_NEUTRAL_FREE",
]);

const STAT_COMBAT_EFFECTS = new Set<EffectDefinition["type"]>([
  "ADD_COMBAT_STAT",
  "ADD_SPELL_POWER",
  "SET_SPELL_POWER_MAX",
  "TRIPLE_ATTACK_DIE",
  "RECALL_SPELL",
]);

function primaryEffect(
  card: CardDefinition,
  optionIndex?: number,
): EffectDefinition | null {
  if (card.effect.type === "CHOOSE_ONE") {
    const option = card.effect.options[optionIndex ?? 0];
    return option?.effect ?? null;
  }
  return card.effect;
}

function combatUnitFromTarget(
  observation: ComputerObservation,
  target: TargetRef | undefined,
) {
  if (!target || target.type !== "unit") return null;
  return observation.state.combat?.units[target.unitId] ?? null;
}

/**
 * Value of keeping/playing a card type for search/discard ranking. Higher =
 * more worth holding. Public card definitions only.
 */
export function cardKeepValue(cardId: string): number {
  const card = cardLibrary[cardId];
  if (!card || card.implementationStatus !== "implemented") return 0;
  let value = 10;
  switch (card.kind) {
    case "artifact":
      value +=
        card.artifactTier === "relic"
          ? 80
          : card.artifactTier === "major"
            ? 55
            : 35;
      break;
    case "spell":
      value += card.spellLevel === "expert" ? 45 : 30;
      break;
    case "ability":
      value += 28;
      break;
    case "statistic":
      value += 22;
      break;
    case "hero-specialty":
      value += 40;
      break;
    case "war-machine":
      value += 25;
      break;
    default:
      value += 18;
      break;
  }
  if (card.permanent) value += 12;
  if (SAVE_EFFECTS.has(card.effect.type)) value += 20;
  if (COMBAT_DAMAGE_EFFECTS.has(card.effect.type)) value += 10;
  if (MAP_ECONOMY_EFFECTS.has(card.effect.type)) value += 8;
  return value;
}

function modeBonus(mode: CardPlayMode | undefined): number {
  return mode === "expert" ? 8 : 0;
}

function scoreDamageEffect(
  observation: ComputerObservation,
  target: TargetRef | undefined,
  base: number,
): number {
  const defender = combatUnitFromTarget(observation, target);
  if (!defender) {
    // Untargeted area damage still useful in combat.
    return base + 20;
  }
  if (defender.controllerId === observation.playerId) {
    // Never prefer self-damage.
    return 200;
  }
  const threat = unitThreatValue(defender);
  // Approximate with mid Power so we still rank targets without reading the
  // cast's exact power ladder (legal-actions already gated the cast).
  const remaining = unitRemainingHealth(defender);
  const damage = Math.max(1, Math.min(remaining, Math.max(1, 4 - defender.defense + 2)));
  let quality = Math.min(60, threat) + Math.round((damage / Math.max(1, remaining)) * 40);
  if (damage >= remaining) quality += 50;
  return Math.min(860, base + quality);
}

function scoreBuffTarget(
  observation: ComputerObservation,
  target: TargetRef | undefined,
  base: number,
): number {
  const unit = combatUnitFromTarget(observation, target);
  if (!unit) return base + 10;
  if (unit.controllerId !== observation.playerId) {
    // Debuff-shaped buffs (e.g. Slow is CREATE_INITIATIVE_BUFF negative) still
    // land on enemies via legal targets — reward threat.
    return base + Math.min(40, Math.round(unitThreatValue(unit) / 3));
  }
  return base + Math.min(35, Math.round(unitThreatValue(unit) / 4));
}

function scoreStatReaction(
  observation: ComputerObservation,
  card: CardDefinition,
  mode: CardPlayMode | undefined,
  effect: EffectDefinition,
): number {
  // Attack/Defense statistic cards and similar combat-stat reactions. High
  // value because they only appear when legal (an attack window is open).
  const amount =
    mode === "expert"
      ? ("expertAmount" in effect ? (effect.expertAmount as number | undefined) : undefined) ??
        ("amount" in effect ? (effect.amount as number) : 1)
      : ("amount" in effect ? (effect.amount as number) : 1);

  if (effect.type === "ADD_SPELL_POWER" || card.statisticType === "power") {
    // Power boost mid-spell: always take when offered (legal only in the window).
    return 1_100 + amount * 10 + modeBonus(mode);
  }
  if (effect.type === "RECALL_SPELL") {
    return 1_080 + modeBonus(mode);
  }
  if (effect.type === "ADD_COMBAT_STAT") {
    const stat = effect.stat;
    // Attack window for self / defense window for opponent — both are offered
    // only when useful. Prefer expert when crowns allow (already gated).
    if (stat === "attack" || stat === "defense") {
      return 1_090 + amount * 12 + modeBonus(mode);
    }
    return 1_070 + amount * 8 + modeBonus(mode);
  }
  if (effect.type === "TRIPLE_ATTACK_DIE") {
    return 1_100 + modeBonus(mode);
  }
  return 1_070 + modeBonus(mode);
}

/**
 * How valuable the unit currently under lethal threat is (reaction window /
 * stack target when public). Saves a high-threat ally first; still always
 * above PASS so a legal save is never skipped for a worthless body when it is
 * the only offered save.
 */
function threatenedAllyBonus(observation: ComputerObservation): number {
  const window = observation.state.reactionWindow;
  const combat = observation.state.combat;
  if (!window || !combat) return 0;
  // Attack windows name the defender on the stack item / window context when
  // present; fall back to scanning own living units for the most damaged one.
  const stack = observation.state.stack;
  const top = stack?.[stack.length - 1];
  let unitId: string | undefined;
  if (top && "defenderId" in top.action) {
    unitId = (top.action as { defenderId?: string }).defenderId;
  }
  if (!unitId && "targetUnitId" in (window as object)) {
    unitId = (window as { targetUnitId?: string }).targetUnitId;
  }
  const unit = unitId ? combat.units[unitId] : null;
  if (unit && unit.controllerId === observation.playerId) {
    return Math.min(25, Math.round(unitThreatValue(unit) / 3));
  }
  return 0;
}

function scoreSaveReaction(
  observation: ComputerObservation,
  effect: EffectDefinition,
  mode: CardPlayMode | undefined,
): number {
  const ally = threatenedAllyBonus(observation);
  // Highest band: above PASS_REACTION (1_050). Prefer cancel-lethal slightly
  // over cancel-spell (a unit death is permanent this combat). Always play a
  // legal save — legal-actions only offers it when the situation applies.
  if (effect.type === "CANCEL_LETHAL_ATTACK") {
    return 1_160 + modeBonus(mode) + ally;
  }
  if (effect.type === "NEGATE_ATTACK") {
    return 1_150 + modeBonus(mode) + ally;
  }
  if (effect.type === "CANCEL_SPELL" || effect.type === "REDIRECT_SPELL") {
    return 1_140 + modeBonus(mode);
  }
  if (effect.type === "INTERFERE_SPELL") {
    return 1_120 + modeBonus(mode);
  }
  return 1_110 + modeBonus(mode);
}

function scoreMapEconomy(effect: EffectDefinition, base: number): number {
  if (effect.type === "GAIN_RESOURCES") {
    const gain = effect.gain ?? {};
    const gold = gain.gold ?? 0;
    const mats = gain.buildingMaterials ?? 0;
    const vals = gain.valuables ?? 0;
    return base + gold * 3 + mats * 4 + vals * 8;
  }
  if (effect.type === "DRAW_CARDS") {
    return base + 15;
  }
  if (effect.type === "ADVANCE_EXPERIENCE") {
    return base + 25;
  }
  if (effect.type === "DIPLOMACY_SKIP_COMBAT" || effect.type === "DIPLOMACY_RECRUIT") {
    return base + 30;
  }
  return base + 10;
}

function scoreMapMovement(
  observation: ComputerObservation,
  effect: EffectDefinition,
  base: number,
): number {
  const state = observation.state as unknown as GameState;
  const hero = Object.values(state.heroes ?? {}).find(
    (h) => h.controllerId === observation.playerId && h.kind === "main",
  );
  const mp = hero?.movementPoints ?? 0;
  // Movement cards matter most when the hero is out (or nearly out) of MP but
  // still has work to do — never dump them while flush with movement.
  if (effect.type === "GAIN_HERO_MOVEMENT") {
    if (mp >= 3) return 280; // keep for later
    if (mp === 0) return base + 40;
    return base + 20;
  }
  if (effect.type === "DIMENSION_DOOR" || effect.type === "TELEPORT_HERO_TO_TOWN") {
    return base + 25;
  }
  if (effect.type === "VIEW_EARTH") {
    return base + 15;
  }
  if (effect.type === "CONTINUE_NEUTRAL_FREE") {
    // Free extra neutral round — take when offered.
    return 720;
  }
  return base;
}

function scoreEffect(
  observation: ComputerObservation,
  card: CardDefinition,
  mode: CardPlayMode | undefined,
  optionIndex: number | undefined,
  target: TargetRef | undefined,
  isReaction: boolean,
): number {
  const effect = primaryEffect(card, optionIndex);
  if (!effect) return 250;

  if (SAVE_EFFECTS.has(effect.type)) {
    return scoreSaveReaction(observation, effect, mode);
  }

  if (STAT_COMBAT_EFFECTS.has(effect.type) && isReaction) {
    return scoreStatReaction(observation, card, mode, effect);
  }

  if (COMBAT_DAMAGE_EFFECTS.has(effect.type)) {
    return scoreDamageEffect(observation, target, 680 + modeBonus(mode));
  }

  if (COMBAT_BUFF_EFFECTS.has(effect.type)) {
    return scoreBuffTarget(observation, target, 660 + modeBonus(mode));
  }

  if (COMBAT_DEBUFF_EFFECTS.has(effect.type)) {
    return scoreBuffTarget(observation, target, 650 + modeBonus(mode));
  }

  if (effect.type === "ENTER_PLAY" || card.permanent) {
    // One permanent in play is valuable; only offered when legal.
    return 640 + modeBonus(mode);
  }

  if (STAT_COMBAT_EFFECTS.has(effect.type)) {
    // On-activation Offense/Armorer/Sorcery (draw-only or with stack).
    if (effect.type === "ADD_SPELL_POWER") {
      return 700 + modeBonus(mode);
    }
    if (effect.type === "ADD_COMBAT_STAT") {
      return 690 + modeBonus(mode);
    }
    return 650 + modeBonus(mode);
  }

  if (MAP_MOVEMENT_EFFECTS.has(effect.type)) {
    return scoreMapMovement(observation, effect, 600);
  }

  if (MAP_SEARCH_EFFECTS.has(effect.type)) {
    return 610 + modeBonus(mode);
  }

  if (MAP_ECONOMY_EFFECTS.has(effect.type)) {
    return scoreMapEconomy(effect, 590 + modeBonus(mode));
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return 630 + modeBonus(mode);
  }

  if (effect.type === "TRANSFORM_UNIT") {
    return 720 + modeBonus(mode);
  }

  if (effect.type === "RANDOM_ENEMY_DISCARD" || effect.type === "ENEMY_MORALE_STRIP") {
    return 580;
  }

  // Unknown / residual implemented effects: mild positive on the map so they
  // can still fire when nothing better is available — but NEVER auto-play an
  // unrecognised reaction over PASS (1_050). Only the save/stat families above
  // deliberately outrank PASS; everything else waits for a better window.
  if (card.implementationStatus === "implemented") {
    return isReaction ? 900 : 520;
  }
  return 200;
}

/**
 * Discarding a spell for +1 Power is only legal in a Power-paying window.
 * NEVER burn a save / high-value combat card for +1 Power — keep those for
 * their printed effect. Prefer junk / low-keep spells so expert damage scales
 * without throwing away Resurrection / Implosion.
 */
function asPowerBoostScore(
  observation: ComputerObservation,
  cardId: string,
): number {
  void observation;
  const card = cardLibrary[cardId];
  if (!card) return 900;
  const effect = primaryEffect(card);
  if (effect && SAVE_EFFECTS.has(effect.type)) {
    // Well below PASS_REACTION (1_050) — never power-boost with a save.
    return 200;
  }
  if (effect && COMBAT_DAMAGE_EFFECTS.has(effect.type)) {
    // Keep real damage spells for casting; mild boost only as last resort.
    return 980;
  }
  const keep = cardKeepValue(cardId);
  // High-value artifacts/spells: do not discard for +1 Power (below PASS).
  if (keep >= 55) {
    return 940;
  }
  // Junk / low-value spells: take the +1 Power over PASS so the cast scales.
  return 1_095 - Math.min(30, Math.floor(keep / 2));
}

/**
 * Strategic score for card / spell / reaction plays. Returns null for actions
 * this module does not handle.
 */
export function scoreCardAction(
  observation: ComputerObservation,
  action: GameAction,
): ComputerActionScore | null {
  switch (action.type) {
    case "PLAY_CARD":
    case "CAST_SPELL":
    case "PLAY_REACTION": {
      const card = cardLibrary[action.cardId];
      if (!card) {
        return { score: 250, policy: "card.unknown" };
      }

      if (action.type === "PLAY_REACTION" && action.asPowerBoost) {
        return {
          score: asPowerBoostScore(observation, action.cardId),
          policy: "card.power-boost",
        };
      }

      const mode = "mode" in action ? action.mode : undefined;
      const optionIndex = "optionIndex" in action ? action.optionIndex : undefined;
      const target = "target" in action ? action.target : undefined;
      const isReaction = action.type === "PLAY_REACTION";
      let score = scoreEffect(
        observation,
        card,
        mode,
        optionIndex,
        target,
        isReaction,
      );

      // Expert mode (already crown-gated by legal-actions) is strictly better
      // for damage / buff ladders — small nudge so expert wins over basic twin.
      if (mode === "expert") {
        score += 12;
      }

      const policy =
        action.type === "CAST_SPELL"
          ? "card.cast-spell"
          : isReaction
            ? "card.play-reaction"
            : card.kind === "artifact"
              ? "card.play-artifact"
              : card.kind === "ability"
                ? "card.play-ability"
                : "card.play-card";

      return { score, policy };
    }
    case "PLAY_REACTIONS": {
      // Batch reaction path — score by the first play's card quality.
      const first = action.plays?.[0];
      if (!first) return { score: 250, policy: "card.batch-empty" };
      const card = cardLibrary[first.cardId];
      if (!card) return { score: 250, policy: "card.unknown" };
      const effect = primaryEffect(card, first.optionIndex);
      if (effect && SAVE_EFFECTS.has(effect.type)) {
        return {
          score: scoreSaveReaction(observation, effect, first.mode),
          policy: "card.batch-save",
        };
      }
      if (effect && STAT_COMBAT_EFFECTS.has(effect.type)) {
        return {
          score: scoreStatReaction(observation, card, first.mode, effect),
          policy: "card.batch-stat",
        };
      }
      return { score: 1_080, policy: "card.batch-reaction" };
    }
    case "USE_ACTIVE_EFFECT": {
      // Active effects (First Aid Tent heal, etc.) — positive when legal.
      return { score: 640, policy: "card.use-active-effect" };
    }
    case "SPEND_MORALE": {
      // Combat morale spends (bonus / remove-token) beat PASS; redraw is map/soft.
      if (action.benefit === "combat-bonus" || action.benefit === "remove-token") {
        return { score: 1_085, policy: "card.spend-morale-combat" };
      }
      if (action.benefit === "redraw") {
        return { score: 560, policy: "card.spend-morale-redraw" };
      }
      // "draw" — free card, good on map.
      return { score: 600, policy: "card.spend-morale-draw" };
    }
    case "USE_UNIT_RESURRECTION":
      // Archangel-style lethal save ability — always take over PASS.
      return { score: 1_170, policy: "card.unit-resurrection" };
    case "USE_COMMANDER_CAST_REACTION":
      // Shield / Stone Skin reaction — buff defense before the hit.
      return { score: 1_130, policy: "card.commander-defense-reaction" };
    default:
      return null;
  }
}
