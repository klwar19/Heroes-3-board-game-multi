#!/usr/bin/env python3
"""
Cut the authentic resource-track + token-well panel out of the Stronghold fan
board scan (public/assets/towns-stronghold-board.webp, 1800x1319) for the
DESIGNED town boards (Conflux, Cove, Bulwark, Factory — no printed board
exists for them).

The designed board view (src/components/adventure/town-board.tsx) pastes this
crop back at the SAME fractional position it was cut from (see
`DESIGNED_GEOMETRY.panel` in src/data/towns/boards.ts), so the stronghold
track/token geometry fractions stay pixel-true: the production markers land on
the printed cells and the token buttons on the printed wells. The panel is
faction-neutral (leather, parchment numbers, gold/ore/crystal icons and the
hammer/#/spell-book wells), which is why one crop serves all four boards.

Idempotent: skipped if the target already exists and is non-empty.
"""
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets"
SOURCE = ASSETS / "towns-stronghold-board.webp"
TARGET = ASSETS / "town-tracks-panel.webp"

# Fractions of the 1800x1319 scan — MUST match DESIGNED_GEOMETRY.panel in
# src/data/towns/boards.ts (left, top, right, bottom).
PANEL = (0.545, 0.4735, 0.9745, 0.9665)


def main() -> None:
    if TARGET.exists() and TARGET.stat().st_size > 0:
        print(f"  = {TARGET.name} (already present)")
        return
    board = Image.open(SOURCE)
    board.load()
    w, h = board.size
    box = (round(PANEL[0] * w), round(PANEL[1] * h), round(PANEL[2] * w), round(PANEL[3] * h))
    crop = board.convert("RGB").crop(box)
    crop.save(TARGET, "WEBP", quality=88, method=6)
    print(f"  + {TARGET.name} {crop.size} (from {box})")


if __name__ == "__main__":
    main()
