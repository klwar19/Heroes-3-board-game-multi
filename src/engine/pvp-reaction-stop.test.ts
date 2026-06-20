import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Player-vs-player "real stop" reaction window.
 *
 * Before an enemy unit acts, the engine now PAUSES the fight for the off-turn
 * player whenever they hold any off-turn reaction — an instant ability/specialty
 * (Gerwulf / Adelaide / Deemer), a usable active effect (First Aid Tent), a
 * trigger-free instant spell, or an Intelligence-enabled cast. The active player
 * cannot proceed until the off-turn player plays their reaction(s) and clicks
 * "Let the unit act". No Intelligence is required for the instants.
 *
 * The single gate is reactionPauseReactor's PvP branch keying off
 * getOffTurnCombatReactions(...).length > 0, so this is the same window for every
 * current AND future off-turn reaction. Each test drives a real adventure PvP
 * combat through the engine pump (not a hand-built getLegalActions snapshot) and
 * fails if the pause logic is removed.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

const ACTOR_P1 = "unit_p1_griffins"; // p1's only un-acted unit: acts first
const ENEMY_P2 = "unit_p2_skeletons"; // p2's only un-acted unit: comes up next

/**
 * A round-1 adventure PvP combat trimmed to two live actors — a p1 unit (active,
 * acts first) and a p2 unit (next in initiative). Every other unit is marked
 * already activated, so once the p1 unit ends its turn the pump advances straight
 * to the p2 unit, where reactionPauseReactor decides whether to pause for the
 * now-off-turn p1. Returned BEFORE p1 acts; tests stage p1 then call defendAndPump.
 */
function pvpStage(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  state.combat = createInitialGameState(seed).combat;
  const combat = state.combat!;
  combat.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: "hero_p2",
    fieldId: state.heroes.hero_p1.spaceId ?? "0,0"
  };
  combat.setup = null;
  combat.round = 1;
  state.phase = "combat";
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  for (const unit of Object.values(combat.units)) {
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.attacksThisActivation = 0;
    unit.retaliatedThisRound = false;
    unit.reactionPauseAcked = false;
    // Only the two chosen units still have to act this round.
    unit.activatedThisRound = unit.id !== ACTOR_P1 && unit.id !== ENEMY_P2;
  }
  combat.units[ACTOR_P1].initiative = 99;
  combat.units[ENEMY_P2].initiative = 1;
  combat.activeUnitId = ACTOR_P1;
  return state;
}

/** p1's unit ends its turn; the pump advances to the p2 unit and may pause. */
function defendAndPump(state: GameState): GameState {
  return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: ACTOR_P1 });
}

/** Grants p1 the Intelligence anytime-cast freedom, as if it had been played. */
function grantIntelligence(state: GameState): void {
  state.activeEffects.push({
    id: `intel_${state.activeEffects.length}`,
    name: "Intelligence",
    scope: "player",
    duration: { type: "combat" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "SPELL_CAST_ANYTIME" }],
    source: { type: "system" },
    controllerId: "p1",
    startedRound: state.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  });
}

describe("PvP — a real stop before the enemy unit acts (off-turn reaction window)", () => {
  it("stops for an instant specialty held off-turn, with NO Intelligence", () => {
    const state = defendAndPump(
      (() => {
        const s = pvpStage("pvp-stop-deemer");
        s.players.p1.hand = ["specialty.deemer.6"];
        return s;
      })()
    );

    const pause = state.combat!.pendingNeutralStep;
    expect(pause?.kind, "the pump opened a pre-activation pause").toBe("pre-activation");
    expect(pause?.reactingPlayerId).toBe("p1");
    expect(pause?.unitId).toBe(ENEMY_P2);
    // A human-driven unit previews no intent (its controller has not chosen yet).
    expect(pause?.intent).toBeUndefined();

    // p1 (off-turn) is offered the instant AND the resume.
    const p1 = getLegalActions(state, "p1");
    expect(
      p1.some((l) => l.action.type === "PLAY_CARD" && l.action.cardId === "specialty.deemer.6"),
      "off-turn p1 is offered Meteor Shower"
    ).toBe(true);
    expect(p1.some((l) => l.action.type === "CONTINUE_NEUTRAL_STEP")).toBe(true);

    // p2 (the active unit's controller) is fully blocked until p1 resolves it.
    expect(getLegalActions(state, "p2"), "the active player cannot act during the stop").toHaveLength(0);
  });

  it("lets the off-turn player resolve the instant, keep the stop open, then resume", () => {
    let state = defendAndPump(
      (() => {
        const s = pvpStage("pvp-stop-resolve");
        s.players.p1.hand = ["specialty.deemer.6"];
        return s;
      })()
    );
    const meteor = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "specialty.deemer.6"
    )!;
    const action = { ...meteor.action, target: { type: "unit", unitId: ENEMY_P2 } } as Extract<
      GameAction,
      { type: "PLAY_CARD" }
    >;

    const before = state.combat!.units[ENEMY_P2].damage;
    state = applyOk(state, action);
    // Damage landed and the fight is still paused on the same enemy unit.
    expect(state.combat!.units[ENEMY_P2].damage).toBeGreaterThan(before);
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");

    // Resume: the pause clears and the enemy unit is handed back to act.
    state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    expect(state.combat!.pendingNeutralStep).toBeNull();
    expect(state.combat!.activeUnitId).toBe(ENEMY_P2);
    expect(state.combat!.units[ENEMY_P2].activatedThisRound, "the enemy unit still has to act").toBe(false);
    expect(state.combat!.units[ENEMY_P2].reactionPauseAcked).toBe(true);
  });

  it("also stops for a usable active effect (First Aid Tent) — proves any reaction qualifies, not just cards", () => {
    let s = pvpStage("pvp-stop-tent");
    // Put a First Aid Tent into play on p1's (still-active) turn, then wound a
    // friendly unit it could heal off-turn.
    s.players.p1.hand = ["war_machine.first_aid_tent"];
    s = applyOk(s, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    s.combat!.units.unit_p1_marksmen.maxHealth = 6;
    s.combat!.units.unit_p1_marksmen.damage = 3;
    s.players.p1.hand = [];

    const state = defendAndPump(s);
    expect(state.combat!.pendingNeutralStep?.kind, "Tent heal opens the stop").toBe("pre-activation");
    expect(state.combat!.pendingNeutralStep?.reactingPlayerId).toBe("p1");
    const offersHeal = getLegalActions(state, "p1").some(
      (l) =>
        l.action.type === "USE_ACTIVE_EFFECT" &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === "unit_p1_marksmen"
    );
    expect(offersHeal, "the Tent heal is offered in the off-turn window").toBe(true);
  });

  it("still stops for an Intelligence-enabled off-turn cast (the prior behavior is preserved)", () => {
    const s = pvpStage("pvp-stop-intel");
    s.players.p1.hand = ["spell.magic_arrow"];
    grantIntelligence(s);
    const state = defendAndPump(s);
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    expect(state.combat!.pendingNeutralStep?.reactingPlayerId).toBe("p1");
    const offersCast = getLegalActions(state, "p1").some(
      (l) => l.action.type === "CAST_SPELL" && l.action.cardId === "spell.magic_arrow"
    );
    expect(offersCast, "the Intelligence cast is offered in the window").toBe(true);
  });

  it("does NOT stop when the off-turn player has nothing to react with (no over-pausing)", () => {
    const state = defendAndPump(pvpStage("pvp-stop-none"));
    expect(state.combat!.pendingNeutralStep ?? null, "no reaction → no pause").toBeNull();
    expect(state.combat!.activeUnitId).toBe(ENEMY_P2);
    expect(state.combat!.units[ENEMY_P2].activatedThisRound, "the enemy unit is handed straight to its controller").toBe(
      false
    );
  });
});
