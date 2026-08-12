#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 743, H = 1040;
const ART = { left: 173, top: 157, width: 509, height: 597 };
const framePath = path.join(ROOT, "public/assets/units-blank-bronze.webp");
const masterRoot = path.join(ROOT, "scripts/anime-art/raw/mgq/spirits");
const outputRoot = path.join(ROOT, "public/assets/anime/units/mgq");

const cards = [
  { slug: "sylph", name: "Sylph", type: "FLYING", color: "#9ad8b0",
    few: { stats: [1,0,3,8], text: "Elemental damage. Attacks do not provoke Retaliation." },
    pack: { stats: [2,0,5,15], text: "Elemental damage; no Retaliation. Your other troops gain +1 Initiative." } },
  { slug: "gnome", name: "Gnome", type: "GROUND", color: "#a87943",
    few: { stats: [2,2,2,4], text: "Always rolls the Defend die when attacked." },
    pack: { stats: [3,2,4,5], text: "Always rolls the Defend die. Adjacent allies are treated as having a Defense token." } },
  { slug: "undine", name: "Undine", type: "GROUND", color: "#315ca7",
    few: { stats: [2,0,4,5], text: "Before moving, heal 1 damage from another friendly unit." },
    pack: { stats: [3,0,7,6], text: "Before moving, heal 2 damage from another friendly unit. Immune to Water Magic." } },
  { slug: "salamander", name: "Salamander", type: "GROUND", color: "#a83d24",
    few: { stats: [3,1,3,6], text: "Reroll every -1 rolled by Salamander." },
    pack: { stats: [4,1,4,7], text: "Roll 2 Attack dice and apply both results. Reroll every -1." } }
];

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function lines(text, max = 49) {
  const out = []; let line = "";
  for (const word of text.split(/\s+/u)) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > max) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

async function art(card) {
  const master = sharp(path.join(masterRoot, `${card.slug}-master.png`));
  if (!card.canonical) return master.resize(ART.width, ART.height, { fit: "cover", position: "attention" }).png().toBuffer();
  // The wiki sprites contain opaque pure-black padding blocks outside the
  // character. Clear only those exact near-black pixels before compositing;
  // colored outlines and all canonical character pixels remain unchanged.
  const { data, info } = await master.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 10 && data[i + 1] < 10 && data[i + 2] < 10) data[i + 3] = 0;
  }
  return sharp(data, { raw: info })
    .resize(ART.width, ART.height, { fit: "contain", background: card.color })
    .flatten({ background: card.color })
    .png()
    .toBuffer();
}

function overlay(card, side) {
  const face = card[side], [attack, defense, health, initiative] = face.stats;
  const ruleLines = lines(face.text);
  const rule = ruleLines.map((line, i) => `<text x="371" y="${900 + i * 25}" class="rule">${esc(line)}</text>`).join("");
  const label = side === "few" ? "BASIC · HERO LEVELS 1–3" : "ADVANCED · HERO LEVELS 4–7";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s"><feDropShadow dy="2" stdDeviation="1" flood-opacity=".9"/></filter></defs><style>.t,.st,.rule,.label,.kind{font-family:Georgia,serif;font-weight:700;fill:#f5e9bd;text-anchor:middle;filter:url(#s)}.t{font-size:40px}.st{font-size:36px}.rule{font-size:18px;fill:#fff8e7}.label{font-size:22px;letter-spacing:1px}.kind{font-size:13px}</style><text x="371" y="111" class="t">${card.name}</text><text x="118" y="286" class="st">${attack}</text><text x="118" y="435" class="st">${defense}</text><text x="118" y="584" class="st">${health}</text><text x="118" y="732" class="st">${initiative}</text><rect x="190" y="171" width="121" height="38" rx="8" fill="#17130dcc" stroke="#d9bd75" stroke-width="2"/><text x="250" y="196" class="kind">${card.type}</text><rect x="61" y="764" width="622" height="66" fill="#372615" stroke="#b99759" stroke-width="3"/><text x="372" y="807" class="label">${label}</text>${rule}</svg>`);
}

await mkdir(outputRoot, { recursive: true });
const frame = await sharp(framePath).resize(W, H, { fit: "fill" }).png().toBuffer();
for (const card of cards) {
  const illustration = await art(card);
  for (const side of ["few", "pack"]) {
    const out = path.join(outputRoot, `units-mgq-spirit-${card.slug}-${side}.webp`);
    await sharp(frame).composite([{ input: illustration, left: ART.left, top: ART.top }, { input: overlay(card, side) }]).webp({ quality: 92, effort: 6 }).toFile(out);
    console.log(path.relative(ROOT, out));
  }
}
