import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, isUnitAlive } from "./index";
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

/**
 * The Adelaide / Deemer area instants must FULLY resolve when played in the
 * off-turn PvP window — not just be offered. That means: paying their cost
 * (Deemer's Power-source discard, Adelaide's card discard), firing the
 * Power-source draw rider (Sorcery), targeting correctly (centre + adjacent /
 * the ring around a space), and resolving the "pick which adjacent" choice that
 * opens WHILE the pre-activation pause is still up — with the active player
 * blocked throughout. Board neighbours of 9 = {5, 8, 10, 13}.
 */
describe("Adelaide / Deemer instants — full resolution inside the off-turn PvP window", () => {
  /** Stage the paused combat, place the test's units around centre 9, then DEFEND. */
  function stageAround(seed: string, p1Hand: string[], place: (s: GameState) => void): GameState {
    const staged = pvpStage(seed);
    staged.players.p1.hand = p1Hand;
    for (const [id, pos] of [
      ["unit_p1_griffins", 0], // ACTOR_P1: ends its turn, parked clear of the blast
      ["unit_p1_marksmen", 1],
      ["unit_p1_crusaders", 2],
      ["unit_p2_skeletons", 9], // ENEMY_P2: the paused unit (centre by default)
      ["unit_p2_vampires", 19],
      ["unit_p2_dread_knights", 16]
    ] as const) {
      const u = staged.combat!.units[id];
      u.position = pos;
      u.damage = 0;
      u.maxHealth = 20;
      u.abilities = [];
    }
    place(staged);
    return defendAndPump(staged);
  }

  it("Deemer VI: pays the Power-source cost off-turn and deals the power-scaled damage", () => {
    const state = stageAround("offturn-deemer-power", ["specialty.deemer.6", "stat.power", "stat.power"], (s) => {
      s.combat!.units.unit_p2_vampires.position = 10; // one unit adjacent to centre 9
    });
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    // The single power-scaled Meteor Shower activation is offered in the window.
    const offered = getLegalActions(state, "p1").some(
      (l) =>
        l.action.type === "PLAY_CARD" && l.action.cardId === "specialty.deemer.6" && l.action.optionIndex === 0
    );
    expect(offered, "Meteor Shower is offered off-turn").toBe(true);

    const resolved = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: ENEMY_P2 },
      costCardIds: ["stat.power", "stat.power"]
    });
    expect(resolved.combat!.units[ENEMY_P2].damage, "centre took 2 (Power 2 brought)").toBe(2);
    expect(resolved.combat!.units.unit_p2_vampires.damage, "adjacent took it too").toBe(2);
    // Cost actually paid from p1's hand.
    expect(resolved.players.p1.hand).not.toContain("stat.power");
    expect(resolved.players.p1.discard).toContain("stat.power");
    // The window stays open on the same enemy unit.
    expect(resolved.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
  });

  it("Deemer VI: paying with Sorcery power-sources fires their draw rider off-turn", () => {
    const state = stageAround(
      "offturn-deemer-sorcery",
      ["specialty.deemer.6", "ability.sorcery", "ability.sorcery"],
      (s) => {
        s.combat!.units.unit_p2_vampires.position = 10;
        s.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"]; // refill to draw from
      }
    );
    const resolved = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: ENEMY_P2 },
      costCardIds: ["ability.sorcery", "ability.sorcery"]
    });
    expect(resolved.combat!.units[ENEMY_P2].damage).toBe(2);
    // Each Sorcery spent as a Power source draws 1 ("+1 Power, then draw 1 card").
    expect(resolved.players.p1.hand, "two cards drawn from the Sorcery riders off-turn").toHaveLength(2);
    expect(resolved.players.p1.deck).toHaveLength(1);
    expect(
      resolved.eventLog.some((e) => e.type === "CARDS_DRAWN" && e.playerId === "p1"),
      "the off-turn cast logged a draw"
    ).toBe(true);
  });

  it("Adelaide VI: discards its cost off-turn and rings the chosen space (not the centre)", () => {
    const state = stageAround(
      "offturn-adelaide",
      ["specialty.adelaide.6", "stat.attack", "stat.defense"],
      (s) => {
        s.combat!.units.unit_p2_skeletons.position = 8; // ENEMY_P2 sits IN the ring of 9
        s.combat!.units.unit_p2_vampires.position = 10; // also in the ring
      }
    );
    const play = getLegalActions(state, "p1").find(
      (l) =>
        l.action.type === "PLAY_CARD" &&
        l.action.cardId === "specialty.adelaide.6" &&
        l.action.target?.type === "space" &&
        l.action.target.position === 9
    );
    expect(play, "Frost Ring on space 9 is offered off-turn").toBeTruthy();
    const resolved = applyOk(state, {
      ...(play!.action as Extract<GameAction, { type: "PLAY_CARD" }>),
      costCardIds: ["stat.attack", "stat.defense"]
    });
    // The ring (neighbours of 9) takes 2; the centre space holds no one.
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(2);
    expect(resolved.combat!.units.unit_p2_vampires.damage).toBe(2);
    expect(resolved.players.p1.hand).not.toContain("stat.attack");
    expect(resolved.players.p1.hand).not.toContain("stat.defense");
  });

  it("Gerwulf VI: the off-turn Ballista discard resolves (war machine spent, damage dealt)", () => {
    const state = stageAround("offturn-gerwulf", ["specialty.gerwulf.6"], (s) => {
      s.players.p1.permanents = ["war_machine.ballista"]; // a Ballista in play to discard
    });
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    // Only the discard side (option 1) is the off-turn instant — the ongoing "aim"
    // side (option 0) is turn-only and must NOT be offered here.
    const actions = getLegalActions(state, "p1");
    expect(
      actions.some(
        (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "specialty.gerwulf.6" && l.action.optionIndex === 0
      ),
      "the ongoing aim side is not an off-turn instant"
    ).toBe(false);
    expect(
      actions.some(
        (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "specialty.gerwulf.6" && l.action.optionIndex === 1
      ),
      "the discard-Ballista instant is offered off-turn"
    ).toBe(true);

    const before = state.combat!.units[ENEMY_P2].damage;
    const resolved = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.gerwulf.6",
      mode: "basic",
      optionIndex: 1,
      target: { type: "unit", unitId: ENEMY_P2 }
    });
    expect(resolved.combat!.units[ENEMY_P2].damage, "the paused enemy unit took the Ballista hit").toBeGreaterThan(
      before
    );
    expect(resolved.players.p1.permanents ?? [], "the Ballista was spent").not.toContain("war_machine.ballista");
  });

  it("Deemer VI: the >2-adjacent target pick resolves DURING the pause; the active player stays blocked", () => {
    let state = stageAround("offturn-deemer-pick", ["specialty.deemer.6"], (s) => {
      // Three neighbours of centre 9: vampires(10), dread_knights(8), marksmen(13).
      s.combat!.units.unit_p2_vampires.position = 10;
      s.combat!.units.unit_p2_dread_knights.position = 8;
      s.combat!.units.unit_p1_marksmen.position = 13;
    });
    state = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.deemer.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "unit", unitId: ENEMY_P2 }
    });
    // Centre hit immediately; an area-pick choice opens for p1 while still paused.
    expect(state.combat!.units[ENEMY_P2].damage).toBe(1);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.playerId).toBe("p1");
    expect(choice.picksRemaining).toBe(2);
    // The pre-activation pause is still underneath, and p2 is STILL fully blocked.
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    expect(getLegalActions(state, "p2"), "active player is blocked during the pick too").toHaveLength(0);

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_vampires"
    });
    const second = state.pendingChoice;
    expect(second?.type).toBe("ABILITY_TARGET_CHOICE");
    if (second?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: second.id,
      targetUnitId: "unit_p2_dread_knights"
    });
    expect(state.pendingChoice).toBeNull();
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(state.combat!.units.unit_p1_marksmen.damage, "the unpicked neighbour was spared").toBe(0);

    // The pause survived the whole pick; resuming finally lets the enemy unit act.
    expect(state.combat!.pendingNeutralStep?.kind).toBe("pre-activation");
    state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    expect(state.combat!.pendingNeutralStep ?? null).toBeNull();
    expect(state.combat!.activeUnitId).toBe(ENEMY_P2);
    expect(state.combat!.units[ENEMY_P2].activatedThisRound).toBe(false);
  });

  it("an off-turn instant that KILLS the paused unit must not softlock the fight", () => {
    let state = stageAround("offturn-kill", ["specialty.deemer.6"], (s) => {
      s.combat!.units[ENEMY_P2].initiative = 50; // paused unit acts before the next one
      // A live, not-yet-acted p2 unit that must get to act once the dead one clears.
      s.combat!.units.unit_p2_vampires.position = 19;
      s.combat!.units.unit_p2_vampires.initiative = 1;
      s.combat!.units.unit_p2_vampires.activatedThisRound = false;
    });
    expect(state.combat!.pendingNeutralStep?.unitId).toBe(ENEMY_P2);

    // Simulate the off-turn instant having killed the paused unit: put it in the
    // engine's dead state (damage >= maxHealth) and spend the instant (empty hand,
    // as a real cast would). p2 still has a live unit, so the combat continues —
    // the dead unit's activation must simply be skipped.
    const paused = state.combat!.units[ENEMY_P2];
    paused.damage = paused.maxHealth;
    expect(isUnitAlive(paused)).toBe(false);
    state.players.p1.hand = [];

    state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });

    // The pump must drop the corpse and advance to the live unit — never stall.
    expect(state.combat!.pendingNeutralStep ?? null, "no leftover pause on the corpse").toBeNull();
    expect(state.combat!.outcome ?? null, "combat continues — p2 still has a live unit").toBeNull();
    expect(state.combat!.activeUnitId, "activation advanced to the surviving unit").toBe("unit_p2_vampires");
    expect(getLegalActions(state, "p2").length, "the surviving side can now act (no softlock)").toBeGreaterThan(0);
  });
});
