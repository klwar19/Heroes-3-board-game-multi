import { describe, expect, it } from "vitest";
import { abilityFxPlans } from "@/data/fx";
import { applyAction, createInitialGameState } from "./index";
import type { GameAction, GameState, LegalAction } from "./state";

/**
 * The lethal-save window now has three interchangeable sources — Alamar's
 * Resurrection specialty, the Resurrection spell and the Archangels' once-per-
 * combat ability — and a cancelled (saved) attack must apply none of its
 * after-attack effects. These tests drive a guaranteed-lethal attack on a p1
 * unit and exercise each source.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function hasAbilityEvent(state: GameState, abilityId: string): boolean {
  return state.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === abilityId);
}

function p1SaveActions(state: GameState): LegalAction[] {
  return state.reactionWindow?.legalReactions.p1 ?? [];
}

/**
 * Sets up a lethal melee attack on p1's Griffins and resolves it; the engine
 * pauses in the lethal-save window whenever p1 has a usable save. Options let
 * the attacker carry an after-attack ability, the defender take a grade, p1
 * hold save cards, and the Crusaders act as an Archangel (lethal-save unit).
 */
function lethalSetup(opts: {
  attackerAbilities?: string[];
  defenderGrade?: "bronze" | "silver" | "gold" | "azure";
  p1Hand?: string[];
  p1Permanents?: string[];
  archangelSaver?: boolean;
  archangelAlreadyUsed?: boolean;
  spellsAlreadyCast?: number;
  rolls?: number[];
  handLockP1?: boolean;
  p1Crowns?: number;
}): GameState {
  const state = createInitialGameState("lethal-save-seed");
  state.players.p1.hand = opts.p1Hand ?? [];
  state.players.p2.hand = [];
  if (opts.p1Crowns !== undefined) {
    state.players.p1.limits.expertUses = opts.p1Crowns;
  }
  // Permanents must be in play BEFORE the attack resolves so the standing spell
  // Power they grant is folded into the save window's precomputed legal reactions.
  if (opts.p1Permanents) {
    state.players.p1.permanents = opts.p1Permanents;
  }
  if (opts.spellsAlreadyCast !== undefined) {
    state.players.p1.combatStats.spellsCastThisRound = opts.spellsAlreadyCast;
  }
  if (opts.handLockP1) {
    // A Secondary Hero leads p1's side, so p1 "cannot use your Deck this
    // Combat" — exactly the case where the Archangel free save was lost.
    state.heroes.hero_p1.kind = "secondary";
    state.combat!.context = {
      kind: "player",
      attackerHeroId: "hero_p1",
      defenderHeroId: "hero_p2",
      fieldId: "f:0:0"
    };
  }

  const defender = state.combat!.units.unit_p1_griffins;
  defender.grade = opts.defenderGrade ?? "bronze";
  defender.position = 9;
  defender.defense = 0;
  defender.damage = defender.maxHealth - 1; // one hit from death

  if (opts.archangelSaver) {
    const archangel = state.combat!.units.unit_p1_crusaders;
    archangel.abilities = ["archangel-lethal-save"];
    archangel.position = 6;
    if (opts.archangelAlreadyUsed) {
      archangel.usedLethalSaveThisCombat = true;
    }
  }

  const attacker = state.combat!.units.unit_p2_skeletons;
  attacker.abilities = opts.attackerAbilities ?? [];
  attacker.attack = 5; // clearly lethal
  attacker.position = 13; // adjacent below the defender
  state.combat!.dice.scriptedRolls = opts.rolls ?? [0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";

  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p2",
    attackerId: "unit_p2_skeletons",
    defenderId: "unit_p1_griffins"
  });
}

function griffins(state: GameState) {
  return state.combat!.units.unit_p1_griffins;
}

describe("A resurrected (cancelled) attack applies no after-attack effects", () => {
  it("skips the attacker's Wyvern Poison Sting", () => {
    const declared = lethalSetup({ attackerAbilities: ["wyvern-sting"], p1Hand: ["specialty.alamar.6"] });
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");
    const save = p1SaveActions(declared).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.alamar.6"
    );
    const saved = applyOk(declared, save!.action);
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(hasAbilityEvent(saved, "wyvern-sting")).toBe(false); // the sting never rolled
    expect(griffins(saved).damage).toBe(griffins(saved).maxHealth - 1); // unscathed
  });

  it("skips the attacker's Gorgon Death Stare", () => {
    const declared = lethalSetup({ attackerAbilities: ["gorgon-death-stare"], p1Hand: ["specialty.alamar.6"] });
    const save = p1SaveActions(declared).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.alamar.6"
    );
    const saved = applyOk(declared, save!.action);
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(hasAbilityEvent(saved, "gorgon-death-stare")).toBe(false);
    expect(griffins(saved).variant).toBe("pack"); // not flipped — fully saved
  });
});

describe("Resurrection spell", () => {
  it("is offered in the save window and cancels the killing blow", () => {
    const declared = lethalSetup({ defenderGrade: "bronze", p1Hand: ["spell.resurrection"] });
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");
    const save = p1SaveActions(declared).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.resurrection"
    );
    expect(save, "the bronze Resurrection option should be offered").toBeTruthy();
    const saved = applyOk(declared, save!.action);
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(griffins(saved).damage).toBe(griffins(saved).maxHealth - 1);
    expect(saved.players.p1.discard).toContain("spell.resurrection");
    expect(saved.players.p1.combatStats.spellsCastThisRound).toBe(1); // counts as a spell
  });

  it("is blocked once the spell limit is reached (the specialty still works)", () => {
    const declared = lethalSetup({
      defenderGrade: "bronze",
      p1Hand: ["spell.resurrection", "specialty.alamar.6"],
      spellsAlreadyCast: 9
    });
    const offeredCardIds = p1SaveActions(declared)
      .map((legal) => (legal.action.type === "PLAY_REACTION" ? legal.action.cardId : null))
      .filter(Boolean);
    expect(offeredCardIds).not.toContain("spell.resurrection"); // spell limit reached
    expect(offeredCardIds).toContain("specialty.alamar.6"); // specialty is unaffected
  });
});

describe("Archangels' once-per-combat lethal save", () => {
  it("cancels a killing blow on another friendly unit for free, regardless of grade", () => {
    const declared = lethalSetup({ defenderGrade: "gold", archangelSaver: true });
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");
    const save = p1SaveActions(declared).find(
      (legal) => legal.action.type === "USE_UNIT_RESURRECTION" && legal.action.savingUnitId === "unit_p1_crusaders"
    );
    expect(save, "the Archangel save should be offered for a gold unit too").toBeTruthy();
    const saved = applyOk(declared, save!.action);
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(griffins(saved).damage).toBe(griffins(saved).maxHealth - 1);
    expect(saved.combat!.units.unit_p1_crusaders.usedLethalSaveThisCombat).toBe(true);
  });

  it("is not offered once already spent this combat (the specialty still is)", () => {
    const declared = lethalSetup({
      defenderGrade: "bronze",
      p1Hand: ["specialty.alamar.6"],
      archangelSaver: true,
      archangelAlreadyUsed: true
    });
    const actions = p1SaveActions(declared);
    expect(actions.some((legal) => legal.action.type === "USE_UNIT_RESURRECTION")).toBe(false);
    expect(
      actions.some((legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.alamar.6")
    ).toBe(true);
  });

  it("stays available — and is usable — when the controller cannot use their Deck", () => {
    // A hand-locked side (Secondary Hero / heroless garrison) plays no cards,
    // so the Resurrection spell is withheld, but the Archangels' free unit
    // ability is not a Deck card and must still save the killing blow.
    const declared = lethalSetup({
      defenderGrade: "gold",
      p1Hand: ["spell.resurrection"],
      archangelSaver: true,
      handLockP1: true
    });
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");

    const actions = p1SaveActions(declared);
    // The Deck card is withheld…
    expect(actions.some((legal) => legal.action.type === "PLAY_REACTION")).toBe(false);
    // …but the Archangel free save is offered.
    const save = actions.find(
      (legal) => legal.action.type === "USE_UNIT_RESURRECTION" && legal.action.savingUnitId === "unit_p1_crusaders"
    );
    expect(save, "the Archangel save must survive the hand lock").toBeTruthy();

    const saved = applyOk(declared, save!.action);
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(griffins(saved).damage).toBe(griffins(saved).maxHealth - 1); // fully saved
    expect(saved.combat!.units.unit_p1_crusaders.usedLethalSaveThisCombat).toBe(true);
  });
});

describe("Multiple save sources are all offered (the player chooses)", () => {
  it("lists the specialty, the spell and the Archangel for a bronze unit", () => {
    const declared = lethalSetup({
      defenderGrade: "bronze",
      p1Hand: ["specialty.alamar.6", "spell.resurrection"],
      archangelSaver: true
    });
    const actions = p1SaveActions(declared);
    const hasSpecialty = actions.some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.alamar.6"
    );
    const hasSpell = actions.some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.resurrection"
    );
    const hasArchangel = actions.some((legal) => legal.action.type === "USE_UNIT_RESURRECTION");
    expect(hasSpecialty).toBe(true);
    expect(hasSpell).toBe(true);
    expect(hasArchangel).toBe(true);
  });
});

describe("Resurrection specialty: the Power cost is value-based and buffed by spell power", () => {
  // The save's book/Power cost (silver = Power 2 at level I) is met by the VALUE
  // the player brings — standing spell Power plus each power source's printed
  // Power — not a raw card COUNT. "It can be improved by spell power, just like a
  // regular spell" (wiki). Each test below fails if the cost reverts to a fixed
  // discardCards count.
  function silverSave(state: GameState) {
    return p1SaveActions(state).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.alamar.1" &&
        legal.action.optionIndex === 1
    );
  }

  it("pays the Power-2 silver save with a SINGLE +2 source (value, not card count)", () => {
    const declared = lethalSetup({
      defenderGrade: "silver",
      p1Hand: ["specialty.alamar.1", "stat.power.empowered"]
    });
    const save = silverSave(declared);
    expect(save, "one +2 source brings Power 2 and affords the silver save").toBeTruthy();
    const action = save!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const saved = applyOk(declared, { ...action, costCardIds: ["stat.power.empowered"] });
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(griffins(saved).damage).toBe(griffins(saved).maxHealth - 1); // fully saved
    expect(saved.players.p1.discard).toContain("stat.power.empowered");
  });

  it("standing spell power (Pandora's +1) lets ONE stat.power pay the silver save", () => {
    const declared = lethalSetup({
      defenderGrade: "silver",
      p1Hand: ["specialty.alamar.1", "stat.power"],
      p1Permanents: ["pandora.power_or_morale"] // +1 standing Power, in play before the attack
    });
    const save = silverSave(declared);
    expect(save, "with +1 standing, one stat.power (value 1) reaches Power 2").toBeTruthy();
    const action = save!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const saved = applyOk(declared, { ...action, costCardIds: ["stat.power"] });
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(griffins(saved).damage).toBe(griffins(saved).maxHealth - 1);
  });

  it("ONE stat.power at its EXPERT value (1 crown) affords the Power-2 silver save", () => {
    const declared = lethalSetup({
      defenderGrade: "silver",
      p1Hand: ["specialty.alamar.1", "stat.power"],
      p1Crowns: 1
    });
    const save = silverSave(declared);
    expect(save, "one crown raises stat.power to +2, reaching the silver cost").toBeTruthy();
    const action = save!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const saved = applyOk(declared, {
      ...action,
      costCardIds: ["stat.power"],
      costCardModes: ["expert"]
    });
    expect(hasAbilityEvent(saved, "resurrection")).toBe(true);
    expect(griffins(saved).damage).toBe(griffins(saved).maxHealth - 1); // fully saved
    expect(saved.players.p1.discard).toContain("stat.power");
    // The crown paying for the expert Power value was spent.
    expect(saved.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
  });

  it("CONTROL: expert Power payment without a crown is rejected", () => {
    const declared = lethalSetup({
      defenderGrade: "silver",
      p1Hand: ["specialty.alamar.1", "stat.power"],
      p1Crowns: 0
    });
    // With no crowns the save is not even offered (basic Power 1 < the cost 2).
    expect(silverSave(declared), "no crown, basic Power 1 < the silver cost of 2 → not offered").toBeFalsy();
    // And a hand-crafted expert payment with no crown is refused outright, even
    // if the reaction were forced.
    const forced = applyAction(declared, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "specialty.alamar.1",
      optionIndex: 1,
      costCardIds: ["stat.power"],
      costCardModes: ["expert"]
    });
    expect(forced.errors.length).toBeGreaterThan(0);
  });
});

describe("New abilities have a resurrection/effect sound wired", () => {
  it("maps each new ability id to an FX plan with a sound", () => {
    for (const abilityId of [
      "resurrection",
      "wyvern-sting",
      "rust-dragon-acid",
      "gorgon-death-stare",
      "dread-knight-death-blow"
    ]) {
      const plan = abilityFxPlans[abilityId];
      expect(plan, `${abilityId} FX plan`).toBeTruthy();
      // Every plan resolves to an audible cue (a direct sound or a hit sound).
      expect(Boolean(plan?.sound || plan?.hitSound), `${abilityId} sound`).toBe(true);
      // The renderer only emits a cue (and its sound) when there is a sprite.
      expect(
        Boolean(plan?.projectile || plan?.hit || (plan?.affect && plan.affect.length > 0)),
        `${abilityId} sprite`
      ).toBe(true);
    }
  });
});
