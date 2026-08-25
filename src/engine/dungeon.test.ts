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
import {
  DUNGEON_FLOOR_CAP,
  DUNGEON_WARDEN_POOLS,
  dungeonBossId,
  dungeonDoorsForFloor,
  dungeonFloorDifficulty,
  dungeonFloorRewardSteps,
  dungeonRoomPool,
  dungeonTreasureThemeOf,
  dungeonWardenIdFor,
  describeVisitSteps,
  DUNGEON_TREASURE_THEME_LABELS,
  type DungeonTreasureTheme
} from "./dungeon";
import { pveEncounterScriptsFor } from "@/data/anime/pve-combat-scripts";
import { combatScriptEffectLines } from "@/data/map/combat-scripts";
import { makeCombatUnitFromArmy } from "./adventure";
import { houseRuleEnabled } from "./house-rules";
import { createSeededRandom } from "./random";
import { DUNGEON_FLOOR_BOSSES, RAID_BOSSES } from "@/data/anime/bosses";
import { stackTokenDelta } from "@/data/map/creature-banks";
import { WAVE_MINIBOSS_POOLS } from "./monster-waves";
import { ENEMY_FORCE_BOSS_HAND_SIZE, enemyForcePoolEntry } from "./enemy-force";
import { NEUTRAL_PLAYER_ID, type CombatState, type MapSpaceId, type VisitStep } from "./state";

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
  // Skip the rooms that PAUSE (a PAY_TO or a nested CHOOSE_ONE — the shrine and
  // the hot forge). Detected STRUCTURALLY, not by label, so new rooms cannot
  // silently break this helper.
  const pick = menu.options.findIndex(
    (option, index) =>
      index < 2 && !option.steps.some((step) => step.type === "PAY_TO" || step.type === "CHOOSE_ONE")
  );
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

  it("with Creature Banks OFF the site still PLACES on a revealed Near tile (the flag alone proved nothing)", () => {
    // The Dungeon used to ride the bank RESERVATION, so it needed the banks
    // option; it now carves ahead of the (absent) token pile. Drive the real
    // rotation seam with no piles at all — the effect, not the frozen flag.
    const state = dungeonGame("dungeon-no-banks-placement", {
      creatureBanks: false,
      wog: { enabled: true, dungeon: true }
    });
    const adventure = state.adventure!;
    expect(adventure.creatureBankTokensNear).toBeUndefined();

    const tile = instantiateTile(adventure, "N1", { row: -8, col: -8 }, 0, true);
    expect(tile.group).toBe("near");
    tile.awaitingRotation = true;
    adventure.pendingTileChoice = { tileInstanceId: tile.id, playerId: "p1", kind: "place" };
    setTileRotation(state, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: tile.id,
      rotation: 0
    });

    const siteId = adventure.dungeonSite?.fieldId;
    expect(siteId).toBeTruthy();
    expect(adventure.fields[siteId!].location).toBe("dungeon_gate");
    expect(state.pendingChoice).toBeNull();
    expect(state.eventLog.some((event) => event.type === "DUNGEON_PLACED")).toBe(true);

    // And it is a real delve site: standing on it opens the floor-1 door menu.
    state.heroes.hero_p1.spaceId = siteId!;
    beginFieldVisit(state, state.heroes.hero_p1.id, siteId!, false);
    expect(firstPendingVisitStep(state)?.type).toBe("CHOOSE_ONE");
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
    expect(menu.options[0]?.label).toMatch(/Continue \(1 movement\)/);
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

  it("keeps an exact secondary delver bound to the reward and continuation chain", () => {
    const state = dungeonGame("dungeon-secondary-context");
    const fieldId = placeSiteUnderHero(state);
    const secondary = state.heroes.hero_p1;
    secondary.kind = "secondary";
    const mainSpace = Object.keys(state.adventure!.fields).find((spaceId) => spaceId !== fieldId)!;
    state.heroes.hero_p1_main = {
      ...secondary,
      id: "hero_p1_main",
      kind: "main",
      spaceId: mainSpace
    };

    const fought = delveFloor(state, fieldId);
    fought.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fought);
    const reward = fought.adventure!.rewardQueue[0];
    expect(reward).toMatchObject({
      kind: "visit-steps",
      heroId: secondary.id,
      fieldId
    });

    pumpAdventureQueues(fought);
    expect(fought.adventure!.pendingVisit).toMatchObject({
      heroId: secondary.id,
      fieldId
    });
    expect(fought.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
  });

  it("clears every designed-guard trace when carving the shared Dungeon site", () => {
    const state = dungeonGame("dungeon-clean-carve");
    const field = Object.values(state.adventure!.fields).find(
      (candidate) => candidate.location !== "town"
    )!;
    Object.assign(field, {
      difficulty: 7,
      customGuardUnits: ["neutral.ancient-behemoth"],
      customGuardLevel: 7,
      designedGuard: true,
      breakField: true,
      persistentGuard: true,
      unlimitedCombatRounds: true
    });

    placeDungeonSite(state, field.spaceId);

    expect(field.location).toBe("dungeon_gate");
    expect(field.difficulty).toBeUndefined();
    expect(field.customGuardUnits).toBeUndefined();
    expect(field.customGuardLevel).toBeUndefined();
    expect(field.designedGuard).toBeUndefined();
    expect(field.breakField).toBeUndefined();
    expect(field.persistentGuard).toBeUndefined();
    expect(field.unlimitedCombatRounds).toBeUndefined();
  });

  it("setup can make immediate descents free or cost 2 movement", () => {
    for (const cost of [0, 2] as const) {
      const state = dungeonGame(`dungeon-cost-${cost}`, {
        wog: { enabled: true, dungeon: true, dungeonDescentCost: cost }
      });
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
      if (menu?.type !== "CHOOSE_ONE") throw new Error("expected continuation");
      expect(menu.options[0]?.label).toMatch(
        cost === 0 ? /Continue \(free descent\)/ : /Continue \(2 movement\)/
      );
      const spend = menu.options[0]!.steps.find((step) => step.type === "SPEND_HERO_MOVEMENT");
      if (cost === 0) {
        expect(spend).toBeUndefined();
      } else {
        expect(spend).toMatchObject({ amount: 2 });
      }
      const roomMovement = menu.options[0]!.steps.reduce(
        (total, step) => total + (step.type === "GAIN_MOVEMENT" ? step.amount : 0),
        0
      );
      const continued = apply(fought, {
        type: "RESOLVE_VISIT_STEP",
        playerId: "p1",
        optionIndex: 0
      });
      expect(continued.heroes.hero_p1.movementPoints).toBe(
        movementBefore - cost + roomMovement
      );
    }
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
    // The ladder rung itself is theme-dependent now (§F1), so assert the queue
    // really carries THIS game's floor-1 rung (plus the continue step) rather
    // than one theme's literal payout.
    expect(first?.kind === "visit-steps" && first.steps).toEqual([
      ...dungeonFloorRewardSteps(wonFight, 1, { playerId: "p1" }),
      { type: "DUNGEON_CONTINUE" }
    ]);
    expect(first?.kind === "visit-steps" && first.steps.length).toBeGreaterThan(1);
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
    // Which classic floor-5 warden this seed fields comes from the seeded pool
    // (§C1); every entry is a 2-layer warden with a printed escort.
    const wardenDef = DUNGEON_FLOOR_BOSSES[dungeonWardenIdFor(state.seed, "classic", 5)];
    expect(menu.prompt).toMatch(wardenDef.name);

    let fight = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    fight = revealFloorArmy(fight);

    const boss = Object.values(fight.combat!.units).find((unit) => unit.bossUnit);
    expect(boss, "expected the floor boss on the board").toBeTruthy();
    expect(boss!.armyStacks).toBe(wardenDef.layers - 1); // layers = body + stack bars
    expect(boss!.bankUnit).toBe(true);
    expect(boss!.position).toBe(DEFENDER_BACKLINE[1]);
    const minions = Object.values(fight.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && !unit.bossUnit
    );
    expect(minions.length).toBeGreaterThan(0);
    expect(minions.length).toBeLessThanOrEqual(wardenDef.minionCount);
  });

  it("a designed map's floor WARDEN replaces the theme default on the board (an unknown id degrades to a plain party)", () => {
    // The editor advertises "custom wardens may reuse the monsters authored
    // above", and the warden may be named even with the Raid Bosses module OFF
    // (only `dungeon` is ticked here). The EFFECT is the unit that shows up.
    const gloomfang = {
      id: "gloomfang",
      name: "Gloomfang",
      attack: 5,
      defense: 1,
      health: 3,
      initiative: 6,
      layers: 3
    };
    const state = dungeonGame("dungeon-designed-warden", {
      customMapPreset: {
        raidBosses: { bosses: [gloomfang] },
        dungeon: { floorBosses: { 5: "gloomfang" } }
      }
    });
    expect(state.adventure?.dungeonSite?.floorBosses).toEqual({ 5: "gloomfang" });
    const fieldId = placeSiteUnderHero(state);
    state.players.p1.dungeonFloor = 5;
    beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
    const menu = firstPendingVisitStep(state);
    if (menu?.type !== "CHOOSE_ONE") {
      throw new Error("expected the warden confirm");
    }
    // CONTROL for §C1: the designer floorBosses entry still WINS over the
    // seeded warden pool, whichever warden that pool would have picked.
    const pooled = dungeonWardenIdFor(state.seed, "classic", 5);
    expect(menu.prompt).toMatch(/Gloomfang/);
    expect(menu.prompt).not.toMatch(DUNGEON_FLOOR_BOSSES[pooled].name);
    let fight = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    fight = revealFloorArmy(fight);
    const warden = Object.values(fight.combat!.units).find((unit) => unit.bossUnit);
    expect(warden?.unitDefId).toBe("boss.gloomfang");
    expect(warden?.attack).toBe(5);
    expect(warden?.armyStacks).toBe(2); // 3 layers = body + 2 bars

    // CONTROL — the SAME seed with no designed warden fields the theme default.
    const control = dungeonGame("dungeon-designed-warden");
    const controlField = placeSiteUnderHero(control);
    control.players.p1.dungeonFloor = 5;
    beginFieldVisit(control, control.heroes.hero_p1.id, controlField, false);
    const controlMenu = firstPendingVisitStep(control);
    if (controlMenu?.type !== "CHOOSE_ONE") {
      throw new Error("expected the default boss confirm");
    }
    expect(controlMenu.prompt).toMatch(DUNGEON_FLOOR_BOSSES[pooled].name);
    let controlFight = apply(control, {
      type: "RESOLVE_VISIT_STEP",
      playerId: "p1",
      optionIndex: 0
    });
    controlFight = revealFloorArmy(controlFight);
    expect(
      Object.values(controlFight.combat!.units).find((unit) => unit.bossUnit)?.unitDefId
    ).toBe(`boss.${pooled}`);

    // DOCUMENTED LIMIT: the sanitizer keeps any 40-char string, so a hand-edited
    // (typo'd) warden id cannot be resolved — the floor then fields a PLAIN
    // party instead of stalling or throwing.
    const typo = dungeonGame("dungeon-warden-typo", {
      customMapPreset: { dungeon: { floorBosses: { 5: "no_such_boss" } } }
    });
    const typoField = placeSiteUnderHero(typo);
    typo.players.p1.dungeonFloor = 5;
    let typoFight = visitGate(typo, typoField, 0);
    typoFight = revealFloorArmy(typoFight);
    expect(Object.values(typoFight.combat!.units).some((unit) => unit.bossUnit)).toBe(false);
    expect(
      Object.values(typoFight.combat!.units).filter(
        (unit) => unit.controllerId === NEUTRAL_PLAYER_ID
      ).length
    ).toBeGreaterThan(0);
  });

  it("a dungeon floor fight is FOUGHT on the theme's dedicated calamity board", () => {
    // The player-visible EFFECT: the engine stamps the frozen theme's PvE board
    // onto the opened floor fight (the client only renders `combat.boardArtId`).
    for (const [theme, expected] of [
      ["classic", "pve-calamity-classic"],
      ["doom", "pve-calamity-doom"]
    ] as const) {
      const state = dungeonGame(`dungeon-board-${theme}`, {
        anime: { enabled: true, dungeon: true, pveTheme: theme }
      });
      const fieldId = placeSiteUnderHero(state);
      const fought = delveFloor(state, fieldId);
      expect(fought.combat?.boardArtId, theme).toBe(expected);
    }
  });

  it("the Doom dungeon swaps in Doom rooms, guards, and its own layered floor bosses", () => {
    const state = dungeonGame("dungeon-doom-floor", {
      anime: { enabled: true, dungeon: true, pveTheme: "doom" }
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
    // Warden variety (§C1): which of the DOOM floor-5 wardens this seed fields
    // is the seeded pool pick — but it is always a DOOM one, never a classic.
    const wardenId = dungeonWardenIdFor(state.seed, "doom", 5);
    expect(DUNGEON_WARDEN_POOLS.doom[5]).toContain(wardenId);
    expect(menu.prompt).toMatch(DUNGEON_FLOOR_BOSSES[wardenId].name);

    let fight = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    fight = revealFloorArmy(fight);
    const boss = Object.values(fight.combat!.units).find((unit) => unit.bossUnit);
    const minions = Object.values(fight.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && !unit.bossUnit
    );
    expect(boss?.unitDefId).toBe(`boss.${wardenId}`);
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

  it("a 5-floor expedition crowns floor 5 as the final repeatable floor", () => {
    const state = dungeonGame("dungeon-short-campaign", {
      wog: { enabled: true, dungeon: true, dungeonDepth: 5 }
    });
    expect(state.adventure?.dungeonSite).toEqual({ fieldId: null, maxFloor: 5 });
    const fieldId = placeSiteUnderHero(state);
    state.players.p1.dungeonFloor = 5;
    const fight = visitGate(state, fieldId, 0);
    fight.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fight);
    expect(fight.players.p1.dungeonConquered).toBe(true);
    expect(fight.players.p1.dungeonFloor).toBe(5);
    expect(
      fight.eventLog.some(
        (event) => event.type === "DUNGEON_CONQUERED" && /floor 5 has fallen/i.test(event.message)
      )
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

// ---------------------------------------------------------------------------
// Variant expansion §C1 — warden variety (a seeded pool per theme and floor)
// ---------------------------------------------------------------------------

describe("The Dungeon — warden variety (§C1)", () => {
  it("the pick is STABLE per (seed, theme, floor) and really VARIES across games", () => {
    for (const theme of ["classic", "doom"] as const) {
      for (const floor of [5, 10] as const) {
        expect(dungeonWardenIdFor("warden-stable", theme, floor)).toBe(
          dungeonWardenIdFor("warden-stable", theme, floor)
        );
        const rolled = new Set(
          Array.from({ length: 8 }, (_, index) => dungeonWardenIdFor(`warden-seed-${index}`, theme, floor))
        );
        // Real variety, not a constant: at least two of eight fixed seeds differ.
        expect(rolled.size, `${theme} floor ${floor}`).toBeGreaterThan(1);
        for (const id of rolled) {
          expect(DUNGEON_WARDEN_POOLS[theme][floor]).toContain(id);
        }
      }
    }
  });

  it("the historically shipped warden stays reachable as each pool's first entry", () => {
    expect(DUNGEON_WARDEN_POOLS.classic[5][0]).toBe("minotaur_of_the_depths");
    expect(DUNGEON_WARDEN_POOLS.classic[10][0]).toBe("floor_wyrm");
    expect(DUNGEON_WARDEN_POOLS.doom[5][0]).toBe("doom_baron_warden");
    expect(DUNGEON_WARDEN_POOLS.doom[10][0]).toBe("doom_cyberdemon_tyrant");
  });

  it("a classic game never fields a Doom warden and vice versa (across 8 seeds, through the real dungeonBossId)", () => {
    const doomPool = new Set([...DUNGEON_WARDEN_POOLS.doom[5], ...DUNGEON_WARDEN_POOLS.doom[10]]);
    const classicPool = new Set([
      ...DUNGEON_WARDEN_POOLS.classic[5],
      ...DUNGEON_WARDEN_POOLS.classic[10]
    ]);
    for (let index = 0; index < 8; index += 1) {
      const classic = dungeonGame(`warden-theme-classic-${index}`);
      const doom = dungeonGame(`warden-theme-doom-${index}`, {
        anime: { enabled: true, dungeon: true, pveTheme: "doom" }
      });
      for (const floor of [5, 10] as const) {
        const classicId = dungeonBossId(classic, floor)!;
        const doomId = dungeonBossId(doom, floor)!;
        expect(classicPool.has(classicId), classicId).toBe(true);
        expect(doomPool.has(classicId), classicId).toBe(false);
        expect(doomPool.has(doomId), doomId).toBe(true);
        expect(classicPool.has(doomId), doomId).toBe(false);
      }
      // The precedence rung really reads the pool (not the old fixed table):
      // dungeonBossId agrees with the seeded pick for this game's seed.
      expect(dungeonBossId(classic, 5)).toBe(dungeonWardenIdFor(classic.seed, "classic", 5));
      expect(dungeonBossId(doom, 10)).toBe(dungeonWardenIdFor(doom.seed, "doom", 10));
      // Non-boss floors still field no warden at all.
      expect(dungeonBossId(classic, 4)).toBeUndefined();
    }
  });

  it("CONTROL: a designer floorBosses entry still WINS over the seeded pool", () => {
    const state = dungeonGame("warden-designed-wins", {
      customMapPreset: { dungeon: { floorBosses: { 5: "floor_wyrm", 10: "minotaur_of_the_depths" } } }
    });
    expect(dungeonBossId(state, 5)).toBe("floor_wyrm");
    expect(dungeonBossId(state, 10)).toBe("minotaur_of_the_depths");
  });

  it("every warden the wave mini-boss pool can draw stays inside the wave caps, and NO warden is excluded any more", () => {
    for (const theme of ["classic", "doom"] as const) {
      for (const id of WAVE_MINIBOSS_POOLS[theme]) {
        const def = DUNGEON_FLOOR_BOSSES[id];
        expect(def, `${theme} → ${id}`).toBeTruthy();
        // §0 coupling: a fatter warden here silently inflates Calamity Wave 4+.
        expect(def.layers, `${id} layers`).toBeLessThanOrEqual(3);
        expect(def.minionCount, `${id} minions`).toBeLessThanOrEqual(3);
      }
    }
    // 2026-08-21: `warden_stone_choir` used to be barred from the wave pool
    // because it was a round-start CASTER whose whole-side debuff stacked with
    // the wave's own battle event. BOSS_SPELL_ROTATION is gone, its replacement
    // kit debuffs nobody (a conditional single-target petrify + a damage cap),
    // so it leads waves like every other warden. If this is ever re-excluded,
    // the reason must be written next to the pool, not here.
    expect(WAVE_MINIBOSS_POOLS.classic).toContain("warden_stone_choir");
    expect(DUNGEON_WARDEN_POOLS.classic[5]).toContain("warden_stone_choir");
    expect(DUNGEON_FLOOR_BOSSES.warden_stone_choir.abilities).toEqual([
      "azure-dragon-paralysis",
      "doom-baron-damage-cap"
    ]);
    // Every warden the wave pool can field is drawn from the SAME catalog the
    // dungeon uses — the pools are hand-written, so a typo'd id would field a
    // plain party instead of a boss.
    for (const theme of ["classic", "doom"] as const) {
      for (const id of WAVE_MINIBOSS_POOLS[theme]) {
        expect(DUNGEON_FLOOR_BOSSES[id], id).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Variant expansion §D — the Dungeon takes the themed escort but NEVER tokens
// ---------------------------------------------------------------------------

describe("The Dungeon — escorts (§D1 yes, §D2 never)", () => {
  it("a warden with an escortPool fields it, and NO dungeon escort ever carries a Stack Token (CONTROL for the raid-only §D2)", () => {
    // `mother_demon` is a 5-layer boss WITH an escort pool — at a raid lair that
    // layer count would hand out 2 Stack Tokens (§D2). Named as a designed floor
    // warden it proves both halves at once.
    const state = dungeonGame("dungeon-escort-pool", {
      customMapPreset: { dungeon: { floorBosses: { 5: "mother_demon" } } }
    });
    const fieldId = placeSiteUnderHero(state);
    state.players.p1.dungeonFloor = 5;
    let fight = visitGate(state, fieldId, 0);
    fight = revealFloorArmy(fight);

    const escorts = Object.values(fight.combat!.units).filter(
      (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && !unit.bossUnit
    );
    expect(escorts.length).toBe(RAID_BOSSES.mother_demon.minionCount);
    for (const unit of escorts) {
      expect(RAID_BOSSES.mother_demon.escortPool!, unit.unitDefId).toContain(unit.unitDefId);
      expect(unit.stackToken ?? null, `${unit.unitDefId} must be plain in the Dungeon`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Variant expansion §F1 / §F3 / §F4 — treasure themes, repeat clears, new rooms
// ---------------------------------------------------------------------------

/**
 * A game whose seeded treasure theme is exactly `theme`. Scanning for a seed
 * (rather than stubbing the function) keeps every assertion below on the REAL
 * seeded derivation — a constant theme fails the variety test in the same file.
 */
function themedDungeonGame(
  theme: DungeonTreasureTheme,
  options: Record<string, unknown> = {},
  tag = "theme"
): GameState {
  for (let index = 0; index < 400; index += 1) {
    const state = dungeonGame(`${tag}-probe-${theme}-${index}`, options);
    if (dungeonTreasureThemeOf(state) === theme) {
      return state;
    }
  }
  throw new Error(`no seed produced the ${theme} treasure theme`);
}

/** Every step KIND in a step tree, descending into CHOOSE_ONE / PAY_TO arms. */
function stepKinds(steps: VisitStep[]): string[] {
  const kinds: string[] = [];
  for (const step of steps) {
    kinds.push(step.type);
    if (step.type === "CHOOSE_ONE") {
      for (const option of step.options) {
        kinds.push(...stepKinds(option.steps));
      }
    } else if (step.type === "PAY_TO") {
      kinds.push(...stepKinds(step.steps));
    }
  }
  return kinds;
}

const ALL_TREASURE_THEMES: DungeonTreasureTheme[] = ["hoard", "arsenal", "lore"];
const ARTIFACT_FLOORS = [3, 5, 7, 10];
const THEMED_FLOORS = [1, 2, 4, 6, 8, 9];

describe("The Dungeon — treasure themes (§F1)", () => {
  it("the theme is STABLE per seed and really VARIES across games", () => {
    expect(dungeonTreasureThemeOf(dungeonGame("theme-stable"))).toBe(
      dungeonTreasureThemeOf(dungeonGame("theme-stable"))
    );
    const rolled = new Set(
      Array.from({ length: 8 }, (_, index) => dungeonTreasureThemeOf(dungeonGame(`theme-variety-${index}`)))
    );
    expect(rolled.size, `rolled: ${[...rolled].join(", ")}`).toBeGreaterThanOrEqual(2);
    for (const theme of rolled) {
      expect(ALL_TREASURE_THEMES).toContain(theme);
    }
  });

  it("ANTI-INFLATION: the Artifact rungs (3/5/7/10) are IDENTICAL in all three themes", () => {
    const ladders = ALL_TREASURE_THEMES.map((theme) =>
      themedDungeonGame(theme, { unitExperience: true, wog: { enabled: true, dungeon: true, commanders: true } })
    );
    for (const floor of ARTIFACT_FLOORS) {
      const rungs = ladders.map((state) => dungeonFloorRewardSteps(state, floor, { playerId: "p1" }));
      // The shipped ladder: exactly ONE Artifact search on every artifact rung.
      expect(rungs[0].filter((step) => step.type === "SEARCH_SHARED_DECK").length, `floor ${floor}`).toBe(1);
      expect(rungs[1], `floor ${floor} arsenal`).toEqual(rungs[0]);
      expect(rungs[2], `floor ${floor} lore`).toEqual(rungs[0]);
    }
    // ...and no theme ever adds an Artifact search to a NON-artifact rung.
    for (const state of ladders) {
      for (const floor of THEMED_FLOORS) {
        expect(
          stepKinds(dungeonFloorRewardSteps(state, floor, { playerId: "p1" })),
          `floor ${floor}`
        ).not.toContain("SEARCH_SHARED_DECK");
      }
    }
  });

  it("the NON-artifact rungs really diverge: hoard vs lore differ on at least 4 floors", () => {
    const options = { unitExperience: true, wog: { enabled: true, dungeon: true, commanders: true } };
    const hoard = themedDungeonGame("hoard", options);
    const lore = themedDungeonGame("lore", options);
    const differing = THEMED_FLOORS.filter(
      (floor) =>
        JSON.stringify(dungeonFloorRewardSteps(hoard, floor, { playerId: "p1" })) !==
        JSON.stringify(dungeonFloorRewardSteps(lore, floor, { playerId: "p1" }))
    );
    expect(differing.length, `differing floors: ${differing.join(", ")}`).toBeGreaterThanOrEqual(4);
  });

  it("an arsenal game REALLY pays unit XP — the card's experience moves, not just the step shape", () => {
    const state = themedDungeonGame("arsenal", { unitExperience: true }, "arsenal-effect");
    const unit = state.players.p1.army[0];
    expect(unit, "expected a starting army").toBeTruthy();
    const xpBefore = unit.experience ?? 0;

    // Floor 2 in arsenal is the unit-XP rung: a CHOOSE_ONE naming each card.
    const rung = dungeonFloorRewardSteps(state, 2, { playerId: "p1" });
    const pick = rung.find((step) => step.type === "CHOOSE_ONE");
    expect(pick?.type === "CHOOSE_ONE" && pick.options[0].steps[0]).toEqual({
      type: "GAIN_UNIT_XP",
      armyUnitId: unit.id,
      amount: 2
    });

    const fieldId = placeSiteUnderHero(state);
    state.adventure!.pendingVisit = { heroId: "hero_p1", playerId: "p1", fieldId, steps: rung };
    const opened = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(opened.players.p1.army[0].experience ?? 0).toBe(xpBefore + 2);
  });

  it("CONTROL: with Unit Experience and Commanders OFF, every module-gated rung falls back to a real, non-empty payout", () => {
    for (const theme of ALL_TREASURE_THEMES) {
      const state = themedDungeonGame(theme, {}, "fallback");
      expect(state.adventure?.unitExperience).toBeFalsy();
      expect(state.wog?.commanders).toBeFalsy();
      for (const floor of [2, 6, 8, 9]) {
        const rung = dungeonFloorRewardSteps(state, floor, { playerId: "p1" });
        expect(rung.length, `${theme} floor ${floor}`).toBeGreaterThan(0);
        const kinds = stepKinds(rung);
        expect(kinds, `${theme} floor ${floor}`).not.toContain("GAIN_UNIT_XP");
        expect(kinds, `${theme} floor ${floor}`).not.toContain("GAIN_COMMANDER_POINTS");
      }
    }
    // And an arsenal Stack-Token rung with EVERY card already Stacked falls
    // back too (the enumeration gate, not a module gate).
    const stacked = themedDungeonGame("arsenal", {}, "stacked");
    for (const unit of stacked.players.p1.army) {
      unit.stackToken = "attack";
    }
    for (const floor of [4, 9]) {
      const rung = dungeonFloorRewardSteps(stacked, floor, { playerId: "p1" });
      expect(rung.length, `stacked floor ${floor}`).toBeGreaterThan(0);
      expect(stepKinds(rung), `stacked floor ${floor}`).not.toContain("GRANT_STACK_TOKEN");
    }
  });

  it("§F3: a repeat bottom-floor clear teaches a card with Unit Experience ON — and is byte-identical with it OFF (CONTROL)", () => {
    const off = dungeonGame("repeat-off");
    expect(dungeonFloorRewardSteps(off, 10, { repeat: true, playerId: "p1" })).toEqual([
      { type: "ROLL_TREASURE_DICE", count: 1 },
      { type: "GAIN_RESOURCES", gold: 3 }
    ]);

    const on = dungeonGame("repeat-on", { unitExperience: true });
    const repeat = dungeonFloorRewardSteps(on, 10, { repeat: true, playerId: "p1" });
    // Gold and dice UNCHANGED — the only addition is the teaching.
    expect(repeat.slice(0, 2)).toEqual([
      { type: "ROLL_TREASURE_DICE", count: 1 },
      { type: "GAIN_RESOURCES", gold: 3 }
    ]);
    expect(stepKinds(repeat)).toContain("GAIN_UNIT_XP");
    // The theme never touches the repeat fallback (anti-inflation).
    for (const theme of ALL_TREASURE_THEMES) {
      const themed = themedDungeonGame(theme, {}, "repeat-theme");
      expect(dungeonFloorRewardSteps(themed, 10, { repeat: true, playerId: "p1" })).toEqual([
        { type: "ROLL_TREASURE_DICE", count: 1 },
        { type: "GAIN_RESOURCES", gold: 3 }
      ]);
    }
  });
});

describe("The Dungeon — new rooms (§F4)", () => {
  it("both themes ship the forge and the pit, and EVERY room step is one the visit pump can resolve", () => {
    // The pump either resolves a step outright or PAUSES on it and offers a
    // RESOLVE_VISIT_STEP; anything else would strand a delver.
    const resolvable = new Set([
      "GAIN_RESOURCES",
      "GAIN_MORALE",
      "GAIN_MOVEMENT",
      "GAIN_EXPERIENCE",
      "ROLL_TREASURE_DICE",
      "PLAY_STORY_SCENE",
      "GAIN_UNIT_XP",
      "GRANT_STACK_TOKEN",
      "CHOOSE_ONE",
      "PAY_TO"
    ]);
    const state = dungeonGame("rooms-kinds");
    for (const theme of ["classic", "doom"] as const) {
      for (let floor = 1; floor <= DUNGEON_FLOOR_CAP; floor += 1) {
        const pool = dungeonRoomPool(floor, theme, { state, playerId: "p1" });
        expect(pool.length, `${theme} floor ${floor}`).toBe(8);
        expect(
          pool.some((room) => room.key === "forge"),
          theme
        ).toBe(true);
        expect(
          pool.some((room) => room.key === "pit"),
          theme
        ).toBe(true);
        for (const room of pool) {
          expect(room.steps.length, `${theme} ${room.key}`).toBeGreaterThan(0);
          for (const kind of stepKinds(room.steps)) {
            expect([...resolvable], `${theme} ${room.key} → ${kind}`).toContain(kind);
          }
        }
      }
    }
  });

  it("every floor 1..10 × both themes offers TWO DIFFERENT room objects", () => {
    const state = dungeonGame("rooms-doors");
    for (const theme of ["classic", "doom"] as const) {
      for (let floor = 1; floor <= DUNGEON_FLOOR_CAP; floor += 1) {
        const rng = createSeededRandom(`${state.seed}#dungeon-doors-${theme}-${floor}`);
        const [left, right] = dungeonDoorsForFloor(rng, floor, theme, { state, playerId: "p1" });
        expect(left, `${theme} floor ${floor}`).not.toBe(right);
        expect(left.label, `${theme} floor ${floor}`).not.toBe(right.label);
      }
    }
  });

  it("the FORGE really mints a rulebook Stack Token — the OPEN QUESTION: it works with polish-unit-stacks OFF", () => {
    const state = dungeonGame("forge-effect");
    // CONTROL on the premise: the Polish persistent-layer rule is OFF here, and
    // the token still lands and still folds — GRANT_STACK_TOKEN writes the
    // RULEBOOK Stack Token, which is a different mechanism from polish layers.
    expect(houseRuleEnabled(state, "polish-unit-stacks")).toBe(false);
    const unit = state.players.p1.army[0];
    expect(unit.stackToken ?? null).toBeNull();

    const forge = dungeonRoomPool(1, "classic", { state, playerId: "p1" }).find((room) => room.key === "forge")!;
    expect(forge.steps[0].type).toBe("PAY_TO");

    const fieldId = placeSiteUnderHero(state);
    state.players.p1.resources.gold = 10;
    state.adventure!.pendingVisit = { heroId: "hero_p1", playerId: "p1", fieldId, steps: [...forge.steps] };
    // Pay → pick the card → pick the stat (attack is option 0).
    let next = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(next.players.p1.resources.gold).toBe(7);
    next = apply(next, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    next = apply(next, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    const tokened = next.players.p1.army.find((candidate) => candidate.id === unit.id)!;
    expect(tokened.stackToken).toBe("attack");
    // The OUTCOME, not the field: the token really folds into the combat body.
    const withToken = makeCombatUnitFromArmy(tokened, "p1", "forge_probe", 0)!;
    const plain = makeCombatUnitFromArmy(
      { ...tokened, stackToken: undefined },
      "p1",
      "plain_probe",
      1
    )!;
    expect(withToken.attack).toBe(plain.attack + stackTokenDelta("attack"));
  });

  it("CONTROL: with every army card already Stacked the forge goes COLD — no dead PAY_TO, a flat 3-gold refund instead", () => {
    const state = dungeonGame("forge-cold");
    for (const unit of state.players.p1.army) {
      unit.stackToken = "health";
    }
    const forge = dungeonRoomPool(1, "classic", { state, playerId: "p1" }).find((room) => room.key === "forge")!;
    expect(forge.steps).toEqual([{ type: "GAIN_RESOURCES", gold: 3 }]);
    expect(forge.label).toMatch(/cold/i);
    // Same with NO context at all (a caller that cannot name an army).
    const contextless = dungeonRoomPool(1, "classic").find((room) => room.key === "forge")!;
    expect(contextless.steps).toEqual([{ type: "GAIN_RESOURCES", gold: 3 }]);
  });
});

// ---------------------------------------------------------------------------
// Variant expansion §E/§F PRESENTATION — the floor prompt EXPLAINS the fight
// ---------------------------------------------------------------------------

describe("The Dungeon — pre-fight explanation (§E/§F presentation)", () => {
  /** Open the floor menu and return its prompt. */
  function floorPrompt(state: GameState, floor: number): string {
    state.players.p1.dungeonFloor = floor;
    const fieldId = placeSiteUnderHero(state);
    beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
    const menu = firstPendingVisitStep(state);
    if (menu?.type !== "CHOOSE_ONE") {
      throw new Error("expected the floor menu");
    }
    return menu.prompt;
  }

  it("names THIS floor's reward, the treasure theme and the band's field effects", () => {
    for (const theme of ALL_TREASURE_THEMES) {
      const state = themedDungeonGame(theme, {}, "explain");
      const expectedReward = describeVisitSteps(dungeonFloorRewardSteps(state, 1, { playerId: "p1" }));
      expect(expectedReward.length, `${theme} floor 1 reward line`).toBeGreaterThan(0);
      const prompt = floorPrompt(state, 1);
      expect(prompt, theme).toContain(`Floor reward: ${expectedReward}.`);
      expect(prompt, theme).toContain(`Treasure theme: ${DUNGEON_TREASURE_THEME_LABELS[theme]}.`);
      // The shallow band's script, by its authored summary — never a literal.
      const scripts = pveEncounterScriptsFor({ theme: "classic", dungeonFloor: 1 });
      expect(scripts.length).toBeGreaterThan(0);
      for (const line of combatScriptEffectLines(scripts)) {
        expect(prompt, theme).toContain(line);
      }
    }
  });

  it("the reward line is DERIVED — two themes with different ladders print different lines", () => {
    const hoard = themedDungeonGame("hoard", {}, "explain-derived");
    const lore = themedDungeonGame("lore", {}, "explain-derived");
    // Floor 1 diverges by design (lore pays hero XP, hoard 2 gold).
    expect(describeVisitSteps(dungeonFloorRewardSteps(hoard, 1, { playerId: "p1" }))).not.toBe(
      describeVisitSteps(dungeonFloorRewardSteps(lore, 1, { playerId: "p1" }))
    );
    expect(floorPrompt(hoard, 1)).not.toBe(floorPrompt(lore, 1));
  });

  it("the DEEP band prints a different field effect than the shallow one (band-keyed, not constant)", () => {
    const shallow = floorPrompt(dungeonGame("explain-band-a"), 2);
    const deep = floorPrompt(dungeonGame("explain-band-b"), 6);
    const deepLines = combatScriptEffectLines(pveEncounterScriptsFor({ theme: "classic", dungeonFloor: 6 }));
    expect(deepLines.length).toBeGreaterThan(0);
    for (const line of deepLines) {
      expect(deep).toContain(line);
      expect(shallow).not.toContain(line);
    }
  });

  it("CONTROL: a query naming neither a floor nor a boss selects NOTHING (no 'no field effects' noise)", () => {
    expect(pveEncounterScriptsFor({ theme: "classic" })).toEqual([]);
    expect(pveEncounterScriptsFor({ theme: "doom" })).toEqual([]);
    expect(combatScriptEffectLines([])).toEqual([]);
  });

  it("the doom theme's floor prompt prints the DOOM band's effects, not the classic ones", () => {
    const state = dungeonGame("explain-doom", {
      wog: undefined,
      anime: { enabled: true, dungeon: true, pveTheme: "doom" }
    });
    expect(state.adventure?.pveTheme).toBe("doom");
    const prompt = floorPrompt(state, 6);
    for (const line of combatScriptEffectLines(pveEncounterScriptsFor({ theme: "doom", dungeonFloor: 6 }))) {
      expect(prompt).toContain(line);
    }
    for (const line of combatScriptEffectLines(pveEncounterScriptsFor({ theme: "classic", dungeonFloor: 6 }))) {
      expect(prompt).not.toContain(line);
    }
  });

  it("every room label states its cost and its payout", () => {
    const state = dungeonGame("room-labels");
    for (const theme of ["classic", "doom"] as const) {
      for (const floor of [1, 4, 8]) {
        for (const room of dungeonRoomPool(floor, theme, { state, playerId: "p1" })) {
          const label = room.label.toLowerCase();
          const walk = (steps: VisitStep[]): void => {
            for (const step of steps) {
              if (step.type === "PAY_TO") {
                expect(label, room.label).toContain("pay");
                for (const cost of step.costOptions) {
                  if (cost.gold) {
                    expect(label, room.label).toContain(String(cost.gold));
                  }
                }
                walk(step.steps);
              } else if (step.type === "GAIN_RESOURCES") {
                if (step.gold) {
                  expect(label, room.label).toContain(`${step.gold} gold`);
                }
                if (step.valuables) {
                  expect(label, room.label).toContain(`${step.valuables} valuable`);
                }
              } else if (step.type === "ROLL_TREASURE_DICE") {
                expect(label, room.label).toContain("treasure di");
              } else if (step.type === "GAIN_EXPERIENCE") {
                expect(label, room.label).toContain(`${step.amount} hero experience`);
              } else if (step.type === "GAIN_MOVEMENT") {
                expect(label, room.label).toContain(`${step.amount} movement`);
              } else if (step.type === "GAIN_MORALE" && step.amount > 0) {
                expect(label, room.label).toContain("morale");
              } else if (step.type === "CHOOSE_ONE") {
                // The Stack-Token grant: the label must say what it hands out.
                expect(label, room.label).toContain("stack token");
              }
            }
          };
          walk(room.steps);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The PvE ENEMY FORCE hand on a REAL Dungeon floor (2026-08-21)
// ---------------------------------------------------------------------------

describe("The Dungeon — the enemy force hand", () => {
  /** Delve floor N and close deployment, so the combat-start package has run. */
  function fightFloor(seed: string, floor: number): GameState {
    const state = dungeonGame(seed);
    state.players.p1.dungeonFloor = floor;
    const fieldId = placeSiteUnderHero(state);
    return revealFloorArmy(delveFloor(state, fieldId));
  }

  it("an ORDINARY floor's hand grows with the floor band — shallow 2, deep 3, abyss 4", () => {
    // The integration claim: the size the fight actually deals is the size
    // `enemyForceHandSize` derives, on a real floor opened through the real
    // door menu. Floors 5 and 10 are wardens, so they are excluded here.
    for (const [floor, expected] of [
      [1, 2],
      [3, 2],
      [4, 3],
      [6, 3],
      [7, 3],
      [8, 4],
      [9, 4]
    ] as const) {
      const fight = fightFloor(`dungeon-ef-${floor}`, floor);
      const force = fight.combat!.enemyForce;
      expect(force, `floor ${floor} dealt no hand`).toBeTruthy();
      expect(force!.cardIds, `floor ${floor} hand size`).toHaveLength(expected);
      expect(new Set(force!.cardIds).size, `floor ${floor} duplicates`).toBe(expected);
      for (const cardId of force!.cardIds) {
        expect(enemyForcePoolEntry(cardId), `${floor}: ${cardId}`).not.toBeNull();
      }
    }
  });

  it("a WARDEN floor (5 / 10) fields a boss's full five", () => {
    for (const floor of [5, 10] as const) {
      const fight = fightFloor(`dungeon-ef-warden-${floor}`, floor);
      expect(fight.combat!.enemyForce!.cardIds, `floor ${floor}`).toHaveLength(
        ENEMY_FORCE_BOSS_HAND_SIZE
      );
    }
  });

  it("the floor prompt WARNS how many cards the enemy force holds", () => {
    const state = dungeonGame("dungeon-ef-prompt");
    state.players.p1.dungeonFloor = 8;
    const fieldId = placeSiteUnderHero(state);
    beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
    const menu = firstPendingVisitStep(state);
    if (menu?.type !== "CHOOSE_ONE") {
      throw new Error("expected the floor menu");
    }
    // Abyss band ⇒ four cards, and the player is told BEFORE committing.
    expect(menu.prompt).toContain("enemy force holds 4 cards");
  });
});
