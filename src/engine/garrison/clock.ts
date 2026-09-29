/**
 * Garrison simulation clock: shared by the Garrison Wars content and the
 * Order & Chaos roster (kept apart so the roster can load without a cycle).
 */

export const GW_TPS = 20;
export const GW_TICK_MS = 1000 / GW_TPS;

/** Seconds -> ticks. */
export const sec = (s: number): number => Math.round(s * GW_TPS);
/** "One tile every `s` seconds" -> tiles per tick. */
export const pace = (s: number): number => 1 / (s * GW_TPS);
