import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index";
import { addArmyUnit, getMainHero, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { neutralUnitIdsByTier } from "@/data/factions/core";
import type { GameAction, GameState, PlayerId, ResourceKind } from "./state";
import { chooseVisitOption, eventsGame, stackEventDeck, startResourceRound, visitOptionLabels } from "./event-deck.test";

/**
 * Per-card Event behaviour (Fortress expansion). Every test asserts the
 * OBSERVABLE outcome — resources moved, cards changed zones, units flipped —
 * so it fails if the card's wiring is deleted or wrong, not merely absent
 * (CLAUDE.md #1a). p1 is Castle, p2 is Necropolis (morale-immune, and the only
 * seat the Necropolis-only options may appear for).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** The most recent adventure dice roll of `dice` kind, from the public log. */
function lastRoll(state: GameState, dice: "treasure" | "resource") {
  const rolls = state.eventLog.filter((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === dice);
  return rolls[rolls.length - 1] as Extract<(typeof state.eventLog)[number], { type: "ADVENTURE_DICE_ROLLED" }>;
}

function resourcesOf(state: GameState, playerId: PlayerId): Record<ResourceKind, number> {
  return { ...state.players[playerId].resources };
}

function setup(seed: string, cardId: string, mutate?: (state: GameState) => void): GameState {
  const state = eventsGame(seed);
  stackEventDeck(state, cardId);
  mutate?.(state);
  startResourceRound(state);
  return state;
}

// ===========================================================================
// Stables
// ===========================================================================

describe("Event — Stables", () => {
  it("option A: the Main hero gains +1 movement", () => {
    const state = setup("stables-a", "event.stables");
    const before = getMainHero(state, "p1")!.movementPoints;
    const after = chooseVisitOption(state, "p1", /Main hero gains \+1 movement/);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(before + 1);
  });

  it("option B: paying 1 movement rolls a Resource die whose face is actually paid out", () => {
    const state = setup("stables-b", "event.stables");
    const before = resourcesOf(state, "p1");
    const beforeMove = getMainHero(state, "p1")!.movementPoints;

    const after = chooseVisitOption(state, "p1", /Pay 1 movement .* roll 1 Resource die/);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(beforeMove - 1);

    const roll = lastRoll(after, "resource");
    const face = roll.resourceRolls![0];
    // A single die pays out immediately (no reroll effects held).
    expect(after.players.p1.resources[face.resource]).toBe(before[face.resource] + face.amount);
  });
});

// ===========================================================================
// Crypt
// ===========================================================================

describe("Event — Crypt", () => {
  it("positive morale option raises morale; the Necropolis half-cost reinforce is Necropolis-only", () => {
    const state = setup("crypt-morale", "event.crypt", (s) => {
      s.players.p2.army = [];
      addArmyUnit(s.players.p2, "necropolis.skeletons", "few");
      s.players.p2.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    });

    // p1 (Castle) never sees the Necropolis option.
    expect(visitOptionLabels(state, "p1").some((label) => /Necropolis/.test(label))).toBe(false);
    let after = chooseVisitOption(state, "p1", /Gain Positive Morale/);
    expect(after.players.p1.morale).toBe(1);

    // p2 (Necropolis) reinforces a bronze Few at HALF cost: Skeletons pack
    // costs 3 gold, half rounded up = 2.
    const goldBefore = after.players.p2.resources.gold;
    after = chooseVisitOption(after, "p2", /Necropolis: reinforce Skeletons at half cost/);
    expect(after.players.p2.army[0].side).toBe("pack");
    expect(after.players.p2.resources.gold).toBe(goldBefore - 2);
  });

  it("the treasure gamble voids on any experience face, otherwise pays one chosen face", () => {
    // Sweep seeds so BOTH branches are exercised deterministically.
    let sawVoid = false;
    let sawPayout = false;
    for (let salt = 0; salt < 12 && (!sawVoid || !sawPayout); salt += 1) {
      const state = setup(`crypt-gamble-${salt}`, "event.crypt");
      const moraleBefore = state.players.p1.morale;
      const after = chooseVisitOption(state, "p1", /Gain Negative Morale, then roll 2 Treasure dice/);
      expect(after.players.p1.morale).toBe(moraleBefore - 1);

      const roll = lastRoll(after, "treasure");
      if (roll.treasureRolls!.includes("experience")) {
        sawVoid = true;
        // Voided: no choice opens for p1; the visit moved on.
        expect(after.adventure?.pendingVisit?.playerId).not.toBe("p1");
        expect(
          after.eventLog.some((event) => event.type === "EVENT_NOTE" && /gains nothing/.test(event.message))
        ).toBe(true);
      } else {
        sawPayout = true;
        const labels = visitOptionLabels(after, "p1");
        expect(labels).toHaveLength(2); // exactly the two rolled faces
      }
    }
    expect(sawVoid, "no seed rolled an experience face — widen the sweep").toBe(true);
    expect(sawPayout, "no seed rolled a clean gamble — widen the sweep").toBe(true);
  });

  it("opens the artifact-search gamble payout before the next player's event choice", () => {
    let sawArtifactSearch = false;
    for (let salt = 0; salt < 48 && !sawArtifactSearch; salt += 1) {
      const state = setup(`crypt-search-owner-${salt}`, "event.crypt");
      let after = chooseVisitOption(state, "p1", /Gain Negative Morale, then roll 2 Treasure dice/);
      const faces = lastRoll(after, "treasure").treasureRolls ?? [];

      if (faces.includes("experience") || !faces.includes("artifact-search")) {
        continue;
      }

      sawArtifactSearch = true;
      after = chooseVisitOption(after, "p1", /Search \(2\) the Artifact deck/);

      if (after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context === "deck-pick") {
        expect(after.pendingChoice.playerId).toBe("p1");
        expect(after.pendingChoice.deckPick?.count).toBe(2);
      } else {
        expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
        expect(after.pendingChoice?.playerId).toBe("p1");
      }

      expect(after.adventure?.pendingVisit?.playerId).not.toBe("p2");
      expect(getLegalActions(after, "p2").some((entry) => entry.action.type === "RESOLVE_VISIT_STEP")).toBe(false);
    }

    expect(sawArtifactSearch, "no seed rolled a clean Crypt artifact-search face - widen the sweep").toBe(true);
  });
});

// ===========================================================================
// Cursed Swamp
// ===========================================================================

describe("Event — Cursed Swamp", () => {
  it("removing 2 Spells earns Search (3) of the Artifact deck; removing only 1 earns nothing", () => {
    const state = setup("swamp-remove", "event.cursed_swamp", (s) => {
      s.players.p1.hand = ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];
    });

    let after = chooseVisitOption(state, "p1", /Remove one or more Spells/);
    after = chooseVisitOption(after, "p1", /Remove Magic Arrow/);
    after = chooseVisitOption(after, "p1", /Remove Magic Arrow/);
    expect(after.players.p1.removed.filter((id) => id === "spell.magic_arrow")).toHaveLength(2);
    after = chooseVisitOption(after, "p1", /Done — 1 Search/);

    // The Search (3) reaches the shared deck-search pipeline WITHIN p1's slot:
    // a deck pick (BINH splits) or a straight 3-card reveal, for p1.
    if (after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context === "deck-pick") {
      expect(after.pendingChoice.playerId).toBe("p1");
      expect(after.pendingChoice.deckPick?.count).toBe(3);
    } else {
      expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
      expect(after.pendingChoice?.playerId).toBe("p1");
    }

    // CONTROL: one removed Spell stays under the threshold — Done grants nothing.
    let control = setup("swamp-remove-control", "event.cursed_swamp", (s) => {
      s.players.p1.hand = ["spell.magic_arrow", "spell.magic_arrow"];
    });
    control = chooseVisitOption(control, "p1", /Remove one or more Spells/);
    control = chooseVisitOption(control, "p1", /Remove Magic Arrow/);
    control = chooseVisitOption(control, "p1", /^Done$/);
    expect(control.pendingChoice).toBeNull();
    expect(control.adventure?.pendingVisit?.playerId).not.toBe("p1");
  });

  it("discards the CHEAPEST army unit (and a Necropolis player may instead reinforce for free)", () => {
    const state = setup("swamp-cheapest", "event.cursed_swamp", (s) => {
      s.players.p1.army = [];
      addArmyUnit(s.players.p1, "castle.archangels", "few"); // expensive
      addArmyUnit(s.players.p1, "castle.halberdiers", "few"); // cheap
      s.players.p2.army = [];
      addArmyUnit(s.players.p2, "necropolis.skeletons", "few");
      s.players.p2.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
    });

    let after = chooseVisitOption(state, "p1", /Discard your cheapest unit/);
    expect(after.players.p1.army.map((unit) => unit.unitDefId)).toEqual(["castle.archangels"]);

    // p2: the free reinforce flips Few→Pack without spending anything.
    const resourcesBefore = resourcesOf(after, "p2");
    after = chooseVisitOption(after, "p2", /Necropolis: reinforce Skeletons for free/);
    expect(after.players.p2.army[0].side).toBe("pack");
    expect(resourcesOf(after, "p2")).toEqual(resourcesBefore);
  });

  it("a discarded neutral-side unit recycles to its tier discard pile", () => {
    const bronzeNeutral = neutralUnitIdsByTier.bronze[0];
    const state = setup("swamp-neutral", "event.cursed_swamp", (s) => {
      s.players.p1.army = [];
      addArmyUnit(s.players.p1, bronzeNeutral, "neutral");
      addArmyUnit(s.players.p1, "castle.archangels", "few");
      s.decks["neutral-bronze"].discardPile = [];
    });
    const after = chooseVisitOption(state, "p1", /Discard your cheapest unit/);
    expect(after.players.p1.army.map((unit) => unit.unitDefId)).toEqual(["castle.archangels"]);
    expect(after.decks["neutral-bronze"].discardPile).toContain(bronzeNeutral);
  });
});

// ===========================================================================
// The Villagers' Plea
// ===========================================================================

describe("Event — The Villagers' Plea", () => {
  it("offers only affordable payments and each one actually costs its price", () => {
    const state = setup("plea", "event.the_villagers_plea", (s) => {
      s.players.p1.hand = ["spell.magic_arrow", "stat.attack"];
      s.players.p1.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
      s.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
      s.players.p2.hand = [];
      s.players.p2.resources = { gold: 4, buildingMaterials: 1, valuables: 0 };
      s.players.p2.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
    });

    // p1: no building materials — that option is not offered. A Statistic card
    // is neither Artifact nor Spell, so only Magic Arrow may be removed.
    const p1Labels = visitOptionLabels(state, "p1");
    expect(p1Labels.some((label) => /Pay 1 building materials/.test(label))).toBe(false);
    expect(p1Labels.some((label) => /Remove Attack/.test(label))).toBe(false);
    let after = chooseVisitOption(state, "p1", /Remove Magic Arrow from your hand/);
    expect(after.players.p1.removed).toContain("spell.magic_arrow");
    expect(after.players.p1.hand).toEqual(["stat.attack"]);

    // p2: 4 gold is under the 5-gold price, so only materials/movement remain.
    const p2Labels = visitOptionLabels(after, "p2");
    expect(p2Labels.some((label) => /Pay 5 gold/.test(label))).toBe(false);
    after = chooseVisitOption(after, "p2", /Pay 1 building materials/);
    expect(after.players.p2.resources.buildingMaterials).toBe(0);
  });

  it("paying movement costs exactly 1 MP; a player who can afford nothing is skipped with nothing lost", () => {
    const state = setup("plea-move", "event.the_villagers_plea", (s) => {
      for (const id of ["p1", "p2"] as const) {
        s.players[id].hand = [];
        s.players[id].resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
      }
    });
    const before = getMainHero(state, "p1")!.movementPoints;
    const after = chooseVisitOption(state, "p1", /Pay 1 movement/);
    expect(getMainHero(after, "p1")!.movementPoints).toBe(before - 1);

    // A player with NOTHING (no cards, no resources, no hero movement) is
    // skipped: the menu never opens and a note records it. Build the same
    // event but drain the heroes AFTER income refreshed them, BEFORE the
    // rewards pump into menus.
    const broke = eventsGame("plea-broke");
    stackEventDeck(broke, "event.the_villagers_plea");
    for (const id of ["p1", "p2"] as const) {
      broke.players[id].hand = [];
      broke.players[id].resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    }
    broke.round = 3;
    // startAdventureRound queues the per-player rewards; drain movement before
    // the pump builds the menus.
    startAdventureRound(broke);
    broke.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    broke.players.p2.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    for (const hero of Object.values(broke.heroes)) {
      hero.movementPoints = 0;
    }
    pumpAdventureQueues(broke);
    expect(broke.adventure?.pendingVisit).toBeNull();
    expect(
      broke.eventLog.filter((event) => event.type === "EVENT_NOTE" && /nothing to give the villagers/.test(event.message))
    ).toHaveLength(2);
  });
});

// ===========================================================================
// Withered Hermit
// ===========================================================================

describe("Event — Withered Hermit", () => {
  it("the naming gamble pays a chosen die when right and takes one when wrong (clamped at 0)", () => {
    let sawRight = false;
    let sawWrong = false;
    for (let salt = 0; salt < 16 && (!sawRight || !sawWrong); salt += 1) {
      const state = setup(`hermit-${salt}`, "event.withered_hermit", (s) => {
        s.players.p1.resources = { gold: 2, buildingMaterials: 0, valuables: 0 };
      });
      const before = resourcesOf(state, "p1");
      let after = chooseVisitOption(state, "p1", /Name valuables — roll 3 Resource dice/);
      const roll = lastRoll(after, "resource");
      const faces = roll.resourceRolls!;
      expect(faces).toHaveLength(3);

      const wrong = faces.some((face) => face.resource === "valuables");
      const labels = visitOptionLabels(after, "p1");
      expect(labels).toHaveLength(3);
      const face = faces[0];
      const faceLabel = new RegExp(
        `^${face.amount} ${face.resource === "buildingMaterials" ? "materials" : face.resource}$`
      );
      if (wrong) {
        sawWrong = true;
        // Choose a loss; the paid amount clamps at what the player owns.
        after = chooseVisitOption(after, "p1", faceLabel);
        const expected = Math.max(0, before[face.resource] - face.amount);
        expect(after.players.p1.resources[face.resource]).toBe(expected);
      } else {
        sawRight = true;
        after = chooseVisitOption(after, "p1", faceLabel);
        expect(after.players.p1.resources[face.resource]).toBe(before[face.resource] + face.amount);
      }
    }
    expect(sawRight, "no seed rolled valuables-free dice — widen the sweep").toBe(true);
    expect(sawWrong, "no seed rolled a valuables face — widen the sweep").toBe(true);
  });

  it("the pay-to-search option charges the rolled face and opens a 2-card Artifact search; declining is free", () => {
    const state = setup("hermit-pay", "event.withered_hermit", (s) => {
      s.players.p1.resources = { gold: 20, buildingMaterials: 20, valuables: 20 };
    });
    const before = resourcesOf(state, "p1");
    let after = chooseVisitOption(state, "p1", /Roll 1 Resource die — you may pay/);
    const face = lastRoll(after, "resource").resourceRolls![0];

    // PAY_TO offers the exact rolled cost plus a Decline.
    const legal = getLegalActions(after, "p1").filter((entry) => entry.action.type === "RESOLVE_VISIT_STEP");
    expect(legal.some((entry) => /^Pay /.test(entry.label))).toBe(true);
    after = chooseVisitOption(after, "p1", /^Pay /);
    expect(after.players.p1.resources[face.resource]).toBe(before[face.resource] - face.amount);
    if (after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context === "deck-pick") {
      expect(after.pendingChoice.deckPick?.count).toBe(2);
    } else {
      expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    }

    // CONTROL: declining pays nothing and searches nothing.
    let control = setup("hermit-decline", "event.withered_hermit", (s) => {
      s.players.p1.resources = { gold: 20, buildingMaterials: 20, valuables: 20 };
    });
    const controlBefore = resourcesOf(control, "p1");
    control = chooseVisitOption(control, "p1", /Roll 1 Resource die — you may pay/);
    control = chooseVisitOption(control, "p1", /Decline/);
    expect(resourcesOf(control, "p1")).toEqual(controlBefore);
    expect(control.pendingChoice).toBeNull();
  });
});

// ===========================================================================
// Market of Time / School of Magic and School of War
// ===========================================================================

describe("Event — Market of Time & School of Magic and School of War", () => {
  it("Market of Time: discard-any draws back to hand limit +2, then every 2 removed Spells/Abilities earn a Search (2) of the Artifact deck", () => {
    const state = setup("market-of-time", "event.market_of_time", (s) => {
      s.players.p1.hand = ["stat.attack", "spell.magic_arrow", "spell.magic_arrow", "stat.defense"];
      s.players.p1.deck = Array.from({ length: 10 }, () => "stat.power");
    });

    let after = chooseVisitOption(state, "p1", /Discard any number of cards/);
    after = chooseVisitOption(after, "p1", /Discard Attack/);
    after = chooseVisitOption(after, "p1", /Done — draw up to your hand limit \+2/);
    // Hand limit 4 + 2 = 6.
    expect(after.players.p1.hand).toHaveLength(6);

    // Remove the two Magic Arrows → exactly one Search (2), straight to
    // artifacts. Nothing else in hand is removable, so the loop auto-finishes
    // after the second removal.
    after = chooseVisitOption(after, "p1", /Remove Magic Arrow/);
    after = chooseVisitOption(after, "p1", /Remove Magic Arrow/);
    if (after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context === "deck-pick") {
      expect(after.pendingChoice.playerId).toBe("p1");
      expect(after.pendingChoice.deckPick?.count).toBe(2);
    } else {
      expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
      expect(after.pendingChoice?.playerId).toBe("p1");
    }
  });

  it("School: the earned Search offers a CHOICE of the Ability or the Spell deck; leaving changes nothing", () => {
    const state = setup("school", "event.school_of_magic_and_school_of_war", (s) => {
      s.players.p1.hand = ["spell.magic_arrow", "spell.magic_arrow"];
      s.players.p1.deck = Array.from({ length: 10 }, () => "stat.power");
      s.players.p2.hand = ["stat.attack"];
    });

    let after = chooseVisitOption(state, "p1", /Discard any number of cards/);
    after = chooseVisitOption(after, "p1", /Done — draw up to your hand limit \+2/);
    after = chooseVisitOption(after, "p1", /Remove Magic Arrow/);
    // Nothing removable remains after the second removal — the loop
    // auto-finishes into the earned Search's deck choice.
    after = chooseVisitOption(after, "p1", /Remove Magic Arrow/);
    // The deck choice is part of the card: Ability deck or Spell deck.
    const labels = visitOptionLabels(after, "p1");
    expect(labels.some((label) => /Search \(2\) the Ability deck/.test(label))).toBe(true);
    expect(labels.some((label) => /Search \(2\) the Spell deck/.test(label))).toBe(true);
    after = chooseVisitOption(after, "p1", /Search \(2\) the Ability deck/);
    expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    // Take the first revealed Ability so the queue moves on to p2.
    after = applyOk(after, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: after.pendingChoice!.id,
      pick: { kind: "revealed", index: 0 }
    });

    // p2 leaves — nothing about their zones changes.
    const handBefore = [...after.players.p2.hand];
    const after2 = chooseVisitOption(after, "p2", /Leave and gain nothing/);
    expect(after2.players.p2.hand).toEqual(handBefore);
  });
});

// ===========================================================================
// Garden of Revelation
// ===========================================================================

describe("Event — Garden of Revelation", () => {
  it("draws 4 from the deck or the discard pile, pays Searches per 2 removed, then discards the hand and redraws to the limit", () => {
    const state = setup("garden", "event.garden_of_revelation", (s) => {
      s.players.p1.hand = [];
      // Deck top = array END: the draw takes the 2 Magic Arrows + 2 Attacks.
      s.players.p1.deck = ["stat.power", "stat.power", "stat.power", "stat.power", "stat.attack", "stat.attack", "spell.magic_arrow", "spell.magic_arrow"];
      s.players.p1.discard = [];
      s.players.p2.hand = [];
      // Discard top = array END: the 4 Magic Arrows are the newest discards.
      s.players.p2.discard = ["stat.defense", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];
      s.players.p2.deck = ["stat.power", "stat.power", "stat.power", "stat.power"];
    });

    // p1 draws 4 from the deck (the deck holds the 2 Magic Arrows on top —
    // deck top = array end — so they land in hand).
    let after = chooseVisitOption(state, "p1", /Draw 4 cards from your deck/);
    expect(after.players.p1.hand).toHaveLength(4);
    expect(after.players.p1.hand.filter((id) => id === "spell.magic_arrow")).toHaveLength(2);

    after = chooseVisitOption(after, "p1", /Remove Magic Arrow/);
    // The loop auto-finishes after the second removal (nothing removable
    // remains) into the earned Search's deck choice.
    after = chooseVisitOption(after, "p1", /Remove Magic Arrow/);
    after = chooseVisitOption(after, "p1", /Search \(2\) the Spell deck/);
    // Resolve the search so the payout continues to the hand reset.
    expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    after = applyOk(after, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: after.pendingChoice!.id,
      pick: { kind: "revealed", index: 0 }
    });

    // "After that, discard all cards from hand and draw up to your hand limit."
    expect(after.players.p1.hand).toHaveLength(4);
    // The pre-reset hand (2 Attack Statistics + the searched Spell) was discarded.
    expect(after.players.p1.discard.filter((id) => id === "stat.attack")).toHaveLength(2);

    // p2 draws 4 from the DISCARD pile instead: the 4 Magic Arrows reach the
    // hand (they are offered for removal — proof the discard draw landed).
    let p2 = chooseVisitOption(after, "p2", /Draw 4 cards from your discard pile/);
    expect(p2.players.p2.discard).toEqual(["stat.defense"]);
    expect(p2.players.p2.hand.filter((id) => id === "spell.magic_arrow")).toHaveLength(4);
    p2 = chooseVisitOption(p2, "p2", /Remove Magic Arrow/);
    p2 = chooseVisitOption(p2, "p2", /Remove Magic Arrow/);
    p2 = chooseVisitOption(p2, "p2", /Done — 1 Search/);
    p2 = chooseVisitOption(p2, "p2", /Search \(2\) the Ability deck/);
    expect(p2.pendingChoice?.type).toBe("DECK_SEARCH");
    p2 = applyOk(p2, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p2",
      choiceId: p2.pendingChoice!.id,
      pick: { kind: "revealed", index: 0 }
    });
    // Ends with the reset: the leftover hand (2 Arrows + the searched Ability)
    // is discarded and p2 redraws up to the limit from their deck.
    expect(p2.players.p2.hand).toEqual(["stat.power", "stat.power", "stat.power", "stat.power"]);
    expect(p2.players.p2.discard.filter((id) => id === "spell.magic_arrow")).toHaveLength(2);
  });
});
