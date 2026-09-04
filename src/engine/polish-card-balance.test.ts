/**
 * Polish Balance Pack (`polish-card-balance`) — the WIRED reprints.
 *
 * Every claim here is an OBSERVABLE game outcome (how many cards a Search really
 * reveals; whether a Ballista really gets to pick its target) paired with a
 * rule-OFF CONTROL on the SAME setup, so a passing test proves the reprint is
 * what moved the number — not merely that some flag was written (CLAUDE.md #1a).
 *
 * Scope note: only Scouting, Artillery and Mysticism are reprinted so far. The
 * other nine Balance-Pack Abilities keep their classic text AND classic face —
 * `polish-balance-art.test.ts` pins that scope, this file pins the behaviour.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getMainHero } from "./index";
import { openSharedDeckSearch, startNeutralEncounter } from "./adventure-reducer";
import { applySearchCountEffects, searchCountOverrideFor } from "./ruleset";
import { hasBallistaChooseTarget } from "./active-effects";
import { putPermanentIntoPlay } from "./permanents";
import type { CardId, GameAction, GameState, MapFieldState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function adventure(seed: string, balance: boolean, extraRules: Record<string, boolean> = {}): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: { "polish-card-balance": balance, ...extraRules }
  });
}

// ===========================================================================
// Scouting — "do Search (X+2) instead", and the Expert widen lasts the turn
// ===========================================================================

const FIVE_SPELLS = [
  "spell.haste",
  "spell.bloodlust",
  "spell.stone_skin",
  "spell.curse",
  "spell.slow",
  "spell.frost_ring"
];

/**
 * A hero holding Scouting, about to Search the Spell deck. The discard is EMPTY
 * so the up-front take-the-discard menu never opens and `openSharedDeckSearch`
 * goes straight to the Scouting pop-up — the real play path, not a hand-pushed
 * active effect.
 */
function scoutingSearch(seed: string, balance: boolean, opts: { crowns?: boolean } = {}): GameState {
  const state = adventure(seed, balance);
  state.activePlayerId = "p1";
  const player = state.players.p1;
  player.hand = ["ability.scouting" as CardId];
  player.deck = [];
  player.discard = [];
  player.spellBook = [];
  // Crowns (expert uses) are what gates the Expert side.
  player.limits.expertUses = opts.crowns ? 2 : 0;
  player.combatStats.expertUsesSpentThisRound = 0;
  state.decks.spells.drawPile = [...FIVE_SPELLS];
  state.decks.spells.discardPile = [];
  return state;
}

function scoutingOptionLabels(state: GameState): string[] {
  if (state.pendingChoice?.type !== "OPTION_CHOICE") {
    throw new Error("expected the Scouting pop-up");
  }
  expect(state.pendingChoice.context).toBe("scouting-prompt");
  return state.pendingChoice.options.map((option) => option.label);
}

/** Answer the Scouting pop-up and return the revealed-card count of the Search. */
function revealCountAfterScouting(state: GameState, optionIndex: number): number {
  if (state.pendingChoice?.type !== "OPTION_CHOICE") {
    throw new Error("expected the Scouting pop-up");
  }
  const choiceId = state.pendingChoice.id;
  const after = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex });
  if (after.pendingChoice?.type !== "DECK_SEARCH") {
    throw new Error(`expected the Search to open, got ${after.pendingChoice?.type ?? "nothing"}`);
  }
  return after.pendingChoice.revealedCardIds.length;
}

describe("Balance Pack — Scouting reads Search (X+2)", () => {
  it("REPRO: a basic Scouting on a Search (2) reveals 4 — the classic flat 3 is the CONTROL", () => {
    // The whole point of the reprint: the widen SCALES with the Search being
    // made. 4 vs 3 on the identical setup is what discriminates the two
    // printings, so this fails if the delta read is removed.
    const on = scoutingSearch("balance-scouting-on", true);
    openSharedDeckSearch(on, "p1", "spells", 2);
    expect(scoutingOptionLabels(on)).toContain("Play Scouting — Search (4)");
    expect(revealCountAfterScouting(on, 1)).toBe(4);

    const off = scoutingSearch("balance-scouting-off", false);
    openSharedDeckSearch(off, "p1", "spells", 2);
    expect(scoutingOptionLabels(off)).toContain("Play Scouting — Search (3)");
    expect(revealCountAfterScouting(off, 1)).toBe(3);
  });

  it("the reprint scales where the classic flat 3 would be a DOWNGRADE: a Search (4) becomes 6", () => {
    // With the rule off, a flat-3 Scouting cannot beat a Search (4) at all, so
    // the engine correctly withholds the basic tier — the reprint always helps.
    const on = scoutingSearch("balance-scouting-big-on", true);
    openSharedDeckSearch(on, "p1", "spells", 4);
    expect(scoutingOptionLabels(on)).toContain("Play Scouting — Search (6)");
    expect(revealCountAfterScouting(on, 1)).toBe(6);

    // CONTROL: the classic flat 3 cannot widen a Search (4), so the card is dead
    // here — no pop-up opens at all and the Search reveals the bare base 4.
    const off = scoutingSearch("balance-scouting-big-off", false);
    openSharedDeckSearch(off, "p1", "spells", 4);
    expect(off.pendingChoice?.type).toBe("DECK_SEARCH");
    if (off.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected the Search to open directly");
    }
    expect(off.pendingChoice.revealedCardIds).toHaveLength(4);
  });

  it("the EXPERT reprint widens EVERY Search this turn; the classic expert is spent on the first", () => {
    const on = scoutingSearch("balance-scouting-expert-on", true, { crowns: true });
    openSharedDeckSearch(on, "p1", "spells", 2);
    const onLabels = scoutingOptionLabels(on);
    expect(onLabels.some((label) => label.includes("for every Search this turn"))).toBe(true);
    // Expert is the last playable option (basic, then expert, then... the
    // decline tile is index 0), so index 2 here.
    expect(onLabels[2]).toContain("Play Expert Scouting");
    const onAfter = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: on.pendingChoice!.id,
      optionIndex: 2
    });
    // Answering the pop-up plays the card AND re-enters the Search, so this
    // FIRST Search already revealed base+2 = 4...
    if (onAfter.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected the Search to open");
    }
    expect(onAfter.pendingChoice.revealedCardIds).toHaveLength(4);
    // ...and the widen SURVIVES it: every later Search this turn is still X+2.
    // This is the assertion that fails if `balancePersist` stops being honoured.
    expect(applySearchCountEffects(onAfter, "p1", 2)).toBe(4);
    expect(applySearchCountEffects(onAfter, "p1", 2)).toBe(4);
    expect(applySearchCountEffects(onAfter, "p1", 3)).toBe(5);

    // CONTROL: the classic expert is a one-shot flat 5 — it reveals 5 and is then
    // SPENT, so the next Search this turn is back to its own base.
    const off = scoutingSearch("balance-scouting-expert-off", false, { crowns: true });
    openSharedDeckSearch(off, "p1", "spells", 2);
    const offLabels = scoutingOptionLabels(off);
    expect(offLabels[2]).toBe("Play Expert Scouting — Search (5) (spend a crown)");
    const offAfter = applyOk(off, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: off.pendingChoice!.id,
      optionIndex: 2
    });
    if (offAfter.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected the Search to open");
    }
    expect(offAfter.pendingChoice.revealedCardIds).toHaveLength(5);
    expect(applySearchCountEffects(offAfter, "p1", 2)).toBe(2);
  });

  it("the up-front deck menu's \"Search (N)\" label equals what the Search then reveals", () => {
    // The label and the reveal read the SAME `searchCountOverrideFor`, so they
    // cannot disagree — the honesty bug this seam exists to prevent.
    const state = scoutingSearch("balance-scouting-label", true);
    state.players.p1.hand = [];
    // An acquirable spell in the discard forces the up-front deck-search menu.
    state.decks.spells.discardPile = ["spell.haste" as CardId];
    state.activeEffects.push({
      id: "effect_balance_scouting",
      name: "Scouting",
      scope: "player",
      duration: { type: "current-turn" },
      polarity: "positive",
      removable: false,
      modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count: 3, balanceDelta: 2 }],
      source: { type: "system" },
      controllerId: "p1",
      startedRound: state.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });
    expect(searchCountOverrideFor(state, "p1", 2)?.count).toBe(4);

    openSharedDeckSearch(state, "p1", "spells", 2);
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the deck-search-mode menu");
    }
    expect(state.pendingChoice.options[0].label).toBe("Search (4) — Scouting override (base 2)");
    const after = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: 0
    });
    if (after.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected the Search to open");
    }
    expect(after.pendingChoice.revealedCardIds).toHaveLength(4);
  });

  it("CONTROL: with no Scouting effect at all the Search is untouched in both readings", () => {
    for (const balance of [true, false]) {
      const state = adventure(`balance-scouting-none-${balance}`, balance);
      expect(searchCountOverrideFor(state, "p1", 2)).toBeNull();
      expect(applySearchCountEffects(state, "p1", 2)).toBe(2);
    }
  });
});

// ===========================================================================
// Artillery — both sides also let you aim your Ballista for the rest of the fight
// ===========================================================================

const GUARD_FIELD = "guard-field";

function guardField(state: GameState): MapFieldState {
  const field: MapFieldState = {
    spaceId: GUARD_FIELD,
    tileInstanceId: "balance-tile",
    slot: 0,
    location: "mine",
    difficulty: 5,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[GUARD_FIELD] = field;
  return field;
}

/**
 * p1 in a real neutral combat, holding Artillery, optionally with a Ballista in
 * play. The active unit is forced to one of p1's own bodies so the on-turn card
 * play is open (which guard happens to be fastest is irrelevant here).
 */
function artilleryCombat(
  seed: string,
  balance: boolean,
  opts: { ballista: boolean; crowns?: boolean; drainChoices?: boolean }
): GameState {
  let state = adventure(seed, balance);
  state.activePlayerId = "p1";
  for (let guard = 0; guard < 3 && (state.players.p1.needsHandRefresh || state.players.p1.canMulligan); guard += 1) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    state.activePlayerId = "p1";
  }
  state.players.p1.hand = ["ability.artillery" as CardId];
  // Crowns gate the EXPERT volley; the basic shot needs none.
  state.players.p1.limits.expertUses = opts.crowns ? 2 : 0;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  const hero = getMainHero(state, "p1")!;
  // The field difficulty must EXCEED the hero level or the classic
  // level-beats-difficulty Quick Combat auto-wins before a combat ever opens.
  hero.level = 1;
  hero.spaceId = GUARD_FIELD;
  if (opts.ballista) {
    // putPermanentIntoPlay plays it FROM HAND, so it must be there first.
    state.players.p1.hand.push("war_machine.ballista" as CardId);
    putPermanentIntoPlay(state, "p1", "war_machine.ballista" as CardId);
  }
  startNeutralEncounter(state, hero, guardField(state));
  let next = state;
  // Deploy the whole army, then start the fight — the on-turn card pass only
  // opens once placement is finished.
  for (let guard = 0; guard < 12; guard += 1) {
    const place = getLegalActions(next, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    if (!place) {
      break;
    }
    next = applyOk(next, place.action);
  }
  const finish = getLegalActions(next, "p1").find((entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT");
  expect(finish, "combat placement must be finishable").toBeTruthy();
  next = applyOk(next, finish!.action);
  // Some seeds open a guard's own "[activation]" choice first; answer whatever
  // the fight puts up so the on-turn card pass is reachable on every seed. The
  // volley test opts OUT of this: the Ballista's own round-start offer IS the
  // pending choice it needs to answer.
  // Protocol v92 (80015e27): with the Balance Pack on, a Ballista owner HOLDING
  // Artillery is also offered the crown-free Basic two-shot at the Ballista's own
  // round start — which the blind drain below would take, consuming the card and
  // granting the aim before the test ever plays it. Hold the card out of hand
  // while the seed's opening choices are drained, then hand it straight back, so
  // the aim can only come from the hand play under test.
  const heldArtillery = opts.drainChoices !== false
    ? next.players.p1.hand.filter((cardId) => cardId === ("ability.artillery" as CardId))
    : [];
  if (heldArtillery.length > 0) {
    next.players.p1.hand = next.players.p1.hand.filter(
      (cardId) => cardId !== ("ability.artillery" as CardId)
    );
  }
  for (let guard = 0; guard < 8 && opts.drainChoices !== false && next.pendingChoice?.type === "OPTION_CHOICE"; guard += 1) {
    const answer = getLegalActions(next, next.pendingChoice.playerId).find(
      (entry) => entry.action.type === "CHOOSE_OPTION"
    );
    if (!answer) {
      break;
    }
    next = applyOk(next, answer.action);
  }
  next.players.p1.hand.push(...heldArtillery);
  const own = Object.values(next.combat!.units).find((unit) => unit.controllerId === "p1");
  expect(own, "p1 must have a unit in the fight").toBeTruthy();
  // The test deliberately takes over at p1's own activation. Discard any
  // seed-dependent guard follow-up that the corrected Neutral deck exposed.
  if (opts.drainChoices !== false) {
    next.pendingChoice = null;
    next.reactionWindow = null;
    next.stack = [];
    next.combat!.pendingNeutralStep = null;
  }
  next.combat!.activeUnitId = own!.id;
  next.activePlayerId = "p1";
  next.phase = "combat";
  return next;
}

function playBasicArtillery(state: GameState): GameState {
  const offer = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "ability.artillery" &&
      legal.action.optionIndex === 0
  );
  expect(offer, "the basic Artillery shot must be offered on p1's own activation").toBeTruthy();
  return applyOk(state, offer!.action);
}

function totalNeutralDamage(state: GameState): number {
  return Object.values(state.combat!.units)
    .filter((unit) => unit.controllerId !== "p1")
    .reduce((total, unit) => total + unit.damage, 0);
}

/**
 * The damage the Artillery play itself adds. Measured as a DELTA on purpose: a
 * Ballista in play already fires its own round-start shot, so the absolute total
 * on the board is not 1 — the card's contribution is.
 */
function artilleryShotDamage(state: GameState): { after: GameState; dealt: number } {
  const before = totalNeutralDamage(state);
  const after = playBasicArtillery(state);
  return { after, dealt: totalNeutralDamage(after) - before };
}

describe("Balance Pack — Artillery also aims your Ballista", () => {
  it("playing the basic shot grants the aim freedom; the classic card grants NONE (CONTROL)", () => {
    const on = artilleryCombat("balance-artillery-on", true, { ballista: true });
    expect(hasBallistaChooseTarget(on, "p1"), "no aim before the card is played").toBe(false);
    const { after: onAfter, dealt: onDealt } = artilleryShotDamage(on);
    // The printed shot still lands — the rider is ON TOP of it, not instead.
    expect(onDealt).toBe(1);
    // The observable outcome: the Ballista's round-start shot may now pick its
    // target, exactly as Gerwulf's Ballista VI grants (the SAME reader).
    expect(hasBallistaChooseTarget(onAfter, "p1")).toBe(true);

    const off = artilleryCombat("balance-artillery-off", false, { ballista: true });
    const { after: offAfter, dealt: offDealt } = artilleryShotDamage(off);
    expect(offDealt).toBe(1);
    expect(hasBallistaChooseTarget(offAfter, "p1"), "the classic Artillery has no aim rider").toBe(false);
  });

  it("CONTROL: the printed condition holds — with NO Ballista in play nothing is granted", () => {
    const state = artilleryCombat("balance-artillery-no-ballista", true, { ballista: false });
    const { after, dealt } = artilleryShotDamage(state);
    expect(dealt).toBe(1);
    expect(hasBallistaChooseTarget(after, "p1"), '"If you have a Balista card played" must gate it').toBe(false);
  });

  it("the EXPERT volley grants the same rider; the classic volley grants NONE (CONTROL)", () => {
    // The expert side is never played from hand — it is offered when the owner's
    // Ballista fires at round start. Both readings fire the SAME volley (3 hits
    // on one target); only the reprint leaves the aim freedom behind.
    const volleyOffer = (state: GameState) =>
      getLegalActions(state, "p1").find(
        (legal) => legal.label.includes("Artillery") && legal.label.includes("expert")
      );

    const on = artilleryCombat("balance-artillery-volley-on", true, {
      ballista: true,
      crowns: true,
      drainChoices: false
    });
    const onVolley = volleyOffer(on);
    expect(onVolley, "the Ballista must offer the Artillery volley at its round start").toBeTruthy();
    const onFired = applyOk(on, onVolley!.action);
    // The printed volley really resolved (a crown was spent for it)…
    expect(onFired.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(onFired.players.p1.hand).not.toContain("ability.artillery");
    // …and the reprint's rider is on top of it.
    expect(hasBallistaChooseTarget(onFired, "p1")).toBe(true);
    // CONSEQUENCE of the rider, and the discriminating half of this pair: the
    // card now creates a LIVE lasting effect, so the engine-wide "a live ongoing
    // card is never in the discard pile" rule holds it in the public Ongoing
    // tray for the rest of the fight instead of discarding it at once.
    expect((onFired.players.p1.ongoingCards ?? []).map((entry) => entry.cardId)).toContain("ability.artillery");
    expect(onFired.players.p1.discard).not.toContain("ability.artillery");

    const off = artilleryCombat("balance-artillery-volley-off", false, {
      ballista: true,
      crowns: true,
      drainChoices: false
    });
    const offVolley = volleyOffer(off);
    expect(offVolley, "the classic volley is offered the same way").toBeTruthy();
    const offFired = applyOk(off, offVolley!.action);
    expect(offFired.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    expect(hasBallistaChooseTarget(offFired, "p1"), "the classic expert side has no aim rider").toBe(false);
    // CONTROL: with no lasting effect to hold it, the classic card goes straight
    // to the discard — the exact opposite zone from the reprint above.
    expect(offFired.players.p1.discard).toContain("ability.artillery");
    expect((offFired.players.p1.ongoingCards ?? []).map((entry) => entry.cardId)).not.toContain(
      "ability.artillery"
    );
  });

  it("the aim is granted ONCE — a second Artillery does not stack a duplicate effect", () => {
    const state = artilleryCombat("balance-artillery-once", true, { ballista: true });
    const after = playBasicArtillery(state);
    const aimEffects = (target: GameState) =>
      target.activeEffects.filter((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "BALLISTA_CHOOSE_TARGET")
      );
    expect(aimEffects(after)).toHaveLength(1);
    // Re-run the grant directly: the guard against a second copy is what keeps
    // the effects list from growing on every shot.
    after.players.p1.hand = ["ability.artillery" as CardId];
    const twice = playBasicArtillery(after);
    expect(aimEffects(twice)).toHaveLength(1);
  });
});
