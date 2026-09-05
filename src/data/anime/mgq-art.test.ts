import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { hasMediaFile, mediaFileInfo } from "@/lib/media-manifest";
import { commanderDefinitions } from "@/data/commanders";
import { equipmentCardArtPath } from "@/data/anime/equipment-cards";
import { equipmentArtPath } from "@/data/anime/equipment";
import { MGQ_UNIT_ORDER, mgqHeroDefinitions, mgqUnitDefinitions } from "@/data/anime/mgq";
import { allTileDefinitions } from "@/data/map/tiles";
import { townBoardSpecs } from "@/data/towns/boards";

const ROOT = process.cwd();
const readJson = <T,>(relative: string): T =>
  JSON.parse(readFileSync(path.join(ROOT, relative), "utf8")) as T;

type ReferenceManifest = {
  references: Array<{ id: string; pageUrl: string; images: Array<{ url: string; cache: string }> }>;
};

type Face = {
  stats: { attack: number; defense: number; health: number; initiative: number };
  cost: { gold: number; valuables?: number };
  abilities: string[];
  text: string;
};

type UnitContract = {
  layout: { width: number; height: number; artWindow: { left: number; top: number; width: number; height: number } };
  cards: Array<{
    id: string;
    slug: string;
    assetSlug?: string;
    tier: string;
    referenceIds: string[];
    art: { few: string; pack: string };
    output: { few: string; pack: string };
    few: Face;
    pack: Face;
  }>;
};

type ArtContract = {
  layouts: Record<string, { width: number; height: number; barWidths?: number[] }>;
  town: {
    emptyOutput: string;
    fullOutput: string;
    iconOutput: string;
    bars: Array<{ index: number; buildingIds: string[]; output: string; referenceIds?: string[] }>;
  };
  tile: { output: string };
  heroes: Array<{ id: string; referenceIds: string[]; output: string }>;
  commander: { id: string; referenceIds: string[]; output: string };
  equipment: Array<{ id: string; referenceIds: string[]; iconOutput: string; cardOutput: string }>;
  icons: Array<{
    id: string;
    kind: string;
    referenceIds: string[];
    output: string;
    heroId?: string;
    levels?: number[];
    grade?: number;
    job?: string;
    rank3Ability?: string;
    spirit?: string;
    mechanic?: string;
  }>;
};

const references = readJson<ReferenceManifest>("scripts/anime-art/mgq-reference-manifest.json");
const units = readJson<UnitContract>("scripts/anime-art/mgq-unit-card-contract.json");
const art = readJson<ArtContract>("scripts/anime-art/mgq-art-contract.json");
const publicRelative = (repoRelative: string) => repoRelative.replace(/^public\//u, "");
const publicUrl = (repoRelative: string) => `/${repoRelative.replace(/^public\//u, "")}`;

type ExpectedAsset = { relative: string; width: number; height: number };

function expectedRuntimeAssets(): ExpectedAsset[] {
  const result: ExpectedAsset[] = [];
  for (const card of units.cards) {
    result.push({ relative: publicRelative(card.output.few), width: 743, height: 1040 });
    result.push({ relative: publicRelative(card.output.pack), width: 743, height: 1040 });
  }
  result.push(
    { relative: publicRelative(art.town.emptyOutput), width: 2044, height: 701 },
    { relative: publicRelative(art.town.fullOutput), width: 2044, height: 701 },
    { relative: publicRelative(art.town.iconOutput), width: 174, height: 137 },
    ...art.town.bars.map((bar) => ({ relative: publicRelative(bar.output), width: 292, height: 701 })),
    { relative: publicRelative(art.tile.output), width: 1024, height: 985 },
    ...art.heroes.map((hero) => ({ relative: publicRelative(hero.output), width: 1086, height: 1448 })),
    { relative: publicRelative(art.commander.output), width: 743, height: 1040 },
    ...art.equipment.flatMap((item) => [
      { relative: publicRelative(item.iconOutput), width: 512, height: 512 },
      { relative: publicRelative(item.cardOutput), width: 743, height: 1040 }
    ]),
    ...art.icons.map((icon) => ({
      relative: publicRelative(icon.output),
      width: icon.kind === "specialty" ? 256 : 512,
      height: icon.kind === "specialty" ? 256 : 512
    }))
  );
  return result;
}

describe("MGQ deterministic art production contracts", () => {
  it("freezes all 29 Few/Pack cards to the live data and runtime image paths", () => {
    expect(units.cards.map((card) => card.id)).toEqual(MGQ_UNIT_ORDER);
    expect(units.cards).toHaveLength(29);
    expect(units.layout).toEqual({
      width: 743,
      height: 1040,
      artWindow: { left: 173, top: 157, width: 509, height: 597 },
      frames: expect.any(Object)
    });

    for (const card of units.cards) {
      const definition = mgqUnitDefinitions[card.id];
      expect(definition, card.id).toBeDefined();
      if (!definition?.few || !definition.pack) {
        throw new Error(`${card.id} is missing its MGQ Few/Pack runtime definition.`);
      }
      expect(publicUrl(card.output.few), `${card.id} Few path`).toBe(definition.few.cardImage);
      expect(publicUrl(card.output.pack), `${card.id} Pack path`).toBe(definition.pack.cardImage);
      for (const [side, face] of [["few", card.few], ["pack", card.pack]] as const) {
        const runtime = definition[side];
        if (!runtime) {
          throw new Error(`${card.id}/${side} is missing its runtime side.`);
        }
        expect(face.stats, `${card.id}/${side} stats`).toEqual({
          attack: runtime.attack,
          defense: runtime.defense,
          health: runtime.health,
          initiative: runtime.initiative
        });
        expect(face.cost, `${card.id}/${side} cost`).toEqual(runtime.cost);
        expect(face.abilities, `${card.id}/${side} abilities`).toEqual(runtime.abilities ?? []);
        expect(face.text, `${card.id}/${side} text`).toBe(runtime.abilityText ?? "No printed ability.");
        expect(card.art[side], `${card.id}/${side} dedicated master`).toBe(`${card.slug}-${side}-master.png`);
      }
    }
  });

  it("wires every character-derived asset to the verified reference manifest", () => {
    const known = new Map(references.references.map((entry) => [entry.id, entry]));
    expect(known.size).toBe(41);
    for (const entry of references.references) {
      expect(entry.pageUrl, `${entry.id} page`).toMatch(/^https:\/\/mgq\.miraheze\.org\/wiki\//u);
      expect(entry.images.length, `${entry.id} images`).toBeGreaterThan(0);
      for (const image of entry.images) {
        expect(image.url, `${entry.id} direct image`).toMatch(/^https:\/\/static\.wikitide\.net\/mgqwiki\//u);
        expect(image.cache, `${entry.id} research-only cache`).toMatch(/^refs\/mgq\//u);
      }
    }

    const users = [
      ...units.cards.map((card) => ({ id: card.id, refs: card.referenceIds })),
      ...art.heroes.map((hero) => ({ id: hero.id, refs: hero.referenceIds })),
      { id: art.commander.id, refs: art.commander.referenceIds },
      ...art.icons.filter((icon) => icon.referenceIds.length).map((icon) => ({ id: icon.id, refs: icon.referenceIds })),
      ...art.town.bars.filter((bar) => bar.referenceIds?.length).map((bar) => ({ id: `bar-${bar.index}`, refs: bar.referenceIds ?? [] }))
    ];
    for (const user of users) for (const referenceId of user.refs) {
      expect(known.has(referenceId), `${user.id} -> ${referenceId}`).toBe(true);
    }
    expect(units.cards.find((card) => card.id === "mgq.kamuro_kitsu")?.referenceIds).toEqual(["kitsu", "kamuro"]);
    expect(units.cards.find((card) => card.id === "mgq.chrome_frederica")?.referenceIds).toEqual(["chrome", "frederica"]);
  });

  it("matches hero, commander, town, building and equipment runtime paths", () => {
    expect(art.layouts.townPanorama).toMatchObject({ width: 2044, height: 701, barWidths: [292, 292, 292, 292, 292, 292, 292] });
    expect(art.town.bars.map((bar) => bar.buildingIds)).toEqual(townBoardSpecs.mgq.bars);
    expect(publicUrl(art.town.emptyOutput)).toBe(townBoardSpecs.mgq.panoramaImage);
    expect(publicUrl(art.town.fullOutput)).toBe(townBoardSpecs.mgq.fullImage);
    expect(art.town.bars.map((bar) => publicUrl(bar.output))).toEqual(townBoardSpecs.mgq.barTileImages);
    expect(publicUrl(art.tile.output)).toBe(allTileDefinitions["MGQ-S1"].assets?.tileImage);

    for (const hero of art.heroes) expect(publicUrl(hero.output), hero.id).toBe(mgqHeroDefinitions[hero.id].portrait);
    expect(publicUrl(art.commander.output)).toBe(commanderDefinitions.sonya.cardImage);
    const equipmentBuilder = readFileSync(path.join(ROOT, "scripts/build-equipment-cards.mjs"), "utf8");
    for (const item of art.equipment) {
      expect(publicUrl(item.iconOutput), `${item.id} icon`).toBe(equipmentArtPath(item.id));
      expect(publicUrl(item.cardOutput), `${item.id} card`).toBe(equipmentCardArtPath(item.id));
      expect(equipmentBuilder, `${item.id} compositor registration`).toContain(`slug: "${item.id.replace(/^anime\.equip\./u, "")}"`);
    }
  });

  it("assigns every functional icon to an unambiguous UI consumer", () => {
    expect(art.icons.filter((icon) => icon.kind === "specialty").map((icon) => [icon.heroId, icon.levels])).toEqual([
      ["luka", [1, 4, 6]], ["alice", [1, 4, 6]], ["ilias", [1, 4, 6]],
      ["granberia", [1, 4, 6]], ["promestein", [1, 4, 6]]
    ]);
    expect(art.icons.filter((icon) => icon.kind === "hero-grade").map((icon) => icon.grade)).toEqual([0, 1, 2, 3]);
    expect(art.icons.filter((icon) => icon.kind === "unit-experience").map((icon) => [icon.job, icon.rank3Ability])).toEqual([
      ["warrior", "ignores-retaliation"],
      ["guard", "unlimited-retaliation"],
      ["mage", "titan-ignore-ongoing"],
      ["healer", "wraith-heal-1"]
    ]);
    expect(art.icons.filter((icon) => icon.kind === "spirit").map((icon) => icon.spirit)).toEqual(["sylph", "gnome", "undine", "salamander"]);
    expect(art.icons.filter((icon) => ["mechanic", "combat-token"].includes(icon.kind)).map((icon) => icon.mechanic)).toEqual([
      "companion-recruitment", "job-reassignment", "spirit-contract", "temptation"
    ]);

    const consumerSource = [
      "src/components/specialty-card-data.ts",
      "src/data/anime/hero-grades.ts",
      "src/data/units/experience-rank-abilities.ts",
      "src/components/adventure/mgq-controls.tsx",
      "src/data/assets/homm-assets.ts"
    ].map((relative) => readFileSync(path.join(ROOT, relative), "utf8")).join("\n");
    for (const icon of art.icons) {
      expect(consumerSource, `${icon.id} has no runtime consumer`).toContain(publicUrl(icon.output));
    }
  });

  it("keeps the runtime pack complete-or-absent until approved masters are supplied", () => {
    const expected = expectedRuntimeAssets();
    expect(expected).toHaveLength(102);
    const present = expected.filter((item) => hasMediaFile(`/assets/${item.relative}`));
    expect(
      [0, expected.length],
      `partial MGQ art pack (run npm run media:publish):\n${present.map((item) => item.relative).join("\n")}`
    ).toContain(present.length);
    if (!present.length) return;

    for (const item of expected) {
      const info = mediaFileInfo(`/assets/${item.relative}`)!;
      expect(info.bytes, `${item.relative} should be a real export`).toBeGreaterThan(3_000);
      expect([info.width, info.height], item.relative).toEqual([item.width, item.height]);
    }
  });

  it("validates both contracts without requiring or fabricating masters", () => {
    const unitCheck = execFileSync(process.execPath, ["scripts/build-mgq-unit-cards.mjs", "--check-contract"], { cwd: ROOT, encoding: "utf8" });
    const artCheck = execFileSync(process.execPath, ["scripts/build-mgq-art.mjs", "--check-contract"], { cwd: ROOT, encoding: "utf8" });
    expect(unitCheck).toContain("29 cards / 58 faces");
    expect(artCheck).toContain("33 masters");
  });
});
