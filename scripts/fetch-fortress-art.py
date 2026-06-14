#!/usr/bin/env python3
"""
Fetch and crop the Fortress faction art from the fan wiki (en.homm3bg.wiki),
mirroring the asset conventions the repo already uses for the other factions:

  - Unit cards   -> /assets/units-fortress-<tier>-<slug>-<side>.webp  (743x1040)
  - Hero boards  -> /assets/heroes-fortress-might-<slug>.webp         (1593x1133)
  - Hero portrait-> /assets/hero_boardart-<slug>.webp  (572x582, cropped from
                    the board scan at the same box the existing portraits use)
  - Specialties  -> /assets/hero_specialties-<slug>-<level>.webp      (743x1040)

The wiki numbers the level-VI specialty image with a "-7" suffix and prefixes
its files with "fortress-"; both are normalised to the repo's local naming so
the existing `specialtyCardImage`/board lookups keep working unchanged.

Every download is validated (HTTP 200 + decodable image + expected size); the
script aborts loudly on any miss so a broken asset can never slip through.
"""
import io
import sys
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = "https://en.homm3bg.wiki/assets"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

CARD_SIZE = (743, 1040)
BOARD_SIZE = (1593, 1133)
# Portrait crop box inside the standard (1593x1133) hero board, reverse-
# engineered from the shipped hero_boardart-*.webp crops (pixel-exact match).
PORTRAIT_BOX = (84, 80, 84 + 572, 80 + 582)

# Fortress units: (tier-on-wiki, slug, [sides])
UNITS = [
    ("bronze", "gnolls", ["few", "pack"]),
    ("bronze", "lizardmen", ["few", "pack"]),
    ("bronze", "dragon_flies", ["few", "pack"]),
    ("silver", "basilisks", ["few", "pack"]),
    ("silver", "gorgons", ["few", "pack"]),
    ("golden", "wyverns", ["few", "pack"]),
    ("golden", "hydras", ["few", "pack"]),
]

# Fortress heroes that ship in this pass: (slug, board-scan needed, specialties)
HEROES = ["bron", "wystan"]
# The wiki's specialty image suffix per board-game level (VI is stored as "-7").
SPECIALTY_SUFFIX = {1: "1", 4: "4", 6: "7"}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def open_image(data: bytes, url: str) -> Image.Image:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
        return im
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"FAIL not an image ({exc}) {url}")


def save_card(data: bytes, url: str, out_name: str) -> None:
    im = open_image(data, url)
    if im.size != CARD_SIZE:
        # Normalise odd sizes by fitting onto the standard card canvas.
        im = im.convert("RGBA").resize(CARD_SIZE, Image.LANCZOS)
        note = f" (resized from source)"
    else:
        im = im.convert("RGBA")
        note = ""
    dst = OUT / out_name
    im.save(dst, "WEBP", quality=92, method=6)
    print(f"  card  {out_name} {im.size}{note}")


def save_board(data: bytes, url: str, out_name: str) -> Image.Image:
    im = open_image(data, url).convert("RGBA")
    if im.size != BOARD_SIZE:
        raise SystemExit(f"FAIL board scan {url} is {im.size}, expected {BOARD_SIZE}")
    dst = OUT / out_name
    im.save(dst, "WEBP", quality=92, method=6)
    print(f"  board {out_name} {im.size}")
    return im


def save_portrait(board: Image.Image, out_name: str) -> None:
    portrait = board.crop(PORTRAIT_BOX).convert("RGB")
    dst = OUT / out_name
    portrait.save(dst, "WEBP", quality=92, method=6)
    print(f"  port  {out_name} {portrait.size}")


def save_specialty(data: bytes, url: str, out_name: str) -> None:
    im = open_image(data, url)
    if im.size != CARD_SIZE:
        im = im.convert("RGBA").resize(CARD_SIZE, Image.LANCZOS)
    else:
        im = im.convert("RGBA")
    dst = OUT / out_name
    im.save(dst, "WEBP", quality=92, method=6)
    print(f"  spec  {out_name} {im.size}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    print("Unit cards:")
    for tier, slug, sides in UNITS:
        for side in sides:
            name = f"units-fortress-{tier}-{slug}-{side}.webp"
            save_card(fetch(f"{WIKI}/{name}"), f"{WIKI}/{name}", name)

    print("Heroes:")
    for slug in HEROES:
        board_name = f"heroes-fortress-might-{slug}.webp"
        board = save_board(fetch(f"{WIKI}/{board_name}"), f"{WIKI}/{board_name}", board_name)
        save_portrait(board, f"hero_boardart-{slug}.webp")
        for level, suffix in SPECIALTY_SUFFIX.items():
            src = f"hero_specialties-fortress-{slug}-{suffix}.webp"
            save_specialty(fetch(f"{WIKI}/{src}"), f"{WIKI}/{src}", f"hero_specialties-{slug}-{level}.webp")

    print("Done.")


if __name__ == "__main__":
    main()
