/**
 * Small, compressed legend art for fixed map objects. The map designer and the
 * live adventure board share this mapping so a known object is represented by
 * the same icon before and during play.
 */
const FIXED_OBJECT_MARKER_BASE = "/game-tokens/markers/";

export function fixedObjectMarkerSrc(field: {
  location: string;
  resource?: string;
}): string | null {
  const file = (() => {
    switch (field.location) {
      case "mine":
        return field.resource === "gold"
          ? "mine-gold.webp"
          : field.resource === "valuables"
            ? "mine-valuable.webp"
            : field.resource === "buildingMaterials"
              ? "mine-materials.webp"
              : "mine-valuable-or-gold.webp";
      case "settlement":
        return "settlement.webp";
      case "obelisk":
        return "obelisk.webp";
      case "subterranean_gate":
        return "underground-gate.webp";
      case "whirlpool":
        return "whirlpool.webp";
      case "random_town":
        return "vii-random-town.webp";
      case "dragon_utopia":
        return "vii-dragon-utopia.webp";
      case "grail":
        return "vii-grail.webp";
      case "temple_of_the_sea":
        return "vii-temple-of-seas.webp";
      default:
        return null;
    }
  })();
  return file ? FIXED_OBJECT_MARKER_BASE + file : null;
}
