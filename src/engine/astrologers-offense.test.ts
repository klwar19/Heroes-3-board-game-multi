import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getEffectiveCardEffectForState } from "./effects";
import type { GameAction, GameEvent, GameState } from "./state";

function withOffense(state: GameState): GameState {
  state.adventure = {
    astrologers: { activeCardId: "astrologers.offense" },
  } as NonNullable<GameState["adventure"]>;
  return state;
}

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function duel(): GameState {
  const state = withOffense(createInitialGameState("astrologers-offense"));
  const combat = state.combat!;
  const attacker = combat.units.unit_p1_griffins;
  const defender = combat.units.unit_p2_vampires;
  attacker.type = "ground";
  attacker.position = 9;
  attacker.attack = 3;
  attacker.abilities = [];
  defender.type = "ground";
  defender.position = 13;
  defender.defense = 1;
  defender.maxHealth = 50;
  defender.damage = 0;
  defender.abilities = [];
  combat.units.unit_p1_marksmen.position = 0;
  combat.units.unit_p1_crusaders.position = 3;
  combat.units.unit_p2_skeletons.position = 19;
  combat.units.unit_p2_dread_knights.position = 16;
  combat.activeUnitId = attacker.id;
  combat.dice.scriptedRolls = [0, 0, 0, 0];
  combat.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.players.p1.deck = [];
  state.players.p2.hand = [];
  return state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId,
    });
  }
  return current;
}

describe("Astrologers — Offense", () => {
  it("covers every standard positive Defense face in the complete card library", () => {
    const state = withOffense(createInitialGameState("offense-library-audit"));
    let audited = 0;
    for (const card of Object.values(cardLibrary)) {
      const faces = card.effect.type === "CHOOSE_ONE"
        ? card.effect.options.map((option, optionIndex) => ({ effect: option.effect, optionIndex }))
        : [{ effect: card.effect, optionIndex: undefined }];
      for (const face of faces) {
        const positiveInstantDefense =
          face.effect.type === "ADD_COMBAT_STAT" &&
          face.effect.stat === "defense" &&
          (face.effect.amount > 0 || Object.values(face.effect.amountByPower ?? {}).some((amount) => amount > 0));
        const ongoingDefense = face.effect.type === "CREATE_DEFENSE_BUFF";
        if (!positiveInstantDefense && !ongoingDefense) continue;

        audited += 1;
        const adjusted = getEffectiveCardEffectForState(state, card, face.optionIndex);
        expect(adjusted?.type, `${card.id} defense face`).toBe(
          positiveInstantDefense ? "ADD_COMBAT_STAT" : "CREATE_ATTACK_BUFF",
        );
        if (positiveInstantDefense && adjusted?.type === "ADD_COMBAT_STAT") {
          expect(adjusted.stat, `${card.id} instant stat`).toBe("attack");
        }
      }
    }
    expect(audited, "the audit must exercise the real catalogue").toBeGreaterThan(20);
  });

  it.each([
    ["Statistic", "stat.defense"],
    ["Ability", "ability.armorer"],
    ["Artifact", "artifact.buckler_of_the_gnoll_king"],
    ["Spell", "spell.shield"],
  ])("reinterprets an instant Defense %s face as Attack", (_source, cardId) => {
    const state = withOffense(createInitialGameState(`offense-${cardId}`));
    const card = cardLibrary[cardId]!;
    const optionIndex = card.effect.type === "CHOOSE_ONE" ? card.effect.options.findIndex(
      (option) => option.effect.type === "ADD_COMBAT_STAT" && option.effect.stat === "defense",
    ) : undefined;
    const effect = getEffectiveCardEffectForState(state, card, optionIndex);

    expect(effect).toMatchObject({ type: "ADD_COMBAT_STAT", stat: "attack" });
  });

  it("reinterprets an ongoing Defense buff as an ongoing Attack buff", () => {
    const state = withOffense(createInitialGameState("offense-ongoing"));
    const effect = getEffectiveCardEffectForState(state, cardLibrary["spell.air_shield"]!);

    expect(effect).toMatchObject({
      type: "CREATE_ATTACK_BUFF",
      name: "Air Shield",
      amountByPower: { 0: 1, 1: 2, 2: 3 },
      duration: { type: "combat" },
    });
  });

  it.each([
    ["Statistic", "stat.defense", undefined, 1],
    ["Ability", "ability.armorer", undefined, 1],
    ["Ability/Spell-defense", "ability.interference", undefined, 1],
    ["Artifact", "artifact.buckler_of_the_gnoll_king", 1, 1],
    ["Spell", "spell.shield", undefined, 1],
  ] as const)("offers a converted instant Defense %s to the attacker and applies its Attack", (_source, cardId, optionIndex, bonus) => {
    let state = duel();
    state.players.p1.hand = [cardId];

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires",
    });
    const play = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "PLAY_REACTION" &&
        entry.action.cardId === cardId &&
        entry.action.optionIndex === optionIndex &&
        (entry.action.mode ?? "basic") === "basic",
    );
    expect(play, "the converted instant belongs in the attacker's reaction window").toBeTruthy();

    state = passAll(applyOk(state, play!.action));
    const hit = [...state.eventLog].reverse().find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === "unit_p1_griffins" && !event.isRetaliation,
    );
    expect(hit?.attackBonus).toBe(bonus);
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(2 + bonus);
  });

  it("resolves an ongoing Defense Spell as a combat-long Attack effect", () => {
    let state = duel();
    state.players.p1.hand = ["spell.air_shield"];
    const cast = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "CAST_SPELL" &&
        entry.action.cardId === "spell.air_shield" &&
        entry.action.target?.type === "unit" &&
        entry.action.target.unitId === "unit_p1_griffins",
    );
    expect(cast).toBeTruthy();

    state = passAll(applyOk(state, cast!.action));
    const effect = state.activeEffects.find(
      (candidate) =>
        candidate.source.type === "card" &&
        candidate.source.cardId === "spell.air_shield" &&
        candidate.target?.type === "unit" &&
        candidate.target.unitId === "unit_p1_griffins",
    );
    expect(effect?.duration).toEqual({ type: "combat" });
    expect(effect?.modifiers).toContainEqual({ type: "ATTACK_BONUS", amount: 1 });
    expect(effect?.modifiers.some((modifier) => modifier.type === "DEFENSE_BONUS")).toBe(false);
  });

  it("converts the Defense component of the Polish balance Prayer into a second Attack bonus", () => {
    let state = duel();
    state.adventure!.houseRules = { "polish-card-balance": true };
    state.players.p1.hand = ["spell.prayer"];
    const cast = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "CAST_SPELL" &&
        entry.action.cardId === "spell.prayer" &&
        entry.action.target.type === "unit" &&
        entry.action.target.unitId === "unit_p1_griffins",
    );
    expect(cast).toBeTruthy();

    state = passAll(applyOk(state, cast!.action));
    const prayer = state.activeEffects.find(
      (effect) =>
        effect.name === "Prayer" &&
        effect.target?.type === "unit" &&
        effect.target.unitId === "unit_p1_griffins",
    );
    expect(prayer?.modifiers).toEqual([
      { type: "ATTACK_BONUS", amount: 1 },
      { type: "ATTACK_BONUS", amount: 1 },
      { type: "INITIATIVE_BONUS", amount: 1 },
    ]);
  });

  it("applies converted Defense cards correctly in a batched reaction", () => {
    let state = duel();
    state.players.p1.hand = ["stat.defense", "ability.armorer"];
    state.players.p1.deck = [];
    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_vampires",
    });

    state = applyOk(state, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: "stat.defense", mode: "basic" },
        { cardId: "ability.armorer", mode: "basic" },
      ],
    });
    state = passAll(state);
    const hit = [...state.eventLog].reverse().find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === "unit_p1_griffins" && !event.isRetaliation,
    );
    expect(hit?.attackBonus).toBe(2);
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(4);
  });

  it("stops reinterpreting cards as soon as the proclamation expires", () => {
    const state = withOffense(createInitialGameState("offense-expiry"));
    expect(getEffectiveCardEffectForState(state, cardLibrary["stat.defense"]!)).toMatchObject({ stat: "attack" });
    state.adventure!.astrologers!.activeCardId = null;
    expect(getEffectiveCardEffectForState(state, cardLibrary["stat.defense"]!)).toMatchObject({ stat: "defense" });
  });

  it("does not turn Defense penalties into Attack penalties", () => {
    const state = withOffense(createInitialGameState("offense-penalty"));
    const effect = getEffectiveCardEffectForState(state, cardLibrary["spell.curse"]!);
    expect(effect).toMatchObject({ type: "ADD_COMBAT_STAT", stat: "defense" });
  });
});
