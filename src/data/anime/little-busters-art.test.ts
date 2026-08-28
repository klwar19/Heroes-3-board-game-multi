import { existsSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { factionGradeRegister, HERO_GRADE_REGISTERS, heroGradeIconForFaction } from "./hero-grades";
import { unitRankAbilityIcon } from "../units/experience-rank-abilities";

const ROOT = process.cwd();
const asset = (rel: string) => path.join(ROOT, "public/assets", rel);

async function expectImage(rel: string, width: number, height: number, alpha?: boolean) {
  const file = asset(rel);
  expect(existsSync(file), rel).toBe(true);
  expect(statSync(file).size, `${rel} should be real art`).toBeGreaterThan(10_000);
  const meta = await sharp(file).metadata();
  expect([meta.width, meta.height], rel).toEqual([width, height]);
  if (alpha !== undefined) expect(meta.hasAlpha, `${rel} alpha`).toBe(alpha);
}

describe("Little Busters production art pack", () => {
  it("ships the aligned empty/full board and seven contiguous strips", async () => {
    await expectImage("anime/towns/little-busters-campus-empty.webp", 2044, 701, false);
    await expectImage("anime/towns/little-busters-campus-full.webp", 2044, 701, false);
    for (let index = 1; index <= 7; index++) {
      await expectImage(`town-board/little-busters-bar-${index}.webp`, 292, 701, false);
    }
    await expectImage("anime/tiles/lb-s1-v2.webp", 1024, 985, true);
  });

  it("ships all 14 finished physical-layout unit faces", async () => {
    const units = [
      ["bronze", "haruka-saigusa"], ["bronze", "rins-cats"], ["bronze", "disciplinary-committee"],
      ["silver", "masato-the-wall"], ["silver", "softball-club"],
      ["golden", "saya-tokido"], ["golden", "mio-nishizono"]
    ] as const;
    for (const [tier, slug] of units) for (const side of ["few", "pack"]) {
      await expectImage(`anime/units/little-busters/units-little-busters-${tier}-${slug}-${side}.webp`, 743, 1040, false);
    }
  });

  it("ships researched heroes, commander, equipment and transparent emblems", async () => {
    for (const slug of ["sasami-sasasegawa", "riki-naoe", "rin-natsume", "yuiko-kurugaya", "kudryavka-noumi", "komari-kamikita"]) {
      await expectImage(`anime/heroes/little-busters-${slug}.webp`, 1086, 1448, false);
    }
    await expectImage("units-commander-kyousuke_natsume.webp", 743, 1040, false);
    for (const slug of ["harukas-glass-marbles", "lennons-mission-letter", "mios-parasol", "kuds-flight-goggles", "little-busters-practice-bat", "school-revolution-watch"]) {
      await expectImage(`anime/equipment/little-busters-${slug}.webp`, 512, 512, true);
    }
    for (const slug of ["rank-haruka", "rank-rins-cats", "rank-disciplinary-committee", "rank-masato", "rank-softball-club", "rank-saya", "rank-mio", "rank-shared", "grade-benchwarmer", "grade-regular", "grade-ace", "grade-strongest-in-school"]) {
      await expectImage(`anime/icons/little-busters/${slug}.webp`, 512, 512, true);
    }
  });

  it("registers the seishun ladder and the seven unit-specific XP icons", () => {
    expect(factionGradeRegister("little_busters")).toBe("seishun");
    expect(HERO_GRADE_REGISTERS.seishun.map((grade) => grade.en)).toEqual([
      "Benchwarmer", "Regular", "Ace", "Strongest in the School"
    ]);
    expect([0, 1, 2, 3].map((grade) => heroGradeIconForFaction("little_busters", grade))).toEqual([
      "/assets/anime/icons/little-busters/grade-benchwarmer.webp",
      "/assets/anime/icons/little-busters/grade-regular.webp",
      "/assets/anime/icons/little-busters/grade-ace.webp",
      "/assets/anime/icons/little-busters/grade-strongest-in-school.webp"
    ]);
    const choices = [
      ["little_busters.haruka", "attack-roll-advantage", "rank-haruka"],
      ["little_busters.rins_cats", "sandworm-strike-again", "rank-rins-cats"],
      ["little_busters.disciplinary_committee", "ignore-all-combat-penalties", "rank-disciplinary-committee"],
      ["little_busters.masato", "unlimited-retaliation", "rank-masato"],
      ["little_busters.softball_club", "attack-roll-advantage-passive", "rank-softball-club"],
      ["little_busters.saya", "saya-armor-break", "rank-saya"],
      ["little_busters.mio", "gargoyle-spell-ward", "rank-mio"]
    ] as const;
    for (const [unit, ability, icon] of choices) expect(unitRankAbilityIcon(ability, unit)).toContain(icon);
  });
});
