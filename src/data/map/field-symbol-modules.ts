/**
 * Modular field-symbol icons attached on top of atmosphere tile art that has
 * no baked HoMM3 icons (anime / designed tiles with `assets.attachFieldSymbols`).
 *
 * Each module is a small transparent webp used by the map overlay — never
 * regenerate a whole starting tile just to stamp these.
 */
import type { ResourceKind } from "@/engine/state";

/** Free resource pickup — cream board-print tools (matches treasure/I gold). */
export const FIELD_SYMBOL_RESOURCE = "/assets/glyphs/resource-yellow.svg";

/** Treasure chest glyph (printed cream chest on core tiles). */
export const FIELD_SYMBOL_TREASURE = "/assets/ui/icon-treasure-chest-glyph.webp";

/** Mine income icon by resource (printed mine buildings use ↻N + pile). */
export const FIELD_SYMBOL_MINE: Record<ResourceKind, string> = {
  gold: "/assets/icons/resource-gold.webp",
  buildingMaterials: "/assets/glyphs/building_materials.svg",
  valuables: "/assets/icons/resource-valuables.webp"
};

export type FieldSymbolOverlay = {
  kind: "resource" | "treasure" | "mine";
  image: string;
  /** Roman guard difficulty to pin above the icon (I–VII). */
  difficulty?: number;
  /** Mine income amount shown as ↻N next to the materials/gold/valuables icon. */
  amount?: number;
};

/**
 * Pure: which symbol module(s) to attach for a field location.
 * Returns null when no module attaches (empty, blocked, town, …).
 */
export function fieldSymbolOverlayFor(field: {
  location: string;
  difficulty?: number;
  resource?: ResourceKind;
  amount?: number;
}): FieldSymbolOverlay | null {
  if (field.location === "resource_symbol") {
    return { kind: "resource", image: FIELD_SYMBOL_RESOURCE };
  }
  if (field.location === "treasure_symbol") {
    return {
      kind: "treasure",
      image: FIELD_SYMBOL_TREASURE,
      difficulty: field.difficulty
    };
  }
  if (field.location === "mine") {
    const resource = field.resource ?? "buildingMaterials";
    return {
      kind: "mine",
      image: FIELD_SYMBOL_MINE[resource] ?? FIELD_SYMBOL_MINE.buildingMaterials,
      difficulty: field.difficulty,
      amount: field.amount
    };
  }
  return null;
}
