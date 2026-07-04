#!/usr/bin/env python3
"""
Build the hero-selection info-board iconography:

1. STAT SYMBOLS (public/assets/hero-info/stat-<attack|defense|power|knowledge>.webp)
   The four printed hero-statistic symbols — crossed swords, shield, open spell
   book (power), stack of tomes (knowledge) — from the board-game asset repo
   (github.com/Heegu-sama/Homm3BG, assets/images/<stat>.png). Each is trimmed to
   its opaque content and centred in a uniform transparent square so all four
   read at the same visual weight in the stat row.

2. ABILITY SYMBOLS (public/assets/ability-symbols/<skill>.webp)
   The secondary-skill emblems shown next to a hero's starting ability. The repo
   publishes 21 clean transparent symbols under assets/skills/<skill>.png; those
   are trimmed + squared like the stats. The five board-game abilities with no
   standalone symbol in that folder (Diplomacy, Mysticism, Scholar, Scouting,
   Tactics) are recovered from the top art of their own printed ability card
   (public/assets/abilities-<skill>.webp) and feathered into a soft oval so the
   leather margin melts away on the info board's leather chip.

Every download is validated (HTTP 200 + decodable image); the script aborts on
any miss. Non-profit fan project — these are placeholders to be replaced with
owned art before any wider release.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAW = "https://raw.githubusercontent.com/Heegu-sama/Homm3BG/main/assets"
ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public" / "assets"

BOX = 128          # uniform icon canvas
CONTENT = 112      # opaque content fits inside this square (uniform weight)
ALPHA_CUTOFF = 12


def fetch(url: str) -> Image.Image:
    with urllib.request.urlopen(url, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"HTTP {resp.status} for {url}")
        data = resp.read()
    im = Image.open(io.BytesIO(data))
    im.load()
    return im.convert("RGBA")


def square_fit(im: Image.Image) -> Image.Image:
    """Trim transparent margins, then centre on a BOX x BOX transparent square,
    scaled so the content spans CONTENT — every icon reads at one weight."""
    alpha = im.split()[3]
    mask = alpha.point(lambda a: 255 if a > ALPHA_CUTOFF else 0)
    bbox = mask.getbbox()
    if bbox:
        im = im.crop(bbox)
    scale = CONTENT / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (BOX, BOX), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((BOX - im.width) // 2, (BOX - im.height) // 2))
    return canvas


def oval_feather(im: Image.Image) -> Image.Image:
    """Fade a rectangular crop into a soft oval so its leather margin melts into
    the info board's leather chip (used for the 5 card-recovered symbols)."""
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    # Inset ellipse leaves a feathered rim; blur softens it into transparency.
    inset_x, inset_y = int(w * 0.03), int(h * 0.03)
    d.ellipse([inset_x, inset_y, w - inset_x, h - inset_y], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(w, h) * 0.06))
    out = im.copy()
    out.putalpha(mask)
    return out


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=92, method=6)
    with Image.open(path) as check:
        check.load()
    print(f"  wrote {path.relative_to(ROOT)}  {check.size}")


# --- 1. Stat symbols --------------------------------------------------------
STATS = ["attack", "defense", "power", "knowledge"]


def build_stats() -> None:
    print("stat symbols -> public/assets/hero-info/")
    for stat in STATS:
        icon = square_fit(fetch(f"{RAW}/images/{stat}.png"))
        save(icon, PUB / "hero-info" / f"stat-{stat}.webp")


# --- 2. Ability symbols -----------------------------------------------------
# The 21 clean transparent skill emblems the repo ships.
SKILL_EMBLEMS = [
    "air_magic", "archery", "armorer", "artillery", "attack", "eagle_eye",
    "earth_magic", "estates", "fire_magic", "first_aid", "intelligence",
    "interference", "leadership", "logistics", "luck", "necromancy",
    "pathfinding", "resistance", "sorcery", "water_magic", "wisdom",
]

# The five abilities with no standalone symbol: recover from the card top art.
# Boxes are in the 743x1040 printed-card space, tight around each illustration.
CARD_SYMBOLS = {
    "diplomacy": (188, 104, 560, 420),
    "mysticism": (150, 112, 592, 312),
    "scholar": (214, 96, 542, 314),
    "scouting": (236, 100, 512, 336),
    "tactics": (224, 86, 546, 322),
}


def build_abilities() -> None:
    print("ability symbols -> public/assets/ability-symbols/")
    for skill in SKILL_EMBLEMS:
        icon = square_fit(fetch(f"{RAW}/skills/{skill}.png"))
        save(icon, PUB / "ability-symbols" / f"{skill}.webp")

    for skill, box in CARD_SYMBOLS.items():
        card = Image.open(PUB / f"abilities-{skill}.webp").convert("RGBA")
        crop = card.crop(box)
        icon = oval_feather(crop)
        # Square-fit AFTER feathering keeps the same footprint as the emblems.
        save(square_fit(icon), PUB / "ability-symbols" / f"{skill}.webp")


def main() -> None:
    build_stats()
    build_abilities()
    print("done.")


if __name__ == "__main__":
    main()
