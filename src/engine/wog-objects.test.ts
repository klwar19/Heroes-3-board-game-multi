/**
 * WOG New Objects (`wog.newObjects`) — the 3 Wake of Gods single-hex Field
 * Override objects (Emerald Tower / Mirror of the Home-Way / Junk Merchant).
 *
 * EFFECT-level tests (CLAUDE.md §1 / §1a): every claim asserts the observable
 * game OUTCOME (gold moved X→Y, a commander point appeared AND is spendable, the
 * hero STANDS on the town hex, a card left the hand to the removed pile, a search
 * was queued) and fails if the wiring is removed. Each has a CONTROL.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { locationDefinitions } from "@/data/map/locations";
import {
  WOG_FIELD_OVERRIDE_DEFINITIONS,
  WOG_FIELD_OVERRIDE_KIND_IDS
} from "@/data/wog/field-overrides";
import {
  customMapHasWogFieldOverridePins,
  fieldOverridePackageAllowed,
  getFieldOverrideDefinition,
  listFieldOverrideDefinitions
} from "@/data/map/field-overrides";
import { sanitizeSharedMap } from "@/server/map-registry";
import { applyAction, createAdventureGameState } from "./index";
import {
  assignPoolFieldOverrides,
  carveFieldOverride,
  fieldOverrideMayCoverField
} from "./field-overrides";
import { beginFieldVisit, getMainHero, getTileFootprintSpaceIds, tokenPlacementCandidates } from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { getLegalActions } from "./legal-actions";
import { chooseComputerAction } from "./computer/policy";
import type { GameAction, GameState, MapFieldState, MapTileState, VisitStep, WogModOptions } from "./state";

const FIELD_ID = "50,50";

function wogOptions(partial: Partial<WogModOptions> = {}): WogModOptions {
  return { enabled: true, commanders: false, newObjects: true, newCreatures: false, artifacts: false, ...partial };
}

function wogGame(opts: { seed?: string; commanders?: boolean; faction?: string; hero?: string } = {}): GameState {
  return createAdventureGameState({
    seed: opts.seed ?? `wog-obj-${opts.faction ?? "castle"}-${opts.commanders ? "cmd" : "plain"}`,
    ruleset: "binh",
    wog: wogOptions({ commanders: opts.commanders ?? false }),
    rollFirstPlayer: false,
    rotateStartTiles: false,
    players: [
      { id: "p1", name: "One", factionId: (opts.faction ?? "castle") as never, heroDefId: opts.hero ?? "catherine" },
      { id: "p2", name: "Two", factionId: opts.faction === "necropolis" ? "castle" : ("necropolis" as never) }
    ]
  });
}

/** Put a plain field at FIELD_ID with `location`, hero standing on it. */
function injectField(state: GameState, location: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "wog-loc-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return field;
}

/** Carve FIELD_ID into a wog override through the real FO carve path (stamps guards). */
function carveAt(state: GameState, kind: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "wog-loc-tile",
    slot: 0,
    location: "empty_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  carveFieldOverride(state.adventure!, field.spaceId, kind);
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return state.adventure!.fields[field.spaceId];
}

function visit(state: GameState): void {
  beginFieldVisit(state, getMainHero(state, "p1")!.id, FIELD_ID, false);
}

function firstStep(state: GameState): VisitStep | undefined {
  return state.adventure!.pendingVisit?.steps[0];
}

function menu(state: GameState): Extract<VisitStep, { type: "CHOOSE_ONE" }> {
  const step = firstStep(state);
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`expected a CHOOSE_ONE menu, got ${step?.type ?? "none"}`);
  }
  return step;
}

function chooseByLabel(state: GameState, match: (label: string) => boolean): void {
  const step = menu(state);
  const optionIndex = step.options.findIndex((o) => match(o.label));
  if (optionIndex < 0) {
    throw new Error(`no option matched: ${step.options.map((o) => o.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
}

function pay(state: GameState, optionIndex = 0): void {
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
}

function queuedSearches(state: GameState, deckId: string): number {
  return state.adventure!.rewardQueue.filter(
    (reward) => reward.kind === "shared-deck-search" && (reward as { deckId?: string }).deckId === deckId
  ).length;
}

// ===========================================================================
// 1. Registry hygiene + art on disk
// ===========================================================================
describe("WOG New Objects — registry", () => {
  it("registers exactly 3 kinds under package 'wog', all implemented, art on disk, locations present", () => {
    const ids = Object.keys(WOG_FIELD_OVERRIDE_DEFINITIONS).sort();
    expect(ids).toEqual(["emerald_tower", "junk_merchant", "mirror_home_way"]);
    for (const def of Object.values(WOG_FIELD_OVERRIDE_DEFINITIONS)) {
      expect(def.package, def.id).toBe("wog");
      expect(def.implementationStatus, def.id).toBe("implemented");
      // Art wins — every wog kind ships WITH a hex-art file (no glyph placeholder).
      expect(def.image, def.id).toBeTruthy();
      expect(existsSync(resolve(process.cwd(), `public${def.image}`)), `missing art ${def.image}`).toBe(true);
      // Its carve location resolves to an implemented location definition.
      expect(locationDefinitions[def.locationId]?.implementationStatus, def.id).toBe("implemented");
      // Registered into the global catalog (the engine reads it via the catalog).
      expect(getFieldOverrideDefinition(def.id)?.package, def.id).toBe("wog");
    }
    expect([...WOG_FIELD_OVERRIDE_KIND_IDS].sort()).toEqual(ids);
  });
});

// ===========================================================================
// 2. Package gating (pool/palette listing) + coexistence with anime
// ===========================================================================
describe("WOG New Objects — package gating", () => {
  it("fieldOverridePackageAllowed gates 'wog' on wogNewObjects ONLY (anime flag never leaks it)", () => {
    expect(fieldOverridePackageAllowed("wog", { wogNewObjects: true })).toBe(true);
    expect(fieldOverridePackageAllowed("wog", { wogNewObjects: false })).toBe(false);
    expect(fieldOverridePackageAllowed("wog", {})).toBe(false);
    // CONTROL — no cross-talk: an anime-on / wog-off game does NOT allow wog kinds.
    expect(fieldOverridePackageAllowed("wog", { animeEnabled: true })).toBe(false);
  });

  it("listing includes wog kinds only under the wog gate, and coexists with anime kinds when both on", () => {
    const listFor = (mods: { animeEnabled?: boolean; wogNewObjects?: boolean }) =>
      listFieldOverrideDefinitions({
        tileGroup: "far",
        implementedOnly: true,
        packageAllowed: (pkg) => fieldOverridePackageAllowed(pkg, mods)
      }).map((d) => d.id);

    const wogOnly = listFor({ wogNewObjects: true });
    expect(wogOnly).toContain("emerald_tower");
    expect(wogOnly).toContain("mirror_home_way");
    expect(wogOnly).toContain("junk_merchant");
    expect(wogOnly).not.toContain("bi_canh"); // anime off → no anime leak

    // CONTROL: anime on but wog off → the anime kind lists, the wog kinds do NOT.
    const animeOnly = listFor({ animeEnabled: true });
    expect(animeOnly).toContain("bi_canh");
    expect(animeOnly).not.toContain("emerald_tower");

    // Coexistence: both packages present in one pool when both gates pass.
    const both = listFor({ animeEnabled: true, wogNewObjects: true });
    expect(both).toContain("emerald_tower");
    expect(both).toContain("bi_canh");
  });

  it("state-level pool draws a wog kind only when wog.enabled AND wog.newObjects (both-off CONTROLs)", () => {
    const poolPending = (wog: WogModOptions): string | undefined => {
      const state = createAdventureGameState({
        seed: "wog-pool",
        ruleset: "binh",
        fieldOverrides: true,
        fieldOverridePlacement: "random",
        wog,
        rollFirstPlayer: false,
        rotateStartTiles: false
      });
      const tile = Object.values(state.adventure!.tiles)[0] as MapTileState;
      tile.faceDown = true;
      tile.group = "far";
      delete tile.pendingFieldOverride;
      delete tile.pendingFieldOverrides;
      assignPoolFieldOverrides(state, () => 0, { enabled: true });
      return state.adventure!.tiles[tile.id]?.pendingFieldOverride?.kind;
    };

    const on = poolPending(wogOptions());
    // Anime is off, so the only allowed package is wog — a pooled kind is wog.
    expect(on && WOG_FIELD_OVERRIDE_KIND_IDS.includes(on)).toBe(true);
    // CONTROL: newObjects off → no wog kinds allowed, anime off → empty pool.
    expect(poolPending(wogOptions({ newObjects: false }))).toBeUndefined();
    // CONTROL: the whole WOG mod off → same empty pool.
    expect(poolPending(wogOptions({ enabled: false }))).toBeUndefined();
  });
});

// ===========================================================================
// 3. Carve + Location-Token protection
// ===========================================================================
describe("WOG New Objects — carve + protection", () => {
  it("carves the location (Emerald Tower stamps its guard) and the hex is protected from a 2nd override / a token", () => {
    const state = wogGame({ seed: "wog-carve" });
    const adventure = state.adventure!;
    const tile = Object.values(adventure.tiles).find((t) => !t.faceDown)! as MapTileState;
    tile.group = "far";
    tile.awaitingRotation = false;
    const footprint = getTileFootprintSpaceIds(tile);
    const [carvedHex, controlHex] = footprint.filter((spaceId) => {
      const field = adventure.fields[spaceId];
      return (
        field &&
        field.location !== "town" &&
        field.location !== "blocked_field" &&
        !field.difficulty &&
        field.terrain !== "water" &&
        !Object.values(state.heroes).some((hero) => hero.spaceId === spaceId)
      );
    });
    if (!carvedHex || !controlHex) {
      throw new Error("expected two clean hexes on the staged tile");
    }
    for (const hex of [carvedHex, controlHex]) {
      const field = adventure.fields[hex];
      field.location = "empty_field";
      delete field.difficulty;
      delete field.resource;
      delete field.amount;
    }

    carveFieldOverride(adventure, carvedHex, "emerald_tower");
    expect(adventure.fields[carvedHex].location).toBe("wog.emerald_tower");
    expect(adventure.fields[carvedHex].difficulty).toBe(3); // registry guard stamped

    // A later override in the queue must pick a DIFFERENT hex…
    const mirrorDef = getFieldOverrideDefinition("mirror_home_way")!;
    expect(fieldOverrideMayCoverField(state, carvedHex, mirrorDef)).toBe(false);
    // …and a Monolith token may not overwrite it either.
    tile.pendingToken = { kind: "monolith" };
    const candidates = tokenPlacementCandidates(state, tile, "monolith");
    expect(candidates).not.toContain(carvedHex);
    // CONTROL: the untouched empty sibling stays coverable by both.
    expect(fieldOverrideMayCoverField(state, controlHex, mirrorDef)).toBe(true);
    expect(candidates).toContain(controlHex);
  });
});

// ===========================================================================
// 4. Emerald Tower — commander training / hero XP (guard cleared on the win)
// ===========================================================================
describe("Emerald Tower (wog.emerald_tower)", () => {
  it("win-then-visit: pay 3 → gold −3 AND a commander point that is SPENDABLE (a stat rises)", () => {
    const state = wogGame({ seed: "et-cmd", commanders: true, faction: "castle" });
    state.players.p1.resources.gold = 20;
    const field = carveAt(state, "emerald_tower");
    expect(field.difficulty).toBe(3); // guarded (Ⅲ) before the win

    visit(state); // beginFieldVisit == the post-win visit
    expect(field.difficulty).toBeFalsy(); // REVISITABLE: the beaten guard is cleared

    chooseByLabel(state, (l) => l.includes("commander"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    pay(state); // pay 3 gold

    expect(state.players.p1.resources.gold).toBe(17);
    expect(state.players.p1.commander?.gradePoints).toBe(1);

    // The point is REAL — spend it via COMMANDER_GRADE_UP and a stat rises.
    const result = applyAction(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });
    expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    expect(result.state.players.p1.commander?.grades.attack).toBe(1);
    expect(result.state.players.p1.commander?.gradePoints).toBe(0);
  });

  it("CONTROL: with the Commanders module OFF the commander arm is ABSENT, but the XP arm still works (level-up rides)", () => {
    const state = wogGame({ seed: "et-noсmd", commanders: false, faction: "castle" });
    state.players.p1.resources.gold = 20;
    expect(state.players.p1.commander).toBeUndefined();
    carveAt(state, "emerald_tower");

    visit(state);
    // Commander arm absent (no module, no commander).
    expect(menu(state).options.some((o) => o.label.includes("commander"))).toBe(false);

    const hero = getMainHero(state, "p1")!;
    hero.experience = 1; // level 1, one XP below the level-2 threshold (exp 2)
    hero.level = 1;
    chooseByLabel(state, (l) => l.includes("experience"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    pay(state); // pay 2 gold

    expect(state.players.p1.resources.gold).toBe(18);
    expect(hero.experience).toBe(2);
    expect(hero.level).toBe(2); // the real gainExperience pipeline levelled the hero up
  });
});

// ===========================================================================
// 5. Mirror of the Home-Way — pay-2 Town teleport
// ===========================================================================
describe("Mirror of the Home-Way (wog.mirror_home_way)", () => {
  function ownTownField(state: GameState): string {
    const town = Object.values(state.towns).find((t) => t.controllerId === "p1" && t.fieldId);
    if (!town?.fieldId) {
      throw new Error("expected p1 to control a town with a field");
    }
    return town.fieldId;
  }

  it("pay 2 → the hero STANDS on the chosen Town hex (multi-destination pick offered)", () => {
    const state = wogGame({ seed: "mirror-pay" });
    const townField = ownTownField(state);
    // A second reachable destination (a flagged Settlement) so the picker lists ≥2.
    state.adventure!.fields["51,51"] = {
      spaceId: "51,51",
      tileInstanceId: "wog-loc-tile",
      slot: 1,
      location: "settlement",
      blackCube: false,
      flagOwnerId: "p1",
      everFlagged: true,
      settlementResource: "gold"
    };
    const hero = getMainHero(state, "p1")!;
    injectField(state, "wog.mirror_home_way");
    state.players.p1.resources.gold = 10;

    visit(state);
    chooseByLabel(state, (l) => l.toLowerCase().includes("teleport"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    expect(hero.spaceId).toBe(FIELD_ID); // not moved yet — no free teleport

    pay(state); // pay 2 gold
    const picker = menu(state);
    expect(picker.options.length).toBeGreaterThanOrEqual(2); // multi-destination

    const townIndex = picker.options.findIndex((o) => o.label.startsWith("Town"));
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: townIndex });

    expect(state.players.p1.resources.gold).toBe(8); // paid 2
    expect(hero.spaceId).toBe(townField); // observably teleported onto the town
  });

  it("CONTROL: no controlled Town/Settlement → the teleport arm is ABSENT (inert)", () => {
    const state = wogGame({ seed: "mirror-none" });
    for (const town of Object.values(state.towns)) {
      town.controllerId = "p2"; // p1 controls no town
    }
    injectField(state, "wog.mirror_home_way");
    visit(state);
    expect(menu(state).options.some((o) => o.label.toLowerCase().includes("teleport"))).toBe(false);
  });

  it("CONTROL: no FREE teleport — declining the pay leaves the hero where it stood", () => {
    const state = wogGame({ seed: "mirror-decline" });
    ownTownField(state);
    const hero = getMainHero(state, "p1")!;
    injectField(state, "wog.mirror_home_way");
    state.players.p1.resources.gold = 10;

    visit(state);
    chooseByLabel(state, (l) => l.toLowerCase().includes("teleport"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });

    expect(hero.spaceId).toBe(FIELD_ID); // stayed put
    expect(state.players.p1.resources.gold).toBe(10); // paid nothing
  });
});

// ===========================================================================
// 6. Junk Merchant — tier-priced sells + a paid Artifact search
// ===========================================================================
describe("Junk Merchant (wog.junk_merchant)", () => {
  it("sells a minor/major/relic Artifact for 2/3/4 gold; the card leaves the hand to the removed pile", () => {
    for (const [cardId, gold] of [
      ["wog.artifact.magic_wand", 2], // minor
      ["wog.artifact.crimson_shield", 3], // major
      ["wog.artifact.dragonheart", 4] // relic
    ] as const) {
      const state = wogGame({ seed: `junk-sell-${cardId}` });
      const player = state.players.p1;
      player.resources.gold = 5;
      player.hand = [cardId];
      injectField(state, "wog.junk_merchant");

      visit(state);
      chooseByLabel(state, (l) => l.startsWith("Sell"));

      expect(player.resources.gold, cardId).toBe(5 + gold);
      expect(player.hand, cardId).not.toContain(cardId);
      expect(player.removed, cardId).toContain(cardId); // Trading-Post sell zone
    }
  });

  it("CONTROL: no Artifact in hand → the sell arm is ABSENT; pay 4 opens the shared Artifact Search and costs 4 gold", () => {
    const state = wogGame({ seed: "junk-search" });
    const player = state.players.p1;
    player.hand = [];
    player.resources.gold = 10;
    injectField(state, "wog.junk_merchant");

    visit(state);
    expect(menu(state).options.some((o) => o.label.startsWith("Sell"))).toBe(false);

    chooseByLabel(state, (l) => l.includes("Search"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    pay(state); // pay 4 gold

    expect(player.resources.gold).toBe(6);
    expect(queuedSearches(state, "artifacts")).toBe(1);
  });
});

// ===========================================================================
// 7. Designer pin: sanitize round-trip + auto-enable at setup
// ===========================================================================
describe("WOG New Objects — designer pin", () => {
  it("a wog Field Override pin survives the map-registry sanitize round-trip", () => {
    const record = sanitizeSharedMap(
      {
        id: "wog-map",
        tiles: [
          { row: 1, col: 1, group: "far", faceDown: true, fieldOverrides: [{ kind: "emerald_tower", slot: 3 }] }
        ]
      },
      1
    );
    expect(record!.tiles[0].fieldOverrides).toEqual([{ kind: "emerald_tower", slot: 3 }]);
  });

  it("a wog pin auto-enables wog.enabled + newObjects at setup (anime pins do NOT)", () => {
    expect(customMapHasWogFieldOverridePins([{ fieldOverride: { kind: "emerald_tower" } }])).toBe(true);
    expect(
      customMapHasWogFieldOverridePins([{ fieldOverrides: [{ kind: "junk_merchant" }] }])
    ).toBe(true);
    // CONTROL: an anime kind is NOT a wog pin.
    expect(customMapHasWogFieldOverridePins([{ fieldOverride: { kind: "bi_canh" } }])).toBe(false);

    const state = createAdventureGameState({
      seed: "wog-pin-setup",
      ruleset: "binh",
      rollFirstPlayer: false,
      rotateStartTiles: false,
      customMap: [
        { row: 0, col: 0, group: "far", faceDown: true, fieldOverride: { kind: "emerald_tower", slot: 0 } }
      ]
    });
    expect(state.wog?.enabled).toBe(true);
    expect(state.wog?.newObjects).toBe(true);
  });
});

// ===========================================================================
// 8. AI never stalls on the new visit menus
// ===========================================================================
describe("computer policy resolves the WOG object menus (no stall)", () => {
  function decideOn(state: GameState): GameAction | null {
    const decision = chooseComputerAction({
      playerId: "p1",
      state: state as never,
      legalActions: getLegalActions(state, "p1")
    });
    return decision?.action ?? null;
  }

  it("picks a resolving action for each of the three object menus", () => {
    for (const [kind, seed] of [
      ["wog.emerald_tower", "ai-et"],
      ["wog.mirror_home_way", "ai-mirror"],
      ["wog.junk_merchant", "ai-junk"]
    ] as const) {
      const state = wogGame({ seed });
      state.round = 3;
      state.players.p1.resources = { gold: 20, buildingMaterials: 2, valuables: 0 };
      injectField(state, kind);
      visit(state);
      expect(firstStep(state)?.type, kind).toBe("CHOOSE_ONE");
      const action = decideOn(state);
      expect(action?.type, kind).toBe("RESOLVE_VISIT_STEP");
    }
  });
});
