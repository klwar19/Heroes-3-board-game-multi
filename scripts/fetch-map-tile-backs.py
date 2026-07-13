#!/usr/bin/env python3
"""
Fetch the REAL printed map-tile back covers and install them as the face-down
tile art (`public/assets/board/backs/back-*.webp`).

Until now the six tile backs were hand-drawn placeholders "in the same style"
as the rulebook (a starry flower with a painted-on numeral). The board-game
asset repo publishes the actual printed backs:

  assets/images/maptiles.png     -> a 2x2 sheet of the four land backs
                                     (I, II-III, IV-V, VI-VII)
  assets/images/map-tile-sea.png -> the golden-wave sea back  (IV-V band; VI-VII variant is board-edited)
  assets/images/map-tile-sub.png -> the cavern-teeth underground back (IV-V band; VI-VII variant is board-edited)

Every printed back is a seven-hex "flower". The board renders each face-down
tile by stretching its back image across the flower's bounding box
(`preserveAspectRatio="none"`, 3:5*sqrt(3) ~= 1.04), so each source flower is
cropped to its own tight alpha bounding box and resized to a uniform 832x800
(the size the previous placeholders shipped at) — that keeps every painted hex
edge on the logical grid.

The four sheet quadrants map to the four land groups:
  top-left     I        -> starting
  top-right    II-III   -> far
  bottom-left  IV-V     -> near
  bottom-right VI-VII   -> center

Sea and Subterranean each ship TWO band backs (IV-V + VI-VII). A boss tile's
face-down art MUST show VI-VII — never the IV-V numeral — so opening a face-down
tile never surprises the player with VII guards under an IV-V back. The VI-VII
variants live as back-sea-vi-vii.webp / back-subterranean-vi-vii.webp (edited
from the printed IV-V art); re-install them if the IV-V sources are re-fetched.

Like the other fetch scripts, every download is validated (HTTP 200 + a
decodable image) and the script aborts loudly on any miss. This is a non-profit
fan project; per src/data/assets/homm-assets.ts these scans are placeholders to
be replaced with owned art before any wider release.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

RAW = "https://raw.githubusercontent.com/Heegu-sama/Homm3BG/main/assets/images"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "board" / "backs"

# Uniform output box; matches the previous placeholders and the flower's
# 3:5*sqrt(3) ~= 1.04 aspect the board stretches each back across.
TARGET = (832, 800)
ALPHA_CUTOFF = 16


def fetch(name: str) -> Image.Image:
    url = f"{RAW}/{name}"
    with urllib.request.urlopen(url, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"HTTP {resp.status} for {url}")
        data = resp.read()
    im = Image.open(io.BytesIO(data))
    im.load()
    return im.convert("RGBA")


def alpha_bbox(im: Image.Image, box=None) -> tuple[int, int, int, int]:
    """Tight bounding box of the (optionally windowed) opaque pixels."""
    region = im.crop(box) if box else im
    alpha = region.split()[3]
    # getbbox() on the thresholded alpha gives the printed flower's extent.
    mask = alpha.point(lambda a: 255 if a > ALPHA_CUTOFF else 0)
    bbox = mask.getbbox()
    if not bbox:
        raise SystemExit("empty tile (no opaque pixels)")
    if box:
        ox, oy = box[0], box[1]
        bbox = (bbox[0] + ox, bbox[1] + oy, bbox[2] + ox, bbox[3] + oy)
    return bbox


def crop_flower(im: Image.Image, box=None) -> Image.Image:
    flower = im.crop(alpha_bbox(im, box))
    return flower.resize(TARGET, Image.LANCZOS)


def save(im: Image.Image, name: str) -> None:
    dest = OUT / name
    im.save(dest, "WEBP", quality=92, method=6)
    # Re-open to prove the written file decodes.
    with Image.open(dest) as check:
        check.load()
    print(f"  wrote {dest.relative_to(OUT.parent.parent.parent)}  {check.size}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    print("maptiles.png -> starting / far / near / center")
    sheet = fetch("maptiles.png")
    w, h = sheet.size
    mx, my = w // 2, h // 2
    quads = {
        "back-starting.webp": (0, 0, mx, my),      # I
        "back-far.webp": (mx, 0, w, my),           # II-III
        "back-near.webp": (0, my, mx, h),          # IV-V
        "back-center.webp": (mx, my, w, h),        # VI-VII
    }
    for name, box in quads.items():
        save(crop_flower(sheet, box), name)

    print("map-tile-sea.png -> sea")
    save(crop_flower(fetch("map-tile-sea.png")), "back-sea.webp")

    print("map-tile-sub.png -> subterranean")
    save(crop_flower(fetch("map-tile-sub.png")), "back-subterranean.webp")

    print("done.")


if __name__ == "__main__":
    main()
