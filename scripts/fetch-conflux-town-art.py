#!/usr/bin/env python3
"""
Fetch the Conflux town-screen building renders and town background from
heroes.thelazy.net, saving them under /public/assets/town as WEBP using the
filenames wired in TOWN_BUILDING_IMAGES.conflux (src/data/assets/homm-assets.ts)
and the town background as towns-conflux-empty.webp.

thelazy.net is a MediaWiki, so Special:FilePath/<File> redirects to the real
(hashed) image URL. Each target lists candidate File names; the first that
resolves to a decodable image wins. Misses are reported but do NOT abort, so a
renamed structure just leaves that one tile art-pending (the town panel renders
fine without it).
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

LAZY = "https://heroes.thelazy.net/index.php/Special:FilePath"
ROOT = Path(__file__).resolve().parent.parent / "public" / "assets"
TOWN = ROOT / "town"

# local output file (under public/assets/town) -> candidate thelazy.net File names
BUILDINGS = {
    "conflux_city_hall.webp": ["Conflux_City_Hall_large.gif", "Conflux_Town_Hall_large.gif"],
    "conflux_citadel.webp": ["Conflux_Citadel_large.gif", "Conflux_Fort_large.gif"],
    "conflux_mage_guild.webp": ["Conflux_Mage_Guild_level_1_large.gif", "Conflux_Mage_Guild_large.gif"],
    "conflux_altar_of_air.webp": ["Conflux_Altar_of_Air.gif", "Conflux_Altar_of_air.gif"],
    "conflux_altar_of_fire.webp": ["Conflux_Altar_of_Fire.gif", "Conflux_Altar_of_fire.gif"],
    "conflux_pyre.webp": ["Conflux_Pyre.gif", "Conflux_Upg._Pyre.gif"],
    "conflux_garden_of_life.webp": ["Conflux_Garden_of_Life.gif", "Conflux_Garden_of_life.gif"],
    "conflux_magic_university.webp": ["Conflux_Magic_University.gif", "Magic_University.gif"],
}
# town background -> public/assets/towns-conflux-empty.webp
BACKGROUND = ("towns-conflux-empty.webp", ["Conflux-in.png", "Conflux-in_(HotA).png", "Conflux_town.png"])


def fetch(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status != 200:
                return None
            return resp.read()
    except Exception:  # noqa: BLE001
        return None


def open_image(data: bytes) -> Image.Image | None:
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
        return im
    except Exception:  # noqa: BLE001
        return None


def save_first(out_path: Path, candidates: list[str]) -> bool:
    for name in candidates:
        url = f"{LAZY}/{name}"
        data = fetch(url)
        if not data:
            continue
        im = open_image(data)
        if im is None:
            continue
        im.convert("RGBA").save(out_path, "WEBP", quality=92, method=6)
        print(f"  OK {out_path.name} <- {name} {im.size}")
        return True
    print(f"  MISS {out_path.name} (tried: {', '.join(candidates)})")
    return False


def main() -> None:
    TOWN.mkdir(parents=True, exist_ok=True)
    ok = 0
    total = 0
    for out_name, candidates in BUILDINGS.items():
        total += 1
        if save_first(TOWN / out_name, candidates):
            ok += 1
    total += 1
    if save_first(ROOT / BACKGROUND[0], BACKGROUND[1]):
        ok += 1
    print(f"done: {ok}/{total} assets fetched")


if __name__ == "__main__":
    main()
