import { effectiveHandLimit } from "../adventure";
import type { GameAction, GameState, LegalAction } from "../state";
import { cardKeepValue, scoreCardAction } from "./card-policy";
import { scoreChoiceAction } from "./choice-policy";
import { scoreCombatAction } from "./combat-policy";
import { scoreMapAction } from "./map-policy";
import type { ComputerDecision, ComputerObservation } from "./types";

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
    case "CHOOSE_FACTION":
    case "BAN_HERO":
      return { score: 1_000, policy: "setup.complete-seat" };
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
 * REFRESH_HAND is offered as a bare template (discardCardIds: []), but a hand
 * over the limit MUST discard down in the same action (the handler rejects an
 * insufficient list). Deterministic pick: lowest cardKeepValue first (dump
 * junk, keep artifacts/spells/saves), with stable hand-order ties.
 * effectiveHandLimit only reads public fields plus the viewer's own hand, so
 * the redacted view is a safe stand-in for the full state.
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
  if (overflow === 0) {
    return action;
  }
  const ranked = player.hand
    .map((cardId, index) => ({ cardId, index, value: cardKeepValue(cardId) }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  return {
    ...action,
    discardCardIds: ranked.slice(0, overflow).map((entry) => entry.cardId),
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
      return {
        legal,
        ...(strategic ?? foundationScore(legal.action)),
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
  const action =
    selected.legal.action.type === "REFRESH_HAND"
      ? withRefreshDiscards(observation, selected.legal.action)
      : selected.legal.action;
  return {
    playerId: observation.playerId,
    action,
    policy:
      candidates.length === 1 ? "forced.only-legal-action" : selected.policy,
    score: selected.score,
  };
}
