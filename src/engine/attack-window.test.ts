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

  it("lets the caster keep empowering a spell instant played earlier in the same attack window", () => {
    // p1 casts Bloodlust on its own (power 0 → +1 attack), keeps priority, then
    // pays the Power statistic as a SEPARATE play to lift it to +2. p2 holds no
    // instants, so the window only closes once p1 has finished empowering.
    const state = declareMeleeAttack(["spell.bloodlust", "stat.power"], []);

    const afterSpell = applyOk(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.bloodlust",
      mode: "basic"
    });

    // The window is still open with p1 on priority, and Power is now offered
    // (it was illegal a moment ago with nothing on the table to empower).
    expect(afterSpell.reactionWindow?.priorityPlayerId).toBe("p1");
    const offers = afterSpell.reactionWindow?.legalReactions.p1 ?? [];
    expect(
      offers.some((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power")
    ).toBe(true);

    const afterPower = applyOk(afterSpell, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "basic"
    });

    const rolled = [...afterPower.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null).toBe(2);
  });

  it("still rejects a lone Power play before any empowerable spell is on the table", () => {
    // Nothing has been cast into the attack yet, so the Power statistic still
    // "dissipates" and cannot be played on its own (regression guard).
    const state = declareMeleeAttack(["spell.bloodlust", "stat.power"], []);
    const result = applyAction(state, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "basic"
    });
    expect(result.errors[0]?.message).toContain("Power can only be played into an attack together with a Spell card");
  });

  it("re-derives the spell bonus from the FINAL Power across several separate empower plays", () => {
    // Bloodlust, then two Power plays one at a time: power 2 lifts it to +3.
    const state = declareMeleeAttack(["spell.bloodlust", "stat.power", "stat.power"], []);
    let next = applyOk(state, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" });
    next = applyOk(next, { type: "PLAY_REACTION", playerId: "p1", cardId: "stat.power", mode: "basic" });
    next = applyOk(next, { type: "PLAY_REACTION", playerId: "p1", cardId: "stat.power", mode: "basic" });

    const rolled = [...next.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null).toBe(3);
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
