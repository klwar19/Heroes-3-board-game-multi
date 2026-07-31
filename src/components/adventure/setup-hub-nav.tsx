"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * The cross-window strip every Setup Hub window shows above its own controls:
 * all four boxes (Game mode · Heroes & Draft · Map · Advanced settings) with
 * their LIVE value, the current window marked "you are here", the other three
 * one click away.
 *
 * It exists because the four windows edit ONE shared `setupLobby.options`, but
 * a player inside a window could not see the choices the other windows own —
 * the map they picked, the mode, the difficulty — so the boxes read as four
 * unconnected screens. Values come from `setupHubNavItems`, the same pure
 * derivation the boxes themselves render, so the strip can never disagree with
 * them. Pure presentation: it dispatches nothing, it only switches windows.
 */
import { assetUrl } from "@/lib/asset-url";
import { SETUP_HUB_ICONS } from "@/data/assets/homm-assets";
import type { GameState, PlayerId } from "@/engine";
import { setupHubNavItems, type SetupHubBoxId } from "./setup-hub-summary";

export function SetupHubNav({
  state,
  viewerPlayerId,
  current,
  onOpen
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  /** The box whose window is showing this strip. */
  current: SetupHubBoxId;
  onOpen: (box: SetupHubBoxId) => void;
}) {
  const items = setupHubNavItems(state, viewerPlayerId);
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="setupHubNav setupHubSummaryRail" role="group" aria-label="Setup so far">
      {items.map((item) => {
        const here = item.id === current;
        const full = item.detail ? `${item.title}: ${item.value} — ${item.detail}` : `${item.title}: ${item.value}`;
        const body = (
          <>
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
          </>
        );
        return here ? (
          <span aria-current="true" className="setupHubNavItem here" key={item.id} title={full}>
            {body}
          </span>
        ) : (
          <button
            // Deliberately NOT the box's own wording: this label must not collide
            // with the hub box / mode-card buttons of the same name.
            aria-label={`Switch to the ${SETUP_HUB_NAV_ARIA[item.id]} box`}
            className="setupHubNavItem"
            key={item.id}
            onClick={() => onOpen(item.id)}
            title={full}
            type="button"
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/** Hyphenated/short forms so the strip's buttons keep unique accessible names. */
const SETUP_HUB_NAV_ARIA: Record<SetupHubBoxId, string> = {
  mode: "Game-mode",
  heroes: "Heroes",
  map: "Map",
  advanced: "Advanced"
};
