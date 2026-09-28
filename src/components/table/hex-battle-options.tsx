"use client";

/**
 * The Hex Battlefield bar's Options button: the PC combat options' "Animation
 * speed", split into Movement / Attacks / Reactions a player sets separately
 * (src/lib/hex-battle-speed.ts), plus one-click PC Slow / Normal / Fast presets.
 * A per-browser presentation preference: it never touches the game state.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import {
  HEX_SPEED_PRESETS,
  hexSpeedSteps,
  useHexBattleSpeed,
  type HexBattleSpeed,
  type HexSpeedChannel
} from "@/lib/hex-battle-speed";

const CHANNELS: ReadonlyArray<{ key: HexSpeedChannel; label: string; detail: string }> = [
  { key: "move", label: "Movement", detail: "walking, flying, teleports" },
  { key: "attack", label: "Attacks", detail: "blows, shots, creature casts" },
  { key: "reaction", label: "Reactions", detail: "hits, blocks, deaths, turning" }
];

const PC_NAMES: Readonly<Record<number, string>> = { 1: "PC slow", 2: "PC normal", 3: "PC fast" };

/** The stop of `steps` nearest a stored speed. */
export function hexSpeedStepIndex(steps: readonly number[], value: number): number {
  let best = 0;
  for (let index = 1; index < steps.length; index += 1) {
    if (Math.abs(steps[index] - value) < Math.abs(steps[best] - value)) best = index;
  }
  return best;
}

/** "×3 · PC fast", "×1.25". */
export function formatHexSpeed(value: number): string {
  const pc = PC_NAMES[value];
  return pc ? `×${value} · ${pc}` : `×${value}`;
}

function samePace(a: HexBattleSpeed, b: HexBattleSpeed): boolean {
  return a.move === b.move && a.attack === b.attack && a.reaction === b.reaction;
}

export function HexBattleOptions() {
  const { speed, setSpeed, ready } = useHexBattleSpeed();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const panelId = useId();

  // Escape or a click elsewhere closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span className="hexBarBook" ref={wrapRef}>
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Battle options: animation speed"
        className="hexBarButton options"
        onClick={() => setOpen((value) => !value)}
        title="Options — battle animation speed (movement, attacks, reactions)"
        type="button"
      >
        <Gauge aria-hidden="true" />
      </button>
      {open ? (
        <span aria-label="Battle speed" className="hexSpeedPanel" id={panelId} role="dialog">
          <span className="hexSpeedHead">
            <strong>Battle speed</strong>
            <button aria-label="Close battle speed" className="hexSpeedClose" onClick={() => setOpen(false)} type="button">
              ×
            </button>
          </span>
          <span aria-label="Speed presets" className="hexSpeedPresets" role="group">
            {HEX_SPEED_PRESETS.map((preset) => (
              <button
                aria-pressed={ready && samePace(speed, preset.speed)}
                key={preset.key}
                onClick={() => setSpeed(preset.speed)}
                title={preset.title}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </span>
          {CHANNELS.map((channel) => {
            const value = speed[channel.key];
            const steps = hexSpeedSteps(channel.key);
            return (
              <label className="hexSpeedRow" key={channel.key}>
                <span className="hexSpeedName">
                  {channel.label}
                  <small>{channel.detail}</small>
                </span>
                <input
                  aria-label={`${channel.label} speed`}
                  aria-valuetext={formatHexSpeed(value)}
                  max={steps.length - 1}
                  min={0}
                  onChange={(event) => {
                    const step = steps[Number(event.currentTarget.value)];
                    if (step !== undefined) setSpeed({ [channel.key]: step });
                  }}
                  step={1}
                  type="range"
                  value={hexSpeedStepIndex(steps, value)}
                />
                <output>{formatHexSpeed(value)}</output>
              </label>
            );
          })}
          <span className="hexSpeedNote">
            Speed 1 / 2 / 3 = the PC&apos;s slow / normal / fast combat speed (attacks go up to 3). Saved in this browser
            only; applies from the next action.
          </span>
        </span>
      ) : null}
    </span>
  );
}
