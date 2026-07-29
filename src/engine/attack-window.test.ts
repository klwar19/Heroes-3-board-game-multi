import { describe, expect, it } from "vitest";
import { applyAction } from "./index";
import { createInitialGameState } from "./setup";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function lastAttackBonus(state: GameState): number | null {
  const rolled = [...state.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
  return rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null;
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

describe("Bless can suppress an enemy attack", () => {
  it("lets the defender Bless the enemy ground/flying attacker and suppresses its die-triggered ability", () => {
    let state = declareMeleeAttack([], ["spell.bless"]);
    const attacker = state.combat!.units.unit_p1_griffins;
    const defender = state.combat!.units.unit_p2_skeletons;
    attacker.attack = 5;
    attacker.abilities = ["dread-knight-death-blow"];
    defender.defense = 0;
    defender.maxHealth = 40;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.combat!.dice.scriptedRolls = [1];
    state.combat!.dice.rollCount = 0;

    const offered = state.reactionWindow?.legalReactions.p2 ?? [];
    expect(
      offered.some(
        (entry) =>
          entry.action.type === "PLAY_REACTION" &&
          entry.action.cardId === "spell.bless" &&
          !entry.action.asPowerBoost
      )
    ).toBe(true);

    state = applyOk(state, {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "spell.bless",
      mode: "basic"
    });
    state = passAll(state);

    // No Attack die was consumed, its synthetic zero did not trigger Death
    // Blow, and the hit is exactly printed Attack 5 against Defense 0.
    expect(state.combat!.dice.rollCount).toBe(0);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(5);
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "dread-knight-death-blow"
      )
    ).toBe(false);
    const attack = [...state.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
    expect(attack?.type === "ATTACK_ROLLED" ? attack.noDie : false).toBe(true);
  });
});

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

  it("accepts a lone-Power BATCH once an instant empowers the attack (batch matches the single-play path)", () => {
    // Play Bloodlust on its own, then submit the two Power statistics as ONE
    // PLAY_REACTIONS batch with no spell in it. The single-play route already
    // allows this once the attack is empowerable; the batch validator used to
    // reject it unconditionally, so the UI (which offers it) let the player
    // Confirm a batch the engine then bounced. Power 2 lifts Bloodlust to +3.
    const state = declareMeleeAttack(["spell.bloodlust", "stat.power", "stat.power"], []);
    const afterSpell = applyOk(state, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" });
    expect(afterSpell.reactionWindow?.priorityPlayerId).toBe("p1");

    const batched = applyOk(afterSpell, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: "stat.power", mode: "basic" },
        { cardId: "stat.power", mode: "basic" }
      ]
    });
    const rolled = [...batched.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null).toBe(3);
  });

  it("still rejects a lone-Power BATCH when nothing on the attack is empowerable (control)", () => {
    // The window is open (Bloodlust is a pairable spell), but no instant has been
    // played, so a power-only batch still dissipates — the batch validator keeps
    // the same guard as the single-play route.
    const state = declareMeleeAttack(["spell.bloodlust", "stat.power", "stat.power"], []);
    const result = applyAction(state, {
      type: "PLAY_REACTIONS",
      playerId: "p1",
      plays: [
        { cardId: "stat.power", mode: "basic" },
        { cardId: "stat.power", mode: "basic" }
      ]
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

  it("credits standing School-of-Magic Power to a spell instant played as a reaction", () => {
    // Fire Magic in play grants +1 standing Power to Fire spells. Bloodlust
    // (Fire) played as a reaction should be lifted to Power 1 → +2 attack, the
    // same standing Power a spell cast on your own turn receives.
    const state = declareMeleeAttack(["spell.bloodlust"], []);
    state.players.p1.permanents = ["ability.fire_magic"];
    const next = applyOk(state, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" });
    const rolled = [...next.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null).toBe(2);
  });

  it("without the School permanent the same reaction Bloodlust is only +1 (standing-power guard)", () => {
    const state = declareMeleeAttack(["spell.bloodlust"], []);
    const next = applyOk(state, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" });
    const rolled = [...next.eventLog].reverse().find((event) => event.type === "ATTACK_ROLLED");
    expect(rolled && rolled.type === "ATTACK_ROLLED" ? rolled.attackBonus : null).toBe(1);
  });

  it("keeps each side's attack-window Power separate (a defender debuff is not inflated by the attacker's Power)", () => {
    // p1 lifts Bloodlust to +2 with a Power statistic; p2 then plays Weakness
    // with no Power of its own. Per-caster pools mean Weakness stays at its base
    // -1 (a shared pool would wrongly read p1's Power and make it -2).
    const state = declareMeleeAttack(["spell.bloodlust", "stat.power"], ["spell.weakness"]);
    let s = applyOk(state, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.bloodlust", mode: "basic" });
    // p1 spends its last card (the Power statistic), so priority passes to p2.
    s = applyOk(s, { type: "PLAY_REACTION", playerId: "p1", cardId: "stat.power", mode: "basic" });
    s = applyOk(s, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.weakness", mode: "basic" });
    s = passAll(s);
    // Bloodlust +2 (p1 paid 1 Power) and Weakness -1 (p2 paid none) → net +1.
    expect(lastAttackBonus(s)).toBe(1);
  });

  it("credits standing School-of-Magic Power to a defender's debuff too", () => {
    // Water Magic in play grants the defender +1 standing Power to Weakness
    // (Water), lifting it to Power 1 → -2 attack on the attacker (vs -1 without).
    const state = declareMeleeAttack([], ["spell.weakness"]);
    state.players.p2.permanents = ["ability.water_magic"];
    const griffins = state.combat!.units.unit_p1_griffins;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    griffins.abilities = [];
    skeletons.abilities = [];
    griffins.attack = 8;
    skeletons.defense = 2;
    skeletons.maxHealth = 40;
    skeletons.damage = 0;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    // p1 holds nothing, so priority is the defender's. Weakness at Power 1 → -2.
    let s = applyOk(state, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.weakness", mode: "basic" });
    s = passAll(s);
    // 8 attack − 2 (Weakness, standing-empowered) − 2 defense + 0 die = 4.
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(4);
  });

  it("a defender's Weakness without standing Power is only −1 (standing-power guard)", () => {
    const state = declareMeleeAttack([], ["spell.weakness"]);
    const griffins = state.combat!.units.unit_p1_griffins;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    griffins.abilities = [];
    skeletons.abilities = [];
    griffins.attack = 8;
    skeletons.defense = 2;
    skeletons.maxHealth = 40;
    skeletons.damage = 0;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    let s = applyOk(state, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.weakness", mode: "basic" });
    s = passAll(s);
    // 8 attack − 1 (Weakness, no standing) − 2 defense + 0 die = 5.
    expect(s.combat!.units.unit_p2_skeletons.damage).toBe(5);
  });

  it("retaliation reverses the roles: each side still empowers its own spell from its own Power pool", () => {
    // p1's griffins attack p2's skeletons; with no reactions to p1's attack the
    // skeletons' retaliation opens, where the roles flip: p2 is now the attacker
    // (buffs its retaliating unit) and p1 is now the defender (debuffs the
    // retaliator). Each must still scale only with the Power IT pools.
    const state = createInitialGameState("attack-window-seed");
    state.players.p1.hand = ["spell.weakness"]; // original attacker, now defending the retaliation
    state.players.p2.hand = ["spell.bloodlust", "stat.power"]; // original defender, now retaliating
    const griffins = state.combat!.units.unit_p1_griffins;
    const skeletons = state.combat!.units.unit_p2_skeletons;
    griffins.abilities = [];
    skeletons.abilities = [];
    griffins.position = 9;
    skeletons.position = 13;
    griffins.maxHealth = 60;
    griffins.damage = 0;
    skeletons.maxHealth = 60;
    skeletons.damage = 0;
    skeletons.attack = 8;
    griffins.defense = 2;
    state.combat!.dice.scriptedRolls = new Array(12).fill(0);
    state.combat!.dice.rollCount = 0;

    // p1's attack resolves with no reactions; the retaliation window opens on p2.
    let s = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(s.reactionWindow?.priorityPlayerId).toBe("p2");

    // Retaliating side (p2) empowers Bloodlust on the skeletons: pool 1 → +2.
    s = applyOk(s, { type: "PLAY_REACTION", playerId: "p2", cardId: "spell.bloodlust", mode: "basic" });
    s = applyOk(s, { type: "PLAY_REACTION", playerId: "p2", cardId: "stat.power", mode: "basic" });
    // Original attacker (p1), now the defender, nerfs the retaliation with
    // Weakness and no Power of its own → its own pool is 0 → only −1.
    s = applyOk(s, { type: "PLAY_REACTION", playerId: "p1", cardId: "spell.weakness", mode: "basic" });
    s = passAll(s);

    // Retaliation: 8 attack + 2 (p2 Bloodlust) − 1 (p1 Weakness, own pool 0) − 2
    // defense + 0 die = 7. A shared pool would feed p2's Power into p1's Weakness
    // (−2), wrongly netting 6.
    expect(s.combat!.units.unit_p1_griffins.damage).toBe(7);
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
