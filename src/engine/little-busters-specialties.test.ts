import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitSoundKey } from "@/data/unit-sounds";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getActivationOrder,
  getLegalActions,
  DEFAULT_ANIME_OPTIONS,
  NEUTRAL_PLAYER_ID
} from "./index";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { NEUTRAL_DECK_IDS } from "./adventure";
import type { CombatState, CombatUnitState, GameAction, GameState, UnitId } from "./state";

/**
 * The five ORIGINAL Little Busters hero specialty sets (2026-09-05).
 *
 * Every case below asserts the OBSERVABLE game outcome (a board position, a
 * damage DELTA, a unit that exists or does not) through the real
 * applyAction/reducer pipeline, each with a CONTROL on the same setup.
 *
 * MUTATION LEDGER — every entry below was APPLIED, RUN and REVERTED against
 * this file (2026-09-06 adversarial re-verification). The engine line is quoted
 * so each check is reproducible; the named case is the one that failed.
 *
 * Sasami — Home Run
 *  1. reducer.ts `applyLittleBustersHomeRun`: drop `attackRoll <
 *     homeRun.minRoll` → "Home Run I fires only on a '+1'…" (a "0" shoves).
 *  2. reducer.ts same: neuter the `outcome.kind === "push"` branch → "shoves a
 *     surviving adjacent target…" (the target never moves).
 *  3. little-busters-specialties.ts `knockbackCellBehind`: drop the board-bounds
 *     guard → "a shove that would leave the board…" — the index arithmetic
 *     silently WRAPS onto cell 7, one row up, so this guard is load-bearing.
 *  4. same file `homeRunOutcome`: drop the `unitRefusesRelocation` clause → "a
 *     target the Teleport spell refuses to relocate…" (the Arrow Tower moves).
 *  5. same file `homeRunOutcome`: drop the `!alive(defender)` early return → "a
 *     destroyed target is neither shoved nor hurt again" (the corpse is shoved).
 *  6. legal-actions.ts `isEffectLegalForTrigger`: drop `!triggerEvent
 *     .isRetaliation` → "is never offered on a Retaliation Attack".
 *
 * Rin — Cat Corps
 *  7. reducer.ts Cat Corps branch: mint the cat from `addArmyUnit(...)` (the
 *     Summon Elemental recipe) instead of the synthetic army entry → "summons
 *     one Stray Cat…" (the player's army grows by a card).
 *  8. adventure-reducer.ts finalize: drop `coreUnitDefinitions[unit.unitDefId]
 *     ?.faction === "neutral"` → "the summoned cats vanish with the combat…"
 *     (the cat's id is injected into the shared bronze Neutral discard pile).
 *  9. legal-actions.ts empty-space enumeration: drop the `anchoredOnly` filter →
 *     "only lands beside one of your own units…" (cell 2 becomes offerable).
 * 10. little-busters-specialties.ts `campusCatPositions`: drop the
 *     `catLandingIsAnchored` clause → "VI's second cat also lands beside your
 *     line…" (the second cat teleports to cell 0 behind the enemy).
 * 11. reducer.ts Cat Corps branch: drop ALL THREE isolation flags (`summoned`,
 *     `temporary`, `delete cat.armyUnitId`) → "a fallen summoned CAT is not a
 *     fallen friend…". They are individually REDUNDANT — see the NOT
 *     REPRODUCIBLE note below.
 *
 * Riki — Little Busters' Bond
 * 12. reducer.ts Bond branch: `fallen` instead of `Math.min(fallen,
 *     effect.maxAttack)` → "pays +1 Attack per fallen friend and caps…". (An
 *     earlier pass claimed this mutation was not caught; it is — level I with 2
 *     casualties deals 2 more damage instead of 1.)
 * 13. little-busters-specialties.ts `fallenArmyUnitCount`: drop `!unit.summoned`
 *     → "a fallen SUMMON is not counted…". The fixture mints the shape
 *     `placeSummonedUnit` really produces (a REAL army card flagged `summoned`);
 *     a fixture that also deletes the army linkage discriminates nothing.
 * 14. same read: drop BOTH `Boolean(unit.armyUnitId)` and `!unit.commanderSlug`
 *     → "a fallen COMMANDER is not counted" (the two clauses cover each other).
 * 15. legal-actions.ts: drop the `fallenArmyUnitCount(state, playerId) < 1` gate
 *     → "is not offered while none of your own units has fallen".
 *
 * Yuiko — Blade Dance
 * 16. reducer.ts `applyAfterAttackSplash`: drop `unit.id !== defender.id` from
 *     the Blade Dance filter → "does not splash the struck target…".
 * 17. same filter: drop `isAdjacent(unit.position, attacker.position)` →
 *     "splashes every OTHER enemy beside the attacker…".
 * 18. same filter: drop `unit.controllerId !== attacker.controllerId` → "…never
 *     touches an ally".
 * 19. little-busters-specialties.ts `bladeDanceSplashFor`: drop `roll >=
 *     modifier.minRoll` → "I needs a '0' or '+1'; VI deals 2".
 * 20. reducer.ts Blade Dance branch: `duration: {type:"combat"}` instead of
 *     `"current-activation"` → "the buff dies with the activation…".
 * 21. legal-actions.ts: drop the `activeUnit?.type !== "ground"` gate → "is not
 *     offered while a RANGED unit holds the activation". (The printed "before it
 *     attacks" half needs NO clause of its own: adding one was reverted after a
 *     mutation showed the shared combat-play gate already covers it.)
 * 22. reducer.ts Cat Corps branch: `cat.activatedThisRound = true` → "a summoned
 *     cat joins the activation order this round".
 *
 * Komari — Star Candy
 * 23. events.ts `consumeStarCandyShield`: stop filtering the effect out of
 *     `state.activeEffects` → "the shield is spent by the first hit…".
 * 24. reducer.ts attack path: drop the `consumeStarCandyShield` call → "a LETHAL
 *     blow the shield absorbs…". What it discriminates is the number the ATTACK
 *     PATH itself uses (the ATTACK_ROLLED event, and with it the lethal-save
 *     preview and the defeated-side read) — the DAMAGE_ASSIGNED seam alone
 *     leaves the unit's final damage right, so a damage-delta assertion CANNOT
 *     see this and an earlier pass wrongly claimed one did.
 * 25. events.ts `appendEvent`: delete the Star Candy block → "also soaks SPELL
 *     damage" (the event seam is the only cover for non-attack damage).
 * 26. reducer.ts Star Candy branch: ignore `effect.alsoMostWounded` → "VI
 *     shields a second unit…".
 *
 * NOT REPRODUCIBLE — recorded rather than dressed up:
 *  - The cats' three isolation flags (`summoned` / `temporary` / no army card)
 *    each cover the others at every reader, so no ONE-line mutation is caught;
 *    #11 drops all three. Keep all three anyway: each reader picks a different
 *    one (fallenArmyUnitCount reads `summoned`, the finalize recycle reads
 *    `temporary`, the army write-back reads `armyUnitId`).
 *  - `!unit.temporary` and `!unit.commanderSlug` in `fallenArmyUnitCount` are
 *    likewise individually redundant (every temporary body deletes its army
 *    card, and a commander never has one) — see #14.
 *  - `homeRunOutcome`'s "damage" arm can never be OBSERVED on a dead target:
 *    the shipped `applyFlatAbilityDamage` refuses a target that is already down.
 *    #5 pins the branch from the other side (the corpse must not be shoved).
 *  - "Home Run / Blade Dance never fire on a Retaliation Attack" is STRUCTURAL:
 *    both sit past the `isRetaliation` / `abilityAttack` early returns of
 *    finishResolvedAttack (the seam they share with Jinchuriki Chakra Burst), so
 *    no single-line mutation isolates them. The Home Run OFFER half is #6.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass every open reaction window until the parked action has resolved. */
function settle(state: GameState): GameState {
  let current = state;
  for (let safety = 40; safety > 0 && current.reactionWindow; safety -= 1) {
    current = apply(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

function unit(state: GameState, id: UnitId): CombatUnitState {
  const found = state.combat!.units[id];
  expect(found, `${id} must exist`).toBeTruthy();
  return found;
}

/** A quiet combat: nobody carries printed abilities, nothing retaliates. */
function quietCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  for (const combatUnit of Object.values(state.combat!.units)) {
    combatUnit.abilities = [];
    combatUnit.damage = 0;
    combatUnit.maxHealth = 40;
    combatUnit.defense = 0;
    combatUnit.retaliatedThisRound = true;
    combatUnit.position = 19;
  }
  return state;
}

function scriptDice(state: GameState, roll: number): void {
  state.combat!.dice.scriptedRolls = Array.from({ length: 12 }, () => roll);
  state.combat!.dice.rollCount = 0;
}

// ===========================================================================
// 1. Sasami — "Home Run"
// ===========================================================================

type HomeRunOptions = {
  level: 1 | 4 | 6;
  roll: number;
  /** Play the instant into the attack window (false = the CONTROL run). */
  play: boolean;
  /** Shoot from range instead of standing next to the target. */
  ranged?: boolean;
  /** Park a body on the cell behind the target so the shove is blocked. */
  blockBehind?: boolean;
  /** Make the target die to the attack. */
  lethal?: boolean;
  /**
   * Shove toward the board edge: the attacker stands on 9 and the target on 8
   * (row 2, column 0), so the cell continuing the line is column -1.
   */
  edge?: boolean;
  /** Give the target the Arrow Tower's ability — the one body Teleport refuses. */
  towerTarget?: boolean;
};

const ATTACKER: UnitId = "unit_p1_griffins";
const TARGET: UnitId = "unit_p2_skeletons";
const BLOCKER: UnitId = "unit_p2_vampires";

function homeRunFight(seed: string, options: HomeRunOptions): GameState {
  const cardId = `specialty.sasami_sasasegawa.${options.level}`;
  let state = quietCombat(seed);
  state.players.p1.hand = options.play ? [cardId] : [];

  const attacker = unit(state, ATTACKER);
  const target = unit(state, TARGET);
  // 8 → 9 → 10 is a straight orthogonal line across row 2 of the 4-wide board.
  attacker.position = options.ranged ? 1 : options.edge ? 9 : 8;
  attacker.type = options.ranged ? "ranged" : "ground";
  attacker.attack = 4;
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;
  target.position = options.edge ? 8 : 9;
  target.maxHealth = options.lethal ? 1 : 40;
  if (options.towerTarget) {
    target.abilities = ["siege-arrow-tower"];
  }
  unit(state, BLOCKER).position = options.blockBehind ? 10 : 19;

  state.combat!.activeUnitId = ATTACKER;
  scriptDice(state, options.roll);

  state = apply(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: ATTACKER,
    defenderId: TARGET
  });

  if (options.play) {
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        (legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD") &&
        legal.action.cardId === cardId
    );
    expect(offer, `${cardId} must join its own attack window`).toBeTruthy();
    state = apply(state, offer!.action);
  }
  return settle(state);
}

describe("Sasami — Home Run", () => {
  it("shoves a surviving adjacent target one space directly away", () => {
    const shoved = homeRunFight("lb-home-run-push", { level: 1, roll: 1, play: true });
    expect(unit(shoved, TARGET).position, "8 → 9 → 10: the cell continuing the line").toBe(10);
    expect(
      shoved.eventLog.some(
        (event) => event.type === "UNIT_MOVED" && event.unitId === TARGET && event.from === 9 && event.to === 10
      ),
      "the shove emits a real UNIT_MOVED"
    ).toBe(true);

    // CONTROL: the same attack without the card leaves the target standing.
    const control = homeRunFight("lb-home-run-push-control", { level: 1, roll: 1, play: false });
    expect(unit(control, TARGET).position).toBe(9);
  });

  it("Home Run I fires only on a '+1'; IV also on a '0'; VI on every face", () => {
    // The die gate is the ONLY difference between these three runs.
    expect(unit(homeRunFight("lb-hr-1-zero", { level: 1, roll: 0, play: true }), TARGET).position).toBe(9);
    expect(unit(homeRunFight("lb-hr-4-zero", { level: 4, roll: 0, play: true }), TARGET).position).toBe(10);
    expect(unit(homeRunFight("lb-hr-4-minus", { level: 4, roll: -1, play: true }), TARGET).position).toBe(9);
    expect(unit(homeRunFight("lb-hr-6-minus", { level: 6, roll: -1, play: true }), TARGET).position).toBe(10);
  });

  it("a blocked shove deals damage instead — 1 at I/IV, 2 at VI", () => {
    const base = unit(
      homeRunFight("lb-hr-blocked-control", { level: 1, roll: 1, play: false, blockBehind: true }),
      TARGET
    ).damage;
    const one = unit(
      homeRunFight("lb-hr-blocked-1", { level: 1, roll: 1, play: true, blockBehind: true }),
      TARGET
    );
    const six = unit(
      homeRunFight("lb-hr-blocked-6", { level: 6, roll: 1, play: true, blockBehind: true }),
      TARGET
    );
    expect(one.position, "the occupied cell refuses the shove").toBe(9);
    expect(one.damage - base, "level I pays 1 extra damage").toBe(1);
    expect(six.damage - base, "level VI pays 2").toBe(2);
  });

  it("a ranged attacker standing away from its target deals the damage instead of shoving", () => {
    const base = unit(
      homeRunFight("lb-hr-ranged-control", { level: 4, roll: 1, play: false, ranged: true }),
      TARGET
    ).damage;
    const shot = unit(homeRunFight("lb-hr-ranged", { level: 4, roll: 1, play: true, ranged: true }), TARGET);
    expect(shot.position, "cell 1 and cell 9 are not adjacent, so nothing is shoved").toBe(9);
    expect(shot.damage - base).toBe(1);
  });

  it("a shove that would leave the board deals the damage instead", () => {
    // Attacker on 9, target on 8 (row 2, column 0): the cell continuing the line
    // is column -1. Without the bounds check that index arithmetic wraps onto
    // cell 7 — the row above — so this pins the guard, not just the branch.
    const base = unit(
      homeRunFight("lb-hr-edge-control", { level: 6, roll: 1, play: false, edge: true }),
      TARGET
    ).damage;
    const shoved = homeRunFight("lb-hr-edge", { level: 6, roll: 1, play: true, edge: true });
    expect(unit(shoved, TARGET).position, "there is no space past column 0").toBe(8);
    expect(unit(shoved, TARGET).damage - base, "VI pays 2 instead").toBe(2);
  });

  it("a target the Teleport spell refuses to relocate takes the damage instead", () => {
    // The Arrow Tower is the whole of that list today, read through the SAME
    // arrowTowerRefusesEffect gate Teleport and the Necklace of Swiftness take.
    // The cell behind is free here, so only the refusal keeps the target still.
    const base = unit(
      homeRunFight("lb-hr-tower-control", { level: 1, roll: 1, play: false, towerTarget: true }),
      TARGET
    ).damage;
    const struck = homeRunFight("lb-hr-tower", { level: 1, roll: 1, play: true, towerTarget: true });
    expect(struck.combat!.units[TARGET].position, "the Tower is never relocated").toBe(9);
    expect(struck.combat!.units[TARGET].damage - base, "it takes the blocked damage").toBe(1);

    // CONTROL: the same fight with an ordinary target IS shoved.
    const ordinary = homeRunFight("lb-hr-tower-ordinary", { level: 1, roll: 1, play: true });
    expect(unit(ordinary, TARGET).position).toBe(10);
  });

  it("a destroyed target is neither shoved nor hurt again", () => {
    const dead = homeRunFight("lb-hr-lethal", { level: 6, roll: 1, play: true, lethal: true });
    expect(unit(dead, TARGET).position, "a corpse never moves").toBe(9);
    expect(
      dead.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "little-busters-home-run"
      ),
      "no Home Run line at all"
    ).toBe(false);
  });

  it("is never offered on a Retaliation Attack", () => {
    // p2's Skeletons attack; p1's Griffins retaliate. Home Run is p1's card and
    // p1 owns the retaliating unit, so only the isRetaliation gate keeps it out.
    let state = quietCombat("lb-hr-retaliation");
    state.players.p1.hand = ["specialty.sasami_sasasegawa.6"];
    const enemy = unit(state, TARGET);
    const mine = unit(state, ATTACKER);
    enemy.position = 8;
    mine.position = 9;
    mine.retaliatedThisRound = false;
    enemy.activatedThisRound = false;
    enemy.attackedThisActivation = false;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = TARGET;
    scriptDice(state, 1);

    state = apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: TARGET,
      defenderId: ATTACKER
    });
    const offers: string[] = [];
    for (let safety = 40; safety > 0 && state.reactionWindow; safety -= 1) {
      const isRetaliation = Boolean(
        state.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
          state.reactionWindow.triggerEvent.isRetaliation
      );
      if (isRetaliation) {
        for (const legal of getLegalActions(state, "p1")) {
          if (
            (legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD") &&
            legal.action.cardId === "specialty.sasami_sasasegawa.6"
          ) {
            offers.push(legal.action.cardId);
          }
        }
      }
      state = apply(state, {
        type: "PASS_REACTION",
        playerId: state.reactionWindow.priorityPlayerId
      });
    }
    expect(offers, "no Home Run offer inside a retaliation window").toEqual([]);
  });
});

// ===========================================================================
// 2. Rin — "Cat Corps"
// ===========================================================================

function catCorpsState(seed: string, level: 1 | 4 | 6): GameState {
  const state = quietCombat(seed);
  state.players.p1.hand = [`specialty.rin_natsume.${level}`];
  // The summoner stands on 4 so cell 5 (its neighbour) is a legal landing.
  unit(state, ATTACKER).position = 4;
  unit(state, ATTACKER).activatedThisRound = false;
  unit(state, ATTACKER).attackedThisActivation = false;
  state.combat!.activeUnitId = ATTACKER;
  return state;
}

function summonedCats(state: GameState): CombatUnitState[] {
  return Object.values(state.combat!.units).filter((candidate) =>
    candidate.unitDefId === "little_busters.stray_cat" || candidate.unitDefId === "little_busters.alley_cat"
  );
}

function playCatCorps(state: GameState, level: 1 | 4 | 6, position: number): GameState {
  const cardId = `specialty.rin_natsume.${level}`;
  const offer = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "space" &&
      legal.action.target.position === position
  );
  expect(offer, `${cardId} must offer the empty space ${position}`).toBeTruthy();
  return apply(state, offer!.action);
}

describe("Rin — Cat Corps", () => {
  it("summons one Stray Cat with its printed body on the chosen space", () => {
    const armyBefore = catCorpsState("lb-cats-one", 1).players.p1.army.length;
    const after = playCatCorps(catCorpsState("lb-cats-one", 1), 1, 5);
    const cats = summonedCats(after);
    expect(cats).toHaveLength(1);
    const cat = cats[0];
    expect([cat.attack, cat.defense, cat.maxHealth, cat.initiative]).toEqual([1, 0, 1, 10]);
    expect(cat.position).toBe(5);
    expect(cat.controllerId).toBe("p1");
    expect(cat.summoned).toBe(true);
    expect(cat.temporary).toBe(true);
    expect(cat.armyUnitId, "a summoned cat carries no army card").toBeUndefined();
    expect(after.players.p1.army).toHaveLength(armyBefore);
  });

  it("IV fields the tougher Alley Cat and VI places two of them", () => {
    const four = summonedCats(playCatCorps(catCorpsState("lb-cats-four", 4), 4, 5));
    expect(four).toHaveLength(1);
    expect([four[0].unitDefId, four[0].maxHealth]).toEqual(["little_busters.alley_cat", 2]);
    expect(four[0].abilities).toContain("ignores-retaliation");

    const six = summonedCats(playCatCorps(catCorpsState("lb-cats-six", 6), 6, 5));
    expect(six, "VI places two cats from one play, with no second window").toHaveLength(2);
    expect(new Set(six.map((cat) => cat.position)).size, "on two different spaces").toBe(2);
    expect(six.map((cat) => cat.position)).toContain(5);
  });

  it("only lands beside one of your own units — never behind the enemy line", () => {
    // p1's only body stands on 4, so 5 is legal and cell 2 (three rows of
    // nobody away) is not, in the OFFER and in the resolution alike.
    const state = catCorpsState("lb-cats-anchor", 1);
    for (const other of ["unit_p1_crusaders", "unit_p1_marksmen"] as UnitId[]) {
      unit(state, other).damage = unit(state, other).maxHealth;
    }
    const offeredSpaces = getLegalActions(state, "p1")
      .filter(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "specialty.rin_natsume.1" &&
          legal.action.target?.type === "space"
      )
      .map((legal) =>
        legal.action.type === "PLAY_CARD" && legal.action.target?.type === "space"
          ? legal.action.target.position
          : -1
      );
    expect(offeredSpaces, "the summoner's own neighbours are offered").toContain(5);
    expect(offeredSpaces, "a space with no friendly unit beside it is not").not.toContain(2);
    expect(
      offeredSpaces.every((position) => [0, 5, 8].includes(position)),
      "exactly the four neighbours of cell 4, minus the occupied ones"
    ).toBe(true);
  });

  it("VI's second cat also lands beside your line, not on the first free cell", () => {
    // p1's only body stands on 18 and the pick is 17, so the lowest free cell on
    // the board (0) is nowhere near the player's line: the auto-placed second cat
    // must take a neighbour of 18/17 (13) instead.
    const state = catCorpsState("lb-cats-anchor-second", 6);
    unit(state, ATTACKER).position = 18;
    for (const other of ["unit_p1_crusaders", "unit_p1_marksmen"] as UnitId[]) {
      unit(state, other).damage = unit(state, other).maxHealth;
    }
    const cats = summonedCats(playCatCorps(state, 6, 17));
    expect(cats).toHaveLength(2);
    const positions = cats.map((cat) => cat.position).sort((left, right) => left - right);
    expect(positions, "17 is the pick; 13 is the lowest cell still beside the line").toEqual([13, 17]);
  });

  it("a summoned cat joins the activation order this round", () => {
    const after = playCatCorps(catCorpsState("lb-cats-order", 1), 1, 5);
    const cat = summonedCats(after)[0];
    expect(cat.activatedThisRound).toBe(false);
    expect(
      getActivationOrder(after.combat!, after.activeEffects).map((entry) => entry.id)
    ).toContain(cat.id);
  });

  it("the summoned cats vanish with the combat — no army card, nothing in the Neutral decks", () => {
    // The cats are minted by the REAL card play, then dropped into a REAL
    // adventure combat and finalized. This must not run on the quiet fixture:
    // createInitialGameState carries `adventure: null` and
    // finalizeAdventureCombat returns on the first line without one, so the
    // whole assertion block would be vacuous (it was — see the header ledger).
    const played = playCatCorps(catCorpsState("lb-cats-finalize", 6), 6, 5);
    const cats = summonedCats(played);
    expect(cats).toHaveLength(2);

    const state = createAdventureGameState({
      seed: "lb-cats-finalize-adventure",
      difficulty: "normal",
      rollFirstPlayer: false,
      events: false,
      ruleset: "binh",
      anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, isekaiTowns: true }
    });
    const hero = state.heroes.hero_p1;
    const armyBefore = state.players.p1.army.length;
    state.phase = "combat";
    state.combat = {
      attackerPlayerId: "p1",
      defenderPlayerId: NEUTRAL_PLAYER_ID,
      units: Object.fromEntries(cats.map((cat) => [cat.id, cat])),
      setup: null,
      awaitingContinue: false,
      context: {
        kind: "neutral",
        heroId: hero.id,
        fieldId: hero.spaceId!,
        difficulty: 1,
        hasAzure: false
      },
      outcome: {
        winnerPlayerId: "p1",
        defeatedPlayerId: NEUTRAL_PLAYER_ID,
        reason: "all-enemy-units-defeated"
      }
    } as unknown as CombatState;
    finalizeAdventureCombat(state);

    expect(state.players.p1.army, "the winner's army did not grow").toHaveLength(armyBefore);
    expect(
      state.players.p1.army.some((entry) => entry.unitDefId === cats[0].unitDefId),
      "no cat card was created"
    ).toBe(false);
    for (const deckId of Object.values(NEUTRAL_DECK_IDS)) {
      expect(
        state.decks[deckId]?.discardPile ?? [],
        `${deckId} must never receive a faction summon`
      ).not.toContain(cats[0].unitDefId);
    }
  });

  it("registers both cats as summon-only bodies outside the recruitable roster", () => {
    for (const id of ["little_busters.stray_cat", "little_busters.alley_cat"]) {
      const def = coreUnitDefinitions[id];
      expect(def?.summonOnly, `${id} is summon-only`).toBe(true);
      expect(def?.pack, `${id} has one side, so it can never flip`).toBeUndefined();
      expect(unitSoundKey(id, "attack")).toBe("little-busters/voices/rins_cats/attack");
    }
    expect(coreFactionDefinitions.little_busters.units, "the recruitable roster is untouched").toHaveLength(7);
    expect(coreFactionDefinitions.little_busters.units).not.toContain("little_busters.stray_cat");
  });
});

// ===========================================================================
// 3. Riki — "Little Busters' Bond"
// ===========================================================================

const BOND_HOLDER: UnitId = "unit_p1_marksmen";

/**
 * `fallen` of p1's own army units are removed before the card is played, then
 * the buffed unit attacks and we read the damage it dealt.
 */
function bondDamage(
  seed: string,
  level: 1 | 4 | 6,
  fallen: number,
  options: { play?: boolean; fallenAreSummons?: boolean; fallenAreCommanders?: boolean } = {}
): number {
  const play = options.play ?? true;
  let state = quietCombat(seed);
  state.players.p1.hand = play ? [`specialty.riki_naoe.${level}`] : [];
  const holder = unit(state, BOND_HOLDER);
  holder.position = 8;
  holder.attack = 3;
  holder.type = "ground";
  holder.activatedThisRound = false;
  holder.attackedThisActivation = false;
  const target = unit(state, TARGET);
  target.position = 9;

  const casualties: UnitId[] = ["unit_p1_griffins", "unit_p1_crusaders"];
  for (let index = 0; index < fallen; index += 1) {
    const id = casualties[index];
    let casualty = id ? unit(state, id) : undefined;
    if (!casualty) {
      // A third body: clone one of the army cards onto a fresh combat unit.
      casualty = { ...unit(state, "unit_p1_crusaders"), id: `unit_p1_extra_${index}` as UnitId, armyUnitId: `army_extra_${index}` };
      state.combat!.units[casualty.id] = casualty;
    }
    casualty.damage = casualty.maxHealth;
    if (options.fallenAreSummons) {
      // The shape placeSummonedUnit really mints (Summon Elemental, the Pit
      // Lords' Demons): a REAL army card flagged `summoned`. Deleting the army
      // linkage instead would let `Boolean(unit.armyUnitId)` answer the case and
      // stop it discriminating the `!unit.summoned` clause at all.
      casualty.summoned = true;
    }
    if (options.fallenAreCommanders) {
      // The shape makeCommanderCombatUnit mints: a commanderSlug and NO army
      // card. Both clauses exclude it, so only dropping BOTH breaks this.
      casualty.commanderSlug = "kyousuke";
      delete casualty.armyUnitId;
    }
  }

  state.combat!.activeUnitId = BOND_HOLDER;
  scriptDice(state, 0);

  if (play) {
    const cardId = `specialty.riki_naoe.${level}`;
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === cardId &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === BOND_HOLDER
    );
    if (!offer) {
      return Number.NaN;
    }
    state = apply(state, offer.action);
  }

  const before = unit(state, TARGET).damage;
  state = settle(
    apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: BOND_HOLDER, defenderId: TARGET })
  );
  return unit(state, TARGET).damage - before;
}

describe("Riki — Little Busters' Bond", () => {
  it("is not offered while none of your own units has fallen", () => {
    expect(Number.isNaN(bondDamage("lb-bond-none", 4, 0))).toBe(true);
    // CONTROL: one casualty and the same seat is offered the play.
    expect(Number.isNaN(bondDamage("lb-bond-one-offer", 4, 1))).toBe(false);
  });

  it("pays +1 Attack per fallen friend and caps the bonus at the level's ceiling", () => {
    const base = bondDamage("lb-bond-base", 1, 1, { play: false });
    expect(bondDamage("lb-bond-1x1", 1, 1) - base, "I with 1 fallen").toBe(1);
    expect(bondDamage("lb-bond-1x2", 1, 2) - base, "I is capped at +1").toBe(1);
    expect(bondDamage("lb-bond-4x2", 4, 2) - base, "IV with 2 fallen").toBe(2);
    expect(bondDamage("lb-bond-4x3", 4, 3) - base, "IV is capped at +2").toBe(2);
    expect(bondDamage("lb-bond-6x3", 6, 3) - base, "VI with 3 fallen").toBe(3);
  });

  it("a fallen SUMMON is not counted — even one holding a real army card", () => {
    expect(Number.isNaN(bondDamage("lb-bond-summons", 6, 2, { fallenAreSummons: true })), "no offer at all").toBe(
      true
    );
    // CONTROL: the same two bodies without the summoned flag DO buy the play.
    expect(Number.isNaN(bondDamage("lb-bond-summons-control", 6, 2)), "ordinary casualties count").toBe(false);
  });

  it("a fallen COMMANDER is not counted", () => {
    expect(
      Number.isNaN(bondDamage("lb-bond-commander", 6, 2, { fallenAreCommanders: true })),
      "no offer at all"
    ).toBe(true);
    expect(Number.isNaN(bondDamage("lb-bond-commander-control", 6, 2)), "ordinary casualties count").toBe(false);
  });

  it("a fallen summoned CAT is not a fallen friend (the Rin × Riki cross-check)", () => {
    // The sibling check §1a asks for: Rin's own summons must not feed Riki's
    // count. Real cats, minted by the real card play, then killed.
    let state = playCatCorps(catCorpsState("lb-bond-cats", 6), 6, 5);
    state.players.p1.hand = ["specialty.riki_naoe.6"];
    for (const cat of summonedCats(state)) {
      cat.damage = cat.maxHealth;
    }
    const holder = unit(state, BOND_HOLDER);
    holder.position = 8;
    holder.type = "ground";
    holder.activatedThisRound = false;
    holder.attackedThisActivation = false;
    state.combat!.activeUnitId = BOND_HOLDER;
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.riki_naoe.6"
      ),
      "two dead cats buy nothing"
    ).toBe(false);

    // CONTROL: kill one real army unit on the same board and the play appears.
    unit(state, ATTACKER).damage = unit(state, ATTACKER).maxHealth;
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.riki_naoe.6"
      )
    ).toBe(true);
  });

  it("VI also hands out +1 Defense once at least 2 friends have fallen", () => {
    function incomingDamage(seed: string, fallen: number): number {
      let state = quietCombat(seed);
      state.players.p1.hand = ["specialty.riki_naoe.6"];
      const holder = unit(state, BOND_HOLDER);
      holder.position = 9;
      holder.type = "ground";
      const enemy = unit(state, TARGET);
      enemy.position = 8;
      enemy.attack = 5;
      enemy.activatedThisRound = false;
      enemy.attackedThisActivation = false;
      for (const id of ["unit_p1_griffins", "unit_p1_crusaders"].slice(0, fallen)) {
        unit(state, id).damage = unit(state, id).maxHealth;
      }
      // Play on p1's own activation first, then hand the turn to p2's attack.
      unit(state, ATTACKER).activatedThisRound = false;
      state.combat!.activeUnitId = BOND_HOLDER;
      holder.activatedThisRound = false;
      holder.attackedThisActivation = false;
      const offer = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "specialty.riki_naoe.6" &&
          legal.action.target?.type === "unit" &&
          legal.action.target.unitId === BOND_HOLDER
      );
      expect(offer, "Bond VI is playable with friends already fallen").toBeTruthy();
      state = apply(state, offer!.action);

      state.activePlayerId = "p2";
      state.combat!.activeUnitId = TARGET;
      scriptDice(state, 0);
      const before = unit(state, BOND_HOLDER).damage;
      state = settle(
        apply(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: TARGET, defenderId: BOND_HOLDER })
      );
      return unit(state, BOND_HOLDER).damage - before;
    }
    const oneFallen = incomingDamage("lb-bond-def-1", 1);
    const twoFallen = incomingDamage("lb-bond-def-2", 2);
    expect(twoFallen, "the second casualty buys +1 Defense, so the same blow lands for 1 less").toBe(
      oneFallen - 1
    );
  });
});

// ===========================================================================
// 4. Yuiko — "Blade Dance"
// ===========================================================================

type BladeOptions = {
  level: 1 | 4 | 6;
  roll: number;
  play: boolean;
  /** Extra enemies placed beside the ATTACKER (cells given explicitly). */
  neighbours: number[];
  /** A friendly body beside the attacker, to prove allies are untouched. */
  friendBeside?: boolean;
};

function bladeDanceFight(seed: string, options: BladeOptions): GameState {
  let state = quietCombat(seed);
  state.players.p1.hand = options.play ? [`specialty.yuiko_kurugaya.${options.level}`] : [];
  const attacker = unit(state, ATTACKER);
  attacker.position = 9;
  attacker.type = "ground";
  attacker.attack = 3;
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;
  unit(state, TARGET).position = 8;

  const spare: UnitId[] = ["unit_p2_vampires", "unit_p2_dread_knights"];
  options.neighbours.forEach((cell, index) => {
    const id = spare[index];
    const body = unit(state, id);
    body.position = cell;
    body.controllerId = "p2";
  });
  if (options.friendBeside) {
    const friend = unit(state, "unit_p1_crusaders");
    friend.position = 13;
    friend.controllerId = "p1";
  }

  state.combat!.activeUnitId = ATTACKER;
  scriptDice(state, options.roll);

  if (options.play) {
    const cardId = `specialty.yuiko_kurugaya.${options.level}`;
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
    );
    expect(offer, `${cardId} must be playable on its own ground unit's activation`).toBeTruthy();
    state = apply(state, offer!.action);
  }

  return settle(
    apply(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: ATTACKER, defenderId: TARGET })
  );
}

describe("Yuiko — Blade Dance", () => {
  it("splashes every OTHER enemy beside the attacker and scales with the count", () => {
    // Attacker on 9; its orthogonal neighbours are 5, 8 (the target), 10 and 13.
    const none = bladeDanceFight("lb-blade-0", { level: 4, roll: 0, play: true, neighbours: [] });
    expect(unit(none, "unit_p2_vampires").damage, "nobody stands beside the attacker").toBe(0);

    const one = bladeDanceFight("lb-blade-1", { level: 4, roll: 0, play: true, neighbours: [10] });
    expect(unit(one, "unit_p2_vampires").damage).toBe(1);

    const two = bladeDanceFight("lb-blade-2", { level: 4, roll: 0, play: true, neighbours: [10, 5] });
    expect(unit(two, "unit_p2_vampires").damage).toBe(1);
    expect(unit(two, "unit_p2_dread_knights").damage).toBe(1);

    // CONTROL: without the card the same two neighbours take nothing.
    const control = bladeDanceFight("lb-blade-control", { level: 4, roll: 0, play: false, neighbours: [10, 5] });
    expect(unit(control, "unit_p2_vampires").damage).toBe(0);
    expect(unit(control, "unit_p2_dread_knights").damage).toBe(0);
  });

  it("does not splash the struck target and never touches an ally", () => {
    const base = bladeDanceFight("lb-blade-target-control", {
      level: 4,
      roll: 0,
      play: false,
      neighbours: [10],
      friendBeside: true
    });
    const fought = bladeDanceFight("lb-blade-target", {
      level: 4,
      roll: 0,
      play: true,
      neighbours: [10],
      friendBeside: true
    });
    expect(
      unit(fought, TARGET).damage - unit(base, TARGET).damage,
      "the struck target takes the attack only"
    ).toBe(0);
    expect(unit(fought, "unit_p1_crusaders").damage, "an adjacent ally is never hit").toBe(0);
  });

  it("I needs a '0' or '+1'; VI deals 2", () => {
    const low = bladeDanceFight("lb-blade-1-minus", { level: 1, roll: -1, play: true, neighbours: [10] });
    expect(unit(low, "unit_p2_vampires").damage, "a '-1' is outside level I's window").toBe(0);
    const hit = bladeDanceFight("lb-blade-1-zero", { level: 1, roll: 0, play: true, neighbours: [10] });
    expect(unit(hit, "unit_p2_vampires").damage).toBe(1);
    const six = bladeDanceFight("lb-blade-6", { level: 6, roll: -1, play: true, neighbours: [10] });
    expect(unit(six, "unit_p2_vampires").damage, "VI fires on every face for 2").toBe(2);
  });

  it("the buff dies with the activation it was played in", () => {
    const fought = bladeDanceFight("lb-blade-expiry", { level: 4, roll: 0, play: true, neighbours: [10] });
    expect(
      fought.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "BLADE_DANCE_SPLASH")
      ),
      "no Blade Dance effect survives the attacker's activation"
    ).toBe(false);
  });

  it("is not offered once the active unit has already swung", () => {
    // The splash rides the unit's OWN declared attack, so a play made after it
    // has attacked could never resolve. The printed card says "before it
    // attacks"; the SHARED combat-play gate already enforces it (no Blade Dance
    // clause of its own — adding one changes nothing, verified by mutation), so
    // this case exists to keep that inherited guarantee honest.
    const state = quietCombat("lb-blade-after-attack");
    state.players.p1.hand = ["specialty.yuiko_kurugaya.4"];
    const swinger = unit(state, ATTACKER);
    swinger.type = "ground";
    swinger.position = 9;
    swinger.activatedThisRound = false;
    swinger.attackedThisActivation = true;
    state.combat!.activeUnitId = ATTACKER;
    const offered = (): boolean =>
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.yuiko_kurugaya.4"
      );
    expect(offered(), "a spent swing buys nothing").toBe(false);
    // CONTROL: the same unit before its attack IS offered the card.
    swinger.attackedThisActivation = false;
    expect(offered()).toBe(true);
  });

  it("is not offered while a RANGED unit holds the activation", () => {
    const state = quietCombat("lb-blade-ranged");
    state.players.p1.hand = ["specialty.yuiko_kurugaya.4"];
    const shooter = unit(state, BOND_HOLDER);
    shooter.type = "ranged";
    shooter.position = 9;
    shooter.activatedThisRound = false;
    shooter.attackedThisActivation = false;
    state.combat!.activeUnitId = BOND_HOLDER;
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.yuiko_kurugaya.4"
      )
    ).toBe(false);
    // CONTROL: the same seat with a ground unit active IS offered it.
    shooter.type = "ground";
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.yuiko_kurugaya.4"
      )
    ).toBe(true);
  });
});

// ===========================================================================
// 5. Komari — "Star Candy"
// ===========================================================================

const SHIELDED: UnitId = "unit_p1_marksmen";

function shieldState(seed: string, level: 1 | 4 | 6, play = true): GameState {
  let state = quietCombat(seed);
  state.players.p1.hand = play ? [`specialty.komari_kamikita.${level}`] : [];
  const shielded = unit(state, SHIELDED);
  shielded.position = 9;
  shielded.type = "ground";
  const enemy = unit(state, TARGET);
  enemy.position = 8;
  enemy.attack = 5;
  enemy.activatedThisRound = false;
  enemy.attackedThisActivation = false;
  // The two other p1 bodies stand clear; one is wounded so VI has a second pick.
  const wounded = unit(state, "unit_p1_crusaders");
  wounded.position = 16;
  wounded.damage = 5;
  unit(state, ATTACKER).position = 17;

  if (play) {
    const cardId = `specialty.komari_kamikita.${level}`;
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === cardId &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === SHIELDED
    );
    expect(offer, `${cardId} must be playable on a friendly unit`).toBeTruthy();
    state = apply(state, offer!.action);
  }
  return state;
}

function enemyAttack(state: GameState, defenderId: UnitId, roll = 0): GameState {
  const next = { ...state };
  next.activePlayerId = "p2";
  next.combat!.activeUnitId = TARGET;
  unit(next, TARGET).attackedThisActivation = false;
  unit(next, TARGET).activatedThisRound = false;
  scriptDice(next, roll);
  return settle(
    apply(next, { type: "ATTACK_UNIT", playerId: "p2", attackerId: TARGET, defenderId })
  );
}

describe("Komari — Star Candy", () => {
  it("softens an attack by 1 at level I and 2 at level IV, then is spent", () => {
    const control = unit(enemyAttack(shieldState("lb-candy-control", 1, false), SHIELDED), SHIELDED).damage;
    const one = unit(enemyAttack(shieldState("lb-candy-1", 1), SHIELDED), SHIELDED).damage;
    const four = unit(enemyAttack(shieldState("lb-candy-4", 4), SHIELDED), SHIELDED).damage;
    expect(control - one, "level I absorbs 1").toBe(1);
    expect(control - four, "level IV absorbs 2").toBe(2);
  });

  it("the shield is spent by the first hit — the second lands in full", () => {
    const control = unit(enemyAttack(shieldState("lb-candy-twice-control", 4, false), SHIELDED), SHIELDED).damage;
    let state = enemyAttack(shieldState("lb-candy-twice", 4), SHIELDED);
    const afterFirst = unit(state, SHIELDED).damage;
    expect(control - afterFirst).toBe(2);
    state = enemyAttack(state, SHIELDED);
    expect(unit(state, SHIELDED).damage - afterFirst, "the second blow is unsoftened").toBe(control);
    expect(
      state.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "DAMAGE_SHIELD")
      )
    ).toBe(false);
  });

  it("a 1-damage hit against a 2-point shield is absorbed whole (and the shield is still spent)", () => {
    let state = shieldState("lb-candy-partial", 4);
    unit(state, TARGET).attack = 1;
    state = enemyAttack(state, SHIELDED);
    expect(unit(state, SHIELDED).damage, "nothing gets through").toBe(0);
    expect(
      state.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "DAMAGE_SHIELD")
      ),
      "spent whole even though only 1 was needed"
    ).toBe(false);
  });

  it("a LETHAL blow the shield absorbs leaves the unit standing", () => {
    // This is what the attack-path consume buys over the event seam alone: the
    // shield has to be spent BEFORE the lethal preview, or the unit is recorded
    // as destroyed and only then healed back by the DAMAGE_ASSIGNED seam.
    function fight(seed: string, play: boolean): GameState {
      const state = shieldState(seed, 4, play);
      const shielded = unit(state, SHIELDED);
      shielded.maxHealth = 2;
      shielded.damage = 0;
      unit(state, TARGET).attack = 2;
      return enemyAttack(state, SHIELDED);
    }
    /** Removed outright, or (a Pack card) flipped to its Few side. */
    function wentDown(state: GameState): boolean {
      return state.eventLog.some(
        (event) =>
          (event.type === "UNIT_REMOVED" || event.type === "UNIT_FLIPPED") && event.unitId === SHIELDED
      );
    }
    /** What the blow itself reported — the number the whole attack path used. */
    function reportedDamage(state: GameState): number {
      const rolled = [...state.eventLog]
        .reverse()
        .find((event) => event.type === "ATTACK_ROLLED" && event.defenderId === SHIELDED);
      expect(rolled, "the blow must be in the log").toBeTruthy();
      return (rolled as { damage: number }).damage;
    }

    const shieldedFight = fight("lb-candy-lethal", true);
    expect(shieldedFight.combat!.units[SHIELDED]?.damage, "the 2-point shield eats the whole blow").toBe(0);
    expect(wentDown(shieldedFight), "it is never recorded as destroyed").toBe(false);
    // The attack path itself must see the softened number — not a full-strength
    // blow that the DAMAGE_ASSIGNED seam heals back afterwards. Everything
    // downstream of it (the lethal-save preview, the defeated-side read, the
    // feed) reads this value.
    expect(reportedDamage(shieldedFight), "the blow is reported as fully absorbed").toBe(0);
    expect(reportedDamage(fight("lb-candy-lethal-report-control", false)), "unshielded, it lands").toBe(2);

    // CONTROL: the same blow without the shield does take it down.
    expect(wentDown(fight("lb-candy-lethal-control", false))).toBe(true);
  });

  it("also soaks SPELL damage", () => {
    function magicArrow(seed: string, play: boolean): number {
      const state = shieldState(seed, 1, play);
      state.players.p2.hand = ["spell.magic_arrow"];
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = TARGET;
      const after = settle(
        apply(state, {
          type: "CAST_SPELL",
          playerId: "p2",
          cardId: "spell.magic_arrow",
          target: { type: "unit", unitId: SHIELDED }
        })
      );
      return unit(after, SHIELDED).damage;
    }
    expect(magicArrow("lb-candy-spell-control", false), "the printed 1 lands").toBe(1);
    expect(magicArrow("lb-candy-spell", true), "the shield eats it").toBe(0);
  });

  it("VI shields a second unit — the owner's most wounded other body", () => {
    const state = shieldState("lb-candy-six", 6);
    const shieldedIds = state.activeEffects
      .filter((effect) => effect.modifiers.some((modifier) => modifier.type === "DAMAGE_SHIELD"))
      .map((effect) => (effect.target?.type === "unit" ? effect.target.unitId : null));
    expect(shieldedIds).toHaveLength(2);
    expect(shieldedIds).toContain(SHIELDED);
    expect(shieldedIds, "the wounded Crusaders, not the untouched Griffins").toContain("unit_p1_crusaders");

    // CONTROL: level IV shields exactly one unit on the same board.
    const four = shieldState("lb-candy-six-control", 4);
    expect(
      four.activeEffects.filter((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "DAMAGE_SHIELD")
      )
    ).toHaveLength(1);
  });
});

// ===========================================================================
// 6. Card-definition contract
// ===========================================================================

describe("the five sets are declared, wired and named", () => {
  it("every level of every set is an implemented card with prose that states what runs", () => {
    const expected: Record<string, string> = {
      sasami_sasasegawa: "Home Run",
      rin_natsume: "Cat Corps",
      riki_naoe: "Little Busters' Bond",
      yuiko_kurugaya: "Blade Dance",
      komari_kamikita: "Star Candy"
    };
    for (const [hero, name] of Object.entries(expected)) {
      for (const level of [1, 4, 6] as const) {
        const card = cardLibrary[`specialty.${hero}.${level}`];
        expect(card, `specialty.${hero}.${level}`).toBeTruthy();
        expect(card.implementationStatus).toBe("implemented");
        expect(card.name.startsWith(name), `${card.name} should be a ${name} card`).toBe(true);
        expect(
          card.tags.some((tag) => /\s/u.test(tag) && tag.length > 40),
          `${card.id} needs a printed prose tag`
        ).toBe(true);
      }
    }
    // Kudryavka is deliberately untouched.
    expect([1, 4, 6].map((level) => cardLibrary[`specialty.kudryavka_noumi.${level}`].name)).toEqual([
      "Rocket Launcher I",
      "Rocket Launcher IV",
      "Rocket Launcher VI"
    ]);
  });
});
