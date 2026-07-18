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
// 6b. Fishing Well — pay 1 gold → Attack-die gamble (static PAY_TO table)
// ===========================================================================
describe("Fishing Well (wog.fishing_well)", () => {
  it("gambles on the Attack die after the 1-gold stake: +1 → +1 valuables, 0 → 2 gold back, −1 → nothing", () => {
    const seen = new Set<number>();
    // Iterate fixed seeds until every Attack-die face is exercised; each seed's
    // reward is asserted against the face it actually rolled (a self-consistent
    // branch-table CONTROL — a wrong branch mapping fails on some seed).
    for (let i = 0; i < 40 && seen.size < 3; i += 1) {
      const state = wogGame({ seed: `fw-${i}` });
      const player = state.players.p1;
      player.resources = { gold: 20, buildingMaterials: 0, valuables: 0 };
      injectField(state, "wog.fishing_well");

      visit(state);
      expect(firstStep(state)?.type, `fw-${i}`).toBe("PAY_TO");
      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }); // pay 1

      const roll = lastAttackRoll(state);
      seen.add(roll);
      if (roll === 1) {
        expect(player.resources.valuables, `fw-${i} (+1)`).toBe(1);
        expect(player.resources.gold, `fw-${i} (+1)`).toBe(19); // only the stake left
      } else if (roll === 0) {
        expect(player.resources.gold, `fw-${i} (0)`).toBe(21); // −1 stake, +2 back
        expect(player.resources.valuables, `fw-${i} (0)`).toBe(0);
      } else {
        expect(player.resources.gold, `fw-${i} (−1)`).toBe(19); // stake gone, nothing back
        expect(player.resources.valuables, `fw-${i} (−1)`).toBe(0);
      }
      expect(state.adventure!.pendingVisit, `fw-${i} auto-resolves`).toBeNull();
    }
    expect(seen, "all three Attack-die branches exercised").toEqual(new Set([-1, 0, 1]));
  });

  it("CONTROL: a broke hero is only offered Decline, and declining pays nothing", () => {
    const state = wogGame({ seed: "fw-broke" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    injectField(state, "wog.fishing_well");

    visit(state);
    expect(firstStep(state)?.type).toBe("PAY_TO");
    const resolves = getLegalActions(state, "p1").filter((a) => a.action.type === "RESOLVE_VISIT_STEP");
    expect(resolves.some((a) => (a.action as { optionIndex?: number }).optionIndex !== undefined)).toBe(false);
    expect(resolves.some((a) => (a.action as { decline?: boolean }).decline === true)).toBe(true);

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
    expect(player.resources.gold).toBe(0);
    expect(player.resources.valuables).toBe(0);
  });
});

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

  it("Smash: +2 gold AND the field is INERT for a SECOND visitor (the destruction latch)", () => {
    const state = wogGame({ seed: "skull-smash" });
    const player = state.players.p1;
    player.resources.gold = 5;
    const field = injectField(state, "wog.living_skull");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Smash"));

    expect(player.resources.gold).toBe(7); // +2 gold
    expect(field.wogSkullSmashed).toBe(true); // latch set
    expect(state.adventure!.pendingVisit).toBeNull();

    // A SECOND visitor (even a different player's hero moved onto it) finds it
    // inert — no menu at all.
    const p2Hero = getMainHero(state, "p2");
    if (p2Hero) {
      p2Hero.spaceId = FIELD_ID;
      beginFieldVisit(state, p2Hero.id, FIELD_ID, false);
      expect(state.adventure!.pendingVisit).toBeNull(); // no menu — smashed for everyone
    }
    // And the original visitor re-entering also gets nothing.
    beginFieldVisit(state, getMainHero(state, "p1")!.id, FIELD_ID, false);
    expect(state.adventure!.pendingVisit).toBeNull();
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
  it("escalates Ⅰ→Ⅱ→Ⅲ, pays +3 gold / Treasure die / Search Artifact, then clears for good", () => {
    // A cave carve stamps the fresh difficulty-Ⅰ guard. `visit()` stands in for
    // the post-win beginFieldVisit each expedition (the guard was just beaten).
    const state = wogGame({ seed: "cave-escalate" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    const field = carveAt(state, "adventure_cave");
    expect(field.difficulty).toBe(1); // guarded Ⅰ on first entry

    // --- Win 1: +3 gold, re-guard to Ⅱ ---
    visit(state);
    expect(field.wogCaveWins).toBe(1);
    expect(player.resources.gold).toBe(3);
    expect(field.difficulty).toBe(2); // re-guarded one higher
    expect(state.adventure!.pendingVisit).toBeNull(); // auto-resolves (no stall)

    // --- Win 2: a Treasure die, re-guard to Ⅲ ---
    const eventsBefore = state.eventLog.length;
    visit(state);
    expect(field.wogCaveWins).toBe(2);
    expect(field.difficulty).toBe(3);
    expect(
      state.eventLog
        .slice(eventsBefore)
        .some((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "treasure"),
      "a Treasure die was rolled"
    ).toBe(true);
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
    // Park all 8 commander-artifact ids somewhere "in play" (p2's removed pile).
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
      ["wog.fishing_well", "ai-well", "PAY_TO"],
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
