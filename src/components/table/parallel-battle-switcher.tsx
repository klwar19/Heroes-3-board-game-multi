"use client";

import { useState } from "react";
import { ArrowLeftRight, Eye, Shield, Swords } from "lucide-react";
import { parallelContextOptions } from "@/engine/parallel-combats";
import type { GameAction, GameState, PlayerId } from "@/engine/state";
import styles from "./parallel-battle-switcher.module.css";

export function ParallelBattleSwitcher({ state, playerId, onAction }: {
  state: GameState;
  playerId: PlayerId;
  onAction: (action: GameAction) => unknown;
}) {
  const [switching, setSwitching] = useState(false);
  const options = parallelContextOptions(state, playerId);
  if (options.length < 2) return null;
  const selected = state.parallelCombatOwnerId ?? playerId;
  const current = options.find(option => option.ownerPlayerId === selected);
  return (
    <section className={styles.root} aria-label="Parallel battles">
      <div className={styles.heading}>
        <span><ArrowLeftRight size={16} /> Your battle windows</span>
        <small>Switch freely · each battle keeps its progress</small>
      </div>
      <div className={styles.windows} role="group" aria-label="Choose battle">
        {options.map(option => (
          <button type="button" key={option.ownerPlayerId}
            className={`${styles.window} ${option.role === "neutrals" ? styles.neutrals : ""}`}
            aria-pressed={selected === option.ownerPlayerId}
            disabled={switching}
            onClick={async () => {
              if (selected === option.ownerPlayerId) return;
              setSwitching(true);
              try { await onAction({ type: "SELECT_PARALLEL_CONTEXT", playerId, ownerPlayerId: option.ownerPlayerId }); }
              finally { setSwitching(false); }
            }}>
            {option.role === "hero" ? <Swords size={22} /> : option.role === "watch" ? <Eye size={22} /> : <Shield size={22} />}
            <span className={styles.text}>
              <strong>{option.role === "hero"
                ? option.hasCombat ? "My battle" : "My adventure"
                : option.role === "watch" ? `Watch ${option.fighterName}` : `Neutrals vs ${option.fighterName}`}</strong>
              <small>{option.role === "hero"
                ? option.controllerName ? `${option.controllerName} controls your opponents` : "Your hero, cards and rewards"
                : option.role === "watch" ? "Read-only — you have no decision here" : "You command the neutral army"}</small>
              <span className={option.needsInput ? styles.ready : styles.waiting}>{option.needsInput ? "● " : "◷ "}{option.waitingFor}</span>
            </span>
          </button>
        ))}
      </div>
      <p className={styles.role} role="status">
        {switching ? "Opening battle…" : current?.role === "neutrals"
          ? `You are commanding neutrals against ${current.fighterName}. Return to ${options[0].hasCombat ? "My battle" : "My adventure"} for your own hero.`
          : current?.role === "watch"
            ? `You are watching ${current.fighterName}'s battle — read-only. Return to ${options[0].hasCombat ? "My battle" : "My adventure"} to play your own turn.`
            : "You are playing your own hero. Check the neutral window when it needs your action."}
      </p>
    </section>
  );
}
