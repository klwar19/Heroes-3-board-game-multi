import type { BuildingId, Debris, Dir, ZoneId } from "../engine/types";

/** Inclusive cell rectangle [x0, y0, x1, y1]. */
export type Rect = [number, number, number, number];

export type Lot = {
  /** Cells the building blocks once it exists (level >= `minLevel`). */
  rect: Rect;
  door: { x: number; y: number };
  /** Sprite width in cells (anchored bottom-centre on the footprint). */
  spriteW: number;
  /** Nudge in cells (positive = down). */
  spriteDy?: number;
  /** Level at which the lot is occupied (the ruined shrine stands at 0). */
  minLevel: number;
};

export type ZoneObject =
  | { kind: "shippingBin"; x: number; y: number }
  | { kind: "board"; x: number; y: number }
  | { kind: "well"; x: number; y: number }
  | { kind: "cave"; x: number; y: number };

export type ZoneDef = {
  id: ZoneId;
  name: string;
  image: string;
  cols: number;
  rows: number;
  music: string;
  blocked: Rect[];
  water: Rect[];
  exits: { rect: Rect; to: ZoneId; arrive: { x: number; y: number; facing: Dir }; label: string }[];
  lots: Partial<Record<BuildingId, Lot>>;
  objects: ZoneObject[];
  spots: Record<string, { x: number; y: number }>;
  forage?: { x: number; y: number }[];
  /** Field monsters wander inside these rects. */
  monsterArea?: Rect[];
  battleBackdrop: string;
};

export const COLS = 32;
export const ROWS = 18;

export const ZONES: Record<ZoneId, ZoneDef> = {
  farm: {
    id: "farm",
    name: "Pocket Haven",
    image: "/assets/restia/maps/farm.webp",
    cols: COLS,
    rows: ROWS,
    music: "grass",
    blocked: [
      [0, 0, 31, 0],
      [0, 1, 3, 1],
      [12, 1, 31, 1],
      [0, 2, 0, 2],
      [26, 2, 31, 2],
      [27, 3, 31, 11],
      [0, 3, 0, 6],
      [0, 10, 2, 17],
      [3, 12, 6, 14],
      [0, 15, 23, 17]
    ],
    water: [
      [25, 13, 31, 17],
      [27, 12, 31, 12],
      [24, 15, 24, 17]
    ],
    exits: [{ rect: [0, 7, 0, 9], to: "village", arrive: { x: 1, y: 4, facing: "right" }, label: "Frostbitten" }],
    lots: {
      farmhouse: { rect: [1, 1, 5, 4], door: { x: 3, y: 5 }, spriteW: 6, minLevel: 1 },
      barn: { rect: [7, 1, 10, 4], door: { x: 8, y: 5 }, spriteW: 5, minLevel: 1 }
    },
    objects: [{ kind: "shippingBin", x: 6, y: 6 }],
    spots: {
      houseFront: { x: 3, y: 6 },
      barnFront: { x: 9, y: 6 },
      fieldEdge: { x: 12, y: 6 },
      farmPath: { x: 4, y: 8 }
    },
    battleBackdrop: "pocket"
  },
  village: {
    id: "village",
    name: "Frostbitten",
    image: "/assets/restia/maps/village.webp",
    cols: COLS,
    rows: ROWS,
    music: "rampart",
    blocked: [
      [0, 0, 14, 0],
      [18, 0, 31, 0],
      [0, 1, 7, 2],
      [0, 3, 3, 3],
      [0, 5, 3, 17],
      [4, 12, 7, 17],
      [0, 16, 31, 17],
      [29, 0, 31, 17],
      [24, 1, 28, 3],
      [27, 4, 28, 5],
      [15, 6, 17, 8],
      [10, 8, 11, 9],
      [6, 3, 7, 4],
      [22, 5, 23, 6],
      [27, 11, 28, 15]
    ],
    water: [],
    exits: [
      { rect: [0, 4, 0, 4], to: "farm", arrive: { x: 1, y: 8, facing: "right" }, label: "Pocket Haven (Garr's back door)" },
      { rect: [15, 0, 17, 0], to: "forest", arrive: { x: 16, y: 16, facing: "up" }, label: "The Frostwood" }
    ],
    lots: {
      store: { rect: [9, 1, 13, 3], door: { x: 11, y: 4 }, spriteW: 6, minLevel: 1 },
      guild: { rect: [18, 1, 22, 3], door: { x: 20, y: 4 }, spriteW: 6, minLevel: 1 },
      smithy: { rect: [7, 5, 10, 8], door: { x: 8, y: 9 }, spriteW: 5, minLevel: 1 },
      inn: { rect: [23, 6, 27, 9], door: { x: 25, y: 10 }, spriteW: 6, minLevel: 1 },
      atelier: { rect: [9, 11, 13, 13], door: { x: 11, y: 14 }, spriteW: 5, minLevel: 1 },
      shrine: { rect: [18, 11, 22, 13], door: { x: 20, y: 14 }, spriteW: 5, minLevel: 0 }
    },
    objects: [
      { kind: "board", x: 13, y: 5 },
      { kind: "well", x: 16, y: 7 }
    ],
    spots: {
      well: { x: 14, y: 7 },
      plazaNorth: { x: 16, y: 5 },
      plazaEast: { x: 19, y: 8 },
      plazaWest: { x: 13, y: 8 },
      storeFront: { x: 12, y: 5 },
      guildFront: { x: 21, y: 5 },
      smithyFront: { x: 10, y: 10 },
      innFront: { x: 24, y: 11 },
      atelierFront: { x: 13, y: 14 },
      shrineFront: { x: 21, y: 14 },
      benchSouth: { x: 26, y: 12 }
    },
    battleBackdrop: "village"
  },
  forest: {
    id: "forest",
    name: "The Frostwood",
    image: "/assets/restia/maps/forest.webp",
    cols: COLS,
    rows: ROWS,
    music: "snow",
    blocked: [
      [0, 0, 31, 1],
      [0, 0, 3, 17],
      [22, 0, 31, 2],
      [0, 14, 15, 17],
      [18, 14, 31, 17],
      [29, 0, 31, 17],
      [17, 6, 21, 8],
      [26, 7, 28, 9],
      [24, 10, 26, 12],
      [22, 12, 22, 12],
      [13, 13, 14, 14],
      [13, 6, 14, 6],
      [15, 3, 17, 4],
      [9, 4, 10, 5]
    ],
    water: [
      [4, 2, 6, 5],
      [5, 6, 8, 8],
      [8, 9, 9, 9],
      [6, 9, 7, 12],
      [8, 11, 13, 13],
      [12, 14, 13, 14]
    ],
    exits: [{ rect: [16, 17, 17, 17], to: "village", arrive: { x: 16, y: 1, facing: "down" }, label: "Frostbitten" }],
    lots: {},
    objects: [{ kind: "cave", x: 27, y: 2 }],
    spots: {
      clearing: { x: 14, y: 8 },
      fallenLog: { x: 19, y: 9 },
      stream: { x: 14, y: 11 },
      caveMouth: { x: 27, y: 3 }
    },
    forage: [
      { x: 11, y: 3 },
      { x: 12, y: 5 },
      { x: 14, y: 3 },
      { x: 18, y: 3 },
      { x: 20, y: 4 },
      { x: 22, y: 5 },
      { x: 21, y: 9 },
      { x: 23, y: 8 },
      { x: 25, y: 5 },
      { x: 23, y: 10 },
      { x: 27, y: 11 },
      { x: 19, y: 12 },
      { x: 20, y: 13 },
      { x: 15, y: 12 },
      { x: 11, y: 8 },
      { x: 16, y: 8 }
    ],
    monsterArea: [
      [10, 3, 25, 9],
      [18, 9, 28, 13]
    ],
    battleBackdrop: "frostwood"
  }
};

/** Farm plot rectangle per field level (index = level). */
export const FIELD_RECTS: Rect[] = [
  [13, 4, 20, 8],
  [13, 4, 20, 8],
  [13, 4, 24, 9],
  [11, 4, 26, 10]
];
/** Plots are stored for the largest field. */
export const FIELD_MAX = FIELD_RECTS[3]!;
export const FIELD_W = FIELD_MAX[2] - FIELD_MAX[0] + 1;
export const FIELD_H = FIELD_MAX[3] - FIELD_MAX[1] + 1;

/** Debris painted into the farm art: the field starts with matching debris there. */
export const PAINTED_DEBRIS: { x: number; y: number; kind: Debris }[] = [{ x: 23, y: 5, kind: "stump" }];

export function inRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3];
}
