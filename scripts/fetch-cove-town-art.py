#!/usr/bin/env python3
"""
Fetch the Cove town-screen building renders from heroes.thelazy.net, saving them
under /public/assets/town with the filenames wired in TOWN_BUILDING_IMAGES.cove
(src/data/assets/homm-assets.ts).

thelazy.net is a MediaWiki, so Special:FilePath/<File> redirects to the real
(hashed) image. The Cove structures are stored at their native town-screen sizes
— the generic "_large" structures at 150x70, the creature dwellings / faction
buildings at 58x64 — exactly matching the other GIF-based factions already in the
repo (e.g. rampart_centaur_stables.gif is 58x64), so we save the GIF bytes
verbatim (no re-encode) to keep them byte-identical to the source.

Board dwellings map to the fitting Cove creature dwelling: Bay -> Nymph
Waterfall, Nests Towering the Seas -> Nest, Redoubled Vortex -> Maelstrom.

Every download is validated (HTTP 200 + decodable image); the script aborts
loudly on any miss so a broken asset can never slip through.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

LAZY = "https://heroes.thelazy.net/index.php/Special:FilePath"
TOWN = Path(__file__).resolve().parent.parent / "public" / "assets" / "town"

# local file (under public/assets/town) -> thelazy.net File name
BUILDINGS = {
    "cove_city_hall_large.gif": "Cove_City_Hall_large.gif",
    "cove_citadel_large.gif": "Cove_Citadel_large.gif",
    "cove_mage_guild_level_1_large.gif": "Cove_Mage_Guild_level_1_large.gif",
    "cove_nymph_waterfall.gif": "Cove_Nymph_Waterfall.gif",   # dwelling_bronze (Bay)
    "cove_nest.gif": "Cove_Nest.gif",                          # dwelling_silver (Nests)
    "cove_maelstrom.gif": "Cove_Maelstrom.gif",               # dwelling_gold (Redoubled Vortex)
    "cove_thieves_guild.gif": "Cove_Thieves%27_Guild.gif",
    "cove_pub.gif": "Cove_Pub.gif",
}


def fetch(name: str) -> bytes:
    url = f"{LAZY}/{name}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def main() -> None:
    TOWN.mkdir(parents=True, exist_ok=True)
    for local, remote in BUILDINGS.items():
        data = fetch(remote)
        try:
            image = Image.open(io.BytesIO(data))
            image.load()
        except Exception as exc:  # pragma: no cover - guard against a bad download
            raise SystemExit(f"FAIL decode {remote}: {exc}")
        (TOWN / local).write_bytes(data)
        print(f"  {local} {image.size}")
    print("Done.")


if __name__ == "__main__":
    main()
