/**
 * Multi hex placements on one map tile — tokens + Field Overrides may share a
 * tile when each occupies a **different** slot (0–6). Never stacked.
 *
 * Normalizes legacy singular `token` / `fieldOverride` into arrays.
 */

import type { CustomMapTilePlan, MapTileState } from "./state";

export type TileTokenPin = NonNullable<CustomMapTilePlan["token"]>;
export type TileFieldOverridePin = NonNullable<CustomMapTilePlan["fieldOverride"]>;

const MAX_HEX_PLACEMENTS_PER_TILE = 7; // one per flower hex

/** All token pins on a plan (legacy singular folded in). */
export function planTokens(plan: Pick<CustomMapTilePlan, "token" | "tokens">): TileTokenPin[] {
  const list: TileTokenPin[] = [];
  if (Array.isArray(plan.tokens)) {
    for (const t of plan.tokens) {
      if (
        t &&
        (t.kind === "monolith" ||
          t.kind === "whirlpool" ||
          t.kind === "gate" ||
          t.kind === "oneway_entrance" ||
          t.kind === "oneway_exit")
      ) {
        list.push(t);
      }
    }
  }
  if (plan.token) {
    // Legacy: only add if not already present (same kind+slot+pair).
    const key = tokenKey(plan.token);
    if (!list.some((t) => tokenKey(t) === key)) {
      list.unshift(plan.token);
    }
  }
  return list.slice(0, MAX_HEX_PLACEMENTS_PER_TILE);
}

/** All Field Override pins on a plan (legacy singular folded in). */
export function planFieldOverrides(
  plan: Pick<CustomMapTilePlan, "fieldOverride" | "fieldOverrides">
): TileFieldOverridePin[] {
  const list: TileFieldOverridePin[] = [];
  if (Array.isArray(plan.fieldOverrides)) {
    for (const o of plan.fieldOverrides) {
      if (o && typeof o.kind === "string" && o.kind.length > 0) {
        list.push(o);
      }
    }
  }
  if (plan.fieldOverride?.kind) {
    const key = overrideKey(plan.fieldOverride);
    if (!list.some((o) => overrideKey(o) === key)) {
      list.unshift(plan.fieldOverride);
    }
  }
  return list.slice(0, MAX_HEX_PLACEMENTS_PER_TILE);
}

function tokenKey(t: TileTokenPin): string {
  return `${t.kind}:${t.pair ?? ""}:${t.slot ?? ""}`;
}

function overrideKey(o: TileFieldOverridePin): string {
  return `${o.kind}:${o.slot ?? ""}`;
}

/**
 * Slots already claimed on a plan (tokens + field overrides with a defined slot).
 * Entries without a slot do not claim a hex until assigned.
 */
export function occupiedSlotsOnPlan(plan: CustomMapTilePlan): Set<number> {
  const occupied = new Set<number>();
  for (const t of planTokens(plan)) {
    if (typeof t.slot === "number" && t.slot >= 0 && t.slot <= 6) {
      occupied.add(t.slot);
    }
  }
  for (const o of planFieldOverrides(plan)) {
    if (typeof o.slot === "number" && o.slot >= 0 && o.slot <= 6) {
      occupied.add(o.slot);
    }
  }
  return occupied;
}

/**
 * Drop placements that share a slot (keep first wins). Returns cleaned plan
 * fields for tokens / fieldOverrides (arrays only; singular cleared).
 */
export function dedupePlanHexPlacements(plan: CustomMapTilePlan): {
  tokens?: TileTokenPin[];
  fieldOverrides?: TileFieldOverridePin[];
  problems: string[];
} {
  const problems: string[] = [];
  const occupied = new Set<number>();
  const tokens: TileTokenPin[] = [];
  for (const t of planTokens(plan)) {
    if (typeof t.slot === "number") {
      if (occupied.has(t.slot)) {
        problems.push(
          `Tile ${plan.row},${plan.col}: dropped stacked ${t.kind} on slot ${t.slot} (hex already occupied).`
        );
        continue;
      }
      occupied.add(t.slot);
    }
    tokens.push(t);
  }
  const fieldOverrides: TileFieldOverridePin[] = [];
  for (const o of planFieldOverrides(plan)) {
    if (typeof o.slot === "number") {
      if (occupied.has(o.slot)) {
        problems.push(
          `Tile ${plan.row},${plan.col}: dropped stacked Field Override "${o.kind}" on slot ${o.slot} (hex already occupied).`
        );
        continue;
      }
      occupied.add(o.slot);
    }
    fieldOverrides.push(o);
  }
  return {
    ...(tokens.length > 0 ? { tokens } : {}),
    ...(fieldOverrides.length > 0 ? { fieldOverrides } : {}),
    problems
  };
}

/** Write form for designer: multi arrays, no legacy singular. */
export function withPlanTokens(plan: CustomMapTilePlan, tokens: TileTokenPin[]): CustomMapTilePlan {
  const next: CustomMapTilePlan = { ...plan };
  delete next.token;
  if (tokens.length === 0) {
    delete next.tokens;
  } else {
    next.tokens = tokens;
  }
  return next;
}

export function withPlanFieldOverrides(
  plan: CustomMapTilePlan,
  fieldOverrides: TileFieldOverridePin[]
): CustomMapTilePlan {
  const next: CustomMapTilePlan = { ...plan };
  delete next.fieldOverride;
  if (fieldOverrides.length === 0) {
    delete next.fieldOverrides;
  } else {
    next.fieldOverrides = fieldOverrides;
  }
  return next;
}

/** First free slot 0–6 not in occupied, or null if full. */
export function firstFreeSlot(occupied: Set<number>): number | null {
  for (let s = 0; s <= 6; s++) {
    if (!occupied.has(s)) {
      return s;
    }
  }
  return null;
}

/** Normalize runtime pending FO list (legacy singular). */
export function tilePendingFieldOverrides(
  tile: Pick<MapTileState, "pendingFieldOverride" | "pendingFieldOverrides">
): NonNullable<MapTileState["pendingFieldOverrides"]> {
  const list = [...(tile.pendingFieldOverrides ?? [])];
  if (tile.pendingFieldOverride) {
    const k = `${tile.pendingFieldOverride.kind}:${tile.pendingFieldOverride.preferredSpaceId ?? ""}`;
    if (!list.some((p) => `${p.kind}:${p.preferredSpaceId ?? ""}` === k)) {
      list.unshift(tile.pendingFieldOverride);
    }
  }
  return list;
}

export function tilePendingTokens(
  tile: Pick<MapTileState, "pendingToken" | "pendingTokens">
): NonNullable<MapTileState["pendingTokens"]> {
  const list = [...(tile.pendingTokens ?? [])];
  if (tile.pendingToken) {
    const k = `${tile.pendingToken.kind}:${tile.pendingToken.pair ?? ""}:${tile.pendingToken.preferredSpaceId ?? ""}`;
    if (
      !list.some(
        (p) => `${p.kind}:${p.pair ?? ""}:${p.preferredSpaceId ?? ""}` === k
      )
    ) {
      list.unshift(tile.pendingToken);
    }
  }
  return list;
}

export { MAX_HEX_PLACEMENTS_PER_TILE };
