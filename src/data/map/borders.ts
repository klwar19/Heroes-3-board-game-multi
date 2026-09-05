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
 * is one exception, and a runtime object carved over a field (`borderlessSlots`
 * — the Calamity / Dungeon Gates and every Field Override) follows the same
 * rule.
 *
 * USER RULE 2026-09-05 — "Bank: should respect the border. Only remove the
 * INSIDE border to get in. If there is no border outside, don't add a border."
 * So a carve drops ONLY the inside half of the printed ring (the three edges it
 * shares with the host tile's own fields, plus every printed line a neighbouring
 * slot drew toward it), and KEEPS the slot's printed OUTER ARC whenever the tile
 * really prints one (`outerImpassable[slot - 1]`) — drawn here and sealing
 * movement / discovery at `isOuterEdgeSealed`. A slot with no printed arc gets
 * none invented: its three outward edges vanish with the ring.
 *
 * USER RULE 2026-08-22 — the suppression covers the PRINTED art only (the
 * blocked-field ring's inner half, `internalBorders`). A FIXED yellow border the
 * map DESIGNER drew (`extraBorders` whole arcs, `borderEdges` per-edge lines)
 * survives a carve and is still painted: the bank removes the tile's own printed
 * ring, never a deliberate wall. Movement agrees at the same seams
 * (`isDesignedEdgeSealedBetween` / `outerEdgeSealsCrossing`), so a drawn line is
 * always a real wall and an undrawn one is never an invisible wall.
 */
const NO_BORDER_SLOTS: ReadonlySet<number> = new Set();

export function getTileBorderSegments(
  def: TileDefinition,
  bankSlots: ReadonlySet<number> = NO_BORDER_SLOTS,
  options: {
    extraBorders?: readonly number[];
    borderEdges?: readonly number[];
    rotation?: number;
    /**
     * Runtime objects that replace a printed field hide every PRINTED border
     * touching that field. Designer-added arcs / per-edge lines survive (USER
     * RULE 2026-08-22).
     */
    borderlessSlots?: ReadonlySet<number>;
  } = {}
): TileBorderSegment[] {
  // Printed art (suppressible by a carve) and FIXED lines that survive a carve
  // — DESIGNER-drawn arcs / edges, plus a carved slot's own printed OUTER ARC —
  // are collected separately so the carve can drop one without the other.
  const segments = new Map<string, TileBorderSegment>();
  const designed = new Map<string, TileBorderSegment>();
  const borderlessSlots = options.borderlessSlots ?? NO_BORDER_SLOTS;
  const suppressedSlots = new Set<number>([...bankSlots, ...borderlessSlots]);
  const add = (slot: number, edge: number) => {
    const normalized = ((edge % 6) + 6) % 6;
    segments.set(`${slot}:${normalized}`, { slot, edge: normalized });
  };
  const addDesigned = (slot: number, edge: number) => {
    const normalized = ((edge % 6) + 6) % 6;
    designed.set(`${slot}:${normalized}`, { slot, edge: normalized });
  };

  // Outer impassable arcs: ring slot d+1 exposes edges d-1, d, d+1.
  def.outerImpassable.forEach((impassable, direction) => {
    if (!impassable) {
      return;
    }
    const slot = direction + 1;
    // USER RULE 2026-09-05: a carve keeps the tile's PRINTED outer arc — only
    // the ring's inside half is opened, so a hero enters from the host tile and
    // the map's outer wall stays a wall. Emitted through `addDesigned` so the
    // adjacency suppression pass below (which drops every printed line touching
    // the carved hex) cannot erase it again.
    const retained = suppressedSlots.has(slot);
    const emit = retained ? addDesigned : add;
    emit(slot, direction - 1);
    emit(slot, direction);
    emit(slot, direction + 1);
  });

  // Blocked fields are ringed completely — except a placed bank / carved object.
  def.fields.forEach((field, slot) => {
    if (field.location !== "blocked_field") {
      return;
    }
    if (suppressedSlots.has(slot)) {
      return;
    }

    if (slot === 0) {
      for (let edge = 0; edge < 6; edge += 1) {
        add(0, edge);
      }
      return;
    }

    const direction = slot - 1;
    add(slot, direction - 1);
    add(slot, direction);
    add(slot, direction + 1);
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

  // Designer-placed yellow borders: ABSOLUTE board directions (0-5) that seal a
  // ring slot's outer arc independent of the printed art. Segments are emitted
  // in the tile's LOCAL frame (like every other arc above), so the consumer that
  // re-applies `rotation` at draw time lands the arc back on the absolute
  // direction — meaning a designed border stays put while the tile is rotated.
  // Converting absolute → local: local = absolute − rotation, and the ring slot
  // facing local direction d is d+1, exposing edges d-1, d, d+1 (identical shape
  // to an `outerImpassable` arc, so it renders with the same styling class).
  const rotation = options.rotation ?? 0;
  for (const absolute of options.extraBorders ?? []) {
    if (!Number.isInteger(absolute) || absolute < 0 || absolute > 5) {
      continue;
    }
    const local = (((absolute - rotation) % 6) + 6) % 6;
    const slot = local + 1;
    addDesigned(slot, local - 1);
    addDesigned(slot, local);
    addDesigned(slot, local + 1);
  }

  // Designer-placed PER-EDGE yellow borders: each entry codes ONE hex edge as
  // `footprintIndex*6 + absoluteDirection` in the rotation-0 board frame. Emit it
  // in the tile's LOCAL frame (like the arcs above) so the consumer that re-adds
  // `rotation` at draw time lands the line back on the coded ABSOLUTE edge —
  // meaning a designed edge stays put while the tile rotates. The centre is
  // footprintIndex 0 → slot 0; a ring footprintIndex f → local slot
  // ((f-1-rotation) mod 6)+1. Deduped against the designer arcs above (a legacy
  // arc and an edge code can name the same line) by the shared `designed` map,
  // and against a printed twin by the merge below.
  for (const code of options.borderEdges ?? []) {
    if (!Number.isInteger(code) || code < 0 || code > 41) {
      continue;
    }
    const footprintIndex = Math.floor(code / 6);
    const absolute = code % 6;
    const slot = footprintIndex === 0 ? 0 : (((footprintIndex - 1 - rotation) % 6) + 6) % 6 + 1;
    const edge = (((absolute - rotation) % 6) + 6) % 6;
    addDesigned(slot, edge);
  }

  // The PRINTED art around a carved hex is filtered by physical adjacency, not
  // only by the segment's owning slot, so a bank / Dungeon Gate truly loses the
  // whole INSIDE half of the printed ring on all the surrounding lines. DESIGNER
  // lines — and the carve's RETAINED printed outer arc (USER RULE 2026-09-05) —
  // are appended unfiltered (USER RULE 2026-08-22: a fixed yellow border is
  // never removed, not even by a bank), deduped against a printed twin by the
  // shared key.
  const kept = new Map<string, TileBorderSegment>();
  for (const [key, segment] of segments) {
    if (!segmentTouchesSuppressedSlot(segment, suppressedSlots)) {
      kept.set(key, segment);
    }
  }
  for (const [key, segment] of designed) {
    kept.set(key, segment);
  }
  return [...kept.values()];
}

function segmentTouchesSuppressedSlot(
  segment: TileBorderSegment,
  suppressedSlots: ReadonlySet<number>
): boolean {
  if (suppressedSlots.has(segment.slot)) {
    return true;
  }
  if (segment.slot === 0) {
    return suppressedSlots.has(segment.edge + 1);
  }

  const direction = segment.slot - 1;
  const edge = ((segment.edge % 6) + 6) % 6;
  if (edge === (direction + 3) % 6) {
    return suppressedSlots.has(0);
  }
  if (edge === (direction + 2) % 6) {
    return suppressedSlots.has((segment.slot % 6) + 1);
  }
  if (edge === (direction + 4) % 6) {
    return suppressedSlots.has(((segment.slot + 4) % 6) + 1);
  }
  return false;
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
