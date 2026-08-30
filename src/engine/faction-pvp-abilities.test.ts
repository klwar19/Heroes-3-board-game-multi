import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { getMainHero } from "./adventure";
import type { CombatUnitState, GameAction, GameState, PlayerId } from "./state";

/**
 * Two faction-specific PvP rules (USER RULES), each engine-enforced and pinned
 * so the test fails if the wiring is removed:
 *
 *  - Little Busters: a fighter facing a Little Busters seat may spend 1 gold on
 *    each of three one-off combat counters (discard a random LB card, reduce
 *    the campus hero to half HP rounded up, draw one card).
 *  - Monster Girl Quest: no longer carries an opponent-draw penalty.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, `${action.type}: ` + result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const KNOWN_DECK = ["artifact.crest_of_valor", "artifact.necklace_of_swiftness", "artifact.speculum"];

// ---------------------------------------------------------------------------
// Little Busters PvP counters
// ---------------------------------------------------------------------------

describe("Little Busters PvP counters", () => {
  /**
   * A round-1 PvP combat (phase "combat") where p1 (Castle) fights p2 (Little
   * Busters). p2 gets a battlefield HERO unit (the "damage" target). Faction is
   * overridable so the CONTROL can turn off the Little Busters opponent.
   */
  function lbFight(seed: string, opponentFaction = "little_busters"): GameState {
    const state = createAdventureGameState({
      startingBuildings: [],
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Rival", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Campus", factionId: opponentFaction as never, heroDefId: "catherine" }
      ]
    });
    state.pendingChoice = null;
    state.combat = createInitialGameState(seed).combat;
    state.combat!.attackerPlayerId = "p1";
    state.combat!.defenderPlayerId = "p2";
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: state.heroes.hero_p1.spaceId ?? "0,0"
    };
    state.combat!.setup = null;
    state.combat!.round = 1;
    state.combat!.outcome = null;
    state.phase = "combat";
    state.activePlayerId = "p1";

    // A battlefield hero unit for p2 (the Little Busters campus hero): clone one
    // of p2's existing combat units so every required field is valid.
    const template = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p2")!;
    const heroUnit: CombatUnitState = {
      ...template,
      id: "unit_p2_campus_hero",
      controllerId: "p2",
      heroUnit: true,
      name: "Riki Naoe",
      cardName: "Riki Naoe",
      maxHealth: 10,
      damage: 0
    };
    state.combat!.units[heroUnit.id] = heroUnit;

    state.players.p1.resources.gold = 10;
    state.players.p1.hand = [];
    state.players.p1.deck = [...KNOWN_DECK];
    state.players.p1.discard = [];
    state.players.p2.hand = ["artifact.crest_of_valor"];
    state.players.p2.discard = [];
    return state;
  }

  const counters = (state: GameState, playerId: PlayerId) =>
    getLegalActions(state, playerId).filter((legal) => legal.action.type === "LITTLE_BUSTERS_COUNTER");

  const counterAction = (state: GameState, playerId: PlayerId, counter: "discard" | "damage" | "draw") =>
    counters(state, playerId).find(
      (legal) => legal.action.type === "LITTLE_BUSTERS_COUNTER" && legal.action.counter === counter
    )?.action;

  it("offers all three counters to the fighter facing Little Busters", () => {
    const state = lbFight("lb-offer");
    const kinds = counters(state, "p1").map((legal) =>
      legal.action.type === "LITTLE_BUSTERS_COUNTER" ? legal.action.counter : ""
    );
    expect(kinds.sort()).toEqual(["damage", "discard", "draw"]);
  });

  it("CONTROL: no counters when the opponent is NOT Little Busters", () => {
    const state = lbFight("lb-control-faction", "castle");
    expect(counters(state, "p1")).toHaveLength(0);
    // …and the Little Busters seat itself is never offered them against Castle.
    expect(counters(state, "p2")).toHaveLength(0);
  });

  it("CONTROL: no counters when the fighter cannot afford the 1 gold", () => {
    const state = lbFight("lb-control-gold");
    state.players.p1.resources.gold = 0;
    expect(counters(state, "p1")).toHaveLength(0);
  });

  it("the discard counter costs 1 gold and moves one LB card to their discard", () => {
    const state = lbFight("lb-discard");
    const discardCardId = state.players.p2.hand[0];
    const goldBefore = state.players.p1.resources.gold;

    const next = apply(state, counterAction(state, "p1", "discard")!);
    expect(next.players.p1.resources.gold).toBe(goldBefore - 1);
    expect(next.players.p2.hand).toHaveLength(0);
    expect(next.players.p2.discard).toContain(discardCardId);
    expect(counterAction(next, "p1", "discard")).toBeUndefined();
    expect(counterAction(next, "p1", "damage")).toBeTruthy();
    expect(counterAction(next, "p1", "draw")).toBeTruthy();
  });

  it("the damage counter reduces the LB hero to half HP rounded up for 1 gold", () => {
    const state = lbFight("lb-damage");
    state.combat!.units.unit_p2_campus_hero.maxHealth = 9;
    const goldBefore = state.players.p1.resources.gold;
    const before = state.combat!.units.unit_p2_campus_hero.damage;

    const next = apply(state, counterAction(state, "p1", "damage")!);
    expect(next.players.p1.resources.gold).toBe(goldBefore - 1);
    expect(next.combat!.units.unit_p2_campus_hero.damage).toBe(before + 4);
    expect(next.combat!.units.unit_p2_campus_hero.maxHealth - next.combat!.units.unit_p2_campus_hero.damage).toBe(5);
    expect(counterAction(next, "p1", "damage")).toBeUndefined();
  });

  it("the draw counter draws exactly 1 card for 1 gold", () => {
    const state = lbFight("lb-draw");
    const goldBefore = state.players.p1.resources.gold;
    const handBefore = state.players.p1.hand.length;
    const deckBefore = state.players.p1.deck.length;

    const next = apply(state, counterAction(state, "p1", "draw")!);
    expect(next.players.p1.resources.gold).toBe(goldBefore - 1);
    expect(next.players.p1.hand.length).toBe(handBefore + 1);
    expect(next.players.p1.deck.length).toBe(deckBefore - 1);
    expect(counterAction(next, "p1", "draw")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Monster Girl Quest — opponent battle-start draw (end to end)
// ---------------------------------------------------------------------------

describe("Monster Girl Quest opponent battle-start draw", () => {
  /**
   * A 2-player game one step from a PvP battle: p1 (the DEFENDER, faction is
   * variable) stands on its home field, p2 (Castle, the ATTACKER) is staged one
   * step away and is on the clock — walking p2 onto p1's field opens prep. The
   * opponent of an MGQ defender is p2, so p2's hand is what the draw touches.
   */
  function pvpReady(seed: string, defenderFaction: string): { state: GameState; p1Field: string } {
    const state = createAdventureGameState({
      startingBuildings: [],
      seed,
      ruleset: "binh",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Quest", factionId: defenderFaction as never, heroDefId: defenderFaction === "mgq" ? "luka" : "gelu" },
        { id: "p2", name: "Rival", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    state.pendingChoice = null;
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    // Neutralise the MGQ defender's prep requirements so deployment does not
    // stall: a chosen spirit (Ready is otherwise withheld) and an empty hand
    // (waives the spirit cost). None of this touches p2 (the opponent under test).
    state.players.p1.mgqSpirit = "undine";
    state.players.p1.mgqGoldContracts = ["mgq.carmilla", "mgq.giga", "mgq.lucretia"];
    state.players.p1.mgqGoldContractSetupRequired = false;
    state.players.p1.hand = [];

    // p2 (the opponent) gets a known deck so its battle-start draw is observable.
    state.players.p2.hand = [];
    state.players.p2.deck = [...KNOWN_DECK];
    state.players.p2.discard = [];

    const p1Field = getMainHero(state, "p1")!.spaceId!;
    getMainHero(state, "p2")!.spaceId = "h:9:2";
    state.adventure!.lastVisitedField.hero_p1 = p1Field;
    state.adventure!.lastVisitedField.hero_p2 = "h:9:2";
    for (const hero of Object.values(state.heroes)) {
      hero.movementPoints = 5;
      hero.movementHaltedThisTurn = false;
    }
    state.activePlayerId = "p2";
    return { state, p1Field };
  }

  /** Accept both sides and deploy (place-then-Ready per side) until phase "combat". */
  function deployToCombat(state: GameState): GameState {
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    state = apply(state, { type: "ACCEPT_COMBAT", playerId: "p2" });
    let guard = 0;
    while (guard++ < 60 && state.phase !== "combat") {
      let acted = false;
      for (const playerId of ["p1", "p2"] as PlayerId[]) {
        const legal = getLegalActions(state, playerId);
        // Place every unit, then Ready this side; resolve any surfaced choice
        // (e.g. the MGQ spirit-cost discard — waived here by an empty hand). The
        // MGQ spirit is pre-selected, so SET_MGQ_SPIRIT is deliberately NOT taken
        // (it is always re-offered and would loop forever).
        const act =
          legal.find((entry) => entry.action.type === "PLACE_COMBAT_UNIT") ??
          legal.find((entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT") ??
          legal.find((entry) => entry.action.type === "CHOOSE_OPTION");
        if (act) {
          state = apply(state, act.action);
          acted = true;
          break;
        }
      }
      if (!acted) break;
    }
    return state;
  }

  it("MGQ no longer gives its opponent a card as the battle begins", () => {
    const start = pvpReady("mgq-draw", "mgq");
    let state = apply(start.state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: start.p1Field });
    expect(state.combat?.context.kind, "a PvP battle opened").toBe("player");
    const handBefore = state.players.p2.hand.length;

    state = deployToCombat(state);
    expect(state.phase, "reached the fighting phase").toBe("combat");
    expect(state.players.p2.hand.length, "MGQ has no opponent-draw penalty").toBe(handBefore);
  });

  it("CONTROL: no bonus draw when the opponent is NOT Monster Girl Quest", () => {
    const start = pvpReady("mgq-control", "rampart");
    let state = apply(start.state, { type: "MOVE_HERO", playerId: "p2", heroId: "hero_p2", to: start.p1Field });
    expect(state.combat?.context.kind).toBe("player");
    const handBefore = state.players.p2.hand.length;

    state = deployToCombat(state);
    expect(state.phase).toBe("combat");
    expect(state.players.p2.hand.length, "no MGQ opponent means no bonus draw").toBe(handBefore);
  });
});
