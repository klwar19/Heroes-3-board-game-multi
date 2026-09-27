import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getSpellCastRestriction, spellNullifiedByRestriction } from "./active-effects";
import { chooseComputerAction } from "./computer/policy";
import { observeForComputer } from "./computer/observation";
import { hexPosition } from "./battlefield";
import { cardLibrary } from "@/data/cards/library";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";
import type { ActiveEffectState, GameAction, GameState, PlayerId, TargetRef, UnitId } from "./state";

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

/**
 * USER REPORT: "meteor shower spell: why can't i use this plate of dying light?
 * Bug, it's a spell". The Plate now answers an enemy AREA damaging Spell too:
 * one offer per friendly unit the blast can hit, and the chosen unit alone gets
 * the reduction. Area casts whose hit on that unit lands only AFTER the cast's
 * stack item resolved (Fireball's second space, a Frost Ring pick) must still
 * honour the paid Plate.
 *
 * 4×5 grid:  0  1  2  3 /  4  5  6  7 /  8  9 10 11 / 12 13 14 15 / 16 17 18 19
 */
describe("Plate of the Dying Light vs enemy AREA damaging Spells", () => {
  const G = "unit_p1_griffins";
  const M = "unit_p1_marksmen";

  /** p2 (skeletons at 19) casts `spellId` at `target`; p1 holds `p1Hand`. */
  function areaCast(
    seed: string,
    p1Hand: string[],
    spellId: string,
    target: TargetRef,
    positions: Record<UnitId, number>,
    casterPower = 0,
    configure?: (state: GameState) => void
  ): GameState {
    const state = createInitialGameState(seed);
    state.combat!.obstacles = [];
    state.players.p1.hand = [...p1Hand];
    state.players.p1.removed = [];
    state.players.p2.hand = [spellId];
    const layout: Record<UnitId, number> = {
      unit_p1_griffins: 0,
      unit_p1_marksmen: 2,
      unit_p1_crusaders: 3,
      unit_p2_skeletons: 19,
      unit_p2_vampires: 16,
      unit_p2_dread_knights: 18,
      ...positions
    };
    for (const [unitId, position] of Object.entries(layout)) {
      const unit = state.combat!.units[unitId];
      unit.position = position;
      unit.abilities = [];
      unit.maxHealth = 20;
      unit.damage = 0;
    }
    if (casterPower > 0) {
      state.activeEffects.push({
        id: "effect_plate_area_power",
        name: "Test Power",
        scope: "player",
        controllerId: "p2",
        duration: { type: "combat" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "SPELL_POWER_BONUS", amount: casterPower }],
        source: { type: "system" },
        startedRound: state.round,
        usedRollEventIds: [],
        usedChoiceIds: [],
        usedCombatRoundNumbers: []
      });
    }
    configure?.(state);
    setActive(state, "p2", "unit_p2_skeletons");
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    script(state, [0, 0, 0, 0, 0, 0]);
    return applyOk(state, { type: "CAST_SPELL", playerId: "p2", cardId: spellId, target });
  }

  function plateOffers(state: GameState, optionIndex = 0) {
    return getLegalActions(passUntil(state, "p1"), "p1")
      .map((legal) => legal.action)
      .filter(
        (action): action is Extract<GameAction, { type: "PLAY_REACTION" }> =>
          action.type === "PLAY_REACTION" && action.cardId === PLATE && action.optionIndex === optionIndex
      );
  }

  function protect(state: GameState, unitId: UnitId, optionIndex = 0): GameState {
    const offer = plateOffers(state, optionIndex).find(
      (action) => action.target?.type === "unit" && action.target.unitId === unitId
    );
    expect(offer, `the Plate must be offered for ${unitId}`).toBeTruthy();
    return settle(applyOk(passUntil(state, "p1"), offer!));
  }

  function pickTarget(state: GameState, unitId: UnitId): GameState {
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected a target pick");
    expect(choice.candidateUnitIds).toContain(unitId);
    return applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: choice.playerId,
      choiceId: choice.id,
      targetUnitId: unitId
    });
  }

  const damageOf = (state: GameState, unitId: UnitId) => state.combat!.units[unitId].damage;

  it("Meteor Shower: one offer per affected friendly unit; only the chosen unit is spared", () => {
    // Centre 9 (griffins) + neighbour 10 (marksmen); crusaders at 3 stay out.
    const meteor = (hand: string[]) =>
      areaCast("plate-meteor", hand, "spell.meteor_shower", { type: "space", position: 9 }, { [G]: 9, [M]: 10 }, 2);

    const offered = plateOffers(meteor([PLATE]));
    expect(offered.map((action) => action.target?.type === "unit" && action.target.unitId).sort()).toEqual([M, G].sort());

    // CONTROL: no Plate — both take the Power-2 hit of 1.
    const control = settle(meteor([]));
    expect([damageOf(control, G), damageOf(control, M)]).toEqual([1, 1]);

    const protectedGriffins = protect(meteor([PLATE]), G);
    expect(damageOf(protectedGriffins, G)).toBe(0);
    expect(damageOf(protectedGriffins, M)).toBe(1);
  });

  it("Fireball on the 4×5 grid: a Plate on the splash victim still counts when the caster picks it", () => {
    // Primary: griffins at 9; the marksmen at 10 are the only splash candidate.
    const fireball = (hand: string[]) =>
      areaCast("plate-fireball", hand, "spell.fireball", { type: "unit", unitId: G }, { [G]: 9, [M]: 10 });

    // CONTROL: without the Plate the splash deals the full 1.
    const control = pickTarget(settle(fireball([])), M);
    expect(damageOf(control, M)).toBe(1);

    const guarded = protect(fireball([PLATE]), M);
    expect(damageOf(guarded, G), "the primary is not the protected unit").toBe(1);
    const splashed = pickTarget(guarded, M);
    expect(damageOf(splashed, M), "the paid Plate blunts the deferred splash").toBe(0);
    // The carried reduction is spent with that hit — nothing lingers.
    expect(splashed.combat!.pendingInterfereSpellReductions).toBeUndefined();
  });

  it("Frost Ring picks on the 4×5 grid: the protected ring unit is spared when picked", () => {
    // Ring of 9 = {5, 8, 10, 13}: griffins 5, marksmen 10, vampires 13 → 3 candidates, 2 picks.
    const ring = (hand: string[]) =>
      areaCast(
        "plate-frost-ring",
        hand,
        "spell.frost_ring",
        { type: "space", position: 9 },
        { [G]: 5, [M]: 10, unit_p2_vampires: 13 }
      );

    // CONTROL: without the Plate a picked marksmen takes the full 1.
    const control = pickTarget(settle(ring([])), M);
    expect(damageOf(control, M)).toBe(1);

    const guarded = protect(ring([PLATE]), M);
    const first = pickTarget(guarded, M);
    expect(damageOf(first, M)).toBe(0);
    // The second pick still hits the unprotected griffins in full.
    const second = pickTarget(first, G);
    expect(damageOf(second, G)).toBe(1);
    expect(second.combat!.pendingInterfereSpellReductions).toBeUndefined();
  });

  // USER RULING 2026-09-27: "yes, cover all damage spell like that, choose
  // target properly instant window" — Chain Lightning (target AND hops), Death
  // Ripple and a Power-2 Earthquake join the per-unit offers.
  const V = "unit_p2_vampires";
  const C = "unit_p1_crusaders";
  const offeredIds = (state: GameState) =>
    plateOffers(state)
      .map((action) => (action.target?.type === "unit" ? action.target.unitId : ""))
      .sort();

  it("Chain Lightning: the target AND every hop unit are offered; a Plate on a hop unit blunts its bolt", () => {
    // Power 0 = 1/1/1: griffins (9) is the target; marksmen (10) and the enemy
    // vampires (8) are the two closest units, so both hops land inline.
    const chain = (hand: string[]) =>
      areaCast("plate-chain", hand, "spell.chain_lightning", { type: "unit", unitId: G }, { [G]: 9, [M]: 10, [V]: 8 });
    expect(offeredIds(chain([PLATE]))).toEqual([G, M].sort());

    const control = settle(chain([]));
    expect([damageOf(control, G), damageOf(control, M), damageOf(control, V)]).toEqual([1, 1, 1]);

    const guarded = protect(chain([PLATE]), M);
    expect(damageOf(guarded, M), "the protected hop unit").toBe(0);
    expect(damageOf(guarded, G)).toBe(1);
    expect(damageOf(guarded, V)).toBe(1);
  });

  it("Chain Lightning Power 4 (3/2/1): the hop the caster aims AFTER the cast resolved still honours the Plate", () => {
    const chain = (hand: string[]) =>
      areaCast("plate-chain-aimed", hand, "spell.chain_lightning", { type: "unit", unitId: G }, { [G]: 9, [M]: 10, [V]: 8 }, 4);
    // CONTROL: the aimed 2-damage hop on the marksmen lands in full.
    const control = pickTarget(settle(chain([])), M);
    expect(damageOf(control, M)).toBe(2);

    const guarded = protect(chain([PLATE]), M);
    expect(damageOf(guarded, G)).toBe(3);
    const aimed = pickTarget(guarded, M);
    expect(damageOf(aimed, M)).toBe(1);
    expect(damageOf(aimed, V), "the last bolt still lands on the vampires").toBe(1);
    expect(aimed.combat!.pendingInterfereSpellReductions).toBeUndefined();
  });

  const ripple = (hand: string[], power = 0, tune?: (state: GameState) => void) =>
    areaCast("plate-ripple", hand, "spell.death_ripple", { type: "none" }, { [G]: 5, [M]: 6 }, power, (state) => {
      state.combat!.units[G].grade = "bronze";
      state.combat!.units[M].grade = "bronze";
      state.combat!.units[C].grade = "silver";
      tune?.(state);
    });

  it("Death Ripple: every friendly unit its current Power reaches is offered; only the chosen one is spared", () => {
    // Power 0 reaches bronze only; Power 2 adds the silver crusaders.
    expect(offeredIds(ripple([PLATE]))).toEqual([G, M].sort());
    expect(offeredIds(ripple([PLATE], 2))).toEqual([C, G, M].sort());

    const control = settle(ripple([]));
    expect([damageOf(control, G), damageOf(control, M)]).toEqual([1, 1]);
    const guarded = protect(ripple([PLATE]), G);
    expect(damageOf(guarded, G)).toBe(0);
    expect(damageOf(guarded, M)).toBe(1);
  });

  it("Earthquake at Power 2: each friendly unit beside a standing Wall or Gate is offered; the chosen one is spared", () => {
    // p1 besieges p2's walls (8, 10, 11) and Gate (9); p2 holds the Plate.
    const quake = (p2Hand: string[]) => {
      const state = createInitialGameState("plate-earthquake");
      state.combat!.siege = { townPlayerId: "p2", walls: [8, 10, 11], gatePosition: 9, arrowTowerUnitId: null };
      state.combat!.obstacles = [];
      const layout: Record<UnitId, number> = {
        unit_p1_marksmen: 1,
        unit_p1_griffins: 5,
        unit_p1_crusaders: 3,
        unit_p2_skeletons: 13,
        unit_p2_vampires: 12,
        unit_p2_dread_knights: 18
      };
      for (const [unitId, position] of Object.entries(layout)) {
        const unit = state.combat!.units[unitId];
        unit.position = position;
        unit.abilities = [];
        unit.maxHealth = 20;
        unit.damage = 0;
      }
      state.players.p1.hand = ["spell.earthquake", "stat.power", "stat.power"];
      state.players.p2.hand = [...p2Hand];
      setActive(state, "p1", "unit_p1_marksmen");
      const cast = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.earthquake"
      );
      expect(cast, "Earthquake is castable against standing fortifications").toBeTruthy();
      let casted = applyOk(state, cast!.action);
      // The caster pays Power 2 into the cast with two Power statistics.
      for (let paid = 0; paid < 2; paid += 1) {
        const power = getLegalActions(passUntil(casted, "p1"), "p1").find(
          (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
        );
        expect(power, "the caster can pay Power into Earthquake").toBeTruthy();
        casted = applyOk(passUntil(casted, "p1"), power!.action);
      }
      return casted;
    };
    const p2Offers = (state: GameState) =>
      getLegalActions(passUntil(state, "p2"), "p2")
        .map((legal) => legal.action)
        .filter(
          (action): action is Extract<GameAction, { type: "PLAY_REACTION" }> =>
            action.type === "PLAY_REACTION" && action.cardId === PLATE && action.optionIndex === 0
        );
    // The skeletons (beside the Gate) and the vampires (beside a Wall) — not the
    // distant dread knights.
    expect(
      p2Offers(quake([PLATE])).map((action) => (action.target?.type === "unit" ? action.target.unitId : "")).sort()
    ).toEqual(["unit_p2_skeletons", V].sort());

    const control = settle(quake([]));
    expect([damageOf(control, "unit_p2_skeletons"), damageOf(control, V)]).toEqual([1, 1]);

    const state = quake([PLATE]);
    const offer = p2Offers(state).find(
      (action) => action.target?.type === "unit" && action.target.unitId === "unit_p2_skeletons"
    );
    const guarded = settle(applyOk(passUntil(state, "p2"), offer!));
    expect(damageOf(guarded, "unit_p2_skeletons")).toBe(0);
    expect(damageOf(guarded, V)).toBe(1);
    expect(damageOf(guarded, G), "the caster's own wall-side unit is hit too").toBe(1);
  });

  it("hex board: Chain Lightning offers exactly the units its PC hops can reach (a second-hop unit, not the 4×5 fork)", () => {
    const hex = (column: number, row: number): number => {
      const position = hexPosition(column, row);
      if (position === null) throw new Error(`off board ${column},${row}`);
      return position;
    };
    // p2 aims at the griffins; the chain hops griffins → vampires → crusaders.
    // The marksmen are the 4×5 fork's second-closest unit but no hop reaches them.
    const hexChain = (hand: string[]) => {
      const state = createInitialGameState("plate-hex-chain", { hexBattlefield: true });
      const place: Record<UnitId, number> = {
        unit_p1_griffins: hex(6, 4),
        unit_p2_vampires: hex(8, 4),
        unit_p1_crusaders: hex(10, 4),
        unit_p1_marksmen: hex(6, 1),
        unit_p2_skeletons: hex(1, 8),
        unit_p2_dread_knights: hex(11, 8)
      };
      for (const [unitId, position] of Object.entries(place)) {
        const unit = state.combat!.units[unitId];
        unit.position = position;
        unit.abilities = [];
        unit.maxHealth = 20;
        unit.damage = 0;
      }
      state.players.p1.hand = [...hand];
      state.players.p1.removed = [];
      state.players.p2.hand = ["spell.chain_lightning"];
      setActive(state, "p2", "unit_p2_skeletons");
      state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
      return applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p2",
        cardId: "spell.chain_lightning",
        target: { type: "unit", unitId: G }
      });
    };
    expect(offeredIds(hexChain([PLATE]))).toEqual([C, G].sort());

    const control = settle(hexChain([]));
    expect([damageOf(control, G), damageOf(control, V), damageOf(control, C), damageOf(control, M)]).toEqual([1, 1, 1, 0]);
    const guarded = protect(hexChain([PLATE]), C);
    expect(damageOf(guarded, C), "the protected second-hop unit").toBe(0);
    expect(damageOf(guarded, G)).toBe(1);
  });

  it("a unit that takes no damage from the Spell is not offered (Fire Immunity vs a Fireball splash)", () => {
    const fireball = (immune: boolean) =>
      areaCast("plate-fireball-immune", [PLATE], "spell.fireball", { type: "unit", unitId: G }, { [G]: 9, [M]: 10 }, 0,
        (state) => {
          if (immune) state.combat!.units[M].abilities = ["fire-elemental-immunity"];
        });
    // CONTROL: the ordinary splash candidate is protectable.
    expect(offeredIds(fireball(false))).toEqual([G, M].sort());
    expect(offeredIds(fireball(true))).toEqual([G]);
  });

  it("the AI answers: it shields its most valuable affected unit and the play resolves", () => {
    const state = passUntil(
      ripple([PLATE], 0, (draft) => {
        // Listed first but weak vs listed second and strong.
        Object.assign(draft.combat!.units[M], { attack: 0, initiative: 1 });
        Object.assign(draft.combat!.units[G], { attack: 8, initiative: 9 });
      }),
      "p1"
    );
    const decision = chooseComputerAction(observeForComputer(state, "p1"));
    expect(decision?.action.type).toBe("PLAY_REACTION");
    const action = decision!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(action.cardId).toBe(PLATE);
    expect(action.target).toEqual({ type: "unit", unitId: G });
    const after = settle(applyOk(state, action));
    expect(damageOf(after, G)).toBe(0);
    expect(damageOf(after, M)).toBe(1);
  });
});
