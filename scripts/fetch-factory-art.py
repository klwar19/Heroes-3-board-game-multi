#!/usr/bin/env python3
"""
Fetch Factory (HotA expansion) art from heroes.thelazy.net and save it under
/public/assets using the filenames the board-game data already references:

  - unit card art  -> units-factory-<tier>-<slug>-<few|pack>.webp
                      (PC creature portrait composed onto a card canvas)
  - hero portraits -> hero_portraits-<slug>.webp   (upscaled to 464x512)
  - town buildings -> town/factory_<key>.webp
  - town backdrop  -> towns-factory-empty.webp

thelazy.net is a MediaWiki, so Special:FilePath/<File> redirects to the real
(hashed) image URL. Each target lists candidate File names; the first that
resolves to a decodable image wins. Misses are reported but do NOT abort —
a renamed asset just stays art-pending and the UI renders fine without it.

This is a non-profit fan project; these scans are placeholders to be replaced
with owned art before any wider release.
"""
import io
import os
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

LAZY = "https://heroes.thelazy.net/index.php/Special:FilePath"
ROOT = Path(__file__).resolve().parent.parent / "public" / "assets"
TOWN = ROOT / "town"

CARD_SIZE = (743, 1040)          # board-game unit-card canvas
CARD_BG = (28, 22, 14, 255)      # dark industrial bronze, matches Factory palette
PORTRAIT_SIZE = (464, 512)       # board-game hero-portrait canvas

# Factory tier mapping (8 creatures across 3 grades):
#   bronze: Tier 1-3 (Halflings, Mechanics, Armadillos)
#   silver: Tier 4-5 (Automatons, Sandworms)
#   golden: Tier 6-8 (Gunslingers, Couatls, Dreadnoughts)

# slug -> (few File candidates, pack File candidates)
UNITS = {
    "units-factory-bronze-halflings": (
        ["Halfling_(Factory)_portrait.png", "Halfling_portrait.png", "Creature_Halfling_(Factory).png"],
        ["Halfling_Grenadier_portrait.png", "Creature_Halfling_Grenadier.png"],
    ),
    "units-factory-bronze-mechanics": (
        ["Mechanic_portrait.png", "Creature_Mechanic.png"],
        ["Engineer_portrait.png", "Creature_Engineer.png"],
    ),
    "units-factory-bronze-armadillos": (
        ["Armadillo_portrait.png", "Creature_Armadillo.png"],
        ["Bellwether_Armadillo_portrait.png", "Creature_Bellwether_Armadillo.png"],
    ),
    "units-factory-silver-automatons": (
        ["Automaton_portrait.png", "Creature_Automaton.png"],
        ["Sentinel_Automaton_portrait.png", "Creature_Sentinel_Automaton.png"],
    ),
    "units-factory-silver-sandworms": (
        ["Sandworm_portrait.png", "Creature_Sandworm.png"],
        ["Olgoi-Khorkhoi_portrait.png", "Creature_Olgoi-Khorkhoi.png"],
    ),
    "units-factory-golden-gunslingers": (
        ["Gunslinger_portrait.png", "Creature_Gunslinger.png"],
        ["Bounty_Hunter_portrait.png", "Creature_Bounty_Hunter.png"],
    ),
    "units-factory-golden-couatls": (
        ["Couatl_portrait.png", "Creature_Couatl.png"],
        ["Crimson_Couatl_portrait.png", "Creature_Crimson_Couatl.png"],
    ),
    "units-factory-golden-dreadnoughts": (
        ["Dreadnought_(Factory)_portrait.png", "Dreadnought_portrait.png", "Creature_Dreadnought_(Factory).png"],
        ["Juggernaut_(Factory)_portrait.png", "Juggernaut_portrait.png", "Creature_Juggernaut_(Factory).png"],
    ),
}

# slug -> File candidates (large preferred, small fallback)
HEROES = {
    # Mercenary class (might)
    "henrietta":  ["Hero_Henrietta.png", "Hero_Henrietta_large.png", "Hero_Henrietta_small.png"],
    "sam":        ["Hero_Sam.png", "Hero_Sam_large.png", "Hero_Sam_small.png"],
    "tancred":    ["Hero_Tancred.png", "Hero_Tancred_large.png", "Hero_Tancred_small.png"],
    "melchior":   ["Hero_Melchior.png", "Hero_Melchior_large.png", "Hero_Melchior_small.png"],
    "floribert":  ["Hero_Floribert.png", "Hero_Floribert_large.png", "Hero_Floribert_small.png"],
    "wynona":     ["Hero_Wynona.png", "Hero_Wynona_large.png", "Hero_Wynona_small.png"],
    "dury":       ["Hero_Dury.png", "Hero_Dury_large.png", "Hero_Dury_small.png"],
    "morton":     ["Hero_Morton.png", "Hero_Morton_large.png", "Hero_Morton_small.png"],
    "tavin":      ["Hero_Tavin.png", "Hero_Tavin_large.png", "Hero_Tavin_small.png"],
    "murdoch":    ["Hero_Murdoch.png", "Hero_Murdoch_large.png", "Hero_Murdoch_small.png"],
    # Artificer class (magic)
    "celestine":  ["Hero_Celestine.png", "Hero_Celestine_large.png", "Hero_Celestine_small.png"],
    "todd":       ["Hero_Todd.png", "Hero_Todd_large.png", "Hero_Todd_small.png"],
    "agar":       ["Hero_Agar.png", "Hero_Agar_large.png", "Hero_Agar_small.png"],
    "bertram":    ["Hero_Bertram.png", "Hero_Bertram_large.png", "Hero_Bertram_small.png"],
    "wrathmont":  ["Hero_Wrathmont.png", "Hero_Wrathmont_large.png", "Hero_Wrathmont_small.png"],
    "ziph":       ["Hero_Ziph.png", "Hero_Ziph_large.png", "Hero_Ziph_small.png"],
    "victoria":   ["Hero_Victoria.png", "Hero_Victoria_large.png", "Hero_Victoria_small.png"],
    "eanswythe":  ["Hero_Eanswythe.png", "Hero_Eanswythe_large.png", "Hero_Eanswythe_small.png"],
    "frederick":  ["Hero_Frederick.png", "Hero_Frederick_large.png", "Hero_Frederick_small.png"],
}

# local file -> File candidates on the wiki
BUILDINGS = {
    "factory_city_hall.webp": [
        "Factory_City_Hall_large.gif", "Factory_Town_Hall_large.gif", "Factory_Capitol_large.gif",
    ],
    "factory_citadel.webp": [
        "Factory_Citadel_large.gif", "Factory_Castle_large.gif", "Factory_Fort_large.gif",
    ],
    "factory_mage_guild.webp": [
        "Factory_Mage_Guild_level_1_large.gif", "Factory_Mage_Guild_large.gif",
    ],
    "factory_blacksmith.webp": [
        "Factory_Blacksmith_large.gif", "Factory_Blacksmith.gif",
    ],
    "factory_dwelling_bronze.webp": [
        "Factory_Halfling_Adobe_large.gif", "Factory_Halfling_Adobe.gif",
        "Halfling_Adobe-dwelling.webp", "Factory_Foundry_large.gif",
    ],
    "factory_dwelling_silver.webp": [
        "Factory_Ranch_large.gif", "Factory_Ranch.gif",
        "Factory_Manufactory_large.gif", "Factory_Manufactory.gif",
        "Ranch-dwelling.webp", "Manufactory-dwelling.webp",
    ],
    "factory_dwelling_gold.webp": [
        "Factory_Gantry_large.gif", "Factory_Gantry.gif",
        "Factory_Serpentarium_large.gif", "Gantry-dwelling.webp",
    ],
    "factory_bank.webp": [
        "Factory_Bank_large.gif", "Factory_Bank.gif",
    ],
    "factory_mana_generator.webp": [
        "Factory_Mana_Generator_large.gif", "Factory_Mana_Generator.gif",
        "Mana_Generator.gif",
    ],
    "factory_artifact_merchants.webp": [
        "Factory_Artifact_Merchants_large.gif", "Factory_Artifact_Merchants.gif",
        "Artifact_Merchants.gif",
    ],
    "factory_pen.webp": [
        "Factory_Pen_large.gif", "Factory_Pen.gif",
    ],
    "factory_lightning_rod.webp": [
        "Factory_Lightning_Rod_large.gif", "Factory_Lightning_Rod.gif",
    ],
    "factory_tavern.webp": [
        "Factory_Tavern_large.gif", "Factory_Tavern.gif",
    ],
    "factory_marketplace.webp": [
        "Factory_Marketplace_large.gif", "Factory_Marketplace.gif",
    ],
    "factory_resource_silo.webp": [
        "Factory_Resource_Silo_large.gif", "Factory_Resource_Silo.gif",
    ],
}

BACKGROUND = (
    "towns-factory-empty.webp",
    ["Factory-in.png", "Factory-in_(HotA).png", "Factory_town.png", "Factory_town_background.png"],
)


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(name: str) -> bytes | None:
    url = f"{LAZY}/{urllib.parse.quote(name)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (factory-asset-importer)"})
        with urllib.request.urlopen(req, timeout=60, context=_ctx()) as resp:
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
    """Upscale a hero portrait to the standard 464x512 (cover-fit)."""
    got = first_image(candidates)
    if got is None:
        print(f"  MISS {out_path.name} (tried: {', '.join(candidates)})")
        return False
    im, name = got
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

    print("Town backdrop:")
    total += 1
    ok += save_native(ROOT / BACKGROUND[0], BACKGROUND[1])

    print(f"\ndone: {ok}/{total} assets fetched")


if __name__ == "__main__":
    main()
