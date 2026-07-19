"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl } from "@/lib/asset-url";
import { Layers, Lock, Trash2 } from "lucide-react";
import { allTileDefinitions } from "@/data/map/tiles";
import { locationDefinitions } from "@/data/map/locations";
import {
  DESIGNER_UI_ICONS,
  mapTokenImage,
  onewayMonolithImage,
  outpostObjectImage,
  teleportGateImage,
  REWARD_GLYPH_ICONS,
  TILE_BACK_IMAGES,
  tileBackImage,
  subterraneanGateTokenImage
} from "@/data/assets/homm-assets";
import type { TileDefinition } from "@/data/map/types";
import {
  canonicalTileEdgeCode,
  gatePairColor,
  hexNeighbor,
  hexNeighbors,
  hexSpaceId,
  hexToPixel,
  legalGateHexPairs,
  legalTokenSlotsForTileDef,
  mapTokenLabel,
  placementTokenLabel,
  normalizeDesignedBorderEdges,
  parseHexSpaceId,
  pixelToHex,
  planIsUnderground,
  planSubterraneanGates,
  UNDERGROUND_LAYER_GROUPS,
  scenarioDefinitions,
  seaTileBand,
  secretFeatureFullLabel,
  secretFeatureLabel,
  planAllowedSecretFeatures,
  SECRET_TILE_FEATURES,
  subterraneanTileBand,
  TILE_GROUP_BAND_LABELS,
  tileCentersOverlap,
  tileFootprint,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  tileMatchesSecretFeature,
  unreachableUndergroundCenters,
  validateCustomMapObjects,
  victoryDesignConflicts,
  customGuardArmyDifficulty,
  describeGuardArmyGrouped,
  describeHexEvent,
  MAX_SETTLEMENT_HOLD_ROUNDS,
  MAX_SETTLEMENT_VP,
  type CustomCenterHexPlan,
  type CustomGuardSpec,
  type CustomMapGateLink,
  type CustomHexEvent,
  type CustomMapSettlementFieldPlan,
  type CustomObjectFieldPlan,
  type CustomMapTileToken,
  type CustomMapObject,
  type CustomMapObjectKind,
  type CustomMapTilePlan,
  type DesignedGateLinkLike,
  type HexCoord,
  type MapTokenKind,
  type TokenPlacementKind,
  type PlannedSubterraneanGate,
  objectGuardSpec,
  OUTPOST_OBJECT_KINDS,
  type SecretTileFeature,
  type VictoryMode
} from "@/engine";
import { GuardSpecEditor } from "./guard-spec-editor";
import { FieldRewardEditor } from "./field-reward-editor";
import {
  fieldOverrideGlyph,
  fieldOverrideImage,
  getFieldOverrideDefinition,
  listFieldOverrideDefinitions
} from "@/data/map/field-overrides";
import { fieldOverrideMayCoverFieldDef } from "@/engine/field-overrides";
// Side-effect: register Anime package Field Override kinds.
import "@/data/anime/field-overrides";
import {
  firstFreeSlot,
  occupiedSlotsOnPlan,
  planFieldOverrides,
  planTokens,
  withPlanFieldOverrides,
  withPlanTokens
} from "@/engine/tile-hex-placements";
import {
  nearestGateDragCandidate,
  type GateDragCandidate,
  type GateHexPair
} from "@/components/adventure/gate-drag";
import { titleCase } from "@/components/table/utils";
import {
  MAP_SCALE_MAX,
  MAP_SCALE_MIN,
  pinchCamera,
  type PinchStart
} from "@/components/adventure/map-pinch";

/** True when two grid coordinates name the same tile centre / board hex. */
function sameGridCoord(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * The index of the gate-link entry a drag or ↻ cycle is repositioning. A cavern
 * may link the SAME Surface tile several times, so a link is addressed by its
 * surface AND its current pinned pair: when a surface holds several links the
 * exact one is the entry whose pinned hexes match `ref`; when it holds a single
 * link the surface alone identifies it (its pins may be unset). Returns -1 when no
 * entry matches — an AUTOMATIC gate owns no entry, so a drag then APPENDS one.
 */
function findGateLinkIndex(
  links: readonly CustomMapGateLink[],
  ref: { surface: { row: number; col: number }; gateHex?: string; entranceHex?: string }
): number {
  const onSurface = links
    .map((link, index) => (sameGridCoord(link.surface, ref.surface) ? index : -1))
    .filter((index) => index >= 0);
  if (onSurface.length <= 1) {
    return onSurface[0] ?? -1;
  }
  const exact = onSurface.find((index) => links[index].gateHex === ref.gateHex && links[index].entranceHex === ref.entranceHex);
  return exact ?? onSurface[0];
}

/** Board-game glyph / medallion for designer toolbar and mode cards. */
function DesignerGlyph({
  src,
  className = "designerGlyph"
}: {
  src: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- assetUrl CDN path; decorative
    <img alt="" aria-hidden="true" className={className} draggable={false} src={assetUrl(src)} />
  );
}

/** Tile group of a designed plan. */
type DesignGroup = CustomMapTilePlan["group"];

/** Sea tiles ship two guard bands behind one wave back; the designer offers each. */
type SeaBand = NonNullable<CustomMapTilePlan["seaBand"]>;

/** Underground tiles likewise span two guard bands (Ⅳ–Ⅴ and a Ⅵ–Ⅶ boss tier). */
type SubBand = NonNullable<CustomMapTilePlan["subBand"]>;

/** Short printed label per group (the Roman numeral on the tile back). */
export const TILE_GROUP_LABELS: Record<DesignGroup, string> = {
  starting: "Ⅰ Town",
  far: "Ⅱ–Ⅲ",
  near: "Ⅳ–Ⅴ",
  center: "Ⅵ–Ⅶ",
  sea: "Sea",
  subterranean: "Underground"
};

/** The printed numerals for a sea tile's guard band. */
const SEA_BAND_NUMERAL: Record<SeaBand, string> = { "iv-v": "Ⅳ–Ⅴ", "vi-vii": "Ⅵ–Ⅶ" };

/** The printed numerals for an underground tile's guard band. */
const SUB_BAND_NUMERAL: Record<SubBand, string> = { "iv-v": "Ⅳ–Ⅴ", "vi-vii": "Ⅵ–Ⅶ" };

/**
 * Printed roman band on the physical tile BACK (matches `tile.backLabel` in play).
 * Sea / underground MUST pass their band so Ⅵ–Ⅶ never wears the Ⅳ–Ⅴ back art.
 */
export function planBackLabel(plan: {
  group: DesignGroup;
  seaBand?: SeaBand;
  subBand?: SubBand;
}): string {
  if (plan.group === "sea") {
    return SEA_BAND_NUMERAL[plan.seaBand ?? "iv-v"];
  }
  if (plan.group === "subterranean") {
    return SUB_BAND_NUMERAL[plan.subBand ?? "iv-v"];
  }
  switch (plan.group) {
    case "starting":
      return "Ⅰ";
    case "far":
      return "Ⅱ–Ⅲ";
    case "center":
      return "Ⅵ–Ⅶ";
    case "near":
    default:
      return "Ⅳ–Ⅴ";
  }
}

/** Correct printed back art for a designed plan (band-aware for sea / underground). */
export function planBackArt(plan: {
  group: DesignGroup;
  seaBand?: SeaBand;
  subBand?: SubBand;
}): string {
  return tileBackImage(plan.group, planBackLabel(plan));
}

/** Label for a placed/dragged plan — sea/underground read their band, every other group its numeral. */
function planGroupLabel(plan: { group: DesignGroup; seaBand?: SeaBand; subBand?: SubBand }): string {
  if (plan.group === "sea") {
    return `Sea ${SEA_BAND_NUMERAL[plan.seaBand ?? "iv-v"]}`;
  }
  if (plan.group === "subterranean") {
    return `Underground ${SUB_BAND_NUMERAL[plan.subBand ?? "iv-v"]}`;
  }
  return TILE_GROUP_LABELS[plan.group];
}

/**
 * Tile-outline colours mirror the creature-tier ladder, so a designer instantly
 * reads the band's MAX recruitable unit tier from the ring: Ⅰ = bronze, Ⅱ–Ⅲ =
 * silver, Ⅳ–Ⅴ = gold, Ⅵ–Ⅶ = azure. The land hues reuse the app's canonical grade
 * colours (`.tierDot.*` / `.neutralDeck.*` in globals.css). Sea is a light blue
 * and Underground keeps its purple. This is the MAP-EDITOR outline only — the
 * in-game yellow movement borders (screen.tsx / borders.ts) are untouched.
 */
const GROUP_COLORS: Record<DesignGroup, string> = {
  starting: "#b46f33", // bronze — Ⅰ tiles guard bronze units only
  far: "#c7ccd6", // silver — Ⅱ–Ⅲ tiles top out at silver
  near: "#e7b73c", // gold — Ⅳ–Ⅴ tiles top out at gold
  center: "#3f7fd6", // azure — Ⅵ–Ⅶ tiles reach azure
  sea: "#8fd8ff", // light blue — water
  subterranean: "#7a5a9e" // purple — underground (kept, per the design brief)
};

/** Band-legend order: the six DesignGroups from weakest (Ⅰ) to Sea/Underground. */
const BAND_LEGEND_GROUPS: readonly DesignGroup[] = [
  "starting",
  "far",
  "near",
  "center",
  "sea",
  "subterranean"
];

/** The draggable palette: one entry per tile type the designer can place. */
const PALETTE: {
  key: string;
  group: DesignGroup;
  seaBand?: SeaBand;
  subBand?: SubBand;
  label: string;
  hint: string;
}[] = [
  {
    key: "starting",
    group: "starting",
    label: "Town",
    hint: "A player's starting town. The first one placed is seat 1, the next seat 2, and so on — the tile art comes from each player's faction."
  },
  {
    key: "far",
    group: "far",
    label: "Far",
    hint: "Weak outer tile. Placed face-down (random from the Far pool) — click it to reveal a specific tile."
  },
  {
    key: "near",
    group: "near",
    label: "Near",
    hint: "Mid-strength tile. Placed face-down (random from the Near pool)."
  },
  {
    key: "center",
    group: "center",
    label: "Center",
    hint: "Strong central tile. Placed face-down (random from the Center pool)."
  },
  {
    key: "sea-iv-v",
    group: "sea",
    seaBand: "iv-v",
    label: "Sea Ⅳ–Ⅴ",
    hint: "Weaker sea tile (Ⅳ–Ⅴ guard band). Placed face-down — draws a random Ⅳ–Ⅴ tile from the wave pool."
  },
  {
    key: "sea-vi-vii",
    group: "sea",
    seaBand: "vi-vii",
    label: "Sea Ⅵ–Ⅶ",
    hint: "Stronger sea tile (Ⅵ–Ⅶ guard band). Placed face-down — draws a random Ⅵ–Ⅶ tile from the wave pool."
  },
  {
    key: "sub-iv-v",
    group: "subterranean",
    subBand: "iv-v",
    label: "Underground Ⅳ–Ⅴ",
    hint: "Regular underground tile (Ⅳ–Ⅴ guard band). Placed face-down — draws a random Ⅳ–Ⅴ tile from the underground pool."
  },
  {
    key: "sub-vi-vii",
    group: "subterranean",
    subBand: "vi-vii",
    label: "Underground Ⅵ–Ⅶ",
    hint: "Boss underground tile (Ⅵ–Ⅶ guard band — Cyclops Stockpile or Random Town). Placed face-down — draws a random Ⅵ–Ⅶ tile from the underground pool."
  }
];

/** Groups whose tiles can be flipped face up and chosen exactly. */
const PICKABLE_GROUPS = new Set<DesignGroup>(["far", "near", "center", "sea", "subterranean"]);

/** The physical supply of numbered Whirlpool tokens (+1 / 0 / -1). */
const MAX_WHIRLPOOL_TOKENS = 3;

/**
 * Center-tile Ⅶ-field designations for the popover picker. `undefined` = Default
 * (keep the drawn/chosen tile's printed objective); the others FORCE the
 * difficulty-7 field. Order = picker order.
 */
const VII_FIELD_OPTIONS: { id: CustomMapTilePlan["viiField"]; label: string; hint: string }[] = [
  { id: undefined, label: "Default", hint: "Keep whatever objective the drawn / chosen tile prints." },
  { id: "grail", label: "Grail", hint: "Force the Grail dig site on this slot's Ⅶ field." },
  { id: "dragon_utopia", label: "Dragon Utopia", hint: "Force the Dragon Utopia on this slot's Ⅶ field." },
  { id: "town", label: "Town", hint: "Force a neutral conquerable Random Town on this slot's Ⅶ field." }
];

/**
 * Fold a partial patch into a plan's center-hex customization, dropping empty
 * arms so an all-cleared editor stores `undefined` (nothing serialized).
 */
function nextCenterHex(
  current: CustomCenterHexPlan | undefined,
  patch: Partial<CustomCenterHexPlan>
): CustomCenterHexPlan | undefined {
  const next: CustomCenterHexPlan = { ...(current ?? {}), ...patch };
  if (!next.guard) {
    delete next.guard;
  }
  if (!next.reward) {
    delete next.reward;
  }
  if (!next.vp) {
    delete next.vp;
  }
  if (!next.winCondition) {
    delete next.winCondition;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Fold a partial patch into a plan's per-tile settlement customization. */
function nextSettlementPlan(
  current: CustomMapSettlementFieldPlan | undefined,
  patch: Partial<CustomMapSettlementFieldPlan>
): CustomMapSettlementFieldPlan | undefined {
  const next: CustomMapSettlementFieldPlan = { ...(current ?? {}), ...patch };
  if (!next.guard) {
    delete next.guard;
  }
  if (!next.reward) {
    delete next.reward;
  }
  if (!next.vp) {
    delete next.vp;
  }
  if (!next.holdRoundsToWin) {
    delete next.holdRoundsToWin;
  }
  if (!next.winCondition) {
    delete next.winCondition;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Fold a partial patch into a tile's SPECIFIC object plan (obelisk / mine). */
function nextObjectPlan(
  current: CustomObjectFieldPlan | undefined,
  patch: Partial<CustomObjectFieldPlan>
): CustomObjectFieldPlan | undefined {
  const next: CustomObjectFieldPlan = { ...(current ?? {}), ...patch };
  for (const key of [
    "guard",
    "reward",
    "vp",
    "breakField",
    "persistentGuard",
    "unlimitedRounds",
    "winCondition"
  ] as const) {
    if (!next[key]) {
      delete next[key];
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Fold one kind's plan into a tile's objectPlans record (empty → undefined). */
function nextObjectPlans(
  current: CustomMapTilePlan["objectPlans"],
  kind: "obelisk" | "mine",
  plan: CustomObjectFieldPlan | undefined
): CustomMapTilePlan["objectPlans"] {
  const next = { ...(current ?? {}) };
  if (plan) {
    next[kind] = plan;
  } else {
    delete next[kind];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Does this plan's pinned def carry the location (face-up eligibility)? */
function planDefHasLocation(plan: CustomMapTilePlan, location: "obelisk" | "mine"): boolean {
  const def = plan.tileDefId ? allTileDefinitions[plan.tileDefId] : undefined;
  return Boolean(def?.fields.some((field) => field.location === location));
}

/**
 * SPECIFIC-mode eligibility: which plans may carry a per-tile plan for this
 * object kind. Face-up pinned tiles must PRINT the location; a face-down tile
 * qualifies when a secret landmark guarantees a matching draw (mines), else it
 * is skipped (random content — the plan could land inert).
 */
function planEligibleForObjectKind(plan: CustomMapTilePlan, kind: "obelisk" | "mine"): boolean {
  if (plan.group === "starting") {
    return false;
  }
  if (!plan.faceDown) {
    return planDefHasLocation(plan, kind);
  }
  if (plan.tileDefId) {
    return planDefHasLocation(plan, kind);
  }
  const secrets = [
    ...(plan.secretFeatures ?? []),
    ...(plan.secretFeature ? [plan.secretFeature] : [])
  ];
  if (kind === "mine") {
    return secrets.some(
      (feature) =>
        feature === "gold_mine" ||
        feature === "valuables_mine" ||
        feature === "materials_mine" ||
        feature === "any_mine"
    );
  }
  return secrets.includes("obelisk");
}

/** The object kinds the SPECIFIC pick flow may target on a tile. */
export type SpecificPickKind = "obelisk" | "mine" | "settlement" | "center";

/**
 * SPECIFIC-mode pick eligibility, all kinds: obelisk/mine need the printed (or
 * secret-guaranteed) location; "settlement" any tile whose popover shows the
 * settlement plan (non-sea/center/starting); "center" any Ⅵ–Ⅶ center slot (its
 * centerHex editor customizes the printed OR designated objective).
 */
export function planEligibleForPick(plan: CustomMapTilePlan, kind: SpecificPickKind): boolean {
  if (kind === "obelisk" || kind === "mine") {
    return planEligibleForObjectKind(plan, kind);
  }
  if (kind === "settlement") {
    return plan.group !== "sea" && plan.group !== "center" && plan.group !== "starting";
  }
  return plan.group === "center";
}

/** Plain-words summary of one tile's SPECIFIC settings for `kind` ("" = none). */
export function describeTileSpecificPlan(plan: CustomMapTilePlan, kind: SpecificPickKind): string {
  const bits: string[] = [];
  const fold = (
    p:
      | {
          guard?: CustomGuardSpec;
          reward?: unknown;
          vp?: number;
          winCondition?: boolean;
          holdRoundsToWin?: number;
        }
      | undefined
  ) => {
    if (!p) return;
    if (p.guard) {
      bits.push(
        p.guard.units?.length
          ? `guard: ${describeGuardArmyGrouped(p.guard.units)}`
          : `guard level ${p.guard.level}`
      );
    }
    if (p.reward) bits.push("reward");
    if (p.vp) bits.push(`+${p.vp} VP`);
    if (p.holdRoundsToWin) bits.push(`hold ${p.holdRoundsToWin}r wins`);
    if (p.winCondition) bits.push("first clear WINS");
  };
  if (kind === "obelisk" || kind === "mine") {
    fold(plan.objectPlans?.[kind]);
  } else if (kind === "settlement") {
    fold(plan.settlement);
  } else {
    fold(plan.centerHex);
    if (plan.viiField) bits.push(`forced ${plan.viiField.replace("_", " ")}`);
  }
  return bits.join(" · ");
}

/**
 * Which token kinds a FACE-DOWN plan of this group may carry: sea tiles hide
 * Whirlpools, every other non-starting group hides
 * LAND teleporters — Monoliths AND colored Gates (a Gate is a Monolith with a
 * color, so it joins the Monolith groups). Face-up tiles instead offer whichever
 * kinds have a legal printed field on the chosen tile.
 */
function faceDownTokenKinds(group: DesignGroup): PlanTokenKind[] {
  if (group === "starting") {
    return [];
  }
  return group === "sea" ? ["whirlpool"] : ["monolith", "gate", "oneway_entrance", "oneway_exit"];
}

/** Every kind a tile-plan token may be (teleporters + one-way monoliths). */
type PlanTokenKind = NonNullable<CustomMapTileToken["kind"]>;

/** Gates and one-way monoliths reuse the Monolith LAND legality for every slot/candidate check. */
function tokenLegalityKind(kind: PlanTokenKind): MapTokenKind {
  return kind === "whirlpool" ? "whirlpool" : "monolith";
}

/**
 * Designer token art: a colored Gate renders as the MONOLITH image (tinted by a
 * color ring at the render site); Monolith/Whirlpool use their own scans.
 */
function designerTokenImage(kind: CustomMapObjectKind, number?: -1 | 0 | 1, pair?: 1 | 2 | 3 | 4): string {
  const outpost = outpostObjectImage(kind);
  if (outpost) {
    return outpost;
  }
  if (kind === "oneway_entrance" || kind === "oneway_exit") {
    return onewayMonolithImage(kind === "oneway_entrance" ? "entrance" : "exit", pair ?? 1);
  }
  if (kind === "gate") {
    return teleportGateImage(pair ?? 1);
  }
  return mapTokenImage(kind as "monolith" | "whirlpool", number);
}

/**
 * The pending (face-down) shape of a tile token. The physical `slot` is kept so
 * the designer's token stays on the exact hex they picked; setup turns it into
 * an absolute preferred hex before the tile can be rotated on discovery. A
 * colored Gate also preserves its `pair`.
 */
function faceDownTokenOf(token: CustomMapTilePlan["token"]): CustomMapTilePlan["token"] {
  if (!token) {
    return undefined;
  }
  const slotPart = token.slot !== undefined ? { slot: token.slot } : {};
  return token.kind === "gate"
    ? { kind: "gate", pair: token.pair, ...slotPart }
    : { kind: token.kind, ...slotPart };
}

/**
 * Build a `plan.token` for a kind/pair, with an optional face-up slot, guard
 * and the one-way extras (`carry` preserves exitMode / alwaysPickable across
 * moves and slot changes so a drag never silently resets them).
 */
function tileTokenValue(
  kind: PlanTokenKind,
  pair: 1 | 2 | 3 | 4 | undefined,
  slot: number | undefined,
  guard?: CustomGuardSpec,
  carry?: Pick<CustomMapTileToken, "exitMode" | "alwaysPickable" | "reward" | "vp">
): NonNullable<CustomMapTilePlan["token"]> {
  const slotPart = slot !== undefined ? { slot } : {};
  const guardPart = guard ? { guard } : {};
  const rewardPart = carry?.reward ? { reward: carry.reward } : {};
  const vpPart = carry?.vp && carry.vp > 0 ? { vp: carry.vp } : {};
  const pairPart =
    kind === "gate" || kind === "oneway_entrance" || kind === "oneway_exit" ? { pair } : {};
  // Exit-mode vocabulary is shared by one-way entrances AND two-way gates/monoliths.
  const carriesExitMode = kind === "oneway_entrance" || kind === "gate" || kind === "monolith";
  const carriesAlwaysPickable = kind === "oneway_exit" || kind === "gate" || kind === "monolith";
  const carryPart = {
    ...(carriesExitMode && carry?.exitMode ? { exitMode: carry.exitMode } : {}),
    ...(carriesAlwaysPickable && carry?.alwaysPickable ? { alwaysPickable: true } : {})
  };
  return { kind, ...pairPart, ...slotPart, ...guardPart, ...rewardPart, ...vpPart, ...carryPart };
}

/** A resolved drop target for a teleporter placement: an ON-tile token, or an OFF-tile standalone hex. */
type TokenDropTarget =
  | { target: "tile"; planIndex: number; slot?: number }
  | { target: "standalone"; row: number; col: number };

/**
 * The tiles a token of `kind` may land on — the CANONICAL on-tile targets shared
 * by armed placement, the placed-object drag (convert → token) and the tile-token
 * drag (move). One token per tile (a tile already carrying a token is off-limits,
 * except the drag's own source). Two target shapes:
 *  - FACE-UP tile with a def → each legal printed slot for the kind (`slot` set);
 *  - FACE-DOWN tile whose group accepts the kind (`faceDownTokenKinds`) → all
 *    seven physical flower slots. The selected slot becomes the preferred
 *    absolute in-game hex; if the random tile makes it illegal after reveal,
 *    the normal legal-field picker remains the safe fallback.
 * A Gate reuses the Monolith land legality (`tokenLegalityKind`).
 */
function computeTileTokenTargets(
  customMap: CustomMapTilePlan[],
  kind: PlanTokenKind,
  sourceIndex: number | null,
  sourceTokenIndex = 0
): { planIndex: number; slot?: number; hex: HexCoord; row: number; col: number }[] {
  const legalityKind = tokenLegalityKind(kind);
  const out: { planIndex: number; slot?: number; hex: HexCoord; row: number; col: number }[] = [];
  customMap.forEach((plan, planIndex) => {
    const isSource = planIndex === sourceIndex;
    // Multi-token tiles: a tile stays a target as long as it has FREE hex
    // slots (tokens + Field Overrides both claim slots; never stacked). The
    // drag's own source tile frees the DRAGGED token's slot.
    const occupied = occupiedSlotsOnPlan(plan);
    if (isSource) {
      const draggedSlot = planTokens(plan)[sourceTokenIndex]?.slot;
      if (typeof draggedSlot === "number") {
        occupied.delete(draggedSlot);
      }
    }
    if (!plan.faceDown) {
      if (!plan.tileDefId) {
        return;
      }
      const def = allTileDefinitions[plan.tileDefId];
      if (!def) {
        return;
      }
      for (const slot of legalTokenSlotsForTileDef(def, legalityKind)) {
        if (occupied.has(slot)) {
          continue;
        }
        out.push({
          planIndex,
          slot,
          hex: tileFootprint({ row: plan.row, col: plan.col }, plan.rotation ?? 0)[slot],
          row: plan.row,
          col: plan.col
        });
      }
      return;
    }
    if (!faceDownTokenKinds(plan.group).includes(kind)) {
      return;
    }
    for (const [slot, hex] of tileFootprint({ row: plan.row, col: plan.col }, plan.rotation ?? 0).entries()) {
      if (occupied.has(slot)) {
        continue;
      }
      out.push({ planIndex, slot, hex, row: plan.row, col: plan.col });
    }
  });
  return out;
}

/** Ring direction names for slots 1-6, before rotation. */
const SLOT_DIRECTIONS = ["NE", "E", "SE", "SW", "W", "NW"] as const;

/** Human label for a tile-definition slot in the token slot picker. */
function tokenSlotLabel(defId: string | undefined, slot: number, rotation: number): string {
  const def = defId ? allTileDefinitions[defId] : undefined;
  const fieldDef = def?.fields[slot];
  const where = slot === 0 ? "Centre" : `${SLOT_DIRECTIONS[(slot - 1 + rotation) % 6]} edge`;
  const location = fieldDef ? locationDefinitions[fieldDef.location]?.name ?? fieldDef.location : "field";
  return `${where} — ${location}`;
}

/** Short landmark chips shown on a clickable tile card in the designer picker. */
function tileFeatureTags(def: TileDefinition): string[] {
  const tags: string[] = [];
  for (const field of def.fields) {
    if (field.location === "empty_field" || field.location === "blocked_field") {
      continue;
    }
    if (field.location === "mine") {
      const resource =
        field.resource === "gold"
          ? "Gold mine"
          : field.resource === "valuables"
            ? "Valuables mine"
            : field.resource === "buildingMaterials"
              ? "Materials mine"
              : "Mine";
      tags.push(resource);
      continue;
    }
    const name = locationDefinitions[field.location]?.name ?? field.location;
    tags.push(name);
  }
  return tags.length > 0 ? tags : [titleCase(def.terrain)];
}

/**
 * Landmark filters for the clickable tile picker — pick a chip, then click a
 * tile. "all" shows every tile in the slot's pool. Optional `iconSrc` is
 * board-game art for the chip face.
 */
const TILE_PICK_FILTERS: {
  id: string;
  label: string;
  iconSrc?: string;
  match: (def: TileDefinition) => boolean;
}[] = [
  { id: "all", label: "All", match: () => true },
  {
    id: "mine",
    label: "Mine",
    iconSrc: "/assets/glyphs/treasure.svg",
    match: (def) => def.fields.some((field) => field.location === "mine")
  },
  {
    id: "gold",
    label: "Gold",
    iconSrc: "/assets/icons/resource-gold.webp",
    match: (def) => def.fields.some((field) => field.location === "mine" && field.resource === "gold")
  },
  {
    id: "valuables",
    label: "Valuables",
    iconSrc: "/assets/icons/resource-valuables.webp",
    match: (def) => def.fields.some((field) => field.location === "mine" && field.resource === "valuables")
  },
  {
    id: "obelisk",
    label: "Obelisk",
    iconSrc: "/assets/icons/location-obelisk.webp",
    match: (def) => def.fields.some((field) => field.location === "obelisk")
  },
  {
    id: "settlement",
    label: "Settlement",
    iconSrc: "/assets/icons/location-settlement.webp",
    match: (def) => def.fields.some((field) => field.location === "settlement")
  },
  {
    id: "town",
    label: "Town",
    iconSrc: "/assets/glyphs/building_citadel.svg",
    match: (def) => def.fields.some((field) => field.location === "town" || field.location === "random_town")
  },
  {
    id: "objective",
    label: "Grail / Dragons",
    iconSrc: "/assets/icons/location-grail.webp",
    match: (def) =>
      def.fields.some((field) => field.location === "grail" || field.location === "dragon_utopia")
  }
];

/** How a non-starting designed tile is configured for players. */
type TileSlotMode = "random" | "secret" | "faceup" | "one-of";

function tileSlotMode(plan: CustomMapTilePlan): TileSlotMode {
  if (!plan.faceDown) {
    // Face-up: an exact chosen tile, OR a "one of these tiles" random list (a
    // random one from the list is placed revealed at game start).
    if (!plan.tileDefId && plan.oneOfTileDefIds && plan.oneOfTileDefIds.length > 0) {
      return "one-of";
    }
    return "faceup";
  }
  // Secret = a landmark filter (one or several) OR a legacy exact pin (both stay
  // face-down until found).
  return planAllowedSecretFeatures(plan).length > 0 || plan.tileDefId ? "secret" : "random";
}

/** Board / title label for a secret slot (feature set preferred over exact pin). */
function secretBoardLabel(plan: CustomMapTilePlan): string {
  const features = planAllowedSecretFeatures(plan);
  if (features.length > 0) {
    return `🔒 ${features.map(secretFeatureLabel).join(" / ")}`;
  }
  if (plan.tileDefId) {
    return `🔒 ${plan.tileDefId}`;
  }
  return "🔒 Secret";
}

/**
 * Revalidates a plan's token against a new face-up tile definition: the slot is
 * kept when still legal, else moved to the first legal slot, else the token is
 * dropped (the chosen tile simply has no field the token may overwrite).
 */
function retargetTokenForDef(
  token: CustomMapTilePlan["token"],
  tileDefId: string | undefined
): CustomMapTilePlan["token"] {
  if (!token) {
    return undefined;
  }
  const def = tileDefId ? allTileDefinitions[tileDefId] : undefined;
  if (!def) {
    return undefined;
  }
  const legal = legalTokenSlotsForTileDef(def, tokenLegalityKind(token.kind));
  if (legal.length === 0) {
    return undefined;
  }
  const slot = token.slot !== undefined && legal.includes(token.slot) ? token.slot : legal[0];
  // A colored Gate keeps its `pair`; Monolith/Whirlpool carry none.
  return token.kind === "gate" ? { kind: "gate", pair: token.pair, slot } : { kind: token.kind, slot };
}

/**
 * Multi-token write patch: map EVERY token pin on a plan (tokens array +
 * legacy singular folded in) through `transform`; dropped entries (undefined)
 * disappear. Always writes the canonical `tokens` array and clears the legacy
 * singular so the two forms can never coexist (coexistence duplicates pins).
 */
function tokensPatch(
  plan: CustomMapTilePlan,
  transform: (token: NonNullable<CustomMapTilePlan["token"]>) => CustomMapTilePlan["token"]
): { tokens: CustomMapTilePlan["tokens"]; token: undefined } {
  const list = planTokens(plan)
    .map((token) => transform(token))
    .filter((token): token is NonNullable<CustomMapTilePlan["token"]> => Boolean(token));
  return { tokens: list.length > 0 ? list : undefined, token: undefined };
}

/**
 * Face-up retarget of EVERY token pin to DISTINCT legal slots on the new tile
 * definition (Field Override pins keep their slots and block those hexes);
 * tokens the new tile cannot host are dropped, like the singular retarget.
 */
function retargetTokensForDef(
  plan: CustomMapTilePlan,
  tileDefId: string | undefined
): { tokens: CustomMapTilePlan["tokens"]; token: undefined } {
  const def = tileDefId ? allTileDefinitions[tileDefId] : undefined;
  const used = new Set<number>(
    planFieldOverrides(plan)
      .map((pin) => pin.slot)
      .filter((slot): slot is number => typeof slot === "number")
  );
  return tokensPatch(plan, (token) => {
    if (!def) {
      return undefined;
    }
    const legal = legalTokenSlotsForTileDef(def, tokenLegalityKind(token.kind)).filter(
      (slot) => !used.has(slot)
    );
    if (legal.length === 0) {
      return undefined;
    }
    const slot = token.slot !== undefined && legal.includes(token.slot) ? token.slot : legal[0];
    used.add(slot);
    return token.kind === "gate" ? { kind: "gate", pair: token.pair, slot } : { kind: token.kind, slot };
  });
}

/**
 * Slots (0-6) a Field Override kind may pin on a plan. A FACE-UP tile filters
 * by the printed definition's legality (fieldOverrideMayCoverFieldDef) so a
 * pin the engine would drop at setup is never offered; a FACE-DOWN tile's
 * slots are physical hex pins — all seven qualify. Occupied slots (tokens +
 * other overrides) are excluded; `keepSlot` frees a pin's own current slot.
 */
function fieldOverridePinSlots(plan: CustomMapTilePlan, kind: string, keepSlot?: number): number[] {
  const overrideDef = getFieldOverrideDefinition(kind);
  if (!overrideDef || !overrideDef.tileGroups.includes(plan.group as never)) {
    return [];
  }
  const occupied = occupiedSlotsOnPlan(plan);
  if (typeof keepSlot === "number") {
    occupied.delete(keepSlot);
  }
  const free = [0, 1, 2, 3, 4, 5, 6].filter((slot) => !occupied.has(slot));
  if (plan.faceDown) {
    return free;
  }
  const def = plan.tileDefId ? allTileDefinitions[plan.tileDefId] : undefined;
  if (!def) {
    return [];
  }
  return free.filter((slot) =>
    fieldOverrideMayCoverFieldDef(def, slot, overrideDef, plan.group as never)
  );
}

/** Designer hex circumradius — the same pointy-top geometry the map uses. */
const DESIGN_HEX = 24;

/** Pointy-top hexagon corner points around a center. */
function hexCorners(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index - 30);
    points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return points.join(" ");
}

/**
 * The two endpoints of a hex's edge facing `direction` (0-5), matching the
 * {@link hexCorners} / {@link flowerOutline} corner convention, so a drawn
 * border line sits exactly on the flower's outer edge.
 */
function hexEdgePoints(
  cx: number,
  cy: number,
  size: number,
  direction: number
): { x1: number; y1: number; x2: number; y2: number } {
  const corner = (index: number) => {
    const angle = (Math.PI / 180) * (60 * index - 30);
    return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
  };
  const a = corner((direction + 5) % 6);
  const b = corner(direction % 6);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * A plan's per-edge yellow borders in the forward form: its own `borderEdges`
 * (canonical edge codes) UNIONed with any legacy whole-arc `extraBorders`,
 * expanded to their three outer-edge codes. The designer READS borders through
 * this so a map still carrying legacy arcs shows every wall, and WRITES only
 * `borderEdges` — folding the arcs in — on the first edit.
 */
function planEffectiveBorderEdges(plan: CustomMapTilePlan): number[] {
  const edges: number[] = plan.borderEdges ? [...plan.borderEdges] : [];
  for (const direction of plan.extraBorders ?? []) {
    if (!Number.isInteger(direction) || direction < 0 || direction > 5) {
      continue;
    }
    const footprintIndex = direction + 1; // the ring hex facing this absolute direction
    for (const edgeDir of [(direction + 5) % 6, direction, (direction + 1) % 6]) {
      edges.push(canonicalTileEdgeCode(footprintIndex, edgeDir));
    }
  }
  return normalizeDesignedBorderEdges(edges);
}

/**
 * Writes a plan's per-edge borders and drops any legacy `extraBorders` (the
 * caller folds the arcs into `edges` via {@link planEffectiveBorderEdges} first).
 */
function writePlanBorderEdges(plan: CustomMapTilePlan, edges: number[]): CustomMapTilePlan {
  const next: CustomMapTilePlan = { ...plan };
  delete next.extraBorders;
  if (edges.length > 0) {
    next.borderEdges = edges;
  } else {
    delete next.borderEdges;
  }
  return next;
}

/** A stable key for a physical board edge — the unordered pair of hexes it splits. */
function boardEdgeKey(a: HexCoord, b: HexCoord): string {
  const aFirst = a.row < b.row || (a.row === b.row && a.col <= b.col);
  const first = aFirst ? a : b;
  const second = aFirst ? b : a;
  return `${first.row}:${first.col}|${second.row}:${second.col}`;
}

/**
 * One tile's stake in a physical board edge: which plan, and the canonical edge
 * code in THAT plan's footprint frame. A cross-tile edge collects one incidence
 * per side (different plans, different codes); an inner edge, one.
 */
type BorderEdgeIncidence = { planIndex: number; code: number };

/** A standalone object hex's stake in a board edge: which object, which of ITS six edges. */
type BorderEdgeObjectIncidence = { objectIndex: number; direction: number };

/**
 * A single clickable border-paint edge: its geometry (a footprint hex + the
 * absolute direction of the edge) and every plan / standalone object that
 * borders it. The FIRST tile incidence (plans-array order) owns the WRITE; a
 * zone with no tile incidence is an OBJECT-hex edge and writes to its first
 * object. `active`/ERASE consider all sides.
 */
type BorderEdgeZone = {
  hex: HexCoord;
  direction: number;
  incidences: BorderEdgeIncidence[];
  objectIncidences: BorderEdgeObjectIncidence[];
};

/** A thin quad centred on a hex edge — the pointerdown/enter hit target for painting. */
function edgeStripPoints(cx: number, cy: number, size: number, direction: number, thickness: number): string {
  const { x1, y1, x2, y2 } = hexEdgePoints(cx, cy, size, direction);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ox = (-dy / length) * (thickness / 2);
  const oy = (dx / length) * (thickness / 2);
  return [
    `${x1 + ox},${y1 + oy}`,
    `${x2 + ox},${y2 + oy}`,
    `${x2 - ox},${y2 - oy}`,
    `${x1 - ox},${y1 - oy}`
  ].join(" ");
}

/** The outline of a 7-hex flower as one SVG path (outer edges only). */
function flowerOutline(center: HexCoord, size: number): string {
  const cells = tileFootprint(center, 0);
  const cellKeys = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
  const segments: string[] = [];
  for (const cell of cells) {
    const { x, y } = hexToPixel(cell, size);
    const corners: { x: number; y: number }[] = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI / 180) * (60 * index - 30);
      corners.push({ x: x + size * Math.cos(angle), y: y + size * Math.sin(angle) });
    }
    const neighbors = hexNeighbors(cell);
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = neighbors[direction];
      if (cellKeys.has(`${neighbor.row}:${neighbor.col}`)) {
        continue;
      }
      const a = corners[(direction + 5) % 6];
      const b = corners[direction % 6];
      segments.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
    }
  }
  return segments.join(" ");
}

/** A live drag of a tile type from the palette, or of an already-placed tile. */
type DesignDrag =
  | { kind: "palette"; group: DesignGroup; seaBand?: SeaBand; subBand?: SubBand; clientX: number; clientY: number }
  | { kind: "move"; index: number; group: DesignGroup; seaBand?: SeaBand; subBand?: SubBand; clientX: number; clientY: number };

/** Stable empty default so the `objects` prop never re-mounts on every render. */
const EMPTY_OBJECTS: CustomMapObject[] = [];
const EMPTY_HEX_EVENTS: CustomHexEvent[] = [];

/** The four Teleport-Gate pairs offered in the Objects palette (1 = red … 4 = violet). */
const GATE_PAIRS: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

/** Guard-difficulty picks for a placed object (0 = no guard, 1-7 = Ⅰ-Ⅶ). */
/**
 * The guard spec an object shows in the EDITOR: the raw spec (so a just-armed
 * empty exact army stays in army mode), with only the legacy number folded.
 * `objectGuardSpec` (the sanitizer) would collapse the transient `{units: []}`
 * editing state, closing the army picker the moment it opened.
 */
function objectGuardDisplay(object: Pick<CustomMapObject, "guard">): CustomGuardSpec | undefined {
  return typeof object.guard === "number" ? { level: object.guard } : object.guard;
}

/**
 * Roman-numeral badge for a designer guard (object or token): a level shows its
 * own numeral, an exact army shows the tier-derived difficulty it counts as.
 */
function guardBadgeNumeral(guard: CustomGuardSpec | undefined): string | null {
  if (!guard) {
    return null;
  }
  if (guard.units && guard.units.length > 0) {
    return ROMAN_NUMERALS[customGuardArmyDifficulty(guard.units)];
  }
  return guard.level ? ROMAN_NUMERALS[guard.level] : null;
}

const ROMAN_NUMERALS = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];

/** A CSS colour for each Gate pair (matches {@link gatePairColor}). */
const GATE_PAIR_CSS: Record<1 | 2 | 3 | 4, string> = {
  1: "#e0483c",
  2: "#3d7fe0",
  3: "#3caf52",
  4: "#b04fd6"
};

/**
 * Map designer board: a real hex-grid view of the scenario. Pan by dragging the
 * empty background, zoom with the wheel (when unlocked), pinch, or toolbar —
 * same camera model as the adventure map (`map-pinch.ts`). Drag a tile type
 * from the palette onto the board to place it; drag a placed tile to move it;
 * click a placed tile to reveal it (face up), flip it back to random, rotate it
 * or remove it. The first Town (Ⅰ) tiles become the player seats.
 */
export function MapDesigner({
  scenarioId,
  customMap,
  onChange,
  objects = EMPTY_OBJECTS,
  onObjectsChange,
  victoryMode,
  hexSize = DESIGN_HEX,
  pickRequest = null,
  onPickResolved,
  hexEvents = EMPTY_HEX_EVENTS,
  onHexEventsChange
}: {
  scenarioId: string;
  customMap: CustomMapTilePlan[];
  onChange: (next: CustomMapTilePlan[]) => void;
  /** Designer one-hex objects (Monolith/Whirlpool tokens + colored Gate pairs). */
  objects?: CustomMapObject[];
  /** Persist an edited object list (lives on the map PRESET, held by the page). */
  onObjectsChange?: (next: CustomMapObject[]) => void;
  /** The map's victory mode (from the preset) — drives the win-condition conflict warning. */
  victoryMode?: VictoryMode;
  hexSize?: number;
  /**
   * SPECIFIC-mode pick armed from the objects panel: eligible tiles highlight,
   * clicking one attaches the per-tile setting (object-plan → opens the tile's
   * options; hex-event → places an event on the exact clicked hex). Escape or
   * a resolving click clears it via {@link onPickResolved}.
   */
  pickRequest?:
    | { kind: "object-plan"; objectKind: SpecificPickKind }
    | { kind: "hex-event" }
    | null;
  onPickResolved?: () => void;
  /** Designer hex events (invisible in game; markers here only). */
  hexEvents?: CustomHexEvent[];
  onHexEventsChange?: (next: CustomHexEvent[]) => void;
}) {
  const scenario = scenarioDefinitions[scenarioId];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [popoverAt, setPopoverAt] = useState<{ x: number; y: number } | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  // Wheel-zoom defaults ON here (the designer board is the main surface). The
  // lock button matches the adventure map: when locked, the wheel scrolls the page.
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState(true);
  const [drag, setDrag] = useState<DesignDrag | null>(null);
  const [hoverSlot, setHoverSlot] = useState<HexCoord | null>(null);
  /** Landmark chip filter for the clickable tile picker (All / Mine / …). */
  const [tilePickFilter, setTilePickFilter] = useState("all");
  /**
   * A live drag of a gate token (automatic OR designed) across its cavern's
   * shared boundaries: pointermove snaps the token pair to the nearest legal
   * position among EVERY eligible touching Surface tile's `candidates` (pure math
   * in gate-drag.ts) as a preview; pointerup commits the pin through the same
   * `pinGateLink` path as the ↻ cycle button — RE-TARGETING the link to the
   * dropped surface when it differs from `surfaceCenter` (the surface the drag
   * started on); pointercancel/Escape discards (the plan is never touched
   * mid-drag, so cancel restores the previous pin by construction). `moved` gates
   * both the commit AND the click-suppression, so a plain click on the token still
   * opens the cavern popover. `hover` carries its own `surfaceCenter`, which is
   * how a drop knows which tile to connect the cavern to.
   */
  const [gateDrag, setGateDrag] = useState<{
    cavernCenter: HexCoord;
    /** Index of the cavern gate-link entry being moved, or -1 for an automatic gate (append). */
    sourceIndex: number;
    /** The grabbed gate's committed pair + surface — identifies WHICH gate follows the pointer. */
    origin: GateDragCandidate;
    candidates: GateDragCandidate[];
    hover: GateDragCandidate | null;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  // Set when a gate drag actually moved, so the trailing click never also
  // opens the popover.
  const gateClickSuppressRef = useRef(false);

  const panRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  // A pending press on a placed tile: a small move promotes it to a drag, a
  // release in place opens its popover.
  const pressRef = useRef<{ pointerId: number; index: number; group: DesignGroup; seaBand?: SeaBand; subBand?: SubBand; startX: number; startY: number; promoted: boolean } | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Touch pinch (zoom + two-finger pan) — same pure math as the adventure map.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ aId: number; bId: number; start: PinchStart } | null>(null);

  // --- Designer objects (Monolith/Whirlpool tokens + colored Gate pairs) ------
  // Click-to-arm placement: arm a kind from the Objects palette, then click a
  // legal candidate cell (a face-up tile slot → tile-slot object, an off-tile
  // empty hex → standalone). A placed object opens its own popover (guard/delete).
  const [armedObject, setArmedObject] = useState<{ kind: CustomMapObjectKind; pair?: 1 | 2 | 3 | 4 } | null>(null);
  const [selectedObjectIndex, setSelectedObjectIndex] = useState<number | null>(null);
  const [objectPopoverAt, setObjectPopoverAt] = useState<{ x: number; y: number } | null>(null);
  // A live drag of an ALREADY-PLACED object (a Gate half / standalone or
  // tile-slot Monolith / Whirlpool) to a new placement. Set on the token's
  // pointerdown; `moved` promotes past the click threshold (a release in place
  // is still a plain click that opens the object panel); release on a candidate
  // commits the new `placement` (kind / pair / guard preserved). Escape /
  // pointercancel aborts — the object list is untouched until release, so
  // cancelling restores the previous placement by construction.
  const [objectDrag, setObjectDrag] = useState<{
    index: number;
    kind: CustomMapObjectKind;
    startX: number;
    startY: number;
    moved: boolean;
    // A placed object drops onto an ON-tile token target (converts to a
    // `plan.token`) OR an OFF-tile standalone hex (stays an object). Object→tile
    // NEVER writes a tile-slot object any more — the canonical on-tile form is a
    // token.
    hover: TokenDropTarget | null;
  } | null>(null);
  // Set when an object drag actually moved, so the trailing click never also
  // opens the object panel.
  const objectClickSuppressRef = useRef(false);
  // The compact docked panel for a tile-carried Monolith/Whirlpool token
  // (`plan.token`) — separate from the giant per-tile panel, so clicking a token
  // edits the TOKEN, not the tile underneath it.
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(null);
  // Which of the plan's token pins (planTokens order) the token panel edits.
  const [selectedTokenPin, setSelectedTokenPin] = useState(0);
  const [tokenPopoverAt, setTokenPopoverAt] = useState<{ x: number; y: number } | null>(null);
  // A live drag of a tile-carried token (monolith or whirlpool) to a new home.
  // ANY token drags — face-up OR face-down — to ANY compatible tile: a face-up
  // tile's legal printed slot or any of a face-down tile's seven physical
  // slots. Same lifecycle as the gate/object token drags.
  const [tokenDrag, setTokenDrag] = useState<{
    index: number;
    /** Which of the plan's token pins (planTokens order) is being dragged. */
    tokenIndex: number;
    kind: PlanTokenKind;
    pair?: 1 | 2 | 3 | 4;
    startX: number;
    startY: number;
    moved: boolean;
    // A tile-carried token drops onto another tile (move) OR an OFF-tile
    // standalone hex (converts to a standalone object — monolith/gate only).
    hover: TokenDropTarget | null;
  } | null>(null);
  const tokenClickSuppressRef = useRef(false);
  // Anime Mod panel — Field Override palette (docs/anime-mod-plan.md §9b).
  const [modPanelOpen, setModPanelOpen] = useState(false);
  /** Which designer gate link (by index) has its guard editors expanded. */
  const [gateGuardEditorIndex, setGateGuardEditorIndex] = useState<number | null>(null);
  // Border paint mode: armed from the Objects palette, it turns every placed
  // tile's six outer-edge ring hexes into clickable zones that seal/unseal a
  // designer yellow border directly on the board (one armed mode at a time).
  const [borderPaint, setBorderPaint] = useState(false);

  const starts = useMemo<HexCoord[]>(
    () => (scenario ? scenario.layout.starts.map((start) => ({ ...start })) : []),
    [scenario]
  );

  // Once the designer places its own Town (Ⅰ) tiles, those become the seats and
  // the scenario's default seats step aside — mirroring the engine, whose map
  // connectivity then anchors on the designed towns.
  const hasDesignerStarts = customMap.some((plan) => plan.group === "starting");
  const startingPlanIndexes = customMap
    .map((plan, index) => (plan.group === "starting" ? index : -1))
    .filter((index) => index >= 0);

  /** Tile centers currently anchoring the board (seeds + placed), minus one. */
  const placedCenters = useCallback(
    (excludeIndex?: number): HexCoord[] => [
      ...(hasDesignerStarts ? [] : starts),
      ...customMap.filter((_, index) => index !== excludeIndex).map((plan) => ({ row: plan.row, col: plan.col }))
    ],
    [customMap, hasDesignerStarts, starts]
  );

  /**
   * Every empty gapless slot bordering the current board (optionally ignoring
   * one tile): the union of each placed tile's six lattice neighbours, minus any
   * that overlaps a tile already down. These are the positions where a tile
   * interlocks with no hole — shown as faint guides while dragging — but a tile
   * may now be dropped freely on any non-overlapping hex, not only these.
   */
  const candidatesFor = useCallback(
    (excludeIndex?: number): HexCoord[] => {
      const placed = placedCenters(excludeIndex);
      const seen = new Map<string, HexCoord>();
      for (const center of placed) {
        for (const neighbor of tileLatticeNeighbors(center)) {
          const key = `${neighbor.row}:${neighbor.col}`;
          if (seen.has(key)) {
            continue;
          }
          if (placed.some((existing) => tileCentersOverlap(existing, neighbor))) {
            continue;
          }
          seen.set(key, neighbor);
        }
      }
      return [...seen.values()];
    },
    [placedCenters]
  );

  const activeCandidates = useMemo<HexCoord[]>(
    () => (drag ? candidatesFor(drag.kind === "move" ? drag.index : undefined) : []),
    [drag, candidatesFor]
  );

  // Every tile the gate planner sees: the placed plans plus the scenario's
  // default seats (Surface tiles) when the designer hasn't placed its own Town
  // tiles — a cavern may descend from a seat, so the seats must count as surface.
  const gatePlacements = useMemo(
    () => [
      ...(hasDesignerStarts ? [] : starts.map((seat) => ({ row: seat.row, col: seat.col, group: "starting" as const }))),
      // Carry the UNDERGROUND override so the gate preview / drag / unreachable
      // ring treat a flagged far/near/center/sea tile as a cavern (the layer
      // predicate mirrors the engine's carve).
      ...customMap.map((plan) => ({ row: plan.row, col: plan.col, group: plan.group, underground: plan.underground }))
    ],
    [customMap, hasDesignerStarts, starts]
  );

  // Monolith/Whirlpool token bookkeeping: counts for the "needs at least 2 to
  // work" warnings and the plan-order Whirlpool numbers (+1, 0, -1 — the same
  // order the engine assigns at setup, so the preview matches the game).
  // Counted ACROSS SOURCES like the gate warnings: tile `token`s PLUS map
  // OBJECTS (standalone and legacy tile-slot alike carve real network fields at
  // setup), so a tile Monolith partnered with a standalone one never warns.
  const tokenCounts = useMemo(() => {
    let monolith = 0;
    let whirlpool = 0;
    for (const plan of customMap) {
      // Multi-token tiles: count EVERY pin (legacy singular folded in).
      for (const token of planTokens(plan)) {
        if (token.kind === "monolith") {
          monolith += 1;
        } else if (token.kind === "whirlpool") {
          whirlpool += 1;
        }
      }
    }
    for (const object of objects) {
      if (object.kind === "monolith") {
        monolith += 1;
      } else if (object.kind === "whirlpool") {
        whirlpool += 1;
      }
    }
    return { monolith, whirlpool };
  }, [customMap, objects]);
  // Whirlpool preview numbers keyed `${planIndex}:${tokenIndex}` — the same
  // plan order (across every token of a plan) the engine assigns at setup.
  const whirlpoolNumberByIndex = useMemo(() => {
    const numbers = new Map<string, -1 | 0 | 1>();
    const order: (-1 | 0 | 1)[] = [1, 0, -1];
    let next = 0;
    customMap.forEach((plan, index) => {
      planTokens(plan).forEach((token, tokenIndex) => {
        if (token.kind === "whirlpool" && next < order.length) {
          numbers.set(`${index}:${tokenIndex}`, order[next++]);
        }
      });
    });
    return numbers;
  }, [customMap]);

  // Designer-chosen gate links, decoded from the cavern plans, so the preview
  // draws the designer's connections (and pinned hexes) exactly as the engine
  // will carve them — including one cavern linked to several Surface tiles.
  const designedLinks = useMemo<DesignedGateLinkLike[]>(() => {
    const links: DesignedGateLinkLike[] = [];
    for (const plan of customMap) {
      // Any UNDERGROUND-layer plan (printed cavern OR flagged tile) owns gate links.
      if (!planIsUnderground(plan) || !plan.gateLinks) {
        continue;
      }
      for (const link of plan.gateLinks) {
        links.push({
          surfaceCenter: { row: link.surface.row, col: link.surface.col },
          cavernCenter: { row: plan.row, col: plan.col },
          gateHex: link.gateHex ? parseHexSpaceId(link.gateHex) ?? undefined : undefined,
          entranceHex: link.entranceHex ? parseHexSpaceId(link.entranceHex) ?? undefined : undefined
        });
      }
    }
    return links;
  }, [customMap]);

  // The Subterranean Gates this layout will carve (same touch rule + one-gate-
  // per-tile + designer links as the engine) and the caverns it leaves with no
  // way in (designer links only ever ADD reachability, so the touch-graph warning
  // never wrongly fires on a linked cavern).
  const plannedGates = useMemo(
    () => planSubterraneanGates(gatePlacements, designedLinks),
    [gatePlacements, designedLinks]
  );
  const unreachableCaverns = useMemo(() => unreachableUndergroundCenters(gatePlacements), [gatePlacements]);
  const unreachableKeys = useMemo(
    () => new Set(unreachableCaverns.map((center) => `${center.row}:${center.col}`)),
    [unreachableCaverns]
  );

  // Map a screen point into the board's drawing space (accounts for viewBox,
  // pan and zoom through the rendered group's live transform matrix).
  const clientToLocal = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const group = gRef.current;
    const ctm = group?.getScreenCTM();
    if (!ctm) {
      return null;
    }
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  }, []);

  const clampScale = useCallback(
    (scale: number) => Math.min(MAP_SCALE_MAX, Math.max(MAP_SCALE_MIN, scale)),
    []
  );

  const zoomBy = useCallback(
    (factor: number) => {
      setCamera((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
    },
    [clampScale]
  );

  // Wheel-to-zoom as a native non-passive listener (React's root wheel is
  // passive — preventDefault from onWheel is ignored and the page would scroll).
  // Only attached while unlocked, matching HexMapBoard.
  useEffect(() => {
    if (!wheelZoomEnabled) {
      return;
    }
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setCamera((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [wheelZoomEnabled, clampScale]);

  // The hex a drop would land on: simply the one under the pointer, free to be
  // any hex on the grid. Only a position whose flower would overlap an existing
  // tile is rejected (overlapping tiles can't share fields) — holes, tip-only
  // contact and fully detached tiles are all allowed.
  const slotAt = useCallback(
    (clientX: number, clientY: number, excludeIndex?: number): HexCoord | null => {
      const local = clientToLocal(clientX, clientY);
      if (!local) {
        return null;
      }
      const target = pixelToHex(local.x, local.y, hexSize);
      const placed = placedCenters(excludeIndex);
      if (placed.some((existing) => tileCentersOverlap(existing, target))) {
        return null;
      }
      return target;
    },
    [clientToLocal, hexSize, placedCenters]
  );

  const closePopover = useCallback(() => {
    setSelectedIndex(null);
    setPopoverAt(null);
    setTilePickFilter("all");
    setGateGuardEditorIndex(null);
  }, []);

  // Close the docked object panel. A single stable callback (mirroring
  // `closePopover`) keeps every clear site — the ✕ button, the mutual-exclusivity
  // clears — a stable ref rather than a fresh inline closure (which the React
  // Compiler otherwise can't reconcile with the object hooks' manual deps).
  const closeObjectPopover = useCallback(() => {
    setSelectedObjectIndex(null);
    setObjectPopoverAt(null);
  }, []);

  // Close the compact tile-token panel. A stable callback (like `closePopover` /
  // `closeObjectPopover`) so `closeAllPanels` and `toggleBorderPaint` keep a
  // stable dependency for the React Compiler.
  const closeTokenPopover = useCallback(() => {
    setSelectedTokenIndex(null);
    setTokenPopoverAt(null);
  }, []);

  // The three docked panels (tile / object / token) are mutually exclusive: one
  // shared clear that every opener calls first, then sets its own state. Factored
  // into a single stable callback so the "which two to close" bookkeeping never
  // becomes a fresh inline closure in the hook chains.
  const closeAllPanels = useCallback(() => {
    closePopover();
    closeObjectPopover();
    closeTokenPopover();
  }, [closePopover, closeObjectPopover, closeTokenPopover]);

  const addTile = useCallback(
    (group: DesignGroup, center: HexCoord, seaBand?: SeaBand, subBand?: SubBand) => {
      const plan: CustomMapTilePlan =
        group === "starting"
          ? { row: center.row, col: center.col, group, faceDown: false }
          : {
              row: center.row,
              col: center.col,
              group,
              faceDown: true,
              ...(group === "sea" && seaBand ? { seaBand } : {}),
              ...(group === "subterranean" && subBand ? { subBand } : {})
            };
      onChange([...customMap, plan]);
    },
    [customMap, onChange]
  );

  const moveTile = useCallback(
    (index: number, center: HexCoord) => {
      onChange(customMap.map((plan, planIndex) => (planIndex === index ? { ...plan, row: center.row, col: center.col } : plan)));
    },
    [customMap, onChange]
  );

  const updateTile = useCallback(
    (index: number, changes: Partial<CustomMapTilePlan>) => {
      onChange(
        customMap.map((plan, planIndex) => {
          if (planIndex !== index) {
            return plan;
          }
          const next = { ...plan, ...changes };
          // Explicit `undefined` clears an optional field (secret pin / feature / token / gate links).
          if (changes.tileDefId === undefined && "tileDefId" in changes) {
            delete next.tileDefId;
          }
          if (changes.oneOfTileDefIds === undefined && "oneOfTileDefIds" in changes) {
            delete next.oneOfTileDefIds;
          }
          if (changes.secretFeature === undefined && "secretFeature" in changes) {
            delete next.secretFeature;
          }
          if (changes.secretFeatures === undefined && "secretFeatures" in changes) {
            delete next.secretFeatures;
          }
          if (changes.token === undefined && "token" in changes) {
            delete next.token;
          }
          if (changes.tokens === undefined && "tokens" in changes) {
            delete next.tokens;
          }
          if (changes.fieldOverride === undefined && "fieldOverride" in changes) {
            delete next.fieldOverride;
          }
          if (changes.fieldOverrides === undefined && "fieldOverrides" in changes) {
            delete next.fieldOverrides;
          }
          if (changes.gateLinks === undefined && "gateLinks" in changes) {
            delete next.gateLinks;
          }
          if (changes.extraBorders === undefined && "extraBorders" in changes) {
            delete next.extraBorders;
          }
          if (changes.borderEdges === undefined && "borderEdges" in changes) {
            delete next.borderEdges;
          }
          if (changes.lockRotation === undefined && "lockRotation" in changes) {
            delete next.lockRotation;
          }
          if (changes.underground === undefined && "underground" in changes) {
            delete next.underground;
          }
          if (changes.viiField === undefined && "viiField" in changes) {
            delete next.viiField;
          }
          if (changes.viiFields === undefined && "viiFields" in changes) {
            delete next.viiFields;
          }
          if (changes.playerViiPick === undefined && "playerViiPick" in changes) {
            delete next.playerViiPick;
          }
          if (changes.playerResourcePick === undefined && "playerResourcePick" in changes) {
            delete next.playerResourcePick;
          }
          if (changes.centerHex === undefined && "centerHex" in changes) {
            delete next.centerHex;
          }
          if (changes.settlement === undefined && "settlement" in changes) {
            delete next.settlement;
          }
          if (changes.objectPlans === undefined && "objectPlans" in changes) {
            delete next.objectPlans;
          }
          return next;
        })
      );
    },
    [customMap, onChange]
  );

  const removeTile = useCallback(
    (index: number) => {
      onChange(customMap.filter((_, planIndex) => planIndex !== index));
      closePopover();
    },
    [customMap, onChange, closePopover]
  );

  /**
   * The ONE write path for the per-edge yellow borders: seal ("draw") or unseal
   * ("erase") one physical board edge. Draw adds the edge's canonical code to the
   * OWNER plan (the first bordering plan); erase drops it from EVERY plan that
   * holds it (a cross-tile edge may be stored on either side). Both fold any
   * legacy whole-arc `extraBorders` into `borderEdges` (via
   * `planEffectiveBorderEdges`) so the designer writes only the forward form.
   */
  const paintEdgeZone = useCallback(
    (zone: BorderEdgeZone, mode: "draw" | "erase") => {
      const owner = zone.incidences[0];
      // DRAW on a tile-bordered edge writes the owner plan; a zone with NO tile
      // incidence is a standalone OBJECT hex edge and writes to its object.
      if (owner) {
        onChange(
          customMap.map((plan, planIndex) => {
            if (mode === "draw") {
              if (planIndex !== owner.planIndex) {
                return plan;
              }
              // Already sealed with no legacy arc left to fold in → no-op.
              if ((plan.borderEdges?.includes(owner.code) ?? false) && !plan.extraBorders) {
                return plan;
              }
              const edges = normalizeDesignedBorderEdges([...planEffectiveBorderEdges(plan), owner.code]);
              return writePlanBorderEdges(plan, edges);
            }
            const codes = zone.incidences
              .filter((incidence) => incidence.planIndex === planIndex)
              .map((incidence) => incidence.code);
            if (codes.length === 0) {
              return plan;
            }
            const effective = planEffectiveBorderEdges(plan);
            if (!effective.some((code) => codes.includes(code))) {
              return plan; // this plan doesn't hold the edge — left untouched
            }
            const edges = normalizeDesignedBorderEdges(effective.filter((code) => !codes.includes(code)));
            return writePlanBorderEdges(plan, edges);
          })
        );
      } else if (mode === "draw") {
        const objectOwner = zone.objectIncidences[0];
        if (objectOwner) {
          onObjectsChange?.(
            objects.map((object, index) => {
              if (index !== objectOwner.objectIndex || object.borderEdges?.includes(objectOwner.direction)) {
                return object;
              }
              const edges = [...(object.borderEdges ?? []), objectOwner.direction].sort((a, b) => a - b);
              return { ...object, borderEdges: edges };
            })
          );
        }
      }
      // ERASE always sweeps the OBJECT side too — a shared tile↔object edge may
      // be sealed from either side, and one erase must clear the whole edge.
      if (mode === "erase" && zone.objectIncidences.length > 0) {
        onObjectsChange?.(
          objects.map((object, index) => {
            const directions = zone.objectIncidences
              .filter((incidence) => incidence.objectIndex === index)
              .map((incidence) => incidence.direction);
            if (directions.length === 0 || !object.borderEdges?.some((dir) => directions.includes(dir))) {
              return object;
            }
            const edges = object.borderEdges.filter((dir) => !directions.includes(dir));
            const next = { ...object };
            if (edges.length > 0) {
              next.borderEdges = edges;
            } else {
              delete next.borderEdges;
            }
            return next;
          })
        );
      }
    },
    [customMap, objects, onChange, onObjectsChange]
  );

  /**
   * The live border-paint stroke's mode (or null when no stroke is in progress).
   * A pointerdown decides draw-vs-erase from the pressed edge; pointerenter over
   * other edges applies the SAME mode until pointerup/cancel/Escape ends it — so
   * one click toggles a single edge and a drag paints a whole line of them.
   */
  const borderStrokeRef = useRef<"draw" | "erase" | null>(null);
  useEffect(() => {
    if (!borderPaint) {
      borderStrokeRef.current = null;
      return;
    }
    const endStroke = () => {
      borderStrokeRef.current = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        borderStrokeRef.current = null;
      }
    };
    window.addEventListener("pointerup", endStroke);
    window.addEventListener("pointercancel", endStroke);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerup", endStroke);
      window.removeEventListener("pointercancel", endStroke);
      window.removeEventListener("keydown", onKey);
    };
  }, [borderPaint]);

  // SPECIFIC-mode pick: Escape cancels the armed pick (same convention as the
  // border-paint stroke discard above).
  useEffect(() => {
    if (!pickRequest || !onPickResolved) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onPickResolved();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickRequest, onPickResolved]);

  /**
   * Arm / disarm the on-board border paint tool. Only one interaction mode runs
   * at a time, so arming it clears any armed object and closes the docked panels
   * (mirrored by `armObject`, which clears border paint). Disarming just leaves
   * those already-clear.
   */
  const toggleBorderPaint = useCallback(() => {
    setArmedObject(null);
    closeAllPanels();
    setBorderPaint((current) => !current);
  }, [closeAllPanels]);

  // --- Designer object geometry + edit helpers -------------------------------
  /** The board hex a placement resolves to (tile-slot honours the tile rotation). */
  const placementToHex = useCallback(
    (placement: CustomMapObject["placement"]): HexCoord => {
      if (placement.type === "standalone") {
        return { row: placement.row, col: placement.col };
      }
      const plan = customMap.find((p) => p.row === placement.row && p.col === placement.col);
      const footprint = tileFootprint({ row: placement.row, col: placement.col }, plan?.rotation ?? 0);
      return footprint[placement.slot] ?? footprint[0];
    },
    [customMap]
  );
  /** The board hex a placed object sits on (tile-slot honours the tile rotation). */
  const objectHexOf = useCallback(
    (object: CustomMapObject): string => hexSpaceId(placementToHex(object.placement)),
    [placementToHex]
  );
  // Which kind's candidate cells light up: the armed palette kind, or (while a
  // placed object is being dragged) the dragged object's kind. The two are
  // mutually exclusive — starting a drag disarms the palette — so a plain
  // precedence is unambiguous. `placementKind`/`placementPair` drive the armed +
  // object-drag candidates; `activeKind` also folds in the tile-token drag so the
  // shared OFF-tile standalone candidates light up for all three flows.
  const placementKind: CustomMapObjectKind | null = armedObject
    ? armedObject.kind
    : objectDrag
      ? objectDrag.kind
      : null;
  const activeKind: CustomMapObjectKind | null = placementKind ?? (tokenDrag ? tokenDrag.kind : null);
  // While dragging a placed object, its OWN hex must not count as occupied so its
  // current neighbourhood stays a legal drop target.
  const draggedObjectIndex = objectDrag ? objectDrag.index : null;
  const objectHexSet = useMemo(() => {
    const set = new Set<string>();
    objects.forEach((object, index) => {
      if (index === draggedObjectIndex) {
        return;
      }
      set.add(objectHexOf(object));
    });
    return set;
  }, [objects, objectHexOf, draggedObjectIndex]);
  const objectValidation = useMemo(
    () => validateCustomMapObjects(customMap, objects, starts),
    [customMap, objects, starts]
  );
  // Win-condition conflicts: a design whose tiles make the chosen victory mode's
  // objective (Grail dig sites / a Dragon Utopia) impossible. Shown live here so
  // the designer sees exactly what the game start will BLOCK.
  const victoryConflicts = useMemo(
    () => victoryDesignConflicts(customMap, victoryMode),
    [customMap, victoryMode]
  );
  // The Grail / Dragon victory modes need supporting tiles; when one is chosen
  // and the design already provides them (no conflicts), show an all-clear so
  // the designer knows the win condition is satisfied, not merely un-warned.
  const victoryModeNeedsDesign =
    victoryMode === "grail" || victoryMode === "dragon-hunt" || victoryMode === "dragon-conqueror";
  const showVictoryAllClear =
    victoryModeNeedsDesign && victoryConflicts.length === 0 && customMap.length > 0;
  // Gate members placed per color — counted across BOTH sources (gate objects +
  // plan gate tokens) so the palette badge matches the in-game per-color network.
  const gatePairPlaced = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const object of objects) {
      if (object.kind === "gate" && object.pair !== undefined) {
        counts[object.pair] = (counts[object.pair] ?? 0) + 1;
      }
    }
    for (const plan of customMap) {
      for (const token of planTokens(plan)) {
        if (token.kind === "gate" && token.pair !== undefined) {
          counts[token.pair] = (counts[token.pair] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [objects, customMap]);
  /** Every tile footprint hex (rotation-invariant) — for standalone candidates. */
  const occupiedTileHexes = useMemo(() => {
    const set = new Set<string>();
    for (const plan of customMap) {
      for (const cell of tileFootprint({ row: plan.row, col: plan.col }, 0)) {
        set.add(hexSpaceId(cell));
      }
    }
    return set;
  }, [customMap]);
  /**
   * ON-tile token targets for ARMED placement / a placed-OBJECT drag — both write
   * the canonical `plan.token`. Face-up legal slots + all seven physical slots
   * on a compatible face-down tile (`computeTileTokenTargets`, source = null
   * since neither is a plan token). A
   * face-up slot is dropped when another object already sits on that hex.
   */
  const tileTokenTargets = useMemo(() => {
    // Outposts (Garrison / Tent / Barrier) are standalone-only — never on a tile.
    if (!placementKind || OUTPOST_OBJECT_KINDS.has(placementKind)) {
      return [] as ReturnType<typeof computeTileTokenTargets>;
    }
    return computeTileTokenTargets(customMap, placementKind as TokenPlacementKind, null).filter(
      (candidate) => candidate.slot === undefined || !objectHexSet.has(hexSpaceId(candidate.hex))
    );
  }, [placementKind, customMap, objectHexSet]);
  /**
   * Empty OFF-tile hexes adjacent to a tile — standalone candidates (land
   * teleporters only, no standalone Whirlpool). Shared by ARMED placement, the
   * OBJECT drag (standalone→standalone move) and the TOKEN drag (token→standalone
   * convert), keyed off `activeKind` so all three flows light the same cells.
   */
  const standaloneCandidates = useMemo<HexCoord[]>(() => {
    if (!activeKind || activeKind === "whirlpool") {
      return [];
    }
    const out: HexCoord[] = [];
    const seen = new Set<string>();
    for (const hexId of occupiedTileHexes) {
      const coord = parseHexSpaceId(hexId);
      if (!coord) {
        continue;
      }
      for (const neighbor of hexNeighbors(coord)) {
        const id = hexSpaceId(neighbor);
        if (occupiedTileHexes.has(id) || objectHexSet.has(id) || seen.has(id)) {
          continue;
        }
        seen.add(id);
        out.push(neighbor);
      }
    }
    return out;
  }, [activeKind, occupiedTileHexes, objectHexSet]);
  /** The board hex a resolved drop target sits on (tile-slot honours rotation). */
  const dropTargetToHex = useCallback(
    (target: TokenDropTarget): HexCoord => {
      if (target.target === "standalone") {
        return { row: target.row, col: target.col };
      }
      const plan = customMap[target.planIndex];
      if (!plan) {
        return { row: 0, col: 0 };
      }
      const footprint = tileFootprint({ row: plan.row, col: plan.col }, plan.rotation ?? 0);
      return target.slot === undefined ? { row: plan.row, col: plan.col } : footprint[target.slot] ?? footprint[0];
    },
    [customMap]
  );
  /**
   * The drop target a placed-OBJECT drag would land on over `hex`: an on-tile
   * token target (release → convert to a `plan.token`), else an off-tile
   * standalone candidate (stays an object), else null (release = no-op).
   */
  const objectDropTargetAtHex = useCallback(
    (hex: HexCoord): TokenDropTarget | null => {
      const id = hexSpaceId(hex);
      const tile = tileTokenTargets.find((candidate) => hexSpaceId(candidate.hex) === id);
      if (tile) {
        return { target: "tile", planIndex: tile.planIndex, slot: tile.slot };
      }
      const standalone = standaloneCandidates.find((candidate) => hexSpaceId(candidate) === id);
      if (standalone) {
        return { target: "standalone", row: standalone.row, col: standalone.col };
      }
      return null;
    },
    [tileTokenTargets, standaloneCandidates]
  );
  /**
   * ON-tile token targets for a TILE-TOKEN drag (move within/between tiles).
   * Same computation as the armed targets but with the dragged token's own tile
   * as the source (so it may reposition within its own slots / footprint). One
   * token per tile otherwise.
   */
  const tokenTileTargets = useMemo(() => {
    if (!tokenDrag) {
      return [] as ReturnType<typeof computeTileTokenTargets>;
    }
    return computeTileTokenTargets(customMap, tokenDrag.kind, tokenDrag.index, tokenDrag.tokenIndex);
  }, [tokenDrag, customMap]);
  /**
   * The drop target a TILE-TOKEN drag would land on over `hex`: another tile
   * (release → move the token) else an off-tile standalone hex (release →
   * convert the token to a standalone object; land kinds only), else null.
   */
  const tokenDropTargetAtHex = useCallback(
    (hex: HexCoord): TokenDropTarget | null => {
      const id = hexSpaceId(hex);
      const tile = tokenTileTargets.find((candidate) => hexSpaceId(candidate.hex) === id);
      if (tile) {
        return { target: "tile", planIndex: tile.planIndex, slot: tile.slot };
      }
      const standalone = standaloneCandidates.find((candidate) => hexSpaceId(candidate) === id);
      if (standalone) {
        return { target: "standalone", row: standalone.row, col: standalone.col };
      }
      return null;
    },
    [tokenTileTargets, standaloneCandidates]
  );

  const armObject = useCallback((kind: CustomMapObjectKind, pair?: 1 | 2 | 3 | 4) => {
    setSelectedObjectIndex(null);
    setObjectPopoverAt(null);
    // One armed mode at a time: arming an object disarms border paint.
    setBorderPaint(false);
    setArmedObject((current) => (current && current.kind === kind && current.pair === pair ? null : { kind, pair }));
  }, []);
  // Armed placement writers (canonical forms). A TILE target writes `plan.token`
  // (on-tile teleporter); a STANDALONE target appends an object (off-tile,
  // monolith/gate only — Whirlpools never stand alone).
  const placeArmedTileToken = useCallback(
    (target: { planIndex: number; slot?: number }) => {
      // Outposts are standalone-only (no tile targets ever light up for them).
      if (!armedObject || OUTPOST_OBJECT_KINDS.has(armedObject.kind)) {
        return;
      }
      const plan = customMap[target.planIndex];
      if (!plan) {
        return;
      }
      const occupied = occupiedSlotsOnPlan(plan);
      const slot =
        target.slot !== undefined && !occupied.has(target.slot)
          ? target.slot
          : firstFreeSlot(occupied);
      if (slot === null) {
        return; // tile hexes full
      }
      const nextToken = tileTokenValue(armedObject.kind as PlanTokenKind, armedObject.pair, slot);
      if (!nextToken) {
        return;
      }
      // Multi-place: append on a free hex; never stack on an occupied slot.
      const existing = planTokens(plan).filter((t) => t.slot !== slot);
      const next = withPlanTokens(plan, [...existing, nextToken]);
      updateTile(target.planIndex, { tokens: next.tokens, token: undefined });
    },
    [armedObject, customMap, updateTile]
  );
  const placeArmedStandalone = useCallback(
    (row: number, col: number) => {
      if (!armedObject || armedObject.kind === "whirlpool") {
        return;
      }
      const needsPair =
        armedObject.kind === "gate" ||
        armedObject.kind === "keymaster_tent" ||
        armedObject.kind === "barrier" ||
        armedObject.kind === "oneway_entrance" ||
        armedObject.kind === "oneway_exit";
      const object: CustomMapObject = {
        kind: armedObject.kind,
        ...(needsPair ? { pair: armedObject.pair ?? 1 } : {}),
        placement: { type: "standalone", row, col }
      };
      onObjectsChange?.([...objects, object]);
    },
    [armedObject, objects, onObjectsChange]
  );
  const setObjectGuard = useCallback(
    (index: number, guard: CustomGuardSpec | undefined) => {
      onObjectsChange?.(
        objects.map((object, i) => {
          if (i !== index) {
            return object;
          }
          const next = { ...object };
          if (guard) {
            next.guard = guard;
          } else {
            delete next.guard;
          }
          return next;
        })
      );
    },
    [objects, onObjectsChange]
  );

  const patchObject = useCallback(
    (index: number, patch: Partial<Pick<CustomMapObject, "reward" | "vp">>) => {
      onObjectsChange?.(
        objects.map((object, i) => {
          if (i !== index) {
            return object;
          }
          const next: CustomMapObject = { ...object };
          if ("reward" in patch) {
            if (patch.reward) next.reward = patch.reward;
            else delete next.reward;
          }
          if ("vp" in patch) {
            if (patch.vp && patch.vp > 0) next.vp = patch.vp;
            else delete next.vp;
          }
          return next;
        })
      );
    },
    [objects, onObjectsChange]
  );
  const removeObject = useCallback(
    (index: number) => {
      onObjectsChange?.(objects.filter((_, i) => i !== index));
      setSelectedObjectIndex(null);
      setObjectPopoverAt(null);
    },
    [objects, onObjectsChange]
  );
  /** Move a placed object to a new standalone placement, preserving kind / pair / guard. */
  const moveObject = useCallback(
    (index: number, placement: CustomMapObject["placement"]) => {
      onObjectsChange?.(objects.map((object, i) => (i === index ? { ...object, placement } : object)));
    },
    [objects, onObjectsChange]
  );
  /**
   * Move a tile-carried token to a target tile. Face-up and face-down targets
   * both write `{ kind, (pair,) slot }`; on a face-down tile the slot identifies
   * the exact physical preferred reveal hex. A colored Gate keeps its `pair`.
   * A same-tile move is one
   * `updateTile`; a cross-tile move is ONE atomic array update (clear the source
   * plan's token, set the target's) — never two `onChange` calls, whose second
   * would clobber the first since the parent holds the array.
   */
  const commitTokenMove = useCallback(
    (sourceIndex: number, tokenIndex: number, target: { planIndex: number; slot?: number }) => {
      const source = customMap[sourceIndex];
      const dragged = source ? planTokens(source)[tokenIndex] : undefined;
      if (!source || !dragged) {
        return;
      }
      const nextToken = tileTokenValue(dragged.kind, dragged.pair, target.slot, dragged.guard, dragged);
      // Never stack: a target slot another placement (token / Field Override)
      // already claims refuses the drop — computeTileTokenTargets filters these
      // out of the glow, this is the write-side backstop.
      const targetPlan = customMap[target.planIndex];
      if (targetPlan && typeof target.slot === "number") {
        const occupied = occupiedSlotsOnPlan(targetPlan);
        if (target.planIndex === sourceIndex && typeof dragged.slot === "number") {
          occupied.delete(dragged.slot);
        }
        if (occupied.has(target.slot)) {
          return;
        }
      }
      if (target.planIndex === sourceIndex) {
        const tokens = planTokens(source).map((token, i) => (i === tokenIndex ? nextToken : token));
        updateTile(sourceIndex, { tokens, token: undefined });
        return;
      }
      onChange(
        customMap.map((plan, planIndex) => {
          if (planIndex === sourceIndex) {
            return withPlanTokens(
              plan,
              planTokens(plan).filter((_, i) => i !== tokenIndex)
            );
          }
          if (planIndex === target.planIndex) {
            return withPlanTokens(plan, [...planTokens(plan), nextToken]);
          }
          return plan;
        })
      );
    },
    [customMap, onChange, updateTile]
  );
  /**
   * Convert a placed OBJECT → a tile TOKEN (an object→tile drop). Removes the
   * object AND writes the canonical `plan.token`. The two callbacks target
   * DIFFERENT arrays (objects vs tiles), so the parent's batched setState applies
   * both without clobbering. The object's GUARD and `pair` are both preserved
   * (tokens carry guards too).
   */
  const convertObjectToTileToken = useCallback(
    (objectIndex: number, target: { planIndex: number; slot?: number }) => {
      const object = objects[objectIndex];
      const plan = customMap[target.planIndex];
      // Outposts are standalone-only — they never convert onto a tile (their
      // drags offer no tile targets, this is the write-side backstop).
      if (!object || !plan || OUTPOST_OBJECT_KINDS.has(object.kind)) {
        return;
      }
      // Never stack on an occupied slot; fall back to the first free hex.
      const occupied = occupiedSlotsOnPlan(plan);
      const slot =
        typeof target.slot === "number" && !occupied.has(target.slot)
          ? target.slot
          : firstFreeSlot(occupied) ?? undefined;
      if (slot === undefined) {
        return; // tile hexes full — keep the standalone object
      }
      onObjectsChange?.(objects.filter((_, i) => i !== objectIndex));
      updateTile(target.planIndex, {
        tokens: [
          ...planTokens(plan),
          tileTokenValue(object.kind as PlanTokenKind, object.pair, slot, objectGuardSpec(object), object)
        ],
        token: undefined
      });
    },
    [customMap, objects, onObjectsChange, updateTile]
  );
  /** Dispatch a placed-object drop: convert onto a tile, or move to a standalone hex. */
  const commitObjectDrop = useCallback(
    (index: number, target: TokenDropTarget) => {
      if (target.target === "tile") {
        convertObjectToTileToken(index, { planIndex: target.planIndex, slot: target.slot });
      } else {
        moveObject(index, { type: "standalone", row: target.row, col: target.col });
      }
    },
    [convertObjectToTileToken, moveObject]
  );
  /**
   * Convert a tile TOKEN → a standalone OBJECT (a token→standalone drop). Deletes
   * the `plan.token` AND appends a standalone object — batched like the reverse.
   * Monolith/Gate only (a Whirlpool never stands alone). The `pair` AND the
   * designer guard are both preserved.
   */
  const convertTokenToStandalone = useCallback(
    (sourceIndex: number, tokenIndex: number, row: number, col: number) => {
      const source = customMap[sourceIndex];
      const dragged = source ? planTokens(source)[tokenIndex] : undefined;
      if (!source || !dragged || dragged.kind === "whirlpool") {
        return;
      }
      const { kind, pair, guard, reward, vp, exitMode, alwaysPickable } = dragged;
      onChange(
        customMap.map((plan, planIndex) => {
          if (planIndex !== sourceIndex) {
            return plan;
          }
          // Remove ONLY the dragged token; sibling tokens stay on the tile.
          return withPlanTokens(
            plan,
            planTokens(plan).filter((_, i) => i !== tokenIndex)
          );
        })
      );
      const object: CustomMapObject = {
        kind,
        ...((kind === "gate" || kind === "oneway_entrance" || kind === "oneway_exit") && pair ? { pair } : {}),
        placement: { type: "standalone", row, col },
        ...(guard ? { guard } : {}),
        ...(reward ? { reward } : {}),
        ...(vp && vp > 0 ? { vp } : {}),
        // Exit-pick extras survive the conversion — one-way AND two-way
        // (gate/monolith) alike, mirroring tileTokenValue's carry rules.
        ...((kind === "oneway_entrance" || kind === "gate" || kind === "monolith") && exitMode
          ? { exitMode }
          : {}),
        ...((kind === "oneway_exit" || kind === "gate" || kind === "monolith") && alwaysPickable
          ? { alwaysPickable: true }
          : {})
      };
      onObjectsChange?.([...objects, object]);
    },
    [customMap, objects, onChange, onObjectsChange]
  );
  /** Dispatch a tile-token drop: move onto a tile, or convert to a standalone object. */
  const commitTokenDrop = useCallback(
    (sourceIndex: number, tokenIndex: number, target: TokenDropTarget) => {
      if (target.target === "tile") {
        commitTokenMove(sourceIndex, tokenIndex, { planIndex: target.planIndex, slot: target.slot });
      } else {
        convertTokenToStandalone(sourceIndex, tokenIndex, target.row, target.col);
      }
    },
    [commitTokenMove, convertTokenToStandalone]
  );

  /**
   * Reposition ONE designer gate link (cavern ↔ Surface) to an exact boundary
   * pair — the ONE commit path shared by the ↻ cycle button, the "+ Gate" add and
   * every gate-token drag, so they all write the same plan shape. `sourceIndex`
   * names the gate-link entry to move: a valid index REPLACES that entry in place
   * (so a drag moves only the gate the user grabbed, and a cross-surface drag
   * simply rewrites its surface — never spawning a duplicate); `-1` APPENDS a new
   * entry, which is how dragging an AUTOMATIC gate (no entry yet) or the "+ Gate"
   * button adds a fresh designer-pinned gate. Replacing in place keeps the array
   * order stable so the per-link rows don't jump around.
   */
  const pinGateLinkAt = useCallback(
    (cavernCenter: HexCoord, sourceIndex: number, surface: { row: number; col: number }, pair: GateHexPair) => {
      const index = customMap.findIndex(
        (plan) => planIsUnderground(plan) && plan.row === cavernCenter.row && plan.col === cavernCenter.col
      );
      const plan = index >= 0 ? customMap[index] : null;
      if (!plan) {
        return;
      }
      const links = plan.gateLinks ?? [];
      // Re-pinning a link in place keeps its designed GUARDS — dragging a gate
      // to another boundary pair must never silently disarm it.
      const previous = sourceIndex >= 0 && sourceIndex < links.length ? links[sourceIndex] : undefined;
      const entry: CustomMapGateLink = {
        surface: { row: surface.row, col: surface.col },
        gateHex: hexSpaceId(pair.gateHex),
        entranceHex: hexSpaceId(pair.entranceHex),
        ...(previous?.gateGuard ? { gateGuard: previous.gateGuard } : {}),
        ...(previous?.entranceGuard ? { entranceGuard: previous.entranceGuard } : {})
      };
      const nextLinks =
        sourceIndex >= 0 && sourceIndex < links.length
          ? links.map((link, i) => (i === sourceIndex ? entry : link))
          : [...links, entry];
      updateTile(index, { gateLinks: nextLinks });
    },
    [customMap, updateTile]
  );

  /**
   * Every boundary position a gate drag on this cavern may snap to, across ALL
   * eligible touching Surface tiles — the model that makes a drag able to pick the
   * connected tile (or a second gate on an already-linked one) by direct
   * manipulation. `sourceIndex` is the entry being dragged (or -1 for an automatic
   * gate). EVERY touching Surface tile is offered — a second gate on an
   * already-linked surface is legal now — but any pair whose gate/entrance hex
   * collides with ANOTHER of this cavern's designed pins is dropped (two gates on
   * one cavern can never share a board hex).
   */
  const gateDragCandidatesFor = useCallback(
    (cavernCenter: HexCoord, sourceIndex: number): GateDragCandidate[] => {
      const cavernPlan = customMap.find(
        (plan) => planIsUnderground(plan) && plan.row === cavernCenter.row && plan.col === cavernCenter.col
      );
      const links = cavernPlan?.gateLinks ?? [];
      const pinnedHexes = new Set<string>();
      links.forEach((link, index) => {
        if (index === sourceIndex) {
          return; // the dragged gate's own hexes are free — it is moving off them
        }
        if (link.gateHex) {
          pinnedHexes.add(link.gateHex);
        }
        if (link.entranceHex) {
          pinnedHexes.add(link.entranceHex);
        }
      });
      const candidates: GateDragCandidate[] = [];
      for (const tile of gatePlacements) {
        // Gate links land on SURFACE tiles only — skip every underground-layer
        // tile (printed cavern OR flagged) as a surface candidate.
        if (planIsUnderground(tile)) {
          continue;
        }
        const surfaceCenter = { row: tile.row, col: tile.col };
        if (!tileFootprintsTouch(cavernCenter, surfaceCenter)) {
          continue;
        }
        for (const pair of legalGateHexPairs(surfaceCenter, cavernCenter)) {
          if (pinnedHexes.has(hexSpaceId(pair.gateHex)) || pinnedHexes.has(hexSpaceId(pair.entranceHex))) {
            continue;
          }
          candidates.push({ ...pair, surfaceCenter });
        }
      }
      return candidates;
    },
    [customMap, gatePlacements]
  );

  // Drag lifecycle: a palette press or a promoted tile press registers window
  // listeners so the ghost follows the pointer anywhere and the drop lands even
  // if it ends outside the board.
  useEffect(() => {
    if (!drag) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      setDrag((current) => (current ? { ...current, clientX: event.clientX, clientY: event.clientY } : current));
      setHoverSlot(slotAt(event.clientX, event.clientY, drag.kind === "move" ? drag.index : undefined));
    };
    const onUp = (event: PointerEvent) => {
      const slot = slotAt(event.clientX, event.clientY, drag.kind === "move" ? drag.index : undefined);
      if (slot) {
        if (drag.kind === "palette") {
          addTile(drag.group, slot, drag.seaBand, drag.subBand);
        } else {
          moveTile(drag.index, slot);
        }
      }
      setDrag(null);
      setHoverSlot(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, slotAt, addTile, moveTile]);

  // Designed-gate token drag lifecycle: pointermove maps the pointer into board
  // space and snap-previews the token pair at the nearest legal boundary
  // position; pointerup commits the pin (same path as the ↻ cycle button);
  // pointercancel/Escape discards — the plan is never touched mid-drag, so
  // cancelling restores the previous pin by construction.
  useEffect(() => {
    if (!gateDrag) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const local = clientToLocal(event.clientX, event.clientY);
      const snapped = local ? nearestGateDragCandidate(local, gateDrag.candidates, hexSize) : null;
      setGateDrag((current) =>
        current
          ? {
              ...current,
              // A small threshold keeps a plain click (open the popover) from
              // registering as a slide, mirroring the tile-press promotion.
              moved:
                current.moved ||
                Math.abs(event.clientX - current.startX) > 3 ||
                Math.abs(event.clientY - current.startY) > 3,
              hover: snapped ?? current.hover
            }
          : current
      );
    };
    const onUp = () => {
      if (gateDrag.moved && gateDrag.hover) {
        // Commit at the snapped pair AND its surface. `sourceIndex` moves ONLY the
        // grabbed gate: a designed gate is repositioned in place (its surface
        // rewritten on a cross-surface drop), an automatic gate (index -1) is
        // appended as a fresh designer link.
        pinGateLinkAt(gateDrag.cavernCenter, gateDrag.sourceIndex, gateDrag.hover.surfaceCenter, gateDrag.hover);
        // The browser still fires a click after the release — swallow it so a
        // finished slide does not also pop the cavern's options.
        gateClickSuppressRef.current = true;
      }
      setGateDrag(null);
    };
    const onCancel = () => setGateDrag(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGateDrag(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [gateDrag, clientToLocal, hexSize, pinGateLinkAt]);

  // Placed-object drag lifecycle: pointermove maps the pointer into board space,
  // finds the candidate placement under it (tile-slot or standalone) as a live
  // preview, and promotes past the 6px click threshold; pointerup commits the
  // move (kind / pair / guard preserved) and suppresses the trailing click;
  // pointercancel/Escape aborts — the object list is untouched until release.
  useEffect(() => {
    if (!objectDrag) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const local = clientToLocal(event.clientX, event.clientY);
      const hex = local ? pixelToHex(local.x, local.y, hexSize) : null;
      const target = hex ? objectDropTargetAtHex(hex) : null;
      setObjectDrag((current) =>
        current
          ? {
              ...current,
              moved:
                current.moved ||
                Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY) > 6,
              hover: target
            }
          : current
      );
    };
    const onUp = () => {
      if (objectDrag.moved && objectDrag.hover) {
        commitObjectDrop(objectDrag.index, objectDrag.hover);
        objectClickSuppressRef.current = true;
      }
      setObjectDrag(null);
    };
    const onCancel = () => setObjectDrag(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setObjectDrag(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [objectDrag, clientToLocal, hexSize, objectDropTargetAtHex, commitObjectDrop]);

  // Tile-token drag lifecycle: same shape as the object drag — preview the
  // target tile+slot under the pointer, promote past 6px, commit on release
  // (same-tile or the atomic cross-tile move), abort on Escape / pointercancel.
  useEffect(() => {
    if (!tokenDrag) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const local = clientToLocal(event.clientX, event.clientY);
      const hex = local ? pixelToHex(local.x, local.y, hexSize) : null;
      const target = hex ? tokenDropTargetAtHex(hex) : null;
      setTokenDrag((current) =>
        current
          ? {
              ...current,
              moved:
                current.moved ||
                Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY) > 6,
              hover: target
            }
          : current
      );
    };
    const onUp = () => {
      if (tokenDrag.moved && tokenDrag.hover) {
        commitTokenDrop(tokenDrag.index, tokenDrag.tokenIndex, tokenDrag.hover);
        tokenClickSuppressRef.current = true;
      }
      setTokenDrag(null);
    };
    const onCancel = () => setTokenDrag(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTokenDrag(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [tokenDrag, clientToLocal, hexSize, tokenDropTargetAtHex, commitTokenDrop]);

  if (!scenario) {
    return null;
  }

  const size = hexSize;
  const hexWidth = Math.sqrt(3) * size;

  // Project every visible flower cell to find the viewBox.
  const allCenters = [...placedCenters(), ...candidatesFor()];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const center of allCenters) {
    for (const cell of tileFootprint(center, 0)) {
      const { x, y } = hexToPixel(cell, size);
      minX = Math.min(minX, x - hexWidth);
      minY = Math.min(minY, y - size * 1.8);
      maxX = Math.max(maxX, x + hexWidth);
      maxY = Math.max(maxY, y + size * 1.8);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

  const selected = selectedIndex !== null ? customMap[selectedIndex] : null;
  // A tile id may only be used once — face-up OR exact secret face-down pin.
  const usedPinnedIds = new Set(
    customMap.filter((plan) => plan.tileDefId).map((plan) => plan.tileDefId as string)
  );
  const pickableTiles = selected
    ? Object.values(allTileDefinitions)
        .filter((tile) => tile.group === selected.group)
        // Sea slots only reveal tiles from their own guard band (Ⅳ–Ⅴ vs Ⅵ–Ⅶ);
        // legacy slots without a band still see every sea tile.
        .filter((tile) => selected.group !== "sea" || !selected.seaBand || seaTileBand(tile) === selected.seaBand)
        // Underground slots likewise reveal only their own band (Ⅳ–Ⅴ vs the
        // Ⅵ–Ⅶ boss tier); legacy bandless slots still see every underground tile.
        .filter(
          (tile) =>
            selected.group !== "subterranean" || !selected.subBand || subterraneanTileBand(tile) === selected.subBand
        )
        .sort((left, right) => left.id.localeCompare(right.id))
    : [];
  const selectedTileDef = selected?.tileDefId ? allTileDefinitions[selected.tileDefId] : undefined;
  const selectedMode = selected && selected.group !== "starting" ? tileSlotMode(selected) : null;
  // The allowed secret-landmark set of the selected slot (folds the legacy single
  // `secretFeature` in). Empty when the slot is random / face-up / exact-pinned.
  const selectedSecretSet = selected && selected.group !== "starting" ? planAllowedSecretFeatures(selected) : [];
  // HEAD token of the plan (tokens array canonical, legacy singular folded in);
  // the panel edits the head — sibling tokens keep their own slots.
  const selectedToken = selected ? planTokens(selected)[0] : undefined;

  // The tile-carried token whose compact TOKEN panel is open (D2 direct edit).
  // Face-up and face-down tokens both expose their exact physical slot. For a
  // random face-down tile the printed field is unknown, so only its direction is
  // shown; setup keeps that board hex as the preferred reveal placement.
  const tokenPanelPlan = selectedTokenIndex !== null ? customMap[selectedTokenIndex] ?? null : null;
  const tokenPanelToken = tokenPanelPlan
    ? planTokens(tokenPanelPlan)[selectedTokenPin] ?? planTokens(tokenPanelPlan)[0]
    : undefined;
  const tokenPanelPin = tokenPanelPlan
    ? planTokens(tokenPanelPlan)[selectedTokenPin]
      ? selectedTokenPin
      : 0
    : 0;
  const tokenPanelDef =
    tokenPanelPlan && !tokenPanelPlan.faceDown && tokenPanelPlan.tileDefId
      ? allTileDefinitions[tokenPanelPlan.tileDefId]
      : undefined;

  // Landmark chips that match at least one tile in this slot's pool. Tiles the
  // designer pinned by exact id on OTHER slots are spliced out of the random
  // pool at setup, so they can never satisfy this slot's secret — subtract them
  // (the selected slot's own pin would be freed by switching to a feature).
  const availablePickFilters =
    selected && PICKABLE_GROUPS.has(selected.group)
      ? TILE_PICK_FILTERS.filter(
          (filter) => filter.id === "all" || pickableTiles.some((tile) => filter.match(tile))
        )
      : TILE_PICK_FILTERS.slice(0, 1);
  const activePickFilter =
    availablePickFilters.find((entry) => entry.id === tilePickFilter) ?? availablePickFilters[0] ?? TILE_PICK_FILTERS[0];
  const filteredPickableTiles = pickableTiles.filter((tile) => activePickFilter.match(tile));

  // Secret-feature cards that have at least one match in this slot's pool.
  const pinnedElsewhere = new Set(
    customMap
      .filter((plan, index) => plan.tileDefId && index !== selectedIndex)
      .map((plan) => plan.tileDefId as string)
  );
  const availableSecretFeatures = SECRET_TILE_FEATURES.map((feature) => ({
    ...feature,
    matchCount: pickableTiles.filter(
      (tile) => !pinnedElsewhere.has(tile.id) && tileMatchesSecretFeature(tile, feature.id)
    ).length
  })).filter((feature) => feature.matchCount > 0);

  /** Apply Random / Secret / Face-up in one click. */
  const setSelectedSlotMode = (mode: TileSlotMode) => {
    if (selectedIndex === null || !selected || selected.group === "starting") {
      return;
    }
    const fallbackId =
      selected.tileDefId ??
      pickableTiles.find((tile) => !usedPinnedIds.has(tile.id))?.id ??
      pickableTiles[0]?.id;
    // Every token pin (multi-token tiles included) converts to the face-down
    // form; kinds the group's hidden back cannot host are dropped.
    const faceDownTokens = tokensPatch(selected, (token) =>
      faceDownTokenKinds(selected.group).includes(token.kind) ? faceDownTokenOf(token) : undefined
    );

    if (mode === "random") {
      updateTile(selectedIndex, {
        faceDown: true,
        tileDefId: undefined,
        oneOfTileDefIds: undefined,
        secretFeature: undefined,
        secretFeatures: undefined,
        ...faceDownTokens
      });
      return;
    }
    if (mode === "secret") {
      // Prefer a landmark filter over pinning one tile. Keep the existing set
      // (whatever still matches the pool); otherwise the first available feature.
      const keptSet = planAllowedSecretFeatures(selected).filter((id) =>
        availableSecretFeatures.some((entry) => entry.id === id)
      );
      const features = keptSet.length > 0 ? keptSet : availableSecretFeatures[0] ? [availableSecretFeatures[0].id] : [];
      updateTile(selectedIndex, {
        faceDown: true,
        // Feature secrets clear an exact pin so the pool can still vary.
        tileDefId: features.length > 0 ? undefined : selected.tileDefId ?? fallbackId,
        oneOfTileDefIds: undefined,
        secretFeature: undefined,
        secretFeatures: features.length > 0 ? features : undefined,
        ...faceDownTokens
      });
      return;
    }
    if (mode === "one-of") {
      // "One of these tiles": a face-up slot that places a RANDOM tile from a
      // designer-chosen list at setup. Seed the list with the current exact tile
      // (or the fallback) so it is never empty; the designer then toggles more
      // tiles in the grid below. Tokens fold to their face-down (physical-hex)
      // form since the concrete tile — and its printed slots — is unknown here.
      const seedList =
        selected.oneOfTileDefIds && selected.oneOfTileDefIds.length > 0
          ? selected.oneOfTileDefIds
          : selected.tileDefId
            ? [selected.tileDefId]
            : fallbackId
              ? [fallbackId]
              : [];
      if (seedList.length === 0) {
        return;
      }
      updateTile(selectedIndex, {
        faceDown: false,
        tileDefId: undefined,
        oneOfTileDefIds: seedList,
        secretFeature: undefined,
        secretFeatures: undefined,
        ...tokensPatch(selected, (token) =>
          faceDownTokenKinds(selected.group).includes(token.kind) ? faceDownTokenOf(token) : undefined
        )
      });
      return;
    }
    // Face-up needs a concrete tile.
    if (!fallbackId) {
      return;
    }
    updateTile(selectedIndex, {
      faceDown: false,
      tileDefId: fallbackId,
      oneOfTileDefIds: undefined,
      secretFeature: undefined,
      secretFeatures: undefined,
      ...retargetTokensForDef(selected, fallbackId)
    });
  };

  /**
   * Secret mode: TOGGLE a landmark in the allowed set. With several allowed the
   * draw lands on ANY of them (valuables OR gold …); removing the last one drops
   * back to a pure-random draw.
   */
  const pickSecretFeature = (feature: SecretTileFeature) => {
    if (selectedIndex === null || !selected || selected.group === "starting") {
      return;
    }
    const current = planAllowedSecretFeatures(selected);
    const nextSet = current.includes(feature)
      ? current.filter((id) => id !== feature)
      : [...current, feature];
    updateTile(selectedIndex, {
      faceDown: true,
      tileDefId: undefined,
      oneOfTileDefIds: undefined,
      secretFeature: undefined,
      secretFeatures: nextSet.length > 0 ? nextSet : undefined,
      ...tokensPatch(selected, (token) =>
        faceDownTokenKinds(selected.group).includes(token.kind) ? faceDownTokenOf(token) : undefined
      )
    });
  };

  /**
   * Click a tile card. Face-up stays face-up with that exact tile. From Random
   * or Secret, pinning an exact id is an advanced exact secret (clears feature).
   */
  const pickTileForSelected = (tileDefId: string) => {
    if (selectedIndex === null || !selected || selected.group === "starting") {
      return;
    }
    if (usedPinnedIds.has(tileDefId) && selected.tileDefId !== tileDefId) {
      return;
    }
    const nextFaceDown = selectedMode !== "faceup";
    updateTile(selectedIndex, {
      faceDown: nextFaceDown,
      tileDefId,
      oneOfTileDefIds: undefined,
      secretFeature: undefined,
      secretFeatures: undefined,
      ...(nextFaceDown
        ? tokensPatch(selected, (token) =>
            faceDownTokenKinds(selected.group).includes(token.kind) ? faceDownTokenOf(token) : undefined
          )
        : retargetTokensForDef(selected, tileDefId))
    });
  };

  /**
   * "One of these tiles" mode: TOGGLE a tile in the random list. Removing the
   * last one drops back to a plain face-up exact pin on the first available tile
   * (a slot always resolves to a real tile). The slot stays face-up.
   */
  const pickOneOfTile = (tileDefId: string) => {
    if (selectedIndex === null || !selected || selected.group === "starting") {
      return;
    }
    const current = selected.oneOfTileDefIds ?? [];
    const nextList = current.includes(tileDefId)
      ? current.filter((id) => id !== tileDefId)
      : [...current, tileDefId];
    if (nextList.length === 0) {
      // Last one removed → fall back to a plain exact face-up tile.
      updateTile(selectedIndex, {
        faceDown: false,
        tileDefId,
        oneOfTileDefIds: undefined,
        ...retargetTokensForDef(selected, tileDefId)
      });
      return;
    }
    updateTile(selectedIndex, {
      faceDown: false,
      tileDefId: undefined,
      oneOfTileDefIds: nextList,
      secretFeature: undefined,
      secretFeatures: undefined
    });
  };
  // Token kinds the tile-panel ADD picker offers — Whirlpool ONLY. The plain
  // Monolith is RETIRED from every palette (all two-way teleporters are the
  // colored Teleport Gates now; one-way monoliths and Gates are placed from the
  // Objects palette). Legacy saved Monoliths still render and stay editable.
  const selectedTokenKinds: MapTokenKind[] =
    !selected || selected.group === "starting"
      ? []
      : selected.faceDown
        ? selected.group === "sea"
          ? (["whirlpool"] as MapTokenKind[])
          : []
        : selectedTileDef
          ? (["whirlpool"] as MapTokenKind[]).filter(
              (kind) => legalTokenSlotsForTileDef(selectedTileDef, kind).length > 0
            )
          : [];

  const rotateSelected = (steps: number) => {
    // Every tile rotates freely in the designer, whether face up or face down.
    // For a STARTING tile the stored rotation only takes effect in game when its
    // orientation is Fixed (locked, below); otherwise the faction art is placed at
    // the classic rotation 0 and the seat rotates it in the opening ceremony.
    if (selectedIndex === null || !selected) {
      return;
    }
    const currentRotation = selected.rotation ?? 0;
    const rotation = (((currentRotation + steps) % 6) + 6) % 6;
    // A face-down token / Field Override pin is pinned to a BOARD hex, not to
    // unknown printed art. Counter-rotate EVERY pinned slot index so rotating
    // the hidden tile preview never moves a reserved hex under the cursor.
    if (selected.faceDown) {
      const counterRotate = (slot: number | undefined): number | undefined => {
        if (slot === undefined) {
          return undefined;
        }
        const fixedHex = tileFootprint({ row: selected.row, col: selected.col }, currentRotation)[slot];
        const nextSlot = tileFootprint({ row: selected.row, col: selected.col }, rotation).findIndex((hex) =>
          fixedHex ? sameGridCoord(hex, fixedHex) : false
        );
        return nextSlot >= 0 ? nextSlot : slot;
      };
      const tokens = planTokens(selected).map((token) =>
        tileTokenValue(token.kind, token.pair, counterRotate(token.slot))
      );
      const fieldOverrides = planFieldOverrides(selected).map((pin) => {
        const slot = counterRotate(pin.slot);
        return { kind: pin.kind, ...(slot !== undefined ? { slot } : {}) };
      });
      if (tokens.length > 0 || fieldOverrides.length > 0) {
        updateTile(selectedIndex, {
          rotation,
          tokens: tokens.length > 0 ? tokens : undefined,
          token: undefined,
          fieldOverrides: fieldOverrides.length > 0 ? fieldOverrides : undefined,
          fieldOverride: undefined
        });
        return;
      }
    }
    updateTile(selectedIndex, { rotation });
  };

  /**
   * Toggle a STARTING tile's Fixed orientation: when on, its home tile is placed
   * at the chosen rotation in game and the seat owes NO opening free-rotation.
   * Off restores the classic rotation-0 + opening-ceremony flow. Starting-only,
   * exactly like the engine honours `lockRotation` only on a starting plan.
   */
  const toggleLockRotation = () => {
    if (selectedIndex === null || !selected || selected.group !== "starting") {
      return;
    }
    updateTile(selectedIndex, { lockRotation: selected.lockRotation ? undefined : true });
  };

  /**
   * Toggle a far/near/center/sea tile's UNDERGROUND layer. On: the tile is
   * topologically a cavern (reachable only through a Subterranean Gate) while
   * KEEPING its band content — back art, guard tiers, bank pile, tokens. Off:
   * plain Surface. Offered only on the flag-valid groups (mirrors the engine
   * predicate + sanitiser), so a starting seat tile or a printed cavern never
   * carries it.
   */
  const toggleUnderground = () => {
    if (selectedIndex === null || !selected || !UNDERGROUND_LAYER_GROUPS.has(selected.group)) {
      return;
    }
    updateTile(selectedIndex, { underground: selected.underground ? undefined : true });
  };

  const seatNumberOf = (index: number) => startingPlanIndexes.indexOf(index) + 1;

  // --- Designer Subterranean Gate links ------------------------------------
  // Every Surface tile (or seat) the selected cavern physically touches, so the
  // designer can toggle a link to any of them (and connect one cavern to several).
  const selectedCavernSurfaces =
    selected && planIsUnderground(selected)
      ? gatePlacements.filter(
          (tile) =>
            !planIsUnderground(tile) &&
            tileFootprintsTouch({ row: selected.row, col: selected.col }, { row: tile.row, col: tile.col })
        )
      : [];
  const isGateLinked = (surface: { row: number; col: number }): boolean =>
    Boolean(selected?.gateLinks?.some((link) => link.surface.row === surface.row && link.surface.col === surface.col));

  // Hexes the selected cavern's RENDERED gates already occupy (across every
  // surface): a new "+ Gate" pins the first boundary pair free of these, and two
  // gates never share a board hex.
  const selectedCavernUsedHexes = new Set<string>();
  if (selected && planIsUnderground(selected)) {
    for (const gate of plannedGates) {
      if (sameGridCoord(gate.cavernCenter, { row: selected.row, col: selected.col })) {
        selectedCavernUsedHexes.add(hexSpaceId(gate.gateHex));
        selectedCavernUsedHexes.add(hexSpaceId(gate.entranceHex));
      }
    }
  }

  /** Number of distinct per-edge yellow borders on the selected plan (legacy arcs folded in). */
  const selectedBorderEdgeCount = selected ? planEffectiveBorderEdges(selected).length : 0;

  /** Add the FIRST designer gate link between the selected cavern and a touching Surface tile. */
  const toggleGateLink = (surface: { row: number; col: number }) => {
    if (selectedIndex === null || !selected || !planIsUnderground(selected)) {
      return;
    }
    const links = selected.gateLinks ?? [];
    const nextLinks = isGateLinked(surface)
      ? links.filter((link) => !(link.surface.row === surface.row && link.surface.col === surface.col))
      : [...links, { surface: { row: surface.row, col: surface.col } }];
    updateTile(selectedIndex, { gateLinks: nextLinks.length > 0 ? nextLinks : undefined });
  };

  /** Remove ONE designer gate link by its index in the cavern's list. */
  const unlinkGateAt = (linkIndex: number) => {
    if (selectedIndex === null || !selected || !planIsUnderground(selected) || !selected.gateLinks) {
      return;
    }
    const nextLinks = selected.gateLinks.filter((_, index) => index !== linkIndex);
    updateTile(selectedIndex, { gateLinks: nextLinks.length > 0 ? nextLinks : undefined });
  };

  /** Set / clear a designer guard on ONE half of a designer gate link. */
  const setGateLinkGuard = (linkIndex: number, half: "gateGuard" | "entranceGuard", guard: CustomGuardSpec | undefined) => {
    if (selectedIndex === null || !selected || !planIsUnderground(selected) || !selected.gateLinks) {
      return;
    }
    const nextLinks = selected.gateLinks.map((link, index) => {
      if (index !== linkIndex) {
        return link;
      }
      const next = { ...link };
      if (guard) {
        next[half] = guard;
      } else {
        delete next[half];
      }
      return next;
    });
    updateTile(selectedIndex, { gateLinks: nextLinks });
  };

  /** The first legal boundary pair for `surface` free of the cavern's used hexes, or null. */
  const firstFreePairForSurface = (surface: { row: number; col: number }): GateHexPair | null => {
    if (!selected || !planIsUnderground(selected)) {
      return null;
    }
    const cavernCenter = { row: selected.row, col: selected.col };
    for (const pair of legalGateHexPairs(surface, cavernCenter)) {
      if (!selectedCavernUsedHexes.has(hexSpaceId(pair.gateHex)) && !selectedCavernUsedHexes.has(hexSpaceId(pair.entranceHex))) {
        return pair;
      }
    }
    return null;
  };

  /**
   * Add ANOTHER designer gate to an already-linked Surface tile, PINNED at the
   * first boundary pair free of the cavern's existing gates — so several gates can
   * bridge the SAME shared edge. A no-op (and the button is disabled) when the edge
   * has no free pair left.
   */
  const addGateToSurface = (surface: { row: number; col: number }) => {
    if (selectedIndex === null || !selected || !planIsUnderground(selected)) {
      return;
    }
    const pair = firstFreePairForSurface(surface);
    if (!pair) {
      return;
    }
    pinGateLinkAt({ row: selected.row, col: selected.col }, -1, surface, pair);
  };

  /**
   * Slide ONE designer gate (by its link index) to the next legal boundary hex
   * pair (the non-drag affordance): pins the link to the pair after its current
   * one — pinned pair, else the automatic nearest default — skipping any pair whose
   * hex a sibling gate already holds, so each click walks THIS gate along the
   * shared edge without colliding.
   */
  const cycleGateLinkAt = (linkIndex: number) => {
    if (selectedIndex === null || !selected || !planIsUnderground(selected) || !selected.gateLinks) {
      return;
    }
    const link = selected.gateLinks[linkIndex];
    if (!link) {
      return;
    }
    const surface = link.surface;
    const cavernCenter = { row: selected.row, col: selected.col };
    // Two gates can't share a hex, so the slide only visits pairs free of the
    // OTHER links' pinned hexes.
    const blocked = new Set<string>();
    selected.gateLinks.forEach((other, index) => {
      if (index === linkIndex) {
        return;
      }
      if (other.gateHex) {
        blocked.add(other.gateHex);
      }
      if (other.entranceHex) {
        blocked.add(other.entranceHex);
      }
    });
    const pairs = legalGateHexPairs(surface, cavernCenter).filter(
      (pair) => !blocked.has(hexSpaceId(pair.gateHex)) && !blocked.has(hexSpaceId(pair.entranceHex))
    );
    if (pairs.length === 0) {
      return;
    }
    const pinnedIndex =
      link.gateHex && link.entranceHex
        ? pairs.findIndex((pair) => hexSpaceId(pair.gateHex) === link.gateHex && hexSpaceId(pair.entranceHex) === link.entranceHex)
        : -1;
    // Unpinned: start from the nearest default the preview shows, so the first
    // click still visibly MOVES the gate.
    let currentIndex = pinnedIndex;
    if (currentIndex < 0) {
      const [defaultGate] = planSubterraneanGates(
        [
          { row: surface.row, col: surface.col, group: "starting" },
          { row: cavernCenter.row, col: cavernCenter.col, group: "subterranean" }
        ],
        []
      );
      currentIndex = defaultGate
        ? Math.max(
            0,
            pairs.findIndex(
              (pair) =>
                hexSpaceId(pair.gateHex) === hexSpaceId(defaultGate.gateHex) &&
                hexSpaceId(pair.entranceHex) === hexSpaceId(defaultGate.entranceHex)
            )
          )
        : 0;
    }
    const nextPair = pairs[(currentIndex + 1) % pairs.length];
    pinGateLinkAt(cavernCenter, linkIndex, surface, nextPair);
  };

  /** Select the cavern that owns a designed gate and open its options popover. */
  const selectCavernForGate = (cavernCenter: HexCoord, clientX: number, clientY: number) => {
    const index = customMap.findIndex(
      (plan) => planIsUnderground(plan) && plan.row === cavernCenter.row && plan.col === cavernCenter.col
    );
    if (index >= 0) {
      // Opening the docked tile panel closes any open object / token panel.
      closeAllPanels();
      setSelectedIndex(index);
      setPopoverAt({ x: clientX, y: clientY });
    }
  };

  /**
   * Start dragging an ALREADY-PLACED object to a new placement. Disarms the
   * palette / border paint (one interaction at a time, so the candidate cells
   * shown are the DRAGGED object's kind). A release in place is still a plain
   * click that opens the object panel (the drag effect only commits on `moved`).
   */
  const beginObjectDrag = (index: number, kind: CustomMapObjectKind) => (event: React.PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    setArmedObject(null);
    setBorderPaint(false);
    setObjectDrag({ index, kind, startX: event.clientX, startY: event.clientY, moved: false, hover: null });
  };

  /**
   * Press a tile-carried token. Always takes the press (stopPropagation) so the
   * board never pans and the tile panel never opens underneath it, and arms a
   * drag — EVERY token drags now, face-up OR face-down. A release in place never
   * crosses the move-promote threshold, so it stays a plain click that opens the
   * token panel; a face-down token that never moves keeps its reserved slot (or
   * a legacy no-slot pending shape) untouched.
   */
  const beginTokenPress =
    (index: number, tokenIndex: number, kind: PlanTokenKind, pair?: 1 | 2 | 3 | 4) =>
    (event: React.PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      setArmedObject(null);
      setBorderPaint(false);
      setTokenDrag({
        index,
        tokenIndex,
        kind,
        pair,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        hover: null
      });
    };

  /** Open the compact token panel for a tile-carried token (drag suppresses the click). */
  const onMapTokenClick = (index: number, tokenIndex = 0) => (event: React.MouseEvent) => {
    event.stopPropagation();
    if (tokenClickSuppressRef.current) {
      tokenClickSuppressRef.current = false;
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    closeAllPanels();
    setSelectedTokenIndex(index);
    setSelectedTokenPin(tokenIndex);
    setTokenPopoverAt(
      rect
        ? { x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 8)), y: event.clientY - rect.top }
        : { x: 8, y: 0 }
    );
  };

  /** Start dragging a designed gate token along its two tiles' shared boundary. */
  const beginGateDrag = (gate: PlannedSubterraneanGate) => (event: React.PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    // Take the press for the gate so neither a board pan nor a tile press starts.
    event.stopPropagation();
    // Keep mid-drag moves flowing even when the pointer leaves the token; jsdom
    // has no pointer-capture implementation, hence the optional call.
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    // Which cavern gate-link entry this token IS: a designed gate is addressed by
    // its surface + committed pair (so ONE of several same-surface gates moves); an
    // automatic gate owns no entry (index -1 → a drop APPENDS a fresh link).
    const cavernPlan = customMap.find(
      (plan) => planIsUnderground(plan) && plan.row === gate.cavernCenter.row && plan.col === gate.cavernCenter.col
    );
    const sourceIndex = gate.designed
      ? findGateLinkIndex(cavernPlan?.gateLinks ?? [], {
          surface: gate.surfaceCenter,
          gateHex: hexSpaceId(gate.gateHex),
          entranceHex: hexSpaceId(gate.entranceHex)
        })
      : -1;
    // Offer boundary pairs on EVERY eligible touching Surface tile, not just the
    // one this gate sits on — so the drag can carry the gate to a different tile
    // (or add a second gate to an already-linked one).
    const candidates = gateDragCandidatesFor(gate.cavernCenter, sourceIndex);
    if (candidates.length === 0) {
      return;
    }
    setGateDrag({
      cavernCenter: gate.cavernCenter,
      sourceIndex,
      origin: { gateHex: gate.gateHex, entranceHex: gate.entranceHex, surfaceCenter: gate.surfaceCenter },
      candidates,
      hover: null,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    });
  };

  // --- SVG layers ----------------------------------------------------------
  const artLayer: React.ReactNode[] = [];
  const cellLayer: React.ReactNode[] = [];
  const outlineLayer: React.ReactNode[] = [];
  const labelLayer: React.ReactNode[] = [];
  // Subterranean Gate tokens + the "no way in" warnings, drawn above the tiles.
  const gateLayer: React.ReactNode[] = [];
  // Designer-placed yellow borders, drawn above the tiles so the designer sees
  // exactly the impassable edges players will see.
  const borderLayer: React.ReactNode[] = [];

  const renderFlowerCells = (
    center: HexCoord,
    className: string,
    key: string,
    handlers?: {
      onPointerDown?: (event: React.PointerEvent) => void;
    },
    title?: string
  ) => {
    for (const [slot, cell] of tileFootprint(center, 0).entries()) {
      const { x, y } = hexToPixel(cell, size);
      cellLayer.push(
        <polygon
          className={className}
          key={`${key}-${slot}`}
          onPointerDown={handlers?.onPointerDown}
          points={hexCorners(x, y, size - 0.8)}
        >
          {title ? <title>{title}</title> : null}
        </polygon>
      );
    }
  };

  // Scenario default seats — only while the designer has not placed its own
  // Town tiles (then the designed towns are the seats).
  if (!hasDesignerStarts) {
    for (const [index, start] of starts.entries()) {
      const centerPixel = hexToPixel(start, size);
      const width = 3 * hexWidth;
      const height = 5 * size;
      artLayer.push(
        <image
          height={height}
          href={assetUrl(TILE_BACK_IMAGES.starting)}
          key={`start-art-${index}`}
          opacity={0.85}
          preserveAspectRatio="none"
          width={width}
          x={centerPixel.x - width / 2}
          y={centerPixel.y - height / 2}
        />
      );
      renderFlowerCells(start, "designerHexFixed", `start-${index}`, undefined, `Default seat ${index + 1} (used unless you drag a Town tile in)`);
      labelLayer.push(
        <text className="designerStartLabel" key={`start-label-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 5}>
          S{index + 1}
        </text>
      );
      outlineLayer.push(
        <path className="designerFlowerOutline fixed" d={flowerOutline(start, size)} key={`start-outline-${index}`} />
      );
    }
  }

  // Designed tiles (Town seats + supply tiles).
  for (const [index, plan] of customMap.entries()) {
    const center = { row: plan.row, col: plan.col };
    const centerPixel = hexToPixel(center, size);
    const isSelected = selectedIndex === index;
    const isDragging = drag?.kind === "move" && drag.index === index;
    const isStart = plan.group === "starting";
    // Designer-only secret markers. All face-down slots use the printed BACK
    // (band-correct for sea / underground Ⅵ–Ⅶ) — the numeral is ON the art,
    // so we never overlay a second "Ⅱ–Ⅲ" text box. Secrets keep a 🔒 badge.
    const planSecretSet = planAllowedSecretFeatures(plan);
    const secretPin = plan.faceDown && Boolean(plan.tileDefId || planSecretSet.length > 0);
    const featureSecret = plan.faceDown && planSecretSet.length > 0 && !plan.tileDefId;
    // A face-up "one of these tiles" slot has no concrete tile yet — show the
    // FIRST candidate's art as a representative (a 🎲 badge below marks it random).
    const oneOfList = !plan.faceDown && !plan.tileDefId ? plan.oneOfTileDefIds ?? [] : [];
    const art = isStart
      ? TILE_BACK_IMAGES.starting
      : plan.faceDown
        ? planBackArt(plan)
        : plan.tileDefId
          ? allTileDefinitions[plan.tileDefId]?.assets?.tileImage
          : oneOfList.length > 0
            ? allTileDefinitions[oneOfList[0]]?.assets?.tileImage
            : undefined;
    const width = 3 * hexWidth;
    const height = 5 * size;

    if (art) {
      artLayer.push(
        <image
          height={height}
          href={assetUrl(art)}
          key={`plan-art-${index}`}
          opacity={isDragging ? 0.3 : secretPin ? 0.88 : 1}
          preserveAspectRatio="none"
          // Face-down backs are orientation-independent (printed numeral sits
          // upright on the physical back); only face-up scans rotate.
          transform={
            !isStart && !plan.faceDown
              ? `rotate(${(plan.rotation ?? 0) * 60} ${centerPixel.x} ${centerPixel.y})`
              : undefined
          }
          width={width}
          x={centerPixel.x - width / 2}
          y={centerPixel.y - height / 2}
        />
      );
    }

    const onPointerDown = (event: React.PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      // Take this press for the tile so the background pan does not start.
      event.stopPropagation();
      // Still track the pointer so a second finger can pinch-zoom the board.
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size >= 2) {
        suppressClickRef.current = true;
        pressRef.current = null;
        panRef.current = null;
        if (pointersRef.current.size === 2) {
          const [[aId, a], [bId, b]] = [...pointersRef.current.entries()];
          pinchRef.current = { aId, bId, start: { camera, a: { ...a }, b: { ...b } } };
        }
        return;
      }
      suppressClickRef.current = false;
      pressRef.current = {
        pointerId: event.pointerId,
        index,
        group: plan.group,
        seaBand: plan.seaBand,
        subBand: plan.subBand,
        startX: event.clientX,
        startY: event.clientY,
        promoted: false
      };
    };

    renderFlowerCells(
      center,
      `designerHexPlan ${isStart ? "starting" : plan.faceDown ? "down" : "up"} ${secretPin ? "secret" : ""} ${featureSecret ? "featureSecret" : ""} ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`,
      `plan-${index}`,
      { onPointerDown },
      isStart
        ? `Town — seat ${seatNumberOf(index)}. Drag to move, click for options.`
        : plan.faceDown && planSecretSet.length > 0
          ? `Secret ${planSecretSet.map(secretFeatureFullLabel).join(" OR ")} (${planGroupLabel(plan)}) — at game start a random tile matching any of those landmarks is drawn face-down. Drag to move, click for options.`
          : plan.faceDown && plan.tileDefId
            ? `Face-down exact secret ${plan.tileDefId} (${planGroupLabel(plan)}) — players see only the tile back until discovery. Drag to move, click for options.`
            : plan.faceDown
              ? `Face-down ${planGroupLabel(plan)} tile (random). Drag to move, click to set a secret landmark / reveal / rotate / remove.`
              : `${plan.tileDefId ?? "?"} rotated ${(plan.rotation ?? 0) * 60}°. Drag to move, click for options.`
    );

    // SPECIFIC-mode pick: eligible tiles pulse, the rest dim, so "click a tile
    // with a mine" reads at a glance.
    const pickState =
      pickRequest?.kind === "object-plan"
        ? planEligibleForPick(plan, pickRequest.objectKind)
          ? "pickEligible"
          : "pickDim"
        : "";
    outlineLayer.push(
      <path
        className={`designerFlowerOutline ${isSelected ? "selected" : ""} ${secretPin ? "secret" : ""} ${pickState}`}
        d={flowerOutline(center, size)}
        data-band-group={plan.group}
        data-underground={planIsUnderground(plan) ? "true" : undefined}
        key={`plan-outline-${index}`}
        style={{
          // Band identity stays in `data-band-group`; a flagged tile strokes the
          // Underground purple so the LAYER override reads at a glance (selection
          // gold / secret blue still win). The band back-label is unchanged.
          stroke: isSelected
            ? "#ffd766"
            : secretPin
              ? "#9ad0ff"
              : planIsUnderground(plan)
                ? GROUP_COLORS.subterranean
                : GROUP_COLORS[plan.group]
        }}
      />
    );

    // Designer-placed per-edge yellow borders — drawn edge-by-edge in the
    // ABSOLUTE board frame (independent of rotation), so the designer sees
    // exactly the impassable lines players will get. Each code is one hex edge:
    // `tileFootprint(center, 0)[footprintIndex]` is the hex, `code % 6` the
    // absolute direction. Legacy whole-arc `extraBorders` are folded in via
    // `planEffectiveBorderEdges` so nothing disappears before conversion. Drawn
    // bold (dark casing under a gold core), matching the in-game look.
    const effectiveEdges = planEffectiveBorderEdges(plan);
    if (effectiveEdges.length > 0) {
      const flower = tileFootprint(center, 0);
      for (const code of effectiveEdges) {
        const cell = flower[Math.floor(code / 6)];
        if (!cell) {
          continue;
        }
        const { x, y } = hexToPixel(cell, size);
        const coords = hexEdgePoints(x, y, size - 0.8, code % 6);
        borderLayer.push(<line className="designerBorderCasing" key={`plan-border-casing-${index}-${code}`} {...coords} />);
        borderLayer.push(<line className="designerBorderLine" key={`plan-border-${index}-${code}`} {...coords} />);
      }
    }

    // Center Ⅶ-field designation badge — the forced objective is public info.
    if (plan.group === "center" && plan.viiField) {
      const viiBadge =
        plan.viiField === "grail" ? "🏆 Grail" : plan.viiField === "dragon_utopia" ? "🐉 Utopia" : "🏰 Town";
      const viiFull =
        plan.viiField === "dragon_utopia"
          ? "Dragon Utopia"
          : plan.viiField === "grail"
            ? "Grail dig site"
            : "Random Town";
      labelLayer.push(
        <text
          className="designerViiBadge"
          key={`plan-vii-${index}`}
          textAnchor="middle"
          x={centerPixel.x}
          y={centerPixel.y - size * 0.7}
        >
          <title>{`Ⅶ field forced to ${viiFull}`}</title>
          {viiBadge}
        </text>
      );
    }

    // SPECIFIC per-tile settings badge — the designer must SEE where custom
    // guards / rewards / win conditions live without opening every tile.
    {
      const specificBits: string[] = [];
      const planFor = (kind: "obelisk" | "mine") => plan.objectPlans?.[kind];
      for (const kind of ["obelisk", "mine"] as const) {
        const objectPlan = planFor(kind);
        if (objectPlan) {
          const bits: string[] = [];
          if (objectPlan.guard) {
            bits.push(
              objectPlan.guard.units?.length
                ? `guard ${describeGuardArmyGrouped(objectPlan.guard.units)}`
                : `guard Ⅰ-Ⅶ level ${objectPlan.guard.level}`
            );
          }
          if (objectPlan.reward) bits.push("reward");
          if (objectPlan.vp) bits.push(`+${objectPlan.vp} VP`);
          if (objectPlan.winCondition) bits.push("WIN on clear");
          specificBits.push(`${kind}: ${bits.join(", ") || "custom"}`);
        }
      }
      if (plan.settlement) {
        const bits: string[] = [];
        if (plan.settlement.guard) bits.push("guard");
        if (plan.settlement.reward) bits.push("reward");
        if (plan.settlement.vp) bits.push(`+${plan.settlement.vp} VP`);
        if (plan.settlement.holdRoundsToWin) bits.push(`hold ${plan.settlement.holdRoundsToWin}r to win`);
        if (plan.settlement.winCondition) bits.push("WIN on flag");
        specificBits.push(`settlement: ${bits.join(", ") || "custom"}`);
      }
      if (plan.centerHex?.winCondition) {
        specificBits.push("center: WIN on clear");
      }
      if (specificBits.length > 0) {
        const hasWin = specificBits.some((bit) => bit.includes("WIN"));
        labelLayer.push(
          <text
            className="designerSpecificBadge"
            data-specific-badge="true"
            key={`plan-specific-${index}`}
            textAnchor="middle"
            x={centerPixel.x - size * 0.9}
            y={centerPixel.y - size * 1.15}
          >
            <title>{`Specific settings — ${specificBits.join(" · ")}`}</title>
            {hasWin ? "🏁⚔" : "⚔"}
          </text>
        );
      }
    }

    // "One of these tiles" random set — a 🎲 badge with the count, so the
    // representative (first-candidate) art above is never mistaken for an exact
    // pick. Face-up one-of slots only.
    if (!isStart && !plan.faceDown && !plan.tileDefId && (plan.oneOfTileDefIds?.length ?? 0) > 0) {
      labelLayer.push(
        <text
          className="designerViiBadge"
          key={`plan-oneof-${index}`}
          textAnchor="middle"
          x={centerPixel.x}
          y={centerPixel.y + size * 0.85}
        >
          <title>{`Random at game start: one of ${plan.oneOfTileDefIds!.length} tiles`}</title>
          {`🎲 1 of ${plan.oneOfTileDefIds!.length}`}
        </text>
      );
    }

    if (isStart) {
      labelLayer.push(
        <text className="designerStartLabel" key={`plan-seat-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 5}>
          S{seatNumberOf(index)}
        </text>
      );
      // Fixed-orientation seats wear a small lock badge naming the forced angle —
      // the faction art is unknown at design time, so the degrees are the signal.
      if (plan.lockRotation) {
        labelLayer.push(
          <text
            className="designerStartLockBadge"
            key={`plan-lock-${index}`}
            textAnchor="middle"
            x={centerPixel.x}
            y={centerPixel.y - size * 0.7}
          >
            <title>{`Fixed orientation ${(plan.rotation ?? 0) * 60}° — no opening rotation`}</title>
            {`🔒 ${(plan.rotation ?? 0) * 60}°`}
          </text>
        );
      }
    } else if (plan.faceDown && secretPin) {
      // Only secret badges stay as text — random face-down slots rely on the
      // printed back graphic alone (no redundant Ⅱ–Ⅲ / Sea / Underground box).
      labelLayer.push(
        <text className="designerTileLabel" key={`plan-label-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 4}>
          {secretBoardLabel(plan)}
        </text>
      );
      if (featureSecret && planSecretSet[0]) {
        const featureMeta = SECRET_TILE_FEATURES.find((entry) => entry.id === planSecretSet[0]);
        if (featureMeta) {
          const iconSize = size * 0.95;
          labelLayer.push(
            <image
              className="designerTileFeatureIcon"
              height={iconSize}
              href={assetUrl(featureMeta.iconSrc)}
              key={`plan-feature-icon-${index}`}
              preserveAspectRatio="xMidYMid meet"
              width={iconSize}
              x={centerPixel.x - iconSize / 2}
              y={centerPixel.y - iconSize - 4}
            >
              <title>{featureMeta.label}</title>
            </image>
          );
        }
      }
    } else if (!plan.faceDown && !art) {
      // Face-up with no art yet (shouldn't happen after pick) — show id fallback.
      labelLayer.push(
        <text className="designerTileLabel" key={`plan-label-${index}`} textAnchor="middle" x={centerPixel.x} y={centerPixel.y + 4}>
          {plan.tileDefId ?? "?"}
        </text>
      );
    }
  }

  // Live-drag affordance: while a gate is being dragged, ghost EVERY position it
  // could snap to — both halves of every candidate pair across every eligible
  // Surface tile — so the designer SEES which tiles the gate can connect to, not
  // just the one it started on. The snapped pair is highlighted; the ghosts (and
  // the tag naming their surface) vanish the instant the drag ends. Pushed before
  // the real tokens so the dragged token reads on top of its own ghost.
  if (gateDrag && gateDrag.moved) {
    const hover = gateDrag.hover;
    gateDrag.candidates.forEach((candidate, candIndex) => {
      const isHover = Boolean(
        hover &&
          hexSpaceId(hover.gateHex) === hexSpaceId(candidate.gateHex) &&
          hexSpaceId(hover.entranceHex) === hexSpaceId(candidate.entranceHex) &&
          hover.surfaceCenter.row === candidate.surfaceCenter.row &&
          hover.surfaceCenter.col === candidate.surfaceCenter.col
      );
      const ghostClass = `designerGateGhost${isHover ? " hover" : ""}`;
      const surfaceTag = `${candidate.surfaceCenter.row}:${candidate.surfaceCenter.col}`;
      const gateTag = hexSpaceId(candidate.gateHex);
      const entranceTag = hexSpaceId(candidate.entranceHex);
      const ghostGate = hexToPixel(candidate.gateHex, size);
      const ghostEntrance = hexToPixel(candidate.entranceHex, size);
      const ghostRadius = Math.max(3, size * 0.32);
      gateLayer.push(
        <line
          className={`designerGateGhostLink${isHover ? " hover" : ""}`}
          key={`gate-ghost-line-${candIndex}`}
          x1={ghostGate.x}
          x2={ghostEntrance.x}
          y1={ghostGate.y}
          y2={ghostEntrance.y}
        />
      );
      gateLayer.push(
        <circle
          className={ghostClass}
          cx={ghostGate.x}
          cy={ghostGate.y}
          data-ghost-entrance={entranceTag}
          data-ghost-gate={gateTag}
          data-ghost-surface={surfaceTag}
          key={`gate-ghost-gate-${candIndex}`}
          r={ghostRadius}
        />
      );
      gateLayer.push(
        <circle
          className={ghostClass}
          cx={ghostEntrance.x}
          cy={ghostEntrance.y}
          data-ghost-entrance={entranceTag}
          data-ghost-gate={gateTag}
          data-ghost-surface={surfaceTag}
          key={`gate-ghost-entrance-${candIndex}`}
          r={ghostRadius}
        />
      );
    });
  }

  // Subterranean Gate tokens: one half on the Surface tile (the gate) and one on
  // the cavern (the entrance), exactly where the engine will carve them, joined
  // by a link line — so the designer can SEE the only Surface↔Underground
  // crossing each cavern gets. (The gate hex is hidden until the Surface tile is
  // revealed in play, but the designer shows the whole connection up front.)
  for (const [index, gate] of plannedGates.entries()) {
    // While THIS designed gate is being dragged, draw its token pair at the
    // snapped hover position instead of the committed one (live preview; the
    // plan itself only changes on release).
    const draggingThis = Boolean(
      gateDrag?.moved &&
        gateDrag.hover &&
        sameGridCoord(gateDrag.cavernCenter, gate.cavernCenter) &&
        sameGridCoord(gateDrag.origin.surfaceCenter, gate.surfaceCenter) &&
        hexSpaceId(gateDrag.origin.gateHex) === hexSpaceId(gate.gateHex) &&
        hexSpaceId(gateDrag.origin.entranceHex) === hexSpaceId(gate.entranceHex)
    );
    const drawGateHex = draggingThis ? gateDrag!.hover!.gateHex : gate.gateHex;
    const drawEntranceHex = draggingThis ? gateDrag!.hover!.entranceHex : gate.entranceHex;
    const gatePixel = hexToPixel(drawGateHex, size);
    const entrancePixel = hexToPixel(drawEntranceHex, size);
    const tokenWidth = hexWidth;
    const tokenHeight = 2 * size;
    // EVERY gate token — the AUTOMATIC touch pairing as well as a designer-pinned
    // one — is draggable along the shared edge and clickable for options. A
    // designer-chosen gate is drawn distinct (the `designed` class: a brighter
    // solid link + a pin glyph); an automatic one wears the `automatic` class (a
    // dashed, dimmer link + no pin) so a default pairing is recognizably a
    // default, and dragging it CONVERTS it into a pinned link at the dropped spot.
    const designedClass = `${gate.designed ? " designed" : " automatic"}${draggingThis ? " dragging" : ""}`;
    const gateTitle = gate.designed
      ? "Designer Subterranean Gate — drag it along the shared edge, or click to edit its links."
      : "Automatic Subterranean Gate — heroes descend here from the Surface tile. Drag it along the shared edge to pin its exact spot, or click for gate options.";
    const onGatePointerDown = beginGateDrag(gate);
    const onGateClick = (event: React.MouseEvent) => {
      event.stopPropagation();
      // A finished slide fires a trailing click — that one never opens the popover.
      if (gateClickSuppressRef.current) {
        gateClickSuppressRef.current = false;
        return;
      }
      selectCavernForGate(gate.cavernCenter, event.clientX, event.clientY);
    };
    gateLayer.push(
      <line
        className={`designerGateLink${designedClass}`}
        key={`gate-link-${index}`}
        x1={gatePixel.x}
        x2={entrancePixel.x}
        y1={gatePixel.y}
        y2={entrancePixel.y}
      />
    );
    gateLayer.push(
      <image
        className={`designerGateToken${designedClass}`}
        height={tokenHeight}
        href={assetUrl(subterraneanGateTokenImage("surface"))}
        key={`gate-surface-${index}`}
        onClick={onGateClick}
        onPointerDown={onGatePointerDown}
        preserveAspectRatio="none"
        width={tokenWidth}
        x={gatePixel.x - tokenWidth / 2}
        y={gatePixel.y - size}
      >
        <title>{gateTitle}</title>
      </image>
    );
    gateLayer.push(
      <image
        className={`designerGateToken${designedClass}`}
        height={tokenHeight}
        href={assetUrl(subterraneanGateTokenImage("subterranean"))}
        key={`gate-entrance-${index}`}
        onClick={onGateClick}
        onPointerDown={onGatePointerDown}
        preserveAspectRatio="none"
        width={tokenWidth}
        x={entrancePixel.x - tokenWidth / 2}
        y={entrancePixel.y - size}
      >
        <title>Subterranean Gate entrance — the cavern side of the crossing. Drag it along the shared edge to place the gate, or click for options.</title>
      </image>
    );
    if (gate.designed) {
      // A small lock pin at the link midpoint marks the designer-committed gate.
      gateLayer.push(
        <circle
          className="designerGatePin"
          cx={(gatePixel.x + entrancePixel.x) / 2}
          cy={(gatePixel.y + entrancePixel.y) / 2}
          key={`gate-pin-${index}`}
          r={Math.max(2, size * 0.3)}
        >
          <title>Designer-locked gate</title>
        </circle>
      );
    }
  }

  // Monolith/Whirlpool/colored-Gate tile tokens — multiple per tile on different
  // slots. Face-up: exact hex; face-down: preferred physical hex. Whirlpool art
  // carries plan-order number; colored Gate uses monolith art + color ring.
  for (const [index, plan] of customMap.entries()) {
    const tokenList = planTokens(plan);
    for (let tokenIndex = 0; tokenIndex < tokenList.length; tokenIndex++) {
    const token = tokenList[tokenIndex];
    const center = { row: plan.row, col: plan.col };
    const fixedSlot = token.slot !== undefined;
    // The drag addresses ONE pin: plan index + token index (planTokens order).
    const draggingThis = Boolean(
      tokenDrag && tokenDrag.index === index && tokenDrag.tokenIndex === tokenIndex && tokenDrag.moved
    );
    // While dragging, draw the token following the hovered target — a tile slot,
    // a face-down tile centre, or an off-tile standalone hex (`dropTargetToHex`).
    const cell =
      draggingThis && tokenDrag!.hover
        ? dropTargetToHex(tokenDrag!.hover)
        : fixedSlot
          ? tileFootprint(center, plan.rotation ?? 0)[token.slot as number]
          : center;
    const pixel = hexToPixel(cell ?? center, size);
    const isGate = token.kind === "gate";
    const gateColor = isGate ? GATE_PAIR_CSS[token.pair ?? 1] : null;
    const tokenWidth = hexWidth * (fixedSlot ? 1 : 0.9);
    const tokenHeight = 2 * size * (fixedSlot ? 1 : 0.9);
    const tokenTitle = plan.faceDown
      ? `${placementTokenLabel(token)} token — reserved on this exact physical hex. If the revealed field cannot host it, the game offers legal fields as a fallback. Drag to any highlighted hex, or click for options.`
      : `${placementTokenLabel(token)} token — overwrites this field. Drag to another tile or legal slot (or an off-tile hex to make it standalone), or click for options.`;
    gateLayer.push(
      <g
        className={`designerMapToken draggable${draggingThis ? " dragging" : ""}${isGate ? " gate" : ""}`}
        key={`map-token-${index}-${tokenIndex}`}
        onClick={onMapTokenClick(index, tokenIndex)}
        onPointerDown={beginTokenPress(index, tokenIndex, token.kind, token.pair)}
        opacity={plan.faceDown ? 0.9 : 1}
      >
        {/* SVG groups have no hit box of their own. The token image is pointer-
            transparent to avoid native image dragging, so this painted-but-
            invisible hex is the real browser grab surface (unit tests that
            dispatch directly to the group cannot catch its absence). */}
        <polygon
          className="designerMapTokenHit"
          fill="transparent"
          points={hexCorners(pixel.x, pixel.y, size - 1.5)}
          pointerEvents="all"
        />
        {gateColor ? <circle cx={pixel.x} cy={pixel.y} fill={gateColor} opacity={0.32} r={size * 0.5} /> : null}
        <image
          className="designerMapTokenArt"
          height={tokenHeight}
          href={assetUrl(designerTokenImage(token.kind, whirlpoolNumberByIndex.get(`${index}:${tokenIndex}`), token.pair))}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: "none" }}
          width={tokenWidth}
          x={pixel.x - tokenWidth / 2}
          y={pixel.y - tokenHeight / 2}
        />
        {gateColor ? (
          <>
            <circle cx={pixel.x} cy={pixel.y} fill="none" r={size * 0.5} stroke={gateColor} strokeWidth={2.5} style={{ pointerEvents: "none" }} />
            <text
              className="designerMapTokenPair"
              fill={gateColor}
              fontSize={size * 0.42}
              fontWeight={700}
              style={{ pointerEvents: "none" }}
              textAnchor="middle"
              x={pixel.x}
              y={pixel.y + size * 0.62}
            >
              {token.pair}
            </text>
          </>
        ) : null}
        {guardBadgeNumeral(token.guard) ? (
          <text
            className="designerObjectGuard"
            style={{ pointerEvents: "none" }}
            textAnchor="middle"
            x={pixel.x}
            y={pixel.y - size * 0.6}
          >
            {guardBadgeNumeral(token.guard)}
          </text>
        ) : null}
        <title>{tokenTitle}</title>
      </g>
    );
    } // end per-token on this plan
  }

  // Field Override pins — multi per tile on distinct slots (Mod panel).
  for (const [index, plan] of customMap.entries()) {
    const overrides = planFieldOverrides(plan);
    for (let oi = 0; oi < overrides.length; oi++) {
      const pin = overrides[oi];
      const art = fieldOverrideImage(pin.kind) ?? fieldOverrideImage(getFieldOverrideDefinition(pin.kind)?.locationId ?? "");
      // A kind without art yet (FIELD_OVERRIDE_ART_PLACEHOLDERS) still draws a
      // glyph marker so a pinned override is never an invisible hex on the
      // designer map — art replaces it once it ships.
      const glyph = art ? undefined : fieldOverrideGlyph(pin.kind);
      const center = { row: plan.row, col: plan.col };
      const slot = pin.slot ?? 0;
      const cell = tileFootprint(center, plan.rotation ?? 0)[slot] ?? center;
      const pixel = hexToPixel(cell, size);
      const tokenWidth = hexWidth * 0.95;
      const tokenHeight = 2 * size * 0.95;
      const label = getFieldOverrideDefinition(pin.kind)?.name ?? pin.kind;
      gateLayer.push(
        <g className="designerMapToken fieldOverride" key={`fo-${index}-${oi}`} opacity={0.95}>
          <polygon
            className="designerMapTokenHit"
            fill="transparent"
            points={hexCorners(pixel.x, pixel.y, size - 1.5)}
            pointerEvents="none"
          />
          {art ? (
            <image
              className="designerMapTokenArt"
              height={tokenHeight}
              href={assetUrl(art)}
              preserveAspectRatio="xMidYMid slice"
              style={{ pointerEvents: "none" }}
              width={tokenWidth}
              x={pixel.x - tokenWidth / 2}
              y={pixel.y - tokenHeight / 2}
            />
          ) : (
            <text
              className="designerFieldOverrideGlyph"
              data-testid={`designer-fo-glyph-${pin.kind}`}
              style={{ pointerEvents: "none" }}
              textAnchor="middle"
              x={pixel.x}
              y={pixel.y + size * 0.28}
            >
              {glyph ?? "◈"}
            </text>
          )}
          <title>{label} Field Override — slot {slot}</title>
        </g>
      );
    }
  }

  // A cavern with no gate at all can never be entered: ring it in red and stamp a
  // warning so the designer knows to nudge it against a Surface (or chained
  // cavern) tile until a gate appears.
  for (const plan of customMap) {
    // Any UNDERGROUND-layer tile (printed cavern OR flagged) with no way in gets
    // the red "unreachable" ring — the same layer predicate the warning uses.
    if (!planIsUnderground(plan) || !unreachableKeys.has(`${plan.row}:${plan.col}`)) {
      continue;
    }
    const center = { row: plan.row, col: plan.col };
    const centerPixel = hexToPixel(center, size);
    gateLayer.push(
      <path
        className="designerFlowerOutline cavernUnreachable"
        d={flowerOutline(center, size)}
        key={`cavern-warn-${plan.row}-${plan.col}`}
      />
    );
    gateLayer.push(
      <text
        className="designerCavernWarning"
        key={`cavern-warn-label-${plan.row}-${plan.col}`}
        textAnchor="middle"
        x={centerPixel.x}
        y={centerPixel.y - size * 1.1}
      >
        <title>This cavern has no Subterranean Gate — heroes cannot reach it. Place it touching a Surface tile (or a cavern that has a gate).</title>
        ⚠ no gate — unreachable
      </text>
    );
  }

  // While dragging: faint guides at the gapless interlock slots, plus a solid
  // preview at the hex the tile will actually land on — anywhere, hole or not.
  if (drag) {
    const hoverKey = hoverSlot ? `${hoverSlot.row}:${hoverSlot.col}` : null;
    for (const candidate of activeCandidates) {
      const key = `${candidate.row}:${candidate.col}`;
      if (key === hoverKey) {
        continue; // the live preview already covers this slot
      }
      renderFlowerCells(candidate, "designerHexDrop", `drop-${key}`);
      outlineLayer.push(
        <path className="designerFlowerOutline drop" d={flowerOutline(candidate, size)} key={`drop-outline-${key}`} />
      );
    }
    if (hoverSlot) {
      renderFlowerCells(hoverSlot, "designerHexDrop hover", "drop-hover");
      outlineLayer.push(
        <path className="designerFlowerOutline drop hover" d={flowerOutline(hoverSlot, size)} key="drop-outline-hover" />
      );
    }
  }

  const beginPaletteDrag = (group: DesignGroup, seaBand?: SeaBand, subBand?: SubBand) => (event: React.PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    closePopover();
    setDrag({ kind: "palette", group, seaBand, subBand, clientX: event.clientX, clientY: event.clientY });
    setHoverSlot(slotAt(event.clientX, event.clientY));
  };

  // --- Designer objects overlay: candidate placement cells + placed tokens ----
  const selectedObject = selectedObjectIndex !== null ? objects[selectedObjectIndex] : undefined;
  const objectLayer: React.ReactNode[] = [];
  const armedLabel = armedObject
    ? armedObject.kind === "gate"
      ? `${gatePairColor(armedObject.pair ?? 1)} gate`
      : mapTokenLabel(armedObject.kind as MapTokenKind)
    : "";
  // The object whose candidate cells show while dragging (its own kind lights up).
  const draggedObject = objectDrag ? objects[objectDrag.index] : undefined;
  const draggedLabel = draggedObject
    ? draggedObject.kind === "gate"
      ? `${gatePairColor(draggedObject.pair ?? 1)} gate`
      : mapTokenLabel(draggedObject.kind as MapTokenKind)
    : "";
  // Candidate cells glow while an object is armed (click to place) OR while a
  // placed object is being dragged (release to move / convert — no per-cell
  // click). A TILE candidate now writes the canonical `plan.token` (on-tile
  // teleporter); a STANDALONE candidate writes/keeps an off-tile object.
  const showObjectCandidates = Boolean(armedObject) || Boolean(objectDrag?.moved);
  const objectHoverId = objectDrag?.hover ? hexSpaceId(dropTargetToHex(objectDrag.hover)) : null;
  if (showObjectCandidates) {
    const candidateLabel = armedObject ? armedLabel : draggedLabel;
    for (const candidate of tileTokenTargets) {
      const { x, y } = hexToPixel(candidate.hex, size);
      const isHover = hexSpaceId(candidate.hex) === objectHoverId;
      const isFaceDown = customMap[candidate.planIndex]?.faceDown === true;
      objectLayer.push(
        <polygon
          className={`designerObjectSlot ${isFaceDown ? "faceDownTile" : "tileSlot"}${isHover ? " hover" : ""}`}
          key={`obj-slot-${hexSpaceId(candidate.hex)}`}
          onClick={
            armedObject
              ? () => placeArmedTileToken({ planIndex: candidate.planIndex, slot: candidate.slot })
              : undefined
          }
          points={hexCorners(x, y, size - 1.6)}
        >
          <title>
            {armedObject
              ? `Place the ${candidateLabel} token on this tile hex`
              : `Move the ${candidateLabel} onto this tile (becomes a token)`}
          </title>
        </polygon>
      );
    }
    if (activeKind !== "whirlpool") {
      for (const candidate of standaloneCandidates) {
        const { x, y } = hexToPixel(candidate, size);
        const isHover = hexSpaceId(candidate) === objectHoverId;
        objectLayer.push(
          <polygon
            className={`designerObjectSlot standalone${isHover ? " hover" : ""}`}
            key={`obj-standalone-${candidate.row}-${candidate.col}`}
            onClick={
              armedObject
                ? () => placeArmedStandalone(candidate.row, candidate.col)
                : undefined
            }
            points={hexCorners(x, y, size - 1.6)}
          >
            <title>
              {armedObject ? `Place a standalone ${candidateLabel} hex here` : `Move the ${candidateLabel} here`}
            </title>
          </polygon>
        );
      }
    }
  }
  // Token-drag candidate hexes: a face-up tile glows per legal printed field;
  // a compatible face-down tile glows on all seven physical slots. An OFF-tile
  // hex glows as a standalone conversion (land tokens only). One-token cap.
  if (tokenDrag?.moved) {
    const tokenHoverId = tokenDrag.hover ? hexSpaceId(dropTargetToHex(tokenDrag.hover)) : null;
    const tokenDragLabel = placementTokenLabel({ kind: tokenDrag.kind, pair: tokenDrag.pair });
    for (const candidate of tokenTileTargets) {
      const { x, y } = hexToPixel(candidate.hex, size);
      const isFaceDown = customMap[candidate.planIndex]?.faceDown === true;
      const isHover = hexSpaceId(candidate.hex) === tokenHoverId;
      objectLayer.push(
        <polygon
          className={`designerObjectSlot ${isFaceDown ? "faceDownTile" : "tileSlot"}${isHover ? " hover" : ""}`}
          key={`token-slot-${hexSpaceId(candidate.hex)}`}
          points={hexCorners(x, y, size - 1.6)}
        >
          <title>
            {isFaceDown
              ? `Reserve this exact hex for the ${tokenDragLabel} when the tile is revealed`
              : `Move the ${tokenDragLabel} token to this slot`}
          </title>
        </polygon>
      );
    }
    if (tokenDrag.kind !== "whirlpool") {
      for (const candidate of standaloneCandidates) {
        const { x, y } = hexToPixel(candidate, size);
        const isHover = hexSpaceId(candidate) === tokenHoverId;
        objectLayer.push(
          <polygon
            className={`designerObjectSlot standalone${isHover ? " hover" : ""}`}
            key={`token-standalone-${candidate.row}-${candidate.col}`}
            points={hexCorners(x, y, size - 1.6)}
          >
            <title>{`Move the ${tokenDragLabel} off every tile — it becomes a standalone object here`}</title>
          </polygon>
        );
      }
    }
  }

  // Make the committed cell unmistakable: candidate glows show every legal
  // option, while this pointer-transparent reticle marks the ONE exact hex the
  // current release will occupy.
  const activeDropTarget = objectDrag?.moved ? objectDrag.hover : tokenDrag?.moved ? tokenDrag.hover : null;
  if (activeDropTarget) {
    const targetHex = dropTargetToHex(activeDropTarget);
    const { x, y } = hexToPixel(targetHex, size);
    const standalone = activeDropTarget.target === "standalone";
    objectLayer.push(
      <g
        aria-label={`Drop target ${hexSpaceId(targetHex)}`}
        className={`designerTokenDropReticle${standalone ? " standalone" : ""}`}
        data-space-id={hexSpaceId(targetHex)}
        key="active-token-drop-reticle"
        style={{ pointerEvents: "none" }}
      >
        <polygon points={hexCorners(x, y, size - 3.2)} />
        <circle cx={x} cy={y} r={Math.max(2.2, size * 0.12)} />
        <text textAnchor="middle" x={x} y={y + size * 0.82}>PLACE</text>
      </g>
    );
  }
  for (const [index, object] of objects.entries()) {
    const draggingThis = Boolean(objectDrag && objectDrag.index === index && objectDrag.moved);
    // Follow the hovered drop target while dragging; otherwise sit at the placement.
    const coord =
      draggingThis && objectDrag!.hover ? dropTargetToHex(objectDrag!.hover) : placementToHex(object.placement);
    if (!coord) {
      continue;
    }
    const { x, y } = hexToPixel(coord, size);
    const isGate = object.kind === "gate";
    // Colored ring: gates / tents / barriers wear their pair color, the
    // Garrison its printed light-blue frame, plain teleporters gold.
    const isColored = isGate || object.kind === "keymaster_tent" || object.kind === "barrier";
    const color = isColored && object.pair ? GATE_PAIR_CSS[object.pair] : object.kind === "garrison" ? "#4fc3f7" : "#c9a24b";
    // Designer yellow borders on the object hex — the field-level twin of a
    // tile's per-edge lines, drawn with the same bold casing+core.
    for (const direction of object.borderEdges ?? []) {
      const coords = hexEdgePoints(x, y, size - 0.8, direction);
      borderLayer.push(<line className="designerBorderCasing" key={`obj-border-casing-${index}-${direction}`} {...coords} />);
      borderLayer.push(<line className="designerBorderLine" key={`obj-border-${index}-${direction}`} {...coords} />);
    }
    objectLayer.push(
      <g
        className={`designerObjectToken${isGate ? " gate" : ""}${object.placement.type === "standalone" ? " standalone" : ""}${
          selectedObjectIndex === index ? " selected" : ""
        }${draggingThis ? " dragging" : ""}`}
        data-object-index={index}
        key={`obj-token-${index}`}
        onClick={(event) => {
          if (objectClickSuppressRef.current) {
            objectClickSuppressRef.current = false;
            return;
          }
          const rect = wrapRef.current?.getBoundingClientRect();
          closeAllPanels();
          setSelectedObjectIndex(index);
          setObjectPopoverAt(
            rect
              ? { x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 8)), y: event.clientY - rect.top }
              : { x: 8, y: 0 }
          );
        }}
        onPointerDown={beginObjectDrag(index, object.kind)}
      >
        {/* A colored Gate reads as a colored Monolith: colored disc + monolith
            art + colored ring + pair badge. Tents/Barriers wear their color the
            same way; the Garrison a light-blue ring. Monolith/Whirlpool: art +
            gold ring. */}
        {isGate ? <circle cx={x} cy={y} fill={color} opacity={0.32} r={size * 0.5} style={{ pointerEvents: "none" }} /> : null}
        <image
          height={size}
          href={assetUrl(designerTokenImage(object.kind, object.kind === "whirlpool" ? 0 : undefined, object.pair))}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: "none" }}
          width={size}
          x={x - size * 0.5}
          y={y - size * 0.5}
        />
        <circle className="designerObjectRing" cx={x} cy={y} fill="none" r={size * 0.62} stroke={color} />
        {isColored ? (
          <text className="designerObjectPair" fill={color} textAnchor="middle" x={x} y={y + size * 0.66}>
            {object.pair}
          </text>
        ) : null}
        {guardBadgeNumeral(objectGuardDisplay(object)) ? (
          <text className="designerObjectGuard" textAnchor="middle" x={x} y={y - size * 0.6}>
            {guardBadgeNumeral(objectGuardDisplay(object))}
          </text>
        ) : null}
      </g>
    );
  }

  // --- Designer HEX EVENTS (⚡, DESIGNER-ONLY markers) ------------------------
  // Invisible in the real game; here each event hex wears a lightning mark with
  // a full plain-words tooltip. Clicks fall through to the tile underneath.
  for (const event of hexEvents) {
    const { x, y } = hexToPixel({ row: event.placement.row, col: event.placement.col }, size);
    objectLayer.push(
      <g key={`hex-event-${event.id}`} style={{ pointerEvents: "none" }}>
        <circle className="designerHexEventRing" cx={x} cy={y} fill="none" r={size * 0.5} />
        <text className="designerHexEventMark" data-hex-event={event.id} textAnchor="middle" x={x} y={y + size * 0.22}>
          <title>{`Hidden event (designer-only) — ${describeHexEvent(event)}`}</title>
          ⚡
        </text>
      </g>
    );
  }

  // --- Designer yellow-border paint zones (per physical edge) -----------------
  // While the paint tool is armed (and no tile is being dragged), every placed
  // plan's footprint contributes one THIN clickable strip per hex edge — 30 for a
  // lone flower (18 outer + 12 inner). Edges shared by two adjacent plans dedupe
  // to ONE zone via `boardEdgeKey`; the first plan to reach an edge OWNS the
  // write, but the zone's active state and erase consider every bordering plan.
  // A pointerdown seals/unseals that one edge and starts a stroke; pointerenter
  // over other edges continues it. Drawn on top of the objects so they stay
  // clickable while armed.
  const borderPaintLayer: React.ReactNode[] = [];
  if (borderPaint && !drag) {
    const effectiveByPlan = customMap.map((plan) => planEffectiveBorderEdges(plan));
    const zones = new Map<string, BorderEdgeZone>();
    for (const [planIndex, plan] of customMap.entries()) {
      const flower = tileFootprint({ row: plan.row, col: plan.col }, 0);
      for (const [footprintIndex, cell] of flower.entries()) {
        for (let direction = 0; direction < 6; direction += 1) {
          const neighbor = hexNeighbor(cell, direction);
          const key = boardEdgeKey(cell, neighbor);
          const code = canonicalTileEdgeCode(footprintIndex, direction);
          let zone = zones.get(key);
          if (!zone) {
            zone = { hex: cell, direction, incidences: [], objectIncidences: [] };
            zones.set(key, zone);
          }
          // An inner edge is met twice from one plan (both its hexes) at the same
          // canonical code — record each (plan, code) pair once.
          if (!zone.incidences.some((inc) => inc.planIndex === planIndex && inc.code === code)) {
            zone.incidences.push({ planIndex, code });
          }
        }
      }
    }
    // Standalone object hexes paint too: each contributes its six edges. An edge
    // shared with a tile joins THAT zone (the tile side owns the write; erase
    // sweeps both); an off-tile edge gets its own object-owned zone.
    for (const [objectIndex, object] of objects.entries()) {
      if (object.placement.type !== "standalone") {
        continue;
      }
      const cell = { row: object.placement.row, col: object.placement.col };
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = hexNeighbor(cell, direction);
        const key = boardEdgeKey(cell, neighbor);
        let zone = zones.get(key);
        if (!zone) {
          zone = { hex: cell, direction, incidences: [], objectIncidences: [] };
          zones.set(key, zone);
        }
        if (!zone.objectIncidences.some((inc) => inc.objectIndex === objectIndex && inc.direction === direction)) {
          zone.objectIncidences.push({ objectIndex, direction });
        }
      }
    }
    const thickness = size * 0.36;
    for (const [key, zone] of zones) {
      const owner = zone.incidences[0];
      const active =
        zone.incidences.some((inc) => effectiveByPlan[inc.planIndex]?.includes(inc.code)) ||
        zone.objectIncidences.some((inc) => objects[inc.objectIndex]?.borderEdges?.includes(inc.direction));
      const { x, y } = hexToPixel(zone.hex, size);
      borderPaintLayer.push(
        <polygon
          aria-label={`border edge ${hexSpaceId(zone.hex)} d:${zone.direction}`}
          className={`designerBorderEdgeZone${active ? " active" : ""}`}
          data-border-index={owner ? owner.planIndex : `object-${zone.objectIncidences[0]?.objectIndex}`}
          data-edge-code={owner ? owner.code : zone.objectIncidences[0]?.direction}
          key={`border-edge-${key}`}
          // Take the press so the tile press/drag and board pan never start; do
          // NOT capture the pointer (that would swallow pointerenter on siblings).
          onPointerDown={(event) => {
            event.stopPropagation();
            const mode: "draw" | "erase" = active ? "erase" : "draw";
            borderStrokeRef.current = mode;
            paintEdgeZone(zone, mode);
          }}
          onPointerEnter={() => {
            if (borderStrokeRef.current) {
              paintEdgeZone(zone, borderStrokeRef.current);
            }
          }}
          points={edgeStripPoints(x, y, size - 0.8, zone.direction, thickness)}
        >
          <title>{active ? "Remove this yellow border edge" : "Seal this edge (yellow border)"}</title>
        </polygon>
      );
    }
  }

  return (
    <div className="mapDesigner" aria-label="Map designer">
      <section className="designerCluster designerClusterTiles" aria-label="Tiles">
        <span className="designerClusterLabel">Tiles</span>
        <div className="designerClusterBody">
      <div className="designerPalette" aria-label="Tile palette">
        <small className="palettePrompt">Drag a tile onto the map</small>
        {PALETTE.map((entry) => (
          <button
            className={`paletteTile group-${entry.group}`}
            key={entry.key}
            onPointerDown={beginPaletteDrag(entry.group, entry.seaBand, entry.subBand)}
            style={{ borderColor: GROUP_COLORS[entry.group] }}
            title={entry.hint}
            type="button"
          >
            <span
              aria-hidden="true"
              className="paletteThumb"
              style={{
                backgroundImage: `url(${assetUrl(
                  planBackArt({ group: entry.group, seaBand: entry.seaBand, subBand: entry.subBand })
                )})`
              }}
            />
            <span className="paletteLabel">{entry.label}</span>
          </button>
        ))}
      </div>

      <div className="designerBandLegend" aria-label="Tile outline colours — max unit tier per band">
        <span className="designerBandLegendTitle">Max tier</span>
        {BAND_LEGEND_GROUPS.map((group) => (
          <span className="designerBandLegendItem" data-band-group={group} key={group}>
            <i aria-hidden="true" className="designerBandLegendSwatch" style={{ background: GROUP_COLORS[group] }} />
            {TILE_GROUP_BAND_LABELS[group]}
          </span>
        ))}
      </div>
        </div>
      </section>

      <section className="designerCluster designerClusterObjects" aria-label="Objects &amp; teleporters">
        <span className="designerClusterLabel">Objects &amp; teleporters</span>
        <div className="designerClusterBody">
      <div className="designerObjectPalette" aria-label="Objects palette">
        <small className="palettePrompt">
          {borderPaint
            ? "Painting yellow borders — click an edge to seal it, click again to remove, or drag to paint a line of edges"
            : armedObject
              ? `Placing a ${armedLabel} — click a glowing cell (tile hex or off-tile), or the button again to stop`
              : "Click an object, then click a board cell to place it"}
        </small>
        {armedObject || objectDrag?.moved || tokenDrag?.moved ? (
          <div aria-live="polite" className="designerPlacementLegend" role="status">
            <DesignerGlyph className="designerPlacementLegendGlyph" src={DESIGNER_UI_ICONS.tokenPlace} />
            <span className="tile"><i /> Gold = exact tile hex</span>
            {activeKind !== "whirlpool" ? <span className="standalone"><i /> Blue = separate map hex</span> : null}
            {objectDrag?.moved || tokenDrag?.moved ? <strong>Release on the bright PLACE reticle.</strong> : null}
          </div>
        ) : null}
        <div className="designerObjectPaletteRow">
          <span className="designerObjectGroupLabel">Teleporters</span>
          {GATE_PAIRS.map((pair) => {
            const placed = gatePairPlaced[pair] ?? 0;
            const armed = armedObject?.kind === "gate" && armedObject.pair === pair;
            return (
              <button
                aria-label={`${gatePairColor(pair)} teleport gate`}
                aria-pressed={armed}
                className={`designerObjectButton gate${armed ? " armed" : ""}`}
                data-gate-pair={pair}
                key={`gate-${pair}`}
                onClick={() => armObject("gate", pair)}
                style={{ borderColor: GATE_PAIR_CSS[pair] }}
                title={`${gatePairColor(pair)} Teleport Gate (two-way monolith) — per-color teleport network (needs at least 2; ${placed} placed)`}
                type="button"
              >
                <span className="designerObjectSwatch" style={{ background: GATE_PAIR_CSS[pair] }}>
                  {pair}
                </span>
                <span className="designerObjectCount">{placed} placed</span>
              </button>
            );
          })}
          <button
            aria-pressed={armedObject?.kind === "whirlpool"}
            className={`designerObjectButton${armedObject?.kind === "whirlpool" ? " armed" : ""}`}
            onClick={() => armObject("whirlpool")}
            title="Whirlpool token — sea-tile slots only (needs at least 2)"
            type="button"
          >
            🌀 Whirlpool
          </button>
          <span className="designerObjectGroupLabel">One-way monolith</span>
          <button
            aria-pressed={armedObject?.kind === "oneway_entrance"}
            className={`designerObjectButton${armedObject?.kind === "oneway_entrance" ? " armed" : ""}`}
            onClick={() => armObject("oneway_entrance", 1)}
            title="One-way monolith ENTRANCE — on a tile or standalone. May be guarded (bank-style fight, no XP); winning teleports to a same-color exit (random / pick / mix — set in the placed panel)."
            type="button"
          >
            ⤇ Entrance
          </button>
          <button
            aria-pressed={armedObject?.kind === "oneway_exit"}
            className={`designerObjectButton${armedObject?.kind === "oneway_exit" ? " armed" : ""}`}
            onClick={() => armObject("oneway_exit", 1)}
            title="One-way monolith EXIT — on a tile or standalone. Never guarded; heroes arrive here from same-color entrances (mark it 'always pickable' for mix mode in the placed panel)."
            type="button"
          >
            ⇥ Exit
          </button>
          <span className="designerObjectGroupLabel">Outposts</span>
          <button
            aria-pressed={armedObject?.kind === "garrison"}
            className={`designerObjectButton${armedObject?.kind === "garrison" ? " armed" : ""}`}
            onClick={() => armObject("garrison")}
            title="Garrison — a standalone hex connecting tiles. Optional guard (bank-style fight, no XP); the winner flags it, and a flagged garrison is defended army-only for 3 gold."
            type="button"
          >
            🏰 Garrison
          </button>
          <button
            aria-pressed={armedObject?.kind === "keymaster_tent"}
            className={`designerObjectButton${armedObject?.kind === "keymaster_tent" ? " armed" : ""}`}
            onClick={() => armObject("keymaster_tent", 1)}
            title="Keymaster's Tent — a standalone colored tent. Beat its (optional) guard to flag it (several players may); a tent flag opens same-color Barriers. Set the color in the placed tent's panel."
            type="button"
          >
            ⛺ Keymaster
          </button>
          <button
            aria-pressed={armedObject?.kind === "barrier"}
            className={`designerObjectButton${armedObject?.kind === "barrier" ? " armed" : ""}`}
            onClick={() => armObject("barrier", 1)}
            title="Barrier — a standalone colored wall. Never guarded; only players holding a matching-color Keymaster's Tent flag may enter. Set the color in the placed barrier's panel."
            type="button"
          >
            ⛔ Barrier
          </button>
        </div>
      </div>
        </div>
      </section>

      <section className="designerCluster designerClusterTools" aria-label="Tools">
        <span className="designerClusterLabel">Tools</span>
        <div className="designerClusterBody">
        <div className="designerToolRow">
          <button
            aria-pressed={borderPaint}
            className={`designerObjectButton designerToolButton borderPaint${borderPaint ? " armed" : ""}`}
            onClick={toggleBorderPaint}
            title="Yellow border — draw impassable lines edge by edge on the board: click an edge to seal it, click again to remove, drag to paint several"
            type="button"
          >
            🖌 Yellow border
          </button>
          <button
            aria-controls="designer-mod-panel"
            aria-expanded={modPanelOpen}
            aria-pressed={modPanelOpen}
            className={`designerObjectButton designerToolButton modPanel${modPanelOpen ? " armed" : ""}`}
            data-testid="designer-mod-panel-toggle"
            onClick={() => {
              setModPanelOpen((open) => !open);
              setArmedObject(null);
              if (borderPaint) {
                toggleBorderPaint();
              }
            }}
            title="Anime Mod — Field Overrides and other mod single-hex objects (select a tile, then pin an override)"
            type="button"
          >
            ⛩ Mod
          </button>
        </div>
        {modPanelOpen ? (
          <div
            className="designerModPanel"
            data-testid="designer-mod-panel"
            id="designer-mod-panel"
            role="region"
            aria-label="Anime Mod field overrides"
          >
            <div className="popoverSectionLabel">Mod objects → Field Overrides</div>
            <small className="popoverHint">
              One tile may hold <strong>multiple</strong> hex objects (tokens + overrides) as long as
              each uses a <strong>different hex</strong> — never stacked. Monolith / Whirlpool / Gate
              are basic teleports (Objects palette). These buttons add{" "}
              <strong>function objects</strong> (Anime package today). Map pick auto-ticks Field
              Overrides in Game options.
            </small>
            <div className="designerModPanelRow">
              {listFieldOverrideDefinitions({
                implementedOnly: true,
                package: ["anime-xianxia", "anime-isekai", "shared"]
              }).map((def) => {
                const groupOk = selected ? def.tileGroups.includes(selected.group) : true;
                const pinnedList = selected ? planFieldOverrides(selected) : [];
                const pinnedCount = pinnedList.filter((p) => p.kind === def.id).length;
                // Legality-aware: a face-up tile only offers slots the engine
                // will accept at setup (a blind slot would be dropped there).
                const freeSlots = selected ? fieldOverridePinSlots(selected, def.id) : [];
                return (
                  <button
                    className={`designerObjectButton modOverride${pinnedCount > 0 ? " armed" : ""}`}
                    data-testid={`mod-override-${def.id}`}
                    disabled={!selected || !groupOk || freeSlots.length === 0}
                    key={def.id}
                    onClick={() => {
                      if (selectedIndex === null || !selected) {
                        return;
                      }
                      const current = planFieldOverrides(selected);
                      // Click again with a free legal slot: add another of this
                      // kind on the next free hex.
                      const nextFree = fieldOverridePinSlots(selected, def.id)[0];
                      if (nextFree === undefined) {
                        return;
                      }
                      const next = withPlanFieldOverrides(selected, [
                        ...current,
                        { kind: def.id, slot: nextFree }
                      ]);
                      updateTile(selectedIndex, {
                        fieldOverrides: next.fieldOverrides,
                        fieldOverride: undefined
                      });
                    }}
                    title={
                      !selected
                        ? "Select a tile first"
                        : !groupOk
                          ? `Not allowed on ${selected.group} tiles`
                          : freeSlots.length === 0
                            ? "No free legal hex on this tile for this object"
                            : `${def.summary} — add on free hex (${pinnedCount} already on tile)`
                    }
                    type="button"
                  >
                    {def.nameVi ?? def.name}
                    {pinnedCount > 0 ? ` ×${pinnedCount}` : ""}
                  </button>
                );
              })}
            </div>
            {selected && planFieldOverrides(selected).length > 0 ? (
              <div className="popoverActions" data-testid="mod-override-list">
                <small className="popoverHint">Pinned on this tile (change slot or remove):</small>
                {planFieldOverrides(selected).map((pin, pinIndex) => (
                  <div className="designerModPinRow" key={`${pin.kind}-${pin.slot}-${pinIndex}`}>
                    <span>
                      {getFieldOverrideDefinition(pin.kind)?.nameVi ?? pin.kind}
                      {pin.slot !== undefined ? ` · slot ${pin.slot}` : ""}
                    </span>
                    <select
                      aria-label={`Hex slot for ${pin.kind}`}
                      className="popoverSelect"
                      onChange={(event) => {
                        if (selectedIndex === null || !selected) {
                          return;
                        }
                        const newSlot = Number(event.target.value);
                        // Allow keeping own slot; block occupied AND (face-up)
                        // slots the engine would refuse at setup.
                        if (
                          newSlot !== pin.slot &&
                          !fieldOverridePinSlots(selected, pin.kind, pin.slot).includes(newSlot)
                        ) {
                          return;
                        }
                        const list = planFieldOverrides(selected).map((p, i) =>
                          i === pinIndex ? { ...p, slot: newSlot } : p
                        );
                        const next = withPlanFieldOverrides(selected, list);
                        updateTile(selectedIndex, {
                          fieldOverrides: next.fieldOverrides,
                          fieldOverride: undefined
                        });
                      }}
                      value={pin.slot ?? 0}
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((slot) => {
                        const legal = fieldOverridePinSlots(selected, pin.kind, pin.slot);
                        const taken = slot !== pin.slot && !legal.includes(slot);
                        return (
                          <option disabled={taken} key={slot} value={slot}>
                            Slot {slot}
                            {taken ? " (taken)" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      onClick={() => {
                        if (selectedIndex === null || !selected) {
                          return;
                        }
                        const list = planFieldOverrides(selected).filter((_, i) => i !== pinIndex);
                        const next = withPlanFieldOverrides(selected, list);
                        updateTile(selectedIndex, {
                          fieldOverrides: next.fieldOverrides,
                          fieldOverride: undefined
                        });
                      }}
                      title="Remove this pin"
                      type="button"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  data-testid="mod-override-clear"
                  onClick={() => {
                    if (selectedIndex !== null) {
                      updateTile(selectedIndex, { fieldOverrides: undefined, fieldOverride: undefined });
                    }
                  }}
                  type="button"
                >
                  <Trash2 size={13} /> Clear all Field Overrides on tile
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        </div>
      </section>

      <div className="designerBoardWrap" ref={wrapRef}>
        {pickRequest ? (
          <div className="designerPickBanner" role="status" aria-label="Pick a tile on the map">
            <span aria-hidden="true">📍</span>
            <strong>
              {pickRequest.kind === "hex-event"
                ? "Click any hex of a placed tile to drop a hidden event there."
                : pickRequest.objectKind === "obelisk"
                  ? "Click a highlighted tile with an Obelisk to set its specific options."
                  : pickRequest.objectKind === "mine"
                    ? "Click a highlighted tile with a Mine to set its specific options."
                    : pickRequest.objectKind === "settlement"
                      ? "Click a highlighted tile to set its specific Settlement options."
                      : "Click a highlighted Ⅵ–Ⅶ center tile to set its objective's specific options."}
            </strong>
            <button
              className="commandButton ghost"
              onClick={() => onPickResolved?.()}
              type="button"
            >
              Cancel (Esc)
            </button>
          </div>
        ) : null}
        <svg
          className={`designerSvg ${drag ? "dragging" : ""}${pickRequest ? " picking" : ""}`}
          ref={svgRef}
          onPointerCancel={(event) => {
            pointersRef.current.delete(event.pointerId);
            if (pinchRef.current && (pinchRef.current.aId === event.pointerId || pinchRef.current.bId === event.pointerId)) {
              pinchRef.current = null;
            }
            if (panRef.current?.pointerId === event.pointerId) {
              panRef.current = null;
            }
            if (pressRef.current?.pointerId === event.pointerId) {
              pressRef.current = null;
            }
          }}
          onPointerDown={(event) => {
            // Background press → pan. Tile presses stopPropagation above.
            if (event.button !== 0 || drag) {
              return;
            }
            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointersRef.current.size >= 2) {
              // Multi-touch: cancel pan / tile press and hand off to pinch.
              suppressClickRef.current = true;
              pressRef.current = null;
              panRef.current = null;
              if (pointersRef.current.size === 2) {
                const [[aId, a], [bId, b]] = [...pointersRef.current.entries()];
                pinchRef.current = { aId, bId, start: { camera, a: { ...a }, b: { ...b } } };
                try {
                  (event.currentTarget as Element).setPointerCapture(aId);
                  (event.currentTarget as Element).setPointerCapture(bId);
                } catch {
                  // jsdom / detached — gesture still works uncaptured.
                }
              }
              return;
            }
            if (popoverAt) {
              closePopover();
            }
            suppressClickRef.current = false;
            panRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: camera.x,
              originY: camera.y,
              moved: false
            };
          }}
          onPointerMove={(event) => {
            const tracked = pointersRef.current.get(event.pointerId);
            if (tracked) {
              tracked.x = event.clientX;
              tracked.y = event.clientY;
            }
            const pinch = pinchRef.current;
            if (pinch) {
              if (event.pointerId !== pinch.aId && event.pointerId !== pinch.bId) {
                return;
              }
              const a = pointersRef.current.get(pinch.aId);
              const b = pointersRef.current.get(pinch.bId);
              const svg = svgRef.current;
              if (!a || !b || !svg) {
                return;
              }
              const rect = svg.getBoundingClientRect();
              setCamera(
                pinchCamera(pinch.start, a, b, rect, {
                  minX,
                  minY,
                  width: maxX - minX,
                  height: maxY - minY
                })
              );
              return;
            }
            // Promote a tile press into a move-drag once it travels far enough.
            const press = pressRef.current;
            if (press && press.pointerId === event.pointerId && !press.promoted) {
              if (Math.abs(event.clientX - press.startX) + Math.abs(event.clientY - press.startY) > 6) {
                press.promoted = true;
                pressRef.current = null;
                closePopover();
                setDrag({ kind: "move", index: press.index, group: press.group, seaBand: press.seaBand, subBand: press.subBand, clientX: event.clientX, clientY: event.clientY });
                setHoverSlot(slotAt(event.clientX, event.clientY, press.index));
              }
              return;
            }
            const pan = panRef.current;
            if (!pan || pan.pointerId !== event.pointerId) {
              return;
            }
            const dx = event.clientX - pan.startX;
            const dy = event.clientY - pan.startY;
            if (!pan.moved && Math.abs(dx) + Math.abs(dy) > 6) {
              pan.moved = true;
              suppressClickRef.current = true;
              (event.currentTarget as Element).setPointerCapture(event.pointerId);
            }
            if (pan.moved) {
              setCamera((current) => ({ ...current, x: pan.originX + dx, y: pan.originY + dy }));
            }
          }}
          onPointerUp={(event) => {
            pointersRef.current.delete(event.pointerId);
            if (pinchRef.current && (pinchRef.current.aId === event.pointerId || pinchRef.current.bId === event.pointerId)) {
              pinchRef.current = null;
              // Remaining finger can resume pan if still down.
              if (pointersRef.current.size === 1) {
                const [[id, pt]] = [...pointersRef.current.entries()];
                panRef.current = {
                  pointerId: id,
                  startX: pt.x,
                  startY: pt.y,
                  originX: camera.x,
                  originY: camera.y,
                  moved: false
                };
              }
              return;
            }
            // A tile press that never became a drag is a click → open options.
            const press = pressRef.current;
            if (press && press.pointerId === event.pointerId && !press.promoted) {
              pressRef.current = null;
              // SPECIFIC-mode pick: a hex-event click drops an event on the
              // exact hex under the pointer; an object-plan click on an
              // ELIGIBLE tile selects it and opens its options (scrolled to
              // the object section). Ineligible tiles ignore the click.
              if (pickRequest?.kind === "hex-event") {
                const local = clientToLocal(event.clientX, event.clientY);
                const hex = local ? pixelToHex(local.x, local.y, hexSize) : null;
                if (hex && occupiedTileHexes.has(hexSpaceId(hex)) && onHexEventsChange) {
                  const taken = hexEvents.some(
                    (candidate) =>
                      candidate.placement.row === hex.row && candidate.placement.col === hex.col
                  );
                  if (!taken) {
                    onHexEventsChange([
                      ...hexEvents,
                      {
                        // One event per hex, so the hex IS a stable unique id.
                        id: `hexev_${hex.row}_${hex.col}`,
                        placement: { row: hex.row, col: hex.col },
                        message: "Something stirs here…"
                      }
                    ]);
                    onPickResolved?.();
                  }
                }
                return;
              }
              if (pickRequest?.kind === "object-plan") {
                const plan = customMap[press.index];
                if (plan && planEligibleForPick(plan, pickRequest.objectKind)) {
                  closeAllPanels();
                  setSelectedIndex(press.index);
                  setTilePickFilter("all");
                  setPopoverAt({ x: event.clientX, y: event.clientY });
                  onPickResolved?.();
                }
                return;
              }
              // Opening the docked tile panel closes any open object / token panel
              // so at most one of the three is ever shown (mutual exclusivity).
              closeAllPanels();
              setSelectedIndex(press.index);
              setTilePickFilter("all");
              // `popoverAt` is now just an OPEN flag — the panel docks top-right
              // via CSS, so the click coords no longer drive layout. Kept as an
              // object to avoid churning every open/close call site.
              setPopoverAt({ x: event.clientX, y: event.clientY });
              return;
            }
            if (panRef.current?.pointerId === event.pointerId) {
              panRef.current = null;
            }
          }}
          viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        >
          <g ref={gRef} transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`} style={{ transformOrigin: "center" }}>
            {artLayer}
            {cellLayer}
            {outlineLayer}
            {labelLayer}
            {gateLayer}
            {borderLayer}
            {objectLayer}
            {borderPaintLayer}
          </g>
        </svg>

        <div className="mapToolbar designerToolbarFloat" aria-label="Designer view controls">
          <button onClick={() => zoomBy(1.2)} title="Zoom in" type="button">
            <DesignerGlyph className="designerToolIcon" src={DESIGNER_UI_ICONS.zoomIn} />
          </button>
          <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out" type="button">
            <DesignerGlyph className="designerToolIcon" src={DESIGNER_UI_ICONS.zoomOut} />
          </button>
          <button
            aria-pressed={wheelZoomEnabled}
            className={wheelZoomEnabled ? "selected" : ""}
            onClick={() => setWheelZoomEnabled((value) => !value)}
            title={
              wheelZoomEnabled
                ? "Mouse-wheel zoom is ON — scroll over the board to zoom. Click to lock it (wheel scrolls the page)."
                : "Mouse-wheel zoom is locked. Click to unlock and zoom with the scroll wheel."
            }
            type="button"
          >
            <DesignerGlyph
              className="designerToolIcon"
              src={wheelZoomEnabled ? DESIGNER_UI_ICONS.wheelUnlock : DESIGNER_UI_ICONS.wheelLock}
            />
          </button>
          <button onClick={() => setCamera({ x: 0, y: 0, scale: 1 })} title="Reset the view" type="button">
            <DesignerGlyph className="designerToolIcon" src={DESIGNER_UI_ICONS.zoomReset} />
          </button>
          <span className="designerZoomReadout" title="Current zoom">
            {Math.round(camera.scale * 100)}%
          </span>
        </div>

        {/* Per-tile options panel — docked top-right of the board (always fully
            visible + internally scrollable), so no content is clipped by the
            wrap's overflow no matter where the tile sits. */}
        {selected && popoverAt ? (
          <div
            className={`designerPopover${selected.group !== "starting" && PICKABLE_GROUPS.has(selected.group) ? " wide" : ""}`}
          >
            <header>
              <strong>
                {selected.group === "starting"
                  ? `Town — seat ${seatNumberOf(selectedIndex as number)}`
                  : `${planGroupLabel(selected)} tile`}
              </strong>
              <button
                aria-label="Close tile options"
                className="popoverClose"
                onClick={closePopover}
                title="Close"
                type="button"
              >
                ✕
              </button>
            </header>

            {selected.group === "starting" ? (
              <>
                <small className="popoverHint">A player&apos;s starting town. Drag it to move; its tile art comes from each player&apos;s faction.</small>
                {/* Rotation + Fix-orientation: the faction art is unknown at design
                    time, so the preview shows the orientation as a badge/degrees. */}
                <div className="popoverActions">
                  <button
                    className="popoverIconButton"
                    onClick={() => rotateSelected(-1)}
                    title="Rotate 60° counterclockwise"
                    type="button"
                  >
                    <DesignerGlyph className="popoverActionGlyph flipH" src={DESIGNER_UI_ICONS.rotate} />
                    <span>−60°</span>
                  </button>
                  <button
                    className="popoverIconButton"
                    onClick={() => rotateSelected(1)}
                    title="Rotate 60° clockwise"
                    type="button"
                  >
                    <DesignerGlyph className="popoverActionGlyph" src={DESIGNER_UI_ICONS.rotate} />
                    <span>{(selected.rotation ?? 0) * 60}°</span>
                  </button>
                </div>
                <button
                  aria-pressed={Boolean(selected.lockRotation)}
                  className={`popoverLockToggle${selected.lockRotation ? " active" : ""}`}
                  onClick={toggleLockRotation}
                  type="button"
                >
                  <Lock size={13} />
                  Fix orientation (no opening rotation)
                </button>
                <small className="popoverHint">
                  {selected.lockRotation
                    ? `Locked at ${(selected.rotation ?? 0) * 60}° — this seat's home tile keeps this orientation and skips the opening free-rotation.`
                    : "Unlocked: the tile starts at 0° and this seat rotates it once at the start of their first turn (opening ceremony)."}
                </small>
              </>
            ) : (
              <>
                {/* Step 1 — click a mode */}
                <div className="popoverSectionLabel">What is on this slot?</div>
                <div className="popoverModeRow" role="group" aria-label="Tile slot mode">
                  <button
                    aria-pressed={selectedMode === "random"}
                    className={`popoverModeCard${selectedMode === "random" ? " active" : ""}`}
                    onClick={() => setSelectedSlotMode("random")}
                    title="Draw a random tile from this pool when the game starts. Players see a face-down back."
                    type="button"
                  >
                    <DesignerGlyph className="popoverModeGlyph" src={DESIGNER_UI_ICONS.modeRandom} />
                    <span className="popoverModeTitle">Random</span>
                    <span className="popoverModeSub">Any tile</span>
                  </button>
                  <button
                    aria-pressed={selectedMode === "secret"}
                    className={`popoverModeCard${selectedMode === "secret" ? " active" : ""}`}
                    onClick={() => setSelectedSlotMode("secret")}
                    title="Guarantee a landmark (gold mine, obelisk, …). At game start a random tile with that feature is drawn face-down."
                    type="button"
                  >
                    <DesignerGlyph className="popoverModeGlyph" src={DESIGNER_UI_ICONS.modeSecret} />
                    <span className="popoverModeTitle">Secret</span>
                    <span className="popoverModeSub">Landmark filter</span>
                  </button>
                  <button
                    aria-pressed={selectedMode === "faceup"}
                    className={`popoverModeCard${selectedMode === "faceup" ? " active" : ""}`}
                    onClick={() => setSelectedSlotMode("faceup")}
                    title="You pick the exact tile and it is visible on the board from the start."
                    type="button"
                  >
                    <DesignerGlyph className="popoverModeGlyph" src={DESIGNER_UI_ICONS.modeFaceUp} />
                    <span className="popoverModeTitle">Face-up</span>
                    <span className="popoverModeSub">Visible now</span>
                  </button>
                  <button
                    aria-pressed={selectedMode === "one-of"}
                    className={`popoverModeCard${selectedMode === "one-of" ? " active" : ""}`}
                    onClick={() => setSelectedSlotMode("one-of")}
                    title="Pick a LIST of tiles; the game places ONE of them at random (face-up) when it starts."
                    type="button"
                  >
                    <DesignerGlyph className="popoverModeGlyph" src={DESIGNER_UI_ICONS.modeRandom} />
                    <span className="popoverModeTitle">One of</span>
                    <span className="popoverModeSub">From a list</span>
                  </button>
                </div>

                <small className="popoverHint">
                  {selectedMode === "random"
                    ? "Random: any tile from this pool is drawn at game start."
                    : selectedMode === "secret"
                      ? selectedSecretSet.length > 0
                        ? `Secret: a random tile matching ${selectedSecretSet.map(secretFeatureFullLabel).join(" OR ")} is drawn face-down at game start — players only see the back until discovery.`
                        : selected.tileDefId
                          ? `Exact secret pin: ${selected.tileDefId} stays face-down. Prefer a landmark below so the pool can still vary.`
                          : "Secret: tap one or more landmarks below. The game draws one random tile matching ANY of them from this pool."
                      : selectedMode === "one-of"
                        ? `One of: the game places a RANDOM tile from your list (${(selected.oneOfTileDefIds ?? []).length} selected) face-up at game start. Tap tiles below to add or remove them.`
                        : "Face-up: click a tile below. Everyone sees it from the start of the game."}
                </small>

                {/* Step 2a — Secret: pick one or more landmark features (primary). */}
                {selectedMode === "secret" && PICKABLE_GROUPS.has(selected.group) ? (
                  <div className="popoverFeaturePicker">
                    <div className="popoverSectionLabel">Guarantee these landmarks (tap several for OR)</div>
                    {availableSecretFeatures.length > 0 ? (
                      <div className="popoverFeatureGrid" role="listbox" aria-label="Secret landmarks" aria-multiselectable="true">
                        {availableSecretFeatures.map((feature) => {
                          const isPicked = selectedSecretSet.includes(feature.id) && !selected.tileDefId;
                          return (
                            <button
                              aria-selected={isPicked}
                              className={`popoverFeatureCard${isPicked ? " selected" : ""}`}
                              key={feature.id}
                              onClick={() => pickSecretFeature(feature.id)}
                              role="option"
                              title={feature.description}
                              type="button"
                            >
                              <span className="popoverFeatureIcon" aria-hidden="true">
                                <DesignerGlyph className="popoverFeatureGlyph" src={feature.iconSrc} />
                              </span>
                              <span className="popoverFeatureTitle">{feature.label}</span>
                              <span className="popoverFeatureCount">
                                {feature.matchCount} tile{feature.matchCount === 1 ? "" : "s"} in pool
                              </span>
                              {isPicked ? <span className="popoverFeatureBadge">Chosen</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <small className="popoverHint">
                        No landmark features exist in this pool. Pin an exact tile below, or switch to Random.
                      </small>
                    )}
                    {selectedSecretSet.length > 0 && !selected.tileDefId ? (
                      <div className="popoverSecretSummary" role="status">
                        <span className="popoverSecretSummaryIcon" aria-hidden="true">
                          {(() => {
                            const meta = SECRET_TILE_FEATURES.find((entry) => entry.id === selectedSecretSet[0]);
                            return meta ? (
                              <DesignerGlyph className="popoverFeatureGlyph" src={meta.iconSrc} />
                            ) : (
                              "🔒"
                            );
                          })()}
                        </span>
                        <div>
                          <strong>In game:</strong> opens as a face-down {planGroupLabel(selected)} tile, then
                          reveals a random tile matching{" "}
                          <em>{selectedSecretSet.map(secretFeatureFullLabel).join(" OR ")}</em> from the remaining
                          pool.
                        </div>
                      </div>
                    ) : null}
                    {selected.faceDown && (selected.group === "far" || selected.group === "near") ? (
                      <button
                        aria-pressed={Boolean(selected.playerResourcePick)}
                        className={`popoverFilterChip${selected.playerResourcePick ? " active" : ""}`}
                        onClick={() =>
                          updateTile(selectedIndex as number, {
                            playerResourcePick: selected.playerResourcePick ? undefined : true
                          })
                        }
                        title="Before reveal the discovering player chooses Gold or Valuables mine; the game draws a matching tile from the pool."
                        type="button"
                      >
                        Player picks Gold / Valuables on reveal
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {/* Step 2b — Face-up tile grid, or advanced exact secret pin under Secret/Random. */}
                {PICKABLE_GROUPS.has(selected.group) &&
                (selectedMode === "faceup" ||
                  selectedMode === "secret" ||
                  selectedMode === "random" ||
                  selectedMode === "one-of") ? (
                  <div className="popoverTilePicker">
                    <div className="popoverSectionLabel">
                      {selectedMode === "faceup"
                        ? "Click the face-up tile"
                        : selectedMode === "one-of"
                          ? "Tap tiles to include in the random set"
                          : selectedMode === "secret"
                            ? "Advanced: pin one exact tile instead"
                            : "Or pin a specific tile as exact Secret"}
                    </div>
                    {selectedMode === "secret" || selectedMode === "random" ? (
                      <small className="popoverHint">
                        {selectedMode === "secret"
                          ? "Locks one tile id (legacy). Prefer a landmark above so any matching tile can appear."
                          : "Locks one tile face-down. Use Secret + a landmark to keep the pool random."}
                      </small>
                    ) : null}
                    <div className="popoverFilterRow" role="group" aria-label="Filter tiles by landmark">
                      {availablePickFilters.map((filter) => (
                        <button
                          aria-pressed={activePickFilter.id === filter.id}
                          className={`popoverFilterChip${activePickFilter.id === filter.id ? " active" : ""}`}
                          key={filter.id}
                          onClick={() => setTilePickFilter(filter.id)}
                          type="button"
                        >
                          {filter.iconSrc ? (
                            <DesignerGlyph className="popoverFilterGlyph" src={filter.iconSrc} />
                          ) : null}
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    <div className="popoverTileGrid" role="listbox" aria-label="Tiles in this pool">
                      {filteredPickableTiles.map((tile) => {
                        const isOneOf = selectedMode === "one-of";
                        const taken = usedPinnedIds.has(tile.id) && selected.tileDefId !== tile.id;
                        const isPicked = isOneOf
                          ? (selected.oneOfTileDefIds ?? []).includes(tile.id)
                          : selected.tileDefId === tile.id;
                        const tags = tileFeatureTags(tile);
                        const art = tile.assets?.tileImage;
                        return (
                          <button
                            aria-selected={isPicked}
                            className={`popoverTileCard${isPicked ? " selected" : ""}${taken ? " taken" : ""}`}
                            disabled={taken}
                            key={tile.id}
                            onClick={() => (isOneOf ? pickOneOfTile(tile.id) : pickTileForSelected(tile.id))}
                            role="option"
                            title={
                              taken
                                ? `${tile.id} is already used on another slot`
                                : `${tile.id}: ${tags.join(", ")}`
                            }
                            type="button"
                          >
                            {art ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                alt=""
                                className="popoverTileCardArt"
                                src={assetUrl(art)}
                                style={{ transform: `rotate(${(selected.rotation ?? 0) * 60}deg)` }}
                              />
                            ) : (
                              <span className="popoverTileCardArt placeholder">{tile.id}</span>
                            )}
                            <span className="popoverTileCardId">{tile.id}</span>
                            <span className="popoverTileCardTags">
                              {tags.slice(0, 3).map((tag) => (
                                <span className="popoverTileTag" key={tag}>
                                  {tag}
                                </span>
                              ))}
                              {tags.length > 3 ? (
                                <span className="popoverTileTag more">+{tags.length - 3}</span>
                              ) : null}
                            </span>
                            {isPicked ? (
                              <span className="popoverTileCardBadge">
                                {isOneOf ? "In set" : selectedMode === "faceup" ? "Face-up" : "Exact"}
                              </span>
                            ) : null}
                            {taken ? <span className="popoverTileCardBadge taken">Used</span> : null}
                          </button>
                        );
                      })}
                      {filteredPickableTiles.length === 0 ? (
                        <small className="popoverHint">No tiles match this filter.</small>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="popoverActions">
                  <button
                    className="popoverIconButton"
                    onClick={() => rotateSelected(-1)}
                    title="Rotate 60° counterclockwise"
                    type="button"
                  >
                    <DesignerGlyph className="popoverActionGlyph flipH" src={DESIGNER_UI_ICONS.rotate} />
                    <span>−60°</span>
                  </button>
                  <button
                    className="popoverIconButton"
                    onClick={() => rotateSelected(1)}
                    title="Rotate 60° clockwise"
                    type="button"
                  >
                    <DesignerGlyph className="popoverActionGlyph" src={DESIGNER_UI_ICONS.rotate} />
                    <span>{(selected.rotation ?? 0) * 60}°</span>
                  </button>
                </div>

                {/* Center (Ⅵ–Ⅶ) tiles: the big difficulty-7 CENTER HEX — its
                    objective, guard (monster), first-clear reward and Victory
                    Points. Always shown for a center slot; every control is
                    optional and independent. */}
                {selected.group === "center" ? (
                  <div className="popoverViiField popoverSection popoverCenterHex">
                    <div className="popoverSectionLabel">Center (Ⅶ) hex</div>
                    <div className="popoverSubLabel">Objective (multi-select)</div>
                    <small className="popoverHint">
                      Default keeps the printed objective. Toggle Town / Utopia / Grail to allow any of those —
                      with several selected the engine picks randomly (or the discovering player, when
                      &quot;Player picks&quot; is on).
                    </small>
                    <div className="popoverModeRow" role="group" aria-label="Center Ⅶ field">
                      {VII_FIELD_OPTIONS.map((option) => {
                        const multi = selected.viiFields ?? [];
                        const active =
                          option.id === undefined
                            ? !selected.viiField && multi.length === 0
                            : multi.includes(option.id) || selected.viiField === option.id;
                        return (
                          <button
                            aria-pressed={active}
                            className={`popoverFilterChip${active ? " active" : ""}`}
                            key={String(option.id)}
                            onClick={() => {
                              if (option.id === undefined) {
                                updateTile(selectedIndex as number, {
                                  viiField: undefined,
                                  viiFields: undefined,
                                  playerViiPick: undefined
                                });
                                return;
                              }
                              const current = new Set(selected.viiFields ?? (selected.viiField ? [selected.viiField] : []));
                              if (current.has(option.id)) current.delete(option.id);
                              else current.add(option.id);
                              const next = [...current] as Array<"town" | "dragon_utopia" | "grail">;
                              if (next.length === 0) {
                                updateTile(selectedIndex as number, {
                                  viiField: undefined,
                                  viiFields: undefined,
                                  playerViiPick: undefined
                                });
                              } else if (next.length === 1) {
                                updateTile(selectedIndex as number, {
                                  viiField: next[0],
                                  viiFields: undefined,
                                  playerViiPick: undefined
                                });
                              } else {
                                updateTile(selectedIndex as number, {
                                  viiField: undefined,
                                  viiFields: next,
                                  playerViiPick: selected.playerViiPick
                                });
                              }
                            }}
                            title={option.hint}
                            type="button"
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {(selected.viiFields?.length ?? 0) > 1 && selected.faceDown ? (
                      <button
                        aria-pressed={Boolean(selected.playerViiPick)}
                        className={`popoverFilterChip${selected.playerViiPick ? " active" : ""}`}
                        onClick={() =>
                          updateTile(selectedIndex as number, {
                            playerViiPick: selected.playerViiPick ? undefined : true
                          })
                        }
                        title="Discovering player chooses which Ⅶ objective this tile becomes."
                        type="button"
                      >
                        Player picks on reveal
                      </button>
                    ) : null}

                    <div className="popoverSubLabel">Guard (monster)</div>
                    <small className="popoverHint">
                      Replace the printed Ⅶ guard with a Field-Difficulty level or an exact Neutral army.
                    </small>
                    <GuardSpecEditor
                      guard={selected.centerHex?.guard}
                      noneLabel="Printed"
                      onChange={(guard) =>
                        updateTile(selectedIndex as number, {
                          centerHex: nextCenterHex(selected.centerHex, { guard })
                        })
                      }
                    />

                    <div className="popoverSubLabel">First-clear reward &amp; Victory Points</div>
                    <small className="popoverHint">
                      A one-time bonus for the player who first clears this objective, on top of its printed
                      reward. Searches are Times × Search(X) — e.g. 2× Search(5) Artifacts. Victory Points
                      count when Victory-Points scoring is on.
                    </small>
                    <FieldRewardEditor
                      ariaLabel="Center hex reward"
                      reward={selected.centerHex?.reward}
                      onChange={(reward) =>
                        updateTile(selectedIndex as number, {
                          centerHex: nextCenterHex(selected.centerHex, { reward })
                        })
                      }
                      vp={selected.centerHex?.vp}
                      onVpChange={(vp) =>
                        updateTile(selectedIndex as number, {
                          centerHex: nextCenterHex(selected.centerHex, { vp })
                        })
                      }
                    />
                    <label className="popoverCheckRow" title="The first player to clear / capture THIS objective wins the game immediately (in Victory-Points mode the completion scores the table instead).">
                      <input
                        aria-label="First clear of this center hex wins the game"
                        checked={Boolean(selected.centerHex?.winCondition)}
                        onChange={(event) =>
                          updateTile(selectedIndex as number, {
                            centerHex: nextCenterHex(selected.centerHex, {
                              winCondition: event.target.checked || undefined
                            })
                          })
                        }
                        type="checkbox"
                      />
                      <span>🏁 First clear wins the game</span>
                    </label>
                  </div>
                ) : null}

                {/* Per-tile settlement: stronger guard / extra VP / hold-to-win.
                    Complements the map-wide Settlements section in the preset editor.
                    Excludes center tiles — their own hex is customized by the
                    center-hex editor above, whose guard/VP would otherwise clash. */}
                {selected.group !== "sea" && selected.group !== "center" ? (
                  <div className="popoverSettlementPlan popoverSection" aria-label="Special settlement">
                    <div className="popoverSectionLabel">Special settlement (this tile)</div>
                    <small className="popoverHint">
                      Make THIS tile&apos;s settlement matter: a stronger first-flag guard, extra Victory Points,
                      and/or win by holding it for N consecutive rounds. Overrides the map-wide settlement guard for
                      this tile only. Leave blank if the tile has no settlement (the plan stays inert).
                    </small>
                    <div className="popoverSubLabel">Guard (first flag)</div>
                    <GuardSpecEditor
                      guard={selected.settlement?.guard}
                      noneLabel="Map-wide / none"
                      onChange={(guard) =>
                        updateTile(selectedIndex as number, {
                          settlement: nextSettlementPlan(selected.settlement, { guard })
                        })
                      }
                    />
                    <div className="popoverSubLabel">First-flag reward</div>
                    <FieldRewardEditor
                      ariaLabel="Settlement first-flag reward"
                      reward={selected.settlement?.reward}
                      onChange={(reward) =>
                        updateTile(selectedIndex as number, {
                          settlement: nextSettlementPlan(selected.settlement, { reward })
                        })
                      }
                      showVp={false}
                    />
                    <div className="popoverViiRewardRow" role="group" aria-label="Settlement VP and hold">
                      <label className="popoverViiField_num popoverViiVp">
                        <span>Bonus VP</span>
                        <input
                          aria-label="Settlement bonus victory points"
                          max={MAX_SETTLEMENT_VP}
                          min={0}
                          onChange={(event) => {
                            const vp = Math.max(
                              0,
                              Math.min(MAX_SETTLEMENT_VP, Math.floor(Number(event.target.value) || 0))
                            );
                            updateTile(selectedIndex as number, {
                              settlement: nextSettlementPlan(selected.settlement, {
                                vp: vp > 0 ? vp : undefined
                              })
                            });
                          }}
                          type="number"
                          value={selected.settlement?.vp ?? ""}
                        />
                      </label>
                      <label className="popoverViiField_num popoverViiVp">
                        <span>Hold rounds to win</span>
                        <input
                          aria-label="Hold settlement rounds to win"
                          max={MAX_SETTLEMENT_HOLD_ROUNDS}
                          min={0}
                          onChange={(event) => {
                            const rounds = Math.max(
                              0,
                              Math.min(
                                MAX_SETTLEMENT_HOLD_ROUNDS,
                                Math.floor(Number(event.target.value) || 0)
                              )
                            );
                            updateTile(selectedIndex as number, {
                              settlement: nextSettlementPlan(selected.settlement, {
                                holdRoundsToWin: rounds > 0 ? rounds : undefined
                              })
                            });
                          }}
                          type="number"
                          value={selected.settlement?.holdRoundsToWin ?? ""}
                        />
                      </label>
                    </div>
                    <label className="popoverCheckRow" title="The first player to flag THIS settlement wins the game immediately (the instant twin of hold-to-win).">
                      <input
                        aria-label="First flag of this settlement wins the game"
                        checked={Boolean(selected.settlement?.winCondition)}
                        onChange={(event) =>
                          updateTile(selectedIndex as number, {
                            settlement: nextSettlementPlan(selected.settlement, {
                              winCondition: event.target.checked || undefined
                            })
                          })
                        }
                        type="checkbox"
                      />
                      <span>🏁 First flag wins the game</span>
                    </label>
                    {selected.settlement ? (
                      <button
                        className="popoverIconButton"
                        onClick={() =>
                          updateTile(selectedIndex as number, { settlement: undefined })
                        }
                        type="button"
                      >
                        Clear special settlement
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {/* SPECIFIC (per-tile) object plans — obelisk / mine on THIS tile.
                    Shown only when the tile can actually host the object (a
                    face-up def printing it, or a face-down secret landmark
                    guaranteeing a mine), so the popover never bloats with inert
                    sections. A set field OVERRIDES the map-wide config; unset
                    fields fall back to it. */}
                {(["obelisk", "mine"] as const).map((objectKind) =>
                  planEligibleForObjectKind(selected, objectKind) ? (
                    <div
                      className="popoverObjectPlan popoverSection"
                      aria-label={`Special ${objectKind} (this tile)`}
                      data-object-plan={objectKind}
                      key={objectKind}
                    >
                      <div className="popoverSectionLabel">
                        {objectKind === "obelisk" ? "⚱ Obelisk (this tile)" : "⛏ Mine (this tile)"}
                      </div>
                      <small className="popoverHint">
                        Overrides the map-wide {objectKind} setting for THIS tile only — a field you leave
                        unset falls back to the map-wide value.
                      </small>
                      <div className="popoverSubLabel">Guard</div>
                      <GuardSpecEditor
                        guard={selected.objectPlans?.[objectKind]?.guard}
                        noneLabel="Map-wide / printed"
                        onChange={(guard) =>
                          updateTile(selectedIndex as number, {
                            objectPlans: nextObjectPlans(
                              selected.objectPlans,
                              objectKind,
                              nextObjectPlan(selected.objectPlans?.[objectKind], { guard })
                            )
                          })
                        }
                      />
                      <div className="popoverSubLabel">First-clear reward</div>
                      <FieldRewardEditor
                        ariaLabel={`${objectKind} first-clear reward`}
                        reward={selected.objectPlans?.[objectKind]?.reward}
                        onChange={(reward) =>
                          updateTile(selectedIndex as number, {
                            objectPlans: nextObjectPlans(
                              selected.objectPlans,
                              objectKind,
                              nextObjectPlan(selected.objectPlans?.[objectKind], { reward })
                            )
                          })
                        }
                        vp={selected.objectPlans?.[objectKind]?.vp}
                        onVpChange={(vp) =>
                          updateTile(selectedIndex as number, {
                            objectPlans: nextObjectPlans(
                              selected.objectPlans,
                              objectKind,
                              nextObjectPlan(selected.objectPlans?.[objectKind], { vp })
                            )
                          })
                        }
                      />
                      <div className="popoverGuardRow" role="group" aria-label={`${objectKind} break options`}>
                        {(
                          [
                            { key: "breakField", label: "Break field", hint: "Pathfinding may not walk through — must fight to enter." },
                            { key: "persistentGuard", label: "Persistent army", hint: "A lost fight leaves the living guards for a re-fight." },
                            { key: "unlimitedRounds", label: "No round limit", hint: "The fight has no Round limit (bank-style rounds)." }
                          ] as const
                        ).map((flag) => (
                          <label className="popoverCheckRow popoverCheckChip" key={flag.key} title={flag.hint}>
                            <input
                              aria-label={`${objectKind} ${flag.label}`}
                              checked={Boolean(selected.objectPlans?.[objectKind]?.[flag.key])}
                              onChange={(event) =>
                                updateTile(selectedIndex as number, {
                                  objectPlans: nextObjectPlans(
                                    selected.objectPlans,
                                    objectKind,
                                    nextObjectPlan(selected.objectPlans?.[objectKind], {
                                      [flag.key]: event.target.checked || undefined
                                    })
                                  )
                                })
                              }
                              type="checkbox"
                            />
                            <span>{flag.label}</span>
                          </label>
                        ))}
                      </div>
                      <label className="popoverCheckRow" title={`The first player to clear / flag THIS ${objectKind} wins the game immediately.`}>
                        <input
                          aria-label={`First clear of this ${objectKind} wins the game`}
                          checked={Boolean(selected.objectPlans?.[objectKind]?.winCondition)}
                          onChange={(event) =>
                            updateTile(selectedIndex as number, {
                              objectPlans: nextObjectPlans(
                                selected.objectPlans,
                                objectKind,
                                nextObjectPlan(selected.objectPlans?.[objectKind], {
                                  winCondition: event.target.checked || undefined
                                })
                              )
                            })
                          }
                          type="checkbox"
                        />
                        <span>🏁 First clear wins the game</span>
                      </label>
                      {selected.objectPlans?.[objectKind] ? (
                        <button
                          className="popoverIconButton"
                          onClick={() =>
                            updateTile(selectedIndex as number, {
                              objectPlans: nextObjectPlans(selected.objectPlans, objectKind, undefined)
                            })
                          }
                          type="button"
                        >
                          Clear special {objectKind}
                        </button>
                      ) : null}
                    </div>
                  ) : null
                )}

                {/* Monolith/Whirlpool/colored-Gate Location Token on this tile. */}
                {selectedToken ? (
                  <>
                    <small className="popoverHint">
                      {placementTokenLabel(selectedToken)} token on this tile
                      {selected.faceDown
                        ? " — reserved on the exact physical hex shown on the map."
                        : " — it overwrites the chosen field."}
                    </small>
                    {selected.faceDown || selectedTileDef ? (
                      <select
                        aria-label={selected.faceDown ? "Token hex" : "Token field"}
                        className="popoverSelect"
                        onChange={(event) =>
                          updateTile(selectedIndex as number, {
                            tokens: [
                              tileTokenValue(selectedToken.kind, selectedToken.pair, Number(event.target.value)),
                              ...planTokens(selected).slice(1)
                            ],
                            token: undefined
                          })
                        }
                        value={selectedToken.slot ?? ""}
                      >
                        {(selected.faceDown
                          ? [0, 1, 2, 3, 4, 5, 6]
                          : legalTokenSlotsForTileDef(selectedTileDef!, tokenLegalityKind(selectedToken.kind))
                        ).map((slot) => (
                          <option key={slot} value={slot}>
                            {selected.faceDown
                              ? tokenSlotLabel(undefined, slot, selected.rotation ?? 0).replace(" — field", "")
                              : tokenSlotLabel(selected.tileDefId, slot, selected.rotation ?? 0)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <div className="popoverActions">
                      <button
                        onClick={() =>
                          updateTile(selectedIndex as number, {
                            tokens:
                              planTokens(selected).slice(1).length > 0
                                ? planTokens(selected).slice(1)
                                : undefined,
                            token: undefined
                          })
                        }
                        title="Remove the token from this tile"
                        type="button"
                      >
                        <Trash2 size={13} /> Remove the {placementTokenLabel(selectedToken)} token
                      </button>
                    </div>
                  </>
                ) : selectedTokenKinds.length > 0 ? (
                  <div className="popoverActions">
                    {selectedTokenKinds.map((kind) => {
                      const capped = kind === "whirlpool" && tokenCounts.whirlpool >= MAX_WHIRLPOOL_TOKENS;
                      return (
                        <button
                          className="popoverTokenButton"
                          disabled={capped}
                          key={kind}
                          onClick={() => {
                            if (capped) {
                              return;
                            }
                            const token = selected.faceDown
                              ? { kind, slot: 0 }
                              : retargetTokenForDef({ kind }, selected.tileDefId);
                            if (token) {
                              updateTile(selectedIndex as number, { token });
                            }
                          }}
                          title={
                            capped
                              ? `Only ${MAX_WHIRLPOOL_TOKENS} numbered Whirlpool tokens exist — remove one to place it elsewhere.`
                              : kind === "monolith"
                                ? "Two-Way Monolith (land): heroes entering it teleport to another Monolith. At least 2 needed to work."
                                : "Whirlpool (sea): heroes entering it travel to another Whirlpool and lose 1 unit card. At least 2 needed to work; with 3, the Attack die decides."
                          }
                          type="button"
                        >
                          <DesignerGlyph
                            className="popoverTokenGlyph"
                            src={mapTokenImage(kind, kind === "whirlpool" ? 0 : undefined)}
                          />
                          Add a {mapTokenLabel(kind)} token
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* Underground layer override — far/near/center/sea tiles only.
                    Flips the tile onto the cavern layer (gate-only access) while
                    keeping its band content; the gate-link panel below then
                    appears just like a printed cavern's. */}
                {UNDERGROUND_LAYER_GROUPS.has(selected.group) ? (
                  <div className="popoverUnderground">
                    <button
                      aria-pressed={Boolean(selected.underground)}
                      className={`popoverUndergroundToggle${selected.underground ? " active" : ""}`}
                      data-testid="underground-toggle"
                      onClick={toggleUnderground}
                      type="button"
                    >
                      <Layers size={13} />
                      Underground layer
                    </button>
                    <small className="popoverHint">
                      {selected.underground
                        ? "On the Underground layer: reachable only through a Subterranean Gate, like a cavern — but it keeps this band's back art, guards and Creature-Bank pile. Link a Surface tile below to place a gate."
                        : "Surface tile. Turn on to move this band tile onto the Underground layer (cavern topology, same band content)."}
                    </small>
                  </div>
                ) : null}

                {/* Designer Subterranean Gate links — any underground-layer tile
                    (printed cavern OR a far/near/center/sea tile flagged
                    underground below). */}
                {planIsUnderground(selected) ? (
                  <div className="popoverGateLinks">
                    <div className="popoverSectionLabel">Subterranean gate links</div>
                    {selectedCavernSurfaces.length === 0 ? (
                      <small className="popoverHint">
                        Move this cavern so it touches a Surface tile, then link it here to place a Subterranean Gate.
                      </small>
                    ) : (
                      <>
                        <small className="popoverHint">
                          Connect this cavern to any touching Surface tile — link several tiles, or the same tile more than
                          once with <strong>+ Gate</strong>, to give the cavern several gates. Drag a gate token along the
                          shared edge (or use ↻ Move) to place each one exactly.
                        </small>
                        <div className="popoverGateLinkList">
                          {selectedCavernSurfaces.map((surface) => {
                            const surfaceLabel = `${TILE_GROUP_LABELS[surface.group]} @ ${surface.row},${surface.col}`;
                            const linkIndexes = (selected.gateLinks ?? [])
                              .map((link, index) => (sameGridCoord(link.surface, surface) ? index : -1))
                              .filter((index) => index >= 0);
                            if (linkIndexes.length === 0) {
                              return (
                                <div className="popoverGateLinkRow" key={`${surface.row}:${surface.col}`}>
                                  <button
                                    aria-pressed={false}
                                    className="popoverGateLinkToggle"
                                    onClick={() => toggleGateLink(surface)}
                                    title="Connect a Subterranean Gate to this Surface tile"
                                    type="button"
                                  >
                                    Link · {surfaceLabel}
                                  </button>
                                </div>
                              );
                            }
                            const canAddMore = firstFreePairForSurface(surface) !== null;
                            return (
                              <div className="popoverGateLinkSurface" key={`${surface.row}:${surface.col}`}>
                                {linkIndexes.map((linkIndex, ordinal) => (
                                  <div className="popoverGateLinkRowWrap" key={linkIndex}>
                                    <div className="popoverGateLinkRow">
                                      <button
                                        aria-pressed
                                        className="popoverGateLinkToggle linked"
                                        onClick={() => unlinkGateAt(linkIndex)}
                                        title="Remove this designer gate link"
                                        type="button"
                                      >
                                        🔗 Linked · {surfaceLabel}
                                        {linkIndexes.length > 1 ? ` (gate ${ordinal + 1})` : ""}
                                      </button>
                                      <button
                                        className="popoverGateLinkCycle"
                                        onClick={() => cycleGateLinkAt(linkIndex)}
                                        title="Slide this gate to the next legal position along the shared edge"
                                        type="button"
                                      >
                                        ↻ Move
                                      </button>
                                      <button
                                        aria-expanded={gateGuardEditorIndex === linkIndex}
                                        className={`popoverGateLinkCycle popoverGateLinkGuards${
                                          gateGuardEditorIndex === linkIndex ||
                                          selected.gateLinks?.[linkIndex]?.gateGuard ||
                                          selected.gateLinks?.[linkIndex]?.entranceGuard
                                            ? " active"
                                            : ""
                                        }`}
                                        onClick={() =>
                                          setGateGuardEditorIndex(gateGuardEditorIndex === linkIndex ? null : linkIndex)
                                        }
                                        title="Guard either half of this gate — you fight to step onto a guarded half; coming out through the linked half auto-wins."
                                        type="button"
                                      >
                                        ⚔ Guards
                                      </button>
                                    </div>
                                    {gateGuardEditorIndex === linkIndex ? (
                                      <div className="popoverGateLinkGuardEditors">
                                        <div className="popoverSubLabel">Surface half (“gate down”)</div>
                                        <GuardSpecEditor
                                          guard={selected.gateLinks?.[linkIndex]?.gateGuard}
                                          noneLabel="None"
                                          onChange={(guard) => setGateLinkGuard(linkIndex, "gateGuard", guard)}
                                        />
                                        <div className="popoverSubLabel">Cavern half (“path up”)</div>
                                        <GuardSpecEditor
                                          guard={selected.gateLinks?.[linkIndex]?.entranceGuard}
                                          noneLabel="None"
                                          onChange={(guard) => setGateLinkGuard(linkIndex, "entranceGuard", guard)}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                                <button
                                  className="popoverGateLinkAdd"
                                  disabled={!canAddMore}
                                  onClick={() => addGateToSurface(surface)}
                                  title={
                                    canAddMore
                                      ? "Add another Subterranean Gate to this Surface tile"
                                      : "No free boundary position left along this shared edge"
                                  }
                                  type="button"
                                >
                                  + Gate
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}

            {/* Designer yellow borders — deliberate impassable edges, drawn
                edge-by-edge on the board with the 🖌 tool (legal on any group).
                The panel just reports the count and offers a one-click Clear. */}
            <div className="popoverBorders">
              <div className="popoverSectionLabel">Yellow borders (impassable edges)</div>
              <small className="popoverHint">
                Arm the <strong>🖌 Yellow border</strong> tool and draw on the board, edge by edge — click an edge to seal
                it, click again to remove, or drag to paint several. Sealed edges block crossing, discovery and placement
                (only Expert Pathfinding passes) and stay put when the tile is rotated or a face-down slot draws its tile.
              </small>
              <div className="popoverBorderSummary" aria-label="Tile yellow border edges">
                <span>
                  {selectedBorderEdgeCount === 0
                    ? "No border edges yet"
                    : `${selectedBorderEdgeCount} border edge${selectedBorderEdgeCount === 1 ? "" : "s"}`}
                </span>
                {selectedBorderEdgeCount > 0 ? (
                  <button
                    className="popoverBorderClear"
                    onClick={() => updateTile(selectedIndex as number, { borderEdges: undefined, extraBorders: undefined })}
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            <button className="popoverRemove" onClick={() => removeTile(selectedIndex as number)} type="button">
              <Trash2 size={13} /> Remove
            </button>
          </div>
        ) : null}

        {/* Placed-object panel: color, guard picker + delete — docked like the tile panel. */}
        {selectedObject && objectPopoverAt ? (
          <div className="designerPopover designerObjectPopover">
            <header>
              <strong>
                {titleCase(placementTokenLabel(selectedObject))}
                {selectedObject.placement.type === "standalone" ? " · standalone" : ""}
              </strong>
              <button
                aria-label="Close object options"
                className="popoverClose"
                onClick={closeObjectPopover}
                title="Close"
                type="button"
              >
                ✕
              </button>
            </header>
            {selectedObject.kind === "keymaster_tent" ||
            selectedObject.kind === "barrier" ||
            selectedObject.kind === "oneway_entrance" ||
            selectedObject.kind === "oneway_exit" ? (
              <>
                <div className="popoverSectionLabel">Color</div>
                <small className="popoverHint">
                  {selectedObject.kind === "keymaster_tent"
                    ? "A tent flag of this color opens same-color Barriers."
                    : selectedObject.kind === "barrier"
                      ? "Only players holding a same-color Keymaster's Tent flag may enter."
                      : "One-way travel connects entrances and exits of the SAME color only."}
                </small>
                <div className="popoverGuardRow" role="group" aria-label="Outpost color">
                  {GATE_PAIRS.map((pair) => {
                    const active = (selectedObject.pair ?? 1) === pair;
                    return (
                      <button
                        aria-pressed={active}
                        className={`popoverGuardChip popoverColorChip${active ? " active" : ""}`}
                        key={pair}
                        onClick={() =>
                          onObjectsChange?.(
                            objects.map((object, i) =>
                              i === (selectedObjectIndex as number) ? { ...object, pair } : object
                            )
                          )
                        }
                        style={{ borderColor: GATE_PAIR_CSS[pair] }}
                        title={`${titleCase(gatePairColor(pair))}`}
                        type="button"
                      >
                        <span className="designerObjectSwatch" style={{ background: GATE_PAIR_CSS[pair] }} />
                        {titleCase(gatePairColor(pair))}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
            {selectedObject.kind === "oneway_entrance" ||
            selectedObject.kind === "gate" ||
            selectedObject.kind === "monolith" ? (
              <>
                <div className="popoverSectionLabel">Exit pick</div>
                <select
                  aria-label={
                    selectedObject.kind === "oneway_entrance" ? "One-way exit mode" : "Two-way exit mode"
                  }
                  className="popoverSelect"
                  onChange={(event) =>
                    onObjectsChange?.(
                      objects.map((object, i) =>
                        i === (selectedObjectIndex as number)
                          ? { ...object, exitMode: event.target.value as CustomMapObject["exitMode"] }
                          : object
                      )
                    )
                  }
                  value={selectedObject.exitMode ?? "certain"}
                >
                  <option value="certain">Certain — the traveller picks the exit</option>
                  <option value="random">Random — roll the die for the exit</option>
                  <option value="mix">Mix — pick an “always” exit, or roll among the rest</option>
                </select>
              </>
            ) : null}
            {selectedObject.kind === "oneway_exit" ||
            selectedObject.kind === "gate" ||
            selectedObject.kind === "monolith" ? (
              <label className="popoverCheckRow">
                <input
                  checked={selectedObject.alwaysPickable === true}
                  onChange={(event) =>
                    onObjectsChange?.(
                      objects.map((object, i) => {
                        if (i !== (selectedObjectIndex as number)) {
                          return object;
                        }
                        const next = { ...object };
                        if (event.target.checked) {
                          next.alwaysPickable = true;
                        } else {
                          delete next.alwaysPickable;
                        }
                        return next;
                      })
                    )
                  }
                  type="checkbox"
                />
                <span>
                  Always pickable
                  {selectedObject.kind === "oneway_exit"
                    ? " (“mix” entrances offer it before the roll)"
                    : " (in “mix” mode, other network nodes offer this exit before the roll)"}
                </span>
              </label>
            ) : null}
            {selectedObject.kind !== "barrier" && selectedObject.kind !== "oneway_exit" ? (
              <>
                <div className="popoverSectionLabel">Guard (monster)</div>
                <small className="popoverHint">
                  {selectedObject.kind === "garrison" ||
                  selectedObject.kind === "keymaster_tent" ||
                  selectedObject.kind === "oneway_entrance"
                    ? "The fight is bank-style: no Quick Combat, no experience, no round limit."
                    : "A guard on this hex must be beaten to use it; arriving through a teleport network sweeps it aside (auto-win, no experience)."}
                </small>
                <GuardSpecEditor
                  guard={objectGuardDisplay(selectedObject)}
                  noneLabel="None"
                  onChange={(guard) => setObjectGuard(selectedObjectIndex as number, guard)}
                />
              </>
            ) : (
              <small className="popoverHint">
                {selectedObject.kind === "barrier"
                  ? "A Barrier is never guarded — the matching tent flag is the only key."
                  : "An exit monolith is never guarded — only entrances fight."}
              </small>
            )}
            {selectedObject.kind !== "barrier" ? (
              <>
                <div className="popoverSectionLabel">First-clear reward</div>
                <small className="popoverHint">
                  One-time bonus when a hero first successfully visits this hex (after any guard is cleared).
                </small>
                <FieldRewardEditor
                  ariaLabel="Object first-clear reward"
                  reward={selectedObject.reward}
                  onChange={(reward) => patchObject(selectedObjectIndex as number, { reward })}
                  vp={selectedObject.vp}
                  onVpChange={(vp) => patchObject(selectedObjectIndex as number, { vp })}
                />
              </>
            ) : null}
            <button className="popoverRemove" onClick={() => removeObject(selectedObjectIndex as number)} type="button">
              <Trash2 size={13} /> Remove
            </button>
          </div>
        ) : null}

        {/* Tile-carried token panel: which tile, slot picker (face-up), remove —
            docked like the tile / object panels. Clicking a token opens THIS,
            not the giant tile panel underneath it. */}
        {tokenPanelToken && tokenPopoverAt ? (
          <div className="designerPopover designerTokenPopover">
            <header>
              <strong>{placementTokenLabel(tokenPanelToken)} token</strong>
              <button
                aria-label="Close token options"
                className="popoverClose"
                onClick={closeTokenPopover}
                title="Close"
                type="button"
              >
                ✕
              </button>
            </header>
            <small className="popoverHint">
              On the {tokenPanelPlan ? planGroupLabel(tokenPanelPlan) : ""} tile
              {tokenPanelPlan?.tileDefId ? ` (${tokenPanelPlan.tileDefId})` : ""}.
            </small>
            {tokenPanelPlan && (tokenPanelPlan.faceDown || tokenPanelDef) ? (
              <>
                <div className="popoverSectionLabel">{tokenPanelPlan.faceDown ? "Reserved hex" : "Field"}</div>
                <select
                  aria-label={tokenPanelPlan.faceDown ? "Token hex" : "Token field"}
                  className="popoverSelect"
                  onChange={(event) =>
                    updateTile(selectedTokenIndex as number, {
                      tokens: (tokenPanelPlan ? planTokens(tokenPanelPlan) : []).map((token, i) =>
                        i === tokenPanelPin
                          ? tileTokenValue(
                              tokenPanelToken.kind,
                              tokenPanelToken.pair,
                              Number(event.target.value),
                              tokenPanelToken.guard,
                              tokenPanelToken
                            )
                          : token
                      ),
                      token: undefined
                    })
                  }
                  value={tokenPanelToken.slot ?? ""}
                >
                  {(tokenPanelPlan.faceDown
                    ? [0, 1, 2, 3, 4, 5, 6]
                    : legalTokenSlotsForTileDef(tokenPanelDef!, tokenLegalityKind(tokenPanelToken.kind))
                  ).map((slot) => (
                    <option key={slot} value={slot}>
                      {tokenPanelPlan.faceDown
                        ? tokenSlotLabel(undefined, slot, tokenPanelPlan.rotation ?? 0).replace(" — field", "")
                        : tokenSlotLabel(tokenPanelPlan.tileDefId, slot, tokenPanelPlan.rotation ?? 0)}
                    </option>
                  ))}
                </select>
                <small className="popoverHint">
                  {tokenPanelPlan.faceDown
                    ? "The token is shown on this exact map hex. If the revealed field is incompatible, the game offers legal fallback fields."
                    : "Drag the token on the board to move it to another legal slot or tile."}
                </small>
              </>
            ) : (
              <small className="popoverHint">
                Face-down tile — whoever discovers it places the token on a field of their choosing, so its hex
                can&apos;t be set here (or dragged on the board).
              </small>
            )}
            {tokenPanelToken.kind === "oneway_entrance" || tokenPanelToken.kind === "oneway_exit" ? (
              <>
                <div className="popoverSectionLabel">Color</div>
                <div className="popoverGuardRow" role="group" aria-label="One-way color">
                  {GATE_PAIRS.map((pair) => {
                    const active = (tokenPanelToken.pair ?? 1) === pair;
                    return (
                      <button
                        aria-pressed={active}
                        className={`popoverGuardChip popoverColorChip${active ? " active" : ""}`}
                        key={pair}
                        onClick={() =>
                          updateTile(selectedTokenIndex as number, {
                            tokens: (tokenPanelPlan ? planTokens(tokenPanelPlan) : []).map((token, i) =>
                              i === tokenPanelPin
                                ? tileTokenValue(
                                    tokenPanelToken.kind,
                                    pair,
                                    tokenPanelToken.slot,
                                    tokenPanelToken.guard,
                                    tokenPanelToken
                                  )
                                : token
                            ),
                            token: undefined
                          })
                        }
                        style={{ borderColor: GATE_PAIR_CSS[pair] }}
                        title={titleCase(gatePairColor(pair))}
                        type="button"
                      >
                        <span className="designerObjectSwatch" style={{ background: GATE_PAIR_CSS[pair] }} />
                        {titleCase(gatePairColor(pair))}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
            {tokenPanelToken.kind === "oneway_entrance" ||
            tokenPanelToken.kind === "gate" ||
            tokenPanelToken.kind === "monolith" ? (
              <>
                <div className="popoverSectionLabel">Exit pick</div>
                <select
                  aria-label={
                    tokenPanelToken.kind === "oneway_entrance" ? "One-way exit mode" : "Two-way exit mode"
                  }
                  className="popoverSelect"
                  onChange={(event) =>
                    updateTile(selectedTokenIndex as number, {
                      tokens: (tokenPanelPlan ? planTokens(tokenPanelPlan) : []).map((token, i) =>
                        i === tokenPanelPin
                          ? tileTokenValue(tokenPanelToken.kind, tokenPanelToken.pair, tokenPanelToken.slot, tokenPanelToken.guard, {
                              ...tokenPanelToken,
                              exitMode: event.target.value as CustomMapTileToken["exitMode"]
                            })
                          : token
                      ),
                      token: undefined
                    })
                  }
                  value={tokenPanelToken.exitMode ?? "certain"}
                >
                  <option value="certain">Certain — the traveller picks the exit</option>
                  <option value="random">Random — roll the die for the exit</option>
                  <option value="mix">Mix — pick an “always” exit, or roll among the rest</option>
                </select>
              </>
            ) : null}
            {tokenPanelToken.kind === "oneway_exit" ||
            tokenPanelToken.kind === "gate" ||
            tokenPanelToken.kind === "monolith" ? (
              <label className="popoverCheckRow">
                <input
                  checked={tokenPanelToken.alwaysPickable === true}
                  onChange={(event) =>
                    updateTile(selectedTokenIndex as number, {
                      tokens: (tokenPanelPlan ? planTokens(tokenPanelPlan) : []).map((token, i) =>
                        i === tokenPanelPin
                          ? tileTokenValue(
                              tokenPanelToken.kind,
                              tokenPanelToken.pair,
                              tokenPanelToken.slot,
                              tokenPanelToken.kind === "oneway_exit" ? undefined : tokenPanelToken.guard,
                              {
                                ...tokenPanelToken,
                                alwaysPickable: event.target.checked ? true : undefined
                              }
                            )
                          : token
                      ),
                      token: undefined
                    })
                  }
                  type="checkbox"
                />
                <span>
                  Always pickable
                  {tokenPanelToken.kind === "oneway_exit"
                    ? " (“mix” entrances offer it before the roll)"
                    : " (in “mix” mode, other network nodes offer this exit before the roll)"}
                </span>
              </label>
            ) : null}
            {tokenPanelToken.kind !== "oneway_exit" ? (
              <>
                <div className="popoverSectionLabel">Guard (monster)</div>
                <small className="popoverHint">
                  {tokenPanelToken.kind === "oneway_entrance"
                    ? "The fight is bank-style: no Quick Combat, no experience, no round limit; winning teleports."
                    : "A guard on this hex must be beaten to use the teleporter; arriving through the network sweeps it aside (auto-win, no experience)."}
                </small>
                <GuardSpecEditor
                  guard={tokenPanelToken.guard}
                  noneLabel="None"
                  onChange={(guard) =>
                    updateTile(selectedTokenIndex as number, {
                      tokens: (tokenPanelPlan ? planTokens(tokenPanelPlan) : []).map((token, i) =>
                        i === tokenPanelPin
                          ? tileTokenValue(tokenPanelToken.kind, tokenPanelToken.pair, tokenPanelToken.slot, guard, tokenPanelToken)
                          : token
                      ),
                      token: undefined
                    })
                  }
                />
              </>
            ) : (
              <small className="popoverHint">An exit monolith is never guarded — only entrances fight.</small>
            )}
            <div className="popoverSectionLabel">First-clear reward</div>
            <small className="popoverHint">
              One-time bonus when a hero first successfully visits this token hex (after any guard is cleared).
            </small>
            <FieldRewardEditor
              ariaLabel="Token first-clear reward"
              reward={tokenPanelToken.reward}
              onChange={(reward) =>
                updateTile(selectedTokenIndex as number, {
                  tokens: (tokenPanelPlan ? planTokens(tokenPanelPlan) : []).map((token, i) =>
                    i === tokenPanelPin
                      ? tileTokenValue(
                          tokenPanelToken.kind,
                          tokenPanelToken.pair,
                          tokenPanelToken.slot,
                          tokenPanelToken.kind === "oneway_exit" ? undefined : tokenPanelToken.guard,
                          { ...tokenPanelToken, reward }
                        )
                      : token
                  ),
                  token: undefined
                })
              }
              vp={tokenPanelToken.vp}
              onVpChange={(vp) =>
                updateTile(selectedTokenIndex as number, {
                  tokens: (tokenPanelPlan ? planTokens(tokenPanelPlan) : []).map((token, i) =>
                    i === tokenPanelPin
                      ? tileTokenValue(
                          tokenPanelToken.kind,
                          tokenPanelToken.pair,
                          tokenPanelToken.slot,
                          tokenPanelToken.kind === "oneway_exit" ? undefined : tokenPanelToken.guard,
                          { ...tokenPanelToken, vp }
                        )
                      : token
                  ),
                  token: undefined
                })
              }
            />
            <button
              className="popoverRemove"
              onClick={() => {
                const rest = (tokenPanelPlan ? planTokens(tokenPanelPlan) : []).filter(
                  (_, i) => i !== tokenPanelPin
                );
                updateTile(selectedTokenIndex as number, {
                  tokens: rest.length > 0 ? rest : undefined,
                  token: undefined
                });
                closeTokenPopover();
              }}
              type="button"
            >
              <Trash2 size={13} /> Remove the {placementTokenLabel(tokenPanelToken)} token
            </button>
          </div>
        ) : null}
      </div>

      {victoryConflicts.map((conflict, index) => (
        <div className="designerCavernAlert designerVictoryConflict" key={`victory-conflict-${index}`} role="alert">
          <DesignerGlyph className="designerAlertGlyph" src={REWARD_GLYPH_ICONS.conflict} /> {conflict}
        </div>
      ))}
      {showVictoryAllClear ? (
        <div className="designerCavernAlert designerVictoryOk" role="status">
          <DesignerGlyph className="designerAlertGlyph" src={REWARD_GLYPH_ICONS.ok} /> This design supports the chosen
          win condition — its objective tiles are all in place.
        </div>
      ) : null}
      {objectValidation.problems.map((problem, index) => (
        <div className="designerCavernAlert designerObjectAlert" key={`obj-problem-${index}`} role="alert">
          ⚠ {problem}
        </div>
      ))}
      {objectValidation.warnings.map((warning, index) => (
        <div className="designerCavernAlert designerObjectAlert" key={`obj-warning-${index}`} role="status">
          ⚠ {warning}
        </div>
      ))}

      {unreachableCaverns.length > 0 ? (
        <div className="designerCavernAlert" role="alert">
          ⚠ {unreachableCaverns.length} Underground tile{unreachableCaverns.length > 1 ? "s have" : " has"} no Subterranean
          Gate — heroes can never reach {unreachableCaverns.length > 1 ? "them" : "it"}. Move each red-ringed cavern so it
          touches a Surface tile (or a cavern that already has a gate); a gold gate token appears as soon as it connects.
        </div>
      ) : null}

      {tokenCounts.monolith === 1 ? (
        <div className="designerCavernAlert" role="alert">
          ⚠ Only 1 Monolith token is placed — Monoliths need at least 2 on the map to work. A lone Monolith leads
          nowhere; add a second one (on another tile) to open the teleport route.
        </div>
      ) : null}
      {tokenCounts.whirlpool === 1 ? (
        <div className="designerCavernAlert" role="alert">
          ⚠ Only 1 Whirlpool token is placed — Whirlpools need at least 2 on the map to work. A lone Whirlpool leads
          nowhere; add a second one (on another sea tile) to open the travel route.
        </div>
      ) : null}

      <details className="designerHelp">
        <summary className="designerHelpSummary">How the designer works</summary>
      <small className="optionHint">
        Drag a tile from the palette onto the board, then <strong>click it</strong> to configure: choose{" "}
        <strong>Random</strong> (pool draw), <strong>Secret</strong> (landmark filter — mines, obelisks, … stay hidden
        until discovery), or <strong>Face-up</strong> (visible from the start), then click a tile card. Filter chips
        (Mine, Obelisk, …) narrow the grid. <strong>Underground</strong> tiles need a Subterranean Gate (auto when
        touching Surface). Add <strong>Monolith</strong> / <strong>Whirlpool</strong> tokens from the same panel — at
        least 2 of a kind to work; once placed, <strong>drag a token to move it</strong> to any compatible tile —
        face-up or face-down, in any combination (a face-down tile is one whole-footprint drop zone; its exact hex is
        picked at discovery) — or <strong>click it</strong> for its slot / remove options. A centre tile can force its{" "}
        <strong>Ⅶ objective field</strong> (Town / Grail /
        Utopia, shown as a badge). Drag a cavern to touch a Surface tile and its <strong>Subterranean Gate</strong>{" "}
        appears — then <strong>drag any gate token</strong> along the shared edge to pin its exact spot (or click it for
        link options, and use <strong>↻</strong> to slide it). Arm <strong>🖌 Yellow border</strong> in the Objects
        palette, then click a tile&apos;s{" "}
        <strong>edge hexes</strong> to paint impassable borders (or use the edge chips in the tile panel), and{" "}
        <strong>lock</strong> a starting tile&apos;s orientation so it never opens with a rotation. The{" "}
        <strong>Objects</strong> palette drops
        standalone one-hex pieces — four colored <strong>Gate</strong> pairs and designer-guarded objects;{" "}
        <strong>drag a placed object</strong> (either half of a Gate pair) to move it, or click it for guard / remove.
        Town (Ⅰ) tiles are seats; drag empty background to pan, pinch or use the toolbar to zoom (wheel zoom when
        unlocked).
      </small>
      </details>

      {/* Floating drag ghost follows the pointer — band-correct printed back. */}
      {drag ? (
        <div className="designerDragGhost" style={{ left: drag.clientX, top: drag.clientY }}>
          <span
            className="paletteThumb large"
            style={{
              backgroundImage: `url(${assetUrl(
                planBackArt({ group: drag.group, seaBand: drag.seaBand, subBand: drag.subBand })
              )})`
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
