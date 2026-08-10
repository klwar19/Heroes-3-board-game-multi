import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState, PlayerId, VisitStep } from "./state";
import { beginFieldVisit, classifyHeroStep, getMainHero, instantiateTile } from "./adventure";
import { pumpAdventureQueues, resolveVisitStep } from "./adventure-reducer";
import { createAdventureGameState } from "./index";
import { getPlayerView } from "./player-view";
import { allTileDefinitions } from "@/data/map/tiles";

/**
 * Obelisk house rule `obelisk-rewards` (engine: handleObeliskVisit; BINH default
 * ON). The first Hero to visit an Obelisk rolls one Attack die; the face is
 * LOCKED on the Field for the rest of the game. Every visitor (any player)
 * flags the Field and gets the same fixed reward — without rerolling the
 * Attack die:
 *   -1 -> +1 positive morale
 *    0 -> Search (2) the Artifact deck
 *   +1 -> roll one Treasure die and one Resource die
 *
 * These tests fail if the Obelisk routing, the die-lock, the per-face reward
 * mapping, or the multi-flag/no-revisit behavior is removed. The OFF path and
 * Holy Grail visit counting live in holy-grail.test.ts.
 */

function makeGame(): GameState {
  return createAdventureGameState({ seed: "obelisk-house-rule", difficulty: "normal", rollFirstPlayer: false });
}

const FIELD_ID = "50,50";

function injectObelisk(state: GameState, roll?: -1 | 0 | 1): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "obelisk-tile",
    slot: 0,
    location: "obelisk",
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    obeliskRoll: roll
  };
  state.adventure!.fields[field.spaceId] = field;
  return field;
}

function countRolls(state: GameState, dice: "attack" | "resource" | "treasure"): number {
  return state.eventLog.filter((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === dice).length;
}

/** Resolves any "choose a die result" prompts (taking the first result) until the visit ends. */
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

/** Parks a player's main hero on the Obelisk and returns it. */
function parkHero(state: GameState, playerId: PlayerId, field: MapFieldState) {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = field.spaceId;
  return hero;
}

/** Opens the Obelisk visit for p1 and returns the clue picker step (or null). */
function openCluePicker(state: GameState): Extract<VisitStep, { type: "CHOOSE_ONE" }> | null {
  const obelisk = injectObelisk(state);
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = obelisk.spaceId;
  beginFieldVisit(state, hero.id, obelisk.spaceId, false);
  const step = state.adventure!.pendingVisit?.steps[0];
  return step?.type === "CHOOSE_ONE" ? step : null;
}

/** The tile instance ids the picker offers to scry, in option order. */
function scryTileIds(picker: Extract<VisitStep, { type: "CHOOSE_ONE" }>): string[] {
  return picker.options
    .map((option) => option.steps[0])
    .filter((step): step is Extract<VisitStep, { type: "GRAIL_TILE_SCRY" }> => step?.type === "GRAIL_TILE_SCRY")
    .map((step) => step.tileInstanceId);
}

describe("Obelisk house rule", () => {
  it("offers an optional, private Obelisk clue without disclosing which face-down tile hides the Grail", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    const grail = instantiateTile(state.adventure!, "C4", { row: 70, col: 70 }, 0, true);
    const chosen = instantiateTile(state.adventure!, "C1", { row: 80, col: 80 }, 0, true);
    const obelisk = injectObelisk(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = obelisk.spaceId;

    beginFieldVisit(state, hero.id, obelisk.spaceId, false);

    const picker = state.adventure!.pendingVisit?.steps[0];
    expect(picker?.type).toBe("CHOOSE_ONE");
    if (picker?.type !== "CHOOSE_ONE") throw new Error("expected Grail clue picker");
    expect(picker.prompt).toMatch(/choose one face-down tile/i);
    const chosenIndex = picker.options.findIndex(
      (option) => option.steps[0]?.type === "GRAIL_TILE_SCRY" && option.steps[0].tileInstanceId === chosen.id
    );
    expect(chosenIndex).toBeGreaterThanOrEqual(0);
    expect(picker.options.some((option) => option.label === "Do not inspect a tile")).toBe(true);
    // C1 prints a Dragon Utopia, so it IS offered but is NOT the Grail: the
    // filtered list still hides WHICH of the Ⅶ tiles hides the Grail, which is
    // exactly what the scry then answers.
    expect(picker.options[chosenIndex]?.label).toContain(`row ${chosen.centerRow}, col ${chosen.centerCol}`);
    expect(picker.options.map((option) => option.label).join(" ")).not.toContain("C4");

    // Other players learn only that p1 is resolving an Obelisk visit; neither
    // the picker nor the hidden tile identity reaches their server view.
    const beforeChoice = getPlayerView(state, "p2");
    expect(beforeChoice.adventure!.pendingVisit?.steps).toEqual([]);
    expect(beforeChoice.adventure!.tiles[chosen.id]?.tileDefId).toBe("hidden");

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: chosenIndex });
    const reveal = state.adventure!.pendingVisit?.steps[0];
    expect(reveal?.type).toBe("CHOOSE_ONE");
    if (reveal?.type !== "CHOOSE_ONE") throw new Error("expected private Grail reveal");
    expect(reveal.prompt).toContain(`row ${chosen.centerRow}, col ${chosen.centerCol}`);
    expect(reveal.prompt).toContain("C1");
    expect(getPlayerView(state, "p2").adventure!.pendingVisit?.steps).toEqual([]);

    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(grail.faceDown).toBe(true);
    expect(chosen.faceDown).toBe(true);
    expect(getPlayerView(state, "p2").adventure!.tiles[chosen.id]?.tileDefId).toBe("hidden");
  });
  // USER RULE (2026-08-10): "only tiles with Utopia/Grail can be chosen". The
  // filter DELIBERATELY leaks that every offered tile hosts a Ⅶ objective —
  // that is the point of the house rule; the scry still has to answer WHICH of
  // them is the Grail.
  it("offers ONLY face-down tiles that can host the Ⅶ objective (Grail or Dragon Utopia)", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    const grail = instantiateTile(state.adventure!, "C4", { row: 70, col: 70 }, 0, true); // prints grail
    const utopia = instantiateTile(state.adventure!, "C1", { row: 74, col: 74 }, 0, true); // prints dragon_utopia
    const plainCenter = instantiateTile(state.adventure!, "C5", { row: 78, col: 78 }, 0, true); // random_town Ⅶ
    const plainFar = instantiateTile(state.adventure!, "F2", { row: 82, col: 82 }, 0, true); // no Ⅶ objective

    const picker = openCluePicker(state);
    if (!picker) throw new Error("expected Grail clue picker");
    const offered = scryTileIds(picker);

    expect(offered).toContain(grail.id);
    expect(offered).toContain(utopia.id);
    // CONTROL: dropping the filter puts BOTH of these straight back in the list.
    expect(offered).not.toContain(plainCenter.id);
    expect(offered).not.toContain(plainFar.id);
    // Whole-list invariant: every offered tile really prints (or is designated)
    // a Grail / Dragon Utopia — this also covers the scenario's own tiles.
    for (const tileId of offered) {
      const tile = state.adventure!.tiles[tileId];
      expect(tile?.faceDown, `${tileId} must still be face-down`).toBe(true);
      const designation = tile!.viiField ?? tile!.viiFields?.[0];
      const printed = allTileDefinitions[tile!.tileDefId]?.fields.some(
        (field) => field.difficulty === 7 && (field.location === "grail" || field.location === "dragon_utopia")
      );
      expect(
        designation === "grail" || designation === "dragon_utopia" || printed,
        `${tileId} (${tile!.tileDefId}) is not a Grail / Dragon Utopia host`
      ).toBe(true);
    }
    // The decline option stays reachable (the tray's only button).
    expect(picker.options[picker.options.length - 1]?.label).toBe("Do not inspect a tile");
  });

  it("offers a DESIGNATED Grail / Dragon Utopia tile whose printed face is neither", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    // A designation FORCES the Ⅶ objective whatever the tile prints (mirrors
    // materializeTileFields), so a designated C5 is a real clue target.
    const designatedGrail = instantiateTile(state.adventure!, "C5", { row: 60, col: 60 }, 0, true);
    designatedGrail.viiField = "grail";
    const designatedUtopia = instantiateTile(state.adventure!, "C5", { row: 64, col: 64 }, 0, true);
    designatedUtopia.viiField = "dragon_utopia";
    const undesignated = instantiateTile(state.adventure!, "C5", { row: 68, col: 68 }, 0, true);

    const picker = openCluePicker(state);
    if (!picker) throw new Error("expected Grail clue picker");
    const offered = scryTileIds(picker);

    expect(offered).toContain(designatedGrail.id);
    expect(offered).toContain(designatedUtopia.id);
    // CONTROL: the same printed tile without a designation is never offered.
    expect(offered).not.toContain(undesignated.id);
  });

  it("offers no clue at all when no face-down tile can host the Grail (no dead prompt)", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    // Utopia hosts alone are choosable but never worth a clue: nothing to find.
    instantiateTile(state.adventure!, "C1", { row: 71, col: 71 }, 0, true);
    instantiateTile(state.adventure!, "F2", { row: 75, col: 75 }, 0, true);

    const obelisk = injectObelisk(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = obelisk.spaceId;
    beginFieldVisit(state, hero.id, obelisk.spaceId, false);

    // No prompt at all — an AI seat / the AFK driver has nothing to answer.
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(state.pendingChoice).toBeNull();
  });

  it("allows the visitor to decline the optional Obelisk clue", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    instantiateTile(state.adventure!, "C4", { row: 90, col: 90 }, 0, true);
    const obelisk = injectObelisk(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = obelisk.spaceId;

    beginFieldVisit(state, hero.id, obelisk.spaceId, false);
    const picker = state.adventure!.pendingVisit?.steps[0];
    if (picker?.type !== "CHOOSE_ONE") throw new Error("expected Grail clue picker");
    const skipIndex = picker.options.findIndex((option) => option.label === "Do not inspect a tile");
    expect(skipIndex).toBeGreaterThanOrEqual(0);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: skipIndex });
    expect(state.adventure!.pendingVisit).toBeNull();
  });
  it("still offers the clue under grailAsUtopia=always (every mode leaves an undug Grail a real dig site)", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" }, objectives: { grailAsUtopia: "always" } };
    instantiateTile(state.adventure!, "C4", { row: 91, col: 91 }, 0, true);
    const obelisk = injectObelisk(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = obelisk.spaceId;

    beginFieldVisit(state, hero.id, obelisk.spaceId, false);
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
  });
  it("grants ONE clue per player per Obelisk — a Revisit / re-entry offers no second scry", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    instantiateTile(state.adventure!, "C4", { row: 93, col: 93 }, 0, true);
    const obelisk = injectObelisk(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = obelisk.spaceId;

    // First visit: decline the offered clue (the offer itself is the grant).
    beginFieldVisit(state, hero.id, obelisk.spaceId, false);
    const picker = state.adventure!.pendingVisit?.steps[0];
    if (picker?.type !== "CHOOSE_ONE") throw new Error("expected Grail clue picker");
    const skipIndex = picker.options.findIndex((option) => option.label === "Do not inspect a tile");
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: skipIndex });
    expect(state.adventure!.pendingVisit).toBeNull();

    // Re-entering the SAME Obelisk (the player's cube is already here) must
    // not mint another clue — otherwise a parked hero scries the whole hidden
    // map one Revisit at a time.
    beginFieldVisit(state, hero.id, obelisk.spaceId, false);
    expect(state.adventure!.pendingVisit).toBeNull();
  });
  it("does not offer a clue when every hidden printed Grail is designated as a Utopia", () => {
    const state = makeGame();
    state.adventure!.mapPreset = { obelisks: { role: "victory-only" } };
    const converted = instantiateTile(state.adventure!, "C4", { row: 92, col: 92 }, 0, true);
    converted.viiField = "dragon_utopia";
    const obelisk = injectObelisk(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = obelisk.spaceId;

    beginFieldVisit(state, hero.id, obelisk.spaceId, false);
    expect(state.adventure!.pendingVisit).toBeNull();
  });
  it("is enabled by BINH but grants no extra ability in normal Legacy rules", () => {
    const binh = createAdventureGameState({
      seed: "obelisk-binh",
      difficulty: "normal",
      ruleset: "binh",
      rollFirstPlayer: false
    });
    const binhField = injectObelisk(binh);
    beginFieldVisit(binh, parkHero(binh, "p1", binhField).id, binhField.spaceId, false);
    expect(binhField.obeliskRoll).toBeDefined();

    const legacy = createAdventureGameState({
      seed: "obelisk-legacy",
      difficulty: "normal",
      ruleset: "legacy",
      rollFirstPlayer: false
    });
    const legacyField = injectObelisk(legacy);
    beginFieldVisit(legacy, parkHero(legacy, "p1", legacyField).id, legacyField.spaceId, false);
    expect(legacyField.flagOwnerId).toBe("p1");
    expect(legacyField.obeliskRoll).toBeUndefined();
    expect(countRolls(legacy, "attack")).toBe(0);
  });

  it("the first visit rolls one Attack die and locks the face", () => {
    const state = makeGame();
    const field = injectObelisk(state);
    const hero = parkHero(state, "p1", field);

    expect(field.obeliskRoll).toBeUndefined();
    beginFieldVisit(state, hero.id, field.spaceId, false);

    expect([-1, 0, 1]).toContain(field.obeliskRoll);
    expect(countRolls(state, "attack")).toBe(1);
  });

  it("a locked -1 grants +1 positive morale", () => {
    const state = makeGame();
    state.players.p1.factionId = "castle"; // not a morale-ignoring faction
    state.players.p1.morale = 0;
    const field = injectObelisk(state, -1);
    const hero = parkHero(state, "p1", field);

    beginFieldVisit(state, hero.id, field.spaceId, false);

    expect(state.players.p1.morale).toBe(1);
    expect(countRolls(state, "attack")).toBe(0); // pre-locked: nothing to roll
    expect(field.obeliskRoll).toBe(-1);
  });

  it("a locked 0 queues a Search (2) of the Artifact deck", () => {
    const state = makeGame();
    const field = injectObelisk(state, 0);
    const hero = parkHero(state, "p1", field);

    beginFieldVisit(state, hero.id, field.spaceId, false);

    const queued = state.adventure!.rewardQueue.find(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts" && reward.count === 2
    );
    expect(queued, "the 0 face should queue a Search (2) of the Artifact deck").toBeTruthy();

    // Pumping the queue opens an actionable artifact search (a deck search, or a
    // deck-family pick in split-deck modes).
    pumpAdventureQueues(state);
    expect(state.pendingChoice).toBeTruthy();
  });

  it("a locked +1 rolls one Treasure die and one Resource die", () => {
    const state = makeGame();
    const field = injectObelisk(state, 1);
    const hero = parkHero(state, "p1", field);

    beginFieldVisit(state, hero.id, field.spaceId, false);
    driveVisit(state, "p1");

    expect(countRolls(state, "treasure")).toBe(1);
    expect(countRolls(state, "resource")).toBeGreaterThanOrEqual(1);
  });

  it("locks the result: a later visitor reuses the same face and never rerolls the die", () => {
    const state = makeGame();
    state.players.p1.factionId = "castle";
    state.players.p2.factionId = "castle";
    state.players.p1.morale = 0;
    state.players.p2.morale = 0;
    const field = injectObelisk(state, -1); // pre-locked
    const p1 = parkHero(state, "p1", field);
    const p2 = parkHero(state, "p2", field);

    beginFieldVisit(state, p1.id, field.spaceId, false);
    beginFieldVisit(state, p2.id, field.spaceId, false);

    expect(state.players.p1.morale).toBe(1);
    expect(state.players.p2.morale).toBe(1); // same reward, not a fresh roll
    expect(field.obeliskRoll).toBe(-1); // unchanged
    expect(countRolls(state, "attack")).toBe(0); // never rerolled
  });

  it("flags every visitor (multi-cube) and never drops a black cube", () => {
    const state = makeGame();
    const field = injectObelisk(state, -1);
    const p1 = parkHero(state, "p1", field);
    const p2 = parkHero(state, "p2", field);

    beginFieldVisit(state, p1.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1");

    beginFieldVisit(state, p2.id, field.spaceId, false);
    expect(field.flagOwnerId).toBe("p1"); // first cube kept
    expect(field.extraFlagOwnerIds).toEqual(["p2"]); // second player's cube added
    expect(field.blackCube).toBe(false); // flaggable, never a black cube
  });

  it("does not re-reward a player who already holds a cube, and becomes a walk-through", () => {
    const state = makeGame();
    state.players.p1.factionId = "castle";
    state.players.p1.morale = 0;
    const field = injectObelisk(state, -1);
    const hero = parkHero(state, "p1", field);

    // Before flagging, an Obelisk stops the hero.
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("stop");

    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.players.p1.morale).toBe(1);

    // Re-entering the Field this player already flagged grants nothing more.
    beginFieldVisit(state, hero.id, field.spaceId, false);
    expect(state.players.p1.morale).toBe(1);
    expect(classifyHeroStep(state, hero, field.spaceId)).toBe("open");
  });
});
