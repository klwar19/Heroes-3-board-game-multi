#!/usr/bin/env python3
"""
Fetch and normalise the six Rampart neutral-guard unit cards from the fan wiki
(en.homm3bg.wiki), mirroring the asset conventions the repo already uses:

  Unit cards -> /assets/units-neutral-<tier>-<slug>.webp  (743x1040)

These are the single-sided Neutral guard versions of the core Rampart creatures
(Centaurs, Dwarves, Elves, Pegasi, Dendroids, Unicorns). The wiki already serves
them at the final 743x1040 card size, so we re-encode to the repo's WEBP settings
(quality 92, method 6) for byte-for-byte consistency with the other faces.

Every download is validated (HTTP 200 + decodable image); the script aborts
loudly on any miss so a broken asset can never slip through.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = "https://en.homm3bg.wiki/assets"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
CARD_SIZE = (743, 1040)

# (tier-on-wiki, slug) — gold tier files are spelled "golden" on the wiki/repo.
UNITS = [
    ("bronze", "centaurs"),
    ("bronze", "dwarves"),
    ("bronze", "elves"),
    ("silver", "pegasi"),
    ("silver", "dendroids"),
    ("golden", "unicorns"),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def save_card(data: bytes, url: str, out_name: str) -> None:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"FAIL not an image ({exc}) {url}")
    im = im.convert("RGBA")
    if im.size != CARD_SIZE:
        # Normalise odd sizes onto the standard card canvas.
        im = im.resize(CARD_SIZE, Image.LANCZOS)
    im.save(OUT / out_name, "WEBP", quality=92, method=6)
    print(f"  card  {out_name} {im.size}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print("Rampart neutral unit cards:")
    for tier, slug in UNITS:
        name = f"units-neutral-{tier}-{slug}.webp"
        save_card(fetch(f"{WIKI}/{name}"), f"{WIKI}/{name}", name)
    print("Done.")


if __name__ == "__main__":
    main()
