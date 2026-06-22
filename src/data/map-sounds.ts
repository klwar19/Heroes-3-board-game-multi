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
  swap: null,
  options: null,
  victory: "adventure/ultimate-artifact"
};

/**
 * Location-flavored visit sounds (FIELD_VISITED), matching the original
 * game's adventure-map location loops wherever one exists.
 */
export const LOCATION_VISIT_SOUNDS: Record<string, string> = {
  temple: "adventure/temple",
  temple_of_the_sea: "adventure/temple",
  obelisk: "adventure/obelisk",
  fountain_of_youth: "ambient/fountain",
  mystical_garden: "ambient/garden",
  magic_spring: "ambient/magic",
  warriors_tomb: "adventure/graveyard",
  grave: "adventure/graveyard",
  witch_hut: "adventure/gazebo",
  scholar: "adventure/gazebo",
  treasure_symbol: "adventure/chest",
  sea_chest: "adventure/chest",
  artifact_symbol: "adventure/treasure",
  sanctuary: "ambient/sanctuary",
  trading_post: "ambient/market",
  market_of_time: "ambient/market",
  black_market: "ambient/market",
  tavern: "ambient/tavern",
  stables: "ambient/stables",
  shrine_of_magic_incantation: "ambient/shrine",
  shrine_of_magic_gesture: "ambient/shrine",
  windmill: "ambient/windmill",
  water_wheel: "ambient/mill",
  mine: "ambient/mine",
  star_axis: "ambient/star-axis",
  subterranean_gate: "ambient/subterranean-gate",
  redwood_observatory: "adventure/mystery",
  pandoras_box: "adventure/mystery",
  faerie_ring: "ambient/faerie-ring",
  hill_fort: "adventure/military",
  buoy: "ambient/buoy",
  mermaid: "ambient/sirens",
  derelict_ship: "ambient/ocean",
  shipwreck: "ambient/ocean",
  shipwreck_survivor: "adventure/quest",
  sea_barrel: "ambient/ocean",
  flotsam: "ambient/ocean",
  jetsam: "ambient/ocean"
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

export const MAP_CUE_VOLUME = 0.5;
export const MAP_MOVE_VOLUME = 0.35;
