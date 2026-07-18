import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getReachableHeroPaths,
  isFieldGuarded,
  sanitizeCustomMapObject,
  validateCustomMapObjects,
  type CustomMapObject,
  type CustomMapTilePlan,
  type GameAction,
  type GameState,
  type MapSpaceId
} from "./index";
import { beginFieldVisit, drawGuardArmy, playerHoldsTentFlag } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { hexNeighbor, hexSpaceId, slotDirection, tileFootprint, type HexCoord } from "./hex";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// Designer OUTPOST objects (Polish fan-map convention): the Garrison, the
// Keymaster's Tent and the Barrier — standalone one-hex fields out of every
// tile. Every test asserts an OBSERVABLE outcome (flag ownership, an opened
// combat's context, hero reachability, a spent purse) with a CONTROL that
// diverges, so each fails if its wiring is removed.
// ---------------------------------------------------------------------------

const CLUSTER = { row: 24, col: 12 };

function adv(state: GameState): AdventureState {
  if (!state.adventure) {
    throw new Error("no adventure state");
  }
  return state.adventure;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshAll(state: GameState): GameState {
  let next = state;
  for (const playerId of ["p1", "p2"]) {
    if (next.players[playerId]?.needsHandRefresh || next.players[playerId]?.canMulligan) {
      next = applyOk(next, { type: "REFRESH_HAND", playerId, discardCardIds: [] });
    }
  }
  return next;
}

/** The empty hex just OUTSIDE `slot`'s ring hex (distance 2 from centre). */
function outwardHex(center: HexCoord, slot: number): HexCoord {
  const ring = tileFootprint(center, 0)[slot];
  return hexNeighbor(ring, slotDirection(slot, 0) as number);
}

function outpostGame(objects: CustomMapObject[], seed = "outposts"): GameState {
  const customMap: CustomMapTilePlan[] = [
    { row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }
  ];
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: false,
    customMap,
    customMapPreset: { objects },
    players: [
      { id: "p1", name: "P1", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  state.activePlayerId = "p1";
  return refreshAll(state);
}

const OUTPOST_HEX = outwardHex(CLUSTER, 1);
const OUTPOST_ID = hexSpaceId(OUTPOST_HEX);
const RING_ID = hexSpaceId(tileFootprint(CLUSTER, 0)[1]);

function standalone(kind: CustomMapObject["kind"], extra: Partial<CustomMapObject> = {}): CustomMapObject {
  return {
    kind,
    placement: { type: "standalone", row: OUTPOST_HEX.row, col: OUTPOST_HEX.col },
    ...extra
  } as CustomMapObject;
}

/** Put the player's hero on the ring hex next to the outpost, ready to step on. */
function stageHero(state: GameState, playerId: "p1" | "p2", spaceId: MapSpaceId = RING_ID): void {
  const hero = state.heroes[`hero_${playerId}`];
  hero.spaceId = spaceId;
  hero.movementPoints = 4;
  hero.movementHaltedThisTurn = false;
}

// ---------------------------------------------------------------------------
// 1. Garrison
// ---------------------------------------------------------------------------

describe("Garrison — flag, 3-gold army-only defense, bank-style guard", () => {
  it("an unguarded garrison is FLAGGED by the first visitor; walking your own garrison changes nothing", () => {
    let state = outpostGame([standalone("garrison")]);
    const field = adv(state).fields[OUTPOST_ID]!;
    expect(field.location).toBe("garrison");
    expect(field.flagOwnerId).toBeNull();

    stageHero(state, "p1");
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: OUTPOST_ID });
    expect(adv(state).fields[OUTPOST_ID]?.flagOwnerId).toBe("p1");

    // Re-entering your own garrison is a no-op (no re-flag event spam).
    const flags = state.eventLog.filter((event) => event.type === "FIELD_FLAGGED").length;
    stageHero(state, "p1");
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: OUTPOST_ID });
    expect(state.eventLog.filter((event) => event.type === "FIELD_FLAGGED").length).toBe(flags);
  });

  it("an enemy entering a FLAGGED garrison opens the 3-gold defend prompt; paying starts an ARMY-ONLY defense", () => {
    let state = outpostGame([standalone("garrison")], "garrison-defend");
    adv(state).fields[OUTPOST_ID]!.flagOwnerId = "p2";
    adv(state).fields[OUTPOST_ID]!.everFlagged = true;
    state.players.p2.resources.gold = 5;

    stageHero(state, "p1");
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: OUTPOST_ID });

    // The 3-gold decision is open for the OWNER (not the town's 8).
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the garrison OPTION_CHOICE to be open");
    }
    expect(choice.context).toBe("garrison");
    expect(choice.playerId).toBe("p2");
    expect(choice.prompt).toMatch(/garrison/i);
    expect(choice.prompt).toMatch(/3 gold/);
    expect(adv(state).pendingGarrison?.goldCost).toBe(3);

    // Paying spends EXACTLY 3 gold and opens a heroless (army-only) defense.
    const goldBefore = state.players.p2.resources.gold;
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: state.pendingChoice!.id, optionIndex: 0 });
    expect(state.players.p2.resources.gold).toBe(goldBefore - 3);
    expect(state.combat?.context.kind).toBe("player");
    expect(state.combat?.context.kind === "player" && state.combat.context.defenderHeroId).toBeNull();
  });

  it("declining (or an empty purse) lets the flag change hands without a fight (CONTROL: the prompt needs gold)", () => {
    let state = outpostGame([standalone("garrison")], "garrison-fall");
    adv(state).fields[OUTPOST_ID]!.flagOwnerId = "p2";
    adv(state).fields[OUTPOST_ID]!.everFlagged = true;
    state.players.p2.resources.gold = 5;
    stageHero(state, "p1");
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: OUTPOST_ID });
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: state.pendingChoice!.id, optionIndex: 1 }); // let it fall
    expect(adv(state).fields[OUTPOST_ID]?.flagOwnerId).toBe("p1");

    // CONTROL: with fewer than 3 gold the owner is never even asked.
    let broke = outpostGame([standalone("garrison")], "garrison-broke");
    adv(broke).fields[OUTPOST_ID]!.flagOwnerId = "p2";
    adv(broke).fields[OUTPOST_ID]!.everFlagged = true;
    broke.players.p2.resources.gold = 2;
    stageHero(broke, "p1");
    broke = applyOk(broke, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: OUTPOST_ID });
    expect(broke.pendingChoice).toBeNull();
    expect(adv(broke).fields[OUTPOST_ID]?.flagOwnerId).toBe("p1");
  });

  it("a GUARDED garrison fights BANK-style: difficulty 0, unlimited rounds, army at the designed level, no XP on the win", () => {
    const state = outpostGame([standalone("garrison", { guard: { level: 4 } })], "garrison-guard");
    const field = adv(state).fields[OUTPOST_ID]!;
    expect(field.difficulty).toBe(4);
    expect(field.customGuardLevel).toBe(4);
    expect(isFieldGuarded(field)).toBe(true);

    // The guard army draws at the DESIGNED level even though the combat opens
    // at difficulty 0 (normal difficulty-4 draw = 3 cards at Normal).
    expect(drawGuardArmy(state, field, 0)).toHaveLength(3);

    // A high-level hero gets NO Quick Combat — the fight always opens, with
    // the bank-style context (difficulty 0 → no experience; unlimited rounds).
    const fight = refreshAll(state);
    fight.heroes.hero_p1.level = 7;
    stageHero(fight, "p1");
    startNeutralEncounter(fight, fight.heroes.hero_p1, adv(fight).fields[OUTPOST_ID]!);
    expect(fight.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(false);
    expect(fight.combat?.context.kind).toBe("neutral");
    expect(fight.combat?.context.kind === "neutral" && fight.combat.context.difficulty).toBe(0);
    expect(fight.combat?.context.kind === "neutral" && fight.combat.context.unlimitedRounds).toBe(true);

    // The win seam (beginFieldVisit runs only on a win): flag lands, guard
    // cleared, and the hero gained NO experience.
    const win = refreshAll(state);
    const levelBefore = (win.heroes.hero_p1.level = 2);
    win.heroes.hero_p1.spaceId = OUTPOST_ID;
    beginFieldVisit(win, "hero_p1", OUTPOST_ID, false);
    const wonField = adv(win).fields[OUTPOST_ID]!;
    expect(wonField.flagOwnerId).toBe("p1");
    expect(wonField.difficulty).toBeUndefined();
    expect(wonField.customGuardLevel).toBeUndefined();
    expect(win.heroes.hero_p1.level).toBe(levelBefore);
  });
});

// ---------------------------------------------------------------------------
// 2. Keymaster's Tent — multi-flag
// ---------------------------------------------------------------------------

describe("Keymaster's Tent — multiple flags, colored key", () => {
  it("both players may flag the SAME tent (multi-flag), and each then holds the color key", () => {
    let state = outpostGame([standalone("keymaster_tent", { pair: 2 })], "tent-multiflag");
    const field = () => adv(state).fields[OUTPOST_ID]!;
    expect(field().location).toBe("keymaster_tent");
    expect(field().gatePair).toBe(2);

    stageHero(state, "p1");
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: OUTPOST_ID });
    expect(field().flagOwnerId).toBe("p1");
    expect(playerHoldsTentFlag(state, "p1", 2)).toBe(true);
    expect(playerHoldsTentFlag(state, "p2", 2)).toBe(false);

    // The second player flags the SAME tent — the first flag stays.
    state.activePlayerId = "p2";
    state.heroes.hero_p1.spaceId = RING_ID; // step aside
    stageHero(state, "p2");
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: OUTPOST_ID });
    expect(field().flagOwnerId).toBe("p1");
    expect(field().extraFlagOwnerIds).toContain("p2");
    expect(playerHoldsTentFlag(state, "p2", 2)).toBe(true);
    // CONTROL: a flag of color 2 is NOT a key for color 3.
    expect(playerHoldsTentFlag(state, "p2", 3)).toBe(false);
  });

  it("a guarded tent fights BANK-style too (difficulty 0 + unlimited)", () => {
    const state = outpostGame(
      [standalone("keymaster_tent", { pair: 1, guard: { units: ["neutral.troglodytes"] } })],
      "tent-guard"
    );
    const field = adv(state).fields[OUTPOST_ID]!;
    expect(field.customGuardUnits).toEqual(["neutral.troglodytes"]);
    const fight = refreshAll(state);
    stageHero(fight, "p1");
    startNeutralEncounter(fight, fight.heroes.hero_p1, field);
    expect(fight.combat?.context.kind === "neutral" && fight.combat.context.difficulty).toBe(0);
    expect(fight.combat?.context.kind === "neutral" && fight.combat.context.unlimitedRounds).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Barrier — the colored lock
// ---------------------------------------------------------------------------

describe("Barrier — enterable only with the matching tent flag", () => {
  function barrierGame(seed: string): GameState {
    // The barrier sits on the outpost hex; its tent (same color 3) on another
    // off-tile hex two slots over.
    const tentHex = outwardHex(CLUSTER, 2);
    return outpostGame(
      [
        standalone("barrier", { pair: 3 }),
        {
          kind: "keymaster_tent",
          pair: 3,
          placement: { type: "standalone", row: tentHex.row, col: tentHex.col }
        }
      ],
      seed
    );
  }

  it("without the tent flag the barrier is BLOCKED (not reachable, MOVE refused); with it, open", () => {
    let state = barrierGame("barrier-lock");
    expect(adv(state).fields[OUTPOST_ID]?.location).toBe("barrier");

    stageHero(state, "p1");
    const before = getReachableHeroPaths(state, state.heroes.hero_p1);
    expect(before.has(OUTPOST_ID), "barrier unreachable without the flag").toBe(false);
    const refused = applyAction(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: OUTPOST_ID });
    expect(refused.errors.length).toBeGreaterThan(0);

    // Flag the color-3 tent, and the same step is now legal.
    const tentId = hexSpaceId(outwardHex(CLUSTER, 2));
    adv(state).fields[tentId]!.flagOwnerId = "p1";
    stageHero(state, "p1");
    const after = getReachableHeroPaths(state, state.heroes.hero_p1);
    expect(after.has(OUTPOST_ID), "barrier open with the flag").toBe(true);
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: OUTPOST_ID });
    expect(state.heroes.hero_p1.spaceId).toBe(OUTPOST_ID);
  });

  it("CONTROL: a WRONG-color tent flag opens nothing", () => {
    const state = barrierGame("barrier-wrong-color");
    const tentId = hexSpaceId(outwardHex(CLUSTER, 2));
    // Hand the player a flag on the tent, but flip the BARRIER to color 4.
    adv(state).fields[tentId]!.flagOwnerId = "p1";
    adv(state).fields[OUTPOST_ID]!.gatePair = 4;
    stageHero(state, "p1");
    expect(getReachableHeroPaths(state, state.heroes.hero_p1).has(OUTPOST_ID)).toBe(false);
  });

  it("legal actions never offer the barrier step to a flagless hero (offer-side CONTROL)", () => {
    const state = barrierGame("barrier-offer");
    stageHero(state, "p1");
    const moves = getLegalActions(state, "p1").filter(
      (entry) => entry.action.type === "MOVE_HERO" && entry.action.to === OUTPOST_ID
    );
    expect(moves).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Sanitize / validate
// ---------------------------------------------------------------------------

describe("outpost sanitize + validation", () => {
  it("tent/barrier REQUIRE a color pair; a barrier's guard is stripped; a garrison keeps its guard", () => {
    expect(sanitizeCustomMapObject(standalone("keymaster_tent"))).toBeNull(); // no pair
    expect(sanitizeCustomMapObject(standalone("barrier"))).toBeNull(); // no pair
    const barrier = sanitizeCustomMapObject(standalone("barrier", { pair: 2, guard: { level: 5 } }));
    expect(barrier?.pair).toBe(2);
    expect(barrier?.guard, "a Barrier is never guarded").toBeUndefined();
    const garrison = sanitizeCustomMapObject(standalone("garrison", { guard: { level: 5 } }));
    expect(garrison?.guard).toEqual({ level: 5 });
  });

  it("an outpost on a TILE SLOT is dropped with a problem (standalone-only)", () => {
    const { accepted, problems } = validateCustomMapObjects(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [{ kind: "garrison", placement: { type: "tile-slot", row: CLUSTER.row, col: CLUSTER.col, slot: 1 } }]
    );
    expect(accepted).toHaveLength(0);
    expect(problems.join(" ")).toMatch(/standalone/i);
  });

  it("a barrier with NO same-color tent warns (a barrier with one does not)", () => {
    const lone = validateCustomMapObjects(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [standalone("barrier", { pair: 1 })]
    );
    expect(lone.warnings.join(" ")).toMatch(/no red Keymaster/i);

    const tentHex = outwardHex(CLUSTER, 2);
    const paired = validateCustomMapObjects(
      [{ row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }],
      [
        standalone("barrier", { pair: 1 }),
        { kind: "keymaster_tent", pair: 1, placement: { type: "standalone", row: tentHex.row, col: tentHex.col } }
      ]
    );
    expect(paired.warnings.join(" ")).not.toMatch(/no red Keymaster/i);
  });
});
