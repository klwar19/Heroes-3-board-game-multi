import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { drawAstrologersCard, getTownOfPlayer, NEUTRAL_DECK_IDS, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { coreUnitDefinitions } from "@/data/factions/units";
import { neutralUnitIdsByFaction, neutralUnitIdsByTier } from "@/data/factions/core";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Three more expansion Astrologers proclamations, engine-enforced end to end
 * (CLAUDE.md #1 — every assertion fails if its wiring is deleted):
 *
 *   - Explorers (Inferno): for every 3 cards discarded during a start-of-turn
 *     hand refresh, empower one Statistic for free.
 *   - Charlie and his Circus (Rampart): draw one Neutral Unit per Dwelling tier
 *     you control and recruit one, paying its cost — offered this round and the
 *     next (the drawn Astrologers round + the following Resource round).
 *   - Unexpected Reinforcements (Tower): search the Neutral Units deck and
 *     recruit, for free, one neutral unit associated with your faction (the
 *     neutral counterpart of a roster unit) onto the Neutral side — so it can
 *     never be reinforced to a Pack.
 *
 * The recruitment cards reuse the engine's Dwelling-tier gate (unlockedRecruitTiers,
 * the same gate behind Cyra's Diplomacy); Azure is never recruitable because no
 * Dwelling unlocks it.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function visitOptionLabels(state: GameState, playerId: PlayerId): string[] {
  return getLegalActions(state, playerId)
    .filter((entry) => entry.action.type === "RESOLVE_VISIT_STEP")
    .map((entry) => entry.label);
}

function chooseVisitOption(state: GameState, playerId: PlayerId, match: RegExp): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(legal, `expected a visit option matching ${match}`).toBeTruthy();
  return applyOk(state, legal!.action);
}

/** Sets exactly which Dwelling tiers a player controls (bronze/silver/gold). */
function setDwellingTiers(state: GameState, playerId: PlayerId, tiers: ("bronze" | "silver" | "gold")[]): void {
  const town = getTownOfPlayer(state, playerId);
  if (!town) {
    throw new Error("no town");
  }
  town.buildings = town.buildings.filter((id) => !id.includes("dwelling"));
  for (const tier of tiers) {
    town.buildings.push(`castle.dwelling_${tier}`); // any faction's id unlocks the tier
  }
}

// ===========================================================================
// Explorers — empower one Statistic per 3 cards discarded at the hand refresh
// ===========================================================================

describe("Astrologers — Explorers (empower per 3 discarded)", () => {
  function explorersGame(activeCardId = "astrologers.explorers"): GameState {
    const state = createAdventureGameState({ seed: "explorers", difficulty: "normal", rollFirstPlayer: false });
    state.adventure!.astrologers = {
      activeCardId,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    state.activePlayerId = "p1";
    const p1 = state.players.p1;
    p1.canMulligan = true;
    p1.needsHandRefresh = false;
    p1.discard = [];
    p1.removed = [];
    // Spells fill the draw pile so the redraw never adds a stray Statistic.
    p1.deck = Array.from({ length: 8 }, () => "spell.magic_arrow");
    return state;
  }

  it("offers one empower for every 3 cards discarded, and empowering swaps the Statistic", () => {
    const state = explorersGame();
    state.players.p1.hand = ["stat.attack", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];

    const refreshed = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"]
    });

    const labels = visitOptionLabels(refreshed, "p1");
    expect(labels.some((label) => /Empower Attack/.test(label))).toBe(true);
    expect(labels).toContain("Done");

    const empowered = chooseVisitOption(refreshed, "p1", /Empower Attack/);
    expect(empowered.players.p1.hand).toContain("stat.attack.empowered");
    expect(empowered.players.p1.hand).not.toContain("stat.attack");
    // floor(3/3) = 1 empower — the visit closes after the single swap.
    expect(empowered.adventure?.pendingVisit).toBeNull();
  });

  it("scales: discarding 6 cards allows two empowers in the same refresh", () => {
    const state = explorersGame();
    state.players.p1.hand = [
      "stat.attack",
      "stat.defense",
      "spell.magic_arrow",
      "spell.magic_arrow",
      "spell.magic_arrow",
      "spell.magic_arrow",
      "spell.magic_arrow",
      "spell.magic_arrow"
    ];

    let s = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: Array.from({ length: 6 }, () => "spell.magic_arrow")
    });

    s = chooseVisitOption(s, "p1", /Empower Attack/);
    expect(s.players.p1.hand).toContain("stat.attack.empowered");
    // A second empower (floor(6/3) = 2) is still on offer.
    expect(s.adventure?.pendingVisit?.playerId).toBe("p1");
    s = chooseVisitOption(s, "p1", /Empower Defense/);
    expect(s.players.p1.hand).toContain("stat.defense.empowered");
    expect(s.adventure?.pendingVisit).toBeNull();
  });

  it("offers no empower when fewer than 3 cards are discarded", () => {
    const state = explorersGame();
    state.players.p1.hand = ["stat.attack", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];

    const refreshed = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: ["spell.magic_arrow", "spell.magic_arrow"]
    });
    expect(refreshed.adventure?.pendingVisit).toBeNull();
  });

  it("does nothing without Explorers face up, even discarding 3", () => {
    const state = explorersGame("astrologers.dead_silence");
    state.players.p1.hand = ["stat.attack", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];

    const refreshed = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"]
    });
    expect(refreshed.adventure?.pendingVisit).toBeNull();
    expect(refreshed.players.p1.hand).not.toContain("stat.attack.empowered");
  });
});

// ===========================================================================
// Charlie and his Circus — paid Neutral recruit, this round and the next
// ===========================================================================

describe("Astrologers — Charlie and his Circus (paid Neutral recruit)", () => {
  function charlieGame(): GameState {
    const state = createAdventureGameState({ seed: "charlie", difficulty: "normal", rollFirstPlayer: false });
    setDwellingTiers(state, "p1", ["bronze"]);
    setDwellingTiers(state, "p2", []); // only p1 is offered, keeping the assertions focused
    state.players.p1.resources.gold = 50;
    state.decks["neutral-bronze"]!.drawPile = ["neutral.boars"]; // Boars cost 4 gold
    state.decks.astrologers!.drawPile = ["astrologers.charlie_and_his_circus"];
    return state;
  }

  it("draws from the player's Dwelling-tier decks and recruits the chosen unit, paying its cost", () => {
    const state = charlieGame();
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.charlie_and_his_circus");
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(visitOptionLabels(state, "p1").some((label) => /Recruit Boars \(4 gold\)/.test(label))).toBe(true);

    const after = chooseVisitOption(state, "p1", /Recruit Boars/);
    expect(after.players.p1.army.some((unit) => unit.unitDefId === "neutral.boars" && unit.side === "neutral")).toBe(true);
    expect(after.players.p1.resources.gold).toBe(46); // 50 - 4
    expect(after.adventure?.pendingVisit).toBeNull();
  });

  it("recruits nothing on 'Recruit none' and returns the drawn card to its deck", () => {
    const state = charlieGame();
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const after = chooseVisitOption(state, "p1", /Recruit none/);
    expect(after.players.p1.army.some((unit) => unit.unitDefId === "neutral.boars")).toBe(false);
    expect(after.players.p1.resources.gold).toBe(50);
    expect(after.decks["neutral-bronze"]!.discardPile).toContain("neutral.boars");
  });

  it("offers nothing the player cannot afford (the draw returns to its deck)", () => {
    const state = charlieGame();
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit).toBeNull();
    expect(state.decks["neutral-bronze"]!.discardPile).toContain("neutral.boars");
  });

  it("offers nothing to a player without a Dwelling", () => {
    const state = charlieGame();
    setDwellingTiers(state, "p1", []);
    drawAstrologersCard(state);
    pumpAdventureQueues(state);
    expect(state.adventure?.pendingVisit).toBeNull();
  });

  it("offers again at the next Resource round (this round and the next)", () => {
    const state = charlieGame();
    state.adventure!.astrologers = {
      activeCardId: "astrologers.charlie_and_his_circus",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    state.round = 3; // a Resource round, the card still face up
    startAdventureRound(state);

    const offers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "NEUTRAL_RECRUIT_OFFER"
    );
    expect(offers.map((offer) => offer.playerId)).toContain("p1");
  });
});

// ===========================================================================
// Unexpected Reinforcements — search the Neutral Units deck and recruit, for
// free, one NEUTRAL unit associated with your faction (the neutral counterpart
// of a roster unit), gated by the Dwellings you have built. It is added on the
// single-sided Neutral side, so it can NEVER be reinforced to a Pack — the
// whole point of the card (you get the neutral creature, not the upgradeable
// faction unit). Faction-agnostic: any defined faction works.
// ===========================================================================

const NEUTRAL_GOLD_DECK = NEUTRAL_DECK_IDS.gold;

describe("Astrologers — Unexpected Reinforcements (free associated-neutral recruit)", () => {
  function unexpectedGame(tiers: ("bronze" | "silver" | "gold")[] = ["gold"]): GameState {
    const state = createAdventureGameState({ seed: "unexpected", difficulty: "normal", rollFirstPlayer: false });
    state.players.p1.factionId = "castle";
    setDwellingTiers(state, "p1", tiers);
    setDwellingTiers(state, "p2", []); // only p1 is offered, keeping assertions focused
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    state.decks.astrologers!.drawPile = ["astrologers.unexpected_reinforcements"];
    return state;
  }

  it("recruits the neutral counterpart of a faction unit, for free, onto the Neutral side", () => {
    const state = unexpectedGame(["gold"]); // Castle gold tier: Champions + Archangels
    const armyBefore = state.players.p1.army.length;
    const deckBefore = state.decks[NEUTRAL_GOLD_DECK]!.drawPile.length;
    expect(state.decks[NEUTRAL_GOLD_DECK]!.drawPile).toContain("neutral.archangels");
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    const labels = visitOptionLabels(state, "p1");
    expect(labels.some((label) => /Recruit Archangels \(free\)/.test(label))).toBe(true);
    expect(labels).toContain("Skip");

    const after = chooseVisitOption(state, "p1", /Recruit Archangels/);
    // The NEUTRAL Archangels card is recruited — not the upgradeable faction one.
    const recruited = after.players.p1.army.find((unit) => unit.unitDefId === "neutral.archangels");
    expect(recruited?.side).toBe("neutral");
    expect(after.players.p1.army.some((unit) => unit.unitDefId === "castle.archangels")).toBe(false);
    expect(after.players.p1.army.length).toBe(armyBefore + 1);
    // "for free" — no resources spent despite having none.
    expect(after.players.p1.resources).toEqual({ gold: 0, buildingMaterials: 0, valuables: 0 });
    // The card is taken out of the Neutral Units deck (a search-and-take), never
    // duplicated — it only returns to the discard pile if the unit is defeated.
    expect(after.decks[NEUTRAL_GOLD_DECK]!.drawPile).not.toContain("neutral.archangels");
    expect(after.decks[NEUTRAL_GOLD_DECK]!.discardPile).not.toContain("neutral.archangels");
    expect(after.decks[NEUTRAL_GOLD_DECK]!.drawPile.length).toBe(deckBefore - 1);
    expect(after.adventure?.pendingVisit).toBeNull();
  });

  // The bug this card had: it recruited the player's OWN faction unit on the Few
  // side, which a Citadel could then reinforce to a Pack. A neutral unit has no
  // Pack — assert the recruited creature is never offered a reinforcement.
  it("the recruited unit can NEVER be reinforced to a Pack", () => {
    const state = unexpectedGame(["gold"]);
    const town = getTownOfPlayer(state, "p1")!;
    town.buildings.push("castle.citadel"); // UNLOCK_REINFORCE — pack upgrades enabled
    state.players.p1.townTokens.population = true;
    // Plenty to pay any Pack cost (Archangels' Pack is 30 gold + 2 valuables), so
    // the only reason no reinforcement is offered is that a neutral unit has none.
    state.players.p1.resources = { gold: 100, buildingMaterials: 100, valuables: 100 };
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const after = chooseVisitOption(state, "p1", /Recruit Archangels/);
    // With the fix the army holds neutral.archangels (Neutral side); a neutral
    // unit is not on the faction roster the reinforce menu reads, so no Pack
    // upgrade is ever offered. (Under the old Few-side bug this listed
    // "Reinforce Archangels to a pack".)
    const labels = getLegalActions(after, "p1")
      .filter((entry) => entry.action.type === "POPULATION_ACTION")
      .map((entry) => entry.label);
    expect(labels.some((label) => /Reinforce Archangels/.test(label))).toBe(false);
    expect(labels.some((label) => /Reinforce .* to a pack/.test(label))).toBe(false);
  });

  it("only offers units whose Dwelling tier the player has built", () => {
    const state = unexpectedGame(["gold"]); // only the gold Dwelling
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const labels = visitOptionLabels(state, "p1");
    // Gold tier (Champions, Archangels) is offered...
    expect(labels.some((label) => /Recruit Champions/.test(label))).toBe(true);
    expect(labels.some((label) => /Recruit Archangels/.test(label))).toBe(true);
    // ...but bronze-tier units (no bronze Dwelling) are not.
    expect(labels.some((label) => /Recruit Halberdiers/.test(label))).toBe(false);
    expect(labels.some((label) => /Recruit Griffins/.test(label))).toBe(false);
  });

  it("offers every unlocked tier when several Dwellings are built", () => {
    const state = unexpectedGame(["bronze", "gold"]);
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const labels = visitOptionLabels(state, "p1");
    expect(labels.some((label) => /Recruit Halberdiers/.test(label))).toBe(true); // bronze
    expect(labels.some((label) => /Recruit Archangels/.test(label))).toBe(true); // gold
    expect(labels.some((label) => /Recruit Crusaders/.test(label))).toBe(false); // silver — not built
  });

  it("never offers a faction's top-tier signature unit (its neutral card is azure)", () => {
    const state = unexpectedGame([]);
    state.players.p1.factionId = "rampart";
    setDwellingTiers(state, "p1", ["gold"]); // Rampart gold: Unicorns + Gold Dragons
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const labels = visitOptionLabels(state, "p1");
    expect(labels.some((label) => /Recruit Unicorns/.test(label))).toBe(true); // has neutral.unicorns (gold)
    // Gold Dragons DO have a Neutral Units card, but only at the azure tier
    // (neutral.gold_dragons) — no Dwelling unlocks azure, so it is never offered
    // here. The card still exists and shows up as an azure neutral guard.
    expect(labels.some((label) => /Gold Dragons/.test(label))).toBe(false);
    expect(coreUnitDefinitions["neutral.gold_dragons"]?.tier).toBe("azure");
    expect(neutralUnitIdsByTier.azure).toContain("neutral.gold_dragons");
  });

  it("ships the azure neutral top-tier creatures as guards, excluded from recruitment", () => {
    // Gold Dragons / Titans / Hydras exist as azure Neutral Units (so they can
    // guard high fields) but are not the same-tier counterpart of any faction
    // unit, so no faction can recruit them via Unexpected Reinforcements.
    for (const id of ["neutral.gold_dragons", "neutral.titans", "neutral.hydras"] as const) {
      const def = coreUnitDefinitions[id];
      expect(def?.neutral, `${id} has a neutral side`).toBeTruthy();
      expect(def?.tier, `${id} is azure`).toBe("azure");
      expect(neutralUnitIdsByTier.azure, `${id} is in the azure deck`).toContain(id);
      const recruitableBy = Object.entries(neutralUnitIdsByFaction)
        .filter(([, ids]) => ids.includes(id))
        .map(([faction]) => faction);
      expect(recruitableBy, `${id} is recruitable by no faction`).toEqual([]);
    }
  });

  it("does not offer a unit whose only neutral copy has left the deck", () => {
    const state = unexpectedGame(["gold"]);
    // Remove both Castle gold counterparts from the deck (e.g. already drawn into
    // a guard army that is still on the map) — neither can be searched out.
    const deck = state.decks[NEUTRAL_GOLD_DECK]!;
    deck.drawPile = deck.drawPile.filter((id) => id !== "neutral.archangels" && id !== "neutral.champions");
    drawAstrologersCard(state);
    pumpAdventureQueues(state);
    // No gold counterpart remains in the deck, so there is nothing to offer.
    expect(state.adventure?.pendingVisit).toBeNull();
  });

  it("is optional — Skip recruits nothing", () => {
    const state = unexpectedGame(["gold"]);
    const armyBefore = state.players.p1.army.length;
    const deckBefore = state.decks[NEUTRAL_GOLD_DECK]!.drawPile.length;
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const after = chooseVisitOption(state, "p1", /^Skip$/);
    expect(after.players.p1.army.length).toBe(armyBefore);
    // Skipping touches no deck — every counterpart stays in the Neutral deck.
    expect(after.decks[NEUTRAL_GOLD_DECK]!.drawPile.length).toBe(deckBefore);
    expect(after.adventure?.pendingVisit).toBeNull();
  });

  it("offers nothing to a player without a Dwelling", () => {
    const state = unexpectedGame([]);
    drawAstrologersCard(state);
    pumpAdventureQueues(state);
    expect(state.adventure?.pendingVisit).toBeNull();
  });

  it("reads the player's own faction — a Necropolis player is offered Necropolis units", () => {
    const state = unexpectedGame([]);
    state.players.p1.factionId = "necropolis";
    setDwellingTiers(state, "p1", ["bronze"]); // Necropolis bronze
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const labels = visitOptionLabels(state, "p1");
    expect(labels.length).toBeGreaterThan(1); // some Necropolis bronze unit(s) + Skip
    // None of the offered units belongs to another faction (e.g. Castle).
    expect(labels.some((label) => /Halberdiers|Archangels|Champions/.test(label))).toBe(false);
  });

  it("handles factions with no units yet defined (e.g. Conflux/Cove) — no offer", () => {
    const state = unexpectedGame(["bronze", "gold"]);
    // A faction not yet in the game has no roster, so there is nothing to recruit
    // even with Dwellings built — the offer self-guards instead of crashing.
    state.players.p1.factionId = "conflux" as typeof state.players.p1.factionId;
    drawAstrologersCard(state);
    pumpAdventureQueues(state);
    expect(state.adventure?.pendingVisit).toBeNull();
  });
});
