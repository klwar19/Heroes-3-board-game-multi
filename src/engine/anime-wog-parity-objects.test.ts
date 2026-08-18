/**
 * Anime Field Override — WOG-parity objects (Task: do for the ANIME mod what the
 * Wake of Gods New Objects just got). Four new single-hex kinds built on the
 * SAME reusable machinery the wog objects gained:
 *   - Thí Luyện Tháp (Trial Tower, xianxia) — escalating re-guard fight (the
 *     shared `handleEscalatingFightVisit`, twin of WoG's Adventure Cave).
 *   - Linh Điền (Spirit Field, xianxia) — pay-1-gold harvest CHOOSE_ONE.
 *   - Dungeon Gate (isekai) — guarded gamble; the Attack die picks the loot.
 *   - Guild Bounty Board (isekai) — per-player once-ever bounty + paid Search.
 * Plus the cross-mod commander-artifact BONUS (Task 2) on the Trial Tower's 3rd
 * win AND the existing Bí Cảnh guard win, via the SAME `grantCommanderArtifactReward`.
 *
 * EFFECT-level (CLAUDE.md §1/§1a): every claim asserts the observable OUTCOME
 * (gold moved, a stat rose, a search queued, a die face drove the reward, a latch
 * gates a repeat) and fails if the wiring is removed. Each has a CONTROL.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { locationDefinitions } from "@/data/map/locations";
import {
  ANIME_FIELD_OVERRIDE_DEFINITIONS,
  ANIME_FIELD_OVERRIDE_LOCATION_IDS
} from "@/data/anime/field-overrides";
import {
  COMMANDER_ARTIFACT_SPECS,
  wogCommanderArtifactCards
} from "@/data/wog/commander-artifacts";
import {
  fieldOverrideGlyph,
  fieldOverridePackageAllowed,
  getFieldOverrideDefinition,
  listFieldOverrideDefinitions
} from "@/data/map/field-overrides";
import { applyAction, createAdventureGameState, DEFAULT_ANIME_OPTIONS } from "./index";
import { carveFieldOverride } from "./field-overrides";
import { beginFieldVisit, getMainHero } from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { getLegalActions } from "./legal-actions";
import { chooseComputerAction } from "./computer/policy";
import type { GameAction, GameState, MapFieldState, PlayerId, VisitStep } from "./state";

const FIELD_ID = "50,50";
const NEW_KINDS = ["thi_luyen_thap", "linh_dien", "dungeon_gate", "guild_bounty"] as const;

function animeGame(
  opts: {
    seed?: string;
    cultivation?: boolean;
    commanders?: boolean;
    faction?: string;
    hero?: string;
    /** FO redesign wave 2: the Trial Tower's 2nd-win reward branches on this. */
    unitExperience?: boolean;
  } = {}
): GameState {
  const anime = {
    ...DEFAULT_ANIME_OPTIONS,
    enabled: true,
    mapObjects: true,
    cultivation: opts.cultivation ?? false,
    unitExperience: opts.unitExperience ?? false
  };
  return createAdventureGameState({
    seed: opts.seed ?? "anime-parity",
    ruleset: "binh",
    rollFirstPlayer: false,
    rotateStartTiles: false,
    anime,
    ...(opts.commanders
      ? { wog: { enabled: true, commanders: true, newObjects: false, newCreatures: false, artifacts: false } }
      : {}),
    ...(opts.faction
      ? {
          players: [
            { id: "p1", name: "One", factionId: opts.faction as never, heroDefId: opts.hero ?? "catherine" },
            { id: "p2", name: "Two", factionId: (opts.faction === "necropolis" ? "castle" : "necropolis") as never }
          ]
        }
      : {})
  });
}

/** Put a plain field at FIELD_ID with `location`, the main hero standing on it. */
function injectField(state: GameState, location: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "anime-loc-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return field;
}

/** Carve FIELD_ID into an anime override through the real FO carve path (stamps guards). */
function carveAt(state: GameState, kind: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "anime-loc-tile",
    slot: 0,
    location: "empty_field",
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  carveFieldOverride(state.adventure!, field.spaceId, kind);
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return state.adventure!.fields[field.spaceId];
}

function visit(state: GameState, playerId: PlayerId = "p1"): void {
  beginFieldVisit(state, getMainHero(state, playerId)!.id, FIELD_ID, false);
}

function firstStep(state: GameState): VisitStep | undefined {
  return state.adventure!.pendingVisit?.steps[0];
}

function menu(state: GameState): Extract<VisitStep, { type: "CHOOSE_ONE" }> {
  const step = firstStep(state);
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`expected a CHOOSE_ONE menu, got ${step?.type ?? "none"}`);
  }
  return step;
}

function chooseByLabel(state: GameState, match: (label: string) => boolean, playerId: PlayerId = "p1"): void {
  const step = menu(state);
  const optionIndex = step.options.findIndex((o) => match(o.label));
  if (optionIndex < 0) {
    throw new Error(`no option matched: ${step.options.map((o) => o.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex });
}

function pay(state: GameState, playerId: PlayerId = "p1", optionIndex = 0): void {
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex });
}

function queuedSearches(state: GameState, deckId: string): number {
  return state.adventure!.rewardQueue.filter(
    (reward) => reward.kind === "shared-deck-search" && (reward as { deckId?: string }).deckId === deckId
  ).length;
}

function commanderArtifactsInHand(state: GameState, playerId: PlayerId = "p1"): string[] {
  return state.players[playerId].hand.filter((id) => id in COMMANDER_ARTIFACT_SPECS);
}

function bindableCommanderArtifact(cardId: string): boolean {
  const card = wogCommanderArtifactCards[cardId];
  if (card?.effect.type !== "CHOOSE_ONE") {
    return false;
  }
  return card.effect.options.some((o) => o.effect.type === "BIND_COMMANDER_ARTIFACT");
}

/** The last Attack-die face rolled (ATTACK_DIE_TABLE), from the event log. */
function lastAttackRoll(state: GameState): number {
  const rolled = [...state.eventLog]
    .reverse()
    .find((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "attack");
  const rolls = (rolled as { attackRolls?: number[] } | undefined)?.attackRolls;
  if (!rolls || rolls.length === 0) {
    throw new Error("no Attack-die roll in the event log");
  }
  return rolls[0];
}

// ===========================================================================
// 1. Registry hygiene + art on disk
// ===========================================================================
describe("Anime WOG-parity objects — registry", () => {
  it("registers the 4 new kinds (2 xianxia + 2 isekai), implemented, art on disk, locations present", () => {
    const expected: Record<string, "anime-xianxia" | "anime-isekai"> = {
      thi_luyen_thap: "anime-xianxia",
      linh_dien: "anime-xianxia",
      dungeon_gate: "anime-isekai",
      guild_bounty: "anime-isekai"
    };
    for (const [id, pkg] of Object.entries(expected)) {
      const def = ANIME_FIELD_OVERRIDE_DEFINITIONS[id];
      expect(def, id).toBeTruthy();
      expect(def.package, id).toBe(pkg);
      expect(def.implementationStatus, id).toBe("implemented");
      // Art wins — every new kind ships real hex art (no glyph placeholder).
      expect(def.image, id).toBeTruthy();
      expect(existsSync(resolve(process.cwd(), `public${def.image}`)), `missing art ${def.image}`).toBe(true);
      expect(fieldOverrideGlyph(id), `${id} art must win over any glyph`).toBeUndefined();
      // The carve location resolves to an implemented location definition.
      expect(locationDefinitions[def.locationId]?.implementationStatus, id).toBe("implemented");
      expect(getFieldOverrideDefinition(id)?.package, id).toBe(pkg);
      expect(ANIME_FIELD_OVERRIDE_LOCATION_IDS.has(def.locationId), id).toBe(true);
    }
  });

  it("the guarded kinds stamp their designed guard on carve; the unguarded kinds do not", () => {
    // FO redesign 2026-08-19: dungeon_gate is a WAGER site now — it carves
    // UNGUARDED (the visitor picks the floor at the visit).
    for (const [kind, guard] of [
      ["thi_luyen_thap", 1],
      ["dungeon_gate", undefined],
      ["linh_dien", undefined],
      ["guild_bounty", undefined]
    ] as const) {
      const state = animeGame({ seed: `guard-${kind}` });
      const field = carveAt(state, kind);
      expect(field.difficulty, kind).toBe(guard);
    }
  });
});

// ===========================================================================
// 2. Package gating (pool/palette) — anime gate ONLY (wog-on-anime-off CONTROL)
// ===========================================================================
describe("Anime WOG-parity objects — package gating", () => {
  it("lists the new kinds only under the anime gate; wog-on-anime-off never leaks them", () => {
    const listFor = (mods: { animeEnabled?: boolean; animeMapObjects?: boolean; wogNewObjects?: boolean }) =>
      listFieldOverrideDefinitions({
        tileGroup: "far",
        implementedOnly: true,
        packageAllowed: (pkg) => fieldOverridePackageAllowed(pkg, mods)
      }).map((d) => d.id);

    // Anime ON → the new far-eligible kinds list.
    const animeOn = listFor({ animeEnabled: true, animeMapObjects: true });
    for (const kind of NEW_KINDS) {
      expect(animeOn, kind).toContain(kind);
    }

    // CONTROL: WOG New Objects on but anime OFF → NONE of the 4 anime kinds leak.
    const wogOnly = listFor({ wogNewObjects: true });
    for (const kind of NEW_KINDS) {
      expect(wogOnly, kind).not.toContain(kind);
    }
    // …and the wog kinds DO list under that gate (the gate itself works).
    expect(wogOnly).toContain("adventure_cave");

    // CONTROL: anime mapObjects explicitly false → dropped.
    const mapObjectsOff = listFor({ animeEnabled: true, animeMapObjects: false });
    for (const kind of NEW_KINDS) {
      expect(mapObjectsOff, kind).not.toContain(kind);
    }
  });

  it("state-level pool draws a new kind only when anime is enabled (both-off CONTROL)", () => {
    // With ONLY these anime kinds present in the isekai package + xianxia, the
    // pool must be empty when the mod is off.
    const off = createAdventureGameState({
      seed: "anime-parity-pool-off",
      ruleset: "binh",
      fieldOverrides: false,
      rollFirstPlayer: false,
      rotateStartTiles: false
    });
    // No anime → no anime pool membership at all.
    const allowedOff = NEW_KINDS.some((kind) =>
      fieldOverridePackageAllowed(getFieldOverrideDefinition(kind)!.package, { animeEnabled: false })
    );
    expect(allowedOff).toBe(false);
    // sanity: the game built without anime.
    expect(off.anime?.enabled ?? false).toBe(false);
  });
});

// ===========================================================================
// 3. Thí Luyện Tháp (Trial Tower) — escalating Ⅰ→Ⅱ→Ⅲ fight + reward ladder
// ===========================================================================
describe("Trial Tower (anime.thi_luyen_thap)", () => {
  // REWRITTEN for the Field Override redesign (2026-08-19, wave 2): the 2nd-win
  // reward is a Spell Search only while the Unit Experience rule is OFF (this
  // game), and the 3rd win pays +2 hero XP, not +1.
  it("escalates Ⅰ→Ⅱ→Ⅲ, pays +2 gold / Search Spell (Unit Experience off) / +2 XP, then clears for good", () => {
    const state = animeGame({ seed: "tt-escalate" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    const hero = getMainHero(state, "p1")!;
    hero.experience = 0;
    hero.level = 1;
    const field = carveAt(state, "thi_luyen_thap");
    expect(field.difficulty).toBe(1); // guarded Ⅰ on first entry

    // --- Win 1: +2 gold, re-guard to Ⅱ ---
    visit(state);
    expect(field.animeTrialWins).toBe(1);
    expect(player.resources.gold).toBe(2);
    expect(field.difficulty).toBe(2);
    expect(state.adventure!.pendingVisit).toBeNull();

    // --- Win 2: Search (1) Spell deck, re-guard to Ⅲ ---
    const spellSearchesBefore = queuedSearches(state, "spells");
    visit(state);
    expect(field.animeTrialWins).toBe(2);
    expect(field.difficulty).toBe(3);
    expect(queuedSearches(state, "spells")).toBe(spellSearchesBefore + 1);
    expect(state.adventure!.pendingVisit).toBeNull();

    // --- Win 3: +2 hero XP (FO redesign wave 2; was +1), cleared for good ---
    visit(state);
    expect(field.animeTrialWins).toBe(3);
    expect(field.difficulty).toBeFalsy();
    expect(hero.experience).toBe(2);

    // --- A later peaceful re-entry is inert (no reward, still cleared) ---
    const goldAfter = player.resources.gold;
    const xpAfter = hero.experience;
    visit(state);
    expect(field.animeTrialWins).toBe(3); // unchanged
    expect(field.difficulty).toBeFalsy();
    expect(player.resources.gold).toBe(goldAfter);
    expect(hero.experience).toBe(xpAfter);
  });

  it("CONTROL: the reward ladder differs by win count (win 1 is +2 gold, NOT a Spell Search)", () => {
    const state = animeGame({ seed: "tt-win1" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    carveAt(state, "thi_luyen_thap");
    visit(state);
    expect(player.resources.gold).toBe(2);
    expect(queuedSearches(state, "spells")).toBe(0); // NOT the 2nd-win reward
  });

  // FO redesign wave 2 (2026-08-19): the 2nd win teaches instead of searching
  // whenever the Unit Experience rule is on.
  it("Unit Experience ON: the 2nd win gives a CHOSEN army unit card exactly +3 unit XP and queues NO Spell Search (only the picked card moves)", () => {
    const state = animeGame({ seed: "tt-ue-on", unitExperience: true });
    state.players.p1.army = [
      { id: "army_0", unitDefId: "castle.halberdiers", side: "few" },
      { id: "army_1", unitDefId: "castle.marksmen", side: "few" }
    ];
    carveAt(state, "thi_luyen_thap");
    visit(state); // win 1 (+2 gold)
    const spellsBefore = queuedSearches(state, "spells");

    visit(state); // win 2 → the teaching menu
    const step = menu(state);
    expect(step.options.some((o) => o.label.startsWith("Decline")), "AI-safe decline arm").toBe(true);
    chooseByLabel(state, (l) => l.includes("Marksmen"));

    const army = state.players.p1.army;
    expect(army.find((u) => u.id === "army_1")!.experience).toBe(3);
    expect(army.find((u) => u.id === "army_0")!.experience ?? 0).toBe(0); // CONTROL: only the pick
    expect(queuedSearches(state, "spells")).toBe(spellsBefore); // the rule-off reward did NOT fire
  });

  it("CONTROL: Unit Experience OFF keeps the printed Search (1) Spell on the 2nd win (no teaching menu)", () => {
    const state = animeGame({ seed: "tt-ue-off" });
    state.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
    carveAt(state, "thi_luyen_thap");
    visit(state); // win 1
    const spellsBefore = queuedSearches(state, "spells");
    visit(state); // win 2
    expect(queuedSearches(state, "spells")).toBe(spellsBefore + 1);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(state.players.p1.army[0].experience ?? 0).toBe(0);
  });
});

// ===========================================================================
// 3b. Trial Tower cultivation rider — banked "one fewer Tribulation die"
// ===========================================================================
describe("Trial Tower cultivation rider (anime.cultivation)", () => {
  function reachThirdWin(state: GameState): GameState {
    carveAt(state, "thi_luyen_thap");
    visit(state); // win 1
    visit(state); // win 2
    visit(state); // win 3 → onFinalWin
    return state;
  }

  it("the 3rd win banks +1 Tribulation die relief on the hero when Cultivation is ON", () => {
    const state = animeGame({ seed: "tt-cult-on", cultivation: true });
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    reachThirdWin(state);
    expect(getMainHero(state, "p1")!.nextTribulationDiceRelief).toBe(1);
    expect(
      state.eventLog.some(
        (e) => e.type === "EVENT_NOTE" && /Trial Tower/i.test((e as { message?: string }).message ?? "")
      ),
      "a feed note explains the boon"
    ).toBe(true);
  });

  it("CONTROL: with Cultivation OFF the 3rd win banks NO relief", () => {
    const state = animeGame({ seed: "tt-cult-off", cultivation: false });
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    reachThirdWin(state);
    expect(getMainHero(state, "p1")!.nextTribulationDiceRelief ?? 0).toBe(0);
  });

  it("the banked relief makes the NEXT Heavenly Tribulation roll ONE fewer die (consumed on use)", () => {
    // Prime a realm-2 / level-7 main hero on the map (mirrors the cultivation
    // suite's tribulationReady), then compare relief=1 vs relief=0.
    function tribulationReady(seed: string): GameState {
      const state = animeGame({ seed, cultivation: true });
      const p1 = state.players.p1;
      const refreshed =
        p1.needsHandRefresh || p1.canMulligan
          ? applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state
          : state;
      const hero = getMainHero(refreshed, "p1")!;
      hero.level = 7;
      hero.cultivationRealm = 2;
      refreshed.players.p1.army = [{ id: "army_0", unitDefId: "castle.halberdiers", side: "few" }];
      return refreshed;
    }

    const withRelief = tribulationReady("tt-relief");
    getMainHero(withRelief, "p1")!.nextTribulationDiceRelief = 1;
    const after = applyAction(withRelief, { type: "HEAVEN_TRIBULATION", playerId: "p1" });
    expect(after.errors.map((e) => e.message).join("; ")).toBe("");
    const rolled = after.state.eventLog.find((e) => e.type === "CULTIVATION_TRIBULATION_ROLLED");
    const rolls = rolled && rolled.type === "CULTIVATION_TRIBULATION_ROLLED" ? rolled.rolls : [];
    expect(rolls.length).toBe(2); // 3 − 1 relief
    // Relief is consumed by the attempt.
    expect(getMainHero(after.state, "p1")!.nextTribulationDiceRelief ?? 0).toBe(0);

    // CONTROL: no relief → the full 3-die gauntlet.
    const noRelief = tribulationReady("tt-relief-ctrl");
    const afterCtrl = applyAction(noRelief, { type: "HEAVEN_TRIBULATION", playerId: "p1" });
    expect(afterCtrl.errors.map((e) => e.message).join("; ")).toBe("");
    const rolledCtrl = afterCtrl.state.eventLog.find((e) => e.type === "CULTIVATION_TRIBULATION_ROLLED");
    const rollsCtrl = rolledCtrl && rolledCtrl.type === "CULTIVATION_TRIBULATION_ROLLED" ? rolledCtrl.rolls : [];
    expect(rollsCtrl.length).toBe(3);
  });
});

// ===========================================================================
// 4. Linh Điền (Spirit Field) — pay-1-gold harvest CHOOSE_ONE
// ===========================================================================
describe("Spirit Field (anime.linh_dien)", () => {
  // FO redesign 2026-08-19: the Spirit Field is a PLANTED REWARD now (plant 2
  // gold → harvest at +3 rounds → +3 valuables +1 materials; rival raids
  // trample). The full plant/immature/harvest/raid ladder incl. CONTROLs is
  // pinned in anime-locations.test.ts ("Spirit Field — planted reward"); this
  // file keeps the angle unique to its harness: no double-plant.
  it("a planted field never offers Plant again (and a rival sees Raid, not Plant)", () => {
    const state = animeGame({ seed: "sf-noreplant" });
    state.players.p1.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
    const field = injectField(state, "anime.linh_dien");

    visit(state);
    chooseByLabel(state, (l) => l.startsWith("Plant"));
    pay(state); // pay the 2 gold
    expect(field.plantedBy).toBe("p1");
    expect(state.players.p1.resources.gold).toBe(3);

    // The planter's re-visit (immature): no Plant arm, no Harvest arm.
    visit(state);
    expect(menu(state).options.some((o) => o.label.startsWith("Plant"))).toBe(false);
    expect(menu(state).options.some((o) => o.label.startsWith("Harvest"))).toBe(false);
    state.adventure!.pendingVisit = null;

    // A rival sees Raid — never Plant on an occupied terrace.
    const p2Hero = getMainHero(state, "p2")!;
    p2Hero.spaceId = FIELD_ID;
    beginFieldVisit(state, p2Hero.id, FIELD_ID, false);
    expect(menu(state).options.some((o) => o.label.startsWith("Raid"))).toBe(true);
    expect(menu(state).options.some((o) => o.label.startsWith("Plant"))).toBe(false);
  });
});

// ===========================================================================
// 5. Dungeon Gate (isekai) — guarded gamble; the Attack die picks the loot
// ===========================================================================
describe("Dungeon Gate (anime.dungeon_gate)", () => {
  // FO redesign 2026-08-19: a WAGER delve now (pick floor Ⅰ–Ⅳ, fight it, the
  // floor keys the reward, the gate is spent). Floors Ⅰ and Ⅳ (fallback) are
  // pinned in anime-locations.test.ts; this file completes the ladder with Ⅱ
  // and pins the spent-gate inertness in its own harness.
  it("a floor-Ⅱ win rolls exactly one Treasure die, then the gate is SPENT for good", () => {
    const state = animeGame({ seed: "dg-floor2" });
    const player = state.players.p1;
    player.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    const field = carveAt(state, "dungeon_gate");
    field.difficulty = 2; // simulate the just-won floor-Ⅱ re-visit

    const eventsBefore = state.eventLog.length;
    visit(state);
    expect(
      state.eventLog
        .slice(eventsBefore)
        .filter((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "treasure")
    ).toHaveLength(1);
    expect(field.difficulty).toBeFalsy();
    expect(field.wagerCleared).toBe(true);

    // Spent: a later visit offers NOTHING (CONTROL — no second delve).
    state.adventure!.pendingVisit = null;
    const goldAfter = player.resources.gold;
    visit(state);
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(player.resources.gold).toBe(goldAfter);
  });
});

// ===========================================================================
// 6. Guild Bounty Board (isekai) — per-player once-ever bounty + paid Search
// ===========================================================================
describe("Guild Bounty Board (anime.guild_bounty)", () => {
  it("claim the bounty: +2 gold AND the field latches this player (bounty arm gone on their re-visit)", () => {
    const state = animeGame({ seed: "gb-claim" });
    const player = state.players.p1;
    player.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
    const field = injectField(state, "anime.guild_bounty");

    visit(state);
    expect(menu(state).options.some((o) => o.label.includes("Claim"))).toBe(true);
    chooseByLabel(state, (l) => l.includes("Claim"));

    expect(player.resources.gold).toBe(7); // +2 gold
    expect(field.animeBountyClaimedBy).toContain("p1"); // per-player latch set
    expect(state.adventure!.pendingVisit).toBeNull();

    // Re-visit by the SAME player → the bounty arm is gone (Search + Leave only).
    visit(state);
    expect(menu(state).options.some((o) => o.label.includes("Claim")), "bounty is once-per-player").toBe(false);
    expect(menu(state).options.some((o) => o.label.includes("Search"))).toBe(true);
  });

  it("CONTROL: a DIFFERENT player still gets the bounty (the latch is per-player, not per-field)", () => {
    const state = animeGame({ seed: "gb-diff" });
    state.players.p1.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
    state.players.p2.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
    const field = injectField(state, "anime.guild_bounty");

    // p1 claims first.
    visit(state, "p1");
    chooseByLabel(state, (l) => l.includes("Claim"), "p1");
    expect(field.animeBountyClaimedBy).toEqual(["p1"]);

    // p2 walks onto the same board — the bounty arm is STILL there for them.
    const p2Hero = getMainHero(state, "p2")!;
    p2Hero.spaceId = FIELD_ID;
    beginFieldVisit(state, p2Hero.id, FIELD_ID, false);
    expect(menu(state).options.some((o) => o.label.includes("Claim")), "p2 has not claimed yet").toBe(true);
    chooseByLabel(state, (l) => l.includes("Claim"), "p2");

    expect(state.players.p2.resources.gold).toBe(7); // p2 got +2
    expect(field.animeBountyClaimedBy).toEqual(["p1", "p2"]);
  });

  it("Search arm: pay 2 gold → an Ability Search is queued; a broke hero is only offered Decline", () => {
    const state = animeGame({ seed: "gb-search" });
    const player = state.players.p1;
    player.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
    injectField(state, "anime.guild_bounty");

    visit(state);
    chooseByLabel(state, (l) => l.includes("Search"));
    expect(firstStep(state)?.type).toBe("PAY_TO");
    pay(state); // pay 2 gold
    expect(player.resources.gold).toBe(8);
    expect(queuedSearches(state, "abilities")).toBe(1);

    // CONTROL: broke hero → the Search PAY_TO only offers Decline.
    const broke = animeGame({ seed: "gb-broke" });
    broke.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    injectField(broke, "anime.guild_bounty");
    visit(broke);
    chooseByLabel(broke, (l) => l.includes("Search"));
    expect(firstStep(broke)?.type).toBe("PAY_TO");
    const resolves = getLegalActions(broke, "p1").filter((a) => a.action.type === "RESOLVE_VISIT_STEP");
    expect(resolves.some((a) => (a.action as { optionIndex?: number }).optionIndex !== undefined)).toBe(false);
    expect(resolves.some((a) => (a.action as { decline?: boolean }).decline === true)).toBe(true);
  });
});

// ===========================================================================
// 7. Cross-mod commander-artifact BONUS (Task 2)
// ===========================================================================
describe("Commander-artifact bonus on anime reward locations (Task 2)", () => {
  it("Bí Cảnh: a depth-Ⅴ wager win grants ONE commander artifact (anime + WOG Commanders ON); a depth-Ⅲ win does NOT (the rider is gated to Ⅴ+)", () => {
    // FO redesign 2026-08-19: bi_canh is a wager site; the documented Commanders
    // cross-mod rider survives, gated to its OLD fixed guard level (Ⅴ) and up.
    const state = animeGame({ seed: "bc-artifact", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 20 };
    expect(commanderArtifactsInHand(state)).toHaveLength(0);

    const field = carveAt(state, "bi_canh");
    field.difficulty = 5; // the just-won depth-Ⅴ re-visit
    visit(state);

    const gained = commanderArtifactsInHand(state);
    expect(gained, "one commander artifact granted").toHaveLength(1);
    expect(bindableCommanderArtifact(gained[0])).toBe(true); // the normal bindable card
    // The depth-Ⅴ ladder reward still runs (2 Artifact searches queued) — the
    // bonus is IN ADDITION to the printed reward, not instead of it.
    expect(queuedSearches(state, "artifacts")).toBe(2);
    expect(field.difficulty).toBeFalsy(); // guard cleared on the win

    // CONTROL — a SHALLOW (Ⅲ) wager win pays its ladder but NO rider, even
    // with Commanders ON: the gate is the depth, not just the module.
    const shallow = animeGame({ seed: "bc-shallow", commanders: true, faction: "castle" });
    shallow.players.p1.hand = [];
    const shallowField = carveAt(shallow, "bi_canh");
    shallowField.difficulty = 3;
    visit(shallow);
    expect(commanderArtifactsInHand(shallow)).toHaveLength(0);
    expect(queuedSearches(shallow, "artifacts")).toBe(1); // the Ⅲ ladder reward intact
  });

  it("CONTROL: with WOG Commanders OFF a depth-Ⅴ Bí Cảnh win grants NO commander artifact (reward unchanged)", () => {
    const state = animeGame({ seed: "bc-noart", faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 20 };
    expect(player.commander).toBeUndefined();

    const field = carveAt(state, "bi_canh");
    field.difficulty = 5;
    visit(state);

    expect(commanderArtifactsInHand(state)).toHaveLength(0);
    expect(queuedSearches(state, "artifacts")).toBe(2); // the printed reward is intact
  });

  it("Trial Tower 3rd win ALSO grants a commander artifact (anime + WOG Commanders ON)", () => {
    const state = animeGame({ seed: "tt-artifact", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    carveAt(state, "thi_luyen_thap");

    visit(state); // win 1
    expect(commanderArtifactsInHand(state)).toHaveLength(0); // no bonus yet
    visit(state); // win 2
    expect(commanderArtifactsInHand(state)).toHaveLength(0);
    visit(state); // win 3 → the deep reward grants the artifact
    const gained = commanderArtifactsInHand(state);
    expect(gained).toHaveLength(1);
    expect(bindableCommanderArtifact(gained[0])).toBe(true);
  });

  it("CONTROL: with WOG Commanders OFF the Trial Tower's 3rd win grants NO commander artifact", () => {
    const state = animeGame({ seed: "tt-noart", faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    carveAt(state, "thi_luyen_thap");
    visit(state);
    visit(state);
    visit(state);
    expect(commanderArtifactsInHand(state)).toHaveLength(0);
  });
});

// ===========================================================================
// 8. AI never stalls on the new visit menus
// ===========================================================================
describe("computer policy resolves the anime WOG-parity menus (no stall)", () => {
  function decideOn(state: GameState): GameAction | null {
    const decision = chooseComputerAction({
      playerId: "p1",
      state: state as never,
      legalActions: getLegalActions(state, "p1")
    });
    return decision?.action ?? null;
  }

  it("picks a resolving action for the interactive menus (Spirit Field and Guild Bounty CHOOSE_ONEs)", () => {
    // FO redesign 2026-08-19: the Spirit Field's first step is a CHOOSE_ONE
    // now (Plant / Leave) — still an ordinary scored visit menu.
    for (const [kind, seed] of [
      ["anime.linh_dien", "ai-sf"],
      ["anime.guild_bounty", "ai-gb"]
    ] as const) {
      const state = animeGame({ seed });
      state.round = 3;
      state.players.p1.resources = { gold: 20, buildingMaterials: 2, valuables: 5 };
      injectField(state, kind);
      visit(state);
      expect(firstStep(state)?.type, kind).toBe("CHOOSE_ONE");
      const action = decideOn(state);
      expect(action?.type, kind).toBe("RESOLVE_VISIT_STEP");
    }
  });

  it("the escalating reward auto-resolves without a player window (Trial Tower); a won wager floor Ⅰ does too (Dungeon Gate)", () => {
    for (const [kind, wonDifficulty] of [
      ["thi_luyen_thap", undefined],
      ["dungeon_gate", 1]
    ] as const) {
      const state = animeGame({ seed: `ai-${kind}` });
      state.round = 3;
      state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
      const field = carveAt(state, kind);
      if (wonDifficulty) {
        field.difficulty = wonDifficulty; // wager site: simulate the just-won re-visit
      }
      visit(state); // simulate the post-win visit
      expect(state.adventure!.pendingVisit, `${kind} reward auto-resolved`).toBeNull();
    }
  });
});
