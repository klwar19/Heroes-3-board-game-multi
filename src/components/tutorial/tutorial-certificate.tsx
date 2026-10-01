"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fill, TUTORIAL_CHAPTERS, tr, UI, type TutorialLanguage } from "@/data/tutorial/tutorial-i18n";
import { assetUrl } from "@/lib/asset-url";
import { fetchSession } from "@/lib/auth-client";
import { authEnabled } from "@/lib/auth-mode";
import { getDisplayName } from "@/lib/identity";
import css from "./tutorial-certificate.module.css";

const CERTIFICATE_ART = "/assets/tutorial/certificate.webp";

/**
 * The reward for winning the tutorial game: Sandro's sealed certificate with
 * all eight chapter medals, then the way onward — a guest is invited to make
 * a free account (the rest of the app needs one); a signed-in player goes
 * straight to a free game against the computer.
 */
export function TutorialCertificate({ lang, rounds, onClose }: { lang: TutorialLanguage; rounds: number; onClose: () => void }) {
  const [name, setName] = useState("");
  const [guest, setGuest] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setName(getDisplayName() || "Apprentice");
    if (!authEnabled()) return;
    let alive = true;
    void fetchSession()
      .then((profile) => {
        if (!alive) return;
        if (profile) setName(profile.nickname);
        setGuest(!profile);
      })
      .catch(() => alive && setGuest(true));
    return () => {
      alive = false;
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div aria-label={tr(lang, UI.certificateTitle)} aria-modal="true" className={css.backdrop} lang={lang} role="dialog">
      <div className={css.stage}>
        <button aria-label={tr(lang, UI.close)} className={css.close} onClick={onClose} type="button">
          <X size={16} />
        </button>
        <div className={css.sheet} style={{ backgroundImage: `url(${assetUrl(CERTIFICATE_ART)})` }}>
          <div className={css.content}>
            <small className={css.kicker}>Necropolis · Heroes III</small>
            <h2 className={css.title}>{tr(lang, UI.certificateTitle)}</h2>
            <p className={css.name}>{name}</p>
            <p className={css.body}>{fill(tr(lang, UI.certificateBody), { name, rounds })}</p>
            <ol className={css.medals}>
              {TUTORIAL_CHAPTERS.map((chapter) => (
                <li key={chapter.id} title={tr(lang, chapter.name)}>
                  <img alt={tr(lang, chapter.name)} src={assetUrl(chapter.medal)} />
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className={css.actions}>
          {guest ? (
            <Link className={`${css.button} ${css.primary}`} href="/login">
              {tr(lang, UI.createAccount)}
            </Link>
          ) : (
            <Link className={`${css.button} ${css.primary}`} href="/menu?view=singlePlayer">
              {tr(lang, UI.playScenario)}
            </Link>
          )}
          <Link className={css.button} href="/menu">
            {tr(lang, UI.backToMenu)}
          </Link>
        </div>
      </div>
    </div>
  );
}
