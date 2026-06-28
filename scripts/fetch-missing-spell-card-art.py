#!/usr/bin/env python3
"""
Download the still-missing BOARD-GAME card scans from the project's own art
source, the fan wiki en.homm3bg.wiki. The wiki mirrors this project's asset
filenames 1:1 under /assets, so a card's scan (when it exists) lives at
  https://en.homm3bg.wiki/assets/<same-filename-as-public/assets>

An audit (src/data/cards/_audit-missing-images.test.ts) found these cards
referencing a cardImage with no file committed to public/assets. This script
fetches the ones the wiki actually HAS a scan for, and refuses to write a file
for any URL that 404s (the wiki serves a ~227 KB HTML error page for those —
those cards show the deck-back placeholder on the wiki itself, so there is
nothing to download).

Confirmed available on the wiki (real 743x1040 RGBA card scans):
  spells-view_air.webp, spells-view_earth.webp, spells-disrupting_ray.webp,
  spells-remove_obstacle.webp
  artifacts_major-torso_of_legion.webp  <- the wiki keeps it under the MINOR
      filename (artifacts_minor-torso_of_legion.webp); the project plays Torso
      as a house-rule Major, so we save the same scan under the major name.

NOT on the wiki (it shows the deck-back placeholder for these, so they cannot be
downloaded). The requested spells now have approved original replacements built
by scripts/build-missing-spell-cards.mjs; only Sacrifice remains routed through
SCANLESS_SPELLS:
  spells-{summon_air,summon_earth,summon_fire,summon_water}_elemental.webp,
  spells-magic_mirror.webp, spells-water_walk.webp, spells-air_shield.webp,
  spells-protection_from_{air,earth,fire,water}.webp, spells-sacrifice.webp
"""
import io
import os
import ssl
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
BASE = "https://en.homm3bg.wiki/assets"

# (remote filename on the wiki, local filename in public/assets)
DOWNLOADS = [
    ("spells-view_air.webp", "spells-view_air.webp"),
    ("spells-view_earth.webp", "spells-view_earth.webp"),
    ("spells-disrupting_ray.webp", "spells-disrupting_ray.webp"),
    ("spells-remove_obstacle.webp", "spells-remove_obstacle.webp"),
    # House-rule Major Torso uses the wiki's Minor scan.
    ("artifacts_minor-torso_of_legion.webp", "artifacts_major-torso_of_legion.webp"),
]


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"  # agent-proxy MITM bundle, when present
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (homm3bg-card-art-importer)"})
    with urllib.request.urlopen(req, timeout=60, context=_ctx()) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for remote, local in DOWNLOADS:
        url = f"{BASE}/{remote}"
        raw = fetch(url)
        # A 404 page is HTML, not a decodable image; reject anything that is not
        # a real, card-sized RGBA/RGB webp so a placeholder can never slip in.
        try:
            img = Image.open(io.BytesIO(raw))
            img.load()
        except Exception as exc:  # noqa: BLE001
            raise SystemExit(f"FAIL {url} is not a decodable image ({exc})")
        if img.format != "WEBP":
            raise SystemExit(f"FAIL {url} is {img.format}, expected WEBP")
        if img.width < 400 or img.height < 600:
            raise SystemExit(f"FAIL {url} is suspiciously small {img.size}")
        (OUT / local).write_bytes(raw)
        print(f"  {local:42s} <- {url}  ({img.size[0]}x{img.size[1]} {img.mode})")
    print(f"Done. {len(DOWNLOADS)} card scan(s) written to {OUT}")


if __name__ == "__main__":
    main()
