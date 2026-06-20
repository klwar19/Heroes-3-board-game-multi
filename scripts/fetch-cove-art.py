#!/usr/bin/env python3
"""
Fetch the PC hero portraits for the two wired Cove heroes, reusing the asset
conventions of fetch-extra-heroes-art-batch5.py.

The fan wiki Cove pages (https://en.homm3bg.wiki/towns/cove/) carry no printed
board scan yet, so — exactly like the Tower PC-portrait heroes and the
Valeska/Ingham/Septienna/batch-4/5 entries — we fall back to the classic
portrait from heroes.thelazy.net, hosted locally:

  PC portrait -> /assets/hero_portraits-<slug>.webp   (464x512)

Only the two engine-wired Cove heroes ship art here (Astra = Cure, Cassiopeia =
Oceanids); the other four Cove heroes are deferred (not registered) until their
signature specialty mechanic is built, so they need no asset yet.

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

# (local slug, thelazy.net image path) — full-size classic HotA portraits.
PORTRAIT_HEROES = [
    ("astra", "/images/d/dc/Hero_Astra.png"),
    ("cassiopeia", "/images/d/d9/Hero_Cassiopeia.png"),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, path in PORTRAIT_HEROES:
        data = fetch(LAZY + path)
        try:
            image = Image.open(io.BytesIO(data)).convert("RGBA")
        except Exception as exc:  # pragma: no cover - guard against a bad download
            raise SystemExit(f"FAIL decode {slug}: {exc}")
        image = image.resize(PORTRAIT_SIZE, Image.LANCZOS)
        dest = OUT / f"hero_portraits-{slug}.webp"
        image.save(dest, "WEBP", quality=90)
        print(f"wrote {dest.relative_to(OUT.parent.parent)} ({image.size[0]}x{image.size[1]})")


if __name__ == "__main__":
    main()
