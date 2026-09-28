/**
 * Garrison Wars sounds: each simulation event maps onto the converted
 * Heroes III library (units/<creature>-<action>, spells/…, adventure/…).
 * Throttled so a big wave does not turn into noise.
 */

import manifest from "../../../public/sounds/manifest.json";
import { DEFENDERS, ENEMIES, type SpellId } from "@/engine/garrison/content";
import type { GarrisonEvent, GarrisonState } from "@/engine/garrison/sim";
import { playCardPlace, playLibrarySound } from "@/lib/sound";

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
  "wog-werewolf": "nomad"
};

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

const lastPlayed = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;

function play(key: string | null, volume = 0.5, gap = 110): void {
  if (!key || !LIBRARY[key]) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - (lastPlayed.get(key) ?? -1e9) < gap) return;
  if (now - windowStart > 1000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= 14) return;
  windowCount += 1;
  lastPlayed.set(key, now);
  playLibrarySound(key, volume);
}

const SPELL_SOUND: Record<SpellId, string> = {
  "magic-arrow": "spells/magic-arrow",
  "frost-ring": "spells/frost-ring",
  haste: "spells/haste",
  "meteor-shower": "spells/meteor-shower",
  armageddon: "spells/armageddon",
  earthquake: "spells/earthquake",
  "war-cry": "spells/bloodlust",
  resurrection: "spells/resurrection"
};

export function playEventSounds(s: GarrisonState, events: readonly GarrisonEvent[]): void {
  for (const ev of events) {
    switch (ev.e) {
      case "place": {
        if (ev.kind === "mine") play("spells/land-mine", 0.45);
        else playCardPlace();
        break;
      }
      case "upgrade":
        play("adventure/experience", 0.45);
        break;
      case "fuse":
        play("spells/clone", 0.5);
        break;
      case "shell":
        play("spells/stone-skin", 0.45);
        break;
      case "defShoot": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) play(unitKey(DEFENDERS[d.kind]!.sprite, "shoot"), 0.32, 140);
        break;
      }
      case "defStrike": {
        const d = s.defenders.find((unit) => unit.id === ev.id);
        if (d) play(unitKey(DEFENDERS[d.kind]!.sprite, "attack"), 0.35, 160);
        break;
      }
      case "enemyBite": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) play(unitKey(ENEMIES[e.kind]!.sprite, "attack"), 0.3, 220);
        break;
      }
      case "enemyCast": {
        const e = s.enemies.find((unit) => unit.id === ev.id);
        if (e) play(unitKey(ENEMIES[e.kind]!.sprite, "shoot"), 0.32, 200);
        break;
      }
      case "enemyDie": {
        const def = ENEMIES[ev.kind];
        if (def?.sprite) play(unitKey(def.sprite, "death"), 0.4, 150);
        if (ev.kind === "banner") play("adventure/hero-defeated", 0.55);
        break;
      }
      case "defDie": {
        const def = DEFENDERS[ev.kind];
        if (def?.sprite) play(unitKey(def.sprite, "death"), 0.42, 150);
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
        if (ev.kind === "flame") play("doom/dsflamst", 0.5, 200);
        else if (e) play(unitKey(ENEMIES[e.kind]!.sprite, "shoot"), 0.3, 120);
        break;
      }
      case "flame":
        play("doom/dsflamst", 0.5, 200);
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
        play(ev.kind === "cloud" ? "spells/death-cloud" : ev.kind === "fireball" ? "spells/fireball-hit" : ev.kind === "rocket" ? "doom/dsbarexp" : null, 0.35, 250);
        break;
      case "projectileHit":
        if (ev.kind === "rocket") play("doom/dsbarexp", 0.4, 160);
        else if (ev.kind === "hellfire" || ev.kind === "cacoball" || ev.kind === "baronball" || ev.kind === "soul") play("doom/dsfirxpl", 0.28, 180);
        break;
      case "charger":
        play(unitKey(s.cfg.chargerSprite, "attack"), 0.55, 0);
        play(unitKey(s.cfg.chargerSprite, "move"), 0.5, 0);
        break;
      case "collect":
        play(`adventure/pickup-0${1 + (ev.id % 7)}`, 0.35, 60);
        break;
      case "spell":
        play(SPELL_SOUND[ev.spell], 0.55, 0);
        break;
      case "hugeWave":
        play("effects/horn-2", 0.6, 0);
        play("ui/time-over", 0.45, 0);
        break;
      case "wave":
        if (ev.wave === 1) play("adventure/new-week", 0.5, 0);
        break;
      case "blessingOffer":
        play("adventure/treasure", 0.55, 0);
        break;
      case "bossAction":
        play(ev.action === "breath" ? "spells/death-cloud" : ev.action === "summon" ? "spells/animate-dead" : unitKey("ghost-dragon", "shoot"), 0.55, 0);
        break;
      case "raided":
        play("adventure/flag-mine", 0.55, 0);
        break;
      case "overtime":
        play("ui/time-over", 0.6, 0);
        break;
      default:
        break;
    }
  }
}
