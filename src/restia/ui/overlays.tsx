"use client";

import { useEffect, useMemo, useState } from "react";
import type { DaySummary, NpcId, RestiaState, SceneLine, SpeakerId } from "../engine/types";
import { SCENES } from "../engine/scenes";
import { NPCS } from "../data/npcs";
import { CHARACTERS } from "../data/characters";
import { itemDef } from "../data/items";
import { formatDate, formatTime, seasonOf } from "../engine/core";
import { maxStamina } from "../engine/state";
import { memberStats, petStats } from "../engine/party";
import { A, TACHIE, backdrop } from "./assets";
import s from "./restia.module.css";

export function speakerName(who: SpeakerId): string {
  if (who === "bin") return "Bin";
  if (who === "system") return "System";
  if (who === "narrator") return "";
  return NPCS[who as NpcId]?.name ?? who;
}

function useTypewriter(text: string, key: string): [string, boolean, () => void] {
  const [progress, setProgress] = useState({ key, shown: 0 });
  const shown = progress.key === key ? progress.shown : 0;
  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const base = current.key === key ? current.shown : 0;
        if (base >= text.length) {
          window.clearInterval(timer);
          return { key, shown: text.length };
        }
        return { key, shown: Math.min(text.length, base + 2) };
      });
    }, 22);
    return () => window.clearInterval(timer);
  }, [text, key]);
  return [text.slice(0, shown), shown >= text.length, () => setProgress({ key, shown: text.length })];
}

/** Visual-novel player for the engine's current scene line. */
export function ScenePlayer({
  state,
  onNext,
  onChoose,
  onSkip
}: {
  state: RestiaState;
  onNext: () => void;
  onChoose: (index: number) => void;
  onSkip: () => void;
}) {
  const scene = state.scene!;
  const def = SCENES[scene.id]!;
  const line = def.lines[scene.index] as SceneLine | undefined;
  const isChoice = !!line && "choice" in line;
  const who: SpeakerId = line && "who" in line && line.who ? line.who : "narrator";
  const text = line && "text" in line && line.text ? line.text : "";
  const cast = useMemo(() => {
    for (let i = scene.index; i >= 0; i--) {
      const entry = def.lines[i];
      if (entry && "show" in entry && entry.show) return entry.show;
    }
    return [] as SpeakerId[];
  }, [def, scene.index]);
  const bgKey = useMemo(() => {
    for (let i = scene.index; i >= 0; i--) {
      const entry = def.lines[i];
      if (entry && "bg" in entry && entry.bg) return entry.bg;
    }
    return def.bg;
  }, [def, scene.index]);
  const [typed, done, finish] = useTypewriter(text, `${scene.id}:${scene.index}`);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isChoice && line && "choice" in line) {
        const n = Number(event.key);
        if (n >= 1 && n <= line.choice.length) onChoose(n - 1);
        return;
      }
      if (event.key === "Enter" || event.key === " " || event.key === "e" || event.key === "E") {
        event.preventDefault();
        if (!done) finish();
        else onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, finish, isChoice, line, onChoose, onNext]);

  if (!line) return null;
  const name = speakerName(who);
  const system = who === "system";
  return (
    <div
      className={s.scene}
      style={{ backgroundImage: `url(${backdrop(bgKey)})` }}
      onClick={() => {
        if (isChoice) return;
        if (!done) finish();
        else onNext();
      }}
    >
      <button
        className={`${s.btnGhost} ${s.btnSmall} ${s.skipBtn}`}
        onClick={(event) => {
          event.stopPropagation();
          onSkip();
        }}
        type="button"
      >
        Skip ▸▸
      </button>
      <div className={s.sceneCast}>
        {cast.map((speaker) =>
          TACHIE[speaker] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={speakerName(speaker)}
              className={speaker === who || isChoice ? s.tachie : s.tachieDim}
              draggable={false}
              key={speaker}
              src={A(TACHIE[speaker]!)}
            />
          ) : null
        )}
      </div>
      <div className={system ? s.dialogSystem : s.dialog}>
        {name ? <span className={s.dialogName}>{name}</span> : null}
        {text ? <div>{isChoice ? text : typed}</div> : null}
        {isChoice && "choice" in line ? (
          <div className={s.choices}>
            {line.choice.map((option, index) => (
              <button
                className={s.choice}
                key={option.text}
                onClick={(event) => {
                  event.stopPropagation();
                  onChoose(index);
                }}
                type="button"
              >
                {index + 1}. {option.text}
              </button>
            ))}
          </div>
        ) : (
          <span className={s.dialogHint}>{done ? "▼ click / Enter" : ""}</span>
        )}
      </div>
    </div>
  );
}

/** A single line of everyday dialogue (daily talk, gift reactions). */
export function SayBox({ npc, text, onClose }: { npc: NpcId; text: string; onClose: () => void }) {
  const [typed, done, finish] = useTypewriter(text, `${npc}:${text}`);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape" || event.key === "e" || event.key === "E") {
        event.preventDefault();
        if (!done && event.key !== "Escape") finish();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, finish, onClose]);
  return (
    <div
      className={s.scene}
      style={{ background: "rgba(0,0,0,0.25)" }}
      onClick={() => (done ? onClose() : finish())}
    >
      <div className={s.sceneCast}>
        {TACHIE[npc] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={NPCS[npc].name} className={s.tachie} draggable={false} src={A(TACHIE[npc]!)} />
        ) : null}
      </div>
      <div className={s.dialog}>
        <span className={s.dialogName}>{NPCS[npc].name}</span>
        <div>{typed}</div>
        <span className={s.dialogHint}>{done ? "▼" : ""}</span>
      </div>
    </div>
  );
}

export type Toast = { id: number; text: string; tone: string };

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className={s.toastStack} aria-live="polite">
      {toasts.map((toast) => (
        <div className={s.toast} data-tone={toast.tone} key={toast.id}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}

export function DaySummaryModal({ summary, onClose }: { summary: DaySummary; onClose: () => void }) {
  const shipped = Object.entries(summary.shippedItems);
  return (
    <div className={s.panelBackdrop} onClick={onClose}>
      <div className={s.summary} onClick={(event) => event.stopPropagation()}>
        <h2 className={`${s.panelTitle} ${s.serif}`} style={{ color: "var(--ink)" }}>
          {summary.passedOut ? "You passed out..." : "A new morning"}
        </h2>
        <div className={s.muted}>Day {summary.day} is over.</div>
        {shipped.length ? (
          <div className={s.card}>
            <div className={s.rowTitle}>Shipped: +{summary.shippedGold} G</div>
            <div className={s.muted}>{shipped.map(([item, n]) => `${itemDef(item).name} x${n}`).join(", ")}</div>
          </div>
        ) : null}
        {summary.goldLost ? <div className={s.bad}>Lost {summary.goldLost} G.</div> : null}
        {summary.grown ? <div>{summary.grown} crops grew overnight.</div> : null}
        {summary.built ? <div className={s.good}>Construction finished: {summary.built}!</div> : null}
        {summary.faithGain ? <div className={s.system}>Faith +{summary.faithGain}</div> : null}
        {summary.petWork.map((note) => (
          <div key={note}>{note}</div>
        ))}
        {summary.notes.map((note) => (
          <div key={note}>{note}</div>
        ))}
        <div className={s.muted}>The game was auto-saved.</div>
        <button className={s.btn} onClick={onClose} type="button">
          Good morning!
        </button>
      </div>
    </div>
  );
}

const WEATHER_ICON: Record<string, string> = { sunny: "☀", cloudy: "☁", rain: "🌧", storm: "⛈", snow: "❄" };

export function Hud({ state, onMenu, onSave, onClock }: { state: RestiaState; onMenu: () => void; onSave: () => void; onClock: () => void }) {
  const max = maxStamina(state);
  const party = state.active.slice(0, 5);
  return (
    <div className={s.hud}>
      <div className={s.hudGroup}>
        <span className={s.hudDate}>{formatDate(state.day)}</span>
        <span title={`Weather: ${state.weather}. Tomorrow: ${state.tomorrow}`}>{WEATHER_ICON[state.weather]}</span>
        <button className={s.hudTime} onClick={onClock} style={{ border: "none", color: "inherit", cursor: "pointer" }} title="Pass time" type="button">
          {formatTime(state.minute)} ⏳
        </button>
      </div>
      <div className={s.hudGroup}>
        <span className={s.hudGold}>{state.gold.toLocaleString()} G</span>
        <span title="Stamina">⚡</span>
        <div className={s.barTrack} title={`Stamina ${state.stamina}/${max}`}>
          <div className={s.barFill} style={{ width: `${(100 * state.stamina) / max}%` }} />
          <span className={s.barLabel}>
            {state.stamina}/{max}
          </span>
        </div>
      </div>
      <div className={s.hudParty}>
        {party.map((id) => {
          if (id.startsWith("pet:")) {
            const pet = state.pets.find((entry) => `pet:${entry.uid}` === id);
            if (!pet) return null;
            const stats = petStats(pet);
            return <MiniMember hp={pet.hp} key={id} max={stats.maxHp} name={pet.name} />;
          }
          const member = state.members[id as keyof typeof state.members];
          if (!member) return null;
          const stats = memberStats(state, member.id);
          return <MiniMember hp={member.hp} key={id} max={stats.maxHp} name={CHARACTERS[member.id].name} />;
        })}
      </div>
      <div className={s.hudSpacer} />
      <span className={s.muted} style={{ color: "#e9d3a4" }}>
        {seasonOf(state.day)} · Rank {state.guild.rank}
      </span>
      <button className={s.iconBtn} onClick={onSave} title="Save" type="button">
        💾
      </button>
      <button className={s.iconBtn} onClick={onMenu} title="Menu (Esc)" type="button">
        ☰
      </button>
    </div>
  );
}

function MiniMember({ name, hp, max }: { name: string; hp: number; max: number }) {
  return (
    <div className={s.hudMember} title={`${name}: ${hp}/${max} HP`}>
      <span>{name}</span>
      <div className={s.barTrack}>
        <div className={`${s.barFill} ${s.barHp}`} style={{ width: `${(100 * hp) / Math.max(1, max)}%` }} />
      </div>
    </div>
  );
}
