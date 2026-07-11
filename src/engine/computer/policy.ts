import type { GameAction, LegalAction } from "../state";
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

const NEVER_AUTOMATE = new Set<GameAction["type"]>([
  "SET_GAME_OPTIONS",
  "SET_COMPUTER_OPPONENTS",
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
      return { score: 1_100, policy: "mandatory.resolve-choice" };
    case "PASS_REACTION":
      return { score: 1_050, policy: "safe.pass-reaction" };
    case "RANDOM_ASSIGN_SEAT":
    case "ROLL_TOWN_OPTIONS":
    case "ROLL_HERO_OPTIONS":
    case "CHOOSE_TOWN":
    case "CHOOSE_FACTION":
    case "BAN_HERO":
      return { score: 1_000, policy: "setup.complete-seat" };
    case "ACKNOWLEDGE_COMBAT_END":
    case "FINISH_COMBAT_PLACEMENT":
    case "FINISH_TACTICS":
    case "ACCEPT_COMBAT":
      return { score: 900, policy: "mandatory.finish-stage" };
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
    case "COMPLETE_SIMULTANEOUS_TURN":
    case "END_TURN":
      return { score: 300, policy: "safe.end-turn" };
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
 * Deliberately conservative foundation policy. It is total and terminating,
 * but map/economy/combat heuristics must replace its generic fallback before UI release.
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
    .map((legal) => ({
      legal,
      ...foundationScore(legal.action),
      tie: tieValue(tieSeed, legal),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.tie - a.tie ||
        canonicalActionKey(a.legal.action).localeCompare(
          canonicalActionKey(b.legal.action),
        ),
    );
  const selected = ranked[0];
  return {
    playerId: observation.playerId,
    action: selected.legal.action,
    policy:
      candidates.length === 1 ? "forced.only-legal-action" : selected.policy,
    score: selected.score,
  };
}
