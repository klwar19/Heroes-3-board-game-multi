#!/usr/bin/env python3
"""
Fetch the printed "Empowered" card scans from the fan wiki (en.homm3bg.wiki),
following the exact asset conventions the repo already uses for every other
imported scan (see fetch-extra-heroes-art.py):

  - Empowered Statistics -> /assets/statistics-<stat>-empowered.webp
  - Empowered Abilities  -> /assets/abilities-<slug>-empowered.webp

Both families are downloaded in one pass so the import is reproducible.

Every download is validated (HTTP 200 + decodable image); the script aborts
loudly on any miss so a broken/missing asset can never slip through silently.
A scan whose pixel size differs from the LOCAL base face is resized (LANCZOS)
to the base face's dimensions, so swapping the empowered face in at render time
can never change the card layout.

Usage:  py -3 scripts/fetch-empowered-card-art.py
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = "https://en.homm3bg.wiki/assets"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

# Save quality mirrors the other fetch scripts. compress-media.mjs is NOT run
# over these files (it would re-encode the whole tree); q92 keeps each scan
# comfortably under the ~250KB budget at the printed 743x1040 card size.
WEBP_QUALITY = 92
# Fallback quality for the rare scan that will not fit the ~250KB budget at q92
# (compress-media.mjs would give assets/statistics-* q85 anyway).
WEBP_QUALITY_FALLBACK = 85
WEBP_METHOD = 6
MAX_KB = 250

# The printed card size every face in this repo uses.
CARD_SIZE = (743, 1040)

STATISTICS = ["attack", "defense", "power", "knowledge"]

# Every ability that ships a base face in public/assets. The wiki serves an
# "-empowered" scan for all of them (probed 2026-08-04, all HTTP 200); the
# script aborts if one ever stops resolving, so this list is the contract.
ABILITIES = [
    "air_magic",
    "archery",
    "armorer",
    "artillery",
    "ballistics",
    "basic_air_magic",
    "basic_earth_magic",
    "basic_fire_magic",
    "basic_water_magic",
    "diplomacy",
    "eagle_eye",
    "earth_magic",
    "estates",
    "fire_magic",
    "first_aid",
    "intelligence",
    "interference",
    "leadership",
    "learning",
    "logistics",
    "luck",
    "mysticism",
    "necromancy",
    "offense",
    "pathfinding",
    "resistance",
    "scholar",
    "scouting",
    "sorcery",
    "tactics",
    "water_magic",
    "wisdom",
]


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


def base_face_size(base_name: str) -> tuple[int, int]:
    base = OUT / base_name
    if not base.exists():
        raise SystemExit(f"FAIL base face missing: {base}")
    with Image.open(base) as im:
        return im.size


def save_card(remote_name: str, out_name: str, base_name: str) -> None:
    url = f"{WIKI}/{remote_name}"
    im = open_image(fetch(url), url).convert("RGBA")
    base = base_face_size(base_name)
    # Match the base face so swapping the empowered art in cannot change the
    # layout. EXCEPTION: a base face that is itself an off-standard crop (the
    # Interference scan is 726x1040, not the printed 743x1040) would DISTORT the
    # good empowered scan — keep the printed size there instead. Card art is
    # laid out by CSS width, so the 17px difference changes nothing on screen.
    want = base if base == CARD_SIZE else CARD_SIZE
    if base != CARD_SIZE:
        print(f"  note  base {base_name} is {base} (off-standard crop); keeping {CARD_SIZE}")
    if im.size != want:
        print(f"  resize {out_name} {im.size} -> {want}")
        im = im.resize(want, Image.LANCZOS)
    dst = OUT / out_name
    for quality in (WEBP_QUALITY, WEBP_QUALITY_FALLBACK):
        im.save(dst, "WEBP", quality=quality, method=WEBP_METHOD)
        size_kb = dst.stat().st_size / 1024
        if size_kb <= MAX_KB:
            note = "" if quality == WEBP_QUALITY else f" (q{quality})"
            print(f"  card  {out_name} {im.size} {size_kb:.0f}KB{note}")
            return
    raise SystemExit(f"FAIL {out_name} is {size_kb:.0f}KB (>{MAX_KB}KB) even at q{WEBP_QUALITY_FALLBACK}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    print("Empowered Statistics:")
    for stat in STATISTICS:
        save_card(
            f"statistics-{stat}-empowered.webp",
            f"statistics-{stat}-empowered.webp",
            f"statistics-{stat}.webp",
        )

    print("Empowered Abilities:")
    for slug in ABILITIES:
        save_card(
            f"abilities-{slug}-empowered.webp",
            f"abilities-{slug}-empowered.webp",
            f"abilities-{slug}.webp",
        )

    print("Done.")


if __name__ == "__main__":
    main()
