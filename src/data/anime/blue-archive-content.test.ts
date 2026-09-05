import { describe, expect, it } from "vitest";
import { hasMediaFile } from "@/lib/media-manifest";
import { blueArchiveCharacters } from "./blue-archive-content";

describe("Blue Archive playable roster", () => {
  it("contains the requested 19 units without Ako or Nonomi", () => {
    expect(blueArchiveCharacters).toHaveLength(19);
    const names = blueArchiveCharacters.map((unit) => unit.name);
    expect(names).toContain("Hasumi");
    expect(names).not.toContain("Ako");
    expect(names).not.toContain("Nonomi");
  });

  it("uses the approved 7 bronze / 7 silver / 5 gold curve", () => {
    const count = (tier: "bronze" | "silver" | "gold") =>
      blueArchiveCharacters.filter((unit) => unit.tier === tier).length;
    expect([count("bronze"), count("silver"), count("gold")]).toEqual([7, 7, 5]);
  });

  it("uses only rarity and battlefield type classifications", () => {
    const hasumi = blueArchiveCharacters.find((unit) => unit.name === "Hasumi");
    expect(hasumi?.type).toBe("flying");
    for (const unit of blueArchiveCharacters) {
      expect(["bronze", "silver", "gold"]).toContain(unit.tier);
      expect(["ground", "ranged", "flying"]).toContain(unit.type);
      expect("role" in unit).toBe(false);
    }
  });

  it("has card-ready mechanics and published art for both sides", () => {
    for (const unit of blueArchiveCharacters) {
      for (const face of [unit.few, unit.pack]) {
        expect(face.abilityName.length).toBeGreaterThan(2);
        expect(face.abilityText.length).toBeGreaterThan(20);
        expect(hasMediaFile(face.art), `${face.art} — run npm run media:publish`).toBe(true);
      }
    }
  });
});
