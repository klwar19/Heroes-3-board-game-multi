import { describe, expect, it } from "vitest";
import { MAX_DESIGNED_GATE_LINKS } from "@/engine";
import {
  actorMayModifyMap,
  clampMapPlayers,
  MAX_STORED_MAPS,
  MapRegistry,
  sanitizeSharedMap,
  stampSavedMapOwnership,
  type MapActor,
  type SharedMapRecord
} from "./map-registry";

/** A minimal valid map record for the registry (real designer tile shape). */
function makeMap(overrides: Partial<SharedMapRecord> & { id: string }): SharedMapRecord {
  return {
    name: `Map ${overrides.id}`,
    scenarioId: "skirmish",
    players: 4,
    tiles: [{ row: 9, col: 4, group: "near", faceDown: true }],
    createdByClientId: null,
    createdByName: null,
    createdByUserId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

describe("clampMapPlayers", () => {
  it("clamps a request into the scenario's seat range (skirmish allows 2–6)", () => {
    expect(clampMapPlayers("skirmish", 1)).toBe(2);
    expect(clampMapPlayers("skirmish", 3)).toBe(3);
    expect(clampMapPlayers("skirmish", 4)).toBe(4);
    expect(clampMapPlayers("skirmish", 5)).toBe(5);
    expect(clampMapPlayers("skirmish", 6)).toBe(6);
    expect(clampMapPlayers("skirmish", 9)).toBe(6);
  });

  it("pins a 2-player-only scenario to 2 even when 4 is asked for", () => {
    // land-2p is a symmetric duel map: maxPlayers 2. The control above proves the
    // clamp is scenario-driven, not a blanket cap.
    expect(clampMapPlayers("land-2p", 4)).toBe(2);
    expect(clampMapPlayers("land-2p", 2)).toBe(2);
  });

  it("defaults an unknown scenario to the floor instead of throwing", () => {
    expect(clampMapPlayers("does-not-exist", 4)).toBe(2);
  });
});

describe("sanitizeSharedMap", () => {
  it("keeps a valid map and stamps a fresh updatedAt", () => {
    const record = sanitizeSharedMap(
      { id: "m1", name: "Frontier", scenarioId: "skirmish", players: 3, tiles: [{ row: 9, col: 4, group: "near" }] },
      5000
    );
    expect(record).not.toBeNull();
    expect(record!.players).toBe(3);
    expect(record!.scenarioId).toBe("skirmish");
    expect(record!.tiles).toHaveLength(1);
    expect(record!.updatedAt).toBe(5000);
  });

  it("clamps an out-of-range player count to the scenario (4-seat ask on a 2P map → 2)", () => {
    const record = sanitizeSharedMap({ id: "m", scenarioId: "land-2p", players: 4, tiles: [] }, 1);
    expect(record!.players).toBe(2);
  });

  it("drops malformed tiles but keeps the well-formed ones", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "far" }, // good
          { row: 1.5, col: 2, group: "far" }, // non-integer row → dropped
          { row: 2, col: 2, group: "bogus" }, // unknown group → dropped
          "nonsense" // not an object → dropped
        ]
      },
      1
    );
    expect(record!.tiles).toHaveLength(1);
    expect(record!.tiles[0]).toMatchObject({ row: 1, col: 1, group: "far" });
  });

  it("keeps sanitized solo roles/bonuses only on starting Towns", () => {
    const record = sanitizeSharedMap(
      {
        id: "solo-roles",
        tiles: [
          {
            row: 1,
            col: 1,
            group: "starting",
            faceDown: false,
            singlePlayer: {
              role: "computer",
              bonus: { gold: 999, buildingMaterials: -4, valuables: 3.8 }
            }
          },
          {
            row: 9,
            col: 9,
            group: "near",
            faceDown: true,
            singlePlayer: { role: "human", bonus: { gold: 9 } }
          }
        ]
      },
      1
    );

    expect(record!.tiles[0].singlePlayer).toEqual({
      role: "computer",
      bonus: { gold: 99, buildingMaterials: 0, valuables: 3 }
    });
    expect(record!.tiles[1].singlePlayer).toBeUndefined();
  });

  it("preserves a tile's guard band — sea AND underground — through sanitization", () => {
    // Regression: sanitizeTile rebuilds each plan from an allow-list of fields,
    // so a newly added band field must be carried explicitly or a saved
    // "Underground Ⅵ–Ⅶ" / "Sea Ⅵ–Ⅶ" slot silently loses its band on reload and
    // reverts to drawing any tile from the pool.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "sea", faceDown: true, seaBand: "vi-vii" },
          { row: 2, col: 2, group: "subterranean", faceDown: true, subBand: "vi-vii" },
          { row: 3, col: 3, group: "subterranean", faceDown: true, subBand: "iv-v" },
          { row: 4, col: 4, group: "subterranean", faceDown: true, subBand: "bogus" } // invalid → dropped
        ]
      },
      1
    );
    expect(record!.tiles[0]).toMatchObject({ group: "sea", seaBand: "vi-vii" });
    expect(record!.tiles[1]).toMatchObject({ group: "subterranean", subBand: "vi-vii" });
    expect(record!.tiles[2]).toMatchObject({ group: "subterranean", subBand: "iv-v" });
  });

  it("preserves a face-down secret tile pin through sanitization", () => {
    // A face-down plan with tileDefId is a designer-only secret predetermined
    // tile — sanitize must keep the id or the pin silently becomes a random
    // pool draw on reload.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "near", faceDown: true, tileDefId: "N3", rotation: 2 },
          { row: 2, col: 2, group: "far", faceDown: true }, // random — no id
          { row: 3, col: 3, group: "far", faceDown: false, tileDefId: "F1" }
        ]
      },
      1
    );
    expect(record!.tiles[0]).toMatchObject({
      group: "near",
      faceDown: true,
      tileDefId: "N3",
      rotation: 2
    });
    expect(record!.tiles[1].tileDefId).toBeUndefined();
    expect(record!.tiles[1].faceDown).toBe(true);
    expect(record!.tiles[2]).toMatchObject({ faceDown: false, tileDefId: "F1" });
  });

  it("round-trips lockRotation on a STARTING plan, strips it off non-starting groups, and drops garbage", () => {
    // lockRotation FIXES a seat's home-tile orientation (no opening rotation) — a
    // starting-only flag. It must survive a save on a starting plan, never on any
    // other group, and only a literal `true` may set it.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "starting", faceDown: false, lockRotation: true, rotation: 3 },
          { row: 2, col: 2, group: "near", faceDown: true, lockRotation: true }, // non-starting → stripped
          { row: 3, col: 3, group: "starting", faceDown: false, lockRotation: "yes" }, // garbage → dropped
          { row: 4, col: 4, group: "starting", faceDown: false } // no flag → stays absent
        ]
      },
      1
    );
    expect(record!.tiles[0]).toMatchObject({ group: "starting", lockRotation: true, rotation: 3 });
    expect(record!.tiles[1].lockRotation, "stripped off a near plan").toBeUndefined();
    expect(record!.tiles[2].lockRotation, "non-boolean garbage dropped").toBeUndefined();
    expect(record!.tiles[3].lockRotation, "absent when unset").toBeUndefined();
  });

  it("round-trips the UNDERGROUND flag on far/near/center/sea, strips it off starting/subterranean, and drops garbage", () => {
    // The per-tile underground layer override is kept ONLY as literal true and
    // ONLY on the flag-valid groups; it is redundant on a printed cavern and
    // excluded on a seat tile (the v1 Surface-only rule).
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "far", faceDown: true, underground: true }, // kept
          { row: 2, col: 2, group: "sea", faceDown: true, underground: true, seaBand: "iv-v" }, // kept
          { row: 3, col: 3, group: "starting", faceDown: false, underground: true }, // seat tile → stripped
          { row: 4, col: 4, group: "subterranean", faceDown: true, subBand: "iv-v", underground: true }, // redundant → stripped
          { row: 5, col: 5, group: "near", faceDown: true, underground: "yes" }, // garbage → dropped
          { row: 6, col: 6, group: "center", faceDown: true } // absent stays absent
        ]
      },
      1
    );
    expect(record!.tiles[0], "far tile keeps its band + underground flag").toMatchObject({ group: "far", underground: true });
    expect(record!.tiles[1]).toMatchObject({ group: "sea", underground: true });
    expect(record!.tiles[2].underground, "stripped off a starting seat tile").toBeUndefined();
    expect(record!.tiles[3].underground, "stripped off a printed cavern (redundant)").toBeUndefined();
    expect(record!.tiles[4].underground, "non-boolean garbage dropped").toBeUndefined();
    expect(record!.tiles[5].underground, "absent when unset").toBeUndefined();
  });

  it("keeps gate links on a FLAGGED far plan (CONTROL: still stripped on a plain far plan)", () => {
    // Gate links belong to any underground-LAYER plan — a printed cavern OR a
    // far/near/center/sea tile flagged underground. A plain (Surface) far plan
    // still carries none.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          {
            row: 1,
            col: 1,
            group: "far",
            faceDown: true,
            underground: true,
            gateLinks: [{ surface: { row: 2, col: 2 } }]
          },
          // CONTROL: no underground flag → Surface → gate links dropped.
          { row: 3, col: 3, group: "far", faceDown: true, gateLinks: [{ surface: { row: 2, col: 2 } }] }
        ]
      },
      1
    );
    expect(record!.tiles[0].gateLinks, "a flagged far plan keeps its gate links").toEqual([{ surface: { row: 2, col: 2 } }]);
    expect(record!.tiles[1], "a plain far plan keeps none").not.toHaveProperty("gateLinks");
  });

  it("round-trips viiField on a CENTER plan, strips it off non-center groups, and drops garbage", () => {
    // viiField FORCES a center slot's Ⅶ objective field (Grail / Dragon Utopia /
    // town) — a center-only designation. It must survive on a center plan, never
    // on any other group, and only a known value may set it.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "center", faceDown: true, viiField: "dragon_utopia" },
          { row: 2, col: 2, group: "near", faceDown: true, viiField: "grail" }, // non-center → stripped
          { row: 3, col: 3, group: "center", faceDown: true, viiField: "castle" }, // garbage → dropped
          { row: 4, col: 4, group: "center", faceDown: true } // no designation → stays absent
        ]
      },
      1
    );
    expect(record!.tiles[0]).toMatchObject({ group: "center", viiField: "dragon_utopia" });
    expect(record!.tiles[1].viiField, "stripped off a near plan").toBeUndefined();
    expect(record!.tiles[2].viiField, "unknown value dropped").toBeUndefined();
    expect(record!.tiles[3].viiField, "absent when unset").toBeUndefined();
  });

  it("round-trips a centerHex (guard/reward/VP), clamps it, folds LEGACY viiField* saves, and strips non-centers", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          // Kept + clamped (gold 999 → 50 cap; VP 99 → 10 cap; junk resource +
          // unknown guard unit dropped; a valid exact army survives).
          {
            row: 1,
            col: 1,
            group: "center",
            faceDown: true,
            viiField: "grail",
            centerHex: {
              guard: { units: ["neutral.cyclopes", "not.a.unit"] },
              reward: { gold: 999, valuables: 2, unicorns: 5, treasureDice: 9, searchSpell: 2 },
              vp: 99
            }
          },
          // LEGACY save shape (the one earlier build): viiFieldReward/viiFieldVp
          // fold into centerHex — WITHOUT needing a designation any more.
          { row: 2, col: 2, group: "center", faceDown: true, viiFieldReward: { gold: 5 }, viiFieldVp: 3 },
          // A customization on a non-center slot → dropped with the (already-
          // illegal) designation.
          { row: 3, col: 3, group: "near", faceDown: true, viiField: "grail", centerHex: { reward: { gold: 5 } } }
        ]
      },
      1
    );
    expect(record!.tiles[0]).toMatchObject({
      viiField: "grail",
      centerHex: {
        guard: { units: ["neutral.cyclopes"] },
        reward: { gold: 50, valuables: 2, treasureDice: 3, searchSpell: 2 },
        vp: 10
      }
    });
    expect(record!.tiles[0].centerHex?.reward).not.toHaveProperty("unicorns");
    expect(record!.tiles[1].centerHex, "legacy bonus folded in").toEqual({ reward: { gold: 5 }, vp: 3 });
    expect(record!.tiles[2].centerHex, "non-center customization dropped").toBeUndefined();
  });

  it("round-trips a preset objectives block through save/load", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [{ row: 1, col: 1, group: "near", faceDown: true }],
        preset: { objectives: { grailObelisksRequired: 3, utopiaGuards: "four", utopiaBonusSearch: 2 } }
      },
      1
    );
    expect(record!.preset?.objectives).toEqual({
      grailObelisksRequired: 3,
      utopiaGuards: "four",
      utopiaBonusSearch: 2
    });
  });

  it("round-trips the Ⅱ–Ⅲ tile type-choice preset through save/load (garbage kinds dropped)", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [{ row: 1, col: 1, group: "near", faceDown: true }],
        preset: {
          farTileTypeChoice: true,
          // Designer order + a duplicate + a bogus kind: only the two real kinds
          // survive, deduped and in the canonical order.
          farTileTypeChoices: ["valuables", "not-a-kind", "gold", "valuables"]
        }
      } as unknown as Parameters<typeof sanitizeSharedMap>[0],
      1
    );
    expect(record!.preset?.farTileTypeChoice).toBe(true);
    expect(record!.preset?.farTileTypeChoices).toEqual(["gold", "valuables"]);

    // CONTROL: a preset with only bogus kinds keeps no list at all.
    const bogus = sanitizeSharedMap(
      {
        id: "m2",
        tiles: [{ row: 1, col: 1, group: "near", faceDown: true }],
        preset: { farTileTypeChoices: ["crystal", 3] }
      } as unknown as Parameters<typeof sanitizeSharedMap>[0],
      1
    );
    expect(bogus!.preset?.farTileTypeChoices).toBeUndefined();
  });

  it("preserves a map preset (resources, timed events, victory) through sanitization", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [{ row: 1, col: 1, group: "near", faceDown: true }],
        preset: {
          victoryMode: "grail",
          startingResources: { gold: 15, buildingMaterials: 2, valuables: 1 },
          timedEvents: [
            { round: 6, effect: { kind: "clear_visitable_cubes", locations: ["windmill"] } }
          ],
          notes: "Bring the Grail home",
          // junk dropped:
          badField: true
        }
      },
      1
    );
    expect(record!.preset).toMatchObject({
      victoryMode: "grail",
      startingResources: { gold: 15, buildingMaterials: 2, valuables: 1 },
      notes: "Bring the Grail home"
    });
    expect(record!.preset!.timedEvents).toHaveLength(1);
    expect(record!.preset!.timedEvents![0]).toMatchObject({
      round: 6,
      effect: { kind: "clear_visitable_cubes", locations: ["windmill"] }
    });
  });

  it("round-trips a timed STORY scene event and drops an unknown sceneId", async () => {
    const { STORY_SCENE_IDS } = await import("@/data/story/scenes");
    const record = sanitizeSharedMap(
      {
        id: "s",
        tiles: [{ row: 1, col: 1, group: "near", faceDown: true }],
        preset: {
          timedEvents: [
            { round: 3, effect: { kind: "story", sceneId: STORY_SCENE_IDS[0] } },
            { round: 4, effect: { kind: "story", sceneId: "story.bogus" } } // dropped
          ]
        }
      },
      1
    );
    expect(record!.preset!.timedEvents).toEqual([
      { round: 3, effect: { kind: "story", sceneId: STORY_SCENE_IDS[0] } }
    ]);
  });

  it("preserves a face-down secretFeature landmark filter through sanitization", () => {
    // Feature secrets are the primary designer Secret UX — losing them on save
    // would silently demote the slot to a pure random draw.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "near", faceDown: true, secretFeature: "gold_mine", rotation: 1 },
          { row: 2, col: 2, group: "far", faceDown: true, secretFeature: "obelisk" },
          // Face-up must never keep a secretFeature.
          { row: 3, col: 3, group: "far", faceDown: false, tileDefId: "F1", secretFeature: "settlement" },
          // Unknown feature ids are dropped.
          { row: 4, col: 4, group: "near", faceDown: true, secretFeature: "unicorn_ranch" }
        ]
      },
      1
    );
    expect(record!.tiles[0]).toMatchObject({
      faceDown: true,
      secretFeature: "gold_mine",
      rotation: 1
    });
    expect(record!.tiles[1]).toMatchObject({ faceDown: true, secretFeature: "obelisk" });
    expect(record!.tiles[2].secretFeature).toBeUndefined();
    expect(record!.tiles[2]).toMatchObject({ faceDown: false, tileDefId: "F1" });
    expect(record!.tiles[3].secretFeature).toBeUndefined();
    expect(record!.tiles[3].faceDown).toBe(true);
  });

  it("preserves a face-down multi-landmark secretFeatures set (valuables OR gold), dropping garbage", () => {
    const record = sanitizeSharedMap(
      {
        id: "mc",
        tiles: [
          // Kept: two valid ids on a face-down slot; duplicate + unknown dropped.
          {
            row: 1,
            col: 1,
            group: "near",
            faceDown: true,
            secretFeatures: ["valuables_mine", "gold_mine", "valuables_mine", "unicorn_ranch"]
          },
          // Face-up must never keep a secret-landmark set.
          { row: 2, col: 2, group: "far", faceDown: false, tileDefId: "F1", secretFeatures: ["gold_mine"] }
        ]
      },
      1
    );
    expect(record!.tiles[0].secretFeatures).toEqual(["valuables_mine", "gold_mine"]);
    expect(record!.tiles[1].secretFeatures).toBeUndefined();
  });

  it("preserves a tile's Monolith/Whirlpool/Gate token through sanitization (malformed tokens dropped)", () => {
    // sanitizeTile rebuilds each plan from an allow-list, so the designed token
    // must be carried explicitly or a saved map silently loses its Monoliths/
    // Whirlpools/Gates on reload — the teleport network would vanish from the game.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 1, col: 1, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: 0 } },
          { row: 2, col: 2, group: "sea", faceDown: true, token: { kind: "whirlpool", slot: 4 } },
          { row: 3, col: 3, group: "far", faceDown: true, token: { kind: "wormhole" } }, // unknown kind → token dropped
          { row: 4, col: 4, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", slot: 9 } }, // bad slot → slot dropped
          // A colored Gate token round-trips with its pair (face-up slot + face-down).
          { row: 5, col: 5, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "gate", pair: 2, slot: 1 } },
          { row: 6, col: 6, group: "far", faceDown: true, token: { kind: "gate", pair: 4 } },
          { row: 7, col: 7, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "gate", slot: 0 } }, // gate WITHOUT pair → dropped
          { row: 8, col: 8, group: "far", faceDown: false, tileDefId: "F1", token: { kind: "monolith", pair: 3, slot: 0 } } // stray pair → stripped
        ]
      },
      1
    );
    // Sanitize now writes the CANONICAL multi-token array (`tokens`), folding
    // the legacy singular `token` in — the engine consumes plans via planTokens,
    // which reads both forms, so no saved map loses its teleporters.
    expect(record!.tiles[0].token).toBeUndefined();
    expect(record!.tiles[0].tokens).toEqual([{ kind: "monolith", slot: 0 }]);
    expect(record!.tiles[1].tokens).toEqual([{ kind: "whirlpool", slot: 4 }]);
    expect(record!.tiles[2].tokens).toBeUndefined();
    expect(record!.tiles[3].tokens).toEqual([{ kind: "monolith" }]);
    // A malformed band is stripped, not stored.
    expect(record!.tiles[3]).not.toHaveProperty("subBand");
    // Gate tokens keep their pair (and slot when face-up); a gate WITHOUT a pair
    // is dropped, and a stray pair on a Monolith is stripped.
    expect(record!.tiles[4].tokens).toEqual([{ kind: "gate", pair: 2, slot: 1 }]);
    expect(record!.tiles[5].tokens).toEqual([{ kind: "gate", pair: 4 }]);
    expect(record!.tiles[6].tokens).toBeUndefined();
    expect(record!.tiles[7].tokens).toEqual([{ kind: "monolith", slot: 0 }]);
    expect(record!.tiles[7].tokens?.[0]).not.toHaveProperty("pair");
  });

  it("multi hex placements round-trip: tokens + Field Overrides on distinct slots (same-slot stacks dropped)", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          {
            row: 1,
            col: 1,
            group: "far",
            faceDown: true,
            tokens: [
              { kind: "monolith", slot: 1 },
              { kind: "gate", pair: 2, slot: 2 },
              { kind: "monolith", slot: 1 } // same-slot stack → dropped (first wins)
            ],
            fieldOverrides: [
              { kind: "kiem_trung", slot: 3 },
              { kind: "linh_tuyen", slot: 2 }, // stacks on the gate's slot → dropped
              { kind: "bi_canh", slot: 4 }
            ]
          },
          // Legacy singular forms fold into the arrays.
          {
            row: 2,
            col: 2,
            group: "near",
            faceDown: true,
            token: { kind: "monolith", slot: 0 },
            fieldOverride: { kind: "ngo_dao_thach", slot: 5 }
          }
        ]
      },
      1
    );
    expect(record!.tiles[0].tokens).toEqual([
      { kind: "monolith", slot: 1 },
      { kind: "gate", pair: 2, slot: 2 }
    ]);
    expect(record!.tiles[0].fieldOverrides).toEqual([
      { kind: "kiem_trung", slot: 3 },
      { kind: "bi_canh", slot: 4 }
    ]);
    expect(record!.tiles[1].token).toBeUndefined();
    expect(record!.tiles[1].fieldOverride).toBeUndefined();
    expect(record!.tiles[1].tokens).toEqual([{ kind: "monolith", slot: 0 }]);
    expect(record!.tiles[1].fieldOverrides).toEqual([{ kind: "ngo_dao_thach", slot: 5 }]);
  });

  it("preserves designer Subterranean Gate links (malformed / non-cavern dropped)", () => {
    // sanitizeTile rebuilds each plan from an allow-list, so the designed gate
    // links must be carried explicitly or a saved map silently loses its
    // designer-chosen underground connections on reload.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          {
            row: 5,
            col: 5,
            group: "subterranean",
            faceDown: true,
            subBand: "iv-v",
            gateLinks: [
              { surface: { row: 4, col: 4 }, gateHex: "h:4:5", entranceHex: "h:5:5" }, // full pin
              { surface: { row: 6, col: 6 } }, // pairing only
              { surface: { row: 1.5, col: 2 } }, // non-integer centre → dropped whole
              { surface: { row: 7, col: 7 }, gateHex: "not-a-hex" }, // bad hex → hex stripped, link kept
              "junk" // not an object → dropped
            ]
          },
          // gateLinks on a non-cavern tile are meaningless and dropped entirely.
          { row: 9, col: 9, group: "near", faceDown: true, gateLinks: [{ surface: { row: 8, col: 8 } }] }
        ]
      },
      1
    );
    const cavern = record!.tiles[0];
    expect(cavern.gateLinks).toHaveLength(3);
    expect(cavern.gateLinks![0]).toEqual({ surface: { row: 4, col: 4 }, gateHex: "h:4:5", entranceHex: "h:5:5" });
    expect(cavern.gateLinks![1]).toEqual({ surface: { row: 6, col: 6 } });
    // The malformed hex is stripped but the pairing survives.
    expect(cavern.gateLinks![2]).toEqual({ surface: { row: 7, col: 7 } });
    // A near tile keeps no gate links.
    expect(record!.tiles[1]).not.toHaveProperty("gateLinks");
  });

  it("round-trips designer GUARDS on tile tokens and gate-link halves (clamped; garbage dropped)", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          {
            row: 3,
            col: 3,
            group: "far",
            faceDown: true,
            tokens: [
              // Level guard survives; over-clamp folds to 7.
              { kind: "monolith", slot: 1, guard: { level: 99 } },
              // Exact-army guard keeps known ids, drops unknown ones.
              { kind: "gate", pair: 2, slot: 2, guard: { units: ["neutral.cyclopes", "not.a.unit"] } },
              // Garbage guard vanishes, the token itself survives.
              { kind: "whirlpool", slot: 3, guard: "junk" }
            ]
          },
          {
            row: 5,
            col: 5,
            group: "subterranean",
            faceDown: true,
            gateLinks: [
              {
                surface: { row: 4, col: 4 },
                gateGuard: { level: 4 },
                entranceGuard: { units: ["neutral.troglodytes"] }
              }
            ]
          }
        ]
      },
      1
    );
    const tokens = record!.tiles[0].tokens!;
    expect(tokens[0].guard).toEqual({ level: 7 });
    expect(tokens[1].guard).toEqual({ units: ["neutral.cyclopes"] });
    expect(tokens[2].guard).toBeUndefined();
    const link = record!.tiles[1].gateLinks![0];
    expect(link.gateGuard).toEqual({ level: 4 });
    expect(link.entranceGuard).toEqual({ units: ["neutral.troglodytes"] });
  });

  it("round-trips ONE-WAY monolith tokens (pair required, exit guard stripped, mode/always kept)", () => {
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          {
            row: 3,
            col: 3,
            group: "far",
            faceDown: true,
            tokens: [
              { kind: "oneway_entrance", pair: 2, slot: 1, exitMode: "mix", guard: { level: 3 } },
              // An exit is never guarded; alwaysPickable survives.
              { kind: "oneway_exit", pair: 2, slot: 2, guard: { level: 5 }, alwaysPickable: true },
              // No pair → dropped whole.
              { kind: "oneway_entrance", slot: 3 }
            ]
          }
        ]
      },
      1
    );
    const tokens = record!.tiles[0].tokens!;
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ kind: "oneway_entrance", pair: 2, exitMode: "mix", guard: { level: 3 } });
    expect(tokens[1]).toMatchObject({ kind: "oneway_exit", pair: 2, alwaysPickable: true });
    expect(tokens[1].guard).toBeUndefined();
  });

  it("round-trips MORE than the old cap of 4 designer gate links (one cavern → many gates)", () => {
    // Six distinct valid links (over the retired 4-partner cap) must ALL survive:
    // a cavern may link every touching Surface tile and the same tile repeatedly.
    const sixLinks = Array.from({ length: 6 }, (_, index) => ({
      surface: { row: 4, col: index },
      gateHex: `h:5:${index}`,
      entranceHex: `h:6:${index}`
    }));
    const record = sanitizeSharedMap(
      { id: "m", tiles: [{ row: 5, col: 5, group: "subterranean", faceDown: true, gateLinks: sixLinks }] },
      1
    );
    expect(record!.tiles[0].gateLinks).toHaveLength(6);
    expect(MAX_DESIGNED_GATE_LINKS).toBeGreaterThanOrEqual(6);
  });

  it("caps designer gate links so untrusted input can't balloon", () => {
    const oversized = Array.from({ length: MAX_DESIGNED_GATE_LINKS + 16 }, (_, index) => ({
      surface: { row: index, col: index }
    }));
    const record = sanitizeSharedMap(
      { id: "m", tiles: [{ row: 5, col: 5, group: "subterranean", faceDown: true, gateLinks: oversized }] },
      1
    );
    expect(record!.tiles[0].gateLinks).toHaveLength(MAX_DESIGNED_GATE_LINKS);
  });

  it("preserves designer yellow borders round-trip; drops garbage, dedupes, caps at 6", () => {
    // sanitizeTile rebuilds each plan from an allow-list, so `extraBorders` must
    // be carried explicitly or a saved map silently loses its designer walls on
    // reload. Legal on ANY tile group (a starting town too).
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          // Well-formed borders on a starting town: garbage (7, -1, "x", 2.5) is
          // dropped, the duplicate 0 deduped, and the survivors kept ascending.
          { row: 5, col: 5, group: "starting", faceDown: false, extraBorders: [0, 3, 0, 7, -1, "x", 2.5] },
          // Every direction 0-5 (with dupes) → capped/deduped to the six distinct.
          { row: 9, col: 9, group: "far", faceDown: true, extraBorders: [0, 1, 2, 3, 4, 5, 5, 4, 3] },
          // Not an array → no extraBorders on the plan at all.
          { row: 12, col: 12, group: "near", faceDown: true, extraBorders: "nope" },
          // All-garbage list → property absent entirely.
          { row: 15, col: 15, group: "sea", faceDown: true, extraBorders: [9, -2, 3.3] }
        ]
      },
      1
    );
    expect(record!.tiles[0].extraBorders).toEqual([0, 3]);
    expect(record!.tiles[1].extraBorders).toEqual([0, 1, 2, 3, 4, 5]);
    expect(record!.tiles[1].extraBorders!.length).toBeLessThanOrEqual(6);
    expect(record!.tiles[2]).not.toHaveProperty("extraBorders");
    expect(record!.tiles[3]).not.toHaveProperty("extraBorders");
  });

  it("preserves designer per-edge borders round-trip; canonicalizes, dedupes, drops garbage, caps at 30", () => {
    // sanitizeTile rebuilds each plan from an allow-list, so `borderEdges` must be
    // carried explicitly (via normalizeDesignedBorderEdges) or a saved map silently
    // loses its designer edge-walls on reload. Legal on ANY tile group.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          // 9 (fp1,dir3) and 0 (fp0,dir0) are the SAME centre↔ring[0] edge → both
          // canonicalize to 0; garbage (42, -1, "x", 3.5) is dropped.
          { row: 5, col: 5, group: "starting", faceDown: false, borderEdges: [9, 0, 42, -1, "x", 3.5, 13] },
          // All 42 codes → exactly the 30 distinct physical edges.
          { row: 9, col: 9, group: "far", faceDown: true, borderEdges: Array.from({ length: 42 }, (_, i) => i) },
          // Not an array → no borderEdges on the plan at all.
          { row: 12, col: 12, group: "near", faceDown: true, borderEdges: "nope" },
          // All-garbage list → property absent entirely.
          { row: 15, col: 15, group: "sea", faceDown: true, borderEdges: [99, -2, 3.3] }
        ]
      },
      1
    );
    expect(record!.tiles[0].borderEdges).toEqual([0, 13]);
    expect(record!.tiles[1].borderEdges!.length).toBe(30);
    expect(record!.tiles[1].borderEdges!.length).toBeLessThanOrEqual(30);
    expect(record!.tiles[2]).not.toHaveProperty("borderEdges");
    expect(record!.tiles[3]).not.toHaveProperty("borderEdges");
  });

  it("preserves a designer \"one of these tiles\" list round-trip; dedupes, drops garbage, skips starting", () => {
    // sanitizeTile rebuilds each plan from an allow-list, so `oneOfTileDefIds`
    // must be carried explicitly or a saved map loses its random-tile choice on
    // reload. Non-starting slots only; string ids, deduped.
    const record = sanitizeSharedMap(
      {
        id: "m",
        tiles: [
          { row: 9, col: 9, group: "far", faceDown: false, oneOfTileDefIds: ["F1", "F1", "F2", 3, null] },
          // Starting slots never carry a tile list → property absent.
          { row: 5, col: 5, group: "starting", faceDown: false, oneOfTileDefIds: ["F1"] },
          // Not an array → property absent.
          { row: 12, col: 12, group: "near", faceDown: true, oneOfTileDefIds: "nope" },
          // All-garbage list → property absent entirely.
          { row: 15, col: 15, group: "sea", faceDown: true, oneOfTileDefIds: [1, null, {}] },
          // A VALID FACE-DOWN one-of list (the "secret random tile from a list"
          // variant) must survive with faceDown intact — the sanitizer keeps
          // oneOfTileDefIds regardless of face-up/down (only starting strips it).
          { row: 20, col: 20, group: "far", faceDown: true, oneOfTileDefIds: ["F1", "F2"] }
        ]
      },
      1
    );
    expect(record!.tiles[0].oneOfTileDefIds).toEqual(["F1", "F2"]);
    expect(record!.tiles[1]).not.toHaveProperty("oneOfTileDefIds");
    expect(record!.tiles[2]).not.toHaveProperty("oneOfTileDefIds");
    expect(record!.tiles[3]).not.toHaveProperty("oneOfTileDefIds");
    expect(record!.tiles[4].faceDown).toBe(true);
    expect(record!.tiles[4].oneOfTileDefIds).toEqual(["F1", "F2"]);
  });

  it("falls back to the default scenario when the id is unknown", () => {
    const record = sanitizeSharedMap({ id: "m", scenarioId: "ghost", tiles: [] }, 1);
    expect(record!.scenarioId).toBe("skirmish");
  });

  it("rejects input that isn't a map (no tile array)", () => {
    expect(sanitizeSharedMap({ id: "m", name: "no tiles" }, 1)).toBeNull();
    expect(sanitizeSharedMap(null, 1)).toBeNull();
    expect(sanitizeSharedMap("string", 1)).toBeNull();
  });
});

describe("MapRegistry", () => {
  it("stores a map and lists it back", () => {
    const registry = new MapRegistry();
    registry.upsert(makeMap({ id: "a" }));
    expect(registry.list().map((m) => m.id)).toEqual(["a"]);
  });

  it("edits in place by id — saving the same id overwrites, never duplicates", () => {
    const registry = new MapRegistry();
    registry.upsert(makeMap({ id: "a", name: "First", players: 2, updatedAt: 1 }));
    registry.upsert(makeMap({ id: "a", name: "Edited", players: 4, updatedAt: 2 }));

    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Edited");
    expect(list[0].players).toBe(4);
  });

  it("deletes a map so it stops listing", () => {
    const registry = new MapRegistry();
    registry.upsert(makeMap({ id: "a" }));
    registry.upsert(makeMap({ id: "b" }));
    expect(registry.remove("a")).toBe(true);
    expect(registry.list().map((m) => m.id)).toEqual(["b"]);
    // Removing something already gone is a harmless false.
    expect(registry.remove("a")).toBe(false);
  });

  it("lists newest-saved first regardless of insertion order", () => {
    const registry = new MapRegistry();
    registry.upsert(makeMap({ id: "old", updatedAt: 100 }));
    registry.upsert(makeMap({ id: "new", updatedAt: 300 }));
    registry.upsert(makeMap({ id: "mid", updatedAt: 200 }));
    expect(registry.list().map((m) => m.id)).toEqual(["new", "mid", "old"]);
  });

  it("evicts the oldest-touched maps once it exceeds the cap", () => {
    const registry = new MapRegistry();
    // Fill to the cap, then add one more — the single oldest must fall out.
    for (let index = 0; index < MAX_STORED_MAPS; index += 1) {
      registry.upsert(makeMap({ id: `m${index}`, updatedAt: index + 1 }));
    }
    expect(registry.size).toBe(MAX_STORED_MAPS);
    registry.upsert(makeMap({ id: "fresh", updatedAt: MAX_STORED_MAPS + 1 }));
    expect(registry.size).toBe(MAX_STORED_MAPS);
    expect(registry.has("fresh")).toBe(true);
    expect(registry.has("m0")).toBe(false); // the oldest (updatedAt 1) was evicted
  });

  it("rehydrates from stored records (Durable Object / disk round-trip)", () => {
    const seed = [makeMap({ id: "a" }), makeMap({ id: "b" })];
    const registry = new MapRegistry(seed);
    expect(registry.list().map((m) => m.id).sort()).toEqual(["a", "b"]);
  });
});

describe("map ownership gate", () => {
  const owner: MapActor = { userId: "u_owner", role: "player" };
  const stranger: MapActor = { userId: "u_stranger", role: "player" };
  const admin: MapActor = { userId: "u_admin", role: "admin" };
  const guest: MapActor = { userId: null, role: null };

  describe("actorMayModifyMap", () => {
    it("lets anyone modify an UNOWNED map (legacy / guest / accounts-off save)", () => {
      const unowned = makeMap({ id: "u", createdByUserId: null });
      expect(actorMayModifyMap(unowned, owner)).toBe(true);
      expect(actorMayModifyMap(unowned, stranger)).toBe(true);
      expect(actorMayModifyMap(unowned, guest)).toBe(true);
    });

    it("lets only the OWNER or an ADMIN modify an owned map, never a stranger or guest", () => {
      const owned = makeMap({ id: "o", createdByUserId: "u_owner" });
      expect(actorMayModifyMap(owned, owner)).toBe(true);
      expect(actorMayModifyMap(owned, admin)).toBe(true);
      // The control that proves this is a real gate, not a blanket allow:
      expect(actorMayModifyMap(owned, stranger)).toBe(false);
      expect(actorMayModifyMap(owned, guest)).toBe(false);
    });

    it("treats a brand-new id (no existing record) as always allowed", () => {
      expect(actorMayModifyMap(undefined, guest)).toBe(true);
    });
  });

  describe("stampSavedMapOwnership", () => {
    it("stamps the actor as owner on a fresh CREATE", () => {
      const record = makeMap({ id: "new", createdByUserId: null });
      stampSavedMapOwnership(record, undefined, owner);
      expect(record.createdByUserId).toBe("u_owner");
    });

    it("PRESERVES the original owner + createdAt on an EDIT (an overwrite never transfers ownership)", () => {
      const existing = makeMap({ id: "e", createdByUserId: "u_owner", createdAt: 42 });
      // An admin editing must not steal ownership, and a re-mint must not change createdAt.
      const incoming = makeMap({ id: "e", createdByUserId: "u_admin", createdAt: 999 });
      stampSavedMapOwnership(incoming, existing, admin);
      expect(incoming.createdByUserId).toBe("u_owner");
      expect(incoming.createdAt).toBe(42);
    });
  });

  it("sanitizeSharedMap preserves a createdByUserId through save/load, else null", () => {
    const owned = sanitizeSharedMap(
      { id: "m", tiles: [], createdByUserId: "u_owner" },
      1
    );
    expect(owned!.createdByUserId).toBe("u_owner");
    const legacy = sanitizeSharedMap({ id: "m", tiles: [] }, 1);
    expect(legacy!.createdByUserId).toBeNull();
  });
});
