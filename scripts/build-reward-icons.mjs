/**
 * Build polished HD reward / house-rule icons from Homm3BG glyphs + existing art.
 * Origin-faithful silhouettes, gold metal treatment, transparent webp for UI chips.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUT = "public/assets/ui";
const GLYPH = "public/assets/glyphs";

function goldSvg(svg, { fill = "#e8c56a", stroke = "#8a6a28" } = {}) {
  let s = svg;
  s = s.replaceAll('fill="currentColor"', `fill="${fill}"`);
  s = s.replaceAll('stroke="currentColor"', `stroke="${stroke}"`);
  // Drop inkscape chrome that confuses sharp sometimes
  s = s.replace(/inkscape:[a-zA-Z-]+="[^"]*"/g, "");
  s = s.replace(/sodipodi:[a-zA-Z-]+="[^"]*"/g, "");
  if (!s.includes("fill=") && !s.includes("fill:")) {
    s = s.replace("<svg", `<svg fill="${fill}"`);
  }
  return s;
}

async function glyphToWebp(name, outName, size = 256) {
  const raw = fs.readFileSync(path.join(GLYPH, `${name}.svg`), "utf8");
  const svg = goldSvg(raw);
  const buf = await sharp(Buffer.from(svg), { density: 400 })
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
  const out = path.join(OUT, outName);
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length);
}

/** Soft gold circular badge with optional center composition. */
async function medallionWebp(outName, centerSvg, size = 256) {
  const ring = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="40%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#f6e2a0"/>
      <stop offset="55%" stop-color="#c9a14a"/>
      <stop offset="100%" stop-color="#6e4e18"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff2c2"/>
      <stop offset="50%" stop-color="#b8882e"/>
      <stop offset="100%" stop-color="#5a3c12"/>
    </linearGradient>
  </defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.46}" fill="url(#g)" stroke="url(#rim)" stroke-width="${size * 0.04}"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.38}" fill="none" stroke="#3a2810" stroke-width="${size * 0.012}" opacity="0.55"/>
</svg>`;
  const base = await sharp(Buffer.from(ring)).png().toBuffer();
  const center = await sharp(Buffer.from(centerSvg), { density: 350 })
    .resize(Math.round(size * 0.58), Math.round(size * 0.58), {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  const buf = await sharp(base)
    .composite([{ input: center, gravity: "center" }])
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
  const out = path.join(OUT, outName);
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Starting-bonus + treasure-face chips (origin silhouettes, HD transparent webp)
  await glyphToWebp("resource_die", "icon-resource-tools.webp", 320);
  await glyphToWebp("artifact", "icon-artifact-pendant.webp", 320);
  await glyphToWebp("experience", "icon-experience-banner.webp", 320);
  await glyphToWebp("2_treasure_die", "icon-double-resource.webp", 320);
  await glyphToWebp("treasure", "icon-treasure-chest-glyph.webp", 320);

  // Prefer the already-great photoreal tools art for resource die (origin-close)
  // by also shipping a "hd" alias that composites it onto a soft gold plate.
  if (fs.existsSync(path.join(OUT, "dice-resource-tools.webp"))) {
    const tools = await sharp(path.join(OUT, "dice-resource-tools.webp"))
      .resize(280, 280, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const plate = `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <defs>
    <radialGradient id="p" cx="40%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#2a2014" stop-opacity="0.0"/>
      <stop offset="70%" stop-color="#1a140c" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#0a0804" stop-opacity="0.35"/>
    </radialGradient>
  </defs>
  <circle cx="160" cy="160" r="150" fill="url(#p)"/>
</svg>`;
    const plateBuf = await sharp(Buffer.from(plate)).png().toBuffer();
    const buf = await sharp(plateBuf)
      .composite([{ input: tools, gravity: "center" }])
      .webp({ quality: 94, alphaQuality: 100 })
      .toBuffer();
    fs.writeFileSync(path.join(OUT, "starting-bonus-resource.webp"), buf);
    console.log("wrote starting-bonus-resource.webp", buf.length);
  } else {
    await glyphToWebp("resource_die", "starting-bonus-resource.webp", 320);
  }

  // Artifact starting bonus = polished pendant on subtle plate
  {
    const raw = goldSvg(fs.readFileSync(path.join(GLYPH, "artifact.svg"), "utf8"), {
      fill: "#f0d48a",
      stroke: "#9a7020"
    });
    const pendant = await sharp(Buffer.from(raw), { density: 420 })
      .resize(260, 260, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const plate = `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <defs>
    <radialGradient id="p" cx="40%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#3a2a12" stop-opacity="0.0"/>
      <stop offset="100%" stop-color="#120c06" stop-opacity="0.4"/>
    </radialGradient>
  </defs>
  <circle cx="160" cy="160" r="150" fill="url(#p)"/>
</svg>`;
    const buf = await sharp(Buffer.from(plate))
      .composite([{ input: pendant, gravity: "center" }])
      .webp({ quality: 94, alphaQuality: 100 })
      .toBuffer();
    fs.writeFileSync(path.join(OUT, "starting-bonus-artifact.webp"), buf);
    console.log("wrote starting-bonus-artifact.webp", buf.length);
  }

  // Rule 111 medallion: swap arrows + dice + bronze unit hint (no text)
  const rule111Center = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <!-- two small unit shields -->
  <g transform="translate(28,70)">
    <path d="M20 4 L40 12 L40 36 Q30 48 20 52 Q10 48 0 36 L0 12 Z" fill="#b87333" stroke="#5a3a18" stroke-width="3"/>
    <circle cx="20" cy="28" r="7" fill="#f0d48a"/>
  </g>
  <g transform="translate(132,70)">
    <path d="M20 4 L40 12 L40 36 Q30 48 20 52 Q10 48 0 36 L0 12 Z" fill="#c9a14a" stroke="#5a3a18" stroke-width="3"/>
    <circle cx="20" cy="28" r="7" fill="#f6e2a0"/>
  </g>
  <!-- curved swap arrows -->
  <path d="M70 55 Q100 28 130 55" fill="none" stroke="#f6e2a0" stroke-width="8" stroke-linecap="round"/>
  <path d="M120 48 L134 56 L118 64" fill="#f6e2a0"/>
  <path d="M130 145 Q100 172 70 145" fill="none" stroke="#f6e2a0" stroke-width="8" stroke-linecap="round"/>
  <path d="M80 152 L66 144 L82 136" fill="#f6e2a0"/>
  <!-- small die -->
  <g transform="translate(82,82)">
    <rect x="0" y="0" width="36" height="36" rx="6" fill="#f0e6d0" stroke="#6a4a20" stroke-width="3"/>
    <circle cx="11" cy="11" r="3.2" fill="#3a2810"/>
    <circle cx="25" cy="11" r="3.2" fill="#3a2810"/>
    <circle cx="11" cy="25" r="3.2" fill="#3a2810"/>
    <circle cx="25" cy="25" r="3.2" fill="#3a2810"/>
    <circle cx="18" cy="18" r="3.2" fill="#3a2810"/>
  </g>
</svg>`;
  await medallionWebp("rule-111-icon.webp", rule111Center, 288);

  // Treasure-face pack (notice chips) — copy polished names used by code
  for (const [src, dest] of [
    ["icon-experience-banner.webp", "treasure-face-experience.webp"],
    ["icon-artifact-pendant.webp", "treasure-face-artifact.webp"],
    ["starting-bonus-resource.webp", "treasure-face-resource-die.webp"],
    ["icon-double-resource.webp", "treasure-face-double-resource.webp"]
  ]) {
    fs.copyFileSync(path.join(OUT, src), path.join(OUT, dest));
    console.log("alias", dest);
  }

  // Cleanup temp gens
  for (const f of fs.readdirSync(OUT)) {
    if (f.startsWith("_gen-") || f.startsWith("_ref-") || f.startsWith("_check")) {
      fs.unlinkSync(path.join(OUT, f));
      console.log("rm", f);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
