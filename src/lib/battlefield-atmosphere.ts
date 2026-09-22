/** Visual vocabulary only. Combat rules live in the authoritative engine. */
export type BattlefieldAtmosphereTheme =
  | "fog" | "ash" | "heat" | "mud" | "sun" | "rock" | "fey" | "wind" | "clear"
  | "rain" | "snow" | "quake" | "water" | "dust" | "miasma" | "void";

export type BattlefieldAtmosphereProfile = {
  theme: BattlefieldAtmosphereTheme;
  tile: number;
  tint: string;
  count: number;
  size: number;
  alpha: number;
  drift: [number, number];
};

export const BATTLEFIELD_ATMOSPHERES: Record<BattlefieldAtmosphereTheme, BattlefieldAtmosphereProfile> = {
  fog: { theme: "fog", tile: 0, tint: "#b9d5df", count: 14, size: .3, alpha: .16, drift: [.018, -.003] },
  ash: { theme: "ash", tile: 1, tint: "#d7a079", count: 48, size: .045, alpha: .4, drift: [.05, .06] },
  heat: { theme: "heat", tile: 2, tint: "#e99040", count: 23, size: .14, alpha: .22, drift: [.012, -.035] },
  mud: { theme: "mud", tile: 3, tint: "#baa383", count: 22, size: .1, alpha: .3, drift: [.018, .09] },
  sun: { theme: "sun", tile: 4, tint: "#efcc79", count: 12, size: .23, alpha: .14, drift: [.01, .006] },
  rock: { theme: "rock", tile: 5, tint: "#d2b98c", count: 24, size: .09, alpha: .25, drift: [.022, .012] },
  fey: { theme: "fey", tile: 6, tint: "#b8a3ec", count: 26, size: .09, alpha: .35, drift: [.014, -.022] },
  wind: { theme: "wind", tile: 7, tint: "#b8daca", count: 20, size: .2, alpha: .22, drift: [.13, -.022] },
  clear: { theme: "clear", tile: 8, tint: "#fff0b8", count: 13, size: .2, alpha: .14, drift: [.009, .004] },
  rain: { theme: "rain", tile: 9, tint: "#98c5dd", count: 65, size: .085, alpha: .34, drift: [.08, .42] },
  snow: { theme: "snow", tile: 10, tint: "#c8e9f4", count: 46, size: .018, alpha: .5, drift: [.025, .055] },
  quake: { theme: "quake", tile: 11, tint: "#d0ad71", count: 23, size: .17, alpha: .23, drift: [.02, -.014] },
  water: { theme: "water", tile: 12, tint: "#81c5d1", count: 24, size: .14, alpha: .24, drift: [.012, .013] },
  dust: { theme: "dust", tile: 13, tint: "#dbbf8c", count: 32, size: .04, alpha: .28, drift: [.035, -.005] },
  miasma: { theme: "miasma", tile: 14, tint: "#9fdb9b", count: 19, size: .2, alpha: .18, drift: [.013, -.018] },
  void: { theme: "void", tile: 15, tint: "#a6a5d6", count: 16, size: .2, alpha: .19, drift: [-.023, .004] }
};

export const CONDITION_ATMOSPHERE: Record<string, BattlefieldAtmosphereTheme> = {
  "dense-fog": "fog", "raining-ash": "ash", "scorching-earth": "heat",
  "sinking-mud": "mud", "clear-skies": "sun", "rocky-terrain": "rock",
  "fey-trickery": "fey", "tail-wind": "wind", "perfect-conditions": "clear"
};

export const SCRIPT_ATMOSPHERE: Record<string, BattlefieldAtmosphereTheme> = {
  pve_dungeon_classic_shallow: "rain", pve_dungeon_classic_deep: "dust",
  pve_dungeon_classic_abyss: "void", pve_dungeon_doom_shallow: "miasma",
  pve_dungeon_doom_deep: "heat", pve_dungeon_doom_abyss: "heat",
  pve_lair_healing_miasma: "miasma", pve_lair_flooded: "water",
  pve_lair_ash_storm: "ash", pve_lair_thickening_nest: "fog",
  pve_lair_unmaking_presence: "void", bi_canh_spirit_mist: "fog",
  bi_canh_earthvein_surge: "quake"
};

/** Stable spatial variation, independent of the game's random number stream. */
export function atmosphereNoise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}
