import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions, getPlayerView, NEUTRAL_PLAYER_ID } from "./index";
import { chooseComputerAction } from "./computer/policy";
import { nextAfkDropAction } from "./afk-drop";
import { scoreCardAction } from "./computer/card-policy";
import type { CardId, CombatUnitState, GameAction, GameState, PlayerVisibleState } from "./state";

/**
 * 2026-08-08 USER RULING, verbatim: "instant abilities should be able to be
 * played before counter attack, when attack and when defend, all of them, FIX
 * PROPERLY. and now I still can't use card like Rion speciality, not for heal,
 * just for draw effect, choice never appear properly."
 *
 * TWO REAL-PLAY GAPS, both reproduced first (each repro is the first case of its
 * describe block, and each is mutation-checked against the exact line that fixes
 * it):
 *
 * A. WINDOW-OPENING. A held instant that is not a printed reaction — a flagged
 *    `drawOnly` / `utilityOnly` join (Rion and every other draw rider) or a
 *    `combatAnytime` instant / Artillery on the "wrong" side — could JOIN a
 *    reaction window but never OPEN one (`reactionOfferOpensWindow` returned
 *    false for all of them). In a NEUTRAL fight the guards open nothing either,
 *    so nothing ever opened: the blow, the retaliation and all their damage
 *    resolved inside ONE action. THE CHOICE NEVER APPEARED.
 *    THE FIX (legal-actions.ts `reactionOfferOpensWindow`): inside an ATTACK
 *    window — `UNIT_ATTACK_DECLARED`, i.e. primary, retaliation and printed
 *    follow-up alike — EVERY playable instant offer a combat participant holds
 *    opens it, on BOTH sides.
 *
 * B. OWN-TURN DRAW PLAY. On your own combat activation a medic heal face
 *    (`HEAL_DAMAGE` with a printed "then draw N") was excluded from the
 *    Offense/Armorer/Sorcery draw-only play, so with NOTHING wounded Rion I
 *    (printed `damagedOnly` target) had no legal play in combat at all.
 *    THE FIX (legal-actions.ts `addPlayableCardActions`): when the real play
 *    yields zero targets, a target-less `drawOnly` twin is offered.
 *
 * DELIBERATE SCOPE, pinned by the CONTROLs at the end: only ATTACK windows
 * changed. A Spell cast, a unit activation and a die-settled window still pause
 * for nothing, and the bare positive-Morale TOKEN keeps its Retaliation-only
 * opener (the ruling names instant ABILITY CARDS; a token is held by nearly
 * every seat nearly always).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * p2's Skeletons are about to strike p1's Crusaders. NOTHING of p1's is
 * wounded, so a medic's printed heal has no target: the only thing the card can
 * do is its "then draw" rider.
 */
function enemyAboutToAttack(p1Hand: CardId[], p2Hand: CardId[] = []): GameState {
  const state = createInitialGameState("instant-open-seed");
  state.players.p1.hand = [...p1Hand];
  state.players.p2.hand = [...p2Hand];
  state.players.p1.deck = ["spell.bless", "spell.haste", "spell.curse"] as CardId[];
  state.players.p2.deck = ["spell.bless", "spell.haste"] as CardId[];

  const units = state.combat!.units;
  for (const unit of Object.values(units)) {
    unit.damage = 0;
    unit.abilities = [];
  }
  units.unit_p2_skeletons.position = 13;
  units.unit_p2_skeletons.attack = 1;
  units.unit_p2_skeletons.defense = 0;
  units.unit_p2_skeletons.maxHealth = 40;
  units.unit_p2_skeletons.activatedThisRound = false;
  units.unit_p2_skeletons.attackedThisActivation = false;
  units.unit_p1_crusaders.position = 14;
  units.unit_p1_crusaders.attack = 1;
  units.unit_p1_crusaders.defense = 0;
  units.unit_p1_crusaders.maxHealth = 40;

  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  state.combat!.dice.scriptedRolls = new Array(8).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

const ENEMY_STRIKE: GameAction = {
  type: "ATTACK_UNIT",
  playerId: "p2",
  attackerId: "unit_p2_skeletons",
  defenderId: "unit_p1_crusaders"
};

/** p1's Crusaders are about to strike p2's Skeletons (p1 is the ATTACKER). */
function ownAttack(p1Hand: CardId[]): GameState {
  const state = enemyAboutToAttack([], []);
  state.players.p1.hand = [...p1Hand];
  state.combat!.units.unit_p2_skeletons.activatedThisRound = true;
  state.combat!.units.unit_p1_crusaders.activatedThisRound = false;
  state.combat!.units.unit_p1_crusaders.attackedThisActivation = false;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_crusaders";
  return state;
}

const OWN_STRIKE: GameAction = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_crusaders",
  defenderId: "unit_p2_skeletons"
};

function reactionOffers(state: GameState, playerId: "p1" | "p2", cardId: CardId) {
  return getLegalActions(state, playerId).filter(
    (legal) =>
      (legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD") &&
      legal.action.cardId === cardId
  );
}

function passAll(state: GameState): GameState {
  let cur = state;
  for (let guard = 0; guard < 10 && cur.reactionWindow; guard += 1) {
    cur = applyOk(cur, { type: "PASS_REACTION", playerId: cur.reactionWindow.priorityPlayerId });
  }
  return cur;
}

/** The open window's trigger shape, or null. */
function windowShape(state: GameState): { retaliation: boolean; ability: string | null } | null {
  const trigger = state.reactionWindow?.triggerEvent;
  if (trigger?.type !== "UNIT_ATTACK_DECLARED") {
    return null;
  }
  return { retaliation: Boolean(trigger.isRetaliation), ability: trigger.abilityAttack?.abilityId ?? null };
}

// ===========================================================================
// A. The window now opens — both sides, every attack shape
// ===========================================================================

describe("gap A: a held instant OPENS an attack window", () => {
  it("REPRO: defending with only a medic draw rider used to get NO window at all", () => {
    // The reported symptom, as an observable: p2 strikes, p1 holds only Rion I
    // and has nothing wounded. Before the fix `reactionOfferOpensWindow`
    // returned false for the drawOnly join, the utility-strip tail then deleted
    // it, and the whole exchange resolved inside the one ATTACK_UNIT action.
    // Fails if `reactionOfferOpensWindow`'s attack-window widening is reverted.
    const declared = applyOk(enemyAboutToAttack(["specialty.rion.1"]), ENEMY_STRIKE);

    expect(windowShape(declared), "the enemy's declared attack opened a window").toEqual({
      retaliation: false,
      ability: null
    });
    expect(declared.reactionWindow!.allowedPlayerIds, "…for the DEFENDING side").toEqual(["p1"]);
    expect(declared.combat!.units.unit_p1_crusaders.damage, "the blow is parked behind it").toBe(0);

    const offers = reactionOffers(declared, "p1", "specialty.rion.1");
    expect(offers.length, "exactly one offer — the draw-only join").toBe(1);
    expect(
      (offers[0].action as Extract<GameAction, { type: "PLAY_REACTION" }>).drawOnly,
      "nothing is wounded, so it is the printed rider alone"
    ).toBe(true);

    // Playing it really draws; passing out then resolves the parked blow.
    const drawn = applyOk(declared, offers[0].action);
    expect(drawn.players.p1.hand, "the printed 'then draw 1 card' resolved").toEqual(["spell.curse"]);
    const settled = passAll(drawn);
    expect(settled.reactionWindow).toBeNull();
    expect(settled.combat!.units.unit_p1_crusaders.damage, "the parked attack resumed unchanged").toBe(1);
  });

  it("CONTROL: an empty hand still opens nothing — no empty pauses", () => {
    // The "only when there is a genuinely playable offer" half: a seat with
    // nothing to play must never be stopped. Fails if the widening were applied
    // unconditionally instead of per-offer.
    const declared = applyOk(enemyAboutToAttack([]), ENEMY_STRIKE);
    expect(declared.reactionWindow, "nothing playable → no window").toBeNull();
    expect(declared.combat!.units.unit_p1_crusaders.damage, "the blow landed at once").toBe(1);
  });

  it("the ATTACKING side opens its own PRIMARY attack window too", () => {
    // "when attack ... all of them". Fails with the widening reverted: the
    // attacker's combatAnytime / drawOnly joins are flagged windowJoinOnly /
    // drawOnly, which used to withhold the opener from them entirely.
    const declared = applyOk(ownAttack(["specialty.rion.1"]), OWN_STRIKE);
    expect(windowShape(declared), "p1's own declaration paused").toEqual({
      retaliation: false,
      ability: null
    });
    expect(declared.reactionWindow!.allowedPlayerIds).toEqual(["p1"]);
    expect(declared.combat!.units.unit_p2_skeletons.damage, "the blow has not landed yet").toBe(0);
    expect(passAll(declared).combat!.units.unit_p2_skeletons.damage, "Pass resumes it").toBe(1);
  });

  it("BOTH sides are in the window when both hold something", () => {
    // Fails if the widening were scoped to one side.
    const declared = applyOk(
      enemyAboutToAttack(["specialty.rion.1"], ["specialty.deemer.6"]),
      ENEMY_STRIKE
    );
    expect(declared.reactionWindow!.allowedPlayerIds.slice().sort()).toEqual(["p1", "p2"]);
    // getLegalActions only serves the seat holding priority, so read the
    // window's own per-seat offer lists.
    const perSeat = declared.reactionWindow!.legalReactions;
    expect(
      (perSeat.p1 ?? []).some((legal) => "cardId" in legal.action && legal.action.cardId === "specialty.rion.1"),
      "the DEFENDING side's medic is in the window"
    ).toBe(true);
    expect(
      (perSeat.p2 ?? []).some((legal) => "cardId" in legal.action && legal.action.cardId === "specialty.deemer.6"),
      "the ATTACKING side's 'any time' instant is in the same window"
    ).toBe(true);
  });

  it("the RETALIATION window opens for a lone draw rider too (before the counter-attack)", () => {
    // p1 attacks and holds only Rion I; the Skeletons survive and retaliate.
    // The first window is p1's own declaration — passing it lands the blow and
    // the RETALIATION's own window opens next, which is the moment the ruling
    // names ("before counter attack").
    // Fails with the widening reverted (neither window would open).
    const declared = applyOk(ownAttack(["specialty.rion.1"]), OWN_STRIKE);
    const afterPrimary = applyOk(declared, {
      type: "PASS_REACTION",
      playerId: declared.reactionWindow!.priorityPlayerId
    });
    expect(windowShape(afterPrimary), "the counter-attack's own window").toEqual({
      retaliation: true,
      ability: null
    });
    expect(afterPrimary.reactionWindow!.allowedPlayerIds).toContain("p1");
    expect(
      afterPrimary.combat!.units.unit_p1_crusaders.damage,
      "the counter-attack has NOT landed yet"
    ).toBe(0);
    expect(passAll(afterPrimary).combat!.units.unit_p1_crusaders.damage, "and it lands on the Pass").toBe(1);
  });

  it("a printed FOLLOW-UP attack opens one as well", () => {
    // The Phoenix/dragon line breath declares a second attack mid-resolution.
    // Fails with the widening reverted for the DEFENDING side of a follow-up
    // holding only a draw rider (followUpAttackInstantOpener covers the
    // attacker, never the defender).
    const state = enemyAboutToAttack(["specialty.rion.1"]);
    const units = state.combat!.units;
    units.unit_p2_skeletons.abilities = ["dragon-line-attack-2"];
    units.unit_p2_skeletons.attack = 3;
    units.unit_p1_crusaders.position = 14; // first target
    units.unit_p1_griffins.position = 15; // directly behind, takes the second hit
    units.unit_p1_griffins.maxHealth = 40;
    units.unit_p1_griffins.defense = 0;

    let cur = applyOk(state, ENEMY_STRIKE);
    // Walk to the follow-up's own window (the primary's comes first).
    for (let guard = 0; guard < 4 && windowShape(cur) && !windowShape(cur)!.ability; guard += 1) {
      cur = applyOk(cur, { type: "PASS_REACTION", playerId: cur.reactionWindow!.priorityPlayerId });
    }
    expect(windowShape(cur)?.ability, "the line breath's own window opened").toBe("dragon-line-attack-2");
    expect(reactionOffers(cur, "p1", "specialty.rion.1").length, "the medic is offered there").toBe(1);
  });

  it("END-TO-END in a real NEUTRAL guard fight: the guards open nothing, the medic does", () => {
    // The reported context. Neutral guards never hold cards, so before the fix
    // a human defender holding only a medic got no moment in the whole battle.
    // Fails with the widening reverted.
    let state = createAdventureGameState({ seed: "medic-guard-seed", difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
    const armyUnit = state.players.p1.army[0];
    state = applyOk(state, {
      type: "PLACE_COMBAT_UNIT",
      playerId: "p1",
      armyUnitId: armyUnit.id,
      position: 13
    });
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
        unit.initiative = 99;
      }
    }
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const guard = Object.values(state.combat!.units).find(
      (unit: CombatUnitState) => unit.controllerId === NEUTRAL_PLAYER_ID
    )!;
    guard.initiative = 1;
    guard.type = "ranged";
    guard.abilities = [];
    guard.attack = 1;
    guard.position = 1;
    // Nothing of p1's is wounded, so ONLY the draw rider can be played.
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
        unit.damage = 0;
        unit.maxHealth = 40;
      }
    }
    state.players.p1.hand = ["specialty.rion.1"] as CardId[];
    state.players.p1.deck = ["spell.bless"] as CardId[];

    const active = state.combat!.activeUnitId!;
    state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active });
    state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });

    expect(state.reactionWindow, "the guard's shot opened a window for the human").toBeTruthy();
    expect(state.reactionWindow!.allowedPlayerIds).toEqual(["p1"]);
    const offer = reactionOffers(state, "p1", "specialty.rion.1" as CardId)[0];
    expect(offer, "the medic draw rider is the offer").toBeTruthy();
    const drawn = applyOk(state, offer.action);
    expect(drawn.players.p1.hand, "the draw resolved inside the guard's window").toEqual(["spell.bless"]);
  });
});

// ===========================================================================
// B. Own-turn combat draw-only medic play
// ===========================================================================

describe("gap B: a medic Instant is playable on your own activation just for the draw", () => {
  it("REPRO: with nothing wounded Rion I had NO combat play at all", () => {
    // Fails if the `healDrawOnlyRider` twin is removed from
    // addPlayableCardActions (the printed `damagedOnly` target yields no offer,
    // so the card is stuck in hand for the whole fight).
    const state = ownAttack(["specialty.rion.1"]);
    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.rion.1"
    );
    expect(plays.length, "exactly one offer — the draw-only twin").toBe(1);
    const action = plays[0].action as Extract<GameAction, { type: "PLAY_CARD" }>;
    expect(action.drawOnly, "flagged draw-only so the AI prices it as card-cycling").toBe(true);
    expect(action.target, "target-less: there is nothing to mend").toEqual({ type: "none" });

    const played = applyOk(state, action);
    expect(played.players.p1.hand, "the printed rider drew 1").toEqual(["spell.curse"]);
    expect(played.players.p1.discard, "the specialty is spent").toEqual(["specialty.rion.1"]);
    expect(
      Object.values(played.combat!.units).every((unit) => unit.damage === 0),
      "the heal fizzled (nothing was wounded to begin with)"
    ).toBe(true);
  });

  it("CONTROL: with a WOUNDED unit only the real heal is offered — no trap twin", () => {
    // Fails if the twin were offered unconditionally: a heal DRAWS TOO, so a
    // draw-only twin beside it would be a strictly-worse duplicate button.
    const state = ownAttack(["specialty.rion.1"]);
    state.combat!.units.unit_p1_griffins.damage = 2;
    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.rion.1"
    );
    expect(plays.length, "one offer per legal heal target, and nothing else").toBe(1);
    expect(
      (plays[0].action as Extract<GameAction, { type: "PLAY_CARD" }>).drawOnly,
      "it is the real heal"
    ).toBeUndefined();
  });

  it("CONTROL: a CHOOSE_ONE medic (Rion VI) keeps only its real, unit-targeted plays", () => {
    // The scope note at the offer site: every shipped CHOOSE_ONE medic targets
    // ANY friendly unit, so its options are always offerable while a friendly
    // body stands — and one must stand for the owner's activation to be open at
    // all. A draw-only twin there could never be reached, so none is offered
    // (unreachable offer code is what this repo's rules forbid). Fails if a
    // per-option twin is added without a reachable case to pin it.
    const state = ownAttack(["specialty.rion.6"]);
    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.rion.6"
    );
    expect(plays.length, "the real per-unit / per-option plays exist").toBeGreaterThan(0);
    expect(
      plays.filter((legal) => (legal.action as Extract<GameAction, { type: "PLAY_CARD" }>).drawOnly),
      "and not one of them is a draw-only twin"
    ).toEqual([]);
    for (const play of plays) {
      expect((play.action as Extract<GameAction, { type: "PLAY_CARD" }>).target?.type).toBe("unit");
    }
  });

  it("the AI prices the new combat play as pure card-cycling (300), never as a heal", () => {
    // Fails if the offer stopped carrying `drawOnly` (the scorer would then
    // value it by its HEAL_DAMAGE primary and the AI would dump the card).
    const state = ownAttack(["specialty.rion.1"]);
    const play = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "specialty.rion.1"
    )!;
    const scored = scoreCardAction(
      {
        playerId: "p1",
        state: getPlayerView(state, "p1") as unknown as PlayerVisibleState,
        legalActions: []
      },
      play.action
    );
    expect(scored?.policy).toBe("card.draw-rider-only");
    expect(scored?.score).toBe(300);
  });
});

// ===========================================================================
// Non-stall guarantees for the newly-opening windows
// ===========================================================================

describe("the newly-opening windows never strand an automated seat", () => {
  it("a computer seat answers with PASS_REACTION", () => {
    // Documented limit, pinned so it can never become a stall: the AI's
    // combat-damage / draw-rider bands sit below PASS_REACTION (1_050).
    const state = enemyAboutToAttack(["specialty.rion.1"]);
    state.controllers = { p1: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    const declared = applyOk(state, ENEMY_STRIKE);
    expect(declared.reactionWindow, "the window really opened for the computer seat").toBeTruthy();

    const decision = chooseComputerAction({
      playerId: "p1",
      state: getPlayerView(declared, "p1"),
      legalActions: getLegalActions(declared, "p1")
    });
    expect(decision, "the AI always has an answer").toBeTruthy();
    expect(decision!.action.type).toBe("PASS_REACTION");
    expect(passAll(applyOk(declared, decision!.action)).reactionWindow, "and the fight runs on").toBeNull();
  });

  it("the AFK / turn-timeout driver closes it with a Pass", () => {
    const declared = applyOk(enemyAboutToAttack(["specialty.rion.1"]), ENEMY_STRIKE);
    expect(nextAfkDropAction(declared, "p1")).toMatchObject({ type: "PASS_REACTION", playerId: "p1" });
  });

  it("a whole AI-vs-AI exchange settles with both seats holding instants", () => {
    // The freeze shape this ruling could have introduced: both sides holding a
    // window-opening instant on every attack. Drive it to the end.
    const state = enemyAboutToAttack(["specialty.rion.1"], ["specialty.deemer.6"]);
    state.controllers = {
      p1: { kind: "computer", difficulty: "standard", policyVersion: 1 },
      p2: { kind: "computer", difficulty: "standard", policyVersion: 1 }
    };
    let cur = applyOk(state, ENEMY_STRIKE);
    for (let guard = 0; guard < 20 && cur.reactionWindow; guard += 1) {
      const seat = cur.reactionWindow.priorityPlayerId as "p1" | "p2";
      const decision = chooseComputerAction({
        playerId: seat,
        state: getPlayerView(cur, seat),
        legalActions: getLegalActions(cur, seat)
      });
      expect(decision, `seat ${seat} always has an answer`).toBeTruthy();
      cur = applyOk(cur, decision!.action);
    }
    expect(cur.reactionWindow, "the exchange settled — no stall").toBeNull();
    expect(cur.combat!.units.unit_p1_crusaders.damage, "and the attack really resolved").toBe(1);
  });
});

// ===========================================================================
// Scope CONTROLs — only ATTACK windows changed
// ===========================================================================

describe("scope: nothing outside an attack window gained a pause", () => {
  it("CONTROL: a Spell cast does not pause for a held draw rider", () => {
    // Fails if the widening were applied to every trigger instead of
    // UNIT_ATTACK_DECLARED.
    const state = ownAttack(["specialty.rion.1", "spell.magic_arrow"] as CardId[]);
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(cast, "Magic Arrow is castable on p1's own activation").toBeTruthy();
    const casted = applyOk(state, {
      ...cast!.action,
      target: { type: "unit", unitId: "unit_p2_skeletons" }
    } as GameAction);
    expect(
      casted.eventLog.some((event) => event.type === "SPELL_CAST_STARTED"),
      "the cast really started, so a window COULD have opened"
    ).toBe(true);
    expect(casted.reactionWindow, "…but the held rider is a join, never an opener on a cast").toBeNull();
  });

  it("CONTROL: a unit ACTIVATION does not pause for a held draw rider", () => {
    // UNIT_ACTIVATION_STARTED is the other non-attack card window.
    const state = enemyAboutToAttack(["specialty.rion.1"]);
    const started = applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: "unit_p2_skeletons" });
    expect(
      started.eventLog.some((event) => event.type === "UNIT_ACTIVATION_STARTED"),
      "an activation really started"
    ).toBe(true);
    expect(started.reactionWindow, "no window opened for the held rider").toBeNull();
  });

  it("CONTROL: a bare positive-Morale token still opens only a RETALIATION window", () => {
    // The deliberate scope carve-out: the ruling names instant ABILITY CARDS,
    // and a token is held by nearly every seat nearly always. Fails if the
    // SPEND_MORALE branch of reactionOfferOpensWindow were widened too.
    const state = enemyAboutToAttack([]);
    state.players.p1.morale = 1;
    const declared = applyOk(state, ENEMY_STRIKE);

    // The enemy's own DECLARATION opened nothing (a token is not an instant
    // card); only the Retaliation Attack — the retaliating side's single
    // pre-roll moment — did, exactly as before this ruling.
    const openedTriggers = declared.eventLog
      .filter((event) => event.type === "REACTION_WINDOW_OPENED")
      .map((event) =>
        declared.eventLog.find((candidate) => candidate.id === (event as { triggerEventId: string }).triggerEventId)
      );
    expect(
      openedTriggers.some(
        (trigger) => trigger?.type === "UNIT_ATTACK_DECLARED" && !trigger.isRetaliation
      ),
      "a token alone never opens a plain (non-retaliation) attack window"
    ).toBe(false);
    expect(
      openedTriggers.some((trigger) => trigger?.type === "UNIT_ATTACK_DECLARED" && trigger.isRetaliation),
      "…the printed retaliation exception still stands"
    ).toBe(true);
    expect(declared.combat!.units.unit_p1_crusaders.damage, "the enemy's blow landed at once").toBe(1);
  });
});
