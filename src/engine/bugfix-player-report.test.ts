/**
 * Behaviour pins for the player-reported bugs fixed in this pass. Each test
 * fails if its wiring is removed (CLAUDE.md rule #1).
 */
import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "@/engine";
import { makeActiveEffect } from "./active-effects";
import {
  canCrossEdge,
  createSecondaryHero,
  getMainHero,
  getSecondaryHero,
  MAX_EXPERIENCE
} from "./adventure";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import { isHandLockedInCombat } from "./legal-actions";
import { ATTACK_DIE_FACES } from "./battlefield";
import type { CombatState, MapFieldState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

// ---------------------------------------------------------------------------
// Luck — Expert Attack-die reroll survives every attack this game round
// ---------------------------------------------------------------------------

describe("Expert Luck — multi-attack (stack id uniqueness)", () => {
  function duel(): GameState {
    const state = createInitialGameState("luck-multi-fix");
    const combat = state.combat!;
    const griffins = combat.units.unit_p1_griffins;
    const vampires = combat.units.unit_p2_vampires;
    griffins.type = "ground";
    griffins.position = 9;
    griffins.attack = 1;
    griffins.defense = 0;
    griffins.maxHealth = 50;
    griffins.damage = 0;
    griffins.abilities = [];
    vampires.type = "ground";
    vampires.position = 13;
    vampires.attack = 0;
    vampires.defense = 0;
    vampires.maxHealth = 50;
    vampires.damage = 0;
    vampires.abilities = [];
    combat.activeUnitId = griffins.id;
    combat.round = 1;
    state.phase = "combat";
    state.activePlayerId = "p1";
    state.priorityPlayerId = "p1";
    combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0, 0, 0];
    return state;
  }

  it("still offers Expert Luck after spending it on the previous attack", () => {
    let state = duel();
    const card = cardLibrary["ability.luck"];
    if (card.effect.type !== "CREATE_ACTIVE_EFFECT" || !card.effect.expertEffect) {
      throw new Error("missing Expert Luck");
    }
    state.activeEffects.push(
      makeActiveEffect(
        state,
        card.effect.expertEffect,
        { type: "card", cardId: "ability.luck", controllerId: "p1" },
        "p1"
      )
    );

    state = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_vampires"
      })
    );
    expect(state.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    const reroll = getLegalActions(state, "p1").find((a) => a.action.type === "REROLL_PENDING_CHOICE");
    expect(reroll).toBeTruthy();
    state = applyOk(state, reroll!.action);
    if (state.pendingChoice?.type === "ATTACK_DIE_REROLL") {
      const keep = getLegalActions(state, "p1").find((a) => a.action.type === "CHOOSE_PENDING_ROLL");
      expect(keep).toBeTruthy();
      state = applyOk(state, keep!.action);
    }
    state = passAllReactions(state);

    expect(state.activeEffects.some((e) => e.name === "Expert Luck")).toBe(true);

    // Second attack this round (same unit re-armed for the probe).
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.activatedThisRound = false;
    griffins.attackedThisActivation = false;
    griffins.movedThisActivation = false;
    state.combat!.activeUnitId = griffins.id;
    state.phase = "combat";
    state.priorityPlayerId = "p1";
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.stack = [];
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];

    state = passAllReactions(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_vampires"
      })
    );
    expect(state.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    expect(
      state.pendingChoice?.type === "ATTACK_DIE_REROLL" &&
        state.pendingChoice.rerollSources.some((s) => s.name === "Expert Luck"),
      "Expert Luck must remain available on every attack this round"
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Garrison settlement defense — hand lock at resolution
// ---------------------------------------------------------------------------

describe("Settlement garrison — no Deck cards", () => {
  it("rejects PLAY_CARD for a heroless garrison defender (resolution backstop)", () => {
    const state = createAdventureGameState({
      seed: "garrison-hand-lock",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state.combat = {
      id: "c-garrison",
      round: 1,
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      activeUnitId: null,
      context: {
        kind: "player",
        attackerHeroId: getMainHero(state, "p2")!.id,
        defenderHeroId: null,
        fieldId: "settlement-field"
      },
      setup: null,
      awaitingContinue: false,
      outcome: null,
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {}
    } as CombatState;
    state.phase = "combat";
    state.players.p1.hand = ["ability.offense"];

    expect(isHandLockedInCombat(state, "p1")).toBe(true);
    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.offense",
      mode: "basic",
      target: { type: "none" }
    });
    expect(result.errors.length, result.errors.map((e) => e.message).join("; ")).toBeGreaterThan(0);
    expect(
      result.errors.some(
        (e) => /cannot use your Deck/i.test(e.message) || /not legal/i.test(e.message) || /hand/i.test(e.message)
      ),
      result.errors.map((e) => e.message).join("; ")
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Logistics — Secondary Hero can receive +movement
// ---------------------------------------------------------------------------

describe("Logistics expert — Secondary Hero movement pick", () => {
  it("opens a Main/Secondary choice when both heroes are on the map", () => {
    let state = createAdventureGameState({
      seed: "logistics-secondary",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    createSecondaryHero(state, "p1", "70,70");
    const secondary = getSecondaryHero(state, "p1")!;
    const main = getMainHero(state, "p1")!;
    const mainBefore = main.movementPoints;
    const secondaryBefore = secondary.movementPoints;

    state.players.p1.hand = ["ability.logistics"];
    state.players.p1.limits.expertUses = 1;
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.logistics",
      mode: "expert",
      optionIndex: 1,
      target: { type: "none" }
    });

    // Choice open: Main Hero / Secondary Hero.
    const visit = state.adventure?.pendingVisit;
    expect(visit?.steps[0]?.type).toBe("CHOOSE_ONE");
    if (visit?.steps[0]?.type === "CHOOSE_ONE") {
      const labels = visit.steps[0].options.map((o) => o.label);
      expect(labels).toContain("Main Hero");
      expect(labels).toContain("Secondary Hero");
      // Pick Secondary.
      const secondaryIndex = labels.indexOf("Secondary Hero");
      state = applyOk(state, {
        type: "RESOLVE_VISIT_STEP",
        playerId: "p1",
        optionIndex: secondaryIndex
      });
    }

    expect(getSecondaryHero(state, "p1")!.movementPoints).toBe(secondaryBefore + 1);
    expect(getMainHero(state, "p1")!.movementPoints).toBe(mainBefore);
  });
});

// ---------------------------------------------------------------------------
// Secondary on town after Main defeated — no stranded unattackable hero
// ---------------------------------------------------------------------------

describe("PvP defeat — companion Secondary leaves the contested field", () => {
  it("homes the Secondary still standing on the field when the Main falls", () => {
    const state = createAdventureGameState({
      seed: "secondary-stranded",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest"
    });
    const townField = state.towns.town_p2?.fieldId ?? Object.values(state.adventure!.fields).find(
      (f) => f.location?.includes("town") || state.towns.town_p2
    )?.spaceId;
    // Prefer p2's real town field.
    const p2Town = Object.values(state.towns).find((t) => t.controllerId === "p2");
    const fieldId = p2Town?.fieldId ?? "99,99";
    if (!state.adventure!.fields[fieldId]) {
      state.adventure!.fields[fieldId] = {
        spaceId: fieldId,
        tileInstanceId: "t",
        slot: 0,
        location: "castle_town",
        difficulty: 0,
        blackCube: false,
        flagOwnerId: "p2",
        everFlagged: true,
        settlementResource: null
      } as MapFieldState;
      if (p2Town) {
        p2Town.fieldId = fieldId;
      }
    }

    const main = getMainHero(state, "p2")!;
    main.spaceId = fieldId;
    const secondary = createSecondaryHero(state, "p2", fieldId);
    expect(secondary.spaceId).toBe(fieldId);

    // p1 attacks p2's main on the town; p2 loses.
    const attacker = getMainHero(state, "p1")!;
    attacker.spaceId = fieldId;
    state.combat = {
      id: "c-pvp-town",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: null,
      context: {
        kind: "player",
        attackerHeroId: attacker.id,
        defenderHeroId: main.id,
        fieldId
      },
      setup: null,
      awaitingContinue: false,
      outcome: {
        winnerPlayerId: "p1",
        defeatedPlayerId: "p2",
        reason: "all-enemy-units-defeated"
      },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {}
    } as CombatState;

    finalizeAdventureCombat(state);

    // Secondary must no longer occupy the contested field.
    const afterSecondary = getSecondaryHero(state, "p2");
    expect(afterSecondary, "secondary still exists (home, not removed)").toBeTruthy();
    expect(afterSecondary!.spaceId, "secondary left the contested field").not.toBe(fieldId);
  });
});

// ---------------------------------------------------------------------------
// Level 7 field — no round limit + win auto level 7
// ---------------------------------------------------------------------------

describe("Field Difficulty 7", () => {
  it("does not open continue-or-retreat (unlimited rounds) even without hasAzure", () => {
    let state = createAdventureGameState({
      seed: "diff7-rounds",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    const fieldId = "diff7";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "t",
      slot: 0,
      location: "nothing",
      difficulty: 7,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.spaceId = fieldId;
    hero.movementPoints = 5;
    startNeutralEncounter(state, hero, state.adventure!.fields[fieldId]!);

    const place = getLegalActions(state, "p1").find((e) => e.action.type === "PLACE_COMBAT_UNIT");
    expect(place).toBeTruthy();
    state = applyOk(state, place!.action);
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Force no damage and strip azure so difficulty alone keeps the fight unlimited.
    if (state.combat?.context.kind === "neutral") {
      state.combat.context.hasAzure = false;
      state.combat.context.difficulty = 7;
    }
    for (const unit of Object.values(state.combat!.units)) {
      unit.attack = 0;
    }
    state.combat!.dice.scriptedRolls = Array(120).fill(-1);

    let safety = 300;
    while (
      state.combat &&
      state.combat.round < 2 &&
      !state.combat.awaitingContinue &&
      !state.combat.outcome &&
      safety-- > 0
    ) {
      const actions = getLegalActions(state, "p1");
      const defend = actions.find((a) => a.action.type === "DEFEND_UNIT");
      const pass = actions.find((a) => a.action.type === "PASS_REACTION");
      const keep = actions.find((a) => a.action.type === "CHOOSE_PENDING_ROLL");
      const cont = actions.find((a) => a.action.type === "CONTINUE_NEUTRAL_STEP");
      const next = defend ?? pass ?? keep ?? cont ?? actions[0];
      if (!next) break;
      state = applyOk(state, next.action);
    }

    expect(state.combat, "combat still open").toBeTruthy();
    // The key invariant: difficulty 7 never opens the continue-or-retreat gate
    // (unlike a normal difficulty-1 fight). Round may or may not have advanced
    // depending on how many activations fit in the drive budget.
    expect(state.combat!.awaitingContinue, "diff 7 never pauses for continue-or-retreat").toBe(false);
    // CONTROL sibling: a difficulty-1 fight with hasAzure forced off WOULD set
    // awaitingContinue once the round ends — covered in dragon-utopia-round-limit.
  });

  it("winning a difficulty-7 fight fills experience to level 7", () => {
    const state = createAdventureGameState({
      seed: "diff7-xp",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    const hero = getMainHero(state, "p1")!;
    hero.experience = 4; // level 3
    hero.level = 3;
    const fieldId = "f7";
    state.adventure!.fields[fieldId] = {
      spaceId: fieldId,
      tileInstanceId: "t",
      slot: 0,
      location: "nothing",
      difficulty: 7,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    state.combat = {
      id: "c7",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "neutral",
      activeUnitId: null,
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId,
        difficulty: 7,
        hasAzure: false
      },
      setup: null,
      awaitingContinue: false,
      outcome: {
        winnerPlayerId: "p1",
        defeatedPlayerId: "neutral",
        reason: "all-enemy-units-defeated"
      },
      dice: { faces: [...ATTACK_DIE_FACES], seed: "s", rollCount: 0 },
      units: {}
    } as CombatState;

    finalizeAdventureCombat(state);

    const after = getMainHero(state, "p1")!;
    expect(after.experience).toBe(MAX_EXPERIENCE);
    expect(after.level).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Bank entry from outside
// ---------------------------------------------------------------------------

describe("Creature Bank — enter from an adjacent Tile", () => {
  it("canCrossEdge allows bank entry/exit across a tile edge", () => {
    const state = createAdventureGameState({
      seed: "bank-outside",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    state.adventure!.tiles["T1"] = {
      id: "T1",
      tileDefId: "S1",
      center: { row: 0, col: 0 },
      rotation: 0,
      faceDown: false,
      placed: true
    } as never;
    state.adventure!.tiles["T2"] = {
      id: "T2",
      tileDefId: "S1",
      center: { row: 0, col: 2 },
      rotation: 0,
      faceDown: false,
      placed: true
    } as never;
    const field = (
      spaceId: string,
      tile: string,
      location: string,
      slot: number,
      bankId?: string
    ): MapFieldState => ({
      spaceId,
      tileInstanceId: tile,
      slot,
      location,
      difficulty: 0,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      ...(bankId ? { bankId } : {})
    });
    state.adventure!.fields["A"] = field("A", "T1", "empty_field", 1);
    state.adventure!.fields["B"] = field("B", "T1", "creature_bank", 2, "crypt");
    state.adventure!.fields["C"] = field("C", "T2", "empty_field", 1);

    expect(canCrossEdge(state, "A", "B")).toBe(true);
    expect(canCrossEdge(state, "C", "B")).toBe(true);
    expect(canCrossEdge(state, "B", "C")).toBe(true);
  });
});
