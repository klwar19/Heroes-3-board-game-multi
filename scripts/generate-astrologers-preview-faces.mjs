import sharp from "sharp";
import { resolve } from "node:path";

// The parchment/frame is generated artwork; the rule wording is typeset here
// so the shipped card faces cannot acquire image-generation spelling errors.
// Faces ship in the standard Astrologers card format (1040x743, like every
// /assets/astrologers_proclaim-* face) at a compact quality that keeps the
// rules text readable.
const base = resolve("scripts/astrologers-preview-frame.webp");
const cards = [
  {
    slug: "slow",
    name: "Slow",
    lines: [
      "Until the next Astrologers' round:",
      "All Ground and Flying units have -1 Movement",
      "during Combat, to a minimum of 1."
    ]
  },
  {
    slug: "construction",
    name: "Construction",
    lines: [
      "Until the next Astrologers' round:",
      "When you build a new building,",
      "it costs 3 gold less (minimum 0)."
    ]
  },
  {
    slug: "new_buildings",
    name: "New Buildings",
    lines: [
      "Each player may choose one unbuilt building",
      "that is not a Unit Dwelling and build it",
      "without paying its cost."
    ]
  }
];

const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("'", "&apos;").replaceAll("<", "&lt;");
for (const card of cards) {
  const rule = card.lines.map((line, index) =>
    `<text x="520" y="${305 + index * 52}" class="rule">${escape(line)}</text>`
  ).join("");
  const overlay = Buffer.from(`<svg width="1040" height="743" xmlns="http://www.w3.org/2000/svg">
    <style>
      .heading { fill:#f6efdc; font-family:Georgia,serif; font-size:36px; font-weight:bold; text-anchor:middle; }
      .name { fill:#fff7df; font-family:Georgia,serif; font-size:48px; font-weight:bold; text-anchor:middle; }
      .rule { fill:#f7f0df; font-family:Georgia,serif; font-size:31px; text-anchor:middle; }
      .footer { fill:#d5ae6e; font-family:Georgia,serif; font-size:17px; letter-spacing:3.5px; text-anchor:middle; }
    </style>
    <text x="520" y="131" class="heading">Astrologers proclaim week of the</text>
    <text x="520" y="192" class="name">${escape(card.name)}</text>
    <path d="M 251 229 H 789 M 251 512 H 789" stroke="#bd9659" stroke-width="2" opacity=".8"/>
    ${rule}
    <text x="520" y="595" class="footer">ASTROLOGERS PROCLAIM</text>
  </svg>`);
  await sharp(base).composite([{ input: overlay }]).webp({ quality: 50, alphaQuality: 60, effort: 6 })
    .toFile(resolve(`public/game-tokens/astrologers/${card.slug}.webp`));
}
