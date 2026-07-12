type MetricFields = Record<string, string | number | boolean | null | undefined>;

export type PerformanceMetric = {
  name: string;
  at: number;
  durationMs?: number;
  fields?: MetricFields;
};

const sampleRate = Math.max(0, Math.min(1, Number(process.env.NEXT_PUBLIC_PERFORMANCE_METRICS_SAMPLE_RATE ?? 0)));
const sampled = sampleRate > 0 && Math.random() < sampleRate;

/** Privacy-safe sampled metrics primitive. Disabled by default and never throws into gameplay. */
export function recordPerformanceMetric(metric: PerformanceMetric): void {
  if (!sampled) return;
  try {
    globalThis.dispatchEvent?.(new CustomEvent("homm3bg:performance", { detail: metric }));
  } catch {
    // Metrics are strictly best effort.
  }
}

export function metricNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function measurePerformance<T>(name: string, fields: MetricFields, work: () => T): T {
  const start = metricNow();
  try {
    return work();
  } finally {
    recordPerformanceMetric({ name, at: start, durationMs: metricNow() - start, fields });
  }
}

export function frameBytes(value: string | ArrayBuffer | ArrayBufferView): number {
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
  return value instanceof ArrayBuffer ? value.byteLength : value.byteLength;
}

export function observeBrowserResponsiveness(): () => void {
  if (!sampled || typeof PerformanceObserver === "undefined") return () => {};
  const observers: PerformanceObserver[] = [];
  try {
    const longTasks = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordPerformanceMetric({ name: "browser.long-task", at: entry.startTime, durationMs: entry.duration });
      }
    });
    longTasks.observe({ type: "longtask", buffered: true });
    observers.push(longTasks);
  } catch {}
  try {
    const events = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordPerformanceMetric({ name: "browser.input", at: entry.startTime, durationMs: entry.duration });
      }
    });
    events.observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
    observers.push(events);
  } catch {}
  return () => observers.forEach((observer) => observer.disconnect());
}
