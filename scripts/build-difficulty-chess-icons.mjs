/**
 * Build the Setup Hub's difficulty chess-piece icons:
 *   Easy = Pawn · Normal = Knight · Hard = Rook · Impossible = King
 * Output: public/assets/ui/difficulty-{pawn,knight,rook,king}.webp
 *
 * Source is ONE painted master sheet — scripts/chess-art/difficulty-chess-master.webp,
 * the four pieces side by side on a black field (provenance + the regeneration
 * prompt: scripts/chess-art/README.md). Cutting all four from one sheet is the
 * point: they share a sculpt, a metal and a light direction, so the row reads as
 * one set instead of four separate drawings.
 *
 * Deterministic — safe to re-run; the same master always yields the same icons.
 *
 * Pipeline (all of it lives here, no hand-editing between steps):
 *  1. Auto-detect the four pieces as column bands of non-black pixels. It
 *     ASSERTS exactly four, so a regenerated master that merged or split a piece
 *     fails loudly instead of writing a silently wrong icon.
 *  2. Cut the black field with a border flood fill, NOT a luminance threshold —
 *     the pieces' own dark bronze shadows have to stay opaque, and they do,
 *     because lit metal walls them off from the border.
 *  3. Erode the mask 1px (kills the black rim the master blends into the field)
 *     then soften it 1px so the cut edge is not a staircase.
 *  4. Scale every piece by ONE common factor and stand them all on the same
 *     baseline, so the icons keep the real pawn < knight < rook < king height
 *     ladder — which is the difficulty ladder the bar is showing.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const MASTER = "scripts/chess-art/difficulty-chess-master.webp";
const OUT = "public/assets/ui";
/** Left-to-right on the master. */
const PIECES = ["pawn", "knight", "rook", "king"];
const SIZE = 256;
/** Transparent breathing room, so no piece touches the icon's edge. */
const MARGIN = 10;
/**
 * At or below this max-channel value is the black field, not metal. It has to
 * hug pure black: the master's field is 74% of the sheet at 0–9, and everything
 * above ~10 is a smooth ramp that belongs to the PIECES' shading. A generous
 * threshold (60 was the first try) lets the fill walk up a piece's shadow side
 * and hollow it out — the icon then only looks right because the UI behind it
 * happens to be dark too.
 */
const FIELD_LEVEL = 12;

/** Max channel — reads warm bronze brighter than a plain average would. */
function luma(data, index) {
  return Math.max(data[index], data[index + 1], data[index + 2]);
}

/**
 * Background mask by flood fill from the image border. A pixel is background
 * only if it is dark AND reachable from the edge through dark pixels, so the
 * dark interior of a piece (deep relief, the shadow under a crown) stays solid.
 */
function floodFillField(data, width, height, channels) {
  const isField = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    const p = y * width + x;
    if (isField[p]) {
      return;
    }
    if (luma(data, p * channels) > FIELD_LEVEL) {
      return;
    }
    isField[p] = 1;
    queue[tail] = p;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const p = queue[head];
    head += 1;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }
  return isField;
}

/** One pass of 4-neighbour erosion — pulls the mask off the blended black rim. */
function erode(alpha, width, height) {
  const next = new Uint8Array(alpha.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (!alpha[p]) {
        continue;
      }
      const up = y > 0 ? alpha[p - width] : 0;
      const down = y < height - 1 ? alpha[p + width] : 0;
      const left = x > 0 ? alpha[p - 1] : 0;
      const right = x < width - 1 ? alpha[p + 1] : 0;
      next[p] = up && down && left && right ? 255 : 0;
    }
  }
  return next;
}

/** 3×3 box blur — the 1px feather that keeps the cut edge from stair-stepping. */
function soften(alpha, width, height) {
  const next = new Uint8Array(alpha.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          sum += alpha[ny * width + nx];
          count += 1;
        }
      }
      next[y * width + x] = Math.round(sum / count);
    }
  }
  return next;
}

/** Column bands of non-field pixels — one per piece, left to right. */
function columnBands(alpha, width, height) {
  const bands = [];
  let start = null;
  for (let x = 0; x < width; x += 1) {
    let filled = false;
    for (let y = 0; y < height; y += 1) {
      if (alpha[y * width + x] > 8) {
        filled = true;
        break;
      }
    }
    if (filled && start === null) {
      start = x;
    }
    if (!filled && start !== null) {
      bands.push([start, x - 1]);
      start = null;
    }
  }
  if (start !== null) {
    bands.push([start, width - 1]);
  }
  return bands;
}

/** Vertical extent of one column band. */
function bandRows(alpha, width, height, x0, x1) {
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (alpha[y * width + x] > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        break;
      }
    }
  }
  return [top, bottom];
}

async function main() {
  if (!fs.existsSync(MASTER)) {
    throw new Error(`Missing painted master ${MASTER} — see scripts/chess-art/README.md.`);
  }
  const { data, info } = await sharp(MASTER).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const field = floodFillField(data, width, height, channels);
  let alpha = new Uint8Array(width * height);
  for (let p = 0; p < alpha.length; p += 1) {
    alpha[p] = field[p] ? 0 : 255;
  }
  alpha = soften(erode(alpha, width, height), width, height);

  const bands = columnBands(alpha, width, height);
  if (bands.length !== PIECES.length) {
    throw new Error(
      `Expected ${PIECES.length} pieces on the master, found ${bands.length} column bands ` +
        `(${bands.map(([a, b]) => `${a}-${b}`).join(", ")}). Re-cut or re-generate the master.`
    );
  }

  // Measure every piece FIRST: one shared scale + one shared baseline is what
  // keeps the four icons a set (and keeps the height ladder readable).
  const boxes = bands.map(([x0, x1]) => {
    const [y0, y1] = bandRows(alpha, width, height, x0, x1);
    return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  });
  const tallest = Math.max(...boxes.map((box) => box.h));
  const widest = Math.max(...boxes.map((box) => box.w));
  const inner = SIZE - MARGIN * 2;
  const scale = Math.min(inner / tallest, inner / widest);

  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < alpha.length; p += 1) {
    rgba[p * 4] = data[p * channels];
    rgba[p * 4 + 1] = data[p * channels + 1];
    rgba[p * 4 + 2] = data[p * channels + 2];
    rgba[p * 4 + 3] = alpha[p];
  }

  fs.mkdirSync(OUT, { recursive: true });
  for (let index = 0; index < PIECES.length; index += 1) {
    const piece = PIECES[index];
    const box = boxes[index];
    const targetW = Math.max(1, Math.round(box.w * scale));
    const targetH = Math.max(1, Math.round(box.h * scale));
    const cut = await sharp(rgba, { raw: { width, height, channels: 4 } })
      .extract({ left: box.x0, top: box.y0, width: box.w, height: box.h })
      .resize(targetW, targetH, { fit: "fill" })
      .png()
      .toBuffer();
    const buf = await sharp({
      create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([
        {
          input: cut,
          left: Math.round((SIZE - targetW) / 2),
          // Bottom-aligned: all four stand on one baseline.
          top: SIZE - MARGIN - targetH
        }
      ])
      .webp({ quality: 92, alphaQuality: 100 })
      .toBuffer();
    const out = path.join(OUT, `difficulty-${piece}.webp`);
    fs.writeFileSync(out, buf);
    console.log("wrote", out, `${targetW}x${targetH}`, buf.length);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
