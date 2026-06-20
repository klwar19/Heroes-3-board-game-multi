import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  NEUTRAL_PLAYER_ID
} from "./index";
import { getOffTurnCombatReactions } from "./legal-actions";
import { ATTACK_DIE_FACES } from "./battlefield";
import { adventureCards } from "@/data/cards/adventure";
import type { CombatUnitState, GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * "Any time during Combat" instants. The listed instant damage specialties
 * (Gerwulf's Ballista discard, Adelaide's Frost Ring, Deemer's Meteor Shower)
 * and the First Aid Tent are playable not only on the owner's own turn but also
 * OFF-TURN — while an enemy unit is active (its turn starting, mid-move, or just
 * finished). The engine offers them to the off-turn player through the off-turn
 * combat action pass (and getOffTurnCombatReactions, which every neutral /
 * Intelligence reaction pause uses).
 *
 * A card's own-turn-only sides (Gerwulf IV's free 1 damage, Gerwulf VI's ongoing
 * "aim the Ballista") are NOT offered off-turn — only the `combatAnytime` sides.
 *
 * Every rule here is engine-enforced: each test fails if the matching logic is
 * removed (the off-turn offer disappears, the flag is dropped, or the play stops
 * resolving). Board: getOrthogonalNeighbors(9) = {5, 8, 10, 13}.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function damage(state: GameState, unitId: UnitId): number {
  return state.combat!.units[unitId].damage;
}

/**
 * Sandbox combat where it is p2's turn — a p2 unit is active — so p1 is the
 * off-turn reactor. Units are placed for the area instants; pass overrides to
 * tweak hands / state.
 */
function p2TurnState(p1Hand: string[]): GameState {
  const state = createInitialGameState("enemy-instant-seed");
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [];
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  for (const [id, position] of [
    ["unit_p2_skeletons", 9],
    ["unit_p2_vampires", 10],
    ["unit_p2_dread_knights", 13],
    ["unit_p1_griffins", 0],
    ["unit_p1_marksmen", 1],
    ["unit_p1_crusaders", 2]
  ] as const) {
    const unit = state.combat!.units[id];
    unit.position = position;
    unit.damage = 0;
    unit.maxHealth = 20;
    unit.abilities = [];
    unit.activatedThisRound = false;
  }
  return state;
}

function findPlay(state: GameState, playerId: "p1" | "p2", cardId: string, optionIndex?: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex)
  );
}

/**
 * Opens a one-guard NEUTRAL fight (the default map's guarded mine at 9,1), with
 * the player's unit frozen to act first so the guard's activation — and the
 * pre-activation reaction pause it triggers — comes up next. Mirrors the setup
 * in neutral-reaction-pause.test.ts. Neutral combat already pauses before each
 * guard; this test only checks the listed instants are offered THERE.
 */
function neutralFightBeforeGuard(): GameState {
  let state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  const armyUnit = state.players.p1.army[0];
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
      unit.initiative = 99;
    }
  }
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.controllerId === NEUTRAL_PLAYER_ID) {
      unit.initiative = 1;
    }
  }
  // p1's unit defends; the guard is up next and the engine pauses for p1.
  const active = state.combat!.units[state.combat!.activeUnitId!];
  return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
}

// ===========================================================================
// Card definitions — the truth about which sides are "any time" (CLAUDE.md #2)
// ===========================================================================

describe("instant-specialty card flags", () => {
  it("flags exactly the instant sides as combatAnytime (and NOT the turn-only ones)", () => {
    const optionFlags = (cardId: string) => {
      const card = adventureCards[cardId];
      expect(card.effect.type).toBe("CHOOSE_ONE");
      if (card.effect.type !== "CHOOSE_ONE") {
        return [];
      }
      return card.effect.options.map((option) => Boolean(option.combatAnytime));
    };
    // Gerwulf IV: [free 1 dmg (turn-only), discard-Ballista 2 dmg (instant)].
    expect(optionFlags("specialty.gerwulf.4")).toEqual([false, true]);
    // Gerwulf VI: [ongoing aim (turn-only), discard-Ballista 3 dmg (instant)].
    expect(optionFlags("specialty.gerwulf.6")).toEqual([false, true]);
    // Adelaide I / VI: the single Frost Ring side is an instant.
    expect(optionFlags("specialty.adelaide.1")).toEqual([true]);
    expect(optionFlags("specialty.adelaide.6")).toEqual([true]);
    // Deemer I / VI: all three Power tiers are instants.
    expect(optionFlags("specialty.deemer.1")).toEqual([true, true, true]);
    expect(optionFlags("specialty.deemer.6")).toEqual([true, true, true]);
  });
});

// ===========================================================================
// Deemer — Meteor Shower off-turn
// ===========================================================================

describe("Deemer's Meteor Shower — playable during the enemy's turn", () => {
  it("is offered to the off-turn player and resolves its damage", () => {
    const state = p2TurnState(["specialty.deemer.6"]);
    const meteor = findPlay(state, "p1", "specialty.deemer.6", 0);
    expect(meteor, "Meteor Shower should be offered off-turn").toBeTruthy();
    // Target the active enemy unit; centre + an adjacent unit each take 1.
    const action = { ...meteor!.action } as Extract<GameAction, { type: "PLAY_CARD" }>;
    action.target = { type: "unit", unitId: "unit_p2_skeletons" };
    const resolved = applyOk(state, action);
    expect(damage(resolved, "unit_p2_skeletons")).toBe(1);
    expect(damage(resolved, "unit_p2_vampires")).toBe(1);
  });

  it("stays offered after the enemy unit has already moved (truly any-time)", () => {
    const state = p2TurnState(["specialty.deemer.1"]);
    // The active enemy unit has spent its move this activation.
    state.combat!.units.unit_p2_skeletons.movedThisActivation = true;
    expect(findPlay(state, "p1", "specialty.deemer.1"), "still offered mid/after the enemy move").toBeTruthy();
  });
});

// ===========================================================================
// Adelaide — Frost Ring off-turn
// ===========================================================================

describe("Adelaide's Frost Ring — playable during the enemy's turn", () => {
  it("is offered off-turn and rings the chosen space (adjacent units, not the centre)", () => {
    const state = p2TurnState(["specialty.adelaide.6", "stat.attack", "stat.defense"]);
    const ring = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "specialty.adelaide.6" &&
        legal.action.target?.type === "space" &&
        legal.action.target.position === 9
    );
    expect(ring, "Frost Ring should be offered off-turn on a space").toBeTruthy();
    const action = { ...ring!.action, costCardIds: ["stat.attack", "stat.defense"] } as Extract<
      GameAction,
      { type: "PLAY_CARD" }
    >;
    const resolved = applyOk(state, action);
    // Ring of 9 = {5,8,10,13}: vampires(10) + dread_knights(13) take 2; centre spared.
    expect(damage(resolved, "unit_p2_skeletons")).toBe(0);
    expect(damage(resolved, "unit_p2_vampires")).toBe(2);
    expect(damage(resolved, "unit_p2_dread_knights")).toBe(2);
  });
});

// ===========================================================================
// Gerwulf — Ballista discard off-turn (and the turn-only sides excluded)
// ===========================================================================

describe("Gerwulf's Ballista — discard side is an off-turn instant; the others are not", () => {
  it("offers the discard-Ballista damage off-turn but NOT the free 1 damage (IV)", () => {
    const state = p2TurnState(["specialty.gerwulf.4"]);
    state.players.p1.permanents = ["war_machine.ballista"]; // a Ballista is in play to discard
    // The turn-only "1 damage" side (option 0) is not offered off-turn…
    expect(findPlay(state, "p1", "specialty.gerwulf.4", 0)).toBeFalsy();
    // …but the instant "discard the Ballista for 2 damage" side (option 1) is.
    const discard = findPlay(state, "p1", "specialty.gerwulf.4", 1);
    expect(discard, "the discard-Ballista instant should be offered off-turn").toBeTruthy();
    const action = { ...discard!.action } as Extract<GameAction, { type: "PLAY_CARD" }>;
    action.target = { type: "unit", unitId: "unit_p2_skeletons" };
    const resolved = applyOk(state, action);
    expect(damage(resolved, "unit_p2_skeletons")).toBe(2);
    // The Ballista was discarded (no longer in play).
    expect(resolved.players.p1.permanents ?? []).not.toContain("war_machine.ballista");
  });

  it("does not offer the discard side off-turn without a Ballista in play", () => {
    const state = p2TurnState(["specialty.gerwulf.4"]);
    expect(findPlay(state, "p1", "specialty.gerwulf.4", 1)).toBeFalsy();
  });

  it("offers the discard side (VI) off-turn but NOT the ongoing 'aim' side", () => {
    const state = p2TurnState(["specialty.gerwulf.6"]);
    state.players.p1.permanents = ["war_machine.ballista"];
    expect(findPlay(state, "p1", "specialty.gerwulf.6", 0), "ongoing aim is turn-only").toBeFalsy();
    expect(findPlay(state, "p1", "specialty.gerwulf.6", 1), "discard 3 damage is an instant").toBeTruthy();
  });
});

// ===========================================================================
// First Aid Tent — heal off-turn (behaves the same as the instants)
// ===========================================================================

describe("First Aid Tent — heal playable during the enemy's turn", () => {
  it("offers the Tent heal to the off-turn player on a wounded friendly unit", () => {
    let state = createInitialGameState("first-aid-offturn-seed");
    state.players.p1.hand = ["war_machine.first_aid_tent"];
    state.players.p2.hand = [];
    // Put the Tent into play on p1's own turn.
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    // Now it is p2's turn; p1 is off-turn with a wounded friendly unit.
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p1_crusaders.maxHealth = 6;
    state.combat!.units.unit_p1_crusaders.damage = 3;

    const heal = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "USE_ACTIVE_EFFECT" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_crusaders"
    );
    expect(heal, "the First Aid Tent heal should be offered off-turn").toBeTruthy();
    const resolved = applyOk(state, heal!.action);
    expect(damage(resolved, "unit_p1_crusaders")).toBe(2);
  });
});

// ===========================================================================
// Interaction with Intelligence and with the reaction pauses
// ===========================================================================

describe("interaction with Intelligence and reaction pauses", () => {
  it("an instant specialty is offered off-turn WITHOUT Intelligence, while an off-turn spell still needs it", () => {
    const state = p2TurnState(["specialty.deemer.1", "spell.magic_arrow"]);
    // No Intelligence: the specialty is a true instant and is offered…
    expect(findPlay(state, "p1", "specialty.deemer.1"), "specialty offered off-turn without Intelligence").toBeTruthy();
    // …but casting a spell off-turn is not (that is exactly what Intelligence unlocks).
    const offTurnCast = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(offTurnCast, "spell casting off-turn stays gated behind Intelligence").toBe(false);
  });

  it("getOffTurnCombatReactions surfaces the instant specialty (so every reaction pause offers it)", () => {
    const state = p2TurnState(["specialty.deemer.6"]);
    const offered = getOffTurnCombatReactions(state, "p1").some(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.6"
    );
    expect(offered).toBe(true);
  });

  it("is offered in a Neutral combat's existing guard pause (Neutral kept as-is — no new pauses)", () => {
    const state = neutralFightBeforeGuard();
    // Neutral combat already pauses before each guard acts; we add nothing here.
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    expect(state.combat!.pendingNeutralStep?.reactingPlayerId).toBe("p1");
    // With a Meteor Shower in hand and NO Intelligence, it is offered in that pause.
    state.players.p1.hand = ["specialty.deemer.6"];
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.6"
    );
    expect(offered, "the instant specialty should be playable in the neutral guard pause").toBe(true);
  });

  it("is offered off-turn in a real adventure-mode player-vs-player combat (not only the sandbox)", () => {
    const state = createAdventureGameState({
      seed: "adv-instant",
      difficulty: "normal",
      rollFirstPlayer: false,
      victoryMode: "conquest",
      pvpTroopLoss: "normal",
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
      ]
    });
    expect(state.mode).toBe("adventure");
    const p1Hero = getMainHero(state, "p1")!;
    const p2Hero = getMainHero(state, "p2")!;
    state.players.p1.hand = ["specialty.deemer.6"];
    state.phase = "combat";
    state.activePlayerId = "p2"; // p2's unit is active → p1 is off-turn
    const combatUnit = (id: string, controllerId: PlayerId, position: number): CombatUnitState =>
      ({
        id,
        name: "Pikemen",
        cardName: "Few Pikemen",
        variant: "few",
        grade: "bronze",
        type: "ground",
        controllerId,
        attack: 1,
        defense: 1,
        maxHealth: 20,
        damage: 0,
        initiative: 1,
        position,
        activatedThisRound: false,
        movedThisActivation: false,
        retaliatedThisRound: false,
        defenseToken: false,
        abilities: [],
        unitDefId: "castle.pikemen",
        assets: { cardImage: "", imageAlt: "" }
      }) as CombatUnitState;
    state.combat = {
      id: "c1",
      round: 1,
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      activeUnitId: "u_p2",
      context: { kind: "player", attackerHeroId: p1Hero.id, defenderHeroId: p2Hero.id, fieldId: "0,0" },
      setup: null,
      awaitingContinue: false,
      outcome: null,
      dice: { faces: [...ATTACK_DIE_FACES], seed: "adv-instant-die", rollCount: 0 },
      units: {
        u_p1: combatUnit("u_p1", "p1", 0),
        u_p2: combatUnit("u_p2", "p2", 9),
        u_p2b: combatUnit("u_p2b", "p2", 10)
      }
    };
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.6"
    );
    expect(offered, "adventure off-turn player should be offered the instant specialty").toBe(true);
  });

  it("does not double-list the specialty on the holder's own turn (off-turn pass self-gates)", () => {
    // On p1's own turn the normal turn pass already offers every Meteor Shower
    // tier/target; the off-turn instant pass must self-gate so nothing is listed
    // twice. Verify the on-turn offers are all distinct (no duplicated entry).
    const state = createInitialGameState("on-turn-seed");
    state.players.p1.hand = ["specialty.deemer.6"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.activatedThisRound = false;
    const offers = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.deemer.6"
    );
    expect(offers.length).toBeGreaterThan(0);
    const keys = offers.map((legal) => {
      const action = legal.action as Extract<GameAction, { type: "PLAY_CARD" }>;
      return `${action.optionIndex}:${JSON.stringify(action.target)}`;
    });
    expect(new Set(keys).size, "no Meteor Shower offer should be listed twice on-turn").toBe(keys.length);
  });
});
