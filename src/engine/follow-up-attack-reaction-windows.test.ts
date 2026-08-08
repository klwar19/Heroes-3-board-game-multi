import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions, getPlayerView } from "./index";
import { chooseComputerAction } from "./computer/policy";
import { nextAfkDropAction } from "./afk-drop";
import type { CardId, GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * A printed FOLLOW-UP attack ("second attack") is a separate attack, so both
 * sides get a pre-hit reaction window for it — including the ATTACKER, who has
 * no other moment to act.
 *
 * THE REPORT (2026-08-07): "Phoenix breath attack — it's a separate attack and
 * you should be able to play instant cards before this attack (similar with
 * other attacks of this second-attack type like dragon...). This sometimes
 * works but sometimes not, very buggy."
 *
 * THE BUG. Every follow-up attack already runs through `declareAbilityAttack` →
 * `declareAttack` → `openDeclaredAttackWindow`, so the DEFENDING side's printed
 * reactions (Armorer, Bless…) always got their window on the second hit, and so
 * did the ATTACKER's printed attack buffs (Offense, Bloodlust — they match the
 * UNIT_ATTACK_DECLARED trigger). What did NOT work was the attacker's
 * trigger-free "Instant (any time during Combat)" faces and Artillery:
 * 31d6c866 flagged those `windowJoinOnly` for the attacking side on the
 * reasoning that "the other side had its whole activation to play the card".
 * True of a PRIMARY attack — false of a follow-up, which the ENGINE declares
 * mid-resolution with no moment in between. So the phoenix's owner could fire
 * the Ballista before their first hit but never before their second, and in a
 * NEUTRAL fight (guards never open a window) no window opened for the second
 * attack at all. Holding Offense → a window; holding a Ballista/Frost Ring →
 * none. Exactly the reported intermittency.
 *
 * THE FIX. `followUpAttackInstantOpener` (legal-actions.ts) returns the
 * attacking side's controller for a UNIT_ATTACK_DECLARED event that carries
 * `abilityAttack`; that side then also gets the window-OPENING privilege for
 * its `combatAnytime` joins and Artillery.
 *
 * 2026-08-08 USER RULING — the PRIMARY-attack half of the scope is SUPERSEDED.
 * "Instant abilities should be able to be played before counter attack, when
 * attack and when defend, all of them, FIX PROPERLY": every attack window now
 * opens for either participant's playable instant, so a primary attack pauses
 * too (the flipped case in the scope block below). `followUpAttackInstantOpener`
 * remains as the narrower reading it always was and is now subsumed by it.
 * Still unchanged, and still CONTROL-pinned: a Spell cast, a unit activation, a
 * die-settled window and an effect-damage splash pause for nothing.
 *
 * Board: 5 rows × 4 cols, position = row*4 + col.
 * Attacker 12 → first target 13 → the space "behind" it 14 (one row, in line).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

type Options = {
  /** The attacker's printed follow-up ability (default the Phoenix's line breath). */
  ability?: string;
  /** p1's hand (the ATTACKING side — the phoenix's owner). */
  hand1?: CardId[];
  /** p2's hand (the defending side). */
  hand2?: CardId[];
  /** Give a side the Ballista war machine Gerwulf's instant discards. */
  ballista?: PlayerId;
  behindHealth?: number;
};

/**
 * p1's "phoenix" (the Marksmen body, melee-ified and carrying the printed
 * line-breath ability) is about to strike p2's Skeletons at 13; p2's Vampires
 * stand at 14, directly behind them, and take the SECOND attack.
 */
function phoenixLineAttack(options: Options = {}): GameState {
  const state = createInitialGameState("follow-up-window-seed");
  state.players.p1.hand = [...(options.hand1 ?? [])];
  state.players.p2.hand = [...(options.hand2 ?? [])];
  if (options.ballista) {
    state.players[options.ballista].permanents = ["war_machine.ballista"];
  }

  const units = state.combat!.units;
  const attacker = units.unit_p1_marksmen;
  attacker.position = 12;
  attacker.type = "ground";
  attacker.attack = 3;
  attacker.defense = 0;
  attacker.maxHealth = 30;
  attacker.abilities = [options.ability ?? "dragon-line-attack-2"];
  attacker.activatedThisRound = false;
  attacker.attackedThisActivation = false;

  const first = units.unit_p2_skeletons;
  first.position = 13;
  first.maxHealth = 30;
  first.defense = 0;
  first.attack = 1;
  first.initiative = 9;
  first.variant = "few";
  first.abilities = [];

  const behind = units.unit_p2_vampires;
  behind.position = 14;
  behind.maxHealth = options.behindHealth ?? 30;
  behind.defense = 0;
  behind.attack = 1;
  // The slowest enemy → Artillery's forced target is the unit the SECOND attack
  // is about to hit, so the shot is observable on that exact body.
  behind.initiative = 1;
  behind.variant = "few";
  behind.abilities = [];

  units.unit_p2_dread_knights.position = 0;
  units.unit_p2_dread_knights.initiative = 9;
  units.unit_p1_crusaders.position = 19;

  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  // Every Attack die is a flat "+0", so damage is pure printed maths.
  state.combat!.dice.scriptedRolls = new Array(12).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

const DECLARE: GameAction = {
  type: "ATTACK_UNIT",
  playerId: "p1",
  attackerId: "unit_p1_marksmen",
  defenderId: "unit_p2_skeletons"
};

/** The ability id of the window's trigger, or null when no window is open. */
function windowAbility(state: GameState): string | null {
  const trigger = state.reactionWindow?.triggerEvent;
  return trigger?.type === "UNIT_ATTACK_DECLARED" ? (trigger.abilityAttack?.abilityId ?? "primary") : null;
}

function windowDefender(state: GameState): UnitId | null {
  const trigger = state.reactionWindow?.triggerEvent;
  return trigger?.type === "UNIT_ATTACK_DECLARED" ? trigger.defenderId : null;
}

/**
 * An offer in the open window for `cardId`. Both action types count: a printed
 * reaction is a PLAY_REACTION, while an "Instant (any time)" join keeps its
 * PLAY_CARD shape (combatAnytimeInstantWindowJoins → addOptionPlays).
 */
function reactionOffer(state: GameState, playerId: PlayerId, cardId: CardId, targetUnitId?: UnitId) {
  return (state.reactionWindow?.legalReactions[playerId] ?? []).find(
    (legal) =>
      (legal.action.type === "PLAY_REACTION" || legal.action.type === "PLAY_CARD") &&
      legal.action.cardId === cardId &&
      (targetUnitId === undefined ||
        (legal.action.target?.type === "unit" && legal.action.target.unitId === targetUnitId))
  );
}

/**
 * Declare and pass out of the PRIMARY attack's own window.
 *
 * 2026-08-08 USER RULING ("when attack and when defend, all of them"): a held
 * instant now opens an attack window for EITHER side on EVERY attack, primary
 * included, so the attacker is asked once on their own declaration before the
 * follow-up's window is reached. Passing it lands the first hit and opens the
 * follow-up window exactly as before — the follow-up behaviour these tests pin
 * is unchanged, it is one Pass further along.
 */
function declaredPastPrimary(state: GameState): GameState {
  let next = applyOk(state, DECLARE);
  for (let guard = 0; guard < 6 && next.reactionWindow && windowAbility(next) === "primary"; guard += 1) {
    next = applyOk(next, { type: "PASS_REACTION", playerId: next.reactionWindow.priorityPlayerId });
  }
  return next;
}

/** Pass every open window in turn and return the settled state. */
function passAll(state: GameState): GameState {
  let cur = state;
  for (let i = 0; i < 8 && cur.reactionWindow; i += 1) {
    cur = applyOk(cur, { type: "PASS_REACTION", playerId: cur.reactionWindow.priorityPlayerId });
  }
  return cur;
}

const damageEventIndex = (state: GameState, unitId: UnitId, sourceCardId?: CardId): number =>
  state.eventLog.findIndex(
    (event) =>
      event.type === "DAMAGE_ASSIGNED" &&
      event.target.type === "unit" &&
      event.target.unitId === unitId &&
      (sourceCardId === undefined || (event.source.type === "card" && event.source.cardId === sourceCardId))
  );

// ===========================================================================
// The reported case: the attacker's own "any time" instant before its 2nd hit
// ===========================================================================

describe("a printed follow-up attack opens a window for the ATTACKING side too", () => {
  it("the phoenix's owner gets a window before the SECOND (line) attack, with NOBODY else able to react", () => {
    // Fails if followUpAttackInstantOpener is removed (or narrowed back to the
    // defender): with only a trigger-free `combatAnytime` face in hand and an
    // empty enemy hand, NO window opened for the second attack at all.
    const declared = declaredPastPrimary(
      phoenixLineAttack({ hand1: ["specialty.gerwulf.4"], ballista: "p1" })
    );

    // The PRIMARY attack's own window (new since 2026-08-08) has been passed;
    // this is the SECOND attack's window, the one this suite is about.
    expect(windowAbility(declared), "the open window is the line breath's").toBe("dragon-line-attack-2");
    expect(windowDefender(declared), "the open window is the SECOND attack's").toBe("unit_p2_vampires");
    expect(declared.combat!.units.unit_p2_skeletons.damage, "the first hit already landed").toBe(3);
    expect(declared.combat!.units.unit_p2_vampires.damage, "the second hit has NOT landed yet").toBe(0);
    expect(
      reactionOffer(declared, "p1", "specialty.gerwulf.4", "unit_p2_vampires"),
      "the attacker may fire the Ballista at the unit the line breath is about to hit"
    ).toBeTruthy();

    // CONTROL: the same fight with an empty hand resolves the whole exchange —
    // both hits and the Retaliation Attack — inside the one action, no window.
    const noCard = applyOk(phoenixLineAttack(), DECLARE);
    expect(noCard.reactionWindow, "nothing to react with → no window").toBeNull();
    expect(noCard.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(noCard.combat!.units.unit_p2_vampires.damage, "the line breath's printed attack 2").toBe(2);
  });

  it("the instant RESOLVES in that window, before the second hit's damage", () => {
    // Fails if the opener is removed (no window to play into) — and the ordering
    // assertion fails if the reaction were resolved after the parked attack.
    const declared = declaredPastPrimary(
      phoenixLineAttack({ hand1: ["specialty.gerwulf.4"], ballista: "p1" })
    );
    const fired = applyOk(declared, reactionOffer(declared, "p1", "specialty.gerwulf.4", "unit_p2_vampires")!.action);

    // 2 from the Ballista discard + the line breath's printed attack 2.
    expect(fired.combat!.units.unit_p2_vampires.damage).toBe(4);
    expect(fired.players.p1.hand, "the specialty is spent").not.toContain("specialty.gerwulf.4");

    // The discarded Ballista is the damage source the FX/sound layer reads.
    const shot = damageEventIndex(fired, "unit_p2_vampires", "war_machine.ballista");
    const secondHit = fired.eventLog.findIndex(
      (event) =>
        event.type === "DAMAGE_ASSIGNED" &&
        event.source.type === "unit" &&
        event.target.type === "unit" &&
        event.target.unitId === "unit_p2_vampires"
    );
    expect(shot, "the Ballista shot carries its card source").toBeGreaterThanOrEqual(0);
    expect(secondHit, "the line breath landed after it").toBeGreaterThan(shot);
  });

  it("Artillery too — the attacker's trigger-free ballista opens the follow-up window", () => {
    // Fails if the `followUpOpener` read is removed from the attackerArtillery
    // block (its offers would stay windowJoinOnly and open nothing).
    const declared = declaredPastPrimary(phoenixLineAttack({ hand1: ["ability.artillery"] }));
    expect(windowAbility(declared)).toBe("dragon-line-attack-2");
    const shot = reactionOffer(declared, "p1", "ability.artillery", "unit_p2_vampires");
    expect(shot, "Artillery is aimed at the slowest enemy — the unit about to be hit").toBeTruthy();

    const fired = applyOk(declared, shot!.action);
    expect(fired.combat!.units.unit_p2_vampires.damage, "1 from Artillery + the printed attack 2").toBe(3);
  });

  it("a shot that REMOVES the second target drops the parked follow-up (no attack on a corpse)", () => {
    // The Vampires sit at 1 remaining HP: the attacker's own Artillery shot
    // removes them inside the newly-opened window, so the line breath has
    // nothing left to hit. Fails if the opener is removed (no window at all).
    const declared = declaredPastPrimary(
      phoenixLineAttack({ hand1: ["ability.artillery"], behindHealth: 1 })
    );
    const fired = applyOk(declared, reactionOffer(declared, "p1", "ability.artillery", "unit_p2_vampires")!.action);

    const vampires = fired.combat!.units.unit_p2_vampires;
    expect(vampires.damage, "the shot removed them (damage ≥ maxHealth)").toBeGreaterThanOrEqual(
      vampires.maxHealth
    );
    expect(fired.stack, "the parked follow-up was dropped, not left stuck").toEqual([]);
    expect(fired.reactionWindow, "and the window closed").toBeNull();
  });
});

// ===========================================================================
// The same rule across the follow-up FAMILY, and on the real printed units
// ===========================================================================

describe("every printed follow-up attack, not just the Phoenix", () => {
  it("Gold Dragons' dragon-line-attack-3 behaves identically", () => {
    const declared = declaredPastPrimary(
      phoenixLineAttack({ ability: "dragon-line-attack-3", hand1: ["ability.artillery"] })
    );
    expect(windowAbility(declared)).toBe("dragon-line-attack-3");
    const fired = applyOk(declared, reactionOffer(declared, "p1", "ability.artillery", "unit_p2_vampires")!.action);
    // 1 from Artillery + the Gold Dragon's printed attack 3.
    expect(fired.combat!.units.unit_p2_vampires.damage).toBe(4);
  });

  it("Wolf Raiders' after-retaliation strike (a different follow-up kind) opens it too", () => {
    // SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION: the strike is declared after
    // the defender's Retaliation Attack, again with no moment for the attacker.
    const state = phoenixLineAttack({
      ability: "wolf-raiders-strike-twice",
      hand1: ["ability.artillery"]
    });
    // Nothing behind the target, so the only follow-up is the after-retaliation
    // strike; the Skeletons are then the slowest enemy Artillery must shoot.
    state.combat!.units.unit_p2_vampires.position = 0;
    state.combat!.units.unit_p2_dread_knights.position = 4;
    state.combat!.units.unit_p2_skeletons.initiative = 1;

    const declared = applyOk(state, DECLARE);
    const settled = (() => {
      let cur = declared;
      for (let i = 0; i < 6 && cur.reactionWindow && windowAbility(cur) !== "wolf-raiders-strike-twice"; i += 1) {
        cur = applyOk(cur, { type: "PASS_REACTION", playerId: cur.reactionWindow.priorityPlayerId });
      }
      return cur;
    })();
    expect(windowAbility(settled), "the after-retaliation strike gets its own window").toBe(
      "wolf-raiders-strike-twice"
    );
    expect(
      reactionOffer(settled, "p1", "ability.artillery", "unit_p2_skeletons"),
      "the attacker may fire before its second strike"
    ).toBeTruthy();
  });
});

// ===========================================================================
// The defending side is unchanged — and really changes the second hit
// ===========================================================================

describe("the defending side's window on the second attack (unchanged, pinned)", () => {
  it("a defence instant played in the follow-up window lowers the second hit's damage", () => {
    const declared = applyOk(phoenixLineAttack({ hand2: ["ability.armorer"] }), DECLARE);
    // The FIRST attack's window opens for the defender as before; pass it so the
    // card is still in hand for the follow-up's own window.
    const firstPassed = applyOk(declared, { type: "PASS_REACTION", playerId: "p2" });
    expect(windowAbility(firstPassed), "the follow-up opened its own window").toBe("dragon-line-attack-2");

    const armorer = reactionOffer(firstPassed, "p2", "ability.armorer");
    const buffed = passAll(applyOk(firstPassed, armorer!.action));
    // Printed attack 2 − Armorer's +1 Defense on the struck unit = 1.
    expect(buffed.combat!.units.unit_p2_vampires.damage).toBe(1);

    // CONTROL: passing that window instead takes the full printed 2.
    const unbuffed = passAll(firstPassed);
    expect(unbuffed.combat!.units.unit_p2_vampires.damage).toBe(2);
  });
});

// ===========================================================================
// Scope CONTROLs — nothing else at the table gained a pause
// ===========================================================================

describe("scope: only a printed follow-up ATTACK gained the attacker's opener", () => {
  it("a PRIMARY attack now pauses for the attacker's own instant too (2026-08-08 ruling)", () => {
    // FLIPPED EXPECTATION, justified: this was the CONTROL "a PRIMARY attack
    // still does not pause for the attacker's own instant", which rested on
    // "the attacker had the whole on-turn card pass before declaring". The
    // user's ruling — "when attack and when defend, all of them" — rejects that
    // reasoning, so the attacker is asked on every attack they declare.
    // What is STILL scoped (the surviving CONTROLs below): a Spell cast, a unit
    // activation, a die-settled window and effect damage pause for nothing.
    // Fails if reactionOfferOpensWindow stops treating an attack window as an
    // opener for windowJoinOnly / drawOnly / utilityOnly offers.
    const declared = applyOk(
      phoenixLineAttack({ ability: "phoenix-fire-immunity", hand1: ["ability.artillery"] }),
      DECLARE
    );
    expect(windowAbility(declared), "the primary declaration opened its own window").toBe("primary");
    expect(declared.combat!.units.unit_p2_skeletons.damage, "the hit is parked behind it").toBe(0);

    // Passing resumes the exchange with the maths untouched.
    const settled = passAll(declared);
    expect(settled.combat!.units.unit_p2_skeletons.damage, "the hit landed on the Pass").toBe(3);
  });

  it("CONTROL: an effect-damage follow-up (Chakra Burst splash) opens NO window", () => {
    // AFTER_ATTACK_SPLASH is effect damage, not an attack — it must never pause.
    // Fails if the opener were widened past UNIT_ATTACK_DECLARED events.
    const state = phoenixLineAttack({
      ability: "jinchuriki-chakra-burst",
      hand1: ["ability.artillery"],
      hand2: ["ability.armorer"]
    });
    state.combat!.units.unit_p2_vampires.position = 8; // adjacent to the attacker at 12

    const declared = applyOk(state, DECLARE);
    const settled = passAll(declared);
    // The splash landed on the adjacent Vampires with no window of its own.
    expect(settled.combat!.units.unit_p2_vampires.damage, "1 splash damage, unreacted").toBe(1);
    const splashWindows = settled.eventLog.filter(
      (event) =>
        event.type === "REACTION_WINDOW_OPENED" &&
        settled.eventLog.some(
          (trigger) =>
            trigger.id === event.triggerEventId &&
            trigger.type === "UNIT_ATTACK_DECLARED" &&
            Boolean(trigger.abilityAttack)
        )
    );
    expect(splashWindows, "effect damage declares no attack, so no follow-up window").toHaveLength(0);
  });

  it("CONTROL: a Spell cast still does not pause for a held 'any time' instant", () => {
    // Fails if the opener were computed outside the UNIT_ATTACK_DECLARED branch.
    const state = phoenixLineAttack({ hand1: ["specialty.deemer.6", "spell.magic_arrow"] });
    const cast = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(cast, "Magic Arrow is castable on p1's own activation").toBeTruthy();
    const casted = applyOk(state, {
      ...cast!.action,
      target: { type: "unit", unitId: "unit_p2_vampires" }
    } as GameAction);
    expect(casted.reactionWindow, "the cast resolved without a window").toBeNull();
  });
});

// ===========================================================================
// The new window can never strand an automated seat
// ===========================================================================

describe("the follow-up window never stalls an automated seat", () => {
  it("a computer attacker closes its own follow-up window with PASS_REACTION", () => {
    const state = phoenixLineAttack({ hand1: ["specialty.gerwulf.4"], ballista: "p1" });
    state.controllers = { p1: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    const declared = declaredPastPrimary(state);
    expect(windowAbility(declared), "the window really opened for the computer seat").toBe(
      "dragon-line-attack-2"
    );

    const choice = chooseComputerAction({
      playerId: "p1",
      state: getPlayerView(declared, "p1"),
      legalActions: getLegalActions(declared, "p1")
    });
    expect(choice, "the AI always has an answer in this window").toBeTruthy();
    expect(choice!.action.type, "the AI passes rather than firing").toBe("PASS_REACTION");
    const settled = applyOk(declared, choice!.action);
    expect(windowAbility(settled), "the follow-up's own window closed").not.toBe("dragon-line-attack-2");
    expect(settled.combat!.units.unit_p2_vampires.damage, "the follow-up resolved").toBe(2);
    // …and the whole exchange can still be driven to the end (no stall).
    expect(passAll(settled).reactionWindow).toBeNull();
  });

  it("the AFK / turn-timeout driver closes it too", () => {
    const declared = declaredPastPrimary(
      phoenixLineAttack({ hand1: ["specialty.gerwulf.4"], ballista: "p1" })
    );
    expect(windowAbility(declared), "the window really opened for the dropped seat").toBe(
      "dragon-line-attack-2"
    );
    const drop = nextAfkDropAction(declared, "p1");
    expect(drop?.type, "the forced-resolution driver passes the window").toBe("PASS_REACTION");
    const settled = applyOk(declared, drop!);
    expect(windowAbility(settled), "the follow-up's own window closed").not.toBe("dragon-line-attack-2");
    expect(passAll(settled).reactionWindow, "the exchange runs to the end").toBeNull();
  });
});
