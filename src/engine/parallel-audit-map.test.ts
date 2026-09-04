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
 * AUDIT (map movement / tile discovery / map spells under parallel turns).
 * Every spec builds a real parallel table and asserts an observable outcome
 * with an ordered-mode CONTROL.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function tryApply(state: GameState, action: GameAction): { state: GameState; error: string | null } {
  const result = applyAction(state, action);
  return { state: result.state, error: result.errors[0]?.message ?? null };
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function makeGame(
  seed: string,
  options: { parallelTurns?: number; players?: 2 | 3; rotateStartTiles?: boolean } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: options.parallelTurns ?? 0,
    ...(options.rotateStartTiles ? { rotateStartTiles: true } : {}),
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
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
  clearField(state, field.spaceId);
  return field.spaceId;
}

function clearField(state: GameState, spaceId: string): void {
  const field = state.adventure!.fields[spaceId];
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete field.bankId;
}

function paintField(state: GameState, spaceId: string, location: string, extra: Record<string, unknown> = {}): void {
  clearField(state, spaceId);
  const field = state.adventure!.fields[spaceId] as unknown as Record<string, unknown>;
  field.location = location;
  Object.assign(field, extra);
}

/** Two adjacent empty fields leading away from `heroId` (a 2-step walk). */
function twoStepPath(state: GameState, heroId: string): [string, string] {
  const hero = state.heroes[heroId];
  const first = emptyFieldNextTo(state, heroId);
  const firstCoord = parseHexSpaceId(first)!;
  const second = hexNeighbors(firstCoord)
    .map(hexSpaceId)
    .find((spaceId) => {
      if (spaceId === hero.spaceId) return false;
      const field = state.adventure!.fields[spaceId];
      return Boolean(field) && field.location !== "town";
    });
  if (!second) {
    throw new Error("no two-step path");
  }
  clearField(state, second);
  return [first, second];
}

function armHexEvent(state: GameState, spaceId: string, reward: Record<string, unknown>): void {
  const adventure = state.adventure!;
  adventure.hexEvents = adventure.hexEvents ?? {};
  const coord = parseHexSpaceId(spaceId)!;
  (adventure.hexEvents as Record<string, unknown>)[spaceId] = {
    event: {
      id: `he_${spaceId}`,
      placement: { row: coord.row, col: coord.col },
      message: "An invisible trigger fires.",
      reward,
      mode: "first"
    },
    firedPlayerIds: []
  };
}

/** p1 walks onto an unowned settlement, leaving p1's choice/visit open. */
function withOpenVisit(state: GameState): GameState {
  const settlement = emptyFieldNextTo(state, "hero_p1");
  paintField(state, settlement, "settlement");
  const next = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: settlement });
  expect(Boolean(next.pendingChoice) || Boolean(next.adventure?.pendingVisit)).toBe(true);
  return next;
}

// ---------------------------------------------------------------------------

describe("parallel audit — invisible hex events vs. quiet bystander moves", () => {
  it("a bystander's quiet step does NOT spring an invisible hex event while another player's interaction is open", () => {
    let state = makeGame("audit-hexevent", { parallelTurns: 3 });
    const target = emptyFieldNextTo(state, "hero_p2");
    armHexEvent(state, target, { gold: 7 });
    state = withOpenVisit(state);

    const goldBefore = state.players.p2.resources.gold;
    const { state: after, error } = tryApply(state, {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "hero_p2",
      to: target
    });

    // Either the move is refused as non-quiet, or it happens without firing
    // the designer trigger. Firing it while the table's single interaction slot
    // belongs to p1 is the bug.
    if (!error) {
      expect(after.players.p2.resources.gold).toBe(goldBefore);
      expect(after.adventure?.hexEvents?.[target]).toBeDefined();
    }
  });

  it("CONTROL (ordered): the same step springs the hex event normally", () => {
    let state = makeGame("audit-hexevent-ctrl");
    const target = emptyFieldNextTo(state, "hero_p1");
    armHexEvent(state, target, { gold: 7 });
    const goldBefore = state.players.p1.resources.gold;
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: target });
    expect(state.players.p1.resources.gold).toBe(goldBefore + 7);
  });
});

describe("parallel audit — a quiet walk must stop where an ordered walk stops", () => {
  it("MOVE_HERO_PATH: a bystander's walk stops on the step that queues a reward (like ordered play)", () => {
    let state = makeGame("audit-walk-stop", { parallelTurns: 3 });
    const [first, second] = twoStepPath(state, "hero_p2");
    // A Search reward is a visit-step reward: it QUEUES, so an ordered walk
    // stops on this field.
    armHexEvent(state, first, { searchAbility: 1 });
    state = withOpenVisit(state);

    const { state: after, error } = tryApply(state, {
      type: "MOVE_HERO_PATH",
      playerId: "p2",
      heroId: "hero_p2",
      path: [first, second]
    });
    if (!error) {
      expect(after.heroes.hero_p2.spaceId).toBe(first);
    }
  });

  it("CONTROL (ordered): the identical walk stops on the reward field", () => {
    let state = makeGame("audit-walk-stop-ctrl");
    const [first, second] = twoStepPath(state, "hero_p1");
    armHexEvent(state, first, { searchAbility: 1 });
    state = apply(state, {
      type: "MOVE_HERO_PATH",
      playerId: "p1",
      heroId: "hero_p1",
      path: [first, second]
    });
    expect(state.heroes.hero_p1.spaceId).toBe(first);
  });
});

describe("parallel audit — hero-on-hero arrivals", () => {
  it("the second arrival on an occupied field starts PvP and stops the mode (never a silent stack)", () => {
    let state = makeGame("audit-collision", { parallelTurns: 3 });
    // One field adjacent to BOTH heroes is not guaranteed on the stock map, so
    // stage p2's hero next to p1 and let both aim at the same empty field.
    const shared = emptyFieldNextTo(state, "hero_p1");
    const p2Stage = hexNeighbors(parseHexSpaceId(shared)!)
      .map(hexSpaceId)
      .find((spaceId) => {
        const field = state.adventure!.fields[spaceId];
        return Boolean(field) && spaceId !== state.heroes.hero_p1.spaceId && field.location !== "town";
      });
    expect(p2Stage).toBeDefined();
    clearField(state, p2Stage!);
    state.heroes.hero_p2.spaceId = p2Stage!;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: shared });
    expect(state.heroes.hero_p1.spaceId).toBe(shared);
    expect(state.turn.mode).toBe("parallel");

    // p2 aims at the now-occupied field: a real PvP battle, never a stack.
    const { state: after, error } = tryApply(state, {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "hero_p2",
      to: shared
    });
    if (error) {
      expect(after.heroes.hero_p2.spaceId).toBe(p2Stage);
    } else {
      expect(after.combat?.context.kind).toBe("player");
      expect(after.turn.mode).toBe("ordered");
      expect(after.activePlayerId).toBe("p2");
      // The attacker really is the mover, the defender really the parked hero.
      expect(after.combat?.attackerPlayerId).toBe("p2");
      expect(after.combat?.defenderPlayerId).toBe("p1");
    }
  });

  it("a bystander may not END on an enemy hero's field while another interaction is open", () => {
    let state = makeGame("audit-quiet-vs-enemy", { parallelTurns: 3, players: 3 });
    // p3 parks next to p2; p1 then opens a visit, making p2 a bystander.
    const stage = emptyFieldNextTo(state, "hero_p2");
    state.heroes.hero_p3.spaceId = stage;
    state = withOpenVisit(state);

    const { error } = tryApply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: stage });
    expect(error).toBeTruthy();
    expect(error).toContain("wait until");
    expect(state.turn.mode).toBe("parallel");
    // And it is not even offered.
    expect(
      getLegalActions(state, "p2").some(
        (legal) => legal.action.type === "MOVE_HERO" && (legal.action as { to?: string }).to === stage
      )
    ).toBe(false);
  });
});

describe("parallel audit — movement budgets are per hero / per player", () => {
  it("one player's END_TURN never touches another player's hero movement", () => {
    let state = makeGame("audit-mp-isolation", { parallelTurns: 3, players: 3 });
    const p2Target = emptyFieldNextTo(state, "hero_p2");
    state = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: p2Target });
    const p2Left = state.heroes.hero_p2.movementPoints;
    const p3Left = state.heroes.hero_p3.movementPoints;

    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.heroes.hero_p2.movementPoints).toBe(p2Left);
    expect(state.heroes.hero_p3.movementPoints).toBe(p3Left);

    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.heroes.hero_p3.movementPoints).toBe(p3Left);
    // The round only wraps (and refreshes everyone) once p3 ends too.
    expect(state.heroes.hero_p2.movementPoints).toBe(p2Left);
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    expect(state.round).toBe(2);
    expect(state.heroes.hero_p2.movementPoints).toBe(state.heroes.hero_p2.movementPointsMax);
  });
});

describe("parallel audit — round-1 forced home-tile rotation chain", () => {
  it("every seat gets its rotation in seat order and everyone can move afterwards", () => {
    let state = makeGame("audit-rotation-chain", { parallelTurns: 3, players: 3, rotateStartTiles: true });
    const seen: PlayerId[] = [];
    for (let step = 0; step < 4 && state.adventure?.pendingTileChoice; step += 1) {
      const pending = state.adventure.pendingTileChoice;
      seen.push(pending.playerId);
      // Nobody else may act while the chain holds the slot.
      for (const other of ["p1", "p2", "p3"] as PlayerId[]) {
        if (other === pending.playerId) continue;
        const { error } = tryApply(state, { type: "END_TURN", playerId: other });
        expect(error).toBeTruthy();
      }
      state = apply(state, {
        type: "SET_TILE_ROTATION",
        playerId: pending.playerId,
        tileInstanceId: pending.tileInstanceId,
        rotation: 0
      });
    }
    expect(seen).toEqual(["p1", "p2", "p3"]);
    expect(state.adventure?.pendingTileChoice ?? null).toBeNull();

    // Everyone can now move (the mandatory draw first, if owed).
    for (const playerId of ["p1", "p2", "p3"] as PlayerId[]) {
      if (state.players[playerId].canMulligan || state.players[playerId].needsHandRefresh) {
        state = apply(state, { type: "REFRESH_HAND", playerId, discardCardIds: [] });
      }
    }
    for (const playerId of ["p1", "p2", "p3"] as PlayerId[]) {
      const target = emptyFieldNextTo(state, `hero_${playerId}`);
      state = apply(state, { type: "MOVE_HERO", playerId, heroId: `hero_${playerId}`, to: target });
      expect(state.heroes[`hero_${playerId}`].spaceId).toBe(target);
    }
  });
});

describe("parallel audit — no false rejection of a genuinely quiet move", () => {
  it("a quiet move is accepted while another player's pending VISIT sits open awaiting their own action", () => {
    let state = makeGame("audit-false-reject", { parallelTurns: 3 });
    state = withOpenVisit(state);
    const quiet = emptyFieldNextTo(state, "hero_p2");
    const { state: after, error } = tryApply(state, {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "hero_p2",
      to: quiet
    });
    expect(error).toBeNull();
    expect(after.heroes.hero_p2.spaceId).toBe(quiet);
  });

  it("a quiet move is accepted while another player's TILE-REVEAL chain (bank/gate/token) holds the slot", () => {
    const state = makeGame("audit-false-reject-tile", { parallelTurns: 3 });
    const adventure = state.adventure!;
    // The stock layout places no discoverable tile beside a starting ring, so
    // park the chain's own slot directly: a mid-flight reveal owned by p1.
    const faceDown = Object.values(adventure.tiles).find((tile) => tile.faceDown);
    expect(faceDown, "the stock map has a face-down tile").toBeDefined();
    adventure.pendingTileChoice = { tileInstanceId: faceDown!.id, playerId: "p1", kind: "reveal" };
    const chainBefore = JSON.stringify(adventure.pendingTileChoice);

    const quiet = emptyFieldNextTo(state, "hero_p2");
    const { state: after, error } = tryApply(state, {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "hero_p2",
      to: quiet
    });
    expect(error).toBeNull();
    expect(after.heroes.hero_p2.spaceId).toBe(quiet);
    expect(JSON.stringify(after.adventure?.pendingTileChoice)).toBe(chainBefore);
  });

  it("a quiet move does not drain the busy player's shared reward queue", () => {
    let state = makeGame("audit-queue-stable", { parallelTurns: 3 });
    state = withOpenVisit(state);
    state.adventure!.rewardQueue.push({
      playerId: "p1",
      kind: "shared-deck-search",
      deckId: "abilities",
      count: 2
    } as never);
    const queueBefore = state.adventure!.rewardQueue.length;
    const quiet = emptyFieldNextTo(state, "hero_p2");
    const after = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: quiet });
    // Stable — which is what lets the reward queue join the bystander
    // fingerprint without falsely rejecting genuinely quiet moves.
    expect(after.adventure?.rewardQueue.length).toBe(queueBefore);
  });
});

describe("parallel audit — an ambush hex event under a quiet step", () => {
  it("rejects the whole step atomically: no guard stamped, no hero move, mode still parallel", () => {
    let state = makeGame("audit-ambush", { parallelTurns: 3 });
    const target = emptyFieldNextTo(state, "hero_p2");
    const adventure = state.adventure!;
    adventure.hexEvents = adventure.hexEvents ?? {};
    const coord = parseHexSpaceId(target)!;
    (adventure.hexEvents as Record<string, unknown>)[target] = {
      event: {
        id: "he_ambush",
        placement: { row: coord.row, col: coord.col },
        reward: { gold: 5 },
        guard: { kind: "level", level: 1 },
        mode: "first"
      },
      firedPlayerIds: []
    };
    state = withOpenVisit(state);
    const from = state.heroes.hero_p2.spaceId;

    const { state: after, error } = tryApply(state, {
      type: "MOVE_HERO",
      playerId: "p2",
      heroId: "hero_p2",
      to: target
    });
    expect(error).toBeTruthy();
    expect(after.heroes.hero_p2.spaceId).toBe(from);
    expect(after.adventure?.fields[target].difficulty ?? null).toBeNull();
    expect(after.adventure?.hexEvents?.[target]?.guardStamped ?? false).toBe(false);
    expect(after.turn.mode).toBe("parallel");
    expect(after.combat ?? null).toBeNull();
  });
});

describe("parallel audit — one player's step never touches another's map banks", () => {
  it("a bystander's quiet step leaves the busy player's map Spell-Power bank and reinforcement banks intact", () => {
    let state = makeGame("audit-bank-isolation", { parallelTurns: 3 });
    state = withOpenVisit(state);
    state.players.p1.mapSpellPowerBank = 2;
    state.players.p1.recruitDiscounts = [{ unitDefId: "castle.pikemen", amount: 1 }] as never;
    const quiet = emptyFieldNextTo(state, "hero_p2");
    const after = apply(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: quiet });
    expect(after.players.p1.mapSpellPowerBank).toBe(2);
    expect((after.players.p1.recruitDiscounts ?? []).length).toBe(1);
    // ...and the mover's own bank IS wiped by their step (the documented seam).
    expect(after.players.p2.mapSpellPowerBank ?? 0).toBe(0);
  });
});

describe("parallel audit — loud map actions stay blocked for a bystander", () => {
  it("DISCOVER_TILE, REVISIT_FIELD, OPEN_MARKET and card plays all wait for the slot", () => {
    let state = makeGame("audit-loud-blocked", { parallelTurns: 3 });
    state.players.p2.hand.push("spell.view_earth");
    state = withOpenVisit(state);

    const offers = getLegalActions(state, "p2").map((legal) => legal.action.type);
    expect(offers).not.toContain("DISCOVER_TILE");
    expect(offers).not.toContain("REVISIT_FIELD");
    expect(offers).not.toContain("OPEN_MARKET");
    expect(offers).not.toContain("PLAY_CARD");
    expect(offers).not.toContain("CAST_SPELL");

    const cast = tryApply(state, {
      type: "PLAY_CARD",
      playerId: "p2",
      cardId: "spell.view_earth",
      target: { type: "none" },
      mode: "basic"
    });
    expect(cast.error).toBeTruthy();
    // p1's interaction survived the refused cast, and p2 still holds the card.
    expect(
      cast.state.pendingChoice?.playerId ?? cast.state.adventure?.pendingVisit?.playerId
    ).toBe("p1");
    expect(cast.state.players.p2.hand).toContain("spell.view_earth");
  });
});
