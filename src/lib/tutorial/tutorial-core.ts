/**
 * Deterministic core of the scripted tutorial game — shared VERBATIM by the
 * offline recorder (scripts/tutorial/record-tutorial.mjs) and the in-browser
 * tutorial room (tutorial-room.ts), so a recorded game replays identically.
 *
 * Determinism contract (see src/engine/random.ts): applyAction WITHOUT
 * `entropy` derives every roll, shuffle and draw from `state.seed` plus the
 * state's own counters, and without `now` no wall clock reaches the state. The
 * tutorial therefore never passes either. `actorClientId` only feeds the room
 * seat guard, and member names / client ids never feed randomness, so the
 * player's real client id and display name can replace the recorder's.
 */
import {
  applyAction,
  createAdventureLobbyState,
  type EngineResult,
  type GameAction,
  type GameDifficulty,
  type GameState,
  type PlayerId,
} from "@/engine";

/** Seat ids of the tutorial table. */
export const TUTORIAL_PLAYER: PlayerId = "p1";
export const TUTORIAL_COMPUTER: PlayerId = "p2";

/** The recorder's stand-in client id; the live room substitutes the real one. */
export const TUTORIAL_RECORD_CLIENT_ID = "tutorial-recorder";

export { isTutorialRoomId, TUTORIAL_ROOM_ID, TUTORIAL_ROOM_PREFIX } from "./tutorial-room-id";

/** The lobby configuration the tutorial game is played with. */
export type TutorialSetup = {
  seed: string;
  difficulty: GameDifficulty;
  playerFaction: string;
  playerHero: string;
  computerFaction: string;
  computerHero: string;
};

/**
 * A fresh single-player lobby exactly as the room server builds one
 * (game-room-store.ts makeRoom), but with the script's fixed seed.
 */
export function createTutorialLobby(seed: string): GameState {
  const state = createAdventureLobbyState({ seed, sessionMode: "single-player", computerOpponents: 1 });
  state.room = { hosted: true, hostClientId: null, members: [], visibility: "private", ranked: false };
  return state;
}

/**
 * The canonical setup actions, applied after the player's JOIN_ROOM. The live
 * room re-plays exactly these when the player presses Start with the target
 * configuration, so whatever else they clicked in the lobby cannot shift the
 * seeded sequence.
 */
export function tutorialSetupActions(setup: TutorialSetup): GameAction[] {
  return [
    { type: "SET_GAME_OPTIONS", playerId: TUTORIAL_PLAYER, options: { difficulty: setup.difficulty } },
    {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: TUTORIAL_PLAYER,
      seatPlayerId: TUTORIAL_COMPUTER,
      choice: { factionId: setup.computerFaction, heroDefId: setup.computerHero },
    },
    { type: "CHOOSE_FACTION", playerId: TUTORIAL_PLAYER, factionId: setup.playerFaction, heroDefId: setup.playerHero },
    { type: "START_ADVENTURE", playerId: TUTORIAL_PLAYER },
  ] as GameAction[];
}

/** Deterministic apply: no entropy, no clock. */
export function tutorialApply(
  state: GameState,
  action: GameAction,
  actor: { kind: "human"; clientId?: string } | { kind: "computer"; playerId: PlayerId },
): EngineResult {
  return actor.kind === "computer"
    ? applyAction(state, action, { computerActorPlayerId: actor.playerId })
    : applyAction(state, action, actor.clientId ? { actorClientId: actor.clientId } : {});
}

/** Keys that differ between the recorder and a live player without touching play. */
const FINGERPRINT_SKIP = new Set(["room", "computerMemory", "name", "displayName", "clientId", "hostClientId", "ownerClientId", "idleSince", "lastActionAt"]);

/**
 * Small hash of the game-relevant state, stored per recorded step. The live
 * room compares it after every step; a mismatch means this build's rules no
 * longer reproduce the recording (the coach then says so honestly instead of
 * teaching moves that are no longer right).
 */
export function tutorialFingerprint(state: GameState): string {
  const text = JSON.stringify(state, (key, value) => (FINGERPRINT_SKIP.has(key) ? undefined : value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** One recorded decision of the tutorial game. */
export type TutorialStep = {
  by: "human" | "computer";
  playerId: PlayerId;
  action: GameAction;
  /** tutorialFingerprint of the state AFTER this step. */
  hash: string;
  round: number;
};

export type TutorialScript = {
  id: string;
  engineSignature: string;
  setup: TutorialSetup;
  /** Fingerprint right after START_ADVENTURE (canonical setup applied). */
  startHash: string;
  steps: TutorialStep[];
  summary: { rounds: number; winner: PlayerId | null };
};

/** Build the state right after the canonical setup (join + setup + start). */
export function tutorialStartState(
  setup: TutorialSetup,
  join: { clientId: string; name: string },
): EngineResult {
  let state = createTutorialLobby(setup.seed);
  const actions: GameAction[] = [
    { type: "JOIN_ROOM", clientId: join.clientId, name: join.name } as GameAction,
    ...tutorialSetupActions(setup),
  ];
  let last: EngineResult = { state, events: [], errors: [] };
  for (const action of actions) {
    last = tutorialApply(state, action, { kind: "human", clientId: join.clientId });
    if (last.errors.length) return last;
    state = last.state;
  }
  return last;
}
