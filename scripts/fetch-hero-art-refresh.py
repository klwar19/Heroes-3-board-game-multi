#!/usr/bin/env python3
"""
Refresh the printed hero art from the fan wiki (en.homm3bg.wiki) for

  1. every hero of the wiki's "Regular Stretch Goals 2024" content group, and
  2. every Conflux / Cove / Stronghold hero that ships in this repo,

reusing the exact asset conventions every other hero already follows (see
scripts/fetch-extra-heroes-art.py, which this script is modelled on):

  - Hero boards   -> /assets/heroes-<faction>-<type>-<slug>.webp   (1593x1133)
  - Hero portrait -> /assets/hero_boardart-<slug>.webp             (572x582,
                     cropped from the board scan at the same box every shipped
                     portrait uses)
  - Specialties   -> /assets/hero_specialties-<slug>-<level>.webp  (743x1040)

Wiki naming quirks that are normalised to the repo's LOCAL names (so the
existing specialtyCardImage / boardScan lookups keep working):
  - the level-VI specialty image carries a "-7" suffix upstream;
  - specialty files are prefixed with the faction slug upstream;
  - the four Tarnums are all plain "tarnum" upstream (the repo disambiguates
    them per faction: tarnum_castle, tarnum_stronghold, ...);
  - Monere's board is filed under "magic" upstream while the repo's local file
    (and its code reference) says "might" — the LOCAL name always wins.

Every download is validated (HTTP 200 + decodable image + expected size); the
script aborts loudly on any miss so a broken asset can never slip through. A
file is only rewritten when the freshly encoded bytes differ from what is on
disk, and each hero reports per-file "updated" / "unchanged".
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

# (local slug, wiki slug, faction, local board type, wiki board type)
HEROES = [
    # --- Regular Stretch Goals 2024 ----------------------------------------
    ("ingham", "ingham", "castle", "magic", "magic"),
    ("tarnum_castle", "tarnum", "castle", "might", "might"),
    ("valeska", "valeska", "castle", "might", "might"),
    ("moandor", "moandor", "necropolis", "might", "might"),
    ("septienna", "septienna", "necropolis", "magic", "magic"),
    ("lorelei", "lorelei", "dungeon", "might", "might"),
    ("sephinroth", "sephinroth", "dungeon", "magic", "magic"),
    ("tarnum_dungeon", "tarnum", "dungeon", "might", "might"),
    ("cyra", "cyra", "tower", "magic", "magic"),
    ("torosar", "torosar", "tower", "might", "might"),
    ("ivor", "ivor", "rampart", "might", "might"),
    ("melodia", "melodia", "rampart", "magic", "magic"),
    ("tarnum_rampart", "tarnum", "rampart", "might", "might"),
    ("gerwulf", "gerwulf", "fortress", "might", "might"),
    ("merist", "merist", "fortress", "magic", "magic"),
    ("tarnum_fortress", "tarnum", "fortress", "might", "might"),
    ("ash", "ash", "inferno", "magic", "magic"),
    ("octavia", "octavia", "inferno", "might", "might"),
    # --- Stronghold --------------------------------------------------------
    ("crag_hack", "crag_hack", "stronghold", "might", "might"),
    ("dessa", "dessa", "stronghold", "magic", "magic"),
    ("gundula", "gundula", "stronghold", "magic", "magic"),
    ("shiva", "shiva", "stronghold", "might", "might"),
    ("tarnum_stronghold", "tarnum", "stronghold", "might", "might"),
    ("yog", "yog", "stronghold", "might", "might"),
    # --- Conflux -----------------------------------------------------------
    ("ciele", "ciele", "conflux", "magic", "magic"),
    ("erdamon", "erdamon", "conflux", "might", "might"),
    ("luna", "luna", "conflux", "magic", "magic"),
    # Local file/lookup says "might"; the wiki files this board under "magic".
    ("monere", "monere", "conflux", "might", "magic"),
    ("pasis", "pasis", "conflux", "might", "might"),
    ("tarnum_conflux", "tarnum", "conflux", "magic", "magic"),
    # --- Cove --------------------------------------------------------------
    ("astra", "astra", "cove", "magic", "magic"),
    ("casmetra", "casmetra", "cove", "magic", "magic"),
    ("cassiopeia", "cassiopeia", "cove", "might", "might"),
    ("jeremy", "jeremy", "cove", "might", "might"),
    ("miriam", "miriam", "cove", "might", "might"),
    ("zilare", "zilare", "cove", "magic", "magic"),
]

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


def encode(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=92, method=6)
    return buf.getvalue()


def write_if_changed(data: bytes, out_name: str, kind: str, size) -> bool:
    dst = OUT / out_name
    if dst.exists() and dst.read_bytes() == data:
        print(f"  {kind} {out_name} {size} unchanged")
        return False
    existed = dst.exists()
    dst.write_bytes(data)
    print(f"  {kind} {out_name} {size} {'updated' if existed else 'NEW'} ({len(data)} bytes)")
    return True


def save_board(data: bytes, url: str, out_name: str) -> tuple[Image.Image, bool]:
    im = open_image(data, url).convert("RGBA")
    if im.size != BOARD_SIZE:
        raise SystemExit(f"FAIL board scan {url} is {im.size}, expected {BOARD_SIZE}")
    return im, write_if_changed(encode(im), out_name, "board", im.size)


def save_portrait(board: Image.Image, out_name: str) -> bool:
    portrait = board.crop(PORTRAIT_BOX).convert("RGB")
    return write_if_changed(encode(portrait), out_name, "port ", portrait.size)


def save_specialty(data: bytes, url: str, out_name: str) -> bool:
    im = open_image(data, url)
    if im.size != CARD_SIZE:
        im = im.convert("RGBA").resize(CARD_SIZE, Image.LANCZOS)
    else:
        im = im.convert("RGBA")
    return write_if_changed(encode(im), out_name, "spec ", im.size)


def main() -> None:
    if not OUT.is_dir():
        raise SystemExit(f"FAIL missing asset directory {OUT}")

    changed = 0
    total = 0
    for slug, wiki_slug, faction, kind, wiki_kind in HEROES:
        print(f"{slug} ({faction}, {kind}):")
        local_board = f"heroes-{faction}-{kind}-{slug}.webp"
        remote_board = f"heroes-{faction}-{wiki_kind}-{wiki_slug}.webp"
        url = f"{WIKI}/{remote_board}"
        board, hit = save_board(fetch(url), url, local_board)
        changed += hit
        total += 1
        hit = save_portrait(board, f"hero_boardart-{slug}.webp")
        changed += hit
        total += 1
        for level, suffix in SPECIALTY_SUFFIX.items():
            src = f"hero_specialties-{faction}-{wiki_slug}-{suffix}.webp"
            url = f"{WIKI}/{src}"
            changed += save_specialty(fetch(url), url, f"hero_specialties-{slug}-{level}.webp")
            total += 1

    print(f"Done. {changed}/{total} files written, {total - changed} already current.")


if __name__ == "__main__":
    sys.exit(main())
