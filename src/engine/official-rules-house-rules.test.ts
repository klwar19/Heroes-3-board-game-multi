import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  eligibleArtifactDecks,
  eligibleSpellDecks,
  houseRuleEnabled,
  type GameState
} from "./index";

/**
 * The three OFFICIAL-RULES defaults added in this pass, each with the old engine
 * reading kept behind an opt-in house rule. These pin the DEFAULT (rule OFF =
 * official) behaviour at the level a player feels it — which decks a Search may
 * reach, and whether a tile can be discovered — with the rule-ON case as the
 * mutation control.
 *
 * (The elemental-damage pair lives in elemental-fixed-damage.test.ts /
 * summon-elemental.test.ts, where the attack maths fixtures already are.)
 */

function makeGame(houseRules?: Record<string, boolean>): GameState {
  return createAdventureGameState({
    seed: "official-rules",
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    rotateStartTiles: false,
    houseRules: houseRules as never
  });
}

/** Re-labels the band of the tile the hero stands on (all `heroTileGroup` reads). */
function standOnBand(state: GameState, backLabel: string): void {
  const field = state.adventure!.fields[state.heroes.hero_p1.spaceId as string]!;
  state.adventure!.tiles[field.tileInstanceId]!.backLabel = backLabel;
}

describe("official rule — the hero's TILE decides which decks a Search may reach", () => {
  it("defaults to OFF (official) in both BINH and Legacy", () => {
    expect(houseRuleEnabled(makeGame(), "deck-access-hero-level")).toBe(false);
    expect(
      houseRuleEnabled(
        createAdventureGameState({ seed: "official-legacy", ruleset: "legacy", rollFirstPlayer: false }),
        "deck-access-hero-level"
      )
    ).toBe(false);
  });

  it("Ⅰ–Ⅲ = basic Spells / Minor artifacts; Ⅳ–Ⅴ adds expert+major; Ⅵ–Ⅶ adds relics", () => {
    const state = makeGame();
    const hero = state.heroes.hero_p1;
    // Level and an artifact source must not matter at all under the official rule.
    hero.level = 7;
    const artifactSource = true;

    // Starting tile (Ⅰ).
    expect(eligibleSpellDecks(state, "p1", hero)).toEqual(["spells"]);
    expect(eligibleArtifactDecks(state, "p1", hero, artifactSource)).toEqual(["artifacts-minor"]);

    // Far tile (Ⅱ–Ⅲ) — the same shallow band.
    standOnBand(state, "Ⅱ–Ⅲ");
    expect(eligibleSpellDecks(state, "p1", hero)).toEqual(["spells"]);
    expect(eligibleArtifactDecks(state, "p1", hero, artifactSource)).toEqual(["artifacts-minor"]);

    // Near tile (Ⅳ–Ⅴ): expert Spells + Major artifacts, weaker tiers still there.
    standOnBand(state, "Ⅳ–Ⅴ");
    expect(eligibleSpellDecks(state, "p1", hero)).toEqual(["spells", "spells-expert"]);
    expect(eligibleArtifactDecks(state, "p1", hero, artifactSource)).toEqual([
      "artifacts-minor",
      "artifacts-major"
    ]);

    // Centre tile (Ⅵ–Ⅶ): Relics join in.
    standOnBand(state, "Ⅵ–Ⅶ");
    expect(eligibleSpellDecks(state, "p1", hero)).toEqual(["spells", "spells-expert"]);
    expect(eligibleArtifactDecks(state, "p1", hero, artifactSource)).toEqual([
      "artifacts-minor",
      "artifacts-major",
      "artifacts-relic"
    ]);
  });

  it("CONTROL: with the house rule ON, level 6 + an artifact source unlocks Major/Relic from the starting tile", () => {
    const state = makeGame({ "deck-access-hero-level": true });
    const hero = state.heroes.hero_p1;
    hero.level = 6;
    expect(eligibleArtifactDecks(state, "p1", hero, true)).toEqual([
      "artifacts-minor",
      "artifacts-major",
      "artifacts-relic"
    ]);
    expect(eligibleSpellDecks(state, "p1", hero)).toEqual(["spells", "spells-expert"]);
  });
});

describe("official rule — Tile discovery needs only adjacency", () => {
  it("defaults to OFF (official) in both BINH and Legacy", () => {
    expect(houseRuleEnabled(makeGame(), "discovery-border-gate")).toBe(false);
    expect(
      houseRuleEnabled(
        createAdventureGameState({ seed: "official-legacy-2", ruleset: "legacy", rollFirstPlayer: false }),
        "discovery-border-gate"
      )
    ).toBe(false);
  });

  // The behaviour halves live in adventure.test.ts, on the fixture that already
  // has a hero standing behind a printed yellow arc facing a face-down tile:
  //  - "official: adjacency alone lets a hero discover across a sealed yellow
  //    border" (rule OFF, the default — movement across it still blocked), and
  //  - "HOUSE RULE ON: refuses ordinary discovery across a sealed yellow border"
  //    plus the far-tile placement refusal (the CONTROLs).
  // designed-borders.test.ts covers the designer per-edge variants with the rule
  // ON, and map-objects.test.ts the object-hex ones.
  it("names where the discovery behaviour is pinned", () => {
    expect(houseRuleEnabled(makeGame({ "discovery-border-gate": true }), "discovery-border-gate")).toBe(true);
  });
});
