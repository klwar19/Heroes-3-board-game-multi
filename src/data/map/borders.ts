import type { TileDefinition } from "./types";

/**
 * One printed yellow border line: a hex edge of the tile, identified by the
 * field slot that carries it and the edge's local direction (0-5 = NE, E,
 * SE, SW, W, NW before the tile rotates). Rendering rotates both the slot's
 * position and the edge direction together with the tile.
 */
export type TileBorderSegment = {
  slot: number;
  edge: number;
};

/**
 * All printed yellow border lines of a tile, scan-verified layout:
 *
 * - every direction marked in `outerImpassable` carries the line on all
 *   three outer edges of its ring field (full arcs — verified on every
 *   core/Rampart/Inferno tile scan),
 * - every blocked field is ringed completely (its three outer edges plus
 *   the three edges shared with the center/ring neighbours),
 * - explicit `internalBorders` pairs add lines between two passable fields
 *   (none exist in the core box; expansion tiles may declare them).
 *
 * A Blocked Field carved into a Creature Bank (its slot listed in `bankSlots`)
 * is the one exception: a bank can be walked INTO from within its own Tile and
 * only seals OUTWARD (you cannot cross a Tile edge to it — enforced in
 * canCrossEdge). So a bank slot draws just its OUTER arc, never the inner walls
 * shared with the centre/ring neighbours, or the field would look completely
 * sealed off and the player would think they could not get in.
 */
const NO_BANK_SLOTS: ReadonlySet<number> = new Set();

export function getTileBorderSegments(
  def: TileDefinition,
  bankSlots: ReadonlySet<number> = NO_BANK_SLOTS
): TileBorderSegment[] {
  const segments = new Map<string, TileBorderSegment>();
  const add = (slot: number, edge: number) => {
    const normalized = ((edge % 6) + 6) % 6;
    segments.set(`${slot}:${normalized}`, { slot, edge: normalized });
  };

  // Outer impassable arcs: ring slot d+1 exposes edges d-1, d, d+1.
  def.outerImpassable.forEach((impassable, direction) => {
    if (!impassable) {
      return;
    }
    const slot = direction + 1;
    add(slot, direction - 1);
    add(slot, direction);
    add(slot, direction + 1);
  });

  // Blocked fields are ringed completely — except a bank, which is open inward.
  def.fields.forEach((field, slot) => {
    if (field.location !== "blocked_field") {
      return;
    }
    const isBank = bankSlots.has(slot);

    if (slot === 0) {
      // A centre bank is reachable from every ring neighbour: no walls at all.
      if (isBank) {
        return;
      }
      for (let edge = 0; edge < 6; edge += 1) {
        add(0, edge);
      }
      return;
    }

    const direction = slot - 1;
    add(slot, direction - 1);
    add(slot, direction);
    add(slot, direction + 1);
    // The three edges shared with the centre and both ring neighbours — drawn
    // for a plain blocked field, but left OPEN for a bank you walk in through.
    if (isBank) {
      return;
    }
    add(slot, direction + 3);
    add(slot, direction + 2);
    add(slot, direction + 4);
  });

  // Explicit internal borders between passable fields.
  for (const [a, b] of def.internalBorders ?? []) {
    const segment = internalBorderSegment(a, b);
    if (segment) {
      add(segment.slot, segment.edge);
    }
  }

  return [...segments.values()];
}

/**
 * The hex edge between two tile slots, or null when the slots do not touch.
 * Center-to-ring pairs sit on the center hex; ring-to-ring pairs sit on the
 * lower slot's hex.
 */
export function internalBorderSegment(a: number, b: number): TileBorderSegment | null {
  const [low, high] = a < b ? [a, b] : [b, a];

  if (low === 0) {
    if (high < 1 || high > 6) {
      return null;
    }
    return { slot: 0, edge: high - 1 };
  }

  const lowDirection = low - 1;
  const highDirection = high - 1;
  if ((lowDirection + 1) % 6 === highDirection) {
    // Neighbouring ring slots: the edge faces two directions onward.
    return { slot: low, edge: (lowDirection + 2) % 6 };
  }
  if ((highDirection + 1) % 6 === lowDirection) {
    return { slot: high, edge: (highDirection + 2) % 6 };
  }

  return null;
}

/** Whether a printed line blocks movement between two slots of one tile. */
export function hasInternalBorder(def: TileDefinition, slotA: number, slotB: number): boolean {
  return (def.internalBorders ?? []).some(
    ([a, b]) => (a === slotA && b === slotB) || (a === slotB && b === slotA)
  );
}
