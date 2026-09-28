"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RestiaState } from "../engine/types";
import { createGame } from "../engine/reducer";
import { SLOTS, deleteSave, importSave, listSaves, loadGame, type SaveMeta, type SlotId } from "../engine/save";
import { isRestiaUnlocked, unlockRestia } from "../gate";
import { playMusic } from "./audio";
import { backdrop } from "./assets";
import { GameScreen } from "./game-screen";
import s from "./restia.module.css";

function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(0);
  const router = useRouter();
  return (
    <div className={s.root}>
      <div className={s.gate}>
        <form
          className={`${s.gateBox} ${wrong ? s.shake : ""}`}
          key={wrong}
          onSubmit={(event) => {
            event.preventDefault();
            if (unlockRestia(value)) onUnlock();
            else setWrong((n) => n + 1);
          }}
        >
          <h2 className={s.cardTitle} style={{ fontSize: 22 }}>
            Modding — restricted
          </h2>
          <div className={s.muted}>This experimental mod needs a password.</div>
          <input autoFocus className={s.input} inputMode="numeric" onChange={(event) => setValue(event.target.value)} placeholder="••••" type="password" value={value} />
          {wrong ? <div className={s.bad}>Wrong password.</div> : null}
          <button className={s.btn} type="submit">
            Enter
          </button>
          <button className={s.btnGhost} onClick={() => router.push("/menu")} type="button">
            Back to the main menu
          </button>
        </form>
      </div>
    </div>
  );
}

function when(meta: SaveMeta): string {
  const minutes = Math.floor(meta.playSeconds / 60);
  return `${meta.date} · ${meta.place} · Lv ${meta.level} · ${meta.gold.toLocaleString()} G · ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

function Title({ onStart }: { onStart: (state: RestiaState) => void }) {
  const router = useRouter();
  const [saves, setSaves] = useState(() => listSaves());
  const [view, setView] = useState<"main" | "load">("main");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SlotId | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    playMusic("main-menu");
  }, []);
  const latest = SLOTS.map((slot) => saves[slot]).filter((meta): meta is SaveMeta => !!meta).sort((a, b) => b.savedAt - a.savedAt)[0];
  const load = (slot: SlotId) => {
    try {
      const state = loadGame(slot);
      if (state) onStart(state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That save could not be loaded.");
    }
  };
  return (
    <div className={s.root}>
      <div className={s.title} style={{ backgroundImage: `url(${backdrop("title")})` }}>
        <div className={s.titleShade} />
        <div className={s.titleContent}>
          <div>
            <h1 className={s.titleLogo}>Otherworld Life</h1>
            <p className={s.titleSub}>Bin&apos;s days in Restia — farm, build a village, make friends, and dive into the catacombs.</p>
          </div>
          {view === "main" ? (
            <div className={s.titleMenu}>
              {latest ? (
                <button className={s.btn} onClick={() => load(latest.slot)} type="button">
                  Continue — {latest.date}
                </button>
              ) : null}
              <button className={latest ? s.btnGhost : s.btn} onClick={() => onStart(createGame((Date.now() % 2147483647) | 0).state)} type="button">
                New Game
              </button>
              <button className={s.btnGhost} disabled={!latest} onClick={() => setView("load")} type="button">
                Load Game
              </button>
              <button className={s.btnGhost} onClick={() => fileRef.current?.click()} type="button">
                Import save file
              </button>
              <button className={s.btnGhost} onClick={() => router.push("/menu")} type="button">
                Back to the main menu
              </button>
              <input
                accept="application/json,.json"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    onStart(importSave(await file.text()));
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : "That file could not be imported.");
                  }
                }}
                ref={fileRef}
                type="file"
              />
            </div>
          ) : (
            <div className={s.titleMenu}>
              {SLOTS.map((slot) => {
                const meta = saves[slot];
                return (
                  <div className={s.personRow} key={slot}>
                    <button className={s.slotCard} disabled={!meta} onClick={() => load(slot)} type="button">
                      <span>
                        <b>{slot === "auto" ? "Auto-save" : `Slot ${slot}`}</b>
                        <br />
                        <span className={s.muted}>{meta ? when(meta) : "Empty"}</span>
                      </span>
                    </button>
                    {meta ? (
                      confirmDelete === slot ? (
                        <button
                          className={`${s.btnDanger} ${s.btnSmall}`}
                          onClick={() => {
                            deleteSave(slot);
                            setSaves(listSaves());
                            setConfirmDelete(null);
                          }}
                          type="button"
                        >
                          Delete?
                        </button>
                      ) : (
                        <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => setConfirmDelete(slot)} title="Delete this save" type="button">
                          🗑
                        </button>
                      )
                    ) : null}
                  </div>
                );
              })}
              <button className={s.btnGhost} onClick={() => setView("main")} type="button">
                Back
              </button>
            </div>
          )}
          {error ? <div className={s.toast} data-tone="bad">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function RestiaApp() {
  const [unlocked, setUnlocked] = useState(() => isRestiaUnlocked());
  const [game, setGame] = useState<{ state: RestiaState; id: number } | null>(null);
  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  if (!game) return <Title onStart={(state) => setGame({ state, id: Date.now() })} />;
  return <GameScreen initial={game.state} key={game.id} onQuit={() => setGame(null)} />;
}
