"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * The setup SUMMARY RAIL — a compact, half-transparent panel pinned to the
 * RIGHT of the map-setup scene. It shows all four boxes' LIVE choices
 * (Game mode · Heroes & Draft · Map · Advanced settings) so a player reads the
 * whole table setup at a glance without opening a window, and each chip is one
 * click straight into that box.
 *
 * It replaced the per-window "cross-window strip": on the painted setup scene
 * the boxes show only their titles (`.setupHubBoxSummary` is hidden), so the
 * consolidated summary used to be reachable ONLY by opening a popup. Values come
 * from `setupHubNavItems`, the same pure derivation the boxes render, so the
 * rail can never disagree with them. Pure presentation: it dispatches nothing
 * but the box-open callback.
 */
import { assetUrl } from "@/lib/asset-url";
import { SETUP_HUB_ICONS } from "@/data/assets/homm-assets";
import type { GameState, PlayerId } from "@/engine";
import { setupHubNavItems, type SetupHubBoxId } from "./setup-hub-summary";

export function SetupSummaryRail({
  state,
  viewerPlayerId,
  onOpen
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  /** Open a box's window (the chip is a shortcut into it). */
  onOpen: (box: SetupHubBoxId) => void;
}) {
  const items = setupHubNavItems(state, viewerPlayerId);
  if (items.length === 0) {
    return null;
  }
  return (
    <aside className="setupSummaryRail" aria-label="Your setup so far">
      <span className="setupSummaryRailTitle" aria-hidden="true">
        Your setup
      </span>
      {items.map((item) => {
        const full = item.detail ? `${item.title}: ${item.value} — ${item.detail}` : `${item.title}: ${item.value}`;
        return (
          <button
            // Hyphenated short forms keep each chip's accessible name unique and
            // distinct from the same-named hub box / mode-card buttons.
            aria-label={`Change the ${SETUP_SUMMARY_ARIA[item.id]} box`}
            className="setupHubNavItem"
            key={item.id}
            onClick={() => onOpen(item.id)}
            title={full}
            type="button"
          >
            <img
              alt=""
              aria-hidden="true"
              className="setupHubNavIcon"
              decoding="async"
              src={assetUrl(SETUP_HUB_ICONS[item.id])}
            />
            <span className="setupHubNavText">
              <small>{item.title}</small>
              <strong>{item.value}</strong>
              {item.detail ? <em>{item.detail}</em> : null}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

/** Hyphenated/short forms so the rail's buttons keep unique accessible names. */
const SETUP_SUMMARY_ARIA: Record<SetupHubBoxId, string> = {
  mode: "Game-mode",
  heroes: "Heroes",
  map: "Map",
  advanced: "Advanced"
};
