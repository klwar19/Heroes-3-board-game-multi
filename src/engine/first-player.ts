import { appendEvent } from "./events";
import { createSeededRandom } from "./random";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { FirstPlayerRollState, GameState, PlayerId } from "./state";

type FirstPlayerCandidate = {
  playerId: PlayerId;
  name: string;
};

/**
 * Pure, seeded preview of the opening Attack-die ceremony. Setup uses the
 * result to assign home positions by game order without publishing the roll;
 * the queue commits the same result only after every starting bonus resolves.
 */
export function calculateFirstPlayerRoll(
  candidates: readonly FirstPlayerCandidate[],
  seed: string
): FirstPlayerRollState | null {
  if (candidates.length < 2) {
    return null;
  }

  // `seed` is already baked once during game creation. Never mix the live
  // entropy of a later bonus-resolution action into the delayed commit.
  const random = createSeededRandom(seed, { salt: false });
  const faces = [-1, -1, 0, 0, 1, 1];
  const attempts: FirstPlayerRollState["attempts"] = [];
  let contenders = [...candidates];
  let winnerPlayerId = contenders[0]!.playerId;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rolls = contenders.map(({ playerId, name }) => ({
      playerId,
      name,
      value: faces[random.nextInt(0, faces.length - 1)]!
    }));
    attempts.push({ rolls });

    const best = Math.max(...rolls.map((roll) => roll.value));
    const leaders = rolls.filter((roll) => roll.value === best);
    winnerPlayerId = leaders[0]!.playerId;
    if (leaders.length === 1) {
      break;
    }
    contenders = leaders.map((roll) => ({ playerId: roll.playerId, name: roll.name }));
  }

  return { attempts, winnerPlayerId };
}

/** Clockwise seat order rotated so the rolled winner occupies map position 1. */
export function gameOrderForFirstPlayerRoll(
  playerIds: readonly PlayerId[],
  roll: FirstPlayerRollState | null
): PlayerId[] {
  if (!roll) {
    return [...playerIds];
  }
  const winnerIndex = playerIds.indexOf(roll.winnerPlayerId);
  if (winnerIndex < 0) {
    return [...playerIds];
  }
  return [...playerIds.slice(winnerIndex), ...playerIds.slice(0, winnerIndex)];
}

/** Publishes the ceremony and makes its winner active. */
export function commitFirstPlayerRoll(state: GameState): FirstPlayerRollState | null {
  if (!state.adventure) {
    return null;
  }
  // Reproduce the SETUP-TIME preview exactly: the same candidate list — every
  // seat that started the scenario, in creation order, eliminated seats
  // included — fed to the same stored seed. Rolling over the live turnOrder
  // instead would consume different random values after a mid-bonus
  // elimination and could crown a different winner than the one whose town
  // the preview already placed at map position 1.
  const seatOrder = Object.keys(state.players).filter(
    (playerId) => playerId !== NEUTRAL_PLAYER_ID
  ) as PlayerId[];
  const roll = calculateFirstPlayerRoll(
    seatOrder.map((playerId) => ({
      playerId,
      name: state.players[playerId]?.name ?? playerId
    })),
    state.adventure.openingFirstPlayerSeed ?? `${state.seed}#first-player`
  );
  if (!roll) {
    return null;
  }

  state.adventure.firstPlayerRoll = roll;
  // The roll is presentation with a mechanical boundary: do not let a server-
  // driven computer winner start moving behind it. One human dismissal releases
  // the table. Fully automated fixtures have nobody to dismiss, so do not gate.
  const winnerIsComputer =
    state.controllers?.[roll.winnerPlayerId]?.kind === "computer";
  state.adventure.openingFirstPlayerRollPending =
    winnerIsComputer &&
    Object.keys(state.players).some(
      (playerId) =>
        playerId !== NEUTRAL_PLAYER_ID &&
        state.controllers?.[playerId]?.kind !== "computer" &&
        !state.players[playerId]?.eliminated,
    );
  state.adventure.openingFirstPlayerSeed = undefined;
  // Rotate the FULL seat order to the winner, then keep only still-live seats:
  // when the winner was eliminated during the bonus phase, the next live seat
  // clockwise from them leads, and the map positions still agree.
  const live = new Set(state.turnOrder);
  const rotated = gameOrderForFirstPlayerRoll(seatOrder, roll).filter((playerId) =>
    live.has(playerId)
  );
  if (rotated.length > 0) {
    state.turnOrder = rotated;
    state.activePlayerId = rotated[0]!;
  }
  appendEvent(state, {
    type: "FIRST_PLAYER_ROLLED",
    attempts: roll.attempts,
    winnerPlayerId: roll.winnerPlayerId
  });
  return roll;
}
