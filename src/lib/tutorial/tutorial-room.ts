/**
 * The in-browser tutorial room: a RoomConnection (see realtime.ts) that the
 * normal table page talks to for `tutorial-…` room ids, so the tutorial is the
 * REAL game UI on the REAL engine — only the "server" is local.
 *
 * - Lobby: the player's setup clicks are applied to a scratch lobby for
 *   display. Start is accepted once the tutorial match is configured
 *   (Necropolis + hero vs the Castle computer, difficulty); the room then
 *   builds the canonical start state (tutorial-core), so extra lobby clicks can
 *   never shift the seeded game.
 * - Game: the recorded script (src/data/tutorial/tutorial-script.json) is the
 *   authority. A player action is accepted only when it is the next scripted
 *   human step; the scripted action itself is applied. Recorded computer steps
 *   are then played out with the server's pacing. Every step's fingerprint is
 *   checked against the recording; on any mismatch the room says so and falls
 *   back to FREE play against the live, deterministic AI — never a frozen or
 *   silently different lesson.
 * - Progress (step + a state checkpoint) is kept in localStorage, so a reload
 *   resumes the same game.
 */
import {
  combatHasHumanParticipant,
  computerDecisionOwner,
  ENGINE_SIGNATURE,
  redactStateForSeat,
  type EngineResult,
  type GameAction,
  type GameState,
} from "@/engine";
import type { GameRoomSnapshot, RoomConnection, RoomConnectionHandlers } from "@/lib/realtime";
import type { driveComputerPlayers as DriveComputerPlayers } from "@/server/computer-runner";
import {
  createTutorialLobby,
  TUTORIAL_COMPUTER,
  TUTORIAL_PLAYER,
  tutorialApply,
  tutorialFingerprint,
  tutorialStartState,
  type TutorialScript,
  type TutorialStep,
} from "./tutorial-core";
import { markTutorialCompleted, readTutorialProgress, writeTutorialProgress } from "./tutorial-preference";
import { getTutorialStatus, setTutorialStatus } from "./tutorial-store";

const CHECKPOINT_KEY = "binh-tutorial-checkpoint";
const MAP_STEP_MS = 900;
const COMBAT_STEP_MS = 480;

/** Actions the table may send that carry no game decision: acknowledged, never applied. */
const NO_OP_ACTIONS = new Set(["SEND_CHAT", "SEND_TABLE_REACTION", "ADVANCE_COMPUTER", "LEAVE_ROOM", "SET_ROOM_NAME"]);
/** Lobby actions the scratch lobby may apply for display. */
const LOBBY_ACTIONS = new Set([
  "SET_GAME_OPTIONS",
  "CHOOSE_FACTION",
  "SET_COMPUTER_SEAT_FACTION",
  "SET_COMPUTER_OPPONENTS",
  "SET_DRAFT_FORMAT",
  "ROLL_TOWN_OPTIONS",
  "CHOOSE_TOWN",
  "ROLL_HERO_OPTIONS",
  "RESET_SEAT_DRAFT",
  "RANDOM_ASSIGN_SEAT",
]);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined && key !== "parallelContextId")
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

type Loose = Record<string, unknown>;
const sortedIds = (value: unknown) => (Array.isArray(value) ? [...value].map(String).sort() : value);

/**
 * Does the player's action pick the same decision as the recorded one? The
 * room then applies the RECORDED action, so these equivalences only decide
 * acceptance; they list the ways the table UI legitimately phrases the same
 * decision differently:
 * - a click on an adjacent field sends MOVE_HERO_PATH { path: [to] } for the
 *   recorded single-step MOVE_HERO;
 * - discard lists come out in click order;
 * - a face-down tile / far-tile slot reachable by both heroes may carry the
 *   other hero's id (the recorded hero is the one used).
 */
export function matchesScriptedAction(sent: GameAction, scripted: GameAction): boolean {
  if (stable(sent) === stable(scripted)) return true;
  const a = sent as unknown as Loose;
  const b = scripted as unknown as Loose;
  if (b.type === "MOVE_HERO" && a.type === "MOVE_HERO_PATH") {
    const route = Array.isArray(a.path) ? (a.path as string[]) : [];
    return a.heroId === b.heroId && route.length >= 1 && route.length <= 2 && route[route.length - 1] === b.to;
  }
  if (a.type !== b.type) return false;
  if (a.type === "REFRESH_HAND" || a.type === "OPENING_HAND_MULLIGAN") {
    return stable({ ...a, discardCardIds: sortedIds(a.discardCardIds) }) === stable({ ...b, discardCardIds: sortedIds(b.discardCardIds) });
  }
  if (a.type === "DISCOVER_TILE" || a.type === "PLACE_TILE") {
    return stable({ ...a, heroId: null }) === stable({ ...b, heroId: null });
  }
  return false;
}

let scriptPromise: Promise<TutorialScript> | null = null;
export function loadTutorialScript(): Promise<TutorialScript> {
  scriptPromise ??= import("@/data/tutorial/tutorial-script.json").then(
    (module) => ((module as { default?: unknown }).default ?? module) as unknown as TutorialScript,
  );
  return scriptPromise;
}

type Room = {
  roomId: string;
  script: TutorialScript;
  state: GameState;
  version: number;
  mode: "lobby" | "script" | "free" | "done";
  step: number;
  join: { clientId: string; name: string } | null;
  handlers: Set<RoomConnectionHandlers>;
  timer: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Promise<Room>>();

/**
 * The live computer AI is only needed after the room leaves the script (free
 * play), so it is loaded on demand instead of weighing on the tutorial's first
 * load.
 */
let liveDriver: typeof DriveComputerPlayers | null = null;
let liveDriverLoading: Promise<void> | null = null;
function loadLiveDriver(): Promise<void> {
  liveDriverLoading ??= import("@/server/computer-runner").then((module) => {
    liveDriver = module.driveComputerPlayers;
  });
  return liveDriverLoading;
}

function publishStatus(room: Room, patch: Partial<ReturnType<typeof getTutorialStatus>> = {}) {
  const next = room.script.steps[room.step];
  setTutorialStatus({
    mode: room.mode,
    roomId: room.roomId,
    scriptId: room.script.id,
    setup: room.script.setup,
    step: room.step,
    totalSteps: room.script.steps.length,
    expected: room.mode === "script" && next?.by === "human" ? next : null,
    computerThinking: room.mode === "script" && next?.by === "computer",
    lobbyIssues: room.mode === "lobby" ? lobbyIssues(room) : [],
    ...patch,
  });
}

function snapshotOf(room: Room): GameRoomSnapshot {
  const state = room.state.room?.hosted ? redactStateForSeat(room.state, TUTORIAL_PLAYER) : room.state;
  return {
    roomId: room.roomId,
    version: room.version,
    updatedAt: new Date().toISOString(),
    state,
    serverSignature: ENGINE_SIGNATURE,
  };
}

function broadcast(room: Room) {
  const snapshot = snapshotOf(room);
  room.handlers.forEach((handlers) => handlers.onSnapshot(snapshot));
}

function commit(room: Room, state: GameState) {
  room.state = state;
  room.version += 1;
}

function saveProgress(room: Room) {
  if (room.mode !== "script" && room.mode !== "free" && room.mode !== "done") return;
  writeTutorialProgress({ scriptId: room.script.id, step: room.step });
  try {
    window.localStorage.setItem(
      CHECKPOINT_KEY,
      JSON.stringify({ scriptId: room.script.id, step: room.step, mode: room.mode, state: room.state }),
    );
  } catch {
    // Quota / private mode: a reload replays the script from the start state instead.
  }
}

/** What in the scratch lobby still differs from the tutorial match. */
function lobbyIssues(room: Room): string[] {
  const { setup } = room.script;
  const issues: string[] = [];
  // Lobby picks and options live on state.setupLobby until the game starts.
  const lobby = room.state.setupLobby;
  const seat = (playerId: string) => lobby?.seats.find((entry) => entry.playerId === playerId);
  const you = seat(TUTORIAL_PLAYER);
  const cpu = seat(TUTORIAL_COMPUTER);
  if (you?.factionId !== setup.playerFaction || you?.heroDefId !== setup.playerHero) issues.push("player-faction");
  if (cpu?.factionId !== setup.computerFaction || cpu?.heroDefId !== setup.computerHero) issues.push("computer-faction");
  if (lobby?.options?.difficulty !== setup.difficulty) issues.push("difficulty");
  return issues;
}

function error(message: string, code = "TUTORIAL_OFF_SCRIPT"): EngineResult["errors"] {
  return [{ code, message }] as EngineResult["errors"];
}

function leaveScript(room: Room, reason: string) {
  room.mode = "free";
  publishStatus(room, { divergence: reason });
  saveProgress(room);
}

function finishIfWon(room: Room) {
  if (room.state.adventure?.winnerPlayerId === TUTORIAL_PLAYER) {
    room.mode = "done";
    markTutorialCompleted();
  }
}

/** Apply one recorded step; false (and FREE mode) when the recording no longer holds. */
function applyStep(room: Room, step: TutorialStep): boolean {
  const actor =
    step.by === "computer"
      ? ({ kind: "computer", playerId: step.playerId } as const)
      : ({ kind: "human", clientId: room.join?.clientId } as const);
  const result = tutorialApply(room.state, step.action, actor);
  if (result.errors.length) {
    leaveScript(room, `This version of the game no longer accepts the recorded move ${step.action.type} (step ${room.step + 1}).`);
    return false;
  }
  commit(room, result.state);
  room.step += 1;
  if (tutorialFingerprint(room.state) !== step.hash) {
    leaveScript(room, `This version of the game plays out differently from the recording (step ${room.step}).`);
    return false;
  }
  if (room.step >= room.script.steps.length) {
    finishIfWon(room);
    if (room.mode !== "done") leaveScript(room, "The recorded lesson is over; play on freely.");
  }
  return true;
}

function nextDelay(room: Room): number {
  return room.state.combat ? COMBAT_STEP_MS : MAP_STEP_MS;
}

/** Play out owed computer work: recorded steps in script mode, the live AI in free mode. */
function pumpComputer(room: Room) {
  if (room.timer) return;
  const owesScripted = () => room.mode === "script" && room.script.steps[room.step]?.by === "computer";
  const owesLive = () => room.mode === "free" && computerDecisionOwner(room.state) === TUTORIAL_COMPUTER;
  if (!owesScripted() && !owesLive()) return;
  if (owesLive() && !liveDriver) {
    void loadLiveDriver().then(() => pumpComputer(room));
    return;
  }
  room.timer = setTimeout(() => {
    room.timer = null;
    // AI-only fights (the computer vs neutrals) resolve in one visible beat, as on the server.
    let guard = 0;
    do {
      if (owesScripted()) {
        if (!applyStep(room, room.script.steps[room.step])) break;
      } else if (owesLive()) {
        const run = liveDriver!(room.state, (s, a, p) => tutorialApply(s, a, { kind: "computer", playerId: p }), {
          maxSteps: 1,
        });
        if (!run.decisions.length) break;
        commit(room, run.state);
      } else {
        break;
      }
      guard += 1;
    } while (guard < 400 && room.state.combat && !combatHasHumanParticipant(room.state) && !room.state.combat.outcome);
    finishIfWon(room);
    broadcast(room);
    publishStatus(room);
    saveProgress(room);
    pumpComputer(room);
  }, nextDelay(room));
  publishStatus(room);
}

function startScript(room: Room): EngineResult["errors"] {
  if (!room.join) return error("Join the table first.", "TUTORIAL_NOT_JOINED");
  const start = tutorialStartState(room.script.setup, room.join);
  if (start.errors.length) {
    room.mode = "free";
    return start.errors;
  }
  commit(room, start.state);
  room.step = 0;
  room.mode = "script";
  if (tutorialFingerprint(room.state) !== room.script.startHash) {
    leaveScript(room, "This version of the game sets the map up differently from the recording.");
  }
  return [];
}

function submit(room: Room, action: GameAction, actorClientId?: string): EngineResult["errors"] {
  if (NO_OP_ACTIONS.has(action.type)) return [];
  if (action.type === "UNDO_MOVE") return error("Undo is not available in the tutorial.");
  if (action.type === "GIVE_UP" || action.type === "LEAVE_GAME") {
    return error("To stop, use Exit tutorial on Sandro's panel — your progress is kept.");
  }

  if (action.type === "JOIN_ROOM") {
    if (room.join || room.state.room?.members.some((member) => member.clientId === action.clientId)) return [];
    const result = tutorialApply(room.state, action, { kind: "human", clientId: action.clientId });
    if (result.errors.length) return result.errors;
    room.join = { clientId: action.clientId, name: action.name };
    commit(room, result.state);
    return [];
  }

  if (room.mode === "lobby") {
    if (action.type === "START_ADVENTURE") {
      const issues = lobbyIssues(room);
      if (issues.length) {
        return error("Set up the tutorial match first — follow Sandro's steps.", "TUTORIAL_LOBBY");
      }
      return startScript(room);
    }
    if (!LOBBY_ACTIONS.has(action.type)) return error("That is not part of the tutorial setup.", "TUTORIAL_LOBBY");
    const result = tutorialApply(room.state, action, { kind: "human", clientId: actorClientId });
    if (!result.errors.length) commit(room, result.state);
    return result.errors;
  }

  if (room.mode === "script") {
    const next = room.script.steps[room.step];
    if (!next || next.by !== "human") return error("Sandro: patience — the computer is still moving.", "TUTORIAL_WAIT");
    if (!matchesScriptedAction(action, next.action)) {
      publishStatus(room, { rejected: { action, at: Date.now() } });
      return error("Sandro: not that one yet — follow the pointer (or press “Watch how”).");
    }
    applyStep(room, next);
    finishIfWon(room);
    return [];
  }

  // Free / done: ordinary play against the live AI.
  const result = tutorialApply(room.state, action, { kind: "human", clientId: actorClientId });
  if (!result.errors.length) {
    commit(room, result.state);
    finishIfWon(room);
  }
  return result.errors;
}

function restoreCheckpoint(script: TutorialScript): { state: GameState; step: number; mode: Room["mode"] } | null {
  const progress = readTutorialProgress();
  if (!progress || progress.scriptId !== script.id) return null;
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_KEY);
    const saved = raw ? (JSON.parse(raw) as { scriptId: string; step: number; mode: Room["mode"]; state: GameState }) : null;
    if (!saved || saved.scriptId !== script.id || saved.step !== progress.step) return null;
    if (saved.mode === "script" && saved.step > 0 && tutorialFingerprint(saved.state) !== script.steps[saved.step - 1]?.hash) {
      return null;
    }
    return { state: saved.state, step: saved.step, mode: saved.mode };
  } catch {
    return null;
  }
}

async function openRoom(roomId: string): Promise<Room> {
  const script = await loadTutorialScript();
  const room: Room = {
    roomId,
    script,
    state: createTutorialLobby(script.setup.seed),
    version: 1,
    mode: "lobby",
    step: 0,
    join: null,
    handlers: new Set(),
    timer: null,
  };
  const saved = restoreCheckpoint(script);
  if (saved) {
    const member = saved.state.room?.members.find((entry) => entry.seat === TUTORIAL_PLAYER);
    room.state = saved.state;
    room.step = saved.step;
    room.mode = saved.mode;
    room.join = member ? { clientId: member.clientId, name: member.name ?? "Player" } : null;
  }
  publishStatus(room);
  return room;
}

function getRoom(roomId: string): Promise<Room> {
  let room = rooms.get(roomId);
  if (!room) {
    room = openRoom(roomId);
    rooms.set(roomId, room);
  }
  return room;
}

/**
 * "Set it up for me": skip the lobby lesson and start the tutorial match at
 * once (the same canonical start the Start button builds). Returns an error
 * message, or null on success.
 */
export async function quickStartTutorial(roomId: string): Promise<string | null> {
  const room = await getRoom(roomId);
  if (room.mode !== "lobby") return null;
  const errors = startScript(room);
  if (errors.length) return errors[0]?.message ?? "Could not start the tutorial.";
  broadcast(room);
  saveProgress(room);
  publishStatus(room);
  pumpComputer(room);
  return null;
}

/** Forget saved progress and start the tutorial over from the setup lobby. */
export function resetTutorialProgress() {
  writeTutorialProgress(null);
  try {
    window.localStorage.removeItem(CHECKPOINT_KEY);
  } catch {
    // ignore
  }
  rooms.clear();
}

export function connectTutorialRoom(
  roomId: string,
  handlers: RoomConnectionHandlers,
  actorClientId?: string,
): RoomConnection {
  let closed = false;
  // Reassigned by resetRoom: later calls must reach the fresh room, not the discarded one.
  let ready: Promise<Room> = getRoom(roomId).then((room) => {
    if (!closed) {
      // A resumed game belongs to whoever sits in the player seat; adopt this
      // browser's client id for it (same browser, the id is per tab session).
      if (room.join && actorClientId && room.join.clientId !== actorClientId && room.state.room) {
        const previous = room.join.clientId;
        room.state = {
          ...room.state,
          room: {
            ...room.state.room,
            hostClientId: actorClientId,
            members: room.state.room.members.map((member) =>
              member.clientId === previous ? { ...member, clientId: actorClientId } : member,
            ),
          },
        };
        room.join = { ...room.join, clientId: actorClientId };
      }
      room.handlers.add(handlers);
      handlers.onStatus("tutorial");
      pumpComputer(room);
    }
    return room;
  });
  const unavailable = async () => {
    throw new Error("Saves are not used in the tutorial — your progress is kept automatically.");
  };
  return {
    close: () => {
      closed = true;
      void ready.then((room) => room.handlers.delete(handlers));
    },
    submitAction: async (action) => {
      const room = await ready;
      const errors = submit(room, action, actorClientId);
      if (!errors.length) {
        broadcast(room);
        saveProgress(room);
        pumpComputer(room);
      }
      publishStatus(room, errors.length ? {} : { rejected: null });
      return { version: room.version, errors, notices: [] };
    },
    resetRoom: async () => {
      const room = await ready;
      if (room.timer) clearTimeout(room.timer);
      room.timer = null;
      resetTutorialProgress();
      const fresh = await getRoom(roomId);
      fresh.handlers = room.handlers;
      // Retire the discarded room: no more pumping, progress writes or broadcasts.
      room.mode = "lobby";
      room.handlers = new Set();
      ready = Promise.resolve(fresh);
      fresh.version = room.version + 1;
      // Keep the player seated in the fresh lobby (the table does not re-join).
      if (room.join) submit(fresh, { type: "JOIN_ROOM", clientId: room.join.clientId, name: room.join.name } as GameAction);
      publishStatus(fresh, { divergence: null, rejected: null });
      const snapshot = snapshotOf(fresh);
      fresh.handlers.forEach((entry) => entry.onSnapshot(snapshot));
      return snapshot;
    },
    fetchSnapshot: async () => snapshotOf(await ready),
    restoreRoom: async () => snapshotOf(await ready),
    fetchSinglePlayerSave: unavailable,
    loadSinglePlayerSave: unavailable,
  };
}
