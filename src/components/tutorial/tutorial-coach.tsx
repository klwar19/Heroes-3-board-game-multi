"use client";

/* eslint-disable @next/next/no-img-element */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, LogOut, MoveHorizontal, PlayCircle, RotateCcw, Wand2 } from "lucide-react";
import type { GameState } from "@/engine";
import tutorialClips from "@/data/tutorial/tutorial-clips.json";
import { fill, TUTORIAL_CHAPTERS, TUTORIAL_LANGUAGES, tr, UI, type TutorialChapterId } from "@/data/tutorial/tutorial-i18n";
import { TUTORIAL_LESSONS, type SandroPose, type TutorialLesson } from "@/data/tutorial/tutorial-lessons";
import { assetUrl } from "@/lib/asset-url";
import { useUiModePreference } from "@/lib/ui-mode-preference";
import {
  getTutorialLanguage,
  onTutorialLanguageChange,
  readTutorialMedals,
  setTutorialLanguage,
  writeTutorialMedals,
  type TutorialLanguage,
} from "@/lib/tutorial/tutorial-preference";
import { publishTutorialTarget, useTutorialStatus } from "@/lib/tutorial/tutorial-store";
import { TutorialCertificate } from "./tutorial-certificate";
import { TutorialClip } from "./tutorial-clip";
import { pickTutorialTarget, TUTORIAL_PANEL_CLOSERS, TutorialPointer, type TutorialTargetBox } from "./tutorial-pointer";
import { tutorialLobbyTargets, tutorialTargets } from "./tutorial-targets";
import css from "./tutorial-coach.module.css";

const RulebookReader = dynamic(
  () => import("@/components/rulebook/rulebook-reader").then((module) => module.RulebookReader),
  { ssr: false },
);

export const SANDRO_POSES: Record<SandroPose, string> = {
  teach: "/assets/tutorial/sandro-teach.webp",
  cheer: "/assets/tutorial/sandro-cheer.webp",
  warn: "/assets/tutorial/sandro-warn.webp",
  think: "/assets/tutorial/sandro-think.webp",
};
const FILIGREE = "/assets/tutorial/filigree.webp";

const SEEN_KEY = "binh-tutorial-lessons-seen";
const CURRENT_KEY = "binh-tutorial-lesson-current";
const SIDE_KEY = "binh-tutorial-coach-side";
const TOAST_MS = 3600;

type ClipManifest = { scriptId: string; computer: number[]; phone: number[]; lobby?: Record<string, string[]> };
const CLIPS = tutorialClips as ClipManifest;

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: lessons may repeat after a reload, nothing breaks.
  }
}

const chapterIndex = (id: TutorialChapterId) => TUTORIAL_CHAPTERS.findIndex((chapter) => chapter.id === id);

/** `**bold**` → <strong>, `*italic*` → <em>. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
          <em key={index}>{part.slice(1, -1)}</em>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * Sandro's tutorial coach, mounted by the table page on the tutorial room only.
 * It reads the local tutorial room's status (tutorial-store) and the live game
 * state, shows the lesson for the current moment (tutorial-lessons.ts), the
 * exact next move with a pointer on the real control, and a "Watch how" clip
 * recorded from the real app for that very step in the player's layout.
 * Chapters earn medals (tracked on the panel and on the menu icon); winning
 * the game awards the certificate.
 */
export function TutorialCoach({ state }: { state: GameState | null }) {
  const router = useRouter();
  const status = useTutorialStatus();
  const { uiMode } = useUiModePreference();
  const [lang, setLang] = useState<TutorialLanguage>("en");
  const [lesson, setLesson] = useState<TutorialLesson | null>(null);
  const [lessonOpen, setLessonOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  // No corner clear of the pointed-at control: shrink to the compact bar.
  // Keyed by step, so each new step gives the full panel another chance.
  const [squeezedStep, setSqueezedStep] = useState<number | null>(null);
  const squeezed = squeezedStep === status.step;
  const [side, setSide] = useState<"left" | "right">("left");
  const [clipOpen, setClipOpen] = useState(false);
  const [bookPage, setBookPage] = useState<number | null>(null);
  const [targetFound, setTargetFound] = useState(true);
  const [targetBox, setTargetBox] = useState<TutorialTargetBox | null>(null);
  const [placement, setPlacement] = useState<{ side: "left" | "right"; top: boolean }>({ side: "left", top: false });
  const [medals, setMedals] = useState(0);
  const [toast, setToast] = useState<{ chapter: number; at: number } | null>(null);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [quickStarting, setQuickStarting] = useState(false);
  const coachRef = useRef<HTMLElement | null>(null);
  const seenRef = useRef<string[] | null>(null);
  // One lesson per game moment: the next lesson waits until the moment changes.
  const lessonMomentRef = useRef<string | null>(null);
  const lessonStepRef = useRef<number | null>(null);
  const bottomGapRef = useRef<number | null>(null);
  const topGapRef = useRef<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    seenRef.current = readSeen();
    setLang(getTutorialLanguage());
    setMedals(readTutorialMedals());
    try {
      const current = window.localStorage.getItem(CURRENT_KEY);
      const found = TUTORIAL_LESSONS.find((entry) => entry.id === current);
      if (found) setLesson(found);
      if (window.localStorage.getItem(SIDE_KEY) === "right") setSide("right");
    } catch {
      // ignore
    }
    return onTutorialLanguageChange(setLang);
  }, []);

  // Pop the first unseen lesson whose moment has come; entering a later
  // chapter earns the medals of the chapters before it.
  useEffect(() => {
    if (!state || !seenRef.current) return;
    const momentKey = `${status.mode}|${status.step}|${status.lobbyIssues[0] ?? ""}|${status.computerThinking}`;
    if (lessonMomentRef.current === momentKey) return;
    const moment = {
      state,
      expected: status.expected?.action ?? null,
      mode: status.mode,
      computerThinking: status.computerThinking,
    };
    const next = TUTORIAL_LESSONS.find((entry) => !seenRef.current!.includes(entry.id) && safeWhen(entry, moment));
    if (!next) {
      // Keep the panel compact: once the player has moved on from the step a
      // lesson appeared at, fold its text (it stays one click away).
      if (status.mode === "script" && status.expected && lessonStepRef.current !== null && status.step !== lessonStepRef.current) {
        lessonStepRef.current = null;
        setLessonOpen(false);
      }
      return;
    }
    lessonStepRef.current = status.step;
    lessonMomentRef.current = momentKey;
    seenRef.current = [...seenRef.current, next.id];
    store(SEEN_KEY, JSON.stringify(seenRef.current));
    store(CURRENT_KEY, next.id);
    setLesson(next);
    setLessonOpen(true);
    setCollapsed(false);
    const earned = next.chapter === "victory" ? TUTORIAL_CHAPTERS.length : chapterIndex(next.chapter);
    const before = readTutorialMedals();
    if (earned > before) {
      writeTutorialMedals(earned);
      setMedals(earned);
      setToast({ chapter: earned - 1, at: Date.now() });
    }
    if (next.id === "victory") setCertificateOpen(true);
  }, [state, status.expected, status.mode, status.computerThinking, status.step, status.lobbyIssues]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Sandro replaces the generic helper-tips chip while the tutorial runs.
  useEffect(() => {
    document.body.classList.add("tutorialActive");
    return () => document.body.classList.remove("tutorialActive");
  }, []);

  // A new step closes the previous step's clip.
  useEffect(() => {
    setClipOpen(false);
  }, [status.step, status.mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const layout = uiMode === "phone" ? "phone" : "computer";
  const target = useMemo(() => {
    if (!state) return null;
    if (status.mode === "lobby") {
      const issue = (status.lobbyIssues[0] ?? "start") as Parameters<typeof tutorialLobbyTargets>[0];
      return { ...tutorialLobbyTargets(issue, lobbySetup(status), lang), clipKey: `lobby-${issue}` };
    }
    if (status.mode !== "script" || !status.expected) return null;
    return { ...tutorialTargets(status.expected.action, state, layout, lang), clipKey: null as string | null };
  }, [lang, layout, state, status]);

  const clipSrc = useMemo(() => {
    if (CLIPS.scriptId && CLIPS.scriptId === status.scriptId && status.mode === "script" && status.expected && CLIPS[layout]?.includes(status.step)) {
      return `/assets/tutorial/clips/${layout}/s${status.step}.webm`;
    }
    if (status.mode === "lobby" && target?.clipKey && CLIPS.lobby?.[layout]?.includes(target.clipKey)) {
      return `/assets/tutorial/clips/${layout}/${target.clipKey}.webm`;
    }
    return null;
  }, [layout, status, target]);

  const onFound = useCallback((box: TutorialTargetBox | null) => {
    setTargetFound(Boolean(box));
    setTargetBox(box);
  }, []);

  useEffect(() => {
    publishTutorialTarget(target ? { selectors: target.selectors, hint: target.hint } : null);
    const probe = (window as unknown as { __binhTutorial?: { pick?: () => { selector: string; index: number; x: number; y: number } | null } })
      .__binhTutorial;
    if (probe) {
      probe.pick = () => {
        if (!target) return null;
        // Closers are indexed after the step's own selectors.
        const list = [...target.selectors, ...TUTORIAL_PANEL_CLOSERS];
        const picked = pickTutorialTarget(target.selectors);
        return picked ? { selector: list[picked.selector], index: picked.index, x: picked.point.x, y: picked.point.y } : null;
      };
    }
    return () => publishTutorialTarget(null);
  }, [target]);

  // Never cover the control Sandro points at: take the first screen corner
  // (preferred side first) whose panel box stays clear of the target.
  useEffect(() => {
    const element = coachRef.current;
    if (!element) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const other = side === "left" ? "right" : "left";
    const candidates: { side: "left" | "right"; top: boolean }[] = [
      { side, top: false },
      { side: other, top: false },
      { side, top: true },
      { side: other, top: true },
    ];
    // Measure the real offsets (phone layout lifts the panel above the tab
    // bar and spans the width), then mirror them for the other corners.
    const rect = element.getBoundingClientRect();
    if (!placement.top) bottomGapRef.current = viewH - rect.bottom;
    else topGapRef.current = rect.top;
    const bottomGap = bottomGapRef.current ?? 18;
    const topGap = topGapRef.current ?? 18;
    const leftOf = (candidateSide: "left" | "right") => (candidateSide === placement.side ? rect.left : viewW - rect.right);
    const clear = (candidate: { side: "left" | "right"; top: boolean }) => {
      if (!targetBox) return true;
      const left = leftOf(candidate.side);
      const top = candidate.top ? topGap : viewH - bottomGap - height;
      const pad = 8;
      return (
        targetBox.left + targetBox.width + pad < left ||
        targetBox.left - pad > left + width ||
        targetBox.top + targetBox.height + pad < top ||
        targetBox.top - pad > top + height
      );
    };
    const clearChoice = candidates.find(clear);
    const choice = clearChoice ?? candidates[0];
    setPlacement((current) => (current.side === choice.side && current.top === choice.top ? current : choice));
    // Only squeeze when the full panel is the problem; it stays squeezed for
    // this step even though the compact bar then fits.
    if (!clearChoice && !squeezed) setSqueezedStep(status.step);
  }, [side, targetBox, collapsed, lessonOpen, lesson, placement.side, placement.top, squeezed, status.step]);

  const folded = collapsed || squeezed;

  const exit = () => router.push("/menu");
  const restart = () => {
    if (!window.confirm(tr(lang, UI.startOverConfirm))) return;
    void import("@/lib/tutorial/tutorial-room").then((module) => {
      module.resetTutorialProgress();
      store(SEEN_KEY, "[]");
      store(CURRENT_KEY, "");
      window.location.reload();
    });
  };
  const quickStart = () => {
    if (!status.roomId || quickStarting) return;
    setQuickStarting(true);
    void import("@/lib/tutorial/tutorial-room")
      .then((module) => module.quickStartTutorial(status.roomId!))
      .finally(() => setQuickStarting(false));
  };
  const chooseLanguage = (value: TutorialLanguage) => {
    setTutorialLanguage(value);
    setLang(value);
  };

  const pose: SandroPose =
    status.mode === "done" ? "cheer" : status.rejected ? "warn" : status.mode === "free" ? "think" : lesson?.pose ?? "teach";
  const progress = status.totalSteps ? Math.round((status.step / status.totalSteps) * 100) : 0;
  // Cleared by the room as soon as the scripted move is made.
  const recentlyRejected = Boolean(status.rejected);
  const chapter = TUTORIAL_CHAPTERS[Math.max(0, lesson ? chapterIndex(lesson.chapter) : 0)];
  const chapterNumber = TUTORIAL_CHAPTERS.indexOf(chapter) + 1;
  const showSetupChoice = status.mode === "lobby" && lesson?.id === "welcome" && lessonOpen;

  return (
    <>
      {target && !collapsed && !clipOpen && !certificateOpen && !showSetupChoice ? (
        <TutorialPointer onFound={onFound} selectors={target.selectors} />
      ) : null}
      <aside
        aria-label={tr(lang, UI.coachLabel)}
        className={css.coach}
        data-collapsed={folded ? "true" : undefined}
        data-side={placement.side}
        data-top={placement.top ? "true" : undefined}
        data-tutorial-coach=""
        lang={lang}
        ref={coachRef}
      >
        <img alt="" aria-hidden className={`${css.filigree} ${css.filigreeTL}`} src={assetUrl(FILIGREE)} />
        <img alt="" aria-hidden className={`${css.filigree} ${css.filigreeBR}`} src={assetUrl(FILIGREE)} />

        <div className={css.portrait}>
          <div className={css.portraitArch}>
            <img alt={tr(lang, UI.sandro)} key={pose} src={assetUrl(SANDRO_POSES[pose])} />
          </div>
          {!folded ? <div className={css.nameplate}>{tr(lang, UI.sandro)}</div> : null}
        </div>

        <div className={css.body}>
          <header className={css.head}>
            <img alt="" aria-hidden className={css.chapterMedal} key={chapter.id} src={assetUrl(chapter.medal)} />
            <div className={css.headText}>
              <div className={css.chapter}>
                {chapterNumber} · {tr(lang, chapter.name)}
              </div>
              <h2 className={css.title}>{lesson ? tr(lang, lesson.title) : tr(lang, UI.coachLabel)}</h2>
            </div>
            <div className={css.headTools}>
              {!folded ? (
                <div aria-label={tr(lang, UI.language)} className={css.langSwitch} role="group">
                  {TUTORIAL_LANGUAGES.map((option) => (
                    <button
                      aria-pressed={lang === option.id}
                      className={css.langButton}
                      key={option.id}
                      onClick={() => chooseLanguage(option.id)}
                      title={option.name}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                aria-label={tr(lang, UI.moveSide)}
                className={css.iconButton}
                onClick={() => {
                  const next = side === "left" ? "right" : "left";
                  setSide(next);
                  store(SIDE_KEY, next);
                }}
                title={tr(lang, UI.moveSide)}
                type="button"
              >
                <MoveHorizontal size={14} />
              </button>
              <button
                aria-expanded={!collapsed}
                aria-label={collapsed ? tr(lang, UI.expand) : tr(lang, UI.collapse)}
                className={css.iconButton}
                onClick={() => setCollapsed((value) => !value)}
                type="button"
              >
                {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </header>

          {!folded && lesson && lessonOpen ? (
            <div className={css.lesson} key={`${lesson.id}-${lang}`}>
              {lesson.body.map((paragraph, index) => (
                <p className={css.text} key={index} style={{ animationDelay: `${index * 140}ms` }}>
                  <RichText text={tr(lang, paragraph)} />
                </p>
              ))}
            </div>
          ) : null}

          {!folded && status.mode === "free" && status.divergence ? (
            <div className={css.warn}>{fill(tr(lang, UI.offScript), { reason: status.divergence })}</div>
          ) : null}
          {!folded && recentlyRejected && status.mode === "script" ? <div className={css.warn}>{tr(lang, UI.notYet)}</div> : null}

          {showSetupChoice ? (
            <div className={css.choiceRow}>
              <button className={`${css.button} ${css.primary}`} disabled={quickStarting} onClick={quickStart} type="button">
                <Wand2 aria-hidden size={14} /> {tr(lang, UI.skipSetup)}
              </button>
              <button className={css.button} data-tutorial-learn-setup="" onClick={() => setLessonOpen(false)} type="button">
                {tr(lang, UI.learnSetup)}
              </button>
            </div>
          ) : status.mode === "script" && status.computerThinking ? (
            <div className={css.objective} data-waiting="true">
              <span className={css.objectiveLabel}>
                <span aria-hidden className={css.objectiveDot} /> Castle
              </span>
              <span className={css.objectiveText}>{tr(lang, UI.castleMoving)}</span>
            </div>
          ) : target ? (
            <div className={css.objective}>
              <span className={css.objectiveLabel}>
                <span aria-hidden className={css.objectiveDot} /> {tr(lang, UI.yourMove)}
              </span>
              <span className={css.objectiveText}>
                {target.hint}
                {!targetFound && !folded ? (
                  <span className={css.objectiveMissing}> {tr(lang, layout === "phone" ? UI.missingPhone : UI.missingDesktop)}</span>
                ) : null}
              </span>
            </div>
          ) : null}

          {!folded ? (
            <>
              <div className={css.actions}>
                {clipSrc ? (
                  <button className={`${css.button} ${css.primary}`} onClick={() => setClipOpen(true)} type="button">
                    <PlayCircle aria-hidden size={15} /> {tr(lang, UI.watchHow)}
                  </button>
                ) : null}
                {lesson && lessonOpen && target && !showSetupChoice ? (
                  <button className={css.button} onClick={() => setLessonOpen(false)} type="button">
                    {tr(lang, UI.gotIt)}
                  </button>
                ) : null}
                {lesson && !lessonOpen ? (
                  <button className={css.button} onClick={() => setLessonOpen(true)} type="button">
                    {tr(lang, UI.showLesson)}
                  </button>
                ) : null}
                {lesson?.rulebook ? (
                  <button className={`${css.button} ${css.ghost}`} onClick={() => setBookPage(lesson.rulebook!)} type="button">
                    <BookOpen aria-hidden size={14} /> {fill(tr(lang, UI.rulebook), { page: lesson.rulebook })}
                  </button>
                ) : null}
              </div>

              <footer className={css.footer}>
                <ol aria-label={fill(tr(lang, UI.medals), { count: medals })} className={css.track}>
                  {TUTORIAL_CHAPTERS.map((entry, index) => (
                    <li
                      className={css.trackItem}
                      data-state={index < medals ? "earned" : entry.id === chapter.id ? "current" : "locked"}
                      key={entry.id}
                      title={tr(lang, entry.name)}
                    >
                      <img alt="" src={assetUrl(entry.medal)} />
                    </li>
                  ))}
                </ol>
                {status.totalSteps && status.mode !== "lobby" && status.mode !== "loading" ? (
                  <>
                    <div aria-hidden className={css.progress}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className={css.meta}>
                      <span>
                        {fill(tr(lang, UI.round), { round: state?.round ?? 1 })} · {fill(tr(lang, UI.progress), { percent: progress })}
                      </span>
                      <span className={css.metaLinks}>
                        <button className={css.link} onClick={restart} type="button">
                          <RotateCcw aria-hidden size={11} /> {tr(lang, UI.startOver)}
                        </button>
                        <button className={css.link} onClick={exit} type="button">
                          <LogOut aria-hidden size={11} /> {tr(lang, UI.exit)}
                        </button>
                      </span>
                    </div>
                  </>
                ) : null}
              </footer>
            </>
          ) : null}
        </div>
      </aside>

      {toast ? (
        <div aria-live="polite" className={css.toast} key={toast.at} lang={lang} role="status">
          <div aria-hidden className={css.toastRays} />
          <img alt="" className={css.toastMedal} src={assetUrl(TUTORIAL_CHAPTERS[toast.chapter].medal)} />
          <div className={css.toastText}>
            <small>{tr(lang, UI.chapterComplete)}</small>
            <strong>{tr(lang, TUTORIAL_CHAPTERS[toast.chapter].name)}</strong>
            <span>{fill(tr(lang, UI.medals), { count: medals })}</span>
          </div>
        </div>
      ) : null}

      {clipOpen && clipSrc ? (
        <TutorialClip
          closeLabel={tr(lang, UI.close)}
          onClose={() => setClipOpen(false)}
          phone={layout === "phone"}
          replayLabel={tr(lang, UI.replay)}
          src={clipSrc}
          title={target?.hint ?? tr(lang, UI.howTo)}
        />
      ) : null}
      {certificateOpen ? (
        <TutorialCertificate lang={lang} onClose={() => setCertificateOpen(false)} rounds={state?.round ?? 0} />
      ) : null}
      {bookPage !== null ? <RulebookReader initialPage={bookPage} onClose={() => setBookPage(null)} /> : null}
    </>
  );
}

function safeWhen(lesson: TutorialLesson, moment: Parameters<TutorialLesson["when"]>[0]): boolean {
  try {
    return lesson.when(moment);
  } catch {
    return false;
  }
}

function lobbySetup(status: ReturnType<typeof useTutorialStatus>) {
  return (
    status.setup ?? { seed: "", difficulty: "normal", playerFaction: "necropolis", playerHero: "sandro", computerFaction: "castle", computerHero: "catherine" }
  );
}
