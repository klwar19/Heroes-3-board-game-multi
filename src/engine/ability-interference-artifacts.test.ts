import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getSpellCastRestriction, spellNullifiedByRestriction } from "./active-effects";
import { cardLibrary } from "@/data/cards/library";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";
import type { ActiveEffectState, GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Three "ability-interference" artifacts imported from the fan wiki, each driven
 * through the real engine so a test fails if the wiring is removed:
 *
 *   • Recanter's Cloak (Major) — option A locks every Hero out of casting a
 *     Power-0 spell (it must be boosted to Power 1+ or it does nothing); option B
 *     locks every Hero out of casting any Spell this Combat (removing the card).
 *   • Boots of Polarity (Relic) — option A rolls 2 Attack dice to (maybe) ignore
 *     an enemy spell; option B removes one ongoing effect from a chosen unit.
 *   • Plate of the Dying Light (Relic) — Instant +defense that also reduces
 *     THIS Spell's damage (the Interference mechanic): +1 (discarded) or +4
 *     (removed). Wiki `<instant>` — never combat-long.
 */

const RECANTERS = "artifact.recanters_cloak";
const BOOTS = "artifact.boots_of_polarity";
const PLATE = "artifact.plate_of_the_dying_light";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function passUntil(state: GameState, playerId: PlayerId): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function reactionAction(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number
): Extract<GameAction, { type: "PLAY_REACTION" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_REACTION" &&
      entry.action.cardId === cardId &&
      entry.action.optionIndex === optionIndex &&
      !entry.action.asPowerBoost
  );
  return legal?.action.type === "PLAY_REACTION" ? legal.action : undefined;
}

function combatPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number,
  targetUnitId?: UnitId
): Extract<GameAction, { type: "PLAY_CARD" }> | undefined {
  const legal = getLegalActions(state, playerId).find(
    (entry) =>
      entry.action.type === "PLAY_CARD" &&
      entry.action.cardId === cardId &&
      entry.action.optionIndex === optionIndex &&
      (targetUnitId === undefined ||
        (entry.action.target?.type === "unit" && entry.action.target.unitId === targetUnitId))
  );
  return legal?.action.type === "PLAY_CARD" ? legal.action : undefined;
}

function castAtSkeletons(state: GameState, playerId: PlayerId, cardId: string) {
  return applyAction(state, {
    type: "CAST_SPELL",
    playerId,
    cardId,
    target: { type: "unit", unitId: "unit_p2_skeletons" }
  });
}

function skeletonDamage(state: GameState): number {
  return state.combat!.units.unit_p2_skeletons.damage;
}

/** A standing global Recanter's Cloak restriction (for the helper/reaction tests). */
function restrictionEffect(opts: { lockAll?: boolean; minPower?: number }): ActiveEffectState {
  return {
    id: `effect_recanters_${opts.lockAll ? "lock" : "floor"}`,
    name: "Recanter's Cloak",
    scope: "global",
    duration: { type: "combat" },
    modifiers: [{ type: "SPELL_CAST_RESTRICTION", ...opts }],
    source: { type: "card", cardId: RECANTERS, controllerId: "p1" },
    controllerId: "p1",
    startedRound: 1,
    startedCombatRound: 1,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  };
}

// ---------------------------------------------------------------------------
// Card definitions + deck coverage
// ---------------------------------------------------------------------------

describe("ability-interference artifacts — definitions and deck coverage", () => {
  it("are all implemented", () => {
    for (const id of [RECANTERS, BOOTS, PLATE]) {
      expect(cardLibrary[id]?.implementationStatus, id).toBe("implemented");
    }
  });

  it("Recanter's Cloak is a Major that creates the two cast-restrictions", () => {
    const card = cardLibrary[RECANTERS];
    expect(card.artifactTier).toBe("major");
    expect(card.effect.type).toBe("CHOOSE_ONE");
    if (card.effect.type !== "CHOOSE_ONE") {
      return;
    }
    const [optionA, optionB] = card.effect.options;
    expect(optionA.effect.type).toBe("CREATE_ACTIVE_EFFECT");
    expect(optionB.effect.type).toBe("CREATE_ACTIVE_EFFECT");
    if (optionA.effect.type === "CREATE_ACTIVE_EFFECT") {
      expect(optionA.effect.effect.scope).toBe("global");
      expect(optionA.effect.effect.modifiers).toEqual([{ type: "SPELL_CAST_RESTRICTION", minPower: 1 }]);
    }
    if (optionB.effect.type === "CREATE_ACTIVE_EFFECT") {
      expect(optionB.effect.effect.scope).toBe("global");
      expect(optionB.effect.effect.modifiers).toEqual([{ type: "SPELL_CAST_RESTRICTION", lockAll: true }]);
      expect(optionB.cost?.removeSelf).toBe(true);
    }
  });

  it("Boots of Polarity is a Relic with a dice-gated cancel and a single-effect removal", () => {
    const card = cardLibrary[BOOTS];
    expect(card.artifactTier).toBe("relic");
    if (card.effect.type !== "CHOOSE_ONE") {
      throw new Error("Boots should be a CHOOSE_ONE card.");
    }
    const [optionA, optionB] = card.effect.options;
    expect(optionA.effect.type).toBe("CANCEL_SPELL");
    if (optionA.effect.type === "CANCEL_SPELL") {
      expect(optionA.effect.diceRoll).toEqual({ count: 2, successFace: 1 });
    }
    expect(optionA.trigger).toEqual({ event: "SPELL_CAST_STARTED", controller: "opponent" });
    expect(optionB.effect.type).toBe("REMOVE_ACTIVE_EFFECT");
  });

  it("Plate of the Dying Light reuses INTERFERE_SPELL with no expert side", () => {
    const card = cardLibrary[PLATE];
    expect(card.artifactTier).toBe("relic");
    if (card.effect.type !== "CHOOSE_ONE") {
      throw new Error("Plate should be a CHOOSE_ONE card.");
    }
    const [optionA, optionB] = card.effect.options;
    expect(optionA.effect).toEqual({ type: "INTERFERE_SPELL", amount: 1 });
    expect(optionB.effect).toEqual({ type: "INTERFERE_SPELL", amount: 4 });
    expect(optionB.cost?.removeSelf).toBe(true);
    // No expertAmount: the expert side is never offered for the artifact.
    if (optionA.effect.type === "INTERFERE_SPELL") {
      expect(optionA.effect.expertAmount).toBeUndefined();
    }
  });

  it("are reachable in the legacy deck and their matching BINH tier deck", () => {
    expect(artifactDeckLegacy).toContain(RECANTERS);
    expect(artifactDeckBinhMajor).toContain(RECANTERS);
    for (const id of [BOOTS, PLATE]) {
      expect(artifactDeckLegacy).toContain(id);
      expect(artifactDeckBinhRelic).toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// Recanter's Cloak
// ---------------------------------------------------------------------------

function playRecantersOption(state: GameState, optionIndex: number): GameState {
  const play = combatPlay(state, "p1", RECANTERS, optionIndex);
  expect(play, `Recanter's option ${optionIndex} should be a legal combat play`).toBeTruthy();
  return applyOk(state, play!);
}

describe("Recanter's Cloak — no Power-0 spells (option A)", () => {
  function arrowSetup(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [RECANTERS, "spell.magic_arrow", "spell.lightning_bolt"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 20;
    target.damage = 0;
    setActive(state, "p1", "unit_p1_griffins");
    script(state, [0, 0, 0, 0]);
    return state;
  }

  it("control: without the Cloak a Power-0 Magic Arrow deals 1", () => {
    const state = arrowSetup("recant-a-control");
    expect(skeletonDamage(settle(castAtSkeletons(state, "p1", "spell.magic_arrow").state))).toBe(1);
  });

  it("option A creates a global minPower-1 restriction and a Power-0 cast does nothing", () => {
    const played = playRecantersOption(arrowSetup("recant-a-nullify"), 0);

    const effect = played.activeEffects.find((entry) =>
      entry.modifiers.some((modifier) => modifier.type === "SPELL_CAST_RESTRICTION")
    );
    expect(effect, "a global cast-restriction effect should exist").toBeTruthy();
    expect(effect!.scope).toBe("global");
    expect(effect!.modifiers).toEqual([{ type: "SPELL_CAST_RESTRICTION", minPower: 1 }]);
    // No removal instruction, so the card is held in play as an ongoing card for
    // the Combat (the central pass releases it to the discard pile when the
    // effect ends), rather than being discarded immediately or removed.
    expect(played.players.p1.hand).not.toContain(RECANTERS);
    expect(played.players.p1.ongoingCards?.some((entry) => entry.cardId === RECANTERS)).toBe(true);

    // A Power-0 Magic Arrow now resolves but applies none of its damage.
    expect(skeletonDamage(settle(castAtSkeletons(played, "p1", "spell.magic_arrow").state))).toBe(0);
  });

  it("a spell boosted to Power 1 is NOT nullified (the floor is power, not a blanket lock)", () => {
    const played = playRecantersOption(arrowSetup("recant-a-boost"), 0);

    // Cast Magic Arrow, then pay a Power boost (discard Lightning Bolt for +1
    // Power) so it resolves at Power 1 — above the floor.
    const cast = castAtSkeletons(played, "p1", "spell.magic_arrow");
    expect(cast.errors).toEqual([]);
    const onCaster = passUntil(cast.state, "p1");
    const boost = getLegalActions(onCaster, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.asPowerBoost === true
    );
    expect(boost, "a Power-boost reaction should be available to the caster").toBeTruthy();
    const after = settle(applyOk(onCaster, boost!.action));

    // Power-1 Magic Arrow deals its boosted damage (2) — the restriction let it through.
    expect(skeletonDamage(after)).toBe(2);
  });
});

describe("Recanter's Cloak — no Spells at all (option B)", () => {
  function lockSetup(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [RECANTERS, "spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p1.removed = [];
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 20;
    target.damage = 0;
    setActive(state, "p1", "unit_p1_griffins");
    script(state, [0, 0, 0, 0]);
    return state;
  }

  it("control: without the Cloak Magic Arrow can be cast", () => {
    const state = lockSetup("recant-b-control");
    const castable = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(castable).toBe(true);
  });

  it("option B locks out casting for the Combat, removes the card, and fizzles any cast", () => {
    const played = playRecantersOption(lockSetup("recant-b-lock"), 1);

    const effect = played.activeEffects.find((entry) =>
      entry.modifiers.some((modifier) => modifier.type === "SPELL_CAST_RESTRICTION")
    );
    expect(effect!.modifiers).toEqual([{ type: "SPELL_CAST_RESTRICTION", lockAll: true }]);
    expect(played.players.p1.removed).toContain(RECANTERS);
    expect(played.players.p1.hand).not.toContain(RECANTERS);

    // No spell cast is offered at all while the lock is up.
    const castable = getLegalActions(played, "p1").some(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(castable).toBe(false);

    // Defence in depth: a cast under the lock is rejected outright (never legal).
    expect(castAtSkeletons(played, "p1", "spell.magic_arrow").errors.length).toBeGreaterThan(0);
  });

  it("also locks out casting a Spell as a reaction/instant (control: allowed without the lock)", () => {
    function attackWith(lock: boolean): GameState {
      const state = createInitialGameState(lock ? "recant-b-react-lock" : "recant-b-react-open");
      state.players.p1.hand = ["spell.bloodlust"]; // attack-window instant spell
      state.players.p2.hand = [];
      state.combat!.units.unit_p1_griffins.position = 9;
      state.combat!.units.unit_p2_skeletons.position = 13;
      if (lock) {
        state.activeEffects.push(restrictionEffect({ lockAll: true }));
      }
      return applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
    }
    const bloodlustOffered = (state: GameState) =>
      (state.reactionWindow?.legalReactions.p1 ?? []).some(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.bloodlust"
      );

    expect(bloodlustOffered(attackWith(false)), "Bloodlust is a normal attack-instant spell").toBe(true);
    expect(bloodlustOffered(attackWith(true)), "the lock removes the spell reaction").toBe(false);
  });
});

describe("Recanter's Cloak — restriction helper (load-bearing branches)", () => {
  function withRestriction(opts: { lockAll?: boolean; minPower?: number }): GameState {
    const state = createInitialGameState("recant-helper");
    state.activeEffects.push(restrictionEffect(opts));
    return state;
  }

  it("folds lockAll and the strictest minPower across the table", () => {
    expect(getSpellCastRestriction(createInitialGameState("clean"))).toEqual({ lockAll: false, minPower: 0 });
    expect(getSpellCastRestriction(withRestriction({ lockAll: true }))).toEqual({ lockAll: true, minPower: 0 });
    expect(getSpellCastRestriction(withRestriction({ minPower: 1 }))).toEqual({ lockAll: false, minPower: 1 });
  });

  it("nullifies on lockAll at any power, and below the minPower floor only", () => {
    const lock = withRestriction({ lockAll: true });
    const floor = withRestriction({ minPower: 1 });
    const clean = createInitialGameState("clean2");

    expect(spellNullifiedByRestriction(lock, 5)).toBe(true);
    expect(spellNullifiedByRestriction(floor, 0)).toBe(true);
    expect(spellNullifiedByRestriction(floor, 1)).toBe(false);
    expect(spellNullifiedByRestriction(clean, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boots of Polarity
// ---------------------------------------------------------------------------

describe("Boots of Polarity — dice-gated spell cancel (option A)", () => {
  // p1 casts Magic Arrow at p2's Skeletons; p2 (the target side) may answer with
  // the Boots. The helper hands p2 the Boots and stops once it has priority.
  function enemyArrow(seed: string, p2Hand: string[], rolls: number[]): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = p2Hand;
    const target = state.combat!.units.unit_p2_skeletons;
    target.maxHealth = 20;
    target.damage = 0;
    setActive(state, "p1", "unit_p1_marksmen");
    script(state, rolls);
    const result = castAtSkeletons(state, "p1", "spell.magic_arrow");
    expect(result.errors).toEqual([]);
    return passUntil(result.state, "p2");
  }

  it("control: without the Boots the Magic Arrow deals 1", () => {
    expect(skeletonDamage(settle(enemyArrow("boots-a-control", [], [0, 0])))).toBe(1);
  });

  it("a successful roll (a +1) ignores the spell", () => {
    const onP2 = enemyArrow("boots-a-hit", [BOOTS], [1, -1]);
    expect(reactionAction(onP2, "p2", BOOTS, 0), "the cancel side should be offered").toBeTruthy();
    const after = settle(applyOk(onP2, reactionAction(onP2, "p2", BOOTS, 0)!));
    expect(skeletonDamage(after)).toBe(0);
    expect(after.players.p2.discard).toContain(BOOTS);
  });

  it("a failed roll (no +1) spends the card but lets the spell resolve", () => {
    const onP2 = enemyArrow("boots-a-miss", [BOOTS], [-1, 0]);
    const after = settle(applyOk(onP2, reactionAction(onP2, "p2", BOOTS, 0)!));
    expect(skeletonDamage(after)).toBe(1);
    expect(after.players.p2.discard).toContain(BOOTS);
  });
});

describe("Boots of Polarity — remove one ongoing effect (option B)", () => {
  function effectOn(unitId: UnitId, removable: boolean): ActiveEffectState {
    return {
      id: `effect_buff_${unitId}`,
      name: "Test Buff",
      scope: "unit",
      duration: { type: "combat" },
      polarity: "positive",
      removable,
      modifiers: [{ type: "DEFENSE_BONUS", amount: 2 }],
      source: { type: "card", cardId: "spell.bless", controllerId: "p2" },
      controllerId: "p2",
      target: { type: "unit", unitId },
      startedRound: 1,
      startedCombatRound: 1,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    };
  }

  function bootsSetup(seed: string, removable = true): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [BOOTS];
    setActive(state, "p1", "unit_p1_griffins");
    state.activeEffects.push(effectOn("unit_p2_skeletons", removable));
    return state;
  }

  it("strips the ongoing effect off the chosen unit", () => {
    const state = bootsSetup("boots-b-remove");
    const play = combatPlay(state, "p1", BOOTS, 1, "unit_p2_skeletons");
    expect(play, "removing the buff from the Skeletons should be a legal play").toBeTruthy();
    const after = applyOk(state, play!);

    expect(after.activeEffects.some((effect) => effect.id === "effect_buff_unit_p2_skeletons")).toBe(false);
    expect(after.players.p1.discard).toContain(BOOTS);
  });

  it("is not offered when there is no removable ongoing effect to strip", () => {
    const state = createInitialGameState("boots-b-empty");
    state.players.p1.hand = [BOOTS];
    setActive(state, "p1", "unit_p1_griffins");
    // No effects on the table at all.
    const offered = getLegalActions(state, "p1").some(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === BOOTS && legal.action.optionIndex === 1
    );
    expect(offered).toBe(false);
  });

  it("leaves a permanent (non-removable) ongoing effect alone", () => {
    const state = bootsSetup("boots-b-permanent", false);
    const offered = getLegalActions(state, "p1").some(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === BOOTS &&
        legal.action.optionIndex === 1 &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(offered).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plate of the Dying Light
// ---------------------------------------------------------------------------

describe("Plate of the Dying Light — defense that also blunts spell damage", () => {
  // p2 (the caster) hits one of p1's units with a damaging spell; p1 holds the
  // Plate and may react. Mirrors the Interference sandbox.
  function enemySpellOnGriffins(seed: string, p1Hand: string[], spellId: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [...p1Hand];
    state.players.p2.hand = [spellId];
    state.players.p1.removed = [];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    const griffins = state.combat!.units.unit_p1_griffins;
    griffins.maxHealth = 30;
    griffins.damage = 0;
    script(state, [0, 0, 0, 0]);
    return applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: spellId,
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });
  }

  function griffinDamage(state: GameState): number {
    return state.combat!.units.unit_p1_griffins.damage;
  }

  it("control: without the Plate an enemy Lightning Bolt deals its full 2", () => {
    const onP1 = enemySpellOnGriffins("plate-control", [], "spell.lightning_bolt");
    expect(griffinDamage(settle(onP1))).toBe(2);
  });

  it("option A Instant: -1 spell damage on THIS cast only, then card discarded", () => {
    const onP1 = enemySpellOnGriffins("plate-a", [PLATE], "spell.lightning_bolt");
    const play = reactionAction(onP1, "p1", PLATE, 0);
    expect(play, "the +1 side should be a legal reaction to a damaging spell").toBeTruthy();
    const settled = settle(applyOk(onP1, play!));

    // The triggering 2-damage bolt is blunted to 1; wiki `<instant>` leaves no
    // combat-long ward; the card is discarded (not removed).
    expect(griffinDamage(settled)).toBe(1);
    expect(settled.players.p1.discard).toContain(PLATE);
    expect(
      settled.activeEffects.filter((candidate) =>
        candidate.modifiers.some(
          (modifier) =>
            modifier.type === "SPELL_DAMAGE_REDUCTION" || modifier.type === "DEFENSE_BONUS"
        )
      )
    ).toEqual([]);
  });

  it("option B Instant: +4 blunts the bolt fully and removes the card (no lasting buff)", () => {
    const onP1 = enemySpellOnGriffins("plate-b", [PLATE], "spell.lightning_bolt");
    const play = reactionAction(onP1, "p1", PLATE, 1);
    expect(play, "the +4 side should be a legal reaction").toBeTruthy();
    const settled = settle(applyOk(onP1, play!));

    // 2 damage minus 4 reduction floors at 0; the relic is removed (not discarded).
    expect(griffinDamage(settled)).toBe(0);
    expect(settled.players.p1.removed).toContain(PLATE);
    expect(settled.players.p1.discard).not.toContain(PLATE);
    // Instant: no leftover combat-long ward after the cast resolves.
    expect(
      settled.activeEffects.filter((candidate) =>
        candidate.modifiers.some(
          (modifier) =>
            modifier.type === "SPELL_DAMAGE_REDUCTION" || modifier.type === "DEFENSE_BONUS"
        )
      )
    ).toEqual([]);
  });

  it("does not offer an expert side (the artifact has no expertAmount)", () => {
    const onP1 = enemySpellOnGriffins("plate-no-expert", [PLATE], "spell.lightning_bolt");
    onP1.players.p1.limits.expertUses = 3;
    const expertOffered = getLegalActions(onP1, "p1").some(
      (legal) =>
        legal.action.type === "PLAY_REACTION" && legal.action.cardId === PLATE && legal.action.mode === "expert"
    );
    expect(expertOffered).toBe(false);
  });
});
