#!/usr/bin/env node

/**
 * Rebuild the 25 single-sided Neutral guard cards whose wiki images are blank.
 *
 * Most creature illustrations are cropped from that unit's official Few/Pack
 * card, so Few, Pack, and Neutral retain one visual identity. Leprechaun,
 * Satyrs, Steel Golems, and Fangarm have no faction card: their HD art sources
 * in scripts/neutral-unit-art were generated from the PC-game renders/sprites.
 * Every Neutral face uses an official matching-tier frame and the glyphs from
 * the wiki legend for every symbolic rules reference.
 *
 * Sources:
 *   https://en.homm3bg.wiki/towns/neutral/
 *   https://en.homm3bg.wiki/legend/
 */

import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public", "assets");
const GLYPHS = path.join(ROOT, "scripts", "card-glyphs");
const GENERATED_ART = path.join(ROOT, "scripts", "neutral-unit-art");
const OUT = path.join(ROOT, "out");

// WebP encode settings. quality 80 / effort 6 keeps the legend glyphs and the
// rules text crisp while landing each card well under 130 KB — roughly half the
// size of a quality-94 encode (see scripts/build-missing-spell-cards.mjs for the
// same trade-off on the spell faces).
const WEBP = { quality: 80, effort: 6 };

const CARD_WIDTH = 743;
const CARD_HEIGHT = 1040;
const ART_WIDTH = 540;
const ART_HEIGHT = 594;
const ART_LEFT = 169;
const ART_TOP = 164;

const NEUTRAL_TEMPLATES = {
  bronze: "units-neutral-bronze-centaurs.webp",
  silver: "units-neutral-silver-zealots.webp",
  golden: "units-neutral-golden-nagas.webp",
  azure: "units-neutral-azure-hydras.webp"
};

const SOURCE_CROPS = {
  cove: { left: 168, top: 150, width: 528, height: 608 },
  conflux: { left: 162, top: 150, width: 532, height: 610 },
  stronghold: { left: 148, top: 152, width: 500, height: 586 }
};

const g = (name) => ({ glyph: name });

const CARDS = [
  {
    slug: "leprechaun", name: "Leprechaun", tier: "bronze", type: "unit_ground",
    art: "leprechaun.png", artPosition: "center", stats: [2, 0, 3, 5], cost: 4,
    fontSize: 21,
    lines: [[g("unit_attack"), " Roll 2 Attack dice and resolve the higher one."]]
  },
  {
    slug: "satyrs", name: "Satyrs", tier: "silver", type: "unit_ground",
    art: "satyrs.png", artPosition: "top", stats: [3, 0, 5, 7], cost: 10,
    fontSize: 20,
    lines: [[g("map_effect"), " Once per turn. Roll an Attack die. On a \"+1\","], ["gain ", g("morale_positive"), "."]]
  },
  {
    slug: "steel_golems", name: "Steel Golems", tier: "silver", type: "unit_ground",
    art: "steel_golems.png", artPosition: "center", stats: [3, 2, 3, 5], cost: 12,
    fontSize: 19,
    lines: [[g("unit_passive"), " Reduce ", g("damage"), " taken by this unit from ", g("spell"), " or"], ["Specialty by 2 — to a minimum of 0."]]
  },
  {
    slug: "fangarm", name: "Fangarm", tier: "silver", type: "unit_flying",
    art: "fangarm.png", artPosition: "top", stats: [3, 1, 5, 8], cost: 11,
    fontSize: 20,
    lines: [[g("unit_passive"), " Ignore all ", g("spell"), " and Specialty effects other"], ["than ", g("damage"), "."]]
  },
  {
    slug: "oceanids", name: "Oceanids", family: "cove", tier: "bronze",
    source: "units-cove-bronze-oceanids-few.webp", stats: [2, 0, 3, 6], cost: 3,
    fontSize: 23,
    lines: [[g("unit_passive"), " Ignore all effects and ", g("damage"), " from ", g("spell"), "."]]
  },
  {
    slug: "seamen", name: "Seamen", family: "cove", tier: "bronze",
    source: "units-cove-bronze-seamen-few.webp", stats: [2, 1, 3, 5], cost: 5,
    lines: []
  },
  {
    slug: "sea_dogs", name: "Sea Dogs", family: "cove", tier: "bronze",
    source: "units-cove-bronze-sea_dogs-few.webp", stats: [2, 0, 4, 6], cost: 7,
    fontSize: 23,
    lines: [[g("unit_passive"), " Ignore the combat penalty against"], ["adjacent units."]]
  },
  {
    slug: "ayssids", name: "Ayssids", family: "cove", tier: "silver",
    source: "units-cove-silver-ayssids-pack.webp", stats: [3, 1, 5, 9], cost: 9,
    fontSize: 18,
    lines: [
      [g("unit_attack"), " If the target is reduced to 0 ", g("health_points"), ", after"],
      ["resolving the ", g("unit_retaliation"), " (if applicable), the Ayssids"],
      ["can attack another adjacent unit."]
    ]
  },
  {
    slug: "sorceresses", name: "Sorceresses", family: "cove", tier: "silver",
    source: "units-cove-silver-sorceresses-pack.webp", stats: [3, 1, 5, 6], cost: 13,
    fontSize: 20,
    lines: [
      [g("unit_attack"), " After the attack, place a \"-1\" Weakness"],
      ["token on the target for 2 Combat rounds."]
    ]
  },
  {
    slug: "nix", name: "Nix", family: "cove", tier: "golden",
    source: "units-cove-golden-nix-few.webp", stats: [5, 1, 7, 6], cost: 20,
    fontSize: 22,
    lines: [[g("unit_passive"), " This unit cannot take more than 5 ", g("damage")], ["from a single attack."]]
  },
  {
    slug: "haspids", name: "Haspids", family: "cove", tier: "golden",
    source: "units-cove-golden-haspids-pack.webp", stats: [5, 2, 6, 9], cost: 25,
    fontSize: 18,
    lines: [
      [g("unit_attack"), " Place 1 faction cube on the target. At the"],
      ["beginning of its every activation, remove it to"],
      ["inflict 1 ", g("damage"), "."]
    ]
  },
  {
    slug: "goblins", name: "Goblins", family: "stronghold", tier: "bronze",
    source: "units-stronghold-bronze-goblins-few.webp", stats: [1, 0, 4, 6], cost: 4,
    lines: []
  },
  {
    slug: "wolf_raiders", name: "Wolf Raiders", family: "stronghold", tier: "bronze",
    source: "units-stronghold-bronze-wolf_raiders-pack.webp", stats: [2, 0, 3, 7], cost: 6,
    fontSize: 20,
    lines: [
      [g("unit_attack"), " Attack this target again. The second attack"],
      ["happens after the target retaliates (if possible)."]
    ]
  },
  {
    slug: "orcs", name: "Orcs", family: "stronghold", tier: "bronze",
    source: "units-stronghold-bronze-orcs-few.webp", stats: [2, 1, 4, 4], cost: 7,
    lines: []
  },
  {
    slug: "ogres", name: "Ogres", family: "stronghold", tier: "silver",
    source: "units-stronghold-silver-ogres-pack.webp", stats: [3, 2, 4, 4], cost: 10,
    fontSize: 18,
    lines: [
      [g("unit_other"), " Place a +2 ", g("attack"), " token on a chosen friendly"],
      [g("unit_ground"), " or ", g("unit_flying"), " unit for 2 Combat rounds."]
    ]
  },
  {
    slug: "thunderbirds", name: "Thunderbirds", family: "stronghold", tier: "silver",
    source: "units-stronghold-silver-thunderbirds-pack.webp", stats: [3, 0, 6, 9], cost: 13,
    fontSize: 17,
    lines: [
      [g("unit_passive"), " Right after this unit's attack and before any"],
      ["Retaliation, roll 1 Attack die, on a \"0\" or \"+1\","],
      ["deal 1 ", g("damage"), " to the target."]
    ]
  },
  {
    slug: "cyclopes", name: "Cyclopes", family: "stronghold", tier: "golden",
    source: "units-stronghold-golden-cyclopes-pack.webp", stats: [5, 1, 6, 8], cost: 19,
    fontSize: 21,
    lines: [[g("unit_other"), " This unit can destroy a Wall, the Gate,"], ["or the Arrow Tower."]]
  },
  {
    slug: "behemoths", name: "Behemoths", family: "stronghold", tier: "golden",
    source: "units-stronghold-golden-behemoths-pack.webp", stats: [5, 1, 8, 9], cost: 26,
    fontSize: 18,
    lines: [
      [g("unit_attack"), " Decrease the target's ", g("defense"), " by 2 (to a minimum"],
      ["of 0). After the attack, place 1 Corrosion token"],
      ["on the target."]
    ]
  },
  {
    slug: "sprites", name: "Sprites", family: "conflux", tier: "bronze",
    source: "units-conflux-bronze-sprites-pack.webp", stats: [2, 0, 2, 7], cost: 2,
    fontSize: 23,
    lines: [[g("unit_attack"), " Ignore the Retaliation Attack."]]
  },
  {
    slug: "ice_elementals", name: "Ice Elementals", family: "conflux", tier: "bronze",
    source: "units-conflux-bronze-ice_elementals-pack.webp", stats: [2, 1, 3, 5], cost: 7,
    fontSize: 19,
    lines: [[g("unit_passive"), " Immune to Magic Arrow and Water Magic spells."], ["This unit deals elemental damage."]]
  },
  {
    slug: "storm_elementals", name: "Storm Elementals", family: "conflux", tier: "bronze",
    source: "units-conflux-bronze-storm_elementals-pack.webp", stats: [2, 0, 3, 7], cost: 5,
    fontSize: 19,
    lines: [[g("unit_passive"), " Immune to Magic Arrow and Air Magic spells."], ["This unit deals elemental damage."]]
  },
  {
    slug: "energy_elementals", name: "Energy Elementals", family: "conflux", tier: "silver",
    source: "units-conflux-silver-energy_elementals-pack.webp", stats: [3, 1, 4, 5], cost: 11,
    fontSize: 19,
    lines: [[g("unit_passive"), " Immune to Magic Arrow and Fire Magic spells."], ["This unit deals elemental damage."]]
  },
  {
    slug: "magma_elementals", name: "Magma Elementals", family: "conflux", tier: "silver",
    source: "units-conflux-silver-magma_elementals-few.webp", stats: [3, 2, 4, 4], cost: 14,
    fontSize: 19,
    lines: [[g("unit_passive"), " Immune to Magic Arrow and Earth Magic spells."], ["This unit deals elemental damage."]]
  },
  {
    slug: "magic_elementals", name: "Magic Elementals", family: "conflux", tier: "golden",
    source: "units-conflux-golden-magic_elementals-few.webp", stats: [3, 1, 7, 7], cost: 19,
    fontSize: 21,
    lines: [[g("unit_passive"), " Immune to Magic Arrow."], ["This unit deals elemental damage."]]
  },
  {
    slug: "phoenixes", name: "Phoenixes", family: "conflux", tier: "azure",
    source: "units-conflux-golden-phoenixes-few.webp", stats: [6, 2, 7, 12], cost: 32,
    fontSize: 17,
    lines: [
      [g("unit_passive"), " Once per Combat, when this unit's ", g("health_points")],
      ["drops to 0, set it to 1 instead."],
      [g("unit_passive"), " Immune to Fire Magic ", g("spell"), "."]
    ]
  },

  // ---- Wake of Gods optional neutral roster -----------------------------
  // Art is generated as a clean HD illustration window from each canonical
  // WoG creature reference, then composited here under the exact board-game
  // frame and legend glyphs. No text/symbols are baked into the artwork.
  {
    slug: "wog_ghost", name: "Ghost", tier: "bronze", type: "unit_ground",
    art: "wog_ghost.png", stats: [3, 0, 4, 7], cost: 6, fontSize: 16,
    lines: [
      [g("unit_attack"), " Defeat a non-Undead unit: remove all ", g("damage"), "."],
      ["Permanently gain +1 ", g("health_points"), " (maximum +2 per game)."]
    ]
  },
  {
    slug: "wog_air_messenger", name: "Air Messenger", tier: "silver", type: "unit_ground",
    art: "wog_air_messenger.png", stats: [3, 1, 5, 10], cost: 8, fontSize: 18,
    lines: [[g("unit_passive"), " Reduce ", g("damage"), " from Air Magic ", g("spell"), " by 2."], ["(to a minimum of 0)"]]
  },
  {
    slug: "wog_earth_messenger", name: "Earth Messenger", tier: "silver", type: "unit_ground",
    art: "wog_earth_messenger.png", stats: [3, 2, 4, 5], cost: 8, fontSize: 18,
    lines: [[g("unit_passive"), " Reduce ", g("damage"), " from Earth Magic ", g("spell"), " by 2."], ["(to a minimum of 0)"]]
  },
  {
    slug: "wog_fire_messenger", name: "Fire Messenger", tier: "silver", type: "unit_ground",
    art: "wog_fire_messenger.png", stats: [4, 1, 5, 7], cost: 8, fontSize: 18,
    lines: [[g("unit_passive"), " Reduce ", g("damage"), " from Fire Magic ", g("spell"), " by 2."], ["(to a minimum of 0)"]]
  },
  {
    slug: "wog_water_messenger", name: "Water Messenger", tier: "silver", type: "unit_ground",
    art: "wog_water_messenger.png", stats: [3, 1, 6, 6], cost: 8, fontSize: 18,
    lines: [[g("unit_passive"), " Reduce ", g("damage"), " from Water Magic ", g("spell"), " by 2."], ["(to a minimum of 0)"]]
  },
  {
    slug: "wog_war_zealot", name: "War Zealot", tier: "silver", type: "unit_ranged",
    art: "wog_war_zealot.png", stats: [3, 1, 4, 6], cost: 13, fontSize: 16,
    lines: [[g("unit_passive"), " Ignore the penalty against adjacent units."], ["This unit always has Magic Mirror."], [g("unit_attack"), " When this unit attacks, it gains +1 ", g("attack"), "."]]
  },
  {
    slug: "wog_arctic_sharpshooter", name: "Arctic Sharpshooter", tier: "silver", type: "unit_ranged",
    art: "wog_arctic_sharpshooter.png", stats: [3, 1, 5, 8], cost: 15, fontSize: 17,
    lines: [[g("unit_passive"), " Ignore combat penalties. +1 ", g("defense")], ["against attacks from ranged units."]]
  },
  {
    slug: "wog_lava_sharpshooter", name: "Lava Sharpshooter", tier: "silver", type: "unit_ranged",
    art: "wog_lava_sharpshooter.png", stats: [3, 0, 5, 9], cost: 15, fontSize: 16,
    lines: [[g("unit_passive"), " Ignore combat penalties."], ["An adjacent attacker takes 1 ", g("damage"), "."], [g("unit_attack"), " When this unit attacks, it gains +1 ", g("attack"), "."]]
  },
  {
    slug: "wog_sylvan_centaur", name: "Sylvan Centaur", tier: "silver", type: "unit_ranged",
    art: "wog_sylvan_centaur.png", stats: [3, 0, 4, 8], cost: 12, fontSize: 17,
    lines: [[g("unit_attack"), " Attack a non-adjacent target twice."], ["Treat a \"-1\" Attack die result as \"0\"."]]
  },
  {
    slug: "wog_werewolf", name: "Werewolf", tier: "silver", type: "unit_ground",
    art: "wog_werewolf.png", stats: [3, 1, 5, 7], cost: 15, fontSize: 14,
    lines: [
      [g("unit_passive"), " Astrologers' rounds: +1 ", g("attack"), "; must attack."],
      [g("unit_attack"), " Once per Combat after a kill, summon a"],
      ["temporary Werewolf with -1 to every statistic."]
    ]
  },
  {
    slug: "wog_nightmare", name: "Nightmare", tier: "golden", type: "unit_ground",
    art: "wog_nightmare.png", stats: [5, 2, 6, 11], cost: 25, fontSize: 15,
    lines: [[g("unit_attack"), " Death Stare: after attacking, roll 2 Attack dice."], ["Two \"-1\" results reduce the target's ", g("health_points"), " to 0."]]
  },
  {
    slug: "wog_hell_steed", name: "Hell Steed", tier: "golden", type: "unit_ground",
    art: "wog_hell_steed.png", stats: [5, 1, 7, 9], cost: 22, fontSize: 14,
    lines: [
      [g("unit_passive"), " Immune to Magic Arrow and Fire Magic ", g("spell"), "."],
      ["Adjacent attackers take 1 ", g("damage"), "."],
      [g("unit_attack"), " Use Magic Arrow; place Fire Wall at the target."]
    ]
  },
  {
    slug: "wog_gorynych", name: "Gorynych", tier: "golden", type: "unit_flying",
    art: "wog_gorynych.png", stats: [5, 2, 7, 8], cost: 25, fontSize: 16,
    lines: [[g("unit_attack"), " Ignore the ", g("unit_retaliation"), ". Then attack every other"], ["adjacent enemy with 4 ", g("attack"), "."]]
  },
  {
    slug: "wog_santa_gremlin", name: "Santa Gremlin", tier: "bronze", type: "unit_ranged",
    art: "wog_santa_gremlin.png", stats: [2, 0, 4, 5], cost: 5, fontSize: 14,
    lines: [
      [g("unit_attack"), " Ranged attack uses Ice Bolt."],
      [g("unit_passive"), " Add a neutral Gremlin guard before Combat."],
      [g("map_effect"), " Defeat: roll 1 extra Resource die."]
    ]
  },
  {
    slug: "wog_dracolich", name: "Dracolich", tier: "azure", type: "unit_ranged",
    art: "wog_dracolich.png", stats: [7, 2, 10, 16], cost: { gold: 45, valuables: 2 }, fontSize: 11,
    lines: [
      [g("unit_passive"), " Undead. Ignore the penalty vs. adjacent units."],
      ["Ignore ", g("ongoing"), " effects; reduce ", g("spell"), " ", g("damage"), " by 2."],
      [g("movement"), " Move to any empty Battlefield space."],
      ["When attacked, roll 1 Attack die: on \"-1\", reduce ", g("damage"), " by 2."],
      [g("unit_attack"), " Attack a unit adjacent to the target with 4 ", g("attack"), "."]
    ]
  }
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgBuffer(body) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">${body}</svg>`
  );
}

function titleText(name) {
  const size = name.length > 16 ? 38 : name.length > 12 ? 41 : 46;
  return `<text x="385" y="109" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700"
    fill="#f6e7a6" stroke="#170f09" stroke-width="3" paint-order="stroke">${escapeXml(name)}</text>`;
}

function statText(stats) {
  // Values sit below the four printed symbols. The old faction-art path hid
  // each template numeral behind a tall opaque rectangle; those rectangles
  // also covered the lower half of the stat symbols. Every card now starts
  // from cleanNeutralFrame(), which removes only the old numeral pixels.
  const ys = [286, 456, 611, 795];
  const labels = stats.map((value, index) => {
    const size = String(value).length > 1 ? 29 : 34;
    return `<text x="119" y="${ys[index]}" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700"
      fill="#fff4c8" stroke="#140c07" stroke-width="3" paint-order="stroke">${value}</text>`;
  }).join("");
  return labels;
}

function neutralCost(cost, paintPatch = true) {
  if (typeof cost === "object") {
    return `${paintPatch ? '<rect x="474" y="766" width="190" height="50" rx="4" fill="#50472d" fill-opacity="0.99"/>' : ""}
      <text x="518" y="793" text-anchor="middle" dominant-baseline="middle"
        font-family="Georgia, 'Times New Roman', serif" font-size="31" font-weight="700"
        fill="#fff2c4" stroke="#160e08" stroke-width="3" paint-order="stroke">${cost.gold}</text>
      <text x="621" y="793" text-anchor="middle" dominant-baseline="middle"
        font-family="Georgia, 'Times New Roman', serif" font-size="31" font-weight="700"
        fill="#fff2c4" stroke="#160e08" stroke-width="3" paint-order="stroke">${cost.valuables}</text>`;
  }
  return `${paintPatch ? '<rect x="474" y="766" width="158" height="50" rx="4" fill="#50472d" fill-opacity="0.99"/>' : ""}
    <text x="563" y="793" text-anchor="middle" dominant-baseline="middle"
      font-family="Georgia, 'Times New Roman', serif" font-size="33" font-weight="700"
      fill="#fff2c4" stroke="#160e08" stroke-width="3" paint-order="stroke">${cost}</text>`;
}

async function glyphDataUri(name) {
  const source = await readFile(path.join(GLYPHS, `${name}.svg`), "utf8");
  const tinted = source.replaceAll("currentColor", "#f0d56b");
  return `data:image/svg+xml;base64,${Buffer.from(tinted).toString("base64")}`;
}

function textWidth(text, fontSize) {
  return text.length * fontSize * 0.51;
}

async function abilityPanel(card) {
  const top = 830;
  const height = 142;
  const fontSize = card.fontSize ?? 21;
  const lineHeight = fontSize + 9;
  const firstY = 838 + (height - card.lines.length * lineHeight) / 2 + fontSize * 0.72;
  let body = `<rect x="69" y="${top}" width="641" height="${height}" fill="#282019" fill-opacity="0.985" stroke="#8d683c" stroke-width="3"/>`;

  for (let lineIndex = 0; lineIndex < card.lines.length; lineIndex += 1) {
    const line = card.lines[lineIndex];
    const glyphSize = fontSize + 3;
    const widths = line.map((token) =>
      typeof token === "string" ? textWidth(token, fontSize) : glyphSize + 3
    );
    let x = 389 - widths.reduce((sum, width) => sum + width, 0) / 2;
    const y = firstY + lineIndex * lineHeight;

    for (let tokenIndex = 0; tokenIndex < line.length; tokenIndex += 1) {
      const token = line[tokenIndex];
      if (typeof token === "string") {
        body += `<text x="${x}" y="${y}" dominant-baseline="middle"
          font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700"
          fill="#fff1c2" stroke="#160e08" stroke-width="1.4" paint-order="stroke">${escapeXml(token)}</text>`;
      } else {
        const href = await glyphDataUri(token.glyph);
        body += `<image href="${href}" x="${x}" y="${y - glyphSize / 2}" width="${glyphSize}" height="${glyphSize}" preserveAspectRatio="xMidYMid meet"/>`;
      }
      x += widths[tokenIndex];
    }
  }

  return body;
}

async function cleanTitlePatch(tier) {
  return sharp(path.join(ASSETS, `units-blank-${tier}.webp`))
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .extract({ left: 49, top: 40, width: 675, height: 130 })
    .png()
    .toBuffer();
}

async function sharedArt(card) {
  if (card.art) {
    return sharp(path.join(GENERATED_ART, card.art))
      .resize(ART_WIDTH, ART_HEIGHT, { fit: "cover", position: card.artPosition ?? "center" })
      .png()
      .toBuffer();
  }
  const crop = SOURCE_CROPS[card.family];
  return sharp(path.join(ASSETS, card.source))
    .extract(crop)
    .resize(ART_WIDTH, ART_HEIGHT, { fit: "fill" })
    .png()
    .toBuffer();
}

const cleanFrameCache = new Map();

async function cleanNeutralFrame(tier) {
  if (cleanFrameCache.has(tier)) return cleanFrameCache.get(tier);

  const promise = (async () => {
    const { data, info } = await sharp(path.join(ASSETS, NEUTRAL_TEMPLATES[tier]))
      .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const original = Buffer.from(data);
    const mask = new Uint8Array(info.width * info.height);
    const numberAreas = [
      { left: 94, top: 260, width: 51, height: 54 },
      { left: 94, top: 427, width: 51, height: 60 },
      { left: 94, top: 582, width: 51, height: 64 },
      { left: 94, top: 768, width: 51, height: 58 }
    ];

    // The printed numerals are pale cream. Select their bright cores inside the
    // four value-only regions, then dilate to include antialiasing and outlines.
    for (const area of numberAreas) {
      for (let y = area.top; y < area.top + area.height; y += 1) {
        for (let x = area.left; x < area.left + area.width; x += 1) {
          const offset = (y * info.width + x) * info.channels;
          const [r, green, b] = [original[offset], original[offset + 1], original[offset + 2]];
          if (r > 140 && green > 115 && b > 70) mask[y * info.width + x] = 1;
        }
      }
    }
    for (let pass = 0; pass < 5; pass += 1) {
      const grown = mask.slice();
      for (const area of numberAreas) {
        for (let y = area.top; y < area.top + area.height; y += 1) {
          for (let x = area.left; x < area.left + area.width; x += 1) {
            if (!mask[y * info.width + x]) continue;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= area.left && nx < area.left + area.width && ny >= area.top && ny < area.top + area.height) {
                grown[ny * info.width + nx] = 1;
              }
            }
          }
        }
      }
      mask.set(grown);
    }

    // Fill each removed numeral pixel by interpolating the nearest untouched
    // texture on that same scanline. This changes the glyph itself only: there
    // is no rectangular paint layer and no contact with a stat symbol.
    for (const area of numberAreas) {
      for (let y = area.top; y < area.top + area.height; y += 1) {
        for (let x = area.left; x < area.left + area.width; x += 1) {
          if (!mask[y * info.width + x]) continue;
          let left = x - 1;
          let right = x + 1;
          while (left >= area.left && mask[y * info.width + left]) left -= 1;
          while (right < area.left + area.width && mask[y * info.width + right]) right += 1;
          const target = (y * info.width + x) * info.channels;
          for (let channel = 0; channel < 3; channel += 1) {
            if (left >= area.left && right < area.left + area.width) {
              const a = original[(y * info.width + left) * info.channels + channel];
              const b = original[(y * info.width + right) * info.channels + channel];
              const t = (x - left) / (right - left);
              data[target + channel] = Math.round(a + (b - a) * t);
            } else {
              const sampleX = left >= area.left ? left : right;
              data[target + channel] = original[(y * info.width + sampleX) * info.channels + channel];
            }
          }
        }
      }
    }

    return sharp(data, { raw: info }).png().toBuffer();
  })();
  cleanFrameCache.set(tier, promise);
  return promise;
}

async function unitTypeMark(card) {
  if (!card.type) return "";
  const href = await glyphDataUri(card.type);
  return `<image href="${href}" x="184" y="174" width="48" height="48" preserveAspectRatio="xMidYMid meet"/>`;
}

async function buildCard(card) {
  const titlePatch = await cleanTitlePatch(card.tier);
  const art = await sharedArt(card);
  const cleanFrame = await cleanNeutralFrame(card.tier);
  const valuablesCostIcon = typeof card.cost === "object"
    ? await sharp(path.join(ASSETS, "specialty-card", "icon-valuables.webp"))
      .resize(40, 40, { fit: "contain" })
      .png()
      .toBuffer()
    : null;
  const overlay = svgBuffer(
    titleText(card.name) +
    statText(card.stats) +
    neutralCost(card.cost) +
    await unitTypeMark(card) +
    await abilityPanel(card)
  );
  const destination = path.join(ASSETS, `units-neutral-${card.tier}-${card.slug}.webp`);

  await sharp(cleanFrame)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
    .composite([
      { input: titlePatch, left: 49, top: 40 },
      { input: art, left: ART_LEFT, top: ART_TOP },
      { input: overlay },
      ...(valuablesCostIcon ? [{ input: valuablesCostIcon, left: 551, top: 772 }] : [])
    ])
    .webp(WEBP)
    .toFile(destination);
  return destination;
}

await mkdir(ASSETS, { recursive: true });
await mkdir(OUT, { recursive: true });

const requestedSlugs = new Set(process.argv.slice(2));
const cardsToBuild = requestedSlugs.size > 0
  ? CARDS.filter((card) => requestedSlugs.has(card.slug))
  : CARDS;
if (requestedSlugs.size > 0 && cardsToBuild.length !== requestedSlugs.size) {
  const known = new Set(cardsToBuild.map((card) => card.slug));
  const unknown = [...requestedSlugs].filter((slug) => !known.has(slug));
  throw new Error(`Unknown card slug(s): ${unknown.join(", ")}`);
}

const outputs = [];
for (const card of cardsToBuild) outputs.push(await buildCard(card));

const previewWidth = 248;
const previewHeight = 347;
const previewGap = 10;
const previewColumns = 7;
const previewRows = Math.ceil(outputs.length / previewColumns);
const previews = await Promise.all(outputs.map((output) =>
  sharp(output).resize(previewWidth, previewHeight, { fit: "fill" }).png().toBuffer()
));
await sharp({
  create: {
    width: previewColumns * previewWidth + (previewColumns - 1) * previewGap,
    height: previewRows * previewHeight + (previewRows - 1) * previewGap,
    channels: 4,
    background: "#15100c"
  }
})
  .composite(previews.map((input, index) => ({
    input,
    left: (index % previewColumns) * (previewWidth + previewGap),
    top: Math.floor(index / previewColumns) * (previewHeight + previewGap)
  })))
  .png()
  .toFile(path.join(OUT, "placeholder-neutral-cards-contact-sheet.png"));

for (const output of outputs) console.log(path.relative(ROOT, output));
