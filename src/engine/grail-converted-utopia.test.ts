import { describe, expect, it } from "vitest";
import {
  beginFieldVisit,
  drawGuardArmy,
  getMainHero,
  instantiateTile,
  materializeTileFields
} from "./adventure";
import { finalizeAdventureCombat } from "./adventure-reducer";
import { createAdventureGameState } from "./adventure-setup";
import { applyAction } from "./index";
import type { CombatState, GameState, MapFieldState } from "./state";

// Grail-to-Utopia rules, pinned below on BOTH surfaces (the `polish-grail-utopia`
// house rule and the map-editor `hiddenGrailUtopia` package) plus the designer
// `grailAsUtopia` knob:
//   1. USER RULE 2026-08-19: WINNING THE BATTLE on a Grail field converts every
//      OTHER Grail field right then (supersedes the 2026-08-07 dig-time rule;
//      the dig re-runs the conversion only as a legacy-snapshot backstop);
//   2. the chosen/dug field NEVER converts — after the dig it stays a spent,
//      empty dig site forever (never a fresh Utopia);
//   3. a converted field is a real Ⅶ fight paying the normal Utopia bundle;
//   4. its Artifact payout is exactly the Ⅶ FIELD ladder: two Search (3) — two
//      Artifact cards (user-confirmed 2026-08-19: "current is right") — paid
//      ONCE, including through the real combat finalize + Necromancy window.
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

describe("Grail → Utopia conversion fires when a Grail BATTLE is won", () => {
  for (const [label, make] of [
    ["Polish house rule", polishGame],
    ["map-editor package", editorGame]
  ] as const) {
    it(`${label}: WINNING the battle on a Grail field converts every OTHER Grail right then`, () => {
      // USER RULE 2026-08-19 ("both are grail fields, but after winning a
      // battle vs a Ⅶ Grail field the other changes its status to a Ⅶ Utopia
      // field") — supersedes the 2026-08-07 dig-time trigger.
      const state = make(`${label}-trigger`);
      const { hero, dug, extra } = twoGrails(state, "trigger");
      hero.spaceId = dug.spaceId;

      // BEFORE any battle both fields are plain Grails: the extra fights Grail
      // guards (the Utopia draw appends a Black Dragon; the Grail draw never).
      expect(
        drawGuardArmy(state, extra, 7).some((draw) => draw.unitDefId === "neutral.black_dragons"),
        "pre-battle, every Grail field fights Grail guards, not Utopia dragons"
      ).toBe(false);
      expect(extra.location).toBe("grail");

      // The guards fall on the first Grail: THIS field becomes THE Grail (its
      // dig armed, it never turns), and the extra converts IMMEDIATELY —
      // before any dig, the moment the battle is won.
      beginFieldVisit(state, hero.id, dug.spaceId, false);
      expect(dug.grailDiggable, "the fought site arms its dig").toBe(true);
      expect(dug.location, "the fought site stays THE Grail").toBe("grail");
      expect(state.adventure!.grailTakenFieldId, "the conversion pivot is the fought field").toBe(
        dug.spaceId
      );
      expect(state.adventure!.grail?.status, "the token is NOT collected yet").toBe("uncollected");
      expect(extra.location, "the other Grail turns at the battle WIN").toBe("dragon_utopia");
      expect(extra.grailConverted).toBe(true);
      expect(extra.grailDiggable ?? false).toBe(false);
      expect(extra.blackCube, "an unfought converted site is a fresh Utopia fight").toBe(false);
      // …and it now really fights as a Utopia.
      expect(
        drawGuardArmy(state, extra, 7).filter((draw) => draw.unitDefId === "neutral.black_dragons")
      ).toHaveLength(1);
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

    it(`${label}: a converted extra Grail pays exactly one Utopia bundle (20 gold + two Search (3))`, () => {
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

    it(`${label}: a Grail tile revealed AFTER a won Grail battle converts; revealed BEFORE it does not`, () => {
      // CONTROL: no Grail battle has been won anywhere — a revealed Grail tile
      // stays a Grail.
      const before = make(`${label}-late-before`);
      const beforeDug = field("grail", "late-before-dug");
      before.adventure!.fields[beforeDug.spaceId] = beforeDug;
      const hiddenEarly = instantiateTile(before.adventure!, "C2", { row: 50, col: 50 }, 0, true);
      hiddenEarly.faceDown = false;
      materializeTileFields(before.adventure!, hiddenEarly);
      const earlyObjective = Object.values(before.adventure!.fields).find(
        (candidate) => candidate.tileInstanceId === hiddenEarly.id && candidate.difficulty === 7
      );
      expect(
        earlyObjective?.location,
        "no Grail battle won yet ⇒ a revealed Grail stays a Grail"
      ).toBe("grail");

      // USER RULE 2026-08-19: the WIN is the trigger — a tile still face-down /
      // in the Far supply at that moment converts on reveal, no dig needed.
      const state = make(`${label}-late-after`);
      const { hero, dug } = twoGrails(state, "late-after");
      hero.spaceId = dug.spaceId;
      beginFieldVisit(state, hero.id, dug.spaceId, false);
      expect(state.adventure!.grail?.status, "won, not yet dug").toBe("uncollected");
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
    it(`${label}: the FIRST won Grail battle picks THE Grail — and a legacy-cleared extra converts SPENT`, () => {
      // NEW-TIMING half: whichever Grail's battle is won FIRST becomes the
      // map's one Grail; the other converts at that moment (symmetric — it does
      // not matter which of the two the players reach first).
      const state = make(`${label}-first-win-picks`);
      const { hero, dug, extra } = twoGrails(state, "spent");
      hero.spaceId = extra.spaceId;
      beginFieldVisit(state, hero.id, extra.spaceId, false);
      expect(extra.blackCube, "its guards are down").toBe(true);
      expect(extra.grailDiggable, "the won site IS the Grail").toBe(true);
      expect(extra.location).toBe("grail");
      expect(state.adventure!.grailTakenFieldId).toBe(extra.spaceId);
      // The OTHER Grail converts into a fresh, fightable Utopia…
      expect(dug.location).toBe("dragon_utopia");
      expect(dug.grailConverted).toBe(true);
      expect(dug.blackCube).toBe(false);
      // …and the Grail is still dug from the WON site afterwards.
      state.adventure!.grail!.obelisksVisited = { p1: ["obelisk-a", "obelisk-b"] };
      beginFieldVisit(state, hero.id, extra.spaceId, true);
      expect(state.adventure!.grail?.status).toBe("carried");
      expect(extra.location, "the dug site never turns — it stays a spent dig site").toBe("grail");
      expect(extra.grailConverted ?? false).toBe(false);
      expect(extra.blackCube).toBe(true);

      // LEGACY half (snapshots written under the old dig-time rule could hold
      // TWO already-cleared Grails): a cleared extra still converts — but stays
      // SPENT, so nobody re-fights it for a second reward.
      const legacy = make(`${label}-legacy-spent`);
      const legacyParts = twoGrails(legacy, "legacy");
      legacyParts.extra.blackCube = true;
      legacyParts.extra.grailDiggable = true;
      legacyParts.hero.spaceId = legacyParts.dug.spaceId;
      fightAndDig(legacy, legacyParts.hero.id, legacyParts.dug.spaceId);
      expect(legacy.adventure!.grail?.status).toBe("carried");
      expect(legacyParts.extra.location).toBe("dragon_utopia");
      expect(legacyParts.extra.grailConverted).toBe(true);
      expect(legacyParts.extra.grailDiggable ?? false).toBe(false);
      expect(legacyParts.extra.blackCube, "a spent site keeps its Black Cube").toBe(true);
      const goldBefore = legacy.players.p1.resources.gold;
      const searchesBefore = artifactSearches(legacy).length;
      const choicesBefore = tokenChoices(legacy);
      legacyParts.hero.spaceId = legacyParts.extra.spaceId;
      beginFieldVisit(legacy, legacyParts.hero.id, legacyParts.extra.spaceId, false);
      expect(legacy.players.p1.resources.gold).toBe(goldBefore);
      expect(artifactSearches(legacy).length).toBe(searchesBefore);
      expect(tokenChoices(legacy)).toBe(choicesBefore);

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

  // REPORTED 2026-08-19: "the Grail field that changed to a Utopia gives too big
  // a reward — I believe it searches twice all the searches". This pins the LIVE
  // path (real combat finalize → atomic Necromancy window → deferred field
  // visit) paying the bundle exactly ONCE, and a repeat finalize/visit on the
  // same field paying NOTHING.
  it("a converted Utopia cleared through the REAL combat finalize pays ONE bundle — never twice", () => {
    const state = editorGame("finalize-single-pay");
    // The NECROPOLIS seat wins holding Necromancy, so the (faction-gated)
    // deferred-reward window really opens.
    state.players.p2.hand = ["ability.necromancy"];
    state.players.p2.army = [{ id: "army_skel", unitDefId: "necropolis.skeletons", side: "few" }];
    const { dug, extra } = twoGrails(state, "finalize");
    const hero = getMainHero(state, "p2")!;
    hero.spaceId = dug.spaceId;
    fightAndDig(state, hero.id, dug.spaceId);
    expect(extra.location).toBe("dragon_utopia");

    const goldBefore = state.players.p2.resources.gold;
    const searchesBefore = artifactSearches(state).length;
    const choicesBefore = tokenChoices(state);
    hero.spaceId = extra.spaceId;
    state.activePlayerId = "p2";
    state.phase = "player-turn";
    const wonCombat = () =>
      ({
        context: {
          kind: "neutral",
          heroId: hero.id,
          fieldId: extra.spaceId,
          difficulty: 7,
          hasAzure: true
        },
        outcome: {
          winnerPlayerId: "p2",
          defeatedPlayerId: "neutral",
          reason: "all-enemy-units-defeated"
        },
        endAcknowledged: true,
        units: {}
      }) as unknown as CombatState;
    state.combat = wonCombat();
    finalizeAdventureCombat(state);

    // The reward is withheld WHOLE behind the atomic Necromancy window…
    expect(state.adventure!.pendingNecromancy?.playerId).toBe("p2");
    expect(state.players.p2.resources.gold).toBe(goldBefore);
    expect(artifactSearches(state).length).toBe(searchesBefore);

    // …and Resolve pays it exactly once: 20 gold + two Search (3) + one token pick.
    const resolved = applyAction(state, { type: "SKIP_NECROMANCY", playerId: "p2" });
    expect(resolved.errors.map((error) => error.message).join("; ")).toBe("");
    Object.assign(state, resolved.state);
    expect(state.players.p2.resources.gold).toBe(goldBefore + 20);
    expect(artifactSearches(state).slice(searchesBefore)).toEqual([3, 3]);
    expect(tokenChoices(state)).toBe(choicesBefore + 1);
    expect(state.adventure!.fields[extra.spaceId].blackCube).toBe(true);

    // A repeat finalize on the same field (the "twice" class) pays NOTHING.
    state.combat = wonCombat();
    finalizeAdventureCombat(state);
    if (state.adventure!.pendingNecromancy) {
      const again = applyAction(state, { type: "SKIP_NECROMANCY", playerId: "p2" });
      Object.assign(state, again.state);
    }
    beginFieldVisit(state, hero.id, extra.spaceId, false);
    expect(state.players.p2.resources.gold).toBe(goldBefore + 20);
    expect(artifactSearches(state).slice(searchesBefore)).toEqual([3, 3]);
    expect(tokenChoices(state)).toBe(choicesBefore + 1);
  });

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
