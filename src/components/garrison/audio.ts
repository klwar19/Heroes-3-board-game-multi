/**
 * Garrison Wars sounds: each simulation event maps onto the converted
 * Heroes III library (units/<creature>-<action>, spells/…, adventure/…).
 * Throttled so a big wave does not turn into noise: a per-clip gap, a
 * per-second budget for ordinary clips with a tighter one for the combat
 * chatter (blows, shots, bites), and one character line at a time. Cues (the
 * player's own actions, spells, Surge, bosses, wave horns, a defender's death)
 * skip the budgets and outrank the chatter for a voice slot.
 */

import manifest from "../../../public/sounds/manifest.json";
import { DEFENDERS, ENEMIES, type ProjectileKind, type SpellId } from "@/engine/garrison/content";
import type { GarrisonEvent, GarrisonState } from "@/engine/garrison/sim";
import { playCardPlace, playLibrarySound } from "@/lib/sound";
import { SOUND_PRIORITY } from "@/lib/sound-voices";

const LIBRARY = manifest as Record<string, unknown>;

/** Sprites whose clips live under another creature's name. */
const SOUND_ALIAS: Record<string, string> = {
  marksman: "archer",
  zombie: "zombie-lord",
  "wolf-rider": "goblin-wolf-rider",
  "wolf-raider": "hobgoblin-wolf-rider",
  "dragon-fly": "fire-dragon-fly",
  "wog-arctic-sharpshooter": "sharpshooter",
  "wog-lava-sharpshooter": "sharpshooter",
  "wog-santa-gremlin": "master-gremlin",
  "wog-war-zealot": "zealot",
  "wog-sylvan-centaur": "centaur-captain",
  "wog-gorynych": "chaos-hydra",
  "wog-dracolich": "ghost-dragon",
  "war-first-aid-tent": "first-aid-tent",
  // The Tide's rotoscoped breed speaks with its donors' voices.
  "gw-herald": "walking-dead",
  "gw-coffin": "walking-dead",
  "gw-tome": "walking-dead",
  "gw-pot-helm": "zombie-lord",
  "gw-great-helm": "zombie-lord",
  "gw-gravedigger": "zombie-lord",
  "gw-keg": "zombie-lord",
  "gw-abomination": "ogre",
  "gw-necromancer": "lich",
  "wog-ghost": "wraith",
  "wog-werewolf": "nomad",
  // Order & Chaos gear repaints speak with their donors.
  "oc-trog-helm": "infernal-troglodyte",
  "oc-shieldbearer": "skeleton-warrior",
  "oc-skeleton-bare": "skeleton-warrior",
  "oc-death-rider-bare": "black-knight",
  "oc-dread-knight-bare": "dread-knight",
  "oc-sellsword-bare": "swordsman",
  "oc-goblin-keg": "goblin",
  "oc-troll-club": "troll",
  "oc-ogre-drum": "ogre-mage",
  "oc-satyr-pipes": "satyr",
  "oc-shieldwall": "battle-dwarf",
  "oc-aegis": "battle-dwarf",
  "commander-bulwark": "battle-dwarf",
  "oc-bellwether": "armadillo",
  "bellwether-armadillo": "armadillo",
  "oc-mechanic-lodestone": "mechanic",
  // Order & Chaos late hybrids.
  engineer: "mechanic",
  "commander-paladin": "champion"
};

/** Voice-pack folders whose name differs from the sprite's (mgq-<x> -> mgq/voices/<folder>). */
const MGQ_VOICE: Record<string, string> = {
  sylph: "spirit_sylph", gnome: "spirit_gnome", undine: "spirit_undine", salamander: "spirit_salamander",
  kamuro: "kamuro_kitsu", kitsu: "kamuro_kitsu", frederica: "chrome_frederica"
};

type VoiceAction = "attack" | "shoot" | "death" | "hurt" | "move" | "ability";
/** Clip names tried in order for each action (packs differ: Blue Archive has "ability", MGQ "shoot"...). */
const VOICE_TRY: Record<VoiceAction, readonly string[]> = {
  attack: ["attack"], shoot: ["shoot", "attack"], death: ["death"], hurt: ["hurt"], move: ["move", "ability"], ability: ["ability", "attack", "shoot"]
};

/** A character voice line for an anime creature (Blue Archive, Azur Lane, MGQ, Little Busters sprites), or null. */
function voiceKey(sprite: string, action: VoiceAction): string | null {
  const cut = sprite.indexOf("-");
  if (cut < 0) return null;
  const prefix = sprite.slice(0, cut);
  const name = sprite.slice(cut + 1);
  const base = prefix === "ba" ? `blue-archive/voices/${name}`
    : prefix === "al" ? `azur-lane/voices/${name.replace(/-/g, "_")}`
    : prefix === "mgq" ? `mgq/voices/${MGQ_VOICE[name] ?? name.replace(/-/g, "_")}`
    : prefix === "lb" ? `little-busters/voices/${name.replace(/-/g, "_")}`
    : null;
  if (!base) return null;
  for (const clip of VOICE_TRY[action]) if (LIBRARY[`${base}/${clip}`]) return `${base}/${clip}`;
  return null;
}

/** What a shot sounds like when its shooter has no clip of its own (the anime girls, the war machines...). */
const SHOT_SOUND: Partial<Record<ProjectileKind, string>> = {
  arrow: "units/archer-shoot", stone: "units/halfling-shoot", boulder: "units/cyclops-shoot", bolt: "spells/magic-arrow",
  frost: "spells/ice-bolt", holy: "mgq/effects/saint3", dark: "mgq/effects/darkness3", axe: "mgq/effects/slash6",
  spear: "mgq/effects/bow2", gift: "adventure/pickup-02", lightning: "spells/lightning-bolt", fireball: "spells/fireball",
  cloud: "spells/death-cloud", bullet: "mgq/effects/gun2", rocket: "doom/dsrlaunc", plasma: "doom/dsplasma",
  hellfire: "doom/dsfirsht", hammer: "mgq/effects/hammer", crescent: "mgq/effects/mon-wind3", ball: "mgq/effects/blow8",
  kunai: "mgq/effects/sword3"
};

/** A shooter's clip, else its weapon's. */
function shotKey(sprite: string, projectile: ProjectileKind | undefined): string | null {
  return unitKey(sprite, "shoot") ?? (projectile ? SHOT_SOUND[projectile] ?? null : null);
}

/** Character lines never talk over each other: one at a time, this far apart (cue lines excepted). */
const VOICE_GAP_MS = 1200;
let lastVoiceAt = -1e9;

/** Voices speak up now and then, not on every blow (one line per creature every few seconds). */
function voice(sprite: string, action: VoiceAction, volume = 0.5, gap = 4500, cue = false): void {
  const key = voiceKey(sprite, action);
  if (!key) return;
  const now = clock();
  if (!cue && now - lastVoiceAt >= 0 && now - lastVoiceAt < VOICE_GAP_MS) return;
  if (play(key, volume, gap, cue ? "cue" : "routine")) lastVoiceAt = now;
}

/** The DOOM monsters speak with their original sound lumps (the same set src/data/unit-sounds.ts uses). */
const DOOM_SOUNDS: Record<string, Partial<Record<"attack" | "shoot" | "death" | "hurt" | "move", string>>> = {
  "doom-demon": { attack: "units/doom-demon-attack", death: "doom/dssgtdth", hurt: "doom/dsdmpain", move: "doom/dsdmact" },
  "doom-former-human": { attack: "doom/dspistol", death: "units/doom-former-human-death", hurt: "doom/dspopain", move: "doom/dsposact" },
  "doom-former-human-sergeant": { attack: "doom/dsshotgn", death: "units/doom-former-human-death", hurt: "doom/dspopain", move: "doom/dsposact" },
  "doom-former-commando": { attack: "units/doom-machinegun-attack", death: "units/doom-former-human-death", hurt: "doom/dspopain", move: "doom/dsposact" },
  "doom-imp": { attack: "units/doom-imp-attack", shoot: "doom/dsfirsht", death: "units/doom-imp-death", hurt: "doom/dspopain", move: "doom/dsbgact" },
  "doom-lost-soul": { attack: "doom/dssklatk", death: "doom/dsfirxpl", hurt: "doom/dsdmpain", move: "doom/dssklatk" },
  "doom-cacodemon": { attack: "units/doom-cacodemon-attack", shoot: "doom/dsfirsht", death: "doom/dscacdth", hurt: "doom/dsdmpain", move: "doom/dscacsit" },
  "doom-pain-elemental": { attack: "doom/dssklatk", death: "doom/dspedth", hurt: "doom/dspepain", move: "doom/dspesit" },
  "doom-hell-knight": { attack: "units/doom-hell-knight-attack", shoot: "doom/dsfirsht", death: "doom/dskntdth", hurt: "doom/dsdmpain", move: "doom/dskntsit" },
  "doom-baron-of-hell": { attack: "units/doom-baron-attack", shoot: "doom/dsfirsht", death: "doom/dsbrsdth", hurt: "doom/dsdmpain", move: "doom/dsbrssit" },
  "doom-arachnotron": { attack: "units/doom-arachnotron-attack", shoot: "doom/dsplasma", death: "doom/dsbspdth", hurt: "doom/dsdmpain", move: "doom/dsbspwlk" },
  "doom-revenant": { attack: "units/doom-revenant-attack", shoot: "doom/dsskeatk", death: "doom/dsskedth", hurt: "doom/dspopain", move: "doom/dsskeact" },
  "doom-mancubus": { attack: "units/doom-mancubus-attack", shoot: "doom/dsmanatk", death: "doom/dsmandth", hurt: "doom/dsmnpain", move: "doom/dsmansit" },
  "doom-arch-vile": { attack: "units/doom-arch-vile-attack", shoot: "doom/dsflamst", death: "doom/dsvildth", hurt: "doom/dsvipain", move: "doom/dsvilact" },
  "doom-spider-mastermind": { attack: "units/doom-machinegun-attack", death: "doom/dsspidth", hurt: "doom/dsdmpain", move: "doom/dsmetal" },
  "doom-cyberdemon": { attack: "units/doom-cyberdemon-attack", shoot: "doom/dsrlaunc", death: "doom/dscybdth", hurt: "doom/dsdmpain", move: "doom/dshoof" }
};

function unitKey(sprite: string, action: "attack" | "shoot" | "death" | "hurt" | "move"): string | null {
  const doom = DOOM_SOUNDS[sprite];
  if (doom) return doom[action] ?? (action === "shoot" ? doom.attack ?? null : null);
  const name = SOUND_ALIAS[sprite] ?? sprite;
  const key = `units/${name}-${action}`;
  if (LIBRARY[key]) return key;
  if (action === "shoot" && LIBRARY[`units/${name}-attack`]) return `units/${name}-attack`;
  return null;
}

/**
 * How a clip is budgeted: "chatter" = the endless combat noise of a big wave,
 * "routine" = every other battle sound, "cue" = must be heard (never budgeted).
 */
export type GarrisonSoundKind = "chatter" | "routine" | "cue";

/** Ordinary clips started in any rolling second, and how many of those may be chatter. */
const ROUTINE_PER_SECOND = 10;
const CHATTER_PER_SECOND = 6;

const lastPlayed = new Map<string, number>();
const routineStarts: number[] = [];
const chatterStarts: number[] = [];

function clock(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Starts within the last second (older ones dropped). */
function startsInLastSecond(starts: number[], now: number): number {
  while (starts.length && (now - starts[0]! >= 1000 || now < starts[0]!)) starts.shift();
  return starts.length;
}

/**
 * Play a lawn clip through the throttle: `gap` = least time between two plays
 * of this clip. Shared with field-audio.ts so the battlefield's clips draw on
 * the same budget. True when the clip was started.
 */
function play(key: string | null, volume = 0.5, gap = 110, kind: GarrisonSoundKind = "routine"): boolean {
  if (!key || !LIBRARY[key]) return false;
  const now = clock();
  if (now - (lastPlayed.get(key) ?? -1e9) < gap) return false;
  if (kind !== "cue") {
    // A rolling window: a fixed one let a burst straddling its edge play twice the budget.
    if (startsInLastSecond(routineStarts, now) >= ROUTINE_PER_SECOND) return false;
    if (kind === "chatter") {
      if (startsInLastSecond(chatterStarts, now) >= CHATTER_PER_SECOND) return false;
      chatterStarts.push(now);
    }
    routineStarts.push(now);
  }
  lastPlayed.set(key, now);
  if (kind === "cue") playLibrarySound(key, volume, SOUND_PRIORITY.cue);
  else playLibrarySound(key, volume);
  return true;
}

export const playGarrisonSound = play;

/** Boss dread: the evil laugh (never twice within LAUGH_GAP_MS), the bones, the ghosts, the whispers. */
const LAUGH = "effects/oc-evil-laugh";
const LAUGH_GAP_MS = 8000;
/** The delayed laugh waiting to sound (null: none), so leaving the battle can call it off. */
let laughTimer: number | null = null;

/** The boss laughs, now or after `delay` ms (rate-limited when it actually sounds). */
function evilLaugh(delay = 0): void {
  if (laughTimer !== null || clock() - (lastPlayed.get(LAUGH) ?? -1e9) < LAUGH_GAP_MS) return;
  if (delay <= 0 || typeof window === "undefined") {
    play(LAUGH, 0.55, LAUGH_GAP_MS, "cue");
    return;
  }
  laughTimer = window.setTimeout(() => {
    laughTimer = null;
    play(LAUGH, 0.55, LAUGH_GAP_MS, "cue");
  }, delay);
}

/** The battle is over or left: delayed battle sounds still waiting (the boss's laugh) never sound. */
export function cancelPendingBattleSounds(): void {
  if (laughTimer !== null && typeof window !== "undefined") window.clearTimeout(laughTimer);
  laughTimer = null;
}

/** A boss is alive in a running battle (never the versus mode). */
function bossAlive(s: GarrisonState): boolean {
  if (s.cfg.mode === "versus" || s.outcome) return false;
  const id = s.warbossId ?? s.boss?.id;
  return id !== undefined && s.enemies.some((e) => e.id === id && !e.dead);
}

const WHISPERS = ["units/wraith-move", "units/wight-move"] as const;
let nextWhisperAt = 0;
let lastEventsAt = 0;

/** Now and then, while a boss lives, a faint ghostly whisper (the timer waits out pauses: no events then). */
function bossWhisper(s: GarrisonState): void {
  const now = clock();
  const gap = now - lastEventsAt;
  lastEventsAt = now;
  if (!bossAlive(s)) {
    nextWhisperAt = 0;
    return;
  }
  if (gap > 1000 && nextWhisperAt) nextWhisperAt += gap;
  if (!nextWhisperAt) nextWhisperAt = now + 15000 + Math.random() * 10000;
  if (now < nextWhisperAt) return;
  nextWhisperAt = now + 15000 + Math.random() * 10000;
  play(WHISPERS[Math.floor(Math.random() * WHISPERS.length)]!, 0.16, 12000);
}

const SPELL_SOUND: Record<SpellId, string> = {
  "magic-arrow": "spells/magic-arrow",
  "frost-ring": "spells/frost-ring",
  haste: "spells/haste",
  "meteor-shower": "spells/meteor-shower",
  armageddon: "spells/armageddon",
  earthquake: "spells/earthquake",
  "war-cry": "spells/bloodlust",
  resurrection: "spells/resurrection",
  "royal-charge": "spells/bless",
  "rain-of-arrows": "spells/precision",
  "chain-lightning": "spells/chain-lightning",
  prayer: "spells/prayer",
  "earthen-bulwark": "spells/stone-skin",
  "supply-drop": "spells/fortune",
  frenzy: "spells/frenzy",
  inferno: "spells/inferno",
  "lightning-bolt": "spells/lightning-bolt",
  "ice-bolt": "spells/ice-bolt",
  blind: "spells/blind",
  implosion: "spells/implosion",
  cure: "spells/cure",
  "death-ripple": "spells/death-ripple",
  dispel: "spells/dispel",
  forgetfulness: "spells/forgetfulness",
  slayer: "spells/slayer",
  counterstrike: "spells/counterstrike",
  fortune: "spells/fortune"
};

export function playEventSounds(s: GarrisonState, events: readonly GarrisonEvent[]): void {
  bossWhisper(s);
  for (const ev of events) {
    switch (ev.e) {
      case "place": {
        if (ev.kind === "mine") play("spells/land-mine", 0.45, 110, "cue");
        else playCardPlace();
        // A character troop greets the field.
        const placed = DEFENDERS[ev.kind]?.sprite;
        if (placed) voice(placed, "move", 0.55, 2500, true);
        break;
      }
      case "upgrade":
        play("adventure/experience", 0.45, 110, "cue");
        break;
      case "fuse":
        play("spells/clone", 0.5, 110, "cue");
        break;
      case "shell":
        play("spells/stone-skin", 0.45, 110, "cue");
        break;
      case "defShoot": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) {
          const def = DEFENDERS[d.kind]!;
          play(shotKey(def.sprite, def.shot?.projectile), 0.32, 140, "chatter");
          voice(def.sprite, "shoot", 0.4, 8000);
        }
        break;
      }
      case "defStrike": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) {
          const sprite = DEFENDERS[d.kind]!.sprite;
          play(unitKey(sprite, "attack") ?? "mgq/effects/slash9", 0.35, 160, "chatter");
          voice(sprite, "attack", 0.4, 8000);
        }
        break;
      }
      case "enemyBite": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) {
          const sprite = ENEMIES[e.kind]!.sprite;
          play(unitKey(sprite, "attack") ?? "mgq/effects/mon-tume", 0.3, 220, "chatter");
          voice(sprite, "attack", 0.4, 7000);
        }
        break;
      }
      case "enemyCast": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) play(unitKey(ENEMIES[e.kind]!.sprite, "shoot"), 0.32, 200, "chatter");
        break;
      }
      case "enemyDie": {
        const def = ENEMIES[ev.kind];
        if (def?.sprite) play(unitKey(def.sprite, "death") ?? voiceKey(def.sprite, "death"), 0.4, 150);
        if (ev.kind === "banner") play("adventure/hero-defeated", 0.55, 110, "cue");
        break;
      }
      case "defDie": {
        const def = DEFENDERS[ev.kind];
        if (def?.sprite) play(unitKey(def.sprite, "death") ?? voiceKey(def.sprite, "death"), 0.42, 150, "cue");
        break;
      }
      case "defHurt": {
        // Only the voiced troops cry out (a creature's own hurt clip on every bite would drown the lawn).
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) voice(DEFENDERS[d.kind]!.sprite, "hurt", 0.4, 6000);
        break;
      }
      case "gaze":
      case "stoneShot":
        play("spells/death-stare", 0.45);
        break;
      case "heal":
      case "enemyHeal":
        play("spells/cure", 0.3, 400);
        break;
      case "slowCast":
        play("spells/slow", 0.4);
        break;
      case "banish":
        play("spells/teleport", 0.45);
        break;
      case "lightning":
      case "atkLightning":
        play("spells/lightning-bolt", 0.35, 200);
        break;
      case "mine":
        play("spells/land-mine-trigger", 0.55);
        break;
      case "defStun":
        play("spells/paralyze", 0.35, 300);
        break;
      case "shieldBreak":
      case "armorBreak":
        play(ev.e === "armorBreak" ? "spells/shield" : "spells/dispel", 0.4);
        break;
      case "enrage":
        play("spells/berserk", 0.4, 300);
        break;
      case "kegLit":
        play("spells/fire-shield", 0.35, 200);
        break;
      case "keg":
        play("spells/fireball-hit", 0.65, 0);
        play("spells/land-mine-trigger", 0.5, 0);
        break;
      case "stolen":
        play("adventure/pickup-03", 0.3, 250);
        break;
      case "hitscan": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (ev.kind === "flame") play("doom/dsflamst", 0.5, 200, "chatter");
        else if (e) play(unitKey(ENEMIES[e.kind]!.sprite, "shoot"), 0.3, 120, "chatter");
        break;
      }
      case "flame":
        play("doom/dsflamst", 0.5, 200, "chatter");
        break;
      case "defRise":
      case "enemyRise":
        play("spells/resurrection", 0.45);
        break;
      case "teleport":
        play("spells/teleport-in", 0.4);
        break;
      case "surface":
        play("spells/quicksand", 0.4);
        break;
      case "vault": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) play(unitKey(ENEMIES[e.kind]!.sprite, "move"), 0.35, 300);
        break;
      }
      case "fireballAim":
        play("spells/fireball", 0.5);
        break;
      case "blast":
        play(ev.kind === "fire-wall" ? "spells/fire-wall" : ev.kind === "death-breath" ? "spells/death-cloud" : "spells/fireball-hit", 0.6);
        break;
      case "cloudHit":
        play(ev.kind === "cloud" ? "spells/death-cloud" : ev.kind === "fireball" ? "spells/fireball-hit" : ev.kind === "rocket" ? "doom/dsbarexp" : null, 0.35, 250, "chatter");
        break;
      case "projectileHit":
        if (ev.kind === "rocket") play("doom/dsbarexp", 0.4, 160, "chatter");
        else if (ev.kind === "hellfire" || ev.kind === "cacoball" || ev.kind === "baronball" || ev.kind === "soul") play("doom/dsfirxpl", 0.28, 180, "chatter");
        break;
      case "charger":
        play(unitKey(s.cfg.chargerSprite, "attack"), 0.55, 0, "cue");
        play(unitKey(s.cfg.chargerSprite, "move"), 0.5, 0, "cue");
        break;
      case "collect":
        play(`adventure/pickup-0${1 + (ev.id % 7)}`, 0.35, 60, "cue");
        break;
      case "spell":
        play(SPELL_SOUND[ev.spell], 0.55, 0, "cue");
        break;
      case "hugeWave":
        play("effects/horn-2", 0.6, 0, "cue");
        play("ui/time-over", 0.45, 0, "cue");
        break;
      case "wave":
        if (ev.wave === 1) play("adventure/new-week", 0.5, 0, "cue");
        break;
      case "blessingOffer":
        play("adventure/treasure", 0.55, 0, "cue");
        break;
      case "bossAction":
        play(ev.action === "breath" ? "spells/death-cloud" : ev.action === "summon" ? "spells/animate-dead" : unitKey("ghost-dragon", "shoot"), 0.55, 0, "cue");
        break;
      case "raided":
        play("adventure/flag-mine", 0.55, 0, "cue");
        break;
      case "overtime":
        play("ui/time-over", 0.6, 0, "cue");
        break;
      // Order & Chaos
      case "surge": {
        play("spells/mirth", 0.55, 0, "cue");
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) voice(DEFENDERS[d.kind]!.sprite, "ability", 0.65, 1500, true);
        break;
      }
      case "orb":
        play("effects/good-luck", 0.3, 300);
        break;
      case "ascend": {
        play("spells/prayer", 0.75, 0, "cue");
        play("effects/good-luck", 0.5, 0, "cue");
        const sprite = DEFENDERS[ev.kind]?.sprite;
        if (sprite) voice(sprite, "ability", 0.7, 1500, true);
        break;
      }
      case "crown":
        play("effects/good-luck", 0.45, 500, "cue");
        break;
      case "whirl":
        play("spells/death-ripple", 0.45, 200);
        break;
      case "roots":
        play("spells/slow", 0.45, 300);
        break;
      case "blizzard":
        play("spells/frost-ring", 0.55, 300);
        break;
      case "reveal":
        play("effects/danger", 0.3, 800);
        break;
      case "zap":
        play(ev.tint === "frost" ? "spells/ice-bolt-hit" : ev.tint === "fire" ? "spells/fireball-hit" : ev.tint === "bolt" ? "spells/magic-arrow" : "spells/lightning-bolt", 0.3, 180, "chatter");
        break;
      case "snipe":
        play("spells/precision", 0.35, 200);
        break;
      case "bomb":
        play("spells/fireball-hit", 0.4, 150);
        break;
      case "beam":
        play("spells/implosion", 0.5, 200);
        break;
      case "gust":
        play("spells/air-shield", 0.45, 300);
        break;
      case "pounce": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) play(unitKey(DEFENDERS[d.kind]!.sprite, "attack"), 0.45, 150, "chatter");
        break;
      }
      case "shellGift":
        play("spells/shield", 0.3, 400);
        break;
      case "sweep":
        play("spells/death-ripple", 0.5, 200);
        break;
      case "snatchDrop":
        play("effects/danger", 0.5, 300, "cue");
        break;
      case "snatched":
        play("effects/bad-luck", 0.5, 200, "cue");
        break;
      case "horn":
        play("effects/horn-2", 0.6, 0, "cue");
        break;
      case "phase":
        play(ev.on ? "spells/teleport" : "spells/teleport-in", 0.3, 300);
        break;
      case "zig":
      case "blink": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) play(ev.e === "blink" ? "spells/teleport-in" : unitKey(ENEMIES[e.kind]!.sprite, "move"), 0.28, 250);
        break;
      }
      case "dance":
        play("spells/mirth", 0.5, 400);
        play("mgq/effects/applause1", 0.3, 800);
        break;
      case "raiseStart":
        play("spells/animate-dead", 0.45, 300);
        break;
      case "raiseDone":
        play("doom/dsflamst", 0.45, 200);
        break;
      case "raiseFail":
        play("effects/spell-fizzle", 0.4, 300);
        break;
      case "crush":
        play("effects/siege-wall-hit", 0.5, 150);
        break;
      case "pop":
        play("little-busters/effects/bom", 0.55, 0);
        break;
      case "shove":
        play("mgq/effects/hammer", 0.45, 200);
        break;
      case "gasp":
        play("effects/bad-morale", 0.25, 600);
        break;
      case "daze":
        play("spells/blind", 0.3, 400);
        break;
      case "flee":
        play("mgq/effects/run", 0.4, 300);
        break;
      case "escape":
        if (ev.loot > 0) play("effects/bad-luck", 0.45, 300);
        break;
      case "skyAttack":
        // (A Rust Dragon breathes acid, not fire: its "corrode" plays the acid.)
        if (ev.kind === "breath" && s.enemies.some((e) => e.id === ev.id && ENEMIES[e.kind]?.skyAttack?.acid)) break;
        play(ev.kind === "breath" ? "effects/fire-storm" : ev.kind === "spit" ? "spells/lightning-bolt" : "mgq/effects/mon-tume", 0.4, 200);
        break;
      case "divert":
        play("spells/forgetfulness", 0.35, 300);
        break;
      case "magnet":
        play("spells/disrupting-ray", 0.4, 250);
        break;
      case "devour":
        play(ev.whole ? "mgq/effects/bite" : "mgq/effects/mon-tume", 0.5, 150);
        break;
      case "charm":
        play("spells/hypnotize", 0.5, 200);
        break;
      case "kite":
        play("mgq/effects/mon-step", 0.35, 300);
        break;
      // Order & Chaos siegecraft and twists that had no sound yet.
      case "aegis":
        play("spells/protect-air", 0.4, 250);
        break;
      case "reflect":
        play("spells/magic-mirror", 0.4, 200);
        break;
      case "spin":
        play("mgq/effects/resonance", 0.35, 400);
        break;
      case "hex":
        play("spells/curse", 0.45, 250);
        break;
      case "unhex":
        play("spells/dispel", 0.3, 300);
        break;
      case "ladderPlant":
        play("mgq/effects/hammer", 0.45, 250);
        break;
      case "ladder":
      case "climb":
        play("mgq/effects/mon-step", 0.3, 300);
        break;
      case "lure":
        play("effects/good-morale", 0.35, 500);
        break;
      case "lizardCharge":
        play(unitKey("lizard-warrior", "attack"), 0.5, 0);
        play("effects/horn-3", 0.45, 400);
        break;
      case "blownAway":
        play("mgq/effects/mon-wind4", 0.4, 250);
        break;
      case "evade":
        play("effects/siege-wall-miss", 0.3, 250);
        break;
      case "swerve": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) play(unitKey(ENEMIES[e.kind]!.sprite, "move"), 0.3, 400);
        break;
      }
      case "fling": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) play(unitKey(ENEMIES[e.kind]!.sprite, "attack"), 0.5, 200);
        play("mgq/effects/blow8", 0.4, 200);
        break;
      }
      case "mineLaid":
        play("spells/land-mine", 0.4, 300);
        break;
      case "descend":
        play("spells/sorrow", 0.35, 300);
        break;
      case "dismiss":
        play("spells/remove-obstacle", 0.4, 200);
        break;
      case "blessing":
        play("spells/bless", 0.5, 0, "cue");
        break;
      // Order & Chaos content pass.
      case "band":
        play("effects/good-morale", 0.45, 200);
        break;
      case "leap":
        play("effects/siege-wall-hit", 0.55, 0);
        if (ev.fire) play("spells/fireball-hit", 0.5, 0);
        break;
      case "bash":
        play("mgq/effects/hammer", 0.45, 150);
        play("spells/shield", 0.3, 400);
        break;
      case "quickdraw":
        // A burst is several shots, a fraction of a second apart (the throttle keeps it crisp).
        play("mgq/effects/gun2", 0.3, 90, "chatter");
        break;
      case "gas":
        play(ev.big ? "spells/poison" : "spells/disease", ev.big ? 0.5 : 0.18, ev.big ? 0 : 2500);
        break;
      case "maw":
        play(ev.whole ? "effects/death-blow" : "mgq/effects/hammer", 0.5, 150);
        break;
      case "allies":
        play("mgq/effects/cat", 0.45, 400);
        break;
      case "bowl":
        play("mgq/effects/blow8", 0.45, 120, "chatter");
        break;
      case "dash":
        play("mgq/effects/slash9", 0.5, 0);
        play("mgq/effects/sword4", 0.35, 0);
        break;
      case "slam":
        play("effects/siege-wall-hit", 0.5, 200);
        play("spells/quicksand", 0.3, 800);
        break;
      case "shockwave":
        play("spells/force-field", 0.5, 0);
        break;
      case "radiance":
        play("spells/prayer", 0.6, 0);
        play("mgq/effects/heal5", 0.4, 0);
        break;
      case "grab":
        play("mgq/effects/bite", 0.45, 250);
        break;
      case "incinerate":
        play("mgq/effects/mon-fire1", 0.55, 150);
        play("spells/fire-shield", 0.35, 300);
        break;
      case "douse":
        play("effects/spell-fizzle", 0.4, 300);
        break;
      case "knight":
        play("spells/stone-skin", 0.4, 400);
        break;
      case "parasol":
        play("spells/magic-mirror", 0.4, 250);
        break;
      case "drop":
        play("effects/fear", 0.35, 500);
        break;
      case "encase":
        play("spells/ice-bolt", 0.45, 250);
        play("spells/frost-ring", 0.3, 600);
        break;
      case "thaw":
        play("effects/regeneration", 0.35, 400);
        break;
      case "foeWhirl":
        play("mgq/effects/slash6", 0.5, 150);
        break;
      case "foeSlam":
        play("effects/siege-wall-hit", 0.6, 0);
        break;
      case "bossEnter":
        play("effects/horn-4", 0.5, 2000, "cue");
        play("spells/earthquake", 0.35, 2000, "cue");
        evilLaugh(1100);
        break;
      case "bossCue": {
        play(ev.move === "drums" ? "effects/horn-3" : "effects/fear", 0.35, 300, "cue");
        // A phase's set piece (it can't be harmed while it winds up) always laughs; other moves now and then.
        const boss = s.enemies.find((e) => e.id === ev.id);
        if (boss?.interlude || Math.random() < 0.25) evilLaugh(boss?.interlude ? 250 : 0);
        break;
      }
      case "bossMove":
        if (ev.move === "slam" || ev.move === "pounce" || ev.move === "roar") play("spells/earthquake", 0.45, 300, "cue");
        else if (ev.move === "breath") play("effects/acid-breath", 0.45, 300, "cue");
        else if (ev.move === "volley") play("units/catapult-shoot", 0.45, 300, "cue");
        else if (ev.move === "summon") play("spells/teleport-in", 0.4, 300, "cue");
        else if (ev.move === "graves") play("spells/animate-dead", 0.4, 300, "cue");
        else if (ev.move === "drums") play("spells/bloodlust", 0.45, 300, "cue");
        else play("spells/teleport", 0.35, 300, "cue");
        // Bones rattle under its blows; the dead it calls wail.
        if (ev.move === "slam" || ev.move === "pounce") play("units/bone-dragon-defend", 0.38, 700, "cue");
        else if (ev.move === "graves") play("units/skeleton-move", 0.4, 700, "cue");
        else if (ev.move === "summon") play("units/wraith-attack", 0.32, 900, "cue");
        else if (ev.move === "stride") play("units/ghost-dragon-move", 0.32, 900, "cue");
        break;
      case "bossPhase":
        play("spells/berserk", 0.5, 500, "cue");
        evilLaugh(350);
        break;
      case "bossRepel":
        play("spells/earthquake", 0.4, 400, "cue");
        break;
      case "bossFall":
        play("effects/horn-5", 0.55, 2000, "cue");
        break;
      case "unnerved":
        play("spells/bloodlust", 0.4, 400);
        play("effects/horn-2", 0.3, 1500);
        break;
      case "assassinate":
        play("spells/teleport-in", 0.35, 200);
        play("mgq/effects/sword3", 0.5, 150);
        break;
      // Summoning Portal exclusives.
      case "guardian":
        play("spells/resurrection", 0.5, 300);
        break;
      case "crystal":
        play("spells/ice-bolt", 0.45, 250);
        break;
      case "shatter":
        play("spells/frost-ring", 0.5, 150);
        break;
      case "lucky":
        play("effects/good-luck", 0.3, 1500);
        break;
      case "corrode":
        play("effects/acid-breath", 0.4, 300);
        break;
      default:
        break;
    }
  }
}
