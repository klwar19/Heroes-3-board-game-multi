#!/usr/bin/env python3
"""
Fetch the real board-game TOWN BOARD scans used by the Town Board view
(src/components/adventure/town-board.tsx, manifest src/data/towns/boards.ts):

  - en.homm3bg.wiki serves the printed board scans (2265x1651) as
      /assets/towns-<faction>-empty.webp  (empty board: name plates + costs)
      /assets/towns-<faction>-full.webp   (all 8 building tiles slotted in)
    Both exist for the seven boards published there: castle, rampart, inferno,
    necropolis, dungeon, tower, fortress. The empty scans for the first six are
    already in the repo; this script fills in the missing fortress empty and
    all seven "full" scans.
  - Cove has no published board, so its DESIGNED board (CSS layout in the same
    die-cut proportions) uses the fully-built PC townscape from
    heroes.thelazy.net as its panorama, exactly like the existing
    conflux/bulwark/factory strips (towns-<faction>-empty.webp there are PC
    townscapes, not board scans - see boards.ts for which faction uses what).

Idempotent: existing non-empty targets are skipped. A miss is reported but
does not abort (the town window falls back to the designed board).
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "assets"
WIKI = "https://en.homm3bg.wiki/assets"
LAZY = "https://heroes.thelazy.net/index.php/Special:FilePath"

# The seven factions whose printed board is published on the fan wiki.
WIKI_BOARDS = ["castle", "rampart", "inferno", "necropolis", "dungeon", "tower", "fortress"]

# Designed-board panoramas: fully-built PC townscapes from thelazy.net.
# conflux/bulwark/factory already ship as towns-<f>-empty.webp (older scripts);
# cove is fetched here under the unambiguous -town suffix.
PANORAMAS = {"towns-cove-town.webp": ["Cove-in.png", "Cove-in_(HotA).png", "Cove_town.png"]}


def fetch(url: str) -> bytes | None:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (town-board fetch script)"})
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except Exception as error:  # noqa: BLE001 - report and move on
        print(f"  ! {url}: {error}")
        return None


def save_webp(target: Path, data: bytes) -> bool:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as error:  # noqa: BLE001
        print(f"  ! {target.name}: not a decodable image ({error})")
        return False
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")
    image.save(target, "WEBP", quality=90, method=6)
    print(f"  + {target.name} ({image.size[0]}x{image.size[1]})")
    return True


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for faction in WIKI_BOARDS:
        for state in ("empty", "full"):
            target = ROOT / f"towns-{faction}-{state}.webp"
            if target.exists() and target.stat().st_size > 0:
                print(f"  = {target.name} (already present)")
                continue
            data = fetch(f"{WIKI}/towns-{faction}-{state}.webp")
            if data:
                save_webp(target, data)
    for filename, candidates in PANORAMAS.items():
        target = ROOT / filename
        if target.exists() and target.stat().st_size > 0:
            print(f"  = {filename} (already present)")
            continue
        for candidate in candidates:
            data = fetch(f"{LAZY}/{candidate}")
            if data and save_webp(target, data):
                break


if __name__ == "__main__":
    main()
