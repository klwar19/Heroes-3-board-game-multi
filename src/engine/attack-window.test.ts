import { describe, expect, it } from "vitest";
import { applyAction } from "./index";
import { createInitialGameState } from "./setup";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

/** Sandbox with the griffins adjacent to the skeletons, attack declared. */
function declareMeleeAttack(p1Hand: string[], p2Hand: string[]): GameState {
  const state = createInitialGameState("attack-window-seed");
  state.players.p1.hand = p1Hand;
  state.players.p2.hand = p2Hand;
  state.combat!.units.unit_p1_griffins.position = 9;
  state.combat!.units.unit_p2_skeletons.position = 13;

  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
}

describe("attack-window power pairing", () => {
  it("offers Power plays in an attack window only while an instant spell can pair with them", () => {
    // p1 holds Bloodlust (attack-trigger instant spell) + Power: both offered.
    const withSpell = declareMeleeAttack(["spell.bloodlust", "stat.power"], []);
    const p1Offers = withSpell.reactionWindow?.legalReactions.p1 ?? [];
    expect(p1Offers.some((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.bloodlust")).toBe(
      true
    );
    expect(p1Offers.some((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power")).toBe(
      true
    );

    // Without any pairable instant spell, no Power offers appear at all.
    const withoutSpell = declareMeleeAttack(["stat.power", "stat.power"], []);
    const noSpellOffers = withoutSpell.reactionWindow?.legalReactions.p1 ?? [];
    expect(noSpellOffers.some((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power")).toBe(
      false
    );
  });

  it("rejects a standalone Power play into an attack window", () => {
    const state = declareMeleeAttack(["spell.bloodlust", "stat.power"], []);
    const result = applyAction(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "basic"
    });
    expect(result.errors[0]?.message).toContain("Power can only be played into an attack together with a Spell card");
  });

  it("scales an instant spell with the Power played alongside it in one declaration", () => {
    const state = declareMeleeAttack(["spell.bloodlust", "stat.power", "spell.magic_arrow"], []);

    // Bloodlust + Power statistic + "Discard Magic Arrow: +1 Power" as one
    // declaration: power 2 lifts Bloodlust from +1 to +3 attack. Nobody else
    // can react, so the window closes and the attack die rolls right away.
    const played = applyOk(state, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: "spell.bloodlust", mode: "basic" },
        { cardId: "stat.power", mode: "basic" },
        { cardId: "spell.magic_arrow", mode: "basic", asPowerBoost: true }
      ]
    });

    const rolled = [...played.eventLog]
      .reverse()
      .find((event) => event.type === "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null).toBe(3);
    // The spell instant counted toward the one-spell-per-round limit.
    expect(played.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("still allows the +1 Power discard toward your own spell cast", () => {
    const state = createInitialGameState("attack-window-seed-2");
    state.players.p1.hand = ["spell.magic_arrow", "spell.bloodlust"];
    state.players.p2.hand = [];

    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    });

    const offers = cast.reactionWindow?.legalReactions.p1 ?? [];
    expect(
      offers.some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.asPowerBoost === true
      )
    ).toBe(true);
  });
});
