/**
 * Global house rule `mine-guard-reinforcement` (default OFF in BOTH modes).
 *
 * When ON, every fought-out neutral guard fight on a MINE field (all resource
 * types — gold / valuables / materials share `location === "mine"`) fields ONE
 * EXTRA random neutral BRONZE creature on top of the normal guard army, drawn
 * from the bronze Neutral deck. The extra bronze is a plain draw that recycles to
 * the bronze discard at combat end like any guard; it NEVER touches the fight's
 * difficulty / XP / reward (only the fought army grows), and Quick Combat / level
 * auto-wins resolved before the army deploys are unaffected. Creature Banks are
 * not mines and never get it.
 *
 * Every claim below fails if the wiring is removed; each carries a rule-OFF or
 * non-mine CONTROL, and the reward/bank/recycle claims are mutation-checked
 * (removing the append makes the ON case behave like the OFF control).
 */
import { describe, expect, it } from "vitest";
import { drawGuardArmy, getMainHero, NEUTRAL_DECK_IDS, placeCreatureBank } from "./adventure";
import { createAdventureGameState } from "./adventure-setup";
import { applyAction, getLegalActions } from "./index";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import { finishCombatIfNeeded } from "./combat-units";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { GameAction, GameState, HouseRuleId, MapFieldState } from "./state";

const BRONZE = NEUTRAL_DECK_IDS.bronze;

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A BINH adventure with the given house-rule overrides frozen in. */
function game(houseRules: Partial<Record<HouseRuleId, boolean>>, seed = "mine-guard"): GameState {
  return createAdventureGameState({
    seed,
    ruleset: "binh",
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules,
    players: [
      { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" }
    ]
  });
}

/** Builds a field of the given location/difficulty (default a Mine). */
function fieldFor(spaceId: string, difficulty: number, location = "mine"): MapFieldState {
  return {
    spaceId,
    tileInstanceId: "t",
    slot: 0,
    location,
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  } as MapFieldState;
}

// ===========================================================================
// drawGuardArmy — the mint seam (observable army size + tier, seeded)
// ===========================================================================

describe("mine-guard-reinforcement — drawGuardArmy", () => {
  it("ON: a Mine guard fight fields the table army +1 EXTRA bronze from the bronze deck", () => {
    const state = game({ "mine-guard-reinforcement": true });
    const field = fieldFor("mine-field", 1);
    // Deterministic bronze deck: `gnolls` is the top (drawn as the difficulty-1
    // base body), `harpies` is next (the extra reinforcement).
    state.decks[BRONZE]!.drawPile = ["neutral.harpies", "neutral.gnolls"];

    const draws = drawGuardArmy(state, field, 1);

    // Normal difficulty 1 = 1 bronze base; the rule appends exactly one more.
    expect(draws).toHaveLength(2);
    expect(draws.every((draw) => draw.tier === "bronze")).toBe(true);
    expect(draws[0]!.unitDefId, "the base body").toBe("neutral.gnolls");
    expect(draws[1]!.unitDefId, "the extra reinforcement, drawn from the bronze deck").toBe("neutral.harpies");
    // The extra is a plain (non-bankGuard) draw so it recycles like any guard.
    expect(draws[1]!.bankGuard).toBeFalsy();
    expect(state.decks[BRONZE]!.drawPile, "both bodies popped the bronze deck").toHaveLength(0);
  });

  it("OFF: byte-identical — the same Mine fight fields only the base army (CONTROL)", () => {
    const state = game({ "mine-guard-reinforcement": false });
    const field = fieldFor("mine-field", 1);
    state.decks[BRONZE]!.drawPile = ["neutral.harpies", "neutral.gnolls"];

    const draws = drawGuardArmy(state, field, 1);

    expect(draws).toHaveLength(1);
    expect(draws[0]!.unitDefId).toBe("neutral.gnolls");
    // The extra never drew — `harpies` is still on top of the bronze deck.
    expect(state.decks[BRONZE]!.drawPile).toEqual(["neutral.harpies"]);
  });

  it("a NON-mine guard field is unaffected even with the rule ON (CONTROL)", () => {
    const state = game({ "mine-guard-reinforcement": true });
    const field = fieldFor("guard-field", 1, "empty_field");
    state.decks[BRONZE]!.drawPile = ["neutral.harpies", "neutral.gnolls"];

    const draws = drawGuardArmy(state, field, 1);

    expect(draws).toHaveLength(1);
    expect(draws[0]!.unitDefId).toBe("neutral.gnolls");
    expect(state.decks[BRONZE]!.drawPile, "no extra draw on a non-mine field").toEqual(["neutral.harpies"]);
  });

  it("a designer EXACT-army Mine guard also gets +1 bronze (funnels through the same seam)", () => {
    const state = game({ "mine-guard-reinforcement": true });
    const field = fieldFor("mine-field", 3);
    // Certain army: the exact cards are minted bank-style (never deck-drawn);
    // the mine reinforcement still appends one deck-drawn bronze on top.
    field.customGuardUnits = ["neutral.gnolls"];
    state.decks[BRONZE]!.drawPile = ["neutral.harpies"];

    const draws = drawGuardArmy(state, field, 3);

    expect(draws).toHaveLength(2);
    const exact = draws.find((draw) => draw.unitDefId === "neutral.gnolls");
    const extra = draws.find((draw) => draw.unitDefId === "neutral.harpies");
    expect(exact?.bankGuard, "the designed body is minted, not deck-drawn").toBe(true);
    expect(extra, "the extra bronze reinforcement").toBeTruthy();
    expect(extra?.tier).toBe("bronze");
    expect(extra?.bankGuard, "the extra recycles like a normal guard").toBeFalsy();
  });

  it("legacy snapshot / absent house-rule map = OFF, no fold (CONTROL)", () => {
    const state = createAdventureGameState({
      seed: "mine-guard-legacy",
      ruleset: "legacy",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "A", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "B", factionId: "rampart", heroDefId: "gelu" }
      ]
    });
    // Simulate an old snapshot with no frozen house-rule map at all.
    delete (state.adventure as { houseRules?: unknown }).houseRules;
    const field = fieldFor("mine-field", 1);
    state.decks[BRONZE]!.drawPile = ["neutral.harpies", "neutral.gnolls"];

    const draws = drawGuardArmy(state, field, 1);

    expect(draws).toHaveLength(1);
    expect(state.decks[BRONZE]!.drawPile).toEqual(["neutral.harpies"]);
  });
});

// ===========================================================================
// Combat flow — reward untouched, banks excluded, recycling
// ===========================================================================

/**
 * Stages the main hero on `field`, opens the guard fight, deploys one player
 * unit and finishes placement — so the REAL reveal seam (finishCombatPlacement →
 * drawGuardArmy) runs, then returns the mid-combat state.
 */
function fightOn(state: GameState, field: MapFieldState): GameState {
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  const hero = getMainHero(state, "p1")!;
  hero.level = 1; // strictly below the field difficulty → a real fight, not Quick Combat
  hero.spaceId = field.spaceId;
  state.adventure!.fields[field.spaceId] = field;

  startNeutralEncounter(state, hero, field);
  const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  expect(place, "a player unit is placeable").toBeTruthy();
  let next = applyOk(state, place!.action);
  next = applyOk(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  return next;
}

describe("mine-guard-reinforcement — combat flow", () => {
  it("reward driver UNTOUCHED: the extra bronze never changes the fight difficulty", () => {
    // Rewards/XP for beating a guard are difficulty-based; the rule raises the
    // fought ARMY only. The context difficulty (the reward driver) is unchanged
    // vs the rule-off control.
    const on = fightOn(game({ "mine-guard-reinforcement": true }, "mine-reward-on"), fieldFor("mine-field", 2));
    const off = fightOn(game({ "mine-guard-reinforcement": false }, "mine-reward-off"), fieldFor("mine-field", 2));
    expect(on.combat?.context.kind).toBe("neutral");
    expect(on.combat?.context.kind === "neutral" && on.combat.context.difficulty).toBe(2);
    expect(off.combat?.context.kind === "neutral" && off.combat.context.difficulty).toBe(2);

    // And the ON fight really does field one more neutral than the OFF control.
    const neutralCount = (s: GameState) =>
      Object.values(s.combat!.units).filter((u) => u.controllerId === NEUTRAL_PLAYER_ID).length;
    expect(neutralCount(on), "ON fields +1 neutral over the OFF control").toBe(neutralCount(off) + 1);
  });

  it("a Creature Bank is NOT a mine and never gets the extra, even with the rule ON (CONTROL)", () => {
    // Banks reveal via buildCreatureBankDraws (bankUnit guards), a separate mint
    // the rule never touches — a plausible wrong impl keyed off "neutral combat"
    // would leak a bronze in here.
    const state = game({ "mine-guard-reinforcement": true }, "mine-bank");
    for (const pl of Object.values(state.players)) {
      pl.canMulligan = false;
      pl.needsHandRefresh = false;
    }
    state.activePlayerId = "p1";
    state.pendingChoice = null;
    state.reactionWindow = null;
    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.spaceId = "bank-field";
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    } as MapFieldState;
    // placeCreatureBank carves the bank onto the blocked field.
    placeCreatureBank(state, "bank-field", "crypt");

    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    let next = applyOk(state, place!.action);
    next = applyOk(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    const neutrals = Object.values(next.combat!.units).filter((u) => u.controllerId === NEUTRAL_PLAYER_ID);
    // Every bank defender is a bankUnit guard; none is a plain reinforcement.
    expect(neutrals.length).toBeGreaterThan(0);
    expect(neutrals.every((u) => u.bankGuard), "every bank defender is a minted bank guard, no extra bronze").toBe(true);
  });

  it("the extra bronze recycles to the bronze discard at combat end", () => {
    const state = game({ "mine-guard-reinforcement": true }, "mine-recycle-on");
    // Deterministic bronze deck for a difficulty-2 mine: gnolls + orcs are the
    // two base bodies (popped first), harpies is the extra (popped third).
    state.decks[BRONZE]!.drawPile = ["neutral.harpies", "neutral.orcs", "neutral.gnolls"];
    const before = state.decks[BRONZE]!.discardPile.length;

    let fight = fightOn(state, fieldFor("mine-field", 2));
    // Win: wipe the neutral guards, leaving the placed player unit alive.
    for (const unit of Object.values(fight.combat!.units)) {
      if (unit.controllerId === NEUTRAL_PLAYER_ID) {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(fight);
    finalizeAdventureCombat(fight);

    const bronze = fight.decks[BRONZE]!;
    // All three drawn bronze bodies (2 base + 1 extra) cycled back to the discard.
    expect(bronze.discardPile.length).toBe(before + 3);
    expect(bronze.discardPile, "the extra reinforcement recycled").toContain("neutral.harpies");
    expect(bronze.drawPile, "the extra was consumed from the draw pile").not.toContain("neutral.harpies");
  });

  it("CONTROL: with the rule OFF the same Mine win recycles only the base bodies", () => {
    const state = game({ "mine-guard-reinforcement": false }, "mine-recycle-off");
    state.decks[BRONZE]!.drawPile = ["neutral.harpies", "neutral.orcs", "neutral.gnolls"];
    const before = state.decks[BRONZE]!.discardPile.length;

    let fight = fightOn(state, fieldFor("mine-field", 2));
    for (const unit of Object.values(fight.combat!.units)) {
      if (unit.controllerId === NEUTRAL_PLAYER_ID) {
        unit.damage = unit.maxHealth;
      }
    }
    finishCombatIfNeeded(fight);
    finalizeAdventureCombat(fight);

    const bronze = fight.decks[BRONZE]!;
    // Only the 2 base bodies recycled; `harpies` was never drawn (still on top).
    expect(bronze.discardPile.length).toBe(before + 2);
    expect(bronze.discardPile).not.toContain("neutral.harpies");
    expect(bronze.drawPile, "the extra stayed unused in the draw pile").toContain("neutral.harpies");
  });
});
