import { assetUrl } from "@/lib/asset-url";
import type { IconRef, NpcId, SpeakerId } from "../engine/types";

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
  dungeon: "/assets/battle-hex/battlefields/sub.webp",
  dawnGate: "/assets/story/backgrounds/dawn-gate.webp",
  azurePeak: "/assets/story/backgrounds/azure-peak.webp",
  erathiaShore: "/assets/story/backgrounds/erathia-shore.webp"
};

export function backdrop(key: string): string {
  return A(BACKDROPS[key] ?? BACKDROPS.home!);
}

/** Visual-novel standing art. Bin, Hikari, Elise and the System reuse the campaign sprites. */
export const TACHIE: Partial<Record<SpeakerId, string>> = {
  bin: "/assets/story/sprites/bin.webp",
  hikari: "/assets/story/sprites/hikari.webp",
  guildGirl: "/assets/story/sprites/guild-girl.webp",
  system: "/assets/story/sprites/system.webp",
  mina: `${R}/tachie/mina.webp`,
  tove: `${R}/tachie/tove.webp`,
  seren: `${R}/tachie/seren.webp`,
  nell: `${R}/tachie/nell.webp`,
  pip: `${R}/tachie/pip.webp`,
  kaito: `${R}/tachie/kaito.webp`
};

export const CHIBI: Partial<Record<NpcId | "bin", string>> = {
  bin: `${R}/chibi/bin.webp`,
  hikari: `${R}/chibi/hikari.webp`,
  guildGirl: `${R}/chibi/guild-girl.webp`,
  mina: `${R}/chibi/mina.webp`,
  tove: `${R}/chibi/tove.webp`,
  seren: `${R}/chibi/seren.webp`,
  nell: `${R}/chibi/nell.webp`,
  pip: `${R}/chibi/pip.webp`,
  kaito: `${R}/chibi/kaito.webp`
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

export const BATTLEFIELD = (code: string) => A(`/assets/battle-hex/battlefields/${code}.webp`);
export const OBSTACLE = A("/assets/battle-hex/obstacles/rocks.webp");

export const MUSIC = (name: string) => A(`/sounds/music/${name}.mp3`);
export const SFX = {
  click: "/sounds/ui/button.mp3",
  system: "/sounds/ui/system-message.mp3",
  turn: "/sounds/ui/your-turn.mp3",
  good: "/sounds/effects/good-luck.mp3",
  bad: "/sounds/effects/bad-luck.mp3"
} as const;
