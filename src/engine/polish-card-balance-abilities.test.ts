/**
 * Polish Balance Pack (`polish-card-balance`) — the remaining NINE Ability
 * reprints (Intelligence, Wisdom, Eagle Eye, Tactics, Pathfinding, Learning,
 * Diplomacy, Ballistics, First Aid). Scouting / Artillery / Mysticism live in
 * `polish-card-balance.test.ts`.
 *
 * Every claim is an OBSERVABLE outcome — a unit really moved, a Search really
 * revealed N, a crown really was (not) spent, a Wall really fell — paired with a
 * rule-OFF CONTROL on the SAME setup, so a passing case proves the reprint is
 * what moved the number (CLAUDE.md #1a).
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero,
  markUnitRemovedIfNeeded
} from "./index";
import {
  openSharedDeckSearch,
  pumpAdventureQueues,
  startNeutralEncounter,
  tacticsMoveDestinations
} from "./adventure-reducer";
import { spellLimitFor } from "./ruleset";
import { activeSpellPowerBonus, playerHasSpellTimingFreedom } from "./active-effects";
import { CAST_A_SPELL_CARD_ID } from "./polish-spell-book";
import { gainExperience, getHeroMovementCapabilities } from "./adventure";
import { playerCanUseFirstAidVolley, putPermanentIntoPlay, startWarMachineRound } from "./permanents";
import { applyUnitCurrentSide } from "./unit-transforms";
import { getRuleset, unitSideRuleOverrides } from "./ruleset";
import type { CardId, GameAction, GameState, MapFieldState, PlayerId } from "./state";

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

/**
 * An adventure whose p1 turn is genuinely OPEN for card plays: the mandatory
 * start-of-turn draw is taken first (legal-actions withholds every card offer
 * while it is owed).
 */
function openTurn(seed: string, balance: boolean, extraRules: Record<string, boolean> = {}): GameState {
  let state = adventure(seed, balance, extraRules);
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    state.activePlayerId = "p1";
  }
  return state;
}

/**
 * A sandbox combat with `hand` in p1's hand and `crowns` expert uses. A sandbox
 * has no adventure, and `houseRuleEnabled` reads `state.adventure?.houseRules` —
 * so the rule is stamped through a minimal stub, exactly as
 * `ballistics-ability.test.ts` toggles its own rule.
 */
function sandbox(seed: string, balance: boolean, hand: string[], crowns = 0): GameState {
  const state = createInitialGameState(seed);
  state.adventure = {
    houseRules: { "polish-card-balance": balance }
  } as unknown as GameState["adventure"];
  state.players.p1.hand = hand as CardId[];
  state.players.p2.hand = [];
  state.players.p1.limits.expertUses = crowns;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  return state;
}

function playsOf(state: GameState, playerId: PlayerId, cardId: string) {
  return getLegalActions(state, playerId).filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
  );
}

function crownsSpent(state: GameState, playerId: PlayerId = "p1"): number {
  return state.players[playerId].combatStats.expertUsesSpentThisRound;
}

// ===========================================================================
// Intelligence — the free cast is scoped to the START of the Combat
// ===========================================================================

describe("Balance Pack — Intelligence is a START-of-combat cast", () => {
  /** A sandbox combat where p1 already holds the Intelligence freedom. */
  function withFreedom(seed: string, balance: boolean, expert = false): GameState {
    const state = sandbox(seed, balance, []);
    state.activeEffects.push({
      id: `effect_intelligence_${seed}`,
      name: expert ? "Expert Intelligence" : "Intelligence",
      scope: "player",
      controllerId: "p1",
      duration: { type: "combat" },
      polarity: "positive",
      removable: false,
      modifiers: [{ type: "SPELL_CAST_ANYTIME", ...(expert ? { ignoreSpellLimit: true } : {}) }],
      source: { type: "system" },
      startedRound: state.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });
    return state;
  }

  /** Make the fighting begin: one unit acts. */
  function fightingBegins(state: GameState): GameState {
    const unit = Object.values(state.combat!.units)[0];
    unit.movedThisActivation = true;
    return state;
  }

  it("REPRO: the timing freedom is live at the start and CLOSED once a unit acts", () => {
    const on = withFreedom("balance-int-on", true);
    expect(playerHasSpellTimingFreedom(on, "p1"), "the start-of-combat window is open").toBe(true);
    expect(playerHasSpellTimingFreedom(fightingBegins(on), "p1")).toBe(false);

    // CONTROL: the classic card grants the freedom for the WHOLE combat, so the
    // same unit acting changes nothing.
    const off = withFreedom("balance-int-off", false);
    expect(playerHasSpellTimingFreedom(off, "p1")).toBe(true);
    expect(playerHasSpellTimingFreedom(fightingBegins(off), "p1")).toBe(true);
  });

  it("the EXPERT no-limit rider is likewise start-of-combat only", () => {
    const on = withFreedom("balance-int-expert-on", true, true);
    expect(spellLimitFor(on, on.players.p1), "no limit while the window is open").toBe(
      Number.POSITIVE_INFINITY
    );
    const acted = fightingBegins(on);
    expect(spellLimitFor(acted, acted.players.p1), "the ordinary limit once the fighting starts").toBe(1);

    // CONTROL: classic Expert Intelligence lifts the limit all combat.
    const off = withFreedom("balance-int-expert-off", false, true);
    expect(spellLimitFor(fightingBegins(off), off.players.p1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("the CARD is playable at the start of the combat and refused once a unit acts", () => {
    const on = sandbox("balance-int-play-on", true, ["ability.intelligence"]);
    expect(playsOf(on, "p1", "ability.intelligence").length, "offered at the start").toBeGreaterThan(0);

    const acted = fightingBegins(sandbox("balance-int-play-late", true, ["ability.intelligence"]));
    expect(playsOf(acted, "p1", "ability.intelligence"), "withheld once a unit acted").toHaveLength(0);
    // A stale client's forged play is rejected too (the reducer backstop).
    const forged = applyAction(acted, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.intelligence" as CardId,
      mode: "basic",
      target: { type: "none" }
    });
    expect(forged.errors.length).toBeGreaterThan(0);

    // CONTROL: the classic card is playable at any point of the combat.
    const off = fightingBegins(sandbox("balance-int-play-off", false, ["ability.intelligence"]));
    expect(playsOf(off, "p1", "ability.intelligence").length).toBeGreaterThan(0);
  });

  it("opens the same direct Spell Book cast flow as Cast a Spell", () => {
    const on = sandbox("balance-int-book", true, ["ability.intelligence"]);
    on.adventure!.houseRules = { ...(on.adventure!.houseRules ?? {}), "polish-spell-book": true };
    on.players.p1.spellBook = ["spell.magic_arrow" as CardId];
    on.players.p1.spellBookUsed = [];
    const cast = getLegalActions(on, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.fromSpellBook &&
        legal.action.castEnablerCardId === "ability.intelligence"
    );
    expect(cast, "Intelligence exposes a Book Spell without Cast a Spell in hand").toBeTruthy();
    const casting = applyOk(on, cast!.action);
    expect(casting.players.p1.discard).toContain("ability.intelligence");
    expect(casting.players.p1.spellBookUsed).toContain("spell.magic_arrow");

    const off = sandbox("balance-int-book-off", false, ["ability.intelligence"]);
    off.adventure!.houseRules = { ...(off.adventure!.houseRules ?? {}), "polish-spell-book": true };
    off.players.p1.spellBook = ["spell.magic_arrow" as CardId];
    expect(
      getLegalActions(off, "p1").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.castEnablerCardId === "ability.intelligence"
      )
    ).toBe(false);
  });
});

// ===========================================================================
// Intelligence — the reprint is a ONE-SHOT free cast (not a combat-long ongoing
// effect): spent to the discard pile the instant you cast, never parked in the
// Ongoing tray, and free of a Cast a Spell card only for that ONE cast.
// ===========================================================================

describe("Balance Pack — Intelligence is a ONE-SHOT free cast", () => {
  function passAllReactions(state: GameState): GameState {
    let current = state;
    let safety = 20;
    while (current.reactionWindow && safety > 0) {
      safety -= 1;
      current = applyOk(current, {
        type: "PASS_REACTION",
        playerId: current.reactionWindow.priorityPlayerId
      });
    }
    return current;
  }

  /** A polish-spell-book sandbox combat where p1 holds Intelligence + a Book. */
  function bookSandbox(seed: string, balance: boolean, hand: string[] = [], crowns = 0): GameState {
    const state = sandbox(seed, balance, ["ability.intelligence", ...hand], crowns);
    state.adventure!.houseRules = { ...(state.adventure!.houseRules ?? {}), "polish-spell-book": true };
    state.players.p1.spellBook = ["spell.magic_arrow", "spell.lightning_bolt"] as CardId[];
    state.players.p1.spellBookUsed = [];
    return state;
  }

  function playIntelligence(state: GameState, mode: "basic" | "expert"): GameState {
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === "ability.intelligence" &&
        legal.action.mode === mode
    );
    expect(play, `Intelligence (${mode}) is playable at the start of the combat`).toBeTruthy();
    return applyOk(state, play!.action);
  }

  function bookCastOf(state: GameState, spellId: string, free: boolean) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === spellId &&
        legal.action.fromSpellBook === true &&
        (free ? !legal.action.castEnablerCardId : legal.action.castEnablerCardId === CAST_A_SPELL_CARD_ID)
    );
  }

  function hasTimingEffect(state: GameState): boolean {
    return state.activeEffects.some(
      (effect) =>
        effect.controllerId === "p1" &&
        effect.modifiers.some((modifier) => modifier.type === "SPELL_CAST_ANYTIME")
    );
  }

  it("plays to the DISCARD pile, never the Ongoing tray", () => {
    const state = playIntelligence(bookSandbox("int-tray", true, [], 1), "basic");
    expect(state.players.p1.discard).toContain("ability.intelligence");
    expect(
      state.players.p1.ongoingCards ?? [],
      "the one-shot Intelligence is spent, not parked as an ongoing card"
    ).toHaveLength(0);
    // The freedom is live until the free cast is used.
    expect(hasTimingEffect(state)).toBe(true);
  });

  it("BASIC: the free cast spends Intelligence (no Cast a Spell) and IS the round's one Spell", () => {
    let state = bookSandbox("int-basic", true, [CAST_A_SPELL_CARD_ID], 0);
    state = playIntelligence(state, "basic");
    const free = bookCastOf(state, "spell.magic_arrow", true);
    expect(free, "the free cast is offered without a Cast a Spell card").toBeTruthy();
    state = passAllReactions(applyOk(state, free!.action));

    // No Cast a Spell was consumed, and the one-shot freedom is spent.
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);
    expect(hasTimingEffect(state), "the one-shot effect is consumed by the first cast").toBe(false);
    // Basic Intelligence's free cast counts as the round's one Spell.
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
    // The round's Spell is spent — no second cast, even holding a Cast a Spell.
    expect(bookCastOf(state, "spell.lightning_bolt", true)).toBeFalsy();
    expect(bookCastOf(state, "spell.lightning_bolt", false)).toBeFalsy();
  });

  it("EXPERT: the free cast is off-limit and one-shot — a 2nd Spell needs a Cast a Spell card", () => {
    let state = bookSandbox("int-expert", true, [CAST_A_SPELL_CARD_ID], 1);
    state = playIntelligence(state, "expert");
    // Expert side spent a crown to play.
    expect(crownsSpent(state)).toBe(1);

    const free = bookCastOf(state, "spell.magic_arrow", true);
    expect(free).toBeTruthy();
    state = passAllReactions(applyOk(state, free!.action));

    // The one free cast did NOT count toward the limit, so the ordinary
    // one-Spell allowance is intact — and the free-cast effect is spent.
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(0);
    expect(hasTimingEffect(state)).toBe(false);
    expect(state.players.p1.hand).toContain(CAST_A_SPELL_CARD_ID);

    // A SECOND Spell in the same window is no longer free: it needs the enabler.
    expect(bookCastOf(state, "spell.lightning_bolt", true), "no more free casts").toBeFalsy();
    const viaEnabler = bookCastOf(state, "spell.lightning_bolt", false);
    expect(viaEnabler, "a 2nd Spell needs a Cast a Spell card again").toBeTruthy();
    state = passAllReactions(applyOk(state, viaEnabler!.action));
    expect(state.players.p1.discard).toContain(CAST_A_SPELL_CARD_ID);
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("CONTROL: with polish-card-balance OFF the classic card is combat-long and parks in the Ongoing tray", () => {
    let state = bookSandbox("int-classic", false, [], 1);
    state = playIntelligence(state, "expert");
    // Classic: held in the Ongoing tray, not left spent in the discard.
    expect(state.players.p1.ongoingCards?.some((held) => held.cardId === "ability.intelligence")).toBe(true);

    state = passAllReactions(applyOk(state, bookCastOf(state, "spell.magic_arrow", true)!.action));
    // The effect persists all combat, so a 2nd cast is STILL free (the classic
    // combat-long freedom this reprint deliberately replaced).
    expect(hasTimingEffect(state)).toBe(true);
    expect(bookCastOf(state, "spell.lightning_bolt", true), "classic Intelligence keeps casting free").toBeTruthy();
  });
});

// ===========================================================================
// Wisdom — relative Search (X+2) basic, a COMBAT expert side
// ===========================================================================

describe("Balance Pack — Wisdom", () => {
  function guild(seed: string, balance: boolean, crowns = 2): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      ruleset: "binh",
      rotateStartTiles: false,
      houseRules: { "polish-card-balance": balance }
    });
    state.decks["spells"].discardPile = [];
    const player = state.players.p1;
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("castle.mage_guild");
    player.resources.gold = 20;
    player.townTokens.spellBook = true;
    player.hand = ["ability.wisdom" as CardId];
    player.limits.expertUses = crowns;
    player.combatStats.expertUsesSpentThisRound = 0;
    state.heroes.hero_p1.level = 1;
    return state;
  }

  const buyBasic: GameAction = {
    type: "SPELL_BOOK_ACTION",
    playerId: "p1",
    wisdom: { cardId: "ability.wisdom" as CardId, mode: "basic" }
  };

  it("REPRO: the basic widen is RELATIVE — a Search (2) purchase reveals 4, not the flat 3", () => {
    const on = applyOk(guild("balance-wisdom-on", true), buyBasic);
    const onChoice = on.pendingChoice;
    expect(onChoice?.type).toBe("DECK_SEARCH");
    if (onChoice?.type === "DECK_SEARCH") {
      expect(onChoice.revealedCardIds).toHaveLength(4);
    }
    // The printed −2 gold is unchanged (BINH Castle guild 6 − 2 = 4 of 20).
    expect(on.players.p1.resources.gold).toBe(16);

    // CONTROL: the classic basic is a flat Search (3).
    const off = applyOk(guild("balance-wisdom-off", false), buyBasic);
    const offChoice = off.pendingChoice;
    if (offChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected the Search to open");
    }
    expect(offChoice.revealedCardIds).toHaveLength(3);
    expect(off.players.p1.resources.gold).toBe(16);
  });

  it("the town EXPERT side is GONE: not offered, and a forged expert purchase is rejected", () => {
    const on = guild("balance-wisdom-expert-gone", true);
    const labels = getLegalActions(on, "p1").map((legal) => legal.label);
    expect(labels.some((label) => label.includes("Wisdom expert"))).toBe(false);
    const forged = applyAction(on, {
      type: "SPELL_BOOK_ACTION",
      playerId: "p1",
      wisdom: { cardId: "ability.wisdom" as CardId, mode: "expert" }
    });
    expect(forged.errors.length).toBeGreaterThan(0);

    // CONTROL: with the rule off the classic expert purchase is offered and works.
    const off = guild("balance-wisdom-expert-classic", false);
    expect(getLegalActions(off, "p1").some((legal) => legal.label.includes("Wisdom expert"))).toBe(true);
  });

  it("the reprinted EXPERT is a COMBAT play: +1 spell Power and +1 spell limit this round", () => {
    const on = sandbox("balance-wisdom-combat-on", true, ["ability.wisdom", "spell.magic_arrow"], 2);
    const before = spellLimitFor(on, on.players.p1);
    const cast = getLegalActions(on, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
    );
    expect(cast).toBeTruthy();
    const casting = applyOk(on, cast!.action);
    const play = getLegalActions(casting, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.wisdom" && legal.action.mode === "expert"
    );
    expect(play, "Wisdom is offered after the first Spell is cast").toBeTruthy();
    const after = applyOk(casting, play!.action);
    expect(
      after.eventLog.some(
        (event) => event.type === "CARD_PLAYED" && event.cardId === "ability.wisdom" && event.effectAmount === 1
      ),
      "+1 Power was applied to that Spell"
    ).toBe(true);
    expect(after.players.p1.discard).toContain("ability.wisdom");
    expect(spellLimitFor(after, after.players.p1), "+1 spell limit").toBe(before + 1);
    expect(crownsSpent(after), "it is an EXPERT side").toBe(1);

    // CONTROL: with the rule off Wisdom is never a combat play at all.
    const off = sandbox("balance-wisdom-combat-off", false, ["ability.wisdom"], 2);
    expect(playsOf(off, "p1", "ability.wisdom")).toHaveLength(0);
    // …and with no crown the Balance side is likewise withheld.
    const broke = sandbox("balance-wisdom-combat-broke", true, ["ability.wisdom"], 0);
    expect(playsOf(broke, "p1", "ability.wisdom")).toHaveLength(0);
  });

  it("the build-round widen is offered beside Scouting on a Spell Search", () => {
    const on = guild("balance-wisdom-build", true);
    on.players.p1.mageGuildBuiltRound = on.round;
    openSharedDeckSearch(on, "p1", "spells", 2);
    const choice = on.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the pre-Search pop-up");
    }
    expect(choice.context).toBe("scouting-prompt");
    const wisdomIndex = choice.options.findIndex((option) => option.label.includes("Play Wisdom"));
    expect(wisdomIndex, "the Wisdom widen must be offered").toBeGreaterThan(0);
    const played = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: wisdomIndex
    });
    if (played.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected the Search to open");
    }
    expect(played.pendingChoice.revealedCardIds, "Search (2+2)").toHaveLength(4);
    expect(played.players.p1.hand).not.toContain("ability.wisdom");
    expect(crownsSpent(played), "the basic widen costs no crown").toBe(0);

    // CONTROL: a Search in a round the guild was NOT built opens no pop-up at all
    // (no Scouting held either), so the Search reveals its bare base.
    const other = guild("balance-wisdom-build-control", true);
    other.players.p1.mageGuildBuiltRound = other.round + 1;
    openSharedDeckSearch(other, "p1", "spells", 2);
    expect(other.pendingChoice?.type).toBe("DECK_SEARCH");
    if (other.pendingChoice?.type === "DECK_SEARCH") {
      expect(other.pendingChoice.revealedCardIds).toHaveLength(2);
    }
  });
});

// ===========================================================================
// Eagle Eye — one play then a crown-free level pick, and the find is TAKEN
// ===========================================================================

describe("Balance Pack — Eagle Eye", () => {
  // Magic Arrow is STARTING_ONLY, so a dig would skip past it — use two real
  // deck spells, one of each printed level.
  const BASIC_SPELL = "spell.haste" as CardId;
  const EXPERT_SPELL = "spell.counterstrike" as CardId;

  function digger(seed: string, balance: boolean, crowns = 2): GameState {
    const state = openTurn(seed, balance);
    const player = state.players.p1;
    player.hand = ["ability.eagle_eye" as CardId];
    player.deck = [];
    player.discard = [];
    player.spellBook = [];
    player.limits.expertUses = crowns;
    player.combatStats.expertUsesSpentThisRound = 0;
    // BINH splits the Spell decks, so the Expert LEVEL button reads the
    // `spells-expert` pile: seed both.
    state.decks.spells.drawPile = [BASIC_SPELL];
    state.decks.spells.discardPile = [];
    state.decks["spells-expert"].drawPile = [EXPERT_SPELL];
    state.decks["spells-expert"].discardPile = [];
    return state;
  }

  it("REPRO: ONE play (no crown-paying twin), then a two-button Basic/Expert pick", () => {
    const on = digger("balance-eagle-on", true);
    const plays = playsOf(on, "p1", "ability.eagle_eye");
    expect(plays, "exactly one play offer").toHaveLength(1);
    expect(plays[0].action.type === "PLAY_CARD" && plays[0].action.mode).not.toBe("expert");

    const played = applyOk(on, plays[0].action);
    const choice = played.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the level pick");
    }
    expect("context" in choice && choice.context).toBe("spell-deck-pick");
    expect(choice.options.map((option) => option.label)).toEqual(["Basic Spell", "Expert Spell"]);

    // CONTROL: the classic card enumerates TWO plays (basic + a crown expert).
    const off = digger("balance-eagle-off", false);
    const offPlays = playsOf(off, "p1", "ability.eagle_eye");
    expect(offPlays.length).toBe(2);
    expect(
      offPlays.some((play) => play.action.type === "PLAY_CARD" && play.action.mode === "expert")
    ).toBe(true);
  });

  it("the pick digs the chosen LEVEL, TAKES the find with no discard arm, and costs no crown", () => {
    const on = digger("balance-eagle-take", true);
    const played = applyOk(on, playsOf(on, "p1", "ability.eagle_eye")[0].action);
    const choiceId = played.pendingChoice!.id;
    const basic = applyOk(played, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId,
      optionIndex: 0
    });
    expect(basic.players.p1.hand, "the Basic spell was TAKEN, no prompt").toContain(BASIC_SPELL);
    expect(basic.pendingChoice, "no take-or-discard window").toBeNull();
    expect(crownsSpent(basic), "neither level costs a crown").toBe(0);

    // The Expert button digs for the Expert-level spell instead.
    const expert = applyOk(played, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId,
      optionIndex: 1
    });
    expect(expert.players.p1.hand).toContain(EXPERT_SPELL);
    expect(expert.players.p1.hand).not.toContain(BASIC_SPELL);
    expect(crownsSpent(expert)).toBe(0);

    // CONTROL: the classic dig opens the printed take-or-DISCARD choice.
    const off = digger("balance-eagle-classic", false);
    const offPlayed = applyOk(off, playsOf(off, "p1", "ability.eagle_eye")[0].action);
    expect(offPlayed.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (offPlayed.pendingChoice?.type === "OPTION_CHOICE") {
      expect("context" in offPlayed.pendingChoice && offPlayed.pendingChoice.context).toBe("eagle-eye");
      expect(offPlayed.pendingChoice.options).toHaveLength(2);
    }
  });

  it("EXPERT: an enemy damaging Spell may be COPIED at Power 0 at a new target, over the limit", () => {
    const state = sandbox("balance-eagle-copy", true, [], 2);
    state.players.p2.hand = ["spell.magic_arrow" as CardId];
    state.players.p1.hand = ["ability.eagle_eye" as CardId];
    state.players.p2.combatStats.spellsCastThisRound = 0;
    // p2's Magic Arrow hits one of p1's units — the printed trigger.
    const combat = state.combat!;
    const p1Unit = Object.values(combat.units).find((unit) => unit.controllerId === "p1")!;
    const p2Unit = Object.values(combat.units).find((unit) => unit.controllerId === "p2")!;
    combat.activeUnitId = p2Unit.id;
    p2Unit.activatedThisRound = false;
    p2Unit.attackedThisActivation = false;
    state.activePlayerId = "p2";

    const cast = getLegalActions(state, "p2").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.magic_arrow" &&
        legal.action.target.type === "unit" &&
        legal.action.target.unitId === p1Unit.id
    );
    expect(cast, "p2 must be able to cast Magic Arrow at p1's unit").toBeTruthy();
    let after = applyOk(state, cast!.action);
    // Resolve any window the cast opened (nobody holds a reaction here).
    for (let guard = 0; guard < 6 && after.stack.length > 0; guard += 1) {
      const pass = getLegalActions(after, after.priorityPlayerId ?? "p1").find(
        (legal) => legal.action.type === "PASS_REACTION"
      );
      if (!pass) {
        break;
      }
      after = applyOk(after, pass.action);
    }
    expect(after.combat!.units[p1Unit.id].damage, "the enemy Spell really hit").toBeGreaterThan(0);
    expect(after.players.p1.combatStats.eagleEyeCopySpellId, "the copy is latched").toBe(
      "spell.magic_arrow"
    );

    const copy = getLegalActions(after, "p1").find(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.eagleEyeCopy === true
    );
    expect(copy, "the copy must be offered to the damaged player").toBeTruthy();
    const copied = applyOk(after, copy!.action);
    expect(copied.players.p1.hand, "Eagle Eye paid for the copy").not.toContain("ability.eagle_eye");
    expect(crownsSpent(copied), "the copy spends a crown").toBe(1);
    expect(copied.players.p1.combatStats.eagleEyeCopySpellId, "the latch is spent").toBeUndefined();
    expect(
      copied.players.p1.combatStats.spellsCastThisRound,
      "the copy does not count toward the limit"
    ).toBe(0);

    // CONTROL: with the rule off nothing is latched and no copy is ever offered.
    const offState = sandbox("balance-eagle-copy-off", false, [], 2);
    offState.players.p1.hand = ["ability.eagle_eye" as CardId];
    offState.players.p1.combatStats.eagleEyeCopySpellId = "spell.magic_arrow" as CardId;
    expect(
      getLegalActions(offState, "p1").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.eagleEyeCopy === true
      )
    ).toBe(false);
  });
});

// ===========================================================================
// Tactics — both sides gain "OR move one of your units 1 space"
// ===========================================================================

describe("Balance Pack — Tactics moves a unit 1 space", () => {
  function tacticsCombat(seed: string, balance: boolean, crowns = 2): GameState {
    const state = sandbox(seed, balance, ["ability.tactics"], crowns);
    const combat = state.combat!;
    const own = Object.values(combat.units).find((unit) => unit.controllerId === "p1")!;
    combat.activeUnitId = own.id;
    own.activatedThisRound = false;
    own.movedThisActivation = false;
    own.attackedThisActivation = false;
    state.activePlayerId = "p1";
    return state;
  }

  it("REPRO: the expert window offers a MOVE, and the unit really lands on that space", () => {
    const on = tacticsCombat("balance-tactics-on", true);
    const moves = getLegalActions(on, "p1").filter((legal) => legal.action.type === "TACTICS_MOVE_UNIT");
    expect(moves.length, "the OR arm must be offered").toBeGreaterThan(0);
    const move = moves[0].action;
    if (move.type !== "TACTICS_MOVE_UNIT") {
      throw new Error("expected a Tactics move");
    }
    const before = on.combat!.units[move.unitId].position;
    expect(before).not.toBe(move.position);
    const after = applyOk(on, move);
    expect(after.combat!.units[move.unitId].position, "the unit MOVED").toBe(move.position);
    expect(after.players.p1.hand, "the card is spent").not.toContain("ability.tactics");
    expect(crownsSpent(after), "the mid-combat window is the EXPERT side").toBe(1);

    // CONTROL: with the rule off the swap is the only Tactics arm.
    const off = tacticsCombat("balance-tactics-off", false);
    expect(getLegalActions(off, "p1").some((legal) => legal.action.type === "TACTICS_MOVE_UNIT")).toBe(
      false
    );
    expect(
      getLegalActions(off, "p1").some((legal) => legal.action.type === "SWAP_COMBAT_UNITS"),
      "the classic swap is still there"
    ).toBe(true);
    // A forged move is rejected outright.
    const forged = applyAction(off, move);
    expect(forged.errors.length).toBeGreaterThan(0);
  });

  it("only empty ADJACENT spaces are legal destinations", () => {
    const on = tacticsCombat("balance-tactics-cells", true);
    const combat = on.combat!;
    const own = Object.values(combat.units).find((unit) => unit.controllerId === "p1")!;
    const cells = tacticsMoveDestinations(combat, own);
    const occupied = new Set(
      Object.values(combat.units)
        .filter((unit) => unit.damage < unit.maxHealth)
        .map((unit) => unit.position)
    );
    for (const cell of cells) {
      expect(occupied.has(cell), "a destination is never occupied").toBe(false);
    }
    // A forged move to a far / occupied cell is refused.
    const bad = applyAction(on, {
      type: "TACTICS_MOVE_UNIT",
      playerId: "p1",
      unitId: own.id,
      position: own.position
    });
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Pathfinding — basic extends a neutral combat free, expert is the movement pack
// ===========================================================================

const GUARD_FIELD = "tile_p1_home:2";

function guardField(state: GameState): MapFieldState {
  const field = {
    id: GUARD_FIELD,
    tileInstanceId: "tile_p1_home",
    slotIndex: 2,
    location: "empty_field",
    difficulty: 3,
    terrain: "water",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  } as unknown as MapFieldState;
  state.adventure!.fields[GUARD_FIELD] = field;
  return field;
}

describe("Balance Pack — Pathfinding", () => {
  it("REPRO (basic): it is offered in the continue-or-retreat window and buys a round FREE", () => {
    let state = adventure("balance-path-basic", true);
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      state.activePlayerId = "p1";
    }
    state.players.p1.hand = ["ability.pathfinding" as CardId];
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.spaceId = GUARD_FIELD;
    hero.movementPoints = 0;
    startNeutralEncounter(state, hero, guardField(state));
    let next = state;
    for (let guard = 0; guard < 12; guard += 1) {
      const place = getLegalActions(next, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
      if (!place) {
        break;
      }
      next = applyOk(next, place.action);
    }
    const finish = getLegalActions(next, "p1").find((entry) => entry.action.type === "FINISH_COMBAT_PLACEMENT");
    next = applyOk(next, finish!.action);
    // Force the round-limit window open: that is the card's printed moment.
    next.combat!.awaitingContinue = true;
    next.phase = "combat";
    next.pendingChoice = null;

    const free = getLegalActions(next, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.pathfinding"
    );
    expect(free.length, "the free-extension arm must be offered").toBeGreaterThan(0);
    const played = applyOk(next, free[0].action);
    expect(played.combat!.awaitingContinue, "the combat continued").toBe(false);
    expect(getMainHero(played, "p1")!.movementPoints, "and it cost NO movement point").toBe(0);

    // CONTROL: with the rule off Pathfinding offers nothing in that window (its
    // classic sides are map-only movement).
    const offNext = { ...next, adventure: next.adventure };
    offNext.adventure!.houseRules = { ...offNext.adventure!.houseRules, "polish-card-balance": false };
    expect(
      getLegalActions(offNext, "p1").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.pathfinding"
      )
    ).toBe(false);
  });

  it("EXPERT: one movement package regardless of the `pathfinding-expert` rule", () => {
    for (const pathfindingExpert of [true, false]) {
      const state = adventure(`balance-path-expert-${pathfindingExpert}`, true, {
        "pathfinding-expert": pathfindingExpert
      });
      const hero = getMainHero(state, "p1")!;
      state.activeEffects.push({
        id: `effect_pathfinding_${pathfindingExpert}`,
        name: "Pathfinding (Expert)",
        scope: "player",
        controllerId: "p1",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "HERO_PATHFINDING", expert: true }],
        source: { type: "system" },
        startedRound: state.round,
        usedRollEventIds: [],
        usedChoiceIds: [],
        usedCombatRoundNumbers: []
      });
      const caps = getHeroMovementCapabilities(state, hero);
      expect(caps.passEncounters, "pass through Neutral / enemy Hero fields").toBe(true);
      expect(caps.moveThrough, "cross blocked fields").toBe(true);
      expect(caps.crossSealedBorders, "cross yellow borders").toBe(true);
      expect(caps.waterWalk, "no coastline halt").toBe(true);
      expect(caps.crossLayers, "NOT the Surface↔Subterranean step").toBe(false);
    }

    // CONTROL: with the Balance rule OFF and `pathfinding-expert` off, the same
    // expert effect grants NO sea crossing (the printed card).
    const off = adventure("balance-path-expert-off", false, { "pathfinding-expert": false });
    off.activeEffects.push({
      id: "effect_pathfinding_off",
      name: "Pathfinding (Expert)",
      scope: "player",
      controllerId: "p1",
      duration: { type: "current-turn" },
      polarity: "positive",
      removable: false,
      modifiers: [{ type: "HERO_PATHFINDING", expert: true }],
      source: { type: "system" },
      startedRound: off.round,
      usedRollEventIds: [],
      usedChoiceIds: [],
      usedCombatRoundNumbers: []
    });
    const offCaps = getHeroMovementCapabilities(off, getMainHero(off, "p1")!);
    expect(offCaps.waterWalk).toBe(false);
    expect(offCaps.crossSealedBorders).toBe(true);
  });
});

// ===========================================================================
// Learning — any experience gain, and the basic play also draws
// ===========================================================================

describe("Balance Pack — Learning", () => {
  function learner(seed: string, balance: boolean): GameState {
    const state = openTurn(seed, balance);
    const player = state.players.p1;
    player.hand = ["ability.learning" as CardId];
    player.deck = ["spell.haste" as CardId, "spell.slow" as CardId];
    player.discard = [];
    player.limits.expertUses = 0;
    player.combatStats.expertUsesSpentThisRound = 0;
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.experience = 0;
    return state;
  }

  function offerAfterGain(state: GameState, amount: number): GameState {
    gainExperience(state, "p1", amount);
    pumpAdventureQueues(state);
    return state;
  }

  it("REPRO: the offer opens on ANY experience gain, not only a level crossing", () => {
    // +1 Experience is a HALF level — it crosses no level at all.
    const on = offerAfterGain(learner("balance-learning-on", true), 1);
    expect(on.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (on.pendingChoice?.type === "OPTION_CHOICE") {
      expect(on.pendingChoice.context).toBe("learning-level-up");
    }

    // CONTROL: the classic card only fires when the Hero crosses a level.
    const off = offerAfterGain(learner("balance-learning-off", false), 1);
    expect(off.pendingChoice && "context" in off.pendingChoice && off.pendingChoice.context).not.toBe(
      "learning-level-up"
    );
  });

  it("the basic play ALSO draws a card", () => {
    const on = offerAfterGain(learner("balance-learning-draw", true), 1);
    const handBefore = on.players.p1.hand.length;
    const played = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: on.pendingChoice!.id,
      optionIndex: 0
    });
    // −1 for the spent Learning card, +1 for the printed draw.
    expect(played.players.p1.hand.length, "one card drawn").toBe(handBefore);
    expect(played.players.p1.hand).not.toContain("ability.learning");
    expect(played.players.p1.deck.length, "the draw really came off the deck").toBe(1);

    // CONTROL: the classic basic play draws nothing (2 cards -> 0 after spending).
    const off = offerAfterGain(learner("balance-learning-draw-off", false), 2);
    expect(off.pendingChoice && "context" in off.pendingChoice && off.pendingChoice.context).toBe(
      "learning-level-up"
    );
    const offPlayed = applyOk(off, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: off.pendingChoice!.id,
      optionIndex: 0
    });
    expect(offPlayed.players.p1.deck.length, "no draw").toBe(2);
  });

  it("offers the printed OR reading: draw a card instead of advancing the half level", () => {
    const on = offerAfterGain(learner("balance-learning-draw-only", true), 1);
    const hero = getMainHero(on, "p1")!;
    const experienceBefore = hero.experience;
    const labels = on.pendingChoice?.type === "OPTION_CHOICE"
      ? on.pendingChoice.options.map((option) => option.label)
      : [];
    const drawOnlyIndex = labels.findIndex((label) => label.includes("draw 1 card instead"));
    expect(drawOnlyIndex).toBeGreaterThan(0);
    const played = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: on.pendingChoice!.id,
      optionIndex: drawOnlyIndex
    });
    expect(getMainHero(played, "p1")!.experience, "draw-only does not add the half level").toBe(experienceBefore);
    expect(played.players.p1.deck.length, "one card was drawn").toBe(1);
    expect(played.players.p1.discard).toContain("ability.learning");

    // CONTROL: normal Learning still has only its printed level advance + decline.
    const off = offerAfterGain(learner("balance-learning-draw-only-off", false), 2);
    const offLabels = off.pendingChoice?.type === "OPTION_CHOICE"
      ? off.pendingChoice.options.map((option) => option.label)
      : [];
    expect(offLabels.some((label) => label.includes("draw 1 card instead"))).toBe(false);
  });
});

// ===========================================================================
// Diplomacy — each unpurchased draw goes to the top or bottom of its deck
// ===========================================================================

describe("Balance Pack — Diplomacy places unpurchased draws", () => {
  function diplomacyDraw(seed: string, balance: boolean): GameState {
    const state = openTurn(seed, balance);
    const player = state.players.p1;
    player.hand = ["ability.diplomacy" as CardId];
    player.resources.gold = 0;
    return state;
  }

  it("REPRO: the unpurchased card opens a top/bottom pick and really lands there", () => {
    const on = diplomacyDraw("balance-diplo-on", true);
    const play = playsOf(on, "p1", "ability.diplomacy")[0];
    expect(play, "the Diplomacy recruit side must be playable").toBeTruthy();
    let next = applyOk(on, play!.action);
    // With 0 gold nothing is affordable, so the only recruit answer is "none".
    expect(next.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (next.pendingChoice?.type !== "OPTION_CHOICE" || next.pendingChoice.context !== "diplomacy-recruit") {
      throw new Error("expected the Diplomacy recruit choice");
    }
    const declineIndex = next.pendingChoice.diplomacyRecruit!.recruitable.length;
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice.id,
      optionIndex: declineIndex
    });

    const placement = next.pendingChoice;
    expect(placement?.type).toBe("OPTION_CHOICE");
    if (placement?.type !== "OPTION_CHOICE" || !placement.deckCardPlacement) {
      throw new Error("expected the top/bottom placement window");
    }
    const head = placement.deckCardPlacement.pending[0];
    const deckBefore = next.decks[head.deckId].drawPile.length;
    const discardBefore = next.decks[head.deckId].discardPile.length;
    const placed = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: placement.id,
      optionIndex: 0
    });
    const deck = placed.decks[head.deckId];
    expect(deck.drawPile.at(-1), "TOP means the last element").toBe(head.cardId);
    expect(deck.drawPile.length).toBe(deckBefore + 1);
    expect(deck.discardPile.length, "and NOT the discard pile").toBe(discardBefore);
  });

  it("CONTROL: with the rule off the unpurchased draws go straight to the discard pile", () => {
    const off = diplomacyDraw("balance-diplo-off", false);
    let next = applyOk(off, playsOf(off, "p1", "ability.diplomacy")[0].action);
    if (next.pendingChoice?.type !== "OPTION_CHOICE" || next.pendingChoice.context !== "diplomacy-recruit") {
      throw new Error("expected the Diplomacy recruit choice");
    }
    const draws = next.pendingChoice.diplomacyRecruit!.draws;
    const declineIndex = next.pendingChoice.diplomacyRecruit!.recruitable.length;
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice.id,
      optionIndex: declineIndex
    });
    expect(next.pendingChoice, "no placement window").toBeNull();
    for (const draw of draws) {
      const deckId = `neutral-${draw.tier}`;
      expect(next.decks[deckId].discardPile).toContain(draw.unitDefId);
    }
  });
});

// ===========================================================================
// Ballistics — the in-play bombard and the 3-Walls-and-Gate expert arm
// ===========================================================================

describe("Balance Pack — Ballistics", () => {
  /** A sandbox siege so every printed Ballistics side has something to hit. */
  function siege(seed: string, balance: boolean): GameState {
    const state = sandbox(seed, balance, ["ability.ballistics"], 2);
    state.players.p1.resources.buildingMaterials = 1;
    state.combat!.siege = { walls: [0, 1, 2, 3], gatePosition: 4, arrowTowerUnitId: null, townPlayerId: "p2" };
    return state;
  }

  it("REPRO: the classic Arrow-Tower / buff-bombard sides are withheld, the reprint's are offered", () => {
    const on = siege("balance-ballistics-on", true);
    const options = playsOf(on, "p1", "ability.ballistics")
      .map((legal) => (legal.action.type === "PLAY_CARD" ? legal.action.optionIndex : undefined))
      .filter((index): index is number => index !== undefined);
    expect(options, "the Arrow-Tower demolition (1) is gone").not.toContain(1);
    expect(options, "the buff bombard (2) is gone").not.toContain(2);
    expect(options, "the classic one-wall side is replaced").not.toContain(0);
    expect(options, "the reprint's two-fortification basic (3) is offered").toContain(3);
    expect(options, "the reprint's 3-Walls-and-Gate expert (4) is offered").toContain(4);
    expect(options, "the beginning-of-combat two-target shot (5) is offered").toContain(5);

    // CONTROL: with the rule off the classic sides are the ones offered.
    const off = siege("balance-ballistics-off", false);
    off.combat!.siege!.arrowTowerUnitId = null;
    const offOptions = playsOf(off, "p1", "ability.ballistics")
      .map((legal) => (legal.action.type === "PLAY_CARD" ? legal.action.optionIndex : undefined))
      .filter((index): index is number => index !== undefined);
    expect(offOptions, "the classic buff bombard is back").toContain(2);
    expect(offOptions, "and the reprint's sides are gone").not.toContain(3);
    expect(offOptions).not.toContain(4);
  });

  it("BASIC: the paid 2-target bombard fires once at combat start and does not become recurring", () => {
    const on = siege("balance-ballistics-in-play", true);
    const play = playsOf(on, "p1", "ability.ballistics").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 5
    );
    expect(play, "the opening bombard must be offered").toBeTruthy();
    const fired = applyOk(on, play!.action);
    expect(fired.players.p1.resources.buildingMaterials, "the material was paid").toBe(0);
    const aim = fired.pendingChoice;
    if (aim?.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected the first-target pick");
    }
    const targetId = aim.candidateUnitIds[0];
    const legal = getLegalActions(fired, "p1").find(
      (entry) => entry.action.type === "CHOOSE_ABILITY_TARGET" && entry.action.targetUnitId === targetId
    );
    const hit = applyOk(fired, legal!.action);
    expect(hit.combat!.units[targetId].damage, "1 damage landed").toBe(1);
    expect(hit.players.p1.permanents ?? []).not.toContain("ability.ballistics");

    // CONTROL: with the rule off the card can never enter play, so no round-start
    // offer exists for it at all.
    const off = siege("balance-ballistics-in-play-off", false);
    expect(
      playsOf(off, "p1", "ability.ballistics").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 3
      )
    ).toBe(false);
  });

  it("EXPERT (Catapult): fires it TWICE on the same targets and pays no building material", () => {
    /** A sandbox round-start Catapult offer with Ballistics in hand. */
    function catapultRound(balance: boolean, materials: number): GameState {
      const state = sandbox(`balance-catapult-${balance}-${materials}`, balance, ["ability.ballistics"], 2);
      state.players.p1.resources.buildingMaterials = materials;
      state.players.p1.hand.push("war_machine.catapult" as CardId);
      putPermanentIntoPlay(state, "p1", "war_machine.catapult" as CardId);
      startWarMachineRound(state);
      return state;
    }

    const on = catapultRound(true, 0);
    const offer = on.pendingChoice;
    expect(offer?.type).toBe("OPTION_CHOICE");
    if (offer?.type !== "OPTION_CHOICE") {
      throw new Error("expected the Catapult round-start offer");
    }
    // The Ballistics double is appended after fire/skip, so index 2 — and it is
    // offered at ZERO building materials because it pays no cost.
    expect(offer.options).toHaveLength(3);
    expect(offer.options[2].label).toContain("Ballistics");
    const chose = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: offer.id,
      optionIndex: 2
    });
    expect(chose.players.p1.resources.buildingMaterials, "no cost paid").toBe(0);
    expect(chose.players.p1.hand, "the Ballistics card is spent").not.toContain("ability.ballistics");
    expect(crownsSpent(chose), "the double is the EXPERT side").toBe(1);

    // Pick the first target: it takes the DOUBLED hit (1 damage × 2 shots).
    const targetChoice = chose.pendingChoice;
    if (targetChoice?.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error(`expected the Catapult target pick, got ${targetChoice?.type ?? "nothing"}`);
    }
    const firstId = targetChoice.candidateUnitIds[0];
    // Through the REAL offer, exactly like the UI does.
    const aim = getLegalActions(chose, "p1").find(
      (legal) => legal.action.type === "CHOOSE_ABILITY_TARGET" && legal.action.targetUnitId === firstId
    );
    expect(aim, "the first Catapult target must be offered").toBeTruthy();
    const fired = applyOk(chose, aim!.action);
    expect(fired.combat!.units[firstId].damage, "hit twice, not once").toBe(2);

    // CONTROL: with the rule off there is no third option, and a broke owner is
    // not offered the Catapult at all.
    const off = catapultRound(false, 1);
    if (off.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the classic Catapult offer");
    }
    expect(off.pendingChoice.options).toHaveLength(2);
    const offBroke = catapultRound(false, 0);
    expect(offBroke.pendingChoice, "a broke owner gets no classic Catapult offer").toBeNull();
  });

  it("EXPERT (siege): destroys the Gate and up to 3 Walls at once", () => {
    const on = siege("balance-ballistics-siege", true);
    const play = playsOf(on, "p1", "ability.ballistics").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.optionIndex === 4
    );
    expect(play, "the 3-Walls-and-Gate arm must be offered in a siege").toBeTruthy();
    const after = applyOk(on, play!.action);
    expect(after.combat!.siege!.gatePosition, "the Gate fell").toBeNull();
    expect(after.combat!.siege!.walls.length, "three Walls fell").toBe(1);
    expect(crownsSpent(after), "it is an EXPERT side").toBe(1);
  });
});

// ===========================================================================
// First Aid — the Tent volley is BASIC, and Expert is +2 Health
// ===========================================================================

describe("Balance Pack — First Aid", () => {
  it("REPRO: the Tent triple-volley needs NO crown any more", () => {
    const on = sandbox("balance-first-aid-on", true, ["ability.first_aid"], 0);
    expect(playerCanUseFirstAidVolley(on, "p1"), "offered at zero crowns").toBe(true);

    // CONTROL: the classic volley is the Expert side and needs a crown.
    const off = sandbox("balance-first-aid-off", false, ["ability.first_aid"], 0);
    expect(playerCanUseFirstAidVolley(off, "p1")).toBe(false);
    const offPaid = sandbox("balance-first-aid-off-paid", false, ["ability.first_aid"], 1);
    expect(playerCanUseFirstAidVolley(offPaid, "p1")).toBe(true);
  });

  it("labels the balance Tent volley as crown-free First Aid, without an expert-cost remark", () => {
    const on = sandbox("balance-first-aid-label", true, ["ability.first_aid", "war_machine.first_aid_tent"], 0);
    putPermanentIntoPlay(on, "p1", "war_machine.first_aid_tent" as CardId);
    const own = Object.values(on.combat!.units).find((unit) => unit.controllerId === "p1")!;
    own.damage = 1;
    const volley = getLegalActions(on, "p1").find(
      (legal) => legal.action.type === "USE_ACTIVE_EFFECT" && legal.action.mode === "expert"
    );
    expect(volley?.label).toBe(`First Aid ability: use First Aid Tent on ${own.name} 3 times`);
    expect(volley?.label.toLowerCase()).not.toContain("crown");
  });

  it("EXPERT: +2 Health protects only the selected Stack/Pack/Few life", () => {
    const on = sandbox("balance-first-aid-expert", true, ["ability.first_aid"], 2);
    const combat = on.combat!;
    const own = Object.values(combat.units).find((unit) => unit.controllerId === "p1")!;
    combat.activeUnitId = own.id;
    own.activatedThisRound = false;
    own.attackedThisActivation = false;
    on.activePlayerId = "p1";
    // The Tent must be in play — the printed gate.
    on.players.p1.hand.push("war_machine.first_aid_tent" as CardId);
    putPermanentIntoPlay(on, "p1", "war_machine.first_aid_tent" as CardId);
    // The +2 Health arm is a BONUS/overheal, offerable with NOTHING to heal: the
    // card-level `damagedOnly` target gates only the basic remove-1 side, never
    // this option's own `{ friendly-unit }` target. Make that explicit — with
    // every unit at full health, the arm must still be offered below.
    for (const unit of Object.values(combat.units)) {
      unit.damage = 0;
    }

    const play = playsOf(on, "p1", "ability.first_aid").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === own.id &&
        legal.action.mode === "expert"
    );
    expect(play, "the +2 Health expert arm must be offered with a Tent in play").toBeTruthy();
    const before = on.combat!.units[own.id].maxHealth;
    const after = applyOk(on, play!.action);
    expect(after.combat!.units[own.id].maxHealth, "+2 Health").toBe(before + 2);
    expect(crownsSpent(after)).toBe(1);

    // Defeat that physical health bar. The Pack flips to Few, and the newly
    // revealed life uses its printed Health without carrying First Aid's +2.
    const buffed = after.combat!.units[own.id];
    buffed.variant = "pack";
    applyUnitCurrentSide(buffed, getRuleset(after), unitSideRuleOverrides(after));
    // Re-applying the side includes the live +2 before this life is defeated.
    const packHealthWithFirstAid = buffed.maxHealth;
    expect(buffed.combatMaxHealthBonus).toBe(2);
    buffed.damage = packHealthWithFirstAid;
    markUnitRemovedIfNeeded(after, buffed);
    expect(buffed.variant).toBe("few");
    expect(buffed.combatMaxHealthBonus).toBeUndefined();
    const printedFew = { ...buffed, damage: 0 };
    applyUnitCurrentSide(printedFew, getRuleset(after), unitSideRuleOverrides(after));
    expect(buffed.maxHealth, "the Few life has no carried +2").toBe(printedFew.maxHealth);
    expect(
      after.activeEffects.some((effect) =>
        effect.modifiers.some(
          (modifier) => modifier.type === "HEALTH_BONUS" && modifier.currentUnitLifeOnly
        )
      )
    ).toBe(false);

    // CONTROL: without a Tent in play the arm is never offered.
    const noTent = sandbox("balance-first-aid-no-tent", true, ["ability.first_aid"], 2);
    const noTentCombat = noTent.combat!;
    const noTentUnit = Object.values(noTentCombat.units).find((unit) => unit.controllerId === "p1")!;
    noTentCombat.activeUnitId = noTentUnit.id;
    noTentUnit.activatedThisRound = false;
    noTentUnit.attackedThisActivation = false;
    noTent.activePlayerId = "p1";
    expect(
      playsOf(noTent, "p1", "ability.first_aid").some(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.mode === "expert"
      )
    ).toBe(false);
  });
});
