import type {
  PveEncounterTheme,
  ResolvedPveEncounterTheme,
  WaveDefeatLimit,
  WavePressure
} from "./state";

export const PVE_THEME_LABELS: Record<PveEncounterTheme, string> = {
  classic: "Erathian calamities",
  doom: "Doom invasion",
  random: "Random theme"
};

export const WAVE_PRESSURE_LABELS: Record<WavePressure, string> = {
  standard: "Standard",
  brutal: "Brutal"
};

export const WAVE_DEFEAT_LIMIT_LABELS: Record<WaveDefeatLimit, string> = {
  0: "Pillage only",
  2: "Eliminated after 2 losses",
  3: "Eliminated after 3 losses"
};

/**
 * Resolve the lobby's Random choice once, deterministically, when the game is
 * built. `doomAllowed` (default true, so every existing caller is unchanged)
 * gates the Doom theme to the ANIME mod: with it false, an explicit "doom" pick
 * AND a "random" roll both collapse to "classic", so a WOG-only PvE game can
 * never mint Doom armies/bosses.
 */
export function resolvePveEncounterTheme(
  requested: PveEncounterTheme | undefined,
  seed: string,
  doomAllowed = true
): ResolvedPveEncounterTheme {
  if (requested === "classic") {
    return "classic";
  }
  if (requested === "doom") {
    return doomAllowed ? "doom" : "classic";
  }
  if (!doomAllowed) {
    return "classic";
  }
  let hash = 2166136261;
  for (const character of `${seed}#pve-theme`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? "classic" : "doom";
}

export type WaveBattleEvent = {
  id: string;
  name: string;
  description: string;
  neutralAttack?: number;
  neutralDefense?: number;
  neutralInitiative?: number;
};

// The rotation order IS the wave→event map (waveBattleEventFor indexes by
// wave−1): wave 1/4/7 → Attack, wave 2/5/8 → Initiative, wave 3/6/9 → Defense
// (USER RULE 2026-08-19 — the Initiative and Defense rotations swapped so the
// early waves come at a run before the later ones dig in).
const CLASSIC_WAVE_EVENTS: readonly WaveBattleEvent[] = [
  {
    id: "war_drums",
    name: "War Drums",
    description: "The horde surges: every invading unit gains +1 Attack.",
    neutralAttack: 1
  },
  {
    id: "stampede",
    name: "Stampede",
    description: "The assault begins at a run: every invading unit gains +2 Initiative.",
    neutralInitiative: 2
  },
  {
    id: "shield_wall",
    name: "Shield Wall",
    description: "The invaders close ranks: every invading unit gains +1 Defense.",
    neutralDefense: 1
  }
];

const DOOM_WAVE_EVENTS: readonly WaveBattleEvent[] = [
  {
    id: "berserk_pack",
    name: "Berserk Pack",
    description: "Hell's vanguard tears forward: every demon gains +1 Attack.",
    neutralAttack: 1
  },
  {
    id: "teleport_ambush",
    name: "Teleport Ambush",
    description: "The gate spits the host into striking range: every demon gains +2 Initiative.",
    neutralInitiative: 2
  },
  {
    id: "infernal_hide",
    name: "Infernal Hide",
    description: "Hellfire hardens the assault: every demon gains +1 Defense.",
    neutralDefense: 1
  }
];

/** A deterministic event rotation: every wave has a visible, mechanically real modifier. */
export function waveBattleEventFor(
  theme: ResolvedPveEncounterTheme,
  wave: number
): WaveBattleEvent {
  const events = theme === "doom" ? DOOM_WAVE_EVENTS : CLASSIC_WAVE_EVENTS;
  return events[Math.max(0, wave - 1) % events.length]!;
}

export type WaveEconomyProfile = {
  winGold: number;
  winXp: number;
  treasureFromWave: number;
  pillageGold: number;
  pillageMorale: number;
};

export function waveEconomyProfile(pressure: WavePressure | undefined): WaveEconomyProfile {
  return pressure === "brutal"
    ? { winGold: 3, winXp: 2, treasureFromWave: 2, pillageGold: 5, pillageMorale: -1 }
    : { winGold: 2, winXp: 1, treasureFromWave: 3, pillageGold: 3, pillageMorale: 0 };
}

export function pveThemeFieldArt(
  kind: "calamity_gate" | "rift_lair" | "dungeon_gate",
  theme: ResolvedPveEncounterTheme | undefined
): string {
  return `/assets/bosses/${kind}_${theme === "doom" ? "doom" : "classic"}.webp`;
}
