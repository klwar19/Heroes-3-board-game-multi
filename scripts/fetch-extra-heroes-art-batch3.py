#!/usr/bin/env python3
"""
Fetch the printed/portrait art for the third batch of additional heroes,
reusing the asset conventions of fetch-extra-heroes-art-batch2.py.

Most "Regular Stretch Goals 2024" heroes have no printed board scan on the
fan wiki yet (their pages still show the deck-back placeholder), so — exactly
as the existing Moandor/Cyra/Torosar entries do — we fall back to the classic
PC hero portrait from heroes.thelazy.net (upscaled, hosted locally):

  PC portrait -> /assets/hero_portraits-<slug>.webp   (464x512, matches the
                 existing thelazy.net portraits)

Lord Haart (Necropolis) IS on the fan wiki with a real printed board + the
three specialty faces, so it ships the full board-game art set like batch 2:

  Hero board   -> /assets/heroes-necropolis-might-lord_haart_necropolis.webp
  Hero portrait-> /assets/hero_boardart-lord_haart_necropolis.webp  (572x582)
  Specialties  -> /assets/hero_specialties-lord_haart_necropolis-<level>.webp

Every download is validated (HTTP 200 + decodable image); the script aborts
loudly on any miss so a broken asset can never slip through.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = "https://en.homm3bg.wiki/assets"
LAZY = "https://heroes.thelazy.net"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

PORTRAIT_SIZE = (464, 512)       # classic PC portrait, matches existing files
CARD_SIZE = (743, 1040)
BOARD_SIZE = (1593, 1133)
PORTRAIT_BOX = (84, 80, 84 + 572, 80 + 582)

# Heroes that only have the deck-back placeholder on the fan wiki -> PC portrait.
# (slug, thelazy.net image path)
PORTRAIT_HEROES = [
    ("valeska", "/images/0/03/Hero_Valeska.png"),
    ("ingham", "/images/d/dd/Hero_Ingham.png"),
    ("lorelei", "/images/e/ea/Hero_Lorelei.png"),
    ("septienna", "/images/7/72/Hero_Septienna.png"),
]

# Heroes with the real printed board on the fan wiki.
# (local slug, wiki asset slug, faction, type)
BOARD_HEROES = [
    ("lord_haart_necropolis", "lord_haart", "necropolis", "might"),
]
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


def save_portrait_pc(data: bytes, url: str, slug: str) -> None:
    im = open_image(data, url).convert("RGB").resize(PORTRAIT_SIZE, Image.LANCZOS)
    dst = OUT / f"hero_portraits-{slug}.webp"
    im.save(dst, "WEBP", quality=92, method=6)
    print(f"  pcport {dst.name} {im.size}")


def save_board(data: bytes, url: str, out_name: str) -> Image.Image:
    im = open_image(data, url).convert("RGBA")
    if im.size != BOARD_SIZE:
        raise SystemExit(f"FAIL board scan {url} is {im.size}, expected {BOARD_SIZE}")
    (OUT / out_name).parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT / out_name, "WEBP", quality=92, method=6)
    print(f"  board  {out_name} {im.size}")
    return im


def save_boardart(board: Image.Image, slug: str) -> None:
    portrait = board.crop(PORTRAIT_BOX).convert("RGB")
    portrait.save(OUT / f"hero_boardart-{slug}.webp", "WEBP", quality=92, method=6)
    print(f"  port   hero_boardart-{slug}.webp {portrait.size}")


def save_specialty(data: bytes, url: str, out_name: str) -> None:
    im = open_image(data, url)
    im = im.convert("RGBA") if im.size == CARD_SIZE else im.convert("RGBA").resize(CARD_SIZE, Image.LANCZOS)
    im.save(OUT / out_name, "WEBP", quality=92, method=6)
    print(f"  spec   {out_name} {im.size}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    for slug, path in PORTRAIT_HEROES:
        print(f"{slug} (PC portrait):")
        save_portrait_pc(fetch(f"{LAZY}{path}"), f"{LAZY}{path}", slug)

    for slug, wiki_slug, faction, kind in BOARD_HEROES:
        print(f"{slug} ({faction}, {kind}) board art:")
        board_name = f"heroes-{faction}-{kind}-{slug}.webp"
        board = save_board(fetch(f"{WIKI}/heroes-{faction}-{kind}-{wiki_slug}.webp"),
                           f"{WIKI}/heroes-{faction}-{kind}-{wiki_slug}.webp", board_name)
        save_boardart(board, slug)
        for level, suffix in SPECIALTY_SUFFIX.items():
            src = f"hero_specialties-{faction}-{wiki_slug}-{suffix}.webp"
            save_specialty(fetch(f"{WIKI}/{src}"), f"{WIKI}/{src}", f"hero_specialties-{slug}-{level}.webp")

    print("Done.")


if __name__ == "__main__":
    main()
