import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "./index";
import { beginFieldVisit, instantiateTile, placeDungeonSite } from "./adventure";
import {
  DEFENDER_BACKLINE,
  finalizeAdventureCombat,
  pumpAdventureQueues,
  setTileRotation
} from "./adventure-reducer";
import { combatQualifiesForComputerGuaranteedWin } from "./computer/guaranteed-wins";
import { DUNGEON_FLOOR_CAP, dungeonFloorDifficulty, dungeonFloorRewardSteps } from "./dungeon";
import { DUNGEON_FLOOR_BOSSES } from "@/data/anime/bosses";
import { NEUTRAL_PLAYER_ID, type CombatState, type MapSpaceId } from "./state";

/**
 * The Dungeon (§6.7.3 + the door-room/dialogue enrichment) — every claim
 * engine-enforced with CONTROLs: the independent module gate, the
 * one-per-map placement claiming the FIRST Near Blocked Field instead of a
 * bank, the per-floor door menu (two seeded rooms + Leave; rooms resolve
 * BEFORE the den fight opens), one-movement-per-floor continuation, floor fights at
 * REAL difficulty (never a computer guaranteed win), the floor ladder +
 * advance on a win (nothing lost on a loss), the floor-5/10 bosses, and the
 * Conqueror title with the repeatable bottom floor.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function dungeonGame(seed: string, options: Record<string, unknown> = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: true,
    wog: { enabled: true, dungeon: true },
    ...options
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  return state;
}

/** Carve the site onto an arbitrary revealed field and stand the hero on it. */
function placeSiteUnderHero(state: GameState): MapSpaceId {
  const field = Object.values(state.adventure!.fields).find(
    (candidate) => candidate.location !== "town" && !candidate.difficulty
  )!;
  placeDungeonSite(state, field.spaceId);
  state.heroes.hero_p1.spaceId = field.spaceId;
  return field.spaceId;
}

/** Read through a helper so TypeScript does not retain stale property narrowing
 * across the mutating beginFieldVisit engine call. */
function firstPendingVisitStep(state: GameState) {
  return state.adventure?.pendingVisit?.steps[0];
}

/** Open the gate menu and take the given option index. */
function visitGate(state: GameState, fieldId: MapSpaceId, optionIndex: number): GameState {
  beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
  expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
  return apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
}

/** Delve the current floor through an AUTO-resolving door (skip the shrine's
 *  PAY_TO pause) so the den fight is open when this returns. */
function delveFloor(state: GameState, fieldId: MapSpaceId): GameState {
  beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
  const menu = state.adventure!.pendingVisit?.steps[0];
  if (menu?.type !== "CHOOSE_ONE") {
    throw new Error("expected the door menu");
  }
  const pick = menu.options.findIndex((option, index) => index < 2 && !/shrine/i.test(option.label));
  expect(pick).toBeGreaterThanOrEqual(0);
  const after = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: pick });
  expect(after.combat, "expected the den fight to open").toBeTruthy();
  return after;
}

/** Drive combat-setup: place one unit, finish → the floor army reveals. */
function revealFloorArmy(state: GameState): GameState {
  const placement = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  expect(placement, "expected a unit placement offer").toBeTruthy();
  let next = apply(state, placement!.action);
  next = apply(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  return next;
}

describe("The Dungeon — module gate & placement", () => {
  it("CONTROL: module off ⇒ no site; with Creature Banks off the Dungeon still activates", () => {
    const off = dungeonGame("dungeon-off", { wog: { enabled: true } });
    expect(off.adventure?.dungeonSite).toBeUndefined();
    const noBanks = dungeonGame("dungeon-no-banks", {
      creatureBanks: false,
      wog: { enabled: true, dungeon: true }
    });
    expect(noBanks.adventure?.dungeonSite).toEqual({ fieldId: null });
  });

  it("anime.dungeon is the second surface activating the same frozen flag", () => {
    const state = dungeonGame("dungeon-anime-surface", {
      wog: undefined,
      anime: { enabled: true, dungeon: true }
    });
    expect(state.adventure?.dungeonSite).toEqual({ fieldId: null });
  });

  it("the FIRST Near-band Blocked Field revealed carves the Dungeon INSTEAD of a Creature Bank (one per map; later tiles offer banks again)", () => {
    const state = dungeonGame("dungeon-placement");
    const adventure = state.adventure!;
    expect(adventure.dungeonSite).toEqual({ fieldId: null });
    const nearPileBefore = adventure.creatureBankTokensNear!.length;

    // Reveal a NEAR tile with a Blocked Field through the real rotation seam.
    const tile = instantiateTile(adventure, "N1", { row: -8, col: -8 }, 0, true);
    expect(tile.group).toBe("near");
    tile.awaitingRotation = true;
    adventure.pendingTileChoice = { tileInstanceId: tile.id, playerId: "p1", kind: "place" };
    setTileRotation(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: tile.id, rotation: 0 });

    // The Dungeon claimed the Blocked Field — no bank offer, no pile consumed.
    const siteId = adventure.dungeonSite!.fieldId;
    expect(siteId).toBeTruthy();
    const site = adventure.fields[siteId!];
    expect(site.location).toBe("dungeon_gate");
    expect(site.dungeonSite).toBe(true);
    expect(state.pendingChoice).toBeNull();
    expect(adventure.creatureBankTokensNear!.length).toBe(nearPileBefore);
    expect(state.eventLog.some((event) => event.type === "DUNGEON_PLACED")).toBe(true);

    // A SECOND near tile goes back to the normal Creature-Bank offer.
    const second = instantiateTile(adventure, "N2", { row: 8, col: 8 }, 0, true);
    second.awaitingRotation = true;
    adventure.pendingTileChoice = { tileInstanceId: second.id, playerId: "p1", kind: "place" };
    setTileRotation(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: second.id, rotation: 0 });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe(
      "place-creature-bank"
    );
  });
});

describe("The Dungeon — delving floors", () => {
  it("uses one shared room layout per floor for every player", () => {
    const state = dungeonGame("dungeon-shared-layout");
    const fieldId = placeSiteUnderHero(state);
    beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
    const first = state.adventure!.pendingVisit?.steps[0];
    expect(first?.type).toBe("CHOOSE_ONE");
    const firstLabels =
      first?.type === "CHOOSE_ONE"
        ? first.options.slice(0, 2).map((option) => option.label)
        : [];

    state.adventure!.pendingVisit = null;
    state.heroes.hero_p2.spaceId = fieldId;
    beginFieldVisit(state, state.heroes.hero_p2.id, fieldId, false);
    const second = firstPendingVisitStep(state);
    const secondLabels =
      second?.type === "CHOOSE_ONE"
        ? second.options.slice(0, 2).map((option) => option.label)
        : [];
    expect(secondLabels).toEqual(firstLabels);
  });

  it("floor 1 offers TWO seeded rooms + Leave; the chosen room resolves BEFORE the den fight opens (real difficulty, never a guaranteed win)", () => {
    const state = dungeonGame("dungeon-delve");
    const fieldId = placeSiteUnderHero(state);
    const goldBefore = state.players.p1.resources.gold;

    beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
    const menu = state.adventure!.pendingVisit?.steps[0];
    if (menu?.type !== "CHOOSE_ONE") {
      throw new Error("expected the door menu");
    }
    expect(menu.options.length).toBe(3);
    expect(menu.options[2].label).toMatch(/Leave/i);

    // Pick an AUTO-resolving door (the shrine's PAY_TO pauses for input by
    // design — two distinct rooms are seeded, so at least one door is auto).
    const vaultIndex = menu.options.findIndex((option) => /Treasure vault/.test(option.label));
    const autoIndex = menu.options.findIndex(
      (option, index) => index < 2 && !/shrine/i.test(option.label)
    );
    const pick = vaultIndex >= 0 ? vaultIndex : autoIndex;
    expect(pick).toBeGreaterThanOrEqual(0);
    const after = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: pick });

    // The room resolved first (vault gold banked), THEN the den fight opened.
    if (vaultIndex >= 0) {
      expect(after.players.p1.resources.gold).toBe(goldBefore + 2);
    }
    const context = after.combat?.context;
    expect(context?.kind).toBe("neutral");
    if (context?.kind !== "neutral") {
      throw new Error("expected a neutral dungeon context");
    }
    expect(context.dungeonFloor).toBe(1);
    // The grind site: REAL difficulty (floor+1) — hero/unit XP apply.
    expect(context.difficulty).toBe(dungeonFloorDifficulty(1));
    // Opening the fight does not set the removed once-per-round latch.
    expect(after.players.p1.dungeonDelveRound).toBeUndefined();
    // The delve is NEVER a computer guaranteed win (the explicit exclusion —
    // its difficulty would otherwise pass the level gates).
    expect(combatQualifiesForComputerGuaranteedWin(after, after.combat as CombatState)).toBe(false);
  });

  it("Leave the Dungeon opens no fight and consumes no extra movement", () => {
    const state = dungeonGame("dungeon-leave");
    const fieldId = placeSiteUnderHero(state);
    const after = visitGate(state, fieldId, 2);
    expect(after.combat).toBeNull();
    expect(after.players.p1.dungeonDelveRound).toBeUndefined();
  });

  it("a loss keeps the current floor immediately retryable, including on a later round", () => {
    const state = dungeonGame("dungeon-once");
    const fieldId = placeSiteUnderHero(state);
    const fought = delveFloor(state, fieldId);
    // Lose the fight (nothing lost) and try again immediately.
    fought.combat!.outcome = {
      winnerPlayerId: NEUTRAL_PLAYER_ID,
      defeatedPlayerId: "p1",
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fought);
    beginFieldVisit(fought, fought.heroes.hero_p1.id, fieldId, false);
    expect(fought.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");

    // It remains available after a round change as well.
    fought.round += 1;
    beginFieldVisit(fought, fought.heroes.hero_p1.id, fieldId, false);
    expect(fought.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
  });

  it("a win offers the next floor immediately and continuation spends exactly 1 movement", () => {
    const state = dungeonGame("dungeon-movement");
    const fieldId = placeSiteUnderHero(state);
    const fought = delveFloor(state, fieldId);
    fought.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fought);
    const movementBefore = fought.heroes.hero_p1.movementPoints;
    pumpAdventureQueues(fought);
    const menu = fought.adventure!.pendingVisit?.steps[0];
    expect(menu?.type).toBe("CHOOSE_ONE");
    if (menu?.type !== "CHOOSE_ONE") {
      throw new Error("expected a continuation door menu");
    }
    expect(menu.options[0]?.label).toMatch(/Descend \(1 movement\)/);
    const optionIndex = 0;
    expect(menu.options[optionIndex]?.steps[0]).toMatchObject({
      type: "SPEND_HERO_MOVEMENT",
      amount: 1
    });
    const movementRefund = menu.options[optionIndex]!.steps.reduce(
      (total, step) => total + (step.type === "GAIN_MOVEMENT" ? step.amount : 0),
      0
    );
    const continued = apply(fought, {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p1",
      optionIndex
    });
    expect(continued.heroes.hero_p1.movementPoints).toBe(
      movementBefore - 1 + movementRefund
    );
  });

  it("with no movement left, a win saves the new floor and tells the player to resume later", () => {
    const state = dungeonGame("dungeon-resume-later");
    const fieldId = placeSiteUnderHero(state);
    const fought = delveFloor(state, fieldId);
    fought.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fought);
    fought.heroes.hero_p1.movementPoints = 0;
    pumpAdventureQueues(fought);

    expect(fought.players.p1.dungeonFloor).toBe(2);
    expect(fought.adventure!.pendingVisit).toBeNull();
    expect(
      fought.eventLog.some(
        (event) =>
          event.type === "EVENT_NOTE" &&
          event.playerId === "p1" &&
          /resume here on a later turn/i.test(event.message)
      )
    ).toBe(true);
  });

  it("a WIN advances the floor and pays the ladder (unshifted to the queue front); a LOSS keeps the floor and the hero stays on the gate", () => {
    const win = dungeonGame("dungeon-win");
    const winField = placeSiteUnderHero(win);
    const wonFight = delveFloor(win, winField);
    wonFight.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(wonFight);
    expect(wonFight.players.p1.dungeonFloor).toBe(2);
    const first = wonFight.adventure!.rewardQueue[0];
    expect(first?.kind).toBe("visit-steps");
    expect(
      first?.kind === "visit-steps" &&
        first.steps.some((step) => step.type === "GAIN_RESOURCES" && step.gold === 2)
    ).toBe(true);
    expect(wonFight.eventLog.some((event) => event.type === "DUNGEON_FLOOR_CLEARED")).toBe(true);

    const loss = dungeonGame("dungeon-loss");
    const lossField = placeSiteUnderHero(loss);
    const lostFight = delveFloor(loss, lossField);
    lostFight.combat!.outcome = {
      winnerPlayerId: NEUTRAL_PLAYER_ID,
      defeatedPlayerId: "p1",
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(lostFight);
    expect(lostFight.players.p1.dungeonFloor ?? 1).toBe(1);
    // The Dungeon deals fair: no pillage, no bounce home.
    expect(lostFight.heroes.hero_p1.spaceId).toBe(lossField);
    expect(lostFight.eventLog.some((event) => event.type === "DUNGEON_FLOOR_CLEARED")).toBe(false);
  });

  it("floor 5 skips the doors and fields the LAYERED floor boss (revealed pinned back-center with its escort)", () => {
    const state = dungeonGame("dungeon-boss-floor");
    const fieldId = placeSiteUnderHero(state);
    state.players.p1.dungeonFloor = 5;

    beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
    const menu = state.adventure!.pendingVisit?.steps[0];
    if (menu?.type !== "CHOOSE_ONE") {
      throw new Error("expected the boss confirm");
    }
    expect(menu.options.length).toBe(2);
    expect(menu.prompt).toMatch(/Minotaur of the Depths/);

    let fight = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    fight = revealFloorArmy(fight);

    const boss = Object.values(fight.combat!.units).find((unit) => unit.bossUnit);
    expect(boss, "expected the floor boss on the board").toBeTruthy();
    expect(boss!.armyStacks).toBe(1); // 2 layers = body + 1 stack bar
    expect(boss!.bankUnit).toBe(true);
    expect(boss!.position).toBe(DEFENDER_BACKLINE[1]);
    const minions = Object.values(fight.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && !unit.bossUnit
    );
    expect(minions.length).toBeGreaterThan(0);
    expect(minions.length).toBeLessThanOrEqual(DUNGEON_FLOOR_BOSSES.minotaur_of_the_depths.minionCount);
  });

  it("the Doom dungeon swaps in Doom rooms, guards, and its own layered floor bosses", () => {
    const state = dungeonGame("dungeon-doom-floor", {
      wog: { enabled: true, dungeon: true, pveTheme: "doom" }
    });
    const fieldId = placeSiteUnderHero(state);
    state.players.p1.dungeonFloor = 5;

    beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
    const menu = state.adventure!.pendingVisit?.steps[0];
    expect(state.adventure?.pveTheme).toBe("doom");
    expect(menu?.type).toBe("CHOOSE_ONE");
    if (menu?.type !== "CHOOSE_ONE") {
      throw new Error("expected the Doom boss confirm");
    }
    expect(menu.prompt).toMatch(/Baron Warden/);

    let fight = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    fight = revealFloorArmy(fight);
    const boss = Object.values(fight.combat!.units).find((unit) => unit.bossUnit);
    const minions = Object.values(fight.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && !unit.bossUnit
    );
    expect(boss?.unitDefId).toBe("boss.doom_baron_warden");
    expect(minions.length).toBeGreaterThan(0);
    expect(minions.every((unit) => unit.unitDefId?.startsWith("doom."))).toBe(true);
  });

  it("conquering floor 10 pays the relic search + the Conqueror title ONCE; the bottom floor stays repeatable for the fallback reward", () => {
    const state = dungeonGame("dungeon-conquer");
    const fieldId = placeSiteUnderHero(state);
    state.players.p1.dungeonFloor = DUNGEON_FLOOR_CAP;

    const fight = visitGate(state, fieldId, 0);
    fight.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fight);
    expect(fight.players.p1.dungeonConquered).toBe(true);
    expect(fight.players.p1.dungeonFloor).toBe(DUNGEON_FLOOR_CAP);
    expect(fight.eventLog.some((event) => event.type === "DUNGEON_CONQUERED")).toBe(true);
    const first = fight.adventure!.rewardQueue[0];
    expect(
      first?.kind === "visit-steps" &&
        first.steps.some((step) => step.type === "SEARCH_SHARED_DECK" && /artifacts/.test(step.deckId))
    ).toBe(true);

    // The REPEAT clear pays the fallback (Treasure die + 3 gold), no 2nd title.
    fight.adventure!.rewardQueue = [];
    fight.round += 1;
    const again = visitGate(fight, fieldId, 0);
    again.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(again);
    expect(again.eventLog.filter((event) => event.type === "DUNGEON_CONQUERED").length).toBe(1);
    const repeat = again.adventure!.rewardQueue[0];
    expect(
      repeat?.kind === "visit-steps" && repeat.steps.some((step) => step.type === "ROLL_TREASURE_DICE")
    ).toBe(true);
  });

  it("the guaranteed-win CONTROL: the SAME single-player context qualifies once the dungeon marker is removed", () => {
    // A single-player table with a computer seat p2 — build the minimal
    // qualifying combat shape and prove the dungeonFloor marker alone is what
    // excludes it (the mutation control for the explicit exclusion clause).
    const state = createAdventureGameState({
      seed: "dungeon-gw-control",
      rollFirstPlayer: false,
      sessionMode: "single-player",
      playerCount: 2
    });
    const hero = state.heroes.hero_p2;
    hero.level = 2;
    const combat = {
      attackerPlayerId: "p2",
      defenderPlayerId: NEUTRAL_PLAYER_ID,
      outcome: null,
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId: hero.spaceId,
        difficulty: 2,
        hasAzure: false,
        dungeonFloor: 1
      }
    } as unknown as CombatState;
    expect(combatQualifiesForComputerGuaranteedWin(state, combat)).toBe(false);
    delete (combat.context as { dungeonFloor?: number }).dungeonFloor;
    expect(combatQualifiesForComputerGuaranteedWin(state, combat)).toBe(true);
  });

  it("the reward ladder is data-complete for floors 1..10 (and the repeat fallback)", () => {
    const state = dungeonGame("dungeon-ladder");
    for (let floor = 1; floor <= DUNGEON_FLOOR_CAP; floor += 1) {
      expect(dungeonFloorRewardSteps(state, floor).length, `floor ${floor}`).toBeGreaterThan(0);
    }
    const repeat = dungeonFloorRewardSteps(state, 10, { repeat: true });
    expect(repeat.some((step) => step.type === "ROLL_TREASURE_DICE")).toBe(true);
    expect(repeat.some((step) => step.type === "SEARCH_SHARED_DECK")).toBe(false);
  });
});
