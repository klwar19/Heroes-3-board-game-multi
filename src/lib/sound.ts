"use client";

import soundManifest from "../../public/sounds/manifest.json";
import { assetUrl } from "@/lib/asset-url";
import { effectsGain, silencedInBackground, voiceGain } from "@/lib/audio-mix";
import {
  SOUND_PRIORITY,
  admitVoice,
  clipBuffer,
  mixBus,
  registerVoice,
  releaseVoice,
  soundNow,
  type SoundVoice
} from "@/lib/sound-voices";
import { unitSoundKey, unitSoundLayerKey, type UnitSoundAction, type UnitSoundVariant } from "@/data/unit-sounds";

/**
 * Table audio. Two sources:
 *  - the converted Heroes III library under /public/sounds (manifest keys
 *    like "spells/fireball"), played through the shared AudioContext once a
 *    clip is decoded (else through <audio> elements), always within the voice
 *    budget of sound-voices.ts so a busy battle cannot exhaust the browser's
 *    media players
 *  - synthesized card-handling foley (draw swish, card landing, shuffle)
 *    generated with WebAudio, since the original game has no card sounds
 *
 * Browsers block audio before the first user gesture; every call degrades to
 * silence until then, and a one-time pointerdown listener unlocks the
 * context for remote players who receive events before interacting.
 */

type SoundManifestEntry = {
  src?: string;
  /** Play the clip this many times back-to-back (creature movement loops). */
  repeat?: number;
  /** Ambience/music; nothing battle-side loops, so playback ignores it. */
  loop?: boolean;
  /**
   * Follow-up impact (lich/magog attacks chain their explosion). Playback
   * ignores it on purpose: the board game triggers those impacts through
   * abilityFxPlans only when the splash ability actually fires.
   */
  then?: string;
  /** Small pause between members of a virtual sequence. */
  sequenceDelayMs?: number;
  /** Virtual entry: play one member at random. */
  random?: string[];
  /**
   * Virtual entry: play these member clips strictly in order, each starting
   * only after the previous one finishes (the Arch Devil's teleport plays its
   * move-out half EXT1, then its move-in half EXT2).
   */
  sequence?: string[];
  note?: string;
};

const soundLibrary = soundManifest as Record<string, SoundManifestEntry>;

let audioContext: AudioContext | null = null;
let unlockHooked = false;
let muted = false;

const MUTE_STORAGE_KEY = "h3-table-muted";

if (typeof window !== "undefined") {
  muted = window.localStorage?.getItem(MUTE_STORAGE_KEY) === "1";
}

const muteListeners = new Set<() => void>();

export function isSoundMuted(): boolean {
  return muted;
}

/** Live mute state for React (the Options panel / any toggle stays in sync). */
export function subscribeSoundMuted(listener: () => void): () => void {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

export function setSoundMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage?.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // private mode etc. - mute state just won't persist
  }
  for (const listener of muteListeners) listener();
}

/** Muted, or the tab is hidden and Options says not to play in the background. */
function quiet(): boolean {
  return muted || silencedInBackground();
}

/** A clip's requested volume scaled by the Options mix (voices vs effects). */
function mixedVolume(key: string, volume: number): number {
  const gain = isVoiceClip(key) ? voiceGain() : effectsGain();
  return Math.min(1, Math.max(0, volume * gain));
}

/**
 * Where synthesized foley connects: one gain stage per context carrying the
 * Options effects level (instead of the raw ctx.destination). Decoded library
 * clips share it (voice lines use its voices twin).
 */
function effectsOutput(ctx: AudioContext): AudioNode {
  return mixBus(ctx, false);
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  if (!unlockHooked) {
    unlockHooked = true;
    const unlock = () => {
      audioContext?.resume().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => undefined);
  }
  return audioContext;
}

/**
 * Start an element. A refused play (no gesture yet) or an unplayable clip
 * calls `onFail` so its voice slot frees and any chain moves on; an abort is
 * our own pause.
 */
function playAudioElement(audio: HTMLAudioElement, onFail?: () => void): void {
  const result = audio.play() as Promise<void> | undefined;
  result?.catch((error: unknown) => {
    if ((error as { name?: string } | null)?.name !== "AbortError") onFail?.();
  });
}

function clipUrl(key: string): string {
  return assetUrl(soundLibrary[key]?.src ?? `/sounds/${key}.mp3`);
}

/** Voice lines outrank ordinary effects for a voice slot; a caller may raise a clip to a cue. */
function clipPriority(key: string, priority?: number): number {
  return Math.max(priority ?? SOUND_PRIORITY.normal, isVoiceClip(key) ? SOUND_PRIORITY.voice : SOUND_PRIORITY.normal);
}

/**
 * The shared context and `url`'s decoded clip, when both are ready. The first
 * play of a clip starts its decode and is heard through an <audio> element.
 */
function decodedClip(url: string): { ctx: AudioContext; buffer: AudioBuffer } | null {
  // Before any gesture a context could not start: do not create one yet (the
  // element path stays silent then, exactly as before).
  if (!audioContext && typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    return null;
  }
  const ctx = getContext();
  if (!ctx) return null;
  const buffer = clipBuffer(ctx, url);
  return buffer && ctx.state === "running" ? { ctx, buffer } : null;
}

/**
 * A decoded clip on the shared context: `plays` times back to back (the
 * manifest `repeat`), or looped for `holdMs` and faded out (playLibrarySoundFor).
 * Its own gain is the requested volume; the mix bus carries the Options level,
 * so a fader move re-levels it while it plays.
 */
function playBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  key: string,
  volume: number,
  priority: number,
  plays: number,
  holdMs: number | null,
  onDone?: () => void
): void {
  const level = Math.min(1, Math.max(0, volume));
  const start = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, start);
  gain.connect(mixBus(ctx, isVoiceClip(key)));
  let source: AudioBufferSourceNode | null = null;
  let remainingPlays = plays;
  let doneFired = false;
  const finish = (later = false) => {
    releaseVoice(voice);
    if (doneFired) return;
    doneFired = true;
    if (source) source.onended = null;
    window.setTimeout(() => gain.disconnect(), later ? 80 : 0);
    if (onDone) {
      if (later) window.setTimeout(onDone, 0);
      else onDone();
    }
  };
  const voice: SoundVoice = {
    key,
    priority,
    level: volume,
    startedAt: soundNow(),
    element: false,
    // Its slot went to a more important clip: a quick fade (no click), and any chain goes on.
    stop: () => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.04);
      try {
        source?.stop(now + 0.05);
      } catch {
        // Already stopped.
      }
      finish(true);
    }
  };
  const begin = () => {
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(gain);
    node.onended = () => {
      remainingPlays -= 1;
      if (remainingPlays > 0 && !doneFired) begin();
      else finish();
    };
    source = node;
    if (holdMs === null) {
      node.start();
      return;
    }
    node.loop = true;
    const end = start + holdMs / 1000;
    const fadeMs = Math.min(160, holdMs / 3);
    gain.gain.setValueAtTime(level, Math.max(start, end - fadeMs / 1000));
    gain.gain.linearRampToValueAtTime(0, end);
    node.start(start);
    node.stop(end + 0.01);
  };
  registerVoice(voice);
  begin();
}

/**
 * Play one concrete manifest clip (a real `src`, honouring its `repeat`),
 * invoking `onDone` once every play has finished — or at once when the clip
 * is skipped (faded out in Options, over the voice budget) or fails. The
 * building block under playLibrarySound's virtual entries.
 */
function playClip(key: string, volume: number, onDone?: () => void, priority?: number): void {
  const entry = soundLibrary[key];
  const level = mixedVolume(key, volume);
  const skip = () => {
    if (onDone) window.setTimeout(onDone, 0);
  };
  if (level <= 0) {
    // Faded all the way down in Options: skip the download, keep any chain moving.
    skip();
    return;
  }
  const url = clipUrl(key);
  const plays = Math.max(1, entry?.repeat ?? 1);
  const rank = clipPriority(key, priority);
  const decoded = decodedClip(url);
  if (!admitVoice(key, rank, !decoded)) {
    // Over the voice budget and the least important clip: left out, chain moves on.
    skip();
    return;
  }
  if (decoded) {
    playBuffer(decoded.ctx, decoded.buffer, key, volume, rank, plays, null, onDone);
    return;
  }
  const audio = new Audio(url);
  audio.volume = level;
  let remainingPlays = plays;
  let doneFired = false;
  const fireDone = (later = false) => {
    releaseVoice(voice);
    if (doneFired) return;
    doneFired = true;
    if (onDone) {
      if (later) window.setTimeout(onDone, 0);
      else onDone();
    }
  };
  const voice: SoundVoice = {
    key,
    priority: rank,
    level: volume,
    startedAt: soundNow(),
    element: true,
    stop: () => {
      audio.pause();
      fireDone(true);
    },
    relevel: () => {
      audio.volume = mixedVolume(key, volume);
    }
  };
  audio.addEventListener("ended", () => {
    remainingPlays -= 1;
    if (remainingPlays > 0 && !doneFired) {
      audio.currentTime = 0;
      playAudioElement(audio, fireDone);
    } else {
      fireDone();
    }
  });
  // A clip that fails to load (404 / codec) never fires "ended" — still hand
  // control to any chained follow-up instead of silently swallowing it.
  audio.addEventListener("error", () => fireDone());
  registerVoice(voice);
  playAudioElement(audio, fireDone);
}

/** Play the members of a `sequence` entry one after another, in order. */
function playSequence(
  keys: string[],
  volume: number,
  index = 0,
  onDone?: () => void,
  sequenceDelayMs = 0,
  priority?: number
): void {
  if (index >= keys.length) {
    onDone?.();
    return;
  }
  playClip(keys[index], volume, () => {
    const next = () => playSequence(keys, volume, index + 1, onDone, sequenceDelayMs, priority);
    if (sequenceDelayMs > 0) {
      window.setTimeout(next, sequenceDelayMs);
    } else {
      next();
    }
  }, priority);
}

/**
 * Play a converted H3 sound by manifest key ("spells/fireball"). `priority`
 * (SOUND_PRIORITY.cue) keeps a key game cue from losing its voice slot to
 * ordinary battle noise.
 */
export function playLibrarySound(key: string, volume = 0.55, priority?: number): void {
  if (quiet() || typeof window === "undefined") {
    return;
  }
  const entry = soundLibrary[key];
  if (entry?.random?.length) {
    playLibrarySound(entry.random[Math.floor(Math.random() * entry.random.length)], volume, priority);
    return;
  }
  if (entry?.sequence?.length) {
    playSequence(entry.sequence, volume, 0, undefined, entry.sequenceDelayMs, priority);
    return;
  }
  playClip(key, volume, undefined, priority);
}

/**
 * Like playLibrarySound, but invokes `onDone` once the clip (including its
 * repeats / sequence members) has finished — the hook the map-object visit
 * ambience uses to start only after the one-shot visit sfx has ended.
 * Muted / SSR calls stay fully silent (no onDone: the chained sound would be
 * silent anyway).
 */
export function playLibrarySoundThen(key: string, volume: number, onDone: () => void): void {
  if (quiet() || typeof window === "undefined") {
    return;
  }
  const entry = soundLibrary[key];
  if (entry?.random?.length) {
    playLibrarySoundThen(entry.random[Math.floor(Math.random() * entry.random.length)], volume, onDone);
    return;
  }
  if (entry?.sequence?.length) {
    playSequence(entry.sequence, volume, 0, onDone, entry.sequenceDelayMs);
    return;
  }
  playClip(key, volume, onDone);
}

/**
 * The converted Heroes III button click, played on any in-game UI button. A
 * single delegated handler on the table root (see the tableRoot <main>s in
 * app/page.tsx) catches clicks that land on — or inside — a <button>, so the
 * whole in-game UI gets the same click the menu already has, without wiring
 * every button by hand. Excluded so a click never doubles with richer foley or
 * fires where it shouldn't:
 *   - the combat board itself (`.boardFelt` — cells own strike/move/deploy
 *     sounds), and
 *   - anything (a button or an ancestor) marked `data-no-click-sound`.
 */
export function isTableUiClickTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const button = element?.closest?.("button") as HTMLButtonElement | null;
  if (!button || button.disabled) {
    return false;
  }
  return !button.closest("[data-no-click-sound]") && !button.closest(".boardFelt");
}

export function playTableUiClickSound(event: { target: EventTarget | null }): void {
  if (quiet() || typeof window === "undefined") {
    return;
  }
  if (isTableUiClickTarget(event.target)) {
    playLibrarySound("ui/button", 0.32);
  }
}

/**
 * Creature voice for a combat moment: the unit's own H3 clip for placing
 * its card, striking, blocking, wincing, moving or dying. `hexFigure`: on the
 * Hex Battlefield the unit speaks with the creature its figure shows (Few =
 * the base creature, Pack = the upgrade; unit-sounds.ts hexFigureVoices).
 * Unknown units and missing clips stay silent.
 */
export function playUnitSound(
  unitDefId: string | undefined,
  action: UnitSoundAction,
  delayMs = 0,
  variant?: UnitSoundVariant,
  hexFigure = false
): void {
  if (!unitDefId || typeof window === "undefined") {
    return;
  }
  const key = unitSoundKey(unitDefId, action, variant, hexFigure);
  const layerKey = unitSoundLayerKey(unitDefId, action);
  if (!key && !layerKey) {
    return;
  }
  const play = () => {
    if (key) playLibrarySound(key);
    if (layerKey) playLibrarySound(layerKey);
  };
  if (delayMs > 0) {
    window.setTimeout(play, delayMs);
  } else {
    play();
  }
}

/**
 * One manifest clip looped for exactly `durationMs`, then faded out: a hex
 * battlefield walk lasts as long as its route, so its footsteps must too (a
 * single `repeat`-sized burst would stop mid-walk or run on after arrival).
 * Random entries loop one member; sequence entries (a teleport's out/in pair)
 * play once as authored.
 */
function playLibrarySoundFor(key: string, volume: number, durationMs: number): void {
  const entry = soundLibrary[key];
  if (entry?.random?.length) {
    playLibrarySoundFor(entry.random[Math.floor(Math.random() * entry.random.length)], volume, durationMs);
    return;
  }
  if (entry?.sequence?.length) {
    playSequence(entry.sequence, volume, 0, undefined, entry.sequenceDelayMs);
    return;
  }
  const level = mixedVolume(key, volume);
  if (level <= 0) return;
  const url = clipUrl(key);
  const rank = clipPriority(key);
  const decoded = decodedClip(url);
  if (!admitVoice(key, rank, !decoded)) return;
  if (decoded) {
    playBuffer(decoded.ctx, decoded.buffer, key, volume, rank, 1, durationMs);
    return;
  }
  const audio = new Audio(url);
  audio.volume = level;
  audio.loop = true;
  let fadeLeft = 1;
  let fade = 0;
  const voice: SoundVoice = {
    key,
    priority: rank,
    level: volume,
    startedAt: soundNow(),
    element: true,
    stop: () => {
      window.clearTimeout(hold);
      window.clearInterval(fade);
      audio.loop = false;
      audio.pause();
    },
    relevel: () => {
      audio.volume = mixedVolume(key, volume) * fadeLeft;
    }
  };
  const release = () => releaseVoice(voice);
  audio.addEventListener("error", release);
  registerVoice(voice);
  playAudioElement(audio, release);
  const fadeMs = Math.min(160, durationMs / 3);
  const hold = window.setTimeout(() => {
    const started = performance.now();
    fade = window.setInterval(() => {
      const left = 1 - (performance.now() - started) / fadeMs;
      if (left <= 0) {
        window.clearInterval(fade);
        audio.loop = false;
        audio.pause();
        release();
        return;
      }
      fadeLeft = left;
      audio.volume = mixedVolume(key, volume) * left;
    }, 30);
  }, Math.max(0, durationMs - fadeMs));
}

/** A spoken line (the anime towns' character voices), never a footstep loop. */
function isVoiceClip(key: string): boolean {
  return key.includes("/voices/");
}

/**
 * playUnitSound held for `durationMs` (a creature walking the hex battlefield:
 * its move clip loops for the whole walk). Same keys, layer and silence rules.
 * A unit whose move sound is a spoken line (Little Busters, Blue Archive, the
 * Forge's commander...) says it ONCE as it sets off — looping it would repeat
 * the line for the whole walk — and `gaitKey` (the footsteps of the H3 walk its
 * figure traces) carries the rest of the walk.
 */
export function playUnitSoundFor(
  unitDefId: string | undefined,
  action: UnitSoundAction,
  delayMs: number,
  durationMs: number,
  variant?: UnitSoundVariant,
  gaitKey?: string,
  hexFigure = false
): void {
  if (!unitDefId || typeof window === "undefined") {
    return;
  }
  const key = unitSoundKey(unitDefId, action, variant, hexFigure);
  const layerKey = unitSoundLayerKey(unitDefId, action);
  if (!key && !layerKey) {
    return;
  }
  const play = () => {
    if (quiet()) return;
    if (key && isVoiceClip(key)) {
      playLibrarySound(key, 0.55);
      // A layer that is already a footstep loop walks for it.
      if (gaitKey && !layerKey && soundLibrary[gaitKey]) playLibrarySoundFor(gaitKey, 0.5, durationMs);
    } else if (key) {
      playLibrarySoundFor(key, 0.55, durationMs);
    }
    if (layerKey) {
      if (isVoiceClip(layerKey)) playLibrarySound(layerKey, 0.55);
      else playLibrarySoundFor(layerKey, 0.55, durationMs);
    }
  };
  if (delayMs > 0) {
    window.setTimeout(play, delayMs);
  } else {
    play();
  }
}

type NoiseShape = {
  durationMs: number;
  /** Bandpass sweep, in Hz. */
  from: number;
  to: number;
  q: number;
  gain: number;
  attackMs?: number;
};

/** Filtered-noise burst: the basis of every synthesized card sound. */
function playNoise(shape: NoiseShape, delayMs = 0): void {
  if (quiet()) {
    return;
  }
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") {
    return;
  }

  const start = ctx.currentTime + delayMs / 1000;
  const duration = shape.durationMs / 1000;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    samples[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = shape.q;
  filter.frequency.setValueAtTime(shape.from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, shape.to), start + duration);

  const gain = ctx.createGain();
  const attack = (shape.attackMs ?? 8) / 1000;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(shape.gain, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter).connect(gain).connect(effectsOutput(ctx));
  source.start(start);
  source.stop(start + duration);
}

/** Card sliding off the deck (alternates two recorded deal sounds). */
let dealAlternator = 0;
/** A quiet burst of TV static (an Order & Chaos boss's picture breaking up), as long as the glitch it rides. */
export function playStaticHiss(durationMs: number): void {
  playNoise({ durationMs: Math.max(200, Math.min(900, durationMs)), from: 3600, to: 1800, q: 0.5, gain: 0.045, attackMs: 12 });
}

export function playCardSwish(delayMs = 0): void {
  dealAlternator = (dealAlternator + 1) % 2;
  const key = dealAlternator === 0 ? "cards/card-deal-1" : "cards/card-deal-2";
  if (delayMs > 0) {
    window.setTimeout(() => playLibrarySound(key, 0.5), delayMs);
  } else {
    playLibrarySound(key, 0.5);
  }
}

/**
 * Opening the Spell Book shelf: a page-flip riffle. The converted H3 library has
 * no dedicated spell-book cue, so this layers the two recorded paper "deal"
 * clips (the same parchment foley the deck uses) into a quick two-page turn —
 * a real sound, not silence — played when the Book icon is opened.
 */
export function playSpellBookOpen(): void {
  playLibrarySound("cards/card-deal-1", 0.5);
  window.setTimeout(() => playLibrarySound("cards/card-deal-2", 0.42), 90);
}

/**
 * Turning a single page inside the open Spell Book (selecting another stored
 * Spell): one light parchment flip — quieter and shorter than the two-page
 * open riffle above, so leafing through the index reads as paper, not dealing.
 */
export function playSpellBookPageTurn(): void {
  playLibrarySound("cards/card-deal-2", 0.32);
}

/**
 * A soft two-note chime when a table reaction (emote) arrives — a gentle,
 * synthesized "pop" so a reaction is felt, not just seen. Self-contained
 * WebAudio (no asset), degrading to silence before the first gesture / when
 * muted, exactly like the card foley.
 */
export function playTableReaction(): void {
  if (quiet()) {
    return;
  }
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") {
    return;
  }
  const start = ctx.currentTime;
  // Two short bell-ish notes a fifth apart (a rising "ta-da" nudge).
  const notes: { freq: number; at: number }[] = [
    { freq: 660, at: 0 },
    { freq: 988, at: 0.09 }
  ];
  for (const note of notes) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = note.freq;
    const gain = ctx.createGain();
    const at = start + note.at;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain).connect(effectsOutput(ctx));
    osc.start(at);
    osc.stop(at + 0.24);
  }
}

/**
 * A soft single-note chime when a table-chat line arrives while the panel is
 * collapsed — lower and quieter than the reaction "ta-da" so chat nudges
 * without competing with emotes. Same mute / pre-gesture silence rules.
 */
export function playTableChatMessage(): void {
  if (quiet()) {
    return;
  }
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") {
    return;
  }
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 784; // G5 — soft ping
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
  osc.connect(gain).connect(effectsOutput(ctx));
  osc.start(start);
  osc.stop(start + 0.3);
}

/** Card settling on the table / into the hand. */
export function playCardPlace(delayMs = 0): void {
  if (delayMs > 0) {
    window.setTimeout(() => playLibrarySound("cards/card-play", 0.45), delayMs);
  } else {
    playLibrarySound("cards/card-play", 0.45);
  }
}

/** Quick riffle when the discard pile shuffles back into the deck. */
export function playShuffle(delayMs = 0): void {
  for (let i = 0; i < 5; i += 1) {
    playNoise(
      { durationMs: 65, from: 1200 + i * 250, to: 2800, q: 1.4, gain: 0.1, attackMs: 4 },
      delayMs + i * 55
    );
  }
}

/**
 * Tabletop dice roll: an airy throw, then a rattle of wooden knocks that bounce
 * off the table and spread out as the die sheds energy, and finally a firm
 * settling thud — with a little rock as it tips onto its face — when it comes to
 * rest. This makes the on-screen dice read as a physical throw, not a silent CSS
 * tumble. `settleMs` should match the moment the visual cube stops spinning so
 * the closing thud lands together with the result.
 *
 * Note: the rolling body now comes from /sounds/ui/dice-roll.mp3; the WebAudio
 * layer below only adds the exact landing thud.
 */
export function playDiceRoll(dieCount = 1, settleMs = 1300): void {
  if (quiet() || typeof window === "undefined") {
    return;
  }
  const sampleDelay = Math.max(0, settleMs - 1392);
  window.setTimeout(() => playLibrarySound("ui/dice-roll", Math.min(0.72, 0.54 + dieCount * 0.04)), sampleDelay);

  const ctx = getContext();
  if (!ctx || ctx.state !== "running") {
    return;
  }

  // The die comes to rest: a low, firm thud on the felt, then a quick lighter
  // tick as it rocks and tips flat onto its face.
  playNoise({ durationMs: 100, from: 470, to: 170, q: 0.8, gain: 0.12, attackMs: 3 }, settleMs);
  playNoise({ durationMs: 46, from: 880, to: 360, q: 1.0, gain: 0.045, attackMs: 2 }, settleMs + 78);
}

/**
 * Combat-strike foley. These are synthesized placeholders (the same
 * filtered-noise toolkit as the dice / card sounds) layered under each unit's
 * own H3 voice clip, so a melee blow reads "grunt + thwack" and a shot reads
 * "loose + whoosh + thud". Swap the bodies for recorded weapon hits later;
 * callers (the FX layer) need not change.
 */

/** A melee weapon connecting: a low body thud plus a sharp metallic crack. */
export function playMeleeImpact(delayMs = 0): void {
  // Low, blunt body of the hit.
  playNoise({ durationMs: 95, from: 330, to: 105, q: 0.8, gain: 0.15, attackMs: 2 }, delayMs);
  // Bright transient on top so it cuts through as a strike, not just a thump.
  playNoise({ durationMs: 55, from: 2700, to: 950, q: 1.25, gain: 0.08, attackMs: 1 }, delayMs + 4);
}

/** A projectile leaving the shooter: an airy high-to-low whoosh. */
export function playWhoosh(delayMs = 0): void {
  playNoise({ durationMs: 220, from: 1850, to: 520, q: 0.7, gain: 0.07, attackMs: 18 }, delayMs);
}

/** A projectile landing: a lighter thud than a melee blow, with a tick. */
export function playProjectileImpact(delayMs = 0): void {
  playNoise({ durationMs: 70, from: 880, to: 300, q: 1.0, gain: 0.11, attackMs: 2 }, delayMs);
  playNoise({ durationMs: 38, from: 2200, to: 1200, q: 1.4, gain: 0.05, attackMs: 1 }, delayMs + 3);
}

/**
 * One ambience clip looping quietly (the Order & Chaos weather: rain, wind,
 * night insects) until `stop` — a single element, faded in and out, silent
 * while muted or hidden and following the Options effects level. A random
 * entry loops one of its members.
 */
export function startLibraryLoop(key: string, volume: number): { stop(): void; refresh(): void } {
  const idle = { stop: () => undefined, refresh: () => undefined };
  if (typeof window === "undefined") return idle;
  const entry = soundLibrary[key];
  const clip = entry?.random?.length ? entry.random[Math.floor(Math.random() * entry.random.length)]! : key;
  const audio = new Audio(assetUrl(soundLibrary[clip]?.src ?? `/sounds/${clip}.mp3`));
  audio.loop = true;
  audio.volume = 0;
  let target = 0;
  let stopped = false;
  const refresh = () => {
    target = quiet() ? 0 : mixedVolume(clip, volume);
    if (target > 0 && audio.paused && !stopped) playAudioElement(audio);
  };
  refresh();
  const fade = window.setInterval(() => {
    // (Re-read every step: the Options mix and a hidden tab change without a mute toggle.)
    if (!stopped) refresh();
    const next = stopped ? Math.max(0, audio.volume - 0.02) : audio.volume + Math.sign(target - audio.volume) * Math.min(0.02, Math.abs(target - audio.volume));
    audio.volume = Math.max(0, Math.min(1, next));
    if (stopped && audio.volume <= 0) {
      window.clearInterval(fade);
      audio.pause();
    } else if (!stopped && target <= 0 && audio.volume <= 0 && !audio.paused) {
      audio.pause();
    }
  }, 60);
  const unsubscribe = subscribeSoundMuted(refresh);
  return {
    refresh,
    stop: () => {
      stopped = true;
      unsubscribe();
    }
  };
}
