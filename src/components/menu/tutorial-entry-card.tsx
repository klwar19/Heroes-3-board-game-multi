"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GraduationCap, Play } from "lucide-react";
import { TUTORIAL_LANGUAGES, tr, UI } from "@/data/tutorial/tutorial-i18n";
import { assetUrl } from "@/lib/asset-url";
import {
  getTutorialLanguage,
  readTutorialMedals,
  readTutorialProgress,
  setTutorialLanguage,
  type TutorialLanguage,
} from "@/lib/tutorial/tutorial-preference";
import { TUTORIAL_WELCOME_ART } from "./tutorial-prompt";

/**
 * "Learn by playing" front door for first-time visitors (login screen): the
 * tutorial needs no account, runs in the browser and starts at once. Shows
 * "Continue" (with the medal count) when this browser has progress.
 */
export function TutorialEntryCard() {
  const router = useRouter();
  const [lang, setLang] = useState<TutorialLanguage>("en");
  const [resume, setResume] = useState<{ medals: number } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLang(getTutorialLanguage());
    if (readTutorialProgress()) setResume({ medals: readTutorialMedals() });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Warm the tutorial while the visitor reads: the table page and Sandro's
  // first art, fetched in idle time so "Play" opens fast.
  useEffect(() => {
    const warm = () => {
      router.prefetch("/tutorial");
      router.prefetch("/");
      for (const src of ["/assets/tutorial/sandro-teach.webp", "/assets/tutorial/filigree.webp", "/assets/tutorial/medal-1.webp"]) {
        const image = new Image();
        image.src = assetUrl(src);
      }
    };
    const idle = (window as unknown as { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback;
    const handle = idle ? idle(warm) : window.setTimeout(warm, 1200);
    return () => {
      if (!idle) window.clearTimeout(handle);
    };
  }, [router]);

  return (
    <section className="tutorialEntryCard" lang={lang}>
      <div aria-hidden className="tutorialEntryArt">
        <img alt="" src={assetUrl(TUTORIAL_WELCOME_ART)} />
      </div>
      <div className="tutorialEntryBody">
        <div className="tutorialEntryTop">
          <span className="welcomeEyebrow">
            <GraduationCap size={13} /> {tr(lang, UI.entryEyebrow)}
          </span>
          <span className="tutorialLangSwitch" role="group" aria-label={tr(lang, UI.language)}>
            {TUTORIAL_LANGUAGES.map((option) => (
              <button
                aria-pressed={lang === option.id}
                key={option.id}
                onClick={() => {
                  setTutorialLanguage(option.id);
                  setLang(option.id);
                }}
                title={option.name}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </span>
        </div>
        <h2 className="tutorialEntryTitle">{tr(lang, UI.entryTitle)}</h2>
        <p className="tutorialEntryText">{tr(lang, UI.entryBody)}</p>
        <button className="welcomeEnter tutorialEntryPlay" onClick={() => router.push("/tutorial")} type="button">
          <Play aria-hidden size={15} /> {resume ? `${tr(lang, UI.entryContinue)} · ${resume.medals}/8` : tr(lang, UI.entryPlay)}
        </button>
        <small className="tutorialEntryNote">{tr(lang, UI.entryNoAccount)}</small>
      </div>
    </section>
  );
}
