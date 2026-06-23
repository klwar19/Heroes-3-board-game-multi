#!/usr/bin/env python3
"""
Fetch the ability and war-machine card scans from the fan wiki
(en.homm3bg.wiki), mirroring the asset conventions the repo already uses:

  - Ability cards     -> /assets/abilities-<slug>.webp
  - War-machine cards -> /assets/war_machines-<slug>.webp

The wiki publishes each as a portrait card scan (743x1040, RGBA). We download
each, validate it (HTTP 200 + decodable image), and write it verbatim — the
committed ability/war-machine assets are byte-identical to the wiki source (no
crop/re-encode), so a plain copy keeps them in sync.

Only the cards that actually HAVE a scan on the wiki are listed:
  - The four "Basic <School> Magic" abilities and Interference render the deck
    back (`/assets/player-deck-back.webp`), so they have no scan to fetch.
  - Catapult and Cannon have no card art on the wiki at all (their pages fall
    back to the deck back), so they are intentionally omitted.

Keep this list in sync with src/data/cards/abilities-extra.ts and
src/data/cards/permanents.ts; src/engine/ability-war-machine-art.test.ts fails
if any referenced cardImage is missing on disk.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

WIKI = "https://en.homm3bg.wiki/assets"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

# Ability cards with a real scan on the wiki (slug = file stem after "abilities-").
ABILITY_SLUGS = [
    "air_magic",
    "archery",
    "armorer",
    "artillery",
    "ballistics",
    "diplomacy",
    "eagle_eye",
    "earth_magic",
    "estates",
    "fire_magic",
    "first_aid",
    "intelligence",
    "leadership",
    "learning",
    "logistics",
    "luck",
    "mysticism",
    "necromancy",
    "offense",
    "pathfinding",
    "resistance",
    "scholar",
    "scouting",
    "sorcery",
    "tactics",
    "water_magic",
    "wisdom",
]

# War machines with a real scan on the wiki (Catapult / Cannon have none).
WAR_MACHINE_SLUGS = [
    "first_aid_tent",
    "ballista",
    "ammo_cart",
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def save(data: bytes, url: str, out_name: str) -> None:
    try:
        Image.open(io.BytesIO(data)).load()  # validate it decodes
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"FAIL not an image ({exc}) {url}")
    dst = OUT / out_name
    dst.write_bytes(data)
    print(f"  {out_name} ({len(data)} bytes)")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Ability cards ({len(ABILITY_SLUGS)}):")
    for slug in ABILITY_SLUGS:
        name = f"abilities-{slug}.webp"
        save(fetch(f"{WIKI}/{name}"), f"{WIKI}/{name}", name)
    print(f"War-machine cards ({len(WAR_MACHINE_SLUGS)}):")
    for slug in WAR_MACHINE_SLUGS:
        name = f"war_machines-{slug}.webp"
        save(fetch(f"{WIKI}/{name}"), f"{WIKI}/{name}", name)
    print("Done.")


if __name__ == "__main__":
    main()
