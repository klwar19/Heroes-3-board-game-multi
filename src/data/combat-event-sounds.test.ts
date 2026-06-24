import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import soundManifest from "../../public/sounds/manifest.json";
import { COMBAT_EVENT_SOUNDS } from "./combat-event-sounds";

const library = soundManifest as Record<string, { src?: string }>;

describe("combat-event sounds", () => {
  it("rings the rune cue when a Bulwark army reaches a Rune Level", () => {
    expect(COMBAT_EVENT_SOUNDS.RUNE_LEVEL_REACHED).toBe("effects/rune");
  });

  it("every combat-event sound resolves to a real clip on disk", () => {
    const entries = Object.entries(COMBAT_EVENT_SOUNDS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [event, key] of entries) {
      const src = library[key!]?.src;
      expect(src, `${event} -> ${key} should have a src`).toBeTruthy();
      const file = fileURLToPath(new URL(`../../public${src}`, import.meta.url));
      expect(existsSync(file), `${src} should exist on disk`).toBe(true);
    }
  });
});
