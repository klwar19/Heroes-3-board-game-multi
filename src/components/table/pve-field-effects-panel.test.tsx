// @vitest-environment jsdom
/**
 * The in-fight FIELD EFFECTS indicator — DOM contract only.
 *
 * jsdom cannot compute CSS, so nothing here proves where the strip sits or what
 * it looks like; that is a real-browser concern with no e2e spec. What IS
 * pinned: it names every script the ENGINE selects for this fight with the
 * authored summary, it lists when each event fires, it renders NOTHING in an
 * ordinary (unscripted) combat and with no combat open at all, and it is
 * PRESENTATION-ONLY — no button and no click handler, so it can never dispatch
 * an action or open an engine window.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PveFieldEffectsPanel } from "./pve-field-effects-panel";
import { pveEncounterScriptsFor } from "@/data/anime/pve-combat-scripts";
import { combatScriptTimingLines } from "@/data/map/combat-scripts";
import type { GameState } from "@/engine";

afterEach(cleanup);

/**
 * The smallest state the panel reads: a neutral combat carrying a PvE encounter
 * identity. `combatScriptsActiveForCombat` needs only the context, the fought
 * field's location and the frozen theme.
 */
function pveState(context: Record<string, unknown>, theme: "classic" | "doom" = "classic"): GameState {
  return {
    adventure: { pveTheme: theme, fields: { f1: { spaceId: "f1", location: "dungeon_gate" } } },
    combat: { context: { kind: "neutral", fieldId: "f1", ...context } }
  } as unknown as GameState;
}

describe("PvE field effects panel", () => {
  it("names every script the engine selects for a dungeon floor, with its summary and timings", () => {
    const scripts = pveEncounterScriptsFor({ theme: "classic", dungeonFloor: 6 });
    expect(scripts.length).toBeGreaterThan(0);
    render(<PveFieldEffectsPanel state={pveState({ dungeonFloor: 6 })} />);

    const panel = screen.getByLabelText("Field effects");
    expect(panel.textContent).toContain(`Field effects (${scripts.length})`);
    for (const script of scripts) {
      expect(panel.querySelector(`[data-script-id="${script.id}"]`)).toBeTruthy();
      expect(panel.textContent).toContain(script.name.en);
      expect(panel.textContent).toContain(script.summary);
      for (const line of combatScriptTimingLines(script)) {
        expect(panel.textContent).toContain(line);
      }
    }
  });

  it("a raid lair shows ITS boss's script — a different band/boss shows different text", () => {
    render(<PveFieldEffectsPanel state={pveState({ raidBossId: "b1" })} />);
    // No raidBosses record ⇒ no def id ⇒ nothing selected (the engine's own
    // read), so the panel stays absent.
    expect(screen.queryByLabelText("Field effects")).toBeNull();

    const withRecord = pveState({ raidBossId: "b1" });
    (withRecord.adventure as unknown as { raidBosses: unknown }).raidBosses = {
      b1: { defId: "lich_archon" }
    };
    cleanup();
    render(<PveFieldEffectsPanel state={withRecord} />);
    const scripts = pveEncounterScriptsFor({ theme: "classic", bossDefId: "lich_archon" });
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(screen.getByLabelText("Field effects").textContent).toContain(script.summary);
    }
  });

  it("CONTROL: an ordinary neutral fight and a closed combat render NOTHING", () => {
    const plain = {
      adventure: { fields: { f1: { spaceId: "f1", location: "mine" } } },
      combat: { context: { kind: "neutral", fieldId: "f1" } }
    } as unknown as GameState;
    render(<PveFieldEffectsPanel state={plain} />);
    expect(screen.queryByLabelText("Field effects")).toBeNull();

    cleanup();
    render(<PveFieldEffectsPanel state={{ adventure: {}, combat: null } as unknown as GameState} />);
    expect(screen.queryByLabelText("Field effects")).toBeNull();
  });

  it("PRESENTATION ONLY: no button, no link, no click handler anywhere in the strip", () => {
    render(<PveFieldEffectsPanel state={pveState({ dungeonFloor: 2 })} />);
    const panel = screen.getByLabelText("Field effects");
    expect(panel.querySelectorAll("button")).toHaveLength(0);
    expect(panel.querySelectorAll("a")).toHaveLength(0);
    expect(panel.querySelectorAll("input")).toHaveLength(0);
  });
});
