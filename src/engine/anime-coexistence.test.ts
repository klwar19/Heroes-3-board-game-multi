import { describe, expect, it } from "vitest";
import {
  applyAction,
  carveFieldOverride,
  createAdventureGameState,
  cultivationRealmOf,
  gainGradeProgress,
  getFieldOverrideDefinition,
  getLegalActions,
  getMainHero,
  heroGradeOf,
  heroGradeProgressOf,
  heroGradeRegisterKey,
  maybeAdvanceCultivationRealm,
  DEFAULT_ANIME_OPTIONS,
  type AdventureSetupOptions,
  type AnimeModOptions,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerId,
} from "@/engine";

/**
 * Cross-mod COEXISTENCE GATES (plan §3.8) — the blanket guarantees that base
 * game + WOG + xianxia + isekai + Polish rules thread together as ONE coherent
 * game (different displays / power systems, one engine). Each gate is
 * mutation-checked where meaningful.
 *
 *   (a) master byte-identical-when-off CONTROL  — this file
 *   (b) the ALL-ON soak (no stall, round 6+)     — src/server/anime-coexistence-soak.test.ts
 *   (c) mixed-package no-cross-talk CONTROL       — this file
 *   (d) display coexistence (jsdom renders)       — src/components/anime-coexistence-display.test.tsx
 */

// ===========================================================================
// A deterministic, self-contained 2-human driver (no computer runner) so the
// byte-identical CONTROL stays in engine-land. Resolve prompts first, then end
// the turn — identical to the soak helper's priority but inlined here.
// ===========================================================================

const PRIORITY: GameAction["type"][] = [
  "SET_TILE_ROTATION",
  "CHOOSE_OPTION",
  "CHOOSE_ABILITY_TARGET",
  "CHOOSE_PENDING_ROLL",
  "RESOLVE_VISIT_STEP",
  "RESOLVE_DECK_SEARCH",
  "RESOLVE_COMBAT_DISCARD",
  "COMMANDER_FIRST_AID",
  "SKIP_NECROMANCY",
  "REFRESH_HAND",
  "ACKNOWLEDGE_COMBAT_END",
  "FINISH_COMBAT_PLACEMENT",
  "FINISH_TACTICS",
  "ACCEPT_COMBAT",
  "END_TURN",
];

function withRefreshDiscards(
  state: GameState,
  action: Extract<GameAction, { type: "REFRESH_HAND" }>,
  playerId: PlayerId,
): GameAction {
  const player = state.players[playerId];
  if (!player) return action;
  const limit = player.needsHandRefresh ? 4 : 5;
  const discardCount = Math.max(0, player.hand.length - limit);
  return { ...action, discardCardIds: player.hand.slice(0, discardCount) };
}

/** The seat with something legal to do (priority player, then active, then any). */
function actorWithActions(state: GameState): PlayerId | null {
  const order: PlayerId[] = [];
  if (state.priorityPlayerId) order.push(state.priorityPlayerId);
  order.push(state.activePlayerId);
  for (const pid of state.turnOrder) order.push(pid);
  const seen = new Set<PlayerId>();
  for (const pid of order) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    if (getLegalActions(state, pid).length > 0) return pid;
  }
  return null;
}

function pickAction(state: GameState, playerId: PlayerId): GameAction | null {
  const offers = getLegalActions(state, playerId);
  if (offers.length === 0) return null;
  for (const type of PRIORITY) {
    const hit = offers.find((legal) => legal.action.type === type);
    if (hit) {
      return hit.action.type === "REFRESH_HAND"
        ? withRefreshDiscards(state, hit.action as Extract<GameAction, { type: "REFRESH_HAND" }>, playerId)
        : hit.action;
    }
  }
  const safe =
    offers.find((legal) => legal.action.type !== "GIVE_UP" && legal.action.type !== "GIVE_UP_COMBAT") ??
    offers[0];
  return safe.action.type === "REFRESH_HAND"
    ? withRefreshDiscards(state, safe.action as Extract<GameAction, { type: "REFRESH_HAND" }>, playerId)
    : safe.action;
}

/** Drive a deterministic 2-human script until `targetRound` or the action cap. */
function driveToRound(initial: GameState, targetRound: number, maxActions = 120): {
  state: GameState;
  actionsTaken: number;
} {
  let state = initial;
  let n = 0;
  while (n < maxActions) {
    if (state.round >= targetRound && state.phase === "player-turn") break;
    if (state.phase === "game-over") break;
    const actor = actorWithActions(state);
    if (!actor) break;
    const action = pickAction(state, actor);
    if (!action) break;
    const result = applyAction(state, action);
    if (result.errors.length > 0) {
      throw new Error(`unexpected engine error at action ${n}: ${result.errors.join("; ")}`);
    }
    state = result.state;
    n += 1;
  }
  return { state, actionsTaken: n };
}

function scriptedSetup(anime: Partial<AdventureSetupOptions>): AdventureSetupOptions {
  return {
    seed: "anime-coexist-master-control",
    scenarioId: "skirmish",
    rollFirstPlayer: false,
    ruleset: "binh",
    players: [
      { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "B", factionId: "necropolis", heroDefId: "sandro" },
    ],
    ...anime,
  };
}

// ===========================================================================
// Gate (a) — master byte-identical-when-off CONTROL
// ===========================================================================

describe("anime coexistence — gate (a): default-off spine is byte-identical", () => {
  it("NO anime option === anime:undefined === anime:DEFAULT_ANIME_OPTIONS, at setup AND after a scripted game", () => {
    const noAnime = createAdventureGameState(scriptedSetup({}));
    const undefinedAnime = createAdventureGameState(scriptedSetup({ anime: undefined }));
    const allFalseAnime = createAdventureGameState(
      scriptedSetup({ anime: { ...DEFAULT_ANIME_OPTIONS } }),
    );

    // Setup-time: the three initial states serialize identically (state.anime
    // resolves to the same all-false object regardless of how it was supplied).
    const setupJson = JSON.stringify(noAnime);
    expect(JSON.stringify(undefinedAnime)).toBe(setupJson);
    expect(JSON.stringify(allFalseAnime)).toBe(setupJson);

    // The resolved anime block itself is the all-false object in every build.
    expect(noAnime.anime).toEqual({ ...DEFAULT_ANIME_OPTIONS });
    expect(allFalseAnime.anime).toEqual({ ...DEFAULT_ANIME_OPTIONS });

    // Mutation control: the byte comparison is SENSITIVE — flipping the anime
    // master flag on makes the serialized setup diverge, so the identity above
    // is a real invariant, not a vacuous compare.
    const enabled = createAdventureGameState(
      scriptedSetup({ anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true } }),
    );
    expect(JSON.stringify(enabled)).not.toBe(setupJson);

    // Drive the same deterministic script on each; the whole game — event log
    // included — stays identical. Any divergence is a real finding. Round 6
    // exercises several turn-starts (draws), resource/Astrologers rounds and
    // the growing event log — exactly where a live anime hook would show.
    const a = driveToRound(noAnime, 6);
    const b = driveToRound(undefinedAnime, 6);
    const c = driveToRound(allFalseAnime, 6);

    // The script actually advanced the game (not a no-op comparison).
    expect(a.state.round).toBeGreaterThanOrEqual(6);
    expect(a.actionsTaken).toBeGreaterThanOrEqual(10);
    expect(b.actionsTaken).toBe(a.actionsTaken);
    expect(c.actionsTaken).toBe(a.actionsTaken);

    const finalJson = JSON.stringify(a.state);
    expect(JSON.stringify(b.state)).toBe(finalJson);
    expect(JSON.stringify(c.state)).toBe(finalJson);

    // Event logs match explicitly (the gate's headline artifact).
    const log = (s: GameState) => JSON.stringify(s.eventLog);
    expect(log(b.state)).toBe(log(a.state));
    expect(log(c.state)).toBe(log(a.state));
    expect(a.state.eventLog.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Gate (c) — mixed-package no cross-talk
// ===========================================================================

const XIANXIA_ANIME: Partial<AnimeModOptions> = {
  enabled: true,
  cultivation: true,
  heroGrades: true,
  xianxiaArtifacts: true,
};

function xianxiaGame(seed: string, extraAnime: Partial<AnimeModOptions> = {}): GameState {
  return createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    rollFirstPlayer: false,
    ruleset: "binh",
    anime: { ...DEFAULT_ANIME_OPTIONS, ...XIANXIA_ANIME, ...extraAnime },
    players: [
      { id: "p1", name: "Chen", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Bin", factionId: "necropolis", heroDefId: "sandro" },
    ],
  });
}

/** Advance p1's Cultivation realm + Hero grade and return only those events. */
function runXianxiaProgression(state: GameState): Array<{ type: string; realm?: number; grade?: number }> {
  const hero = getMainHero(state, "p1")!;
  hero.level = 5;
  state.players.p1.bankWins = 1;
  const before = state.eventLog.length;
  maybeAdvanceCultivationRealm(state, "p1"); // realm 0 → 1 → 2
  gainGradeProgress(state, "p1", 12, "coexistence-test"); // grade 0 → 3 across [3,7,12]
  return state.eventLog
    .slice(before)
    .filter(
      (e): e is Extract<GameEvent, { type: "CULTIVATION_REALM_ADVANCED" | "HERO_GRADE_ADVANCED" }> =>
        e.type === "CULTIVATION_REALM_ADVANCED" || e.type === "HERO_GRADE_ADVANCED",
    )
    .map((e) =>
      e.type === "CULTIVATION_REALM_ADVANCED"
        ? { type: e.type, realm: e.realm }
        : { type: e.type, grade: e.grade },
    );
}

describe("anime coexistence — gate (c): isekai content present does not perturb xianxia mechanics", () => {
  it("carving an isekai field-override kind leaves the cultivation/grade event sequence identical", () => {
    const xianxiaOnly = xianxiaGame("coexist-mixed-seed");
    const withIsekaiContent = xianxiaGame("coexist-mixed-seed");

    // Present genuine isekai-package content on the map: carve an isekai field
    // override (Capsule Corp Lab). This is CONTENT, not a module flag.
    const isekaiDef = getFieldOverrideDefinition("capsule_lab");
    expect(isekaiDef?.package, "capsule_lab is isekai-package content").toBe("anime-isekai");
    const spaceId = Object.keys(withIsekaiContent.adventure!.fields)[0];
    carveFieldOverride(withIsekaiContent.adventure!, spaceId, "capsule_lab");
    expect(withIsekaiContent.adventure!.fields[spaceId].location).toBe("anime.capsule_lab");
    // CONTROL sibling: the xianxia-only board has NO isekai location.
    expect(
      Object.values(xianxiaOnly.adventure!.fields).some((f) => f.location === "anime.capsule_lab"),
    ).toBe(false);

    const eventsXianxiaOnly = runXianxiaProgression(xianxiaOnly);
    const eventsWithIsekai = runXianxiaProgression(withIsekaiContent);

    // The cultivation + grade progression fires the SAME events regardless of
    // the isekai content on the map — no cross-talk.
    expect(eventsWithIsekai).toEqual(eventsXianxiaOnly);
    // Sanity: the progression actually happened (2 realm + 3 grade events).
    expect(eventsXianxiaOnly.filter((e) => e.type === "CULTIVATION_REALM_ADVANCED")).toHaveLength(2);
    expect(eventsXianxiaOnly.filter((e) => e.type === "HERO_GRADE_ADVANCED")).toHaveLength(3);
    expect(cultivationRealmOf(withIsekaiContent, "p1")).toBe(cultivationRealmOf(xianxiaOnly, "p1"));
    expect(heroGradeOf(withIsekaiContent, "p1")).toBe(heroGradeOf(xianxiaOnly, "p1"));
    expect(heroGradeProgressOf(withIsekaiContent, "p1")).toBe(heroGradeProgressOf(xianxiaOnly, "p1"));
  });

  it("the grade-name register keys off the hero faction, not module flags or carved content", () => {
    // Package flags never relabel a classic hero.
    const xianxiaOnly = xianxiaGame("coexist-register-seed");
    expect(heroGradeRegisterKey(xianxiaOnly, "p1")).toBe("core");

    // Carved isekai content also cannot relabel the owning classic faction.
    const withIsekaiContent = xianxiaGame("coexist-register-seed");
    carveFieldOverride(
      withIsekaiContent.adventure!,
      Object.keys(withIsekaiContent.adventure!.fields)[0],
      "capsule_lab",
    );
    expect(heroGradeRegisterKey(withIsekaiContent, "p1")).toBe("core");

    // Enabling the other package still leaves the classic register unchanged.
    const bothPackages = xianxiaGame("coexist-register-seed", { isekaiTowns: true });
    expect(heroGradeRegisterKey(bothPackages, "p1")).toBe("core");

    // Mutation control: identical flags, different owning faction, different labels.
    bothPackages.players.p1.factionId = "azure_breeze";
    expect(heroGradeRegisterKey(bothPackages, "p1")).toBe("xianxia");
  });
});
