import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type BankSize,
  type GameAction,
  type GameState,
  type LegalAction,
  type MapFieldState
} from "./index";
import { getMainHero, placeCreatureBank } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { redactStateForSeat } from "./player-view";
import {
  CAST_A_SPELL_CARD_ID,
  markPolishSpellRefreshedThisRound,
  polishBookSpellRefreshBlocked
} from "./polish-spell-book";
import type { CreatureBankId } from "@/data/map/creature-banks";
import { expireEffectsForCombatEnd, releaseEndedOngoingCards } from "./active-effects";

/**
 * REPORTED (2026-08-12, verbatim): "polish rule: bug: Teleport spell - after
 * casting it is still refreshed. it was in medusa bank - in non bank battle -
 * works fine."
 *
 * NOT REPRODUCED. These are the pins that were MISSING while that claim was
 * made: nothing in the suite had ever driven a Polish Spell Book cast through a
 * CREATURE BANK combat, and `spell.teleport` — the one combat Spell whose
 * resolution defers into a second player choice (the destination pick) — had no
 * Book-lifecycle coverage at all. Every case below asserts the OBSERVABLE
 * outcome (the unit really moved / the Spell really cannot be cast again), not
 * just that a field changed.
 *
 * SEARCHED AND RULED OUT (throwaway probes, not shipped): a seeded random-legal
 * -action fuzz over ALL 12 Creature Banks and difficulty-1/3/5 guard fields,
 * plain and recall-rich hands, driven THROUGH combat end and the bank reward
 * flow, watching for any moment a cast Book Spell reappears on the refreshed
 * side — 0 hits; a per-spell sweep of every implemented combat Spell in a bank
 * fight; the Intelligence free-cast path, the School-of-Magic and Basic-X-Magic
 * expert cast variants, and a hand Power boost; Stack Tokens (Polish size IV);
 * and the hosted redacted client frame. The ONE mechanism that legitimately
 * refreshes a cast Book Spell mid-combat is Mysticism's printed recall, pinned
 * as a CONTROL below. The other honest explanations for the report, both already
 * pinned elsewhere in `polish-spell-book.test.ts`, are the round-start
 * whole-used-side refresh (a Spell cast in round N IS refreshed at the start of
 * round N+1) and that same Mysticism play.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = apply(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

function polishAdventure(seed: string, houseRules: Record<string, boolean> = {}): GameState {
  let state = createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "normal",
    rollFirstPlayer: false,
    startingBuildings: [],
    houseRules: { "polish-spell-book": true, ...houseRules }
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

function fieldUnderHero(state: GameState, spaceId: string, extra: Partial<MapFieldState> = {}) {
  const hero = getMainHero(state, "p1")!;
  hero.level = 7;
  hero.movementPoints = 9;
  hero.spaceId = spaceId;
  state.adventure!.fields[spaceId] = {
    spaceId,
    tileInstanceId: "t",
    slot: 0,
    location: "blocked_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    ...extra
  };
}

/** A REAL Creature Bank combat, opened through startNeutralEncounter. */
function bankCombat(seed: string, bankId: CreatureBankId, bankSize?: BankSize): GameState {
  const state = polishAdventure(seed, bankSize ? { "polish-bank-sizes": true } : {});
  fieldUnderHero(state, "bank-field");
  placeCreatureBank(state, "bank-field", bankId);
  if (bankSize) {
    state.adventure!.fields["bank-field"]!.bankSize = bankSize;
  }
  startNeutralEncounter(state, getMainHero(state, "p1")!, state.adventure!.fields["bank-field"]);
  return state;
}

/**
 * The CONTROL shape the report calls "non bank battle": a plain guard field.
 * The hero's level must stay BELOW the Field Difficulty or the classic
 * `level > difficulty` Quick Combat auto-wins it and no combat ever opens.
 */
function guardCombat(seed: string, difficulty = 5): GameState {
  const state = polishAdventure(seed);
  fieldUnderHero(state, "guard-field", { location: "empty_field", difficulty });
  getMainHero(state, "p1")!.level = 3;
  startNeutralEncounter(state, getMainHero(state, "p1")!, state.adventure!.fields["guard-field"]);
  return state;
}

/** Deploys the army, locks placement, then hands the floor to one of p1's units. */
function readyToCast(state: GameState): GameState {
  let current = state;
  let safety = 12;
  while (safety-- > 0) {
    const place = getLegalActions(current, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    if (!place) break;
    current = apply(current, place.action);
  }
  const finish = getLegalActions(current, "p1").find(
    (entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT"
  );
  current = finish ? apply(current, finish.action) : current;

  let pump = 30;
  while (pump-- > 0) {
    const activeId = current.combat?.activeUnitId;
    const active = activeId ? current.combat!.units[activeId] : undefined;
    if (active?.controllerId === "p1") break;
    // The guards' own activation follow-ups (an [activation] ability pick, a
    // reaction pause) sit between deployment and the player's first turn; answer
    // them so every fixture reaches the same "your unit holds the floor" state.
    const seat = current.pendingChoice?.playerId ?? current.reactionWindow?.priorityPlayerId ?? "p1";
    const step = getLegalActions(current, seat).find(
      (entry) =>
        entry.action.type === "CONTINUE_NEUTRAL_STEP" ||
        entry.action.type === "PASS_REACTION" ||
        entry.action.type === "CHOOSE_OPTION" ||
        entry.action.type === "CHOOSE_ABILITY_TARGET"
    );
    if (!step) break;
    current = apply(current, step.action);
  }
  return current;
}

/** Stocks the Book with `spellId` and exactly one Cast-a-Spell enabler. */
function stockBook(state: GameState, spellId: string, extraHand: string[] = []): GameState {
  state.players.p1.hand = [CAST_A_SPELL_CARD_ID, ...extraHand];
  state.players.p1.discard = [];
  state.players.p1.spellBook = [spellId];
  state.players.p1.spellBookUsed = [];
  return state;
}

function bookCastOffers(state: GameState, spellId: string): LegalAction[] {
  return getLegalActions(state, "p1").filter(
    (entry) => entry.action.type === "CAST_SPELL" && entry.action.cardId === spellId
  );
}

function targetOf(legal: LegalAction): string {
  const action = legal.action;
  if (action.type !== "CAST_SPELL" || action.target.type !== "unit") {
    throw new Error("expected a unit-targeted cast offer");
  }
  return action.target.unitId;
}

/** Answers the destination pick the Teleport cast opens; returns the chosen cell. */
function resolveTeleportDestination(state: GameState): { state: GameState; destination: number } {
  const choice = state.pendingChoice;
  expect(
    choice && choice.type === "OPTION_CHOICE" && choice.context === "combat-teleport",
    "the Teleport cast should open its destination pick"
  ).toBe(true);
  const positions =
    choice && choice.type === "OPTION_CHOICE" && choice.teleport ? choice.teleport.positions : [];
  expect(positions.length).toBeGreaterThan(0);
  const optionIndex = positions.length - 1;
  const destination = positions[optionIndex]!;
  return {
    state: passAll(
      apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex })
    ),
    destination
  };
}

describe("Polish Spell Book — Teleport in a Creature Bank fight (reported bug)", () => {
  it("REPRO ATTEMPT: a Medusa Stores bank cast MOVES the unit and leaves the Book USED", () => {
    const state = stockBook(readyToCast(bankCombat("book-teleport-medusa", "medusa_stores")), "spell.teleport");
    expect(state.combat!.context.kind).toBe("neutral");
    expect(state.adventure!.fields["bank-field"]!.bankId).toBe("medusa_stores");

    const offers = bookCastOffers(state, "spell.teleport");
    expect(offers.length, "Teleport should be castable from the Book in a bank fight").toBeGreaterThan(0);
    expect(offers[0]!.action).toMatchObject({
      fromSpellBook: true,
      castEnablerCardId: CAST_A_SPELL_CARD_ID
    });

    const unitId = targetOf(offers[0]!);
    const before = state.combat!.units[unitId]!.position;
    const cast = resolveTeleportDestination(passAll(apply(state, offers[0]!.action)));

    // The OBSERVABLE effect: the unit really stands on the chosen cell.
    expect(cast.state.combat!.units[unitId]!.position).toBe(cast.destination);
    expect(cast.state.combat!.units[unitId]!.position).not.toBe(before);

    // ...and the Book Spell is spent, not refreshed. This is the reported claim.
    expect(cast.state.players.p1.spellBook).not.toContain("spell.teleport");
    expect(cast.state.players.p1.spellBookUsed).toEqual(["spell.teleport"]);
    // The enabler was paid atomically with it.
    expect(cast.state.players.p1.hand).not.toContain(CAST_A_SPELL_CARD_ID);
    expect(cast.state.players.p1.discard).toContain(CAST_A_SPELL_CARD_ID);
  });

  it("the spent Teleport cannot be cast again in that fight — even once the round's spell limit resets", () => {
    const state = stockBook(readyToCast(bankCombat("book-teleport-again", "medusa_stores")), "spell.teleport");
    const offers = bookCastOffers(state, "spell.teleport");
    const first = offers[0]!;
    const cast = resolveTeleportDestination(passAll(apply(state, first.action))).state;

    expect(bookCastOffers(cast, "spell.teleport")).toHaveLength(0);

    // A new combat round clears the per-round spell limit; the USED Book Spell
    // must stay unavailable (only a real refresh brings it back).
    const nextRound = structuredClone(cast);
    nextRound.players.p1.combatStats.spellsCastThisRound = 0;
    nextRound.players.p1.combatStats.anySpellCastThisRound = false;
    nextRound.players.p1.hand = [CAST_A_SPELL_CARD_ID];
    expect(bookCastOffers(nextRound, "spell.teleport")).toHaveLength(0);

    // ...and a forged cast is refused without touching the Book.
    const forged = applyAction(nextRound, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: "spell.teleport",
      target: { type: "unit", unitId: targetOf(first) },
      fromSpellBook: true,
      castEnablerCardId: CAST_A_SPELL_CARD_ID
    });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.players.p1.spellBook).not.toContain("spell.teleport");
    expect(forged.state.players.p1.spellBookUsed).toEqual(["spell.teleport"]);
  });

  it("CONTROL: the same cast in a NON-bank guard fight behaves identically", () => {
    const state = stockBook(readyToCast(guardCombat("book-teleport-guard")), "spell.teleport");
    expect(state.adventure!.fields["guard-field"]!.bankId).toBeUndefined();

    const offers = bookCastOffers(state, "spell.teleport");
    expect(offers.length).toBeGreaterThan(0);
    const unitId = targetOf(offers[0]!);
    const before = state.combat!.units[unitId]!.position;
    const cast = resolveTeleportDestination(passAll(apply(state, offers[0]!.action)));

    expect(cast.state.combat!.units[unitId]!.position).toBe(cast.destination);
    expect(cast.state.combat!.units[unitId]!.position).not.toBe(before);
    expect(cast.state.players.p1.spellBook).not.toContain("spell.teleport");
    expect(cast.state.players.p1.spellBookUsed).toEqual(["spell.teleport"]);
    expect(bookCastOffers(cast.state, "spell.teleport")).toHaveLength(0);
  });

  it("all-Stacked Polish bank defenders change nothing about the Book lifecycle", () => {
    const state = stockBook(
      readyToCast(bankCombat("book-teleport-stacked", "medusa_stores", 4)),
      "spell.teleport"
    );
    const stacked = Object.values(state.combat!.units).filter(
      (unit) => unit.controllerId !== "p1" && unit.stackToken
    );
    expect(stacked.length, "size-IV rolls a Stack Token onto every defender").toBeGreaterThan(0);

    const offers = bookCastOffers(state, "spell.teleport");
    expect(offers.length).toBeGreaterThan(0);
    const cast = resolveTeleportDestination(passAll(apply(state, offers[0]!.action))).state;
    expect(cast.players.p1.spellBook).not.toContain("spell.teleport");
    expect(cast.players.p1.spellBookUsed).toEqual(["spell.teleport"]);
  });

  it("a HOSTED (redacted) client offers exactly the cast the server then consumes", () => {
    const state = stockBook(readyToCast(bankCombat("book-teleport-hosted", "medusa_stores")), "spell.teleport");

    // What the browser actually holds on a hosted table: own Book real, opponent
    // zones masked. The offers it derives must be the offers the server accepts.
    const redacted = redactStateForSeat(state, "p1");
    expect(redacted.players.p1.spellBook).toEqual(["spell.teleport"]);
    const clientOffers = getLegalActions(redacted, "p1").filter(
      (entry) => entry.action.type === "CAST_SPELL" && entry.action.cardId === "spell.teleport"
    );
    expect(clientOffers.length).toBe(bookCastOffers(state, "spell.teleport").length);
    expect(clientOffers.length).toBeGreaterThan(0);

    const cast = resolveTeleportDestination(passAll(apply(state, clientOffers[0]!.action))).state;
    expect(cast.players.p1.spellBook).not.toContain("spell.teleport");
    expect(cast.players.p1.spellBookUsed).toEqual(["spell.teleport"]);
  });

  it("CONTROL: Mysticism is the ONLY thing that puts the cast Teleport back on the refreshed side", () => {
    const state = stockBook(
      readyToCast(bankCombat("book-teleport-mysticism", "medusa_stores")),
      "spell.teleport",
      ["ability.mysticism"]
    );
    const offers = bookCastOffers(state, "spell.teleport");
    expect(offers.length).toBeGreaterThan(0);

    // Without playing it: the Spell stays used (the in-test control).
    const plain = resolveTeleportDestination(passAll(apply(state, offers[0]!.action))).state;
    expect(plain.players.p1.spellBook).not.toContain("spell.teleport");

    // Playing the recall into the open cast window DOES refresh it — the printed
    // "take the Spell card back instead of discarding it". A refresh must always
    // be an explicit play like this one, never a silent side effect.
    const opened = apply(state, offers[0]!.action);
    const recall = getLegalActions(opened, "p1").find(
      (entry) => entry.action.type === "PLAY_REACTION" && entry.action.cardId === "ability.mysticism"
    );
    expect(recall, "Mysticism should be offered on the caster's own cast window").toBeTruthy();
    const recalled = resolveTeleportDestination(passAll(apply(opened, recall!.action))).state;
    expect(recalled.players.p1.spellBook).toContain("spell.teleport");
    expect(recalled.players.p1.spellBookUsed ?? []).not.toContain("spell.teleport");
  });

  it("a fizzled cast (target above the reachable grade) still SPENDS the Book Spell", () => {
    // Teleport reaches bronze at Power 0 (`gradeByPower`). A silver target is a
    // legal OFFER (Power can still be added after the cast is declared), so at
    // Power 0 the relocation does not happen — and the Spell is spent anyway.
    // Documented reading, shared with Berserk / Blind / Anti-Magic; only Clone
    // refunds. Pinned so a future "refund" would be a conscious change.
    const state = stockBook(readyToCast(bankCombat("book-teleport-grade", "medusa_stores")), "spell.teleport");
    const offers = bookCastOffers(state, "spell.teleport");
    const unitId = targetOf(offers[0]!);
    const bronzeBefore = state.combat!.units[unitId]!.position;
    expect(state.combat!.units[unitId]!.grade).toBe("bronze");

    // In-test CONTROL: at bronze the same cast really relocates the unit.
    const moved = resolveTeleportDestination(passAll(apply(state, offers[0]!.action)));
    expect(moved.state.combat!.units[unitId]!.position).not.toBe(bronzeBefore);

    const silver = structuredClone(state);
    silver.combat!.units[unitId]!.grade = "silver";
    const silverOffers = bookCastOffers(silver, "spell.teleport").filter(
      (entry) => targetOf(entry) === unitId
    );
    expect(silverOffers.length, "a silver unit is still an offered target").toBe(1);
    const fizzled = passAll(apply(silver, silverOffers[0]!.action));
    expect(fizzled.pendingChoice, "no destination pick opens above the reachable grade").toBeNull();
    expect(fizzled.combat!.units[unitId]!.position).toBe(bronzeBefore);
    expect(fizzled.players.p1.spellBook).not.toContain("spell.teleport");
    expect(fizzled.players.p1.spellBookUsed).toEqual(["spell.teleport"]);
  });

  it("CLASS: every implemented Book Spell castable in a bank fight leaves the refreshed side", () => {
    const combatSpells = Object.values(cardLibrary)
      .filter(
        (card) =>
          card.kind === "spell" &&
          card.implementationStatus === "implemented" &&
          card.id !== CAST_A_SPELL_CARD_ID &&
          (card.phaseLimit?.includes("combat") ?? card.timing === "combat")
      )
      .map((card) => card.id);
    expect(combatSpells.length).toBeGreaterThan(30);

    const base = readyToCast(bankCombat("book-class-sweep", "medusa_stores"));
    let exercised = 0;
    for (const spellId of combatSpells) {
      const state = stockBook(structuredClone(base), spellId);
      const offers = bookCastOffers(state, spellId);
      if (offers.length === 0) {
        continue;
      }
      let resolved = passAll(apply(state, offers[0]!.action));
      let safety = 6;
      while (resolved.pendingChoice && safety-- > 0) {
        const answer = getLegalActions(resolved, resolved.pendingChoice.playerId).find(
          (entry) => entry.action.type === "CHOOSE_OPTION"
        );
        if (!answer) break;
        resolved = passAll(apply(resolved, answer.action));
      }
      exercised += 1;
      const book = resolved.players.p1.spellBook;
      const used = resolved.players.p1.spellBookUsed ?? [];
      // Clone is the ONE documented refund: too little Power for the target's
      // grade returns the cast rather than wasting it.
      if (spellId === "spell.clone") {
        continue;
      }
      expect(book, `${spellId} must leave the refreshed side`).not.toContain(spellId);
      const held = resolved.players.p1.ongoingCards?.some(
        (entry) => entry.cardId === spellId,
      ) ?? false;
      if (held) {
        expect(used, `${spellId} must not become used before its effect expires`).not.toContain(spellId);
        expireEffectsForCombatEnd(resolved);
        releaseEndedOngoingCards(resolved);
        expect(resolved.players.p1.ongoingCards?.some((entry) => entry.cardId === spellId) ?? false).toBe(false);
        expect(resolved.players.p1.spellBookUsed, `${spellId} becomes used after expiry`).toContain(spellId);
      } else {
        expect(used, `${spellId} must land on the used side`).toContain(spellId);
      }
    }
    expect(exercised, "the sweep must really exercise a batch of casts").toBeGreaterThan(10);
  });
});

/**
 * FOUND WHILE PROBING THE REPORT ABOVE — a real, reachable bug in the ONE
 * legitimate refund path, and the mirror image of what was reported: a Clone
 * cast that is REFUNDED (too little Power for the target's grade) was silently
 * EATEN whenever that Spell had already been refreshed once this game round,
 * while its own printed notice told the player the spell had come back.
 *
 * Cause: the refund reused `refreshPolishUsedSpell`, which answers to the two
 * MID-ROUND gates ("in effect" / once per round). A refund is not a refresh —
 * it undoes a cast that never happened (the Power cards, the spell counters and
 * the "Cast a Spell" enabler are all rolled back with it), so it must bypass
 * those gates and must not spend the round's refresh budget either.
 */
describe("Polish Spell Book — a refunded cast is an UNDO, not a mid-round refresh", () => {
  /** A bank fight whose own unit is silver, so a Power-0 Clone must refund. */
  function cloneRefundFixture(seed: string): { state: GameState; unitId: string } {
    const state = stockBook(readyToCast(bankCombat(seed, "medusa_stores")), "spell.clone");
    const own = Object.values(state.combat!.units).find(
      (unit) => unit.controllerId === "p1" && unit.grade === "bronze"
    )!;
    // Clone needs Power 3 for a silver unit; the cast is declared at Power 0.
    own.grade = "silver";
    return { state, unitId: own.id };
  }

  function castClone(state: GameState, unitId: string): GameState {
    const offer = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "CAST_SPELL" &&
        entry.action.cardId === "spell.clone" &&
        entry.action.target.type === "unit" &&
        entry.action.target.unitId === unitId
    );
    expect(offer, "Clone should be offered on a friendly unit with an empty neighbour").toBeTruthy();
    return passAll(apply(state, offer!.action));
  }

  it("REPRO: a Clone already refreshed this round is still returned by its own refund", () => {
    const { state, unitId } = cloneRefundFixture("clone-refund-marked");
    // Exactly what an earlier Mysticism recall this round leaves behind.
    markPolishSpellRefreshedThisRound(state.players.p1, "spell.clone");

    const refunded = castClone(state, unitId);

    // The printed promise: "the spell was returned to your hand."
    const notice = refunded.eventLog.find((event) => event.type === "SPELL_CAST_REFUNDED");
    expect(notice).toBeTruthy();
    // ...so it must really be back on the refreshed side, castable again.
    expect(refunded.players.p1.spellBook).toContain("spell.clone");
    expect(refunded.players.p1.spellBookUsed ?? []).not.toContain("spell.clone");
    expect(refunded.players.p1.hand, "the enabler is rolled back too").toContain(CAST_A_SPELL_CARD_ID);
    // No Clone was placed and the cast does not count against the round.
    expect(Object.values(refunded.combat!.units).some((unit) => unit.cloneOfUnitId)).toBe(false);
    expect(refunded.players.p1.combatStats.spellsCastThisRound).toBe(0);
  });

  it("the refund does not spend the round's once-per-Spell refresh budget", () => {
    const { state, unitId } = cloneRefundFixture("clone-refund-budget");
    expect(polishBookSpellRefreshBlocked(state, "p1", "spell.clone", state.players.p1)).toBeNull();

    const refunded = castClone(state, unitId);
    expect(refunded.players.p1.spellBook).toContain("spell.clone");
    // A later legitimate mid-round refresh of the same Spell is still available.
    expect(
      polishBookSpellRefreshBlocked(refunded, "p1", "spell.clone", refunded.players.p1),
      "an undone cast must not burn the Spell's once-per-round refresh"
    ).toBeNull();
  });

  it("CONTROL: the once-per-round gate itself is untouched for a real mid-round refresh", () => {
    const state = stockBook(readyToCast(bankCombat("clone-refund-gate", "medusa_stores")), "spell.teleport");
    // A Spell already refreshed this round is still refused by the shared gate —
    // the rule the refund now bypasses is otherwise exactly as strict as before.
    state.players.p1.spellBook = [];
    state.players.p1.spellBookUsed = ["spell.teleport"];
    expect(polishBookSpellRefreshBlocked(state, "p1", "spell.teleport", state.players.p1)).toBeNull();
    markPolishSpellRefreshedThisRound(state.players.p1, "spell.teleport");
    expect(polishBookSpellRefreshBlocked(state, "p1", "spell.teleport", state.players.p1)).toBe(
      "already-refreshed"
    );
  });

  it("CONTROL: a cast that REACHES the grade is SPENT, marker or not — the bypass is refund-only", () => {
    const state = stockBook(
      readyToCast(bankCombat("clone-refund-lands", "medusa_stores")),
      "spell.clone",
      ["stat.power"]
    );
    const own = Object.values(state.combat!.units).find(
      (unit) => unit.controllerId === "p1" && unit.grade === "bronze"
    )!;
    markPolishSpellRefreshedThisRound(state.players.p1, "spell.clone");

    // Clone's printed ladder needs Power 1 for a bronze unit; pay it into the
    // open cast window so the Clone really lands and nothing is refunded.
    const offer = getLegalActions(state, "p1").find(
      (entry) =>
        entry.action.type === "CAST_SPELL" &&
        entry.action.cardId === "spell.clone" &&
        entry.action.target.type === "unit" &&
        entry.action.target.unitId === own.id
    );
    expect(offer).toBeTruthy();
    let resolved = apply(state, offer!.action);
    const boost = getLegalActions(resolved, "p1").find(
      (entry) => entry.action.type === "PLAY_REACTION" && entry.action.cardId === "stat.power"
    );
    expect(boost, "a Power statistic should be playable into the caster's own cast window").toBeTruthy();
    resolved = passAll(apply(resolved, boost!.action));

    let safety = 4;
    while (resolved.pendingChoice && safety-- > 0) {
      const answer = getLegalActions(resolved, "p1").find((entry) => entry.action.type === "CHOOSE_OPTION");
      if (!answer) break;
      resolved = passAll(apply(resolved, answer.action));
    }

    expect(resolved.eventLog.some((event) => event.type === "SPELL_CAST_REFUNDED")).toBe(false);
    expect(Object.values(resolved.combat!.units).some((unit) => unit.cloneOfUnitId)).toBe(true);
    expect(resolved.players.p1.spellBook).not.toContain("spell.clone");
    expect(resolved.players.p1.spellBookUsed).toContain("spell.clone");
  });
});
