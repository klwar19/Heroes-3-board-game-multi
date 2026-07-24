/**
 * Build the Setup Hub's difficulty chess-piece icons:
 *   Easy = Pawn · Normal = Knight · Hard = Rook · Impossible = King
 * Gold-metal silhouettes on transparent webp, matching the reward-icon
 * treatment (build-reward-icons.mjs). Deterministic — safe to re-run.
 * Output: public/assets/ui/difficulty-{pawn,knight,rook,king}.webp
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUT = "public/assets/ui";
const SIZE = 256;

/** Shared chrome: gold gradient + dark stroke + plinth every piece stands on. */
function pieceSvg(body) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f6e2a0"/>
      <stop offset="55%" stop-color="#c9a14a"/>
      <stop offset="100%" stop-color="#7a561c"/>
    </linearGradient>
    <linearGradient id="plinth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8c56a"/>
      <stop offset="100%" stop-color="#5a3c12"/>
    </linearGradient>
  </defs>
  <g fill="url(#gold)" stroke="#3a2810" stroke-width="3" stroke-linejoin="round">
    ${body}
  </g>
</svg>`;
}

const PLINTH = `<rect x="32" y="92" width="56" height="14" rx="4" fill="url(#plinth)"/>`;

const PIECES = {
  pawn: pieceSvg(`
    ${PLINTH}
    <circle cx="60" cy="36" r="14"/>
    <rect x="45" y="50" width="30" height="7" rx="3.5"/>
    <path d="M53 57 C53 70 48 82 43 92 L77 92 C72 82 67 70 67 57 Z"/>
  `),
  knight: pieceSvg(`
    ${PLINTH}
    <path d="M40 92
             C37 80 41 71 45 63
             C47 58 46 54 41 53
             L30 51
             Q24 49 26 42
             L36 37
             C38 28 43 21 50 18
             L49 9
             L57 17
             L64 11
             L65 22
             C74 30 79 43 79 57
             C79 70 80 81 82 92 Z"/>
    <circle cx="46" cy="33" r="2.6" fill="#3a2810" stroke="none"/>
  `),
  rook: pieceSvg(`
    ${PLINTH}
    <path d="M40 22 L50 22 L50 31 L55 31 L55 22 L65 22 L65 31 L70 31 L70 22 L80 22 L80 40 L74 46 L46 46 L40 40 Z"/>
    <path d="M47 46 L73 46 L71 82 L49 82 Z"/>
    <rect x="43" y="82" width="34" height="10" rx="3"/>
  `),
  king: pieceSvg(`
    ${PLINTH}
    <rect x="57" y="6" width="6" height="20" rx="2"/>
    <rect x="50" y="12" width="20" height="6" rx="2"/>
    <path d="M45 32 Q60 24 75 32 L71 48 L49 48 Z"/>
    <path d="M50 48 C50 63 45 79 41 92 L79 92 C75 79 70 63 70 48 Z"/>
    <rect x="46" y="48" width="28" height="6" rx="3"/>
  `)
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [piece, svg] of Object.entries(PIECES)) {
    const buf = await sharp(Buffer.from(svg), { density: 400 })
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 92, alphaQuality: 100 })
      .toBuffer();
    const out = path.join(OUT, `difficulty-${piece}.webp`);
    fs.writeFileSync(out, buf);
    console.log("wrote", out, buf.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
