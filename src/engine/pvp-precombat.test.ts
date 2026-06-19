import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions
} from "./index";
import { getMainHero } from "./adventure";
import { startPlayerCombat } from "./adventure-reducer";
import type { GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

const offersRetreat = (state: GameState, playerId: PlayerId) =>
  getLegalActions(state, playerId).some((l) => l.action.type === "RETREAT_FROM_COMBAT");
const offersAccept = (state: GameState, playerId: PlayerId) =>
  getLegalActions(state, playerId).some((l) => l.action.type === "ACCEPT_COMBAT");

// ===========================================================================
// Part 1 — the "Retreat button always shows" bug: Retreat / Surrender is a
// start-of-combat decision and must vanish the moment a unit begins fighting.
// ===========================================================================

describe("PvP Retreat / Surrender — only before any unit acts", () => {
  /** A round-1 PvP combat already past deployment (phase "combat"). */
  function pvpFight(seed: string): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    state.combat = createInitialGameState(seed).combat;
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: state.heroes.hero_p1.spaceId ?? "0,0"
    };
    state.combat!.setup = null;
    state.combat!.round = 1;
    state.phase = "combat";
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = false;
      unit.movedThisActivation = false;
      unit.attackedThisActivation = false;
      unit.attacksThisActivation = 0;
    }
    return state;
  }

  it("offers Retreat to BOTH heroes at the opening, before anyone has acted", () => {
    const state = pvpFight("escape-open");
    expect(offersRetreat(state, "p1")).toBe(true);
    expect(offersRetreat(state, "p2")).toBe(true);
  });

  it("withdraws Retreat from everyone once a single unit has begun fighting", () => {
    const state = pvpFight("escape-closed");
    // Any one unit having activated this round closes the start-of-combat window.
    Object.values(state.combat!.units)[0].activatedThisRound = true;

    expect(offersRetreat(state, "p1")).toBe(false);
    expect(offersRetreat(state, "p2")).toBe(false);
  });

  it("withdraws Retreat the instant the active unit has only moved (not yet ended its turn)", () => {
    const state = pvpFight("escape-moved");
    const active = Object.values(state.combat!.units)[0];
    active.movedThisActivation = true; // mid-activation: fighting has begun

    expect(offersRetreat(state, "p1")).toBe(false);
    expect(offersRetreat(state, "p2")).toBe(false);
  });

  it("the engine rejects a RETREAT_FROM_COMBAT action after a unit has acted", () => {
    const state = pvpFight("escape-reject");
    Object.values(state.combat!.units)[0].activatedThisRound = true;

    const rejected = applyAction(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(rejected.state.combat?.outcome ?? null).toBeNull();
  });

  it("still ACCEPTS a Retreat at the opening (the legitimate decision point)", () => {
    const state = pvpFight("escape-accept");
    const ok = applyAction(state, { type: "RETREAT_FROM_COMBAT", playerId: "p1" });
    expect(ok.errors).toEqual([]);
    expect(ok.state.combat?.outcome).toMatchObject({ defeatedPlayerId: "p1", reason: "retreat" });
  });
});

// ===========================================================================
// Part 2 — PvP pre-combat preparation window: a defender who still holds town
// actions this round may build / recruit / buy spells before deploying, then
// press Accept.
// ===========================================================================

describe("PvP pre-combat preparation window (defender)", () => {
  /** Triggers a hero-vs-hero PvP combat with p1 attacking p2. */
  function attack(seed: string, prep: (state: GameState) => void = () => {}): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    // Give the defender fresh town actions and resources to spend.
    state.players.p2.townTokens = { build: true, population: true, spellBook: true };
    state.players.p2.resources = { gold: 50, buildingMaterials: 20, valuables: 20, magic: 20 } as never;
    prep(state);
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    return state;
  }

  it("opens for the defender (priority + ACCEPT_COMBAT) when they still hold town actions", () => {
    const state = attack("prep-open");
    expect(state.combat?.defenderPrep?.playerId).toBe("p2");
    expect(state.priorityPlayerId).toBe("p2");
    expect(state.phase).toBe("combat-setup");

    // The defender is offered Accept, Retreat, and at least one town action.
    expect(offersAccept(state, "p2")).toBe(true);
    expect(offersRetreat(state, "p2")).toBe(true);
    const p2 = getLegalActions(state, "p2");
    expect(p2.some((l) => l.action.type === "BUILD_STRUCTURE")).toBe(true);

    // The attacker just waits — no actions until the defender accepts.
    expect(getLegalActions(state, "p1")).toEqual([]);
  });

  it("does NOT open when the defender has already spent every town action this round", () => {
    const state = attack("prep-none", (s) => {
      s.players.p2.townTokens = { build: false, population: false, spellBook: false };
    });
    expect(state.combat?.defenderPrep ?? null).toBeNull();
    // Straight to deployment, attacker places first.
    expect(state.phase).toBe("combat-setup");
    expect(state.priorityPlayerId).toBe("p1");
    expect(offersAccept(state, "p2")).toBe(false);
  });

  it("lets the defender build during prep, then ACCEPT to begin deployment (attacker first)", () => {
    let state = attack("prep-build");
    const goldBefore = state.players.p2.resources.gold;

    state = applyOk(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: "town_p2",
      buildingId: "necropolis.dwelling_bronze"
    });
    expect(state.towns.town_p2.buildings).toContain("necropolis.dwelling_bronze");
    expect(state.players.p2.resources.gold).toBeLessThan(goldBefore);
    // Still in the prep window after building.
    expect(state.combat?.defenderPrep?.playerId).toBe("p2");

    state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p2" });
    expect(state.combat?.defenderPrep ?? null).toBeNull();
    expect(state.combat?.setup).not.toBeNull();
    expect(state.priorityPlayerId).toBe("p1");
    expect(state.phase).toBe("combat-setup");
  });

  it("recruits a fresh unit during prep that then joins the army for deployment", () => {
    let state = attack("prep-recruit", (s) => {
      // Free up the bronze units so there is actually something to recruit once
      // the bronze dwelling stands (each unit card exists only once). Keep a
      // higher-tier unit so the army is not empty (no auto-restore).
      s.players.p2.army = s.players.p2.army.filter(
        (unit) => unit.unitDefId !== "necropolis.skeletons" && unit.unitDefId !== "necropolis.zombies"
      );
    });
    // Unlock a recruit tier first (build the bronze dwelling).
    state = applyOk(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p2",
      townId: "town_p2",
      buildingId: "necropolis.dwelling_bronze"
    });

    const armyBefore = state.players.p2.army.length;
    const recruit = getLegalActions(state, "p2").find(
      (l) => l.action.type === "POPULATION_ACTION"
    );
    expect(recruit, "a recruit/reinforce should be available in prep").toBeTruthy();
    state = applyOk(state, recruit!.action);

    expect(state.players.p2.army.length).toBeGreaterThan(armyBefore);
    // The window is still the defender's until they accept.
    expect(state.combat?.defenderPrep?.playerId).toBe("p2");
  });

  it("lets the defender Retreat straight out of the prep window", () => {
    const state = attack("prep-retreat");
    const out = applyAction(state, { type: "RETREAT_FROM_COMBAT", playerId: "p2" });
    expect(out.errors).toEqual([]);
    expect(out.state.combat?.outcome).toMatchObject({ defeatedPlayerId: "p2", reason: "retreat" });
  });

  it("blocks town actions for the attacker (only the defender may prep)", () => {
    const state = attack("prep-attacker");
    const rejected = applyAction(state, {
      type: "BUILD_STRUCTURE",
      playerId: "p1",
      townId: "town_p1",
      buildingId: "castle.dwelling_bronze"
    });
    expect(rejected.errors.length).toBeGreaterThan(0);
  });
});
