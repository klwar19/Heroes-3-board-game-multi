#!/usr/bin/env python3
"""
Produce the Cove unit card art by cropping the official Cove creature reveal
composite published by Archon Studio on Gamefound, then normalising each card to
the repo's standard unit-card canvas:

  Unit cards -> /assets/units-cove-<tier>-<slug>-<side>.webp   (743x1040)

The fan wiki (en.homm3bg.wiki) does NOT serve the individual Cove cards yet (the
other factions' cards live at /assets/units-<faction>-<tier>-<slug>-<side>.webp,
but the Cove ones 404), so until it does we slice them out of the 1200x1500
"Cove units" reveal image. The crop grid (4 columns x 4 rows, last row 2 cards)
was measured from the gray gaps between cards; see the box table below.

Source (Gamefound update #4, "Stronghold, Conflux & Cove" creature reveals):
  https://gamefound.com/en/projects/archon-studio/.../updates/4
  Cove composite: https://imgcdn.gamefound.com/richtextimage/richtext/<COVE_UUID>.jpg

Every download is validated (HTTP 200 + decodable image); the script aborts
loudly on any miss so a broken asset can never slip through.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
CARD_SIZE = (743, 1040)

# Gamefound CDN id of the 1200x1500 "Cove units" reveal composite.
COVE_UUID = "e8bcb37a-6c8b-4468-be5f-ff03d6edad02"
COMPOSITE_URL = f"https://imgcdn.gamefound.com/richtextimage/richtext/{COVE_UUID}.jpg"

# Card column x-extents and row y-extents, measured from the background gaps in
# the 1200x1500 composite (col bands ~245px wide @ 0.71 card aspect; rows ~342px).
# The first three rows are a full 4-column grid; the last row holds only the two
# Haspids cards, CENTERED under the grid (columns 2-3, not 0-1).
COLS = [(76, 319), (343, 588), (610, 855), (878, 1126)]
ROWS = [(48, 390), (404, 745), (761, 1103), (1117, 1459)]
ROW4_COLS = [(342, 588), (610, 855)]

# (row, col, tier, slug, side). Columns index COLS, except row 3 indexes ROW4_COLS.
CARDS = [
    (0, 0, "bronze", "oceanids", "few"),
    (0, 1, "bronze", "oceanids", "pack"),
    (0, 2, "bronze", "seamen", "few"),
    (0, 3, "bronze", "seamen", "pack"),
    (1, 0, "bronze", "sea_dogs", "few"),
    (1, 1, "bronze", "sea_dogs", "pack"),
    (1, 2, "silver", "ayssids", "few"),
    (1, 3, "silver", "ayssids", "pack"),
    (2, 0, "silver", "sorceresses", "few"),
    (2, 1, "silver", "sorceresses", "pack"),
    (2, 2, "golden", "nix", "few"),
    (2, 3, "golden", "nix", "pack"),
    (3, 0, "golden", "haspids", "few"),
    (3, 1, "golden", "haspids", "pack"),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    data = fetch(COMPOSITE_URL)
    try:
        composite = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:  # pragma: no cover - guard against a bad download
        raise SystemExit(f"FAIL decode composite: {exc}")
    if composite.size != (1200, 1500):
        raise SystemExit(f"FAIL composite is {composite.size}, expected (1200, 1500)")

    for row, col, tier, slug, side in CARDS:
        x0, x1 = ROW4_COLS[col] if row == 3 else COLS[col]
        y0, y1 = ROWS[row]
        card = composite.crop((x0, y0, x1, y1)).resize(CARD_SIZE, Image.LANCZOS)
        name = f"units-cove-{tier}-{slug}-{side}.webp"
        card.save(OUT / name, "WEBP", quality=92, method=6)
        print(f"  card  {name} {card.size}")
    print("Done.")


if __name__ == "__main__":
    main()
