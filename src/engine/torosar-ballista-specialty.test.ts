import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  type GameAction,
  type GameEvent,
  type GameState,
  type LegalAction
} from "./index";
import { placeCreatureBank } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { countBallistas } from "./permanents";
import { cardLibrary } from "@/data/cards/library";

/**
 * USER REPORT (2026-08-11), verbatim: "Balista I for Torossar not workig
 * properly, very buggy got added to ongoing? i told u to fix, u did something
 * terrible."
 *
 * WHAT WAS ACTUALLY WRONG — the engine did not implement the printed cards. The
 * committed board-game scans are the truth:
 *
 *   I  (/assets/hero_specialties-torosar-1.webp, 031/197 TOW)
 *      "[map] Pay 5 gold to gain a Ballista. — OR — [instant] Activate your
 *       Ballista (if you have one)."
 *      ...which is WORD FOR WORD the same printed card as Tarnum (Castle) I
 *      (061/197 CAS) and Gerwulf I (043/197 FOR), both of which the engine
 *      already modelled correctly. Torosar's was instead an invented
 *      "until the end of the game round, gain an additional Ballista" grant —
 *      so it created a lasting effect, its card was (rightly, for a lasting
 *      effect) held in the public Ongoing tray by the 2026-08-10 hold pass, and
 *      the player never got the Ballista they paid for. That is the report:
 *      not working properly, "got added to ongoing?".
 *
 *   IV (032/197 TOW) "[map] Until the end of the round, gain an additional
 *      Ballista during Combat. When played, this card counts as a Ballista."
 *      The engine ALSO gave it "This and 1 other Ballista can be activated now"
 *      — a clause that is not on the card at all — and offered it mid-combat.
 *
 *   VI (033/197 TOW) "[instant] For this Combat, gain an additional Ballista.
 *      You can activate all your Ballistas now. When played, this card counts
 *      as a Ballista."
 *      The engine scoped its grant to the GAME ROUND instead of the combat, so
 *      it leaked into every later fight of the same round.
 *
 * The Ongoing-tray hold is NOT the bug and is not reverted: IV and VI both
 * print "When played, this card counts as a Ballista", i.e. the card stays in
 * play for as long as the grant lasts — exactly what the tray is. Level I
 * simply has no lasting effect to hold, so its card goes to the discard.
 *
 * Every test below fails if its wiring is removed; each carries a CONTROL.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function plays(state: GameState, cardId: string): LegalAction[] {
  return getLegalActions(state, "p1").filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
  );
}

function warMachineHits(state: GameState): Extract<GameEvent, { type: "WAR_MACHINE_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "WAR_MACHINE_TRIGGERED" }> =>
      event.type === "WAR_MACHINE_TRIGGERED"
  );
}

function extraBallistaEffects(state: GameState) {
  return state.activeEffects.filter((effect) =>
    effect.modifiers.some((modifier) => modifier.type === "EXTRA_BALLISTA")
  );
}

/** Every zone a copy of `cardId` could be sitting in, for conservation checks. */
function zones(state: GameState, cardId: string) {
  const player = state.players.p1;
  const count = (list: readonly string[]) => list.filter((entry) => entry === cardId).length;
  return {
    hand: count(player.hand),
    deck: count(player.deck),
    discard: count(player.discard),
    removed: count(player.removed ?? []),
    permanents: count(player.permanents ?? []),
    ongoing: (player.ongoingCards ?? []).filter((held) => held.cardId === cardId).length
  };
}

function totalCopies(state: GameState, cardId: string): number {
  const z = zones(state, cardId);
  return z.hand + z.deck + z.discard + z.removed + z.permanents + z.ongoing;
}

/** A Torosar map turn with exactly `cardId` in hand and no war machine in play. */
function torosarMap(cardId: string, options: { gold?: number; round?: number } = {}): GameState {
  const state = createAdventureGameState({
    seed: `torosar-ballista-${cardId}`,
    difficulty: "easy",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Torosar", factionId: "tower", heroDefId: "torosar" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.round = options.round ?? 3;
  state.activePlayerId = "p1";
  state.phase = "player-turn";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.players.p1.hand = [cardId];
  state.players.p1.permanents = [];
  state.players.p1.resources.gold = options.gold ?? 50;
  return state;
}

/** Opens a REAL neutral (Creature Bank) fight for p1, freshly deployed. */
function startFight(state: GameState, fieldId = "bank-field"): GameState {
  const hero = getMainHero(state, "p1")!;
  hero.level = 7;
  hero.spaceId = fieldId;
  state.adventure!.fields[fieldId] = {
    spaceId: fieldId,
    tileInstanceId: "t",
    slot: 0,
    location: "blocked_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  } as never;
  placeCreatureBank(state, fieldId, "crypt");
  startNeutralEncounter(state, hero, state.adventure!.fields[fieldId]);
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  let next = apply(state, place!.action);
  next = apply(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  return next;
}

/** Runs the open fight to its end (conceding) and clears the end notice. */
function finishFight(state: GameState): GameState {
  let next = state;
  let safety = 200;
  while (safety-- > 0) {
    const combat = next.combat;
    if (!combat || combat.outcome) {
      break;
    }
    const actions = getLegalActions(next, "p1");
    const step =
      actions.find((legal) => legal.action.type === "GIVE_UP_COMBAT") ??
      actions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP") ??
      actions.find((legal) => legal.action.type === "PASS_REACTION") ??
      actions[0];
    if (!step) {
      break;
    }
    next = apply(next, step.action);
  }
  const ack = getLegalActions(next, "p1").find((legal) => legal.action.type === "ACKNOWLEDGE_COMBAT_END");
  return ack ? apply(next, ack.action) : next;
}

/** Ends turns until the game round advances past `from`. */
function wrapGameRound(state: GameState): GameState {
  let next = state;
  const from = next.round;
  let safety = 40;
  while (next.round === from && safety-- > 0) {
    const active = next.activePlayerId!;
    const actions = getLegalActions(next, active);
    const step =
      actions.find((legal) => legal.action.type === "END_TURN") ??
      actions.find((legal) => legal.action.type === "REFRESH_HAND") ??
      actions[0];
    if (!step) {
      break;
    }
    next = apply(next, step.action);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Level I — the shared "Ballista I" card: buy one on the map, or fire one now.
// ---------------------------------------------------------------------------

describe("Torosar Ballista I — the printed card (buy on the map / activate in combat)", () => {
  const cardId = "specialty.torosar.1";

  it("REPRO: the map play BUYS a Ballista for 5 gold and creates NO ongoing effect", () => {
    const state = torosarMap(cardId, { gold: 12 });
    const before = totalCopies(state, cardId);

    const offers = plays(state, cardId);
    expect(offers.map((offer) => offer.label)).toEqual(["Ballista I: Pay 5 gold to gain a Ballista"]);

    const next = apply(state, offers[0].action);

    // The printed payoff: 5 gold spent, the real war-machine Ballista gained.
    expect(next.players.p1.resources.gold).toBe(7);
    expect(next.players.p1.hand).toContain("war_machine.ballista");

    // The reported symptom, gone: no lasting effect, so nothing is held in play.
    expect(extraBallistaEffects(next)).toHaveLength(0);
    expect(next.activeEffects).toHaveLength(0);
    expect(next.players.p1.ongoingCards ?? []).toHaveLength(0);

    // The specialty card itself reaches the discard, exactly once.
    expect(zones(next, cardId)).toMatchObject({ hand: 0, ongoing: 0, discard: 1 });
    expect(totalCopies(next, cardId)).toBe(before);
  });

  it("CONTROL: a hero who cannot pay 5 gold is not offered the purchase", () => {
    const state = torosarMap(cardId, { gold: 4 });
    expect(plays(state, cardId)).toHaveLength(0);
  });

  it("can buy another physical Ballista when one is already owned", () => {
    const state = torosarMap(cardId, { gold: 12 });
    state.players.p1.permanents = ["war_machine.ballista"];
    const offer = plays(state, cardId)[0];
    expect(offer?.label).toBe("Ballista I: Pay 5 gold to gain a Ballista");
    const next = apply(state, offer.action);
    expect(next.players.p1.permanents).toEqual(["war_machine.ballista"]);
    expect(next.players.p1.hand.filter((id) => id === "war_machine.ballista")).toHaveLength(1);
  });

  it("in combat it ACTIVATES a Ballista you own — real damage on the slowest enemy", () => {
    const state = createInitialGameState("torosar-i-activate");
    state.players.p1.hand = [cardId];
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.initiative = 1;
    state.combat!.units.unit_p2_skeletons.maxHealth = 10;
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;

    const offers = plays(state, cardId);
    expect(offers.map((offer) => offer.label)).toEqual(["Ballista I: Activate your Ballista"]);

    const damageBefore = state.combat!.units.unit_p2_skeletons.damage;
    const hitsBefore = warMachineHits(state).length;
    const next = apply(state, offers[0].action);

    expect(warMachineHits(next)).toHaveLength(hitsBefore + 1);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(damageBefore + 1);
    // Still no lasting effect and nothing held in play — it is a one-shot.
    expect(extraBallistaEffects(next)).toHaveLength(0);
    expect(next.players.p1.ongoingCards ?? []).toHaveLength(0);
    expect(zones(next, cardId).discard).toBe(1);
  });

  it("CONTROL: with no Ballista in play the combat side is not offered ('if you have one')", () => {
    const state = createInitialGameState("torosar-i-no-ballista");
    state.players.p1.hand = [cardId];
    state.players.p1.permanents = [];
    state.players.p2.hand = [];
    expect(plays(state, cardId)).toHaveLength(0);
  });

  it("CONTROL: the map purchase side is never offered mid-combat, and the fire side never on the map", () => {
    const combat = createInitialGameState("torosar-i-sides");
    combat.players.p1.hand = [cardId];
    combat.players.p1.permanents = ["war_machine.ballista"];
    combat.players.p2.hand = [];
    expect(
      plays(combat, cardId).map((offer) =>
        offer.action.type === "PLAY_CARD" ? offer.action.optionIndex : null
      )
    ).toEqual([1]);

    const map = torosarMap(cardId);
    map.players.p1.permanents = ["war_machine.ballista"];
    expect(
      plays(map, cardId).map((offer) => (offer.action.type === "PLAY_CARD" ? offer.action.optionIndex : null))
    ).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// Level IV — the printed MAP commitment. No activation clause exists on it.
// ---------------------------------------------------------------------------

describe("Torosar Ballista IV — a map-only game-round grant, no activation", () => {
  const cardId = "specialty.torosar.4";

  it("is a MAP play that banks the grant and fires NOTHING immediately", () => {
    const state = torosarMap(cardId);
    const before = totalCopies(state, cardId);

    const offers = plays(state, cardId);
    expect(offers).toHaveLength(1);

    const next = apply(state, offers[0].action);
    expect(countBallistas(next, "p1")).toBe(1);
    expect(extraBallistaEffects(next)).toHaveLength(1);
    expect(extraBallistaEffects(next)[0].duration).toEqual({ type: "current-game-round" });
    expect(warMachineHits(next)).toHaveLength(0);
    expect(totalCopies(next, cardId)).toBe(before);
  });

  it("CONTROL: it is never offered DURING a combat (the printed card has no combat side)", () => {
    // The fabricated reading offered it mid-fight and fired up to two Ballistas.
    const sandbox = createInitialGameState("torosar-iv-combat");
    sandbox.players.p1.hand = [cardId];
    sandbox.players.p1.permanents = ["war_machine.ballista"];
    sandbox.players.p2.hand = [];
    expect(plays(sandbox, cardId)).toHaveLength(0);

    // ...and not once a real adventure fight is open either.
    let live = torosarMap(cardId);
    live = startFight(live);
    expect(plays(live, cardId)).toHaveLength(0);
  });

  it("'this card counts as a Ballista': the card stays in PLAY, not the discard", () => {
    const state = torosarMap(cardId);
    const next = apply(state, plays(state, cardId)[0].action);
    expect(zones(next, cardId)).toMatchObject({ hand: 0, discard: 0, ongoing: 1 });
    expect(next.players.p1.ongoingCards?.[0]).toMatchObject({ cardId, returnTo: "discard" });
  });

  it("the banked Ballista really shoots — in EVERY combat round of the fight", () => {
    let state = torosarMap(cardId);
    state = apply(state, plays(state, cardId)[0].action);
    state = startFight(state);

    // The first combat round's round-start shot has already gone off.
    expect(warMachineHits(state)).toHaveLength(1);
    expect(state.combat!.round).toBe(1);

    // Nobody can hurt anybody, so the fight rolls on and we can watch round 2.
    state.combat!.dice.scriptedRolls = Array(400).fill(-1);
    for (const unit of Object.values(state.combat!.units)) {
      unit.attack = 0;
      unit.maxHealth = 50;
    }

    let safety = 300;
    while (safety-- > 0) {
      const combat = state.combat;
      if (!combat || combat.outcome || (combat.round ?? 0) >= 2) {
        break;
      }
      const actions = getLegalActions(state, "p1");
      const step =
        actions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_COMBAT") ??
        actions.find((legal) => legal.action.type === "END_ACTIVATION") ??
        actions.find((legal) => legal.action.type === "DEFEND_UNIT") ??
        actions.find((legal) => legal.action.type === "CONTINUE_NEUTRAL_STEP") ??
        actions.find((legal) => legal.action.type === "PASS_REACTION") ??
        actions.find((legal) => legal.action.type === "CHOOSE_OPTION") ??
        actions[0];
      if (!step) {
        break;
      }
      state = apply(state, step.action);
    }
    expect(state.combat!.round).toBe(2);
    expect(warMachineHits(state)).toHaveLength(2);
  });

  it("expires at the END of the game round, and only then does the card reach the discard", () => {
    let state = torosarMap(cardId);
    const before = totalCopies(state, cardId);
    state = apply(state, plays(state, cardId)[0].action);

    // Still live (and still in play) while the round runs.
    expect(extraBallistaEffects(state)).toHaveLength(1);
    expect(zones(state, cardId).ongoing).toBe(1);

    state = wrapGameRound(state);

    expect(state.round).toBe(4);
    expect(extraBallistaEffects(state)).toHaveLength(0);
    expect(countBallistas(state, "p1")).toBe(0);
    expect(zones(state, cardId)).toMatchObject({ ongoing: 0, discard: 1 });
    expect(totalCopies(state, cardId)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Level VI — the printed INSTANT, scoped "For this Combat".
// ---------------------------------------------------------------------------

describe("Torosar Ballista VI — a combat-scoped grant that fires every Ballista now", () => {
  const cardId = "specialty.torosar.6";

  it("grants for THIS COMBAT and activates every Ballista at once", () => {
    const state = createInitialGameState("torosar-vi-all");
    state.players.p1.hand = [cardId];
    state.players.p1.permanents = ["war_machine.ballista"]; // 1 owned + the grant = 2
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.initiative = 1;
    state.combat!.units.unit_p2_skeletons.maxHealth = 10;
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;

    const next = apply(state, plays(state, cardId)[0].action);

    expect(warMachineHits(next)).toHaveLength(2);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(2);
    // "For this Combat" — a combat-scoped grant, NOT a game-round one.
    expect(extraBallistaEffects(next)).toHaveLength(1);
    expect(extraBallistaEffects(next)[0].duration).toEqual({ type: "combat" });
    // "When played, this card counts as a Ballista" — it is in play, not spent.
    expect(zones(next, cardId)).toMatchObject({ discard: 0, ongoing: 1 });
  });

  it("with no Ballista of your own, the granted one alone fires", () => {
    const state = createInitialGameState("torosar-vi-grant-only");
    state.players.p1.hand = [cardId];
    state.players.p1.permanents = [];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.initiative = 1;
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;

    const next = apply(state, plays(state, cardId)[0].action);
    expect(warMachineHits(next)).toHaveLength(1);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("activates every owned copy plus the specialty's granted Ballista", () => {
    const state = createInitialGameState("torosar-vi-multiple-owned");
    state.players.p1.hand = [cardId];
    state.players.p1.permanents = ["war_machine.ballista", "war_machine.ballista"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p2_skeletons.initiative = 1;
    state.combat!.units.unit_p2_skeletons.maxHealth = 20;
    state.combat!.units.unit_p2_vampires.initiative = 5;
    state.combat!.units.unit_p2_dread_knights.initiative = 5;

    const next = apply(state, plays(state, cardId)[0].action);
    expect(warMachineHits(next)).toHaveLength(3);
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(countBallistas(next, "p1")).toBe(3);
  });

  it("the grant DIES with the combat — it never carries into the next fight this round", () => {
    // The old reading scoped it to the game round, so a second fight in the same
    // round inherited a free Ballista. This is the discriminating assertion.
    let state = torosarMap(cardId);
    const before = totalCopies(state, cardId);
    state = startFight(state, "bank-a");
    state = apply(state, plays(state, cardId)[0].action);
    expect(countBallistas(state, "p1")).toBe(1);
    expect(zones(state, cardId).ongoing).toBe(1);

    state = finishFight(state);

    expect(state.combat).toBeFalsy();
    expect(extraBallistaEffects(state)).toHaveLength(0);
    expect(countBallistas(state, "p1")).toBe(0);
    // Released from play to the discard, exactly once.
    expect(zones(state, cardId)).toMatchObject({ ongoing: 0, discard: 1 });
    expect(totalCopies(state, cardId)).toBe(before);
  });

  it("CONTROL: it is never offered on the adventure map (printed as an Instant, 'For this Combat')", () => {
    const state = torosarMap(cardId);
    expect(plays(state, cardId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The invariant that would have caught this: three heroes, ONE printed card.
// ---------------------------------------------------------------------------

describe("the shared 'Ballista I' card is identical for every Ballista hero", () => {
  it("Torosar I, Tarnum (Castle) I and Gerwulf I carry the same printed effect", () => {
    const ids = ["specialty.torosar.1", "specialty.tarnum_castle.1", "specialty.gerwulf.1"] as const;
    const effects = ids.map((id) => {
      const card = cardLibrary[id];
      expect(card, `${id} must exist`).toBeTruthy();
      return card!.effect;
    });

    // Non-vacuity: the shape really is the two-sided buy-or-fire card.
    expect(effects[0]).toMatchObject({
      type: "CHOOSE_ONE",
      options: [
        {
          mapOnly: true,
          effect: { type: "GAIN_WAR_MACHINE", warMachineCardId: "war_machine.ballista", goldCost: 5 }
        },
        { combatOnly: true, effect: { type: "BALLISTA_SPECIALTY", activate: "one" } }
      ]
    });

    expect(JSON.stringify(effects[1])).toBe(JSON.stringify(effects[0]));
    expect(JSON.stringify(effects[2])).toBe(JSON.stringify(effects[0]));
  });

  it("every Torosar level is a Ballista specialty with no invented activation clause", () => {
    expect(cardLibrary["specialty.torosar.4"]?.effect).toEqual({
      type: "BALLISTA_SPECIALTY",
      grant: "game-round"
    });
    expect(cardLibrary["specialty.torosar.6"]?.effect).toEqual({
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Gain an additional Ballista and activate all Ballistas now",
          combatAnytime: true,
          effect: { type: "BALLISTA_SPECIALTY", grant: "combat", activate: "all" }
        }
      ]
    });
    // IV prints the MAP icon; VI prints the INSTANT icon.
    expect(cardLibrary["specialty.torosar.4"]?.timing).toBe("map");
    expect(cardLibrary["specialty.torosar.6"]?.timing).toBe("instant");
  });
});
