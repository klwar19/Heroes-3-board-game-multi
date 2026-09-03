import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  hexSpaceId,
  legalGateHexPairs,
  tileLatticeNeighbors
} from "./index";
import {
  disruptionEligibleTiles,
  disruptionLegalRotations,
  drawAstrologersCard,
  eliminatePlayer,
  getMainHero,
  materializeTileFields,
  rotateTileInPlace,
  getTileFootprintSpaceIds
} from "./adventure";
import { pumpAdventureQueues, startNeutralEncounter } from "./adventure-reducer";
import { hasToken } from "./tokens";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { AdventureState, GameAction, GameEvent, GameState, MapTileState, PlayerId } from "./state";

/**
 * Third-wave Astrologers proclamations, engine-enforced end to end (CLAUDE.md
 * #1 — every assertion fails if its wiring is removed, each with a CONTROL):
 *
 *   - Crag Hack (Stronghold): the round's FIRST combat grants every GROUND
 *     unit +1 Attack (latched at combat creation, read in the attack math),
 *     and the Crag Hack controller gets one free Goblin reinforce offer.
 *   - Multilingual Bron (Stretch Goals): a unit special-ability roll that came
 *     up against its controller is rerolled once (Death Stare, the
 *     Wyvern/Thunderbird die, extra-die Paralysis, the Satyr map roll…);
 *     neutral guards never reroll.
 *   - Disruption (Stretch Goals): each seat may rotate one hero-less revealed
 *     tile IN PLACE — a state-preserving permutation of its ring fields — no
 *     tile twice; with no rotatable tile the card is discarded and redrawn.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function abilityDiceEvents(
  state: GameState,
  label: string
): Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
      event.type === "UNIT_ABILITY_TRIGGERED" && event.dice?.label === label
  );
}

function setActive(state: GameState, activeCardId: string): void {
  state.adventure!.astrologers = {
    activeCardId,
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: []
  };
}

/** Seeds the sandbox (no adventure state) with a face-up proclamation. */
function setSandboxProclamation(state: GameState, activeCardId: string): void {
  state.adventure = {
    astrologers: {
      activeCardId,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    }
  } as unknown as AdventureState;
}

function settle(state: GameState): GameState {
  let current = state;
  let safety = 50;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

/** Picks the pending visit-step option whose label matches `match`. */
function chooseVisitOption(state: GameState, playerId: PlayerId, match: RegExp): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(legal, `expected a visit option matching ${match}`).toBeTruthy();
  return apply(state, legal!.action);
}

const apply = applyOk;

// ===========================================================================
// Crag Hack — first-combat ground +1 Attack (latch + attack math)
// ===========================================================================

describe("Astrologers — Crag Hack (first combat: ground units +1 Attack)", () => {
  /** A real neutral combat shell begun with `activeCardId` face up on `round`. */
  function beginCombat(seed: string, activeCardId: string, round: number): GameState {
    let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    setActive(state, activeCardId);
    state.round = round;
    const hero = getMainHero(state, "p1")!;
    const field = state.adventure!.fields[hero.spaceId!];
    field.difficulty = 2; // level-1 hero < difficulty → a real fight
    startNeutralEncounter(state, hero, field);
    return state;
  }

  /** Clear the finished combat and begin a fresh encounter in the same round. */
  function beginSecondCombat(state: GameState): void {
    state.combat = null;
    state.phase = "player-turn";
    const hero = getMainHero(state, "p1")!;
    startNeutralEncounter(state, hero, state.adventure!.fields[hero.spaceId!]);
  }

  it("latches +1 onto the round's FIRST combat shell (and marks the one-shot used)", () => {
    const state = beginCombat("crag-latch", "astrologers.crag_hack", 2);
    expect(state.combat?.proclamationGroundAttackBonus).toBe(1);
    expect(state.adventure?.astrologers?.firstCombatGroundAttackUsed).toBe(true);
  });

  it("the SECOND combat of the round goes unbuffed", () => {
    const state = beginCombat("crag-second", "astrologers.crag_hack", 2);
    beginSecondCombat(state);
    expect(state.combat?.proclamationGroundAttackBonus).toBeUndefined();
  });

  it("CONTROL: no latch on the following (odd) round, or under a different card", () => {
    const oddRound = beginCombat("crag-odd", "astrologers.crag_hack", 3);
    expect(oddRound.combat?.proclamationGroundAttackBonus).toBeUndefined();

    const otherCard = beginCombat("crag-none", "astrologers.dead_silence", 2);
    expect(otherCard.combat?.proclamationGroundAttackBonus).toBeUndefined();
  });

  /** Damage from an Attack-3 hit (die "0") by either side's `unitType` attacker. */
  function attackDamage(
    latched: boolean,
    unitType: "ground" | "ranged" | "flying",
    attackingPlayerId: "p1" | "p2" = "p1"
  ): number {
    const state = createInitialGameState("crag-hack-damage");
    if (latched) {
      state.combat!.proclamationGroundAttackBonus = 1;
    }
    const attackerId = attackingPlayerId === "p1" ? "unit_p1_griffins" : "unit_p2_skeletons";
    const defenderId = attackingPlayerId === "p1" ? "unit_p2_skeletons" : "unit_p1_griffins";
    const attacker = state.combat!.units[attackerId];
    attacker.abilities = [];
    attacker.type = unitType;
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units[defenderId];
    defender.abilities = [];
    defender.defense = 0;
    defender.position = 2; // adjacent to 1
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = attackingPlayerId;
    state.combat!.activeUnitId = attackerId;
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: attackingPlayerId, attackerId, defenderId })
    );
    return next.combat!.units[defenderId].damage;
  }

  it("buffs GROUND units on either side by exactly +1; RANGED and FLYING units are untouched", () => {
    expect(attackDamage(true, "ground") - attackDamage(false, "ground")).toBe(1);
    expect(attackDamage(true, "ground", "p2") - attackDamage(false, "ground", "p2")).toBe(1);
    expect(attackDamage(true, "ranged") - attackDamage(false, "ranged")).toBe(0);
    expect(attackDamage(true, "flying") - attackDamage(false, "flying")).toBe(0);
  });
});

// ===========================================================================
// Crag Hack — the controller's free Goblin reinforce
// ===========================================================================

describe("Astrologers — Crag Hack (free Goblin reinforce for the controller)", () => {
  function strongholdGame(seed: string, goblinSide: "few" | "pack"): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Crag", factionId: "stronghold", heroDefId: "crag_hack" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const goblins = state.players.p1.army.find((unit) => unit.unitDefId === "stronghold.goblins");
    expect(goblins, "the Stronghold starting army carries Goblins").toBeTruthy();
    goblins!.side = goblinSide;
    state.decks.astrologers.drawPile = ["astrologers.crag_hack"];
    return state;
  }

  it("offers the Crag Hack controller one FREE Goblin flip; choosing it spends nothing", () => {
    const state = strongholdGame("crag-goblins", "few");
    const goldBefore = state.players.p1.resources.gold;
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    const next = chooseVisitOption(state, "p1", /Reinforce Goblins \(free\)/);
    const goblins = next.players.p1.army.find((unit) => unit.unitDefId === "stronghold.goblins");
    expect(goblins?.side).toBe("pack");
    expect(next.players.p1.resources.gold).toBe(goldBefore);
    // Nobody else gets an offer — the queue is drained.
    expect(next.adventure?.pendingVisit).toBeNull();
  });

  it("CONTROL: with the Goblins already a Pack (or with no Crag Hack in play) nothing is offered", () => {
    const packed = strongholdGame("crag-goblins-pack", "pack");
    drawAstrologersCard(packed);
    pumpAdventureQueues(packed);
    expect(packed.adventure?.pendingVisit).toBeNull();

    const noCrag = createAdventureGameState({ seed: "crag-nobody", difficulty: "normal", rollFirstPlayer: false });
    noCrag.decks.astrologers.drawPile = ["astrologers.crag_hack"];
    drawAstrologersCard(noCrag);
    pumpAdventureQueues(noCrag);
    expect(noCrag.adventure?.pendingVisit).toBeNull();
  });
});

// ===========================================================================
// Multilingual Bron — ability rolls that miss are rerolled once
// ===========================================================================

describe("Astrologers — Multilingual Bron (reroll a unit's ability roll once)", () => {
  /**
   * Wyvern's Poison Sting (deals 1 on a rolled "0", the narrowest window):
   * scripted [attack 0, sting +1(miss), reroll 0(hit)].
   */
  function stingDamage(proclamation: string): number {
    const state = createInitialGameState("bron-sting");
    setSandboxProclamation(state, proclamation);
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["wyvern-sting"];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.defense = 0;
    defender.position = 2;
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.dice.scriptedRolls = [0, 1, 0, 0];
    state.combat!.dice.rollCount = 0;
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    return next.combat!.units.unit_p2_skeletons.damage;
  }

  it("a missed Sting die is rerolled once and lands (+1 damage over the control)", () => {
    expect(stingDamage("astrologers.multilingual_bron") - stingDamage("astrologers.dead_silence")).toBe(1);
  });

  it("rerolls Thunderbird Lightning and exposes both throws to the game UI", () => {
    const state = createInitialGameState("bron-thunderbird-ui");
    setSandboxProclamation(state, "astrologers.multilingual_bron");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["thunderbirds-lightning"];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.defense = 0;
    defender.position = 2;
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    // attack 0, lightning -1 (miss), Bron reroll 0 (hit)
    state.combat!.dice.scriptedRolls = [0, -1, 0];
    state.combat!.dice.rollCount = 0;

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id })
    );
    expect(next.combat!.units[defender.id].damage).toBe(4);
    const diceEvents = abilityDiceEvents(next, "Lightning Strike");
    expect(diceEvents.map((event) => event.dice?.rolls)).toEqual([[-1], [0]]);
    expect(diceEvents.map((event) => event.dice?.caption)).toEqual([
      "Multilingual Bron rerolls…",
      "1 extra damage to Pack of Skeletons!"
    ]);
  });

  it("rerolls the Basilisk's extra Stone Gaze die and Paralyzes the target", () => {
    const state = createInitialGameState("bron-basilisk");
    setSandboxProclamation(state, "astrologers.multilingual_bron");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["basilisk-paralysis"];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.defense = 0;
    defender.position = 2;
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    // attack 0, gaze +1 (miss), Bron reroll 0 (hit)
    state.combat!.dice.scriptedRolls = [0, 1, 0];
    state.combat!.dice.rollCount = 0;

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id })
    );
    expect(hasToken(next.combat!.units[defender.id], "paralysis")).toBe(true);
    expect(
      next.eventLog.some(
        (event) =>
          event.type === "UNIT_ABILITY_TRIGGERED" &&
          event.abilityId === "basilisk-paralysis-roll" &&
          event.dice?.caption === "Multilingual Bron rerolls…"
      )
    ).toBe(true);
  });

  it("rerolls a missed defensive ability die before damage is finalized", () => {
    const state = createInitialGameState("bron-defensive-roll");
    setSandboxProclamation(state, "astrologers.multilingual_bron");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = ["wog-dracolich-armor"];
    defender.defense = 0;
    defender.position = 2;
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = attacker.id;
    // attack 0, armor 0 (miss), Bron reroll -1 (soak 2)
    state.combat!.dice.scriptedRolls = [0, 0, -1];
    state.combat!.dice.rollCount = 0;

    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id })
    );
    expect(next.combat!.units[defender.id].damage).toBe(1);
    const diceEvents = abilityDiceEvents(next, "Necrotic Armor");
    expect(diceEvents.map((event) => event.dice?.rolls)).toEqual([[0], [-1]]);
  });

  it("rerolls a missed Fear Aura activation roll once", () => {
    const state = createInitialGameState("bron-fear-aura");
    setSandboxProclamation(state, "astrologers.multilingual_bron");
    const current = state.combat!.units.unit_p1_griffins;
    const fearUnit = state.combat!.units.unit_p2_skeletons;
    fearUnit.abilities = ["veteran-fear-aura"];
    fearUnit.initiative = 99;
    // Leave only the current unit and Fear Aura unit eligible in this round;
    // ending the current activation opens Fear Aura's activation immediately.
    for (const unit of Object.values(state.combat!.units)) {
      unit.activatedThisRound = unit.id !== current.id && unit.id !== fearUnit.id;
    }
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = current.id;
    // Fear Aura 0 (miss), Bron reroll -1 (hit).
    state.combat!.dice.scriptedRolls = [0, -1];
    state.combat!.dice.rollCount = 0;

    const next = applyOk(state, { type: "END_ACTIVATION", playerId: "p1", unitId: current.id });
    expect(
      Object.values(next.combat!.units).some(
        (unit) => unit.controllerId === "p1" && hasToken(unit, "paralysis")
      )
    ).toBe(true);
    const diceEvents = abilityDiceEvents(next, "Fear Aura");
    expect(diceEvents.map((event) => event.dice?.rolls)).toEqual([[0], [-1]]);
  });

  it("a SUCCESSFUL ability roll is never rerolled (no die is consumed for it)", () => {
    const state = createInitialGameState("bron-sting-hit");
    setSandboxProclamation(state, "astrologers.multilingual_bron");
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["wyvern-sting"];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.defense = 0;
    defender.position = 2;
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.dice.scriptedRolls = [0, 0, -1, -1];
    state.combat!.dice.rollCount = 0;
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(4); // 3 + sting 1
    expect(next.combat!.dice.rollCount).toBe(2); // attack + sting, no reroll die
  });

  /** Gorgon Death Stare (2 dice, double "-1"): a failed stare rerolled whole. */
  function stareOutcome(proclamation: string): GameState {
    const state = createInitialGameState("bron-stare");
    setSandboxProclamation(state, proclamation);
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = ["gorgon-death-stare"];
    attacker.attack = 3;
    attacker.position = 1;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.defense = 0;
    defender.position = 2;
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = true;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    // attack 0, stare (0, -1) → fail, Bron reroll (-1, -1) → petrify
    state.combat!.dice.scriptedRolls = [0, 0, -1, -1, -1];
    state.combat!.dice.rollCount = 0;
    return settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
  }

  /** Whether the stare PROC event fired (announce-only misses use the `-roll` id). */
  function stareProcced(state: GameState): boolean {
    return state.eventLog.some(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "gorgon-death-stare"
    );
  }

  it("a failed Death Stare is rerolled once (both dice) and petrifies; the control's miss stands", () => {
    const bron = stareOutcome("astrologers.multilingual_bron");
    expect(stareProcced(bron)).toBe(true); // health reduced to 0 on the reroll

    const control = stareOutcome("astrologers.dead_silence");
    expect(stareProcced(control)).toBe(false);
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(3); // just the melee hit
  });

  /**
   * Extra-die Paralysis on retaliation (Medusa "on a 0"): the defender's owner
   * rerolls a miss — unless the defender is a NEUTRAL guard ("you" is a player).
   */
  function retaliationParalysis(proclamation: string, defenderController: PlayerId): boolean {
    const state = createInitialGameState("bron-para");
    setSandboxProclamation(state, proclamation);
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.attack = 3;
    attacker.position = 1;
    attacker.maxHealth = 30;
    attacker.damage = 0;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = ["medusa-paralyze-retaliation-die"];
    defender.controllerId = defenderController;
    defender.defense = 0;
    defender.position = 2;
    defender.maxHealth = 30;
    defender.damage = 0;
    defender.retaliatedThisRound = false; // it retaliates → the gaze rolls
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    // attack 0, retaliation 0, gaze +1 (miss), reroll 0 (hit)
    state.combat!.dice.scriptedRolls = [0, 0, 1, 0];
    state.combat!.dice.rollCount = 0;
    const next = settle(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    return hasToken(next.combat!.units.unit_p1_griffins, "paralysis");
  }

  it("a player-owned unit rerolls its missed gaze (Paralysis lands); the control's miss stands", () => {
    expect(retaliationParalysis("astrologers.multilingual_bron", "p2")).toBe(true);
    expect(retaliationParalysis("astrologers.dead_silence", "p2")).toBe(false);
  });

  it("a NEUTRAL guard never rerolls — its missed gaze stands even with Bron up", () => {
    expect(retaliationParalysis("astrologers.multilingual_bron", NEUTRAL_PLAYER_ID)).toBe(false);
  });

  it("the Satyrs' map morale roll rerolls a non-'+1' once (a seed exists where only Bron gains)", () => {
    function satyrMoraleGain(seed: string, proclamation: string): { gained: boolean; rolls: number } {
      const raw = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
      const active = raw.activePlayerId;
      raw.players[active].army.push({ id: "army_sat", unitDefId: "neutral.satyrs", side: "neutral" });
      setActive(raw, proclamation);
      const state = applyOk(raw, { type: "REFRESH_HAND", playerId: active, discardCardIds: [] });
      const before = state.players[active].morale;
      const next = applyOk(state, { type: "SATYR_MORALE_ROLL", playerId: active });
      const rolls = next.eventLog.filter((event) => event.type === "ADVENTURE_DICE_ROLLED").length;
      return { gained: next.players[active].morale > before, rolls };
    }

    let rerollSaved = false;
    let successUntouched = false;
    for (let attempt = 0; attempt < 40 && !(rerollSaved && successUntouched); attempt += 1) {
      const seed = `bron-satyr-${attempt}`;
      const control = satyrMoraleGain(seed, "astrologers.dead_silence");
      const bron = satyrMoraleGain(seed, "astrologers.multilingual_bron");
      if (!control.gained && bron.gained) {
        rerollSaved = true; // the reroll flipped a dud into the "+1"
      }
      if (control.gained) {
        // A first-roll "+1" must not be rerolled: same single roll event.
        expect(bron.gained).toBe(true);
        expect(bron.rolls).toBe(control.rolls);
        successUntouched = true;
      }
    }
    expect(rerollSaved, "a seed where only Bron's reroll gains morale").toBe(true);
    expect(successUntouched, "a seed proving a successful roll is untouched").toBe(true);
  });
});

// ===========================================================================
// Disruption — rotate one hero-less tile per seat, in place, no tile twice
// ===========================================================================

describe("Astrologers — Disruption (rotate one tile per player, state-preserving)", () => {
  /** Reveals a fresh F1 tile far from the play area and returns it. */
  function addRevealedTile(state: GameState, id: string, centerRow: number, centerCol: number): MapTileState {
    const adventure = state.adventure!;
    const tile: MapTileState = { id, tileDefId: "F1", centerRow, centerCol, rotation: 0, faceDown: false, group: "far" };
    adventure.tiles[id] = tile;
    materializeTileFields(adventure, tile);
    return tile;
  }

  function twoSeatGame(seed: string): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    state.decks.astrologers.drawPile = ["astrologers.disruption"];
    return state;
  }

  it("a Hero excludes its tile; a Town alone does not create an unprinted exemption", () => {
    const state = twoSeatGame("disruption-eligible");
    expect(disruptionEligibleTiles(state)).toEqual([]);
    const tile = addRevealedTile(state, "tile_test", 20, 20);
    expect(disruptionEligibleTiles(state).map((candidate) => candidate.id)).toEqual([tile.id]);
    // A hero standing anywhere on it removes it again.
    getMainHero(state, "p2")!.spaceId = getTileFootprintSpaceIds(tile)[3];
    const remaining = disruptionEligibleTiles(state);
    expect(remaining.some((candidate) => candidate.id === tile.id)).toBe(false);
    expect(remaining.some((candidate) => candidate.group === "starting")).toBe(true);
  });

  it("rotates in place: every field keeps its state and moves to its slot's new hex", () => {
    const state = twoSeatGame("disruption-rotate");
    const tile = addRevealedTile(state, "tile_test", 20, 20);
    const adventure = state.adventure!;
    const before = getTileFootprintSpaceIds(tile);
    // Mark the slot-1 field (F1's windmill): a Black Cube and a flag.
    const windmillBefore = adventure.fields[before[1]];
    expect(windmillBefore.location).toBe("windmill");
    windmillBefore.blackCube = true;
    windmillBefore.flagOwnerId = "p2";

    expect(rotateTileInPlace(adventure, tile, 1)).toBe(true);
    expect(tile.rotation).toBe(1);

    const after = getTileFootprintSpaceIds(tile);
    expect(new Set(after)).toEqual(new Set(before)); // same seven hexes
    expect(after[1]).not.toBe(before[1]);
    // The windmill moved WHOLE to slot 1's new hex — cube, flag and identity.
    const windmillAfter = adventure.fields[after[1]];
    expect(windmillAfter.location).toBe("windmill");
    expect(windmillAfter.blackCube).toBe(true);
    expect(windmillAfter.flagOwnerId).toBe("p2");
    expect(windmillAfter.spaceId).toBe(after[1]);
    // Its old hex now hosts the field whose slot lands there (F1 slot 6).
    expect(adventure.fields[before[1]].location).toBe("settlement");
    // Nothing duplicated: exactly one Black Cube across the tile.
    const cubes = after.filter((spaceId) => adventure.fields[spaceId].blackCube);
    expect(cubes).toEqual([after[1]]);
  });

  it("allows Underground and linked Gate tiles, but hides rotations that break the entrance", () => {
    const state = twoSeatGame("disruption-underground-gate");
    const surfaceCenter = { row: 30, col: 30 };
    const undergroundCenter = tileLatticeNeighbors(surfaceCenter)[0];
    const surface = addRevealedTile(state, "tile_surface_gate", surfaceCenter.row, surfaceCenter.col);
    const underground = addRevealedTile(
      state,
      "tile_underground_gate",
      undergroundCenter.row,
      undergroundCenter.col
    );
    underground.tileDefId = "U1";
    underground.group = "subterranean";
    materializeTileFields(state.adventure!, underground);

    const pair = legalGateHexPairs(surfaceCenter, undergroundCenter)[0];
    expect(pair).toBeTruthy();
    const surfaceGate = state.adventure!.fields[hexSpaceId(pair.gateHex)];
    const undergroundGate = state.adventure!.fields[hexSpaceId(pair.entranceHex)];
    surfaceGate.location = "subterranean_gate";
    surfaceGate.gateToTileId = underground.id;
    surfaceGate.gateLinkSpaceId = undergroundGate.spaceId;
    undergroundGate.location = "subterranean_gate";
    undergroundGate.gateToTileId = surface.id;
    undergroundGate.gateLinkSpaceId = surfaceGate.spaceId;

    const eligibleIds = disruptionEligibleTiles(state).map((tile) => tile.id);
    // This exact surface half has no alternative ring position that remains
    // adjacent, so "if possible" excludes it instead of offering a trap.
    expect(eligibleIds).not.toContain(surface.id);
    expect(eligibleIds).toContain(underground.id);

    expect(disruptionLegalRotations(state, surface)).toEqual([]);
    const legal = disruptionLegalRotations(state, underground);
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.length).toBeLessThan(5);
    expect(legal).not.toContain(surface.rotation);
  });

  it("end to end: each seat rotates at most one tile, never the same one, inside the barrier", () => {
    const state = twoSeatGame("disruption-e2e");
    const tile = addRevealedTile(state, "tile_test", 20, 20);
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.disruption");
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    let next = chooseVisitOption(state, "p1", /Rotate tile F1/);
    next = chooseVisitOption(next, "p1", /Turn 120° clockwise/);
    expect(next.adventure!.tiles[tile.id].rotation).toBe(2);
    expect(next.adventure?.astrologers?.disruptionRotatedTileIds).toEqual([tile.id]);

    // The only eligible tile is used up: p2's offer resolves silently and the
    // queue drains — nobody is left frozen behind a dead prompt.
    expect(next.adventure?.pendingVisit).toBeNull();
    expect(next.adventure?.rewardQueue ?? []).toEqual([]);
  });

  it("a seat may Skip; the tile stays available to the next seat", () => {
    const state = twoSeatGame("disruption-skip");
    const tile = addRevealedTile(state, "tile_test", 20, 20);
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    let next = chooseVisitOption(state, "p1", /Rotate tile F1/);
    next = chooseVisitOption(next, "p1", /Pick a different tile/);
    next = chooseVisitOption(next, "p1", /^Skip$/);
    expect(next.adventure!.tiles[tile.id].rotation).toBe(0);

    // p2 now gets the offer and rotates it.
    expect(next.adventure?.pendingVisit?.playerId).toBe("p2");
    next = chooseVisitOption(next, "p2", /Rotate tile F1/);
    next = chooseVisitOption(next, "p2", /Turn 60° clockwise/);
    expect(next.adventure!.tiles[tile.id].rotation).toBe(1);
    expect(next.adventure?.pendingVisit).toBeNull();
  });

  it("real round wrap: the barrier freezes other seats, and an ELIMINATION mid-offer never strands the table", () => {
    let state = createAdventureGameState({
      seed: "disruption-barrier-elim",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
        { id: "p3", name: "Mephala", factionId: "rampart", heroDefId: "mephala" }
      ]
    });
    state.decks.astrologers.drawPile = ["astrologers.disruption"];
    const tileA = addRevealedTile(state, "tile_a", 20, 20);
    addRevealedTile(state, "tile_b", 20, 26).tileDefId = "F2";
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }

    // Round 1 plays out; the wrap into round 2 draws Disruption for real
    // (startAdventureRound), raising the round-start barrier.
    state = applyOk(state, { type: "END_TURN", playerId: "p1" });
    state = applyOk(state, { type: "END_TURN", playerId: "p2" });
    state = applyOk(state, { type: "END_TURN", playerId: "p3" });
    expect(state.round).toBe(2);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.disruption");
    expect(state.adventure?.eventResolution?.round).toBe(2);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    // Every other seat is fully frozen while seat 1's offer is open.
    expect(getLegalActions(state, "p2")).toEqual([]);
    expect(getLegalActions(state, "p3")).toEqual([]);

    // Seat 1 rotates tile A; the slot moves to seat 2 in order.
    state = chooseVisitOption(state, "p1", /Rotate tile F1/);
    state = chooseVisitOption(state, "p1", /Turn 60° clockwise/);
    expect(state.adventure!.tiles[tileA.id].rotation).toBe(1);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p2");

    // Seat 2 — the CURRENT resolver — is eliminated with its offer open.
    eliminatePlayer(state, "p2", "removed mid-resolution", false);
    pumpAdventureQueues(state);
    expect(state.players.p2.eliminated).toBe(true);
    expect(state.adventure?.pendingVisit?.playerId).toBe("p3");
    expect(state.adventure?.eventResolution?.round).toBe(2);

    // Seat 3's offer excludes the already-rotated tile A ("no tile twice").
    const rotateOffers = getLegalActions(state, "p3").filter((entry) => /^Rotate tile/.test(entry.label));
    expect(rotateOffers.some((entry) => /^Rotate tile F1/.test(entry.label))).toBe(false);
    // Seat 3 rotates tile B; the barrier lifts and play continues.
    state = chooseVisitOption(state, "p3", /Rotate tile F2/);
    state = chooseVisitOption(state, "p3", /Turn 60° clockwise/);
    expect(state.adventure!.tiles.tile_b.rotation).toBe(1);
    expect(state.adventure?.eventResolution ?? null).toBeNull();
    expect(state.adventure?.pendingVisit).toBeNull();
  });

  it("with NO rotatable tile the card is discarded and another drawn, as printed", () => {
    const state = twoSeatGame("disruption-redraw");
    // No revealed tile beyond the home tiles → nothing rotatable.
    state.decks.astrologers.drawPile = ["astrologers.dead_silence", "astrologers.disruption"];
    drawAstrologersCard(state);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.dead_silence");
    expect(state.decks.astrologers.discardPile).toContain("astrologers.disruption");
  });

  it("CONTROL: with an eligible tile the card is NOT redrawn", () => {
    const state = twoSeatGame("disruption-no-redraw");
    addRevealedTile(state, "tile_test", 20, 20);
    state.decks.astrologers.drawPile = ["astrologers.dead_silence", "astrologers.disruption"];
    drawAstrologersCard(state);
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.disruption");
  });
});
