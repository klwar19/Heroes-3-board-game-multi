import { describe, expect, it } from "vitest";
import {
  applyAction,
  canCrossEdge,
  createAdventureGameState,
  describeMapObjects,
  heroCanDiscoverTileAcrossBorders,
  isFieldGuarded,
  sanitizeCustomMapObject,
  sanitizeCustomMapPreset,
  validateCustomMapObjects,
  type CustomMapObject,
  type CustomMapTilePlan,
  type GameAction,
  type GameState,
  type MapSpaceId
} from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import { hexNeighbor, hexSpaceId, slotDirection, tileFootprint, type HexCoord } from "./hex";
import type { AdventureState } from "./state";

// ---------------------------------------------------------------------------
// Designer Creature Bank as a SINGLE-HEX object (standalone). Pin a specific
// bank (Crypt, Imp Cache, …) on the map — the real bank fight + reward, not a
// random pile draw. Every claim asserts an OBSERVABLE outcome with a CONTROL.
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

const BANK_HEX = outwardHex(CLUSTER, 1);
const BANK_ID = hexSpaceId(BANK_HEX);
const RING_ID = hexSpaceId(tileFootprint(CLUSTER, 0)[1]);

function bankObject(extra: Partial<CustomMapObject> = {}): CustomMapObject {
  return {
    kind: "creature_bank",
    bankId: "crypt",
    placement: { type: "standalone", row: BANK_HEX.row, col: BANK_HEX.col },
    ...extra
  };
}

function bankGame(objects: CustomMapObject[], seed = "bank-object"): GameState {
  const customMap: CustomMapTilePlan[] = [
    { row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }
  ];
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    // Random pile banks OFF — the designed pin must still carve.
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

function stageHero(state: GameState, spaceId: MapSpaceId = RING_ID): void {
  const hero = state.heroes.hero_p1;
  hero.spaceId = spaceId;
  hero.movementPoints = 4;
  hero.movementHaltedThisTurn = false;
}

describe("sanitizeCustomMapObject — creature_bank", () => {
  it("keeps a valid bankId + optional size; drops missing/unknown bankId", () => {
    const clean = sanitizeCustomMapObject({
      kind: "creature_bank",
      bankId: "imp_cache",
      bankSize: 3,
      placement: { type: "standalone", row: 1, col: 2 }
    });
    expect(clean).toEqual({
      kind: "creature_bank",
      bankId: "imp_cache",
      bankSize: 3,
      placement: { type: "standalone", row: 1, col: 2 }
    });

    // CONTROL: no bankId → null.
    expect(
      sanitizeCustomMapObject({
        kind: "creature_bank",
        placement: { type: "standalone", row: 1, col: 2 }
      })
    ).toBeNull();
    // CONTROL: unknown bankId → null.
    expect(
      sanitizeCustomMapObject({
        kind: "creature_bank",
        bankId: "not_a_bank",
        placement: { type: "standalone", row: 1, col: 2 }
      })
    ).toBeNull();
    // CONTROL: tile-slot form is STANDALONE-only → null.
    expect(
      sanitizeCustomMapObject({
        kind: "creature_bank",
        bankId: "crypt",
        placement: { type: "tile-slot", row: 1, col: 2, slot: 3 }
      })
    ).toBeNull();
  });

  it("strips designer guard / first-clear reward / borders (bank is always border-free)", () => {
    const clean = sanitizeCustomMapObject({
      kind: "creature_bank",
      bankId: "crypt",
      guard: 3,
      reward: { gold: 5 },
      vp: 2,
      borderEdges: [0, 1, 2],
      placement: { type: "standalone", row: 1, col: 2 }
    });
    expect(clean?.guard).toBeUndefined();
    expect(clean?.reward).toBeUndefined();
    expect(clean?.vp).toBeUndefined();
    expect(clean?.borderEdges).toBeUndefined();
    expect(clean?.bankId).toBe("crypt");
  });

  it("round-trips through sanitizeCustomMapPreset", () => {
    const preset = sanitizeCustomMapPreset({
      objects: [
        {
          kind: "creature_bank",
          bankId: "dragon_utopia",
          bankSize: 4,
          placement: { type: "standalone", row: 5, col: 6 }
        }
      ]
    });
    expect(preset?.objects).toEqual([
      {
        kind: "creature_bank",
        bankId: "dragon_utopia",
        bankSize: 4,
        placement: { type: "standalone", row: 5, col: 6 }
      }
    ]);
    expect(describeMapObjects(preset!.objects!)).toMatch(/1 creature bank/);
  });
});

describe("validateCustomMapObjects — creature_bank", () => {
  const plans: CustomMapTilePlan[] = [
    { row: CLUSTER.row, col: CLUSTER.col, group: "far", faceDown: false, tileDefId: "F1" }
  ];

  it("accepts a standalone bank next to a tile", () => {
    const { accepted, problems } = validateCustomMapObjects(plans, [bankObject()]);
    expect(problems).toEqual([]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].bankId).toBe("crypt");
  });

  it("rejects a tile-slot bank (standalone only)", () => {
    const { accepted, problems } = validateCustomMapObjects(plans, [
      {
        kind: "creature_bank",
        bankId: "crypt",
        placement: { type: "tile-slot", row: CLUSTER.row, col: CLUSTER.col, slot: 1 }
      }
    ]);
    // sanitize would drop it first; validate still names the problem if it arrives.
    expect(accepted).toHaveLength(0);
    expect(problems.some((p) => /standalone/i.test(p))).toBe(true);
  });
});

describe("applyCustomMapObjects — creature_bank carve", () => {
  it("carves a real creature_bank field with the pinned bankId (pile option OFF is a CONTROL)", () => {
    const state = bankGame([bankObject({ bankId: "imp_cache", bankSize: 2 })]);
    const field = adv(state).fields[BANK_ID];
    expect(field).toBeDefined();
    expect(field?.location).toBe("creature_bank");
    expect(field?.bankId).toBe("imp_cache");
    expect(field?.bankSize).toBe(2);
    expect(field?.standalone).toBe(true);
    expect(field?.blackCube).toBe(false);
    expect(isFieldGuarded(field!)).toBe(true);

    // CONTROL: no bank object → no bank field at that hex.
    const bare = bankGame([]);
    expect(adv(bare).fields[BANK_ID]).toBeUndefined();
  });

  it("entering the pinned bank opens bank combat with that bankId (CONTROL: different bank id)", () => {
    const crypt = bankGame([bankObject({ bankId: "crypt" })], "crypt-fight");
    stageHero(crypt);
    startNeutralEncounter(crypt, crypt.heroes.hero_p1, adv(crypt).fields[BANK_ID]!);
    expect(crypt.combat?.context.kind).toBe("neutral");
    expect(crypt.combat?.context.kind === "neutral" && crypt.combat.context.bankId).toBe("crypt");
    // No Quick Combat for banks even at high hero level.
    expect(crypt.eventLog.some((event) => event.type === "QUICK_COMBAT_WON")).toBe(false);

    // CONTROL: a different pin opens a different bank.
    const imp = bankGame([bankObject({ bankId: "imp_cache" })], "imp-fight");
    stageHero(imp);
    startNeutralEncounter(imp, imp.heroes.hero_p1, adv(imp).fields[BANK_ID]!);
    expect(imp.combat?.context.kind === "neutral" && imp.combat.context.bankId).toBe("imp_cache");
  });

  it("a second distinct bank pin carves its own bank (no cross-talk)", () => {
    const second = outwardHex(CLUSTER, 2);
    const objects: CustomMapObject[] = [
      bankObject({ bankId: "crypt" }),
      {
        kind: "creature_bank",
        bankId: "naga_bank",
        placement: { type: "standalone", row: second.row, col: second.col }
      }
    ];
    const state = bankGame(objects, "two-banks");
    expect(adv(state).fields[BANK_ID]?.bankId).toBe("crypt");
    expect(adv(state).fields[hexSpaceId(second)]?.bankId).toBe("naga_bank");
  });

  it("carves with NO borderEdges even when a legacy save smuggles them (CONTROL: garrison keeps borders)", () => {
    const withSmuggled = bankGame([
      {
        kind: "creature_bank",
        bankId: "crypt",
        borderEdges: [0, 1, 2, 3, 4, 5],
        placement: { type: "standalone", row: BANK_HEX.row, col: BANK_HEX.col }
      }
    ]);
    // sanitize drops borders; setup never stamps them.
    expect(adv(withSmuggled).fields[BANK_ID]?.borderEdges).toBeUndefined();

    // CONTROL: a garrison still receives field-level borders from the object.
    const garrisonHex = outwardHex(CLUSTER, 2);
    const withGarrison = bankGame([
      {
        kind: "garrison",
        borderEdges: [0, 3],
        placement: { type: "standalone", row: garrisonHex.row, col: garrisonHex.col }
      }
    ]);
    expect(adv(withGarrison).fields[hexSpaceId(garrisonHex)]?.borderEdges).toEqual([0, 3]);
  });

  it("stale bank borderEdges never seal movement or tile discovery", () => {
    const state = bankGame([bankObject({ bankId: "crypt" })], "bank-open");
    // A designer STANDALONE bank has NO backing tile, so there is no printed
    // outer arc to retain (USER RULE 2026-09-05: "if there is no border outside,
    // don't add a border") — this is the everyday reachable shape of the
    // arc-less half. The retired `bank-interior-entry-only` line that used to
    // isolate this case is gone with the rule.
    state.adventure!.houseRules = {
      ...(state.adventure!.houseRules ?? {}),
      "discovery-border-gate": true,
    } as never;
    const field = adv(state).fields[BANK_ID]!;
    // Smuggle edges onto the live bank field (as if a hand-edit tried to seal it).
    field.borderEdges = [0, 1, 2, 3, 4, 5];

    // Movement onto/off the bank from the adjacent ring stays open — bank
    // field edges are ignored in isDesignedEdgeSealedBetween.
    expect(canCrossEdge(state, RING_ID, BANK_ID)).toBe(true);
    expect(canCrossEdge(state, BANK_ID, RING_ID)).toBe(true);

    // Discovery while standing on the bank is open when the target tile has
    // no designed edges (bank side never contributes a seal). Asserted with the
    // `discovery-border-gate` house rule ON (its BINH default since 2026-08-02;
    // still a Legacy toggle) — with it OFF adjacency alone already allows every
    // discovery, so the bank exception would be vacuous here.
    expect(
      heroCanDiscoverTileAcrossBorders(state, BANK_ID, field, {
        id: "fake-discover",
        tileDefId: "F1",
        group: "far",
        centerRow: BANK_HEX.row + 2,
        centerCol: BANK_HEX.col,
        rotation: 0,
        faceDown: true
      } as never)
    ).toBe(true);

    // CONTROL: the same full edge list on a NON-bank standalone DOES seal
    // against another fully-edged neighbor. Plant two empty standalones that
    // share an edge.
    const a = outwardHex(CLUSTER, 4);
    const b = hexNeighbor(a, 0);
    const aId = hexSpaceId(a);
    const bId = hexSpaceId(b);
    for (const [id, coord] of [
      [aId, a],
      [bId, b]
    ] as const) {
      adv(state).fields[id] = {
        spaceId: id,
        tileInstanceId: `standalone_obj_${id}`,
        slot: 0,
        location: "empty_field",
        blackCube: false,
        flagOwnerId: null,
        everFlagged: false,
        settlementResource: null,
        standalone: true,
        standaloneLayer: "surface",
        borderEdges: [0, 1, 2, 3, 4, 5]
      };
      void coord;
    }
    expect(canCrossEdge(state, aId, bId)).toBe(false);
  });
});
