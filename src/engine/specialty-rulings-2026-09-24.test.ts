import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import type { CardId, GameAction, GameState } from "./state";

/**
 * USER RULINGS 2026-09-24 — each rule checked on the real engine against a
 * CONTROL where the old and new behaviour diverge.
 *  - Zeestral IV / VI: hit the chosen enemy (1 / 2), then pick adjacent units
 *    one at a time (friend or foe, 1 each); the first pick is required, then the
 *    caster may STOP. The centre needs only 1 living neighbour.
 *  - Dace IV: the "HP to 0" arm is an Ongoing TURN play; the Draw arm is an
 *    Instant (off-turn + instant windows). It fires on a Few KILL as well as on
 *    a Pack→Few flip.
 *  - Verdish VI: heals on a Pack→Few flip too, not only on a removal.
 *  - Korbac IV: a plain permanent — enters play on the map, replaced by the
 *    next permanent.
 *  - Isra I: joins an attack window, fetches, and the attack still resolves.
 *
 * Board (4×5): Marksmen@14 vs Skeletons@13 (neighbours 9 Dread Knights, 14).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function board(hand: CardId[], skeletons: { variant?: "few" | "pack"; maxHealth?: number } = {}): GameState {
  const state = createInitialGameState("instant-window-seed");
  state.players.p1.hand = [...hand];
  state.players.p1.discard = ["ability.tactics"];
  state.players.p2.hand = [];
  const units = state.combat!.units;
  const marksmen = units.unit_p1_marksmen;
  marksmen.position = 14;
  marksmen.type = "ground";
  marksmen.attack = 1;
  marksmen.defense = 0;
  marksmen.maxHealth = 20;
  marksmen.abilities = [];
  marksmen.activatedThisRound = false;
  marksmen.attackedThisActivation = false;
  const target = units.unit_p2_skeletons;
  target.position = 13;
  target.maxHealth = skeletons.maxHealth ?? 30;
  target.attack = 1;
  target.defense = 0;
  target.variant = skeletons.variant ?? "few";
  target.abilities = [];
  units.unit_p2_vampires.position = 10;
  units.unit_p2_dread_knights.position = 9;
  units.unit_p1_griffins.position = 0;
  units.unit_p1_crusaders.position = 1;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = marksmen.id;
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return state;
}

function offTurn(state: GameState): GameState {
  const skeletons = state.combat!.units.unit_p2_skeletons;
  skeletons.activatedThisRound = false;
  skeletons.attackedThisActivation = false;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = skeletons.id;
  return state;
}

const plays = (state: GameState, cardId: CardId) =>
  getLegalActions(state, "p1").filter((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId);

const attack: GameAction = { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" };

function passWindows(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 10 && next.reactionWindow; guard += 1) {
    const pass = (["p1", "p2"] as const)
      .flatMap((playerId) => getLegalActions(next, playerId))
      .find((legal) => legal.action.type === "PASS_REACTION");
    if (!pass) break;
    next = applyOk(next, pass.action);
  }
  return next;
}

describe("Zeestral Storm Circuit IV / VI — pick adjacent units, then may stop", () => {
  it.each([
    ["specialty.zeestral.4", 1, 2],
    ["specialty.zeestral.6", 2, 4]
  ] as const)("%s: centre takes %i, the first pick is required, then Stop ends it", (cardId, centre, picks) => {
    let state = board([cardId]);
    const play = plays(state, cardId).find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" && legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(play, "offered on the Skeletons").toBeTruthy();
    state = applyOk(state, play!.action);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(centre);
    const first = state.pendingChoice;
    expect(first?.type === "ABILITY_TARGET_CHOICE" && first.kind).toBe("area-pick");
    expect(first?.type === "ABILITY_TARGET_CHOICE" && first.picksRemaining).toBe(picks);
    // The required first pick: friend AND foe are candidates, no Stop yet.
    expect(first?.type === "ABILITY_TARGET_CHOICE" && [...first.candidateUnitIds].sort()).toEqual(["unit_p1_marksmen", "unit_p2_dread_knights"]);
    expect(first?.type === "ABILITY_TARGET_CHOICE" && Boolean(first.optional)).toBe(false);
    const hitKnights = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === "unit_p2_dread_knights"
    );
    state = applyOk(state, hitKnights!.action);
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    // After the minimum: optional — Stop is offered and ends the blast.
    const second = state.pendingChoice;
    expect(second?.type === "ABILITY_TARGET_CHOICE" && second.optional).toBe(true);
    const stop = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === "skip"
    );
    expect(stop, "Stop is offered once the first pick is made").toBeTruthy();
    state = applyOk(state, stop!.action);
    expect(state.pendingChoice).toBeNull();
    expect(state.combat!.units.unit_p1_marksmen.damage, "the friendly neighbour was spared").toBe(0);
  });

  it("needs only 1 living neighbour: offered on a 1-neighbour enemy, never on a lone one", () => {
    const state = board(["specialty.zeestral.4"]);
    const units = state.combat!.units;
    units.unit_p2_dread_knights.position = 3; // Skeletons@13 keeps just Marksmen@14
    units.unit_p2_vampires.position = 19; // Vampires@19: neighbours 14/18 — Marksmen@14 is one
    units.unit_p1_marksmen.position = 5; // now Skeletons@13 and Vampires@19 have no neighbour
    const targets = plays(state, "specialty.zeestral.4").map((legal) =>
      legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" ? legal.action.target.unitId : null
    );
    // CONTROL: Dread Knights@3 has no living neighbour either → no target at all.
    expect(targets).toEqual([]);
    units.unit_p1_marksmen.position = 14; // back beside Skeletons@13 (and Vampires@19)
    const withNeighbour = plays(state, "specialty.zeestral.4").map((legal) =>
      legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" ? legal.action.target.unitId : null
    );
    expect(withNeighbour).toContain("unit_p2_skeletons");
  });
});

describe("Dace's Minotaurs IV — Ongoing HP-to-0 arm, Instant draw arm", () => {
  it("own turn offers both arms; off-turn only the Instant draw", () => {
    const own = plays(board(["specialty.dace.4"]), "specialty.dace.4").map((legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex);
    expect(own.sort()).toEqual([0, 1]);
    const off = plays(offTurn(board(["specialty.dace.4"])), "specialty.dace.4").map((legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex);
    expect(off).toEqual([1]);
  });

  it.each(["few", "pack"] as const)("fires when the attack brings a %s enemy's HP to 0 (CONTROL: no card, no choice)", (variant) => {
    for (const withCard of [true, false]) {
      let state = board(withCard ? ["specialty.dace.4"] : [], { variant, maxHealth: 1 });
      if (withCard) {
        const arm = plays(state, "specialty.dace.4").find((legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 0);
        state = applyOk(state, arm!.action);
      }
      state = passWindows(applyOk(state, attack));
      const prompt = state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.prompt : "";
      expect(prompt.includes("Minotaurs IV"), `${variant} with card=${withCard}`).toBe(withCard);
    }
  });
});

describe("Verdish's First Aid VI — a Pack→Few flip counts as HP to 0", () => {
  it("heals the attacker on the flip (CONTROL: no card, no heal)", () => {
    const results: number[] = [];
    for (const withCard of [true, false]) {
      let state = board(withCard ? ["specialty.verdish.6"] : [], { variant: "pack", maxHealth: 1 });
      state.combat!.units.unit_p1_marksmen.damage = 5;
      state.combat!.units.unit_p2_skeletons.attack = 0; // no retaliation noise
      if (withCard) {
        state = applyOk(state, plays(state, "specialty.verdish.6")[0].action);
      }
      state = passWindows(applyOk(state, attack));
      expect(state.combat!.units.unit_p2_skeletons.variant, "the Pack flipped").toBe("few");
      results.push(state.combat!.units.unit_p1_marksmen.damage);
    }
    expect(results[0]).toBe(results[1] - 1);
  });
});

describe("Korbac's Dragon Flies IV — a real permanent", () => {
  it("enters play on the map and is replaced by the next permanent", () => {
    let state = createAdventureGameState({
      seed: "korbac-permanent",
      rollFirstPlayer: false,
      events: false,
      players: [
        { id: "p1", name: "Korbac", factionId: "fortress", heroDefId: "korbac" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const refresh = getLegalActions(state, "p1").find((legal) => legal.action.type === "REFRESH_HAND");
    state = applyOk(state, refresh!.action);
    state.players.p1.hand = ["specialty.korbac.4", "ability.fire_magic"];
    const enter = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.korbac.4"
    );
    expect(enter, "offered on the map turn").toBeTruthy();
    state = applyOk(state, enter!.action);
    expect(state.players.p1.permanents).toEqual(["specialty.korbac.4"]);
    const fireMagic = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.fire_magic"
    );
    state = applyOk(state, fireMagic!.action);
    expect(state.players.p1.permanents).toEqual(["ability.fire_magic"]);
    expect(state.players.p1.discard).toContain("specialty.korbac.4");
  });
});

describe("Isra's Necromancy I — an Instant that joins the attack window", () => {
  it("fetches inside the window and the attack still resolves exactly like a pass (CONTROL)", () => {
    const outcome = (withIsra: boolean) => {
      let state = applyOk(board(withIsra ? ["specialty.isra.1"] : ["stat.attack"]), attack);
      if (withIsra) {
        const play = getLegalActions(state, "p1").find((legal) => "cardId" in legal.action && legal.action.cardId === "specialty.isra.1");
        expect(play, "offered inside the attack window").toBeTruthy();
        state = applyOk(state, play!.action);
        const pick = getLegalActions(state, "p1").find((legal) => legal.action.type === "CHOOSE_OPTION");
        state = applyOk(state, pick!.action);
        expect(state.players.p1.hand.length, "a card was fetched into hand").toBe(1);
      }
      state = passWindows(state);
      return state.combat!.units.unit_p2_skeletons.damage;
    };
    expect(outcome(true)).toBe(outcome(false));
  });
});
