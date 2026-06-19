#!/usr/bin/env python3
"""
Fetch and crop the "Astrologers Proclaim" card art from the fan wiki
(en.homm3bg.wiki), mirroring the asset conventions the repo already uses:

  - Astrologers cards -> /assets/astrologers_proclaim-<slug>.webp

The wiki ships every proclamation as a full landscape card scan (1040x743,
RGBA with the rounded corners punched out as transparency). We download each,
validate it (HTTP 200 + decodable image + the expected card size), trim any
fully transparent border rows/columns so the card sits tight in its asset, and
re-encode it as webp. The script aborts loudly on any miss so a broken or
placeholder asset can never slip into the repo.

Only the cards the engine actually deals are fetched: the 19 Core Game
proclamations plus the expansion cards wired in (Society, Big Cleanup, Blue
Sky, Scorched Ground, Dancing Imp, Hero, Plane Between Planes). Keep this list
in sync with src/data/cards/astrologers.ts.
"""
import io
import sys
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = "https://en.homm3bg.wiki/assets"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

# Every astrologers card the engine deals (keep in sync with astrologers.ts).
SLUGS = [
    # Core Game (19)
    "annoying_lizard",
    "battalions_stallion",
    "crazy_wizard",
    "dead_silence",
    "fancy_pixie",
    "fluffy_rabbit",
    "friendly_beaver",
    "gold_dragon",
    "greedy_dragon",
    "grim_warlock",
    "groovy_satyr",
    "isras_friends",
    "magic_tortoise",
    "merry_leprechaun",
    "profuse_growth",
    "swift_weasel",
    "terrible_plague",
    "white_raven",
    "wild_debauchery",
    # Expansion cards wired in
    "big_cleanup",            # Fortress
    "blue_sky",               # Tower
    "scorched_ground",        # Tower
    "society",                # Tower
    "dancing_imp",            # Inferno
    "hero",                   # Inferno
    "plane_between_planes",   # Fortress
    "ammo_cart",              # Rampart
    "mcgiver",                # Rampart
    "explorers",              # Inferno
    "charlie_and_his_circus", # Rampart
    "unexpected_reinforcements",  # Tower
]

# The wiki publishes every proclamation at this landscape card size.
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
    print(f"Astrologers Proclaim cards ({len(SLUGS)}):")
    for slug in SLUGS:
        src = f"{WIKI}/astrologers_proclaim-{slug}.webp"
        save_card(fetch(src), src, f"astrologers_proclaim-{slug}.webp")
    print("Done.")


if __name__ == "__main__":
    main()
