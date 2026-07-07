#!/usr/bin/env python3
"""Fetch and crop the Morale card faces from the TTS contact sheet.

Provenance for public/assets/morale-cards/sheet/*.png: the source is a single
4096x4030 Tabletop Simulator deck sheet (10 columns x 7 rows of card cells)
that mixes AI cards, ability cards, war machines and the two Morale decks.
The Morale faces live at:
  - row 2, col 10          -> the first Negative Morale card (search one)
  - row 3, cols 1-6, 8-9   -> the other Negative Morale cards (col 7 is the
                              negative deck back, col 10 the positive back)
  - row 4, cols 1-10       -> the ten Positive Morale cards

Composition per the sheet: 10 positive faces, 9 negative faces, with
combat-draw / reroll-die / skip-activation printed twice. (The expansion's
component list says 10 negative cards; the sheet carries 9 — the deck lists in
src/data/cards/morale.ts follow the sheet.) Cells are trimmed by a few pixels
to shave the sheet's cell gutters.

Usage: python3 scripts/fetch-morale-cards-art.py
"""

from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

from PIL import Image

SHEET_URL = "https://steamusercontent-a.akamaihd.net/ugc/5846309606663238924/F2B6969ACC6EE5888467FAF9FE924CA257411E9D/"
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "morale-cards" / "sheet"

COLS, ROWS = 10, 7
TRIM = 10  # px shaved off every cell edge (sheet gutters)

# (row, col) -> output basename, both 1-based, matching the sheet layout above.
CELLS = {
    (2, 10): "negative-research",
    (3, 1): "negative-next-attack-minus-side",
    (3, 2): "negative-next-roll-minus-one",
    (3, 3): "negative-roll-one-less",
    (3, 4): "negative-skip-activation",
    (3, 5): "negative-discard-random-combat",
    (3, 6): "negative-put-token-unit",
    (3, 7): "negative-back-sheet",
    (3, 8): "negative-reroll-minus-one",
    (3, 9): "negative-skip-activation-2",
    (3, 10): "positive-back-sheet",
    (4, 1): "positive-repeat-search",
    (4, 2): "positive-combat-draw-one",
    (4, 3): "positive-combat-power",
    (4, 4): "positive-combat-draw-one-2",
    (4, 5): "positive-reroll-die",
    (4, 6): "positive-reroll-die-2",
    (4, 7): "positive-set-attack-die-plus",
    (4, 8): "positive-remove-token",
    (4, 9): "positive-replace-adventure-card",
    (4, 10): "positive-redraw-hand",
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with urlopen(SHEET_URL) as response:
        sheet = Image.open(BytesIO(response.read())).convert("RGB")
    cell_w, cell_h = sheet.width / COLS, sheet.height / ROWS
    for (row, col), name in sorted(CELLS.items()):
        left = int((col - 1) * cell_w) + TRIM
        top = int((row - 1) * cell_h) + TRIM
        crop = sheet.crop((left, top, int(col * cell_w) - TRIM, int(row * cell_h) - TRIM))
        crop.save(OUT_DIR / f"{name}.png")
        print(f"saved {name}.png ({crop.width}x{crop.height})")


if __name__ == "__main__":
    main()
