import { cardLibrary } from "@/data/cards/library";
import { effectiveHandLimit } from "../adventure";
import type { GameAction, GameState, LegalAction } from "../state";
import { cardKeepValue, scoreCardAction } from "./card-policy";
import { heroPickBias } from "./card-values";
import { scoreChoiceAction } from "./choice-policy";
import { scoreCombatAction } from "./combat-policy";
import { scoreMapAction } from "./map-policy";
import type { ComputerDecision, ComputerObservation } from "./types";
import { learnedActionBias } from "./learned-policy";
import { developmentPlanBias } from "./development-plan";
import { repeatsUnproductiveRoute } from "./memory";

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
 * only REFRESH_HAND, whose discardCardIds are the policy's own pick.
 */
export function legalityMatchKey(action: GameAction): string {
  if (action.type === "REFRESH_HAND") {
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
 * insufficient list). Deterministic pick: lowest cardKeepValue first (dump
 * junk, keep artifacts/spells/saves), with stable hand-order ties. On top of
 * the forced overflow, the AI voluntarily cycles low-value cards (bounded by
 * VOLUNTARY_CYCLE_MAX and by the real replacement supply deckCount+discard,
 * so an empty library never churns the same cards). effectiveHandLimit only
 * reads public fields plus the viewer's own hand, so the redacted view is a
 * safe stand-in for the full state.
 */
function withRefreshDiscards(
  observation: ComputerObservation,
  action: Extract<GameAction, { type: "REFRESH_HAND" }>,
): GameAction {
  const player = observation.state.players[observation.playerId];
  if (!player?.needsHandRefresh) {
    return action;
  }
  const limit = effectiveHandLimit(
    observation.state as unknown as GameState,
    observation.playerId,
  );
  const overflow = Math.max(0, player.hand.length - limit);
  const ranked = player.hand
    .map((cardId, index) => ({
      cardId,
      index,
      value: cardKeepValue(cardId, observation),
    }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const discards = ranked.slice(0, overflow);
  const threshold = voluntaryCycleThreshold(observation);
  const supply = (player.deckCount ?? 0) + player.discard.length;
  for (const entry of ranked.slice(overflow)) {
    const voluntary = discards.length - overflow;
    if (voluntary >= VOLUNTARY_CYCLE_MAX || voluntary >= supply) break;
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
 * Total deterministic policy. Context policies handle strategic decisions and
 * the foundation score remains the terminating fallback for every legal set.
 */
export function chooseComputerAction(
  observation: ComputerObservation,
): ComputerDecision | null {
  const candidates = observation.legalActions.filter(
    (legal) => !NEVER_AUTOMATE.has(legal.action.type),
  );
  if (candidates.length === 0) {
    return null;
  }
  const tieSeed = `${observation.state.seed}|${observation.state.round}|${observation.state.eventCounter ?? 0}|${observation.playerId}`;
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
      if (repeatsUnproductiveRoute(observation.state as unknown as GameState, observation.playerId, legal.action, observation.memory)) {
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
    })
    .sort(
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
  for (const candidate of close) candidate.score += learnedActionBias(observation, candidate.legal.action);
  close.sort((a, b) => b.score - a.score || b.tie - a.tie);
  const learnedSelected = close[0] ?? selected;
  const action =
    learnedSelected.legal.action.type === "REFRESH_HAND"
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
