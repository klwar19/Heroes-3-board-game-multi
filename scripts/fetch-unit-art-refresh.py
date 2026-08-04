#!/usr/bin/env python3
"""
Refresh the printed UNIT card faces from the fan wiki (en.homm3bg.wiki), 2026-08.

Scope (exactly the sets the refresh was asked for):

  1. Faction Few+Pack faces of STRONGHOLD, COVE and CONFLUX (7 units each).
  2. The NEUTRAL guard cards of those same creature lines, plus the four
     stand-alone neutrals Steel Golems / Leprechaun / Fangarm / Satyrs.
  3. The single-sided NEUTRAL Elemental guard cards
     (air/earth/fire/water + ice/storm/energy/magma/magic).
  4. The Conflux SUMMON-ONLY Elemental Few/Pack cards.

Sets 3 and 4 are DIFFERENT PRINTED CARDS and must never be crossed. The wiki
names them apart and so does this script:

    neutral guard  ->  assets/units-neutral-<tier>-<slug-singular>_elemental.webp
                       (printed "Air Elemental", STRETCH GOALS 076/197, gold cost)
    conflux summon ->  assets/units-summoned-bronze-<slug>_elementals-few|pack.webp
                       (printed "Air Elementals", CONFLUX 075/080, "# FEW"/"# PACK",
                        no cost band -- summons are free)

Both are normalised onto the LOCAL repo names (never the other way round):

    neutral guard  ->  public/assets/units-neutral-<tier>-<slug>_elementals.webp
    conflux summon ->  public/assets/units-conflux-bronze-<slug>_elementals-few|pack.webp

Encoding follows the repo conventions:
  - Families EXCLUDED from scripts/compress-media.mjs (units-neutral-*, and
    units-conflux-bronze-*_elementals-*) are saved at WEBP quality=94 method=6,
    the deliberate size band their tests pin.
  - Ordinary faction faces (units-<faction>-*) are saved at quality=92 method=6
    (the fetch convention; compress-media may later take them to q85).

Every download is validated (HTTP 200 + decodable + card geometry) and the
script aborts loudly on any miss. Files are rewritten only when the encoded
bytes actually differ, and each file is reported NEW / updated / unchanged.
"""
import io
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = "https://en.homm3bg.wiki/assets"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

# The canonical printed-card geometry the wiki ships (and the size the repo's
# other card fetchers normalise to -- see fetch-extra-heroes-art.py CARD_SIZE).
CARD_SIZE = (743, 1040)

# --- set 1: faction Few/Pack rosters (7 units per faction) -------------------
FACTION_ROSTERS = {
    "stronghold": [
        ("bronze", "goblins"), ("bronze", "wolf_raiders"), ("bronze", "orcs"),
        ("silver", "ogres"), ("silver", "thunderbirds"),
        ("golden", "cyclopes"), ("golden", "behemoths"),
    ],
    "cove": [
        ("bronze", "oceanids"), ("bronze", "seamen"), ("bronze", "sea_dogs"),
        ("silver", "ayssids"), ("silver", "sorceresses"),
        ("golden", "nix"), ("golden", "haspids"),
    ],
    "conflux": [
        ("bronze", "sprites"), ("bronze", "ice_elementals"), ("bronze", "storm_elementals"),
        ("silver", "energy_elementals"), ("silver", "magma_elementals"),
        ("golden", "magic_elementals"), ("golden", "phoenixes"),
    ],
}

# --- set 2: neutral guards of those lines + the four named stand-alones ------
NEUTRAL_GUARDS = [
    # stronghold line
    ("bronze", "goblins"), ("bronze", "wolf_raiders"), ("bronze", "orcs"),
    ("silver", "ogres"), ("silver", "thunderbirds"),
    ("golden", "cyclopes"), ("golden", "behemoths"),
    # cove line
    ("bronze", "oceanids"), ("bronze", "seamen"), ("bronze", "sea_dogs"),
    ("silver", "ayssids"), ("silver", "sorceresses"),
    ("golden", "nix"), ("golden", "haspids"),
    # conflux line
    ("bronze", "sprites"), ("bronze", "ice_elementals"), ("bronze", "storm_elementals"),
    ("silver", "energy_elementals"), ("silver", "magma_elementals"),
    ("golden", "magic_elementals"), ("azure", "phoenixes"),
    # explicitly requested stand-alones
    ("silver", "steel_golems"), ("bronze", "leprechaun"),
    ("silver", "fangarm"), ("silver", "satyrs"),
]

# --- set 3: the four single-sided NEUTRAL Elemental guards -------------------
# local tier -> wiki file uses the SINGULAR creature name ("air_elemental").
NEUTRAL_ELEMENTAL_GUARDS = [
    ("bronze", "air_elementals"),
    ("golden", "earth_elementals"),
    ("silver", "fire_elementals"),
    ("silver", "water_elementals"),
]

# --- set 4: the Conflux SUMMON-ONLY Few/Pack Elemental cards -----------------
SUMMON_ELEMENTALS = ["air_elementals", "earth_elementals", "fire_elementals", "water_elementals"]


def quality_for(local_name: str) -> int:
    """q94 for the compress-media EXCLUDE_IMAGE families, q92 otherwise."""
    if local_name.startswith("units-neutral-"):
        return 94
    if local_name.startswith("units-conflux-bronze-") and "_elementals-" in local_name:
        return 94
    return 92


def plan() -> "list[tuple[str, str, str]]":
    """(wiki_name, local_name, set_label) for every file this refresh touches."""
    jobs = []
    for faction, roster in FACTION_ROSTERS.items():
        for tier, slug in roster:
            for side in ("few", "pack"):
                name = f"units-{faction}-{tier}-{slug}-{side}.webp"
                jobs.append((name, name, f"1 faction {faction}"))
    for tier, slug in NEUTRAL_GUARDS:
        name = f"units-neutral-{tier}-{slug}.webp"
        jobs.append((name, name, "2 neutral guard"))
    for tier, slug in NEUTRAL_ELEMENTAL_GUARDS:
        # wiki: singular "…_elemental.webp"; local: plural "…_elementals.webp"
        wiki = f"units-neutral-{tier}-{slug[:-1]}.webp"
        jobs.append((wiki, f"units-neutral-{tier}-{slug}.webp", "3 neutral ELEMENTAL guard"))
    for slug in SUMMON_ELEMENTALS:
        for side in ("few", "pack"):
            wiki = f"units-summoned-bronze-{slug}-{side}.webp"
            jobs.append((wiki, f"units-conflux-bronze-{slug}-{side}.webp", "4 conflux SUMMON"))
    return jobs


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status != 200:
                raise SystemExit(f"FAIL {resp.status} {url}")
            return resp.read()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"FAIL HTTP {exc.code} {url}")


def open_card(data: bytes, url: str) -> Image.Image:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"FAIL not an image ({exc}) {url}")
    if im.size != CARD_SIZE:
        # The wiki ships every card at 743x1040; anything else is normalised so a
        # future re-scan at another resolution cannot silently change geometry.
        print(f"  note  {url} is {im.size}, resizing to {CARD_SIZE}")
        im = im.convert("RGBA").resize(CARD_SIZE, Image.LANCZOS)
    return im.convert("RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = plan()
    counts = {"new": 0, "updated": 0, "unchanged": 0}
    print(f"Refreshing {len(jobs)} unit card faces from {WIKI}\n")
    current_label = None
    for wiki_name, local_name, label in jobs:
        if label != current_label:
            current_label = label
            print(f"-- set {label}")
        url = f"{WIKI}/{wiki_name}"
        im = open_card(fetch(url), url)
        quality = quality_for(local_name)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=quality, method=6)
        encoded = buf.getvalue()

        dst = OUT / local_name
        if not dst.exists():
            dst.write_bytes(encoded)
            counts["new"] += 1
            print(f"  NEW       q{quality} {len(encoded):>7}B  {local_name}")
            continue
        old = dst.read_bytes()
        if old == encoded:
            counts["unchanged"] += 1
            print(f"  unchanged q{quality} {len(encoded):>7}B  {local_name}")
            continue
        dst.write_bytes(encoded)
        counts["updated"] += 1
        src_note = f" (wiki {wiki_name})" if wiki_name != local_name else ""
        print(f"  updated   q{quality} {len(old):>7}B -> {len(encoded):>7}B  {local_name}{src_note}")

    print(
        f"\nDone. new={counts['new']} updated={counts['updated']} "
        f"unchanged={counts['unchanged']} total={len(jobs)}"
    )


if __name__ == "__main__":
    sys.exit(main())
