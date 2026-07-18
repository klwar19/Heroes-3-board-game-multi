import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState, MapSpaceId, MapTileState, PlayerId } from "./state";
import { GRAIL_OBELISKS_REQUIRED } from "./state";
import {
  beginFieldVisit,
  canDigGrail,
  classifyHeroStep,
  getMainHero,
  grailObelisksVisitedCount,
  isFieldGuarded,
  materializeTileFields,
  obeliskPresetRole
} from "./adventure";
import { pumpAdventureQueues, resolveVisitStep, revisitField } from "./adventure-reducer";
import { getLegalActions } from "./legal-actions";
import { createAdventureGameState } from "./index";
import {
  describeCustomMapPresetEntries,
  sanitizeCustomMapPreset,
  type CustomMapObeliskConfig
} from "./map-preset";

// ---------------------------------------------------------------------------
// Designer-configurable Obelisk role (map-wide preset `obelisks`). ABSENT =
// classic locked-die house rule (obelisk-house-rule.test.ts covers that path
// untouched). The three roles change ONLY the visit reward/behaviour; the
// winning-condition role (Holy-Grail dig progress) is IDENTICAL in every mode,
// pinned per role below. Every test asserts an observable outcome (hero
// position, morale, resources, queued rewards, grail count) with a CONTROL
// (classic / absent preset / repeat visit) that diverges, so it fails if the
// wiring is removed.
// ---------------------------------------------------------------------------

const O1: MapSpaceId = "60,60";
const O2: MapSpaceId = "61,61";
const M1: MapSpaceId = "62,62";

function makeGame(options: { victoryMode?: "grail" } = {}): GameState {
  const state = createAdventureGameState({
    seed: "obelisk-roles",
    difficulty: "normal",
    rollFirstPlayer: false,
    ...(options.victoryMode ? { victoryMode: options.victoryMode } : {})
  });
  // p1 is Castle by default (not a morale-ignoring faction); clear the opening
  // hand gate so map visits/legal actions resolve cleanly.
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.morale = 0;
  return state;
}

/** Force the map-wide Obelisk role the engine reads (adventure.mapPreset). */
function setObeliskRole(state: GameState, config: CustomMapObeliskConfig | undefined): void {
  state.adventure!.mapPreset = config ? { obelisks: config } : null;
}

function injectField(state: GameState, spaceId: MapSpaceId, location: string): MapFieldState {
  const field: MapFieldState = {
    spaceId,
    tileInstanceId: `tile-${spaceId}`,
    slot: 0,
    location,
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[spaceId] = field;
  return field;
}

function parkHero(state: GameState, playerId: PlayerId, spaceId: MapSpaceId) {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = spaceId;
  hero.movementPoints = 3;
  hero.movementHaltedThisTurn = false;
  return hero;
}

function attackRolls(state: GameState): number {
  return state.eventLog.filter((e) => e.type === "ADVENTURE_DICE_ROLLED" && e.dice === "attack").length;
}

function diceRolls(state: GameState, dice: "treasure" | "resource"): number {
  return state.eventLog.filter((e) => e.type === "ADVENTURE_DICE_ROLLED" && e.dice === dice).length;
}

const lastNote = (state: GameState): string =>
  [...state.eventLog].reverse().find((e) => e.type === "EVENT_NOTE")?.message ?? "";

/** Resolve any "choose a die result" prompts inside a pending visit. */
function driveVisit(state: GameState, playerId: PlayerId): void {
  let guard = 0;
  while (state.adventure!.pendingVisit && !state.pendingChoice && guard < 30) {
    guard += 1;
    const step = state.adventure!.pendingVisit.steps[0];
    if (step?.type === "CHOOSE_ONE") {
      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex: 0 });
    } else {
      break;
    }
  }
}

// --- Threading: preset → adventure.mapPreset (public; views/reconnects) ------

describe("Obelisk role — preset threading", () => {
  it("threads customMapPreset.obelisks onto the built adventure state", () => {
    const state = createAdventureGameState({
      seed: "obelisk-thread",
      difficulty: "normal",
      rollFirstPlayer: false,
      customMap: [{ row: 7, col: 6, group: "near", faceDown: true, secretFeature: "obelisk" }],
      customMapPreset: { obelisks: { role: "monolith" } }
    });
    expect(obeliskPresetRole(state)).toBe("monolith");
    expect(state.adventure!.mapPreset?.obelisks).toEqual({ role: "monolith" });
  });

  it("CONTROL: no obelisks preset → role is undefined (classic)", () => {
    const state = makeGame();
    expect(obeliskPresetRole(state)).toBeUndefined();
  });
});

// --- Role: monolith ----------------------------------------------------------

describe("Obelisk role — monolith", () => {
  it("entering one of two Obelisks teleports the hero to the other; no die reward", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "monolith" });
    injectField(state, O1, "obelisk");
    injectField(state, O2, "obelisk");
    const hero = parkHero(state, "p1", O1);
    const armyBefore = state.players.p1.army.length;

    beginFieldVisit(state, hero.id, O1, false);

    // The observable outcome: the hero stands on the OTHER Obelisk…
    expect(hero.spaceId).toBe(O2);
    // …arrival does NOT re-trigger (no ping-pong) and no toll (Monolith, not
    // Whirlpool)…
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p1.army).toHaveLength(armyBefore);
    // …and the classic locked-die reward NEVER fired (no attack die, no lock).
    expect(attackRolls(state)).toBe(0);
    expect(state.adventure!.fields[O1]?.obeliskRoll).toBeUndefined();
  });

  it("an Obelisk and a Monolith TOKEN form one shared network", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "monolith" });
    injectField(state, O1, "obelisk");
    injectField(state, M1, "monolith"); // a designer-placed Monolith token
    const hero = parkHero(state, "p1", O1);

    beginFieldVisit(state, hero.id, O1, false);

    // Entering the Obelisk teleports to the Monolith token — shared network.
    expect(hero.spaceId).toBe(M1);
  });

  it("a lone Obelisk is inert with a 'at least 2' note (CONTROL: hero stays)", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "monolith" });
    injectField(state, O1, "obelisk");
    const hero = parkHero(state, "p1", O1);

    beginFieldVisit(state, hero.id, O1, false);

    expect(hero.spaceId).toBe(O1); // nowhere to go
    expect(lastNote(state)).toContain("at least 2");
  });

  it("Revisit (1 MP) travels the network again — and is offered in legal actions", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "monolith" });
    injectField(state, O1, "obelisk");
    injectField(state, O2, "obelisk");
    const hero = parkHero(state, "p1", O1);
    beginFieldVisit(state, hero.id, O1, false);
    expect(hero.spaceId).toBe(O2);

    // Standing on the destination Obelisk, a Revisit is offered and travels back.
    const offered = getLegalActions(state, "p1").some((legal) =>
      legal.label.startsWith("Revisit the Obelisk")
    );
    expect(offered).toBe(true);

    const before = hero.movementPoints;
    revisitField(state, { type: "REVISIT_FIELD", playerId: "p1", heroId: hero.id });
    expect(hero.spaceId).toBe(O1);
    expect(hero.movementPoints).toBe(before - 1);
  });

  it("always STOPS the hero — never walked through, even once owned (CONTROL: classic opens it)", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "monolith" });
    const field = injectField(state, O1, "obelisk");
    field.flagOwnerId = "p1"; // the hero already holds a cube here
    const hero = getMainHero(state, "p1")!;

    // A Monolith-role Obelisk teleports on every entry, so it must always stop.
    expect(classifyHeroStep(state, hero, O1)).toBe("stop");

    // CONTROL: the classic flaggable Obelisk becomes walk-through ("open") once owned.
    setObeliskRole(state, undefined);
    expect(classifyHeroStep(state, hero, O1)).toBe("open");
  });

  it("CONTROL: with the preset ABSENT the Obelisk rolls the die and the hero stays", () => {
    const state = makeGame();
    setObeliskRole(state, undefined); // classic
    injectField(state, O1, "obelisk");
    injectField(state, O2, "obelisk");
    const hero = parkHero(state, "p1", O1);

    beginFieldVisit(state, hero.id, O1, false);

    expect(hero.spaceId).toBe(O1); // no teleport in classic mode
    expect(state.adventure!.fields[O1]?.obeliskRoll).toBeDefined(); // the die locked
  });
});

// --- Role: bonus -------------------------------------------------------------

describe("Obelisk role — bonus", () => {
  it("morale bonus grants +1 morale, never locks the die (CONTROL: classic locks it)", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "bonus", bonus: { kind: "morale", amount: 1 } });
    const field = injectField(state, O1, "obelisk");
    const hero = parkHero(state, "p1", O1);

    beginFieldVisit(state, hero.id, O1, false);

    expect(state.players.p1.morale).toBe(1);
    expect(field.obeliskRoll).toBeUndefined(); // no classic die lock
    expect(attackRolls(state)).toBe(0);

    // CONTROL: the classic path DOES lock the die.
    const control = makeGame();
    setObeliskRole(control, undefined);
    const cField = injectField(control, O1, "obelisk");
    const cHero = parkHero(control, "p1", O1);
    beginFieldVisit(control, cHero.id, O1, false);
    expect(cField.obeliskRoll).toBeDefined();
  });

  it("search bonus opens a real shared-deck Search", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "bonus", bonus: { kind: "search", deck: "artifacts", count: 2 } });
    const hero = parkHero(state, "p1", O1);
    injectField(state, O1, "obelisk");

    beginFieldVisit(state, hero.id, O1, false);

    const queued = state.adventure!.rewardQueue.find(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts" && reward.count === 2
    );
    expect(queued, "a Search(2) Artifacts reward should be queued").toBeTruthy();

    // Pumping opens the actionable deck-search choice.
    state.adventure!.pendingTileChoice = null;
    pumpAdventureQueues(state);
    expect(state.pendingChoice).toBeTruthy();
  });

  it("resources bonus grants exactly the designed resources", () => {
    const state = makeGame();
    setObeliskRole(state, {
      role: "bonus",
      bonus: { kind: "resources", gold: 4, buildingMaterials: 1, valuables: 0 }
    });
    const goldBefore = state.players.p1.resources.gold;
    const materialsBefore = state.players.p1.resources.buildingMaterials;
    const hero = parkHero(state, "p1", O1);
    injectField(state, O1, "obelisk");

    beginFieldVisit(state, hero.id, O1, false);

    expect(state.players.p1.resources.gold).toBe(goldBefore + 4);
    expect(state.players.p1.resources.buildingMaterials).toBe(materialsBefore + 1);
  });

  it("movement bonus adds movement points", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "bonus", bonus: { kind: "movement", amount: 2 } });
    const hero = parkHero(state, "p1", O1);
    injectField(state, O1, "obelisk");
    const before = hero.movementPoints;

    beginFieldVisit(state, hero.id, O1, false);

    expect(hero.movementPoints).toBe(before + 2);
  });

  it("dice bonus rolls the designed Treasure and Resource dice", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "bonus", bonus: { kind: "dice", treasure: 1, resource: 1 } });
    const hero = parkHero(state, "p1", O1);
    injectField(state, O1, "obelisk");

    beginFieldVisit(state, hero.id, O1, false);
    driveVisit(state, "p1");

    expect(diceRolls(state, "treasure")).toBe(1);
    expect(diceRolls(state, "resource")).toBeGreaterThanOrEqual(1);
    expect(attackRolls(state)).toBe(0); // never the classic die
  });

  it("prevents repeat-visit farming exactly like classic (a re-entry grants nothing more)", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "bonus", bonus: { kind: "morale", amount: 1 } });
    const hero = parkHero(state, "p1", O1);
    injectField(state, O1, "obelisk");

    beginFieldVisit(state, hero.id, O1, false);
    expect(state.players.p1.morale).toBe(1);
    // Re-enter the Field this player already flagged — no second bonus.
    beginFieldVisit(state, hero.id, O1, false);
    expect(state.players.p1.morale).toBe(1);
  });

  it("falls back to the default +1 morale bonus when none is configured", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "bonus" }); // bonus unset
    const hero = parkHero(state, "p1", O1);
    injectField(state, O1, "obelisk");

    beginFieldVisit(state, hero.id, O1, false);

    expect(state.players.p1.morale).toBe(1);
    expect(state.adventure!.fields[O1]?.obeliskRoll).toBeUndefined();
  });

  it("MULTIPLE awards in 'all' mode grant EVERY reward (AND)", () => {
    const state = makeGame();
    setObeliskRole(state, {
      role: "bonus",
      bonuses: [
        { kind: "morale", amount: 1 },
        { kind: "resources", gold: 5, buildingMaterials: 0, valuables: 0 }
      ]
    });
    const goldBefore = state.players.p1.resources.gold;
    const hero = parkHero(state, "p1", O1);
    injectField(state, O1, "obelisk");

    beginFieldVisit(state, hero.id, O1, false);
    driveVisit(state, "p1");

    // Both awards landed (no pick — every step runs).
    expect(state.players.p1.morale).toBe(1);
    expect(state.players.p1.resources.gold).toBe(goldBefore + 5);
  });

  it("'choose' mode offers ONE reward (OR); picking one applies only it", () => {
    const state = makeGame();
    setObeliskRole(state, {
      role: "bonus",
      bonusMode: "choose",
      bonuses: [
        { kind: "morale", amount: 1 },
        { kind: "resources", gold: 5, buildingMaterials: 0, valuables: 0 }
      ]
    });
    const goldBefore = state.players.p1.resources.gold;
    const hero = parkHero(state, "p1", O1);
    injectField(state, O1, "obelisk");

    beginFieldVisit(state, hero.id, O1, false);
    // A single pick prompt is open — pick option 1 (resources).
    const step = state.adventure!.pendingVisit?.steps[0];
    expect(step?.type).toBe("CHOOSE_ONE");
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 });

    // Only the chosen reward landed — the other did NOT (the AND-mode CONTROL above
    // shows both would apply).
    expect(state.players.p1.resources.gold).toBe(goldBefore + 5);
    expect(state.players.p1.morale).toBe(0);
  });
});

// --- Map-wide Obelisk / Settlement guard (materialized onto the field) --------

describe("Map-wide field guards (designer)", () => {
  it("stamps the map-wide Obelisk guard onto obelisk fields (CONTROL: unguarded without it)", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only", guard: { level: 4 } } };
    state.adventure!.fields = {};
    materializeTileFields(state.adventure!, {
      id: "t-ob",
      tileDefId: "N3",
      centerRow: 60,
      centerCol: 60,
      rotation: 0
    } as MapTileState);
    const obelisk = Object.values(state.adventure!.fields).find((f) => f.location === "obelisk")!;
    expect(obelisk.difficulty).toBe(4);
    expect(isFieldGuarded(obelisk)).toBe(true);

    // CONTROL: no guard → the obelisk stays unguarded (no difficulty).
    const control = makeGame();
    control.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    control.adventure!.fields = {};
    materializeTileFields(control.adventure!, {
      id: "c",
      tileDefId: "N3",
      centerRow: 60,
      centerCol: 60,
      rotation: 0
    } as MapTileState);
    const cObelisk = Object.values(control.adventure!.fields).find((f) => f.location === "obelisk")!;
    expect(cObelisk.difficulty).toBeUndefined();
    expect(isFieldGuarded(cObelisk)).toBe(false);
  });

  it("a map-wide Settlement guard OVERRIDES the printed settlement difficulty (CONTROL: printed 3 stands)", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { settlements: { guard: { level: 6 } } };
    state.adventure!.fields = {};
    materializeTileFields(state.adventure!, {
      id: "t-set",
      tileDefId: "F1",
      centerRow: 60,
      centerCol: 60,
      rotation: 0
    } as MapTileState);
    const settlement = Object.values(state.adventure!.fields).find((f) => f.location === "settlement")!;
    expect(settlement.difficulty).toBe(6);
    // A designer settlement guard is flagged "altered" so the map can warn on it.
    expect(settlement.designedGuard).toBe(true);

    // CONTROL: no settlement config → F1's printed difficulty (3) stands.
    const control = makeGame();
    control.adventure!.mapPreset = null;
    control.adventure!.fields = {};
    materializeTileFields(control.adventure!, {
      id: "c",
      tileDefId: "F1",
      centerRow: 60,
      centerCol: 60,
      rotation: 0
    } as MapTileState);
    const cSettlement = Object.values(control.adventure!.fields).find((f) => f.location === "settlement")!;
    expect(cSettlement.difficulty).toBe(3);
    // A printed settlement guard is NOT flagged as designer-altered.
    expect(cSettlement.designedGuard ?? false).toBe(false);
  });
});

// --- Role: victory-only ------------------------------------------------------

describe("Obelisk role — victory-only", () => {
  it("grants NO reward and rolls no die (CONTROL: classic rolls the die)", () => {
    const state = makeGame();
    setObeliskRole(state, { role: "victory-only" });
    const field = injectField(state, O1, "obelisk");
    const hero = parkHero(state, "p1", O1);
    const goldBefore = state.players.p1.resources.gold;
    const rewardsBefore = state.adventure!.rewardQueue.length;

    beginFieldVisit(state, hero.id, O1, false);

    expect(state.players.p1.morale).toBe(0); // no morale
    expect(state.players.p1.resources.gold).toBe(goldBefore); // no resources
    expect(attackRolls(state)).toBe(0); // no die
    expect(field.obeliskRoll).toBeUndefined(); // no lock
    expect(state.adventure!.rewardQueue).toHaveLength(rewardsBefore); // no reward queued
    // …but the Field IS flagged (a marker), and a quiet note fired.
    expect(field.flagOwnerId).toBe("p1");

    // CONTROL: classic rolls & locks the die.
    const control = makeGame();
    setObeliskRole(control, undefined);
    const cField = injectField(control, O1, "obelisk");
    const cHero = parkHero(control, "p1", O1);
    beginFieldVisit(control, cHero.id, O1, false);
    expect(cField.obeliskRoll).toBeDefined();
    expect(attackRolls(control)).toBe(1);
  });
});

// --- Grail invariant: dig progress runs identically in every role ------------

describe("Obelisk role — Holy-Grail invariant (dig progress is role-independent)", () => {
  function grailGame(setup: (state: GameState) => void): GameState {
    const state = makeGame({ victoryMode: "grail" });
    state.adventure!.grail = { status: "uncollected", obelisksVisited: {} };
    setup(state);
    injectField(state, O1, "obelisk");
    injectField(state, O2, "obelisk");
    return state;
  }

  it("CLASSIC: visiting 2 distinct Obelisks unlocks the dig", () => {
    const state = grailGame((s) => {
      setObeliskRole(s, undefined);
      // Suppress the die-reward pending visits so the second visit resolves.
      s.adventure!.houseRules = { ...(s.adventure!.houseRules ?? {}), "obelisk-rewards": false };
    });
    const hero = getMainHero(state, "p1")!;

    parkHero(state, "p1", O1);
    beginFieldVisit(state, hero.id, O1, false);
    expect(grailObelisksVisitedCount(state, "p1")).toBe(1);
    expect(canDigGrail(state, "p1")).toBe(false);

    parkHero(state, "p1", O2);
    beginFieldVisit(state, hero.id, O2, false);
    expect(grailObelisksVisitedCount(state, "p1")).toBe(GRAIL_OBELISKS_REQUIRED);
    expect(canDigGrail(state, "p1")).toBe(true);
  });

  it("MONOLITH: each entered Obelisk still credits the dig (before the teleport)", () => {
    const state = grailGame((s) => setObeliskRole(s, { role: "monolith" }));
    const hero = getMainHero(state, "p1")!;

    parkHero(state, "p1", O1);
    beginFieldVisit(state, hero.id, O1, false); // credit O1, then teleport to O2
    expect(grailObelisksVisitedCount(state, "p1")).toBe(1);
    expect(hero.spaceId).toBe(O2);

    beginFieldVisit(state, hero.id, O2, false); // now on O2 — credit O2, teleport away
    expect(grailObelisksVisitedCount(state, "p1")).toBe(GRAIL_OBELISKS_REQUIRED);
    expect(canDigGrail(state, "p1")).toBe(true);
  });

  it("BONUS: visiting 2 distinct Obelisks unlocks the dig", () => {
    const state = grailGame((s) =>
      setObeliskRole(s, { role: "bonus", bonus: { kind: "morale", amount: 1 } })
    );
    const hero = getMainHero(state, "p1")!;

    parkHero(state, "p1", O1);
    beginFieldVisit(state, hero.id, O1, false);
    parkHero(state, "p1", O2);
    beginFieldVisit(state, hero.id, O2, false);

    expect(grailObelisksVisitedCount(state, "p1")).toBe(GRAIL_OBELISKS_REQUIRED);
    expect(canDigGrail(state, "p1")).toBe(true);
  });

  it("VICTORY-ONLY: visiting 2 distinct Obelisks unlocks the dig", () => {
    const state = grailGame((s) => setObeliskRole(s, { role: "victory-only" }));
    const hero = getMainHero(state, "p1")!;

    parkHero(state, "p1", O1);
    beginFieldVisit(state, hero.id, O1, false);
    parkHero(state, "p1", O2);
    beginFieldVisit(state, hero.id, O2, false);

    expect(grailObelisksVisitedCount(state, "p1")).toBe(GRAIL_OBELISKS_REQUIRED);
    expect(canDigGrail(state, "p1")).toBe(true);
  });
});

// --- Sanitization + describe -------------------------------------------------

describe("Obelisk role — sanitization & describe", () => {
  it("round-trips a role + bonus and drops garbage", () => {
    const monolith = sanitizeCustomMapPreset({ obelisks: { role: "monolith" } });
    expect(monolith?.obelisks).toEqual({ role: "monolith" });

    const victory = sanitizeCustomMapPreset({ obelisks: { role: "victory-only" } });
    expect(victory?.obelisks).toEqual({ role: "victory-only" });

    const search = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonus: { kind: "search", deck: "spells", count: 3 } }
    });
    expect(search?.obelisks).toEqual({ role: "bonus", bonus: { kind: "search", deck: "spells", count: 3 } });

    // Unknown role → whole obelisks block dropped (treated as absent/classic).
    const garbage = sanitizeCustomMapPreset({ obelisks: { role: "wormhole" } });
    expect(garbage).toBeUndefined();
  });

  it("clamps bonus amounts and fills the default for a bare 'bonus' role", () => {
    // Search count clamps to 1..3; movement to 1..3; resources/dice to their caps.
    const clamped = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonus: { kind: "search", deck: "artifacts", count: 99 } }
    });
    expect(clamped?.obelisks).toEqual({
      role: "bonus",
      bonus: { kind: "search", deck: "artifacts", count: 3 }
    });

    const move = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonus: { kind: "movement", amount: 0 } }
    });
    expect(move?.obelisks).toEqual({ role: "bonus", bonus: { kind: "movement", amount: 1 } });

    const dice = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonus: { kind: "dice", treasure: 9, resource: 9 } }
    });
    expect(dice?.obelisks).toEqual({ role: "bonus", bonus: { kind: "dice", treasure: 2, resource: 2 } });

    // A bare "bonus" role fills the +1 morale default; a degenerate bonus too.
    const bare = sanitizeCustomMapPreset({ obelisks: { role: "bonus" } });
    expect(bare?.obelisks).toEqual({ role: "bonus", bonus: { kind: "morale", amount: 1 } });
    const zeroDice = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonus: { kind: "dice", treasure: 0, resource: 0 } }
    });
    expect(zeroDice?.obelisks).toEqual({ role: "bonus", bonus: { kind: "morale", amount: 1 } });
  });

  it("a stray bonus on a non-bonus role is dropped", () => {
    const cleaned = sanitizeCustomMapPreset({
      obelisks: { role: "monolith", bonus: { kind: "morale", amount: 1 } }
    });
    expect(cleaned?.obelisks).toEqual({ role: "monolith" });
  });

  it("describe entries include a 🗿 Obelisk line per role", () => {
    const monolith = describeCustomMapPresetEntries({ obelisks: { role: "monolith" } });
    expect(monolith).toContainEqual({ icon: "🗿", text: "Obelisks: Monolith teleport network" });

    const victory = describeCustomMapPresetEntries({ obelisks: { role: "victory-only" } });
    expect(victory).toContainEqual({ icon: "🗿", text: "Obelisks: victory marker only (no reward)" });

    const bonus = describeCustomMapPresetEntries({
      obelisks: { role: "bonus", bonus: { kind: "resources", gold: 4, valuables: 1 } }
    });
    expect(bonus.some((e) => e.icon === "🗿" && e.text.includes("4 gold, 1 valuables"))).toBe(true);
  });

  it("round-trips multiple awards + a 'choose' mode + the experience kind", () => {
    const preset = sanitizeCustomMapPreset({
      obelisks: {
        role: "bonus",
        bonusMode: "choose",
        bonuses: [
          { kind: "experience", amount: 3 },
          { kind: "morale", amount: 1 }
        ]
      }
    });
    expect(preset?.obelisks).toEqual({
      role: "bonus",
      bonusMode: "choose",
      bonuses: [
        { kind: "experience", amount: 3 },
        { kind: "morale", amount: 1 }
      ]
    });
    // A "choose" mode with a single award is meaningless → dropped.
    const single = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonusMode: "choose", bonuses: [{ kind: "morale", amount: 1 }] }
    });
    expect(single?.obelisks).toEqual({ role: "bonus", bonuses: [{ kind: "morale", amount: 1 }] });
    // Describe shows the OR joiner.
    const line = describeCustomMapPresetEntries({
      obelisks: {
        role: "bonus",
        bonusMode: "choose",
        bonuses: [
          { kind: "morale", amount: 1 },
          { kind: "movement", amount: 2 }
        ]
      }
    });
    expect(line.some((e) => e.icon === "🗿" && e.text.includes(" OR "))).toBe(true);
  });

  it("round-trips a map-wide Obelisk guard (kept on every role)", () => {
    const bonus = sanitizeCustomMapPreset({
      obelisks: { role: "bonus", bonus: { kind: "morale", amount: 1 }, guard: { level: 4 } }
    });
    expect(bonus?.obelisks).toEqual({
      role: "bonus",
      bonus: { kind: "morale", amount: 1 },
      guard: { level: 4 }
    });
    // A guard survives on a non-bonus role too; an over-range level clamps to 7,
    // and a non-numeric level drops the guard entirely.
    const monolith = sanitizeCustomMapPreset({
      obelisks: { role: "monolith", guard: { level: 3 } }
    });
    expect(monolith?.obelisks).toEqual({ role: "monolith", guard: { level: 3 } });
    const clamped = sanitizeCustomMapPreset({ obelisks: { role: "monolith", guard: { level: 99 } } });
    expect(clamped?.obelisks).toEqual({ role: "monolith", guard: { level: 7 } });
    const noLevel = sanitizeCustomMapPreset({ obelisks: { role: "monolith", guard: { level: "big" } } });
    expect(noLevel?.obelisks).toEqual({ role: "monolith" });
  });

  it("round-trips the map-wide Settlement config (guard + VP) and drops an empty one", () => {
    const full = sanitizeCustomMapPreset({ settlements: { guard: { level: 5 }, vp: 4 } });
    expect(full?.settlements).toEqual({ guard: { level: 5 }, vp: 4 });

    const vpOnly = sanitizeCustomMapPreset({ settlements: { vp: 99 } });
    expect(vpOnly?.settlements).toEqual({ vp: 10 }); // VP clamps to 10

    // Empty / all-degenerate → whole block dropped.
    const empty = sanitizeCustomMapPreset({ settlements: { vp: 0 } });
    expect(empty).toBeUndefined();

    const line = describeCustomMapPresetEntries({ settlements: { guard: { level: 5 }, vp: 4 } });
    expect(line).toContainEqual({ icon: "🏠", text: "Settlements: guard level 5, +4 VP each" });
  });
});
