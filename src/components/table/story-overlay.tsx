"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * Visual-novel STORY overlay (Anime mod §11 / §3.2). Presentation ONLY — it
 * renders a `StoryScene` (bilingual EN/VI) and calls `onDone` when the last
 * line or a choice resolves. It never mutates rules state.
 *
 * Fixed full-bleed overlay following the existing overlay conventions
 * (`.astrologersProclaimBackdrop` z-index / fade), so phone mode re-anchors it
 * like every other fixed overlay with no bespoke phone work. Theme chrome
 * (`.xianxiaTheme` / `.isekaiTheme`) is stamped on the overlay ROOT ELEMENT of
 * THIS component — never on the table root — so mixing packages can never
 * collide (plan §3.6 coexistence discipline).
 *
 * Art-later: a background/sprite whose asset is a declared placeholder
 * (`STORY_ART_PLACEHOLDERS`) renders a theme-tinted gradient / an initial-letter
 * avatar chip instead of a broken <img>.
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { assetUrl } from "@/lib/asset-url";
import { playLibrarySound } from "@/lib/sound";
import { useStoryLanguage, type StoryLanguage } from "@/lib/story-language";
import {
  getStoryScene,
  storyAssetIsPlaceholder,
  storySpeakerName,
  type StoryChoice,
  type StoryLine,
  type StorySpeaker
} from "@/data/story/scenes";

/** One firing of a story scene (from a designer timed event or, later, a campaign hook). */
export type StoryCue = {
  /** Unique per firing — the STORY_SCENE_TRIGGERED event id (keys the overlay + seen-set). */
  id: string;
  /** Which registered scene to play. */
  sceneId: string;
};

/** Typewriter pacing: characters per tick / ms per tick. Cosmetic. */
const TYPE_STEP = 2;
const TYPE_MS = 24;

type LineSnapshot = { speaker: StorySpeaker; text: { en: string; vi: string } };

type MachineState = {
  sceneId: string;
  lineIndex: number;
  /** Current line's text fully revealed (typewriter finished or click-completed). */
  completed: boolean;
  /** Showing the end-of-scene choice buttons. */
  atChoices: boolean;
  /** Lines already advanced past (across scenes in this session), for the history log. */
  history: LineSnapshot[];
  /** The scene has fully resolved — the effect calls onDone once. */
  done: boolean;
};

type MachineAction =
  | { type: "complete" }
  | { type: "advance" }
  | { type: "skip" }
  | { type: "choose"; choice: StoryChoice };

function snapshot(line: StoryLine): LineSnapshot {
  return { speaker: line.speaker, text: line.text };
}

function reduce(state: MachineState, action: MachineAction): MachineState {
  if (state.done) {
    return state;
  }
  const scene = getStoryScene(state.sceneId);
  if (!scene) {
    return { ...state, done: true };
  }
  const lines = scene.lines;
  const lastIndex = lines.length - 1;
  const hasChoices = Boolean(scene.choices && scene.choices.length > 0);

  switch (action.type) {
    case "complete":
      if (state.completed || state.atChoices) {
        return state;
      }
      return { ...state, completed: true };

    case "advance": {
      if (state.atChoices) {
        return state; // must pick a choice
      }
      if (!state.completed) {
        return { ...state, completed: true }; // first press completes the line
      }
      if (state.lineIndex < lastIndex) {
        return {
          ...state,
          history: [...state.history, snapshot(lines[state.lineIndex])],
          lineIndex: state.lineIndex + 1,
          completed: false
        };
      }
      // Past the last line.
      if (hasChoices) {
        return { ...state, history: [...state.history, snapshot(lines[state.lineIndex])], atChoices: true };
      }
      return { ...state, done: true };
    }

    case "skip": {
      if (state.atChoices) {
        return state;
      }
      const jumped = lines.slice(state.lineIndex, lastIndex).map(snapshot);
      const history = [...state.history, ...jumped];
      if (hasChoices) {
        return {
          ...state,
          history: [...history, snapshot(lines[lastIndex])],
          lineIndex: lastIndex,
          completed: true,
          atChoices: true
        };
      }
      return { ...state, history, lineIndex: lastIndex, completed: true };
    }

    case "choose": {
      const nextId = action.choice.nextSceneId;
      if (nextId && getStoryScene(nextId)) {
        return {
          sceneId: nextId,
          lineIndex: 0,
          completed: false,
          atChoices: false,
          history: state.history,
          done: false
        };
      }
      return { ...state, done: true };
    }

    default:
      return state;
  }
}

function initMachine(sceneId: string): MachineState {
  return { sceneId, lineIndex: 0, completed: false, atChoices: false, history: [], done: false };
}

function pick(text: { en: string; vi: string }, lang: StoryLanguage): string {
  return text[lang];
}

export function StoryOverlay({ cue, onDone }: { cue: StoryCue; onDone: () => void }) {
  const [machine, dispatch] = useReducer(reduce, cue.sceneId, initMachine);
  const [revealed, setRevealed] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const { language, toggle: toggleLanguage } = useStoryLanguage();

  const scene = getStoryScene(machine.sceneId);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Open sting once, reusing MapEventOverlay's existing key (no new sound files).
  useEffect(() => {
    playLibrarySound("adventure/new-week", 0.4);
  }, []);

  // Resolve to onDone exactly once when the machine finishes (last line / choice)
  // — or immediately if the cue names a scene that no longer exists.
  const missingScene = !scene;
  useEffect(() => {
    if (machine.done || missingScene) {
      onDoneRef.current();
    }
  }, [machine.done, missingScene]);

  // Typewriter for the current line. Resets on line change; a completed line
  // (click / skip) skips the interval and shows the full text.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (machine.completed) {
      return;
    }
    const activeScene = getStoryScene(machine.sceneId);
    const line = activeScene?.lines[machine.lineIndex];
    setRevealed(0);
    if (!line) {
      return;
    }
    const target = Math.max(line.text.en.length, line.text.vi.length);
    if (target === 0) {
      dispatch({ type: "complete" });
      return;
    }
    const interval = window.setInterval(() => {
      setRevealed((current) => {
        const next = current + TYPE_STEP;
        if (next >= target) {
          window.clearInterval(interval);
          dispatch({ type: "complete" });
          return target;
        }
        return next;
      });
    }, TYPE_MS);
    return () => window.clearInterval(interval);
  }, [machine.sceneId, machine.lineIndex, machine.completed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Advance on Space / Enter (VN convention). Choice buttons handle their own keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        dispatch({ type: "advance" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!scene) {
    return null;
  }

  const currentLine = scene.lines[machine.lineIndex];
  const fullText = currentLine ? pick(currentLine.text, language) : "";
  const shownText = machine.completed ? fullText : fullText.slice(0, revealed);
  const speakerName = currentLine ? storySpeakerName(currentLine.speaker, language) : null;
  const themeClass =
    scene.theme === "xianxia"
      ? "xianxiaTheme"
      : scene.theme === "isekai"
        ? "isekaiTheme"
        : scene.theme === "classic"
          ? "classicTheme"
          : "";

  // Sprite slots — carry forward the last sprite seen on each side up to the
  // current line; the active side (the current speaker) is highlighted.
  let leftSprite: { sprite: string; speaker: StorySpeaker } | null = null;
  let rightSprite: { sprite: string; speaker: StorySpeaker } | null = null;
  for (let i = 0; i <= machine.lineIndex && i < scene.lines.length; i += 1) {
    const line = scene.lines[i];
    if (!line.sprite) {
      continue;
    }
    const slot = { sprite: line.sprite, speaker: line.speaker };
    if ((line.side ?? "left") === "right") {
      rightSprite = slot;
    } else {
      leftSprite = slot;
    }
  }
  const activeSide: "left" | "right" | null = currentLine?.sprite ? currentLine.side ?? "left" : null;

  const backgroundIsArt = Boolean(scene.background && !storyAssetIsPlaceholder(scene.background));
  const backdropStyle = backgroundIsArt
    ? { backgroundImage: `url(${assetUrl(scene.background!)})` }
    : undefined;

  const soFar: LineSnapshot[] =
    machine.atChoices || !currentLine ? machine.history : [...machine.history, snapshot(currentLine)];

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

  return (
    <div
      className={`astrologersProclaimBackdrop storyOverlayBackdrop ${themeClass} ${
        backgroundIsArt ? "hasArt" : "noArt"
      }`}
      role="dialog"
      aria-label="Story scene"
      style={backdropStyle}
      onClick={() => dispatch({ type: "advance" })}
    >
      {/* The stage fills the backdrop; a click anywhere that is not a button
          bubbles up to the backdrop's single advance handler (buttons and
          choice/toolbar/history containers stopPropagation). */}
      <div className="storyStage">
        <div className="storySprites" aria-hidden="true">
          <SpriteSlot slot={leftSprite} side="left" active={activeSide === "left"} lang={language} />
          <SpriteSlot slot={rightSprite} side="right" active={activeSide === "right"} lang={language} />
        </div>

        <div className="storyToolbar" onClick={stop}>
          <button
            className="storyToolButton"
            type="button"
            aria-pressed={language === "vi"}
            onClick={toggleLanguage}
            title="Switch language"
          >
            {language === "en" ? "EN" : "VI"}
          </button>
          <button
            className="storyToolButton"
            type="button"
            aria-pressed={showHistory}
            onClick={() => setShowHistory((value) => !value)}
          >
            Log
          </button>
          <button
            className="storyToolButton"
            type="button"
            onClick={() => dispatch({ type: "skip" })}
          >
            Skip
          </button>
        </div>

        {showHistory ? (
          <div className="storyHistory" onClick={stop} aria-label="Story log">
            <ul className="storyHistoryList">
              {soFar.map((entry, index) => {
                const name = storySpeakerName(entry.speaker, language);
                return (
                  <li key={index}>
                    {name ? <strong>{name}: </strong> : null}
                    {pick(entry.text, language)}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="storyDialogBox">
          {speakerName ? <div className="storyNameplate">{speakerName}</div> : null}
          <p className="storyLineText" aria-live="polite">
            {shownText}
          </p>

          {machine.atChoices && scene.choices ? (
            <div className="storyChoices" onClick={stop}>
              {scene.choices.map((choice, index) => (
                <button
                  key={index}
                  className="storyChoiceButton"
                  type="button"
                  onClick={() => dispatch({ type: "choose", choice })}
                >
                  {pick(choice.text, language)}
                </button>
              ))}
            </div>
          ) : (
            <div className="storyAdvanceHint" aria-hidden="true">
              {machine.completed ? "▸ click or Space" : "…"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpriteSlot({
  slot,
  side,
  active,
  lang
}: {
  slot: { sprite: string; speaker: StorySpeaker } | null;
  side: "left" | "right";
  active: boolean;
  lang: StoryLanguage;
}) {
  if (!slot) {
    return <div className={`storySpriteSlot storySpriteSlot-${side} empty`} />;
  }
  const name = storySpeakerName(slot.speaker, lang);
  const isPlaceholder = storyAssetIsPlaceholder(slot.sprite);
  return (
    <div className={`storySpriteSlot storySpriteSlot-${side} ${active ? "active" : "dim"}`}>
      {isPlaceholder ? (
        <div className="storySpriteAvatar" data-placeholder="true">
          {(name ?? "?").charAt(0)}
        </div>
      ) : (
        <img className="storySpriteImage" alt="" src={assetUrl(slot.sprite)} />
      )}
    </div>
  );
}
