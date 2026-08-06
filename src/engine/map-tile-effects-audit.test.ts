import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState, PlayerId, VisitStep } from "./state";
import {
  addArmyUnit,
  beginFieldVisit,
  createSecondaryHero,
  getMainHero,
  reinforceCostFor,
  resourceDieFaces
} from "./adventure";
import { pumpAdventureQueues, resolveVisitStep } from "./adventure-reducer";
import { getLegalActions } from "./legal-actions";
import { applyAction, createAdventureGameState, eligibleSpellDecks } from "./index";
import { locationDefinitions } from "@/data/map/locations";

/**
 * Map-tile field EFFECT audit (CLAUDE.md rule #1: a field is "done" only if the
 * engine executes its effect AND a test fails if that logic is removed).
 *
 * These tests assert the observable game OUTCOME of visiting a Field — the gold
 * gained, the morale token, the movement, the card moved, the OR-branch taken,
 * the cross-player income transfer — not merely that a black cube was placed.
 * The cube/decline invariant lives in visitable-fields-cube.test.ts; this file
 * is the missing outcome coverage for the fields that were wired but untested,
 * plus the cyclops-stockpile Treasure→Resource-die correction.
 *
 * Setup facts pinned by these tests:
 *  - p1's faction is Castle (morale works); p2's is Necropolis (ignoresMorale),
 *    so every morale assertion uses p1.
 *  - A Resource die only yields gold/materials/valuables; a Treasure die can
 *    yield experience or an Artifact search. That difference is what the
 *    cyclops-stockpile block exploits as its die-type discriminator.
 */

const FIELD_ID = "50,50";

function makeGame(seed = "map-tile-audit"): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
}

function injectField(
  state: GameState,
  location: string,
  opts: { difficulty?: number; blackCube?: boolean; flagOwnerId?: string | null; everFlagged?: boolean; spaceId?: string } = {}
): MapFieldState {
  const field: MapFieldState = {
    spaceId: opts.spaceId ?? FIELD_ID,
    tileInstanceId: "audit-tile",
    slot: 0,
    location,
    difficulty: opts.difficulty,
    blackCube: opts.blackCube ?? false,
    flagOwnerId: opts.flagOwnerId ?? null,
    everFlagged: opts.everFlagged ?? false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  return field;
}

function visit(state: GameState, playerId: PlayerId, field: MapFieldState): void {
  const hero = getMainHero(state, playerId)!;
  hero.spaceId = field.spaceId;
  beginFieldVisit(state, hero.id, field.spaceId, false);
}

/** Put a synthetic audit field on a real split-deck tile band. */
function putFieldOnBand(state: GameState, field: MapFieldState, group: "starting" | "far" | "near" | "center"): void {
  const template = Object.values(state.adventure!.tiles)[0]!;
  const backLabel = group === "starting" ? "Ⅰ" : group === "far" ? "Ⅱ–Ⅲ" : group === "near" ? "Ⅳ–Ⅴ" : "Ⅵ–Ⅶ";
  state.adventure!.tiles[field.tileInstanceId] = {
    ...template,
    id: field.tileInstanceId,
    group,
    backLabel,
    faceDown: false,
    awaitingRotation: false
  };
}

/** Resolve the first pending CHOOSE_ONE step by matching an option label. */
function choose(state: GameState, playerId: PlayerId, match: (label: string) => boolean): void {
  const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "CHOOSE_ONE" }> | undefined;
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`Expected CHOOSE_ONE, got ${step?.type ?? "none"}`);
  }
  const optionIndex = step.options.findIndex((option) => match(option.label));
  if (optionIndex < 0) {
    throw new Error(`No option matched among: ${step.options.map((option) => option.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex });
}

/** A field visit that queued an Artifact/Spell/Ability search puts it here. */
function queuedSearches(state: GameState, deckId: string): number {
  return state
    .adventure!.rewardQueue.filter(
      (reward) => reward.kind === "shared-deck-search" && (reward as { deckId?: string }).deckId === deckId
    ).length;
}

function totalResources(state: GameState, playerId: PlayerId): number {
  const r = state.players[playerId]!.resources;
  return r.gold + r.buildingMaterials + r.valuables;
}

// ---------------------------------------------------------------------------
// Cyclops Stockpile — rolls RESOURCE dice, not Treasure dice (wiki correction)
// ---------------------------------------------------------------------------
// Wiki (https://en.homm3bg.wiki/fields/cyclops_stockpile/) reward, verbatim:
// "roll and resolve 4 Resource dice." The data previously rolled Treasure dice,
// which leaked the experience / Artifact-search faces into the reward.
describe("Cyclops Stockpile rolls 4 Resource dice (not Treasure dice)", () => {
  it("its interaction is a SEQUENCE of four Resource-die rolls (die-type guard)", () => {
    const interaction = locationDefinitions.cyclops_stockpile.interaction;
    expect(interaction.type).toBe("SEQUENCE");
    if (interaction.type === "SEQUENCE") {
      expect(interaction.interactions).toHaveLength(4);
      for (const inner of interaction.interactions) {
        expect(inner.type).toBe("ROLL_RESOURCE_DICE");
      }
    }
  });

  it("a visit only ever grants resources — never experience or an Artifact search", () => {
    // Across many seeds the reward must stay pure resources. With Treasure dice
    // (the prior bug) ~2/6 faces per die are experience and ~2/6 an Artifact
    // search, so over 25 seeds the old code would have moved experience or
    // queued an Artifact search with near-certainty — this fails on a revert.
    for (let i = 0; i < 25; i += 1) {
      const state = makeGame(`cyclops-${i}`);
      const player = state.players.p1;
      player.hand = []; // no die-reroll artifacts that would pend the roll
      const hero = getMainHero(state, "p1")!;
      hero.experience = 7;
      const before = totalResources(state, "p1");
      const field = injectField(state, "cyclops_stockpile");

      visit(state, "p1", field);

      expect(hero.experience).toBe(7); // Resource dice cannot grant experience
      expect(queuedSearches(state, "artifacts")).toBe(0); // nor an Artifact search
      expect(totalResources(state, "p1")).toBeGreaterThan(before); // 4 dice, all gained
      expect(state.adventure!.pendingVisit).toBeNull(); // fully auto-resolved
    }
  });
});

// ---------------------------------------------------------------------------
// "OR" choices resolve EXACTLY ONE branch (mutual exclusivity)
// ---------------------------------------------------------------------------
describe("Resource die house rule", () => {
  // The valuables cap is the BINH house rule `resource-die-single-valuables`;
  // the printed die (base game / Legacy) keeps its "2 valuables" face. Both
  // sides — and every consumer — are pinned in resource-die-valuables.test.ts.
  it("caps valuables at 1 under BINH, and keeps the printed 2 in Legacy", () => {
    const binh = { ruleset: "binh", adventure: null } as unknown as GameState;
    const legacy = { ruleset: "legacy", adventure: null } as unknown as GameState;
    const valuableFaces = resourceDieFaces(binh).filter((face) => face.resource === "valuables");
    // There are still two valuables faces, but neither yields more than 1.
    expect(valuableFaces.length).toBeGreaterThan(0);
    expect(Math.max(...valuableFaces.map((face) => face.amount))).toBe(1);
    expect(resourceDieFaces(binh).some((face) => face.resource === "valuables" && face.amount >= 2)).toBe(false);
    expect(resourceDieFaces(legacy).some((face) => face.resource === "valuables" && face.amount === 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Map-tile deck access — preserve the actual visiting Hero across reward queue
// ---------------------------------------------------------------------------
describe("map-location searches use the visiting hero's tile", () => {
  it("Warrior's Tomb on IV–V offers Minor + Major and rolls for Relic for a Secondary Hero", () => {
    const state = createAdventureGameState({
      seed: "secondary-tomb-near",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "split-decks": true, "polish-random-artifacts": true }
    });
    const field = injectField(state, "warriors_tomb", { spaceId: "secondary-tomb" });
    putFieldOnBand(state, field, "near");
    const secondary = createSecondaryHero(state, "p1", field.spaceId);

    beginFieldVisit(state, secondary.id, field.spaceId, false);
    const queued = state.adventure!.rewardQueue.filter((reward) => reward.kind === "shared-deck-search");
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({ sourceHeroId: secondary.id, sourceFieldId: field.spaceId });

    pumpAdventureQueues(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("deck-pick");
    const deckIds = choice?.type === "OPTION_CHOICE" ? (choice.deckPick?.deckIds ?? []) : [];
    expect(deckIds).toEqual(expect.arrayContaining(["artifacts-minor", "artifacts-major"]));
    const roll = [...state.eventLog].reverse().find(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "attack"
    );
    expect(roll?.type).toBe("ADVENTURE_DICE_ROLLED");
    const rolledPlus = roll?.type === "ADVENTURE_DICE_ROLLED" && roll.attackRolls?.[0] === 1;
    expect(deckIds.includes("artifacts-relic")).toBe(rolledPlus);

    // CONTROL: the Main Hero stayed on a different tile. Substituting it in the
    // reward pump would reduce this near-tile find to the wrong shallow access.
    expect(state.heroes.hero_p1.spaceId).not.toBe(field.spaceId);
  });

  it("a Secondary Hero's IV–V shrine search offers Basic + Expert spells", () => {
    const state = createAdventureGameState({
      seed: "secondary-shrine-near",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "split-decks": true, "polish-spell-book": false }
    });
    const field = injectField(state, "shrine_of_magic_gesture", { spaceId: "secondary-shrine" });
    putFieldOnBand(state, field, "near");
    const secondary = createSecondaryHero(state, "p1", field.spaceId);
    expect(state.decks["spells-expert"]).toBeTruthy();
    expect(eligibleSpellDecks(state, "p1", secondary)).toEqual(["spells", "spells-expert"]);

    beginFieldVisit(state, secondary.id, field.spaceId, false);
    const queued = state.adventure!.rewardQueue.filter((reward) => reward.kind === "shared-deck-search");
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ sourceHeroId: secondary.id, sourceFieldId: field.spaceId });
    pumpAdventureQueues(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("deck-pick");
    const deckIds = choice?.type === "OPTION_CHOICE" ? (choice.deckPick?.deckIds ?? []) : [];
    expect(deckIds).toEqual(expect.arrayContaining(["spells", "spells-expert"]));
    expect(state.heroes.hero_p1.spaceId).not.toBe(field.spaceId);
  });
});

describe('Map "OR" choices resolve exactly one branch', () => {
  it("Mystical Garden: BINH gold rule grants +3 gold and NOT the valuables branch", () => {
    const state = makeGame();
    const player = state.players.p1;
    const gold = player.resources.gold;
    const valuables = player.resources.valuables;
    visit(state, "p1", injectField(state, "mystical_garden"));

    choose(state, "p1", (label) => label.includes("3 gold"));

    expect(player.resources.gold).toBe(gold + 3);
    expect(player.resources.valuables).toBe(valuables); // the other branch did not run
  });

  it("Mystical Garden: with the BINH rule off, the printed gold branch grants exactly +2", () => {
    const state = makeGame("mystical-garden-printed");
    state.adventure!.houseRules!["mystical-garden-gold"] = false;
    const player = state.players.p1;
    const gold = player.resources.gold;
    const valuables = player.resources.valuables;
    visit(state, "p1", injectField(state, "mystical_garden"));

    choose(state, "p1", (label) => label.includes("2 gold"));

    expect(player.resources.gold).toBe(gold + 2);
    expect(player.resources.valuables).toBe(valuables);
  });

  it("Mystical Garden: taking valuables grants +1 valuables and NOT the gold branch", () => {
    const state = makeGame();
    const player = state.players.p1;
    const gold = player.resources.gold;
    const valuables = player.resources.valuables;
    visit(state, "p1", injectField(state, "mystical_garden"));

    choose(state, "p1", (label) => label.includes("1 valuables"));

    expect(player.resources.valuables).toBe(valuables + 1);
    expect(player.resources.gold).toBe(gold); // the other branch did not run
  });

  it("Derelict Ship: the offer is Search(2) AND +2 gold together; declining gives nothing", () => {
    // "You may Search(2) the Artifact deck. If you do so, you also gain 2 gold."
    const accept = makeGame("derelict-accept");
    const acceptPlayer = accept.players.p1;
    const goldBefore = acceptPlayer.resources.gold;
    visit(accept, "p1", injectField(accept, "derelict_ship"));
    choose(accept, "p1", (label) => label.toLowerCase().includes("search"));
    expect(acceptPlayer.resources.gold).toBe(goldBefore + 2); // the AND's gold half
    expect(queuedSearches(accept, "artifacts")).toBe(1); // the AND's search half

    const decline = makeGame("derelict-decline");
    const declinePlayer = decline.players.p1;
    const declineGold = declinePlayer.resources.gold;
    const field = injectField(decline, "derelict_ship");
    visit(decline, "p1", field);
    choose(decline, "p1", (label) => label === "Decline");
    expect(declinePlayer.resources.gold).toBe(declineGold); // nothing gained
    expect(queuedSearches(decline, "artifacts")).toBe(0);
    expect(field.blackCube).toBe(true); // but the field is still spent
  });
});

// ---------------------------------------------------------------------------
// Flat resource / search amounts (exact wiki values)
// ---------------------------------------------------------------------------
describe("Flat-amount fields grant exactly the wiki amount", () => {
  const cases: { id: string; resource: "gold" | "buildingMaterials" | "valuables"; amount: number }[] = [
    { id: "water_wheel", resource: "gold", amount: 3 },
    { id: "windmill", resource: "valuables", amount: 1 },
    { id: "flotsam", resource: "buildingMaterials", amount: 2 }
  ];
  for (const testCase of cases) {
    it(`${testCase.id}: +${testCase.amount} ${testCase.resource}`, () => {
      const state = makeGame();
      const player = state.players.p1;
      const before = player.resources[testCase.resource];
      visit(state, "p1", injectField(state, testCase.id));
      expect(player.resources[testCase.resource]).toBe(before + testCase.amount);
    });
  }

  it("Temple of the Sea: +10 gold AND two separate Search(2) Artifact searches", () => {
    const state = makeGame();
    const player = state.players.p1;
    const gold = player.resources.gold;
    visit(state, "p1", injectField(state, "temple_of_the_sea"));
    expect(player.resources.gold).toBe(gold + 10);
    expect(queuedSearches(state, "artifacts")).toBe(2); // "Search(2) ... twice"
  });

  it("Grave: -1 morale AND +3 gold AND one Search(1) (rulebook count, not the wiki's 2)", () => {
    const state = makeGame();
    const player = state.players.p1;
    const gold = player.resources.gold;
    const morale = player.morale;
    visit(state, "p1", injectField(state, "grave"));
    expect(player.resources.gold).toBe(gold + 3);
    expect(player.morale).toBe(morale - 1);
    expect(queuedSearches(state, "artifacts")).toBe(1);
  });

  it("Artifact Symbol: queues one Search(2) of the Artifact deck", () => {
    const state = makeGame();
    visit(state, "p1", injectField(state, "artifact_symbol"));
    expect(queuedSearches(state, "artifacts")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Attack-die-table sea fields (Sea Chest / Jetsam): the roll picks the branch
// ---------------------------------------------------------------------------
// Seeds chosen so each Attack-die face is exercised deterministically. Sea Chest
// covers the shared ATTACK_DIE_TABLE dispatch (the +1/0/-1 selection used by
// Jetsam too); Jetsam pins its own "+1 resolves both dice" payload.
describe("Sea Chest resolves the Attack-die branch (+1 / 0 / -1)", () => {
  it("+1: Search(1) the Artifact deck, no gold", () => {
    const state = makeGame("sea_chest-6");
    const player = state.players.p1;
    player.hand = [];
    const gold = player.resources.gold;
    visit(state, "p1", injectField(state, "sea_chest"));
    expect(queuedSearches(state, "artifacts")).toBe(1);
    expect(player.resources.gold).toBe(gold);
  });

  it("0: gain 5 gold, no artifact search", () => {
    const state = makeGame("sea_chest-3");
    const player = state.players.p1;
    player.hand = [];
    const gold = player.resources.gold;
    visit(state, "p1", injectField(state, "sea_chest"));
    expect(player.resources.gold).toBe(gold + 5);
    expect(queuedSearches(state, "artifacts")).toBe(0);
  });

  it("-1: nothing happens", () => {
    const state = makeGame("sea_chest-0");
    const player = state.players.p1;
    player.hand = [];
    const gold = player.resources.gold;
    visit(state, "p1", injectField(state, "sea_chest"));
    expect(player.resources.gold).toBe(gold);
    expect(queuedSearches(state, "artifacts")).toBe(0);
  });
});

describe("Jetsam: +1 resolves TWO resource dice; -1 gives nothing", () => {
  it("its +1 branch resolves both dice (a SEQUENCE of count:1, not a roll-2-pick-1)", () => {
    const jetsam = locationDefinitions.jetsam.interaction;
    expect(jetsam.type).toBe("ATTACK_DIE_TABLE");
    if (jetsam.type === "ATTACK_DIE_TABLE") {
      expect(jetsam.plus.type).toBe("SEQUENCE");
      if (jetsam.plus.type === "SEQUENCE") {
        expect(jetsam.plus.interactions).toHaveLength(2);
        for (const inner of jetsam.plus.interactions) {
          expect(inner.type).toBe("ROLL_RESOURCE_DICE");
          if (inner.type === "ROLL_RESOURCE_DICE") {
            expect(inner.count).toBe(1);
          }
        }
      }
    }
  });

  it("-1: nothing is gained", () => {
    const state = makeGame("jetsam-1");
    const player = state.players.p1;
    player.hand = [];
    const total = totalResources(state, "p1");
    visit(state, "p1", injectField(state, "jetsam"));
    expect(totalResources(state, "p1")).toBe(total);
  });
});

// ---------------------------------------------------------------------------
// Morale & movement durations (persistent token vs this-turn movement)
// ---------------------------------------------------------------------------
// hero.movementPoints is the per-turn pool (reset to heroMovementMax at turn
// start, adventure.ts ~4897), so a field's +movement lasts THIS turn only.
// player.morale is the persistent token pool (changeMorale, adventure.ts ~1101),
// so a morale token is kept until spent — never silently turn-scoped.
describe("Morale tokens and this-turn movement", () => {
  it("Temple: +1 morale token (a held token, not a movement/turn effect)", () => {
    const state = makeGame();
    const player = state.players.p1;
    const morale = player.morale;
    const hero = getMainHero(state, "p1")!;
    const movement = hero.movementPoints;
    visit(state, "p1", injectField(state, "temple"));
    expect(player.morale).toBe(morale + 1);
    expect(hero.movementPoints).toBe(movement); // morale only, no movement
  });

  it("Buoy: +1 morale token", () => {
    const state = makeGame();
    const player = state.players.p1;
    const morale = player.morale;
    visit(state, "p1", injectField(state, "buoy"));
    expect(player.morale).toBe(morale + 1);
  });

  it("Mermaid: +1 morale AND +1 movement (both halves of the SEQUENCE)", () => {
    const state = makeGame();
    const player = state.players.p1;
    const hero = getMainHero(state, "p1")!;
    const morale = player.morale;
    const movement = hero.movementPoints;
    visit(state, "p1", injectField(state, "mermaid"));
    expect(player.morale).toBe(morale + 1);
    expect(hero.movementPoints).toBe(movement + 1);
  });

  it("Stables: +1 movement (this-turn pool), no morale, and no black cube (revisitable)", () => {
    const state = makeGame();
    const player = state.players.p1;
    const hero = getMainHero(state, "p1")!;
    const movement = hero.movementPoints;
    const morale = player.morale;
    const field = injectField(state, "stables");
    visit(state, "p1", field);
    expect(hero.movementPoints).toBe(movement + 1);
    expect(player.morale).toBe(morale); // movement only
    expect(field.blackCube).toBe(false); // revisitable, never cubed
  });

  it("Warrior's Tomb: two Artifact searches, then morale lands at −2 (no mid-turn dump)", () => {
    // Tomb = Search(2)×2 then two negatives: 0 → −1 → −2. Hand dump is NOT
    // armed mid-turn — only END_TURN while still at −2 discards the hand.
    const state = makeGame();
    const player = state.players.p1;
    expect(player.morale).toBe(0);
    const beforeEvents = state.eventLog.length;
    visit(state, "p1", injectField(state, "warriors_tomb"));
    expect(queuedSearches(state, "artifacts")).toBe(2); // Search(2) twice
    expect(player.morale).toBe(-2);
    expect(player.discardHandAtTurnEnd ?? false).toBe(false);
    expect(player.hand.length).toBeGreaterThan(0); // hand untouched mid-turn

    // Feed: two steps (−1 then −2), never a batch "morale −2 (now 0)".
    const moraleEvents = state.eventLog
      .slice(beforeEvents)
      .filter((event) => event.type === "MORALE_CHANGED") as Array<{
      type: "MORALE_CHANGED";
      amount: number;
      total: number;
    }>;
    expect(moraleEvents).toHaveLength(2);
    expect(moraleEvents[0]).toMatchObject({ amount: -1, total: -1 });
    expect(moraleEvents[1]).toMatchObject({ amount: -1, total: -2 });
  });

  it("Warrior's Tomb then Mermaid (W6 path): −2 then +1 → −1, hand kept at end of turn", () => {
    // Tomb: 0 → −1 → −2. Mermaid: −2 → −1. End turn at −1 → KEEP hand.
    // CONTROL: ending still at −2 WOULD dump (covered by end-turn at −2 case).
    const state = makeGame("w6-tomb-mermaid");
    const player = state.players.p1;
    const keptHand = ["ability.attack", "ability.defence", "spell.magic_arrow"];
    player.hand = [...keptHand];
    player.morale = 0;

    visit(state, "p1", injectField(state, "warriors_tomb", { spaceId: "tomb-hex" }));
    expect(player.morale).toBe(-2);

    visit(state, "p1", injectField(state, "mermaid", { spaceId: "mermaid-hex" }));
    expect(player.morale).toBe(-1);

    const ended = applyAction(state, { type: "END_TURN", playerId: "p1" });
    expect(ended.errors, ended.errors.map((e) => e.message).join("; ")).toEqual([]);
    expect(ended.state.players.p1.hand).toEqual(keptHand);
    expect(ended.state.players.p1.morale).toBe(-1);
    expect(
      ended.state.eventLog.some(
        (event) => event.type === "HAND_REFRESHED" && event.reason === "morale-double-negative"
      )
    ).toBe(false);
  });

  it("ending the turn still at −2 discards the hand and leaves morale at −1", () => {
    const state = makeGame("w6-tomb-end-at-minus-2");
    const player = state.players.p1;
    player.hand = ["ability.attack", "ability.defence", "spell.magic_arrow"];
    player.morale = 0;

    visit(state, "p1", injectField(state, "warriors_tomb", { spaceId: "tomb-hex" }));
    expect(player.morale).toBe(-2);

    const ended = applyAction(state, { type: "END_TURN", playerId: "p1" });
    expect(ended.errors, ended.errors.map((e) => e.message).join("; ")).toEqual([]);
    expect(ended.state.players.p1.hand).toEqual([]);
    // Paying the penalty steps the marker back ONE, to −1 — never a free
    // recovery to neutral (CONTROL: a 0 here is the bug this pins).
    expect(ended.state.players.p1.morale).toBe(-1);
    expect(
      ended.state.eventLog.some(
        (event) =>
          event.type === "HAND_REFRESHED" &&
          event.reason === "morale-double-negative" &&
          event.discarded === 3
      )
    ).toBe(true);
    // The feed reports the real one-step recovery, not "+2 (now 0)".
    const recovery = ended.state.eventLog.filter(
      (event) => event.type === "MORALE_CHANGED" && event.playerId === "p1"
    );
    expect(recovery[recovery.length - 1]).toMatchObject({ amount: 1, total: -1 });
  });
});

// ---------------------------------------------------------------------------
// Scholar (map field): the Attack-die branch decides the reward
// ---------------------------------------------------------------------------
// Seeds chosen so each die face is exercised deterministically (verified):
//  scholar-0 -> +1 (gain/remove a Statistic), scholar-5 -> 0 (Ability deck),
//  scholar-1 -> -1 (Spell deck).
describe("Scholar field maps each Attack-die face to the right reward", () => {
  it("+1: offers a Statistic gain, and taking Attack puts stat.attack in hand", () => {
    const state = makeGame("scholar-0");
    const player = state.players.p1;
    player.hand = [];
    visit(state, "p1", injectField(state, "scholar"));
    const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "CHOOSE_ONE" }>;
    expect(step.type).toBe("CHOOSE_ONE");
    expect(step.prompt).toBe("Scholar: gain a Statistic card");
    choose(state, "p1", (label) => label === "Gain an Attack card");
    expect(player.hand).toContain("stat.attack");
  });

  it("0: searches the Ability deck (Search(2))", () => {
    const state = makeGame("scholar-5");
    state.players.p1.hand = [];
    visit(state, "p1", injectField(state, "scholar"));
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(queuedSearches(state, "abilities")).toBe(1);
    expect(queuedSearches(state, "spells")).toBe(0);
  });

  it("-1: searches the Spell deck (Search(2))", () => {
    const state = makeGame("scholar-1");
    state.players.p1.hand = [];
    visit(state, "p1", injectField(state, "scholar"));
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(queuedSearches(state, "spells")).toBe(1);
    expect(queuedSearches(state, "abilities")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// University & Market of Time (card-economy fields, previously untested)
// ---------------------------------------------------------------------------
describe("University: pay 6 gold to Search(4) the Ability DISCARD pile", () => {
  it("charges 6 gold and takes a card from the abilities discard into hand", () => {
    const state = makeGame("university");
    const player = state.players.p1;
    player.resources.gold = 20;
    player.hand = [];
    const deck = state.decks.abilities;
    const seeded = deck.drawPile.pop()!;
    deck.discardPile.push(seeded); // a prior turn's discard for the University to offer

    visit(state, "p1", injectField(state, "university"));
    // PAY_TO: pay the 6-gold option.
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(player.resources.gold).toBe(14);

    // SEARCH_DISCARD on the abilities discard; take the offered card (index 0).
    const search = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "SEARCH_DISCARD" }>;
    expect(search.type).toBe("SEARCH_DISCARD");
    expect(search.deckId).toBe("abilities");
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(player.hand).toContain(seeded);
    expect(deck.discardPile).not.toContain(seeded); // moved out of the discard
  });

  it("declining the payment charges nothing and still cubes the field", () => {
    const state = makeGame("university-decline");
    const player = state.players.p1;
    player.resources.gold = 20;
    const field = injectField(state, "university");
    visit(state, "p1", field);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });
    expect(player.resources.gold).toBe(20);
    expect(field.blackCube).toBe(true);
  });
});

describe("Market of Time: remove a card, then Search(2) ANY shared deck", () => {
  it("removes the chosen card and offers all three decks (unlike Faerie Ring)", () => {
    const state = makeGame("market-of-time");
    const player = state.players.p1;
    player.hand = ["spell.magic_arrow"];
    visit(state, "p1", injectField(state, "market_of_time"));

    // Remove the (removable) spell.
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(player.removed).toContain("spell.magic_arrow");
    expect(player.hand).not.toContain("spell.magic_arrow");

    // The follow-up lets the player pick ANY of the three decks to search.
    const labels = getLegalActions(state, "p1")
      .filter((action) => action.action.type === "RESOLVE_VISIT_STEP")
      .map((action) => action.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Search (2) the Ability deck",
        "Search (2) the Spell deck",
        "Search (2) the Artifact deck"
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// Hill Fort: the bronze/silver-only restriction is real (not decorative)
// ---------------------------------------------------------------------------
describe("Hill Fort discounts ONLY bronze/silver reinforcements", () => {
  it("stacks a flat Legion reduction after a half-cost source (default), while the old rule keeps them competing", () => {
    const state = makeGame("hill-fort-half-stack");
    const player = state.players.p1;
    player.army = [];
    const unit = addArmyUnit(player, "castle.crusaders", "few");
    player.recruitDiscounts = [
      {
        cardId: "artifact.legs_of_legion",
        amount: 4,
        target: { kind: "reinforce", armyUnitId: unit.id }
      }
    ];

    // Default additive pipeline: half price is 5, then the 4-gold voucher leaves 1.
    expect(reinforceCostFor(state, "p1", unit.id, true, false, false)?.gold).toBe(1);

    // Old rule (`immediate-reinforcement-prompts` ON): half-cost and the flat
    // stack COMPETE — the cheaper price wins, so half (5) beats 10 - 4 = 6.
    state.adventure!.houseRules = {
      ...(state.adventure!.houseRules ?? {}),
      "immediate-reinforcement-prompts": true
    };
    expect(reinforceCostFor(state, "p1", unit.id, true, false, false)?.gold).toBe(5);
  });

  // 2026-08-06: the Hill Fort NO LONGER banks by default — it opens its own
  // pick-and-pay window (see hill-fort-window.test.ts for the full new-reading
  // coverage). What this case still pins is the PRICING pipeline through that
  // window: the Hill Fort's own −3 gold applies FIRST and the reserved Legion
  // voucher is subtracted from what remains (additive, not competing).
  it("prices the Hill Fort window's own -3 gold BEFORE a reserved Legion voucher", () => {
    const state = makeGame("hill-fort-adjustable");
    const player = state.players.p1;
    player.canMulligan = false;
    player.needsHandRefresh = false;
    player.resources.gold = 50;
    player.army = [];
    const unit = addArmyUnit(player, "castle.crusaders", "few"); // Pack 10 gold
    player.recruitDiscounts = [
      {
        cardId: "artifact.legs_of_legion",
        amount: 4,
        target: { kind: "reinforce", armyUnitId: unit.id }
      }
    ];

    visit(state, "p1", injectField(state, "hill_fort"));
    // No bank offer any more: the window prices the reinforce directly.
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Bank Hill Fort/i.test(legal.label)
      )
    ).toBe(false);
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && /Reinforce Crusaders/.test(legal.label)
    );
    // Crusaders 10 − Hill Fort 3 first − Legs 4 = 3.
    expect(offer?.label).toContain("3 gold");
    const result = applyAction(state, offer!.action);
    expect(result.errors).toEqual([]);
    expect(result.state.players.p1.army[0]?.side).toBe("pack");
    expect(result.state.players.p1.resources.gold).toBe(47);
    // The voucher was consumed by the flip, and nothing was banked for later.
    expect(result.state.players.p1.recruitDiscounts).toHaveLength(0);
    expect(result.state.players.p1.reinforcementDiscounts ?? []).toHaveLength(0);
  });

  // These two keep the `immediate-reinforcement-prompts` flip ON deliberately:
  // since 2026-08-06 the Hill Fort window is rule-INDEPENDENT, so they are the
  // regression that the OLD-reading table still gets the identical window (the
  // default-off path is pinned in hill-fort-window.test.ts).
  it("offers bronze and silver Few units but never a gold-tier one", () => {
    const state = makeGame("hill-fort");
    state.adventure!.houseRules = {
      ...(state.adventure!.houseRules ?? {}),
      "immediate-reinforcement-prompts": true
    };
    const player = state.players.p1;
    player.resources.gold = 50;
    player.army = [];
    addArmyUnit(player, "castle.halberdiers", "few"); // bronze, pack cost 3 gold
    addArmyUnit(player, "castle.crusaders", "few"); // silver, pack cost 10 gold
    addArmyUnit(player, "castle.champions", "few"); // gold, pack cost 20 gold + 1 valuables

    visit(state, "p1", injectField(state, "hill_fort"));
    const labels = getLegalActions(state, "p1")
      .filter((action) => action.action.type === "RESOLVE_VISIT_STEP")
      .map((action) => action.label);

    expect(labels.some((label) => label.includes("Halberdiers"))).toBe(true); // bronze
    expect(labels.some((label) => label.includes("Crusaders"))).toBe(true); // silver
    expect(labels.some((label) => label.includes("Champions"))).toBe(false); // gold excluded
  });

  it("reinforces the chosen bronze Few to a Pack at a 3-gold discount (free at cost 3)", () => {
    const state = makeGame("hill-fort-reinforce");
    state.adventure!.houseRules = {
      ...(state.adventure!.houseRules ?? {}),
      "immediate-reinforcement-prompts": true
    };
    const player = state.players.p1;
    player.resources.gold = 50;
    player.army = [];
    const unit = addArmyUnit(player, "castle.halberdiers", "few"); // pack cost 3 gold -> 0

    visit(state, "p1", injectField(state, "hill_fort"));
    // Index 0 = the only offered (bronze) unit.
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(player.army.find((armyUnit) => armyUnit.id === unit.id)?.side).toBe("pack");
    expect(player.resources.gold).toBe(50); // 3 - 3 discount = free
  });
});

// ---------------------------------------------------------------------------
// PvP / multiplayer: cross-player flagging transfers
// ---------------------------------------------------------------------------
describe("Random Town capture transfers income between players", () => {
  it("first captor gains +10 income and 10 gold at once; a later captor only steals the income", () => {
    const state = makeGame("random-town-pvp");
    const p1 = state.players.p1;
    const p2 = state.players.p2;
    const p1Prod = p1.production.gold;
    const p1Gold = p1.resources.gold;
    const p2Prod = p2.production.gold;
    const p2Gold = p2.resources.gold;

    const field = injectField(state, "random_town");

    // p1 is the first-ever captor: +10 income AND +10 gold immediately.
    visit(state, "p1", field);
    expect(field.flagOwnerId).toBe("p1");
    expect(p1.production.gold).toBe(p1Prod + 10);
    expect(p1.resources.gold).toBe(p1Gold + 10);

    // p2 steals it: p2 gains the +10 income, p1 LOSES the +10 income, and
    // because it is no longer the first capture, p2 gets NO immediate 10 gold.
    visit(state, "p2", field);
    expect(field.flagOwnerId).toBe("p2");
    expect(p2.production.gold).toBe(p2Prod + 10);
    expect(p2.resources.gold).toBe(p2Gold); // no second immediate payout
    expect(p1.production.gold).toBe(p1Prod); // income stripped back to baseline
    expect(p1.resources.gold).toBe(p1Gold + 10); // keeps the gold it already banked
  });
});

describe("Star Axis is flaggable: each player empowers once, on their first visit", () => {
  it("a second player flags too and empowers their own stat; revisits empower nothing", () => {
    const state = makeGame("star-axis-pvp");
    const p1 = state.players.p1;
    const p2 = state.players.p2;
    p1.hand = ["stat.power"];
    p2.hand = ["stat.attack"];

    const field = injectField(state, "star_axis");

    // p1: first visit flags the field and empowers Power.
    visit(state, "p1", field);
    choose(state, "p1", (label) => label === "Empower Power");
    expect(field.flagOwnerId).toBe("p1");
    expect(p1.hand).toContain("stat.power.empowered");
    expect(p1.removed).toContain("stat.power");

    // p2: a different player keeps their own cube (extraFlagOwnerIds) and gets
    // their OWN empower.
    visit(state, "p2", field);
    choose(state, "p2", (label) => label === "Empower Attack");
    expect(field.flagOwnerId).toBe("p1"); // p1 still the primary flag owner
    expect(field.extraFlagOwnerIds ?? []).toContain("p2");
    expect(p2.hand).toContain("stat.attack.empowered");

    // p1 revisits: already flagged here, so NO second empower is offered.
    p1.hand = ["stat.knowledge"];
    visit(state, "p1", field);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(p1.hand).toEqual(["stat.knowledge"]); // untouched
    expect(p1.removed).not.toContain("stat.knowledge");
  });
});
