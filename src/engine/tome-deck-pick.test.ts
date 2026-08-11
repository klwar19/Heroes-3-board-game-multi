import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getPlayerView, NEUTRAL_PLAYER_ID } from "./index";
import { chooseComputerAction } from "./computer/policy";
import { nextAfkDropAction } from "./afk-drop";
import type { CardId, GameAction, GameState, PendingChoice } from "./state";

/**
 * 2026-08-11 USER RULING, verbatim: "Tome of X-stupid, should work like 1
 * description, then allow to choose basic or expert deck after wards with 2
 * buttons."
 *
 * WHAT THE PLAYER SAW BEFORE (reproduced by probe before any change):
 * a Tome's School dig was enumerated as TWO near-identical PLAY_CARD offers, one
 * per `mode`, differing only by a parenthetical suffix —
 *
 *   "Tome of Earth: Find the first Earth Magic spell in the Spell deck (take or
 *    discard), then reshuffle (Basic Spell deck)"
 *   "…the same 96 characters… (Expert Spell deck)"
 *
 * and on a SINGLE-deck table the second offer was a pure TRAP: it read
 * "(expert)", SPENT A CROWN, and then dug the very same `spells` deck for the
 * very same card (a School dig matches by School, never by spell level — see
 * `performSpellDig`). Probed pre-fix: `crownsSpent: 1`, `deckId: "spells"`,
 * identical `cardId`.
 *
 * WHAT IT IS NOW: ONE play offer carrying the card's one description, which —
 * only where reading the Expert deck is a real, payable choice — opens the
 * `spell-deck-pick` OPTION_CHOICE: two clean buttons, "Basic Spells deck" /
 * "Expert Spells deck (1 crown)". The crown is spent at the PICK.
 *
 * SURFACE CHOICE: the generic PromptTray (title = prompt, one button per
 * option), mirroring `artifact-deck-pick` — Tazar's War Hero VI, the repo's
 * existing "one play, then pick WHICH shared deck" precedent. Deliberately NOT
 * `DeckSearchModeModal`: that full-screen modal belongs to the SEARCH family
 * (reveal N, keep one, or take the discard top), and a dig is not a Search.
 *
 * Every case below asserts an observable outcome (which deck was dug, which card
 * reached the hand, how many crowns were spent) and carries a CONTROL.
 */

const TOME_EARTH = "artifact.tome_of_earth" as CardId;
const BASIC_SPELL = "spell.stone_skin" as CardId;
const EXPERT_SPELL = "spell.implosion" as CardId;

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "the action should have been rejected").toBeGreaterThan(0);
  return result.errors[0]!.message;
}

/**
 * A map turn with the Tome in hand. `crowns` seats the Expert-use budget (a
 * level-1 hero has 0, which is why most of the older Tome cases never met the
 * pick), `split` the BINH split Spell decks, `expertDeck` the Expert deck's
 * contents.
 */
function tomeTurn(
  seed: string,
  {
    split = true,
    crowns = 1,
    expertDeck = [EXPERT_SPELL] as CardId[],
    empowered = false
  }: { split?: boolean; crowns?: number; expertDeck?: CardId[]; empowered?: boolean } = {}
): GameState {
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: { "split-decks": split }
  });
  state =
    state.players.p1.needsHandRefresh || state.players.p1.canMulligan
      ? applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : state;
  state.activePlayerId = "p1";
  state.players.p1.hand = [TOME_EARTH];
  state.players.p1.limits.expertUses = crowns;
  if (empowered) {
    state.players.p1.empoweredAbilities = [...(state.players.p1.empoweredAbilities ?? []), TOME_EARTH];
  }
  state.decks.spells.drawPile = [BASIC_SPELL];
  state.decks.spells.discardPile = [];
  const expert = state.decks["spells-expert"];
  if (expert) {
    expert.drawPile = [...expertDeck];
    expert.discardPile = [];
  }
  return state;
}

/** Every PLAY_CARD offer for the Tome's dig side (option 0), any mode. */
function digPlays(state: GameState) {
  return getLegalActions(state, "p1").filter(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === TOME_EARTH &&
      legal.action.optionIndex === 0
  );
}

function deckPickOf(state: GameState): Extract<PendingChoice, { type: "OPTION_CHOICE" }> | null {
  const choice = state.pendingChoice;
  return choice?.type === "OPTION_CHOICE" && choice.context === "spell-deck-pick" ? choice : null;
}

/** Answer the open choice through the engine's OWN offer (which carries choiceId). */
function chooseAction(state: GameState, optionIndex: number): GameAction {
  const offer = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex === optionIndex
  );
  expect(offer, `option ${optionIndex} should be offered`).toBeTruthy();
  return offer!.action;
}

function choose(state: GameState, optionIndex: number): GameState {
  return applyOk(state, chooseAction(state, optionIndex));
}

const crownsSpent = (state: GameState): number => state.players.p1.combatStats.expertUsesSpentThisRound;

// ===========================================================================
// The reported shape: ONE description, THEN two buttons
// ===========================================================================

describe("Tome dig — one play offer, then a two-button deck pick", () => {
  it("REPRO: the split-deck table offers ONE dig play, not two look-alikes", () => {
    const state = tomeTurn("tome-pick-one-offer");
    const plays = digPlays(state);

    // Pre-fix this was 2 (basic + expert), differing only by a parenthetical.
    expect(plays.length, "exactly one dig button, carrying the card's one description").toBe(1);
    expect((plays[0]!.action as { mode?: string }).mode ?? "basic").toBe("basic");
    expect(plays[0]!.label).not.toContain("Basic Spell deck");
    expect(plays[0]!.label).not.toContain("Expert Spell deck");
    expect(plays[0]!.label).not.toContain("(expert)");
  });

  it("that one play opens the two-button Basic/Expert deck pick", () => {
    const played = applyOk(tomeTurn("tome-pick-opens"), digPlays(tomeTurn("tome-pick-opens"))[0]!.action);
    const pick = deckPickOf(played);
    expect(pick, "the pick really opened").toBeTruthy();
    expect(pick!.playerId).toBe("p1");
    expect(pick!.prompt).toContain("which Spell deck");
    expect(pick!.options.map((option) => option.label)).toEqual([
      "Basic Spells deck",
      "Expert Spells deck (1 crown)"
    ]);
    // The engine's options stay labelled and INDEX-ALIGNED with the deck ids,
    // for the AFK driver / AI scorer / screen readers (the repo convention).
    expect(pick!.spellDeckPick).toMatchObject({
      deckIds: ["spells", "spells-expert"],
      crownDeckIds: ["spells-expert"],
      school: "earth",
      cardId: TOME_EARTH
    });
    // No dig has happened yet — the decks are untouched until a button is hit.
    expect(played.decks.spells.drawPile).toEqual([BASIC_SPELL]);
    expect(played.decks["spells-expert"]!.drawPile).toEqual([EXPERT_SPELL]);
    expect(crownsSpent(played)).toBe(0);
  });

  it("button 1 (Basic) digs the BASIC deck for free and the find reaches the hand", () => {
    const state = tomeTurn("tome-pick-basic");
    const picked = choose(applyOk(state, digPlays(state)[0]!.action), 0);

    const dug = picked.pendingChoice;
    expect(dug?.type === "OPTION_CHOICE" ? dug.context : null, "the take-or-discard choice follows").toBe("eagle-eye");
    expect(dug?.type === "OPTION_CHOICE" ? dug.eagleEye : null).toMatchObject({
      deckId: "spells",
      cardId: BASIC_SPELL
    });
    expect(crownsSpent(picked), "the Basic deck costs no crown").toBe(0);

    // Observable outcome, not an intermediate: the spell really lands in hand.
    const taken = choose(picked, 0);
    expect(taken.players.p1.hand).toContain(BASIC_SPELL);
    expect(taken.pendingChoice).toBeNull();
  });

  it("button 2 (Expert) spends exactly one crown and digs the EXPERT deck", () => {
    const state = tomeTurn("tome-pick-expert");
    const picked = choose(applyOk(state, digPlays(state)[0]!.action), 1);

    const dug = picked.pendingChoice;
    expect(dug?.type === "OPTION_CHOICE" ? dug.eagleEye : null).toMatchObject({
      deckId: "spells-expert",
      cardId: EXPERT_SPELL
    });
    expect(crownsSpent(picked), "the Expert deck costs exactly one Expert use").toBe(1);

    const taken = choose(picked, 0);
    expect(taken.players.p1.hand).toContain(EXPERT_SPELL);
    expect(taken.players.p1.hand).not.toContain(BASIC_SPELL);
  });

  it("an EMPOWERED Tome takes the Expert deck crown-free, and says so", () => {
    const state = tomeTurn("tome-pick-empowered", { crowns: 0, empowered: true });
    const pick = deckPickOf(applyOk(state, digPlays(state)[0]!.action));
    expect(pick, "an Empower is a payment, so the choice still opens at 0 crowns").toBeTruthy();
    expect(pick!.options[1]!.label, "…and the label must not promise a crown cost").toBe("Expert Spells deck");
    expect(pick!.spellDeckPick!.crownDeckIds).toEqual([]);

    const picked = choose(applyOk(state, digPlays(state)[0]!.action), 1);
    expect(crownsSpent(picked), "no crown spent").toBe(0);
    expect(picked.pendingChoice?.type === "OPTION_CHOICE" ? picked.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells-expert"
    });
  });
});

// ===========================================================================
// When the pick must NOT open — the dig goes straight through, as before
// ===========================================================================

describe("CONTROLs: no pick where the Expert deck is not a real choice", () => {
  it("CONTROL: no crown ⇒ no pick, the dig goes straight to the Basic deck", () => {
    const state = tomeTurn("tome-pick-no-crown", { crowns: 0 });
    const plays = digPlays(state);
    expect(plays.length, "still exactly one play").toBe(1);

    const played = applyOk(state, plays[0]!.action);
    expect(deckPickOf(played), "no deck pick — the Expert deck is unpayable").toBeNull();
    expect(played.pendingChoice?.type === "OPTION_CHOICE" ? played.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells",
      cardId: BASIC_SPELL
    });
  });

  it("CONTROL: a LEGACY single-deck table digs straight through — and has no crown trap", () => {
    const state = tomeTurn("tome-pick-legacy", { split: false });
    expect(state.decks["spells-expert"], "the legacy table really has one Spell deck").toBeUndefined();

    const plays = digPlays(state);
    // Pre-fix a second "(expert)" play existed here that spent a crown to dig
    // the SAME deck for the SAME card — a pure trap button.
    expect(plays.length, "one play, byte-identical to the classic flow").toBe(1);
    expect(plays[0]!.label).not.toContain("(expert)");

    const played = applyOk(state, plays[0]!.action);
    expect(deckPickOf(played), "one deck ⇒ nothing to pick").toBeNull();
    expect(played.pendingChoice?.type === "OPTION_CHOICE" ? played.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells",
      cardId: BASIC_SPELL
    });
    expect(crownsSpent(played), "and no crown is burned").toBe(0);
  });

  it("CONTROL: a split-deck PILE with the rule OFF is still one deck to the dig", () => {
    // The tournament combat SANDBOX shape (CLAUDE.md): its rules layer reads
    // LEGACY defaults while the fixture may still carry a `spells-expert` pile.
    // The rule, not the pile's existence, is what makes the Expert deck real —
    // otherwise the pick would offer a deck no other search on that table reads.
    const state = tomeTurn("tome-pick-rule-off-pile-on");
    state.adventure!.houseRules = { ...state.adventure!.houseRules, "split-decks": false };
    expect(state.decks["spells-expert"], "the pile is still there").toBeTruthy();

    const played = applyOk(state, digPlays(state)[0]!.action);
    expect(deckPickOf(played)).toBeNull();
    expect(played.pendingChoice?.type === "OPTION_CHOICE" ? played.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells",
      cardId: BASIC_SPELL
    });
  });

  it("CONTROL: an EMPTY Expert deck ⇒ no pick (a crown could only buy nothing)", () => {
    const state = tomeTurn("tome-pick-empty-expert", { expertDeck: [] });
    const played = applyOk(state, digPlays(state)[0]!.action);
    expect(deckPickOf(played)).toBeNull();
    expect(played.pendingChoice?.type === "OPTION_CHOICE" ? played.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells"
    });
  });

  it("CONTROL: Eagle Eye — the LEVEL dig — keeps BOTH of its real plays", () => {
    // The scope guard. Eagle Eye's two sides find DIFFERENT cards (a Basic vs an
    // Expert spell), so its choice is genuine and untouched by this change.
    const state = tomeTurn("tome-pick-eagle-eye-scope");
    state.players.p1.hand = ["ability.eagle_eye" as CardId];
    const modes = getLegalActions(state, "p1")
      .filter((legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.eagle_eye")
      .map((legal) => (legal.action as { mode?: string }).mode ?? "basic")
      .sort();
    expect(modes).toEqual(["basic", "expert"]);
  });
});

// ===========================================================================
// The same ONE resolution in combat and inside an open reaction window
// ===========================================================================

/** A real adventure neutral fight with the Tome in hand and split Spell decks. */
function tomeFight(seed: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  state = applyOk(state, {
    type: "PLACE_COMBAT_UNIT",
    playerId: "p1",
    armyUnitId: state.players.p1.army[0]!.id,
    position: 13
  });
  for (const unit of Object.values(state.combat!.units)) {
    if (unit.controllerId !== NEUTRAL_PLAYER_ID) {
      unit.initiative = 99;
    }
  }
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  state.players.p1.hand = [TOME_EARTH];
  state.players.p1.limits.expertUses = 1;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  state.decks.spells.drawPile = [BASIC_SPELL];
  state.decks.spells.discardPile = [];
  state.decks["spells-expert"]!.drawPile = [EXPERT_SPELL];
  state.decks["spells-expert"]!.discardPile = [];
  return state;
}

describe("the pick works mid-combat and inside an open reaction window", () => {
  it("mid-combat: one play, the pick, then the Expert deck really pays a crown", () => {
    const state = tomeFight("tome-pick-combat");
    expect(state.combat, "a real adventure combat is open").toBeTruthy();
    const plays = digPlays(state);
    expect(plays.length, "one dig play mid-combat too").toBe(1);

    const opened = applyOk(state, plays[0]!.action);
    const pick = deckPickOf(opened);
    expect(pick, "the pick opens in combat").toBeTruthy();
    expect(pick!.returnPhase, "and returns to the fight, not the map").toBe("combat");

    const picked = choose(opened, 1);
    expect(crownsSpent(picked)).toBe(1);
    expect(picked.pendingChoice?.type === "OPTION_CHOICE" ? picked.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells-expert",
      cardId: EXPERT_SPELL
    });
    expect(choose(picked, 0).players.p1.hand).toContain(EXPERT_SPELL);
  });

  it("as a reaction-window join it PARKS the window, then resumes", () => {
    const state = tomeFight("tome-pick-window");
    // Stand the guard next to my unit so a plain ATTACK_UNIT is on the table.
    const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    guard.position = 12;
    const attack = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "ATTACK_UNIT" || legal.action.type === "MOVE_AND_ATTACK_UNIT"
    );
    expect(attack, "p1 can declare an attack on the guard").toBeTruthy();
    const declared = applyOk(state, attack!.action);
    expect(declared.reactionWindow, "the attack window opened").toBeTruthy();

    const join = getLegalActions(declared, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === TOME_EARTH
    );
    expect(join, "the Tome's dig joins the open window").toBeTruthy();

    const joined = applyOk(declared, join!.action);
    expect(deckPickOf(joined), "the SAME pick the own-turn play opens").toBeTruthy();
    expect(joined.reactionWindow, "…and the window is parked, not closed").toBeTruthy();

    const picked = choose(joined, 0);
    expect(picked.pendingChoice?.type === "OPTION_CHOICE" ? picked.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells",
      cardId: BASIC_SPELL
    });
    const taken = choose(picked, 0);
    expect(taken.players.p1.hand).toContain(BASIC_SPELL);
    // The parked exchange is not stranded: someone can always act.
    const anyoneCanAct = ["p1", "p2", NEUTRAL_PLAYER_ID].some(
      (seat) => getLegalActions(taken, seat as "p1").length > 0
    );
    expect(anyoneCanAct, "no frozen table").toBe(true);
  });

  it("CONTROL: a crownless fighter mid-combat digs straight, with no pick", () => {
    const state = tomeFight("tome-pick-combat-no-crown");
    state.players.p1.limits.expertUses = 0;
    const played = applyOk(state, digPlays(state)[0]!.action);
    expect(deckPickOf(played)).toBeNull();
    expect(played.pendingChoice?.type === "OPTION_CHOICE" ? played.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells",
      cardId: BASIC_SPELL
    });
  });
});

// ===========================================================================
// Forgery / staleness backstops
// ===========================================================================

describe("the pick re-validates at resolution", () => {
  it("a stale client cannot dig the Expert deck after the crown is gone", () => {
    const state = tomeTurn("tome-pick-forged-crown");
    const played = applyOk(state, digPlays(state)[0]!.action);
    expect(deckPickOf(played)).toBeTruthy();
    const expertAnswer = chooseAction(played, 1);
    // The crown budget moved between the offer and the answer.
    played.players.p1.combatStats.expertUsesSpentThisRound = 1;
    expect(expectRejected(played, expertAnswer)).toContain("crown");
    expect(crownsSpent(played), "and nothing was spent by the refusal").toBe(1);
    // …and the Basic button still works, so the card is never stranded.
    expect(choose(played, 0).pendingChoice?.type === "OPTION_CHOICE").toBe(true);
  });

  it("an answer to an ALREADY-RESOLVED pick never lands on the next one", () => {
    // Two Tomes, two picks: the first pick's stale action must never resolve the
    // SECOND one (which would spend a crown and dig the Expert deck for a card
    // its owner never chose). HONESTY: CHOOSE_OPTION is offer-validated, so today
    // the stale choiceId is already refused one layer up; the resolver's own
    // id/owner gate (the same one resolveGenieTakeSpell carries) is a backstop.
    // This case pins the BEHAVIOUR, whichever layer enforces it.
    const state = tomeTurn("tome-pick-stale-id", { crowns: 2 });
    state.players.p1.hand = [TOME_EARTH, "artifact.tome_of_fire" as CardId];

    const firstPick = applyOk(state, digPlays(state)[0]!.action);
    const staleAnswer = chooseAction(firstPick, 1) as Extract<GameAction, { type: "CHOOSE_OPTION" }>;
    const afterFirst = choose(choose(firstPick, 0), 0);
    expect(deckPickOf(afterFirst), "the first pick is done").toBeNull();

    const secondPlay = getLegalActions(afterFirst, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "artifact.tome_of_fire" &&
        legal.action.optionIndex === 0
    );
    expect(secondPlay, "the second Tome is still playable").toBeTruthy();
    const secondPick = applyOk(afterFirst, secondPlay!.action);
    expect(deckPickOf(secondPick), "a second, DIFFERENT pick is open").toBeTruthy();
    expect(deckPickOf(secondPick)!.id).not.toBe(staleAnswer.choiceId);

    expect(expectRejected(secondPick, staleAnswer)).toBeTruthy();
    expect(deckPickOf(secondPick), "the live pick survives the stale answer").toBeTruthy();
    expect(crownsSpent(secondPick), "and no crown leaked").toBe(0);
  });

  it("an out-of-range index and the wrong seat are both rejected", () => {
    const state = tomeTurn("tome-pick-forged-index");
    const played = applyOk(state, digPlays(state)[0]!.action);
    const answer = chooseAction(played, 0) as Extract<GameAction, { type: "CHOOSE_OPTION" }>;
    expect(expectRejected(played, { ...answer, optionIndex: 7 })).toBeTruthy();
    expect(expectRejected(played, { ...answer, playerId: "p2" })).toBeTruthy();
    expect(deckPickOf(played), "the pick survives both refusals").toBeTruthy();
  });
});

// ===========================================================================
// Automated seats can always answer it
// ===========================================================================

describe("the deck pick never strands an automated seat", () => {
  it("a computer seat answers it — and never burns a crown on it", () => {
    const state = tomeTurn("tome-pick-ai");
    state.controllers = { p1: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    const played = applyOk(state, digPlays(state)[0]!.action);
    expect(deckPickOf(played)).toBeTruthy();

    const decision = chooseComputerAction({
      playerId: "p1",
      state: getPlayerView(played, "p1"),
      legalActions: getLegalActions(played, "p1")
    });
    expect(decision, "the AI always has an answer").toBeTruthy();
    expect(decision!.action).toMatchObject({ type: "CHOOSE_OPTION", optionIndex: 0 });

    const answered = applyOk(played, decision!.action);
    expect(crownsSpent(answered), "documented limit: the AI never pays a crown here").toBe(0);
    expect(deckPickOf(answered), "and the pick is gone — no stall").toBeNull();
  });

  it("a computer seat DOES take the Expert deck when an Empower makes it free", () => {
    // The deliberate half of the policy (and what makes it more than the generic
    // option-order tail, which would always take the first button): with no
    // crown to pay, the Expert pool is strictly the better dig.
    const state = tomeTurn("tome-pick-ai-empowered", { crowns: 0, empowered: true });
    state.controllers = { p1: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    const played = applyOk(state, digPlays(state)[0]!.action);
    expect(deckPickOf(played)!.spellDeckPick!.crownDeckIds, "nothing to pay").toEqual([]);

    const decision = chooseComputerAction({
      playerId: "p1",
      state: getPlayerView(played, "p1"),
      legalActions: getLegalActions(played, "p1")
    });
    expect(decision!.action).toMatchObject({ type: "CHOOSE_OPTION", optionIndex: 1 });

    const answered = applyOk(played, decision!.action);
    expect(crownsSpent(answered), "still free").toBe(0);
    expect(answered.pendingChoice?.type === "OPTION_CHOICE" ? answered.pendingChoice.eagleEye : null).toMatchObject({
      deckId: "spells-expert"
    });
  });

  it("the AFK / turn-timeout driver answers it with the crown-free deck", () => {
    const state = tomeTurn("tome-pick-afk");
    const played = applyOk(state, digPlays(state)[0]!.action);
    expect(nextAfkDropAction(played, "p1")).toMatchObject({
      type: "CHOOSE_OPTION",
      playerId: "p1",
      optionIndex: 0
    });
  });
});
