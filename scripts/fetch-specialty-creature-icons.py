#!/usr/bin/env python3
"""
Download the transparent creature battle sprites used as the central specialty
symbol for the art-less UNIT-specialist heroes (the ones whose specialty card
names a creature: Zealots, Marksmen, Sorceresses, Oceanids, Harpies, Dragons,
Basilisks, Sharpshooters, Elves, Enchanters), mirroring the existing Bulwark
pattern (dhuin -> Snow Elves portrait, etc.).

Source: heroes.thelazy.net (the classic HoMM3 wiki). Each creature page carries a
"File:Creature <Name>.png" — the full creature on a transparent background. We
resolve its real upload URL via the MediaWiki API, download it, autocrop to the
non-transparent bounding box, fit it inside a square canvas and save as a
transparent WEBP:

  /assets/specialty-card/creature-<slug>.webp

Every download is validated (HTTP 200 + decodable RGBA + non-trivial size); the
script aborts loudly on any miss so a broken icon can never slip through.
"""
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "specialty-card"
API = "https://heroes.thelazy.net/api.php"
CANVAS = 512

# slug -> the exact "Creature <Name>.png" file on thelazy. The creature is the
# unit named by that hero's specialty card (verified against src/data/cards).
CREATURES = {
    "zealot": "Creature Zealot.png",            # ingham — Zealots (Castle)
    "marksman": "Creature Marksman.png",        # valeska — Marksmen (Castle)
    "sorceress": "Creature Sorceress.png",      # casmetra — Sorceresses (Cove)
    "oceanid": "Creature Oceanid.png",          # cassiopeia — Oceanids (Cove)
    "harpy": "Creature Harpy.png",              # lorelei — Harpies (Dungeon)
    "black_dragon": "Creature Black Dragon.png",# tarnum_dungeon — Dragons (Dungeon)
    "basilisk": "Creature Basilisk.png",        # tarnum_fortress — Basilisks (Fortress)
    "sharpshooter": "Creature Sharpshooter.png",# tarnum_rampart — Sharpshooters (Rampart)
    "grand_elf": "Creature Grand Elf.png",      # ivor — Elves (Rampart)
    "enchanter": "Creature Enchanter.png",      # tarnum_conflux — Enchanters
}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (specialty-icon-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def image_url(file_title: str) -> str:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": f"File:{file_title}",
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json",
        }
    )
    data = json.loads(fetch(f"{API}?{q}").decode("utf-8"))
    pages = data["query"]["pages"]
    for page in pages.values():
        info = page.get("imageinfo")
        if info:
            return info[0]["url"]
    raise SystemExit(f"FAIL no imageinfo for File:{file_title}")


def process(raw: bytes, file_title: str) -> Image.Image:
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    if img.width < 40 or img.height < 40:
        raise SystemExit(f"FAIL {file_title} is suspiciously small {img.size}")
    bbox = img.getbbox()  # trim fully-transparent margins
    if bbox:
        img = img.crop(bbox)
    # Fit inside a square transparent canvas so every icon shares one aspect.
    scale = min(CANVAS / img.width, CANVAS / img.height)
    img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(img, ((CANVAS - img.width) // 2, (CANVAS - img.height) // 2), img)
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, file_title in CREATURES.items():
        url = image_url(file_title)
        icon = process(fetch(url), file_title)
        name = f"creature-{slug}.webp"
        icon.save(OUT / name, "WEBP", quality=92, method=6)
        print(f"  {name:28s} <- {file_title} ({url.rsplit('/', 1)[-1]})")
    print("Done.")


if __name__ == "__main__":
    main()
