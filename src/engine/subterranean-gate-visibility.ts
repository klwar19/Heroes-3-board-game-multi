import { getTileFootprintSpaceIds, tileLayer } from "./adventure";
import type { AdventureState, MapSpaceId } from "./state";

/**
 * Which half of a Subterranean Gate link a marker sits on: the Surface "gate"
 * (a path DOWN into the Underground) or the cavern "entrance" (a path UP).
 * These are the same two words {@link SubterraneanGateChoiceCandidate.role}
 * uses, so a plan slot and a marker never disagree.
 */
export type SubterraneanGateMarkerRole = "gate" | "entrance";

/**
 * One legible, always-visible map marker for ONE half of a Subterranean Gate.
 * Both halves of a link carry the SAME {@link label}, which is what makes the
 * pairing readable at a glance the way the coloured Teleport-Gate networks are.
 *
 * PRIVACY: a marker is only ever produced for a hex on a REVEALED (materialized)
 * tile, and `partnerSpaceId` is filled only when the partner half is itself
 * known. A link whose other tile is still face down therefore exposes its own,
 * already-public half and nothing about the hidden tile beyond the fact the
 * carved gate field itself already states (`gateToTileId` is public state a
 * player standing on the hex reads anyway).
 */
export type SubterraneanGateMarker = {
  spaceId: MapSpaceId;
  /** Shared pairing label ("A", "B", …). Both halves of one link carry it. */
  label: string;
  role: SubterraneanGateMarkerRole;
  /** "down" on the Surface half, "up" on the cavern half. */
  direction: "down" | "up";
  /** True for a real carved gate field; false for a still-uncarved planned hex. */
  carved: boolean;
  surfaceTileId: string;
  undergroundTileId: string;
  /** The tile on the OTHER layer this half bridges to. */
  partnerTileId: string;
  /** The partner half's hex — only when that half is known (never a leak). */
  partnerSpaceId?: MapSpaceId;
  /** Hover text naming the direction and the pairing. */
  tooltip: string;
};

/** A→Z, then A2/B2… so a map with more than 26 gates still pairs readably. */
function gateLabel(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  const cycle = Math.floor(index / 26);
  return cycle === 0 ? letter : `${letter}${cycle + 1}`;
}

type Half = {
  spaceId: MapSpaceId;
  role: SubterraneanGateMarkerRole;
  carved: boolean;
};

type Link = {
  key: string;
  surfaceTileId: string;
  undergroundTileId: string;
  halves: Half[];
};

/**
 * Every Subterranean Gate half a player is entitled to see, paired.
 *
 * Two sources, deliberately no more:
 * 1. CARVED gate fields (`location === "subterranean_gate"`), which only exist
 *    on revealed tiles — including the "anchor" half carved while its partner
 *    tile is still face down.
 * 2. {@link AdventureState.gatePlans} hexes that are pinned but not carved yet,
 *    and only where the hex has a materialized field (i.e. its own tile is
 *    revealed). A designer link seeded with NO hex contributes nothing, which is
 *    the honest limit: the position is not decided until the tile is revealed.
 *
 * Labels are assigned in a deterministic (sorted key) order so both halves of a
 * link agree and the labels are stable across clients and re-renders.
 */
export function subterraneanGateMarkers(
  adventure: AdventureState | undefined | null
): SubterraneanGateMarker[] {
  if (!adventure) {
    return [];
  }
  const links = new Map<string, Link>();
  const addHalf = (surfaceTileId: string, undergroundTileId: string, half: Half): void => {
    const key = `${surfaceTileId}|${undergroundTileId}`;
    const link = links.get(key) ?? { key, surfaceTileId, undergroundTileId, halves: [] };
    if (!link.halves.some((existing) => existing.spaceId === half.spaceId)) {
      link.halves.push(half);
    }
    links.set(key, link);
  };

  const carved = new Set<MapSpaceId>();
  // 1. Carved gate fields, found through their host tile (a field carries no
  //    tile id, so the footprint is what says which layer the half is on).
  for (const tile of Object.values(adventure.tiles ?? {})) {
    const hostIsUnderground = tileLayer(tile) === "subterranean";
    for (const spaceId of getTileFootprintSpaceIds(tile)) {
      const field = adventure.fields?.[spaceId];
      if (field?.location !== "subterranean_gate" || !field.gateToTileId) {
        continue;
      }
      carved.add(spaceId);
      addHalf(
        hostIsUnderground ? field.gateToTileId : tile.id,
        hostIsUnderground ? tile.id : field.gateToTileId,
        { spaceId, role: hostIsUnderground ? "entrance" : "gate", carved: true }
      );
    }
  }

  // 2. Planned-but-uncarved halves whose hex is already pinned on a revealed tile.
  for (const plan of adventure.gatePlans ?? []) {
    for (const [hex, role] of [
      [plan.gateHex, "gate"] as const,
      [plan.entranceHex, "entrance"] as const
    ]) {
      if (!hex || carved.has(hex) || !adventure.fields?.[hex]) {
        continue;
      }
      addHalf(plan.surfaceTileId, plan.undergroundTileId, { spaceId: hex, role, carved: false });
    }
  }

  const ordered = [...links.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const markers: SubterraneanGateMarker[] = [];
  ordered.forEach((link, index) => {
    const label = gateLabel(index);
    for (const half of link.halves) {
      const partner = link.halves.find((other) => other.spaceId !== half.spaceId);
      const down = half.role === "gate";
      const partnerTileId = down ? link.undergroundTileId : link.surfaceTileId;
      const where = down
        ? "path DOWN into the Underground"
        : "path UP to the Surface";
      const pairing = partner
        ? `its twin (Gate ${label}) is the linked half on the other layer`
        : "the linked tile is still face down, so its twin half is not placed yet";
      markers.push({
        spaceId: half.spaceId,
        label,
        role: half.role,
        direction: down ? "down" : "up",
        carved: half.carved,
        surfaceTileId: link.surfaceTileId,
        undergroundTileId: link.undergroundTileId,
        partnerTileId,
        ...(partner ? { partnerSpaceId: partner.spaceId } : {}),
        tooltip: `Subterranean Gate ${label} — ${where}; ${pairing}${
          half.carved ? "" : " (opens once this tile's gate is carved)"
        }`
      });
    }
  });
  return markers;
}

/** {@link subterraneanGateMarkers} keyed by hex, for a per-field render lookup. */
export function subterraneanGateMarkersBySpace(
  adventure: AdventureState | undefined | null
): Map<MapSpaceId, SubterraneanGateMarker> {
  return new Map(subterraneanGateMarkers(adventure).map((marker) => [marker.spaceId, marker]));
}
