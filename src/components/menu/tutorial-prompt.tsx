"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { GraduationCap, Play, X } from "lucide-react";
import { TUTORIAL_LANGUAGES, tr, UI } from "@/data/tutorial/tutorial-i18n";
import { assetUrl } from "@/lib/asset-url";
import {
  getTutorialLanguage,
  markTutorialAsked,
  setTutorialLanguage,
  shouldAskTutorial,
  type TutorialLanguage,
} from "@/lib/tutorial/tutorial-preference";

export const TUTORIAL_WELCOME_ART = "/assets/ui/menu/help/tutorial-welcome.webp";

/**
 * First-visit question on the main menu: play Sandro's tutorial game or not.
 * Waits until the menu's other entry dialogs have settled (`ready`), asks once
 * per browser session, and "Don't ask again" persists the opt-out. The Tutorial
 * icon in the menu corner stays available either way. Speaks the tutorial's
 * languages (English, Vietnamese, Polish).
 */
export function TutorialPrompt({ ready, onStart }: { ready: boolean; onStart: () => void }) {
  const [open, setOpen] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const [lang, setLang] = useState<TutorialLanguage>("en");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (ready && shouldAskTutorial()) {
      setLang(getTutorialLanguage());
      setOpen(true);
    }
  }, [ready]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const close = (start: boolean) => {
    markTutorialAsked(dontAsk);
    setOpen(false);
    if (start) onStart();
  };

  return (
    <div aria-label={tr(lang, UI.entryTitle)} aria-modal="true" className="tutorialPromptBackdrop" lang={lang} role="dialog">
      <section className="tutorialPromptCard">
        <button aria-label={tr(lang, UI.close)} className="welcomeClose" onClick={() => close(false)} type="button">
          <X size={16} />
        </button>
        <div aria-hidden className="tutorialPromptArt">
          <img alt="" src={assetUrl(TUTORIAL_WELCOME_ART)} />
        </div>
        <div className="tutorialPromptBody">
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
          <h2 className="welcomeTitle">{tr(lang, UI.entryTitle)}</h2>
          <p className="welcomeLede">{tr(lang, UI.entryBody)}</p>
          <p className="tutorialPromptNote">{tr(lang, UI.entryResume)}</p>
          <div className="welcomeActions">
            <label className="welcomeDontShow">
              <input checked={dontAsk} onChange={(event) => setDontAsk(event.target.checked)} type="checkbox" />
              {tr(lang, UI.entryDontAsk)}
            </label>
            <span className="tutorialPromptButtons">
              <button className="tutorialPromptLater" onClick={() => close(false)} type="button">
                {tr(lang, UI.entryLater)}
              </button>
              <button className="welcomeEnter" onClick={() => close(true)} type="button">
                <Play aria-hidden size={14} /> {tr(lang, UI.entryPlay)}
              </button>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
