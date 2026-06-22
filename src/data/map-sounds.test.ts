import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import soundManifest from "../../public/sounds/manifest.json";
import { ADVENTURE_FEED_CUES } from "../components/adventure/screen";
import { MAP_CUE_SOUNDS } from "./map-sounds";

const library = soundManifest as Record<string, { src?: string; random?: string[] }>;

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
      const file = fileURLToPath(new URL(`../../public${src}`, import.meta.url));
      expect(existsSync(file), `${src} should exist on disk`).toBe(true);
    }
  });

  it("keeps the during-combat theme separate from the battle-start stings", () => {
    // combat-02 is the looping in-combat music; it is not one of the start pool.
    const members = library["music/battle"].random ?? [];
    expect(members).not.toContain("music/combat-02");
  });
});
