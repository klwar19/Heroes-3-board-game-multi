/**
 * Order & Chaos battlefield sounds (the systems are in
 * engine/garrison/order-chaos/field.ts): a clip from the converted Heroes III
 * and MGQ libraries for every battlefield event, through the lawn's own
 * throttle and budget (audio.ts), and ONE quiet ambience loop at a time for
 * the weather or the night (rain, wind, eerie fog, crickets), faded in and out
 * as it changes.
 */

import type { GarrisonEvent, GarrisonState } from "@/engine/garrison/sim";
import { startLibraryLoop } from "@/lib/sound";
import { battleDuck, playGarrisonSound, type GarrisonSoundKind } from "./audio";

function play(key: string, volume = 0.45, gap = 160, kind: GarrisonSoundKind = "routine"): void {
  playGarrisonSound(key, volume, gap, kind);
}

const WEATHER_CUE: Record<string, string> = {
  clear: "spells/visions",
  rain: "mgq/effects/water6",
  fog: "mgq/effects/fog2",
  blizzard: "mgq/effects/wind8",
  sandstorm: "mgq/effects/wind4",
  thunderstorm: "mgq/effects/thunder4"
};

const EMERGE_CUE: Record<string, string> = {
  water: "mgq/effects/mon-aqua2",
  sky: "spells/fly",
  flank: "adventure/dig",
  crypt: "adventure/graveyard"
};

/** One-shot clips for the battlefield's events (everything else is audio.ts'). */
export function playFieldEventSounds(events: readonly GarrisonEvent[]): void {
  for (const ev of events) {
    switch (ev.e) {
      case "raft":
        play("spells/summon-boat", 0.45, 250);
        break;
      case "crate":
        play("adventure/pickup-04", 0.45, 200);
        break;
      case "iced":
        play("spells/freeze", 0.28, 1400);
        break;
      case "melt":
        play("mgq/effects/water5", 0.35, 500);
        break;
      case "crater":
        play("spells/earthquake", 0.5, 400);
        break;
      case "burn":
        play("spells/fire-wall", 0.35, 500);
        break;
      case "strikeMark":
        play("effects/danger", 0.22, 600);
        break;
      case "strike":
        play("spells/lightning-bolt", 0.55, 120);
        break;
      case "weather":
        play(WEATHER_CUE[ev.kind] ?? "spells/visions", 0.5, 1000, "cue");
        break;
      case "emerge":
        play(EMERGE_CUE[ev.origin] ?? "adventure/dig", 0.4, 350);
        break;
      case "chew":
        play("units/boar-attack", 0.45, 400);
        break;
      case "tombEaten":
        if (ev.kind) play("spells/remove-obstacle", 0.5, 300);
        break;
      case "loot":
        play("adventure/rogue", 0.45, 500);
        break;
      case "chestOpen":
        play("adventure/treasure", 0.5, 300, "cue");
        break;
      case "bankFreed":
        play("effects/drawbridge", 0.5, 300, "cue");
        break;
      case "wake":
        play("effects/terror-2", 0.32, 900);
        break;
      case "shotBlocked":
        play("effects/siege-wall-hit", 0.22, 300);
        break;
      case "lull":
        play("mgq/effects/sleep", 0.5, 400);
        break;
      case "brew":
        play("adventure/vial-of-mana", 0.5, 300);
        break;
      case "fogClear":
        play("mgq/effects/wind4", 0.35, 600);
        break;
      default:
        break;
    }
  }
}

/** The ambience for a battle's weather or night (null: none). One loop plays at a time. */
function ambienceFor(s: GarrisonState): { key: string; volume: number } | null {
  const kind = s.weather?.kind;
  if (kind === "rain") return { key: "ambient/storm", volume: 0.12 };
  if (kind === "thunderstorm") return { key: "ambient/storm", volume: 0.18 };
  if (kind === "blizzard" || kind === "sandstorm") return { key: "ambient/air", volume: 0.14 };
  if (kind === "fog") return { key: "ambient/cursed-ground", volume: 0.12 };
  if (s.cfg.oc?.night) return { key: "ambient/insects", volume: 0.1 };
  return null;
}

let loop: { key: string; handle: { stop(): void } } | null = null;

/** Keeps the one battlefield ambience loop in step with the battle (null: stop it). Cheap to call every frame. */
export function updateFieldAmbience(s: GarrisonState | null): void {
  // (A boss warning hushes the weather too; it fades back in once the lawn is half back.)
  const want = s && battleDuck() >= 0.5 ? ambienceFor(s) : null;
  if ((want?.key ?? null) === (loop?.key ?? null)) return;
  loop?.handle.stop();
  loop = want ? { key: want.key, handle: startLibraryLoop(want.key, want.volume) } : null;
}
