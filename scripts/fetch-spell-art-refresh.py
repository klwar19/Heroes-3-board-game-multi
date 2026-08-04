#!/usr/bin/env python3
"""
Refresh a set of Spell (and the Interference Ability) card faces from the fan
wiki en.homm3bg.wiki, which now hosts REAL printed-card scans for cards that
previously had none in this repo.

Why this script exists
----------------------
Fourteen of the spell faces it downloads were, until now, ORIGINAL locally
generated cards built by scripts/build-missing-spell-cards.mjs and
scripts/build-summon-spell-cards.mjs (the wiki used to show only the deck back
for them). The wiki has since published the genuine scans, so those generated
faces are replaced here by the printed cards.

  !! RE-RUNNING EITHER BUILD SCRIPT WOULD CLOBBER THESE REAL SCANS !!
  Both build scripts carry a header note saying so. Run THIS script afterwards
  to restore the printed faces.

The Interference Ability's local face was an off-standard 726x1040 narrow crop;
the wiki serves a full 743x1040 printed card, so it is replaced at full size
(nothing in the code reads image dimensions — CSS lays cards out by width).

Every download is validated (HTTP 200 + decodable WEBP + card-sized) and the
script aborts loudly on any miss, so a 404 HTML error page can never be written
as an asset. Files are re-encoded deterministically (WEBP q=92 method=6) and
written ONLY when the bytes actually differ, so a re-run is a no-op.
"""
import io
import os
import ssl
import sys
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
BASE = "https://en.homm3bg.wiki/assets"
CARD_SIZE = (743, 1040)
QUALITY = 92
METHOD = 6

# (remote filename on the wiki, local filename in public/assets)
DOWNLOADS = [
    ("spells-quicksand.webp", "spells-quicksand.webp"),
    ("spells-force_field.webp", "spells-force_field.webp"),
    ("spells-sacrifice.webp", "spells-sacrifice.webp"),
    ("spells-magic_mirror.webp", "spells-magic_mirror.webp"),
    ("spells-clone.webp", "spells-clone.webp"),
    ("spells-land_mine.webp", "spells-land_mine.webp"),
    ("spells-protection_from_air.webp", "spells-protection_from_air.webp"),
    ("spells-protection_from_earth.webp", "spells-protection_from_earth.webp"),
    ("spells-protection_from_fire.webp", "spells-protection_from_fire.webp"),
    ("spells-protection_from_water.webp", "spells-protection_from_water.webp"),
    ("spells-summon_air_elemental.webp", "spells-summon_air_elemental.webp"),
    ("spells-summon_earth_elemental.webp", "spells-summon_earth_elemental.webp"),
    ("spells-summon_fire_elemental.webp", "spells-summon_fire_elemental.webp"),
    ("spells-summon_water_elemental.webp", "spells-summon_water_elemental.webp"),
    # 2026-08-04 follow-up: the wiki also republished these two, which were
    # still locally generated art in this repo.
    ("spells-air_shield.webp", "spells-air_shield.webp"),
    ("spells-water_walk.webp", "spells-water_walk.webp"),
    # Ability: replaces the off-standard 726x1040 crop with the full printed card.
    ("abilities-interference.webp", "abilities-interference.webp"),
    # The Empowered twin is refreshed from the same source so the pair stays a
    # matched set (base + Empowered from one scan batch).
    ("abilities-interference-empowered.webp", "abilities-interference-empowered.webp"),
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


def load_card(raw: bytes, url: str) -> Image.Image:
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"FAIL {url} is not a decodable image ({exc}) — 404 page?")
    if im.format != "WEBP":
        raise SystemExit(f"FAIL {url} is {im.format}, expected WEBP")
    if im.width < 400 or im.height < 600:
        raise SystemExit(f"FAIL {url} is suspiciously small {im.size}")
    if im.size != CARD_SIZE:
        # Never invent resolution: only downscale/normalise a LARGER scan.
        if im.width < CARD_SIZE[0] or im.height < CARD_SIZE[1]:
            raise SystemExit(f"FAIL {url} is {im.size}, smaller than the printed card {CARD_SIZE}")
        im = im.convert("RGB").resize(CARD_SIZE, Image.LANCZOS)
    return im.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    new = updated = unchanged = 0
    for remote, local in DOWNLOADS:
        url = f"{BASE}/{remote}"
        im = load_card(fetch(url), url)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=QUALITY, method=METHOD)
        data = buf.getvalue()
        dst = OUT / local
        before = dst.read_bytes() if dst.exists() else None
        if before is None:
            state = "NEW"
            new += 1
        elif before == data:
            state = "unchanged"
            unchanged += 1
        else:
            state = "updated"
            updated += 1
        if state != "unchanged":
            dst.write_bytes(data)
        print(f"  {state:9s} {local:44s} {im.size[0]}x{im.size[1]}  {len(data)/1024:6.0f}KB")
        if len(data) > 250 * 1024:
            print(f"    WARNING {local} is {len(data)/1024:.0f}KB (>250KB budget)", file=sys.stderr)
    print(f"Done. {new} new, {updated} updated, {unchanged} unchanged in {OUT}")


if __name__ == "__main__":
    main()
