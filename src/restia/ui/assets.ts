import { assetUrl } from "@/lib/asset-url";
import type { Face, FxId, IconRef, NpcId, ProjectileId, SpeakerId } from "../engine/types";
import TACHIE_INDEX from "../data/tachie-index.json";
import { BATTLEFIELDS } from "../data/battlefields";

/** Every Restia image/sound path goes through assetUrl (CDN + content-addressed keys). */
export const A = (path: string) => assetUrl(path);

const R = "/assets/restia";

export const BACKDROPS: Record<string, string> = {
  title: `${R}/bg/title.webp`,
  home: `${R}/bg/home.webp`,
  guild: `${R}/bg/guild.webp`,
  store: `${R}/bg/store.webp`,
  smithy: `${R}/bg/smithy.webp`,
  atelier: `${R}/bg/atelier.webp`,
  inn: `${R}/bg/inn.webp`,
  shrine: `${R}/bg/shrine.webp`,
  barn: `${R}/bg/barn.webp`,
  farm: `${R}/maps/farm.webp`,
  village: `${R}/maps/village.webp`,
  forest: `${R}/maps/forest.webp`,
  dungeon: "/assets/battle-hex/battlefields/snmt.webp",
  earthApartment: `${R}/bg/earth-apartment.webp`,
  earthCampus: `${R}/bg/earth-campus.webp`,
  earthKfc: `${R}/bg/earth-kfc.webp`,
  earthHospital: `${R}/bg/earth-hospital.webp`,
  earthBookstore: `${R}/bg/earth-bookstore.webp`,
  earthCafeteria: `${R}/bg/earth-cafeteria.webp`,
  earthGym: `${R}/bg/earth-gym.webp`,
  earthLibrary: `${R}/bg/earth-library.webp`,
  earthStreet: `${R}/bg/earth-street.webp`,
  earthSchool: `${R}/bg/earth-school.webp`,
  eosMeadow: `${R}/bg/eos-meadow.webp`,
  eosVillage: `${R}/bg/eos-village.webp`,
  eosCave: `${R}/bg/eos-cave.webp`,
  havenRoad: `${R}/bg/haven-road.webp`,
  havenGate: `${R}/bg/haven-gate.webp`
};

export function backdrop(key: string): string {
  return A(BACKDROPS[key] ?? BACKDROPS.home!);
}

/** Visual-novel standing art. Bin's four expressions are the user's own CJS art. */
export const TACHIE: Partial<Record<SpeakerId, string>> = {
  bin: `${R}/tachie/bin.webp`,
  system: `${R}/tachie/system.webp`,
  peri: `${R}/tachie/peri.webp`,
  garr: `${R}/tachie/garr.webp`,
  bowy: `${R}/tachie/bowy.webp`,
  mitia: `${R}/tachie/mitia.webp`,
  lysa: `${R}/tachie/lysa.webp`,
  hilda: `${R}/tachie/hilda.webp`,
  senna: `${R}/tachie/senna.webp`,
  mara: `${R}/tachie/mara.webp`,
  frida: `${R}/tachie/frida.webp`,
  tilde: `${R}/tachie/tilde.webp`,
  dain: `${R}/tachie/dain.webp`,
  tessa: `${R}/tachie/tessa.webp`,
  lily: `${R}/tachie/lily.webp`,
  luna: `${R}/tachie/luna.webp`,
  leo: `${R}/tachie/leo.webp`,
  meilin: `${R}/tachie/meilin.webp`,
  jake: `${R}/tachie/jake.webp`,
  lingling: `${R}/tachie/lingling.webp`,
  chad: `${R}/tachie/chad.webp`,
  nurse: `${R}/tachie/nurse.webp`,
  oldZhou: `${R}/tachie/oldzhou.webp`,
  zhaoKang: `${R}/tachie/zhaokang.webp`,
  gymBro: `${R}/tachie/gymbro.webp`,
  repairman: `${R}/tachie/repairman.webp`,
  villager: `${R}/tachie/villager.webp`
};

/** Which outfits and expressions exist per portrait file (scripts/restia/tachie-index.mjs). */
const VARIANTS = TACHIE_INDEX as Record<string, Record<string, string[]>>;

/**
 * Standing art for a speaker in an outfit ("default" = everyday clothes) with an
 * expression. Missing expressions fall back to the outfit's normal face, missing
 * outfits to the default one, so scenes can ask for art that isn't drawn yet.
 */
export function tachieFor(speaker: SpeakerId, face: Face | null, outfit?: string): string | undefined {
  const base = TACHIE[speaker];
  if (!base) return undefined;
  const file = base.slice(base.lastIndexOf("/") + 1).replace(/\.webp$/, "");
  const dir = base.slice(0, base.lastIndexOf("/") + 1);
  const outfits = VARIANTS[file];
  const set = outfit && outfits?.[outfit] ? outfit : "default";
  const faces = outfits?.[set] ?? ["normal"];
  const want = face && faces.includes(face) ? face : "normal";
  if (!faces.includes(want)) return base;
  return `${dir}${file}${set === "default" ? "" : `-${set}`}${want === "normal" ? "" : `-${want}`}.webp`;
}

/** Overworld figures use each character's battle atlas (restia-<id>). */
export const WALKER: Record<NpcId | "bin", string> = {
  bin: "restia-bin",
  garr: "restia-garr",
  bowy: "restia-bowy",
  mitia: "restia-mitia",
  lysa: "restia-lysa",
  hilda: "restia-hilda",
  senna: "restia-senna",
  mara: "restia-mara",
  frida: "restia-frida",
  tilde: "restia-tilde",
  dain: "restia-dain"
};

export const BUILDING_ART: Record<string, string> = {
  farmhouse: `${R}/buildings/farmhouse.webp`,
  barn: `${R}/buildings/barn.webp`,
  guild: `${R}/buildings/guild.webp`,
  store: `${R}/buildings/store.webp`,
  smithy: `${R}/buildings/smithy.webp`,
  atelier: `${R}/buildings/atelier.webp`,
  inn: `${R}/buildings/inn.webp`,
  shrine: `${R}/buildings/shrine.webp`,
  shrineRuined: `${R}/buildings/shrine-ruined.webp`,
  construction: `${R}/buildings/construction.webp`,
  shippingBin: `${R}/buildings/shipping-bin.webp`,
  board: `${R}/buildings/notice-board.webp`
};

export const SHEETS = {
  icons: { a: `${R}/icons/a.webp`, b: `${R}/icons/b.webp`, c: `${R}/icons/c.webp` } as Record<IconRef["sheet"], string>,
  farm: `${R}/farm/sheet.webp`,
  soil: `${R}/farm/soil.webp`,
  dungeon: `${R}/dungeon/sheet.webp`
};

/** Restia battlefields (data/battlefields.ts) or, for old codes, the H3 battlefield art. */
export const BATTLEFIELD = (code: string) => A(code in BATTLEFIELDS ? `${R}/battlefields/${code}.webp` : `/assets/battle-hex/battlefields/${code}.webp`);
/** Impact effects and projectiles: 4x4 frame sheets on black (drawn with screen blending). */
export const FX_SHEET = (id: FxId) => A(`${R}/fx/${id}.webp`);
export const PROJECTILE_SHEET = (id: ProjectileId) => A(`${R}/fx/proj-${id}.webp`);
/** Battle props and ground pieces: 4x4 sheet (see PROP_FRAME in battle-view). */
export const PROPS_SHEET = A(`${R}/battle/props.webp`);
/** Farm sprinklers: tiers I-III idle (row 1) and spraying (row 2), 3x2. */
export const SPRINKLER_SHEET = A(`${R}/farm/sprinklers.webp`);
/** Battle action-bar icons (4x4) and objective markers (banners, shrines, caches; 4x2). */
export const BATTLE_ICONS = A(`${R}/ui/battle-icons.webp`);
export const OBJECTIVES_SHEET = A(`${R}/battle/objectives.webp`);
/** Tiling textures of raised battle ground (hilltops and their cliff sides). */
export const HILL_TEXTURE = (set: string, face: "top" | "side") => A(`${R}/battle/terrain/${set}-${face}.webp`);

export const MUSIC = (name: string) => A(`/sounds/music/${name}.mp3`);
export const SFX = {
  click: "/sounds/ui/button.mp3",
  system: "/sounds/ui/system-message.mp3",
  turn: "/sounds/ui/your-turn.mp3",
  good: "/sounds/effects/good-luck.mp3",
  bad: "/sounds/effects/bad-luck.mp3"
} as const;
