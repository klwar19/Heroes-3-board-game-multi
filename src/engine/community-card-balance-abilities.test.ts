/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * ten reprinted ABILITY cards.
 *
 * LEADING WITH WHAT IS NOT HERE: Necromancy and Intelligence are NOT reprinted
 * (see `COMMUNITY_BALANCE_NOT_IMPLEMENTED`), so this file pins that their
 * CLASSIC behaviour survives the rule instead of pretending otherwise.
 *
 * Every claim below is an OBSERVABLE outcome — gold really moved, a card really
 * left the game, a unit really took damage, a search really revealed N — paired
 * with a rule-OFF CONTROL on the SAME setup, so a passing case proves the
 * reprint is what moved the number (CLAUDE.md #1a).
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getMainHero
} from "./index";
import {
  openSharedDeckSearch,
  playScoutingCard,
  pumpAdventureQueues,
  resolveVisitStep
} from "./adventure-reducer";
import { spellLimitFor } from "./ruleset";
import {
  playerCanUseArtilleryVolley,
  playerCanUseBallisticsCatapultDouble,
  playerCanUseFirstAidVolley,
  spendFirstAidExpert,
  putPermanentIntoPlay,
  processWarMachineRound,
  resolveWarMachineOption,
  startWarMachineRound
} from "./permanents";
import { artilleryCardReactions } from "./legal-actions";
import { balanceCardLibrary } from "./community-balance-cards";
import { cardLibrary } from "@/data/cards/library";
import type { CardId, GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * A sandbox combat with `hand` in p1's hand and `crowns` expert uses.
 * `houseRuleEnabled` reads `state.adventure?.houseRules`, so both balance rules
 * are stamped through the same minimal stub the Polish suite uses.
 */
function sandbox(
  seed: string,
  rules: Rules,
  hand: string[],
  crowns = 0
): GameState {
  const state = createInitialGameState(seed);
  state.adventure = {
    houseRules: {
      "community-card-balance": Boolean(rules.community),
      "polish-card-balance": Boolean(rules.polish)
    }
  } as unknown as GameState["adventure"];
  state.players.p1.hand = hand as CardId[];
  state.players.p2.hand = [];
  state.players.p1.limits.expertUses = crowns;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  return state;
}

type Rules = { community?: boolean; polish?: boolean; estatesNerf?: boolean };

function adventure(seed: string, rules: Rules): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: {
      "community-card-balance": Boolean(rules.community),
      "polish-card-balance": Boolean(rules.polish),
      ...(rules.estatesNerf === undefined ? {} : { "estates-nerf": rules.estatesNerf })
    }
  });
}

/** An adventure whose p1 turn is genuinely OPEN for card plays. */
function openTurn(seed: string, rules: Rules): GameState {
  let state = adventure(seed, rules);
  state.activePlayerId = "p1";
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    state.activePlayerId = "p1";
  }
  return state;
}

function playsOf(state: GameState, playerId: PlayerId, cardId: string, optionIndex?: number) {
  return getLegalActions(state, playerId).filter(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex)
  );
}

function crownsSpent(state: GameState, playerId: PlayerId = "p1"): number {
  return state.players[playerId].combatStats.expertUsesSpentThisRound;
}

/** The definition the engine really reads for `cardId` under these rules. */
function activeCard(state: GameState, cardId: string) {
  return balanceCardLibrary(state, { ...cardLibrary })[cardId]!;
}

// ===========================================================================
// The pack's SCOPE — the two abilities it deliberately does not run
// ===========================================================================

describe("Community pack — scope", () => {
  it("leaves the classic definitions alone with the rule OFF, Necromancy and Intelligence included", () => {
    const off = sandbox("community-scope", {}, []);
    // Same object identity as the printed card: nothing changes with the rule off.
    expect(activeCard(off, "ability.necromancy")).toBe(cardLibrary["ability.necromancy"]);
    expect(activeCard(off, "ability.intelligence")).toBe(cardLibrary["ability.intelligence"]);
    // The printed engine markers, for reference in the reprint cases below.
    expect(cardLibrary["ability.necromancy"]!.effect.type).toBe("NECROMANCY_REINFORCE");
    expect(cardLibrary["ability.intelligence"]!.effect.type).toBe("CREATE_ACTIVE_EFFECT");
  });

  it("DOES swap all TWELVE it covers (non-vacuity for every case below)", () => {
    const on = sandbox("community-scope-on", { community: true }, []);
    const off = sandbox("community-scope-off", {}, []);
    for (const cardId of [
      "ability.artillery",
      "ability.ballistics",
      "ability.estates",
      "ability.first_aid",
      "ability.intelligence",
      "ability.leadership",
      "ability.luck",
      "ability.mysticism",
      "ability.necromancy",
      "ability.scouting",
      "ability.tactics",
      "ability.wisdom"
    ]) {
      expect(activeCard(on, cardId), `${cardId} not swapped`).not.toBe(cardLibrary[cardId]);
      expect(activeCard(off, cardId), `${cardId} swapped with the rule OFF`).toBe(cardLibrary[cardId]);
    }
  });
});

// ===========================================================================
// ESTATES — 2 / 4 gold instead of 3 / 6
// ===========================================================================

describe("Community pack — Estates pays 2 / 4 gold", () => {
  /**
   * `estates-nerf` is OFF on both sides, so the CONTROL really plays the printed
   * 3 / 6 card. (BINH's own nerf already pays 2 / 4, and the reprint's job is to
   * make that the CARD's text — see the reducer's `communityEstates` seam.)
   */
  function playEstates(community: boolean, mode: "basic" | "expert"): number {
    let state = openTurn(`estates-${community}-${mode}`, { community, estatesNerf: false });
    state.players.p1.hand = ["ability.estates"] as CardId[];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    const before = state.players.p1.resources.gold;
    const play = playsOf(state, "p1", "ability.estates").find(
      (legal) => legal.action.type === "PLAY_CARD" && (legal.action.mode ?? "basic") === mode
    );
    expect(play, `no ${mode} Estates play`).toBeTruthy();
    state = applyOk(state, play!.action);
    return state.players.p1.resources.gold - before;
  }

  it("basic gains 2 gold (CONTROL: the printed card gains 3)", () => {
    expect(playEstates(true, "basic")).toBe(2);
    expect(playEstates(false, "basic")).toBe(3);
  });

  it("expert gains 4 gold (CONTROL: the printed card gains 6)", () => {
    expect(playEstates(true, "expert")).toBe(4);
    expect(playEstates(false, "expert")).toBe(6);
  });

  it("the reprint OVERRIDES the estates-nerf seam either way it is set", () => {
    // With the BINH nerf ON the two readings agree at 2 / 4 — that is the whole
    // point of the reprint (it makes the CARD say what BINH already did) — and
    // with it OFF the community card still pays 2, never the printed 3.
    let nerfed = openTurn("estates-nerf-on", { community: true, estatesNerf: true });
    nerfed.players.p1.hand = ["ability.estates"] as CardId[];
    const before = nerfed.players.p1.resources.gold;
    nerfed = applyOk(nerfed, playsOf(nerfed, "p1", "ability.estates")[0].action);
    expect(nerfed.players.p1.resources.gold - before).toBe(2);
  });

  it("EMPOWERED: the 4-gold expert side is playable with NO crown", () => {
    let state = openTurn("estates-empowered", { community: true });
    state.players.p1.hand = ["ability.estates"] as CardId[];
    state.players.p1.limits.expertUses = 0;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.empoweredAbilities = ["ability.estates"] as CardId[];
    const before = state.players.p1.resources.gold;
    const expert = playsOf(state, "p1", "ability.estates").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.mode === "expert"
    );
    expect(expert, "an Empowered Estates must offer its expert side at 0 crowns").toBeTruthy();
    state = applyOk(state, expert!.action);
    expect(state.players.p1.resources.gold - before).toBe(4);
    expect(crownsSpent(state)).toBe(0);
  });
});

// ===========================================================================
// LEADERSHIP — the expert side draws 2 and grants NO morale token
// ===========================================================================

describe("Community pack — Leadership expert drops the Morale token", () => {
  function playLeadershipExpert(community: boolean): { morale: number; drawn: number } {
    let state = openTurn(`leadership-${community}`, { community });
    state.players.p1.hand = ["ability.leadership"] as CardId[];
    state.players.p1.limits.expertUses = 2;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    const moraleBefore = state.players.p1.morale;
    const handBefore = state.players.p1.hand.length;
    const expert = playsOf(state, "p1", "ability.leadership").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.mode === "expert"
    );
    expect(expert, "no expert Leadership play").toBeTruthy();
    state = applyOk(state, expert!.action);
    return {
      morale: state.players.p1.morale - moraleBefore,
      // The card itself left the hand, so a net 0 means "played 1, drew 2 - 1".
      drawn: state.players.p1.hand.length - (handBefore - 1)
    };
  }

  it("draws 2 and moves Morale by 0 (CONTROL: the printed card also gains 1 Morale)", () => {
    expect(playLeadershipExpert(true)).toEqual({ morale: 0, drawn: 2 });
    expect(playLeadershipExpert(false)).toEqual({ morale: 1, drawn: 2 });
  });

  it("the BASIC side still gains 1 Morale under the rule", () => {
    let state = openTurn("leadership-basic", { community: true });
    state.players.p1.hand = ["ability.leadership"] as CardId[];
    const before = state.players.p1.morale;
    const basic = playsOf(state, "p1", "ability.leadership").find(
      (legal) => legal.action.type === "PLAY_CARD" && (legal.action.mode ?? "basic") === "basic"
    );
    expect(basic).toBeTruthy();
    state = applyOk(state, basic!.action);
    expect(state.players.p1.morale - before).toBe(1);
  });
});

// ===========================================================================
// SCOUTING — flat Search (4) / (5), and the expert side REMOVES the card
// ===========================================================================

describe("Community pack — Scouting reveals 4 / 5 and the expert side is removed", () => {
  /** Opens a Spell-deck Search with Scouting in hand and takes the given button. */
  function searchWithScouting(
    rules: Rules,
    pick: "decline" | "basic" | "expert",
    crowns = 2
  ): { state: GameState; labels: string[] } {
    let state = openTurn(`scouting-${pick}-${JSON.stringify(rules)}`, rules);
    state.players.p1.hand = ["ability.scouting"] as CardId[];
    state.players.p1.limits.expertUses = crowns;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    openSharedDeckSearch(state, "p1", "spells", 2);
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("scouting-prompt");
    const labels = choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
    const index = pick === "decline" ? 0 : pick === "basic" ? 1 : 2;
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: index });
    return { state, labels };
  }

  /**
   * How many cards the Search ACTUALLY revealed (not a label). Takes the
   * "Search (N)" arm of the deck-search-mode menu when one is open, then reads
   * the DECK_SEARCH choice's own `revealedCardIds`.
   */
  function reveal(input: GameState): { count: number; state: GameState } {
    let state = input;
    const mode = state.pendingChoice;
    if (mode?.type === "OPTION_CHOICE" && mode.context === "deck-search-mode") {
      state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: mode.id, optionIndex: 0 });
    }
    const search = state.pendingChoice;
    expect(search?.type, "expected a DECK_SEARCH reveal").toBe("DECK_SEARCH");
    return { count: search?.type === "DECK_SEARCH" ? search.revealedCardIds.length : 0, state };
  }

  function revealed(input: GameState): number {
    return reveal(input).count;
  }

  it("basic reveals 4 (CONTROL: the printed Scouting reveals 3)", () => {
    const community = searchWithScouting({ community: true }, "basic");
    expect(community.labels[1]).toContain("Search (4)");
    expect(revealed(community.state)).toBe(4);

    const classic = searchWithScouting({}, "basic");
    expect(classic.labels[1]).toContain("Search (3)");
    expect(revealed(classic.state)).toBe(3);
  });

  it("the expert side reveals 5 and REMOVES the card (CONTROL: the printed card is discarded)", () => {
    const community = searchWithScouting({ community: true }, "expert");
    expect(community.labels[2]).toContain("Remove this card");
    const communityRevealed = reveal(community.state);
    expect(communityRevealed.count).toBe(5);
    // Out of the game entirely — never the discard pile, never the ongoing tray.
    expect(communityRevealed.state.players.p1.removed).toContain("ability.scouting");
    expect(communityRevealed.state.players.p1.discard).not.toContain("ability.scouting");
    expect(communityRevealed.state.players.p1.ongoingCards ?? []).toEqual([]);
    expect(crownsSpent(communityRevealed.state)).toBe(1);

    const classic = searchWithScouting({}, "expert");
    expect(classic.labels[2]).not.toContain("Remove this card");
    const classicRevealed = reveal(classic.state);
    expect(classicRevealed.count).toBe(5);
    expect(classicRevealed.state.players.p1.removed).not.toContain("ability.scouting");
    expect(classicRevealed.state.players.p1.discard).toContain("ability.scouting");
  });

  it("BOTH PACKS ON: the community FLAT 4 wins over the Polish relative Search (X+2)", () => {
    // Base 2 → Polish would reveal 4 as well, so drive it off a base-3 Search
    // where the two printings genuinely disagree: Polish 3+2 = 5, community 4.
    function reveal(rules: Rules): number {
      const state = openTurn(`scouting-both-${JSON.stringify(rules)}`, rules);
      state.players.p1.hand = ["ability.scouting"] as CardId[];
      playScoutingCard(state, "p1", "basic");
      openSharedDeckSearch(state, "p1", "spells", 3);
      return revealed(state);
    }
    expect(reveal({ polish: true }), "polish alone widens 3 → 5").toBe(5);
    expect(reveal({ polish: true, community: true }), "community wins: flat 4").toBe(4);
    expect(reveal({ community: true })).toBe(4);
  });

  it("EMPOWERED: both buttons are offered with NO crown — the two-option Empowered face", () => {
    const state = openTurn("scouting-empowered", { community: true });
    state.players.p1.hand = ["ability.scouting"] as CardId[];
    state.players.p1.limits.expertUses = 0;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.empoweredAbilities = ["ability.scouting"] as CardId[];
    openSharedDeckSearch(state, "p1", "spells", 2);
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.options.length).toBe(3);
    const labels = choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
    expect(labels[1]).toContain("Search (4)");
    expect(labels[2]).toContain("Search (5)");

    // CONTROL: no Empowerment and no crown — only the basic button survives.
    const plain = openTurn("scouting-plain", { community: true });
    plain.players.p1.hand = ["ability.scouting"] as CardId[];
    plain.players.p1.limits.expertUses = 0;
    plain.players.p1.combatStats.expertUsesSpentThisRound = 0;
    openSharedDeckSearch(plain, "p1", "spells", 2);
    expect(plain.pendingChoice?.type === "OPTION_CHOICE" && plain.pendingChoice.options.length).toBe(2);
  });
});

// ===========================================================================
// ARTILLERY — any enemy on the basic side; the expert volley picks its target
// ===========================================================================

describe("Community pack — Artillery hits ANY enemy", () => {
  it("damages an enemy that is NOT the slowest (CONTROL: the printed card cannot)", () => {
    // Skeletons (13) are not the slowest Necropolis unit in the sandbox; pick
    // whichever enemy the CLASSIC card refuses, so the two printings diverge.
    function offeredTargets(community: boolean): string[] {
      const state = sandbox(`artillery-${community}`, { community }, ["ability.artillery"]);
      return playsOf(state, "p1", "ability.artillery", 0)
        .map((legal) => (legal.action.type === "PLAY_CARD" && legal.action.target?.type === "unit"
          ? legal.action.target.unitId
          : ""))
        .filter(Boolean)
        .sort();
    }
    const community = offeredTargets(true);
    const classic = offeredTargets(false);
    // Every living enemy is a legal target now; the printed card offers strictly
    // fewer (only the lowest-initiative ones).
    expect(community).toEqual(
      ["unit_p2_dread_knights", "unit_p2_skeletons", "unit_p2_vampires"].sort()
    );
    expect(classic.length).toBeLessThan(community.length);

    // …and the damage really lands on one the classic card refuses.
    const extra = community.find((unitId) => !classic.includes(unitId))!;
    expect(extra, "the two printings must genuinely disagree on a target").toBeTruthy();
    const state = sandbox("artillery-hit", { community: true }, ["ability.artillery"]);
    const play = playsOf(state, "p1", "ability.artillery", 0).find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === extra
    )!;
    const before = state.combat!.units[extra].damage;
    const after = applyOk(state, play.action);
    expect(after.combat!.units[extra].damage - before).toBe(1);
  });

  it("is NOT an instant reaction any more (CONTROL: the printed card is)", () => {
    expect(artilleryCardReactions(sandbox("art-react-on", { community: true }, ["ability.artillery"]), "p1")).toEqual(
      []
    );
    expect(
      artilleryCardReactions(sandbox("art-react-off", {}, ["ability.artillery"]), "p1").length
    ).toBeGreaterThan(0);
  });

  it("the EXPERT volley aims the Ballista at any enemy (CONTROL: rules off, no aim)", () => {
    function volleyCandidates(rules: Rules): number {
      const state = sandbox(
        `artillery-volley-${JSON.stringify(rules)}`,
        rules,
        ["ability.artillery", "war_machine.ballista"],
        2
      );
      putPermanentIntoPlay(state, "p1", "war_machine.ballista" as CardId);
      expect(playerCanUseArtilleryVolley(state, "p1")).toBe(true);
      // Drive the Ballista's own round-start offer and take the Artillery arm
      // (option 0 = "hit the same target 3× (expert)").
      startWarMachineRound(state);
      processWarMachineRound(state);
      const offer = state.pendingChoice;
      expect(offer?.type === "OPTION_CHOICE" && offer.context).toBe("war-machine");
      resolveWarMachineOption(state, "p1", 0);
      const pick = state.pendingChoice;
      return pick?.type === "ABILITY_TARGET_CHOICE" ? pick.candidateUnitIds.length : 0;
    }
    // With the aim, the whole living enemy board is a candidate (3 units);
    // without it, only the lowest-initiative tie is offered — strictly fewer.
    const withAim = volleyCandidates({ community: true });
    const noAim = volleyCandidates({});
    expect(withAim).toBe(3);
    expect(noAim).toBeLessThan(withAim);
  });
});

// ===========================================================================
// BALLISTICS — the bombard is playable mid-combat; the Catapult double
// ===========================================================================

describe("Community pack — Ballistics", () => {
  /** A sandbox whose combat has already begun (so `combatStartOnly` is closed). */
  function fightingSandbox(seed: string, rules: Rules): GameState {
    const state = sandbox(seed, rules, ["ability.ballistics"], 2);
    state.players.p1.resources.buildingMaterials = 2;
    // The fighting has begun: the active unit has already moved.
    state.combat!.units.unit_p1_griffins.movedThisActivation = true;
    return state;
  }

  it("the paid 2-adjacent-target bombard is playable AFTER the fight has begun (CONTROL: the Polish reprint is start-of-combat only)", () => {
    const community = fightingSandbox("ballistics-mid-community", { community: true });
    const communityPlays = playsOf(community, "p1", "ability.ballistics").filter(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        activeCard(community, "ability.ballistics").effect.type === "CHOOSE_ONE"
    );
    expect(communityPlays.length, "the community bombard must be offered mid-combat").toBeGreaterThan(0);

    const polish = fightingSandbox("ballistics-mid-polish", { polish: true });
    const polishBombard = playsOf(polish, "p1", "ability.ballistics", 5);
    expect(polishBombard, "the Polish bombard is combatStartOnly").toEqual([]);
  });

  it("really pays 1 building material and opens the two-adjacent-target picker", () => {
    let state = fightingSandbox("ballistics-pay", { community: true });
    const before = state.players.p1.resources.buildingMaterials;
    const play = playsOf(state, "p1", "ability.ballistics", 0)[0];
    expect(play, "no community Ballistics bombard offered").toBeTruthy();
    state = applyOk(state, play!.action);
    expect(before - state.players.p1.resources.buildingMaterials).toBe(1);
    expect(state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    // Units AND fortifications are candidates — the Catapult's own picker.
    expect(
      state.pendingChoice?.type === "ABILITY_TARGET_CHOICE" ? state.pendingChoice.candidateUnitIds.length : 0
    ).toBeGreaterThan(1);
  });

  it("the expert Catapult double is offered under the community rule alone (CONTROL: both rules off)", () => {
    const community = sandbox("ballistics-cat-on", { community: true }, ["ability.ballistics"], 2);
    expect(playerCanUseBallisticsCatapultDouble(community, "p1")).toBe(true);
    const off = sandbox("ballistics-cat-off", {}, ["ability.ballistics"], 2);
    expect(playerCanUseBallisticsCatapultDouble(off, "p1")).toBe(false);
    // …and it still needs the card plus a payable crown.
    const broke = sandbox("ballistics-cat-broke", { community: true }, ["ability.ballistics"], 0);
    expect(playerCanUseBallisticsCatapultDouble(broke, "p1")).toBe(false);
  });
});

// ===========================================================================
// FIRST AID — a card on both sides; the volley costs a crown again
// ===========================================================================

describe("Community pack — First Aid draws a card on both sides", () => {
  function healSandbox(seed: string, rules: Rules): GameState {
    const state = sandbox(seed, rules, ["ability.first_aid"], 2);
    // A wounded friendly unit, and a stocked deck so a draw is observable.
    state.combat!.units.unit_p1_marksmen.damage = 1;
    state.players.p1.deck = ["ability.estates", "ability.estates"] as CardId[];
    return state;
  }

  it("the basic heal removes 1 damage AND draws 1 (CONTROL: the printed heal draws nothing)", () => {
    function play(rules: Rules) {
      let state = healSandbox(`first-aid-${JSON.stringify(rules)}`, rules);
      const deckBefore = state.players.p1.deck.length;
      const heal = playsOf(state, "p1", "ability.first_aid", 0).find(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.target?.type === "unit" &&
          legal.action.target.unitId === "unit_p1_marksmen"
      );
      expect(heal, "no basic First Aid heal offered").toBeTruthy();
      state = applyOk(state, heal!.action);
      return {
        damage: state.combat!.units.unit_p1_marksmen.damage,
        drawn: deckBefore - state.players.p1.deck.length
      };
    }
    expect(play({ community: true })).toEqual({ damage: 0, drawn: 1 });
    expect(play({})).toEqual({ damage: 0, drawn: 0 });
  });

  it("the Tent volley costs a CROWN and draws 1 — even with the Polish pack also on", () => {
    function volley(rules: Rules) {
      const state = healSandbox(`first-aid-volley-${JSON.stringify(rules)}`, rules);
      const deckBefore = state.players.p1.deck.length;
      expect(playerCanUseFirstAidVolley(state, "p1")).toBe(true);
      spendFirstAidExpert(state, "p1");
      return { crowns: crownsSpent(state), drawn: deckBefore - state.players.p1.deck.length };
    }
    expect(volley({ community: true })).toEqual({ crowns: 1, drawn: 1 });
    // COMMUNITY WINS: the Polish printing makes the volley a crown-free BASIC
    // side and draws nothing — with both packs on the community reading holds.
    expect(volley({ community: true, polish: true })).toEqual({ crowns: 1, drawn: 1 });
    expect(volley({ polish: true })).toEqual({ crowns: 0, drawn: 0 });
    expect(volley({})).toEqual({ crowns: 1, drawn: 0 });
  });
});

// ===========================================================================
// WISDOM — a combat instant: +1 / +2 Power and +1 to the round's Spell limit
// ===========================================================================

describe("Community pack — Wisdom is a combat Power instant", () => {
  it("is offered as a combat play at all (CONTROL: the printed Wisdom is a Town card)", () => {
    const community = sandbox("wisdom-on", { community: true }, ["ability.wisdom"], 2);
    expect(activeCard(community, "ability.wisdom").timing).toBe("instant");
    expect(cardLibrary["ability.wisdom"]!.timing, "the printed card is a Town card").toBe("town");
  });

  /**
   * Casts Haste on an own unit and reports the buff it really landed. Haste's
   * printed ladder is Power 0 → +1, 1 → +2, 2 → +3 initiative, so the resulting
   * bonus IS a direct readout of the Power the cast resolved at — no field peek.
   */
  function hasteBonus(
    community: boolean,
    mode: "basic" | "expert" | "none"
  ): { offered: boolean; initiative: number; limitDelta: number } {
    let state = sandbox(`wisdom-haste-${community}-${mode}`, { community }, ["ability.wisdom", "spell.haste"], 2);
    const limitBefore = spellLimitFor(state, state.players.p1);
    const castAction = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.haste" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_marksmen"
    );
    expect(castAction, "no Haste cast on the Marksmen offered").toBeTruthy();
    state = applyOk(state, castAction!.action);
    const offered = true;
    if (mode !== "none") {
      const boost = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === "ability.wisdom" &&
          (legal.action.mode ?? "basic") === mode
      );
      if (!boost) {
        return { offered: false, initiative: 0, limitDelta: 0 };
      }
      state = applyOk(state, boost.action);
    }
    // Both sides pass out of the window so the cast resolves.
    let guard = 0;
    while (state.stack.length > 0 && guard < 16) {
      const passer = (["p1", "p2"] as PlayerId[])
        .map((id) => getLegalActions(state, id).find((legal) => legal.action.type === "PASS_REACTION"))
        .find(Boolean);
      if (!passer) {
        break;
      }
      state = applyOk(state, passer.action);
      guard += 1;
    }
    const haste = state.activeEffects.find((effect) => effect.name === "Haste");
    const bonus = haste?.modifiers.find((modifier) => modifier.type === "INITIATIVE_BONUS");
    return {
      offered,
      initiative: bonus?.type === "INITIATIVE_BONUS" ? bonus.amount : 0,
      limitDelta: spellLimitFor(state, state.players.p1) - limitBefore
    };
  }

  it("adds +1 (Expert +2) Power to the cast and lifts this round's Spell limit by 1", () => {
    // Baseline: the same Haste cast with no Wisdom resolves at Power 0 → +1.
    expect(hasteBonus(true, "none").initiative).toBe(1);
    // Basic Wisdom → Power 1 → +2 initiative; expert → Power 2 → +3.
    expect(hasteBonus(true, "basic")).toEqual({ offered: true, initiative: 2, limitDelta: 1 });
    expect(hasteBonus(true, "expert")).toEqual({ offered: true, initiative: 3, limitDelta: 1 });
    // CONTROL: with the rule off the printed Town card offers no cast-window
    // play at all, so the same cast stays at Power 0 → +1.
    expect(hasteBonus(false, "basic").offered).toBe(false);
    expect(hasteBonus(false, "expert").offered).toBe(false);
    expect(hasteBonus(false, "none").initiative).toBe(1);
  });
});

// ===========================================================================
// LUCK — "this turn", and one reroll PER DIE rolled
// ===========================================================================

describe("Community pack — Luck lasts this TURN and rerolls each die", () => {
  function playLuck(community: boolean): GameState {
    const state = openTurn(`luck-${community}`, { community });
    state.players.p1.hand = ["ability.luck"] as CardId[];
    const play = playsOf(state, "p1", "ability.luck").find(
      (legal) => legal.action.type === "PLAY_CARD" && (legal.action.mode ?? "basic") === "basic"
    );
    expect(play, "no basic Luck play").toBeTruthy();
    return applyOk(state, play!.action);
  }

  /**
   * Luck given to the LAST seat is the only shape that tells "this turn" from
   * "this game round" apart (the polish suite's own reasoning, inverted): the
   * round wrap runs the GAME-ROUND expiry but NOT that seat's turn start, so the
   * printed round-scoped Luck is already gone while a turn-scoped one is still
   * live and only dies when that seat's turn comes round again.
   */
  function lastSeatLuck(community: boolean): { atWrap: boolean; atOwnTurn: boolean } {
    let state = createAdventureGameState({
      seed: `community-luck-last-seat-${community}`,
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "community-card-balance": community },
      players: [
        { id: "p1", name: "First", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Second", factionId: "tower", heroDefId: "solmyr" },
        { id: "p3", name: "Last", factionId: "rampart", heroDefId: "gelu" }
      ]
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
      player.morale = 0;
    }
    const startRound = state.round;
    const step = (current: GameState): GameState => {
      const active = current.activePlayerId!;
      const legal = getLegalActions(current, active);
      const next = legal.find((option) => option.action.type === "END_TURN") ?? legal[0];
      expect(next, `no action available for ${active}`).toBeTruthy();
      return applyOk(current, next!.action);
    };
    for (let guard = 0; guard < 20 && state.activePlayerId !== "p3"; guard += 1) {
      state = step(state);
    }
    expect(state.activePlayerId).toBe("p3");
    if (state.players.p3.needsHandRefresh || state.players.p3.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p3", discardCardIds: [] });
    }
    state.players.p3.hand = ["ability.luck"] as CardId[];
    const play = getLegalActions(state, "p3").find(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.luck"
    );
    expect(play, "Luck must be playable on the map").toBeTruthy();
    state = applyOk(state, play!.action);
    expect(state.activeEffects.some((effect) => effect.name === "Luck")).toBe(true);

    for (let guard = 0; guard < 20 && state.round === startRound; guard += 1) {
      state = step(state);
    }
    expect(state.round, "the round must actually have wrapped").toBe(startRound + 1);
    expect(state.activePlayerId, "the holder's own turn must not have started yet").not.toBe("p3");
    const atWrap = state.activeEffects.some((effect) => effect.name === "Luck");

    for (let guard = 0; guard < 20 && state.activePlayerId !== "p3"; guard += 1) {
      state = step(state);
    }
    return { atWrap, atOwnTurn: state.activeEffects.some((effect) => effect.name === "Luck") };
  }

  it("survives the ROUND wrap and dies at the holder's own turn (CONTROL: the printed card dies at the wrap)", () => {
    expect(lastSeatLuck(true), "community Luck is turn-scoped").toEqual({ atWrap: true, atOwnTurn: false });
    expect(lastSeatLuck(false), "the printed card is round-scoped").toEqual({ atWrap: false, atOwnTurn: false });
  });

  it("a TWO-die Resource roll may be rerolled twice (CONTROL: the printed card offers one reroll)", () => {
    /** Rolls 2 Resource dice, takes the Luck reroll, and re-counts the offers. */
    function rerollOffersAfterOne(community: boolean): number {
      const state = playLuck(community);
      // A two-die Resource roll, resolved through the real visit machinery.
      state.adventure!.pendingVisit = {
        playerId: "p1",
        spaceId: getMainHero(state, "p1")!.spaceId,
        steps: [{ type: "ROLL_RESOURCE_DICE", count: 2, resolveCount: 2 }]
      } as unknown as NonNullable<GameState["adventure"]>["pendingVisit"];
      pumpAdventureQueues(state);
      const rerollOptions = (current: GameState): string[] => {
        const step = current.adventure!.pendingVisit?.steps[0];
        return step?.type === "CHOOSE_ONE"
          ? step.options.map((option) => option.label).filter((label) => /reroll the Resource/i.test(label))
          : [];
      };
      const first = rerollOptions(state);
      expect(first.length, "the first reroll must be on offer under both printings").toBe(1);
      // Take it, exactly as the player would.
      const step = state.adventure!.pendingVisit!.steps[0];
      expect(step.type).toBe("CHOOSE_ONE");
      const index =
        step.type === "CHOOSE_ONE"
          ? step.options.findIndex((option) => /reroll the Resource/i.test(option.label))
          : -1;
      expect(index).toBeGreaterThanOrEqual(0);
      resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: index });
      // CONSUME_LUCK then the re-roll both auto-resolve.
      pumpAdventureQueues(state);
      return rerollOptions(state).length;
    }
    expect(rerollOffersAfterOne(true), "a second per-die reroll is still on offer").toBe(1);
    expect(rerollOffersAfterOne(false), "the printed card is spent for the round").toBe(0);
  });
});

// ===========================================================================
// MYSTICISM — the basic recall also takes back one alongside card
// ===========================================================================

describe("Community pack — Mysticism basic recalls 1 alongside card", () => {
  it("returns the Spell AND the Power card played with it (CONTROL: the printed basic returns only the Spell)", () => {
    function recall(community: boolean): { spell: boolean; support: boolean } {
      let state = sandbox(`mysticism-${community}`, { community }, [
        "ability.mysticism",
        "spell.magic_arrow",
        "ability.sorcery"
      ]);
      const castAction = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.magic_arrow"
      );
      expect(castAction, "no Magic Arrow cast offered").toBeTruthy();
      state = applyOk(state, castAction!.action);
      // Play Sorcery into the cast (the "card played alongside" the Spell) …
      const power = getLegalActions(state, "p1").find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.sorcery"
      );
      expect(power, "no Sorcery power boost offered").toBeTruthy();
      state = applyOk(state, power!.action);
      // … then Mysticism (basic).
      const mysticism = getLegalActions(state, "p1").find(
        (legal) =>
          legal.action.type === "PLAY_REACTION" &&
          legal.action.cardId === "ability.mysticism" &&
          (legal.action.mode ?? "basic") === "basic"
      );
      expect(mysticism, "no basic Mysticism recall offered").toBeTruthy();
      state = applyOk(state, mysticism!.action);
      // Resolve the cast so the deferred recall fires: both sides pass out of
      // the open window until the stack empties.
      let guard = 0;
      while (state.stack.length > 0 && guard < 16) {
        const passer = (["p1", "p2"] as PlayerId[])
          .map((id) => getLegalActions(state, id).find((legal) => legal.action.type === "PASS_REACTION"))
          .find(Boolean);
        if (!passer) {
          break;
        }
        state = applyOk(state, passer.action);
        guard += 1;
      }
      expect(state.stack.length, "the cast must have resolved").toBe(0);
      return {
        spell: state.players.p1.hand.includes("spell.magic_arrow" as CardId),
        support: state.players.p1.hand.includes("ability.sorcery" as CardId)
      };
    }
    expect(recall(true)).toEqual({ spell: true, support: true });
    expect(recall(false)).toEqual({ spell: true, support: false });
  });
});

// ===========================================================================
// TACTICS — no setup window; basic is free mid-combat, expert reads the board
// ===========================================================================

describe("Community pack — Tactics", () => {
  function tacticsSandbox(seed: string, rules: Rules, crowns = 0): GameState {
    return sandbox(seed, rules, ["ability.tactics"], crowns);
  }

  function swaps(state: GameState) {
    return getLegalActions(state, "p1").filter((legal) => legal.action.type === "SWAP_COMBAT_UNITS");
  }

  it("the mid-combat swap needs NO crown (CONTROL: the printed card needs one)", () => {
    const community = tacticsSandbox("tactics-free", { community: true }, 0);
    expect(swaps(community).length, "the community basic side is crown-free").toBeGreaterThan(0);
    const classic = tacticsSandbox("tactics-crown", {}, 0);
    expect(swaps(classic), "the printed swap is Expert-only").toEqual([]);

    // …and it really spends no crown when taken.
    const after = applyOk(community, swaps(community)[0].action);
    expect(crownsSpent(after)).toBe(0);
    expect(after.players.p1.hand).not.toContain("ability.tactics");
  });

  it("EXPERT: with an ENEMY unit about to activate the swap is offered for a crown (CONTROL: never on the printed card)", () => {
    function offered(rules: Rules, crowns: number): number {
      const state = tacticsSandbox(`tactics-enemy-${JSON.stringify(rules)}-${crowns}`, rules, crowns);
      // The unit about to act belongs to the OPPONENT.
      state.combat!.activeUnitId = "unit_p2_vampires";
      return swaps(state).length;
    }
    expect(offered({ community: true }, 2), "community expert reads any active unit").toBeGreaterThan(0);
    expect(offered({ community: true }, 0), "…and still needs a crown").toBe(0);
    expect(offered({}, 2), "the printed card is your-own-unit only").toBe(0);

    const state = tacticsSandbox("tactics-enemy-spend", { community: true }, 2);
    state.combat!.activeUnitId = "unit_p2_vampires";
    const after = applyOk(state, swaps(state)[0].action);
    expect(crownsSpent(after)).toBe(1);
  });

  it("no start-of-Combat Tactics window is OPENED (CONTROL: the printed card opens one)", () => {
    /**
     * Walks a REAL level-I mine fight to the end of placement — the moment
     * `openTacticsSetupWindows` runs — and reports whether a window opened.
     * (The exact shape `tactics-diplomacy.test.ts` uses for the printed card.)
     */
    function setupWindowOpened(rules: Rules): boolean {
      let state = openTurn(`tactics-setup-${JSON.stringify(rules)}`, rules);
      state.players.p1.hand = ["ability.tactics"] as CardId[];
      expect(state.players.p1.army.length).toBeGreaterThanOrEqual(2);
      state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
      const [a, b] = state.players.p1.army;
      state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: a.id, position: 13 });
      state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: b.id, position: 17 });
      state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
      return (state.combat?.pendingTacticsSwaps ?? []).length > 0;
    }
    expect(setupWindowOpened({ community: true }), "the reprint has no start-of-combat side").toBe(false);
    expect(setupWindowOpened({}), "the printed card opens the setup window").toBe(true);
  });
});
