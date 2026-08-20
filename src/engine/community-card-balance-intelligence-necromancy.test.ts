/**
 * Heroes 3 Board Game Community Balance Change (`community-card-balance`) — the
 * last two reprinted ABILITY cards: INTELLIGENCE and NECROMANCY.
 *
 * These two were declared unimplemented while the pack shipped; this suite is
 * the "done" bar for them (CLAUDE.md #1/#1a). Every claim is an OBSERVABLE
 * outcome through the real pipeline — a target really takes damage, gold really
 * leaves the purse, a unit card really joins the army — paired with a rule-OFF
 * CONTROL on the SAME setup, so a passing case proves the reprint is what moved
 * the number.
 *
 * LEADING WITH THE LIMITS these tests deliberately encode:
 *   • Intelligence's cast is NOT offered inside an already-open reaction window
 *     — `isCombatCardWindowOpen` refuses every CAST_SPELL there (Scrolls, the
 *     Helm and Ciele included). It IS offered off-turn, which is what the
 *     printed ⚡ buys in this engine.
 *   • With `polish-spell-book` on, "your discard pile" is read PLAINLY: the
 *     caster's own discard, never the Spell Book.
 *   • The community Necromancy always resolves INSIDE the after-combat window
 *     and never banks a discount, so `immediate-reinforcement-prompts` is
 *     ignored while the pack is on.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { computerDecisionOwner } from "./computer/window";
import { balanceCardLibrary } from "./community-balance-cards";
import { cardLibrary } from "@/data/cards/library";
import type { CardId, GameAction, GameState, PlayerId } from "./state";

type Rules = { community?: boolean; polish?: boolean };

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function crownsSpent(state: GameState, playerId: PlayerId = "p1"): number {
  return state.players[playerId].combatStats.expertUsesSpentThisRound;
}

/** The definition the engine really reads for `cardId` under these rules. */
function activeCard(state: GameState, cardId: string) {
  return balanceCardLibrary(state, { ...cardLibrary })[cardId]!;
}

// ===========================================================================
// INTELLIGENCE — "Play a spell from your discard pile."
// Expert: it does not count toward your Spell limit per Combat round.
// ===========================================================================

const INTELLIGENCE = "ability.intelligence";
const MAGIC_ARROW = "spell.magic_arrow";

/**
 * A sandbox combat with Intelligence in p1's hand, `discard` as p1's OWN discard
 * pile and p1's Griffins the fresh active unit. The SHARED Spell-deck discard is
 * deliberately emptied — the community Intelligence must read the player's own
 * pile only (the Ciele-IV precedent, `conflux-ciele-specialty.test.ts`).
 */
function intelligenceCombat(seed: string, rules: Rules, discard: string[], crowns = 0): GameState {
  const state = createInitialGameState(seed);
  state.adventure = {
    houseRules: {
      "community-card-balance": Boolean(rules.community),
      "polish-card-balance": Boolean(rules.polish)
    }
  } as unknown as GameState["adventure"];
  state.players.p1.hand = [INTELLIGENCE] as CardId[];
  state.players.p2.hand = [];
  state.players.p1.limits.expertUses = crowns;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  state.players.p1.discard = discard as CardId[];
  state.decks.spells.discardPile = [];
  const target = state.combat!.units.unit_p2_skeletons;
  target.maxHealth = 20;
  target.damage = 0;
  const griffins = state.combat!.units.unit_p1_griffins;
  griffins.activatedThisRound = false;
  griffins.movedThisActivation = false;
  griffins.attackedThisActivation = false;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

/** Every "play a spell from your discard pile" offer, optionally filtered by side. */
function discardCasts(state: GameState, mode?: "basic" | "expert", playerId: PlayerId = "p1") {
  return getLegalActions(state, playerId).filter(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.fromSpellDeck === INTELLIGENCE &&
      legal.action.fromOwnDiscard === true &&
      (mode === undefined || (legal.action.castEnablerMode ?? "basic") === mode)
  );
}

function arrowCast(state: GameState, mode: "basic" | "expert") {
  return discardCasts(state, mode).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === MAGIC_ARROW &&
      legal.action.target.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
}

describe("Community pack — Intelligence plays a spell from your discard pile", () => {
  it("is swapped in by the rule (non-vacuity) and becomes a cast enabler, not an active effect", () => {
    const on = intelligenceCombat("intel-swap-on", { community: true }, []);
    const off = intelligenceCombat("intel-swap-off", {}, []);
    expect(activeCard(on, INTELLIGENCE)).not.toBe(cardLibrary[INTELLIGENCE]);
    expect(activeCard(on, INTELLIGENCE).effect.type).toBe("CHOOSE_ONE");
    expect(activeCard(off, INTELLIGENCE)).toBe(cardLibrary[INTELLIGENCE]);
    expect(activeCard(off, INTELLIGENCE).effect.type).toBe("CREATE_ACTIVE_EFFECT");
  });

  it("is never a hand PLAY_CARD any more — no dead button (CONTROL: the classic card IS one)", () => {
    const on = intelligenceCombat("intel-noplay", { community: true }, [MAGIC_ARROW], 2);
    const plays = (state: GameState) =>
      getLegalActions(state, "p1").filter(
        (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === INTELLIGENCE
      );
    expect(plays(on)).toHaveLength(0);
    // …while the cast offers it really surfaces do exist (non-vacuity).
    expect(discardCasts(on).length).toBeGreaterThan(0);
    expect(plays(intelligenceCombat("intel-noplay-off", {}, [MAGIC_ARROW], 2)).length).toBeGreaterThan(0);
  });

  it("really casts the discarded Spell: the target takes damage, the Spell stays in the discard, the ability is spent", () => {
    const state = intelligenceCombat("intel-basic", { community: true }, [MAGIC_ARROW]);
    const cast = arrowCast(state, "basic");
    expect(cast, "the discarded Magic Arrow should be castable").toBeTruthy();

    const after = passAllReactions(applyOk(state, cast!.action));
    // The OBSERVABLE outcome: a Power-0 Magic Arrow deals 1 damage.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // The Spell was cast FROM the discard and its normal post-cast zone IS the
    // discard, so it stays there — and never leaks into the shared Spell deck.
    expect(after.players.p1.discard).toContain(MAGIC_ARROW);
    expect(after.decks.spells.discardPile).not.toContain(MAGIC_ARROW);
    // Intelligence is an Ability card, so it CYCLES to the discard (redrawable),
    // never removed from the game like the Helm of the Alabaster Unicorn.
    expect(after.players.p1.discard).toContain(INTELLIGENCE);
    expect(after.players.p1.removed ?? []).not.toContain(INTELLIGENCE);
    expect(after.players.p1.hand).not.toContain(INTELLIGENCE);
    // …and the play is logged exactly once.
    expect(
      after.eventLog.filter((event) => event.type === "CARD_PLAYED" && event.cardId === INTELLIGENCE)
    ).toHaveLength(1);
  });

  it("CONTROL: with the rule OFF the classic Intelligence offers no discard cast at all", () => {
    const off = intelligenceCombat("intel-off", {}, [MAGIC_ARROW]);
    expect(discardCasts(off)).toHaveLength(0);
    // With BOTH packs on the COMMUNITY card wins, so the polish reprint's
    // "Intelligence in hand" hand reading goes dark and the cast is offered.
    const both = intelligenceCombat("intel-both", { community: true, polish: true }, [MAGIC_ARROW]);
    expect(discardCasts(both, "basic").length).toBeGreaterThan(0);
    // …and the POLISH-only table keeps its own card untouched.
    const polishOnly = intelligenceCombat("intel-polish", { polish: true }, [MAGIC_ARROW]);
    expect(discardCasts(polishOnly)).toHaveLength(0);
  });

  it("PRECEDENCE: with both packs on, holding Intelligence no longer buys the POLISH timing freedom", () => {
    /**
     * The polish reprint reads "Intelligence in hand" to lift the activation gate
     * at the start of a combat; the community card grants no freedom at all, so
     * that hand reading must go dark (`polishIntelligenceHandReadingActive`).
     * Measured on a HAND SPELL — nothing to do with the discard cast — with no
     * unit of p1's active, which is exactly where the two readings diverge.
     */
    function handSpellOffered(rules: Rules): boolean {
      const state = intelligenceCombat(`intel-freedom-${JSON.stringify(rules)}`, rules, []);
      state.players.p1.hand = [INTELLIGENCE, MAGIC_ARROW] as CardId[];
      // Nobody of p1's is active and the fight has not begun: the polish window
      // is OPEN, so only the hand reading decides.
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_skeletons";
      return getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === MAGIC_ARROW && !legal.action.fromSpellDeck
      );
    }
    expect(handSpellOffered({ polish: true }), "the polish card lifts the gate").toBe(true);
    expect(handSpellOffered({ polish: true, community: true }), "the community card wins and lifts nothing").toBe(false);
    expect(handSpellOffered({ community: true })).toBe(false);
  });

  it("BASIC spends the round's Spell allowance; EXPERT does not and pays a crown (the discriminating pair)", () => {
    const basicState = intelligenceCombat("intel-limit-basic", { community: true }, [MAGIC_ARROW]);
    const basic = passAllReactions(applyOk(basicState, arrowCast(basicState, "basic")!.action));
    expect(basic.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(basic.players.p1.combatStats.spellsCastThisRound).toBe(1);
    expect(crownsSpent(basic)).toBe(0);

    const expertState = intelligenceCombat("intel-limit-expert", { community: true }, [MAGIC_ARROW], 1);
    const expert = passAllReactions(applyOk(expertState, arrowCast(expertState, "expert")!.action));
    expect(expert.combat!.units.unit_p2_skeletons.damage).toBe(1);
    // The whole point of the Expert side: the allowance is untouched.
    expect(expert.players.p1.combatStats.spellsCastThisRound).toBe(0);
    expect(crownsSpent(expert)).toBe(1);
  });

  it("once the allowance is spent only the EXPERT side is still offered", () => {
    const state = intelligenceCombat("intel-limit-spent", { community: true }, [MAGIC_ARROW], 1);
    state.players.p1.combatStats.spellsCastThisRound = 1;
    expect(discardCasts(state, "basic")).toHaveLength(0);
    expect(discardCasts(state, "expert").length).toBeGreaterThan(0);
  });

  it("the EXPERT side is withheld with no crown to spend", () => {
    const broke = intelligenceCombat("intel-no-crown", { community: true }, [MAGIC_ARROW], 0);
    expect(discardCasts(broke, "expert")).toHaveLength(0);
    expect(discardCasts(broke, "basic").length).toBeGreaterThan(0);
  });

  it("EMPOWERED: the expert side is offered and cast with NO crown", () => {
    const state = intelligenceCombat("intel-empowered", { community: true }, [MAGIC_ARROW], 0);
    state.players.p1.empoweredAbilities = [INTELLIGENCE] as CardId[];
    const cast = arrowCast(state, "expert");
    expect(cast, "an Empowered Intelligence must offer its expert side at 0 crowns").toBeTruthy();
    const after = passAllReactions(applyOk(state, cast!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(after.players.p1.combatStats.spellsCastThisRound).toBe(0);
    expect(crownsSpent(after)).toBe(0);
  });

  it("a Spell that is NOT in your discard pile is not castable — from hand, the shared deck, or nowhere", () => {
    // Empty discard: no offer at all.
    const empty = intelligenceCombat("intel-empty", { community: true }, []);
    expect(discardCasts(empty)).toHaveLength(0);
    // The SHARED Spell-deck discard is the wrong pile (that is the Helm's source).
    const shared = intelligenceCombat("intel-shared", { community: true }, []);
    shared.decks.spells.discardPile = [MAGIC_ARROW as CardId];
    expect(discardCasts(shared)).toHaveLength(0);
    // A copy in HAND is not "in your discard pile" either.
    const held = intelligenceCombat("intel-hand", { community: true }, []);
    held.players.p1.hand = [INTELLIGENCE, MAGIC_ARROW] as CardId[];
    expect(discardCasts(held)).toHaveLength(0);
    // A forged cast is REFUSED by the reducer, not merely hidden by the offers.
    const forged = applyAction(empty, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: MAGIC_ARROW as CardId,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      fromSpellDeck: INTELLIGENCE as CardId,
      fromOwnDiscard: true,
      castEnablerMode: "basic"
    });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("a forged EXPERT cast with no crown is refused", () => {
    const state = intelligenceCombat("intel-forged-expert", { community: true }, [MAGIC_ARROW], 0);
    const forged = applyAction(state, {
      type: "CAST_SPELL",
      playerId: "p1",
      cardId: MAGIC_ARROW as CardId,
      target: { type: "unit", unitId: "unit_p2_skeletons" },
      fromSpellDeck: INTELLIGENCE as CardId,
      fromOwnDiscard: true,
      castEnablerMode: "expert"
    });
    expect(forged.errors.length).toBeGreaterThan(0);
    expect(forged.state.players.p1.hand).toContain(INTELLIGENCE);
  });

  it("is a real INSTANT: castable off-turn, while an opponent's unit is active", () => {
    const state = intelligenceCombat("intel-offturn", { community: true }, [MAGIC_ARROW]);
    // The opponent holds the turn and no unit of p1's is active.
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p1_griffins.activatedThisRound = true;
    const cast = arrowCast(state, "basic");
    expect(cast, "the printed instant must reach an off-turn moment").toBeTruthy();
    const after = passAllReactions(applyOk(state, cast!.action));
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(1);
  });

  it("opens NO engine window, so no computer / AFK seat can stall on it", () => {
    const state = intelligenceCombat("intel-no-stall", { community: true }, [MAGIC_ARROW], 1);
    // The offers exist…
    expect(discardCasts(state).length).toBeGreaterThan(0);
    // …but they are ordinary OPTIONAL actions: nothing owes a decision, so the
    // runner's window read names nobody (no `computer/window.ts` lockstep needed).
    expect(computerDecisionOwner(state)).toBeNull();
    expect(state.pendingChoice ?? null).toBeNull();
    const after = passAllReactions(applyOk(state, arrowCast(state, "basic")!.action));
    expect(after.pendingChoice ?? null).toBeNull();
    expect(computerDecisionOwner(after)).toBeNull();
  });
});

// ===========================================================================
// NECROMANCY — Recruit OR Reinforce a unit you have the DWELLING for, at half
// the gold cost (rounded down). Expert: any unit.
// ===========================================================================

const NECROMANCY = "ability.necromancy";

/**
 * A Necropolis game parked in the open after-combat Necromancy window with the
 * card in hand. With the pack OFF the CONTROL also forces
 * `immediate-reinforcement-prompts`, so both sides open the SAME in-window
 * prompt and the comparison is about the pack's RULES, not about banking.
 */
function necroWindow(seed: string, community: boolean): GameState {
  const state = createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "normal",
    players: [
      { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ],
    rollFirstPlayer: false,
    houseRules: {
      "community-card-balance": community,
      "immediate-reinforcement-prompts": !community
    }
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.players.p1.hand = [NECROMANCY] as CardId[];
  state.players.p1.necromancyWindow = true;
  state.adventure!.pendingNecromancy = { playerId: "p1" };
  // The starting army already holds every bronze Few, which would hide the
  // recruit arm behind the "each unit card exists once" rule.
  state.players.p1.army = [];
  state.players.p1.resources.gold = 60;
  return state;
}

function playNecromancy(state: GameState, mode: "basic" | "expert" = "basic"): GameState {
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === NECROMANCY &&
      (legal.action.mode ?? "basic") === mode
  );
  expect(play, `no ${mode} Necromancy play`).toBeTruthy();
  return applyOk(state, play!.action);
}

/** The labels of the queued Necromancy prompt's options. */
function promptLabels(state: GameState): string[] {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "RESOLVE_VISIT_STEP")
    .map((legal) => legal.label);
}

describe("Community pack — Necromancy Recruits, and is Dwelling-gated", () => {
  it("is swapped in by the rule (non-vacuity), keeping the after-combat engine marker", () => {
    const on = necroWindow("necro-swap-on", true);
    const off = necroWindow("necro-swap-off", false);
    expect(activeCard(on, NECROMANCY)).not.toBe(cardLibrary[NECROMANCY]);
    expect(activeCard(off, NECROMANCY)).toBe(cardLibrary[NECROMANCY]);
    expect(activeCard(on, NECROMANCY).effect.type).toBe("NECROMANCY_REINFORCE");
  });

  it("offers a RECRUIT only for a unit whose Dwelling is built (CONTROL: no Dwelling, no offer)", () => {
    const withDwelling = playNecromancy(necroWindow("necro-recruit", true));
    // The starting Necropolis town has the BRONZE Dwelling built.
    expect(promptLabels(withDwelling).filter((label) => /^Recruit few /.test(label)).length).toBeGreaterThan(0);
    expect(promptLabels(withDwelling).some((label) => /Recruit few Zombies/.test(label))).toBe(true);

    // Same game with every Dwelling gone: the recruit arm disappears entirely.
    const bare = necroWindow("necro-recruit-nodwelling", true);
    bare.towns.town_p1.buildings = ["necropolis.citadel"];
    expect(promptLabels(playNecromancy(bare)).filter((label) => /^Recruit few /.test(label))).toHaveLength(0);
  });

  it("CONTROL: with the rule OFF Necromancy has no Recruit arm at all", () => {
    const off = playNecromancy(necroWindow("necro-recruit-off", false));
    expect(promptLabels(off).filter((label) => /^Recruit few /.test(label))).toHaveLength(0);
  });

  it("charges HALF the printed gold, rounded DOWN, and really adds the Few to the army", () => {
    let state = playNecromancy(necroWindow("necro-recruit-price", true));
    // Zombies print 3 gold: floor(3/2) = 1 — NOT the 2 a round-UP reading pays
    // (Wraiths, printed 4, are the 2-gold neighbour that would collide with it).
    expect(promptLabels(state)).toContain("Recruit few Zombies (1 gold)");
    expect(promptLabels(state)).toContain("Recruit few Wraiths (2 gold)");
    const goldBefore = state.players.p1.resources.gold;
    const pick = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Recruit few Zombies/.test(legal.label)
    );
    state = applyOk(state, pick!.action);
    expect(goldBefore - state.players.p1.resources.gold).toBe(1);
    expect(
      state.players.p1.army.filter((unit) => unit.unitDefId === "necropolis.zombies" && unit.side === "few")
    ).toHaveLength(1);
    // The card is spent because a unit really joined the army.
    expect(state.players.p1.discard).toContain(NECROMANCY);
    expect(state.players.p1.hand).not.toContain(NECROMANCY);
  });

  it("tier gate: BASIC reaches bronze/silver only, EXPERT reaches gold too", () => {
    const allDwellings = [
      "necropolis.citadel",
      "necropolis.dwelling_bronze",
      "necropolis.dwelling_silver",
      "necropolis.dwelling_gold"
    ];

    const basicState = necroWindow("necro-tier-basic", true);
    basicState.towns.town_p1.buildings = allDwellings;
    const basic = promptLabels(playNecromancy(basicState));
    expect(basic.some((label) => /Recruit few Vampires/.test(label)), "silver is in range").toBe(true);
    expect(basic.some((label) => /Recruit few Dread Knights/.test(label)), "gold is NOT").toBe(false);

    const expertState = necroWindow("necro-tier-expert", true);
    expertState.towns.town_p1.buildings = allDwellings;
    expertState.players.p1.limits.expertUses = 2;
    expertState.players.p1.combatStats.expertUsesSpentThisRound = 0;
    const expert = promptLabels(playNecromancy(expertState, "expert"));
    expect(expert.some((label) => /Recruit few Dread Knights/.test(label))).toBe(true);
  });

  it("the REINFORCE arm is Dwelling-gated under the rule, and NOT with the rule off", () => {
    // A silver Few while only the BRONZE Dwelling is built.
    const gated = necroWindow("necro-reinforce-gated", true);
    gated.players.p1.army = [{ id: "army_vamp", unitDefId: "necropolis.vampires", side: "few" }];
    expect(promptLabels(playNecromancy(gated)).some((label) => /Reinforce Vampires/.test(label))).toBe(false);

    const ungated = necroWindow("necro-reinforce-ungated", false);
    ungated.players.p1.army = [{ id: "army_vamp", unitDefId: "necropolis.vampires", side: "few" }];
    expect(promptLabels(playNecromancy(ungated)).some((label) => /Reinforce Vampires/.test(label))).toBe(true);

    // …and with the silver Dwelling built the community card offers it again.
    const unlocked = necroWindow("necro-reinforce-unlocked", true);
    unlocked.players.p1.army = [{ id: "army_vamp", unitDefId: "necropolis.vampires", side: "few" }];
    unlocked.towns.town_p1.buildings = [
      "necropolis.citadel",
      "necropolis.dwelling_bronze",
      "necropolis.dwelling_silver"
    ];
    expect(promptLabels(playNecromancy(unlocked)).some((label) => /Reinforce Vampires/.test(label))).toBe(true);
  });

  it("a recruited NEUTRAL card is never eligible — it is on no roster and has no Dwelling", () => {
    const state = necroWindow("necro-neutral", true);
    state.players.p1.army = [{ id: "army_neutral", unitDefId: "neutral.gold_golems", side: "neutral" }];
    expect(promptLabels(playNecromancy(state)).some((label) => /Golem/i.test(label))).toBe(false);
  });

  it("the window still resolves cleanly: Skip keeps the card and leaves no pending visit", () => {
    let state = playNecromancy(necroWindow("necro-skip", true));
    const skip = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Skip/.test(legal.label)
    );
    expect(skip, "the community prompt must still offer a Skip").toBeTruthy();
    state = applyOk(state, skip!.action);
    expect(state.players.p1.hand).toContain(NECROMANCY);
    expect(state.players.p1.discard).not.toContain(NECROMANCY);
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
    // The after-combat transaction is still open and still closable.
    expect(state.adventure?.pendingNecromancy?.playerId).toBe("p1");
    const resolve = getLegalActions(state, "p1").find((legal) => legal.action.type === "SKIP_NECROMANCY");
    expect(resolve).toBeTruthy();
    state = applyOk(state, resolve!.action);
    expect(state.adventure?.pendingNecromancy ?? null).toBeNull();
  });

  it("never BANKS a discount under the rule (CONTROL: the classic card does)", () => {
    // `immediate-reinforcement-prompts` is OFF in the community game, and the
    // pack still resolves in-window rather than banking.
    const community = necroWindow("necro-nobank", true);
    community.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    const played = playNecromancy(community);
    expect(played.players.p1.reinforcementDiscounts ?? []).toHaveLength(0);
    expect(Boolean(played.adventure?.pendingVisit) || (played.adventure?.rewardQueue.length ?? 0) > 0).toBe(true);

    // The classic card with the same toggle off DOES bank one.
    const classic = necroWindow("necro-bank-control", false);
    classic.adventure!.houseRules = {
      ...(classic.adventure!.houseRules ?? {}),
      "immediate-reinforcement-prompts": false
    };
    classic.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    const banked = playNecromancy(classic);
    expect((banked.players.p1.reinforcementDiscounts ?? []).length).toBe(1);
  });
});
