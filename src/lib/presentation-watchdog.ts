export const DEFAULT_MAX_PRESENTATION_MS = 20_000;

export function presentationWatchdogDelay(
  startedAt: number,
  now: number,
  maximumMs = DEFAULT_MAX_PRESENTATION_MS
): number {
  return Math.max(0, maximumMs - Math.max(0, now - startedAt));
}
