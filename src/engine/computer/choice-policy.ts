import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameState, PendingChoice } from "../state";
import { cardKeepValue, crownsAvailable } from "./card-policy";
import {
  BANK_ENGAGE_RATIO,
  creatureBankStrength,
  playerArmyStrength,
} from "./army-strength";
import {
  collectMapObjectives,
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
    const value = cardKeepValue(cardId, observation);
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
  const value = cardKeepValue(action.cardId, observation);
  return CHOICE_BASE + Math.max(0, 50 - Math.min(50, value));
}

/**
 * Ability target / unit pick: hit the highest-threat living enemy; heal the
 * most wounded ally. Damage-style picks (Magog splash, Lich Death Cloud, …)
 * may legally hit friendlies — those score LOW so the AI prefers enemies, but
 * still pick an ally when that is the only candidate (mandatory friendly fire).
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

  const choice = pendingChoiceOf(observation);
  const isDamagePick =
    choice?.type === "ABILITY_TARGET_CHOICE" &&
    (choice.kind === "flat-damage" ||
      choice.kind === "second-attack" ||
      choice.kind === "spell-splash" ||
      choice.kind === "ballistics-splash" ||
      choice.kind === "faerie-damage" ||
      choice.kind === "area-pick" ||
      choice.kind === "chain-lightning" ||
      choice.kind === "dreadnought-splash");

  if (unit.controllerId === observation.playerId) {
    if (isDamagePick) {
      // Friendly fire: legal (Magog/Lich) but never preferred over an enemy.
      // Prefer the weakest ally if forced — spare the stronger stack.
      return CHOICE_BASE - 40 - remaining;
    }
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
  // Ability roll: (re)roll toward the success window — reroll (or set-die) only
  // when NO current candidate already satisfies it; once it succeeds, keep.
  if (choice.abilityRoll) {
    const succeeds = abilityRollAlreadySucceeds(choice);
    if (succeeds) return CHOICE_BASE - 40; // already lands — keep, don't waste a card
    if (action.useSetDie) return CHOICE_BASE + 35; // set the worst die into window
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
    // surface here, and the trailing option is always "Resolve now".
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

  if (context === "diplomacy-skip" && choice.diplomacySkip) {
    // Option 0 uses diplomacy (claim free); option 1 fights. Prefer free claim.
    return optionIndex === 0 ? CHOICE_BASE + 40 : CHOICE_BASE + 10;
  }

  if (context === "polish-quick-combat" && choice.polishQuickCombat) {
    // Polish strength-based Quick Combat: option 0 is the certain unfought win
    // (no XP), option 1 the real dice fight for XP. Prefer the certain win —
    // the AI cannot judge the dice risk here, and the guaranteed claim keeps
    // its march moving.
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
    if (!cardId) return CHOICE_BASE + 5; // skip / Done
    // Never pull a self-retriever (Scholar) back — replaying it re-opens THIS
    // very pick, an infinite loop. Score it strictly below the Done/skip exit
    // (and below any real card) so anything else, or declining, always wins.
    if (reopensDiscardPick(cardId)) return CHOICE_BASE - 50;
    return CHOICE_BASE + Math.min(CHOICE_BAND, cardKeepValue(cardId, observation));
  }

  if (context === "hand-discard" && choice.handDiscard) {
    const cardId = choice.handDiscard.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    // Discard lowest value.
    return (
      CHOICE_BASE +
      Math.max(0, 50 - Math.min(50, cardKeepValue(cardId, observation)))
    );
  }

  if (context === "own-deck-pick" && choice.ownDeckPick) {
    const cardId = choice.ownDeckPick.cardIds[optionIndex];
    if (!cardId) return CHOICE_BASE;
    return CHOICE_BASE + Math.min(CHOICE_BAND, cardKeepValue(cardId, observation));
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
    const candidates = choice.creatureBank?.candidates ?? [];
    if (candidates.length > 0) {
      const armyStrength = playerArmyStrength(
        observation.state as unknown as GameState,
        observation.playerId,
      );
      const beatable = candidates.map((candidate) =>
        armyStrength >=
        creatureBankStrength(candidate.bankId, candidate.size) *
          BANK_ENGAGE_RATIO,
      );
      const candidate = candidates[optionIndex];
      if (candidate) {
        // Among banks the army can beat, take the larger size for its larger
        // expected reward. Unbeatable candidates stay below the leave option.
        return beatable[optionIndex]
          ? CHOICE_BASE + 40 + candidate.size
          : CHOICE_BASE + 5;
      }
      if (optionIndex === candidates.length) {
        return beatable.some(Boolean) ? CHOICE_BASE + 10 : CHOICE_BASE + 48;
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
