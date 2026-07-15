import type { ConnectionQualitySample } from "@/lib/realtime";

/**
 * Connection-quality chip (plan: partykit-network-upgrade slice N3): shows the
 * player the transport's measured round-trip beside the sync status, so
 * "laggy" reports become diagnosable instead of invisible. Read-only
 * presentation — no threshold here may ever gate behaviour. Samples arrive
 * from RoomConnectionHandlers.onQuality (health pongs + action acks) and work
 * with metric sampling off.
 */

export type ConnectionQualityTier = "good" | "fair" | "poor";

export function connectionQualityTier(rttMs: number): ConnectionQualityTier {
  if (rttMs < 150) {
    return "good";
  }
  if (rttMs < 400) {
    return "fair";
  }
  return "poor";
}

/**
 * Display value rounded to a 10 ms step: honest at a glance, and stable enough
 * that per-ack jitter doesn't re-render the chip on every sample (the page
 * keeps the previous state object when the display would not change — see
 * retainQualitySample).
 */
export function formatQualityMs(rttMs: number): number {
  return Math.max(10, Math.round(rttMs / 10) * 10);
}

/**
 * State reducer for the chip: returns `prev` (same reference, so React skips
 * the re-render) when the new sample would display identically, else `next`.
 * A sample without a measured rtt never overwrites a real one.
 */
export function retainQualitySample(
  prev: ConnectionQualitySample | null,
  next: ConnectionQualitySample
): ConnectionQualitySample | null {
  if (next.rttMs === undefined) {
    return prev;
  }
  if (
    prev?.rttMs !== undefined &&
    formatQualityMs(prev.rttMs) === formatQualityMs(next.rttMs) &&
    connectionQualityTier(prev.rttMs) === connectionQualityTier(next.rttMs)
  ) {
    return prev;
  }
  return next;
}

export function ConnectionQualityChip({ sample }: { sample: ConnectionQualitySample | null }) {
  if (!sample || sample.rttMs === undefined) {
    return null;
  }
  const tier = connectionQualityTier(sample.rttMs);
  return (
    <span
      className={`connectionQualityChip quality-${tier}`}
      title={`Game room responds in ~${formatQualityMs(sample.rttMs)} ms. The room lives near its creator — distant players see higher numbers.`}
    >
      <span aria-hidden="true" className="qualityDot" />
      {formatQualityMs(sample.rttMs)} ms
    </span>
  );
}
