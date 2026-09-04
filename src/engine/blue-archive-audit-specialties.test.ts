import { describe, expect, it } from "vitest";

import {
  applyAction,
  attackWindowPooledPower,
  commanderUnitId,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  makeCommanderCombatUnit
} from "./index";
import { effectiveInitiative, expireEffectsForActivationEnd, getDisplayAttackBonus } from "./active-effects";
import { applyCommanderCombatStart } from "./commanders";
import type { CardId, GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Effect-level AUDIT of the 15 Blue Archive hero specialties and the WOG
 * commander Ibuki. Every spec asserts an OBSERVABLE combat outcome (damage
 * dealt, hand sizes, activation state, the die actually rolled) and carries a
 * CONTROL on the same fixture, so a test fails when the rule is WRONG — not
 * merely absent. Helpers mirror blue-archive-hero-specialties.test.ts and
 * wog-commander-casts.test.ts (re-declared: importing a *.test.ts would re-run
 * its suites).
 */

const GRIFFINS: UnitId = "unit_p1_griffins"; // flying, pack attack 3 / defense 0
const MARKSMEN: UnitId = "unit_p1_marksmen"; // ranged
const SKELETONS: UnitId = "unit_p2_skeletons"; // ground, pack attack 3 / defense 1
const VAMPIRES: UnitId = "unit_p2_vampires";
const DREAD_KNIGHTS: UnitId = "unit_p2_dread_knights"; // gold

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let next = state;
  let guard = 40;
  while (next.reactionWindow && guard-- > 0) {
    next = applyOk(next, { type: "PASS_REACTION", playerId: next.reactionWindow.priorityPlayerId });
  }
  return next;
}

function passUntil(state: GameState, playerId: PlayerId): GameState {
  let next = state;
  let guard = 30;
  while (next.reactionWindow && next.reactionWindow.priorityPlayerId !== playerId && guard-- > 0) {
    next = applyOk(next, { type: "PASS_REACTION", playerId: next.reactionWindow.priorityPlayerId });
  }
  return next;
}

function reactionFor(state: GameState, playerId: PlayerId, cardId: string, optionIndex?: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      !legal.action.asPowerBoost
  );
}

function playCardOffers(state: GameState, playerId: PlayerId, cardId: string) {
  return getLegalActions(state, playerId).filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
  );
}

function playOn(state: GameState, cardId: string, targetId: UnitId): GameState {
  const play = playCardOffers(state, "p1", cardId).find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" && legal.action.target.unitId === targetId
  );
  expect(play, `${cardId} should be playable on ${targetId}`).toBeTruthy();
  return applyOk(state, play!.action);
}

/**
 * A clean sandbox: every unit stripped of abilities and fattened to 50 Health,
 * Skeletons' Defense zeroed, dice scripted to `rolls`. The caller picks the
 * active side and hands.
 */
function arena(seed: string, rolls: number[] = [0, 0, 0, 0, 0, 0]): GameState {
  const state = createInitialGameState(seed);
  for (const unit of Object.values(state.combat!.units)) {
    unit.abilities = [];
    unit.maxHealth = 50;
    unit.damage = 0;
    unit.defense = 0; // BINH griffin-buff gives the Griffins 1 — flatten every Defense
  }
  state.combat!.units[GRIFFINS].position = 9;
  state.combat!.units[SKELETONS].position = 13;
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

/** p1's `attackerId` (active) declares on `defenderId`; the window (if any) stays open. */
function declareOwnAttack(state: GameState, attackerId: UnitId, defenderId: UnitId): GameState {
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attackerId;
  // No Retaliation Attack: a retaliation declares its OWN window (on which a
  // controller:"opponent" defense instant is legitimately offered).
  state.combat!.units[defenderId].retaliatedThisRound = true;
  return applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId, defenderId });
}

/** p2's Skeletons (active, never retaliated against) declare on `defenderId`. */
function declareEnemyAttack(state: GameState, defenderId: UnitId = GRIFFINS): GameState {
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = SKELETONS;
  // Isolate the blow from the defender's Retaliation Attack.
  state.combat!.units[defenderId].retaliatedThisRound = true;
  return applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: SKELETONS, defenderId });
}

function playReaction(state: GameState, playerId: PlayerId, cardId: string, optionIndex?: number, extra: Partial<GameAction> = {}): GameState {
  const at = passUntil(state, playerId);
  const offer = reactionFor(at, playerId, cardId, optionIndex);
  expect(offer, `${cardId} should be offered to ${playerId} in the open window`).toBeTruthy();
  return applyOk(at, { ...offer!.action, ...extra } as GameAction);
}

// ===========================================================================
// Mika — Kyrie Eleison
// ===========================================================================

describe("Mika — Kyrie Eleison", () => {
  it("I: +2 Attack lands on the flying Griffins' own attack (damage +2 vs CONTROL)", () => {
    const control = passAll(declareOwnAttack(arena("mika-i-control"), GRIFFINS, SKELETONS));
    expect(control.combat!.units[SKELETONS].damage).toBe(3);

    const armed = arena("mika-i");
    armed.players.p1.hand = ["specialty.mika_blue_archive.1"];
    let state = declareOwnAttack(armed, GRIFFINS, SKELETONS);
    expect(state.reactionWindow?.triggerEvent.type).toBe("UNIT_ATTACK_DECLARED");
    state = passAll(playReaction(state, "p1", "specialty.mika_blue_archive.1"));
    expect(state.combat!.units[SKELETONS].damage).toBe(5);
    expect(state.players.p1.discard).toContain("specialty.mika_blue_archive.1");
  });

  it("I/VI: a RANGED attacker (Marksmen) is never offered the ground/flying buff — Kei IV (untyped) is the CONTROL", () => {
    const state = arena("mika-ranged-gate");
    state.combat!.units[MARKSMEN].position = 9;
    state.combat!.units[GRIFFINS].position = 5;
    state.players.p1.hand = ["specialty.mika_blue_archive.1", "specialty.mika_blue_archive.6", "specialty.kei_blue_archive.4"];
    const declared = passUntil(declareOwnAttack(state, MARKSMEN, SKELETONS), "p1");
    expect(declared.reactionWindow, "Kei IV keeps the window open").toBeTruthy();
    expect(reactionFor(declared, "p1", "specialty.kei_blue_archive.4"), "CONTROL: the untyped +2 is offered").toBeTruthy();
    expect(reactionFor(declared, "p1", "specialty.mika_blue_archive.1")).toBeUndefined();
    expect(reactionFor(declared, "p1", "specialty.mika_blue_archive.6")).toBeUndefined();
  });

  it("I: is NOT offered on the OPPONENT's attack (controller: self)", () => {
    const state = arena("mika-i-enemy-attack");
    state.players.p1.hand = ["specialty.mika_blue_archive.1"];
    const declared = declareEnemyAttack(state);
    expect(declared.reactionWindow, "nothing to react with — no window at all").toBeNull();
  });

  it("VI: heals HALF the damage dealt, rounded UP (3 dealt → heals 2); Mika I is the CONTROL", () => {
    const run = (cardId: string) => {
      const state = arena(`mika-vi-${cardId}`);
      state.combat!.units[GRIFFINS].damage = 3;
      state.combat!.units[SKELETONS].defense = 2; // 3 + 2 - 2 = 3 dealt
      state.combat!.units[SKELETONS].retaliatedThisRound = true;
      state.players.p1.hand = [cardId];
      return passAll(playReaction(declareOwnAttack(state, GRIFFINS, SKELETONS), "p1", cardId));
    };
    const healed = run("specialty.mika_blue_archive.6");
    expect(healed.combat!.units[SKELETONS].damage).toBe(3);
    expect(healed.combat!.units[GRIFFINS].damage, "ceil(3/2) = 2 healed").toBe(1);

    const control = run("specialty.mika_blue_archive.1");
    expect(control.combat!.units[SKELETONS].damage).toBe(3);
    expect(control.combat!.units[GRIFFINS].damage).toBe(3);
  });

  it("VI: a fully soaked attack heals nothing", () => {
    const state = arena("mika-vi-soaked");
    state.combat!.units[GRIFFINS].damage = 3;
    state.combat!.units[SKELETONS].defense = 9;
    state.combat!.units[SKELETONS].retaliatedThisRound = true;
    state.players.p1.hand = ["specialty.mika_blue_archive.6"];
    const after = passAll(playReaction(declareOwnAttack(state, GRIFFINS, SKELETONS), "p1", "specialty.mika_blue_archive.6"));
    expect(after.combat!.units[SKELETONS].damage).toBe(0);
    expect(after.combat!.units[GRIFFINS].damage).toBe(3);
  });

  it("IV: exactly 1 damage to the attacker after it strikes the protected unit; a combat-long, removable effect", () => {
    const control = passAll(declareEnemyAttack(arena("mika-iv-control")));
    expect(control.combat!.units[SKELETONS].damage).toBe(0);

    let state = arena("mika-iv");
    state.players.p1.hand = ["specialty.mika_blue_archive.4"];
    state = playOn(state, "specialty.mika_blue_archive.4", GRIFFINS);
    const effect = state.activeEffects.find((entry) => entry.name === "Kyrie Eleison IV");
    expect(effect?.duration).toEqual({ type: "combat" });
    expect(effect?.removable).toBe(true);
    const after = passAll(declareEnemyAttack(state));
    expect(after.combat!.units[SKELETONS].damage).toBe(1);
    // Attacking a DIFFERENT unit is not punished.
    let other = arena("mika-iv-other");
    other.players.p1.hand = ["specialty.mika_blue_archive.4"];
    other = playOn(other, "specialty.mika_blue_archive.4", MARKSMEN);
    expect(passAll(declareEnemyAttack(other)).combat!.units[SKELETONS].damage).toBe(0);
  });
});

// ===========================================================================
// Yuuka — Perfect Calculation
// ===========================================================================

describe("Yuuka — Perfect Calculation", () => {
  it("IV: −1 Defense on the selected unit makes it take 1 more damage (CONTROL: untouched)", () => {
    const control = passAll(declareOwnAttack(arena("yuuka-iv-control"), GRIFFINS, SKELETONS));
    expect(control.combat!.units[SKELETONS].damage).toBe(3);

    let state = arena("yuuka-iv");
    state.combat!.units[SKELETONS].defense = 1;
    state.players.p1.hand = ["specialty.yuuka_blue_archive.4"];
    state = playOn(state, "specialty.yuuka_blue_archive.4", SKELETONS);
    const effect = state.activeEffects.find((entry) => entry.name === "Perfect Calculation IV");
    expect(effect?.duration).toEqual({ type: "combat" });
    expect(effect?.removable).toBe(true);
    expect(passAll(declareOwnAttack(state, GRIFFINS, SKELETONS)).combat!.units[SKELETONS].damage).toBe(3);
  });

  it("VI: +2 Defense for the incoming blow AND the enemy discards exactly 1 card, seeded-deterministic", () => {
    const run = (seed: string, armed: boolean) => {
      const state = arena(seed);
      state.players.p2.hand = ["stat.knowledge", "ability.estates", "artifact.buckler_of_the_gnoll_king"];
      state.players.p2.discard = [];
      if (armed) state.players.p1.hand = ["specialty.yuuka_blue_archive.6"];
      let declared = declareEnemyAttack(state);
      if (armed) declared = playReaction(declared, "p1", "specialty.yuuka_blue_archive.6");
      return passAll(declared);
    };
    const control = run("yuuka-vi-control", false);
    expect(control.combat!.units[GRIFFINS].damage).toBe(3);
    expect(control.players.p2.hand).toHaveLength(3);

    const first = run("yuuka-vi", true);
    expect(first.combat!.units[GRIFFINS].damage).toBe(1);
    expect(first.players.p2.hand).toHaveLength(2);
    expect(first.players.p2.discard).toHaveLength(1);
    const discarded = first.players.p2.discard[0];
    expect(["stat.knowledge", "ability.estates", "artifact.buckler_of_the_gnoll_king"]).toContain(discarded);
    expect(first.players.p1.hand, "the OPPONENT discards, never the player").toEqual([]);

    const second = run("yuuka-vi", true);
    expect(second.players.p2.discard[0], "same seed ⇒ same random pick").toBe(discarded);
  });

  it("VI: is NOT offered on the player's OWN attack (controller: opponent)", () => {
    const state = arena("yuuka-vi-own-attack");
    state.players.p1.hand = ["specialty.yuuka_blue_archive.6"];
    expect(declareOwnAttack(state, GRIFFINS, SKELETONS).reactionWindow).toBeNull();
  });

  describe("I — the lethal save (Alamar-shaped tiers, paid from pooled window Power)", () => {
    function declareLethal(seed: string, p1Hand: string[]): GameState {
      const state = createInitialGameState(seed);
      state.players.p1.hand = p1Hand as CardId[];
      state.players.p2.hand = [];
      const defender = state.combat!.units[GRIFFINS];
      defender.grade = "gold";
      defender.position = 9;
      defender.defense = 0;
      defender.damage = defender.maxHealth - 1;
      const attacker = state.combat!.units[SKELETONS];
      attacker.abilities = [];
      attacker.attack = 5;
      attacker.position = 13;
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = SKELETONS;
      return applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: SKELETONS, defenderId: GRIFFINS });
    }
    function toLethalWindow(state: GameState): GameState {
      let current = state;
      let safety = 40;
      while (safety-- > 0 && current.reactionWindow && current.reactionWindow.triggerEvent.type !== "UNIT_LETHAL_HIT") {
        current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      }
      return current;
    }
    function pourPower(state: GameState, pours: number): GameState {
      let current = playReaction(state, "p1", "spell.stone_skin");
      for (let index = 0; index < pours; index += 1) {
        const at = passUntil(current, "p1");
        const offer = getLegalActions(at, "p1").find(
          (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power" && legal.action.mode !== "expert" && !legal.action.asPowerBoost
        );
        expect(offer, "a Power source is offered into the Stone Skin attack").toBeTruthy();
        current = applyOk(at, offer!.action);
      }
      return toLethalWindow(current);
    }
    const saved = (state: GameState) => {
      const unit = state.combat!.units[GRIFFINS];
      return unit.variant === "pack" && unit.damage === unit.maxHealth - 1;
    };

    it("gold rung (cost 4) bought by 4 pooled Power saves the doomed unit", () => {
      const hand = ["spell.stone_skin", "stat.power", "stat.power", "stat.power", "stat.power", "specialty.yuuka_blue_archive.1"];
      const state = pourPower(declareLethal("yuuka-i-gold", hand), 4);
      expect(state.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");
      expect(attackWindowPooledPower(state, "p1")).toBe(4);
      const save = reactionFor(state, "p1", "specialty.yuuka_blue_archive.1", 2);
      expect(save, "the gold save must be offered").toBeTruthy();
      expect(saved(applyOk(state, save!.action))).toBe(true);
    });

    it("CONTROL: 3 pooled Power cannot buy the gold rung — the Pack flips", () => {
      const hand = ["spell.stone_skin", "stat.power", "stat.power", "stat.power", "specialty.yuuka_blue_archive.1"];
      const state = pourPower(declareLethal("yuuka-i-short", hand), 3);
      expect(reactionFor(state, "p1", "specialty.yuuka_blue_archive.1", 2)).toBeUndefined();
      expect(saved(state)).toBe(false);
      expect(state.combat!.units[GRIFFINS].variant).toBe("few");
    });
  });
});

// ===========================================================================
// Seia — Prophetic Counsel
// ===========================================================================

describe("Seia — Prophetic Counsel", () => {
  function castArrow(seed: string, p1Hand: string[]): GameState {
    const state = arena(seed);
    state.players.p1.hand = ["spell.magic_arrow", ...p1Hand];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = GRIFFINS;
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && (legal.action as { cardId?: string }).cardId === "spell.magic_arrow" && (legal.action as { target?: { type: string; unitId?: string } }).target?.unitId === SKELETONS
    );
    expect(cast, "Magic Arrow should be castable on the Skeletons").toBeTruthy();
    return applyOk(state, cast!.action);
  }

  it("I: +1 Power (option 0) and discard-1-for-+2 (option 1) both raise the Spell's damage, in that order", () => {
    const base = passAll(castArrow("seia-i-base", [])).combat!.units[SKELETONS].damage;
    expect(base).toBeGreaterThan(0);

    const plusOne = castArrow("seia-i-plus1", ["specialty.seia_blue_archive.1"]);
    expect(plusOne.reactionWindow?.triggerEvent.type).toBe("SPELL_CAST_STARTED");
    const afterOne = passAll(playReaction(plusOne, "p1", "specialty.seia_blue_archive.1", 0));
    expect(afterOne.combat!.units[SKELETONS].damage).toBe(base + 1);

    const plusTwo = castArrow("seia-i-plus2", ["specialty.seia_blue_archive.1", "stat.knowledge"]);
    const afterTwo = passAll(
      playReaction(plusTwo, "p1", "specialty.seia_blue_archive.1", 1, { costCardIds: ["stat.knowledge"] } as Partial<GameAction>)
    );
    expect(afterTwo.combat!.units[SKELETONS].damage).toBe(base + 2);
    expect(afterTwo.players.p1.discard).toContain("stat.knowledge");
    expect(afterTwo.players.p1.hand).not.toContain("stat.knowledge");
  });

  it("I: is NOT offered on the OPPONENT's Spell (controller: self)", () => {
    const state = arena("seia-i-enemy-cast");
    state.players.p1.hand = ["specialty.seia_blue_archive.1"];
    state.players.p2.hand = ["spell.magic_arrow"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = SKELETONS;
    const cast = getLegalActions(state, "p2").find(
      (legal) => legal.action.type === "CAST_SPELL" && (legal.action as { cardId?: string }).cardId === "spell.magic_arrow" && (legal.action as { target?: { type: string; unitId?: string } }).target?.unitId === GRIFFINS
    );
    expect(cast).toBeTruthy();
    const declared = applyOk(state, cast!.action);
    expect(declared.reactionWindow ? reactionFor(declared, "p1", "specialty.seia_blue_archive.1") : undefined).toBeUndefined();
  });

  it("VI: the die is ALWAYS −1 — even under an ADVANTAGE effect (CONTROL: advantage alone keeps the +1)", () => {
    const advantage = (state: GameState) => {
      state.activeEffects.push({
        id: "effect_test_advantage",
        name: "Test advantage",
        scope: "unit",
        duration: { type: "combat" },
        polarity: "positive",
        removable: true,
        modifiers: [{ type: "ATTACK_ROLL_ADVANTAGE" }],
        source: { type: "card", cardId: "stat.attack", controllerId: "p2" },
        controllerId: "p2",
        target: { type: "unit", unitId: SKELETONS },
        startedRound: 1,
        startedCombatRound: 1
      } as never);
    };
    const control = arena("seia-vi-advantage-control", [1, 1, 1, 1]);
    advantage(control);
    const controlHit = passAll(declareEnemyAttack(control));
    expect(controlHit.combat!.units[GRIFFINS].damage).toBe(4);

    let state = arena("seia-vi-advantage", [1, 1, 1, 1]);
    advantage(state);
    state.players.p1.hand = ["specialty.seia_blue_archive.6"];
    state = playOn(state, "specialty.seia_blue_archive.6", SKELETONS);
    const hit = passAll(declareEnemyAttack(state));
    expect(hit.combat!.units[GRIFFINS].damage, "3 − 1 = 2: the fixed −1 beats the advantage").toBe(2);
    const roll = hit.eventLog.filter((event) => event.type === "ATTACK_ROLLED" && event.attackerId === SKELETONS).at(-1);
    expect(roll).toMatchObject({ roll: -1 });
    expect(hit.pendingChoice, "no reroll window is ever opened for a fixed die").toBeNull();
  });

  describe("IV — remove a hand card, Search (3) its deck; deck ACCESS follows the hero's TILE", () => {
    function mapState(seed: string, hand: string[]): GameState {
      const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, events: false, rotateStartTiles: false });
      for (const player of Object.values(state.players)) {
        player.canMulligan = false;
        player.needsHandRefresh = false;
      }
      state.activePlayerId = "p1";
      state.pendingChoice = null;
      state.reactionWindow = null;
      state.players.p1.hand = [...hand] as CardId[];
      state.players.p1.removed = [];
      for (const id of ["abilities", "spells", "spells-expert", "artifacts-minor", "artifacts-major", "artifacts-relic"]) {
        if (state.decks[id]) state.decks[id].discardPile = [];
      }
      return state;
    }
    const visitSteps = (state: GameState) =>
      getLegalActions(state, "p1")
        .filter((legal) => legal.action.type === "RESOLVE_VISIT_STEP")
        .map((legal) => ({ label: legal.label, action: legal.action }));
    const findPlay = (state: GameState, cardId: string, optionIndex: number) =>
      getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId && legal.action.optionIndex === optionIndex
      );
    const standOnBand = (state: GameState, backLabel: string) => {
      const field = state.adventure!.fields[state.heroes.hero_p1.spaceId as string]!;
      state.adventure!.tiles[field.tileInstanceId]!.backLabel = backLabel;
    };
    const removeStep = (state: GameState, match: string) => {
      const step = visitSteps(state).find((candidate) => candidate.label.toLowerCase().includes(match));
      expect(step, `a "Remove …${match}" step`).toBeTruthy();
      return applyOk(state, step!.action);
    };

    it("option 0 on the STARTING tile: the removed Spell goes to `removed`, Search (3) digs the BASIC Spell deck only", () => {
      const state = mapState("seia-iv-start", ["specialty.seia_blue_archive.4", "spell.magic_arrow", "stat.attack"]);
      const play = findPlay(state, "specialty.seia_blue_archive.4", 0);
      expect(play).toBeTruthy();
      const opened = applyOk(state, play!.action);
      expect(opened.players.p1.discard).toContain("specialty.seia_blue_archive.4");
      const labels = visitSteps(opened).map((step) => step.label.toLowerCase());
      expect(labels.some((label) => label.includes("magic arrow"))).toBe(true);
      expect(labels.some((label) => label.startsWith("remove") && label.includes("attack")), "a Statistic has no deck").toBe(false);
      const searched = removeStep(opened, "magic arrow");
      expect(searched.players.p1.removed).toContain("spell.magic_arrow");
      expect(searched.players.p1.discard).not.toContain("spell.magic_arrow");
      expect(searched.pendingChoice?.type).toBe("DECK_SEARCH");
      if (searched.pendingChoice?.type === "DECK_SEARCH") {
        expect(searched.pendingChoice.deckId).toBe("spells");
        expect(searched.pendingChoice.revealedCardIds).toHaveLength(3);
      }
    });

    it("on a Ⅳ–Ⅴ tile the same play offers the EXPERT Spell deck too; Miriam IV's tiered reach is the location-blind CONTROL", () => {
      const near = mapState("seia-iv-near", ["specialty.seia_blue_archive.4", "spell.magic_arrow", "stat.attack"]);
      standOnBand(near, "Ⅳ–Ⅴ");
      const opened = removeStep(applyOk(near, findPlay(near, "specialty.seia_blue_archive.4", 0)!.action), "magic arrow");
      const pick = opened.pendingChoice;
      expect(pick?.type, "the SPELLS family opens its up-front deck pick").toBe("OPTION_CHOICE");
      if (pick?.type !== "OPTION_CHOICE") throw new Error("expected the deck pick");
      expect(pick.context).toBe("deck-pick");
      expect(pick.deckPick?.deckIds, "Ⅳ–Ⅴ unlocks the Expert deck").toEqual(["spells", "spells-expert"]);
      expect(pick.deckPick?.count).toBe(3);

      const start = mapState("seia-iv-start-control", ["specialty.miriam.4", "spell.magic_arrow", "stat.attack"]);
      const miriam = removeStep(applyOk(start, findPlay(start, "specialty.miriam.4", 0)!.action), "magic arrow");
      expect(visitSteps(miriam).map((s) => s.label.toLowerCase()).some((label) => label.includes("expert spell")), "CONTROL: Miriam reaches Expert from tile Ⅰ").toBe(true);
    });

    it("option 1 also REMOVES the Specialty itself (never the discard) and still Searches", () => {
      const state = mapState("seia-iv-self", ["specialty.seia_blue_archive.4", "ability.offense"]);
      const play = findPlay(state, "specialty.seia_blue_archive.4", 1);
      expect(play).toBeTruthy();
      const opened = applyOk(state, play!.action);
      expect(opened.players.p1.removed).toContain("specialty.seia_blue_archive.4");
      expect(opened.players.p1.discard).not.toContain("specialty.seia_blue_archive.4");
      const searched = removeStep(opened, "offense");
      expect(searched.players.p1.removed).toEqual(expect.arrayContaining(["specialty.seia_blue_archive.4", "ability.offense"]));
      expect(searched.pendingChoice?.type).toBe("DECK_SEARCH");
      if (searched.pendingChoice?.type === "DECK_SEARCH") expect(searched.pendingChoice.deckId).toBe("abilities");
    });

    it("is NOT offered with nothing removable in hand (CONTROL gate)", () => {
      const state = mapState("seia-iv-none", ["specialty.seia_blue_archive.4", "stat.attack"]);
      expect(findPlay(state, "specialty.seia_blue_archive.4", 0)).toBeUndefined();
      expect(findPlay(state, "specialty.seia_blue_archive.4", 1)).toBeUndefined();
    });

    it("mid-combat: opens a p1-owned OPTION_CHOICE (AI/AFK-answerable) that resolves into a Search of the card's deck", () => {
      const state = arena("seia-iv-combat");
      state.players.p1.hand = ["specialty.seia_blue_archive.4", "artifact.centaurs_axe", "stat.attack"];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = GRIFFINS;
      const play = playCardOffers(state, "p1", "specialty.seia_blue_archive.4").find((legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 0);
      expect(play, "offered on the own activation in combat").toBeTruthy();
      const opened = applyOk(state, play!.action);
      const choice = opened.pendingChoice;
      expect(choice?.type).toBe("OPTION_CHOICE");
      expect(choice?.playerId).toBe("p1");
      if (choice?.type !== "OPTION_CHOICE") throw new Error("expected the removal pick");
      const axe = choice.options.findIndex((option) => option.label.toLowerCase().includes("centaur"));
      expect(axe).toBeGreaterThanOrEqual(0);
      expect(choice.options.some((option) => option.label.toLowerCase().includes("attack") && option.label.startsWith("Remove")), "no deck for a Statistic").toBe(false);
      const searched = applyOk(opened, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: axe });
      expect(searched.players.p1.removed).toContain("artifact.centaurs_axe");
      expect(searched.pendingChoice?.type).toBe("DECK_SEARCH");
      if (searched.pendingChoice?.type === "DECK_SEARCH") {
        expect(searched.pendingChoice.deckId.startsWith("artifacts")).toBe(true);
        expect(searched.pendingChoice.revealedCardIds).toHaveLength(3);
      }
    });
  });
});

// ===========================================================================
// Chise — Mystic Chill
// ===========================================================================

describe("Chise — Mystic Chill", () => {
  const initiativeOf = (state: GameState, unitId: UnitId) =>
    effectiveInitiative(state.combat!.units[unitId], state.activeEffects, state.combat);

  it("I: at combat start every ENEMY loses 1 Initiative for the combat and the player draws 1", () => {
    const state = arena("chise-i");
    state.players.p1.hand = ["specialty.chise_blue_archive.1"];
    state.players.p1.deck = ["stat.defense", "stat.attack"];
    const before = Object.fromEntries(Object.keys(state.combat!.units).map((id) => [id, initiativeOf(state, id as UnitId)]));
    const play = playCardOffers(state, "p1", "specialty.chise_blue_archive.1")[0];
    expect(play).toBeTruthy();
    const after = applyOk(state, play.action);
    for (const id of [SKELETONS, VAMPIRES, DREAD_KNIGHTS]) expect(initiativeOf(after, id), id).toBe(before[id] - 1);
    for (const id of [GRIFFINS, MARKSMEN, "unit_p1_crusaders" as UnitId]) expect(initiativeOf(after, id), id).toBe(before[id]);
    expect(after.players.p1.hand, "drew 1 (deck top = last entry)").toEqual(["stat.attack"]);
    const effect = after.activeEffects.find((entry) => entry.name === "Mystic Chill I");
    expect(effect?.duration).toEqual({ type: "combat" });
    expect(effect?.removable).toBe(true);
    for (const id of [SKELETONS, VAMPIRES, DREAD_KNIGHTS]) expect(after.combat!.units[id].damage, "I deals no damage").toBe(0);
  });

  it("IV: 1 damage to EVERY enemy plus −1 Initiative; own units untouched; no draw", () => {
    const state = arena("chise-iv");
    state.players.p1.hand = ["specialty.chise_blue_archive.4"];
    state.players.p1.deck = ["stat.defense"];
    const before = initiativeOf(state, VAMPIRES);
    const play = playCardOffers(state, "p1", "specialty.chise_blue_archive.4")[0];
    expect(play).toBeTruthy();
    const after = applyOk(state, play.action);
    for (const id of [SKELETONS, VAMPIRES, DREAD_KNIGHTS]) expect(after.combat!.units[id].damage, id).toBe(1);
    for (const id of [GRIFFINS, MARKSMEN, "unit_p1_crusaders" as UnitId]) expect(after.combat!.units[id].damage, id).toBe(0);
    expect(initiativeOf(after, VAMPIRES)).toBe(before - 1);
    expect(after.players.p1.hand).toEqual([]);
  });

  it("I/IV: NOT offered once any unit has MOVED (the start-of-combat window is closed); Chise VI is unaffected", () => {
    for (const level of [1, 4] as const) {
      const cardId = `specialty.chise_blue_archive.${level}`;
      const state = arena(`chise-${level}-moved`);
      state.players.p1.hand = [cardId];
      expect(playCardOffers(state, "p1", cardId).length).toBeGreaterThan(0);
      state.combat!.units[MARKSMEN].movedThisActivation = true;
      expect(playCardOffers(state, "p1", cardId)).toEqual([]);
      // Nor as a window join once fighting began.
      const declared = declareEnemyAttack(state);
      expect(declared.reactionWindow ? reactionFor(declared, "p1", cardId) : undefined).toBeUndefined();
    }
  });

  it("VI: +2 Defense against the enemy's attack (damage −2) and draw 1", () => {
    const control = passAll(declareEnemyAttack(arena("chise-vi-control")));
    expect(control.combat!.units[GRIFFINS].damage).toBe(3);

    const state = arena("chise-vi");
    state.players.p1.hand = ["specialty.chise_blue_archive.6"];
    state.players.p1.deck = ["stat.defense", "stat.attack"];
    const after = passAll(playReaction(declareEnemyAttack(state), "p1", "specialty.chise_blue_archive.6"));
    expect(after.combat!.units[GRIFFINS].damage).toBe(1);
    expect(after.players.p1.hand, "drew 1 (deck top = last entry)").toEqual(["stat.attack"]);
  });
});

// ===========================================================================
// Kei — Hacking
// ===========================================================================

describe("Kei — Hacking", () => {
  it("I: the selected ENEMY rolls two dice and keeps the LOWER for the combat (CONTROL: one die)", () => {
    const control = passAll(declareEnemyAttack(arena("kei-i-control", [1, -1, 1, -1])));
    expect(control.combat!.units[GRIFFINS].damage, "3 + 1").toBe(4);

    let state = arena("kei-i", [1, -1, 1, -1]);
    state.players.p1.hand = ["specialty.kei_blue_archive.1"];
    const targets = playCardOffers(state, "p1", "specialty.kei_blue_archive.1").map((legal) =>
      legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit" ? legal.action.target.unitId : ""
    );
    expect(targets).toContain(SKELETONS);
    expect(targets, "enemy-unit target only").not.toContain(GRIFFINS);
    state = playOn(state, "specialty.kei_blue_archive.1", SKELETONS);
    const effect = state.activeEffects.find((entry) => entry.name === "Hacking I");
    expect(effect?.duration).toEqual({ type: "combat" });
    const hit = passAll(declareEnemyAttack(state));
    expect(hit.combat!.units[GRIFFINS].damage, "3 + min(1, −1)").toBe(2);
    const roll = hit.eventLog.filter((event) => event.type === "ATTACK_ROLLED" && event.attackerId === SKELETONS).at(-1);
    expect(roll).toMatchObject({ roll: -1 });
    expect((roll as { rolls: number[] }).rolls).toHaveLength(2);
  });

  it("IV in the own attack window: +2 Attack, draw 2, then a p1-owned discard-1 choice; the attack resolves after it", () => {
    const state = arena("kei-iv-window");
    state.players.p1.hand = ["specialty.kei_blue_archive.4", "stat.knowledge"];
    state.players.p1.deck = ["stat.defense", "stat.attack", "ability.estates"];
    const played = playReaction(declareOwnAttack(state, GRIFFINS, SKELETONS), "p1", "specialty.kei_blue_archive.4");
    expect(played.players.p1.hand, "2 drawn before the discard").toEqual(["stat.knowledge", "ability.estates", "stat.attack"]);
    const choice = played.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.playerId).toBe("p1");
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected the hand-discard pick");
    expect(choice.context).toBe("hand-discard");
    expect(choice.options).toHaveLength(3);
    expect(played.combat!.units[SKELETONS].damage, "the blow is parked while the pick is open").toBe(0);
    const discarded = applyOk(played, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });
    expect(discarded.players.p1.hand).toEqual(["stat.knowledge", "stat.attack"]);
    expect(discarded.players.p1.discard).toContain("ability.estates");
    const resolved = passAll(discarded);
    expect(resolved.combat!.units[SKELETONS].damage, "3 + 2").toBe(5);
  });

  it("IV on the MAP: playable only for the draw — hand +2 −1 and the Specialty cycles to the discard", () => {
    const state = createAdventureGameState({ seed: "kei-iv-map", difficulty: "normal", rollFirstPlayer: false, events: false, rotateStartTiles: false });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    state.players.p1.hand = ["specialty.kei_blue_archive.4", "stat.knowledge"] as CardId[];
    state.players.p1.deck = ["stat.defense", "stat.attack", "ability.estates"] as CardId[];
    const play = playCardOffers(state, "p1", "specialty.kei_blue_archive.4")[0];
    expect(play, "a map play exists").toBeTruthy();
    const played = applyOk(state, play.action);
    expect(played.players.p1.hand).toEqual(["stat.knowledge", "ability.estates", "stat.attack"]);
    const choice = played.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected the hand-discard pick");
    expect(choice.context).toBe("hand-discard");
    const done = applyOk(played, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(done.players.p1.hand).toEqual(["ability.estates", "stat.attack"]);
    expect(done.players.p1.discard).toEqual(expect.arrayContaining(["specialty.kei_blue_archive.4", "stat.knowledge"]));
  });

  it("IV in combat, own activation, NO window: the draw-only twin is offered and draws 2 then discards 1", () => {
    const state = arena("kei-iv-combat-drawonly");
    state.players.p1.hand = ["specialty.kei_blue_archive.4"];
    state.players.p1.deck = ["stat.defense", "stat.attack"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = GRIFFINS;
    const play = playCardOffers(state, "p1", "specialty.kei_blue_archive.4").find((legal) => legal.action.type === "PLAY_CARD" && legal.action.drawOnly);
    expect(play, "the own-activation draw-only twin").toBeTruthy();
    const played = applyOk(state, play!.action);
    expect(played.players.p1.hand).toEqual(["stat.attack", "stat.defense"]);
    const choice = played.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") throw new Error("expected the hand-discard pick");
    const done = applyOk(played, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(done.players.p1.hand).toEqual(["stat.defense"]);
  });

  describe("VI — skip an enemy activation", () => {
    /** Leaves exactly `targetId` (p2) fresh, then ends p1's Griffins so the target becomes active. */
    function aboutToActivate(seed: string, targetId: UnitId, p1Hand: string[], p2Hand: string[] = []): GameState {
      const state = createInitialGameState(seed);
      state.players.p1.hand = [...p1Hand] as CardId[];
      state.players.p2.hand = [...p2Hand] as CardId[];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = GRIFFINS;
      for (const unit of Object.values(state.combat!.units)) {
        unit.activatedThisRound = unit.id !== GRIFFINS && unit.id !== targetId;
      }
      return applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: GRIFFINS });
    }

    it("skips a GOLD unit's activation outright (Sorrow's bronze rung is the CONTROL that cannot)", () => {
      const state = aboutToActivate("kei-vi-gold", DREAD_KNIGHTS, ["specialty.kei_blue_archive.6", "spell.sorrow"]);
      expect(state.combat!.activeUnitId).toBe(DREAD_KNIGHTS);
      expect(state.combat!.units[DREAD_KNIGHTS].grade).toBe("gold");
      expect(state.reactionWindow?.triggerEvent.type).toBe("UNIT_ACTIVATION_STARTED");
      expect(reactionFor(state, "p1", "spell.sorrow", 0), "CONTROL: bronze Sorrow cannot skip a gold unit").toBeUndefined();
      const skip = reactionFor(state, "p1", "specialty.kei_blue_archive.6");
      expect(skip).toBeTruthy();
      const after = applyOk(state, skip!.action);
      const knights = after.combat!.units[DREAD_KNIGHTS];
      expect(knights.activatedThisRound).toBe(true);
      expect(knights.movedThisActivation).toBe(false);
      expect(knights.attackedThisActivation).toBeFalsy();
      expect(after.combat!.activeUnitId).not.toBe(DREAD_KNIGHTS);
      expect(after.reactionWindow).toBeNull();
      expect(after.players.p1.discard).toContain("specialty.kei_blue_archive.6");
    });

    it("is never offered against the player's OWN unit (controller: opponent)", () => {
      const state = createInitialGameState("kei-vi-own");
      state.players.p2.hand = ["specialty.kei_blue_archive.6"] as CardId[];
      state.players.p1.hand = [];
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = SKELETONS;
      for (const unit of Object.values(state.combat!.units)) {
        unit.activatedThisRound = unit.id !== SKELETONS && unit.id !== VAMPIRES;
      }
      const after = applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: SKELETONS });
      expect(after.combat!.activeUnitId).toBe(VAMPIRES);
      expect(after.reactionWindow ? reactionFor(after, "p2", "specialty.kei_blue_archive.6") : undefined).toBeUndefined();
      expect(after.combat!.units[VAMPIRES].activatedThisRound).toBe(false);
    });
  });
});

// ===========================================================================
// WOG commander Ibuki
// ===========================================================================

describe("WOG commander — Ibuki", () => {
  function castState(grades: Partial<Record<"attack" | "defense" | "health" | "damage" | "magic" | "speed", number>> = {}): GameState {
    const state = createInitialGameState("ibuki-audit");
    state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false };
    state.players.p1.commander = { slug: "ibuki", grades: { attack: 0, defense: 0, health: 0, damage: 0, magic: 0, speed: 0, ...grades } };
    const unit = makeCommanderCombatUnit(state.players.p1, 9);
    if (!unit) throw new Error("expected a commander combat unit");
    state.combat!.units[unit.id] = unit;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    const skeletons = state.combat!.units[SKELETONS];
    skeletons.abilities = [];
    skeletons.position = 10;
    skeletons.defense = 0;
    skeletons.maxHealth = 20;
    skeletons.damage = 0;
    state.combat!.activeUnitId = unit.id;
    state.activePlayerId = "p1";
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return state;
  }
  const IBUKI = commanderUnitId("p1");
  const useAbility = (state: GameState, abilityId: string, target: Extract<GameAction, { type: "USE_UNIT_ABILITY" }>["target"]) =>
    applyOk(state, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: IBUKI, abilityId, target } as GameAction);

  function executiveOrderOn(state: GameState, targetUnitId: UnitId): GameState {
    const offer = getLegalActions(state, "p1").find((legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === "commander-cast-executive-order");
    expect(offer, "Executive Order offered").toBeTruthy();
    const opened = applyOk(state, offer!.action);
    const choice = opened.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the commander-cast target choice");
    return applyOk(opened, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId });
  }

  it("AP ledger: a melee exchange with a retaliation earns +2 (attacking AND being attacked); a dead Ibuki earns nothing", () => {
    // READING PIN (no authored AP-gain text exists; see report): Ibuki attacks,
    // the Skeletons retaliate — "attacking" +1, then "being attacked" +1.
    const exchange = castState();
    const after = passAll(applyOk(exchange, { type: "ATTACK_UNIT", playerId: "p1", attackerId: IBUKI, defenderId: SKELETONS }));
    expect(after.combat!.units[IBUKI].ibukiActionPoints).toBe(3);

    const doomed = castState();
    const ibuki = doomed.combat!.units[IBUKI];
    ibuki.damage = ibuki.maxHealth - 1;
    doomed.combat!.units[SKELETONS].attack = 5;
    ibuki.retaliatedThisRound = true;
    doomed.activePlayerId = "p2";
    doomed.combat!.activeUnitId = SKELETONS;
    const killed = passAll(applyOk(doomed, { type: "ATTACK_UNIT", playerId: "p2", attackerId: SKELETONS, defenderId: IBUKI }));
    expect(killed.combat!.units[IBUKI].damage).toBeGreaterThanOrEqual(killed.combat!.units[IBUKI].maxHealth);
    expect(killed.combat!.units[IBUKI].ibukiActionPoints, "no AP for a lethal hit").toBe(1);
  });

  it("Sniper Shot: 1 damage at Power 0 AND Power 1 (2 only at Power 2); refuses an own unit; a 1-HP target is removed", () => {
    const powerOne = castState({ magic: 2 });
    const shot = useAbility(powerOne, "commander-ibuki-sniper-shot", { type: "unit", unitId: SKELETONS });
    expect(shot.combat!.units[SKELETONS].damage, "Power 1 is still 1 damage").toBe(1);

    const own = castState();
    const refused = applyAction(own, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: IBUKI, abilityId: "commander-ibuki-sniper-shot", target: { type: "unit", unitId: GRIFFINS } });
    expect(refused.errors.length).toBeGreaterThan(0);
    expect(refused.state.combat!.units[GRIFFINS].damage).toBe(0);

    const lethal = castState();
    lethal.combat!.units[SKELETONS].damage = 19;
    const kill = useAbility(lethal, "commander-ibuki-sniper-shot", { type: "unit", unitId: SKELETONS });
    expect(kill.combat!.units[SKELETONS].variant, "the lethal flat point flips the Pack").toBe("few");
    expect(getLegalActions(kill, "p1").some((legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === "commander-ibuki-sniper-shot"), "no AP left").toBe(false);
  });

  it("Up to Mischief at Power 0 carries NO Defense penalty (CONTROL: Ibuki's own hit is unchanged) and expires with the round", () => {
    const control = castState();
    control.combat!.units[IBUKI].abilities.push("ignores-retaliation");
    control.combat!.units[SKELETONS].defense = 1;
    const controlHit = passAll(applyOk(control, { type: "ATTACK_UNIT", playerId: "p1", attackerId: IBUKI, defenderId: SKELETONS }));

    const mischief = castState();
    mischief.combat!.units[IBUKI].ibukiActionPoints = 2;
    mischief.combat!.units[IBUKI].abilities.push("ignores-retaliation");
    mischief.combat!.units[SKELETONS].defense = 1;
    const debuffed = useAbility(mischief, "commander-ibuki-up-to-mischief", { type: "unit", unitId: SKELETONS });
    const effect = debuffed.activeEffects.find((entry) => entry.name.startsWith("Up to Mischief"));
    expect(effect?.duration).toEqual({ type: "current-combat-round" });
    expect(effect?.modifiers.some((modifier) => modifier.type === "DEFENSE_BONUS")).toBe(false);
    const hit = passAll(applyOk(debuffed, { type: "ATTACK_UNIT", playerId: "p1", attackerId: IBUKI, defenderId: SKELETONS }));
    expect(hit.combat!.units[SKELETONS].damage).toBe(controlHit.combat!.units[SKELETONS].damage);
  });

  it("Gadabout: a NON-adjacent landing hurts nobody; an occupied cell is refused; adjacent allies are never hit", () => {
    const far = castState();
    far.combat!.units[IBUKI].ibukiActionPoints = 2;
    const landed = useAbility(far, "commander-ibuki-gadabout", { type: "space", position: 0 });
    expect(landed.combat!.units[IBUKI].position).toBe(0);
    expect(landed.combat!.units[SKELETONS].damage).toBe(0);
    expect(landed.combat!.units[IBUKI].ibukiActionPoints).toBe(0);

    const occupied = castState();
    occupied.combat!.units[IBUKI].ibukiActionPoints = 2;
    const refused = applyAction(occupied, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: IBUKI, abilityId: "commander-ibuki-gadabout", target: { type: "space", position: 10 } });
    expect(refused.errors.length).toBeGreaterThan(0);
    expect(refused.state.combat!.units[IBUKI].position).toBe(9);

    const ally = castState();
    ally.combat!.units[IBUKI].ibukiActionPoints = 2;
    ally.combat!.units[GRIFFINS].position = 15; // adjacent to 11, as are the Skeletons at 10
    const next = useAbility(ally, "commander-ibuki-gadabout", { type: "space", position: 11 });
    expect(next.combat!.units[SKELETONS].damage).toBe(1);
    expect(next.combat!.units[GRIFFINS].damage).toBe(0);
  });

  it("Executive Order: a refreshed SILVER ally really attacks at −2 for that activation only; a fresh ally is not a candidate", () => {
    const base = castState({ magic: 2 });
    base.combat!.units[IBUKI].ibukiActionPoints = 3;
    base.combat!.units[GRIFFINS].grade = "silver";
    base.combat!.units[GRIFFINS].abilities = ["ignores-retaliation"];
    base.combat!.units[GRIFFINS].activatedThisRound = true;
    base.combat!.units[GRIFFINS].position = 14; // adjacent to the Skeletons at 10
    // A NOT-yet-activated ally is never offered.
    const offer = getLegalActions(base, "p1").find((legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === "commander-cast-executive-order");
    expect(offer).toBeTruthy();
    const opened = applyOk(base, offer!.action);
    if (opened.pendingChoice?.type !== "ABILITY_TARGET_CHOICE") throw new Error("expected the target pick");
    expect(opened.pendingChoice.candidateUnitIds).toContain(GRIFFINS);
    expect(opened.pendingChoice.candidateUnitIds, "Marksmen have not activated").not.toContain(MARKSMEN);

    const ordered = executiveOrderOn(base, GRIFFINS);
    expect(getDisplayAttackBonus(ordered, ordered.combat!.units[GRIFFINS])).toBe(-2);
    // The extra activation: 3 − 2 = 1 damage against Defense 0.
    ordered.combat!.activeUnitId = GRIFFINS;
    const hit = passAll(applyOk(ordered, { type: "ATTACK_UNIT", playerId: "p1", attackerId: GRIFFINS, defenderId: SKELETONS }));
    expect(hit.combat!.units[SKELETONS].damage).toBe(1);
    expect(hit.activeEffects.some((entry) => entry.name.includes("exertion")), "the debuff dies with the extra activation").toBe(false);

    // CONTROL: an un-ordered Griffins strike deals the full 3.
    const control = castState();
    control.combat!.units[GRIFFINS].grade = "silver";
    control.combat!.units[GRIFFINS].abilities = ["ignores-retaliation"];
    control.combat!.units[GRIFFINS].position = 14;
    control.combat!.activeUnitId = GRIFFINS;
    expect(passAll(applyOk(control, { type: "ATTACK_UNIT", playerId: "p1", attackerId: GRIFFINS, defenderId: SKELETONS })).combat!.units[SKELETONS].damage).toBe(3);
  });

  it("Executive Order costs exactly 3 AP: at 2 AP it is neither offered nor accepted, and the AP stay put", () => {
    const base = castState({ magic: 2 });
    base.combat!.units[IBUKI].ibukiActionPoints = 2;
    base.combat!.units[GRIFFINS].grade = "silver";
    base.combat!.units[GRIFFINS].activatedThisRound = true;
    base.combat!.units[GRIFFINS].position = 14;
    const offer = getLegalActions(base, "p1").find((legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === "commander-cast-executive-order");
    expect(offer, "2 AP cannot pay a 3-AP command").toBeUndefined();
    const forged = applyAction(base, { type: "USE_UNIT_ABILITY", playerId: "p1", unitId: IBUKI, abilityId: "commander-cast-executive-order" } as GameAction);
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.combat!.units[IBUKI].ibukiActionPoints).toBe(2);
    // CONTROL: the same board with 3 AP offers it.
    const funded = castState({ magic: 2 });
    funded.combat!.units[IBUKI].ibukiActionPoints = 3;
    funded.combat!.units[GRIFFINS].grade = "silver";
    funded.combat!.units[GRIFFINS].activatedThisRound = true;
    funded.combat!.units[GRIFFINS].position = 14;
    expect(getLegalActions(funded, "p1").some((legal) => legal.action.type === "USE_UNIT_ABILITY" && legal.action.abilityId === "commander-cast-executive-order")).toBe(true);
  });

  it("(READING) a SECOND Executive Order the same round is offered while 3 AP remain — no once-per-round cast budget for Ibuki", () => {
    const state = castState();
    state.combat!.units[IBUKI].ibukiActionPoints = 6;
    state.combat!.units[MARKSMEN].activatedThisRound = true;
    state.combat!.units[GRIFFINS].activatedThisRound = true;
    const once = executiveOrderOn(state, MARKSMEN);
    expect(once.combat!.units[MARKSMEN].activatedThisRound).toBe(false);
    expect(once.combat!.units[IBUKI].ibukiActionPoints).toBe(3);
    expect(getLegalActions(once, "p1").some((legal) => legal.action.type === "MOVE_UNIT"), "movement is locked").toBe(false);
    const twice = executiveOrderOn(once, GRIFFINS);
    expect(twice.combat!.units[GRIFFINS].activatedThisRound).toBe(false);
    expect(twice.combat!.units[IBUKI].ibukiActionPoints).toBe(0);
  });

  function movedIbuki(): GameState {
    const state = castState();
    state.combat!.units[IBUKI].ibukiActionPoints = 5; // move → 6
    state.combat!.units[MARKSMEN].activatedThisRound = true;
    const move = getLegalActions(state, "p1").find((legal) => legal.action.type === "MOVE_UNIT");
    expect(move).toBeTruthy();
    const moved = applyOk(state, move!.action);
    expect(moved.combat!.units[IBUKI].movedThisActivation).toBe(true);
    expect(moved.combat!.units[IBUKI].ibukiActionPoints).toBe(6);
    return moved;
  }

  it("after MOVING, Ibuki's commands are still OFFERED (the authored 'ends further movement' presumes a cast after a move)", () => {
    const moved = movedIbuki();
    const ids = getLegalActions(moved, "p1")
      .filter((legal) => legal.action.type === "USE_UNIT_ABILITY")
      .map((legal) => (legal.action.type === "USE_UNIT_ABILITY" ? legal.action.abilityId : ""));
    expect(ids, "Sniper Shot after a move").toContain("commander-ibuki-sniper-shot");
    expect(ids, "Executive Order after a move (6 AP)").toContain("commander-cast-executive-order");
  });

  it("Mission Briefing recovers the TOP of the discard (last card), and a commander-less seat gets nothing", () => {
    const state = castState();
    state.players.p1.discard = ["ability.offense", "ability.defense"];
    state.players.p1.deck = ["stat.attack"];
    state.players.p2.hand = [];
    state.players.p2.discard = ["stat.power"];
    state.players.p2.deck = ["stat.defense"];
    applyCommanderCombatStart(state);
    expect(state.players.p1.hand).toEqual(["ability.defense"]);
    expect(state.players.p1.discard).toEqual(["ability.offense"]);
    expect(state.players.p2.hand, "CONTROL: p2 has no commander").toEqual([]);
    expect(state.players.p2.discard).toEqual(["stat.power"]);
  });
});
