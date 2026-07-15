import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { coreHeroDefinitions } from "@/data/factions/core";
import { driveComputerPlayers } from "@/server/computer-runner";
import { createAdventureLobbyState } from "../adventure-setup";
import type {
  GameAction,
  LegalAction,
  PendingChoice,
  PlayerVisibleState,
} from "../state";
import { cardKeepValue, scoreCardAction } from "./card-policy";
import {
  CARD_TIER,
  HERO_TIER,
  TIER_SCORE,
  cardTier,
  cardTierValue,
  cardValueContext,
  heroPickBias,
  tierScore,
} from "./card-values";
import { scoreChoiceAction } from "./choice-policy";
import { scoreMapAction } from "./map-policy";
import { chooseComputerAction } from "./policy";
import type { ComputerObservation } from "./types";
import { computerDecisionOwner } from "./window";

/**
 * Community tier-list value model (card-values.ts): id hygiene, the tier
 * ordering as seen through cardKeepValue and every scorer that consumes it,
 * the four context adjusters (each with a CONTROL), the hero auto-pick bias,
 * the Ballista-over-Tent war-machine order and the tier-driven scroll sale.
 * Every behavior here fails if its wiring is removed (mutation-checked).
 */

// --- minimal observation builders -------------------------------------------

type PlayerOverrides = {
  factionId?: string;
  eliminated?: boolean;
  hand?: string[];
  heroDefId?: string;
  needsHandRefresh?: boolean;
  handLimit?: number;
  gold?: number;
};

function makeState(
  players: Record<string, PlayerOverrides>,
  extras: {
    towns?: Record<
      string,
      { controllerId: string; buildings: string[] }
    >;
    moraleCards?: boolean;
    seed?: string;
    pendingChoice?: PendingChoice | null;
  } = {},
): PlayerVisibleState {
  const playerMap: Record<string, unknown> = {};
  for (const [id, over] of Object.entries(players)) {
    playerMap[id] = {
      id,
      factionId: over.factionId,
      eliminated: over.eliminated,
      heroDefId: over.heroDefId,
      hand: over.hand ?? [],
      discard: [],
      needsHandRefresh: over.needsHandRefresh,
      limits: { hand: over.handLimit ?? 5 },
      permanents: [],
      resources: {
        gold: over.gold ?? 10,
        buildingMaterials: 2,
        valuables: 1,
      },
      army: [],
    };
  }
  return {
    seed: extras.seed ?? "card-values-test",
    round: 2,
    eventCounter: 0,
    combat: null,
    pendingChoice: extras.pendingChoice ?? null,
    players: playerMap,
    towns: extras.towns ?? {},
    adventure: {
      fields: {},
      ...(extras.moraleCards ? { moraleCards: { decks: true } } : {}),
    },
  } as unknown as PlayerVisibleState;
}

function observe(
  state: PlayerVisibleState,
  legalActions: LegalAction[] = [],
  playerId = "p2",
): ComputerObservation {
  return { playerId, state, legalActions };
}

/** Two live seats — the standard "enemy hero exists" table. */
function duelObservation(overrides: {
  self?: PlayerOverrides;
  enemy?: PlayerOverrides;
  towns?: Record<string, { controllerId: string; buildings: string[] }>;
  moraleCards?: boolean;
} = {}): ComputerObservation {
  return observe(
    makeState(
      {
        p2: { factionId: "castle", ...overrides.self },
        p1: { factionId: "tower", ...overrides.enemy },
      },
      { towns: overrides.towns, moraleCards: overrides.moraleCards },
    ),
  );
}

// --- hygiene -----------------------------------------------------------------

describe("card-values — id hygiene", () => {
  it("every CARD_TIER key resolves to an implemented card definition", () => {
    const missing = Object.keys(CARD_TIER).filter((id) => !cardLibrary[id]);
    expect(missing).toEqual([]);
    // Tier weights only ever apply through cardKeepValue, which zeroes
    // not-implemented cards — a mapped id must be a real, implemented card.
    const inert = Object.keys(CARD_TIER).filter(
      (id) => cardLibrary[id]?.implementationStatus !== "implemented",
    );
    expect(inert).toEqual([]);
  });

  it("covers the full published lists: 63 artifacts + 41 spells + 26 abilities", () => {
    const keys = Object.keys(CARD_TIER);
    expect(keys.filter((id) => id.startsWith("artifact.")).length).toBe(63);
    expect(keys.filter((id) => id.startsWith("spell.")).length).toBe(41);
    expect(keys.filter((id) => id.startsWith("ability.")).length).toBe(26);
    // Necromancy is deliberately contextual, never a flat table entry.
    expect(CARD_TIER["ability.necromancy"]).toBeUndefined();
  });

  it("every HERO_TIER key resolves to a hero definition (all 28 list entries)", () => {
    const missing = Object.keys(HERO_TIER).filter(
      (id) => !coreHeroDefinitions[id],
    );
    expect(missing).toEqual([]);
    expect(Object.keys(HERO_TIER).length).toBe(28);
    // The two printed Lord Haarts land on the two distinct defIds.
    expect(coreHeroDefinitions.lord_haart.faction).toBe("castle");
    expect(coreHeroDefinitions.lord_haart_necropolis.faction).toBe(
      "necropolis",
    );
  });

  it("tierScore keeps a strict modest spread with D negative", () => {
    expect(tierScore("S")).toBeGreaterThan(tierScore("A"));
    expect(tierScore("A")).toBeGreaterThan(tierScore("B"));
    expect(tierScore("B")).toBeGreaterThan(tierScore("C"));
    expect(tierScore("C")).toBeGreaterThan(tierScore("D"));
    expect(tierScore("D")).toBeLessThan(0);
    // Modest: the whole spread stays below the relic-class bonus (80).
    expect(tierScore("S") - tierScore("D")).toBeLessThan(80);
  });
});

// --- tier ordering through cardKeepValue -------------------------------------

describe("card-values — tier ordering in cardKeepValue", () => {
  it("keeps the S-tier relic over the D-tier relic of the same class", () => {
    // Both relics, both CHOOSE_ONE effects — identical under the old
    // kind/class heuristic; only the tier table separates them.
    const s = cardKeepValue("artifact.dragon_scale_armor");
    const d = cardKeepValue("artifact.sword_of_judgement");
    expect(s).toBeGreaterThan(d);
    expect(s - d).toBe(TIER_SCORE.S - TIER_SCORE.D);
  });

  it("keeps the S-tier basic spell over the D-tier basic spell", () => {
    // Magic Arrow and Earthquake are both basic combat-damage spells —
    // identical old value; the list splits them S vs D.
    expect(cardKeepValue("spell.magic_arrow")).toBeGreaterThan(
      cardKeepValue("spell.earthquake"),
    );
  });

  it("CONTROL: an unmapped same-class pair stays exactly tied (old heuristic)", () => {
    // Neither minor artifact appears on the list — kind/class fallback only.
    expect(cardTier("artifact.skull_helmet")).toBeUndefined();
    expect(cardTier("artifact.quiet_eye_of_the_dragon")).toBeUndefined();
    expect(cardKeepValue("artifact.skull_helmet")).toBe(
      cardKeepValue("artifact.quiet_eye_of_the_dragon"),
    );
  });
});

// --- contextual modifier (a): PvP-only cards ---------------------------------

describe("card-values — PvP-only cards track the enemy-hero threat", () => {
  it("Shackles of War loses most of its S bonus with no live enemy seat and regains it with one", () => {
    const withEnemy = duelObservation();
    const enemyGone = duelObservation({ enemy: { eliminated: true } });
    const armed = cardKeepValue("artifact.shackles_of_war", withEnemy);
    const idle = cardKeepValue("artifact.shackles_of_war", enemyGone);
    expect(armed).toBeGreaterThan(idle);
    // "Most of the bonus": the dormant tier slice is at most a quarter.
    expect(cardTierValue(
      "artifact.shackles_of_war",
      cardValueContext(enemyGone.state, "p2"),
    )).toBeLessThanOrEqual(Math.round(TIER_SCORE.S / 4));

    // Every listed PvP-only card deflates, ability and spell included.
    for (const cardId of [
      "spell.anti_magic",
      "artifact.recanters_cloak",
      "artifact.dragon_wing_tabard",
      "ability.resistance",
    ]) {
      expect(cardKeepValue(cardId, withEnemy)).toBeGreaterThan(
        cardKeepValue(cardId, enemyGone),
      );
    }
  });

  it("CONTROL: a non-PvP S-tier artifact is identical with and without an enemy", () => {
    const withEnemy = duelObservation();
    const enemyGone = duelObservation({ enemy: { eliminated: true } });
    expect(cardKeepValue("artifact.armor_of_wonder", withEnemy)).toBe(
      cardKeepValue("artifact.armor_of_wonder", enemyGone),
    );
  });
});

// --- contextual modifier (b): morale-cards rule ------------------------------

describe("card-values — morale cards option shifts token-economy artifacts", () => {
  it("Spirit of Oppression and Hourglass devalue when the Morale-Cards rule is ON", () => {
    const tokens = duelObservation();
    const cards = duelObservation({ moraleCards: true });
    expect(cardKeepValue("artifact.spirit_of_oppression", cards)).toBeLessThan(
      cardKeepValue("artifact.spirit_of_oppression", tokens),
    );
    expect(
      cardKeepValue("artifact.hourglass_of_the_evil_hour", cards),
    ).toBeLessThan(
      cardKeepValue("artifact.hourglass_of_the_evil_hour", tokens),
    );
  });

  it("CONTROL: the morale-GAIN cards (Glyph, Crest) stay strong under the rule", () => {
    const tokens = duelObservation();
    const cards = duelObservation({ moraleCards: true });
    expect(cardKeepValue("artifact.glyph_of_gallantry", cards)).toBe(
      cardKeepValue("artifact.glyph_of_gallantry", tokens),
    );
    expect(cardKeepValue("artifact.crest_of_valor", cards)).toBe(
      cardKeepValue("artifact.crest_of_valor", tokens),
    );
  });
});

// --- contextual modifier (c): the Necromancy deny-pick ------------------------

describe("card-values — Necromancy is priced by the Necropolis matchup", () => {
  it("a non-Necropolis seat facing Necropolis holds the deny-pick high; no matchup drops it", () => {
    const vsNecro = duelObservation({ enemy: { factionId: "necropolis" } });
    const vsTower = duelObservation();
    const deny = cardKeepValue("ability.necromancy", vsNecro);
    const dead = cardKeepValue("ability.necromancy", vsTower);
    expect(deny).toBeGreaterThan(dead);
    expect(deny - dead).toBe(TIER_SCORE.A - TIER_SCORE.D);
  });

  it("the Necropolis seat itself values Necromancy above even the deny-pick", () => {
    const own = duelObservation({ self: { factionId: "necropolis" } });
    const vsNecro = duelObservation({ enemy: { factionId: "necropolis" } });
    expect(cardKeepValue("ability.necromancy", own)).toBeGreaterThan(
      cardKeepValue("ability.necromancy", vsNecro),
    );
  });

  it("CONTROL: another A-tier ability ignores the Necropolis matchup entirely", () => {
    const vsNecro = duelObservation({ enemy: { factionId: "necropolis" } });
    const vsTower = duelObservation();
    expect(cardKeepValue("ability.diplomacy", vsNecro)).toBe(
      cardKeepValue("ability.diplomacy", vsTower),
    );
  });
});

// --- contextual modifier (d): Wisdom needs a Mage Guild -----------------------

describe("card-values — Wisdom drops without a built Mage Guild", () => {
  const guildTown = {
    t1: { controllerId: "p2", buildings: ["castle.mage_guild"] },
  };

  it("Wisdom keeps its A tier with a Mage Guild and falls to C without one", () => {
    const withGuild = duelObservation({ towns: guildTown });
    const without = duelObservation();
    const rich = cardKeepValue("ability.wisdom", withGuild);
    const dead = cardKeepValue("ability.wisdom", without);
    expect(rich).toBeGreaterThan(dead);
    expect(rich - dead).toBe(TIER_SCORE.A - TIER_SCORE.C);
  });

  it("CONTROL: another town's guild does not count, and Mysticism ignores guilds", () => {
    const enemyGuild = duelObservation({
      towns: { t1: { controllerId: "p1", buildings: ["tower.mage_guild"] } },
    });
    const ownGuild = duelObservation({ towns: guildTown });
    expect(cardKeepValue("ability.wisdom", enemyGuild)).toBeLessThan(
      cardKeepValue("ability.wisdom", ownGuild),
    );
    expect(cardKeepValue("ability.mysticism", enemyGuild)).toBe(
      cardKeepValue("ability.mysticism", ownGuild),
    );
  });
});

// --- refresh-hand discards ----------------------------------------------------

describe("card-values — refresh-hand discards the D-tier card first", () => {
  function refreshDecision(hand: string[]) {
    const state = makeState({
      p2: { factionId: "castle", hand, needsHandRefresh: true, handLimit: 1 },
      p1: { factionId: "tower" },
    });
    const refresh: LegalAction = {
      label: "refresh",
      action: {
        type: "REFRESH_HAND",
        playerId: "p2",
        discardCardIds: [],
      } as GameAction,
    };
    return chooseComputerAction(observe(state, [refresh]));
  }

  it("dumps the D-tier relic and keeps the S-tier relic", () => {
    // S-relic sits FIRST in hand: the old equal-value heuristic (both relics,
    // both CHOOSE_ONE) discarded by hand order and would dump the S card —
    // this fails if the tier wiring is removed.
    const decision = refreshDecision([
      "artifact.dragon_scale_armor",
      "artifact.sword_of_judgement",
    ]);
    expect(decision?.action.type).toBe("REFRESH_HAND");
    expect(
      (decision?.action as { discardCardIds: string[] }).discardCardIds,
    ).toEqual(["artifact.sword_of_judgement"]);
  });

  it("CONTROL: an unmapped equal pair falls back to the old hand-order behavior", () => {
    const decision = refreshDecision([
      "artifact.skull_helmet",
      "artifact.quiet_eye_of_the_dragon",
    ]);
    expect(
      (decision?.action as { discardCardIds: string[] }).discardCardIds,
    ).toEqual(["artifact.skull_helmet"]);
  });
});

// --- deck-search keeps ---------------------------------------------------------

describe("card-values — deck search keeps the higher-tier spell", () => {
  function searchChoice(revealed: string[]): PendingChoice {
    return {
      id: "ds1",
      type: "DECK_SEARCH",
      playerId: "p2",
      deckId: "spells",
      revealedCardIds: revealed,
      returnPhase: "map",
    } as unknown as PendingChoice;
  }

  function keepAction(index: number): GameAction {
    return {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p2",
      choiceId: "ds1",
      pick: { kind: "revealed", index },
    } as GameAction;
  }

  it("scores keeping Magic Arrow (S) above keeping Earthquake (D) — equal old value", () => {
    const state = makeState(
      { p2: { factionId: "castle" }, p1: { factionId: "tower" } },
      {
        pendingChoice: searchChoice(["spell.earthquake", "spell.magic_arrow"]),
      },
    );
    const obs = observe(state);
    const keepQuake = scoreChoiceAction(obs, keepAction(0));
    const keepArrow = scoreChoiceAction(obs, keepAction(1));
    expect(keepArrow?.score ?? 0).toBeGreaterThan(keepQuake?.score ?? 0);

    // End-to-end: the pick follows the card, not the index (swapped CONTROL).
    const picked = chooseComputerAction(
      observe(state, [
        { label: "keep 0", action: keepAction(0) },
        { label: "keep 1", action: keepAction(1) },
      ]),
    );
    expect(
      (picked?.action as { pick: { index: number } }).pick.index,
    ).toBe(1);

    const swapped = makeState(
      { p2: { factionId: "castle" }, p1: { factionId: "tower" } },
      {
        pendingChoice: searchChoice(["spell.magic_arrow", "spell.earthquake"]),
      },
    );
    const pickedSwapped = chooseComputerAction(
      observe(swapped, [
        { label: "keep 0", action: keepAction(0) },
        { label: "keep 1", action: keepAction(1) },
      ]),
    );
    expect(
      (pickedSwapped?.action as { pick: { index: number } }).pick.index,
    ).toBe(0);
  });

  it("passes the seat CONTEXT through: the Necromancy deny-pick wins a search only vs Necropolis", () => {
    // Same revealed pair, only the enemy faction differs. Fails if the
    // deck-search keep path stops passing its observation into cardKeepValue
    // (context-free, Necromancy contributes 0 and Diplomacy always wins).
    const revealed = searchChoice(["ability.necromancy", "ability.diplomacy"]);
    const vsNecro = observe(
      makeState(
        { p2: { factionId: "castle" }, p1: { factionId: "necropolis" } },
        { pendingChoice: revealed },
      ),
    );
    const vsTower = observe(
      makeState(
        { p2: { factionId: "castle" }, p1: { factionId: "tower" } },
        { pendingChoice: revealed },
      ),
    );
    const necroKeep = (obs: ComputerObservation) =>
      scoreChoiceAction(obs, keepAction(0))?.score ?? 0;
    const diploKeep = (obs: ComputerObservation) =>
      scoreChoiceAction(obs, keepAction(1))?.score ?? 0;
    expect(necroKeep(vsNecro)).toBeGreaterThan(diploKeep(vsNecro));
    // CONTROL: no Necropolis on the table — Necromancy is the dead card.
    expect(necroKeep(vsTower)).toBeLessThan(diploKeep(vsTower));
  });
});

// --- hero auto-pick -------------------------------------------------------------

describe("card-values — hero auto-pick prefers the community top tier", () => {
  function factionOffer(
    factionId: string,
    heroDefId: string,
  ): LegalAction {
    return {
      label: `Play ${factionId} — ${heroDefId}`,
      action: {
        type: "CHOOSE_FACTION",
        playerId: "p2",
        factionId,
        heroDefId,
      } as GameAction,
    };
  }

  it("always claims the S-tier hero over C/D heroes, across seeds", () => {
    for (let run = 0; run < 12; run += 1) {
      const state = makeState(
        { p2: {}, p1: { factionId: "castle" } },
        { seed: `hero-pick-${run}` },
      );
      const decision = chooseComputerAction(
        observe(state, [
          factionOffer("fortress", "wystan"), // D
          factionOffer("necropolis", "vidomina"), // S
          factionOffer("inferno", "xyron"), // C
        ]),
      );
      expect(
        (decision?.action as { heroDefId: string }).heroDefId,
      ).toBe("vidomina");
    }
    expect(heroPickBias("vidomina")).toBeGreaterThan(heroPickBias("xyron"));
    expect(heroPickBias("wystan")).toBeLessThan(0);
    // Unmapped heroes ride the neutral hash exactly as before.
    expect(heroPickBias("crag_hack")).toBe(0);
  });

  it("keeps variety: equal-tier heroes still split by the seeded hash", () => {
    const picks = new Set<string>();
    for (let run = 0; run < 24; run += 1) {
      const state = makeState(
        { p2: {}, p1: { factionId: "castle" } },
        { seed: `hero-variety-${run}` },
      );
      const decision = chooseComputerAction(
        observe(state, [
          factionOffer("necropolis", "vidomina"), // S
          factionOffer("inferno", "fiona"), // S
        ]),
      );
      picks.add((decision?.action as { heroDefId: string }).heroDefId);
    }
    expect(picks).toEqual(new Set(["vidomina", "fiona"]));
  });

  it("CONTROL: a seat pinned via SET_COMPUTER_SEAT_FACTION is never re-picked", () => {
    const state = createAdventureLobbyState({
      seed: "card-values-pin",
      sessionMode: "single-player",
      computerOpponents: 2,
      scenarioId: "skirmish",
    });
    // Human picked; the p2 computer seat is PINNED to the D-tier hero (the
    // exact fields SET_COMPUTER_SEAT_FACTION writes).
    state.setupLobby!.seats[0].factionId = "castle";
    state.setupLobby!.seats[0].heroDefId = "catherine";
    state.setupLobby!.seats[1].factionId = "fortress";
    state.setupLobby!.seats[1].heroDefId = "wystan";
    // The pinned seat owes nothing — the driver moves on to the OPEN seat.
    expect(computerDecisionOwner(state)).toBe("p3");
    const run = driveComputerPlayers(state);
    expect(run.stalled).toBe(false);
    const seats = run.state.setupLobby!.seats;
    // Pin untouched — the tier bias never re-picks a pinned seat…
    expect(seats[1].factionId).toBe("fortress");
    expect(seats[1].heroDefId).toBe("wystan");
    // …while the open seat completed on its own.
    expect(seats[2].factionId).toBeTruthy();
    expect(seats[2].heroDefId).toBeTruthy();
  });

  it("CONTROL: SET_COMPUTER_SEAT_FACTION itself stays NEVER_AUTOMATE", () => {
    const state = makeState({ p2: {}, p1: {} });
    const pinOffer: LegalAction = {
      label: "pin",
      action: {
        type: "SET_COMPUTER_SEAT_FACTION",
        playerId: "p2",
        seatPlayerId: "p3",
        choice: "roll",
      } as GameAction,
    };
    expect(chooseComputerAction(observe(state, [pinOffer]))).toBeNull();
  });
});

// --- war machines ---------------------------------------------------------------

describe("card-values — war-machine shop order", () => {
  function buy(cardId: string): GameAction {
    return {
      type: "BUY_WAR_MACHINE",
      playerId: "p2",
      cardId,
    } as GameAction;
  }

  it("prefers the Ballista over the First Aid Tent (Artillery C vs First Aid D)", () => {
    const obs = duelObservation({ self: { gold: 30 } });
    const ballista = scoreMapAction(obs, buy("war_machine.ballista"));
    const tent = scoreMapAction(obs, buy("war_machine.first_aid_tent"));
    expect(ballista?.score ?? 0).toBeGreaterThan(tent?.score ?? 0);
  });

  it("CONTROL: Gem — the list's named healing specialist — flips to the Tent", () => {
    const obs = duelObservation({ self: { gold: 30, heroDefId: "gem" } });
    const ballista = scoreMapAction(obs, buy("war_machine.ballista"));
    const tent = scoreMapAction(obs, buy("war_machine.first_aid_tent"));
    expect(tent?.score ?? 0).toBeGreaterThan(ballista?.score ?? 0);
  });
});

// --- scroll spells ----------------------------------------------------------------

describe("card-values — scroll spells sell by tier", () => {
  function sell(cardId: string): GameAction {
    return {
      type: "SELL_SCROLL_SPELL",
      playerId: "p2",
      scrollId: "scroll-1",
      cardId,
    } as GameAction;
  }

  it("sells a D/C-tier scroll spell even with full coffers, keeps S/A below END_TURN", () => {
    const rich = duelObservation({ self: { gold: 30 } });
    const sellQuake = scoreMapAction(rich, sell("spell.earthquake"));
    const sellVisions = scoreMapAction(rich, sell("spell.visions"));
    const sellFly = scoreMapAction(rich, sell("spell.fly"));
    const sellResurrection = scoreMapAction(rich, sell("spell.resurrection"));
    // Junk clears the shelf: above END_TURN (300) and the visit Done (~520).
    expect(sellQuake?.score ?? 0).toBeGreaterThan(520);
    expect(sellVisions?.score ?? 0).toBeGreaterThan(520);
    // Premium spells never sell for 2 gold — strictly below END_TURN.
    expect(sellFly?.score ?? 0).toBeLessThan(300);
    expect(sellResurrection?.score ?? 0).toBeLessThan(300);
    expect(sellFly?.policy).toBe("map.keep-scroll-spell");
    // Even gold-starved, an S-tier scroll spell stays.
    const broke = duelObservation({ self: { gold: 2 } });
    expect(scoreMapAction(broke, sell("spell.fly"))?.score ?? 0).toBeLessThan(
      300,
    );
    expect(
      scoreMapAction(broke, sell("spell.earthquake"))?.score ?? 0,
    ).toBeGreaterThan(scoreMapAction(broke, sell("spell.fly"))?.score ?? 0);
  });

  it("CONTROL: an unmapped scroll spell keeps the legacy only-when-tight behavior", () => {
    expect(cardTier("spell.clone")).toBeUndefined();
    const rich = duelObservation({ self: { gold: 30 } });
    const broke = duelObservation({ self: { gold: 2 } });
    expect(scoreMapAction(rich, sell("spell.clone"))?.score).toBe(300);
    expect(scoreMapAction(broke, sell("spell.clone"))?.score).toBe(550);
  });
});

// --- cost payments: junk burns first ------------------------------------------------

describe("card-values — cost payment prefers D-tier fuel", () => {
  function playWithCost(costCardIds: string[]): GameAction {
    return {
      type: "PLAY_CARD",
      playerId: "p2",
      cardId: "spell.resurrection",
      costCardIds,
    } as GameAction;
  }

  it("the variant paying with Earthquake (D) outranks the one burning Magic Arrow (S)", () => {
    const obs = duelObservation();
    const burnQuake = scoreCardAction(obs, playWithCost(["spell.earthquake"]));
    const burnArrow = scoreCardAction(
      obs,
      playWithCost(["spell.magic_arrow"]),
    );
    expect(burnQuake?.score ?? 0).toBeGreaterThan(burnArrow?.score ?? 0);
  });

  it("CONTROL: two unmapped equal-class cost cards tie exactly (old behavior)", () => {
    const obs = duelObservation();
    const a = scoreCardAction(
      obs,
      playWithCost(["artifact.skull_helmet"]),
    );
    const b = scoreCardAction(
      obs,
      playWithCost(["artifact.quiet_eye_of_the_dragon"]),
    );
    expect(a?.score).toBe(b?.score);
  });
});

describe("card-values — +1-Power fodder in the kill window", () => {
  /** Pending Magic Arrow cast at a 2-health enemy: +1 Power converts to a kill. */
  function killWindow(handCards: string[]): ComputerObservation {
    const state = makeState({
      p2: { factionId: "castle", hand: handCards },
      p1: { factionId: "tower" },
    });
    (state as unknown as { combat: unknown }).combat = {
      id: "c1",
      units: {
        E: {
          id: "E",
          controllerId: "p1",
          name: "E",
          grade: "bronze",
          type: "ground",
          attack: 2,
          defense: 1,
          maxHealth: 2,
          damage: 0,
          initiative: 5,
          position: 9,
          abilities: [],
        },
      },
    };
    (state as unknown as { stack: unknown[] }).stack = [
      {
        action: {
          type: "CAST_SPELL",
          playerId: "p2",
          cardId: "spell.magic_arrow",
          target: { type: "unit", unitId: "E" },
        },
        modifiers: { spellPowerBonus: 0, attackBonus: 0, defenseBonus: 0 },
      },
    ];
    return observe(state);
  }

  function boost(cardId: string): LegalAction {
    return {
      label: `${cardId} as Power`,
      action: {
        type: "PLAY_REACTION",
        playerId: "p2",
        cardId,
        mode: "basic",
        asPowerBoost: true,
      } as GameAction,
    };
  }

  const pass: LegalAction = {
    label: "pass",
    action: { type: "PASS_REACTION", playerId: "p2" } as GameAction,
  };

  it("still burns an S-tier Magic Arrow when it is the ONLY fuel for a kill", () => {
    // The hold-gate must stay on the class value: an S-tier basic spell is
    // never hoarded past a kill (the list itself calls the arrow the fuel of
    // choice). Fails if the tier layer leaks into the kills hold-gate.
    const obs = killWindow(["spell.magic_arrow"]);
    obs.legalActions.push(pass, boost("spell.magic_arrow"));
    const decision = chooseComputerAction(obs);
    expect(decision?.action.type).toBe("PLAY_REACTION");
  });

  it("burns the D-tier card before the S-tier staple in the same window", () => {
    const obs = killWindow(["spell.earthquake", "spell.magic_arrow"]);
    obs.legalActions.push(
      pass,
      boost("spell.earthquake"),
      boost("spell.magic_arrow"),
    );
    const decision = chooseComputerAction(obs);
    expect(decision?.action.type).toBe("PLAY_REACTION");
    expect((decision?.action as { cardId: string }).cardId).toBe(
      "spell.earthquake",
    );
  });
});
