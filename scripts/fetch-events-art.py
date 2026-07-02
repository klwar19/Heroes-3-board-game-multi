#!/usr/bin/env python3
"""
Fetch and crop the Fortress-expansion "Event" card art from the fan wiki
(en.homm3bg.wiki), mirroring the asset conventions the repo already uses:

  - Event cards -> /assets/events-<slug>.webp

The wiki ships every Event as a full landscape card scan (1040x743, RGBA with
the rounded corners punched out as transparency) — the same format as the
Astrologers Proclaim scans. We download each, validate it (HTTP 200 +
decodable image + the expected card size), trim any fully transparent border
rows/columns, and re-encode as webp. The script aborts loudly on any miss so a
broken or placeholder asset can never slip into the repo.

Keep this list in sync with src/data/cards/events.ts.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = "https://en.homm3bg.wiki/assets"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

# Every Event card the engine deals (keep in sync with events.ts).
SLUGS = [
    "a_shady_auction",
    "artifact_merchant",
    "crypt",
    "cursed_swamp",
    "den_of_thieves",
    "garden_of_revelation",
    "library_of_enlightenment",
    "mage_laboratory",
    "magical_forest",
    "market_of_time",
    "marketplace",
    "mercenary_camp",
    "messenger_with_supplies",
    "mischievous_leprechaun",
    "prison",
    "school_of_magic_and_school_of_war",
    "shrine_of_the_magic_thought",
    "stables",
    "the_villagers_plea",
    "withered_hermit",
]

# The wiki publishes every Event at this landscape card size.
CARD_SIZE = (1040, 743)


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


def autocrop_transparent(im: Image.Image) -> Image.Image:
    """Trim fully transparent border rows/columns; identity for opaque art."""
    if im.mode != "RGBA":
        return im
    alpha = im.getchannel("A")
    bbox = alpha.getbbox()
    if bbox and bbox != (0, 0, im.width, im.height):
        return im.crop(bbox)
    return im


def save_card(data: bytes, url: str, out_name: str) -> None:
    im = open_image(data, url).convert("RGBA")
    if im.size != CARD_SIZE:
        raise SystemExit(f"FAIL {url} is {im.size}, expected {CARD_SIZE}")
    im = autocrop_transparent(im)
    dst = OUT / out_name
    im.save(dst, "WEBP", quality=92, method=6)
    print(f"  card  {out_name} {im.size}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Event cards ({len(SLUGS)}):")
    for slug in SLUGS:
        src = f"{WIKI}/events-{slug}.webp"
        save_card(fetch(src), src, f"events-{slug}.webp")
    print("Done.")


if __name__ == "__main__":
    main()
