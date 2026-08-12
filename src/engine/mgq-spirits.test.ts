import { describe, expect, it } from "vitest";
import { getMainHero } from "./adventure";
import { startPlayerCombat } from "./adventure-reducer";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { chooseComputerAction } from "./computer/policy";
import { mgqContractedSpirits, seedMgqSpiritsForCombat } from "./mgq-spirits";
import type { GameAction, GameState, MgqSpirit, PlayerVisibleState } from "./state";

function spiritState(selected: MgqSpirit, level = 1): GameState {
  const state = createInitialGameState();
  state.players.p1.factionId = "mgq";
  state.players.p1.mgqSpirit = selected;
  const hero = getMainHero(state, "p1");
  if (hero) hero.level = level;
  return state;
}

describe("MGQ — Four Spirits summons", () => {
  it("makes all four choices innate without a Shrine contract", () => {
    const state = spiritState("sylph");
    expect(mgqContractedSpirits(state, "p1")).toEqual(["sylph", "gnome", "undine", "salamander"]);
    expect(mgqContractedSpirits(state, "p2")).toEqual([]);
  });

  it("summons the basic face at levels 1–3", () => {
    const state = spiritState("undine", 3);
    seedMgqSpiritsForCombat(state);
    const spirit = state.combat!.units.unit_p1_spirit_undine;
    expect(spirit).toMatchObject({ attack: 2, defense: 0, maxHealth: 4, initiative: 5, variant: "few", summoned: true, temporary: true });
    expect(spirit.abilities).toContain("mgq-undine-heal-1");
  });

  it("summons the advanced face at levels 4–7", () => {
    const state = spiritState("salamander", 4);
    seedMgqSpiritsForCombat(state);
    const spirit = state.combat!.units.unit_p1_spirit_salamander;
    expect(spirit).toMatchObject({ attack: 4, defense: 1, maxHealth: 4, initiative: 7, variant: "pack" });
    expect(spirit.abilities).toEqual(expect.arrayContaining(["champion-roll-two-dice", "champion-reroll-minus"]));
  });

  it("advanced Sylph grants +1 Initiative to other friendly troops for the combat", () => {
    const state = spiritState("sylph", 7);
    seedMgqSpiritsForCombat(state);
    expect(state.combat!.units.unit_p1_spirit_sylph.initiative).toBe(15);
    const boostedIds = state.activeEffects.filter((effect) => effect.name === "Sylph — Wind Swiftness").map((effect) => effect.target?.type === "unit" ? effect.target.unitId : null);
    expect(boostedIds).not.toContain("unit_p1_spirit_sylph");
    expect(boostedIds.some(Boolean)).toBe(true);
    expect(state.activeEffects.filter((effect) => effect.name === "Sylph — Wind Swiftness").every((effect) => effect.duration.type === "combat")).toBe(true);
  });
});

describe("MGQ spirit selection gate", () => {
  it("does not silently summon Sylph before the player chooses", () => {
    const state = createInitialGameState();
    state.players.p1.factionId = "mgq";
    delete state.players.p1.mgqSpirit;
    seedMgqSpiritsForCombat(state);
    expect(state.combat!.mgqSpirits).toEqual({});
    expect(Object.keys(state.combat!.units).some((id) => id.includes("spirit_sylph"))).toBe(false);
  });
});

describe("MGQ Four Spirits in the PvP prep window", () => {
  function applyOk(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    return result.state;
  }

  /** A castle attacker walks into the spiritless MGQ defender: prep opens. */
  function mgqDefenderPrep(seed: string, mutate: (state: GameState) => void = () => {}): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Luka", factionId: "mgq", heroDefId: "luka" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    // Skip the Gold Contract setup picker (irrelevant to this suite).
    state.pendingChoice = null;
    state.players.p1.mgqGoldContracts = ["mgq.carmilla", "mgq.giga", "mgq.lucretia"];
    state.players.p1.mgqGoldContractSetupRequired = false;
    delete state.players.p1.mgqSpirit;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    mutate(state);
    const attacker = getMainHero(state, "p2")!;
    const defender = getMainHero(state, "p1")!;
    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    expect(state.combat?.prep?.accepted).toEqual([]);
    return state;
  }

  it("a spiritless MGQ participant is offered the Spirit choice INSIDE prep, then Accept (CONTROL: no Accept before)", () => {
    let state = mgqDefenderPrep("mgq-prep-spirit-reachable");

    const before = getLegalActions(state, "p1");
    // CONTROL — the printed gate: no spirit selected means Accept is withheld…
    expect(before.some((legal) => legal.action.type === "ACCEPT_COMBAT")).toBe(false);
    // …so the Spirit choice MUST be reachable in this very window (the map-turn
    // offer block is never consulted while the combat dispatcher owns the legal
    // actions — without the prep offer the defender could neither ready up nor
    // choose, a stall once escapes are exhausted/blocked).
    const spiritOffers = before.filter((legal) => legal.action.type === "SET_MGQ_SPIRIT");
    expect(spiritOffers.map((legal) => (legal.action.type === "SET_MGQ_SPIRIT" ? legal.action.spirit : null)).sort())
      .toEqual(["gnome", "salamander", "sylph", "undine"]);

    // The castle opponent gets the plain Accept and never a Spirit offer.
    const opponent = getLegalActions(state, "p2");
    expect(opponent.some((legal) => legal.action.type === "ACCEPT_COMBAT")).toBe(true);
    expect(opponent.some((legal) => legal.action.type === "SET_MGQ_SPIRIT")).toBe(false);

    // Taking the offer really selects the Spirit and unlocks Accept.
    state = applyOk(state, spiritOffers[0]!.action);
    expect(state.players.p1.mgqSpirit).toBe("sylph");
    const after = getLegalActions(state, "p1");
    expect(after.some((legal) => legal.action.type === "ACCEPT_COMBAT")).toBe(true);
    state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p1" });
    expect(state.combat?.prep?.accepted).toContain("p1");
  });

  it("a spiritless COMPUTER MGQ seat readies up through the normal policy instead of fleeing or stalling", () => {
    let state = mgqDefenderPrep("mgq-prep-spirit-computer", (initial) => {
      initial.sessionMode = "single-player";
      initial.controllers = {
        ...(initial.controllers ?? {}),
        p1: { kind: "computer", difficulty: "standard", policyVersion: 1 }
      };
      // Nothing to shop with: the seat must still make progress.
      initial.players.p1.townTokens = { build: false, population: false, spellBook: false };
      initial.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    });

    for (let safety = 0; safety < 12 && !state.combat?.prep?.accepted.includes("p1"); safety += 1) {
      const legalActions = getLegalActions(state, "p1");
      const decision = chooseComputerAction({
        playerId: "p1",
        state: state as unknown as PlayerVisibleState,
        legalActions
      });
      expect(decision, `the computer must own a prep decision (step ${safety})`).toBeTruthy();
      expect(
        ["RETREAT_FROM_COMBAT", "SURRENDER_COMBAT", "GIVE_UP_COMBAT"].includes(decision!.action.type),
        "a healthy MGQ defender never flees just because no Spirit was picked"
      ).toBe(false);
      state = applyOk(state, decision!.action);
    }
    expect(state.players.p1.mgqSpirit).toBeTruthy();
    expect(state.combat?.prep?.accepted).toContain("p1");
  });
});
