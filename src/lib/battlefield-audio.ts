"use client";

import { isSoundMuted } from "@/lib/sound";
import type { BattlefieldAtmosphereTheme } from "@/lib/battlefield-atmosphere";

let context: AudioContext | null = null;
const heard = new Set<string>();

/** Short weather soundscapes; shares the table mute, never starts background music. */
export function playBattlefieldEntrance(
  combatKey: string,
  theme: BattlefieldAtmosphereTheme,
  rollDice: boolean
): () => void {
  if (typeof window === "undefined" || heard.has(combatKey)) return () => undefined;
  heard.add(combatKey);
  // Bound long-running spectators without evicting any recent combat.
  if (heard.size > 300) heard.delete(heard.values().next().value!);
  try {
    if (window.sessionStorage.getItem(`battlefield-sound:${combatKey}`)) return () => undefined;
    window.sessionStorage.setItem(`battlefield-sound:${combatKey}`, "1");
  } catch { /* In-memory guard still works in private sessions. */ }
  if (isSoundMuted() || document.hidden || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) {
    return () => undefined;
  }
  try { context ??= new AudioContext(); } catch { return () => undefined; }
  const ctx = context;
  let stopped = false;
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];
  let finish: number | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(poll);
    window.clearTimeout(finish);
    document.removeEventListener("visibilitychange", visibility);
    for (const source of sources) { try { source.stop(); } catch { /* Already ended. */ } }
    for (const node of nodes) node.disconnect();
  };
  const visibility = () => { if (document.hidden) stop(); };
  document.addEventListener("visibilitychange", visibility);
  const poll = window.setInterval(() => { if (isSoundMuted()) stop(); }, 80);

  const begin = () => {
    if (stopped || isSoundMuted() || document.hidden || ctx.state !== "running") { stop(); return; }
    const bus = ctx.createGain();
    bus.gain.value = .33;
    bus.connect(ctx.destination);
    nodes.push(bus);
    const start = ctx.currentTime + .02;
    const noise = (at: number, duration: number, frequency: number, gainValue: number, endFrequency = frequency) => {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = Math.random() * 2 - 1;
        brown = (brown + .025 * white) / 1.025;
        samples[i] = frequency < 300 ? brown * 5 : white;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = .65;
      filter.frequency.setValueAtTime(frequency, start + at);
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), start + at + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(gainValue, start + at + Math.min(.18, duration * .16));
      gain.gain.exponentialRampToValueAtTime(.0001, start + at + duration);
      source.connect(filter).connect(gain).connect(bus);
      sources.push(source);
      nodes.push(source, filter, gain);
      source.start(start + at);
      source.stop(start + at + duration);
    };
    const tone = (at: number, hz: number, duration = 1.4) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(.0001, start + at);
      gain.gain.exponentialRampToValueAtTime(.05, start + at + .04);
      gain.gain.exponentialRampToValueAtTime(.0001, start + at + duration);
      osc.connect(gain).connect(bus);
      sources.push(osc);
      nodes.push(osc, gain);
      osc.start(start + at);
      osc.stop(start + at + duration);
    };
    if (rollDice) {
      for (const offset of [0, .32]) {
        for (const [index, bounce] of [.03, .14, .28, .45, .61].entries()) {
          noise(offset + bounce, .065 + index * .005, 730 - index * 88, .28 - index * .025, 170);
        }
      }
    }
    const at = rollDice ? 1.02 : 0;
    if (theme === "sun" || theme === "clear") {
      tone(at, 523.25); tone(at + .15, 783.99); noise(at, 2.8, 1800, .05, 2400);
    } else if (theme === "fey") {
      [659.25, 987.77, 1318.51, 783.99].forEach((hz, i) => tone(at + i * .16, hz));
      noise(at, 2.4, 1200, .06, 2400);
    } else if (theme === "rock" || theme === "quake") {
      noise(at, 2.8, 92, .6, 43);
      [.08, .3, .55, .93].forEach((t, i) => noise(at + t, .14, 380 + i * 85, .2, 110));
    } else if (theme === "rain" || theme === "mud" || theme === "water") {
      noise(at, 2.7, theme === "water" ? 420 : 2900, .17, 1400);
      [.06, .27, .49, .87, 1.12, 1.58].forEach((t, i) => noise(at + t, .055, 700 + i * 190, .09, 280));
    } else if (theme === "heat" || theme === "ash") {
      noise(at, 2.6, 165, .35, 80);
      [.12, .33, .48, .85, 1.28].forEach((t, i) => noise(at + t, .045, 2200 + i * 220, .12, 900));
    } else {
      const frequency = theme === "snow" ? 2500 : theme === "wind" ? 920 : 450;
      noise(at, 2.8, frequency, .18, frequency * .45);
      if (theme === "miasma" || theme === "void") tone(at + .3, theme === "void" ? 130.81 : 196, 2);
    }
    finish = window.setTimeout(stop, 4300);
  };
  if (ctx.state === "running") begin();
  else void ctx.resume().then(begin).catch(stop);
  return stop;
}
