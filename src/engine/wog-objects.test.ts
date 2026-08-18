/**
 * WOG New Objects (`wog.newObjects`) — the 7 Wake of Gods single-hex Field
 * Override objects (Emerald Tower / Mirror of the Home-Way / Junk Merchant /
 * Fishing Well / Living Skull / Adventure Cave / Altar of the Gods).
 *
 * EFFECT-level tests (CLAUDE.md §1 / §1a): every claim asserts the observable
 * game OUTCOME (gold moved X→Y, a commander point appeared AND is spendable, the
 * hero STANDS on the town hex, a card left the hand to the removed pile, a search
 * was queued, a gambled die's face drives the reward, a smashed skull is inert
 * for the NEXT visitor, a cave re-guards Ⅰ→Ⅱ→Ⅲ) and fails if the wiring is
 * removed. Each has a CONTROL.
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
  COMMANDER_ARTIFACT_SPECS,
  wogCommanderArtifactCards
} from "@/data/wog/commander-artifacts";
import { cardLibrary } from "@/data/cards/library";
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
import {
  beginFieldVisit,
  getMainHero,
  getTileFootprintSpaceIds,
  makeCombatUnitFromArmy,
  tokenPlacementCandidates
} from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { getLegalActions } from "./legal-actions";
import { chooseComputerAction } from "./computer/policy";
import type { GameAction, GameState, MapFieldState, MapTileState, VisitStep, WogModOptions } from "./state";

const FIELD_ID = "50,50";

function wogOptions(partial: Partial<WogModOptions> = {}): WogModOptions {
  return { enabled: true, commanders: false, newObjects: true, newCreatures: false, artifacts: false, ...partial };
}

function wogGame(
  opts: {
    seed?: string;
    commanders?: boolean;
    faction?: string;
    hero?: string;
    /** FO redesign wave 4: the Emerald Tower's drill arm is gated on this. */
    unitExperience?: boolean;
  } = {}
): GameState {
  return createAdventureGameState({
    seed: opts.seed ?? `wog-obj-${opts.faction ?? "castle"}-${opts.commanders ? "cmd" : "plain"}`,
    ruleset: "binh",
    wog: wogOptions({
      commanders: opts.commanders ?? false,
      ...(opts.unitExperience ? { unitExperience: true } : {})
    }),
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
  it("registers exactly 7 kinds under package 'wog', all implemented, art on disk, locations present", () => {
    const ids = Object.keys(WOG_FIELD_OVERRIDE_DEFINITIONS).sort();
    expect(ids).toEqual([
      "adventure_cave",
      "altar_of_gods",
      "emerald_tower",
      "fishing_well",
      "junk_merchant",
      "living_skull",
      "mirror_home_way"
    ]);
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
    for (const kind of [
      "emerald_tower",
      "mirror_home_way",
      "junk_merchant",
      "fishing_well",
      "living_skull",
      "adventure_cave",
      "altar_of_gods"
    ]) {
      expect(wogOnly, kind).toContain(kind);
    }
    expect(wogOnly).not.toContain("bi_canh"); // anime off → no anime leak

    // CONTROL: anime on but wog off → the anime kind lists, the wog kinds do NOT.
    const animeOnly = listFor({ animeEnabled: true });
    expect(animeOnly).toContain("bi_canh");
    expect(animeOnly).not.toContain("emerald_tower");
    expect(animeOnly).not.toContain("fishing_well");
    expect(animeOnly).not.toContain("adventure_cave");

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

  /**
   * FO redesign wave 4 (docs/field-override-redesign-plan.md): the tower gained a
   * DRILL arm — pay 4 gold, one CHOSEN army unit card gains +2 unit XP. Gated on
   * the Unit Experience rule (the arm is absent with it off), like every other
   * unit-XP teaching site.
   */
  it("wave 4 — pay 4 gold drills exactly +2 unit XP into the CHOSEN card only", () => {
    const state = wogGame({ seed: "et-drill", unitExperience: true });
    state.players.p1.resources.gold = 20;
    state.players.p1.army = [
      { id: "army_0", unitDefId: "castle.halberdiers", side: "few" },
      { id: "army_1", unitDefId: "castle.marksmen", side: "few" }
    ];
    carveAt(state, "emerald_tower");

    visit(state);
    chooseByLabel(state, (l) => l.includes("unit XP"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    pay(state); // pay 4 gold → opens the card pick

    expect(state.players.p1.resources.gold).toBe(16);
    expect(menu(state).options.some((o) => o.label.startsWith("Decline")), "AI-safe decline arm").toBe(true);
    chooseByLabel(state, (l) => l.includes("Marksmen"));

    const army = state.players.p1.army;
    expect(army.find((u) => u.id === "army_1")!.experience).toBe(2);
    expect(army.find((u) => u.id === "army_0")!.experience ?? 0).toBe(0); // CONTROL: only the pick moved
  });

  it("CONTROL: with the Unit Experience rule OFF there is no drill arm at all", () => {
    const state = wogGame({ seed: "et-drill-off" });
    state.players.p1.resources.gold = 20;
    state.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
    carveAt(state, "emerald_tower");

    visit(state);
    expect(menu(state).options.some((o) => o.label.includes("unit XP"))).toBe(false);
    // …and the printed arms are untouched (the XP arm is still there).
    expect(menu(state).options.some((o) => o.label.includes("Hero gains 1 experience"))).toBe(true);
  });

  it("CONTROL: Unit Experience ON but an EMPTY army → still no drill arm (never a dead prompt)", () => {
    const state = wogGame({ seed: "et-drill-empty", unitExperience: true });
    state.players.p1.resources.gold = 20;
    state.players.p1.army = [];
    carveAt(state, "emerald_tower");

    visit(state);
    expect(menu(state).options.some((o) => o.label.includes("unit XP"))).toBe(false);
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

  /**
   * FO redesign wave 4: the flat 2-gold fare is REPLACED by two fares keyed off
   * the DESTINATION's tile band — 1 gold to a Town/Settlement on a starting/far
   * tile, 3 gold to a near/center (or subterranean/sea/unresolvable) one. The old
   * "pay 2 → the hero stands on the town hex" pin is rewritten as the two cases
   * below; a flat-2 reading fails BOTH (each asserts an exact gold delta) and the
   * dedicated CONTROL asserts no 2-gold arm exists at all.
   */
  function stageTwoBandDestinations(state: GameState): { townField: string; deepField: string } {
    const townField = ownTownField(state); // home Town — its tile group is "starting"
    // A second destination in the DEEP band: a flagged Settlement whose tile is a
    // real `near` (Ⅳ–Ⅴ) tile instance.
    state.adventure!.tiles["wog-near-tile"] = {
      id: "wog-near-tile",
      tileDefId: "wog-near-tile",
      centerRow: 9,
      centerCol: 9,
      rotation: 0,
      faceDown: false,
      group: "near"
    };
    state.adventure!.fields["51,51"] = {
      spaceId: "51,51",
      tileInstanceId: "wog-near-tile",
      slot: 1,
      location: "settlement",
      blackCube: false,
      flagOwnerId: "p1",
      everFlagged: true,
      settlementResource: "gold"
    };
    injectField(state, "wog.mirror_home_way");
    state.players.p1.resources.gold = 10;
    return { townField, deepField: "51,51" };
  }

  it("wave 4 — a HOME-band destination costs exactly 1 gold and the hero stands on it", () => {
    const state = wogGame({ seed: "mirror-cheap" });
    const { townField } = stageTwoBandDestinations(state);
    const hero = getMainHero(state, "p1")!;

    visit(state);
    // Two fare arms are offered (one per reachable band) + Leave.
    const labels = menu(state).options.map((o) => o.label);
    expect(labels.filter((l) => l.toLowerCase().includes("teleport"))).toHaveLength(2);

    chooseByLabel(state, (l) => l.startsWith("Pay 1 gold"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    expect(hero.spaceId).toBe(FIELD_ID); // not moved yet — no free teleport
    pay(state);

    const picker = menu(state);
    // The 1-gold arm lists ONLY home-band destinations — the deep Settlement is
    // not reachable at this fare.
    expect(picker.options.every((o) => o.label.startsWith("Town"))).toBe(true);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p1.resources.gold).toBe(9); // exactly 1 gold
    expect(hero.spaceId).toBe(townField);
  });

  it("wave 4 — a NEAR/CENTER-band destination costs exactly 3 gold and the hero stands on it", () => {
    const state = wogGame({ seed: "mirror-dear" });
    const { deepField } = stageTwoBandDestinations(state);
    const hero = getMainHero(state, "p1")!;

    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Pay 3 gold"));
    pay(state);

    const picker = menu(state);
    expect(picker.options.every((o) => o.label.startsWith("Settlement"))).toBe(true);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p1.resources.gold).toBe(7); // exactly 3 gold
    expect(hero.spaceId).toBe(deepField);
  });

  it("CONTROL: the OLD flat 2-gold fare is gone — no arm charges 2, and the two fares differ", () => {
    const state = wogGame({ seed: "mirror-nolegacy" });
    stageTwoBandDestinations(state);
    visit(state);
    const labels = menu(state).options.map((o) => o.label);
    expect(labels.some((l) => l.startsWith("Pay 2 gold"))).toBe(false);
    expect(labels.some((l) => l.startsWith("Pay 1 gold"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Pay 3 gold"))).toBe(true);
  });

  it("CONTROL: an unresolvable destination tile is priced at the DEARER fare (no discount from missing data)", () => {
    const state = wogGame({ seed: "mirror-unknown-tile" });
    // A flagged Settlement whose tileInstanceId matches no tile at all.
    state.adventure!.fields["52,52"] = {
      spaceId: "52,52",
      tileInstanceId: "no-such-tile",
      slot: 1,
      location: "settlement",
      blackCube: false,
      flagOwnerId: "p1",
      everFlagged: true,
      settlementResource: "gold"
    };
    // Take the home Town out of the picture so only the unknown-tile hex remains.
    for (const town of Object.values(state.towns)) {
      const field = town.fieldId ? state.adventure!.fields[town.fieldId] : undefined;
      town.controllerId = "p2";
      if (field) {
        field.flagOwnerId = "p2";
      }
    }
    injectField(state, "wog.mirror_home_way");
    state.players.p1.resources.gold = 10;

    visit(state);
    const labels = menu(state).options.map((o) => o.label);
    expect(labels.some((l) => l.startsWith("Pay 3 gold"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Pay 1 gold"))).toBe(false);
  });

  it("CONTROL: no controlled Town/Settlement → the teleport arm is ABSENT (inert)", () => {
    const state = wogGame({ seed: "mirror-none" });
    // p1 controls no town. Town ownership is FLAG-first (setup already flags
    // each home Town's field for its owner), so taking control away means
    // moving the FLAG as well as the Town Board — `controllerId` alone is not
    // what the engine reads.
    for (const town of Object.values(state.towns)) {
      town.controllerId = "p2";
      const field = town.fieldId ? state.adventure!.fields[town.fieldId] : undefined;
      if (field) {
        field.flagOwnerId = "p2";
      }
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

  /**
   * Town ownership is FLAG-FIRST (`isOwnTownOrSettlementField`, adventure.ts):
   * capturing a Town flags its field while the Town Board's `controllerId`
   * DELIBERATELY never flips. The Mirror used to read `controllerId` alone, the
   * same bug reported against Inferno's Castle Gate — see
   * `castle-gate-teleport.test.ts`.
   */
  describe("Town ownership is flag-first (captured Towns)", () => {
    /** Opens the Mirror, pays the 2 gold, and returns the destination labels. */
    function destinationLabels(state: GameState): string[] {
      injectField(state, "wog.mirror_home_way");
      state.players.p1.resources.gold = 10;
      visit(state);
      chooseByLabel(state, (l) => l.toLowerCase().includes("teleport"));
      pay(state);
      return menu(state).options.map((option) => option.label);
    }

    /** Flags `spaceId` for `ownerId` without touching any Town Board. */
    function flagFor(state: GameState, spaceId: string, ownerId: string): void {
      const field = state.adventure!.fields[spaceId];
      if (!field) {
        throw new Error(`no field at ${spaceId}`);
      }
      field.flagOwnerId = ownerId;
      field.everFlagged = true;
    }

    it("a Town captured from an opponent IS a destination — the hero lands on it", () => {
      const state = wogGame({ seed: "mirror-captured" });
      const captured = state.towns.town_p2.fieldId!;
      flagFor(state, captured, "p1");
      state.heroes.hero_p2.spaceId = null; // the Mirror skips occupied hexes
      const hero = getMainHero(state, "p1")!;

      // The shape the bug lived in: p1 holds the flag, the Board still says p2.
      expect(state.towns.town_p2.controllerId).toBe("p2");

      const labels = destinationLabels(state);
      const capturedIndex = labels.findIndex((label) => label.includes("necropolis"));
      expect(capturedIndex, labels.join(" | ")).toBeGreaterThanOrEqual(0);

      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: capturedIndex });
      expect(hero.spaceId).toBe(captured); // observably teleported onto the captured town
      // FO redesign wave 4: the fare is 1 gold, not the old flat 2 — the captured
      // Town sits on a `starting` tile, i.e. the HOME band.
      expect(state.players.p1.resources.gold).toBe(9);
    });

    it("CONTROL: a Town captured FROM you is NOT a destination (its Board still says yours)", () => {
      const state = wogGame({ seed: "mirror-lost" });
      const home = state.towns.town_p1.fieldId!;
      // A flagged Settlement keeps the teleport arm alive, so the ABSENCE of the
      // Town below is about ownership and not about the arm vanishing wholesale.
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
      state.heroes.hero_p2.spaceId = null;
      flagFor(state, home, "p2");
      expect(state.towns.town_p1.controllerId).toBe("p1"); // Board untouched

      const labels = destinationLabels(state);
      expect(labels.some((label) => label.startsWith("Settlement"))).toBe(true);
      expect(labels.some((label) => label.startsWith("Town"))).toBe(false);
    });

    it("CONTROL: your own never-captured home Town is still a destination", () => {
      const state = wogGame({ seed: "mirror-home" });
      state.heroes.hero_p2.spaceId = null;
      // Setup already flags each home Town's field for its owner, so this is
      // the ordinary shape — the flag-first branch, agreeing with the Board.
      expect(state.adventure!.fields[state.towns.town_p1.fieldId!].flagOwnerId).toBe("p1");

      const labels = destinationLabels(state);
      expect(labels.some((label) => label.startsWith("Town"))).toBe(true);
      // …and the opponent's un-captured Town is not on the list.
      expect(labels.some((label) => label.includes("necropolis"))).toBe(false);
    });

    it("CONTROL: an UNFLAGGED Town field falls back to the Town Board's controllerId", () => {
      const state = wogGame({ seed: "mirror-unflagged" });
      state.heroes.hero_p2.spaceId = null;
      // A legacy/hand-built snapshot with no flag on the home Town field: the
      // fall-back keeps it yours, and keeps the opponent's out.
      state.adventure!.fields[state.towns.town_p1.fieldId!].flagOwnerId = null;
      state.adventure!.fields[state.towns.town_p2.fieldId!].flagOwnerId = null;

      const labels = destinationLabels(state);
      expect(labels.some((label) => label.startsWith("Town"))).toBe(true);
      expect(labels.some((label) => label.includes("necropolis"))).toBe(false);
    });
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

  // -------------------------------------------------------------------------
  // FO redesign wave 4 — the TRADE-IN and the MYSTERY CRATE
  // -------------------------------------------------------------------------
  /** The Artifact discard pile a card belongs to (BINH ships SPLIT tier piles). */
  const MINOR_DECK = "artifacts-minor";

  it("wave 4 trade-in: the hand Artifact and the discard TOP swap zones, and it pays exactly 1 gold", () => {
    const state = wogGame({ seed: "junk-trade" });
    const player = state.players.p1;
    player.resources.gold = 5;
    player.hand = ["wog.artifact.magic_wand"]; // minor → the minor discard pile
    const deck = state.decks[MINOR_DECK]!;
    const topBefore = deck.discardPile.at(-1)!;
    expect(topBefore, "BINH seeds one face-up card on every shared discard").toBeTruthy();
    const discardDepth = deck.discardPile.length;
    injectField(state, "wog.junk_merchant");

    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Trade in"));

    // Both zones asserted: the former top is in hand, the traded card is the new
    // face-up top, nothing left the game and the pile depth is unchanged.
    expect(player.hand).toContain(topBefore);
    expect(player.hand).not.toContain("wog.artifact.magic_wand");
    expect(deck.discardPile.at(-1)).toBe("wog.artifact.magic_wand");
    expect(deck.discardPile).not.toContain(topBefore);
    expect(deck.discardPile).toHaveLength(discardDepth);
    expect(player.removed).not.toContain("wog.artifact.magic_wand"); // NOT a sell
    expect(player.resources.gold).toBe(6); // exactly +1 gold
  });

  it("CONTROL: an EMPTY Artifact discard hides the trade-in arm (the sell arm stays)", () => {
    const state = wogGame({ seed: "junk-trade-empty" });
    state.players.p1.hand = ["wog.artifact.magic_wand"];
    state.decks[MINOR_DECK]!.discardPile = [];
    injectField(state, "wog.junk_merchant");

    visit(state);
    const labels = menu(state).options.map((o) => o.label);
    expect(labels.some((l) => l.startsWith("Trade in"))).toBe(false);
    expect(labels.some((l) => l.startsWith("Sell"))).toBe(true);
  });

  it("CONTROL: no Artifact in hand → no trade-in arm either (it is per hand card)", () => {
    const state = wogGame({ seed: "junk-trade-nohand" });
    state.players.p1.hand = [];
    injectField(state, "wog.junk_merchant");
    visit(state);
    expect(menu(state).options.some((o) => o.label.startsWith("Trade in"))).toBe(false);
  });

  it("wave 4 mystery crate: 5 gold buys the die — +1 pays a Search AND 2 gold, 0 a Search, −1 only 2 gold; the latch closes on EVERY face", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40 && seen.size < 3; i += 1) {
      const state = wogGame({ seed: `junk-crate-${i}` });
      const player = state.players.p1;
      player.hand = [];
      player.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
      const field = injectField(state, "wog.junk_merchant");

      visit(state);
      chooseByLabel(state, (l) => l.startsWith("Mystery crate"));
      expect(firstStep(state)?.type, `crate-${i}`).toBe("PAY_TO");
      pay(state); // pay 5 gold → latch, then the Attack die

      const roll = lastAttackRoll(state);
      seen.add(roll);
      if (roll === 1) {
        expect(player.resources.gold, `crate-${i} (+1)`).toBe(17); // −5 +2
        expect(queuedSearches(state, "artifacts"), `crate-${i} (+1)`).toBe(1);
      } else if (roll === 0) {
        expect(player.resources.gold, `crate-${i} (0)`).toBe(15); // −5, no refund
        expect(queuedSearches(state, "artifacts"), `crate-${i} (0)`).toBe(1);
      } else {
        expect(player.resources.gold, `crate-${i} (−1)`).toBe(17); // −5 +2, junk
        expect(queuedSearches(state, "artifacts"), `crate-${i} (−1)`).toBe(0);
      }
      // The once-ever latch closed on THIS face, and the arm is gone next visit.
      expect(field.fieldClaimedBy, `crate-${i} latch`).toEqual(["p1"]);
      visit(state);
      expect(
        menu(state).options.some((o) => o.label.startsWith("Mystery crate")),
        `crate-${i} second visit`
      ).toBe(false);
    }
    expect(seen, "all three Attack-die branches exercised").toEqual(new Set([-1, 0, 1]));
  });

  it("CONTROL: DECLINING the crate never latches it (the arm is still there next visit)", () => {
    const state = wogGame({ seed: "junk-crate-decline" });
    state.players.p1.hand = [];
    state.players.p1.resources.gold = 20;
    const field = injectField(state, "wog.junk_merchant");

    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Mystery crate"));
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });

    expect(field.fieldClaimedBy ?? []).toEqual([]);
    expect(state.players.p1.resources.gold).toBe(20);
    visit(state);
    expect(menu(state).options.some((o) => o.label.startsWith("Mystery crate"))).toBe(true);
  });
});

/** The face of the last Attack die rolled (ATTACK_DIE_TABLE), from the event log. */
function lastAttackRoll(state: GameState): number {
  const rolled = [...state.eventLog]
    .reverse()
    .find((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "attack");
  const rolls = (rolled as { attackRolls?: number[] } | undefined)?.attackRolls;
  if (!rolls || rolls.length === 0) {
    throw new Error("no Attack-die roll in the event log");
  }
  return rolls[0];
}

function commanderArtifactsInHand(state: GameState): string[] {
  return state.players.p1.hand.filter((id) => id in COMMANDER_ARTIFACT_SPECS);
}

// ===========================================================================
// 6b. Fishing Well — FO redesign wave 4: a consecutive-round STREAK ladder
//
// REWRITTEN (2026-08-19): the old pin here asserted the static pay-1-gold
// Attack-die gamble (+1 → +1 valuables / 0 → 2 gold back / −1 → nothing). That
// reading is GONE — the well now pays by the visitor's consecutive-round streak
// (1 → +1 valuables, 2 → +2 valuables, 3 → a Treasure die and the well runs dry
// for EVERYONE) and is once per player per GAME ROUND. No Attack die is rolled at
// all any more, which the first test below asserts explicitly.
// ===========================================================================
describe("Fishing Well (wog.fishing_well) — FO redesign wave 4", () => {
  /** Take the Fish arm; returns false when no menu is offered at all. */
  function fish(state: GameState): boolean {
    visit(state);
    if (!state.adventure!.pendingVisit) {
      return false;
    }
    chooseByLabel(state, (l) => l.startsWith("Fish"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    pay(state); // pay 1 gold
    return true;
  }

  /** Clear a pending Treasure-die pick (the 3rd catch) so the visit is closed. */
  function settleTreasurePick(state: GameState): void {
    if (state.adventure!.pendingVisit) {
      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    }
  }

  function treasureRolls(state: GameState, fromIndex: number): number {
    return state.eventLog
      .slice(fromIndex)
      .filter((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "treasure").length;
  }

  it("rounds R, R+1, R+2 pay +1 valuables, +2 valuables, then a Treasure die AND drain the well for everyone", () => {
    const state = wogGame({ seed: "fw-streak" });
    const player = state.players.p1;
    player.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
    const field = injectField(state, "wog.fishing_well");
    state.round = 4;

    // --- Round 4: first catch (streak 1) ---
    const logBefore = state.eventLog.length;
    expect(fish(state)).toBe(true);
    expect(player.resources.valuables).toBe(1);
    expect(player.resources.gold).toBe(19); // the 1-gold stake
    expect(field.wogFishingStreaks?.p1).toEqual({ round: 4, streak: 1 });
    expect(field.fieldRoundClaims).toEqual({ round: 4, playerIds: ["p1"] });
    // The Attack die is NOT part of this object any more (the old gamble is gone).
    expect(
      state.eventLog
        .slice(logBefore)
        .some((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "attack"),
      "no Attack-die gamble in the redesigned well"
    ).toBe(false);

    // --- Same round, second visit: refused outright (no menu, no charge) ---
    visit(state);
    expect(state.adventure!.pendingVisit, "once per player per ROUND").toBeNull();
    expect(player.resources.valuables).toBe(1);
    expect(player.resources.gold).toBe(19);
    expect(field.wogFishingStreaks?.p1).toEqual({ round: 4, streak: 1 }); // streak did NOT advance

    // --- Round 5: the streak continues → +2 valuables ---
    state.round = 5;
    expect(fish(state)).toBe(true);
    expect(player.resources.valuables).toBe(3); // 1 + 2
    expect(field.wogFishingStreaks?.p1).toEqual({ round: 5, streak: 2 });

    // --- Round 6: the third catch rolls a Treasure die and drains the well ---
    state.round = 6;
    const beforeThird = state.eventLog.length;
    const valuablesBeforeThird = player.resources.valuables;
    expect(fish(state)).toBe(true);
    expect(treasureRolls(state, beforeThird), "a Treasure die was rolled").toBe(1);
    expect(field.wogWellDry).toBe(true);
    expect(player.resources.valuables, "the 3rd catch pays no valuables").toBe(valuablesBeforeThird);
    settleTreasurePick(state);

    // --- CONTROL: the drain is GLOBAL — another player finds it inert ---
    const p2Hero = getMainHero(state, "p2")!;
    p2Hero.spaceId = FIELD_ID;
    state.round = 7;
    beginFieldVisit(state, p2Hero.id, FIELD_ID, false);
    expect(state.adventure!.pendingVisit, "a dry well is inert for everyone").toBeNull();
    // …and for the fisherman too.
    visit(state);
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("CONTROL: a SKIPPED round resets the streak — rounds R and R+2 both pay only +1 valuables", () => {
    const state = wogGame({ seed: "fw-reset" });
    const player = state.players.p1;
    player.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
    const field = injectField(state, "wog.fishing_well");

    state.round = 2;
    expect(fish(state)).toBe(true);
    expect(player.resources.valuables).toBe(1);

    state.round = 4; // round 3 skipped → the streak restarts at 1
    expect(menuLabelsAfterVisit(state).some((l) => l.includes("1 valuables"))).toBe(true);
    expect(fish(state)).toBe(true);
    expect(player.resources.valuables, "+1 again, NOT +2").toBe(2);
    expect(field.wogFishingStreaks?.p1).toEqual({ round: 4, streak: 1 });
    expect(field.wogWellDry).toBeFalsy();
  });

  it("CONTROL: a broke hero is only offered Decline on the stake, and declining pays nothing", () => {
    const state = wogGame({ seed: "fw-broke" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    const field = injectField(state, "wog.fishing_well");

    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Fish"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    const resolves = getLegalActions(state, "p1").filter((a) => a.action.type === "RESOLVE_VISIT_STEP");
    expect(resolves.some((a) => (a.action as { optionIndex?: number }).optionIndex !== undefined)).toBe(false);
    expect(resolves.some((a) => (a.action as { decline?: boolean }).decline === true)).toBe(true);

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
    expect(player.resources.gold).toBe(0);
    expect(player.resources.valuables).toBe(0);
    expect(field.wogFishingStreaks?.p1, "a declined stake never advances the streak").toBeUndefined();
  });
});

/** Opens the visit and returns the menu's labels (leaving the menu open). */
function menuLabelsAfterVisit(state: GameState): string[] {
  visit(state);
  return menu(state).options.map((o) => o.label);
}

// ===========================================================================
// 6c. Living Skull — listen (Search Ability) / smash (+2 gold, permanent latch)
// ===========================================================================
describe("Living Skull (wog.living_skull)", () => {
  it("Listen: a Search (1) of the Ability deck is queued, gold untouched (repeatable)", () => {
    const state = wogGame({ seed: "skull-listen" });
    const player = state.players.p1;
    player.resources.gold = 5;
    const field = injectField(state, "wog.living_skull");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Listen"));

    expect(queuedSearches(state, "abilities")).toBe(1);
    expect(player.resources.gold).toBe(5); // CONTROL: no gold changed hands
    expect(field.wogSkullSmashed).toBeFalsy(); // still intact — listening never smashes
  });

  /**
   * REWRITTEN for FO redesign wave 4 (2026-08-19). The old pin asserted that a
   * smashed skull is immediately INERT for everyone. It no longer is: the smash
   * also releases an ANGRY SPIRIT that re-guards the hex at Ⅱ. The next visitor to
   * BEAT that spirit (anyone, the smasher included) collects one Search (1)
   * Ability, and only then is the hex inert for good. The listen/smash MENU is
   * still gone the instant the latch is set — that half of the old pin survives
   * and is asserted below.
   */
  it("Smash: +2 gold, the latch closes AND an angry spirit re-guards the hex at Ⅱ", () => {
    const state = wogGame({ seed: "skull-smash" });
    const player = state.players.p1;
    player.resources.gold = 5;
    const field = injectField(state, "wog.living_skull");
    expect(field.difficulty, "unsmashed: no guard").toBeFalsy();

    visit(state);
    chooseByLabel(state, (l) => l.includes("Smash"));

    expect(player.resources.gold).toBe(7); // +2 gold
    expect(field.wogSkullSmashed).toBe(true); // latch set
    expect(field.difficulty).toBe(2); // the spirit stands guard
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("the just-beaten spirit pays exactly ONE Ability search and clears — then the hex is inert for EVERYONE", () => {
    const state = wogGame({ seed: "skull-spirit" });
    const player = state.players.p1;
    player.resources.gold = 5;
    const field = injectField(state, "wog.living_skull");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Smash"));
    const searchesAfterSmash = queuedSearches(state, "abilities");

    // A SECOND visitor beats the spirit (beginFieldVisit runs only on a win) —
    // it is whoever beats it, not necessarily the smasher.
    const p2Hero = getMainHero(state, "p2")!;
    p2Hero.spaceId = FIELD_ID;
    beginFieldVisit(state, p2Hero.id, FIELD_ID, false);

    expect(queuedSearches(state, "abilities")).toBe(searchesAfterSmash + 1);
    expect(field.difficulty, "the spirit is laid to rest").toBeFalsy();
    expect(state.adventure!.pendingVisit).toBeNull(); // the search is a queued reward
    expect(field.wogSkullSmashed).toBe(true); // still silent — no listen/smash menu

    // CONTROL: fully inert afterwards — no menu, no second spirit reward, for the
    // spirit-slayer AND for the original smasher.
    const searchesAfterSpirit = queuedSearches(state, "abilities");
    beginFieldVisit(state, p2Hero.id, FIELD_ID, false);
    expect(state.adventure!.pendingVisit).toBeNull();
    beginFieldVisit(state, getMainHero(state, "p1")!.id, FIELD_ID, false);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(queuedSearches(state, "abilities")).toBe(searchesAfterSpirit);
    expect(field.difficulty).toBeFalsy(); // nothing re-stamps the guard
  });

  it("CONTROL: a smashed skull whose spirit NOBODY fought stays a guarded hex (no reward without the win)", () => {
    const state = wogGame({ seed: "skull-spirit-standing" });
    injectField(state, "wog.living_skull");
    visit(state);
    chooseByLabel(state, (l) => l.includes("Smash"));

    const field = state.adventure!.fields[FIELD_ID];
    expect(field.difficulty).toBe(2);
    // Nothing about the smash pays the spirit's secret — that only happens on the
    // post-win visit above.
    expect(queuedSearches(state, "abilities")).toBe(0);
  });

  it("CONTROL: an INTACT skull re-offers its menu on a second visit (latch is what silences it)", () => {
    const state = wogGame({ seed: "skull-intact" });
    injectField(state, "wog.living_skull");

    visit(state);
    expect(menu(state).options.some((o) => o.label.includes("Listen"))).toBe(true);
    // Leave (no smash) → the latch stays unset → the menu returns next visit.
    chooseByLabel(state, (l) => l === "Leave");
    expect(state.adventure!.fields[FIELD_ID].wogSkullSmashed).toBeFalsy();

    visit(state);
    expect(menu(state).options.some((o) => o.label.includes("Smash"))).toBe(true);
  });
});

// ===========================================================================
// 6d. Adventure Cave — escalating Ⅰ→Ⅱ→Ⅲ fight + scaling reward ladder
// ===========================================================================
describe("Adventure Cave (wog.adventure_cave)", () => {
  /**
   * REWRITTEN for FO redesign wave 4 (2026-08-19): the 2nd win no longer rolls a
   * Treasure die — it hands out a FIXED Stack Token, the player picking both the
   * card and the stat. The Treasure die survives only as the fall-back when no
   * army card is eligible (pinned separately below).
   */
  it("escalates Ⅰ→Ⅱ→Ⅲ, pays +3 gold / a chosen Stack Token / Search Artifact, then clears for good", () => {
    // A cave carve stamps the fresh difficulty-Ⅰ guard. `visit()` stands in for
    // the post-win beginFieldVisit each expedition (the guard was just beaten).
    const state = wogGame({ seed: "cave-escalate" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    player.army = [
      { id: "army_0", unitDefId: "castle.halberdiers", side: "few" },
      { id: "army_1", unitDefId: "castle.marksmen", side: "few" }
    ];
    const field = carveAt(state, "adventure_cave");
    expect(field.difficulty).toBe(1); // guarded Ⅰ on first entry

    // --- Win 1: +3 gold, re-guard to Ⅱ ---
    visit(state);
    expect(field.wogCaveWins).toBe(1);
    expect(player.resources.gold).toBe(3);
    expect(field.difficulty).toBe(2); // re-guarded one higher
    expect(state.adventure!.pendingVisit).toBeNull(); // auto-resolves (no stall)

    // --- Win 2: a chosen Stack Token on a chosen card, re-guard to Ⅲ ---
    const eventsBefore = state.eventLog.length;
    visit(state);
    expect(field.wogCaveWins).toBe(2);
    expect(field.difficulty).toBe(3);
    expect(menu(state).options.some((o) => o.label.startsWith("Leave")), "AI-safe decline arm").toBe(true);
    chooseByLabel(state, (l) => l.includes("Marksmen"));
    chooseByLabel(state, (l) => l === "+1 Attack");

    const marksmen = player.army.find((u) => u.id === "army_1")!;
    expect(marksmen.stackToken).toBe("attack");
    expect(player.army.find((u) => u.id === "army_0")!.stackToken, "CONTROL: only the pick moved")
      .toBeUndefined();
    // The token is REAL: the combat card built from it fights at +1 Attack.
    const withToken = makeCombatUnitFromArmy(marksmen, "p1", "u1", 0, "binh")!;
    const withoutToken = makeCombatUnitFromArmy({ ...marksmen, stackToken: undefined }, "p1", "u2", 1, "binh")!;
    expect(withToken.attack).toBe(withoutToken.attack + 1);
    expect(withToken.stackToken).toBe("attack");
    // CONTROL: the OLD reward is gone — no Treasure die was rolled this window.
    expect(
      state.eventLog
        .slice(eventsBefore)
        .some((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "treasure"),
      "the 2nd win no longer rolls a Treasure die"
    ).toBe(false);
    expect(state.adventure!.pendingVisit).toBeNull();

    // --- Win 3: Search (1) Artifact, cleared for good ---
    // (measure the DELTA — the win-2 Treasure die can itself roll an
    // artifact-search face, so the absolute count is not always 1.)
    const searchesBeforeWin3 = queuedSearches(state, "artifacts");
    visit(state);
    expect(field.wogCaveWins).toBe(3);
    expect(field.difficulty).toBeFalsy(); // no guard — cleared permanently
    expect(queuedSearches(state, "artifacts")).toBe(searchesBeforeWin3 + 1);

    // --- A later peaceful re-entry is inert: no reward, still cleared ---
    const goldAfter = player.resources.gold;
    const searchesAfter = queuedSearches(state, "artifacts");
    visit(state);
    expect(field.wogCaveWins).toBe(3); // unchanged
    expect(field.difficulty).toBeFalsy();
    expect(player.resources.gold).toBe(goldAfter);
    expect(queuedSearches(state, "artifacts")).toBe(searchesAfter);
  });

  it("CONTROL: the reward ladder differs by win count (win 1 is +3 gold, NOT a Search)", () => {
    const state = wogGame({ seed: "cave-win1" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    carveAt(state, "adventure_cave");
    visit(state);
    expect(player.resources.gold).toBe(3);
    expect(queuedSearches(state, "artifacts")).toBe(0); // NOT the 3rd-win reward
  });

  it("CONTROL fall-back: with EVERY army card already Stacked, win 2 rolls the Treasure die instead", () => {
    const state = wogGame({ seed: "cave-token-fallback" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    player.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few", stackToken: "defense" }];
    const field = carveAt(state, "adventure_cave");

    visit(state); // win 1
    const eventsBefore = state.eventLog.length;
    visit(state); // win 2 — nothing eligible for a token

    expect(field.wogCaveWins).toBe(2);
    expect(
      state.eventLog
        .slice(eventsBefore)
        .some((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "treasure"),
      "the Treasure die is the fall-back"
    ).toBe(true);
    // The already-Stacked card was never overwritten.
    expect(player.army[0].stackToken).toBe("defense");
  });

  it("CONTROL: an EMPTY army also falls back to the Treasure die (never a dead prompt)", () => {
    const state = wogGame({ seed: "cave-token-empty" });
    state.players.p1.army = [];
    carveAt(state, "adventure_cave");
    visit(state); // win 1
    const eventsBefore = state.eventLog.length;
    visit(state); // win 2
    expect(
      state.eventLog
        .slice(eventsBefore)
        .some((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "treasure")
    ).toBe(true);
  });
});

// ===========================================================================
// 6e. Altar of the Gods — pay 3 valuables → morale / XP / commander-point arm
// ===========================================================================
describe("Altar of the Gods (wog.altar_of_gods)", () => {
  function offerBlessing(state: GameState): void {
    chooseByLabel(state, (l) => l.toLowerCase().includes("offering"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    pay(state); // pay 3 valuables → opens the blessing CHOOSE_ONE
  }

  it("pay 3 valuables → +1 morale (valuables spent, XP untouched)", () => {
    const state = wogGame({ seed: "altar-morale" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 5 };
    player.morale = 0;
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    injectField(state, "wog.altar_of_gods");

    visit(state);
    offerBlessing(state);
    chooseByLabel(state, (l) => l.includes("morale"));

    expect(player.resources.valuables).toBe(2); // paid 3
    expect(player.morale).toBe(1);
    expect(hero.experience).toBe(0); // CONTROL: the XP arm did not run
  });

  it("pay 3 valuables → +2 hero experience (rides the real gainExperience pipeline: a level-up)", () => {
    const state = wogGame({ seed: "altar-xp" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 5 };
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    hero.level = 1;
    injectField(state, "wog.altar_of_gods");

    visit(state);
    offerBlessing(state);
    chooseByLabel(state, (l) => l.includes("experience"));

    expect(player.resources.valuables).toBe(2);
    expect(hero.experience).toBe(2);
    expect(hero.level).toBe(2); // exp 2 crosses the level-2 threshold via gainExperience
  });

  it("commander arm: with Commanders ON, pay 3 valuables → +1 commander point that is SPENDABLE", () => {
    const state = wogGame({ seed: "altar-cmd", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 5 };
    injectField(state, "wog.altar_of_gods");

    visit(state);
    offerBlessing(state);
    chooseByLabel(state, (l) => l.includes("commander"));

    expect(player.resources.valuables).toBe(2);
    expect(player.commander?.gradePoints).toBe(1);
    // REAL point — spend it and a stat rises.
    const result = applyAction(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "defense" });
    expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    expect(result.state.players.p1.commander?.grades.defense).toBe(1);
  });

  it("CONTROL: with Commanders OFF the commander blessing is ABSENT (only morale + XP offered)", () => {
    const state = wogGame({ seed: "altar-nocmd", commanders: false, faction: "castle" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 5 };
    injectField(state, "wog.altar_of_gods");

    visit(state);
    offerBlessing(state);
    const blessing = menu(state);
    expect(blessing.options.some((o) => o.label.includes("morale"))).toBe(true);
    expect(blessing.options.some((o) => o.label.includes("experience"))).toBe(true);
    expect(blessing.options.some((o) => o.label.includes("commander"))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // FO redesign wave 4 — the GREATER SACRIFICE arm
  // -------------------------------------------------------------------------
  it("wave 4 greater sacrifice: the chosen card leaves the game for good and +4 hero XP is paid", () => {
    const state = wogGame({ seed: "altar-sacrifice-xp" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 }; // no offering needed
    player.army = [
      { id: "army_0", unitDefId: "castle.halberdiers", side: "few" },
      { id: "army_1", unitDefId: "castle.marksmen", side: "pack" }
    ];
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    hero.level = 1;
    injectField(state, "wog.altar_of_gods");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Greater sacrifice"));
    expect(menu(state).options.some((o) => o.label === "Sacrifice nothing"), "AI-safe decline arm").toBe(true);
    chooseByLabel(state, (l) => l.includes("Marksmen"));
    chooseByLabel(state, (l) => l.includes("hero experience"));

    // The CARD is gone — not flipped, not parked in any other zone.
    expect(player.army.map((u) => u.id)).toEqual(["army_0"]);
    expect(player.army.some((u) => u.unitDefId === "castle.marksmen")).toBe(false);
    for (const zone of [player.hand, player.discard, player.deck, player.removed]) {
      expect(zone).not.toContain("castle.marksmen");
    }
    expect(state.decks["neutral-bronze"]!.discardPile).not.toContain("castle.marksmen");
    expect(hero.experience).toBe(4); // exactly +4, through the real gainExperience pipeline
  });

  it("wave 4 greater sacrifice: the commander branch pays +1 stat point AND +1 morale", () => {
    const state = wogGame({ seed: "altar-sacrifice-cmd", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.morale = 0;
    player.army = [
      { id: "army_0", unitDefId: "castle.halberdiers", side: "few" },
      { id: "army_1", unitDefId: "castle.marksmen", side: "few" }
    ];
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    injectField(state, "wog.altar_of_gods");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Greater sacrifice"));
    chooseByLabel(state, (l) => l.includes("Halberdiers"));
    chooseByLabel(state, (l) => l.includes("commander"));

    expect(player.army.map((u) => u.id)).toEqual(["army_1"]);
    expect(player.commander?.gradePoints).toBe(1);
    expect(player.morale).toBe(1);
    expect(hero.experience, "CONTROL: the XP branch did not run").toBe(0);
    // The point is REAL — spend it and a stat rises.
    const result = applyAction(state, { type: "COMMANDER_GRADE_UP", playerId: "p1", stat: "attack" });
    expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
    expect(result.state.players.p1.commander?.grades.attack).toBe(1);
  });

  it("CONTROL: with only ONE army card the sacrifice arm is ABSENT (never strands an army)", () => {
    const state = wogGame({ seed: "altar-sacrifice-one" });
    state.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
    injectField(state, "wog.altar_of_gods");

    visit(state);
    const labels = menu(state).options.map((o) => o.label);
    expect(labels.some((l) => l.includes("Greater sacrifice"))).toBe(false);
    expect(labels.some((l) => l.toLowerCase().includes("offering")), "the printed arm is untouched").toBe(true);
  });

  it("CONTROL: with Commanders OFF the sacrifice offers ONLY the hero-XP boon", () => {
    const state = wogGame({ seed: "altar-sacrifice-nocmd" });
    state.players.p1.army = [
      { id: "army_0", unitDefId: "castle.halberdiers", side: "few" },
      { id: "army_1", unitDefId: "castle.marksmen", side: "few" }
    ];
    injectField(state, "wog.altar_of_gods");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Greater sacrifice"));
    chooseByLabel(state, (l) => l.includes("Halberdiers"));
    const boons = menu(state).options.map((o) => o.label);
    expect(boons.some((l) => l.includes("commander"))).toBe(false);
    expect(boons.some((l) => l.includes("hero experience"))).toBe(true);
  });

  it("CONTROL: too few valuables → only Decline is offered on the offering PAY_TO", () => {
    const state = wogGame({ seed: "altar-broke" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 2 }; // < 3
    injectField(state, "wog.altar_of_gods");

    visit(state);
    chooseByLabel(state, (l) => l.toLowerCase().includes("offering"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    const resolves = getLegalActions(state, "p1").filter((a) => a.action.type === "RESOLVE_VISIT_STEP");
    expect(resolves.some((a) => (a.action as { optionIndex?: number }).optionIndex !== undefined)).toBe(false);
    expect(resolves.some((a) => (a.action as { decline?: boolean }).decline === true)).toBe(true);
  });
});

// ===========================================================================
// 6f. Commander-artifact BONUS on reward locations (Task 2)
// ===========================================================================
describe("Commander-artifact bonus on reward locations", () => {
  function bindableCommanderArtifactOptions(cardId: string): boolean {
    const card = wogCommanderArtifactCards[cardId];
    if (card?.effect.type !== "CHOOSE_ONE") {
      return false;
    }
    return card.effect.options.some((o) => o.effect.type === "BIND_COMMANDER_ARTIFACT");
  }

  it("Emerald Tower guard win grants ONE not-in-play commander artifact into hand (Commanders ON)", () => {
    const state = wogGame({ seed: "et-artifact", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources.gold = 20;
    expect(commanderArtifactsInHand(state)).toHaveLength(0);

    carveAt(state, "emerald_tower");
    visit(state); // the guard win fires the grant + opens the training menu

    const gained = commanderArtifactsInHand(state);
    expect(gained, "one commander artifact granted").toHaveLength(1);
    // It is the normal BINDABLE commander-artifact card (unchanged bind flow).
    expect(bindableCommanderArtifactOptions(gained[0])).toBe(true);
    // The training menu still appears (the bonus is IN ADDITION, not instead).
    expect(menu(state).options.some((o) => o.label.includes("experience"))).toBe(true);
  });

  it("CONTROL: with Commanders OFF the Emerald Tower grants NO commander artifact (menu unchanged)", () => {
    const state = wogGame({ seed: "et-noartifact", commanders: false, faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources.gold = 20;

    carveAt(state, "emerald_tower");
    visit(state);

    expect(commanderArtifactsInHand(state)).toHaveLength(0);
    // The menu is exactly the no-commander menu (XP arm + Leave, no commander arm).
    const options = menu(state).options.map((o) => o.label);
    expect(options.some((l) => l.includes("commander"))).toBe(false);
    expect(options.some((l) => l.includes("experience"))).toBe(true);
  });

  it("all-in-play skip: when every commander artifact is already in play, the grant is a no-op (feed note)", () => {
    const state = wogGame({ seed: "et-allinplay", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources.gold = 20;
    // Park every commander-artifact id somewhere "in play" (p2's removed pile).
    state.players.p2.removed = [...state.players.p2.removed, ...Object.keys(COMMANDER_ARTIFACT_SPECS)];

    carveAt(state, "emerald_tower");
    visit(state);

    expect(commanderArtifactsInHand(state)).toHaveLength(0); // nothing free → no grant
    expect(
      state.eventLog.some(
        (e) => e.type === "EVENT_NOTE" && /no unclaimed commander artifact/i.test((e as { message?: string }).message ?? "")
      ),
      "a feed note explains the skip"
    ).toBe(true);
  });

  it("the not-in-play scan covers a hand copy: a held artifact is never re-granted", () => {
    const heldId = Object.keys(COMMANDER_ARTIFACT_SPECS)[0];
    const state = wogGame({ seed: "et-heldcopy", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.hand = [heldId];
    player.resources.gold = 20;

    carveAt(state, "emerald_tower");
    visit(state);

    // The held one is not duplicated; any grant is a DIFFERENT id.
    expect(player.hand.filter((id) => id === heldId)).toHaveLength(1);
    const gained = commanderArtifactsInHand(state).filter((id) => id !== heldId);
    expect(gained.length).toBeLessThanOrEqual(1);
    if (gained.length === 1) {
      expect(gained[0]).not.toBe(heldId);
    }
  });

  it("Adventure Cave's 3rd win ALSO grants a commander artifact (Commanders ON)", () => {
    const state = wogGame({ seed: "cave-artifact", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    carveAt(state, "adventure_cave");

    visit(state); // win 1
    expect(commanderArtifactsInHand(state)).toHaveLength(0); // no bonus yet
    visit(state); // win 2
    expect(commanderArtifactsInHand(state)).toHaveLength(0);
    visit(state); // win 3 → the deep reward grants the artifact
    expect(commanderArtifactsInHand(state)).toHaveLength(1);
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

  it("picks a resolving action for every dynamic-menu object (CHOOSE_ONE / PAY_TO)", () => {
    for (const [kind, seed, firstType] of [
      ["wog.emerald_tower", "ai-et", "CHOOSE_ONE"],
      ["wog.mirror_home_way", "ai-mirror", "CHOOSE_ONE"],
      ["wog.junk_merchant", "ai-junk", "CHOOSE_ONE"],
      // FO redesign wave 4: the well is a dynamic streak menu now, not a static
      // PAY_TO gamble.
      ["wog.fishing_well", "ai-well", "CHOOSE_ONE"],
      ["wog.living_skull", "ai-skull", "CHOOSE_ONE"],
      ["wog.altar_of_gods", "ai-altar", "CHOOSE_ONE"]
    ] as const) {
      const state = wogGame({ seed });
      state.round = 3;
      state.players.p1.resources = { gold: 20, buildingMaterials: 2, valuables: 5 };
      injectField(state, kind);
      visit(state);
      expect(firstStep(state)?.type, kind).toBe(firstType);
      const action = decideOn(state);
      expect(action?.type, kind).toBe("RESOLVE_VISIT_STEP");
    }
  });

  it("wave 4 — resolves every NEW nested menu: cave Stack Token, altar sacrifice, emerald drill, junk crate", () => {
    // Cave win 2 → the Stack-Token card pick, then the stat pick.
    const cave = wogGame({ seed: "ai-cave-token", unitExperience: true });
    cave.round = 3;
    cave.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
    carveAt(cave, "adventure_cave");
    visit(cave); // win 1 (auto)
    visit(cave); // win 2 → the token menu
    expect(firstStep(cave)?.type).toBe("CHOOSE_ONE");
    for (let depth = 0; depth < 2 && cave.adventure!.pendingVisit; depth += 1) {
      const action = decideOn(cave);
      expect(action?.type, `cave token depth ${depth}`).toBe("RESOLVE_VISIT_STEP");
      resolveVisitStep(cave, action as never);
    }
    expect(cave.adventure!.pendingVisit, "the AI walked the whole nest").toBeNull();

    // Altar greater sacrifice, Emerald drill and the Junk crate: the AI picks a
    // resolving action on the top menu of each (the deep nests are ordinary
    // CHOOSE_ONE/PAY_TO steps the policy already ranks).
    for (const [kind, seed] of [
      ["wog.altar_of_gods", "ai-altar-sac"],
      ["wog.emerald_tower", "ai-et-drill"],
      ["wog.junk_merchant", "ai-junk-crate"]
    ] as const) {
      const state = wogGame({ seed, unitExperience: true });
      state.round = 3;
      state.players.p1.resources = { gold: 20, buildingMaterials: 2, valuables: 5 };
      state.players.p1.army = [
        { id: "army_0", unitDefId: "castle.halberdiers", side: "few" },
        { id: "army_1", unitDefId: "castle.marksmen", side: "few" }
      ];
      injectField(state, kind);
      visit(state);
      let guard = 0;
      while (state.adventure!.pendingVisit && guard < 6) {
        const action = decideOn(state);
        expect(action?.type, `${kind} step ${guard}`).toBe("RESOLVE_VISIT_STEP");
        resolveVisitStep(state, action as never);
        guard += 1;
      }
      expect(state.adventure!.pendingVisit, `${kind} resolved without a stall`).toBeNull();
    }
  });

  it("Adventure Cave's win reward auto-resolves without a player window (no stall)", () => {
    // The escalating-fight reward (gold / Treasure die / Search) is built from
    // auto-resolving leaves, so a computer win never parks on a decision.
    const state = wogGame({ seed: "ai-cave" });
    state.round = 3;
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    carveAt(state, "adventure_cave");
    visit(state); // simulate the post-win visit
    expect(state.adventure!.pendingVisit, "reward auto-resolved").toBeNull();
  });
});
