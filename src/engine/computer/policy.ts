import { hasNecromancyPlan } from "./development";
import { cardLibrary } from "@/data/cards/library";
import { effectiveHandLimit, explorersHandStepActive, isFieldGuarded } from "../adventure";
import type { GameAction, GameState, LegalAction } from "../state";
import { cardHandValue, scoreCardAction } from "./card-policy";
import { upcomingFight } from "./card-planning";
import { heroPickBias } from "./card-values";
import { scoreChoiceAction } from "./choice-policy";
import { scoreCombatAction } from "./combat-policy";
import { scoreMapAction } from "./map-policy";
import type { ComputerDecision, ComputerObservation } from "./types";
import { learnedActionBias, type LearnedModelSelection } from "./learned-policy";
import { developmentPlanBias } from "./development-plan";
import { repeatsUnproductiveRoute } from "./memory";
import { canBeatGuardedField, objectiveDistanceField, primaryMapObjective } from "./map-navigation";
import { isPremiumEconomyField } from "./army-strength";

/** A scored move alone is not evidence that retracing a route pays off. */
function returnsTowardPayoff(observation: ComputerObservation, action: GameAction): boolean {
  if (action.type !== "MOVE_HERO" && action.type !== "MOVE_HERO_PATH") return false;
  const state = observation.state as unknown as GameState;
  const hero = state.heroes[action.heroId];
  const destination = action.type === "MOVE_HERO" ? action.to : action.path.at(-1);
  if (!hero?.spaceId || !destination) return false;
  const primary = primaryMapObjective(state, hero, undefined, observation.memory?.stickyObjectiveSpaceId);
  if (!primary || primary.kind === "explore") return false;
  const field = state.adventure?.fields[primary.spaceId];
  if (!field || (isFieldGuarded(field) && !canBeatGuardedField(state, hero, field))) return false;
  const distance = objectiveDistanceField(state, hero, [primary], isPremiumEconomyField(field));
  return (distance.get(destination) ?? Infinity) < (distance.get(hero.spaceId) ?? Infinity);
}

/** Stable serialization independent of object property insertion order. */
export function canonicalActionKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalActionKey).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, child]) => `${JSON.stringify(key)}:${canonicalActionKey(child)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Legality-match key: how a chosen action is matched back against the offered
 * legal set. Identical to canonicalActionKey except for handler-validated
 * actions whose offer is a bare template the policy parameterizes — currently
 * hand refresh and the optional opening mulligan, whose discards we choose.
 */
export function legalityMatchKey(action: GameAction): string {
  if (action.type === "REFRESH_HAND" || action.type === "OPENING_HAND_MULLIGAN") {
    return canonicalActionKey({ ...action, discardCardIds: [] });
  }
  return canonicalActionKey(action);
}

const NEVER_AUTOMATE = new Set<GameAction["type"]>([
  "SET_GAME_OPTIONS",
  "SET_COMPUTER_OPPONENTS",
  // Human-only single-player control: a bot must never set its own (or a
  // sibling's) faction through the owner's hand-pick action.
  "SET_COMPUTER_SEAT_FACTION",
  "SET_DRAFT_FORMAT",
  "RESET_SEAT_DRAFT",
  "START_ADVENTURE",
  "CANCEL_START_ADVENTURE",
  "REQUEST_ROOM_RESET",
  "CONFIRM_ROOM_RESET",
  "CANCEL_ROOM_RESET",
  "START_AFK_VOTE",
  "CAST_AFK_VOTE",
  "FORCE_AFK_KICK",
  "FORCE_TURN_TIMEOUT",
  "REQUEST_PAUSE",
  "CONFIRM_PAUSE",
  "CANCEL_PAUSE",
  "RESUME_GAME",
]);

function foundationScore(action: GameAction): {
  score: number;
  policy: string;
} {
  switch (action.type) {
    case "CHOOSE_PENDING_ROLL":
      return { score: 1_200, policy: "mandatory.keep-roll" };
    case "CHOOSE_OPTION":
    case "CHOOSE_ABILITY_TARGET":
    case "RESOLVE_COMBAT_DISCARD":
    case "RESOLVE_DECK_SEARCH":
    case "RESOLVE_VISIT_STEP":
    // After-combat gates: answer immediately so the map never freezes with a
    // computer-owned necromancy / first-aid window and no scored pick.
    case "SKIP_NECROMANCY":
    case "COMMANDER_FIRST_AID":
    case "CONTINUE_NEUTRAL_STEP":
      return { score: 1_100, policy: "mandatory.resolve-choice" };
    case "PASS_REACTION":
      return { score: 1_050, policy: "safe.pass-reaction" };
    // Locking a town directly always beats (re)rolling town options: in draft
    // CHOOSE_TOWN accepts any untaken town with no roll, and in random-choice
    // it consumes the rolled pair — so the roll actions are only ever taken
    // when the format makes them mandatory (nothing to choose yet).
    case "CHOOSE_TOWN":
      return { score: 1_010, policy: "setup.lock-town" };
    case "RANDOM_ASSIGN_SEAT":
    case "BAN_HERO":
      return { score: 1_000, policy: "setup.complete-seat" };
    // Free/draft hero claims are biased by the community hero tier list, in a
    // band (±8) that stays strictly inside the 990 (roll) … 1010 (lock-town)
    // neighbors. Equal-tier heroes remain exact ties, so the seeded tie hash
    // still varies picks between games; a seat pinned by the human via
    // SET_COMPUTER_SEAT_FACTION never reaches this scorer at all
    // (computerDecisionOwner skips fully-picked seats, and the pin action
    // itself is NEVER_AUTOMATE).
    case "CHOOSE_FACTION":
      return {
        score: 1_000 + heroPickBias(action.heroDefId),
        policy: "setup.complete-seat",
      };
    case "ROLL_TOWN_OPTIONS":
    case "ROLL_HERO_OPTIONS":
      return { score: 990, policy: "setup.roll-options" };
    // Deploy every placeable unit before finishing placement — FINISH is only
    // offered once at least one unit is down, and stops being the pick only
    // when no unplaced unit remains (PLACE offers exist for unplaced units).
    case "PLACE_COMBAT_UNIT":
      return { score: 920, policy: "combat.place-unit" };
    case "ACKNOWLEDGE_COMBAT_END":
    case "FINISH_COMBAT_PLACEMENT":
    case "FINISH_NEUTRAL_PLACEMENT":
    case "FINISH_TACTICS":
    case "ACCEPT_COMBAT":
      return { score: 900, policy: "mandatory.finish-stage" };
    case "END_COMBAT_ROUND":
      return { score: 890, policy: "mandatory.finish-combat-round" };
    case "REFRESH_HAND":
    case "OPENING_HAND_MULLIGAN":
    case "RESOLVE_EXPLORERS_DISCARD":
      return { score: 850, policy: "mandatory.start-turn" };
    case "ATTACK_UNIT":
    case "MOVE_AND_ATTACK_UNIT":
    case "ATTACK_FORTIFICATION":
      return { score: 700, policy: "foundation.take-attack" };
    case "DEFEND_UNIT":
      return { score: 500, policy: "safe.defend" };
    case "END_ACTIVATION":
      return { score: 400, policy: "safe.end-activation" };
    // Fight the neutral combat on rather than burning cards or retreating: the
    // continue costs 1 MP and is the rulebook default for a fighter that can
    // still win. Scored above generic card plays (0) so a +Movement card in the
    // window is never spent by the fallback.
    case "CONTINUE_NEUTRAL_COMBAT":
      return { score: 350, policy: "combat.continue" };
    case "COMPLETE_SIMULTANEOUS_TURN":
    case "END_TURN":
      return { score: 300, policy: "safe.end-turn" };
    case "UNPLACE_COMBAT_UNIT":
      return { score: -100, policy: "safe.never-unplace" };
    case "RETREAT_FROM_COMBAT":
    case "SURRENDER_COMBAT":
    case "GIVE_UP_COMBAT":
    case "GIVE_UP":
      return { score: -900, policy: "last-resort.exit" };
    default:
      return { score: 0, policy: "foundation.stable-fallback" };
  }
}

function tieValue(seed: string, action: LegalAction): number {
  const text = `${seed}|${canonicalActionKey(action.action)}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Voluntary mulligan tuning. The start-of-turn refresh draws back UP TO the
 * hand limit after the discards, and drawCardsForPlayer reshuffles the discard
 * pile into an empty deck — so cycling a junk card is a free exchange for a
 * fresh draw (round 1 even returns it to the own deck's bottom). Every seat
 * cycles true junk; a Necropolis seat that does not yet HOLD a playable
 * Necromancy card (the printed ability or a Vidomina specialty — both are
 * NECROMANCY_REINFORCE) digs harder for its faction engine.
 */
const VOLUNTARY_CYCLE_MAX = 3;
const JUNK_CYCLE_THRESHOLD = 30;
const NECROMANCY_HUNT_THRESHOLD = 46;

function holdsPlayableNecromancy(
  observation: ComputerObservation,
): boolean {
  const player = observation.state.players[observation.playerId];
  if (!player) return false;
  // A Necropolis hero may play ANY Necromancy copy in hand — the printed board
  // card OR one searched/drawn from the shared Ability deck (wiki p.24; only a
  // NON-Necropolis holder keeps an unplayable copy). Holding any counts as the
  // faction engine being in hand, so the mulligan hunt ends.
  return player.hand.some(
    (cardId) => cardLibrary[cardId]?.effect.type === "NECROMANCY_REINFORCE",
  );
}

function wantsOpeningNecromancy(observation: ComputerObservation): boolean {
  const state = observation.state as unknown as GameState;
  if (state.round !== 1 || !hasNecromancyPlan(state, observation.playerId)) return false;
  const player = state.players[observation.playerId];
  const upgrades = player.army.filter(unit => unit.side === "few" &&
    ["necropolis.wraiths", "necropolis.zombies"].includes(unit.unitDefId)).length;
  const held = player.hand.filter(id => cardLibrary[id]?.effect.type === "NECROMANCY_REINFORCE").length;
  // Keep the first copy and dig for the second: two opening victories can
  // pay for both remaining Bronze Packs, not just the Wraith.
  return held < Math.max(1, Math.min(2, upgrades));
}

function voluntaryCycleThreshold(observation: ComputerObservation): number {
  const player = observation.state.players[observation.playerId];
  if (
    player?.factionId === "necropolis" &&
    !holdsPlayableNecromancy(observation)
  ) {
    return NECROMANCY_HUNT_THRESHOLD;
  }
  return JUNK_CYCLE_THRESHOLD;
}

/**
 * REFRESH_HAND is offered as a bare template (discardCardIds: []), but a hand
 * over the limit MUST discard down in the same action (the handler rejects an
 * insufficient list). Deterministic pick: lowest cardHandValue first (dump
 * junk, keep artifacts/spells/saves), with stable hand-order ties. On top of
 * the forced overflow, the AI voluntarily cycles low-value cards — on every
 * refresh window, not just an over-limit one, so a planned fight or the
 * Necropolis engine hunt can rebuild the hand — bounded by
 * VOLUNTARY_CYCLE_MAX (or the hand limit when hunting/fight-prepping) and by
 * the real replacement supply deckCount+discard, so an empty library never
 * churns the same cards. effectiveHandLimit only reads public fields plus the
 * viewer's own hand, so the redacted view is a safe stand-in for the state.
 */
function withRefreshDiscards(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "REFRESH_HAND" | "OPENING_HAND_MULLIGAN" }>,
): GameAction {
  const player = observation.state.players[observation.playerId];
  if (!player) {
    return action;
  }
  const limit = effectiveHandLimit(
    observation.state as unknown as GameState,
    observation.playerId,
  );
  const overflow = action.type === "REFRESH_HAND" ? Math.max(0, player.hand.length - limit) : 0;
  const state = observation.state as unknown as GameState;
  // Respect draw-before-discard Explorers and the separate full opening mulligan.
  if (action.type === "REFRESH_HAND" && !player.needsHandRefresh &&
      (explorersHandStepActive(state) || (state.round === 1 && player.hand.length >= limit))) return action;
  const openingNecromancyHunt = wantsOpeningNecromancy(observation);
  const necromancyHunt = hasNecromancyPlan(state, observation.playerId) && !holdsPlayableNecromancy(observation) &&
    player.army.some(unit=>unit.side==="few" && unit.unitDefId.startsWith("necropolis."));
  const prepareFight = !explorersHandStepActive(state) && Boolean(upcomingFight(observation));
  const ranked = player.hand
    .map((cardId, index) => ({
      cardId,
      index,
      value: cardHandValue(cardId, observation),
    }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const discards = ranked.slice(0, overflow);

  const orphanedMagic = ranked.some(entry => entry.value <= 12 &&
    ["ADD_SPELL_POWER", "RECALL_SPELL", "SET_SPELL_POWER_MAX"].includes(cardLibrary[entry.cardId]?.effect.type));
  // The Necromancy hunt must stay below cardHandValue's explicit keep floors
  // (Learning / First Aid Tent / Diplomacy at 70) or it dumps exactly the
  // cards the fight-preparation valuation just protected.
  const threshold = openingNecromancyHunt ? Infinity : necromancyHunt ? 70 : prepareFight ? 50 : voluntaryCycleThreshold(observation);
  // Underfilled hands already consume replacement cards before any cycling.
  const supply = Math.max(0, (player.deckCount ?? 0) + player.discard.length -
    (action.type === "REFRESH_HAND" ? Math.max(0, limit - player.hand.length) : 0));
  for (const entry of ranked.slice(overflow)) {
    const voluntary = discards.length - overflow;
    if (voluntary >= (openingNecromancyHunt || prepareFight || orphanedMagic ? limit : VOLUNTARY_CYCLE_MAX) || voluntary >= supply) break;
    if (entry.cardId === "spell.magic_arrow" || cardLibrary[entry.cardId]?.effect.type === "NECROMANCY_REINFORCE") continue;
    if (entry.value >= threshold) break;
    discards.push(entry);
  }
  if (discards.length === 0) {
    return action;
  }
  return {
    ...action,
    discardCardIds: discards.map((entry) => entry.cardId),
  };
}

/**
 * Offline self-play knobs. Production callers pass nothing: the chooser stays
 * the deterministic policy with every committed learned model applied.
 */
export type ChooseComputerActionOptions = {
  /** Which committed learned models bias close choices (default "all"). */
  learned?: LearnedModelSelection;
  /**
   * Self-play exploration: with probability `rate` pick uniformly among the
   * CLOSE candidates (same action type, within the learned-bias band, above
   * the safety floor) instead of the top one. Exploration can never reach a
   * mandatory exit, a lethal-save band or a rejected action — those are
   * outside the band by construction, exactly like the learned bias.
   */
  explore?: { rate: number; random: () => number };
  /**
   * Self-play instrumentation: receives the close candidate set (best first,
   * learned bias applied) whenever more than one candidate is close. Lets an
   * offline lab roll each alternative out; never changes the decision.
   */
  onClose?: (close: ReadonlyArray<GameAction>) => void;
};

/**
 * Total deterministic policy. Context policies handle strategic decisions and
 * the foundation score remains the terminating fallback for every legal set.
 */
export function chooseComputerAction(
  observation: ComputerObservation,
  options: ChooseComputerActionOptions = {},
): ComputerDecision | null {
  const candidates = observation.legalActions.filter(
    (legal) => !NEVER_AUTOMATE.has(legal.action.type),
  );
  if (candidates.length === 0) {
    return null;
  }
  const tieSeed = `${observation.state.seed}|${observation.state.round}|${observation.state.eventCounter ?? 0}|${observation.playerId}`;
  const vouchers = observation.state.players[observation.playerId]?.recruitDiscounts ?? [];
  const ranked = candidates
    .map((legal) => {
      // Priority: mandatory choices → cards/spells/reactions → combat → map →
      // foundation. Each scorer returns null for actions it does not handle.
      const strategic =
        scoreChoiceAction(observation, legal.action) ??
        scoreCardAction(observation, legal.action) ??
        scoreCombatAction(observation, legal.action) ??
        scoreMapAction(observation, legal.action);
      const base = strategic ?? foundationScore(legal.action);
      const planBias = base.score > 300 && base.score < 900
        ? developmentPlanBias(observation.state as unknown as GameState, observation.playerId, legal.action, observation.memory?.developmentPlan) : 0;
      const scored = { ...base, score: base.score + planBias };
      if (base.score > 300 && legal.action.type === "POPULATION_ACTION" && legal.action.purchases.some(purchase =>
        vouchers.some(({ target }) => target.kind === purchase.kind && (target.kind === "recruit"
          ? target.unitDefId === purchase.unitDefId
          : purchase.kind !== "recruit" && target.armyUnitId === purchase.armyUnitId)))) {
        scored.score = Math.max(scored.score, 1_090);
        scored.policy = "card.spend-legion-before-moving";
      }
      if ((legal.action.type === "REFRESH_HAND" || legal.action.type === "OPENING_HAND_MULLIGAN") && upcomingFight(observation) &&
          !explorersHandStepActive(observation.state as unknown as GameState)) {
        scored.score = 1_040;
        scored.policy = "card.refresh-before-fight";
      }
      if ((legal.action.type === "REFRESH_HAND" || legal.action.type === "OPENING_HAND_MULLIGAN") &&
          wantsOpeningNecromancy(observation)) {
        scored.score = 1_045;
        scored.policy = "card.opening-necromancy-hunt";
      }
      // Preserve returns toward a concrete payoff and forced unblocking, but
      // exploration's high score cannot exempt an empty repeated route.
      if (repeatsUnproductiveRoute(observation.state as unknown as GameState, observation.playerId, legal.action, observation.memory) &&
          base.policy !== "map.clear-shared-space" &&
          !(base.score > 300 && returnsTowardPayoff(observation, legal.action))) {
        scored.score = 100;
        scored.policy = "map.replan-repeated-route";
      }
      // A computer under human attack must exhaust every useful, finite
      // pre-battle preparation it can legally make before readying up. The prep
      // action set contains town purchases and map-card plays only; destructive
      // permanent discards stay below this floor. Once those actions consume
      // their card/token/resource and disappear, Accept becomes the winner.
      const delayingPrepExit =
        Boolean(observation.state.combat?.prep) &&
        (
          legal.action.type === "ACCEPT_COMBAT" ||
          legal.action.type === "RETREAT_FROM_COMBAT" ||
          legal.action.type === "SURRENDER_COMBAT" ||
          legal.action.type === "GIVE_UP_COMBAT"
        );
      return {
        legal,
        ...scored,
        // Only ACCEPT sits AT the floor: the escapes must stay strictly below
        // it, or once no prep action remains the exit would be decided by the
        // tie hash and a healthy defender could retreat from a winnable fight.
        ...(delayingPrepExit
          ? legal.action.type === "ACCEPT_COMBAT"
            ? { score: 225, policy: "combat.prepare-before-exit" }
            : { score: Math.min(scored.score, 224), policy: "combat.prepare-before-exit" }
          : {}),
        tie: tieValue(tieSeed, legal),
      };
    });
  // Finish finite, useful card preparation before the march can start a fight.
  // Required choices, combat actions and emergency route clearing retain priority.
  const preparingFight = !observation.state.combat && upcomingFight(observation) && ranked.some(candidate =>
    candidate.score >= 1_000 && (candidate.legal.action.type === "PLAY_CARD" || candidate.legal.action.type === "CAST_SPELL"));
  if (preparingFight || ranked.some(candidate => candidate.policy === "card.spend-legion-before-moving")) {
    for (const candidate of ranked) {
      if ((candidate.legal.action.type === "MOVE_HERO" || candidate.legal.action.type === "MOVE_HERO_PATH" ||
          candidate.legal.action.type === "END_TURN") && candidate.policy !== "map.clear-shared-space") {
        candidate.score = Math.min(candidate.score, 950);
      }
    }
  }
  ranked.sort(
      (a, b) =>
        b.score - a.score ||
        b.tie - a.tie ||
        canonicalActionKey(a.legal.action).localeCompare(
          canonicalActionKey(b.legal.action),
        ),
    );
  const selected = ranked[0];
  // Learned correlations only decide close choices of the SAME action type.
  // Never override a mandatory exit, lethal-save band, or safety rejection.
  const close = ranked.filter(candidate => candidate.legal.action.type === selected.legal.action.type && selected.score - candidate.score <= 12 && candidate.score > 300);
  const learnedModels = options.learned ?? "all";
  if (learnedModels !== "none") {
    for (const candidate of close) candidate.score += learnedActionBias(observation, candidate.legal.action, learnedModels);
  }
  close.sort((a, b) => b.score - a.score || b.tie - a.tie);
  let learnedSelected = close[0] ?? selected;
  if (close.length > 1) options.onClose?.(close.map(candidate => candidate.legal.action));
  const explore = options.explore;
  if (explore && close.length > 1 && explore.rate > 0 && explore.random() < explore.rate) {
    const pick = Math.min(close.length - 1, Math.max(0, Math.floor(explore.random() * close.length)));
    learnedSelected = { ...close[pick], policy: `explore:${close[pick].policy}` };
  }
  const action =
    learnedSelected.legal.action.type === "REFRESH_HAND" || learnedSelected.legal.action.type === "OPENING_HAND_MULLIGAN"
      ? withRefreshDiscards(observation, learnedSelected.legal.action)
      : learnedSelected.legal.action;
  return {
    playerId: observation.playerId,
    action,
    policy:
      candidates.length === 1 ? "forced.only-legal-action" : learnedSelected.policy,
    score: learnedSelected.score,
  };
}
