/**
 * Order & Chaos: the battlefield. Any level can switch these systems on through
 * its cfg.oc fields (set from the level definition in ./campaign.ts); the rules
 * themselves are in ../sim.ts, each gated by its field. They mirror Plants vs.
 * Zombies' proven designs, re-themed to Heroes III:
 *
 * - `tiles`: lawn tiles. WATER (the pool: troops need a Raft to stand there —
 *   the Lily Pad — unless they swim; foes wade slower; fire fizzles on waders,
 *   lightning runs through the water), BRIDGES (planks over the water), the
 *   ROOF (troops need a Crate — the Flower Pot) and its RIDGE (stops straight
 *   shots crossing it, so lobbers matter), RUINS (nothing stands there; they
 *   stop straight shots both ways), BRAMBLES (foes crawl through and are cut;
 *   nothing is planted until fire burns them away) and CLOVER (the troop on it
 *   acts faster).
 * - Tile states the battle makes: ICE laid by a Frost Mammoth (the Zomboni:
 *   nothing is planted there until it melts or fire melts it; Sledge Wolves
 *   slide across it — the Bobsled Team) and CRATERS left by a Magma
 *   Elemental's eruption (the Doom-shroom).
 * - `night`: a night battle (no gold falls; nocturnal troops — the mushrooms —
 *   are awake; by day they sleep until given a Wake-Up Brew, the Coffee Bean).
 * - `weather`: rain, fog (the Fog levels: a Lamplighter or Pillar of Fire
 *   lights it — the Plantern — and a Sylph's gale blows it off — the Blover),
 *   blizzard, sandstorm or thunderstorm, from the start or turning at a wave.
 * - `landmarks`: Lawful buildings on the lawn (Windmill, Magic Well, Shrine of
 *   Magic, Pillar of Fire) that work while they stand; the horde wrecks them.
 * - `structures` / `banks`: Chaos structures — crypts the dead climb out of,
 *   treasure chests to break open (thieves loot them), and creature banks
 *   guarded by sleeping foes, holding a troop that joins you when freed.
 * - `origins`: part of each wave surfaces from the water, drops from the sky
 *   (the Bungee Zombie) or climbs out of tunnels behind the lines.
 * - `fieldCards`: packets the field hands out on top of the chosen hand (Raft,
 *   Crate, Rooting Boar — the Grave Buster —, Wake-Up Brew).
 *
 * This module holds the types both sides share, the numbers the simulation
 * reads, and the catalog (name, icon, one-line rule, Crag Hack's first-time
 * line) the prep screen, the Almanac and the battle HUD show — built from the
 * same numbers so the text cannot drift from the rules. Pure data: it imports
 * only types from the simulation's modules.
 */

import { GW_TPS, sec } from "../clock";
import type { CardId, DefKind, EnemyKind } from "../content";
import type { OcLine } from "./story";

// ---------------------------------------------------------------------------
// Types

/**
 * A lawn tile's feature (level data). WATER and the ROOF need footing before a
 * troop stands there: a Raft on water (aquatic troops need none), a Crate on the
 * roof; the roof's RIDGE also stops straight shots crossing it.
 */
export type FieldTileKind = "water" | "bridge" | "ruins" | "bramble" | "clover" | "roof" | "ridge";
export type FieldTile = { lane: number; col: number; kind: FieldTileKind };

/** Tile codes in FieldState.grid (0: plain lawn). */
export const TILE: Readonly<Record<FieldTileKind, number>> = { water: 1, bridge: 2, ruins: 3, bramble: 4, clover: 5, roof: 6, ridge: 7 };
export const TILE_KIND: readonly (FieldTileKind | undefined)[] = [undefined, "water", "bridge", "ruins", "bramble", "clover", "roof", "ridge"];

/** Lawn columns (GW_COLS in ../content; repeated here so this module stays import-free). */
export const FIELD_COLS = 9;
export const FIELD_LANES = 5;

/**
 * The lawn in play (GarrisonState.field), one entry per tile at lane * 9 + col
 * (flat arrays: O(1) lookups in the per-tick loops).
 */
export type FieldState = {
  /** TILE code (0: plain lawn; a burnt bramble turns back to 0). */
  grid: number[];
  /** 1 where footing has been laid (a Raft on water, a Crate on the roof). */
  footing: number[];
  /** Tick the ice there melts (0: no ice). */
  ice: number[];
  /** Tick the crater there fills in (0: none). */
  crater: number[];
  /** Bumped whenever grid or footing change (the renderer re-bakes its tile layer). */
  rev: number;
};

export type WeatherKind = "clear" | "rain" | "fog" | "blizzard" | "sandstorm" | "thunderstorm";
/** The weather from wave `wave` on (unset or 0: from the start). */
export type WeatherStep = { kind: WeatherKind; wave?: number };

/** Where part of each wave comes from besides the far end of the road. */
export type OriginKind = "water" | "sky" | "flank";
/** `share`: the chance each foe of a wave takes this way in (from wave `from`). */
export type SpawnOrigin = { kind: OriginKind; share: number; from?: number };

/** A landmark or a Chaos structure standing on a lawn tile from the start. */
export type FieldSpot<K extends string> = { kind: K; lane: number; col: number };
/** A creature bank and the Chaos foes sleeping around it. */
export type BankSpot = { kind: EnemyKind; lane: number; col: number; guards: EnemyKind[] };

/** The weather in play (GarrisonState.weather). */
export type WeatherState = {
  kind: WeatherKind;
  /** Index of the WeatherStep in force. */
  step: number;
  since: number;
  /** Thunderstorm: when the next strike is marked, and the marked tiles (struck at `at`). */
  strikeAt: number;
  marks: { lane: number; col: number; at: number }[];
  /** Fog: per lane, cleared by a Sylph's gale until this tick. */
  clear: number[];
  /** Fog: lanes lit this tick (a bit per lane), by lights (Lamplighters, Pillars of Fire). */
  lit: number;
};

// ---------------------------------------------------------------------------
// Numbers (read by ../sim.ts and the rules text below)

export const FIELD = {
  /** Foes wading through open water march and strike at this share of their pace. */
  wade: 0.75,
  /** Fire on a foe standing in water deals this share. */
  wetFire: 0.5,
  /** Lightning striking a wading foe jolts every other wading foe within `conductReach` tiles (its lane and the two beside it) for this share. */
  conduct: 0.5,
  conductReach: 2,
  /** Foes in brambles: their pace, and the thorns' damage a second. */
  bramble: 0.5,
  brambleDps: 20,
  /** The troop standing on clover acts this much faster. */
  clover: 1.25,
  /** Ice laid by a Frost Mammoth melts after this long (fire melts it at once). */
  iceMelt: sec(25),
  /** A Magma Elemental's crater fills in after this long. */
  crater: sec(40),
  /** Fog: foes further than this from the gate are hidden unless their lane is lit. */
  fogLine: 5,
  /** A Sylph's gale clears the fog from its lane for this long. */
  fogClear: sec(12),
  /** Rain and thunderstorm: fire damage (both sides), extra lightning hops, and how much farther lightning leaps. */
  rainFire: 0.5,
  rainHops: 1,
  rainReach: 1.5,
  /** Blizzard: foes' pace, troops' pace, and how much longer chills and freezes last. */
  blizzardFoes: 0.75,
  blizzardTroops: 0.85,
  blizzardFrost: 2,
  /** Sandstorm: how far straight shots and gunfire carry. */
  sandRange: 4.5,
  /** Thunderstorm: a tile is marked every min..max ticks and struck `strikeWarn` later: damage to the foes / troops in it. */
  strikeMin: sec(7),
  strikeMax: sec(10),
  strikeWarn: sec(1.5),
  strikeFoe: 300,
  strikeTroop: 150,
  /** A tomb eaten by a Rooting Boar leaves this much gold. */
  graveGoods: 25
} as const;

/** Lawful troops that stand in open water without a raft (water spirits, the sea serpent and the shipgirls). A unit can also set DefDef.aquatic. */
export const AQUATIC: ReadonlySet<DefKind> = new Set(["oc-undine", "oc-nymph", "oc-serpent", "oc-laffey", "oc-belfast", "oc-akagi"]);

/** Chaos foes that dive through open water: nothing aims at them while they swim, and water doesn't slow them. An enemy can also set EnemyDef.swim. */
export const SWIMMERS: ReadonlySet<EnemyKind> = new Set(["oc-seadog", "oc-sea-witch"]);

/** Tiles that need footing (a Raft, a Crate) before a troop can stand on them. */
export function needsFooting(code: number): boolean {
  return code === TILE.water || code === TILE.roof || code === TILE.ridge;
}

/** Tiles that stop straight shots crossing them (ruins, the roof's ridge). */
export function stopsShots(code: number): boolean {
  return code === TILE.ruins || code === TILE.ridge;
}

/** A fresh lawn state from the level's tiles (only the active lanes). */
export function createFieldState(tiles: readonly FieldTile[] | undefined, lanes: readonly number[]): FieldState {
  const n = FIELD_LANES * FIELD_COLS;
  const grid = new Array<number>(n).fill(0);
  for (const t of tiles ?? []) {
    if (!lanes.includes(t.lane) || t.col < 0 || t.col >= FIELD_COLS) continue;
    grid[t.lane * FIELD_COLS + t.col] = TILE[t.kind];
  }
  return { grid, footing: new Array<number>(n).fill(0), ice: new Array<number>(n).fill(0), crater: new Array<number>(n).fill(0), rev: 1 };
}

// ---------------------------------------------------------------------------
// Level-authoring helpers

/** One tile kind over every (lane, col) pair of the given lanes and columns. */
export function tileBlock(kind: FieldTileKind, lanes: readonly number[], cols: readonly number[]): FieldTile[] {
  return lanes.flatMap((lane) => cols.map((col) => ({ lane, col, kind })));
}

/** A river down one column across the given lanes, with bridges where listed. */
export function river(col: number, lanes: readonly number[], bridges: readonly number[] = []): FieldTile[] {
  return lanes.map((lane) => ({ lane, col, kind: bridges.includes(lane) ? "bridge" as const : "water" as const }));
}

/** Whole lanes of water (the pool). */
export function pool(lanes: readonly number[], from = 0): FieldTile[] {
  return tileBlock("water", lanes, Array.from({ length: FIELD_COLS - from }, (_, i) => from + i));
}

/** A rooftop over every tile of the given lanes, its ridge down column `ridge`. */
export function rooftop(lanes: readonly number[], ridge: number): FieldTile[] {
  return lanes.flatMap((lane) => Array.from({ length: FIELD_COLS }, (_, col) => ({ lane, col, kind: col === ridge ? "ridge" as const : "roof" as const })));
}

/** The weather in force at wave `wave` (index into `steps`, -1 = clear). */
export function weatherStepAt(steps: readonly WeatherStep[] | undefined, wave: number): number {
  let index = -1;
  (steps ?? []).forEach((step, i) => {
    if ((step.wave ?? 0) <= wave) index = i;
  });
  return index;
}

// ---------------------------------------------------------------------------
// The catalog: what the player is told

export type FieldGroup = "tile" | "weather" | "landmark" | "structure" | "origin" | "card";

export type FieldFeature = {
  id: string;
  group: FieldGroup;
  name: string;
  /** Painted icon (public path); `glyph` stands in while it is missing. */
  icon: string;
  glyph: string;
  /** The rule in one line. */
  rule: string;
  /** Crag Hack, the first time the player meets it. */
  crag: OcLine;
};

const ICON = (name: string) => `/assets/order-chaos/field/${name}.webp`;
const pct = (share: number) => `${Math.round(share * 100)}%`;
const secs = (ticks: number) => Math.round((ticks / GW_TPS) * 10) / 10;
const crag = (mood: "talk" | "grin" | "shout" | "sly", text: string): OcLine => ({ who: "crag", mood, text });

const FEATURES: FieldFeature[] = [
  // --- Tiles ------------------------------------------------------------------
  { id: "tile:water", group: "tile", name: "Water", icon: ICON("icon-water"), glyph: "🌊",
    rule: `Troops need a Raft to stand here (swimmers excepted). Foes wade at ${pct(FIELD.wade)} pace; fire deals them half (a burning arrow: only its flames), and lightning on a wader jolts every wader nearby.`,
    crag: crag("talk", "Water on the lawn. Your troops can't stand in it without a Raft, but the dead have to WADE through it. Wet, slow targets. And lightning loves a wet crowd.") },
  { id: "tile:bridge", group: "tile", name: "Bridge", icon: ICON("bridge"), glyph: "🌉",
    rule: "Planks over the water: any troop can stand on it, and foes cross it at full pace.",
    crag: crag("talk", "Bridges. Dry ground for you, and a fast road for them. Guard the planks.") },
  { id: "tile:roof", group: "tile", name: "Rooftop", icon: ICON("icon-roof"), glyph: "🏠",
    rule: "Troops need a Crate to stand on the roof. Its ridge stops straight shots crossing it (both ways) — lobs, lightning, snipes and beams go over.",
    crag: crag("shout", "We're on the ROOF! Nobody stands up here without a Crate under their boots. Arrows shot from behind the ridge just hit it, so throw things over it.") },
  { id: "tile:ruins", group: "tile", name: "Ruins", icon: ICON("ruins"), glyph: "🪨",
    rule: "Nothing stands here, and ruins stop every straight shot — yours and theirs. Lobs, lightning, snipes and beams pass over.",
    crag: crag("sly", "Old ruins. Arrows hit the stone, theirs as well as ours. Lob over them, or wait until the brutes walk past.") },
  { id: "tile:bramble", group: "tile", name: "Brambles", icon: ICON("bramble"), glyph: "🌿",
    rule: `Foes crossing crawl at ${pct(FIELD.bramble)} pace and take ${FIELD.brambleDps} a second. Nothing is planted here until fire (fireballs, fire walls, bursting kegs) burns them away.`,
    crag: crag("grin", "Brambles! Anything walking through them slows to a crawl and gets cut. Put a wall right behind them. And careful with fire: it burns the bushes away.") },
  { id: "tile:clover", group: "tile", name: "Clover Field", icon: ICON("clover"), glyph: "🍀",
    rule: `The troop standing on clover is lucky: it acts ${pct(FIELD.clover - 1)} faster (shoots, strikes and pays).`,
    crag: crag("grin", "Four-leaf clover, a whole patch of it. Whoever stands there gets lucky and works a quarter faster. Put your best troop on it.") },
  { id: "tile:ice", group: "tile", name: "Ice", icon: ICON("icon-ice"), glyph: "🧊",
    rule: `A Frost Mammoth leaves ice behind it: nothing is planted on ice until it melts (${secs(FIELD.iceMelt)} s) or fire melts it, and Sledge Wolves race across it.`,
    crag: crag("talk", "See that shiny trail? Ice. You can't plant anything on it until it melts, or until you melt it. And Sledge Wolves race across it like a sled.") },
  { id: "tile:crater", group: "tile", name: "Crater", icon: ICON("icon-crater"), glyph: "🕳",
    rule: `A Magma Elemental's eruption leaves a crater: nothing is planted in it for ${secs(FIELD.crater)} s.`,
    crag: crag("grin", "Boom, and a hole. Worth it. Just don't plan on planting there for a while.") },
  // --- Field packets --------------------------------------------------------------
  { id: "card:oc-raft", group: "card", name: "Raft", icon: ICON("raft"), glyph: "🛶",
    rule: "A field packet (25 gold): lays a raft on open water, so any troop can stand there.",
    crag: crag("talk", "I tied some Rafts together for you. Drop one on the water first, then put whoever you like on top.") },
  { id: "card:oc-crate", group: "card", name: "Crate", icon: ICON("crate"), glyph: "📦",
    rule: "A field packet (25 gold): sets a crate of soil on a roof tile, so any troop can stand there.",
    crag: crag("grin", "Crates of good Erathian dirt. Set one on the roof, then put your soldier on top. Don't ask how I got them up here.") },
  { id: "card:oc-boar", group: "card", name: "Rooting Boar", icon: ICON("icon-boar"), glyph: "🐗",
    rule: "A field packet (50 gold): plant it ON a grave or crypt and it gobbles the tomb (grave 4 s, crypt 10 s), leaves 25 gold and trots home.",
    crag: crag("grin", "Meet Gertrude, the best truffle pig in Erathia. Plant her on a grave and she eats the whole thing, headstone and all. Don't ask me how.") },
  { id: "card:oc-brew", group: "card", name: "Wake-Up Brew", icon: ICON("brew"), glyph: "☕",
    rule: "A field packet (25 gold): pour it on a sleeping troop and it wakes for good.",
    crag: crag("sly", "My wake-up stew. One sip and anybody is up and fighting, and they stay up. Unless a Nightmare sings them to sleep again.") },
  // --- Night and weather --------------------------------------------------------------
  { id: "weather:night", group: "weather", name: "Night", icon: ICON("icon-night"), glyph: "🌑",
    rule: "No gold falls from the sky. Nocturnal troops (Pixies, Moon Sprites, Magic and Magma Elementals) are awake — by day they sleep until given a Wake-Up Brew.",
    crag: crag("talk", "Night battle. Nothing falls from the sky, so every coin comes from your gold-makers. The good news: the night folk are wide awake.") },
  { id: "weather:rain", group: "weather", name: "Rain", icon: ICON("icon-rain"), glyph: "🌧",
    rule: `Fire deals half — theirs too (a burning arrow loses half its flames, not its point). Lightning leaps one foe further and ${pct(FIELD.rainReach - 1)} farther.`,
    crag: crag("talk", "Rain. Fire fizzles, yours and theirs, but lightning goes wild in the wet. A good day for a Storm Elemental.") },
  { id: "weather:fog", group: "weather", name: "Fog", icon: ICON("icon-fog"), glyph: "🌫",
    rule: `Foes more than ${FIELD.fogLine} tiles from the gate are hidden — nothing aims at them — unless a Lamplighter or Pillar of Fire lights their lane or a Sylph's gale clears it (${secs(FIELD.fogClear)} s).`,
    crag: crag("shout", "FOG! You can't see past the middle of the lawn, and nobody shoots what they can't see. Light it up with a lamp, or have a Sylph blow it away.") },
  { id: "weather:blizzard", group: "weather", name: "Blizzard", icon: ICON("icon-blizzard"), glyph: "🌨",
    rule: `Foes march and strike ${pct(1 - FIELD.blizzardFoes)} slower, your troops act ${pct(1 - FIELD.blizzardTroops)} slower; chills and freezes last twice as long.`,
    crag: crag("talk", "A blizzard is coming. Everybody slows down, them more than us. And anything you chill or freeze stays that way twice as long.") },
  { id: "weather:sandstorm", group: "weather", name: "Sandstorm", icon: ICON("icon-sandstorm"), glyph: "🌪",
    rule: `Straight shots and gunfire carry only ${FIELD.sandRange} tiles, both ways. Lobs, lightning, snipes and beams are unaffected.`,
    crag: crag("sly", "Sandstorm. Arrows and bullets drop after four and a half tiles, theirs too. Move your shooters forward, or lob.") },
  { id: "weather:thunderstorm", group: "weather", name: "Thunderstorm", icon: ICON("icon-thunderstorm"), glyph: "⛈",
    rule: `As rain, and every ${secs(FIELD.strikeMin)}–${secs(FIELD.strikeMax)} s lightning strikes a marked tile ${secs(FIELD.strikeWarn)} s later: ${FIELD.strikeFoe} to foes, ${FIELD.strikeTroop} to troops (Aegis domes shield them).`,
    crag: crag("shout", "Thunderstorm! Watch the glowing marks. Lightning hits there a moment later, friend or foe. An Aegis dome keeps your troops dry.") },
  // --- Lawful landmarks ---------------------------------------------------------------
  { id: "landmark:oc-windmill", group: "landmark", name: "Windmill", icon: ICON("windmill"), glyph: "🏚",
    rule: "A Lawful building: pays 25 gold every 12 s while it stands. The horde will try to wreck it.",
    crag: crag("grin", "A windmill! It keeps paying while it stands, so the dead will want it smashed. Keep them off it.") },
  { id: "landmark:oc-well", group: "landmark", name: "Magic Well", icon: ICON("well"), glyph: "⛲",
    rule: "Gives your hero 2 mana every 8 s while it stands.",
    crag: crag("talk", "A Magic Well. Keep it standing, and your hero drinks two mana every eight seconds. Cast away.") },
  { id: "landmark:oc-shrine", group: "landmark", name: "Shrine of Magic", icon: ICON("shrine"), glyph: "⛩",
    rule: "Drops a Surge orb beside it every 40 s while it stands.",
    crag: crag("sly", "A shrine. Every forty seconds it gives you a Surge orb. Protect it, and you'll never run out.") },
  { id: "landmark:oc-pillar", group: "landmark", name: "Pillar of Fire", icon: ICON("pillar"), glyph: "🔥",
    rule: "Lights its lane and both beside it: fog hides nothing there while it stands.",
    crag: crag("talk", "A Pillar of Fire. It lights three lanes right through the fog, as long as it stands. The dead know that.") },
  // --- Chaos structures ---------------------------------------------------------------
  { id: "structure:oc-grave", group: "structure", name: "Grave", icon: "/assets/order-chaos/props/grave.webp", glyph: "🪦",
    rule: "Blocks planting and soaks shots; the dead climb out at every great assault. A Rooting Boar eats it in 4 s.",
    crag: crag("talk", "Graves. Nothing can be planted on them, they catch your arrows, and at every great assault, the dead climb out.") },
  { id: "structure:oc-crypt", group: "structure", name: "Crypt", icon: ICON("crypt"), glyph: "⚰",
    rule: "Every 20 s one of the dead climbs out of its door, and two at every great assault. Smash it (2000) or send a Rooting Boar (10 s).",
    crag: crag("shout", "A CRYPT! The dead keep coming out of that door all battle long. Smash it, or feed it to the pig. Sooner is better.") },
  { id: "structure:oc-chest", group: "structure", name: "Treasure Chest", icon: ICON("chest"), glyph: "💰",
    rule: "Break it open for 100 gold — before a thief loots it (slay the thief to get it back).",
    crag: crag("grin", "A treasure chest! Shoot it open for a hundred gold. And watch out for thieves. They'll grab it on the way past.") },
  { id: "structure:oc-bank", group: "structure", name: "Creature Bank", icon: ICON("bank"), glyph: "🏰",
    rule: "Chaos holds a troop caged here, guarded by sleepers who wake when they or the bank are hurt, or at the first great assault (gales and shoves don't stir them). Break the bank and the troop joins you.",
    crag: crag("sly", "A creature bank. One of ours is locked inside, and the guards are asleep. Wake them when YOU'RE ready, break the cage, and he's yours.") },
  // --- Where the horde comes from --------------------------------------------------------
  { id: "origin:water", group: "origin", name: "From the water", icon: ICON("icon-emerge"), glyph: "🫧",
    rule: "Part of each wave surfaces from the water, in the middle of the lawn.",
    crag: crag("shout", "Bubbles in the water? That's not frogs. Some of them walk along the bottom and come up right in the middle of your lines!") },
  { id: "origin:sky", group: "origin", name: "From the sky", icon: ICON("icon-sky"), glyph: "🪂",
    rule: "Winged beasts carry part of each wave over your walls and drop it onto the middle of the lawn.",
    crag: crag("shout", "Look up! They're being carried over the wall and dropped in the middle of the lawn. Keep something tough there.") },
  { id: "origin:flank", group: "origin", name: "Tunnels", icon: ICON("icon-flank"), glyph: "🕳",
    rule: "Part of each wave climbs out of tunnels behind your lines, at the gate, and fights its way back out.",
    crag: crag("talk", "Tunnels under the keep. Some of them climb out right behind your lines. Rearguards that shoot backwards and pikes that stab both ways are worth their pay today.") }
];

export const FIELD_FEATURES: Readonly<Record<string, FieldFeature>> = Object.fromEntries(FEATURES.map((f) => [f.id, f]));

/** Every feature, in the order the Almanac lists them. */
export const FIELD_FEATURE_ORDER: readonly string[] = FEATURES.map((f) => f.id);

export const WEATHER_NAMES: Readonly<Record<WeatherKind, string>> = {
  clear: "Clear skies", rain: "Rain", fog: "Fog", blizzard: "Blizzard", sandstorm: "Sandstorm", thunderstorm: "Thunderstorm"
};

/** What a level (or a battle config's cfg.oc) puts on the field. */
export type FieldSource = {
  tiles?: readonly FieldTile[];
  night?: boolean;
  weather?: readonly WeatherStep[];
  origins?: readonly SpawnOrigin[];
  landmarks?: readonly { kind: DefKind }[];
  structures?: readonly { kind: EnemyKind }[];
  banks?: readonly { kind: EnemyKind }[];
  graves?: readonly unknown[];
  fieldCards?: readonly CardId[];
  /** The wave pool (a Necromancer raises graves; a Frost Mammoth lays ice). */
  enemies?: readonly EnemyKind[];
};

/** Foes whose presence brings a field feature (by the catalog id). */
const FOE_FEATURES: Readonly<Record<string, string>> = { "oc-necromancer": "structure:oc-grave", "oc-mammoth": "tile:ice" };

/** The features on a field, in catalog order (ids into FIELD_FEATURES). */
export function fieldFeatures(src: FieldSource): string[] {
  const ids = new Set<string>();
  for (const tile of src.tiles ?? []) ids.add(`tile:${tile.kind === "ridge" ? "roof" : tile.kind === "bridge" ? "water" : tile.kind}`);
  if (src.tiles?.some((t) => t.kind === "bridge")) ids.add("tile:bridge");
  if (src.night) ids.add("weather:night");
  for (const step of src.weather ?? []) if (step.kind !== "clear") ids.add(`weather:${step.kind}`);
  for (const origin of src.origins ?? []) ids.add(`origin:${origin.kind}`);
  for (const spot of src.landmarks ?? []) ids.add(`landmark:${spot.kind}`);
  for (const spot of src.structures ?? []) ids.add(`structure:${spot.kind}`);
  if (src.banks?.length) ids.add("structure:oc-bank");
  if (src.graves?.length) ids.add("structure:oc-grave");
  for (const kind of src.enemies ?? []) if (FOE_FEATURES[kind]) ids.add(FOE_FEATURES[kind]!);
  for (const card of src.fieldCards ?? []) ids.add(`card:${card}`);
  return FIELD_FEATURE_ORDER.filter((id) => ids.has(id));
}

/** "Clear skies, then Rain from wave 5, then Thunderstorm from wave 10" (null: no weather). */
export function weatherPlan(steps: readonly WeatherStep[] | undefined): string | null {
  if (!steps?.length) return null;
  const parts = steps.map((step) => `${WEATHER_NAMES[step.kind]}${(step.wave ?? 0) > 0 ? ` from wave ${step.wave}` : ""}`);
  if ((steps[0]!.wave ?? 0) > 0) parts.unshift(WEATHER_NAMES.clear);
  return parts.join(", then ");
}
