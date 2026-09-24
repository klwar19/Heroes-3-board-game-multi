import { cardLibrary } from "@/data/cards/library";
import { balanceCardLibrary } from "../community-balance-cards";
import { chainBoltValue } from "./chain-planning";
import { coreFactionDefinitions } from "@/data/factions/core";
import { commanderCastTierIndex, commanderValuesMagicGrade } from "@/data/commanders";
import { commanderCastOf, commanderCastPower, commanderEnemyDamageAmount } from "../commanders";
import { farTileChoiceValue } from "./far-tile-policy";
import { evaluateUnitAbility, abilityDamageValue, abilityHealValue, activationUtilityValue } from "./unit-ability-value";
import { getEnchanterActivationAbility } from "../unit-abilities";
import type { CombatUnitState, GameAction, GameState, PendingChoice } from "../state";
import { isAdjacent } from "../battlefield";
import { cardHandValue, cardKeepValue, crownsAvailable, scholarRetrievalValue } from "./card-policy";
import {
  armyReadyForContestedFight,
  developmentResourceTargets,
  goldLadderValuablesReserve,
  resourceUrgency,
  valuablesStarved,
} from "./development";
import { adventureVictoryMode, isFieldGuarded, neutralRecruitCost } from "../adventure";
import { isCastASpellCard } from "../polish-spell-book";
import { neutralRecruitUtility, neutralTierMeanStrength, neutralUnitStrength } from "./recruit-value";
import { inlineLegionSavings, upcomingFight } from "./card-planning";
import {
  BANK_ENGAGE_RATIO,
  creatureBankStrength,
  playerArmyStrength,
} from "./army-strength";
import {
  collectMapObjectives,
  canBeatGuardedField,
  distanceFromHeroTo,
  fieldSuppliesResource,
  objectiveDistanceField,
  primaryMapObjective,
} from "./map-navigation";
import type { ComputerActionScore } from "./map-policy";
import {
  distanceToNearestEnemy,
  unitRemainingHealth,
  unitThreatValue,
} from "./score";
import type { ComputerObservation } from "./types";

/**
 * Scores mandatory decision actions (CHOOSE_OPTION, deck search keep, combat
 * discard, ability targets, die keep/reroll). The foundation already ranks these
 * above optional play (~1_100); this module orders OPTIONS within that band so
 * the computer keeps valuable cards, discards junk, and picks useful targets.
 *
 * Rules of thumb (plan §8.2):
 * - accept free positive results;
 * - decline optional harmful / expensive results;
 * - keep the highest-valued revealed card;
 * - discard the lowest-valued eligible card;
 * - never re-roll forever (prefer keep when a candidate is non-negative).
 *
 * Never parses option labels for rules — uses pendingChoice context payloads
 * and card definitions. Labels only as a last-resort "done/skip/decline" hint
 * when the context payload has no structured data (still never required for
 * legality — the option is already legal).
 */

const CHOICE_BASE = 1_100;
const CHOICE_BAND = 80; // options live in [CHOICE_BASE, CHOICE_BASE + CHOICE_BAND]

/** Bounded value of filling the actual next army/build reserve. Surplus is not
 * a bottleneck. Used for income and known-card acquisition, never hidden decks. */
function developmentGainValue(
  observation: ComputerObservation,
  gain: { gold?: number; buildingMaterials?: number; valuables?: number },
): number {
  const state = observation.state as unknown as GameState;
  const resources = state.players[observation.playerId]?.resources;
  const target = developmentResourceTargets(state, observation.playerId);
  let value = 0;
  for (const [resource, weight] of [["gold", 2], ["buildingMaterials", 7], ["valuables", 11]] as const) {
    value += Math.min(gain[resource] ?? 0, Math.max(0, target[resource] - (resources?.[resource] ?? 0))) * weight;
  }
  return Math.min(30, value);
}

/** Acquire for the current plan as well as printed quality. Combat searches
 * retain tactical card valuation; economy bonuses apply only on the map. */
function acquisitionValue(cardId: string, observation: ComputerObservation): number {
  const base = upcomingFight(observation) ? cardHandValue(cardId, observation) : cardKeepValue(cardId, observation);
  const card = cardLibrary[cardId];
  if (observation.state.round <= 5 && (cardId === "stat.power" || cardId === "stat.knowledge") &&
      !observation.state.players[observation.playerId]?.hand.includes(cardId)) return Math.max(base, 105);
  if (cardId === "spell.magic_arrow" && observation.state.players[observation.playerId] &&
      !observation.state.players[observation.playerId].hand.includes(cardId) &&
      !observation.state.players[observation.playerId].spellBook?.includes(cardId)) return base + 35;
  if (!card || observation.state.combat || card.implementationStatus !== "implemented") return base;
  const effects = card.effect.type === "CHOOSE_ONE"
    ? card.effect.options.map((option) => option.effect)
    : [card.effect];
  // Undead read (user 2026-09-18, live tutoring): a morale ability (Leadership)
  // is dead weight for a faction that IGNORES morale entirely — the engine's
  // changeMorale short-circuits on faction.ignoresMorale (Necropolis), so the
  // whole player never moves the token no matter the army. Don't grab/keep a
  // morale card over a genuinely useful one (Scouting) for such a seat. Only
  // penalise a PURELY-morale ability; a CHOOSE_ONE with a non-morale side keeps
  // its value through that side. The expert draw-2 rider is a wash here (it needs
  // the basic morale gain to have fired), so it does not rescue the pick.
  const factionId = observation.state.players[observation.playerId]?.factionId;
  const ignoresMorale = Boolean(factionId && coreFactionDefinitions[factionId]?.ignoresMorale);
  if (ignoresMorale && effects.length > 0 && effects.every((effect) => effect.type === "GAIN_MORALE")) {
    return Math.min(base, 8);
  }
  // Resource-income artifact read (user 2026-09-18, live tutoring): a MATERIAL or
  // valuables income permanent (Inexhaustible Cart of Ore = +1 building materials
  // each Resources round) is only worth grabbing while you still NEED that resource
  // to build — when it is already plentiful (e.g. you can buy the silver dwelling
  // easily), the recurring income is dead value and a combat artifact is the better
  // keep. GOLD is EXEMPT: gold is always useful, so a gold-income permanent keeps its
  // full value. Recurring income can fill up to ~3 rounds of the current shortfall.
  const income = card.permanentEffect?.resourceRoundGain;
  if (income && income.resource !== "gold") {
    const gain: { gold?: number; buildingMaterials?: number; valuables?: number } = {};
    gain[income.resource] = income.amount * 3;
    const need = developmentGainValue(observation, gain);
    // Credit a one-shot "crack for resources" side too (Cart of Ore: remove for +3).
    const crack = Math.max(0, ...effects.map((effect) =>
      effect.type === "GAIN_RESOURCES" && !("goldCost" in effect && effect.goldCost)
        ? developmentGainValue(observation, effect.gain ?? {}) : 0));
    return need > 0 ? base + need + 8 : Math.min(base, 40 + crack);
  }
  const bonus = Math.max(0, ...effects.map((effect) =>
    effect.type === "GAIN_RESOURCES" && !("goldCost" in effect && effect.goldCost)
      ? developmentGainValue(observation, effect.gain ?? {}) : 0,
  ));
  return base + bonus;
}

// Strictly increasing: clipping at 80 made distinct premium cards exact ties.
function acquisitionScore(value: number): number {
  return CHOICE_BASE + CHOICE_BAND * Math.max(0, value) / (80 + Math.max(0, value));
}

/**
 * True when PLAYING this card would (re)open a "take a card from your discard
 * pile" choice — i.e. its basic effect is TAKE_FROM_DISCARD (Scholar's basic
 * side). Taking such a card BACK from a discard-pick lets the AI replay it and
 * take it again — an infinite loop the runner's no-progress guard cannot catch
 * (each play → pick → take-it-back half-step flips phase/eventCounter, so the
 * fingerprint always "changes"). The discard-pick scorer must therefore never
 * PREFER retrieving one of these over any other card, or over declining.
 */
function reopensDiscardPick(cardId: string | undefined): boolean {
  if (!cardId) return false;
  const card = cardLibrary[cardId];
  if (!card?.effect) return false;
  if (card.effect.type === "TAKE_FROM_DISCARD") return true;
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.some(
      (option) => option.effect?.type === "TAKE_FROM_DISCARD",
    );
  }
  return false;
}

function pendingChoiceOf(
  observation: ComputerObservation,
): PendingChoice | null {
  return observation.state.pendingChoice ?? null;
}

/** True when the option text looks like a decline / done / skip exit. */
function looksLikeDecline(label: string | undefined): boolean {
  if (!label) return false;
  const text = label.toLowerCase();
  return (
    text.includes("done") ||
    text.includes("skip") ||
    text.includes("decline") ||
    text.includes("cancel") ||
    text.includes("keep") && text.includes("none") ||
    text === "none" ||
    text.startsWith("do not") ||
    text.startsWith("don't") ||
    text.includes("fight normally") ||
    text.includes("stay")
  );
}

function optionLabel(
  choice: PendingChoice | null,
  optionIndex: number,
): string | undefined {
  if (!choice || choice.type !== "OPTION_CHOICE") return undefined;
  return choice.options[optionIndex]?.label;
}

/**
 * City Hall / income: prefer gold when broke, materials when mid-build, free
 * reinforce when army is thin. Structured cityHall payload when present.
 */
function scoreCityHallOption(
  observation: ComputerObservation,
  optionIndex: number,
): number {
  const choice = pendingChoiceOf(observation);
  if (!choice || choice.type !== "OPTION_CHOICE" || !choice.cityHall) {
    return CHOICE_BASE + (optionIndex === 0 ? 10 : 0);
  }
  const option = choice.cityHall.options[optionIndex];
  if (!option) return CHOICE_BASE;
  const player = observation.state.players[observation.playerId];
  const gold = player?.resources.gold ?? 0;
  const army = player?.army.length ?? 0;
  let score = CHOICE_BASE;
  if (option.reinforceBronzeFree && army < 5) score += 40;
  if (option.freeRecruitOrReinforceUnitDefId) {
    const armadillos = player?.army.find((unit) => unit.unitDefId === option.freeRecruitOrReinforceUnitDefId);
    score += !armadillos ? (army < 5 ? 42 : 25) : armadillos.side === "few" ? 35 : 0;
  }
  if (option.gold) {
    score += option.gold * 2;
    if (gold < 10) score += 15;
  }
  if (option.buildingMaterials) score += option.buildingMaterials * 3;
  if (option.valuables) {
    score += option.valuables * 6;
    // Dungeon's hall pays 1 valuable instead of 5 gold: when valuables are
    // the Gold ladder's bottleneck (gold covered, valuables rounds away) the
    // valuable is worth far more than the gold (USER RULING 2026-09-16).
    if (valuablesStarved(observation.state as unknown as GameState, observation.playerId)) score += 30;
  }
  score += developmentGainValue(observation, option);
  if (option.drawCards) score += option.drawCards * 8;
  if (option.movement) score += option.movement * 5;
  if (option.experience) score += 20;
  if (option.searchSpellDeck) score += 12;
  if (option.tradingPost) score += 5;
  if (option.runesNextCombats) score += option.runesNextCombats * 6;
  // Forge City Hall: 2 random enemy cards beat 3 gold unless broke (the gold
  // arm's +15 broke bonus above flips it back). Bigger hands lose more value.
  if (option.opponentDiscards && option.opponentDiscardTargetId) {
    const hand = observation.state.players[option.opponentDiscardTargetId]?.hand.length ?? 0;
    score += Math.min(option.opponentDiscards, hand) * 5 + (hand >= 4 ? 4 : 0);
  }
  // Paying an artifact from hand is a real cost — only take when desperate.
  if (option.removeArtifactFromHand) score -= gold > 15 ? 30 : 5;
  return score;
}

/**
 * Deck search keep: highest cardKeepValue wins. Tarnum remove is only preferred
 * when the card is weak (not usually).
 */
/**
 * True when no combat can happen for this seat THIS turn — no active fight, and
 * no guarded field or enemy hero the hero could reach and engage with its CURRENT
 * movement. Crowns (expert uses) are a per-round budget that refreshes next turn,
 * so a crown held past a turn where nothing can spend it is simply lost. This uses
 * current movement (not the 2-turn preparation horizon of `upcomingFight`): a fight
 * next turn arrives with its OWN fresh crown, so it is no reason to hoard this one.
 * (User 2026-09-18, live tutoring: "look at the hand and the board — statistic cards
 * only pay off in a battle; if no battle can happen this turn even with a move left,
 * don't save the crown, spend it on the search.")
 */
function noCombatReachableThisTurn(observation: ComputerObservation): boolean {
  const state = observation.state as unknown as GameState;
  if (state.combat && !state.combat.outcome) return false;
  if (!state.adventure) return true;
  const ownHeroes = Object.values(state.heroes ?? {}).filter(
    (hero) => hero.controllerId === observation.playerId && hero.spaceId);
  for (const hero of ownHeroes) {
    const mp = hero.movementPoints ?? 0;
    if (mp <= 0) continue; // cannot move to any fight this turn
    // A guarded neutral field the hero can reach and beat this turn.
    for (const field of Object.values(state.adventure.fields)) {
      if (!isFieldGuarded(field) || field.flagOwnerId === observation.playerId) continue;
      if ((distanceFromHeroTo(state, hero, field.spaceId, true) ?? Infinity) <= mp &&
          canBeatGuardedField(state, hero, field)) {
        return false;
      }
    }
    // An enemy hero within reach this turn (PvP contact).
    for (const other of Object.values(state.heroes ?? {})) {
      if (!other.spaceId || other.controllerId === observation.playerId ||
          other.controllerId === "neutrals") continue;
      if ((distanceFromHeroTo(state, hero, other.spaceId, true) ?? Infinity) <= mp) {
        return false;
      }
    }
  }
  return true;
}

function scoreDeckSearchKeep(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "RESOLVE_DECK_SEARCH" }>,
): number {
  const choice = pendingChoiceOf(observation);
  if (!choice || choice.type !== "DECK_SEARCH") {
    return CHOICE_BASE;
  }
  if (action.pick?.kind === "revealed") {
    const cardId = choice.revealedCardIds[action.pick.index];
    if (!cardId) return CHOICE_BASE;
    const value = acquisitionValue(cardId, observation);
    if (action.pick.remove) {
      // Removing is rarely better than taking — only for trash.
      return CHOICE_BASE + Math.max(0, 15 - value);
    }
    return acquisitionScore(value);
  }
  return CHOICE_BASE;
}

/** Combat discard (Magi Power Drain): dump the lowest-value Power card. */
function scoreCombatDiscard(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "RESOLVE_COMBAT_DISCARD" }>,
): number {
  if (action.cardId === "random") {
    return CHOICE_BASE + 5;
  }
  // Prefer discarding the LEAST valuable named card (invert keep value).
  const value = cardHandValue(action.cardId, observation);
  return CHOICE_BASE + Math.max(0, 50 - Math.min(50, value));
}

/**
 * Ability target / unit pick: hit the highest-threat living enemy; heal the
 * most wounded ally. Damage-style picks (Magog splash, Lich Death Cloud, …)
 * may legally hit friendlies — those score LOW so the AI prefers enemies, but
 * still pick an ally when that is the only candidate (mandatory friendly fire).
 */
/**
 * Damage an `enemy-damage` commander cast (Forge Arc Discharge, Belfast Royal
 * Salvo) deals at the caster's current Power tier — so its target pick prefers
 * the enemy it can REMOVE now. 0 for every other cast kind.
 */
function commanderCastEnemyDamage(
  observation: ComputerObservation,
  sourceUnitId: string | null | undefined,
  abilityId: string | null | undefined,
  target: CombatUnitState,
): number {
  const state = observation.state as unknown as GameState;
  const source = sourceUnitId ? state.combat?.units[sourceUnitId] : undefined;
  const cast = source ? commanderCastOf(source, abilityId ?? undefined) : null;
  if (!source || cast?.effect.kind !== "enemy-damage") return 0;
  return commanderEnemyDamageAmount(source, target, cast.effect.damageByPower,
    commanderCastTierIndex(commanderCastPower(state, source)));
}

function scoreAbilityTarget(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "CHOOSE_ABILITY_TARGET" }>,
): number {
  const combat = observation.state.combat;
  if (!combat) return CHOICE_BASE;
  const unit = combat.units[action.targetUnitId];
  if (!unit) return CHOICE_BASE;
  const remaining = unitRemainingHealth(unit);
  if (remaining <= 0) return CHOICE_BASE - 50;

  const choice = pendingChoiceOf(observation);
  const isCatapult =
    choice?.type === "ABILITY_TARGET_CHOICE" &&
    choice.kind === "war-machine" &&
    choice.abilityId === "war_machine.catapult";
  if (choice?.type === "ABILITY_TARGET_CHOICE" && choice.kind === "chain-lightning") {
    const state = observation.state as unknown as GameState;
    const card = balanceCardLibrary(state, cardLibrary)[choice.abilityId ?? ""];
    if (card) return CHOICE_BASE + chainBoltValue(state, observation.playerId, card, unit, choice.amount ?? 0);
  }
  if (choice?.type === "ABILITY_TARGET_CHOICE" && choice.sourceUnitId) {
    const source = combat.units[choice.sourceUnitId];
    const state = observation.state as unknown as GameState;
    if (source && choice.kind === "sacrifice-transfer" &&
        choice.abilityId === "specialty.verdish.4") {
      const moved = Math.min(3, source.damage, remaining);
      return CHOICE_BASE + moved * 18 - Math.min(100, unitThreatValue(unit)) -
        (moved >= remaining ? 45 : 0);
    }
    if (source && (choice.kind === "couatl-invulnerability" || choice.kind === "automaton-cube")) {
      const value = activationUtilityValue(state, source, choice.kind);
      return value > 0 ? CHOICE_BASE + 10 + value * 8 : CHOICE_BASE - 60;
    }
    if (source && choice.kind === "place-token" && choice.abilityId) {
      const result = evaluateUnitAbility(state, { type: "USE_UNIT_ABILITY", playerId: source.controllerId,
        unitId: source.id, abilityId: choice.abilityId, target: { type: "unit", unitId: unit.id } });
      return result && result.value > 0 ? CHOICE_BASE + 10 + result.value * 8 : CHOICE_BASE - 60;
    }
    // Equal non-lethal chip damage must still prefer the bigger threat (the
    // ranking the shared threat-based scorer below always applied).
    const threatTiebreak = Math.min(30, Math.round(unitThreatValue(unit) / 4));
    if (source && choice.kind === "dreadnought-splash") {
      const value = abilityDamageValue(unit, choice.chainRemainingDamages?.[0] ?? 0);
      return source.controllerId === unit.controllerId || value <= 0 ? CHOICE_BASE - 60
        : CHOICE_BASE + 10 + value * 8 + threatTiebreak;
    }
    if (source && (choice.kind === "flat-damage" || choice.kind === "commander-overflow-zap" || choice.kind === "commander-artifact-activation-damage" || choice.kind === "commander-artifact-recoil")) {
      const value = abilityDamageValue(unit, choice.amount ?? 1);
      return source.controllerId === unit.controllerId ? CHOICE_BASE - 40 - value * 8 :
        value > 0 ? CHOICE_BASE + 10 + value * 8 + threatTiebreak : CHOICE_BASE - 20;
    }
    if (source && choice.kind === "enchanter-activation") {
      return CHOICE_BASE + 10 + abilityHealValue(state, unit, getEnchanterActivationAbility(source)?.healAmount ?? 0) * 8;
    }
    if (source && choice.kind === "commander-soul-link") {
      // Protect the ally whose survival matters most; the commander will absorb
      // only one hit each round, so link value grows with the ally's threat and
      // with how close it is to losing its current side.
      return source.controllerId === unit.controllerId
        ? CHOICE_BASE + 20 + Math.min(65, Math.round(unitThreatValue(unit) / 2)) + Math.max(0, 8 - remaining) * 3
        : CHOICE_BASE - 80;
    }
  }
  const isDamagePick =
    choice?.type === "ABILITY_TARGET_CHOICE" &&
    (choice.kind === "flat-damage" ||
      choice.kind === "second-attack" ||
      choice.kind === "spell-splash" ||
      choice.kind === "ballistics-splash" ||
      choice.kind === "faerie-damage" ||
      choice.kind === "commander-artifact-activation-damage" ||
      choice.kind === "commander-artifact-recoil" ||
      choice.kind === "area-pick" ||
      choice.kind === "chain-lightning" ||
      choice.kind === "dreadnought-splash" ||
      // War-machine choices are not uniformly offensive: First Aid Tent heals.
      // Catapult specifically damages either side, so never score an allied
      // target as a desirable heal/buff.
      isCatapult);

  // On the FIRST Catapult pick, score the best adjacent second hit too. This
  // prevents a tempting high-threat enemy from being selected when its only
  // neighbour is the computer's own stack and an enemy+enemy pair is available.
  const catapultPairAdjustment =
    isCatapult && !combat.warMachineRound?.firstTargetUnitId
      ? (() => {
          const adjustments = choice.candidateUnitIds
            .filter((candidateId) => candidateId !== action.targetUnitId)
            .map((candidateId) => combat.units[candidateId])
            .filter((candidate): candidate is NonNullable<typeof candidate> =>
              Boolean(candidate && isAdjacent(candidate.position, unit.position))
            )
            .map((candidate) => (candidate.controllerId === observation.playerId ? -100 : 100));
          return adjustments.length > 0 ? Math.max(...adjustments) : 0;
        })()
      : 0;

  // Dark Mullich Overclock I / IV played at the beginning of the combat: the
  // pick is the friendly unit to buff — the biggest threat, and a GROUND unit
  // for Overclock I (its effect doubles there).
  if (
    choice?.type === "ABILITY_TARGET_CHOICE" &&
    choice.kind === "war-machine" &&
    choice.abilityId?.startsWith("specialty.dark_mullich.")
  ) {
    if (unit.controllerId !== observation.playerId) return CHOICE_BASE - 80;
    const doubles = choice.abilityId === "specialty.dark_mullich.1" && unit.type === "ground";
    return CHOICE_BASE + 20 + Math.min(60, Math.round(unitThreatValue(unit) / 2)) + (doubles ? 25 : 0);
  }

  if (unit.controllerId === observation.playerId) {
    if (isDamagePick) {
      // Friendly fire: legal (Magog/Lich) but never preferred over an enemy.
      // Prefer the weakest ally if forced — spare the stronger stack.
      return CHOICE_BASE - 40 - remaining + catapultPairAdjustment - (isCatapult ? 200 : 0);
    }
    // Friendly target (heal / buff): prefer more wounded, then higher threat.
    const missing = unit.maxHealth - remaining;
    return CHOICE_BASE + missing * 8 + Math.min(20, Math.round(unitThreatValue(unit) / 5)) + catapultPairAdjustment;
  }
  // Enemy: highest threat, with a decisive removal bonus when this particular
  // follow-up can finish it. Ranked-PvP lesson v1: a Lich/flat-damage tie should
  // spend the follow-up on the wounded valuable body it can remove now, rather
  // than merely choosing the largest fresh stat block.
  const abilityDamage =
    choice?.type === "ABILITY_TARGET_CHOICE"
      ? choice.kind === "second-attack"
        ? Math.max(0, (choice.baseAttack ?? 0) - unit.defense)
        : choice.kind === "flat-damage" ||
            choice.kind === "faerie-damage" ||
            choice.kind === "commander-artifact-activation-damage" ||
            choice.kind === "commander-artifact-recoil" ||
            choice.kind === "spell-splash" ||
            choice.kind === "ballistics-splash" ||
            choice.kind === "area-pick" ||
            choice.kind === "dreadnought-splash" ||
            // Forge Lightning Generator: flat damage at any enemy.
            (choice.kind === "war-machine" && choice.abilityId === "war_machine.lightning_generator")
          ? (choice.amount ?? 0)
          : choice.kind === "commander-cast"
            ? commanderCastEnemyDamage(observation, choice.sourceUnitId, choice.abilityId, unit)
            : 0
      : 0;
  const removesNow = abilityDamage > 0 && abilityDamage >= remaining;
  return (
    CHOICE_BASE +
    Math.min(60, Math.round(unitThreatValue(unit) / 2)) +
    (removesNow ? 45 : 0) +
    (remaining <= 2 ? 15 : 0) +
    catapultPairAdjustment
  );
}

/**
 * An ability-roll window (Death Stare, knockback, paralysis-extra, extra
 * attack-die) SUCCEEDS only when EVERY die falls in `[minRoll, maxRoll]` — often
 * the LOW / negative faces (a Death Stare wants "-1"s). "Higher face is better"
 * is exactly backwards for these, so the die scorers must read `abilityRoll` and
 * optimize toward the success window, not toward the biggest face.
 */
function candidateAllInWindow(
  faces: number[],
  min: number,
  max: number,
): boolean {
  return faces.length > 0 && faces.every((face) => face >= min && face <= max);
}

/** True when SOME candidate already satisfies the ability roll's success window. */
function abilityRollAlreadySucceeds(
  choice: Extract<PendingChoice, { type: "ATTACK_DIE_REROLL" }>,
): boolean {
  const ctx = choice.abilityRoll;
  if (!ctx) return false;
  return choice.candidates.some((candidate) =>
    candidateAllInWindow(candidate.rolls ?? [candidate.roll], ctx.minRoll, ctx.maxRoll),
  );
}

/** Die keep: prefer the candidate with the highest attack face / best net. */
function scorePendingRoll(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "CHOOSE_PENDING_ROLL" }>,
): number {
  const choice = pendingChoiceOf(observation);
  if (!choice || choice.type !== "ATTACK_DIE_REROLL") {
    return CHOICE_BASE + (action.candidateIndex === 0 ? 5 : 0);
  }
  // Cards of Prophecy pre-roll stage: the throw is hidden — never peek at it.
  // The AI rolls without the card (it keeps it for its attack pre-roll / buff).
  if (choice.prophecyBlind) return CHOICE_BASE + 50;
  const candidate = choice.candidates[action.candidateIndex];
  if (!candidate) return CHOICE_BASE;
  const faces = candidate.rolls ?? [];
  // Ability roll: only an all-in-window candidate is worth keeping (the effect
  // lands only if every die is in the window); a partial roll fails, so keep it
  // low and let the reroll win.
  if (choice.abilityRoll) {
    const allIn = candidateAllInWindow(
      faces.length > 0 ? faces : [candidate.roll],
      choice.abilityRoll.minRoll,
      choice.abilityRoll.maxRoll,
    );
    return CHOICE_BASE + (allIn ? 40 : 0);
  }
  // Attack roll: higher kept face / sum is better; non-negative preferred.
  const faceSum = faces.reduce((sum: number, face: number) => sum + face, 0);
  return CHOICE_BASE + 20 + candidate.roll * 8 + faceSum;
}

function scoreRerollOffer(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "REROLL_PENDING_CHOICE" }>,
): number {
  const choice = pendingChoiceOf(observation);
  if (!choice || choice.type !== "ATTACK_DIE_REROLL") {
    return CHOICE_BASE - 20;
  }
  if (choice.prophecyBlind) return CHOICE_BASE - 40;
  // Ability roll: (re)roll toward the success window — reroll (or set-die) only
  // when NO current candidate already satisfies it; once it succeeds, keep.
  if (choice.abilityRoll) {
    const succeeds = abilityRollAlreadySucceeds(choice);
    if (succeeds) return CHOICE_BASE - 40; // already lands — keep, don't waste a card
    if (action.useSetDie) return CHOICE_BASE + 35; // set the worst die into window
    return choice.remainingRerolls > 0 ? CHOICE_BASE + 25 : CHOICE_BASE - 40;
  }
  // Veteran Troglodytes' "Threefold Savage": every offered die is a "-1" that may
  // be rerolled once. A "-1" reroll is strictly non-worsening (the "-1" is the
  // floor), so always take each offer — the choice then falls through to the keep
  // once no "-1" die remains offerable.
  if (choice.rerollNegativeDiceOnly) {
    return choice.remainingRerolls > 0 ? CHOICE_BASE + 25 : CHOICE_BASE - 40;
  }
  // Attack roll — prefer set-die (+1) over a raw reroll when offered.
  if (action.useSetDie) {
    return CHOICE_BASE + 35;
  }
  // Only reroll when the best current candidate looks bad (roll < 0 or zero).
  const best = choice.candidates.reduce(
    (max, c) => Math.max(max, c.roll),
    -99,
  );
  if (best < 0) return CHOICE_BASE + 25;
  if (best === 0 && choice.remainingRerolls > 0) return CHOICE_BASE + 5;
  // Good roll already — keep path via CHOOSE_PENDING_ROLL should win.
  return CHOICE_BASE - 40;
}

/**
 * Position picks (dimension-door / view-earth / neutral-destination / teleport /
 * knockback …). Where a structured payload gives the AI something to reason
 * about — a mine to reveal (view-earth), a landing cell's distance to the enemy
 * (neutral-destination / teleport) — it scores by that. HONEST LIMIT: the
 * Dimension Door destinations use the same public objective-distance field as
 * normal movement, so the spell advances a real plan instead of picking the
 * engine's first listed cell.
 */
function scorePositionOption(
  observation: ComputerObservation,
  optionIndex: number,
  context: string,
): number {
  const choice = pendingChoiceOf(observation);
  if (!choice || choice.type !== "OPTION_CHOICE") {
    return CHOICE_BASE + (optionIndex === 0 ? 5 : 0);
  }

  if (context === "uland-cure" && choice.ulandCure) {
    const unitId = choice.ulandCure.unitIds[optionIndex];
    const unit = unitId ? observation.state.combat?.units[unitId] : undefined;
    if (!unit) return CHOICE_BASE + 1; // optional round-end skip
    const own = unit.controllerId === observation.playerId;
    const paralysis = (unit.tokens ?? []).some((token) => token.kind === "paralysis");
    return CHOICE_BASE + (own ? 50 : -50) + Math.min(20, unit.damage * 5) + (paralysis ? 15 : 0);
  }
  if (context === "sacrifice-transfer-amount" &&
      choice.balanceSpellChoice?.cardId === "specialty.verdish.4") {
    const payload = choice.balanceSpellChoice;
    const combat = observation.state.combat;
    const source = payload.unitId ? combat?.units[payload.unitId] : undefined;
    const recipient = payload.sacrificeUnitId ? combat?.units[payload.sacrificeUnitId] : undefined;
    if (!source || !recipient) return CHOICE_BASE;
    const amount = optionIndex + 1;
    const recipientHealth = unitRemainingHealth(recipient);
    return CHOICE_BASE + amount * 18 -
      (amount >= recipientHealth ? 65 + Math.min(50, unitThreatValue(recipient) / 2) : 0);
  }

  if (context === "dimension-door" && choice.dimensionDoor) {
    const dest = choice.dimensionDoor.destinations[optionIndex];
    if (!dest) {
      // Trailing "stay" option (no destination at this index).
      return CHOICE_BASE;
    }
    const state = observation.state as unknown as GameState;
    const hero = state.heroes[choice.dimensionDoor.heroId];
    if (!hero?.spaceId) {
      return CHOICE_BASE + 10;
    }
    const objectives = collectMapObjectives(state, hero);
    const primary = primaryMapObjective(
      state,
      hero,
      objectives,
      observation.memory?.stickyObjectiveSpaceId,
    );
    if (!primary) {
      return CHOICE_BASE + 10;
    }
    const distance = objectiveDistanceField(state, hero, [primary]);
    const currentDistance = distance.get(hero.spaceId);
    const destinationDistance = distance.get(dest);
    if (currentDistance === undefined || destinationDistance === undefined) {
      return CHOICE_BASE - 10;
    }
    const improvement = currentDistance - destinationDistance;
    if (improvement <= 0) {
      // Staying is smarter than consuming the spell on a sideways/backward hop.
      return CHOICE_BASE - 10 + improvement;
    }
    return (
      CHOICE_BASE +
      25 +
      Math.min(55, improvement * 10) +
      (destinationDistance === 0 ? 20 : 0)
    );
  }

  if (context === "view-earth" && choice.viewEarth) {
    const mine = choice.viewEarth.mineSpaceIds[optionIndex];
    if (!mine) return CHOICE_BASE; // cancel
    return CHOICE_BASE + 40;
  }

  // Map Power-tier spells (View Air / Dimension Door / …) and the visions /
  // fortune boost twins: prefer a boost that still moves the printed tier;
  // "Resolve now" when already at a useful tier or only junk sources remain.
  if (
    (context === "map-spell-boost" ||
      context === "visions-boost" ||
      context === "fortune-boost") &&
    (choice.mapSpellBoost || choice.visionsBoost || choice.fortuneBoost)
  ) {
    // The three boost choices carry different pending-data shapes (only
    // mapSpellBoost lists `offers`); the OPTION_CHOICE options are the uniform
    // surface here, and the trailing option is normally "Resolve now". The one
    // exception is a mandatory cost-discard window (Titan's Cuirass +4 on the
    // map): every option is then a payable discard, so whichever this scorer
    // prefers still pays the cost — bounded, never a stall.
    // USER RULE 2026-08-22 (reduced-rung resolves): a map-spell-boost window can
    // now end with "Cast at Power N instead" options AFTER the commit, so the
    // trailing-option heuristic below would read the WEAKEST cast as "resolve".
    // Score those explicitly: valid (never a stall) but never preferred — a
    // computer seat commits at full Power.
    if (context === "map-spell-boost" && choice.mapSpellBoost) {
      const offerCount = choice.mapSpellBoost.offers.length;
      if ((choice.mapSpellBoost.reducedPowers?.length ?? 0) > 0) {
        if (optionIndex > offerCount) {
          return CHOICE_BASE + 2;
        }
        if (optionIndex === offerCount) {
          return offerCount === 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 18;
        }
      }
    }
    const optionCount =
      choice.type === "OPTION_CHOICE" ? choice.options.length : 0;
    const label = (optionLabel(choice, optionIndex) ?? "").toLowerCase();
    const isResolve =
      label.includes("resolve") || optionIndex === optionCount - 1;
    if (isResolve) {
      // Resolve is a safe exit; preferred when it is the only option left.
      return optionCount <= 1 ? CHOICE_BASE + 40 : CHOICE_BASE + 18;
    }
    // Prefer free / permanent / school boosts over discarding high-keep hand cards.
    let score = CHOICE_BASE + 28;
    if (
      label.includes("school") ||
      (label.includes("basic") && label.includes("magic"))
    ) {
      score += 12;
    }
    if (label.includes("discard")) {
      // Soft penalty — still above resolve when a tier step matters; hand junk
      // discards stay competitive via the generic keep table elsewhere.
      score -= 6;
    }
    return score;
  }

  if (context === "neutral-destination" && choice.neutralDestination) {
    const pos = choice.neutralDestination.positions[optionIndex];
    if (pos === undefined) return CHOICE_BASE;
    const combat = observation.state.combat;
    if (!combat) return CHOICE_BASE + 10;
    const dist = distanceToNearestEnemy(combat, observation.playerId, pos);
    if (dist === null) return CHOICE_BASE + 10;
    // Closer is better for the attacking player controlling the landing.
    return CHOICE_BASE + Math.max(0, 20 - dist);
  }

  if (context === "combat-teleport" && choice.teleport) {
    const pos = choice.teleport.positions[optionIndex];
    if (pos === undefined) return CHOICE_BASE;
    const combat = observation.state.combat;
    if (!combat) return CHOICE_BASE + 10;
    const dist = distanceToNearestEnemy(combat, observation.playerId, pos);
    if (dist === null) return CHOICE_BASE + 10;
    return CHOICE_BASE + Math.max(0, 20 - dist);
  }

  if (context === "combat-knockback" && choice.knockback) {
    // Prefer safer (farther from enemies) for the shoved unit.
    const pos = choice.knockback.positions[optionIndex];
    if (pos === undefined) return CHOICE_BASE;
    const combat = observation.state.combat;
    if (!combat) return CHOICE_BASE + 10;
    const unit = combat.units[choice.knockback.unitId];
    const owner = unit?.controllerId ?? observation.playerId;
    const dist = distanceToNearestEnemy(combat, owner, pos);
    if (dist === null) return CHOICE_BASE + 10;
    return CHOICE_BASE + Math.min(30, dist * 3);
  }

  if (context === "combat-reposition" && choice.reposition) {
    const combat = observation.state.combat;
    const unit = combat?.units[choice.reposition.unitId];
    // Harpy fly-back choice only (option 0 = fly back to origin, option 1 = stay
    // at the attack landing). User ruling: if the enemy has a ranged unit and
    // staying PINS it (adjacent to the landing), STAY to deny its shots; else fly
    // back behind the screen. Other repositions keep the default scoring.
    if (combat && unit && (unit.abilities ?? []).includes("harpy-return")) {
      const pinsShooter = Object.values(combat.units).some(
        (enemy) =>
          enemy.controllerId !== unit.controllerId &&
          enemy.type === "ranged" &&
          (enemy.maxHealth ?? 0) - (enemy.damage ?? 0) > 0 &&
          isAdjacent(enemy.position, unit.position),
      );
      if (pinsShooter) return optionIndex === 1 ? CHOICE_BASE + 45 : CHOICE_BASE + 5;
      return optionIndex === 0 ? CHOICE_BASE + 30 : CHOICE_BASE + 10;
    }
  }

  if (context === "diplomacy-skip" && choice.diplomacySkip) {
    // Option 0 skips the fight (claims the field, no Experience), option 1
    // fights. User ruling: the skip is for GETTING THE RESOURCE when the fight
    // is not a clear win or the hero no longer needs the Experience — a hero
    // still levelling who can plainly beat the guard fights for the XP, unless
    // the field feeds a resource the development plan is short of while the
    // army is not yet ready for a contested fight.
    const state = observation.state as unknown as GameState;
    const hero = state.heroes?.[choice.diplomacySkip.heroId];
    const field = state.adventure?.fields[choice.diplomacySkip.fieldId];
    const urgency = resourceUrgency(state, observation.playerId);
    const skip = !hero || !field || hero.level >= 7 || Boolean(field.noExperience) ||
      !canBeatGuardedField(state, hero, field) ||
      (!armyReadyForContestedFight(state, observation.playerId) &&
        (["gold", "buildingMaterials", "valuables"] as const).some((resource) =>
          urgency[resource] > 0 && fieldSuppliesResource(state, observation.playerId, field, resource)));
    return (optionIndex === 0) === skip ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  if (context === "diplomacy-battle-ease" && choice.diplomacyBattleEase) {
    // The card never replaces the battle; it strictly weakens the same fight
    // without reducing its reward, so the computer should use it when offered.
    return optionIndex === 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  if (context === "polish-quick-combat" && choice.polishQuickCombat) {
    const state = observation.state as unknown as GameState;
    const hero = state.heroes?.[choice.polishQuickCombat.heroId];
    const field = state.adventure?.fields[choice.polishQuickCombat.fieldId];
    // A covered field still offers a real fight when XP is available. Use the
    // same army-readiness gate as navigation; never throw away growth merely
    // because the no-XP shortcut is certain.
    if (hero?.kind === "main" && hero.level < 7 && field && !field.noExperience &&
        choice.polishQuickCombat.difficulty >= hero.level && canBeatGuardedField(state, hero, field)) {
      return optionIndex === 1 ? CHOICE_BASE + 55 : CHOICE_BASE + 10;
    }
    return optionIndex === 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  if (context === "polish-bank-auto-combat") {
    // Polish Banks Auto Combat: option 0 is the certain unfought Bank win with
    // the normal reward, option 1 the already-decided fight it replaces. Take
    // the certain win — it is strictly the same outcome without the dice, and
    // scoring it explicitly here keeps an AI seat from ever sitting on the
    // proposal (the mid-fight seam can raise it on the AI's own turn).
    return optionIndex === 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  // Polish Balance "Basic X Magic": pick the better of the two found Spells.
  // Explicit rather than relying on an unknown-context fallback, so the pick can
  // never stall or resolve arbitrarily.
  if (context === "basic-magic-pick" && choice.basicMagicPick) {
    const cardId = choice.basicMagicPick.candidates[optionIndex]?.cardId;
    if (!cardId) return CHOICE_BASE;
    return CHOICE_BASE + Math.min(CHOICE_BAND, cardKeepValue(cardId, observation));
  }

  if (context === "deck-search-mode" && choice.deckSearchMode) {
    // Prefer searching the deck (more options) over a single discard-top when
    // count > 1; otherwise take discard-top as a free known card.
    if (optionIndex === 0) return CHOICE_BASE + 20; // search
    if (choice.deckSearchMode.hasDiscardTop && optionIndex === 1) {
      return CHOICE_BASE + (choice.deckSearchMode.count <= 1 ? 25 : 12);
    }
    return CHOICE_BASE + 10;
  }

  if (context === "scouting-prompt" && choice.scoutingPrompt) {
    // Option 0 decline; then basic Search(3); then expert Search(5).
    // Scouting is usually worth it — prefer basic, then expert, then decline.
    if (optionIndex === 0) return CHOICE_BASE + 5;
    if (choice.scoutingPrompt.offerBasic && optionIndex === 1) {
      return CHOICE_BASE + 30;
    }
    if (choice.scoutingPrompt.offerExpert) {
      // Expert Search(5) spends a crown. Crowns are a per-ROUND budget that refreshes
      // next turn (expertUsesSpentThisRound resets each round), so a crown left unspent
      // this turn is simply LOST. When NO combat can happen this turn — no active fight
      // and none reachable with current movement — the crown has nothing better to buy
      // (statistic/spell cards only pay off in a battle), so take the wider search for
      // the better pick rather than hoard a crown that refreshes anyway (user 2026-09-18:
      // "crown recovers next turn, nothing threatens even with a move left — use expert,
      // gain the advantage to select"). Otherwise keep it: a fight this turn wants the
      // crown more, and the basic boost is free.
      const crownWastedIfHeld = noCombatReachableThisTurn(observation);
      return CHOICE_BASE + (crownWastedIfHeld ? 35 : 22);
    }
    return CHOICE_BASE + 10;
  }

  if (context === "discard-pick" && choice.discardPick) {
    const cardId = choice.discardPick.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE + 5; // skip / Done
    // Never pull a self-retriever (Scholar) back — replaying it re-opens THIS
    // very pick, an infinite loop. Score it strictly below the Done/skip exit
    // (and below any real card) so anything else, or declining, always wins.
    if (reopensDiscardPick(cardId)) return CHOICE_BASE - 50;
    return acquisitionScore(scholarRetrievalValue(cardId, observation));
  }

  if (context === "hand-discard" && choice.handDiscard) {
    const cardId = choice.handDiscard.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    // Discard lowest value.
    return (
      CHOICE_BASE +
      Math.max(0, 50 - Math.min(50, cardHandValue(cardId, observation)))
    );
  }

  if (context === "own-deck-pick" && choice.ownDeckPick) {
    const cardId = choice.ownDeckPick.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return acquisitionScore(acquisitionValue(cardId, observation));
  }
  if (context === "isra-fetch-card" && choice.israFetchCard) {
    const candidate = choice.israFetchCard.candidates[optionIndex];
    return candidate ? acquisitionScore(acquisitionValue(candidate.cardId, observation)) : CHOICE_BASE;
  }
  if (context === "isra-return-unit" && choice.israReturnUnit) {
    const returnChoice = choice.israReturnUnit;
    if (returnChoice.positions) {
      const position = returnChoice.positions[optionIndex];
      const combat = observation.state.combat;
      if (position === undefined || !combat) return CHOICE_BASE;
      const distance = distanceToNearestEnemy(combat, observation.playerId, position);
      return CHOICE_BASE + (distance === null ? 10 : Math.max(0, 20 - distance));
    }
    const unitId = returnChoice.unitIds[optionIndex];
    const unit = unitId ? observation.state.combat?.units[unitId] : undefined;
    return unit ? CHOICE_BASE + Math.min(80, unitThreatValue(unit)) : CHOICE_BASE;
  }

  if (context === "spell-deck-pick" && choice.spellDeckPick) {
    // The Tome's "which Spell deck?" pick. A computer seat has no model for what
    // a CROWN is worth against an unseen Expert spell, so it never spends one
    // here. But when the Expert deck costs nothing (an Empowered Tome) it is the
    // strictly better pool, so take it. Every option scores, so the pick can
    // never stall the runner.
    const deckId = choice.spellDeckPick.deckIds[optionIndex];
    if (!deckId) {
      return CHOICE_BASE;
    }
    if (choice.spellDeckPick.crownDeckIds.includes(deckId)) {
      return CHOICE_BASE + 5;
    }
    return deckId === "spells-expert" ? CHOICE_BASE + 30 : CHOICE_BASE + 20;
  }

  if (context === "eagle-eye" && choice.eagleEye) {
    // Take a real spell; discard only if somehow junk (still take).
    const value = cardKeepValue(choice.eagleEye.cardId, observation);
    // Option 0 is usually take; prefer high value on take index 0.
    if (optionIndex === 0) return CHOICE_BASE + Math.min(40, value);
    return CHOICE_BASE + 5;
  }

  if (context === "thieves-guild" && choice.thievesGuild) {
    // Discard the weaker of the two peeked cards (leave the better on top).
    const cardId = choice.thievesGuild.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return (
      CHOICE_BASE +
      Math.max(0, 40 - Math.min(40, cardKeepValue(cardId, observation)))
    );
  }

  if (context === "genie-take-spell" && choice.genieTakeSpell) {
    const cardId = choice.genieTakeSpell.spellCardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return CHOICE_BASE + Math.min(CHOICE_BAND, cardKeepValue(cardId, observation));
  }

  if (context === "morale-positive-limit" && choice.moralePositiveLimit) {
    // Must discard down — dump lowest value held card.
    const cardId = choice.moralePositiveLimit.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return (
      CHOICE_BASE +
      Math.max(0, 40 - Math.min(40, cardKeepValue(cardId, observation)))
    );
  }

  if (context === "skeleton-reinforce" && choice.skeletonReinforce) {
    // Free reinforce — any bronze Few is good; prefer first.
    return CHOICE_BASE + 30 - optionIndex;
  }

  if (context === "war-machine") {
    // Prefer taking a free war machine over declining.
    const label = optionLabel(choice, optionIndex);
    // Overclock I at the beginning of the combat offers ONLY its +2 Initiative
    // option (index 0, x2 on a ground unit) or Skip (index 1): the +1 Attack
    // option is an Instant attack buff played from hand when a unit attacks
    // (user ruling 2026-09-24). With a ground body on the field, keep the card
    // for that doubled (+2) Attack Instant (handAttackBoostFor / the
    // attack-reaction planner read it); an all-ranged/flying army takes the
    // Initiative now (shooting first). Any other index is illegal here.
    if (choice.prompt?.startsWith("Overclock I (")) {
      const combat = observation.state.combat;
      const hasGround = Object.values(combat?.units ?? {}).some((unit) =>
        unit.controllerId === observation.playerId && unit.position >= 0 &&
        unit.damage < unit.maxHealth && unit.type === "ground");
      if (optionIndex === 1) return CHOICE_BASE + (hasGround ? 35 : 5);
      return optionIndex === 0 ? CHOICE_BASE + 25 : CHOICE_BASE - 100;
    }
    if (looksLikeDecline(label)) return CHOICE_BASE + 5;
    return CHOICE_BASE + 25;
  }

  if (context === "garrison") {
    // Option 0 = pay the fee and defend; option 1 = let it fall.
    // Defend when the army can still fight and gold covers the fee + reserve;
    // otherwise cede the holding rather than bankrupt a thin force. The fee
    // scales with the holding: 8 for a Town/Settlement, 3 for a minor holding
    // (designer Garrison object, or a Mine under `mine-army-defense`) — read the
    // real cost so a cheap Mine defense is not conceded as readily as a Town.
    const cost = observation.state.adventure?.pendingGarrison?.goldCost ?? 8;
    const player = observation.state.players[observation.playerId];
    const gold = player?.resources.gold ?? 0;
    const army = player?.army.length ?? 0;
    if (optionIndex === 0) {
      if (gold >= cost + 5 && army >= 3) return CHOICE_BASE + 40;
      if (gold >= cost && army >= 2) return CHOICE_BASE + 25;
      return CHOICE_BASE + 5;
    }
    // Let it fall — preferred when broke or army is a husk.
    if (gold < cost || army < 2) return CHOICE_BASE + 35;
    return CHOICE_BASE + 12;
  }

  if (context === "place-creature-bank") {
    const candidates = choice.creatureBank?.candidates ?? [];
    if (candidates.length > 0) {
      const armyStrength = playerArmyStrength(
        observation.state as unknown as GameState,
        observation.playerId,
      );
      const beatable = candidates.map((candidate) =>
        armyStrength >=
        creatureBankStrength(
          candidate.bankId,
          candidate.size,
          Boolean(observation.state.adventure?.houseRules?.["polish-creature-banks"]),
        ) *
          BANK_ENGAGE_RATIO,
      );
      const candidate = candidates[optionIndex];
      if (candidate) {
        // User ruling (2026-09-18): ALWAYS place a Creature Bank. Placing is
        // pure future-reward optionality and never a real liability — a placed
        // bank stays a reward to claim once the army grows, whereas leaving the
        // hex blocked forfeits it forever. So a bank the army can beat NOW ranks
        // highest (bigger size = more reward, claimable immediately), and a bank
        // it cannot beat yet still ranks ABOVE the Leave option.
        return beatable[optionIndex]
          ? CHOICE_BASE + 40 + candidate.size
          : CHOICE_BASE + 30;
      }
      if (optionIndex === candidates.length) {
        // Leave-it-blocked is now always the last resort (see ruling above).
        return CHOICE_BASE + 10;
      }
    }
    // Rule-off / legacy payload: option 0 places the known bank, option 1
    // leaves it blocked. Preserve the original always-place policy.
    return optionIndex === 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  if (context === "place-map-token") {
    // Any legal candidate is fine; prefer lower indices for stability.
    return CHOICE_BASE + Math.max(0, 25 - optionIndex);
  }

  if (context === "subterranean-gate-placement") {
    // Open a gate when offered — connectivity beats leaving the cavern sealed.
    if (looksLikeDecline(optionLabel(choice, optionIndex))) {
      return CHOICE_BASE + 8;
    }
    return CHOICE_BASE + 30 - Math.min(10, optionIndex);
  }

  if (context === "far-tile-flip") {
    const value = farTileChoiceValue(observation, optionIndex);
    if (value !== null) return CHOICE_BASE + value;
    // Prefer tiles that mention Settlement / Ore Mine in the option label
    // (engine builds those tags into the keep/reroll menu). Keep over reroll
    // when the candidate already looks good; otherwise take the reroll offer.
    const label = optionLabel(choice, optionIndex) ?? "";
    const lower = label.toLowerCase();
    if (lower.includes("settlement")) return CHOICE_BASE + 45;
    if (lower.includes("ore") || lower.includes("mine")) return CHOICE_BASE + 38;
    if (lower.includes("keep")) return CHOICE_BASE + 28;
    if (lower.includes("reroll") || lower.includes("draw another")) {
      return CHOICE_BASE + 18;
    }
    if (looksLikeDecline(label)) return CHOICE_BASE + 8;
    return CHOICE_BASE + 22 - Math.min(8, optionIndex);
  }

  if (context === "learning-level-up") {
    // Structured payload: learningLevelUp.modes maps option index -> mode
    // (the trailing option is Decline). Levels gate which guards the AI may
    // engage, so the expert FULL level (+2 Experience) beats the basic half
    // step whenever a crown is spare beyond this one; with the round's last
    // crown, the basic half step wins (keep the crown for a combat expert).
    const modes =
      choice && choice.type === "OPTION_CHOICE"
        ? choice.learningLevelUp?.modes
        : undefined;
    if (modes) {
      const mode = modes[optionIndex];
      if (!mode) return CHOICE_BASE + 5; // Decline
      if (mode === "expert") {
        return crownsAvailable(observation) >= 2
          ? CHOICE_BASE + 42
          : CHOICE_BASE + 30;
      }
      return CHOICE_BASE + 35;
    }
    // Legacy payload-less fallback: prefer a real benefit over skipping.
    if (looksLikeDecline(optionLabel(choice, optionIndex))) {
      return CHOICE_BASE + 5;
    }
    return CHOICE_BASE + 35 - Math.min(10, optionIndex);
  }

  if (context === "diplomacy-recruit") {
    const legionCount = choice?.type === "OPTION_CHOICE" ? choice.diplomacyRecruit?.legionPlays?.length ?? 0 : 0;
    if (legionCount > 0 && optionIndex >= choice!.options.length - legionCount) {
      const offer = choice.diplomacyRecruit!.legionPlays![optionIndex - (choice.options.length - legionCount)];
      const savings = offer ? inlineLegionSavings(observation.state as unknown as GameState, observation.playerId,
        offer.unitDefId, offer.amount, choice.diplomacyRecruit?.goldReduction) : 0;
      return CHOICE_BASE + (savings > 0 ? 50 + Math.min(20, savings) : 2);
    }
    // Recruit options are index-aligned with `recruitable` (the decline follows
    // them). Price each drawn body through the shared golden rules — a recruit
    // that would eat the reserve or the next Gold body's gold, or pile a surplus
    // body onto a full army, loses to "Recruit none".
    const recruit = choice?.type === "OPTION_CHOICE" ? choice.diplomacyRecruit : undefined;
    const draw = recruit?.recruitable?.[optionIndex];
    if (draw) {
      const state = observation.state as unknown as GameState;
      const worth = neutralRecruitUtility(state, observation.playerId, draw.unitDefId, {
        cost: neutralRecruitCost(state, observation.playerId, draw.unitDefId, recruit?.goldReduction ?? 0),
      });
      return worth > 0 ? CHOICE_BASE + 20 + Math.min(50, Math.round(worth / 2)) : CHOICE_BASE + 2;
    }
    if (looksLikeDecline(optionLabel(choice, optionIndex))) {
      return CHOICE_BASE + 8;
    }
    return CHOICE_BASE + 35 - Math.min(10, optionIndex);
  }

  // Visions deck pick: the printed card draws from "any Neutral Unit deckS", so
  // the window re-opens until every owed card is lifted. EVERY option lifts at
  // least one card, so the loop always terminates and no seat can stall here;
  // prefer the leading "draw all N" bulk options (offered only while more than
  // one card is still owed) so a computer seat finishes the draw in ONE step.
  if (context === "visions-deck") {
    const pick = choice?.type === "OPTION_CHOICE" ? choice.visionsDeck : undefined;
    const bulkCount = pick && pick.count > 1 ? pick.tiers.length : 0;
    return (
      CHOICE_BASE + (optionIndex < bulkCount ? 30 : 15) - Math.min(10, optionIndex)
    );
  }

  if (context === "oidana-scry-deck") {
    // The chosen deck is locked for both cards. Prefer the tier matching the
    // visible upcoming guard difficulty, without inspecting hidden deck cards.
    const tiers = choice?.type === "OPTION_CHOICE" ? choice.oidanaScryDeck?.tiers ?? [] : [];
    const fight = upcomingFight(observation);
    const difficulty = fight?.spaceId
      ? (observation.state as unknown as GameState).adventure?.fields[fight.spaceId]?.difficulty ?? 1
      : 1;
    const preferred = difficulty >= 4 ? "azure" : difficulty >= 3 ? "gold" : difficulty >= 2 ? "silver" : "bronze";
    return CHOICE_BASE + (tiers[optionIndex] === preferred ? 45 : 20 - optionIndex);
  }

  if (context === "oidana-scry-cards") {
    const scry = choice?.type === "OPTION_CHOICE" ? choice.oidanaScry : undefined;
    if (!scry) return CHOICE_BASE;
    const keep = optionIndex < scry.remaining.length;
    const cardId = scry.remaining[keep ? optionIndex : optionIndex - scry.remaining.length];
    if (!cardId) return CHOICE_BASE;
    const excess = neutralUnitStrength(cardId) - neutralTierMeanStrength(scry.tier);
    // Discard above-average guards; return weaker ones first so the next draw
    // is easier. Each choice consumes one card, so the window always finishes.
    return CHOICE_BASE + (keep ? 32 - excess : 30 + excess);
  }

  // Astrologers Judge Dread: keep the drawn guard army or redraw the same
  // tiers. Redraw only when the draw runs ABOVE its tiers' deck average — a
  // below-average army is the fight to keep.
  if (context === "judge-dread") {
    const draws = (observation.state as unknown as GameState).combat?.pendingNeutralDraws ?? [];
    const excess = draws.reduce(
      (sum, draw) => sum + neutralUnitStrength(draw.unitDefId) - neutralTierMeanStrength(draw.tier),
      0,
    );
    return (optionIndex === 1) === excess > 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  // Groovy Satyr: option 0 keeps every drawn guard; option i+1 discards draw i
  // and draws a new card of the same tier. Swap the single guard that runs
  // furthest above its tier's average (never a bank guard); keep when none does.
  if (context === "satyr-swap") {
    const draws = (observation.state as unknown as GameState).combat?.pendingNeutralDraws ?? [];
    let bestIndex = -1;
    let bestExcess = 0;
    draws.forEach((draw, index) => {
      if (draw.bankGuard) return;
      const excess = neutralUnitStrength(draw.unitDefId) - neutralTierMeanStrength(draw.tier);
      if (excess > bestExcess) {
        bestExcess = excess;
        bestIndex = index;
      }
    });
    if (optionIndex === 0) return CHOICE_BASE + (bestIndex < 0 ? 40 : 12);
    return optionIndex - 1 === bestIndex ? CHOICE_BASE + 40 : CHOICE_BASE + 4;
  }

  // Polish Rule 111 (once per game, home-tile difficulty-I fight): option 0
  // keeps the draw; the rest replace one bronze guard (in draw order) with the
  // next random bronze. Spend the once-only swap on a bronze above average.
  if (context === "rule-111") {
    const draws = (observation.state as unknown as GameState).combat?.pendingNeutralDraws ?? [];
    const bronze = draws.filter((draw) => draw.tier === "bronze" && !draw.bankGuard);
    let bestIndex = -1;
    let bestExcess = 0;
    bronze.forEach((draw, index) => {
      const excess = neutralUnitStrength(draw.unitDefId) - neutralTierMeanStrength("bronze");
      if (excess > bestExcess) {
        bestExcess = excess;
        bestIndex = index;
      }
    });
    if (optionIndex === 0) return CHOICE_BASE + (bestIndex < 0 ? 40 : 12);
    return optionIndex - 1 === bestIndex ? CHOICE_BASE + 40 : CHOICE_BASE + 4;
  }

  // Polish Spell Book Mage Guild: Search for a Spell, or take another Cast a
  // Spell enabler. An enabler only when the Book already outgrows the supply
  // (same rule the SPELL_BOOK_ACTION purchase uses).
  if (context === "polish-spell-or-cast") {
    const player = (observation.state as unknown as GameState).players[observation.playerId];
    // The observation is the seat's REDACTED view: `deck` is always [] (only
    // deckCount survives), so enablers cycling through the draw pile cannot be
    // counted — hand + discard is the whole readable supply.
    const castSupply = [...(player?.hand ?? []), ...(player?.discard ?? [])]
      .filter((cardId) => isCastASpellCard(cardId)).length;
    const ownedSpells = (player?.spellBook?.length ?? 0) + (player?.spellBookUsed?.length ?? 0);
    const wantCast = castSupply < Math.max(1, ownedSpells);
    return (optionIndex === 1) === wantCast ? CHOICE_BASE + 40 : CHOICE_BASE + 15;
  }

  // Designer "choose the mine type" reveal: gold / valuables / random. Take the
  // scarcer ladder input — valuables when the Gold ladder still owes them or
  // they are the slower resource to earn, otherwise gold.
  if (context === "player-resource-pick") {
    const state = observation.state as unknown as GameState;
    const urgency = resourceUrgency(state, observation.playerId);
    const valuablesShort = urgency.valuables > urgency.gold ||
      goldLadderValuablesReserve(state, observation.playerId) > (state.players[observation.playerId]?.resources.valuables ?? 0);
    if (optionIndex === 0) return CHOICE_BASE + (valuablesShort ? 20 : 40);
    if (optionIndex === 1) return CHOICE_BASE + (valuablesShort ? 40 : 20);
    return CHOICE_BASE + 5;
  }

  // Designer "choose this tile's Ⅶ objective": follow the win condition (Grail
  // in a Grail game, a Utopia in the dragon modes, a Town under conquest);
  // otherwise a Settlement's steady income beats a fresh Town, Utopia, Grail.
  if (context === "player-vii-pick") {
    const fields = choice?.type === "OPTION_CHOICE" ? choice.playerTilePick?.viiFields ?? [] : [];
    const pick = fields[optionIndex];
    if (!pick) return CHOICE_BASE + 5;
    const mode = adventureVictoryMode(observation.state as unknown as GameState);
    const wanted = mode === "grail" ? "grail"
      : mode === "dragon-hunt" || mode === "dragon-conqueror" ? "dragon_utopia"
      : mode === "conquest" || mode === "conquer" ? "town"
      : null;
    if (wanted && pick === wanted) return CHOICE_BASE + 45;
    const order: Record<string, number> = { settlement: 36, town: 30, dragon_utopia: 22, grail: 16 };
    return CHOICE_BASE + (order[pick] ?? 10);
  }

  // Pandora's Bargain (Power) upkeep: keep the card while a positive morale
  // token can absorb the Negative Morale; otherwise let the card go.
  if (context === "pandora-upkeep") {
    const morale = observation.state.players[observation.playerId]?.morale ?? 0;
    return (optionIndex === 1) === morale > 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  if (context === "forge-phantom-chain-lightning") {
    // A free Chain Lightning for the fight is worth 1 building material when a
    // spare one is on hand; keep the last one for building.
    const materials = observation.state.players[observation.playerId]?.resources.buildingMaterials ?? 0;
    return (optionIndex === 0) === (materials >= 2) ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  if (context === "brute-combat-draw") {
    // Buy combat flexibility when the Brute can spare the gold; preserve the
    // last few coins for recruits and post-fight recovery.
    const gold = observation.state.players[observation.playerId]?.resources.gold ?? 0;
    return (optionIndex === 0) === (gold >= 4) ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  // Generic OPTION_CHOICE: slight preference for non-decline, first options.
  const label = optionLabel(choice, optionIndex);
  if (looksLikeDecline(label)) {
    // Decline is the SAFE exit when the choice is optional loops — score mid so
    // a strong positive sibling can win, but we never stall.
    return CHOICE_BASE + 8;
  }
  return CHOICE_BASE + 15 - Math.min(10, optionIndex);
}

/**
 * Strategic scores for pending-choice resolutions. Returns null when the action
 * is not a choice this module handles.
 */
export function scoreChoiceAction(
  observation: ComputerObservation,
  action: GameAction,
): ComputerActionScore | null {
  switch (action.type) {
    case "CHOOSE_OPTION": {
      const choice = pendingChoiceOf(observation);
      const context =
        choice && choice.type === "OPTION_CHOICE" ? choice.context : "unknown";
      if (context === "city-hall") {
        return {
          score: scoreCityHallOption(observation, action.optionIndex),
          policy: "choice.city-hall",
        };
      }
      return {
        score: scorePositionOption(observation, action.optionIndex, context),
        policy: `choice.${context}`,
      };
    }
    case "RESOLVE_DECK_SEARCH":
      return {
        score: scoreDeckSearchKeep(observation, action),
        policy: "choice.deck-search-keep",
      };
    case "RESOLVE_COMBAT_DISCARD":
      return {
        score: scoreCombatDiscard(observation, action),
        policy: "choice.combat-discard",
      };
    case "CHOOSE_ABILITY_TARGET":
      return {
        score: scoreAbilityTarget(observation, action),
        policy: "choice.ability-target",
      };
    case "CHOOSE_PENDING_ROLL":
      return {
        score: scorePendingRoll(observation, action),
        policy: "choice.keep-roll",
      };
    case "REROLL_PENDING_CHOICE":
      return {
        score: scoreRerollOffer(observation, action),
        policy: "choice.reroll",
      };
    case "COMMANDER_FIRST_AID": {
      // Restore a casualty when optionIndex is a real pick; decline is last resort.
      if (action.optionIndex === null) {
        return { score: CHOICE_BASE + 5, policy: "choice.commander-first-aid-decline" };
      }
      return { score: CHOICE_BASE + 35, policy: "choice.commander-first-aid" };
    }
    case "COMMANDER_GRADE_UP": {
      // Priority mirrors ranked human play (16 commander games, 197 grade-ups):
      // ATTACK is the first and most-picked stat (38/39 first picks, 89 total)
      // for EVERY commander, and DAMAGE is never picked by anyone (0/197) — the
      // extra attack dice are worth less than a flat +1 Attack or survivability,
      // so it sits below everything as a last-resort filler. What differs by
      // commander is MAGIC: caster commanders (Animate Dead / Precision /
      // Counterstrike / Shield) pour into it to power their once-per-round cast,
      // while melee/utility commanders never grade it and instead bank Defense /
      // Health / Speed. Speed is left ADAPTIVE (never a forced first pick — it
      // only unlocks manual sorting; the commander is auto-placed without it).
      const slug = observation.state.players[observation.playerId]?.commander?.slug;
      const caster = commanderValuesMagicGrade(slug);
      const order: Record<string, number> = caster
        ? { attack: 40, magic: 38, speed: 26, defense: 22, health: 20, damage: 6 }
        : { attack: 40, defense: 26, health: 24, speed: 22, magic: 12, damage: 6 };
      return {
        score: CHOICE_BASE + (order[action.stat] ?? 15),
        policy: caster ? "choice.commander-grade-caster" : "choice.commander-grade-martial",
      };
    }
    case "SKIP_NECROMANCY":
      // Always resolve the post-combat window (prefer playing Necromancy via
      // PLAY_CARD when legal — that path scores higher in card-policy). Skip is
      // the mandatory exit so the map never freezes.
      return { score: CHOICE_BASE + 20, policy: "choice.skip-necromancy" };
    default:
      return null;
  }
}
