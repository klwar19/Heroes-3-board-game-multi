"use client";

/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { isTutorialCompleted, readTutorialMedals } from "@/lib/tutorial/tutorial-preference";
import css from "./menu-help-icons.module.css";

// The reader (and its page index) only loads when the book is opened.
const RulebookReader = dynamic(
  () => import("@/components/rulebook/rulebook-reader").then((module) => module.RulebookReader),
  { ssr: false },
);

export const MENU_HELP_ART = {
  rulebook: "/assets/ui/menu/help/rulebook-icon.webp",
  tutorial: "/assets/ui/menu/help/tutorial-icon.webp",
} as const;

/**
 * Top-left main-menu shortcuts for new players: the Rule Book reader and the
 * guided Tutorial game. `onStartTutorial` is owned by the menu page so the
 * first-visit prompt and this icon start the tutorial the same way.
 */
export function MenuHelpIcons({ onStartTutorial }: { onStartTutorial: () => void }) {
  const [bookOpen, setBookOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [medals, setMedals] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCompleted(isTutorialCompleted());
    setMedals(readTutorialMedals());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <>
      <div className={css.cluster}>
        <button
          aria-label="Rule Book"
          className={css.item}
          onClick={() => setBookOpen(true)}
          title="Read the rule book"
          type="button"
        >
          <img alt="" aria-hidden className={css.art} draggable={false} src={assetUrl(MENU_HELP_ART.rulebook)} />
          <span className={css.label}>Rule Book</span>
        </button>
        <button
          aria-label={completed ? "Tutorial (completed)" : "Tutorial"}
          className={css.item}
          onClick={onStartTutorial}
          title="Learn to play with Sandro"
          type="button"
        >
          {/* Gold ring = chapter medals earned (of 8). */}
          <span aria-hidden className={css.ring} style={{ ["--progress" as string]: String(completed ? 8 : medals) }}>
            <img alt="" className={css.art} draggable={false} src={assetUrl(MENU_HELP_ART.tutorial)} />
          </span>
          <span className={css.label}>Tutorial</span>
          {!completed && medals > 0 ? <span className={css.count}>{medals}/8</span> : null}
          {completed ? (
            <span aria-hidden className={css.done}>
              <Check size={11} strokeWidth={3} />
            </span>
          ) : null}
        </button>
      </div>
      {bookOpen ? <RulebookReader onClose={() => setBookOpen(false)} /> : null}
    </>
  );
}
