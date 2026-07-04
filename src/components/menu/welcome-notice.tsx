"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Check, ScrollText, Sparkles, X } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";

/**
 * One-time welcome notice shown when a player lands on the main menu — a framed
 * "heroes notice" that says this is a FAN-MADE Heroes III board game by BINH and
 * that it layers optional house rules you can toggle in each game's setup.
 *
 * Shown once per browser session by default (a sessionStorage flag), so it
 * greets you on login/entry but does not nag on every menu visit. "Don't show
 * again" persists a localStorage opt-out. Both storages are read defensively so
 * SSR / private-mode never throws.
 */
const SESSION_KEY = "binh-welcome-seen";
const DISMISS_KEY = "binh-welcome-dismissed";

/** A few of the house-rule highlights, kept in sync with the setup registry in spirit. */
const HIGHLIGHTS: { label: string; detail: string }[] = [
  { label: "Split Spell & Artifact decks", detail: "Basic/Expert magic and Minor/Major/Relic artifacts, gated by level and map." },
  { label: "Unit buffs", detail: "Griffins and Marksmen hit harder; Sandro's skeletons are tougher." },
  { label: "Hero & ability tweaks", detail: "Gelu's Sharpshooters, expert Wisdom, nerfed Estates, buffed Ballistics." },
  { label: "Optional modes", detail: "Spell Book, Creature Banks, Event deck, parallel turns and the WOG module." }
];

export function WelcomeNotice() {
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") {
        return;
      }
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
      setOpen(true);
    } catch {
      // Storage unavailable (SSR / private mode): show the greeting this once.
      setOpen(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) {
    return null;
  }

  const close = () => {
    if (dontShow) {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // ignore storage failures — the session flag still suppresses repeats
      }
    }
    setOpen(false);
  };

  return (
    <div className="welcomeBackdrop" role="dialog" aria-modal="true" aria-label="Welcome" onMouseDown={close}>
      <section className="welcomeCard" onMouseDown={(event) => event.stopPropagation()}>
        <button aria-label="Close" className="welcomeClose" onClick={close} type="button">
          <X size={16} />
        </button>
        <div className="welcomePortrait" aria-hidden="true">
          <img alt="" src={assetUrl("/assets/hero_boardart-catherine.webp")} />
        </div>
        <div className="welcomeBody">
          <span className="welcomeEyebrow">
            <Sparkles size={12} /> A fan-made board game
          </span>
          <h2 className="welcomeTitle">Welcome, Hero!</h2>
          <p className="welcomeLede">
            This is a <strong>fan-made</strong> adaptation of the Heroes III board game, built with love by{" "}
            <strong>BINH</strong> — not an official product. Beyond the printed rules it adds a set of optional{" "}
            <strong>house rules</strong> that sharpen and balance play. Most default <strong>on</strong>; every one can be
            toggled per game.
          </p>
          <div className="welcomeHighlights">
            <span className="welcomeHighlightsHead">
              <ScrollText size={13} /> House rules you can toggle
            </span>
            <ul>
              {HIGHLIGHTS.map((item) => (
                <li key={item.label}>
                  <Check size={12} />
                  <span>
                    <strong>{item.label}</strong> — {item.detail}
                  </span>
                </li>
              ))}
            </ul>
            <small>Open any game&apos;s <em>Mode &amp; Rules</em> tab in setup to mix and match them.</small>
          </div>
          <div className="welcomeActions">
            <label className="welcomeDontShow">
              <input checked={dontShow} onChange={(event) => setDontShow(event.target.checked)} type="checkbox" />
              Don&apos;t show this again
            </label>
            <button className="welcomeEnter" onClick={close} type="button">
              Enter Erathia
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
