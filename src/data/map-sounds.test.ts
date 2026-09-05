import { describe, expect, it } from "vitest";
import { hasMediaFile } from "@/lib/media-manifest";
import soundManifest from "../../public/sounds/manifest.json";
import { ADVENTURE_FEED_CUES } from "../components/adventure/screen";
import {
  heroMoveSoundKey,
  LOCATION_VISIT_SOUNDS,
  locationVisitSoundCue,
  locationVisitSoundKeys,
  MAP_CUE_SOUNDS,
  MAP_TELEPORT_SOUNDS,
  TERRAIN_MOVE_SOUNDS,
  type MapTeleportKind
} from "./map-sounds";

const library = soundManifest as Record<string, { src?: string; random?: string[] }>;

function assertClipOnDisk(key: string): void {
  const src = library[key]?.src;
  expect(src, `${key} should be in the manifest`).toBeTruthy();
  expect(hasMediaFile(src!), `${src} should be a published clip (run: npm run media:publish)`).toBe(true);
}

function visitSfx(location: string): string {
  const entry = LOCATION_VISIT_SOUNDS[location];
  return typeof entry === "string" ? entry : entry.sfx;
}

describe("heroMoveSoundKey (map teleports)", () => {
  it("uses VCMI visit clips: TELPTOUT / DANGER / CAVEHEAD (not ambient loops)", () => {
    // Source of truth: github.com/vcmi/vcmi config/objects/*.json "sounds.visit"
    //   monolithOneWayEntrance / monolithTwoWay → ["TELPTOUT"]
    //   whirlpool → ["DANGER"]
    //   subterraneanGate → ["CAVEHEAD"]
    // H3 archive names → our library (docs/h3-sound-reference.csv + convert-h3-sounds.mjs):
    //   TELPTOUT → spells/teleport
    //   DANGER   → effects/danger
    //   CAVEHEAD → adventure/cave-visit
    // NOT used for travel: TELEIN (adventure/teleport), LOOPMON*, LOOPWHIR, LOOPGATE.
    expect(MAP_TELEPORT_SOUNDS).toEqual({
      monolith: "spells/teleport",
      gate: "spells/teleport",
      whirlpool: "effects/danger",
      subterranean: "adventure/cave-visit",
      spell: "spells/teleport"
    });
    expect(heroMoveSoundKey([{ teleport: "monolith" }], "grass")).toBe("spells/teleport");
    expect(heroMoveSoundKey([{ teleport: "gate" }], "dirt")).toBe("spells/teleport");
    expect(heroMoveSoundKey([{ teleport: "whirlpool" }], "water")).toBe("effects/danger");
    expect(heroMoveSoundKey([{ teleport: "subterranean" }], "subterranean")).toBe("adventure/cave-visit");
    expect(heroMoveSoundKey([{ teleport: "spell" }], "grass")).toBe("spells/teleport");
  });

  it("CONTROL: ordinary adjacent walks still use the destination terrain horse", () => {
    expect(heroMoveSoundKey([{}], "grass")).toBe(TERRAIN_MOVE_SOUNDS.grass);
    expect(heroMoveSoundKey([{ teleport: false }], "lava")).toBe(TERRAIN_MOVE_SOUNDS.lava);
    expect(heroMoveSoundKey([], "snow")).toBe(TERRAIN_MOVE_SOUNDS.snow);
  });

  it("every mapped teleport clip exists on disk", () => {
    const kinds = Object.keys(MAP_TELEPORT_SOUNDS) as MapTeleportKind[];
    for (const kind of kinds) {
      assertClipOnDisk(MAP_TELEPORT_SOUNDS[kind]);
    }
  });
});

describe("LOCATION_VISIT_SOUNDS (sfx first, optional ambient after)", () => {
  it("visit sfx is never an ambient/* loop (ambient is the second track)", () => {
    for (const loc of Object.keys(LOCATION_VISIT_SOUNDS)) {
      const sfx = visitSfx(loc);
      expect(sfx.startsWith("ambient/"), `${loc} sfx must not be ambient ${sfx}`).toBe(false);
    }
  });

  it("plays VCMI visit one-shot first, then keeps ambient loops (e.g. water wheel)", () => {
    expect(visitSfx("subterranean_gate")).toBe("adventure/cave-visit");
    expect(locationVisitSoundKeys("subterranean_gate")).toEqual([
      "adventure/cave-visit",
      "ambient/subterranean-gate"
    ]);
    expect(locationVisitSoundKeys("water_wheel")).toEqual(["units/genie-special", "ambient/mill"]);
    expect(locationVisitSoundKeys("windmill")).toEqual(["units/genie-special", "ambient/windmill"]);
    expect(visitSfx("tavern")).toBe("adventure/store");
    expect(locationVisitSoundKeys("tavern")).toEqual(["adventure/store", "ambient/tavern"]);
    expect(visitSfx("redwood_observatory")).toBe("adventure/lighthouse");
    expect(locationVisitSoundKeys("redwood_observatory")).toEqual(["adventure/lighthouse"]);
    expect(visitSfx("shipwreck_survivor")).toBe("adventure/treasure");
  });

  it("locationVisitSoundCue keeps the sfx/ambient PAIRED so ambience can chain after the sfx ends", () => {
    // The feed player consumes the pair (not the flat list) so it can start the
    // map-object ambience only once the one-shot has ENDED — see showFeedItems.
    expect(locationVisitSoundCue("tavern")).toEqual({ sfx: "adventure/store", ambient: "ambient/tavern" });
    expect(locationVisitSoundCue("windmill")).toEqual({ sfx: "units/genie-special", ambient: "ambient/windmill" });
    // Legacy string entries: sfx only, no ambient half.
    expect(locationVisitSoundCue("redwood_observatory")).toEqual({ sfx: "adventure/lighthouse" });
    expect(locationVisitSoundCue("no_such_location")).toBeNull();
  });

  it("every location sfx/ambient clip exists on disk", () => {
    for (const loc of Object.keys(LOCATION_VISIT_SOUNDS)) {
      for (const key of locationVisitSoundKeys(loc)) {
        expect(library[key], `${loc} → ${key}`).toBeTruthy();
        if (library[key].src) {
          assertClipOnDisk(key);
        }
      }
    }
  });
});

describe("battle-begin cue", () => {
  it("fires when a battle starts (neutral or player combat)", () => {
    expect(ADVENTURE_FEED_CUES.NEUTRAL_COMBAT_STARTED?.cue).toBe("battle-begin");
    expect(ADVENTURE_FEED_CUES.PLAYER_COMBAT_STARTED?.cue).toBe("battle-begin");
  });

  it("does NOT hijack non-start combat events", () => {
    // War-machine / fortification events keep their own cue, so randomising the
    // battle-start sting can't bleed onto them.
    expect(ADVENTURE_FEED_CUES.WAR_MACHINE_TRIGGERED?.cue).toBe("combat-start");
    expect(ADVENTURE_FEED_CUES.FORTIFICATION_DESTROYED?.cue).toBe("combat-start");
  });

  it("randomises among the eight H3 battle-start stings (battle-00..07)", () => {
    const poolKey = MAP_CUE_SOUNDS["battle-begin"];
    expect(poolKey).toBe("music/battle");

    const members = library[poolKey!].random ?? [];
    expect(members).toEqual([
      "music/battle-00",
      "music/battle-01",
      "music/battle-02",
      "music/battle-03",
      "music/battle-04",
      "music/battle-05",
      "music/battle-06",
      "music/battle-07"
    ]);

    // Every member resolves to a real clip on disk.
    for (const member of members) {
      const src = library[member]?.src;
      expect(src, `${member} should have a src`).toBeTruthy();
      expect(hasMediaFile(src!), `${src} should be a published clip (run: npm run media:publish)`).toBe(true);
    }
  });

  it("keeps the during-combat theme separate from the battle-start stings", () => {
    // combat-02 is the looping in-combat music; it is not one of the start pool.
    const members = library["music/battle"].random ?? [];
    expect(members).not.toContain("music/combat-02");
  });
});
