"use client";

import type { GameState } from "@/engine";
import { combatScriptsActiveForCombat } from "@/engine";
import { combatScriptTimingLines } from "@/data/map/combat-scripts";

/**
 * In-fight FIELD EFFECTS indicator (dungeon/raid-boss variant expansion §E
 * presentation). A scripted battle — a Dungeon floor band, a Rift Lair, or one
 * of the two Bí Cảnh location scripts — silently changes stats, drops obstacles
 * and pulses damage; the only trace was a feed line that scrolls away. This
 * always-visible strip names every active script with its authored `summary`
 * and, once expanded, when each of its events fires.
 *
 * PURE PRESENTATION: it derives from `combatScriptsActiveForCombat` (the SAME
 * read the engine fires from) and dispatches nothing — the disclosure is a
 * native `<details>`, so no engine window exists and no AI/AFK seat can stall.
 * It renders NOTHING when the fight carries no scripts, so an ordinary combat is
 * untouched.
 */
export function PveFieldEffectsPanel({ compact, state }: { compact?: boolean; state: GameState }) {
  const combat = state.combat;
  const scripts = combat ? combatScriptsActiveForCombat(state, combat) : [];
  if (scripts.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Field effects"
      className={`pveFieldEffectsPanel artifactSetPanel${compact ? " compact" : ""}`}
    >
      <div className="trayBoxHeader">
        <strong>Field effects ({scripts.length})</strong>
      </div>
      {scripts.map((script) => (
        <details className="pveFieldEffect" data-script-id={script.id} key={script.id}>
          <summary>
            <strong>{script.name.en}</strong> — {script.summary}
          </summary>
          <ul className="pveFieldEffectTiming">
            {combatScriptTimingLines(script).map((line) => (
              <li key={line}>
                <small>{line}</small>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
