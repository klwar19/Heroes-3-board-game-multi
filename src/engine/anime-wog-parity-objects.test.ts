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
  opts: { seed?: string; cultivation?: boolean; commanders?: boolean; faction?: string; hero?: string } = {}
): GameState {
  const anime = {
    ...DEFAULT_ANIME_OPTIONS,
    enabled: true,
    mapObjects: true,
    cultivation: opts.cultivation ?? false
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
    for (const [kind, guard] of [
      ["thi_luyen_thap", 1],
      ["dungeon_gate", 1],
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
  it("escalates Ⅰ→Ⅱ→Ⅲ, pays +2 gold / Search Spell / +1 XP, then clears for good", () => {
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

    // --- Win 3: +1 hero XP, cleared for good ---
    visit(state);
    expect(field.animeTrialWins).toBe(3);
    expect(field.difficulty).toBeFalsy();
    expect(hero.experience).toBe(1);

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
  it("pay 1 → harvest materials gives +1 building materials (valuables untouched)", () => {
    const state = animeGame({ seed: "sf-mat" });
    const player = state.players.p1;
    player.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
    injectField(state, "anime.linh_dien");

    visit(state);
    expect(firstStep(state)?.type).toBe("PAY_TO");
    pay(state); // pay 1 gold → opens the harvest CHOOSE_ONE
    chooseByLabel(state, (l) => l.toLowerCase().includes("herbs"));

    expect(player.resources.gold).toBe(4); // paid 1
    expect(player.resources.buildingMaterials).toBe(1);
    expect(player.resources.valuables).toBe(0); // CONTROL: the other branch did not run
  });

  it("pay 1 → harvest spirit-fruit gives +1 valuables (materials untouched — distinct sibling)", () => {
    const state = animeGame({ seed: "sf-val" });
    const player = state.players.p1;
    player.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
    injectField(state, "anime.linh_dien");

    visit(state);
    pay(state);
    chooseByLabel(state, (l) => l.toLowerCase().includes("fruit"));

    expect(player.resources.gold).toBe(4);
    expect(player.resources.valuables).toBe(1);
    expect(player.resources.buildingMaterials).toBe(0);
  });

  it("CONTROL: a broke hero is only offered Decline (the 1-gold stake gates it)", () => {
    const state = animeGame({ seed: "sf-broke" });
    const player = state.players.p1;
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    injectField(state, "anime.linh_dien");

    visit(state);
    expect(firstStep(state)?.type).toBe("PAY_TO");
    const resolves = getLegalActions(state, "p1").filter((a) => a.action.type === "RESOLVE_VISIT_STEP");
    expect(resolves.some((a) => (a.action as { optionIndex?: number }).optionIndex !== undefined)).toBe(false);
    expect(resolves.some((a) => (a.action as { decline?: boolean }).decline === true)).toBe(true);
  });
});

// ===========================================================================
// 5. Dungeon Gate (isekai) — guarded gamble; the Attack die picks the loot
// ===========================================================================
describe("Dungeon Gate (anime.dungeon_gate)", () => {
  it("the guard is cleared on the win, and the Attack die drives the loot: +1 → Treasure, 0 → +2 gold, −1 → +1 morale", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40 && seen.size < 3; i += 1) {
      const state = animeGame({ seed: `dg-${i}` });
      const player = state.players.p1;
      player.resources = { gold: 10, buildingMaterials: 0, valuables: 0 };
      player.morale = 0;
      const field = carveAt(state, "dungeon_gate");
      expect(field.difficulty, `dg-${i}`).toBe(1); // guarded Ⅰ before the win

      const eventsBefore = state.eventLog.length;
      visit(state); // the post-win visit
      // The beaten guard is cleared and the visitable hex cubes (one delve).
      expect(field.difficulty, `dg-${i}`).toBeFalsy();
      expect(field.blackCube, `dg-${i}`).toBe(true);

      const roll = lastAttackRoll(state);
      seen.add(roll);
      const rolledTreasure = state.eventLog
        .slice(eventsBefore)
        .some((e) => e.type === "ADVENTURE_DICE_ROLLED" && (e as { dice?: string }).dice === "treasure");
      if (roll === 1) {
        expect(rolledTreasure, `dg-${i} (+1)`).toBe(true);
      } else if (roll === 0) {
        expect(player.resources.gold, `dg-${i} (0)`).toBe(12); // +2 gold
        expect(player.morale, `dg-${i} (0)`).toBe(0);
        expect(rolledTreasure, `dg-${i} (0)`).toBe(false);
      } else {
        expect(player.morale, `dg-${i} (−1)`).toBe(1); // +1 morale
        expect(player.resources.gold, `dg-${i} (−1)`).toBe(10); // gold untouched
      }
      expect(state.adventure!.pendingVisit, `dg-${i} auto-resolves`).toBeNull();
    }
    expect(seen, "all three Attack-die branches exercised").toEqual(new Set([-1, 0, 1]));
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
  it("Bí Cảnh guard win grants ONE not-in-play commander artifact into hand (anime + WOG Commanders ON)", () => {
    const state = animeGame({ seed: "bc-artifact", commanders: true, faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 20 };
    expect(commanderArtifactsInHand(state)).toHaveLength(0);

    const field = carveAt(state, "bi_canh");
    expect(field.difficulty).toBe(5); // guarded before the win
    visit(state); // the guard win fires the grant + the Secret-Realm reward

    const gained = commanderArtifactsInHand(state);
    expect(gained, "one commander artifact granted").toHaveLength(1);
    expect(bindableCommanderArtifact(gained[0])).toBe(true); // the normal bindable card
    // The Secret Realm's own reward still runs (2 Artifact searches queued) — the
    // bonus is IN ADDITION to the printed reward, not instead of it.
    expect(queuedSearches(state, "artifacts")).toBe(2);
    expect(field.difficulty).toBeFalsy(); // guard cleared on the win
  });

  it("CONTROL: with WOG Commanders OFF the Bí Cảnh grants NO commander artifact (reward unchanged)", () => {
    const state = animeGame({ seed: "bc-noart", faction: "castle" });
    const player = state.players.p1;
    player.hand = [];
    player.resources = { gold: 0, buildingMaterials: 0, valuables: 20 };
    expect(player.commander).toBeUndefined();

    carveAt(state, "bi_canh");
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

  it("picks a resolving action for the interactive menus (Spirit Field PAY_TO, Guild Bounty CHOOSE_ONE)", () => {
    for (const [kind, seed, firstType] of [
      ["anime.linh_dien", "ai-sf", "PAY_TO"],
      ["anime.guild_bounty", "ai-gb", "CHOOSE_ONE"]
    ] as const) {
      const state = animeGame({ seed });
      state.round = 3;
      state.players.p1.resources = { gold: 20, buildingMaterials: 2, valuables: 5 };
      injectField(state, kind);
      visit(state);
      expect(firstStep(state)?.type, kind).toBe(firstType);
      const action = decideOn(state);
      expect(action?.type, kind).toBe("RESOLVE_VISIT_STEP");
    }
  });

  it("the guarded/escalating rewards auto-resolve without a player window (Trial Tower, Dungeon Gate)", () => {
    for (const kind of ["thi_luyen_thap", "dungeon_gate"]) {
      const state = animeGame({ seed: `ai-${kind}` });
      state.round = 3;
      state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
      carveAt(state, kind);
      visit(state); // simulate the post-win visit
      expect(state.adventure!.pendingVisit, `${kind} reward auto-resolved`).toBeNull();
    }
  });
});
