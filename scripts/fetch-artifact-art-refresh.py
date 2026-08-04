#!/usr/bin/env python3
"""
Refresh the "Regular Stretch Goals 2024" Artifact card faces from the fan wiki
en.homm3bg.wiki, which hosts UPDATED printed-card scans for that group.

Scope
-----
EXACTLY the nine artifacts the wiki lists under the group
"Regular Stretch Goals 2024" (https://en.homm3bg.wiki/content/regular_stretch_goals/,
the Content column of https://en.homm3bg.wiki/artifacts/). Artifacts printed in
the Core Game or any expansion are NOT touched by this script — pass their own
scan batch instead. Every one of the nine already exists as a repo card in
src/data/cards/artifacts.ts (each is also pinned in
src/data/cards/artifact-card-art.test.ts's ORIGINAL_REPLACEMENT_SLUGS), so this
script only ever REPLACES a face — it never introduces a new asset name.

The wiki's asset names mirror the repo's 1:1 for all nine
(artifacts_{minor,major,relic}-<slug>.webp), verified against each artifact's own
wiki page; there is no remote/local rename in this batch (contrast
scripts/fetch-missing-spell-card-art.py, where Torso of Legion needed one).

Every download is validated (HTTP 200 + decodable WEBP + card-sized) and the
script aborts loudly on any miss, so a 404 HTML error page can never be written
as an asset, and a scan SMALLER than the printed card size is refused rather than
upscaled. Files are re-encoded deterministically (WEBP q=92 method=6) and written
ONLY when the bytes actually differ, so a re-run is a no-op.

Do NOT run scripts/compress-media.mjs over these files afterwards: it would
re-encode them at its q82 default and undo this batch's quality.
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
SIZE_BUDGET_KB = 250

# The nine "Regular Stretch Goals 2024" artifacts, as (remote filename on the
# wiki, local filename in public/assets). Identical names in this batch — the
# pair is kept explicit so a future rename is a one-line edit.
DOWNLOADS = [
    # Relic
    ("artifacts_relic-celestial_necklace_of_bliss.webp", "artifacts_relic-celestial_necklace_of_bliss.webp"),
    ("artifacts_relic-lions_shield_of_courage.webp", "artifacts_relic-lions_shield_of_courage.webp"),
    ("artifacts_relic-sandals_of_the_saint.webp", "artifacts_relic-sandals_of_the_saint.webp"),
    # Major
    ("artifacts_major-necklace_of_dragonteeth.webp", "artifacts_major-necklace_of_dragonteeth.webp"),
    ("artifacts_major-pendant_of_courage.webp", "artifacts_major-pendant_of_courage.webp"),
    ("artifacts_major-pendant_of_negativity.webp", "artifacts_major-pendant_of_negativity.webp"),
    # Minor
    ("artifacts_minor-eversmoking_ring_of_sulfur.webp", "artifacts_minor-eversmoking_ring_of_sulfur.webp"),
    ("artifacts_minor-necklace_of_swiftness.webp", "artifacts_minor-necklace_of_swiftness.webp"),
    ("artifacts_minor-skull_helmet.webp", "artifacts_minor-skull_helmet.webp"),
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


def encode(im: Image.Image, local: str) -> bytes:
    """q=92/method=6, dropping quality only if the card blows the size budget."""
    for quality in (QUALITY, 88, 84):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=quality, method=METHOD)
        data = buf.getvalue()
        if len(data) <= SIZE_BUDGET_KB * 1024:
            if quality != QUALITY:
                print(f"    note {local} needed q={quality} to fit {SIZE_BUDGET_KB}KB")
            return data
    print(f"    WARNING {local} is {len(data)/1024:.0f}KB (>{SIZE_BUDGET_KB}KB budget)", file=sys.stderr)
    return data


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    new = updated = unchanged = 0
    for remote, local in DOWNLOADS:
        url = f"{BASE}/{remote}"
        im = load_card(fetch(url), url)
        data = encode(im, local)
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
        print(f"  {state:9s} {local:52s} {im.size[0]}x{im.size[1]}  {len(data)/1024:6.0f}KB")
    print(f"Done. {new} new, {updated} updated, {unchanged} unchanged in {OUT}")


if __name__ == "__main__":
    main()
