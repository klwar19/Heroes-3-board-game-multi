/**
 * Drives a Garrison Wars simulation in real time: a fixed-step loop, a queue
 * of this browser's commands and (optionally) computer opponents. The online
 * lockstep driver (src/lib/garrison-net.ts) implements the same interface.
 */

import { GW_TICK_MS } from "@/engine/garrison/content";
import { createGarrison, stepGarrison, type GarrisonConfig, type GarrisonEvent, type GarrisonState, type Side, type SidedCommand } from "@/engine/garrison/sim";
import type { GarrisonAi } from "@/engine/garrison/ai";

export type PumpResult = { events: GarrisonEvent[]; alpha: number };

export type GarrisonDriver = {
  state(): GarrisonState;
  /** Sides a human at this browser controls. */
  readonly local: readonly Side[];
  submit(cmd: SidedCommand): void;
  pump(dtMs: number, paused: boolean, speed: number): PumpResult;
  /** Pause / speed-up are local-only (not online). */
  readonly canPause: boolean;
  /** Online connection line for the HUD, or null. */
  status(): string | null;
  dispose(): void;
};

const MAX_STEPS = 10;

/** `from`: carry on a saved battle (Order & Chaos suspended runs) instead of starting `config` afresh. */
export function createLocalDriver(config: GarrisonConfig, local: readonly Side[], ai: { def?: GarrisonAi; atk?: GarrisonAi }, from?: GarrisonState): GarrisonDriver {
  const state = from ?? createGarrison(config);
  let queue: SidedCommand[] = [];
  let acc = 0;
  return {
    state: () => state,
    local,
    canPause: true,
    submit(cmd) {
      if (local.includes(cmd.by)) queue.push(cmd);
    },
    pump(dtMs, paused, speed) {
      const events: GarrisonEvent[] = [];
      if (!paused && !state.outcome) acc += Math.min(250, dtMs) * speed;
      let steps = 0;
      while (acc >= GW_TICK_MS && steps < MAX_STEPS && !state.outcome) {
        const commands = queue;
        queue = [];
        if (ai.def) commands.push(...ai.def(state));
        if (ai.atk) commands.push(...ai.atk(state));
        stepGarrison(state, commands);
        if (state.events.length) events.push(...state.events);
        acc -= GW_TICK_MS;
        steps += 1;
      }
      if (steps >= MAX_STEPS) acc = Math.min(acc, GW_TICK_MS);
      if (state.outcome) acc = 0;
      return { events, alpha: Math.max(0, Math.min(1, acc / GW_TICK_MS)) };
    },
    status: () => null,
    dispose() {
      queue = [];
    }
  };
}
