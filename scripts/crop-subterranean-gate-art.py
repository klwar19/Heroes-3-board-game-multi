#!/usr/bin/env python3
"""Crop the two halves of the Subterranean Gate Token illustration into the
board's pointy-top hex tokens.

Source (`scripts/subterranean-gate-art/source.png`) is the two-hex illustration
drawn as FLAT-top hexes (points left/right). The board renders POINTY-top hexes
(points top/bottom, vertical left/right edges — see `hexCornerPoints` in
`screen.tsx`), so each half's art is kept upright and re-masked into a pointy-top
hexagon that matches the board exactly. The corners are transparent, so the token
sits cleanly on the tile scan with no rectangular bleed.

Assignment (the corrected, non-reversed mapping):
- Surface tile shows the skull cave-mouth — the GATE you descend into (left half).
- Underground tile shows the light passage — the ENTRANCE / path up (right half).

Run:  python3 scripts/crop-subterranean-gate-art.py
"""
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "subterranean-gate-art" / "source.png"
OUT_DIR = ROOT / "public" / "assets" / "board" / "tokens"

# Board hex: height = 2*size, width = sqrt(3)*size. size=173 -> 300x346 (aspect
# matches the <image> box the board draws the token into).
TW, TH = 300, 346


def pointy_top_hex_mask(w: int, h: int) -> Image.Image:
    """Alpha mask for a pointy-top hexagon (vertices at top & bottom, vertical
    left/right edges) — identical geometry to the board's `hexCornerPoints`."""
    size = h / 2.0
    cx, cy = w / 2.0, h / 2.0
    points = [
        (cx + size * math.cos(math.radians(60 * i - 30)),
         cy + size * math.sin(math.radians(60 * i - 30)))
        for i in range(6)
    ]
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def crop_half(src: Image.Image, box: tuple[int, int, int, int], mask: Image.Image) -> Image.Image:
    """Cover-fit a source region into the pointy-top hex, art upright, centered."""
    fitted = ImageOps.fit(src.crop(box), (TW, TH), method=Image.LANCZOS, centering=(0.5, 0.5))
    fitted.putalpha(ImageChops.multiply(fitted.getchannel("A"), mask))
    return fitted


def main() -> None:
    src = Image.open(SOURCE).convert("RGBA")
    mask = pointy_top_hex_mask(TW, TH)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # The two flat-top hexes meet at x~438; each half is an aspect-correct
    # (300:346) full-height column centered on its hex.
    crop_half(src, (0, 0, 438, 505), mask).save(OUT_DIR / "subterranean-gate-surface.webp", quality=92)
    crop_half(src, (442, 0, 880, 505), mask).save(OUT_DIR / "subterranean-gate-underground.webp", quality=92)
    print("wrote", OUT_DIR / "subterranean-gate-surface.webp")
    print("wrote", OUT_DIR / "subterranean-gate-underground.webp")


if __name__ == "__main__":
    main()
