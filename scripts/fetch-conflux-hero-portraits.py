#!/usr/bin/env python3
"""
Fetch the classic PC hero portraits for the three wired Conflux Planeswalkers
from heroes.thelazy.net, upscaled to the repo's standard portrait size and
saved as /assets/hero_portraits-<slug>.webp — exactly like the Moandor / Cyra /
Torosar PC portraits already in the project.

The MediaWiki Special:FilePath endpoint redirects to the real (hashed) image
URL, so we don't need to hard-code the /images/x/yy/ hash. Every download is
validated (HTTP 200 + decodable image); the script aborts loudly on any miss.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

LAZY = "https://heroes.thelazy.net"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
PORTRAIT_SIZE = (464, 512)  # classic PC portrait, matches existing files

# (local slug, thelazy.net file name) — full-size classic SoD portraits.
PORTRAIT_HEROES = [
    ("erdamon", "Hero_Erdamon.png"),
    ("monere", "Hero_Monere.png"),
    ("pasis", "Hero_Pasis.png"),
    ("luna", "Hero_Luna.png"),
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


def save_portrait(data: bytes, url: str, slug: str) -> None:
    im = open_image(data, url).convert("RGB").resize(PORTRAIT_SIZE, Image.LANCZOS)
    dst = OUT / f"hero_portraits-{slug}.webp"
    im.save(dst, "WEBP", quality=92, method=6)
    print(f"  portrait hero_portraits-{slug}.webp {im.size}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, filename in PORTRAIT_HEROES:
        url = f"{LAZY}/index.php/Special:FilePath/{filename}"
        print(f"{slug} (PC portrait): {url}")
        save_portrait(fetch(url), url, slug)
    print("done")


if __name__ == "__main__":
    main()
