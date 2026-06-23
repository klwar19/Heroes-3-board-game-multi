#!/usr/bin/env python3
"""
Fetch Bulwark (HotA fan-faction) art from heroes.thelazy.net and save it under
/public/assets using the filenames the board-game data already references:

  - unit card art  -> units-bulwark-<tier>-<slug>-<few|pack>.webp
                      (the creature's full portrait, composed onto a card canvas)
  - hero portraits -> hero_portraits-<slug>.webp   (upscaled to 464x512)
  - town buildings -> town/bulwark_<key>.webp
  - rune skill art -> runes-<basic|advanced|expert>.webp  (UI for the Rune track)
  - town backdrop  -> towns-bulwark-empty.webp

thelazy.net is a MediaWiki, so Special:FilePath/<File> redirects to the real
(hashed) image. Each target lists candidate File names; the first that resolves
to a decodable image wins. Misses are reported but do NOT abort — a renamed
asset just stays art-pending and the UI renders fine without it.

This is a non-profit fan project; these scans are placeholders to be replaced
with owned art before any wider release.
"""
import io
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

LAZY = "https://heroes.thelazy.net/index.php/Special:FilePath"
ROOT = Path(__file__).resolve().parent.parent / "public" / "assets"
TOWN = ROOT / "town"

CARD_SIZE = (743, 1040)        # the board game's unit-card canvas
CARD_BG = (18, 32, 48, 255)    # frosty dark slate, matches Bulwark's palette
PORTRAIT_SIZE = (464, 512)     # the board game's hero-portrait canvas

# ---- unit card art: local slug -> (few File candidates, pack File candidates) -
# few = base creature, pack = upgrade. Parentheses are URL-encoded on fetch.
UNITS = {
    "units-bulwark-bronze-kobolds": (
        ["Kobold_portrait.png", "Creature_Kobold.png"],
        ["Kobold_Foreman_portrait.png", "Creature_Kobold_Foreman.png"],
    ),
    "units-bulwark-bronze-mountain_rams": (
        ["Mountain_Ram_portrait.png", "Creature_Mountain_Ram.png"],
        ["Argali_portrait.png", "Creature_Argali.png"],
    ),
    "units-bulwark-bronze-snow_elves": (
        ["Snow_Elf_(HotA)_portrait.png", "Snow_Elf_portrait.png", "Creature_Snow_Elf_(HotA).png"],
        ["Steel_Elf_portrait.png", "Creature_Steel_Elf.png"],
    ),
    "units-bulwark-silver-yetis": (
        ["Yeti_(HotA)_portrait.png", "Yeti_portrait.png", "Creature_Yeti_(HotA).png"],
        ["Yeti_Runemaster_portrait.png", "Creature_Yeti_Runemaster.png"],
    ),
    "units-bulwark-silver-shamans": (
        ["Shaman_portrait.png", "Creature_Shaman.png"],
        ["Great_Shaman_portrait.png", "Creature_Great_Shaman.png"],
    ),
    "units-bulwark-golden-mammoths": (
        ["Mammoth_(HotA)_portrait.png", "Mammoth_portrait.png", "Creature_Mammoth_(HotA).png"],
        ["War_Mammoth_portrait.png", "Creature_War_Mammoth.png"],
    ),
    "units-bulwark-golden-jotunns": (
        ["Jotunn_portrait.png", "Creature_Jotunn.png"],
        ["Jotunn_Warlord_portrait.png", "Creature_Jotunn_Warlord.png"],
    ),
}

# ---- hero portraits: slug -> File candidates (large preferred, small fallback) -
HEROES = {
    "dhuin": ["Hero_Dhuin_large.png", "Hero_Dhuin.png", "Hero_Dhuin_small.png", "Dhuin.png"],
    "creyle": ["Hero_Creyle_large.png", "Hero_Creyle.png", "Hero_Creyle_small.png", "Creyle.png"],
    "glacius": ["Hero_Glacius_large.png", "Hero_Glacius.png", "Hero_Glacius_small.png", "Glacius.png"],
    "kriv": ["Hero_Kriv_large.png", "Hero_Kriv.png", "Hero_Kriv_small.png", "Kriv.png"],
}

# ---- town buildings: local file -> File candidates ---------------------------
BUILDINGS = {
    "bulwark_city_hall.webp": ["Bulwark_City_Hall_large.png", "Bulwark_Town_Hall_large.png", "Bulwark_Capitol_large.png"],
    "bulwark_citadel.webp": ["Bulwark_Citadel_large.png", "Bulwark_Castle_large.png", "Bulwark_Fort_large.png"],
    "bulwark_mage_guild.webp": ["Bulwark_Mage_Guild_level_1_large.png", "Bulwark_Mage_Guild_large.png"],
    "bulwark_dwelling_bronze.webp": ["Bulwark_Colliery_large.png", "Colliery-dwelling.webp", "Bulwark_Colliery.png"],
    "bulwark_dwelling_silver.webp": ["Bulwark_Mountain_Embassy_large.png", "Mountain_Embassy-dwelling.webp", "Bulwark_Frigid_Spur_large.png", "Frigid_Spur-dwelling.webp"],
    "bulwark_dwelling_gold.webp": ["Bulwark_Frosthome_large.png", "Bulwark_Mammoth_Stalls_large.png"],
    "bulwark_sieidi.webp": ["Bulwark_Sieidi_of_the_Runes_large.png"],
    "bulwark_altar.webp": ["Bulwark_Altar_of_the_Runes_large.png"],
}

# ---- rune skill graphics: local file -> File candidates ----------------------
RUNES = {
    "runes-basic.webp": ["Basic_Runes_large.png", "Basic_Runes_small.png"],
    "runes-advanced.webp": ["Advanced_Runes_large.png", "Advanced_Runes_small.png"],
    "runes-expert.webp": ["Expert_Runes_large.png", "Expert_Runes_small.png"],
}

BACKGROUND = ("towns-bulwark-empty.webp", ["Bulwark-in.png", "Bulwark-in_(HotA).png", "Bulwark_town.png"])


def fetch(name: str) -> bytes | None:
    url = f"{LAZY}/{urllib.parse.quote(name)}"
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
        return im.convert("RGBA")
    except Exception:  # noqa: BLE001
        return None


def first_image(candidates: list[str]) -> tuple[Image.Image, str] | None:
    for name in candidates:
        data = fetch(name)
        if not data:
            continue
        im = open_image(data)
        if im is not None:
            return im, name
    return None


def save_card(out_path: Path, candidates: list[str]) -> bool:
    """Compose a creature portrait onto the card canvas (contain, centered)."""
    got = first_image(candidates)
    if got is None:
        print(f"  MISS {out_path.name} (tried: {', '.join(candidates)})")
        return False
    im, name = got
    canvas = Image.new("RGBA", CARD_SIZE, CARD_BG)
    # scale the portrait to fill ~88% of the card width, preserving aspect
    target_w = int(CARD_SIZE[0] * 0.88)
    scale = target_w / im.width
    target_h = int(im.height * scale)
    if target_h > int(CARD_SIZE[1] * 0.9):
        target_h = int(CARD_SIZE[1] * 0.9)
        scale = target_h / im.height
        target_w = int(im.width * scale)
    resized = im.resize((max(1, target_w), max(1, target_h)), Image.LANCZOS)
    ox = (CARD_SIZE[0] - resized.width) // 2
    oy = (CARD_SIZE[1] - resized.height) // 2
    canvas.alpha_composite(resized, (ox, oy))
    canvas.save(out_path, "WEBP", quality=92, method=6)
    print(f"  OK {out_path.name} <- {name} {im.size} -> {resized.size}")
    return True


def save_portrait(out_path: Path, candidates: list[str]) -> bool:
    """Upscale a hero portrait to the standard 464x512 (cover)."""
    got = first_image(candidates)
    if got is None:
        print(f"  MISS {out_path.name} (tried: {', '.join(candidates)})")
        return False
    im, name = got
    # cover-fit into the portrait canvas
    scale = max(PORTRAIT_SIZE[0] / im.width, PORTRAIT_SIZE[1] / im.height)
    resized = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    ox = (resized.width - PORTRAIT_SIZE[0]) // 2
    oy = (resized.height - PORTRAIT_SIZE[1]) // 2
    cropped = resized.crop((ox, oy, ox + PORTRAIT_SIZE[0], oy + PORTRAIT_SIZE[1]))
    cropped.save(out_path, "WEBP", quality=92, method=6)
    print(f"  OK {out_path.name} <- {name} {im.size}")
    return True


def save_native(out_path: Path, candidates: list[str]) -> bool:
    """Save the first resolving image as WEBP at its native size."""
    got = first_image(candidates)
    if got is None:
        print(f"  MISS {out_path.name} (tried: {', '.join(candidates)})")
        return False
    im, name = got
    im.save(out_path, "WEBP", quality=92, method=6)
    print(f"  OK {out_path.name} <- {name} {im.size}")
    return True


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    TOWN.mkdir(parents=True, exist_ok=True)
    ok = 0
    total = 0

    print("Units:")
    for slug, (few, pack) in UNITS.items():
        total += 2
        ok += save_card(ROOT / f"{slug}-few.webp", few)
        ok += save_card(ROOT / f"{slug}-pack.webp", pack)

    print("Heroes:")
    for slug, candidates in HEROES.items():
        total += 1
        ok += save_portrait(ROOT / f"hero_portraits-{slug}.webp", candidates)

    print("Buildings:")
    for out_name, candidates in BUILDINGS.items():
        total += 1
        ok += save_native(TOWN / out_name, candidates)

    print("Rune skill art:")
    for out_name, candidates in RUNES.items():
        total += 1
        ok += save_native(ROOT / out_name, candidates)

    print("Town backdrop:")
    total += 1
    ok += save_native(ROOT / BACKGROUND[0], BACKGROUND[1])

    print(f"done: {ok}/{total} assets fetched")


if __name__ == "__main__":
    main()
