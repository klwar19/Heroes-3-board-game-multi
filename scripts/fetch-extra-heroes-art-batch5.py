#!/usr/bin/env python3
"""
Fetch the portrait art for the fifth batch of additional heroes, reusing the
asset conventions of fetch-extra-heroes-art-batch4.py.

These eight heroes complete the roster of every already-playable Town to match
the fan wiki's hero list (https://en.homm3bg.wiki/heroes/):

  Dungeon   — Sephinroth (Warlock),     Tarnum (Overlord)
  Rampart   — Melodia (Druid),          Tarnum (Ranger)
  Fortress  — Gerwulf (Beastmaster),    Tarnum (Beastmaster)
  Inferno   — Ash (Heretic),            Octavia (Demoniac)

None of them has a printed board scan on the fan wiki yet (every page still
shows the deck-back placeholder for the board AND the three specialty cards), so
— exactly like the Valeska/Ingham/Lorelei/Septienna/batch-3/batch-4 entries — we
fall back to the classic PC hero portrait from heroes.thelazy.net (upscaled,
hosted locally):

  PC portrait -> /assets/hero_portraits-<slug>.webp   (464x512, matches the
                 existing thelazy.net portraits)

The six Tarnum board-game heroes each have their own class render on
thelazy.net; this batch ships the Overlord (Dungeon), Ranger (Rampart) and
Beastmaster (Fortress) variants under class-specific slugs so each new Tarnum
shows its own portrait (the Castle/Knight one shipped in batch 4).

Every download is validated (HTTP 200 + decodable image); the script aborts
loudly on any miss so a broken asset can never slip through.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

LAZY = "https://heroes.thelazy.net"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

PORTRAIT_SIZE = (464, 512)  # classic PC portrait, matches existing files

# (local slug, thelazy.net image path) — full-size classic SoD/AB portraits.
PORTRAIT_HEROES = [
    ("sephinroth", "/images/e/ec/Hero_Sephinroth.png"),
    ("melodia", "/images/4/4b/Hero_Melodia.png"),
    ("gerwulf", "/images/3/39/Hero_Gerwulf.png"),
    ("ash", "/images/a/a2/Hero_Ash.png"),
    ("octavia", "/images/2/2a/Hero_Octavia.png"),
    ("tarnum_overlord", "/images/9/93/Hero_Tarnum_%28Overlord%29.png"),
    ("tarnum_ranger", "/images/9/96/Hero_Tarnum_%28Ranger%29.png"),
    ("tarnum_beastmaster", "/images/a/a3/Hero_Tarnum_%28Beastmaster%29.png"),
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


def save_portrait_pc(data: bytes, url: str, slug: str) -> None:
    im = open_image(data, url).convert("RGB").resize(PORTRAIT_SIZE, Image.LANCZOS)
    dst = OUT / f"hero_portraits-{slug}.webp"
    im.save(dst, "WEBP", quality=92, method=6)
    print(f"  pcport {dst.name} {im.size}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, path in PORTRAIT_HEROES:
        print(f"{slug} (PC portrait):")
        save_portrait_pc(fetch(f"{LAZY}{path}"), f"{LAZY}{path}", slug)
    print("Done.")


if __name__ == "__main__":
    main()
