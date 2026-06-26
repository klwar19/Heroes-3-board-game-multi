import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameEvent, GameState } from "./state";

/**
 * Regression coverage for spell.prayer (CLAUDE.md rule #1). Prayer was WIRED BUT
 * UNTESTED. It is a CHOOSE_ONE spell with three arms (src/data/cards/spells.ts):
 *   option 0 — +X attack (trigger: self attack-declared),
 *   option 1 — +X defense (trigger: opponent attack-declared),
 *   option 2 — CREATE_INITIATIVE_BUFF (no trigger).
 * Each option scales amountByPower {0:1, 2:2, 4:3}.
 *
 * These tests assert the OBSERVABLE combat outcome of the two arms that the engine
 * actually offers and resolves:
 *   - option 0: the attacker deals MORE damage,
 *   - option 1: the defender takes LESS damage,
 * each against a control with no Prayer.
 *
 * Option 2 (initiative) is NOT covered by a passing test because it is a CONFIRMED
 * ENGINE BUG: a trigger-free CHOOSE_ONE spell option has no offer path. The cast
 * loop in legal-actions.ts skips CHOOSE_ONE spells ("route through the card
 * plays"); addPlayableCardActions skips spells entirely; and variantMatchesTrigger
 * only slots a trigger-free variant into a reaction window when its effect is
 * DRAW_CARDS. So Prayer's initiative arm is never offered to any player in any
 * phase (verified by exhaustively scanning getLegalActions / getOffTurnCombat-
 * Reactions). The assertion below is a DATA guard documenting that the arm exists
 * and remains dead; it is not proof the effect works. See the agent report.
 *
 * Sandbox: p1 griffins/crusaders, p2 skeletons. Board 4x5.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function passUntil(state: GameState, playerId: "p1" | "p2"): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function lastHitBy(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation
    );
}

function prayerReaction(
  state: GameState,
  playerId: "p1" | "p2",
  optionIndex: number
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === "spell.prayer" &&
      entry.action.optionIndex === optionIndex &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

/** Griffins (attacker, attack 5) adjacent to skeletons (defender, defense 0), attack declared. */
function declareMelee(seed: string, p1Hand: string[], p2Hand: string[]): GameState {
  const state = createInitialGameState(seed);
  const combat = state.combat!;
  const griffins = combat.units.unit_p1_griffins;
  const skeletons = combat.units.unit_p2_skeletons;
  griffins.attack = 5;
  griffins.defense = 0;
  griffins.abilities = [];
  griffins.position = 9;
  griffins.maxHealth = 50;
  griffins.damage = 0;
  skeletons.attack = 5;
  skeletons.defense = 0;
  skeletons.abilities = [];
  skeletons.position = 13;
  skeletons.maxHealth = 50;
  skeletons.damage = 0;
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0]; // 0 face: damage = attack − defense
  combat.dice.rollCount = 0;
  combat.activeUnitId = "unit_p1_griffins";
  state.activePlayerId = "p1";
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [...p2Hand];
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
}

describe("Prayer — option 0 (+attack, attacker)", () => {
  it("control: the attacker deals only its base damage with no Prayer", () => {
    const resolved = passAllReactions(declareMelee("prayer0-control", [], []));
    const hit = lastHitBy(resolved, "unit_p1_griffins");
    expect(hit?.attackBonus).toBe(0);
    expect(hit?.damage).toBe(5); // 5 attack − 0 defense, die 0
  });

  it("raises the attacker's damage when the attacker plays the +attack arm", () => {
    const declared = passUntil(declareMelee("prayer0-buff", ["spell.prayer"], []), "p1");
    const play = prayerReaction(declared, "p1", 0);
    expect(play, "Prayer +attack arm should be offered to the attacker").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    const hit = lastHitBy(resolved, "unit_p1_griffins");
    expect(hit?.attackBonus).toBe(1); // amountByPower[0] = +1
    expect(hit?.damage).toBe(6); // 5 + 1 − 0
  });
});

describe("Prayer — option 1 (+defense, defender)", () => {
  it("reduces the damage the defender takes when the defender plays the +defense arm", () => {
    const declared = passUntil(declareMelee("prayer1-buff", [], ["spell.prayer"]), "p2");
    const play = prayerReaction(declared, "p2", 1);
    expect(play, "Prayer +defense arm should be offered to the defender").toBeTruthy();
    const resolved = passAllReactions(applyOk(declared, play!));
    const hit = lastHitBy(resolved, "unit_p1_griffins");
    expect(hit?.defenseBonus).toBe(1); // amountByPower[0] = +1 defense
    // Observable: attack 5 − defense 1 = 4 damage (control deals 5).
    expect(hit?.damage).toBe(4);
    expect(resolved.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });
});

describe("Prayer — option 2 (+initiative) is a wired-but-unreachable arm (BUG)", () => {
  it("the initiative arm exists in the card data but the engine never offers it", () => {
    // Data guard: option 2 IS the CREATE_INITIATIVE_BUFF arm in the card.
    const prayer = cardLibrary["spell.prayer"];
    expect(prayer.effect.type).toBe("CHOOSE_ONE");
    if (prayer.effect.type === "CHOOSE_ONE") {
      expect(prayer.effect.options[2]?.effect.type).toBe("CREATE_INITIATIVE_BUFF");
      // …and it carries no trigger, which is exactly why it is unreachable.
      expect(prayer.effect.options[2]?.trigger).toBeUndefined();
    }

    // Behaviour guard: no player, in any combat phase, is ever offered Prayer
    // option 2. (If a future fix wires it, this test fails and should be replaced
    // by a real initiative/move-range assertion.)
    const offered: string[] = [];
    for (const activeUnit of ["unit_p1_griffins", "unit_p2_skeletons"]) {
      for (const activePlayer of ["p1", "p2"] as const) {
        const state = createInitialGameState(`prayer2-scan-${activeUnit}-${activePlayer}`);
        state.players.p1.hand = ["spell.prayer"];
        state.players.p2.hand = ["spell.prayer"];
        state.activePlayerId = activePlayer;
        state.combat!.activeUnitId = activeUnit;
        state.combat!.units[activeUnit].activatedThisRound = false;
        state.combat!.units[activeUnit].attackedThisActivation = false;
        for (const viewer of ["p1", "p2"] as const) {
          for (const legal of getLegalActions(state, viewer)) {
            const action = legal.action as { cardId?: string; optionIndex?: number };
            if (action.cardId === "spell.prayer" && action.optionIndex === 2) {
              offered.push(`${viewer}/${activeUnit}/${activePlayer}`);
            }
          }
        }
      }
    }
    expect(offered, "Prayer's initiative arm is currently dead — see agent report").toEqual([]);
  });
});
