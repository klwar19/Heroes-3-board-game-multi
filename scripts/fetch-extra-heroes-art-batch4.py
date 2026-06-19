#!/usr/bin/env python3
"""
Fetch the portrait art for the fourth batch of additional heroes, reusing the
asset conventions of fetch-extra-heroes-art-batch3.py.

None of these "Regular Stretch Goals 2024" heroes has a printed board scan on
the fan wiki yet (their pages still show the deck-back placeholder), so — exactly
like the existing Valeska/Ingham/Lorelei/Septienna entries — we fall back to the
classic PC hero portrait from heroes.thelazy.net (upscaled, hosted locally):

  PC portrait -> /assets/hero_portraits-<slug>.webp   (464x512, matches the
                 existing thelazy.net portraits)

The six Tarnum board-game heroes share the one classic PC Tarnum portrait; this
batch ships the Castle (Knight) variant render under the shared `tarnum` slug.

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

# (local slug, thelazy.net image path)
PORTRAIT_HEROES = [
    ("ivor", "/images/2/2c/Hero_Ivor.png"),
    ("tarnum", "/images/8/82/Hero_Tarnum_%28Knight%29.png"),
    ("merist", "/images/8/85/Hero_Merist.png"),
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
