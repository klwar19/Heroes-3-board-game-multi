"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { uiArtSlot, type UiArtSlotId } from "@/data/ui-art";
import { assetUrl } from "@/lib/asset-url";

export type PreloadProgress = {
  loaded: number;
  total: number;
  done: boolean;
};

/**
 * Preload the images behind the given art slots and report real progress
 * (resolved / total). Failures count as resolved — a missing file must never
 * stall the loading bar, it just renders broken later where it is used.
 * An empty manifest is immediately `done`.
 */
export function usePreloadAssets(slotIds: readonly UiArtSlotId[]): PreloadProgress {
  // One stable key per manifest, so callers may pass a fresh array literal on
  // every render without restarting the preload.
  const key = slotIds.join("|");
  const [progress, setProgress] = useState<{ key: string; loaded: number }>({ key, loaded: 0 });
  if (progress.key !== key) {
    // Manifest changed: restart the count. State-adjust-during-render (the
    // React "derive state from props" pattern) — not a setState in the effect
    // body, which the repo lint forbids.
    setProgress({ key, loaded: 0 });
  }

  useEffect(() => {
    if (!key) {
      return;
    }
    const ids = key.split("|") as UiArtSlotId[];
    let cancelled = false;
    const bump = () => {
      if (!cancelled) {
        setProgress((prev) => (prev.key === key ? { key, loaded: prev.loaded + 1 } : prev));
      }
    };
    const images = ids.map((id) => {
      const image = new window.Image();
      image.onload = bump;
      image.onerror = bump;
      image.src = assetUrl(uiArtSlot(id).src);
      return image;
    });
    return () => {
      cancelled = true;
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [key]);

  const total = slotIds.length;
  const loaded = progress.key === key ? Math.min(progress.loaded, total) : 0;
  return { loaded, total, done: loaded >= total };
}

/**
 * Full-screen themed loading screen (expansion plan §D7): backdrop art slot,
 * H3-flavored progress bar with REAL progress (the preload manifest), and a
 * status line for transport sync state. Replaces the old plain-text
 * "Joining room…" block; also shown while the landing redirect resolves.
 *
 * With an empty manifest the bar renders indeterminate (shimmer) — there is
 * nothing measurable to report, only the status line.
 */
export function LoadingScreen({
  title,
  status,
  tip,
  backdrop = "loading-backdrop",
  preloadSlots = []
}: {
  title: string;
  /** Transport/sync status line, e.g. "connecting" / "synced v12". */
  status?: string | null;
  /** Rotating flavor tip (Phase 3 supplies real tips). */
  tip?: string;
  backdrop?: UiArtSlotId;
  /** Art slots to preload; drives the progress bar. */
  preloadSlots?: readonly UiArtSlotId[];
}) {
  const progress = usePreloadAssets(preloadSlots);
  const determinate = progress.total > 0;
  const percent = determinate ? Math.round((progress.loaded / progress.total) * 100) : 0;
  const art = uiArtSlot(backdrop);
  const brand = uiArtSlot("game-logo");

  return (
    <main className="menuShellRoot loadingScreenRoot">
      <img alt="" aria-hidden className="menuShellBackdrop" src={assetUrl(art.src)} />
      <div aria-hidden className="menuShellVignette" />
      <div className="menuShellContent">
        <img alt={brand.alt} className="menuGameLogo" src={assetUrl(brand.src)} />
        <section className="menuShellPanel loadingPanel">
          <h1 className="loadingTitle" suppressHydrationWarning>
            {title}
          </h1>
          <div
            aria-label="Loading progress"
            aria-valuemax={100}
            aria-valuemin={0}
            {...(determinate ? { "aria-valuenow": percent } : {})}
            className={`loadingBar${determinate ? "" : " indeterminate"}`}
            role="progressbar"
          >
            <div className="loadingBarFill" style={determinate ? { width: `${percent}%` } : undefined} />
          </div>
          {determinate ? (
            <p className="loadingCount">
              {progress.loaded} / {progress.total} assets
            </p>
          ) : null}
          {status ? (
            <p className="loadingStatus" suppressHydrationWarning>
              {status}
            </p>
          ) : null}
          {tip ? <p className="loadingTip">{tip}</p> : null}
        </section>
      </div>
    </main>
  );
}
