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
import { parallelInteractionBlocker } from "./parallel-turns";
import { parallelStateForPlayer } from "./parallel-combats";

/**
 * AUDIT (parallel turns x card plays / effect resolution).
 *
 * Every spec below builds a REAL parallel table through the same fixture shape
 * `parallel-turns.test.ts` uses (`createAdventureGameState({ parallelTurns })`,
 * 3-player multiplayer) and asserts the observable game outcome, each with an
 * ordered-mode or active-seat CONTROL.
 *
 * Regression coverage for the audited card, prompt and turn-ownership paths.
 */

const THREE = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function makeGame(
  seed: string,
  options: {
    parallelTurns?: number;
    hand?: string[];
    houseRules?: Record<string, boolean>;
    wog?: Record<string, boolean>;
  } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    parallelTurns: options.parallelTurns ?? 0,
    players: THREE,
    ...(options.houseRules ? { houseRules: options.houseRules } : {}),
    ...(options.wog ? { wog: options.wog } : {})
  } as never);
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources.gold = 80;
    player.resources.buildingMaterials = 30;
    player.resources.valuables = 30;
    if (options.hand) {
      player.hand = [...options.hand];
    }
  }
  // Inert Astrologers proclamations so even rounds resolve without a choice.
  for (let i = 0; i < 40; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function offer(
  state: GameState,
  playerId: PlayerId,
  predicate: (candidate: { label: string; action: GameAction }) => boolean
) {
  return getLegalActions(state, playerId).find((candidate) => predicate(candidate as never));
}

function playOffer(state: GameState, playerId: PlayerId, cardId: string, optionIndex?: number) {
  return offer(
    state,
    playerId,
    (candidate) =>
      candidate.action.type === "PLAY_CARD" &&
      (candidate.action as { cardId: string }).cardId === cardId &&
      (optionIndex === undefined ||
        (candidate.action as { optionIndex?: number }).optionIndex === optionIndex)
  );
}

/** Rewrites the Nth free neighbour of a hero into plain empty terrain. */
function emptyFieldNextTo(state: GameState, heroId: string, index = 0): string {
  const coord = parseHexSpaceId(state.heroes[heroId].spaceId ?? "");
  if (!coord) throw new Error(heroId + " is not on the map");
  const candidates = hexNeighbors(coord)
    .map((neighbor) => state.adventure!.fields[hexSpaceId(neighbor)])
    .filter((field) => field && field.location !== "town");
  const field = candidates[index];
  if (!field) throw new Error("no adjacent field for " + heroId);
  field.location = "empty_field";
  field.difficulty = undefined;
  field.flagOwnerId = null;
  field.blackCube = false;
  field.everFlagged = false;
  delete (field as { bankId?: string }).bankId;
  return field.spaceId;
}

const MAP_HAND = [
  "spell.view_air",
  "spell.view_earth",
  "spell.town_portal",
  "spell.visions",
  "spell.dimension_door",
  "spell.fly",
  "spell.water_walk",
  "ability.scouting",
  "ability.logistics",
  "ability.sorcery",
  "artifact.boots_of_speed",
  "spell.fortune",
  "ability.mysticism",
  "ability.knowledge",
  "ability.pathfinding"
];

/**
 * Template offers carry deliberately empty payloads (discard lists) that the
 * handler completes/refuses - never a real offer/resolution disagreement.
 */
const TEMPLATE_OFFERS = new Set<string>([
  "REFRESH_HAND",
  "OPENING_HAND_MULLIGAN",
  "RESOLVE_EXPLORERS_DISCARD",
  "SPEND_MORALE",
  "GIVE_UP",
  "END_TURN"
]);

// ---------------------------------------------------------------------------
// BUG 1 - the Commander Forge refuses a parallel actor it was offered to
// ---------------------------------------------------------------------------

describe("parallel regression - Commander Forge follows the actor's open turn", () => {
  it("a NON-active parallel actor can buy the Commander Forge offer legal-actions gave them", () => {
    const state = makeGame("audit-forge", {
      parallelTurns: 6,
      wog: { enabled: true, commanders: true, artifacts: true }
    });
    state.round = 3;
    expect(state.turn.mode).toBe("parallel");
    expect(state.activePlayerId).toBe("p1");

    // CONTROL: the nominal active seat's forge purchase works.
    const activeOffer = offer(state, "p1", (candidate) => candidate.action.type === "FORGE_COMMANDER_ARTIFACT");
    expect(activeOffer, "p1 should be offered the Forge").toBeTruthy();
    expect(applyAction(state, activeOffer!.action).errors).toEqual([]);

    // p2's parallel turn is OPEN and legal-actions offers the same purchase...
    const parallelOffer = offer(state, "p2", (candidate) => candidate.action.type === "FORGE_COMMANDER_ARTIFACT");
    expect(parallelOffer, "p2 should be offered the Forge").toBeTruthy();
    // The handler must accept the offer using the actor's own open turn.
    const parallelResult = applyAction(state, parallelOffer!.action);
    expect(
      parallelResult.errors.map((error) => error.message),
      "an offered Forge purchase must not be refused on an open parallel turn"
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// BUG 2 - an open Commander First Aid window freezes every other parallel actor
// ---------------------------------------------------------------------------

describe("AUDIT BUG - pendingCommanderFirstAid is not a parallel interaction blocker", () => {
  it("other parallel actors keep their quiet actions while a First Aid window is open", () => {
    const base = makeGame("audit-first-aid", { parallelTurns: 6 });

    // CONTROL: the documented twin (the after-combat Necromancy window) leaves
    // every other parallel actor their quiet bystander set.
    const withNecromancy = structuredClone(base);
    withNecromancy.adventure!.pendingNecromancy = { playerId: "p1", remaining: 1 } as never;
    const necromancyBystander = getLegalActions(withNecromancy, "p2");
    expect(parallelInteractionBlocker(withNecromancy, "p2")).toBe("p1");
    expect(necromancyBystander.some((legal) => legal.action.type === "MOVE_HERO")).toBe(true);

    // The WOG Hierophant's after-combat First Aid window is its sibling - but it
    // is missing from `parallelInteractionBlocker` (and from
    // `parallelSlotSignature`), so getAdventureLegalActions never routes a
    // bystander to the quiet set and its own early return hands back NOTHING.
    const withFirstAid = structuredClone(base);
    withFirstAid.adventure!.pendingCommanderFirstAid = {
      playerId: "p1",
      options: [
        { label: "Restore Halberdiers", kind: "flip-up", unitDefId: "castle.halberdiers", side: "pack" }
      ]
    } as never;
    expect(
      parallelInteractionBlocker(withFirstAid, "p2"),
      "an open First Aid window must block the other parallel actors"
    ).toBe("p1");
    expect(
      getLegalActions(withFirstAid, "p2").map((legal) => legal.action.type),
      "a parallel actor must keep its quiet moves while another player's First Aid window is open"
    ).toContain("MOVE_HERO");
  });
});

// ---------------------------------------------------------------------------
// BUG 3 - the reaction-window bystander branch hands a FIGHTER map moves
// ---------------------------------------------------------------------------

/** Deterministic LCG so the walk below is a fixed, replayable sequence. */
function lcg(seed: number): () => number {
  let value = seed;
  return () => (value = (value * 1103515245 + 12345) % 2147483648) / 2147483648;
}

function walkForRejectedMoves(seed: string, parallelTurns: number, runs: number): string[] {
  const failures: string[] = [];
  for (let run = 0; run < runs; run += 1) {
    let state = makeGame(seed + "-" + run, { parallelTurns, hand: MAP_HAND });
    for (const player of Object.values(state.players)) {
      player.morale = 1;
    }
    const random = lcg(1000 + run * 37);
    for (let step = 0; step < 300; step += 1) {
      const seats: PlayerId[] = ["p1", "p2", "p3"];
      const actor = seats[Math.floor(random() * 3)];
      const candidates = getLegalActions(state, actor).filter(
        (legal) => !TEMPLATE_OFFERS.has(legal.action.type as string)
      );
      if (candidates.length === 0) continue;
      const pick = candidates[Math.floor(random() * candidates.length)];
      const result = applyAction(state, pick.action);
      if (result.errors.length === 0) {
        state = result.state;
        continue;
      }
      if (pick.action.type === "MOVE_HERO") {
        const combat = state.combat;
        failures.push(
          "run " +
            run +
            " step " +
            step +
            ': ' +
            actor +
            ' was offered "' +
            pick.label +
            '" but it was refused - ' +
            result.errors[0]?.message +
            " (combat: " +
            (combat
              ? combat.context.kind + " " + combat.attackerPlayerId + " vs " + combat.defenderPlayerId
              : "none") +
            ", phase " +
            state.phase +
            ", reactionWindow priority " +
            (state.reactionWindow?.priorityPlayerId ?? "none") +
            ", blocker(" +
            actor +
            ") " +
            String(parallelInteractionBlocker(state, actor)) +
            ")"
        );
        break;
      }
      // Some NON-move offers are refused for reasons that are NOT
      // parallel-specific (a Secondary-Hero-led PvP prep window offers hand
      // cards the hand lock then refuses; the combat spell-per-round limit).
      // Those are reported in the audit prose, not asserted here.
    }
  }
  return failures;
}

describe("AUDIT BUG - a combat participant is handed the parallel quiet set", () => {
  it("no offered MOVE_HERO is ever refused in parallel mode (ordered CONTROL: none are)", () => {
    // CONTROL: the identical walk in ordered mode never has a refused move.
    expect(walkForRejectedMoves("audit-walk-ordered", 0, 8)).toEqual([]);
    // In parallel mode, a player who is THEMSELVES the fighter in an open combat
    // is routed to `getParallelBystanderActions` by the reactionWindow branch of
    // getLegalActions (priorityPlayerId !== them) - but
    // `parallelInteractionBlocker` gives a combat PARTICIPANT a null blocker, so
    // `moveHeroAdventure`'s `parallelQuietMoveBlocker` falls through to
    // `assertNoPendingInput` and refuses the very move that was offered.
    expect(walkForRejectedMoves("audit-walk-parallel", 8, 8)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Green pins: what IS correct in this area
// ---------------------------------------------------------------------------

describe("parallel turns - card plays (regression pins)", () => {
  it("offers the SAME map card plays to a non-active parallel actor as to the active seat", () => {
    const state = makeGame("audit-offer-parity", { parallelTurns: 4, hand: MAP_HAND });
    const cardOffers = (playerId: PlayerId) =>
      getLegalActions(state, playerId)
        .filter((legal) => legal.action.type === "PLAY_CARD" || legal.action.type === "CAST_SPELL")
        .map(
          (legal) =>
            legal.action.type +
            ":" +
            (legal.action as { cardId: string }).cardId +
            ":" +
            String((legal.action as { optionIndex?: number }).optionIndex ?? "-")
        )
        .sort();
    expect(state.activePlayerId).toBe("p1");
    expect(cardOffers("p2")).toEqual(cardOffers("p1"));
    expect(cardOffers("p3")).toEqual(cardOffers("p1"));
    expect(cardOffers("p2").length).toBeGreaterThan(5);

    // ORDERED CONTROL: only the active seat gets them.
    const ordered = makeGame("audit-offer-parity", { hand: MAP_HAND });
    expect(getLegalActions(ordered, "p2").filter((legal) => legal.action.type === "PLAY_CARD")).toEqual([]);
  });

  it("attributes every map card play to the ACTING parallel seat, never to activePlayerId", () => {
    const state = makeGame("audit-attribution", { parallelTurns: 4, hand: MAP_HAND });
    expect(state.activePlayerId).toBe("p1");

    // A map Power-tier Spell opens ITS OWN caster's boost window.
    const cast = apply(state, playOffer(state, "p2", "spell.view_air")!.action);
    expect(cast.pendingChoice?.playerId).toBe("p2");
    // p1 (the nominal active seat) is now the bystander.
    expect(parallelInteractionBlocker(cast, "p1")).toBe("p2");
    const commit = offer(cast, "p2", (candidate) => /Commit Power/.test(candidate.label))!;
    const resolved = apply(cast, commit.action);
    expect(resolved.players.p2.resources.gold).toBe(state.players.p2.resources.gold + 3);
    expect(resolved.players.p1.resources.gold).toBe(state.players.p1.resources.gold);

    // A turn-scoped ongoing lands on the actor with the actor's own expiry key.
    const played = apply(state, playOffer(state, "p2", "ability.scouting")!.action);
    expect(played.activeEffects.map((effect) => [effect.controllerId, effect.expiresAtTurnEndPlayerId])).toEqual([
      ["p2", "p2"]
    ]);

    // A "+Power then draw" rider banks onto the ACTOR's map Spell Power bank.
    const banked = apply(state, playOffer(state, "p2", "ability.sorcery")!.action);
    expect(banked.players.p2.mapSpellPowerBank).toBe(1);
    expect(banked.players.p1.mapSpellPowerBank ?? 0).toBe(0);

    // Hero movement from a card goes to the actor's own hero.
    const moved = apply(state, playOffer(state, "p2", "artifact.boots_of_speed", 0)!.action);
    expect(moved.heroes.hero_p2.movementPoints).toBe(state.heroes.hero_p2.movementPoints + 1);
    expect(moved.heroes.hero_p1.movementPoints).toBe(state.heroes.hero_p1.movementPoints);
  });

  it("offers independent card plays while another actor's map spell waits", () => {
    const state = makeGame("audit-bystander", { parallelTurns: 4, hand: MAP_HAND });
    const busy = apply(state, playOffer(state, "p2", "spell.view_air")!.action);
    const p1Offers = getLegalActions(busy, "p1");
    expect(p1Offers.some((legal) => legal.action.type === "PLAY_CARD")).toBe(true);
    expect(p1Offers.some((legal) => legal.action.type === "MOVE_HERO")).toBe(true);
    for (const legal of p1Offers) {
      if (TEMPLATE_OFFERS.has(legal.action.type as string) || legal.action.type === "PLAY_CARD") continue;
      const result = applyAction(busy, legal.action);
      expect(
        result.errors.map((error) => error.message),
        'bystander offer "' + legal.label + '" must apply'
      ).toEqual([]);
    }
  });

  it("opens an earned Search immediately while preserving the other player's spell choice", () => {
    const state = makeGame("audit-fifo", { parallelTurns: 4, hand: MAP_HAND });
    let next = apply(state, playOffer(state, "p2", "spell.view_air")!.action);
    next = apply(next, offer(next, "p1", (candidate) => candidate.action.type === "SPELL_BOOK_ACTION")!.action);
    expect(next.pendingChoice?.playerId).toBe("p1");
    const search = structuredClone(next.pendingChoice);
    expect(parallelStateForPlayer(next, "p2").pendingChoice?.playerId).toBe("p2");
    next = apply(next, offer(next, "p2", (candidate) => /Commit Power/.test(candidate.label))!.action);
    expect(parallelStateForPlayer(next, "p1").pendingChoice).toEqual(search);
  });
});

describe("parallel turns - turn-scoped effect durations (regression pins)", () => {
  it("pays a one-turn income ongoing exactly once, at its OWN owner's END_TURN", () => {
    let state = makeGame("audit-turn-end-income", {
      parallelTurns: 6,
      hand: ["artifact.endless_bag_of_gold", "ability.scouting"],
      houseRules: { "community-card-balance": true }
    });
    const goldBefore = {
      p1: state.players.p1.resources.gold,
      p2: state.players.p2.resources.gold,
      p3: state.players.p3.resources.gold
    };
    for (const playerId of ["p1", "p2", "p3"] as PlayerId[]) {
      state = apply(state, playOffer(state, playerId, "artifact.endless_bag_of_gold", 0)!.action);
      state = apply(state, playOffer(state, playerId, "ability.scouting")!.action);
    }
    expect(state.activeEffects).toHaveLength(6);

    // p1's END_TURN pays p1 ONLY, and expires nobody else's turn-scoped effect.
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.players.p1.resources.gold).toBe(goldBefore.p1 + 3);
    expect(state.players.p2.resources.gold).toBe(goldBefore.p2);
    expect(state.players.p3.resources.gold).toBe(goldBefore.p3);
    expect(state.activeEffects.filter((effect) => effect.controllerId === "p2")).toHaveLength(2);

    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.players.p2.resources.gold).toBe(goldBefore.p2 + 3);
    state = apply(state, { type: "END_TURN", playerId: "p3" });
    // The round wrapped: every turn-scoped effect expired at its owner's next
    // turn start, and no income paid twice.
    expect(state.round).toBe(2);
    expect(state.activeEffects).toEqual([]);
    expect(state.players.p3.resources.gold).toBe(goldBefore.p3 + 3);
    for (const playerId of ["p1", "p2", "p3"] as PlayerId[]) {
      expect(state.players[playerId].ongoingCards ?? []).toEqual([]);
    }
  });

  it("expires a parallel actor's map Spell Power bank on their OWN hero step only", () => {
    let state = makeGame("audit-power-bank", { parallelTurns: 4, hand: MAP_HAND });
    state = apply(state, playOffer(state, "p2", "ability.sorcery")!.action);
    state = apply(state, playOffer(state, "p3", "ability.sorcery")!.action);
    expect(state.players.p2.mapSpellPowerBank).toBe(1);
    expect(state.players.p3.mapSpellPowerBank).toBe(1);

    const p3Step = emptyFieldNextTo(state, "hero_p3");
    state = apply(state, { type: "MOVE_HERO", playerId: "p3", heroId: "hero_p3", to: p3Step });
    expect(state.players.p3.mapSpellPowerBank).toBe(0);
    expect(state.players.p2.mapSpellPowerBank, "another seat's move must not drain this bank").toBe(1);
  });
});
