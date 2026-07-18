/**
 * Adventure-map audio cues, fulfilling the audio hook documented on
 * ADVENTURE_FEED_CUES: every feed cue name maps to a converted Heroes III
 * sound from /public/sounds, and FIELD_VISITED upgrades to a per-location
 * sound where the original game had one. Movement plays the terrain's horse
 * loop, tiles announce their reveal/placement. All tables are plain data -
 * tweaking a sound is a one-line change.
 */

/** Feed cue name (ADVENTURE_FEED_CUES) -> sound manifest key. null = silent. */
export const MAP_CUE_SOUNDS: Record<string, string | null> = {
  visit: null, // per-location sounds below; generic visits stay quiet
  flag: "adventure/flag-mine",
  coins: "adventure/pickup-03",
  pay: "adventure/store",
  dice: null, // the dice tray is its own spectacle
  experience: "adventure/experience",
  "level-up": "adventure/hero-new-level",
  morale: "adventure/morale",
  "quick-combat": "adventure/military",
  "combat-start": "adventure/military",
  // A battle starting picks one of the eight H3 combat-start stings at random
  // (music/battle is a `random` pool of battle-00..07). The looping in-combat
  // theme (music/combat-02) is separate, set by the combat music scene.
  "battle-begin": "music/battle",
  reveal: "adventure/mystery",
  "combat-end": null, // the combat screen carries its own audio
  retreat: "adventure/hero-defeated",
  trade: "adventure/store",
  recruit: "adventure/military",
  income: null,
  build: "adventure/build-town",
  astrologers: "adventure/new-week",
  // The big EventDrawnOverlay plays the draw chime; the feed line stays silent
  // so a drawn Event does not double up its sound.
  event: null,
  swap: null,
  options: null,
  // A NEW member walking into the room: a soft sting so the table notices.
  join: "adventure/mystery",
  victory: "adventure/ultimate-artifact"
};

/**
 * Location audio on FIELD_VISITED.
 *
 * - `sfx` — VCMI `sounds.visit` one-shot (plays first).
 * - `ambient` — optional LOOP* ambience (plays after the sfx; still fine, not wrong).
 *
 * Plain string = sfx only (legacy shape).
 */
export type LocationVisitAudio = string | { sfx: string; ambient?: string };

/**
 * Expand a location's visit audio to an ordered list: sfx first, ambient after
 * (feed player staggers by ~220ms so ambient lands after the one-shot).
 */
export function locationVisitSoundKeys(location: string): string[] {
  const entry = LOCATION_VISIT_SOUNDS[location];
  if (!entry) {
    return [];
  }
  if (typeof entry === "string") {
    return [entry];
  }
  return entry.ambient ? [entry.sfx, entry.ambient] : [entry.sfx];
}

/**
 * Visit wiring from VCMI `sounds.visit` (+ ambient where the object has LOOP*).
 * H3 names: TEMPLE, STORE, GAZEBO, MORALE, LUCK, EXPERNCE, CAVEHEAD, LIGHTHOUSE,
 * FLAGMINE, CHEST, TREASURE, GETPROTECTION, ROGUE, MYSTERY, TELPTOUT…;
 * FAERIE/GENIE reuse the same WAVs as the unit specials in our library.
 */
export const LOCATION_VISIT_SOUNDS: Record<string, LocationVisitAudio> = {
  temple: "adventure/temple",
  temple_of_the_sea: "adventure/temple-of-the-sea",
  obelisk: "adventure/mystery", // VCMI visit MYSTERY
  fountain_of_youth: { sfx: "adventure/morale", ambient: "ambient/fountain" },
  mystical_garden: { sfx: "adventure/experience", ambient: "ambient/garden" },
  magic_spring: { sfx: "units/faerie-dragon-special", ambient: "ambient/magic" },
  warriors_tomb: "adventure/graveyard",
  grave: "adventure/graveyard",
  witch_hut: "adventure/gazebo",
  scholar: "adventure/gazebo",
  treasure_symbol: "adventure/chest",
  sea_chest: "adventure/chest",
  artifact_symbol: "adventure/treasure",
  sanctuary: { sfx: "adventure/get-protection", ambient: "ambient/sanctuary" },
  trading_post: { sfx: "adventure/store", ambient: "ambient/market" },
  market_of_time: { sfx: "adventure/store", ambient: "ambient/market" },
  black_market: { sfx: "adventure/mystery", ambient: "ambient/market" },
  tavern: { sfx: "adventure/store", ambient: "ambient/tavern" },
  stables: { sfx: "adventure/store", ambient: "ambient/stables" },
  shrine_of_magic_incantation: { sfx: "adventure/temple", ambient: "ambient/shrine" },
  shrine_of_magic_gesture: { sfx: "adventure/temple", ambient: "ambient/shrine" },
  windmill: { sfx: "units/genie-special", ambient: "ambient/windmill" },
  water_wheel: { sfx: "units/genie-special", ambient: "ambient/mill" },
  mine: { sfx: "adventure/flag-mine", ambient: "ambient/mine" },
  star_axis: { sfx: "adventure/gazebo", ambient: "ambient/star-axis" },
  subterranean_gate: { sfx: "adventure/cave-visit", ambient: "ambient/subterranean-gate" },
  redwood_observatory: "adventure/lighthouse",
  pandoras_box: "adventure/mystery",
  faerie_ring: { sfx: "adventure/luck", ambient: "ambient/faerie-ring" },
  hill_fort: "adventure/military",
  buoy: { sfx: "adventure/morale", ambient: "ambient/buoy" },
  // Board Mermaid ≈ VCMI mermaids (LUCK); ambient keeps the sea/siren bed.
  mermaid: { sfx: "adventure/luck", ambient: "ambient/sirens" },
  derelict_ship: { sfx: "adventure/rogue", ambient: "ambient/ocean" },
  shipwreck: { sfx: "adventure/rogue", ambient: "ambient/ocean" },
  shipwreck_survivor: "adventure/treasure",
  sea_barrel: { sfx: "units/genie-special", ambient: "ambient/ocean" },
  flotsam: { sfx: "units/genie-special", ambient: "ambient/ocean" },
  jetsam: { sfx: "units/genie-special", ambient: "ambient/ocean" }
};

/** Tile lifecycle sounds. */
export const TILE_SOUNDS = {
  revealed: "adventure/mystery",
  placed: "adventure/dig"
} as const;

/**
 * Hero movement: terrain -> converted horse loop. Terrains without their own
 * recording reuse the closest original one.
 */
export const TERRAIN_MOVE_SOUNDS: Record<string, string> = {
  grass: "adventure/horse-grass",
  dirt: "adventure/horse-dirt",
  snow: "adventure/horse-snow",
  swamp: "adventure/horse-swamp",
  lava: "adventure/horse-lava",
  subterranean: "adventure/horse-subterranean",
  rough: "adventure/horse-rough",
  highlands: "adventure/horse-grass",
  sand: "adventure/horse-sand",
  water: "adventure/horse-water",
  cursed: "adventure/horse-dirt"
};

/**
 * Per-object map teleport VISIT sounds — from VCMI object configs (the H3
 * engine data), not ambient loops:
 *   monolithOneWayEntrance / monolithTwoWay → visit TELPTOUT
 *   whirlpool → visit DANGER
 *   subterraneanGate → visit CAVEHEAD
 * Colored Gates reuse the two-way Monolith visit (same travel mechanic).
 * Ambient LOOPMON/LOOPWHIR/LOOPGATE stay map-object ambience, not travel SFX.
 */
export type MapTeleportKind = "monolith" | "gate" | "whirlpool" | "subterranean" | "spell";

export const MAP_TELEPORT_SOUNDS: Record<MapTeleportKind, string> = {
  monolith: "spells/teleport", // TELPTOUT
  gate: "spells/teleport", // TELPTOUT (teleport gate / two-way monolith)
  whirlpool: "effects/danger", // DANGER
  subterranean: "adventure/cave-visit", // CAVEHEAD
  spell: "spells/teleport" // TELPTOUT (Dimension Door / Town Portal / Castle Gate)
};

/** Default teleport-gate clip (TELPTOUT). Prefer MAP_TELEPORT_SOUNDS for kinds. */
export const MAP_TELEPORT_SOUND = MAP_TELEPORT_SOUNDS.gate;

/**
 * Sound for a batch of hero moves. Any teleported step uses its object/spell
 * clip over the destination terrain's horse loop.
 */
export function heroMoveSoundKey(
  moves: ReadonlyArray<{ teleport?: MapTeleportKind | boolean }>,
  destinationTerrain?: string | null
): string {
  for (const move of moves) {
    if (!move.teleport) {
      continue;
    }
    // Legacy boolean true (pre-kind) → generic spell teleport cast.
    if (move.teleport === true) {
      return MAP_TELEPORT_SOUNDS.spell;
    }
    return MAP_TELEPORT_SOUNDS[move.teleport] ?? MAP_TELEPORT_SOUNDS.spell;
  }
  return TERRAIN_MOVE_SOUNDS[destinationTerrain ?? "grass"] ?? TERRAIN_MOVE_SOUNDS.grass;
}

export const MAP_CUE_VOLUME = 0.5;
export const MAP_MOVE_VOLUME = 0.35;
