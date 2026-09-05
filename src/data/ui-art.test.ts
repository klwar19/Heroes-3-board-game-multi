import { describe, expect, it } from "vitest";
import { hasMediaFile } from "@/lib/media-manifest";
import { UI_ART_SLOTS, uiArtSlot } from "./ui-art";
import { GAME_SERVERS } from "./servers";

/**
 * The art-slot registry is the ONE place pre-game visuals are wired
 * (expansion plan §D7). A slot whose src does not exist on disk would render
 * a broken image on the menu/lobby/loading screens, so the registry is pinned
 * to the real /public tree.
 */
describe("UI art slots", () => {
  it("every slot's src points at a published media file", () => {
    for (const [id, slot] of Object.entries(UI_ART_SLOTS)) {
      expect(slot.src.startsWith("/"), `${id} src must be root-relative`).toBe(true);
      expect(
        hasMediaFile(slot.src),
        `${id} → ${slot.src} is unpublished (run: npm run media:publish)`
      ).toBe(true);
      expect(slot.alt.trim().length, `${id} needs alt text`).toBeGreaterThan(0);
      expect(slot.size.trim().length, `${id} needs a target-size note for replacement art`).toBeGreaterThan(0);
    }
  });

  it("uiArtSlot resolves a slot by id", () => {
    expect(uiArtSlot("menu-backdrop").src).toBe(UI_ART_SLOTS["menu-backdrop"].src);
  });

  it("every game server's emblem slot exists in the registry", () => {
    for (const server of GAME_SERVERS) {
      expect(UI_ART_SLOTS[server.emblemSlot], `${server.id} emblem slot`).toBeTruthy();
    }
  });

  it("exactly one open server (Erathia) ships in Phase 0", () => {
    expect(GAME_SERVERS.filter((server) => server.open).map((server) => server.id)).toEqual(["erathia"]);
  });
});
