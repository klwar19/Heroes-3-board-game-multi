import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

function setActiveUnit(state: GameState, playerId: PlayerId, unitId: string): void {
  if (!state.combat) {
    throw new Error("Expected combat setup.");
  }
  state.activePlayerId = playerId;
  state.combat.activeUnitId = unitId;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  while (current.reactionWindow) {
    const playerId = current.reactionWindow.priorityPlayerId;
    current = applyOk(current, { type: "PASS_REACTION", playerId });
  }
  return current;
}

/** END_COMBAT_ROUND with the active unit cleared (round may end any time here). */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

describe("permanent cards", () => {
  it("replaces the previous permanent, which goes to the discard pile", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["war_machine.first_aid_tent", "ability.fire_magic"];

    const first = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    expect(first.players.p1.permanents).toEqual(["war_machine.first_aid_tent"]);

    const second = applyOk(first, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.fire_magic",
      target: { type: "none" }
    });
    expect(second.players.p1.permanents).toEqual(["ability.fire_magic"]);
    expect(second.players.p1.discard).toContain("war_machine.first_aid_tent");
    expect(second.players.p1.hand).toHaveLength(0);
    // The replaced tent's combat effect leaves with it.
    expect(second.activeEffects.some((effect) => effect.name === "First Aid Tent")).toBe(false);
  });

  it("gives matching spells +1 power while a School of Magic is in play", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.permanents = ["ability.fire_magic"];
    state.players.p2.hand = [];

    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });
    const resolved = passAllReactions(cast);

    // Magic Arrow at printed power 0 deals 1; the school bonus lifts it to
    // power 1 -> 2 damage.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(2);
    // The permanent stays in play after using its basic effect.
    expect(resolved.players.p1.permanents).toEqual(["ability.fire_magic"]);
  });

  it("discards the school permanent for +3 power with the field expert effect", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.permanents = ["ability.earth_magic"];
    state.players.p2.hand = ["stat.defense"];

    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.magic_arrow",
      target: { type: "unit", unitId: "unit_p2_vampires" }
    });

    const expert = getLegalActions(cast, "p1").find((legal) => legal.action.type === "USE_PERMANENT_EXPERT");
    expect(expert).toBeDefined();

    const boosted = applyOk(cast, expert!.action);
    expect(boosted.players.p1.permanents).toEqual([]);
    expect(boosted.players.p1.discard).toContain("ability.earth_magic");
    expect(boosted.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);

    const resolved = passAllReactions(boosted);
    // Power 1 + 3 = 4 -> Magic Arrow deals its top bracket of 3.
    expect(resolved.combat?.units.unit_p2_vampires.damage).toBe(3);
  });

  it("fires the Ballista at the slowest enemy at the start of each combat round", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ballista"];
    // The Ballista always fires a single basic shot at the slowest enemy. (The
    // 3× same-target volley is the Artillery ability's expert side, not the
    // Ballista's — so crowns alone never change this.)
    state.players.p1.limits.expertUses = 0;

    const units = state.combat!.units;
    const enemies = Object.values(units).filter((unit) => unit.controllerId === "p2");
    const lowest = Math.min(...enemies.map((unit) => unit.initiative));
    // Keep a single slowest enemy so the shot resolves without a choice.
    const slowest = enemies.filter((unit) => unit.initiative === lowest);
    for (const unit of slowest.slice(1)) {
      unit.initiative += 1;
    }

    const next = endRound(state, "p1");
    expect(next.combat?.units[slowest[0].id].damage).toBe(1);
    expect(next.pendingChoice).toBeNull();
  });

  it("offers the Cannon shot for an expert use and applies 2 damage to the chosen enemy", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.cannon"];

    const offered = endRound(state, "p1");
    expect(offered.pendingChoice?.type).toBe("OPTION_CHOICE");

    const fire = getLegalActions(offered, "p1").find((legal) => legal.label.includes("Fire the Cannon"));
    expect(fire).toBeDefined();
    const aiming = applyOk(offered, fire!.action);
    expect(aiming.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(aiming.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");

    const shot = applyOk(aiming, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: aiming.pendingChoice!.id,
      targetUnitId: "unit_p2_vampires"
    });
    expect(shot.combat?.units.unit_p2_vampires.damage).toBe(2);
    expect(shot.combat?.warMachineRound ?? null).toBeNull();
  });

  it("lets the Cannon be skipped without spending anything", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.cannon"];

    const offered = endRound(state, "p1");
    const skip = getLegalActions(offered, "p1").find((legal) => legal.label === "Skip");
    expect(skip).toBeDefined();
    const skipped = applyOk(offered, skip!.action);
    expect(skipped.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    expect(skipped.pendingChoice).toBeNull();
    expect(Object.values(skipped.combat!.units).every((unit) => unit.damage === 0)).toBe(true);
  });

  it("fires the Catapult at two adjacent targets for 1 building material", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.catapult"];
    state.players.p1.resources.buildingMaterials = 2;

    // Positions 13 (vampires) and 14 (skeletons)... place two enemies side by side.
    const units = state.combat!.units;
    units.unit_p2_skeletons.position = 13;
    units.unit_p2_vampires.position = 14;

    const offered = endRound(state, "p1");
    const fire = getLegalActions(offered, "p1").find((legal) => legal.label.includes("Fire the Catapult"));
    expect(fire).toBeDefined();

    const aiming = applyOk(offered, fire!.action);
    expect(aiming.players.p1.resources.buildingMaterials).toBe(1);
    expect(aiming.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");

    const firstShot = applyOk(aiming, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: aiming.pendingChoice!.id,
      targetUnitId: "unit_p2_skeletons"
    });
    expect(firstShot.combat?.units.unit_p2_skeletons.damage).toBe(1);

    // The second target must be adjacent to the first.
    if (firstShot.pendingChoice) {
      expect(firstShot.pendingChoice.type).toBe("ABILITY_TARGET_CHOICE");
      const candidates =
        firstShot.pendingChoice.type === "ABILITY_TARGET_CHOICE" ? firstShot.pendingChoice.candidateUnitIds : [];
      expect(candidates).toContain("unit_p2_vampires");
      const second = applyOk(firstShot, {
        type: "CHOOSE_ABILITY_TARGET",
        playerId: "p1",
        choiceId: firstShot.pendingChoice.id,
        targetUnitId: "unit_p2_vampires"
      });
      expect(second.combat?.units.unit_p2_vampires.damage).toBe(1);
    } else {
      // Only one neighbor existed: the splash resolved on its own.
      expect(firstShot.combat?.units.unit_p2_vampires.damage).toBe(1);
    }
  });

  it("keeps the printed one-permanent limit unless Pandora's Box raises it to 3", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [
      "pandora.permanent_slots",
      "war_machine.first_aid_tent",
      "ability.fire_magic",
      "war_machine.ballista"
    ];

    // Pandora's "up to 3 permanents, including this one" enters play first.
    let current = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "pandora.permanent_slots",
      target: { type: "none" }
    });
    current = applyOk(current, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    current = applyOk(current, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.fire_magic",
      target: { type: "none" }
    });
    expect(current.players.p1.permanents).toEqual([
      "pandora.permanent_slots",
      "war_machine.first_aid_tent",
      "ability.fire_magic"
    ]);

    // A fourth permanent is over the raised limit: the oldest one leaves.
    current = applyOk(current, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.ballista",
      target: { type: "none" }
    });
    expect(current.players.p1.permanents).toEqual([
      "war_machine.first_aid_tent",
      "ability.fire_magic",
      "war_machine.ballista"
    ]);
    expect(current.players.p1.discard).toContain("pandora.permanent_slots");
  });

  it("voluntarily discards a permanent and re-enforces the limit when Pandora leaves", () => {
    const state = createInitialGameState();
    state.players.p1.permanents = ["pandora.permanent_slots", "war_machine.first_aid_tent", "ability.fire_magic"];
    state.players.p1.hand = [];

    const discard = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "DISCARD_PERMANENT" && legal.action.cardId === "pandora.permanent_slots"
    );
    expect(discard).toBeDefined();

    const next = applyOk(state, discard!.action);
    // Pandora's limit card left play, so the limit is 1 again: the oldest
    // extra permanent goes to the discard pile too.
    expect(next.players.p1.permanents).toEqual(["ability.fire_magic"]);
    expect(next.players.p1.discard).toEqual(
      expect.arrayContaining(["pandora.permanent_slots", "war_machine.first_aid_tent"])
    );
  });

  it("raises the hand limit while Pandora's hand-size permanent is in play", async () => {
    const { effectiveHandLimit } = await import("./adventure");
    const state = createInitialGameState();
    expect(effectiveHandLimit(state, "p1")).toBe(state.players.p1.limits.hand);
    state.players.p1.permanents = ["pandora.hand_size"];
    expect(effectiveHandLimit(state, "p1")).toBe(state.players.p1.limits.hand + 1);
  });

  it("lets Ammo Cart ranged units shoot adjacent targets without disadvantage and adds initiative", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ammo_cart"];

    const combat = state.combat!;
    const marksmen = combat.units.unit_p1_marksmen;
    const baseInitiative = marksmen.initiative;

    // Entering a combat round applies the cart (initiative) and waives the
    // adjacent-shot penalty.
    const next = endRound(state, "p1");
    const nextMarksmen = next.combat!.units.unit_p1_marksmen;
    expect(nextMarksmen.initiative).toBe(baseInitiative + 2);

    // Put an enemy right next to the marksmen: the shot stays a normal roll.
    next.combat!.units.unit_p2_skeletons.position = nextMarksmen.position + 1;
    setActiveUnit(next, "p1", "unit_p1_marksmen");
    const attacked = applyOk(next, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    const declared = [...attacked.eventLog].reverse().find((event) => event.type === "UNIT_ATTACK_DECLARED");
    expect(declared && declared.type === "UNIT_ATTACK_DECLARED" ? declared.rollMode : null).toBe("normal");
  });
});
