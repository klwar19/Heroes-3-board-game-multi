import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, type GameAction, type GameState } from "./index";
import { createAdventureLobbyState } from "./adventure-setup";
import {
  NEUTRAL_DECK_IDS,
  beginFieldVisit,
  getAdjacentSpaceIds,
  getMainHero,
  processPendingVisit,
  startAdventureRound
} from "./adventure";
import {
  DEFENDER_BACKLINE,
  finalizeAdventureCombat,
  pumpAdventureQueues,
  setTileRotation,
  startNeutralEncounter
} from "./adventure-reducer";
import {
  applyEraRoundStart,
  carveMithrilMine,
  grantDiscoveryMithril,
  mintWanderingBossUnit,
  mithrilRerollAvailable,
  mithrilRerollSources,
  payMithrilMineBoosts,
  resolveWanderingBossVictory,
  wanderingBossUnitId
} from "./wog-era";
import { createInitialGameState } from "./setup";
import { MITHRIL_MINE_KIND, MITHRIL_MINE_LOCATION_ID, wanderingBossDefinition } from "@/data/wog/era";
import { allTileDefinitions } from "@/data/map/tiles";
import { getFieldOverrideDefinition } from "@/data/map/field-overrides";
import {
  fieldOverrideKindAllowedForState,
  fieldOverrideMayCoverFieldDef,
  fieldOverridePlacementCandidates
} from "./field-overrides";
import { DEFAULT_WOG_OPTIONS, NEUTRAL_PLAYER_ID, type MapFieldState, type MapTileState, type WogModOptions } from "./state";

/**
 * WoG era modules (src/engine/wog-era.ts) — every claim asserted on an
 * observable outcome against a CONTROL where the module-off / rule-removed
 * behaviour diverges.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function eraGame(seed: string, modules: Partial<WogModOptions> = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    wog: { enabled: true, ...modules }
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.adventure!.pendingTileChoice = null;
  state.pendingChoice = null;
  state.adventure!.houseRules = { ...state.adventure!.houseRules, "polish-quick-combat": false };
  return state;
}

function openTurn(state: GameState, playerId = "p1"): void {
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.adventure!.pendingTileChoice = null;
  state.pendingChoice = null;
  state.combat = null;
  state.activePlayerId = playerId;
  state.phase = "player-turn";
  state.priorityPlayerId = null;
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
}

function startRound(state: GameState, round: number): void {
  state.round = round;
  startAdventureRound(state);
  pumpAdventureQueues(state);
}

function offers(state: GameState, type: GameAction["type"], playerId = "p1") {
  return getLegalActions(state, playerId).filter((entry) => entry.action.type === type);
}

/** A near tile whose printed fields can host a Mithril Mine. */
function mineReadyNearTile(state: GameState): MapTileState {
  const mineDef = getFieldOverrideDefinition(MITHRIL_MINE_KIND)!;
  const tile = Object.values(state.adventure!.tiles).find((candidate) => {
    const def = allTileDefinitions[candidate.tileDefId];
    return (
      candidate.group === "near" &&
      candidate.faceDown &&
      def?.fields.some((_, slot) => fieldOverrideMayCoverFieldDef(def, slot, mineDef, "near"))
    );
  });
  expect(tile, "expected a face-down near tile with a plain field").toBeTruthy();
  return tile!;
}

/** Reveal + confirm a tile's rotation for p1 through the real SET_TILE_ROTATION handler. */
function discover(state: GameState, tile: MapTileState): void {
  tile.faceDown = false;
  tile.awaitingRotation = true;
  state.adventure!.pendingTileChoice = { tileInstanceId: tile.id, playerId: "p1", kind: "reveal" };
  setTileRotation(state, { type: "SET_TILE_ROTATION", playerId: "p1", tileInstanceId: tile.id, rotation: 0 });
}

/** Any materialized field no hero stands on (optionally excluding some ids). */
function freeField(state: GameState, exclude: string[] = []): MapFieldState {
  const occupied = new Set(Object.values(state.heroes).map((hero) => hero.spaceId));
  const field = Object.values(state.adventure!.fields).find(
    (candidate) => !occupied.has(candidate.spaceId) && !exclude.includes(candidate.spaceId)
  );
  expect(field).toBeTruthy();
  return field!;
}

// ---------------------------------------------------------------------------
// Setup freeze + lobby
// ---------------------------------------------------------------------------

describe("WoG era — setup freeze and the WOG lobby toggles", () => {
  it("CONTROL: modules off ⇒ nothing frozen onto the adventure, no era offers", () => {
    const state = eraGame("era-off");
    openTurn(state);
    for (const key of ["wanderingBoss", "wanderingTeacher", "loanBank", "mithril", "karmicBattles", "skillCombos"]) {
      expect((state.adventure as Record<string, unknown>)[key]).toBeUndefined();
    }
    expect(offers(state, "TAKE_LOAN")).toEqual([]);
  });

  it("a WOG-window toggle persists through SET_GAME_OPTIONS (the sanitizer keeps the era flags)", () => {
    const lobby = createAdventureLobbyState({ seed: "era-lobby" });
    const result = applyAction(lobby, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        wog: { ...DEFAULT_WOG_OPTIONS, enabled: true, wanderingBoss: true, mithril: true, wanderingBossSpawnRound: 4 }
      }
    });
    expect(result.errors).toEqual([]);
    const wog = result.state.setupLobby?.options.wog;
    expect(wog?.wanderingBoss).toBe(true);
    expect(wog?.mithril).toBe(true);
    expect(wog?.wanderingBossSpawnRound).toBe(4);
    // CONTROL: an untouched module stays off.
    expect(wog?.loanBank).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Loan Bank
// ---------------------------------------------------------------------------

describe("WoG era — Loan Bank", () => {
  it("TAKE_LOAN pays 10 now, one loan at a time; the bank collects 15 only AFTER the due round", () => {
    const state = eraGame("era-loan", { loanBank: true });
    openTurn(state);
    state.round = 2;
    const goldBefore = state.players.p1.resources.gold;
    expect(offers(state, "TAKE_LOAN")).toHaveLength(1);
    const taken = apply(state, { type: "TAKE_LOAN", playerId: "p1" });
    expect(taken.players.p1.resources.gold).toBe(goldBefore + 10);
    expect(taken.players.p1.loan).toMatchObject({ repay: 15, dueRound: 5 });
    expect(offers(taken, "TAKE_LOAN")).toEqual([]);

    // CONTROL: the due round itself is still the borrower's to repay.
    taken.players.p1.resources.gold = 40;
    startRound(taken, 5);
    expect(taken.players.p1.loan).toBeDefined();
    const beforeCollection = taken.players.p1.resources.gold;
    startRound(taken, 6);
    expect(taken.players.p1.loan).toBeUndefined();
    expect(taken.players.p1.resources.gold).toBe(beforeCollection - 15);
    expect(taken.players.p1.loanDefaulted).toBeUndefined();
  });

  it("a default seizes the newest leaf building and the bank never lends again", () => {
    const state = eraGame("era-loan-default", { loanBank: true });
    openTurn(state);
    state.round = 2;
    const taken = apply(state, { type: "TAKE_LOAN", playerId: "p1" });
    const town = Object.values(taken.towns).find((candidate) => candidate.controllerId === "p1")!;
    const buildingsBefore = [...town.buildings];
    expect(buildingsBefore.length).toBeGreaterThan(0);
    taken.players.p1.resources.gold = 3;
    startRound(taken, 6);
    expect(taken.players.p1.loanDefaulted).toBe(true);
    expect(taken.players.p1.loan).toBeUndefined();
    expect(town.buildings.length).toBe(buildingsBefore.length - 1);
    openTurn(taken);
    expect(offers(taken, "TAKE_LOAN")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mithril
// ---------------------------------------------------------------------------

describe("WoG era — Mithril", () => {
  it("discovery pays Far 1 / Near 2 / Center 3 once per tile; module off pays nothing", () => {
    const state = eraGame("era-mithril-discovery", { mithril: true });
    const near = mineReadyNearTile(state);
    discover(state, near);
    expect(state.players.p1.mithril).toBe(2);
    // Once per tile.
    grantDiscoveryMithril(state, "p1", near);
    expect(state.players.p1.mithril).toBe(2);
    const band = (group: MapTileState["group"]): MapTileState => ({ ...near, id: `probe-${group}`, group, mithrilGranted: undefined });
    grantDiscoveryMithril(state, "p1", band("far"));
    expect(state.players.p1.mithril).toBe(3);
    grantDiscoveryMithril(state, "p1", band("center"));
    expect(state.players.p1.mithril).toBe(6);
    grantDiscoveryMithril(state, "p1", band("sea"));
    expect(state.players.p1.mithril).toBe(6);

    const control = eraGame("era-mithril-discovery", {});
    discover(control, mineReadyNearTile(control));
    expect(control.players.p1.mithril ?? 0).toBe(0);
  });

  it("a revealed Near tile carves exactly one guarded (Ⅴ) Mithril Mine; module off carves none", () => {
    const state = eraGame("era-mithril-mine", { mithril: true });
    const tile = mineReadyNearTile(state);
    discover(state, tile);
    const mines = Object.values(state.adventure!.fields).filter((field) => field.location === MITHRIL_MINE_LOCATION_ID);
    expect(mines).toHaveLength(1);
    expect(mines[0]!.tileInstanceId).toBe(tile.id);
    expect(mines[0]!.difficulty).toBe(5);
    carveMithrilMine(state, tile); // once per tile
    expect(Object.values(state.adventure!.fields).filter((field) => field.location === MITHRIL_MINE_LOCATION_ID)).toHaveLength(1);

    const control = eraGame("era-mithril-mine", {});
    discover(control, mineReadyNearTile(control));
    expect(Object.values(control.adventure!.fields).some((field) => field.location === MITHRIL_MINE_LOCATION_ID)).toBe(false);
  });

  it("the Mithril Mine flags Garrison-style (beaten guard cleared, single owner) and pays its holder 1 per Resource Round", () => {
    const state = eraGame("era-mithril-mine-flag", { mithril: true });
    discover(state, mineReadyNearTile(state));
    const mine = Object.values(state.adventure!.fields).find((field) => field.location === MITHRIL_MINE_LOCATION_ID)!;
    const p1 = getMainHero(state, "p1")!;
    p1.spaceId = mine.spaceId;
    beginFieldVisit(state, p1.id, mine.spaceId, false);
    expect(mine.flagOwnerId).toBe("p1");
    expect(mine.difficulty).toBeUndefined();

    const before = state.players.p1.mithril ?? 0;
    payMithrilMineBoosts(state);
    expect(state.players.p1.mithril).toBe(before + 1);
    expect(state.players.p2.mithril ?? 0).toBe(0);

    // An enemy entering takes the single flag.
    const p2 = getMainHero(state, "p2")!;
    p1.spaceId = freeField(state, [mine.spaceId]).spaceId;
    p2.spaceId = mine.spaceId;
    beginFieldVisit(state, p2.id, mine.spaceId, false);
    expect(mine.flagOwnerId).toBe("p2");
    payMithrilMineBoosts(state);
    expect(state.players.p2.mithril).toBe(1);
    expect(state.players.p1.mithril).toBe(before + 1);
  });

  it("a hand-crafted mithril_mine designer pin never carves (CONTROL: a WoG object pin on the same tile does)", () => {
    const run = (kind: string): GameState => {
      const state = eraGame("era-mithril-pin", { newObjects: true });
      const tile = mineReadyNearTile(state);
      // The pinned hex: a legal plain hex of this tile (found on a probe copy).
      const probe = structuredClone(state);
      discover(probe, probe.adventure!.tiles[tile.id]!);
      const preferredSpaceId = fieldOverridePlacementCandidates(probe, probe.adventure!.tiles[tile.id]!, "junk_merchant")[0];
      expect(preferredSpaceId).toBeTruthy();
      tile.pendingFieldOverrides = [{ kind, fromPool: false, preferredSpaceId }];
      discover(state, tile);
      return state;
    };
    expect(fieldOverrideKindAllowedForState(eraGame("era-mithril-pin-gate", { newObjects: true }), MITHRIL_MINE_KIND)).toBe(false);
    const pinned = run(MITHRIL_MINE_KIND);
    expect(Object.values(pinned.adventure!.fields).some((field) => field.location === MITHRIL_MINE_LOCATION_ID)).toBe(false);
    const control = run("junk_merchant");
    expect(Object.values(control.adventure!.fields).some((field) => field.location === "wog.junk_merchant")).toBe(true);
  });

  it("module off: a stray Mithril Mine hex is inert — a visit never flags it (CONTROL: module on flags it)", () => {
    const visit = (modules: Partial<WogModOptions>): MapFieldState => {
      const state = eraGame("era-mithril-inert", modules);
      const field = freeField(state);
      Object.assign(field, { location: MITHRIL_MINE_LOCATION_ID, flagOwnerId: null, blackCube: false });
      delete field.difficulty;
      const hero = getMainHero(state, "p1")!;
      hero.spaceId = field.spaceId;
      beginFieldVisit(state, hero.id, field.spaceId, false);
      return field;
    };
    expect(visit({}).flagOwnerId).toBeNull();
    expect(visit({ mithril: true }).flagOwnerId).toBe("p1");
  });

  it("the Mithril Mine never takes the hex a designer-pinned Field Override prefers", () => {
    const base = eraGame("era-mithril-pin-order", { mithril: true, newObjects: true });
    const tileId = mineReadyNearTile(base).id;
    // CONTROL: without the pin the mine lands on hex M.
    const control = structuredClone(base);
    discover(control, control.adventure!.tiles[tileId]!);
    const minedHex = Object.values(control.adventure!.fields).find(
      (field) => field.location === MITHRIL_MINE_LOCATION_ID
    )!.spaceId;
    // With a junk_merchant pin preferring M, the pin gets M and the mine does not.
    const tile = base.adventure!.tiles[tileId]!;
    tile.pendingFieldOverrides = [{ kind: "junk_merchant", fromPool: false, preferredSpaceId: minedHex }];
    discover(base, tile);
    expect(base.adventure!.fields[minedHex]!.location).toBe("wog.junk_merchant");
  });

  it("every seat gains 1 Mithril at the start of every 3rd round (round 3 yes, round 4 no)", () => {
    const state = eraGame("era-mithril-income", { mithril: true });
    startRound(state, 2);
    expect(state.players.p1.mithril ?? 0).toBe(0);
    startRound(state, 3);
    expect(state.players.p1.mithril).toBe(1);
    expect(state.players.p2.mithril).toBe(1);
    startRound(state, 4);
    expect(state.players.p1.mithril).toBe(1);

    const control = eraGame("era-mithril-income", {});
    startRound(control, 3);
    expect(control.players.p1.mithril ?? 0).toBe(0);
  });

  it("forging a mine (2 Mithril) doubles its NEXT Resource-round payout once", () => {
    const state = eraGame("era-mithril-forge", { mithril: true });
    openTurn(state);
    const mine = freeField(state);
    Object.assign(mine, { location: "mine", resource: "gold", amount: 3, flagOwnerId: "p1", everFlagged: true, blackCube: false });
    delete mine.difficulty;
    state.players.p1.mithril = 2;
    const forge = offers(state, "MITHRIL_FORGE_MINE");
    expect(forge.map((entry) => entry.action)).toContainEqual({ type: "MITHRIL_FORGE_MINE", playerId: "p1", fieldId: mine.spaceId });
    const forged = apply(state, { type: "MITHRIL_FORGE_MINE", playerId: "p1", fieldId: mine.spaceId });
    expect(forged.players.p1.mithril).toBe(0);
    const forgedMine = forged.adventure!.fields[mine.spaceId]!;
    expect(forgedMine.mithrilBoostBy).toBe("p1");

    const gold = forged.players.p1.resources.gold;
    payMithrilMineBoosts(forged);
    expect(forged.players.p1.resources.gold).toBe(gold + 3);
    expect(forgedMine.mithrilBoostBy).toBeUndefined();
    // One-shot: the next pass pays nothing extra.
    payMithrilMineBoosts(forged);
    expect(forged.players.p1.resources.gold).toBe(gold + 3);
  });

  it("the Mithril reroll is offered on a map die, costs 1 Mithril and is once per round", () => {
    const state = eraGame("era-mithril-reroll", { mithril: true });
    openTurn(state);
    state.round = 2;
    state.players.p1.mithril = 3;
    state.players.p1.morale = 0;
    const hero = getMainHero(state, "p1")!;
    const roll = () => {
      state.adventure!.pendingVisit = {
        heroId: hero.id,
        playerId: "p1",
        fieldId: hero.spaceId!,
        steps: [{ type: "ROLL_TREASURE_DICE", count: 1 }]
      };
      processPendingVisit(state);
      const step = state.adventure!.pendingVisit?.steps[0];
      return step?.type === "CHOOSE_ONE" ? step.options.map((option) => option.label) : [];
    };
    const labels = roll();
    const index = labels.findIndex((label) => label.includes("Mithril"));
    expect(index).toBeGreaterThanOrEqual(0);
    const after = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: index });
    expect(after.players.p1.mithril).toBe(2);
    expect(mithrilRerollAvailable(after, "p1")).toBe(false);
    expect(mithrilRerollSources(after, "p1")).toEqual([]);
    after.round = 3;
    expect(mithrilRerollAvailable(after, "p1")).toBe(true);

    const control = eraGame("era-mithril-reroll", {});
    control.players.p1.mithril = 3;
    expect(mithrilRerollAvailable(control, "p1")).toBe(false);
  });

  it("a forged Ballista deals +1 and a forged First Aid Tent heals 2 only in EVEN combat rounds", () => {
    const withAdventure = (seed: string, forged: string[]): GameState => {
      const state = createInitialGameState(seed);
      const adventureGame = eraGame(seed, { mithril: true });
      state.adventure = adventureGame.adventure;
      state.combat!.context = { kind: "player", attackerHeroId: "hero_p1", defenderHeroId: "hero_p2", fieldId: "field_center" };
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.players.p2.permanents = [];
      state.players.p1.mithrilWarMachines = forged;
      return state;
    };
    const ballista = (forged: string[]) => {
      const state = withAdventure("era-ballista", forged);
      state.players.p1.permanents = ["war_machine.ballista"];
      const units = state.combat!.units;
      let next = 8;
      for (const id of Object.keys(units)) {
        if (units[id]!.controllerId === "p2") units[id]!.initiative = id === "unit_p2_dread_knights" ? 1 : next--;
      }
      units.unit_p2_dread_knights!.maxHealth = 12;
      units.unit_p2_dread_knights!.damage = 0;
      state.combat!.activeUnitId = null;
      state.activePlayerId = "p1";
      const fired = apply(state, { type: "END_COMBAT_ROUND", playerId: "p1" });
      return fired.combat!.units.unit_p2_dread_knights!.damage;
    };
    expect(ballista(["war_machine.ballista"])).toBe(2);
    expect(ballista([])).toBe(1);

    const tent = (forged: string[], round: number) => {
      let state = withAdventure("era-tent", forged);
      state.players.p1.permanents = [];
      state.players.p1.hand = ["war_machine.first_aid_tent"];
      const wounded = state.combat!.units.unit_p1_crusaders!;
      wounded.maxHealth = 8;
      wounded.damage = 5;
      const play = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "war_machine.first_aid_tent"
      );
      state = apply(state, play!.action);
      state.combat!.round = round;
      const heal = state.activeEffects.find((effect) => effect.name === "First Aid Tent")!;
      state = apply(state, {
        type: "USE_ACTIVE_EFFECT",
        playerId: "p1",
        effectId: heal.id,
        target: { type: "unit", unitId: "unit_p1_crusaders" }
      });
      return 5 - state.combat!.units.unit_p1_crusaders!.damage;
    };
    expect(tent(["war_machine.first_aid_tent"], 2)).toBe(2);
    expect(tent(["war_machine.first_aid_tent"], 1)).toBe(1);
    expect(tent([], 2)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Wandering Teacher
// ---------------------------------------------------------------------------

describe("WoG era — Wandering Teacher", () => {
  it("arrives on round 2 and sells Mastery (8 gold) to a hero on its field — two lessons per GAME", () => {
    const state = eraGame("era-teacher", { wanderingTeacher: true });
    startRound(state, 2);
    const teacher = state.adventure!.wanderingTeacher!;
    expect(teacher.spaceId).toBeTruthy();
    expect(teacher.offer).toHaveLength(2);
    openTurn(state);
    teacher.offer = ["mastery", "retrain"];
    state.players.p1.resources.gold = 40;
    state.players.p1.hand = ["ability.archery", "ability.tactics", "ability.offense"];
    state.players.p1.empoweredAbilities = [];
    // CONTROL: no hero on the Teacher's field ⇒ no lesson.
    expect(offers(state, "TEACHER_LESSON")).toEqual([]);
    getMainHero(state, "p1")!.spaceId = teacher.spaceId;
    expect(offers(state, "TEACHER_LESSON").length).toBeGreaterThan(0);

    const lesson = (next: GameState, cardId: string): GameState =>
      apply(next, { type: "TEACHER_LESSON", playerId: "p1", heroId: getMainHero(next, "p1")!.id, lesson: "mastery", cardId });
    let next = lesson(state, "ability.archery");
    expect(next.players.p1.resources.gold).toBe(32);
    expect(next.players.p1.empoweredAbilities).toContain("ability.archery");
    next = lesson(next, "ability.tactics");
    expect(next.players.p1.teacherLessons).toBe(2);
    // The third lesson of the game is refused.
    expect(offers(next, "TEACHER_LESSON")).toEqual([]);
    const third = applyAction(next, {
      type: "TEACHER_LESSON",
      playerId: "p1",
      heroId: getMainHero(next, "p1")!.id,
      lesson: "mastery",
      cardId: "ability.offense"
    });
    expect(third.errors.length).toBeGreaterThan(0);
  });

  it("CONTROL: module off — no Teacher on round 2", () => {
    const state = eraGame("era-teacher-off", {});
    startRound(state, 2);
    expect(state.adventure!.wanderingTeacher).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Skill Combos
// ---------------------------------------------------------------------------

describe("WoG era — Skill Combos", () => {
  it("owning both ingredients offers the combo; forging adds the card and closes every other combo", () => {
    const state = eraGame("era-combo", { skillCombos: true });
    openTurn(state);
    state.players.p1.hand = ["ability.archery"];
    state.players.p1.deck = [];
    state.players.p1.discard = ["ability.armorer"];
    // CONTROL: one ingredient only.
    expect(offers(state, "FORGE_SKILL_COMBO")).toEqual([]);
    state.players.p1.deck = ["ability.tactics"];
    const combos = offers(state, "FORGE_SKILL_COMBO").map((entry) => entry.action.type === "FORGE_SKILL_COMBO" && entry.action.comboId);
    expect(combos).toEqual(expect.arrayContaining(["volley_formation", "shield_wall"]));
    const forged = apply(state, { type: "FORGE_SKILL_COMBO", playerId: "p1", comboId: "volley_formation" });
    expect(forged.players.p1.hand).toContain("combo.volley_formation");
    expect(offers(forged, "FORGE_SKILL_COMBO")).toEqual([]);
    expect(applyAction(forged, { type: "FORGE_SKILL_COMBO", playerId: "p1", comboId: "shield_wall" }).errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Karmic Battles
// ---------------------------------------------------------------------------

describe("WoG era — Karmic Battles", () => {
  function guardField(state: GameState): MapFieldState {
    const field = freeField(state);
    Object.assign(field, { location: "mine", resource: "gold", amount: 2, flagOwnerId: null, blackCube: false, difficulty: 3 });
    delete field.customGuardUnits;
    delete field.customGuardLevel;
    return field;
  }

  it("an ordinary guard fight first asks printed vs EMPOWERED; empowered guards reveal with a Stack Token", () => {
    const state = eraGame("era-karmic", { karmicBattles: true });
    openTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    state.players.p1.hand = [];
    const field = guardField(state);
    hero.spaceId = field.spaceId;
    startNeutralEncounter(state, hero, field);
    expect(state.combat).toBeNull();
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("karmic-battle");
    let next = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: state.pendingChoice!.id, optionIndex: 1 });
    expect(next.combat?.context.kind === "neutral" && next.combat.context.karmicEmpowered).toBe(true);
    const place = getLegalActions(next, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    next = apply(next, place!.action);
    next = apply(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const guards = Object.values(next.combat!.units).filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID);
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.every((unit) => Boolean(unit.stackToken))).toBe(true);

    // CONTROL: module off — straight to placement, no pick.
    const control = eraGame("era-karmic", {});
    openTurn(control);
    const controlHero = getMainHero(control, "p1")!;
    controlHero.level = 1;
    control.players.p1.hand = [];
    const controlField = guardField(control);
    controlHero.spaceId = controlField.spaceId;
    startNeutralEncounter(control, controlHero, controlField);
    expect(control.pendingChoice).toBeNull();
    expect(control.combat?.context.kind === "neutral" && control.combat.context.karmicEmpowered).toBeFalsy();
  });

  it("declining the Diplomacy skip ('Fight') is an ordinary guard fight — the karmic pick still opens", () => {
    const run = (modules: Partial<WogModOptions>): GameState => {
      const state = eraGame("era-karmic-diplomacy", modules);
      openTurn(state);
      const hero = getMainHero(state, "p1")!;
      hero.level = 3;
      state.players.p1.hand = ["ability.diplomacy"];
      state.players.p1.limits.expertUses = 1;
      state.players.p1.combatStats.expertUsesSpentThisRound = 0;
      const field = guardField(state);
      hero.spaceId = field.spaceId;
      startNeutralEncounter(state, hero, field);
      const choice = state.pendingChoice;
      expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("diplomacy-skip");
      return apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 1 });
    };
    const on = run({ karmicBattles: true });
    expect(on.pendingChoice?.type === "OPTION_CHOICE" && on.pendingChoice.context).toBe("karmic-battle");
    expect(on.combat).toBeNull();
    // CONTROL: module off — the Fight arm opens placement directly.
    const off = run({});
    expect(off.pendingChoice).toBeNull();
    expect(off.combat?.context.kind).toBe("neutral");
  });

  it("the Diplomacy skip that can no longer be paid (no crown left) falls back to the karmic pick too", () => {
    const run = (modules: Partial<WogModOptions>): GameState => {
      const state = eraGame("era-karmic-diplomacy-fallback", modules);
      openTurn(state);
      const hero = getMainHero(state, "p1")!;
      hero.level = 3;
      state.players.p1.hand = ["ability.diplomacy"];
      state.players.p1.limits.expertUses = 1;
      state.players.p1.combatStats.expertUsesSpentThisRound = 0;
      const field = guardField(state);
      hero.spaceId = field.spaceId;
      startNeutralEncounter(state, hero, field);
      const choice = state.pendingChoice!;
      state.players.p1.combatStats.expertUsesSpentThisRound = 1; // the crown is gone
      return apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    };
    const on = run({ karmicBattles: true });
    expect(on.pendingChoice?.type === "OPTION_CHOICE" && on.pendingChoice.context).toBe("karmic-battle");
    const off = run({});
    expect(off.pendingChoice).toBeNull();
    expect(off.combat?.context.kind).toBe("neutral");
  });

  it("declining the Balance-Pack Diplomacy ease window at an ordinary guard still opens the karmic pick", () => {
    const run = (modules: Partial<WogModOptions>): GameState => {
      const state = eraGame("era-karmic-ease", modules);
      state.adventure!.houseRules = { ...state.adventure!.houseRules, "polish-card-balance": true };
      openTurn(state);
      const hero = getMainHero(state, "p1")!;
      hero.level = 1;
      state.players.p1.hand = ["ability.diplomacy"];
      state.players.p1.limits.expertUses = 1;
      state.players.p1.combatStats.expertUsesSpentThisRound = 0;
      const field = guardField(state);
      hero.spaceId = field.spaceId;
      startNeutralEncounter(state, hero, field);
      const choice = state.pendingChoice;
      expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("diplomacy-battle-ease");
      return apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 1 });
    };
    const on = run({ karmicBattles: true });
    expect(on.pendingChoice?.type === "OPTION_CHOICE" && on.pendingChoice.context).toBe("karmic-battle");
    const off = run({});
    expect(off.pendingChoice).toBeNull();
    expect(off.combat?.context.kind).toBe("neutral");
  });
});

// ---------------------------------------------------------------------------
// Moving Raid Boss
// ---------------------------------------------------------------------------

describe("WoG era — moving Raid Boss", () => {
  function spawnedBoss(seed: string): GameState {
    const state = eraGame(seed, { wanderingBoss: true, wanderingBossSpawnRound: 4 });
    startRound(state, 3);
    expect(state.adventure!.wanderingBoss!.spaceId).toBeNull();
    startRound(state, 4);
    expect(state.adventure!.wanderingBoss!.spaceId).toBeTruthy();
    openTurn(state);
    return state;
  }

  function standNextToBoss(state: GameState): string {
    const bossSpace = state.adventure!.wanderingBoss!.spaceId!;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = bossSpace;
    hero.movementPoints = 3;
    return hero.id;
  }

  it("CONTROL: module off — no boss ever arrives", () => {
    const state = eraGame("era-boss-off", {});
    startRound(state, 5);
    startRound(state, 6);
    expect(state.adventure!.wanderingBoss).toBeUndefined();
  });

  it("arrives on its spawn round, then regenerates 25% (rounded up) and hunts the richest seat each round", () => {
    const state = spawnedBoss("era-boss-move");
    const boss = state.adventure!.wanderingBoss!;
    expect(boss.maxHealth).toBe(wanderingBossDefinition(boss.defId).health);
    boss.damage = 10;
    state.players.p2.resources.gold = 99;
    state.players.p1.resources.gold = 0;
    startRound(state, 5);
    expect(boss.damage).toBe(10 - Math.ceil(boss.maxHealth * 0.25));
    expect(boss.targetPlayerId).toBe("p2");
  });

  it("ATTACK_WANDERING_BOSS costs 1 movement, fights on the hero's field, and wounds persist after a retreat", () => {
    const state = spawnedBoss("era-boss-retreat");
    const heroId = standNextToBoss(state);
    expect(offers(state, "ATTACK_WANDERING_BOSS")).toHaveLength(1);
    const fought = apply(state, { type: "ATTACK_WANDERING_BOSS", playerId: "p1", heroId });
    expect(fought.heroes[heroId]!.movementPoints).toBe(2);
    expect(fought.combat?.context.kind === "neutral" && fought.combat.context.wanderingBoss).toBe(true);
    // A second fight cannot open while this one is live.
    expect(offers(fought, "ATTACK_WANDERING_BOSS")).toEqual([]);

    const boss = fought.adventure!.wanderingBoss!;
    const unit = mintWanderingBossUnit(fought, DEFENDER_BACKLINE[1]!)!;
    unit.damage = 6;
    fought.combat!.units[unit.id] = unit;
    const heroSpace = fought.heroes[heroId]!.spaceId;
    fought.combat!.outcome = { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "retreat" };
    finalizeAdventureCombat(fought);
    expect(boss.damage).toBe(6);
    expect(boss.damageBy.p1).toBe(6);
    expect(boss.engagedBy).toBeUndefined();
    expect(fought.heroes[heroId]!.spaceId).toBe(heroSpace);
    expect(boss.slainBy).toBeUndefined();
  });

  it("the kill claims a relic search for the killer and pays chip damage to the other seats", () => {
    const state = spawnedBoss("era-boss-kill");
    const boss = state.adventure!.wanderingBoss!;
    boss.damage = 4;
    boss.damageBy = { p2: 4 };
    const heroId = standNextToBoss(state);
    const fought = apply(state, { type: "ATTACK_WANDERING_BOSS", playerId: "p1", heroId });
    const liveBoss = fought.adventure!.wanderingBoss!;
    const unit = mintWanderingBossUnit(fought, DEFENDER_BACKLINE[1]!)!;
    expect(unit.damage).toBe(4); // wounds carried in
    unit.damage = unit.maxHealth;
    fought.combat!.units[unit.id] = unit;
    const p2Gold = fought.players.p2.resources.gold;
    fought.combat!.outcome = { winnerPlayerId: "p1", defeatedPlayerId: NEUTRAL_PLAYER_ID, reason: "all-enemy-units-defeated" };
    finalizeAdventureCombat(fought);
    pumpAdventureQueues(fought);
    expect(liveBoss.slainBy).toBe("p1");
    expect(liveBoss.spaceId).toBeNull();
    expect(fought.players.p2.resources.gold).toBeGreaterThan(p2Gold);
    const search = fought.adventure!.pendingVisit?.steps.some((step) => step.type === "SEARCH_SHARED_DECK") ||
      fought.adventure!.rewardQueue.some((reward) => reward.kind === "shared-deck-search") ||
      fought.pendingChoice !== null;
    expect(search).toBe(true);
    expect(wanderingBossUnitId(liveBoss.defId)).toBe(unit.id);
  });

  it("raised (summoned, temporary) neutral bodies never recycle into the Neutral deck", () => {
    const state = spawnedBoss("era-boss-zombies");
    const heroId = standNextToBoss(state);
    const fought = apply(state, { type: "ATTACK_WANDERING_BOSS", playerId: "p1", heroId });
    const unit = mintWanderingBossUnit(fought, DEFENDER_BACKLINE[1]!)!;
    fought.combat!.units[unit.id] = unit;
    const zombie = {
      ...unit,
      id: "doomsummon_test",
      unitDefId: "neutral.zombies",
      grade: "bronze" as const,
      bankGuard: false,
      bankUnit: false,
      bossUnit: false,
      summoned: true,
      temporary: true
    };
    const drawn = { ...zombie, id: "neutral_1_zombies", summoned: false, temporary: false };
    fought.combat!.units[zombie.id] = zombie;
    fought.combat!.units[drawn.id] = drawn;
    const discard = fought.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile;
    const before = discard.filter((id) => id === "neutral.zombies").length;
    fought.combat!.outcome = { winnerPlayerId: NEUTRAL_PLAYER_ID, defeatedPlayerId: "p1", reason: "retreat" };
    finalizeAdventureCombat(fought);
    // The drawn card (CONTROL) recycles; the raised body does not.
    expect(fought.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile.filter((id) => id === "neutral.zombies").length).toBe(before + 1);
  });

  it("an adjacent hero may attack; a hero two fields away may not", () => {
    const state = spawnedBoss("era-boss-adjacent");
    const bossSpace = state.adventure!.wanderingBoss!.spaceId!;
    const hero = getMainHero(state, "p1")!;
    hero.movementPoints = 3;
    const adjacent = getAdjacentSpaceIds(bossSpace).filter((spaceId) => state.adventure!.fields[spaceId]);
    const far = Object.keys(state.adventure!.fields).find(
      (spaceId) => spaceId !== bossSpace && !adjacent.includes(spaceId)
    )!;
    hero.spaceId = far;
    expect(offers(state, "ATTACK_WANDERING_BOSS")).toEqual([]);
    hero.spaceId = bossSpace;
    expect(offers(state, "ATTACK_WANDERING_BOSS")).toHaveLength(1);
    hero.movementPoints = 0;
    expect(offers(state, "ATTACK_WANDERING_BOSS")).toEqual([]);
  });

  it("a hero whose movement is halted this turn (sea step) cannot start the fight — offer and reducer agree", () => {
    const state = spawnedBoss("era-boss-halted");
    const heroId = standNextToBoss(state);
    state.heroes[heroId]!.movementHaltedThisTurn = true;
    expect(offers(state, "ATTACK_WANDERING_BOSS")).toEqual([]);
    expect(applyAction(state, { type: "ATTACK_WANDERING_BOSS", playerId: "p1", heroId }).errors.length).toBeGreaterThan(0);
    // CONTROL: the same hero, not halted.
    state.heroes[heroId]!.movementHaltedThisTurn = false;
    expect(offers(state, "ATTACK_WANDERING_BOSS")).toHaveLength(1);
  });

  it("parallel PvP keep: a chip-damage seat busy elsewhere is paid at the next round start, never inside the kill", () => {
    const kill = (p2Busy: boolean): GameState => {
      const state = spawnedBoss(`era-boss-keep-${p2Busy}`);
      state.turn.mode = "parallel";
      state.turn.pvpKeepsParallel = true;
      if (p2Busy) {
        state.adventure!.parallelEventOpenPlayers = ["p2"];
      }
      const boss = state.adventure!.wanderingBoss!;
      boss.damage = boss.maxHealth;
      boss.damageBy = { p1: boss.maxHealth - 5, p2: 5 };
      resolveWanderingBossVictory(state, "p1");
      return state;
    };
    const shareOf = (state: GameState) =>
      Math.max(1, Math.floor((15 * 5) / state.adventure!.wanderingBoss!.maxHealth));
    // CONTROL: p2 free — paid at once, nothing banked.
    const freeBefore = spawnedBoss("era-boss-keep-false").players.p2.resources.gold;
    const free = kill(false);
    expect(free.adventure!.wanderingBoss!.pendingShares).toBeUndefined();
    expect(free.players.p2.resources.gold).toBe(freeBefore + shareOf(free));
    // p2 busy — nothing changes for p2 inside the killing action …
    const busyBefore = spawnedBoss("era-boss-keep-true").players.p2.resources.gold;
    const busy = kill(true);
    const share = shareOf(busy);
    const gold = busy.players.p2.resources.gold;
    expect(gold).toBe(busyBefore);
    expect(busy.adventure!.wanderingBoss!.pendingShares).toEqual({ p2: share });
    // … and the banked share lands at the next round start.
    delete busy.adventure!.parallelEventOpenPlayers;
    applyEraRoundStart(busy);
    expect(busy.players.p2.resources.gold).toBe(gold + share);
    expect(busy.adventure!.wanderingBoss!.pendingShares).toBeUndefined();
  });
});
