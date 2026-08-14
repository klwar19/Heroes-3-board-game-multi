import { describe, expect, it } from "vitest";
import { coreBuildingDefinitions } from "@/data/factions/core";
import { CREATURE_BANKS } from "@/data/map/creature-banks";
import { beginFieldVisit, getMainHero, grantCreatureBankReward } from "./adventure";
import { pumpAdventureQueues, resolveSearchDeckCandidates } from "./adventure-reducer";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import type { CustomMapTilePlan, GameState, HouseRuleId, MapFieldState } from "./state";

// ---------------------------------------------------------------------------
// USER RULING 2026-08-13, second half: "artifacts search can only be up to
// major, because in IV-V field". A Creature Bank Dragon Utopia is a Ⅳ–Ⅴ
// (Near-band) placement, so its Artifact searches may NEVER reach the Relic
// deck — whatever the visitor's tile band, hero level or house rules would
// otherwise allow.
//
// The cap is ONE seam: `maxArtifactTier: "major"` on the bank's own
// SEARCH_SHARED_DECK interactions, carried through the visit step and the
// deferred reward queue, applied in `resolveSearchDeckCandidates` AFTER
// `eligibleArtifactDecks` (so it sits on top of the official tile-band rule,
// the `deck-access-hero-level` house rule AND the Polish Random Artifacts
// override).
//
// DELIBERATE LIMIT (pinned below, not fixed): in a LEGACY single-Artifact-deck
// game the family resolves to ONE mixed `artifacts` deck holding every tier.
// There is no per-tier deck to drop, so a Relic stays reachable exactly as it
// always was; filtering the revealed cards there would be a different (and much
// larger) change to the reveal pipeline.
//
// Every case asserts the DECKS a real Search may reach, with a CONTROL that
// diverges, so each fails if the cap wiring is removed.
// ---------------------------------------------------------------------------

const START_A = { row: 8, col: 2 } as const;
const START_B = { row: 10, col: 7 } as const;
const CENTER = { row: 9, col: 4 } as const;

function centreMap(seed: string, houseRules?: Partial<Record<HouseRuleId, boolean>>): GameState {
  const plans: CustomMapTilePlan[] = [
    { row: START_A.row, col: START_A.col, group: "starting", faceDown: false },
    { row: START_B.row, col: START_B.col, group: "starting", faceDown: false },
    {
      row: CENTER.row,
      col: CENTER.col,
      group: "center",
      faceDown: false,
      tileDefId: "C4",
      viiField: "dragon_utopia"
    }
  ];
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    victoryMode: "conquest",
    customMap: plans,
    ...(houseRules ? { houseRules } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.phase = "player-turn";
  return state;
}

/** The Ⅶ objective field printed on the centre tile. */
function objectiveField(state: GameState): MapFieldState {
  return Object.values(state.adventure!.fields).find((field) => field.difficulty === 7)!;
}

/**
 * Turns a hex on the CENTRE tile into a pinned Creature Bank Dragon Utopia — the
 * designer `CustomMapObject { kind: "creature_bank" }` shape, which is exactly
 * how a bank can end up outside the Ⅳ–Ⅴ band. Its `tileInstanceId` is the REAL
 * centre tile, so `heroTileGroup` reads "center" and the official deck-access
 * rule alone WOULD open the Relic deck.
 */
function pinBankOnCentreTile(state: GameState): MapFieldState {
  const objective = objectiveField(state);
  const sibling = Object.values(state.adventure!.fields).find(
    (field) => field.tileInstanceId === objective.tileInstanceId && field.spaceId !== objective.spaceId
  )!;
  sibling.location = "creature_bank";
  sibling.bankId = "dragon_utopia";
  sibling.difficulty = undefined;
  sibling.blackCube = false;
  return sibling;
}

/** The Artifact decks a Search granted from `field` may actually reach. */
function reachableArtifactDecks(
  state: GameState,
  field: MapFieldState,
  maxArtifactTier?: "major"
): string[] {
  const hero = getMainHero(state, "p1")!;
  return resolveSearchDeckCandidates(state, "p1", "artifacts", {
    sourceHeroId: hero.id,
    sourceFieldId: field.spaceId,
    maxArtifactTier
  });
}

describe("Creature Bank Dragon Utopia — its Artifact searches are Major-capped", () => {
  it("the printed reward stamps the cap on every Artifact search it queues", () => {
    // The DATA half: both artifact searches (the base and every Extra's Artifact
    // arm) carry the cap, and the Spell arm deliberately does not.
    const reward = CREATURE_BANKS.dragon_utopia.buildReward(2);
    expect(reward.type).toBe("SEQUENCE");
    if (reward.type !== "SEQUENCE") return;

    expect(reward.interactions[1]).toEqual({
      type: "SEARCH_SHARED_DECK",
      deckId: "artifacts",
      count: 3,
      maxArtifactTier: "major"
    });
    for (const extra of reward.interactions.slice(2)) {
      expect(extra.type).toBe("CHOOSE_ONE");
      if (extra.type !== "CHOOSE_ONE") continue;
      expect(extra.options[0]!.interaction).toEqual({
        type: "SEARCH_SHARED_DECK",
        deckId: "artifacts",
        count: 5,
        maxArtifactTier: "major"
      });
      // The Spell arm is untouched — the cap is an ARTIFACT rule.
      expect(extra.options[1]!.interaction).toEqual({
        type: "SEARCH_SHARED_DECK",
        deckId: "spells",
        count: 5
      });
    }
  });

  it("a bank pinned on a Ⅵ–Ⅶ CENTRE tile still cannot reach the Relic deck", () => {
    // The strongest case: the official rule (house rules OFF) would give this
    // visitor Minor + Major + Relic from the centre band alone.
    const state = centreMap("bank-cap-centre");
    const bankField = pinBankOnCentreTile(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = bankField.spaceId;

    // CONTROL: without the cap the very same field DOES reach the Relic deck —
    // so what removes it below is the cap, not the band.
    expect(reachableArtifactDecks(state, bankField)).toEqual([
      "artifacts-minor",
      "artifacts-major",
      "artifacts-relic"
    ]);

    expect(reachableArtifactDecks(state, bankField, "major")).toEqual([
      "artifacts-minor",
      "artifacts-major"
    ]);
  });

  it("CONTROL: the Ⅶ Utopia FIELD's own searches on that same tile DO reach Relics", () => {
    // The Ⅶ objective field is a different rule and is deliberately untouched —
    // "search properly according to VI-VII tile".
    const state = centreMap("bank-cap-field-control");
    const field = objectiveField(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = field.spaceId;

    expect(reachableArtifactDecks(state, field)).toContain("artifacts-relic");

    // …and end to end: the field's queued Searches carry NO cap, so the real
    // deck-pick they open still offers the Relic deck.
    beginFieldVisit(state, hero.id, field.spaceId, false);
    const queued = (state.adventure!.rewardQueue ?? []).filter(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts"
    );
    expect(queued).toHaveLength(2);
    for (const reward of queued) {
      expect(reward.kind === "shared-deck-search" ? reward.maxArtifactTier : "unset").toBeUndefined();
    }

    pumpAdventureQueues(state);
    const pick = state.pendingChoice;
    expect(pick?.type).toBe("OPTION_CHOICE");
    if (pick?.type !== "OPTION_CHOICE") return;
    expect(pick.options.some((option) => /Relic/i.test(option.label))).toBe(true);
  });

  it("the cap survives the deferred reward queue and reaches the real deck pick", () => {
    // END TO END through the actual bank grant: the queued reward carries the
    // cap, and the deck-family pick the player is shown offers no Relic deck.
    const state = centreMap("bank-cap-end-to-end");
    const bankField = pinBankOnCentreTile(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = bankField.spaceId;

    grantCreatureBankReward(state, hero.id, bankField.spaceId, 0);

    const queued = (state.adventure!.rewardQueue ?? []).filter(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts"
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]!.kind === "shared-deck-search" ? queued[0]!.maxArtifactTier : null).toBe("major");

    pumpAdventureQueues(state);
    const pick = state.pendingChoice;
    expect(pick?.type).toBe("OPTION_CHOICE");
    if (pick?.type !== "OPTION_CHOICE") return;
    const labels = pick.options.map((option) => option.label);
    expect(labels.some((label) => /Major/i.test(label))).toBe(true);
    expect(labels.some((label) => /Relic/i.test(label))).toBe(false);
  });

  it("the cap beats the `deck-access-hero-level` house rule too", () => {
    // With the BINH progression rule ON, a level-6 hero with an artifact source
    // unlocks Relics from ANY tile. The bank's cap still wins.
    const state = centreMap("bank-cap-house-rule", { "deck-access-hero-level": true });
    const hero = getMainHero(state, "p1")!;
    hero.level = 6;
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1")!;
    const smith = Object.keys(coreBuildingDefinitions).find(
      (buildingId) =>
        coreBuildingDefinitions[buildingId]?.effect?.type === "ARTIFACT_SMITH" &&
        buildingId.startsWith(`${town.factionId}.`)
    )!;
    town.buildings = [...new Set([...town.buildings, smith])];

    // The bank sits on the hero's HOME (starting Ⅰ) tile, so the tile band alone
    // gives Minor only — the level unlock is the only thing that can open Relics.
    const bankField = state.adventure!.fields[hero.spaceId!]!;
    const homeTile = state.adventure!.tiles[bankField.tileInstanceId]!;
    expect(homeTile.backLabel).toBe("Ⅰ");
    bankField.location = "creature_bank";
    bankField.bankId = "dragon_utopia";

    // CONTROL: the level unlock really is live on this field (and a level-1 hero
    // there reaches Minor only, so the unlock — not the band — is what opens it).
    expect(reachableArtifactDecks(state, bankField)).toContain("artifacts-relic");
    hero.level = 1;
    expect(reachableArtifactDecks(state, bankField)).toEqual(["artifacts-minor"]);
    hero.level = 6;

    expect(reachableArtifactDecks(state, bankField, "major")).toEqual([
      "artifacts-minor",
      "artifacts-major"
    ]);
  });

  it("LIMIT: a LEGACY single-Artifact-deck game cannot be tier-capped", () => {
    // `split-decks` off ⇒ one mixed Artifact deck. The cap can only remove a
    // split deck, so it is an exact no-op here and the Search still runs.
    const state = centreMap("bank-cap-legacy-single", { "split-decks": false });
    const bankField = pinBankOnCentreTile(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = bankField.spaceId;

    expect(reachableArtifactDecks(state, bankField)).toEqual(["artifacts"]);
    expect(reachableArtifactDecks(state, bankField, "major")).toEqual(["artifacts"]);
  });

  it("neither the AI nor the AFK driver can stall on the printed Extras", () => {
    // The printed Artifact-or-Spell Extra is an ordinary CHOOSE_ONE visit step,
    // so the generic scorer / driver answers it. (This is the shape that
    // existed for months before the reverted fixed-ladder commit.)
    const state = centreMap("bank-cap-extras-answerable");
    const bankField = pinBankOnCentreTile(state);
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = bankField.spaceId;

    grantCreatureBankReward(state, hero.id, bankField.spaceId, 2);
    pumpAdventureQueues(state);

    // Drive every prompt the reward chain opens; it must terminate.
    let steps = 0;
    for (; steps < 40; steps += 1) {
      const legal = getLegalActions(state, "p1").filter((entry) =>
        ["RESOLVE_VISIT_STEP", "CHOOSE_OPTION", "RESOLVE_DECK_SEARCH"].includes(entry.action.type)
      );
      if (legal.length === 0) break;
      const next = applyAction(state, legal[0]!.action);
      expect(next.errors.map((error) => error.message).join("; ")).toBe("");
      Object.assign(state, next.state);
    }
    expect(steps).toBeLessThan(40);
    expect(state.pendingChoice).toBeNull();
  });
});
