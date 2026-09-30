"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { OC_SPEAKERS, type OcLine, type OcMood, type OcSpeaker } from "@/engine/garrison/order-chaos/story";
import { assetUrl } from "@/lib/asset-url";
import st from "./story.module.css";

/** The painted board-game art, shown while (or if) a speaker's story portrait is missing. */
const FALLBACK: Record<OcSpeaker, string> = {
  crag: "/assets/hero_boardart-crag_hack.webp",
  sandro: "/assets/hero_boardart-sandro.webp",
  catherine: "/assets/hero_boardart-catherine.webp",
  vidomina: "/assets/hero_boardart-vidomina.webp",
  mortimer: "/assets/units-necropolis-bronze-skeletons-few.webp"
};

const CHARS_PER_SECOND = 55;

/** A speaker's portrait for a mood, falling back to the board-game portrait. */
export function Portrait({ who, mood, className }: { who: OcSpeaker; mood: OcMood; className?: string }) {
  const src = OC_SPEAKERS[who].portrait(mood);
  const [failed, setFailed] = useState<string | null>(null);
  const missing = failed === src;
  return (
    <img
      alt=""
      aria-hidden
      className={`${className ?? ""} ${missing ? st.portraitFallback : ""}`}
      draggable={false}
      onError={() => setFailed(src)}
      src={assetUrl(missing ? FALLBACK[who] : src)}
    />
  );
}

/** How much of `text` shows `elapsed` ms after its line began. */
function revealed(text: string, elapsed: number): number {
  return Math.min(text.length, Math.max(0, Math.floor((elapsed / 1000) * CHARS_PER_SECOND)));
}

/**
 * A story scene over whatever screen is open: Sandro's letter first (if any),
 * then the talk, one line at a time with the speaker's portrait. Click, Space
 * or Enter reveals the rest of a line, then moves on; Skip or Escape ends it.
 */
export function StoryScene({ lines, letter, onDone }: { lines: readonly OcLine[]; letter?: string; onDone(): void }) {
  const [reading, setReading] = useState(Boolean(letter));
  const [index, setIndex] = useState(0);
  // Typewriter: the current line started at `lineStart`; `now` ticks while it is still typing.
  const [lineStart, setLineStart] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const line = reading ? null : lines[index] ?? null;
  const text = line?.text ?? "";
  const count = revealed(text, now - lineStart);
  const done = count >= text.length;
  const shown = text.slice(0, count);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  // Ends the scene once only (a second Skip/Escape before it closes must not re-run what follows it).
  const endedRef = useRef(false);
  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    doneRef.current();
  }, []);

  useEffect(() => {
    if (done) return;
    let frame = requestAnimationFrame(function step(t) {
      setNow(t);
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [done]);

  useEffect(() => {
    if (!reading && !line) finish();
  }, [reading, line, finish]);

  const advance = useCallback(() => {
    if (reading) {
      setReading(false);
      setLineStart(performance.now());
      return;
    }
    if (!done) {
      setLineStart(Number.NEGATIVE_INFINITY);
      return;
    }
    setIndex((i) => i + 1);
    setLineStart(performance.now());
  }, [reading, done]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, finish]);

  if (reading && letter) {
    return (
      <div aria-label="A letter from Sandro" aria-modal className={st.overlay} onClick={advance} role="dialog">
        <div className={st.letter}>
          <p className={st.letterHead}>A letter, pinned to the gate with a bone…</p>
          {letter.split("\n").map((row, i) => <p key={i}>{row}</p>)}
          <span aria-hidden className={st.seal} />
          <small className={st.hint}>Click to continue</small>
        </div>
        <button className={st.skip} onClick={(event) => { event.stopPropagation(); finish(); }} type="button">Skip</button>
      </div>
    );
  }
  if (!line) return null;
  const speaker = OC_SPEAKERS[line.who];
  // The Chaos side (Sandro, Vidomina) speaks from the right, in green.
  const right = speaker.side === "right";
  return (
    <div aria-label={`${speaker.name} speaks`} aria-modal className={st.overlay} onClick={advance} role="dialog">
      <div className={`${st.stage} ${right ? st.stageRight : ""}`}>
        <div className={`${st.portraitWrap} ${right ? st.portraitRight : ""}`} key={`${line.who}-${line.mood}-${index}`}>
          <Portrait className={st.portrait} mood={line.mood} who={line.who} />
        </div>
        <div className={`${st.box} ${right ? st.boxSandro : ""}`}>
          <div className={st.nameplate}>
            <strong>{speaker.name}</strong>
            <small>{speaker.title}</small>
          </div>
          <p aria-live="polite" className={st.text}>
            {shown}
            <span aria-hidden className={st.rest}>{line.text.slice(shown.length)}</span>
          </p>
          <span aria-hidden className={`${st.more} ${done ? st.moreOn : ""}`}>▼</span>
          <small className={st.counter}>{index + 1} / {lines.length}</small>
        </div>
      </div>
      <button className={st.skip} onClick={(event) => { event.stopPropagation(); finish(); }} type="button">Skip</button>
    </div>
  );
}

/** One speaker saying one line in a small bubble: results, reminders, battle quips. */
export function AdvisorBubble({ line, compact = false }: { line: OcLine; compact?: boolean }) {
  const speaker = OC_SPEAKERS[line.who];
  return (
    <div className={`${st.bubbleRow} ${compact ? st.bubbleCompact : ""}`}>
      <Portrait className={st.bubblePortrait} mood={line.mood} who={line.who} />
      <div className={st.bubble}>
        <strong>{speaker.name}</strong>
        <span>{line.text}</span>
      </div>
    </div>
  );
}
