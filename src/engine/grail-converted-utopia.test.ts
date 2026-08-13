import { describe, expect, it } from "vitest";
import {
  beginFieldVisit,
  drawGuardArmy,
  getMainHero,
  instantiateTile,
  materializeTileFields
} from "./adventure";
import { createAdventureGameState } from "./adventure-setup";
import type { GameState, MapFieldState } from "./state";

// Grail-to-Utopia rules, pinned below on BOTH surfaces (the `polish-grail-utopia`
// house rule and the map-editor `hiddenGrailUtopia` package) plus the designer
// `grailAsUtopia` knob:
//   1. conversion fires at the DIG, never when a Grail's guards merely fall;
//   2. the dug field NEVER converts;
//   3. a converted field is a real Ⅶ fight paying the normal Utopia bundle;
//   4. its Artifact payout is exactly three cards: Search 3, Search 5, Search 5.
// The Creature-Bank `dragon_utopia` TOKEN is a different code path and is covered
// by creature-bank-guards / creature-banks tests.

const PLAYERS = [
  { id: "p1", name: "P1", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "P2", factionId: "necropolis" as const, heroDefId: "sandro" }
];

/** The Polish house-rule surface. */
function polishGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    players: PLAYERS,
    houseRules: { "polish-grail-utopia": true }
  });
}

/** The map-editor package surface (no house-rule toggle). */
function editorGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    players: PLAYERS,
    customMapPreset: { objectives: { hiddenGrailUtopia: true } }
  });
}

/** A plain Grail-victory map carrying only the designer `grailAsUtopia` knob. */
function knobGame(seed: string, mode: "always" | "after-dig-utopia" | "after-dig-empty"): GameState {
  return createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    players: PLAYERS,
    victoryMode: "grail",
    customMapPreset: { objectives: { grailAsUtopia: mode } }
  });
}

function field(location: string, spaceId: string): MapFieldState {
  return {
    spaceId,
    tileInstanceId: `test-${spaceId}`,
    slot: 0,
    location,
    difficulty: 7,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null,
    standalone: true,
    standaloneLayer: "surface"
  };
}

/** Places two Grail fields and returns them plus the acting hero. */
function twoGrails(state: GameState, prefix: string) {
  const hero = getMainHero(state, "p1")!;
  const dug = field("grail", `${prefix}-dug`);
  const extra = field("grail", `${prefix}-extra`);
  state.adventure!.fields[dug.spaceId] = dug;
  state.adventure!.fields[extra.spaceId] = extra;
  return { hero, dug, extra };
}

/** Beat the guards, then dig (2 Obelisks are only needed outside the package). */
function fightAndDig(state: GameState, heroId: string, fieldId: string): void {
  beginFieldVisit(state, heroId, fieldId, false);
  state.adventure!.grail!.obelisksVisited = { p1: ["obelisk-a", "obelisk-b"] };
  beginFieldVisit(state, heroId, fieldId, true);
}

function artifactSearches(state: GameState): number[] {
  return state.adventure!.rewardQueue
    .filter((reward) => reward.kind === "shared-deck-search" && reward.deckId === "artifacts")
    .map((reward) => (reward.kind === "shared-deck-search" ? reward.count : 0));
}

function tokenChoices(state: GameState): number {
  return state.adventure!.rewardQueue.filter((reward) => reward.kind === "visit-steps").length;
}

describe("Grail → Utopia conversion fires only when the Grail is TAKEN", () => {
  for (const [label, make] of [
    ["Polish house rule", polishGame],
    ["map-editor package", editorGame]
  ] as const) {
    it(`${label}: beating an extra Grail-neighbour's guards converts NOTHING; the dig does`, () => {
      const state = make(`${label}-trigger`);
      const { hero, dug, extra } = twoGrails(state, "trigger");
      hero.spaceId = dug.spaceId;

      // RULE 1: guards fall on the first Grail — the extra Grail is untouched.
      beginFieldVisit(state, hero.id, dug.spaceId, false);
      expect(dug.grailDiggable, "the fought site arms its dig").toBe(true);
      expect(extra.location, "an extra Grail must NOT turn before a Grail is taken").toBe("grail");
      expect(extra.grailConverted ?? false).toBe(false);
      expect(state.adventure!.grailTakenFieldId).toBeUndefined();
      // …and it still fights as a Grail: the package's Grail draw carries NO
      // Black Dragon (the Utopia draw appends exactly one).
      expect(
        drawGuardArmy(state, extra, 7).some((draw) => draw.unitDefId === "neutral.black_dragons"),
        "pre-dig, an extra Grail fights Grail guards, not Utopia dragons"
      ).toBe(false);
      // Visiting it pre-dig is Grail bookkeeping (arms a dig), never a payout.
      const goldBefore = state.players.p1.resources.gold;
      const queueBefore = state.adventure!.rewardQueue.length;
      const secondHero = getMainHero(state, "p2")!;
      secondHero.spaceId = extra.spaceId;
      beginFieldVisit(state, secondHero.id, extra.spaceId, false);
      expect(extra.location).toBe("grail");
      expect(state.players.p1.resources.gold).toBe(goldBefore);
      expect(state.adventure!.rewardQueue.length).toBe(queueBefore);
    });

    it(`${label}: the DUG field never turns — only the other extra Grail field does`, () => {
      const state = make(`${label}-dug-never-turns`);
      const { hero, dug, extra } = twoGrails(state, "dug");
      hero.spaceId = dug.spaceId;

      fightAndDig(state, hero.id, dug.spaceId);
      expect(state.adventure!.grail).toMatchObject({ status: "carried", carrierHeroId: hero.id });

      // RULE 2: the site the Grail came from stays a spent Grail dig site.
      expect(dug.location, "THE ORIGINAL GRAIL FIELD … WONT TURN").toBe("grail");
      expect(dug.grailConverted ?? false).toBe(false);
      expect(dug.blackCube).toBe(true);
      expect(dug.grailDiggable ?? false).toBe(false);
      expect(state.adventure!.grailTakenFieldId).toBe(dug.spaceId);

      // RULE 1 (the other half): the EXTRA Grail turns at exactly this moment.
      expect(extra.location).toBe("dragon_utopia");
      expect(extra.grailConverted).toBe(true);
      expect(extra.difficulty).toBe(7);
      expect(extra.blackCube).toBe(false);
      // …and now it really fights as a Utopia (the package appends a Black Dragon).
      expect(
        drawGuardArmy(state, extra, 7).filter((draw) => draw.unitDefId === "neutral.black_dragons")
      ).toHaveLength(1);
    });

    it(`${label}: a converted extra Grail pays exactly one Search 3 / 5 / 5 Utopia ladder`, () => {
      const state = make(`${label}-exact-reward`);
      const { hero, dug, extra } = twoGrails(state, "reward");
      hero.spaceId = dug.spaceId;
      fightAndDig(state, hero.id, dug.spaceId);
      expect(extra.grailConverted).toBe(true);

      // Snapshot AFTER the dig so the dig's own 20 gold is not counted here.
      const goldBefore = state.players.p1.resources.gold;
      const searchesBefore = artifactSearches(state).length;
      const choicesBefore = tokenChoices(state);
      hero.spaceId = extra.spaceId;
      beginFieldVisit(state, hero.id, extra.spaceId, false);

      // The converted field is a normal paying Utopia, and its built-in Artifact
      // reward is exactly THREE cards — never the six reported in live play.
      expect(extra.blackCube, "the fight still clears the hex").toBe(true);
      expect(artifactSearches(state).slice(searchesBefore)).toEqual([3, 3]);
      expect(tokenChoices(state), "one Morale / Ability-Empower pick").toBe(choicesBefore + 1);
      expect(state.players.p1.resources.gold).toBe(goldBefore + 20);
      // Conversion-origin bookkeeping still keeps it out of original-objective
      // credit; reward semantics and objective identity are separate concerns.
      expect(
        state.adventure!.vpLedger?.p1?.utopiaDefeatedFieldIds ?? []
      ).not.toContain(extra.spaceId);
      expect(extra.flagOwnerId).toBeNull();

      // CONTROL: an originally placed Ⅶ Utopia on the same game pays the same
      // single ladder and does receive original-objective credit.
      const realSearchesBefore = artifactSearches(state).length;
      const real = field("dragon_utopia", "real-utopia");
      state.adventure!.fields[real.spaceId] = real;
      hero.spaceId = real.spaceId;
      beginFieldVisit(state, hero.id, real.spaceId, false);
      expect(artifactSearches(state).slice(realSearchesBefore)).toEqual([3, 3]);
      expect(tokenChoices(state)).toBe(choicesBefore + 2);
      expect(state.adventure!.vpLedger?.p1?.utopiaDefeatedFieldIds ?? []).toContain(real.spaceId);
    });

    it(`${label}: a Grail tile revealed AFTER the dig converts; revealed BEFORE it does not`, () => {
      // The extra Grail's tile is still face-down at dig time, so the field sweep
      // cannot reach it — materializeTileFields converts it on reveal instead.
      const before = make(`${label}-late-before`);
      const beforeHero = getMainHero(before, "p1")!;
      const beforeDug = field("grail", "late-before-dug");
      before.adventure!.fields[beforeDug.spaceId] = beforeDug;
      beforeHero.spaceId = beforeDug.spaceId;
      // CONTROL: guards down but NOT dug — a revealed Grail tile stays a Grail.
      beginFieldVisit(before, beforeHero.id, beforeDug.spaceId, false);
      const hiddenEarly = instantiateTile(before.adventure!, "C2", { row: 50, col: 50 }, 0, true);
      hiddenEarly.faceDown = false;
      materializeTileFields(before.adventure!, hiddenEarly);
      const earlyObjective = Object.values(before.adventure!.fields).find(
        (candidate) => candidate.tileInstanceId === hiddenEarly.id && candidate.difficulty === 7
      );
      expect(earlyObjective?.location, "no dig yet ⇒ a revealed Grail stays a Grail").toBe("grail");

      const state = make(`${label}-late-after`);
      const { hero, dug } = twoGrails(state, "late-after");
      hero.spaceId = dug.spaceId;
      fightAndDig(state, hero.id, dug.spaceId);
      const hidden = instantiateTile(state.adventure!, "C2", { row: 50, col: 50 }, 0, true);
      hidden.faceDown = false;
      materializeTileFields(state.adventure!, hidden);
      const objective = Object.values(state.adventure!.fields).find(
        (candidate) => candidate.tileInstanceId === hidden.id && candidate.difficulty === 7
      );
      expect(objective?.location).toBe("dragon_utopia");
      expect(objective?.grailConverted, "a late reveal keeps its conversion origin").toBe(true);
    });
  }

  // REPORTED BUG 2026-08-09, verbatim: "3rd tile - Grail - this field was an
  // empty grail field (but it should have changed to utopia after digging grail
  // from 2nd tile)". The conversion used to SKIP any extra Grail whose guards had
  // already fallen (`blackCube`), so whether the map's other Grail turned at all
  // depended on the accident of having cleared it first — it just sat there as an
  // inert Grail for the rest of the game. It converts now. What it does NOT do is
  // resurrect itself into a fresh Ⅶ fight: the cube is kept, so the guards its
  // owner already beat are not re-fought for a second helping of hero experience.
  for (const [label, make] of [
    ["Polish house rule", polishGame],
    ["map-editor package", editorGame]
  ] as const) {
    it(`${label}: an extra Grail whose guards ALREADY fell converts too — and stays spent`, () => {
      const state = make(`${label}-spent-extra`);
      const { hero, dug, extra } = twoGrails(state, "spent");

      // Clear BOTH Grails' guards first (both arm a dig — the package lets any
      // Grail be dug), then take the Token from one of them.
      hero.spaceId = extra.spaceId;
      beginFieldVisit(state, hero.id, extra.spaceId, false);
      expect(extra.blackCube, "its guards are down").toBe(true);
      expect(extra.grailDiggable).toBe(true);

      hero.spaceId = dug.spaceId;
      fightAndDig(state, hero.id, dug.spaceId);
      expect(state.adventure!.grail?.status).toBe("carried");

      // It "changed to utopia" for every read…
      expect(extra.location).toBe("dragon_utopia");
      expect(extra.grailConverted).toBe(true);
      expect(extra.grailDiggable ?? false).toBe(false);
      // …but a beaten site is never resurrected: it stays cleared, so nobody
      // re-fights it and it pays nothing on a later visit.
      expect(extra.blackCube, "a spent site keeps its Black Cube").toBe(true);
      const goldBefore = state.players.p1.resources.gold;
      const searchesBefore = artifactSearches(state).length;
      const choicesBefore = tokenChoices(state);
      hero.spaceId = extra.spaceId;
      beginFieldVisit(state, hero.id, extra.spaceId, false);
      expect(state.players.p1.resources.gold).toBe(goldBefore);
      expect(artifactSearches(state).length).toBe(searchesBefore);
      expect(tokenChoices(state)).toBe(choicesBefore);

      // CONTROL: on the same rule, an UNFOUGHT extra Grail converts into a real,
      // still-fightable Utopia — so the cube above is the spent state travelling
      // with the field, not the conversion refusing to fight.
      const fresh = make(`${label}-fresh-extra`);
      const freshParts = twoGrails(fresh, "fresh");
      freshParts.hero.spaceId = freshParts.dug.spaceId;
      fightAndDig(fresh, freshParts.hero.id, freshParts.dug.spaceId);
      expect(freshParts.extra.location).toBe("dragon_utopia");
      expect(freshParts.extra.blackCube).toBe(false);
    });
  }

  it("re-materializing the DUG field's own tile leaves it a spent Grail", () => {
    // Rule 2 is enforced by field id, so even a rotation-driven re-materialize of
    // the dug tile cannot turn the site the Grail came from into a Utopia.
    const state = polishGame("dug-tile-rematerialize");
    const hero = getMainHero(state, "p1")!;
    const tile = instantiateTile(state.adventure!, "C2", { row: 60, col: 60 }, 0, false);
    materializeTileFields(state.adventure!, tile);
    const grailField = Object.values(state.adventure!.fields).find(
      (candidate) => candidate.tileInstanceId === tile.id && candidate.location === "grail"
    )!;
    hero.spaceId = grailField.spaceId;
    fightAndDig(state, hero.id, grailField.spaceId);
    expect(state.adventure!.grailTakenFieldId).toBe(grailField.spaceId);

    materializeTileFields(state.adventure!, tile);
    const after = state.adventure!.fields[grailField.spaceId];
    expect(after.location, "the dug site is excluded from the reveal conversion by id").toBe("grail");
    expect(after.grailConverted ?? false).toBe(false);
  });

  it("designer knob: after-dig-utopia converts with one Utopia reward, after-dig-empty empties, both spare the dug site", () => {
    for (const [mode, expected] of [
      ["after-dig-utopia", "dragon_utopia"],
      ["after-dig-empty", "empty_field"]
    ] as const) {
      const state = knobGame(`knob-${mode}`, mode);
      const { hero, dug, extra } = twoGrails(state, `knob-${mode}`);
      hero.spaceId = dug.spaceId;
      fightAndDig(state, hero.id, dug.spaceId);

      expect(extra.location).toBe(expected);
      expect(dug.location, "the dug site never turns in either mode").toBe("grail");
      if (mode === "after-dig-utopia") {
        expect(extra.grailConverted).toBe(true);
        // A plain converted field uses the normal plain-Utopia bundle: 10 gold
        // plus exactly the fixed three-Artifact ladder.
        const goldBefore = state.players.p1.resources.gold;
        const searches = artifactSearches(state).length;
        hero.spaceId = extra.spaceId;
        beginFieldVisit(state, hero.id, extra.spaceId, false);
        expect(state.players.p1.resources.gold).toBe(goldBefore + 20);
        expect(artifactSearches(state).slice(searches)).toEqual([3, 3]);
        expect(extra.blackCube).toBe(true);
      } else {
        expect(extra.grailConverted ?? false).toBe(false);
        expect(extra.difficulty).toBeUndefined();
      }
    }
  });

  it("classic (no package, no knob): an extra Grail stays a Grail even after the dig", () => {
    const state = createAdventureGameState({
      seed: "classic-no-conversion",
      difficulty: "normal",
      rollFirstPlayer: false,
      players: PLAYERS,
      victoryMode: "grail"
    });
    const { hero, dug, extra } = twoGrails(state, "classic");
    // Beat the EXTRA site's guards first so its own dig is armed…
    hero.spaceId = extra.spaceId;
    beginFieldVisit(state, hero.id, extra.spaceId, false);
    expect(extra.grailDiggable, "its dig is armed while the Token is uncollected").toBe(true);

    // …then take the Grail somewhere else.
    hero.spaceId = dug.spaceId;
    fightAndDig(state, hero.id, dug.spaceId);
    expect(state.adventure!.grail?.status).toBe("carried");
    expect(extra.location, "classic mode rewrites nothing").toBe("grail");
    expect(extra.grailConverted ?? false).toBe(false);
    // Only ONE Grail Token exists, so the extra site's armed dig flag is dropped
    // in EVERY mode — otherwise it still sells a 1-MP Revisit that does nothing.
    expect(extra.grailDiggable ?? false).toBe(false);
  });

  it("grailAsUtopia 'always' no longer fights Utopia dragons before the dig (legacy alias)", () => {
    // SUPERSEDED READING: "always" used to swap a Grail field's guards for the
    // Utopia party from round 1 while the field still dug. USER RULE 2026-08-07
    // ("only act like utopia AFTER A GRAIL IS TAKEN") makes it an alias of
    // after-dig-utopia.
    const state = knobGame("always-alias", "always");
    // `utopiaGuards: "four"` makes the two draws distinguishable: the Utopia party
    // is the fixed four dragons, a plain Ⅶ level draw is the difficulty table row.
    state.adventure!.mapPreset = {
      objectives: { grailAsUtopia: "always", utopiaGuards: "four" }
    };
    const { hero, dug, extra } = twoGrails(state, "always");
    hero.spaceId = dug.spaceId;

    // Pre-dig: a plain level-Ⅶ Grail draw, NOT the fixed four-dragon Utopia party.
    const preDig = drawGuardArmy(state, extra, 7);
    expect(preDig).not.toHaveLength(4);
    expect(preDig.some((draw) => draw.unitDefId === "neutral.azure_dragons")).toBe(false);
    expect(extra.location).toBe("grail");

    fightAndDig(state, hero.id, dug.spaceId);
    // Post-dig: the alias behaves exactly like after-dig-utopia.
    expect(extra.location).toBe("dragon_utopia");
    expect(extra.grailConverted).toBe(true);
    expect(dug.location).toBe("grail");
  });

  // A converted site is still not an original Dragon-Hunt objective; that is
  // pinned in grail-mode.test.ts, on the reducer's post-combat fast path — the
  // only seam that declares that win under the Grail/Utopia field package.
});
