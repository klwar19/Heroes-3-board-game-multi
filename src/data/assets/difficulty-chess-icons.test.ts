/**
 * The Setup Hub's difficulty chess pieces (Easy = Pawn · Normal = Knight ·
 * Hard = Rook · Impossible = King).
 *
 * These assert the ICONS, not just their filenames: every difficulty resolves
 * to a real 256×256 webp with transparency, each piece is cut SOLID (not the
 * see-through ghost a too-generous background cut produces), the four stand on
 * one baseline, and they are scaled together so the set keeps its true chess
 * proportions. Rebuild with `node scripts/build-difficulty-chess-icons.mjs`.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { hasMediaFile, localMediaPath, mediaFileInfo } from "@/lib/media-manifest";
import { DIFFICULTY_CHESS_ICONS } from "./homm-assets";

/** Ascending difficulty — the order the bar renders. */
const LADDER = ["easy", "normal", "hard", "impossible"] as const;
type Difficulty = (typeof LADDER)[number];

/**
 * Absolute paths for all four icons, or null when this checkout has no media
 * pulled (npm run media:pull) — the ALPHA analysis below needs the real bytes,
 * which the manifest does not carry.
 */
function localIconFiles(): Record<Difficulty, string> | null {
  const files = {} as Record<Difficulty, string>;
  for (const difficulty of LADDER) {
    const file = localMediaPath(DIFFICULTY_CHESS_ICONS[difficulty]);
    if (!file) return null;
    files[difficulty] = file;
  }
  return files;
}

/**
 * The piece's opaque bounding box inside the 256×256 icon, plus how solidly it
 * fills its own silhouette.
 *
 * `fill` is measured across each row's span between its first and last opaque
 * pixel — NOT the bounding box, which for a knight or a crowned king is mostly
 * legitimately empty. It separates the two cuts cleanly: the shipped icons
 * measure 0.87–0.92, while a background cut that walks up the pieces' shadow
 * side (FIELD_LEVEL 60 instead of 12) leaves 0.32–0.37 — a hollow shell of
 * highlights that only looks right over a dark panel.
 */
async function measurePiece(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const alphaAt = (x: number, y: number) => data[(y * width + x) * channels + channels - 1];

  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) <= 8) {
        continue;
      }
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  let span = 0;
  let solid = 0;
  for (let y = top; y <= bottom; y += 1) {
    let rowLeft = -1;
    let rowRight = -1;
    for (let x = left; x <= right; x += 1) {
      if (alphaAt(x, y) > 8) {
        if (rowLeft < 0) rowLeft = x;
        rowRight = x;
      }
    }
    if (rowLeft < 0) {
      continue;
    }
    for (let x = rowLeft; x <= rowRight; x += 1) {
      span += 1;
      if (alphaAt(x, y) >= 250) {
        solid += 1;
      }
    }
  }

  return { width, height, top, bottom, left, right, pieceHeight: bottom - top + 1, fill: solid / span };
}

async function measureAll(files: Record<Difficulty, string>) {
  const measured: Record<Difficulty, Awaited<ReturnType<typeof measurePiece>>> = {} as never;
  for (const difficulty of LADDER) {
    measured[difficulty] = await measurePiece(files[difficulty]);
  }
  return measured;
}

describe("difficulty chess-piece icons", () => {
  it("registers one real webp per difficulty", () => {
    expect(Object.keys(DIFFICULTY_CHESS_ICONS).sort()).toEqual([...LADDER].sort());
    for (const difficulty of LADDER) {
      const icon = DIFFICULTY_CHESS_ICONS[difficulty];
      expect(hasMediaFile(icon), `${icon} must be published — run npm run media:publish`).toBe(true);
      const info = mediaFileInfo(icon)!;
      // A painted cut is kilobytes; a flat placeholder silhouette is not.
      expect(info.bytes, `${icon} must contain real art`).toBeGreaterThan(4000);
      // The 256×256 canvas is manifest-level, so it holds with no media pulled.
      expect([info.width, info.height], `${icon} canvas`).toEqual([256, 256]);
    }
  });

  it("cuts each piece SOLID on a transparent 256×256 canvas", async () => {
    const files = localIconFiles();
    if (!files) return;
    const measured = await measureAll(files);
    for (const difficulty of LADDER) {
      const piece = measured[difficulty];
      expect(piece.width, `${difficulty} canvas width`).toBe(256);
      expect(piece.height, `${difficulty} canvas height`).toBe(256);
      // Transparent margin all round — no piece touches the icon's edge.
      expect(piece.left, `${difficulty} left margin`).toBeGreaterThan(0);
      expect(piece.right, `${difficulty} right margin`).toBeLessThan(255);
      expect(piece.top, `${difficulty} top margin`).toBeGreaterThan(0);
      expect(piece.bottom, `${difficulty} bottom margin`).toBeLessThan(255);
      // 0.70 sits well clear of both measured cuts (good ≥ 0.86, leaked ≤ 0.37).
      expect(piece.fill, `${difficulty} must be a solid cut, not a hollow ghost`).toBeGreaterThan(0.7);
    }
  });

  it("stands the four on ONE baseline, scaled together", async () => {
    const files = localIconFiles();
    if (!files) return;
    const measured = await measureAll(files);
    // Same baseline (±1px of rounding): the four read as one set in the bar.
    const baselines = LADDER.map((difficulty) => measured[difficulty].bottom);
    expect(Math.max(...baselines) - Math.min(...baselines)).toBeLessThanOrEqual(1);

    // Scaled by ONE factor, so the set keeps a real chess set's proportions:
    // pawn < rook < knight < king. NOTE this is deliberately NOT the difficulty
    // order (Easy Pawn → Normal Knight → Hard Rook → Impossible King) — a
    // Staunton rook is shorter than its knight, and faking a monotonic ladder
    // would mean scaling the pieces individually and breaking the set.
    const pawn = measured.easy.pieceHeight;
    const knight = measured.normal.pieceHeight;
    const rook = measured.hard.pieceHeight;
    const king = measured.impossible.pieceHeight;
    expect(pawn, "pawn is the shortest piece").toBeLessThan(rook);
    expect(rook, "a Staunton rook is shorter than its knight").toBeLessThan(knight);
    expect(knight, "the king towers over the knight").toBeLessThan(king);
    // Independently normalised icons would all fill the canvas to the same
    // height; the real set spans a wide range.
    expect(king - pawn, "the set must span a real height range").toBeGreaterThan(50);
  });
});
