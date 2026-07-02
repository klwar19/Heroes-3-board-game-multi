import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
} from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { ArmyUnitState, GameAction, GameState } from "./state";

/**
 * The Necropolis City Hall income option "Reinforce 1 bronze unit for free"
 * must let the player PICK which bronze unit to reinforce — it used to silently
 * upgrade whichever bronze Few sat first in the army.
 */
describe("Necropolis City Hall — free bronze reinforce", () => {
  function applyOk(state: GameState, action: GameAction): GameState {
    const result = applyAction(state, action);
    expect(
      result.errors,
      result.errors.map((error) => error.message).join("; "),
    ).toEqual([]);
    return result.state;
  }

  /**
   * A Necropolis (p1) adventure parked at the start of a Resource round (round 3)
   * with a City-Hall-only town and the given army, so the City-Hall income
   * choice is the only thing in the reward queue.
   */
  function cityHallRound(seed: string, army: ArmyUnitState[]): GameState {
    const state = createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      events: false,
      players: [
        {
          id: "p1",
          name: "Sandro",
          factionId: "necropolis",
          heroDefId: "sandro",
        },
        {
          id: "p2",
          name: "Catherine",
          factionId: "castle",
          heroDefId: "catherine",
        },
      ],
    });
    const town = Object.values(state.towns).find(
      (candidate) => candidate.controllerId === "p1",
    );
    if (!town) {
      throw new Error("no Necropolis town");
    }
    town.buildings = ["necropolis.city_hall"];
    state.players.p1.army = army;
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = 3; // odd round > 1 → Resource round
    startAdventureRound(state);
    pumpAdventureQueues(state);
    return state;
  }

  function few(id: string, unitDefId: string): ArmyUnitState {
    return { id, unitDefId, side: "few" } as ArmyUnitState;
  }

  function reinforcePick(state: GameState, unitName: string) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "RESOLVE_VISIT_STEP" &&
        legal.label.startsWith("Reinforce") &&
        legal.label.includes(unitName),
    );
  }

  function cityHallOption(state: GameState, includes: string) {
    return getLegalActions(state, "p1").find((legal) =>
      legal.label.includes(includes),
    );
  }

  it("reinforces the unit the player picks — NOT just the first bronze unit", () => {
    // Two bronze Few: Skeletons sits first, Zombies second. The player must be
    // able to reach past the first one and reinforce the Zombies.
    const state = cityHallRound("necro-pick", [
      few("army_skel", "necropolis.skeletons"),
      few("army_zomb", "necropolis.zombies"),
    ]);

    const choice = state.pendingChoice;
    expect(
      choice?.type === "OPTION_CHOICE" && choice.context === "city-hall",
    ).toBe(true);

    const reinforce = cityHallOption(state, "Reinforce 1 bronze unit for free");
    expect(
      reinforce,
      "the reinforce City Hall option should be offered",
    ).toBeTruthy();
    let next = applyOk(state, reinforce!.action);
    pumpAdventureQueues(next);

    // Resolving the option opens a unit picker (it does NOT auto-upgrade the
    // first unit). Both bronze units are offered.
    expect(
      reinforcePick(next, "Skeletons"),
      "Skeletons should be a pickable target",
    ).toBeTruthy();
    const pickZombies = reinforcePick(next, "Zombies");
    expect(pickZombies, "Zombies should be a pickable target").toBeTruthy();

    next = applyOk(next, pickZombies!.action);

    // The PICKED unit (Zombies) is the one that flips to Pack; the first unit
    // (Skeletons) is untouched. Under the old auto-pick-first logic this fails:
    // Skeletons would already be a Pack and no picker would ever open.
    expect(
      next.players.p1.army.find((unit) => unit.id === "army_zomb")?.side,
    ).toBe("pack");
    expect(
      next.players.p1.army.find((unit) => unit.id === "army_skel")?.side,
    ).toBe("few");
  });

  it("can still reinforce the first unit when that is the one picked", () => {
    const state = cityHallRound("necro-first", [
      few("army_skel", "necropolis.skeletons"),
      few("army_zomb", "necropolis.zombies"),
    ]);
    let next = applyOk(
      state,
      cityHallOption(state, "Reinforce 1 bronze unit for free")!.action,
    );
    pumpAdventureQueues(next);
    next = applyOk(next, reinforcePick(next, "Skeletons")!.action);
    expect(
      next.players.p1.army.find((unit) => unit.id === "army_skel")?.side,
    ).toBe("pack");
    expect(
      next.players.p1.army.find((unit) => unit.id === "army_zomb")?.side,
    ).toBe("few");
  });

  it("Skip leaves every unit a Few", () => {
    const state = cityHallRound("necro-skip", [
      few("army_skel", "necropolis.skeletons"),
      few("army_zomb", "necropolis.zombies"),
    ]);
    let next = applyOk(
      state,
      cityHallOption(state, "Reinforce 1 bronze unit for free")!.action,
    );
    pumpAdventureQueues(next);
    const skip = getLegalActions(next, "p1").find(
      (legal) =>
        legal.action.type === "RESOLVE_VISIT_STEP" && legal.label === "Skip",
    );
    expect(skip, "the picker offers a Skip").toBeTruthy();
    next = applyOk(next, skip!.action);
    expect(next.players.p1.army.every((unit) => unit.side === "few")).toBe(
      true,
    );
  });

  it("the gold option still gains gold and reinforces nothing", () => {
    const state = cityHallRound("necro-gold", [
      few("army_skel", "necropolis.skeletons"),
    ]);
    const goldBefore = state.players.p1.resources.gold;
    const gold = cityHallOption(state, "Gain 4 gold");
    expect(gold, "the gold City Hall option should be offered").toBeTruthy();
    const next = applyOk(state, gold!.action);
    expect(next.players.p1.resources.gold).toBe(goldBefore + 4);
    expect(
      next.players.p1.army.find((unit) => unit.id === "army_skel")?.side,
    ).toBe("few");
  });

  it("hides the reinforce option entirely when no bronze Few can be reinforced", () => {
    // Only a silver Few (Vampires) and an already-Packed bronze: neither is an
    // eligible bronze Few, so the reinforce option is not even offered — it
    // never becomes a dead/no-op choice.
    expect(coreUnitDefinitions["necropolis.vampires"].tier).toBe("silver");
    const state = cityHallRound("necro-hidden", [
      few("army_vamp", "necropolis.vampires"),
      {
        id: "army_skel",
        unitDefId: "necropolis.skeletons",
        side: "pack",
      } as ArmyUnitState,
    ]);
    expect(
      cityHallOption(state, "Reinforce 1 bronze unit for free"),
      "no reinforce option",
    ).toBeFalsy();
    expect(
      cityHallOption(state, "Gain 4 gold"),
      "the gold option still stands",
    ).toBeTruthy();
  });
});
