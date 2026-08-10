import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  effectHasExpertMode,
  expertUsesAvailable,
  getLegalActions
} from "./index";
import { gainExperience, getMainHero, levelOfExperience } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { cardLibrary } from "@/data/cards/library";
import type { CardDefinition, GameAction, GameState, PlayerId } from "./state";

/**
 * "ALL EMPOWERED STATISTIC AND ABILITIES ARE VERY BUGGY, CHECK all properly."
 *
 * An EMPOWERED card (its id in `player.empoweredAbilities` — the Ability Empower
 * token, a Creature-Bank / designer reward, or the computer's temporary combat
 * boost) plays its EXPERT side WITHOUT spending a crown, and must therefore be
 * OFFERED even at 0 crowns. This file pins that invariant at every seam that
 * spends a crown for an Expert side, through the REAL offer + resolution
 * pipelines, each with a non-empowered CONTROL that still pays.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function crownsSpent(state: GameState, playerId: PlayerId = "p1"): number {
  return state.players[playerId].combatStats.expertUsesSpentThisRound;
}

/** END_COMBAT_ROUND with the active unit cleared, so the round may end here. */
function endRound(state: GameState, playerId: PlayerId): GameState {
  state.combat!.activeUnitId = null;
  state.activePlayerId = playerId;
  return applyOk(state, { type: "END_COMBAT_ROUND", playerId });
}

// ===========================================================================
// 1. THE REPORTED BUG — the after-combat Necromancy window
// ===========================================================================

function necromancyWindow(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
  const state = createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "normal",
    players: [
      { id: "p1", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ],
    rollFirstPlayer: false
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.players.p1.hand = ["ability.necromancy"];
  state.players.p1.necromancyWindow = true;
  state.adventure!.pendingNecromancy = { playerId: "p1" };
  state.players.p1.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
  state.players.p1.resources.gold = 30;
  state.players.p1.limits.expertUses = opts.crowns;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  state.players.p1.combatStats.expertUseBonusThisRound = 0;
  if (opts.empowered) {
    state.players.p1.empoweredAbilities = ["ability.necromancy"];
  }
  return state;
}

function necromancyPlays(state: GameState) {
  return getLegalActions(state, "p1").filter(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.necromancy"
  );
}

describe("Empowered Necromancy — the reported bug", () => {
  it("offers ONLY the expert side (no basic trap button) and spends NO crown", () => {
    let state = necromancyWindow("empowered-necro", { empowered: true, crowns: 2 });

    const plays = necromancyPlays(state);
    // The whole complaint: it "STILL ASK[S] TO CHOOSE BETWEEN BASIC AND EXPERT".
    // Empowered, the expert side (ANY unit, half gold) strictly supersedes basic
    // (bronze/silver only, same cost, same discard) — so basic is withheld.
    expect(plays.map((play) => (play.action as { mode?: string }).mode)).toEqual(["expert"]);

    state = applyOk(state, plays[0].action);
    expect(crownsSpent(state), "an Empowered Expert side costs no crown").toBe(0);
    expect(expertUsesAvailable(state.players.p1)).toBe(2);
  });

  it("is offered — and resolves — with ZERO crowns left", () => {
    let state = necromancyWindow("empowered-necro-broke", { empowered: true, crowns: 0 });
    expect(expertUsesAvailable(state.players.p1)).toBe(0);

    const plays = necromancyPlays(state);
    expect(plays.map((play) => (play.action as { mode?: string }).mode)).toEqual(["expert"]);

    state = applyOk(state, plays[0].action);
    expect(crownsSpent(state)).toBe(0);
  });

  it("CONTROL: a NON-empowered holder still chooses basic vs expert, and expert pays a crown", () => {
    let state = necromancyWindow("plain-necro", { empowered: false, crowns: 2 });

    const plays = necromancyPlays(state);
    const modes = plays.map((play) => (play.action as { mode?: string }).mode);
    expect(modes).toContain("basic");
    expect(modes).toContain("expert");

    const expert = plays.find((play) => (play.action as { mode?: string }).mode === "expert")!;
    state = applyOk(state, expert.action);
    expect(crownsSpent(state), "a plain expert Necromancy costs a crown").toBe(1);
  });

  it("CONTROL: a NON-empowered holder with 0 crowns gets the basic side only", () => {
    const state = necromancyWindow("plain-necro-broke", { empowered: false, crowns: 0 });
    expect(necromancyPlays(state).map((play) => (play.action as { mode?: string }).mode)).toEqual(["basic"]);
  });
});

// ===========================================================================
// 2. LIBRARY-DERIVED INVARIANT — the two main pipelines
// ===========================================================================

/** Whether ANY printed side of the card has an expert mode the engine can offer. */
function cardHasExpertSide(card: CardDefinition): boolean {
  if (card.effect.type !== "CHOOSE_ONE" && effectHasExpertMode(card.effect)) {
    return true;
  }
  if (card.effect.type === "CHOOSE_ONE") {
    return card.effect.options.some(
      (option) =>
        option.expertOnly === true ||
        option.expertUnlessHouseRule !== undefined ||
        effectHasExpertMode(option.effect) ||
        ("expertAmount" in option.effect && option.effect.expertAmount !== undefined) ||
        ("expertGain" in option.effect && option.effect.expertGain !== undefined) ||
        ("expertEffect" in option.effect && option.effect.expertEffect !== undefined) ||
        ("expertRerolls" in option.effect && option.effect.expertRerolls !== undefined)
    );
  }
  return (
    ("expertAmount" in card.effect && card.effect.expertAmount !== undefined) ||
    ("expertGain" in card.effect && card.effect.expertGain !== undefined) ||
    ("expertEffect" in card.effect && card.effect.expertEffect !== undefined) ||
    ("expertRerolls" in card.effect && card.effect.expertRerolls !== undefined) ||
    ("expertDrawCards" in card.effect && card.effect.expertDrawCards !== undefined)
  );
}

/** Every implemented ability / statistic / artifact / specialty with an expert side. */
const EXPERT_CAPABLE_CARDS: CardDefinition[] = Object.values(cardLibrary).filter(
  (card) =>
    card.implementationStatus === "implemented" &&
    (card.kind === "ability" ||
      card.kind === "statistic" ||
      card.kind === "artifact" ||
      card.kind === "hero-specialty") &&
    cardHasExpertSide(card)
);

function expertOffersOf(state: GameState, cardId: string, type: "PLAY_CARD" | "PLAY_REACTION") {
  return getLegalActions(state, "p1").filter(
    (legal) =>
      legal.action.type === type &&
      (legal.action as { cardId?: string }).cardId === cardId &&
      (legal.action as { mode?: string }).mode === "expert"
  );
}

/** Sandbox combat with p1 holding one card, `crowns` crowns, optionally Empowered. */
function soloCardState(seed: string, cardId: string, opts: { empowered: boolean; crowns: number }): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [cardId];
  state.players.p2.hand = [];
  state.players.p1.limits.expertUses = opts.crowns;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  state.players.p1.combatStats.expertUseBonusThisRound = 0;
  if (opts.empowered) {
    state.players.p1.empoweredAbilities = [cardId];
  }
  state.activePlayerId = "p1";
  return state;
}

/** The same solo state with an attack declared, so a reaction window is open. */
function openedWindow(state: GameState): GameState {
  state.combat!.units.unit_p1_griffins.position = 9; // adjacent to the skeletons
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.dice.scriptedRolls = [1, -1, 1, -1, 1, -1];
  const attacked = applyAction(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_skeletons"
  });
  return attacked.state;
}

describe("Empowered expert sides are crown-free — library sweep (turn PLAY_CARD pipeline)", () => {
  it("every expert offer an EMPOWERED holder gets at 0 crowns resolves without spending one", () => {
    let covered = 0;
    for (const card of EXPERT_CAPABLE_CARDS) {
      const state = soloCardState(`sweep-play-${card.id}`, card.id, { empowered: true, crowns: 0 });
      const offers = expertOffersOf(state, card.id, "PLAY_CARD");
      for (const offer of offers) {
        covered += 1;
        const result = applyAction(state, offer.action);
        expect(
          result.errors,
          `${card.id}: an offered Empowered expert play must be legal — ${result.errors
            .map((error) => error.message)
            .join("; ")}`
        ).toEqual([]);
        expect(
          crownsSpent(result.state),
          `${card.id}: an Empowered expert play must spend NO crown`
        ).toBe(0);
      }
    }
    // Not a vacuous sweep: a regression that hides every 0-crown Empowered
    // expert offer drops this to 0 before any assertion above can pass trivially.
    expect(covered, "the sweep must actually exercise expert offers").toBeGreaterThanOrEqual(8);
  });

  it("CONTROL: the same plays spend exactly one crown when the card is NOT Empowered", () => {
    let covered = 0;
    for (const card of EXPERT_CAPABLE_CARDS) {
      const empowered = soloCardState(`sweep-ctl-e-${card.id}`, card.id, { empowered: true, crowns: 0 });
      if (expertOffersOf(empowered, card.id, "PLAY_CARD").length === 0) {
        continue;
      }
      const plain = soloCardState(`sweep-ctl-p-${card.id}`, card.id, { empowered: false, crowns: 2 });
      const offers = expertOffersOf(plain, card.id, "PLAY_CARD");
      // With crowns in hand the plain holder gets the same expert offers…
      expect(offers.length, `${card.id}: a crowned plain holder should still be offered expert`).toBeGreaterThan(0);
      const result = applyAction(plain, offers[0].action);
      if (result.errors.length > 0) {
        continue;
      }
      covered += 1;
      expect(crownsSpent(result.state), `${card.id}: a plain expert play must spend a crown`).toBe(1);

      // …and with NO crowns it gets none at all (the gate the Empower waives).
      const broke = soloCardState(`sweep-ctl-b-${card.id}`, card.id, { empowered: false, crowns: 0 });
      expect(
        expertOffersOf(broke, card.id, "PLAY_CARD"),
        `${card.id}: a 0-crown plain holder must NOT be offered expert`
      ).toHaveLength(0);
    }
    expect(covered).toBeGreaterThanOrEqual(6);
  });
});

describe("Empowered expert sides are crown-free — library sweep (reaction-window pipeline)", () => {
  it("every expert REACTION an EMPOWERED holder gets at 0 crowns resolves without spending one", () => {
    let covered = 0;
    for (const card of EXPERT_CAPABLE_CARDS) {
      const base = soloCardState(`sweep-react-${card.id}`, card.id, { empowered: true, crowns: 0 });
      const state = openedWindow(base);
      if (!state.reactionWindow) {
        continue;
      }
      const offers = expertOffersOf(state, card.id, "PLAY_REACTION");
      for (const offer of offers) {
        covered += 1;
        const result = applyAction(state, offer.action);
        expect(
          result.errors,
          `${card.id}: an offered Empowered expert reaction must be legal — ${result.errors
            .map((error) => error.message)
            .join("; ")}`
        ).toEqual([]);
        expect(
          crownsSpent(result.state),
          `${card.id}: an Empowered expert reaction must spend NO crown`
        ).toBe(0);
      }
    }
    expect(covered, "the reaction sweep must actually exercise expert offers").toBeGreaterThan(5);
  });

  it("CONTROL: the same reactions spend a crown when the card is NOT Empowered", () => {
    let covered = 0;
    for (const card of EXPERT_CAPABLE_CARDS) {
      const empoweredWindow = openedWindow(
        soloCardState(`sweep-rctl-e-${card.id}`, card.id, { empowered: true, crowns: 0 })
      );
      if (!empoweredWindow.reactionWindow || expertOffersOf(empoweredWindow, card.id, "PLAY_REACTION").length === 0) {
        continue;
      }
      const plain = openedWindow(soloCardState(`sweep-rctl-p-${card.id}`, card.id, { empowered: false, crowns: 2 }));
      const offers = expertOffersOf(plain, card.id, "PLAY_REACTION");
      expect(offers.length, `${card.id}: a crowned plain holder should still be offered the expert reaction`).toBeGreaterThan(0);
      const result = applyAction(plain, offers[0].action);
      if (result.errors.length > 0) {
        continue;
      }
      covered += 1;
      expect(crownsSpent(result.state), `${card.id}: a plain expert reaction must spend a crown`).toBe(1);

      const broke = openedWindow(soloCardState(`sweep-rctl-b-${card.id}`, card.id, { empowered: false, crowns: 0 }));
      expect(
        expertOffersOf(broke, card.id, "PLAY_REACTION"),
        `${card.id}: a 0-crown plain holder must NOT be offered the expert reaction`
      ).toHaveLength(0);
    }
    expect(covered).toBeGreaterThan(5);
  });
});

// ===========================================================================
// 3. STATISTIC cards — the user named them explicitly. `empoweredAbilities`
//    also carries statistic ids (the computer combat boost, designer rewards).
// ===========================================================================

describe("Empowered STATISTIC cards in a reaction window", () => {
  function attackWindow(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    return openedWindow(soloCardState(seed, "stat.attack", opts));
  }

  it("an Empowered Attack statistic is offered expert at 0 crowns and spends none", () => {
    let state = attackWindow("empowered-stat-attack", { empowered: true, crowns: 0 });
    expect(state.reactionWindow).toBeTruthy();
    expect(expertUsesAvailable(state.players.p1)).toBe(0);

    const offers = expertOffersOf(state, "stat.attack", "PLAY_REACTION");
    expect(offers.length, "an Empowered statistic's expert side is offered with no crowns").toBeGreaterThan(0);

    state = applyOk(state, offers[0].action);
    expect(crownsSpent(state)).toBe(0);
  });

  it("CONTROL: a plain Attack statistic needs a crown and spends it", () => {
    const broke = attackWindow("plain-stat-attack-broke", { empowered: false, crowns: 0 });
    expect(expertOffersOf(broke, "stat.attack", "PLAY_REACTION")).toHaveLength(0);

    const paid = attackWindow("plain-stat-attack", { empowered: false, crowns: 2 });
    const offers = expertOffersOf(paid, "stat.attack", "PLAY_REACTION");
    expect(offers.length).toBeGreaterThan(0);
    expect(crownsSpent(applyOk(paid, offers[0].action))).toBe(1);
  });
});

// ===========================================================================
// 4. Artillery / First Aid volleys — war-machine windows that pay a crown for
//    the ABILITY card's expert side (never routed through PLAY_CARD).
// ===========================================================================

describe("Empowered Artillery — the Ballista volley window", () => {
  function volleySetup(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["ability.artillery"];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["war_machine.ballista"];
    state.players.p1.limits.expertUses = opts.crowns;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    if (opts.empowered) {
      state.players.p1.empoweredAbilities = ["ability.artillery"];
    }
    const units = state.combat!.units;
    let next = 8;
    for (const id of Object.keys(units)) {
      if (units[id].controllerId === "p2") {
        units[id].initiative = id === "unit_p2_dread_knights" ? 1 : next--;
      }
    }
    units.unit_p2_dread_knights.maxHealth = 12;
    units.unit_p2_dread_knights.damage = 0;
    return state;
  }

  function volleyOffer(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) => legal.label.includes("Artillery") && legal.label.includes("expert")
    );
  }

  it("is offered with ZERO crowns and fires the 3-shot volley free", () => {
    const offered = endRound(volleySetup("empowered-artillery", { empowered: true, crowns: 0 }), "p1");
    const volley = volleyOffer(offered);
    expect(volley, "an Empowered Artillery volley is offered at 0 crowns").toBeTruthy();

    const fired = applyOk(offered, volley!.action);
    expect(fired.combat!.units.unit_p2_dread_knights.damage).toBe(3);
    expect(crownsSpent(fired), "an Empowered Artillery volley costs no crown").toBe(0);
    expect(fired.players.p1.discard).toContain("ability.artillery");
  });

  it("CONTROL: a plain Artillery is NOT offered at 0 crowns, and spends one when it is", () => {
    const broke = endRound(volleySetup("plain-artillery-broke", { empowered: false, crowns: 0 }), "p1");
    expect(volleyOffer(broke)).toBeFalsy();
    expect(broke.players.p1.hand).toContain("ability.artillery");

    const paid = endRound(volleySetup("plain-artillery", { empowered: false, crowns: 2 }), "p1");
    const volley = volleyOffer(paid);
    expect(volley).toBeTruthy();
    expect(crownsSpent(applyOk(paid, volley!.action))).toBe(1);
  });
});

describe("Empowered First Aid — the Tent heal volley", () => {
  function tentSetup(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["war_machine.first_aid_tent", "ability.first_aid"];
    state.players.p2.hand = [];
    state.players.p1.limits.expertUses = opts.crowns;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    if (opts.empowered) {
      state.players.p1.empoweredAbilities = ["ability.first_aid"];
    }
    // A tanky wounded friendly so it stays wounded across the volley.
    state.combat!.units.unit_p1_crusaders.maxHealth = 6;
    state.combat!.units.unit_p1_crusaders.damage = 4;
    // Playing the Tent is what creates its HEAL_ONCE_PER_COMBAT_ROUND effect.
    return applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
  }

  function healOffers(state: GameState) {
    return getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "USE_ACTIVE_EFFECT" && (legal.action as { mode?: string }).mode === "expert"
    );
  }

  it("is offered with ZERO crowns and heals free", () => {
    const state = tentSetup("empowered-first-aid", { empowered: true, crowns: 0 });
    const offers = healOffers(state);
    expect(offers.length, "an Empowered First Aid expert volley is offered at 0 crowns").toBeGreaterThan(0);

    const healed = applyOk(state, offers[0].action);
    expect(crownsSpent(healed), "an Empowered First Aid volley costs no crown").toBe(0);
    expect(healed.players.p1.discard).toContain("ability.first_aid");
  });

  it("CONTROL: a plain First Aid is NOT offered at 0 crowns, and spends one when it is", () => {
    expect(healOffers(tentSetup("plain-first-aid-broke", { empowered: false, crowns: 0 }))).toHaveLength(0);

    const paid = tentSetup("plain-first-aid", { empowered: false, crowns: 2 });
    const offers = healOffers(paid);
    expect(offers.length).toBeGreaterThan(0);
    expect(crownsSpent(applyOk(paid, offers[0].action))).toBe(1);
  });
});

// ===========================================================================
// 5. Basic X Magic +3 (USE_SCHOOL_FETCH_EXPERT) and the School of Magic
//    permanent's cast-time expert — both are ABILITY cards paying a crown.
// ===========================================================================

describe("Empowered Basic X Magic — the +3 Power expert", () => {
  function castSetup(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    state.players.p1.limits.expertUses = opts.crowns;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    if (opts.empowered) {
      state.players.p1.empoweredAbilities = ["ability.basic_fire_magic"];
    }
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    return state;
  }

  function fetchCasts(state: GameState) {
    return getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.useSchoolFetchExpert === true
    );
  }

  it("the up-front +3 cast variant is offered at ZERO crowns and spends none", () => {
    const state = castSetup("empowered-basic-magic", { empowered: true, crowns: 0 });
    const casts = fetchCasts(state);
    expect(casts.length, "an Empowered Basic Fire Magic folds +3 with no crown").toBeGreaterThan(0);

    const cast = applyOk(state, casts[0].action);
    expect(crownsSpent(cast), "an Empowered Basic X Magic +3 costs no crown").toBe(0);
  });

  it("CONTROL: a plain Basic X Magic needs a crown for the +3, and spends it", () => {
    expect(fetchCasts(castSetup("plain-basic-magic-broke", { empowered: false, crowns: 0 }))).toHaveLength(0);

    const paid = castSetup("plain-basic-magic", { empowered: false, crowns: 2 });
    const casts = fetchCasts(paid);
    expect(casts.length).toBeGreaterThan(0);
    expect(crownsSpent(applyOk(paid, casts[0].action))).toBe(1);
  });
});

describe("Empowered School of Magic — the cast-time expert discard", () => {
  function castSetup(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p2.hand = [];
    state.players.p1.permanents = ["ability.fire_magic"];
    state.players.p1.limits.expertUses = opts.crowns;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    if (opts.empowered) {
      state.players.p1.empoweredAbilities = ["ability.fire_magic"];
    }
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.activePlayerId = "p1";
    return state;
  }

  function schoolCasts(state: GameState) {
    return getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "CAST_SPELL" && legal.action.useSchoolExpert === true
    );
  }

  it("is offered at ZERO crowns and discards the permanent for free", () => {
    const state = castSetup("empowered-school", { empowered: true, crowns: 0 });
    const casts = schoolCasts(state);
    expect(casts.length, "an Empowered School of Magic expert cast is offered at 0 crowns").toBeGreaterThan(0);

    const cast = applyOk(state, casts[0].action);
    expect(crownsSpent(cast), "an Empowered School of Magic expert costs no crown").toBe(0);
    expect(cast.players.p1.permanents ?? []).not.toContain("ability.fire_magic");
  });

  it("CONTROL: a plain School of Magic needs a crown, and spends it", () => {
    expect(schoolCasts(castSetup("plain-school-broke", { empowered: false, crowns: 0 }))).toHaveLength(0);

    const paid = castSetup("plain-school", { empowered: false, crowns: 2 });
    const casts = schoolCasts(paid);
    expect(casts.length).toBeGreaterThan(0);
    expect(crownsSpent(applyOk(paid, casts[0].action))).toBe(1);
  });
});

// ===========================================================================
// 6. MAP cast-then-boost window — the School / Basic-Magic expert tiles and
//    the Mysticism expert recall all read the same crown pool.
// ===========================================================================

function mapHand(seed: string, cards: string[], opts: { empowered?: string[]; crowns: number }): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.hand = [...cards];
  state.players.p1.limits.expertUses = opts.crowns;
  state.players.p1.combatStats.expertUsesSpentThisRound = 0;
  state.players.p1.combatStats.expertUseBonusThisRound = 0;
  if (opts.empowered) {
    state.players.p1.empoweredAbilities = [...opts.empowered];
  }
  return state;
}

function castViewAir(state: GameState): GameState {
  return applyOk(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId: "spell.view_air",
    mode: "basic",
    target: { type: "none" }
  });
}

function boostOfferIndex(state: GameState, match: (offer: { kind: string }) => boolean): number {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || !choice.mapSpellBoost) {
    return -1;
  }
  return choice.mapSpellBoost.offers.findIndex(match);
}

describe("Empowered School of Magic — the MAP boost tile", () => {
  function setup(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = mapHand(seed, ["spell.view_air"], {
      crowns: opts.crowns,
      ...(opts.empowered ? { empowered: ["ability.air_magic"] } : {})
    });
    state.players.p1.permanents = ["ability.air_magic"];
    return castViewAir(state);
  }

  it("is offered at ZERO crowns and discards the permanent for free", () => {
    let state = setup("empowered-map-school", { empowered: true, crowns: 0 });
    const index = boostOfferIndex(state, (offer) => offer.kind === "school-permanent-expert");
    expect(index, "an Empowered School of Magic is offered on the map at 0 crowns").toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: index
    });
    expect(crownsSpent(state)).toBe(0);
    expect(state.players.p1.permanents ?? []).not.toContain("ability.air_magic");
  });

  it("CONTROL: a plain School of Magic is not offered at 0 crowns, and spends one at 1", () => {
    const broke = setup("plain-map-school-broke", { empowered: false, crowns: 0 });
    expect(boostOfferIndex(broke, (offer) => offer.kind === "school-permanent-expert")).toBe(-1);

    let paid = setup("plain-map-school", { empowered: false, crowns: 1 });
    const index = boostOfferIndex(paid, (offer) => offer.kind === "school-permanent-expert");
    expect(index).toBeGreaterThanOrEqual(0);
    paid = applyOk(paid, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: paid.pendingChoice!.id,
      optionIndex: index
    });
    expect(crownsSpent(paid)).toBe(1);
  });
});

describe("Empowered Basic X Magic — the MAP +3 boost tile", () => {
  function setup(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = mapHand(seed, ["spell.view_air"], {
      crowns: opts.crowns,
      ...(opts.empowered ? { empowered: ["ability.basic_air_magic"] } : {})
    });
    state.players.p1.permanents = ["ability.basic_air_magic"];
    return castViewAir(state);
  }

  it("is offered at ZERO crowns and folds +3 for free", () => {
    let state = setup("empowered-map-fetch", { empowered: true, crowns: 0 });
    const index = boostOfferIndex(state, (offer) => offer.kind === "school-fetch-expert");
    expect(index, "an Empowered Basic Air Magic is offered on the map at 0 crowns").toBeGreaterThanOrEqual(0);

    state = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: index
    });
    expect(crownsSpent(state)).toBe(0);
  });

  it("CONTROL: a plain Basic X Magic is not offered at 0 crowns, and spends one at 1", () => {
    const broke = setup("plain-map-fetch-broke", { empowered: false, crowns: 0 });
    expect(boostOfferIndex(broke, (offer) => offer.kind === "school-fetch-expert")).toBe(-1);

    let paid = setup("plain-map-fetch", { empowered: false, crowns: 1 });
    const index = boostOfferIndex(paid, (offer) => offer.kind === "school-fetch-expert");
    expect(index).toBeGreaterThanOrEqual(0);
    paid = applyOk(paid, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: paid.pendingChoice!.id,
      optionIndex: index
    });
    expect(crownsSpent(paid)).toBe(1);
  });
});

describe("Empowered Mysticism — the MAP recall window", () => {
  function castAndBoost(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = mapHand(seed, ["spell.view_air", "spell.haste", "ability.mysticism"], {
      crowns: opts.crowns,
      ...(opts.empowered ? { empowered: ["ability.mysticism"] } : {})
    });
    let next = castViewAir(state);
    const hasteIndex = boostOfferIndex(
      next,
      (offer) => offer.kind === "card" && (offer as { cardId?: string }).cardId === "spell.haste"
    );
    expect(hasteIndex).toBeGreaterThanOrEqual(0);
    next = applyOk(next, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: next.pendingChoice!.id,
      optionIndex: hasteIndex
    });
    return next;
  }

  function expertRecallIndex(state: GameState): number {
    const step = state.adventure?.pendingVisit?.steps[0];
    if (step?.type !== "CHOOSE_ONE") {
      return -1;
    }
    return step.options.findIndex((option) => /Mysticism expert/i.test(option.label));
  }

  it("is offered at ZERO crowns and recovers the support card for free", () => {
    let state = castAndBoost("empowered-map-mysticism", { empowered: true, crowns: 0 });
    const index = expertRecallIndex(state);
    expect(index, "an Empowered Mysticism expert recall is offered at 0 crowns").toBeGreaterThanOrEqual(0);

    state = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: index });
    expect(state.players.p1.hand).toEqual(expect.arrayContaining(["spell.view_air", "spell.haste"]));
    expect(crownsSpent(state), "an Empowered Mysticism expert recall costs no crown").toBe(0);
  });

  it("CONTROL: a plain Mysticism is not offered expert at 0 crowns, and spends one at 1", () => {
    expect(expertRecallIndex(castAndBoost("plain-map-mysticism-broke", { empowered: false, crowns: 0 }))).toBe(-1);

    let paid = castAndBoost("plain-map-mysticism", { empowered: false, crowns: 1 });
    const index = expertRecallIndex(paid);
    expect(index).toBeGreaterThanOrEqual(0);
    paid = applyOk(paid, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: index });
    expect(crownsSpent(paid)).toBe(1);
  });
});

// ===========================================================================
// 7. COST PICKER — an Empowered card paid at its EXPERT Power value
//    (payOptionCardCost). Alamar's silver lethal save costs Power 2; one
//    Empowered Power statistic (basic +1 / expert +2) is the whole payment.
// ===========================================================================

describe("Empowered Power statistic paid at its expert value (cost picker)", () => {
  function lethalWindow(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["specialty.alamar.1", "stat.power"];
    state.players.p2.hand = [];
    state.players.p1.limits.expertUses = opts.crowns;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.combatStats.expertUseBonusThisRound = 0;
    if (opts.empowered) {
      state.players.p1.empoweredAbilities = ["stat.power"];
    }

    const defender = state.combat!.units.unit_p1_griffins;
    defender.grade = "silver";
    defender.position = 9;
    defender.defense = 0;
    defender.damage = defender.maxHealth - 1; // one hit from death

    const attacker = state.combat!.units.unit_p2_skeletons;
    attacker.attack = 5;
    attacker.position = 13;
    state.combat!.dice.scriptedRolls = [0];
    state.combat!.dice.rollCount = 0;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";

    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
  }

  function saveOffer(state: GameState) {
    return (state.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.alamar.1"
    );
  }

  it("affords the Power-2 save at ZERO crowns and spends none", () => {
    const declared = lethalWindow("empowered-sorcery-cost", { empowered: true, crowns: 0 });
    const save = saveOffer(declared);
    expect(save, "an Empowered Power statistic's expert +2 affords the save with no crowns").toBeTruthy();

    const action = save!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const saved = applyOk(declared, {
      ...action,
      costCardIds: ["stat.power"],
      costCardModes: ["expert"]
    });
    expect(crownsSpent(saved), "an Empowered expert Power payment costs no crown").toBe(0);
    expect(saved.players.p1.discard).toContain("stat.power");
  });

  it("CONTROL: a plain Power statistic cannot afford it at 0 crowns, and spends one when it can", () => {
    const broke = lethalWindow("plain-sorcery-cost-broke", { empowered: false, crowns: 0 });
    expect(saveOffer(broke), "basic +1 alone cannot reach Power 2").toBeFalsy();

    const paid = lethalWindow("plain-sorcery-cost", { empowered: false, crowns: 1 });
    const save = saveOffer(paid);
    expect(save).toBeTruthy();
    const action = save!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const saved = applyOk(paid, {
      ...action,
      costCardIds: ["stat.power"],
      costCardModes: ["expert"]
    });
    expect(crownsSpent(saved), "a plain expert Power payment costs a crown").toBe(1);
  });
});

// ===========================================================================
// 8. The named "special window" seams the sweep found ALREADY CORRECT —
//    pinned here so "already correct" is evidence, not an assertion. Each
//    was verified by reading AND by these tests; a regression fails them.
//    (Diplomacy's crown-free skip is already pinned in tactics-diplomacy.test.ts,
//    "empowered skip claims the field and resolves with no crown".)
// ===========================================================================

describe("Empowered Tactics — the mid-combat expert swap", () => {
  function tacticsCombat(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["ability.tactics"];
    state.players.p2.hand = [];
    state.players.p1.limits.expertUses = opts.crowns;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.combatStats.expertUseBonusThisRound = 0;
    if (opts.empowered) {
      state.players.p1.empoweredAbilities = ["ability.tactics"];
    }
    // Our own turn, active unit untouched — the printed expert window.
    state.phase = "combat";
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const active = state.combat!.units.unit_p1_griffins;
    active.movedThisActivation = false;
    active.attackedThisActivation = false;
    return state;
  }

  const swap: GameAction = {
    type: "SWAP_COMBAT_UNITS",
    playerId: "p1",
    unitIdA: "unit_p1_griffins",
    unitIdB: "unit_p1_crusaders"
  };

  it("swaps at ZERO crowns and spends none", () => {
    const state = tacticsCombat("empowered-tactics", { empowered: true, crowns: 0 });
    const posA = state.combat!.units.unit_p1_griffins.position;
    const posB = state.combat!.units.unit_p1_crusaders.position;

    const swapped = applyOk(state, swap);
    expect(swapped.combat!.units.unit_p1_griffins.position).toBe(posB);
    expect(swapped.combat!.units.unit_p1_crusaders.position).toBe(posA);
    expect(crownsSpent(swapped), "an Empowered Tactics expert swap costs no crown").toBe(0);
  });

  it("CONTROL: a plain Tactics is REJECTED at 0 crowns, and spends one when it has them", () => {
    const broke = applyAction(tacticsCombat("plain-tactics-broke", { empowered: false, crowns: 0 }), swap);
    expect(broke.errors.length, "a 0-crown plain Tactics mid-combat swap must be rejected").toBeGreaterThan(0);

    const paid = applyOk(tacticsCombat("plain-tactics", { empowered: false, crowns: 2 }), swap);
    expect(crownsSpent(paid), "a plain Tactics expert swap costs a crown").toBe(1);
  });
});

describe("Empowered Learning — the level-up choice", () => {
  function learningOffer(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    const hero = getMainHero(state, "p1")!;
    hero.experience = 5;
    hero.level = levelOfExperience(5);
    state.players.p1.hand = ["ability.learning"];
    state.decks.abilities.discardPile = [];
    // gainExperience + pumpAdventureQueues is the exact sequence a real
    // XP-granting action runs; crossing a level opens the Learning choice.
    gainExperience(state, "p1", 1);
    state.players.p1.limits.expertUses = opts.crowns;
    state.players.p1.combatStats.expertUsesSpentThisRound = 0;
    state.players.p1.combatStats.expertUseBonusThisRound = 0;
    if (opts.empowered) {
      state.players.p1.empoweredAbilities = ["ability.learning"];
    }
    pumpAdventureQueues(state);
    return state;
  }

  function modesOf(state: GameState): string[] {
    const choice = state.pendingChoice;
    return choice?.type === "OPTION_CHOICE" ? (choice.learningLevelUp?.modes ?? []) : [];
  }

  it("offers the expert full level at ZERO crowns and spends none", () => {
    const state = learningOffer("empowered-learning", { empowered: true, crowns: 0 });
    const modes = modesOf(state);
    expect(modes, "an Empowered Learning is offered expert with no crowns").toContain("expert");

    const resolved = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: modes.indexOf("expert")
    });
    expect(crownsSpent(resolved), "an Empowered Learning expert costs no crown").toBe(0);
    // The printed expert side still REMOVES the card from the game (this is why
    // Learning is NOT in EXPERT_SUPERSEDES_BASIC_CARD_IDS — basic keeps the card,
    // so the basic/expert choice stays a real trade-off even when Empowered).
    expect(resolved.players.p1.removed).toContain("ability.learning");
    expect(modes, "an Empowered Learning still OFFERS its basic side").toContain("basic");
  });

  it("CONTROL: a plain Learning gets no expert side at 0 crowns, and spends one at 2", () => {
    expect(modesOf(learningOffer("plain-learning-broke", { empowered: false, crowns: 0 }))).not.toContain("expert");

    const paid = learningOffer("plain-learning", { empowered: false, crowns: 2 });
    const modes = modesOf(paid);
    expect(modes).toContain("expert");
    const resolved = applyOk(paid, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: paid.pendingChoice!.id,
      optionIndex: modes.indexOf("expert")
    });
    expect(crownsSpent(resolved), "a plain Learning expert costs a crown").toBe(1);
  });
});

describe("Empowered Wisdom — the Mage Guild purchase", () => {
  function guild(seed: string, opts: { empowered: boolean; crowns: number }): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      ruleset: "binh",
      rotateStartTiles: false
    });
    state.decks["spells"].discardPile = [];
    const player = state.players.p1;
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    town.buildings.push("castle.mage_guild");
    player.resources.gold = 10;
    player.townTokens.spellBook = true;
    player.hand = ["ability.wisdom"];
    player.limits.expertUses = opts.crowns;
    player.combatStats.expertUsesSpentThisRound = 0;
    player.combatStats.expertUseBonusThisRound = 0;
    if (opts.empowered) {
      player.empoweredAbilities = ["ability.wisdom"];
    }
    state.heroes.hero_p1.level = 1;
    return state;
  }

  const buy: GameAction = {
    type: "SPELL_BOOK_ACTION",
    playerId: "p1",
    wisdom: { cardId: "ability.wisdom", mode: "expert" }
  };

  it("takes the expert discount + Search (4) at ZERO crowns and spends none", () => {
    const bought = applyOk(guild("empowered-wisdom", { empowered: true, crowns: 0 }), buy);
    expect(crownsSpent(bought), "an Empowered Wisdom expert costs no crown").toBe(0);
    // The expert side really applied: BINH Castle guild 6 − 3 = 3 gold, Search 4.
    expect(bought.players.p1.resources.gold).toBe(7);
    const choice = bought.pendingChoice;
    expect(choice?.type).toBe("DECK_SEARCH");
    if (choice?.type === "DECK_SEARCH") {
      expect(choice.revealedCardIds.length).toBe(4);
    }
  });

  it("CONTROL: a plain Wisdom expert is REJECTED at 0 crowns, and spends one at 1", () => {
    const broke = applyAction(guild("plain-wisdom-broke", { empowered: false, crowns: 0 }), buy);
    expect(broke.errors.length, "a 0-crown plain expert Wisdom must be rejected").toBeGreaterThan(0);

    const paid = applyOk(guild("plain-wisdom", { empowered: false, crowns: 1 }), buy);
    expect(crownsSpent(paid), "a plain Wisdom expert costs a crown").toBe(1);
  });
});
