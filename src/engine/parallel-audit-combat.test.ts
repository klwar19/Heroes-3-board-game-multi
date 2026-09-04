import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";

/**
 * AUDIT (2026-09-04) — COMBAT under parallel turns.
 *
 * Probes the combat path of the optional parallel-turn mode: who holds
 * `activePlayerId` while a bystander's fight runs, what a bystander may still
 * do, and how a PvP collapse rotates the remaining seats. Every claim carries
 * an ordered-mode or unaffected-seat CONTROL.
 *
 * Failing specs in this file are CONFIRMED BUGS (see the header of each
 * describe block); passing specs are regression pins for behaviour that is
 * already correct.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

const WOG_COMMANDERS = {
  enabled: true,
  commanders: true,
  newObjects: false,
  newCreatures: false,
  artifacts: false
};

function makeGame(
  seed: string,
  options: {
    parallelTurns?: number;
    players?: 2 | 3;
    pvpNeutralControl?: boolean;
    commanders?: boolean;
  } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    ruleset: "binh",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.pvpNeutralControl ? { pvpNeutralControl: true } : {}),
    ...(options.commanders ? { wog: WOG_COMMANDERS } : {}),
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  // Inert Astrologers proclamations so even rounds resolve without a choice.
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

const usedStagingFields = new WeakMap<GameState, Set<string>>();
function emptyFieldNextTo(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const coord = parseHexSpaceId(hero.spaceId ?? "");
  if (!coord) {
    throw new Error(`${heroId} is not on the map`);
  }
  const used = usedStagingFields.get(state) ?? new Set<string>();
  usedStagingFields.set(state, used);
  const field = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .find((candidate) => candidate && candidate.location !== "town" && !used.has(candidate.spaceId));
  if (!field) {
    throw new Error(`no adjacent field for ${heroId}`);
  }
  used.add(field.spaceId);
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  return field.spaceId;
}

function paintField(state: GameState, spaceId: string, location: string, extra: Record<string, unknown> = {}): void {
  const field = state.adventure!.fields[spaceId] as unknown as Record<string, unknown>;
  field.location = location;
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
  Object.assign(field, extra);
}

function moveHero(state: GameState, playerId: PlayerId, to: string): GameState {
  return apply(state, { type: "MOVE_HERO", playerId, heroId: `hero_${playerId}`, to });
}

/**
 * Drives an open combat forward as `fighter` (and, in a PvP fight, the other
 * participant) would, preferring to ready up and attack. Stops when the
 * battlefield and every follow-up window are closed.
 */
function driveFight(state: GameState, participants: PlayerId[], steps = 120): GameState {
  let current = state;
  for (let i = 0; i < steps; i += 1) {
    if (
      !current.combat &&
      !current.pendingChoice &&
      !current.adventure?.pendingVisit &&
      !current.adventure?.pendingNecromancy
    ) {
      return current;
    }
    let progressed = false;
    for (const participant of participants) {
      const offers = getLegalActions(current, participant);
      const pick =
        offers.find((l) => l.action.type === "ATTACK_UNIT") ??
        offers.find((l) => l.action.type === "ACKNOWLEDGE_COMBAT_END") ??
        offers.find((l) => l.action.type === "ACCEPT_COMBAT") ??
        offers.find((l) => l.action.type === "FINISH_COMBAT_PLACEMENT") ??
        offers.find(
          (l) =>
            l.action.type !== "RETREAT_FROM_COMBAT" &&
            l.action.type !== "SURRENDER_COMBAT" &&
            l.action.type !== "GIVE_UP" &&
            l.action.type !== "END_TURN"
        );
      if (!pick) continue;
      const result = applyAction(current, pick.action);
      if (result.errors.length > 0) continue;
      current = result.state;
      progressed = true;
      break;
    }
    if (!progressed) return current;
  }
  return current;
}

/** p2 walks onto a difficulty-1 guard field: a NEUTRAL fight opens for p2. */
function openNeutralFightForP2(
  seed: string,
  options: { players?: 2 | 3; pvpNeutralControl?: boolean; difficulty?: number } = {}
): GameState {
  let state = makeGame(seed, {
    parallelTurns: 4,
    players: options.players ?? 3,
    pvpNeutralControl: options.pvpNeutralControl
  });
  const guard = emptyFieldNextTo(state, "hero_p2");
  paintField(state, guard, "empty_field", { difficulty: options.difficulty ?? 1 });
  state = moveHero(state, "p2", guard);
  expect(state.combat).toBeTruthy();
  return state;
}

// ---------------------------------------------------------------------------
// BUG 1 — the PvP-Neutral-Control controller loses its OWN parallel turn.
//
// `parallelInteractionBlocker` returns null for the seat that controls the
// Neutral side of the open fight ("their inputs are the interaction's own"), so
// `getAdventureLegalActions` never falls into `getParallelBystanderActions` for
// them. During the fighter's DEPLOYMENT (and every stretch of the fight where a
// player-owned unit is active) the combat dispatcher offers the controller
// nothing at all, and the MOVE_HERO handler — which is HANDLER_VALIDATED, so no
// offer check protects it — refuses with the generic "Finish the current combat
// first." Every OTHER bystander keeps the quiet-move set on the identical state.
// The controller is a participant of the BATTLE, not of the map: their own
// parallel turn should keep the quiet set exactly like anyone else's.
//
// Side effect of the same null: `parallelBystanderBlocker` is null in
// applyAction, so the transactional fingerprint backstop is DISABLED for the
// controller — today only the generic combat gate stops them touching the
// machinery.
// ---------------------------------------------------------------------------
describe("AUDIT: PvP Neutral Control controller under parallel turns", () => {
  it("keeps its own quiet moves while another seat's neutral fight is open (a plain bystander does)", () => {
    const state = openNeutralFightForP2("audit-pnc-quiet", {
      players: 3,
      pvpNeutralControl: true,
      difficulty: 2
    });
    expect(state.adventure?.pvpNeutralControl).toBe(true);
    // p2 fights; clockwise from p2 the controller is p3.
    const quietForP3 = emptyFieldNextTo(state, "hero_p3");
    const quietForP1 = emptyFieldNextTo(state, "hero_p1");

    // CONTROL: the uninvolved bystander p1 keeps the quiet-move set.
    expect(getLegalActions(state, "p1").some((l) => l.action.type === "MOVE_HERO")).toBe(true);
    const p1Moved = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: quietForP1 });
    expect(p1Moved.heroes.hero_p1.spaceId).toBe(quietForP1);

    // The controller p3 — whose parallel turn is equally open — gets nothing.
    expect(getLegalActions(state, "p3").some((l) => l.action.type === "MOVE_HERO")).toBe(true);
    const p3Moved = applyAction(state, {
      type: "MOVE_HERO",
      playerId: "p3",
      heroId: "hero_p3",
      to: quietForP3
    });
    expect(p3Moved.errors.map((e) => e.message)).toEqual([]);
    expect(p3Moved.state.heroes.hero_p3.spaceId).toBe(quietForP3);
  });

  it("CONTROL: with the mode OFF nobody is a controller, so every bystander keeps quiet moves", () => {
    const state = openNeutralFightForP2("audit-pnc-off", {
      players: 3,
      pvpNeutralControl: false,
      difficulty: 2
    });
    const quietForP3 = emptyFieldNextTo(state, "hero_p3");
    const moved = apply(state, { type: "MOVE_HERO", playerId: "p3", heroId: "hero_p3", to: quietForP3 });
    expect(moved.heroes.hero_p3.spaceId).toBe(quietForP3);
  });
});

// ---------------------------------------------------------------------------
// BUG 2 — `forgeCommanderArtifact` is parallel-unaware, and a bystander's
// finished combat MOVES `activePlayerId` onto the fighter.
//
// adventure-reducer.ts:18413 gates the Commander Forge on
// `state.activePlayerId === action.playerId` instead of the parallel-aware
// `hasOpenAdventureTurn`. In parallel mode `activePlayerId` is only a NOMINAL
// pointer, so:
//   (a) every open-turn parallel actor that is not the nominal seat is offered
//       FORGE_COMMANDER_ARTIFACT by getLegalActions and then refused by the
//       handler; and
//   (b) `finalizeAdventureCombat` (adventure-reducer.ts:14355,
//       `state.activePlayerId = playerId ?? state.activePlayerId`) hands the
//       nominal pointer to whichever seat just finished a fight — so the seat
//       that DID hold it loses the Forge for the rest of the round because
//       someone else fought a guard.
// ---------------------------------------------------------------------------
describe("AUDIT: strict activePlayerId gates in parallel mode (Commander Forge)", () => {
  function forgeReady(seed: string, players: 2 | 3 = 3): GameState {
    const state = makeGame(seed, { parallelTurns: 4, players, commanders: true });
    state.round = 2;
    for (const player of Object.values(state.players)) {
      player.resources.gold = 40;
    }
    return state;
  }

  function forgeOffer(state: GameState, playerId: PlayerId) {
    return getLegalActions(state, playerId).find(
      (l) => l.action.type === "FORGE_COMMANDER_ARTIFACT"
    );
  }

  it("an open-turn parallel actor that is not the nominal activePlayerId may use the Forge it is offered", () => {
    const state = forgeReady("audit-forge-parallel");
    expect(state.turn.mode).toBe("parallel");
    expect(state.activePlayerId).toBe("p1");

    // CONTROL: the nominal seat's identical offer works.
    const p1Offer = forgeOffer(state, "p1");
    expect(p1Offer).toBeDefined();
    const p1Forged = apply(state, p1Offer!.action);
    expect(p1Forged.players.p1.resources.gold).toBe(35);

    // p2's parallel turn is equally open and the offer is made to them too.
    const p2Offer = forgeOffer(state, "p2");
    expect(p2Offer).toBeDefined();
    const p2Result = applyAction(state, p2Offer!.action);
    expect(p2Result.errors.map((e) => e.message)).toEqual([]);
    expect(p2Result.state.players.p2.resources.gold).toBe(35);
  });

  it("a bystander's finished neutral fight does not cost the nominal seat its own map turn", () => {
    let state = forgeReady("audit-forge-after-combat");
    const guard = emptyFieldNextTo(state, "hero_p2");
    paintField(state, guard, "empty_field", { difficulty: 1 });
    expect(forgeOffer(state, "p1")).toBeDefined();

    // p2 fights a guard and wins; p1 never acted.
    state = moveHero(state, "p2", guard);
    expect(state.combat).toBeTruthy();
    state = driveFight(state, ["p2"]);
    expect(state.combat).toBeNull();
    expect(state.turn.mode).toBe("parallel");
    expect(state.turn.completedPlayerIds).toEqual([]);

    // p1's turn is still open and the Forge is still offered …
    const offer = forgeOffer(state, "p1");
    expect(offer).toBeDefined();
    // … but the fight moved the nominal pointer onto the fighter.
    const result = applyAction(state, offer!.action);
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.state.players.p1.resources.gold).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// Regression pins for combat behaviour that IS correct today.
// ---------------------------------------------------------------------------
describe("parallel turns — combat path regressions (already correct)", () => {
  it("a bystander's neutral fight leaves every other seat's parallel turn open and wraps the round normally", () => {
    let state = openNeutralFightForP2("audit-fight-then-round");
    const startHex = state.heroes.hero_p2.spaceId!;
    const p1Target = emptyFieldNextTo(state, "hero_p1");
    state = driveFight(state, ["p2"]);
    expect(state.combat).toBeNull();
    expect(state.turn.mode).toBe("parallel");
    // The fight was attributed to the fighter: p2's hero advanced onto the cleared field.
    expect(state.heroes.hero_p2.spaceId).not.toBe(startHex);

    // p1 and p3 still have open turns: p1 moves, then all three end and the round wraps.
    state = moveHero(state, "p1", p1Target);
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.round).toBe(1);
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.round).toBe(1);
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.round).toBe(2);
    expect(state.turn.mode).toBe("parallel");
    expect(state.turn.completedPlayerIds).toEqual([]);
  });

  it("a PvP battle against a defender who already ENDED their parallel turn still lets the defender act, and the rotation visits each owed seat once", () => {
    let state = makeGame("audit-pvp-ended", { parallelTurns: 4, players: 3 });
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.turn.completedPlayerIds).toEqual(["p3"]);

    const staging = emptyFieldNextTo(state, "hero_p1");
    state.heroes.hero_p3.spaceId = staging;
    state = moveHero(state, "p1", staging);
    expect(state.combat?.context.kind).toBe("player");
    expect(state.turn.mode).toBe("ordered");
    expect(state.activePlayerId).toBe("p1");
    // The already-ended defender is a full participant of the prep window.
    const p3Offers = getLegalActions(state, "p3").map((l) => l.action.type);
    expect(p3Offers).toContain("ACCEPT_COMBAT");

    state = driveFight(state, ["p1", "p3"]);
    expect(state.combat).toBeNull();
    expect(state.turn.completedPlayerIds).toContain("p3");

    // p1 ends → p2 (the only owed seat) plays → the round wraps. p3 is skipped.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    expect(state.round).toBe(1);
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.round).toBe(2);
  });

  it("the fighter's own combat commands, casts and card plays are not gated on the nominal activePlayerId", () => {
    let state = openNeutralFightForP2("audit-drive", { difficulty: 1 });
    expect(state.activePlayerId).toBe("p1"); // nominal pointer is NOT the fighter
    for (let i = 0; i < 60 && state.phase === "combat-setup"; i += 1) {
      const offers = getLegalActions(state, "p2");
      const pick =
        offers.find((l) => l.action.type === "FINISH_COMBAT_PLACEMENT") ??
        offers.find((l) => l.action.type === "PLACE_COMBAT_UNIT");
      expect(pick).toBeDefined();
      state = apply(state, pick!.action);
    }
    const offers = getLegalActions(state, "p2").map((l) => l.action.type);
    expect(offers).toContain("MOVE_UNIT");
    expect(offers).toContain("DEFEND_UNIT");
    expect(offers).toContain("CAST_SPELL");
    expect(offers).toContain("PLAY_CARD");
    // The other seat keeps its own map turn without receiving p2's commands.
    const mapOffers = getLegalActions(state, "p1").map(l => l.action.type);
    expect(mapOffers).toContain("MOVE_HERO");
    expect(mapOffers).toContain("END_TURN");
    expect(mapOffers).not.toContain("ATTACK_UNIT");
  });
});
