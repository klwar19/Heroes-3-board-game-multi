import type { GameAction, PendingChoice } from "../state";
import { cardKeepValue } from "./card-policy";
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
  if (option.gold) {
    score += option.gold * 2;
    if (gold < 10) score += 15;
  }
  if (option.buildingMaterials) score += option.buildingMaterials * 3;
  if (option.valuables) score += option.valuables * 6;
  if (option.drawCards) score += option.drawCards * 8;
  if (option.movement) score += option.movement * 5;
  if (option.experience) score += 20;
  if (option.searchSpellDeck) score += 12;
  if (option.tradingPost) score += 5;
  if (option.runesNextCombats) score += option.runesNextCombats * 6;
  // Paying an artifact from hand is a real cost — only take when desperate.
  if (option.removeArtifactFromHand) score -= gold > 15 ? 30 : 5;
  return score;
}

/**
 * Deck search keep: highest cardKeepValue wins. Tarnum remove is only preferred
 * when the card is weak (not usually).
 */
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
    const value = cardKeepValue(cardId);
    if (action.pick.remove) {
      // Removing is rarely better than taking — only for trash.
      return CHOICE_BASE + Math.max(0, 15 - value);
    }
    return CHOICE_BASE + Math.min(CHOICE_BAND, value);
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
  const value = cardKeepValue(action.cardId);
  return CHOICE_BASE + Math.max(0, 50 - Math.min(50, value));
}

/**
 * Ability target / unit pick: hit the highest-threat living enemy; heal the
 * most wounded ally.
 */
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

  if (unit.controllerId === observation.playerId) {
    // Friendly target (heal / buff): prefer more wounded, then higher threat.
    const missing = unit.maxHealth - remaining;
    return CHOICE_BASE + missing * 8 + Math.min(20, Math.round(unitThreatValue(unit) / 5));
  }
  // Enemy: highest threat, slight bonus if nearly dead.
  return (
    CHOICE_BASE +
    Math.min(60, Math.round(unitThreatValue(unit) / 2)) +
    (remaining <= 2 ? 15 : 0)
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
  const candidate = choice.candidates[action.candidateIndex];
  if (!candidate) return CHOICE_BASE;
  // Higher kept face / sum is better; non-negative preferred.
  const faces = candidate.rolls ?? [];
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
  // Prefer set-die (+1) over a raw reroll when offered.
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
 * Dimension door / view-earth / neutral-destination: prefer destinations that
 * close on something useful when structured payload exists.
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

  if (context === "dimension-door" && choice.dimensionDoor) {
    const dest = choice.dimensionDoor.destinations[optionIndex];
    if (!dest) {
      // Trailing "stay" — only if no destinations.
      return CHOICE_BASE;
    }
    // Prefer any real teleport over stay.
    return CHOICE_BASE + 30 + Math.max(0, 10 - optionIndex);
  }

  if (context === "view-earth" && choice.viewEarth) {
    const mine = choice.viewEarth.mineSpaceIds[optionIndex];
    if (!mine) return CHOICE_BASE; // cancel
    return CHOICE_BASE + 40;
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

  if (context === "diplomacy-skip" && choice.diplomacySkip) {
    // Option 0 uses diplomacy (claim free); option 1 fights. Prefer free claim.
    return optionIndex === 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
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
      return CHOICE_BASE + 22;
    }
    return CHOICE_BASE + 10;
  }

  if (context === "discard-pick" && choice.discardPick) {
    const cardId = choice.discardPick.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE + 5; // skip
    return CHOICE_BASE + Math.min(CHOICE_BAND, cardKeepValue(cardId));
  }

  if (context === "hand-discard" && choice.handDiscard) {
    const cardId = choice.handDiscard.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    // Discard lowest value.
    return CHOICE_BASE + Math.max(0, 50 - Math.min(50, cardKeepValue(cardId)));
  }

  if (context === "own-deck-pick" && choice.ownDeckPick) {
    const cardId = choice.ownDeckPick.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return CHOICE_BASE + Math.min(CHOICE_BAND, cardKeepValue(cardId));
  }

  if (context === "eagle-eye" && choice.eagleEye) {
    // Take a real spell; discard only if somehow junk (still take).
    const value = cardKeepValue(choice.eagleEye.cardId);
    // Option 0 is usually take; prefer high value on take index 0.
    if (optionIndex === 0) return CHOICE_BASE + Math.min(40, value);
    return CHOICE_BASE + 5;
  }

  if (context === "thieves-guild" && choice.thievesGuild) {
    // Discard the weaker of the two peeked cards (leave the better on top).
    const cardId = choice.thievesGuild.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return CHOICE_BASE + Math.max(0, 40 - Math.min(40, cardKeepValue(cardId)));
  }

  if (context === "genie-take-spell" && choice.genieTakeSpell) {
    const cardId = choice.genieTakeSpell.spellCardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return CHOICE_BASE + Math.min(CHOICE_BAND, cardKeepValue(cardId));
  }

  if (context === "morale-positive-limit" && choice.moralePositiveLimit) {
    // Must discard down — dump lowest value held card.
    const cardId = choice.moralePositiveLimit.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return CHOICE_BASE + Math.max(0, 40 - Math.min(40, cardKeepValue(cardId)));
  }

  if (context === "skeleton-reinforce" && choice.skeletonReinforce) {
    // Free reinforce — any bronze Few is good; prefer first.
    return CHOICE_BASE + 30 - optionIndex;
  }

  if (context === "war-machine") {
    // Prefer taking a free war machine over declining.
    const label = optionLabel(choice, optionIndex);
    if (looksLikeDecline(label)) return CHOICE_BASE + 5;
    return CHOICE_BASE + 25;
  }

  if (context === "garrison") {
    // Option 0 = pay 8 gold and defend; option 1 = let it fall.
    // Defend when the army can still fight and gold covers the fee + reserve;
    // otherwise cede the holding rather than bankrupt a thin force.
    const player = observation.state.players[observation.playerId];
    const gold = player?.resources.gold ?? 0;
    const army = player?.army.length ?? 0;
    if (optionIndex === 0) {
      if (gold >= 8 + 5 && army >= 3) return CHOICE_BASE + 40;
      if (gold >= 8 && army >= 2) return CHOICE_BASE + 25;
      return CHOICE_BASE + 5;
    }
    // Let it fall — preferred when broke or army is a husk.
    if (gold < 8 || army < 2) return CHOICE_BASE + 35;
    return CHOICE_BASE + 12;
  }

  if (context === "place-creature-bank") {
    // Option 0 place the known bank; option 1 leave blocked. Placing creates
    // a fightable (and rewardable) objective — always prefer place.
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
    // Prefer taking a real level-up benefit over skipping.
    if (looksLikeDecline(optionLabel(choice, optionIndex))) {
      return CHOICE_BASE + 5;
    }
    return CHOICE_BASE + 35 - Math.min(10, optionIndex);
  }

  if (context === "diplomacy-recruit") {
    // Free / cheap neutral recruit — take it.
    if (looksLikeDecline(optionLabel(choice, optionIndex))) {
      return CHOICE_BASE + 8;
    }
    return CHOICE_BASE + 35 - Math.min(10, optionIndex);
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
      // Prefer Attack then Damage then Health — offense wins fights.
      const order: Record<string, number> = {
        attack: 40,
        damage: 35,
        health: 30,
        defense: 25,
        magic: 22,
        speed: 20,
      };
      return {
        score: CHOICE_BASE + (order[action.stat] ?? 15),
        policy: "choice.commander-grade",
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

/** @internal — expose keep ranking for tests. */
export function testCardKeepValue(cardId: string): number {
  return cardKeepValue(cardId);
}

/** @internal */
export function testLooksLikeDecline(label: string): boolean {
  return looksLikeDecline(label);
}
