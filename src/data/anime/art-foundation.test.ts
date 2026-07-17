import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ART_ROOT = resolve(ROOT, "scripts/anime-art");

type Manifest = {
  status: string;
  masters: Array<{ slug: string; tier: "bronze" | "silver" | "golden"; file: string; review: string }>;
  frameMaster?: { file: string; review: string };
};

const FUYUKI_EXPECTED = [
  ["assassins", "bronze"],
  ["riders", "bronze"],
  ["lancers", "bronze"],
  ["archers", "silver"],
  ["casters", "silver"],
  ["sabers", "golden"],
  ["berserkers", "golden"]
] as const;

const AZURE_BREEZE_EXPECTED = [
  ["outer-sect-disciples", "bronze"],
  ["inner-sect-swordsmen", "bronze"],
  ["spirit-crane", "silver"],
  ["sect-protectors", "silver"],
  ["true-inheritors", "golden"],
  ["core-formation-master", "golden"],
  ["mountain-guardian", "golden"]
] as const;

async function manifest(name: string): Promise<Manifest> {
  return JSON.parse(await readFile(resolve(ART_ROOT, `${name}-unit-art-manifest.json`), "utf8")) as Manifest;
}

async function expectApprovedMasters(data: Manifest, expected: ReadonlyArray<readonly [string, string]>) {
  expect(data.status).toBe("art-proof-not-playable");
  expect(data.masters.map(({ slug, tier }) => [slug, tier])).toEqual(expected);
  for (const master of data.masters) {
    expect(master.review).toBe("approved");
    const file = resolve(ART_ROOT, master.file);
    expect((await stat(file)).size).toBeGreaterThan(1_000_000);
    const metadata = await sharp(file).metadata();
    // Current masters vary between 946–1062px wide and 1481–1662px tall;
    // every one exceeds the 743×1040 card export.
    expect(metadata.width).toBeGreaterThanOrEqual(900);
    expect(metadata.height).toBeGreaterThanOrEqual(1_400);
  }
}

async function expectEditableSuite(manifestName: string, directory: string, assetPrefix: string) {
  const data = await manifest(manifestName);
  for (const master of data.masters) {
    for (const variant of ["few", "pack"] as const) {
      const stem = `units-${assetPrefix}-${master.tier}-${master.slug}-${variant}`;
      const svgPath = resolve(ART_ROOT, `editable/${directory}/units`, `${stem}.svg`);
      const svg = await readFile(svgPath, "utf8");
      expect(svg).toContain('data-status="art-proof-not-playable"');
      expect(svg).toContain('inkscape:label="02 Illustration (linked master)"');
      expect(svg).toContain('inkscape:label="04 Editable');
      expect(svg).toContain(master.file.split("/").at(-1));
      expect(svg).not.toContain("data:image/png;base64");

      const proof = resolve(ART_ROOT, `previews/${directory}/units`, `${stem}.webp`);
      expect(await sharp(proof).metadata()).toMatchObject({ width: 743, height: 1040, format: "webp" });
    }
  }
}

describe("anime art foundation", () => {
  it("keeps one approved high-resolution raw master for every Fuyuki unit line", async () => {
    await expectApprovedMasters(await manifest("fuyuki"), FUYUKI_EXPECTED);
  });

  it("keeps one approved high-resolution raw master for every Azure Breeze unit line", async () => {
    await expectApprovedMasters(await manifest("azure-breeze"), AZURE_BREEZE_EXPECTED);
  });

  it("keeps the approved image-generated Azure frame as a linked editable source", async () => {
    const azureManifest = await manifest("azure-breeze");
    expect(azureManifest.frameMaster?.review).toBe("approved");
    const framePath = resolve(ART_ROOT, azureManifest.frameMaster?.file ?? "missing");
    expect((await stat(framePath)).size).toBeGreaterThan(1_000_000);
    expect(await sharp(framePath).metadata()).toMatchObject({ width: 1060, height: 1484, format: "png" });

    const azureCard = await readFile(
      resolve(ART_ROOT, "editable/azure-breeze/units/units-azure-breeze-bronze-outer-sect-disciples-few.svg"),
      "utf8"
    );
    expect(azureCard).toContain('id="linked-frame"');
    expect(azureCard).toContain("units-azure-breeze-board-game-frame-master.png");
    expect(azureCard).not.toContain("data:image/png;base64");
  });

  it("provides linked layered SVG and correctly sized Few/Pack proofs for both layouts", async () => {
    await expectEditableSuite("fuyuki", "fuyuki", "fuyuki");
    await expectEditableSuite("azure-breeze", "azure-breeze", "azure-breeze");
  });

  it("pins Azure Breeze to the original board-game card hierarchy with its own renderer", async () => {
    const fuyuki = await readFile(
      resolve(ART_ROOT, "editable/fuyuki/units/units-fuyuki-bronze-assassins-few.svg"),
      "utf8"
    );
    const azure = await readFile(
      resolve(ART_ROOT, "editable/azure-breeze/units/units-azure-breeze-bronze-outer-sect-disciples-few.svg"),
      "utf8"
    );
    expect(fuyuki).not.toContain('data-layout="ninefold-board-game-classic-v3"');
    expect(fuyuki).toContain('x="169" y="146" width="526" height="668"');
    expect(azure).toContain('data-layout="ninefold-board-game-classic-v3"');
    expect(azure).toContain('x="173" y="157" width="509" height="597"');
    expect(azure).toContain('id="left-stat-rail"');
    expect(azure).toContain('id="icon-attack-crossed-jian"');
    expect(azure).toContain('id="icon-defense-jade-shield"');
    expect(azure).toContain('id="icon-health-lotus-cross"');
    expect(azure).toContain('id="icon-initiative-cloud-step"');
    expect(azure).toContain('inkscape:label="05 Editable original-style typography and rules"');
    expect(azure).toContain('data-rule-capacity-lines="7"');
    expect(azure).not.toContain('id="stat-grid"');
    expect(azure).not.toContain('id="level-seal"');
  });

  it("pins the revised Azure Breeze proof classifications, names, and variant stats", async () => {
    const azureUnits = resolve(ART_ROOT, "editable/azure-breeze/units");
    const readProof = (stem: string) => readFile(resolve(azureUnits, `units-azure-breeze-${stem}.svg`), "utf8");

    const craneFew = await readProof("silver-spirit-crane-few");
    const cranePack = await readProof("silver-spirit-crane-pack");
    expect(craneFew).toContain('data-level="3"');
    expect(craneFew).toContain('data-traits="FLYING,MELEE"');
    expect(craneFew).toContain('data-attack="3"');
    expect(craneFew).toContain('data-initiative="10"');
    expect(cranePack).toContain('data-attack="4"');
    expect(cranePack).toContain('data-initiative="11"');
    expect(cranePack).toContain("Wingbeat");

    const masterPack = await readProof("golden-core-formation-master-pack");
    expect(masterPack).toContain("Core Formation Master");
    expect(masterPack).toContain("Kim Đan Chân Nhân");
    expect(masterPack).toContain('data-traits="RANGED,MAGIC"');
    expect(masterPack).toContain('data-attack="5"');
    expect(masterPack).toContain("Talisman Aura");

    const guardianFew = await readProof("golden-mountain-guardian-few");
    const guardianPack = await readProof("golden-mountain-guardian-pack");
    expect(guardianFew).toContain('data-traits="GROUND,MELEE"');
    expect(guardianFew).toContain('data-attack="5"');
    expect(guardianFew).toContain("Verdant Pulse");
    expect(guardianPack).toContain('data-attack="6"');
    expect(guardianPack).toContain("Verdant Pulse");
    expect(guardianPack).toContain("Returning Earth");
  });

  it("keeps art proofs outside runtime assets until the effects are implemented", async () => {
    const runtimeAssets = await readdir(resolve(ROOT, "public/assets"));
    expect(runtimeAssets.filter((name) => name.startsWith("units-fuyuki-"))).toEqual([]);
    expect(runtimeAssets.filter((name) => name.startsWith("units-azure-breeze-"))).toEqual([]);
    for (const contactSheet of [
      "anime-fuyuki-unit-cards-contact-sheet.webp",
      "anime-azure-breeze-unit-cards-contact-sheet.webp"
    ]) {
      expect(await sharp(resolve(ROOT, "docs", contactSheet)).metadata()).toMatchObject({
        width: 982,
        height: 1338,
        format: "webp"
      });
    }
  });
});
