/** Small, compressed legend art used as advance warnings on hidden tiles. */
const FIXED_OBJECT_MARKER_BASE = "/game-tokens/markers/";

/** Marker art for public information printed over a still-face-down tile. */
export function faceDownTileHintMarkerSrc(hint: string): string {
  switch (hint) {
    case "gold_mine":
      return FIXED_OBJECT_MARKER_BASE + "mine-gold.webp";
    case "valuables_mine":
      return FIXED_OBJECT_MARKER_BASE + "mine-valuable.webp";
    case "materials_mine":
      return FIXED_OBJECT_MARKER_BASE + "mine-materials.webp";
    case "any_mine":
    case "mine_choice":
      return FIXED_OBJECT_MARKER_BASE + "mine-valuable-or-gold.webp";
    case "obelisk":
      return FIXED_OBJECT_MARKER_BASE + "obelisk.webp";
    case "settlement":
      return FIXED_OBJECT_MARKER_BASE + "settlement.webp";
    case "town":
      return FIXED_OBJECT_MARKER_BASE + "vii-random-town.webp";
    case "objective":
    case "objective_choice":
    default:
      return FIXED_OBJECT_MARKER_BASE + "vii-grail.webp";
  }
}

export function faceDownTileHintLabel(hint: string): string {
  switch (hint) {
    case "gold_mine": return "Contains a Gold Mine";
    case "valuables_mine": return "Contains a Valuables Mine";
    case "materials_mine": return "Contains a Building Materials Mine";
    case "any_mine": return "Contains a Mine";
    case "obelisk": return "Contains an Obelisk";
    case "settlement": return "Contains a Settlement";
    case "town": return "Contains a Town";
    case "objective": return "Contains a Grail or Dragon objective";
    case "mine_choice": return "On reveal: choose Gold or Valuables Mine";
    case "objective_choice": return "On reveal: choose the objective";
    default: return "Special reveal";
  }
}
