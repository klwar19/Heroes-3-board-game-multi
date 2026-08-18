import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState, VisitStep } from "./state";
import {
  beginFieldVisit,
  classifyHeroStep,
  getMainHero,
  getTownOfPlayer,
  isFieldGuarded
} from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { createAdventureGameState } from "./index";
import { locationDefinitions } from "@/data/map/locations";

/**
 * Black-cube / decline / no-revisit invariant for every map Field.
 *
 * Rulebook category rules (mirrored in `locations.ts`):
 *  - VISITABLE fields take a *black cube* the moment they are visited and then
 *    "count as an Empty Field" — they can never be visited again. The cube goes
 *    on even when the visitor declines a "you may pay…" effect or cannot afford
 *    it (e.g. the Tree of Knowledge: https://en.homm3bg.wiki/fields/tree_of_knowledge/).
 *  - REVISITABLE fields never receive a cube and may be used again (for 1 MP).
 *  - FLAGGABLE fields take the visitor's faction cube (flag), never a black cube.
 *
 * These tests fail if the cube placement (adventure.ts `beginFieldVisit`), the
 * "treat-as-empty once cubed" early-return, the `PAY_TO` decline handling
 * (adventure-reducer.ts), or the walk-through classification (`classifyHeroStep`)
 * is removed or weakened — so the behavior is engine-enforced, not decorative.
 */

function makeGame(): GameState {
  return createAdventureGameState({ seed: "cube", difficulty: "normal", rollFirstPlayer: false });
}

const FIELD_ID = "50,50";

function injectField(state: GameState, location: string, opts: { blackCube?: boolean; difficulty?: number } = {}): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "cube-tile",
    slot: 0,
    location,
    difficulty: opts.difficulty,
    blackCube: opts.blackCube ?? false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = field.spaceId;
  return field;
}

/** A generously-stocked player so every field's effect can resolve or pend. */
function stockPlayer(state: GameState): void {
  const player = state.players.p1;
  player.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
  player.hand = ["stat.attack", "stat.power"];
  const town = getTownOfPlayer(state, "p1");
  if (town) town.buildings.push("castle.dwelling_bronze");
}

// Grail and Dragon Utopia are Lvl-VII creature banks with bespoke, win-condition
// dependent handlers (handleGrailVisit / handleDragonUtopiaVisit) that own their
// own cube logic; the generic visitable routing below does not apply to them.
const BESPOKE = new Set(["grail", "dragon_utopia"]);

const genericVisitable = Object.values(locationDefinitions).filter(
  (loc) => loc.category === "visitable" && !BESPOKE.has(loc.id)
);
const revisitable = Object.values(locationDefinitions).filter((loc) => loc.category === "revisitable");
const flaggable = Object.values(locationDefinitions).filter((loc) => loc.category === "flaggable");
const payToVisitable = genericVisitable.filter((loc) => JSON.stringify(loc.interaction).includes('"PAY_TO"'));

describe("Visitable fields: every visit drops a black cube", () => {
  it("covers a meaningful set of fields (guards against an empty filter)", () => {
    expect(genericVisitable.length).toBeGreaterThan(20);
    // Incantation is the paid shrine (3 gold); Gesture is free. (Gesture must
    // NOT appear here — that was the bug where the costs were swapped.)
    // factory_grave is the Factory rulebook Grave (optional pay 1 valuables →
    // Search(2) Artifacts + morale), a one-time pay-to visitable that still
    // drops its cube on visit. (anime.song_bac_quan left this set with the
    // 2026-08-19 FO redesign — it is a revisitable stake-and-pot den now,
    // pinned in anime-locations.test.ts.)
    expect(payToVisitable.map((loc) => loc.id).sort()).toEqual(
      ["factory_grave", "shrine_of_magic_incantation", "tree_of_knowledge", "university"].sort()
    );
  });

  for (const loc of genericVisitable) {
    it(`${loc.id}: places a black cube the instant it is visited`, () => {
      const state = makeGame();
      stockPlayer(state);
      const field = injectField(state, loc.id);
      const hero = getMainHero(state, "p1")!;
      // The cube is set synchronously before any choice/deck-search is awaited,
      // so it is already on whether the effect resolves now or pends for input.
      expect(() => beginFieldVisit(state, hero.id, field.spaceId, false)).not.toThrow();
      expect(field.blackCube).toBe(true);
    });

    it(`${loc.id}: once cubed it is an inert walk-through (no revisit)`, () => {
      const state = makeGame();
      stockPlayer(state);
      const field = injectField(state, loc.id, { blackCube: true });
      const hero = getMainHero(state, "p1")!;
      state.adventure!.pendingVisit = null;
      beginFieldVisit(state, hero.id, field.spaceId, false);
      expect(state.adventure!.pendingVisit).toBeNull();
      expect(classifyHeroStep(state, hero, field.spaceId)).toBe("open");
    });
  }
});

describe("Revisitable fields never take a black cube", () => {
  for (const loc of revisitable) {
    it(`${loc.id}: stays cube-free and keeps stopping heroes`, () => {
      const state = makeGame();
      stockPlayer(state);
      const field = injectField(state, loc.id);
      const hero = getMainHero(state, "p1")!;
      beginFieldVisit(state, hero.id, field.spaceId, false);
      expect(field.blackCube).toBe(false);
      // A revisitable field always re-stops a hero (it can be used again).
      expect(classifyHeroStep(state, hero, field.spaceId)).toBe("stop");
    });
  }
});

describe("Flaggable fields take a faction cube, never a black cube", () => {
  for (const loc of flaggable) {
    it(`${loc.id}: flags the visitor and leaves no black cube`, () => {
      const state = makeGame();
      stockPlayer(state);
      const field = injectField(state, loc.id);
      field.resource = "gold";
      field.amount = 5;
      const hero = getMainHero(state, "p1")!;
      beginFieldVisit(state, hero.id, field.spaceId, false);
      // A Settlement defers the flag until the visitor picks an income/unit.
      if (state.adventure!.pendingVisit?.steps[0]?.type === "SETTLEMENT_CHOICE") {
        resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
      }
      const owned = field.flagOwnerId === "p1" || Boolean(field.extraFlagOwnerIds?.includes("p1"));
      expect(field.blackCube).toBe(false);
      expect(owned).toBe(true);
    });
  }
});

describe('Cost-gated visitable fields: "you may pay…" can always be declined', () => {
  for (const loc of payToVisitable) {
    it(`${loc.id}: declining still drops the cube and never charges`, () => {
      const state = makeGame();
      stockPlayer(state);
      const before = { ...state.players.p1.resources };
      const field = injectField(state, loc.id);
      const hero = getMainHero(state, "p1")!;
      beginFieldVisit(state, hero.id, field.spaceId, false);
      expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("PAY_TO");

      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
      expect(field.blackCube).toBe(true);
      expect(state.players.p1.resources).toEqual(before); // not charged
      expect(state.adventure!.pendingVisit).toBeNull();
      expect(classifyHeroStep(state, hero, field.spaceId)).toBe("open"); // cannot revisit
    });

    it(`${loc.id}: a broke hero is still offered the choice and is cubed on decline`, () => {
      const state = makeGame();
      state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
      const field = injectField(state, loc.id);
      const hero = getMainHero(state, "p1")!;
      beginFieldVisit(state, hero.id, field.spaceId, false);
      // The PAY_TO step is always presented (so the player may decline) even when
      // no cost is affordable.
      expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("PAY_TO");
      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
      expect(field.blackCube).toBe(true);
      expect(state.adventure!.pendingVisit).toBeNull();
    });
  }
});

describe("Tree of Knowledge (the canonical visitable field)", () => {
  it("declining the payment cubes the field, costs nothing, and blocks revisits", () => {
    const state = makeGame();
    const player = state.players.p1;
    player.resources = { gold: 50, buildingMaterials: 0, valuables: 5 };
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    const field = injectField(state, "tree_of_knowledge");

    beginFieldVisit(state, hero.id, field.spaceId, false);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });

    expect(field.blackCube).toBe(true);
    expect(hero.experience).toBe(0); // gained no experience
    expect(player.resources).toEqual({ gold: 50, buildingMaterials: 0, valuables: 5 }); // paid nothing
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("open");

    // Walking back onto the used-up field does nothing at all.
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(hero.experience).toBe(0);
  });

  it("paying 10 gold actually grants 2 experience (effect is real, not decorative)", () => {
    const state = makeGame();
    const player = state.players.p1;
    player.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    const field = injectField(state, "tree_of_knowledge");

    beginFieldVisit(state, hero.id, field.spaceId, false);
    const pay = state.adventure!.pendingVisit!.steps[0] as Extract<VisitStep, { type: "PAY_TO" }>;
    const goldOption = pay.costOptions.findIndex((cost) => cost.gold === 10);
    expect(goldOption).toBeGreaterThanOrEqual(0);

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: goldOption });

    expect(player.resources.gold).toBe(0);
    expect(hero.experience).toBe(2);
    expect(field.blackCube).toBe(true);
    expect(state.adventure!.pendingVisit).toBeNull();
  });
});

describe("Guarded visitable fields: the cube doubles as the cleared-guard marker", () => {
  it("a guarded Tree of Knowledge stops heroes until cleared, then becomes a walk-through", () => {
    const state = makeGame();
    stockPlayer(state);
    const field = injectField(state, "tree_of_knowledge", { difficulty: 5 });
    const hero = getMainHero(state, "p1")!;

    // While guarded (no cube, never flagged) the hero must stop to fight.
    expect(isFieldGuarded(field)).toBe(true);
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("stop");

    // beginFieldVisit only runs after the guards fall (a combat win — see
    // resolveCombat in adventure-reducer.ts, which calls it solely on
    // outcome.winnerPlayerId === playerId). The cube it drops clears the guard.
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(field.blackCube).toBe(true);
    expect(isFieldGuarded(field)).toBe(false);
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("open");
  });
});
