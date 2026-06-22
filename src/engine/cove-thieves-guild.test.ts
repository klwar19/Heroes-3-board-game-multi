import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, getPlayerView } from "./index";
import { coreBuildingDefinitions } from "@/data/factions/core";
import type { GameAction, GameState, PendingChoice } from "./state";

/**
 * Cove Thieves' Guild — "Once during your turn, choose any one deck in the game
 * (including another player's M&M deck), look at its top 2 cards, and put one of
 * them on its discard pile and the other back on top of the deck."
 *
 * Every test below fails if the engine wiring is removed:
 *   • the offer only appears with the building built and only once per turn,
 *   • the chosen card is discarded and the OTHER is left on top (order matters),
 *   • it reaches a shared deck AND any player's personal Might & Magic deck,
 *   • the two peeked cards stay private to the thief (multiplayer redaction).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A Cove (p1) adventure ready for a map turn action, with only the Guild built. */
function guildGame(seed: string, build = ["cove.thieves_guild"]): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
  if (!town) throw new Error("no Cove town");
  town.buildings = [...build];
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  if (state.adventure) {
    state.adventure.pendingVisit = null;
    state.adventure.pendingTileChoice = null;
    state.adventure.rewardQueue = [];
  }
  return state;
}

function thievesActions(state: GameState) {
  return getLegalActions(state, "p1").filter((legal) => legal.action.type === "THIEVES_GUILD_ACTION");
}

function thievesChoice(state: GameState): Extract<PendingChoice, { type: "OPTION_CHOICE" }> {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "thieves-guild") {
    throw new Error("expected an open Thieves' Guild choice");
  }
  return choice;
}

describe("Thieves' Guild — data", () => {
  it("is an implemented THIEVES_GUILD building (no longer a stub)", () => {
    const guild = coreBuildingDefinitions["cove.thieves_guild"];
    expect(guild.implementationStatus).toBe("implemented");
    expect(guild.effect?.type).toBe("THIEVES_GUILD");
  });
});

describe("Thieves' Guild — the offer", () => {
  it("is NOT offered without the building (control), and IS offered with it", () => {
    const without = guildGame("tg-control", []); // no buildings at all
    expect(thievesActions(without).length).toBe(0);

    const withGuild = guildGame("tg-offer");
    expect(thievesActions(withGuild).length).toBeGreaterThan(0);
  });

  it("offers a shared deck (Spells) AND each player's Might & Magic deck", () => {
    const state = guildGame("tg-targets");
    state.decks.spells.drawPile = ["spell.magic_arrow", "spell.bless", "spell.haste"];
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    state.players.p2.deck = ["stat.power", "stat.knowledge"];

    const targets = thievesActions(state).map((legal) =>
      legal.action.type === "THIEVES_GUILD_ACTION" ? legal.action.target : null
    );
    expect(targets).toContainEqual({ kind: "shared", deckId: "spells" });
    expect(targets).toContainEqual({ kind: "player", ownerId: "p1" }); // your own deck
    expect(targets).toContainEqual({ kind: "player", ownerId: "p2" }); // an opponent's deck
  });

  it("never offers a deck with fewer than 2 cards on top", () => {
    const state = guildGame("tg-thin");
    state.players.p2.deck = ["stat.power"]; // only 1 card
    const p2Offer = thievesActions(state).some(
      (legal) => legal.action.type === "THIEVES_GUILD_ACTION" && legal.action.target.kind === "player" && legal.action.target.ownerId === "p2"
    );
    expect(p2Offer).toBe(false);
  });
});

describe("Thieves' Guild — peek the top 2, discard one, keep the other ON TOP", () => {
  it("on a shared deck: discards the top card, leaves the second on top", () => {
    const state = guildGame("tg-shared-0");
    // drawPile top = last element. top = haste, second = bless.
    state.decks.spells.drawPile = ["spell.magic_arrow", "spell.bless", "spell.haste"];

    const open = applyOk(state, { type: "THIEVES_GUILD_ACTION", playerId: "p1", buildingId: "cove.thieves_guild", target: { kind: "shared", deckId: "spells" } });
    const choice = thievesChoice(open);
    expect(choice.thievesGuild?.cardIds).toEqual(["spell.haste", "spell.bless"]); // [top, second]

    // optionIndex 0 = discard the top (haste); keep the second (bless) on top.
    const after = applyOk(open, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    const deck = after.decks.spells;
    expect(deck.drawPile[deck.drawPile.length - 1]).toBe("spell.bless"); // kept on top
    expect(deck.discardPile).toContain("spell.haste"); // discarded
    expect(deck.drawPile).not.toContain("spell.haste");
    expect(deck.drawPile).toEqual(["spell.magic_arrow", "spell.bless"]);
    expect(after.pendingChoice).toBeNull();
  });

  it("on a shared deck: option 1 discards the second card, leaves the top on top", () => {
    const state = guildGame("tg-shared-1");
    state.decks.spells.drawPile = ["spell.magic_arrow", "spell.bless", "spell.haste"];

    const open = applyOk(state, { type: "THIEVES_GUILD_ACTION", playerId: "p1", buildingId: "cove.thieves_guild", target: { kind: "shared", deckId: "spells" } });
    const choice = thievesChoice(open);
    const after = applyOk(open, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });
    const deck = after.decks.spells;
    expect(deck.drawPile[deck.drawPile.length - 1]).toBe("spell.haste"); // top stays on top
    expect(deck.discardPile).toContain("spell.bless"); // second discarded
    expect(deck.drawPile).toEqual(["spell.magic_arrow", "spell.haste"]);
  });

  it("reaches an OPPONENT's Might & Magic deck (their deck + their discard)", () => {
    const state = guildGame("tg-opponent");
    state.players.p2.deck = ["stat.attack", "stat.defense", "stat.power"]; // top = power, second = defense
    state.players.p2.discard = [];

    const open = applyOk(state, { type: "THIEVES_GUILD_ACTION", playerId: "p1", buildingId: "cove.thieves_guild", target: { kind: "player", ownerId: "p2" } });
    const choice = thievesChoice(open);
    expect(choice.thievesGuild?.cardIds).toEqual(["stat.power", "stat.defense"]);

    const after = applyOk(open, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(after.players.p2.deck[after.players.p2.deck.length - 1]).toBe("stat.defense"); // kept on top of THEIR deck
    expect(after.players.p2.discard).toContain("stat.power"); // into THEIR discard
    expect(after.players.p2.deck).toEqual(["stat.attack", "stat.defense"]);
  });

  it("reaches your OWN Might & Magic deck too", () => {
    const state = guildGame("tg-own");
    state.players.p1.deck = ["stat.attack", "stat.defense", "stat.power"];
    state.players.p1.discard = [];

    const open = applyOk(state, { type: "THIEVES_GUILD_ACTION", playerId: "p1", buildingId: "cove.thieves_guild", target: { kind: "player", ownerId: "p1" } });
    const choice = thievesChoice(open);
    const after = applyOk(open, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });
    expect(after.players.p1.deck[after.players.p1.deck.length - 1]).toBe("stat.power");
    expect(after.players.p1.discard).toContain("stat.defense");
  });
});

describe("Thieves' Guild — once per turn", () => {
  it("cannot be used twice in the same turn (the offer disappears after one use)", () => {
    const state = guildGame("tg-once");
    state.decks.spells.drawPile = ["spell.magic_arrow", "spell.bless", "spell.haste"];

    const open = applyOk(state, { type: "THIEVES_GUILD_ACTION", playerId: "p1", buildingId: "cove.thieves_guild", target: { kind: "shared", deckId: "spells" } });
    const choice = thievesChoice(open);
    const resolved = applyOk(open, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });

    // No second offer this turn...
    expect(thievesActions(resolved).length).toBe(0);
    // ...and a forced second attempt is rejected by the reducer.
    const forced = applyAction(resolved, {
      type: "THIEVES_GUILD_ACTION",
      playerId: "p1",
      buildingId: "cove.thieves_guild",
      target: { kind: "shared", deckId: "spells" }
    });
    expect(forced.errors.length).toBeGreaterThan(0);
  });

  it("a forced action without the building is rejected", () => {
    const state = guildGame("tg-nobuilding", []);
    state.decks.spells.drawPile = ["spell.magic_arrow", "spell.bless", "spell.haste"];
    const result = applyAction(state, {
      type: "THIEVES_GUILD_ACTION",
      playerId: "p1",
      buildingId: "cove.thieves_guild",
      target: { kind: "shared", deckId: "spells" }
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.pendingChoice).toBeNull();
  });
});

describe("Thieves' Guild — multiplayer privacy", () => {
  it("hides the two peeked cards (and the option labels) from everyone but the thief", () => {
    const state = guildGame("tg-privacy");
    state.players.p2.deck = ["stat.attack", "stat.defense", "stat.power"];
    const open = applyOk(state, { type: "THIEVES_GUILD_ACTION", playerId: "p1", buildingId: "cove.thieves_guild", target: { kind: "player", ownerId: "p2" } });

    // The thief (p1) sees the real cards and naming labels.
    const thiefView = getPlayerView(open, "p1");
    const thiefChoice = thiefView.pendingChoice;
    expect(thiefChoice?.type === "OPTION_CHOICE" ? thiefChoice.thievesGuild?.cardIds : null).toEqual([
      "stat.power",
      "stat.defense"
    ]);
    const thiefLabels = thiefChoice?.type === "OPTION_CHOICE" ? thiefChoice.options.map((option) => option.label) : [];
    expect(thiefLabels.some((label) => /power/i.test(label))).toBe(true);

    // The deck's owner (p2) — and any other player — learns nothing about the cards.
    const victimView = getPlayerView(open, "p2");
    const victimChoice = victimView.pendingChoice;
    expect(victimChoice?.type === "OPTION_CHOICE" ? victimChoice.thievesGuild?.cardIds : null).toEqual([
      "hidden",
      "hidden"
    ]);
    const victimLabels = victimChoice?.type === "OPTION_CHOICE" ? victimChoice.options.map((option) => option.label) : [];
    expect(victimLabels.every((label) => label === "Hidden card")).toBe(true);
    expect(victimChoice?.type === "OPTION_CHOICE" ? victimChoice.prompt : "").not.toMatch(/stat|power|defense/i);
  });
});
