import { readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { driveComputerPlayers } from "../src/server/computer-runner";
import { pickHumanAction } from "../src/server/single-player-soak-helpers";
import { applyAction } from "../src/engine/reducer";
import type { GameState } from "../src/engine/state";
it.each(["dungeon", "tower", "stronghold"])("%s resumes an earned Gold army and gains another hero level", faction => {
  let state: GameState = JSON.parse(readFileSync(`artifacts/town-game-${faction}-pvp-growth-review-state.json`, "utf8"));
  const initialLevel = state.heroes.hero_p2.level;
  const lastRound = state.round + 6;
  const trail: unknown[] = [];
  for (let step = 0; step < 1500 && state.round <= lastRound && state.heroes.hero_p2.level <= initialLevel; step++) {
    if (state.phase === "game-over" && !state.combat) break;
    const result = driveComputerPlayers(state, undefined, { maxSteps: 1 });
    for (const d of result.decisions) trail.push({ round: state.round, action: d.action, policy: d.policy });
    state = result.state;
    if (!result.decisions.length) {
      const action = pickHumanAction(state);
      expect(action).not.toBeNull();
      const next = applyAction(state, action!);
      expect(next.errors).toEqual([]);
      state = next.state;
    }
  }
  const suffix = process.env.PVP_GROWTH_MUTATION ?? "current";
  writeFileSync(`artifacts/pvp-growth-progression-${faction}-${suffix}.json`, JSON.stringify({ initialLevel,
    level: state.heroes.hero_p2.level, round: state.round, trail }, null, 2));
  writeFileSync(`artifacts/pvp-growth-progression-${faction}-${suffix}-state.json`, JSON.stringify(state));
  expect(state.heroes.hero_p2.level).toBeGreaterThan(initialLevel);
});
