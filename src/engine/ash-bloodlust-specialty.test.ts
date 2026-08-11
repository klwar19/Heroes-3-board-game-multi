import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  effectiveInitiative,
  gainExperience,
  getLegalActions,
  NEUTRAL_PLAYER_ID
} from "./index";
import { redactStateForSeat } from "./player-view";
import { adventureCards } from "@/data/cards/adventure";
import type { CardId, CombatUnitState, GameAction, GameEvent, GameState, UnitId } from "./state";

/**
 * REPORTED: "cannot play Ash speciality IV card, check all Ash speciality, see
 * if they actually work."
 *
 * Ash (Inferno, Heretic) is the Bloodlust specialist. The three printed faces
 * (`public/assets/hero_specialties-ash-{1,4,6}.webp`) read:
 *
 *   I  — [instant] Your selected [ground] or [flying] unit gains +2 [attack].
 *        Place a Black cube on that unit.
 *   IV — [ongoing] For this Combat, your selected [ground] or [flying] unit's
 *        [attack] is increased by 2 and its [initiative] is increased by 1.
 *        Place a Black cube on that unit.
 *   VI — [instant] Your selected [ground] or [flying] unit gains +3 [attack]
 *        and ignores Retaliation Attacks. Place a Black cube on that unit.
 *
 * `extra-heroes-batch5-specialties.test.ts` already covers all three — but only
 * in the Battle Test SANDBOX (`createInitialGameState`), and its level-IV case
 * asserts the created effect's `amount` FIELD rather than an observable game
 * outcome (CLAUDE.md rule #1a: "assert the observable game outcome, not an
 * intermediate value"). This file closes both gaps: every case runs a REAL
 * ADVENTURE combat through the real pipeline (`getLegalActions` offer →
 * `applyAction`) and asserts what the table actually sees — damage dealt, a
 * retaliation that does or does not happen, the card's zone at combat end — each
 * against a no-card CONTROL.
 *
 * The Black cube reading (shared by all three levels, and by the Cure-family
 * spell that removes it — "that unit is now able to perform a Retaliation Attack
 * action again") is "the unit has spent its Retaliation for this combat round".
 * The OBSERVABLE form of that, pinned below, is: after the cube is placed, an
 * enemy attacking the cubed unit takes NO Retaliation Attack.
 *
 * LEADING WITH WHAT THE REPORT GOT WRONG, because it decides what changed here:
 * NO engine-level playability failure was reproducible. All three levels are
 * offered and apply in a real adventure fight (server state AND the redacted
 * per-seat frame a hosted client actually renders from), in the Battle Test
 * sandbox, and the level-IV card really does reach the hand on level-up. The one
 * thing the printed card genuinely refuses is a RANGED body — Inferno fields
 * Magogs, and a line with no ground/flying unit correctly gets no offer. That is
 * pinned as a CONTROL below; the accompanying fix is a HINT change only
 * (`cardUnplayableReason` now names the printed restriction instead of the
 * generic "check targets or unit state"), never a rules change.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/**
 * The level-I guarded mine fight on the default two-player map, with one of the
 * player's army cards deployed. The player's unit is made the fastest so its own
 * activation — the window an "ongoing, for this Combat" card is played in — opens
 * first, exactly as it does whenever the player out-runs the guards.
 */
function neutralFight(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  state = apply(state, {
    type: "PLACE_COMBAT_UNIT",
    playerId: "p1",
    armyUnitId: state.players.p1.army[0].id,
    position: 13
  });
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
      unit.initiative = 99;
    }
  }
  return apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

function ownUnit(state: GameState): CombatUnitState {
  return Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
}

function guardUnit(state: GameState): CombatUnitState {
  return Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
}

/**
 * A staged level-I fight: the player's deployed card is a ground unit with
 * attack 4 standing next to a fat, defenceless guard, and every die is scripted
 * to 0 so the reported damage isolates the specialty's own contribution. Both
 * bodies survive every exchange, so a Retaliation Attack can fire — or be
 * suppressed by the Black cube.
 */
function stagedFight(
  seed: string,
  hand: CardId[],
  attackerType: "ground" | "flying" | "ranged" = "ground"
): GameState {
  const state = neutralFight(seed);
  state.players.p1.hand = [...hand];
  const own = ownUnit(state);
  own.abilities = [];
  own.type = attackerType;
  own.attack = 4;
  own.defense = 0;
  own.maxHealth = 60;
  own.damage = 0;
  own.position = 13;
  own.retaliatedThisRound = false;
  const guard = guardUnit(state);
  guard.abilities = [];
  guard.position = 9;
  guard.attack = 3;
  guard.defense = 0;
  guard.maxHealth = 60;
  guard.damage = 0;
  state.combat!.dice.scriptedRolls = new Array(24).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function settleWindows(state: GameState): GameState {
  let current = state;
  for (let guard = 0; current.reactionWindow && guard < 30; guard += 1) {
    current = apply(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** The last ordinary (non-retaliation) attack roll in the log. */
function lastStrike(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && !event.isRetaliation
    );
}

/** Did `unitId` perform a Retaliation Attack in this combat? */
function retaliated(state: GameState, unitId: UnitId): boolean {
  return state.eventLog.some(
    (event) => event.type === "ATTACK_ROLLED" && event.attackerId === unitId && event.isRetaliation
  );
}

/**
 * Non-vacuity guard for every "did NOT retaliate" assertion: the guard really
 * did strike the named unit, so a false `retaliated` reading can only mean the
 * Retaliation was suppressed — never that nothing happened.
 */
function expectGuardStruck(state: GameState, defenderId: UnitId): void {
  expect(
    state.eventLog.some(
      (event) =>
        event.type === "ATTACK_ROLLED" &&
        !event.isRetaliation &&
        event.attackerId === guardUnit(state).id &&
        event.defenderId === defenderId
    ),
    "the guard really attacked (so a missing retaliation is suppression, not silence)"
  ).toBe(true);
}

function cardPlay(state: GameState, cardId: CardId) {
  return getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
  );
}

function windowReaction(state: GameState, cardId: CardId) {
  return (state.reactionWindow?.legalReactions.p1 ?? []).find(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
  );
}

/**
 * Ends p1's activation and lets the REAL neutral pump run the guard's turn, so
 * the guard's own attack on the adjacent player unit is the engine's, not a
 * forged one. Returns once the guard has struck (or the fight ends).
 */
function letTheGuardStrike(state: GameState): GameState {
  let current = settleWindows(state);
  const guardId = guardUnit(current).id;
  const end = getLegalActions(current, "p1").find((legal) => legal.action.type === "END_ACTIVATION");
  if (end) {
    current = apply(current, end.action);
  }
  for (let guard = 0; guard < 40; guard += 1) {
    current = settleWindows(current);
    if (
      // A DECLARED attack of the guard's own (never its retaliation against the
      // player's strike, which may already be in the log).
      current.eventLog.some(
        (event) =>
          event.type === "ATTACK_ROLLED" && event.attackerId === guardId && !event.isRetaliation
      ) ||
      current.combat?.outcome ||
      current.combat?.awaitingContinue
    ) {
      break;
    }
    const next = getLegalActions(current, "p1").find(
      (legal) =>
        legal.action.type === "CONTINUE_NEUTRAL_STEP" ||
        legal.action.type === "ADVANCE_COMPUTER" ||
        legal.action.type === "CHOOSE_OPTION"
    );
    if (!next) {
      break;
    }
    current = apply(current, next.action);
  }
  return current;
}

/** p1's unit strikes the guard; every reaction window is settled afterwards. */
function strikeGuard(state: GameState): GameState {
  return settleWindows(
    apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: ownUnit(state).id,
      defenderId: guardUnit(state).id
    })
  );
}

// ===========================================================================
// The card actually reaches the hand in real play
// ===========================================================================

describe("Ash's Bloodlust — the level-IV card reaches the hand", () => {
  it("levelling Ash to 4 puts specialty.ash.4 in hand (and 6 puts VI there)", () => {
    const state = createAdventureGameState({
      seed: "ash-levels",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "P1", factionId: "inferno", heroDefId: "ash" },
        { id: "p2", name: "P2", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    expect(state.players.p1.heroDefId).toBe("ash");
    expect(state.players.p1.hand.concat(state.players.p1.deck)).toContain("specialty.ash.1");
    expect(state.players.p1.hand).not.toContain("specialty.ash.4");

    // Levelling rides the normal experience pipeline (the same one every XP
    // source uses), so a real level-4 Ash holds Bloodlust IV.
    gainExperience(state, "p1", 40);
    const hero = Object.values(state.heroes).find(
      (candidate) => candidate.controllerId === "p1" && candidate.kind === "main"
    )!;
    expect(hero.level, "hero reached level 6+").toBeGreaterThanOrEqual(6);
    expect(state.players.p1.hand).toContain("specialty.ash.4");
    expect(state.players.p1.hand).toContain("specialty.ash.6");
  });
});

// ===========================================================================
// Level IV — the reported card
// ===========================================================================

describe("Ash's Bloodlust IV in a REAL adventure combat", () => {
  it("is offered on the owner's own unit activation and its +2 attack really raises the damage", () => {
    // CONTROL: the same fight, same scripted dice, no card — 4 attack, 4 damage.
    const control = strikeGuard(stagedFight("ash-iv-control", []));
    expect(lastStrike(control)?.damage, "unbuffed damage").toBe(4);

    let state = stagedFight("ash-iv-damage", ["specialty.ash.4"] as CardId[]);
    const play = cardPlay(state, "specialty.ash.4" as CardId);
    expect(play, "Bloodlust IV is offered during your own unit's activation").toBeTruthy();
    expect(
      play!.action.type === "PLAY_CARD" && play!.action.target?.type === "unit"
        ? play!.action.target.unitId
        : null,
      "it targets the player's own ground unit"
    ).toBe(ownUnit(state).id);

    state = apply(state, play!.action);
    state = strikeGuard(state);
    const hit = lastStrike(state);
    expect(hit?.attackBonus, "+2 attack").toBe(2);
    expect(hit?.damage, "4 attack + 2 = 6 damage").toBe(6);
  });

  it("raises the unit's initiative by 1 — the value the activation order reads", () => {
    let state = stagedFight("ash-iv-initiative", ["specialty.ash.4"] as CardId[]);
    const own = ownUnit(state);
    own.initiative = 5;
    const guard = guardUnit(state);
    guard.initiative = 6;
    expect(
      effectiveInitiative(own, state.activeEffects),
      "CONTROL: unbuffed, the unit is slower than the guard"
    ).toBeLessThan(effectiveInitiative(guard, state.activeEffects));

    state = apply(state, cardPlay(state, "specialty.ash.4" as CardId)!.action);
    expect(
      effectiveInitiative(state.combat!.units[own.id], state.activeEffects),
      "+1 initiative catches the guard"
    ).toBe(effectiveInitiative(state.combat!.units[guard.id], state.activeEffects));
  });

  it("places a Black cube: the buffed unit takes NO Retaliation Attack when it is attacked", () => {
    // CONTROL first — with no card the unit DOES retaliate against the guard.
    const control = stagedFight("ash-iv-cube-control", []);
    const controlOwn = ownUnit(control).id;
    const controlAfter = letTheGuardStrike(control);
    expectGuardStruck(controlAfter, controlOwn);
    expect(retaliated(controlAfter, controlOwn), "CONTROL: an uncubed unit retaliates").toBe(true);

    let state = stagedFight("ash-iv-cube", ["specialty.ash.4"] as CardId[]);
    const ownId = ownUnit(state).id;
    state = apply(state, cardPlay(state, "specialty.ash.4" as CardId)!.action);
    state = letTheGuardStrike(state);
    expectGuardStruck(state, ownId);
    expect(retaliated(state, ownId), "the Black cube spent its Retaliation").toBe(false);
  });

  it("is NOT offered targeting a ranged unit (printed ground-or-flying gate)", () => {
    const ranged = stagedFight("ash-iv-ranged", ["specialty.ash.4"] as CardId[], "ranged");
    expect(cardPlay(ranged, "specialty.ash.4" as CardId)).toBeFalsy();
    // CONTROL: the identical fight with a flying body DOES offer it.
    const flying = stagedFight("ash-iv-flying", ["specialty.ash.4"] as CardId[], "flying");
    expect(cardPlay(flying, "specialty.ash.4" as CardId)).toBeTruthy();
  });

  it("the played card returns to the owner's discard once the combat ends (never stranded in play)", () => {
    let state = stagedFight("ash-iv-zone", ["specialty.ash.4"] as CardId[]);
    state = apply(state, cardPlay(state, "specialty.ash.4" as CardId)!.action);
    // While the "for this Combat" effect is live the card sits in the Ongoing
    // tray, not the discard (the 2026-08-10 ongoing-card rule).
    expect(
      (state.players.p1.ongoingCards ?? []).map((entry) => entry.cardId),
      "held in play while its effect runs"
    ).toContain("specialty.ash.4");
    expect(state.players.p1.discard).not.toContain("specialty.ash.4");

    const guard = guardUnit(state);
    guard.maxHealth = 1;
    guard.damage = 0;
    state = strikeGuard(state);
    expect(state.combat?.outcome?.winnerPlayerId, "the fight is won").toBe("p1");
    expect(state.players.p1.ongoingCards ?? [], "released from play").toHaveLength(0);
    expect(state.players.p1.discard, "back in the deck cycle").toContain("specialty.ash.4");
  });

  it("a HOSTED (redacted) client offers exactly what the server accepts", () => {
    // Single-player and closed multiplayer tables hand the browser a redacted
    // per-seat frame, and the UI derives its buttons from THAT (the 2026-08-08
    // artifact-set precedent, where a redacted read silently hid real offers).
    const state = stagedFight("ash-iv-hosted", ["specialty.ash.4"] as CardId[]);
    state.room = { ...(state.room ?? ({} as never)), hosted: true } as never;
    const view = redactStateForSeat(state, "p1") as GameState;
    const client = getLegalActions(view, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.ash.4"
    );
    expect(client, "the client sees the play").toBeTruthy();
    // And the server accepts the client's own action object unchanged.
    const after = apply(state, client!.action);
    expect(
      after.activeEffects.some((effect) => effect.name === "Bloodlust IV"),
      "the server applied it"
    ).toBe(true);
  });
});

// ===========================================================================
// Levels I and VI — the instant sides
// ===========================================================================

describe("Ash's Bloodlust I and VI in a REAL adventure combat", () => {
  it("I adds +2 to the declared attack's damage", () => {
    const control = strikeGuard(stagedFight("ash-i-control", []));
    expect(lastStrike(control)?.damage, "CONTROL: unbuffed damage").toBe(4);

    let state = stagedFight("ash-i-damage", ["specialty.ash.1"] as CardId[]);
    state = apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: ownUnit(state).id,
      defenderId: guardUnit(state).id
    });
    const reaction = windowReaction(state, "specialty.ash.1" as CardId);
    expect(reaction, "Bloodlust I is offered on your own declared attack").toBeTruthy();
    state = settleWindows(apply(state, reaction!.action));
    const hit = lastStrike(state);
    expect(hit?.attackBonus, "+2 attack").toBe(2);
    expect(hit?.damage, "4 attack + 2 = 6 damage").toBe(6);
  });

  it("I's Black cube costs the attacker its own Retaliation for the round", () => {
    let state = stagedFight("ash-i-cube", ["specialty.ash.1"] as CardId[]);
    const ownId = ownUnit(state).id;
    state = apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: ownId,
      defenderId: guardUnit(state).id
    });
    state = settleWindows(apply(state, windowReaction(state, "specialty.ash.1" as CardId)!.action));
    // The guard survived and now strikes back on its own activation: the cubed
    // attacker may no longer perform a Retaliation Attack.
    state = letTheGuardStrike(state);
    expectGuardStruck(state, ownId);
    expect(retaliated(state, ownId), "the Black cube spent its Retaliation").toBe(false);

    // CONTROL: the identical exchange with no card in hand — the attacker keeps
    // its Retaliation and strikes back when the guard's own activation comes.
    let control = stagedFight("ash-i-cube-control", []);
    const controlOwn = ownUnit(control).id;
    control = strikeGuard(control);
    control = letTheGuardStrike(control);
    expectGuardStruck(control, controlOwn);
    expect(retaliated(control, controlOwn), "CONTROL: an uncubed attacker retaliates").toBe(true);
  });

  it("VI adds +3 AND the struck defender performs no Retaliation Attack", () => {
    const control = strikeGuard(stagedFight("ash-vi-control", []));
    expect(lastStrike(control)?.damage, "CONTROL: unbuffed damage").toBe(4);
    const controlGuard = guardUnit(control).id;
    expect(retaliated(control, controlGuard), "CONTROL: the guard retaliates normally").toBe(true);

    let state = stagedFight("ash-vi", ["specialty.ash.6"] as CardId[]);
    const guardId = guardUnit(state).id;
    state = apply(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: ownUnit(state).id,
      defenderId: guardId
    });
    const reaction = windowReaction(state, "specialty.ash.6" as CardId);
    expect(reaction, "Bloodlust VI is offered on your own declared attack").toBeTruthy();
    state = settleWindows(apply(state, reaction!.action));
    const hit = lastStrike(state);
    expect(hit?.attackBonus, "+3 attack").toBe(3);
    expect(hit?.damage, "4 attack + 3 = 7 damage").toBe(7);
    expect(retaliated(state, guardId), "the attack ignores Retaliation Attacks").toBe(false);
  });

  it("neither instant is offered when the attacker is ranged", () => {
    for (const cardId of ["specialty.ash.1", "specialty.ash.6"] as CardId[]) {
      let state = stagedFight(`ash-ranged-${cardId}`, [cardId], "ranged");
      const own = ownUnit(state);
      own.position = 13;
      state = apply(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: own.id,
        defenderId: guardUnit(state).id
      });
      expect(windowReaction(state, cardId), `${cardId} on a ranged attacker`).toBeFalsy();
    }
  });
});

// ===========================================================================
// The sibling class (CLAUDE.md rule #1a: cross-check siblings that share a
// mechanic). Ash IV is one of a family of hero specialties shaped
// "timing: combat, no trigger, plain effect, friendly-unit target" — Solmyr IV
// shipped stranded in exactly this corner of the timing space (2026-08-10), and
// `hero-specialty-levels.test.ts` cannot catch that: it asserts
// `implementationStatus`, never that a play is ever OFFERED.
// ===========================================================================

describe("every own-activation hero specialty with a friendly-unit target is really offered", () => {
  /** The shape: an own-activation combat play that picks one friendly unit. */
  const family = Object.values(adventureCards).filter((card) => {
    const target = card.target;
    return (
      card.kind === "hero-specialty" &&
      card.implementationStatus === "implemented" &&
      card.timing === "combat" &&
      !card.trigger &&
      card.effect.type !== "CHOOSE_ONE" &&
      target?.type === "friendly-unit" &&
      // Skip the faces needing bespoke staging (a named unit family, a wounded
      // body, an un-activated body) — they have their own hero tests.
      !("unitName" in target && target.unitName) &&
      !("damagedOnly" in target && target.damagedOnly) &&
      !("notActivatedThisRound" in target && target.notActivatedThisRound)
    );
  });

  it("finds the family (non-vacuity) and Ash IV is in it", () => {
    expect(family.length, "the shape exists").toBeGreaterThanOrEqual(5);
    expect(family.map((card) => card.id)).toContain("specialty.ash.4");
  });

  it.each(family.map((card) => [card.id] as const))(
    "%s is offered during the owner's own unit activation",
    (cardId) => {
      const card = adventureCards[cardId]!;
      const target = card.target!;
      const printedTypes =
        "unitTypes" in target && target.unitTypes ? target.unitTypes : (["ground"] as const);
      const state = stagedFight(
        `family-${cardId}`,
        [cardId as CardId],
        printedTypes[0] as "ground" | "flying" | "ranged"
      );
      const play = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
      );
      expect(play, `${cardId} has no legal play on its own unit's activation`).toBeTruthy();
      // And it must APPLY without error through the real pipeline.
      expect(applyAction(state, play!.action).errors).toHaveLength(0);
    }
  );
});
