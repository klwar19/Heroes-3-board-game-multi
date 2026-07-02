#!/usr/bin/env python3
"""
Build the two Stronghold town-board tiles that have no fan-board tile art:

  public/assets/town-board/stronghold-citadel.webp
  public/assets/town-board/stronghold-mage_guild.webp

The Stronghold fan board (towns-stronghold-board.webp) ships only six painted
building tiles; the Citadel and Mage Guild bars would otherwise fall back to
the blurred letterboxed PC renders. Per the printed-tile convention (391x819,
see public/assets/town-board/README.md) these two are sliced from the fully
built PC townscape "Stronghold-in.png" on heroes.thelazy.net:

  - Citadel: the crenellated fortress complex, full-height slice (the Mage
    Guild tower shows at the edge as skyline, the fort is centre stage).
  - Mage Guild: a tight crop of the white spike-crowned guild tower on the
    cliff (verified against Stronghold_Mage_Guild_level_3_large.gif — the tall
    DARK column further left is the Hall of Valhalla, not the guild).

Idempotent: existing non-empty targets are skipped.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "assets" / "town-board"
SOURCE = "https://heroes.thelazy.net/index.php/Special:FilePath/Stronghold-in.png"

# (target file, crop box on the 800x374 town screen) — resized to the shared
# 391x819 tile size afterwards.
TILES = {
    "stronghold-citadel.webp": (391, 0, 570, 374),
    "stronghold-mage_guild.webp": (470, 0, 580, 230),
}


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    missing = {name: box for name, box in TILES.items() if not (ROOT / name).exists() or (ROOT / name).stat().st_size == 0}
    if not missing:
        print("  = all stronghold tiles already present")
        return
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "Mozilla/5.0 (town-board fetch script)"})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    town = Image.open(io.BytesIO(data))
    town.load()
    town = town.convert("RGB")
    if town.size != (800, 374):
        # The crop boxes were measured on the 800x374 upload; scale them if the
        # wiki ever republishes the image at another size.
        sx, sy = town.width / 800, town.height / 374
        missing = {n: (round(b[0] * sx), round(b[1] * sy), round(b[2] * sx), round(b[3] * sy)) for n, b in missing.items()}
    for name, box in missing.items():
        tile = town.crop(box).resize((391, 819), Image.LANCZOS)
        tile.save(ROOT / name, "WEBP", quality=90, method=6)
        print(f"  + {name} (from {box})")


if __name__ == "__main__":
    main()
