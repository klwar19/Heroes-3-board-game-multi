#!/usr/bin/env python3
"""Build the WOG mod art assets (artifact card faces + object hex art).

Source of truth: the authentic 42x42 H3/WoG artifact icons and the Emerald
Tower adventure sprite, extracted from the official "Heroes of Might & Magic
III: In the Wake of Gods" manual PDF
(https://www.vault.acidcave.net/download.php?id=72) and committed under
`public/assets/wog/artifacts/icons/` / `scripts/wog-art-src/`.

This script COMPOSES from those committed sources:
  * `public/assets/wog/artifacts/<slug>.webp`      — 743x1040 card faces
    (name banner + pixel-art icon panel + tier footer; NO rules text — the
    engine-truth rules live in `src/data/wog/artifacts.ts` tags, so the face
    can never contradict the wiring).
  * `public/assets/wog/field-overrides/<kind>.webp` — 512x512 hex art for the
    WOG map objects (Emerald Tower from the authentic sprite; Mirror of the
    Home-Way / Junk Merchant composed in the same palette).

Regenerate with: python3 scripts/build-wog-art.py
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "public/assets/wog/artifacts/icons")
CARDS = os.path.join(ROOT, "public/assets/wog/artifacts")
HEXES = os.path.join(ROOT, "public/assets/wog/field-overrides")
SRC = os.path.join(ROOT, "scripts/wog-art-src")
FONT_BOLD = os.path.join(ROOT, "public/fonts/LiberationSerif-Bold.ttf")
FONT_ITALIC = os.path.join(ROOT, "public/fonts/LiberationSerif-Italic.ttf")

TIER_COLORS = {
    "minor": (176, 141, 87),
    "major": (198, 198, 214),
    "relic": (231, 183, 60),
}

# slug -> (display name, tier, subtitle)
CARDS_SPEC = {
    "magic_wand": ("Magic Wand", "minor", "Wake of Gods artifact"),
    "gate_key": ("Gate Key", "minor", "Wake of Gods artifact"),
    "crimson_shield": ("Crimson Shield of Retribution", "major", "Wake of Gods artifact"),
    "warlords_banner": ("Warlord's Banner", "major", "Wake of Gods artifact"),
    "dragonheart": ("Dragonheart", "relic", "Wake of Gods artifact"),
    "hardened_shield": ("Hardened Shield", "minor", "Commander artifact — armor"),
    "boots_of_haste": ("Boots of Haste", "minor", "Commander artifact — trinket"),
    "axe_of_smashing": ("Axe of Smashing", "major", "Commander artifact — weapon"),
    "sword_of_sharpness": ("Sword of Sharpness", "major", "Commander artifact — weapon"),
    "mithril_mail": ("Mithril Mail", "major", "Commander artifact — armor"),
    "pendant_of_sorcery": ("Pendant of Sorcery", "major", "Commander artifact — trinket"),
    "helm_of_immortality": ("Helm of Immortality", "relic", "Commander artifact — armor"),
    "dragon_eye_ring": ("Dragon Eye Ring", "relic", "Commander artifact — trinket"),
}


def radial_panel(size, inner, outer):
    """Radial gradient square panel."""
    w, h = size
    panel = Image.new("RGB", size)
    px = panel.load()
    cx, cy = w / 2, h / 2
    maxd = math.hypot(cx, cy)
    for y in range(h):
        for x in range(w):
            t = min(1.0, math.hypot(x - cx, y - cy) / maxd)
            px[x, y] = tuple(int(inner[i] + (outer[i] - inner[i]) * t) for i in range(3))
    return panel


def build_card(slug, name, tier, subtitle):
    W, H = 743, 1040
    tier_col = TIER_COLORS[tier]
    card = Image.new("RGB", (W, H), (24, 14, 10))
    d = ImageDraw.Draw(card)
    # outer frame: dark border, double gold trim
    d.rectangle([0, 0, W - 1, H - 1], outline=(10, 6, 4), width=14)
    d.rectangle([14, 14, W - 15, H - 15], outline=(122, 84, 34), width=6)
    d.rectangle([24, 24, W - 25, H - 25], outline=(64, 40, 18), width=3)
    # parchment-ish body
    body = radial_panel((W - 60, H - 60), (74, 46, 30), (43, 26, 17))
    card.paste(body, (30, 30))
    d = ImageDraw.Draw(card)
    # title banner
    d.rounded_rectangle([52, 52, W - 53, 150], radius=14, fill=(32, 18, 12), outline=tier_col, width=4)
    f_size = 54
    font = ImageFont.truetype(FONT_BOLD, f_size)
    while d.textlength(name, font=font) > W - 140 and f_size > 30:
        f_size -= 2
        font = ImageFont.truetype(FONT_BOLD, f_size)
    d.text((W / 2, 101), name, font=font, fill=(236, 214, 160), anchor="mm")
    # art panel with the authentic icon, pixel-upscaled
    panel_box = [72, 190, W - 73, 780]
    pw, ph = panel_box[2] - panel_box[0], panel_box[3] - panel_box[1]
    panel = radial_panel((pw, ph), (96, 64, 40), (28, 16, 12))
    icon = Image.open(os.path.join(ICONS, f"{slug}.webp")).convert("RGBA")
    scale = min((pw - 90) // icon.width, (ph - 90) // icon.height)
    big = icon.resize((icon.width * scale, icon.height * scale), Image.NEAREST)
    glow = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        [pw / 2 - big.width * 0.62, ph / 2 - big.height * 0.62, pw / 2 + big.width * 0.62, ph / 2 + big.height * 0.62],
        fill=tier_col + (70,),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    panel = Image.alpha_composite(panel.convert("RGBA"), glow)
    panel.alpha_composite(big, ((pw - big.width) // 2, (ph - big.height) // 2))
    card.paste(panel.convert("RGB"), (panel_box[0], panel_box[1]))
    d = ImageDraw.Draw(card)
    d.rectangle(panel_box, outline=(122, 84, 34), width=5)
    # footer: subtitle + tier
    fsub = ImageFont.truetype(FONT_ITALIC, 34)
    d.text((W / 2, 840), subtitle, font=fsub, fill=(214, 190, 148), anchor="mm")
    d.rounded_rectangle([W / 2 - 130, 890, W / 2 + 130, 960], radius=12, fill=(32, 18, 12), outline=tier_col, width=4)
    ftier = ImageFont.truetype(FONT_BOLD, 40)
    d.text((W / 2, 925), tier.upper(), font=ftier, fill=tier_col, anchor="mm")
    card.save(os.path.join(CARDS, f"{slug}.webp"), quality=88)


def hex_base(inner, outer):
    return radial_panel((512, 512), inner, outer).convert("RGBA")


def build_emerald_tower():
    img = hex_base((58, 96, 52), (26, 42, 26))
    sprite = Image.open(os.path.join(SRC, "emerald-tower-sprite.png")).convert("RGBA")
    scale = 7
    big = sprite.resize((sprite.width * scale, sprite.height * scale), Image.NEAREST)
    d = ImageDraw.Draw(img)
    # gem-lit mound under the tower
    d.ellipse([96, 380, 416, 480], fill=(34, 66, 34, 255))
    glow = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([130, 60, 382, 440], fill=(90, 220, 130, 60))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(40)))
    img.alpha_composite(big, ((512 - big.width) // 2, 440 - big.height))
    d = ImageDraw.Draw(img)
    for gx, gy in [(150, 430), (350, 445), (240, 460)]:
        d.polygon([(gx, gy - 14), (gx + 10, gy), (gx, gy + 14), (gx - 10, gy)], fill=(120, 240, 150, 255), outline=(30, 90, 40))
    img.convert("RGB").save(os.path.join(HEXES, "emerald_tower.webp"), quality=88)


def build_mirror_home_way():
    img = hex_base((70, 78, 96), (24, 26, 36))
    d = ImageDraw.Draw(img)
    # stone dais
    d.ellipse([106, 380, 406, 470], fill=(72, 72, 84, 255), outline=(28, 28, 36), width=4)
    # gold pixel frame (oval)
    d.ellipse([136, 60, 376, 420], fill=(122, 84, 34, 255))
    d.ellipse([152, 76, 360, 404], fill=(20, 24, 40, 255))
    # swirl portal
    cx, cy = 256, 240
    for t in range(0, 1400):
        a = t / 55.0
        r = 4 + t / 10.5
        if r > 96:
            break
        x = cx + r * math.cos(a)
        y = cy + r * 1.5 * math.sin(a)
        c = int(140 + 100 * math.sin(a * 1.7))
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(c // 3, c, 255, 255))
    blurred = img.filter(ImageFilter.GaussianBlur(2))
    img = Image.blend(img, blurred, 0.5)
    d = ImageDraw.Draw(img)
    d.ellipse([152, 76, 360, 404], outline=(210, 168, 90, 255), width=6)
    # sparkle
    for sx, sy in [(200, 140), (300, 320), (280, 120)]:
        d.line([sx - 12, sy, sx + 12, sy], fill=(240, 250, 255, 255), width=3)
        d.line([sx, sy - 12, sx, sy + 12], fill=(240, 250, 255, 255), width=3)
    img.convert("RGB").save(os.path.join(HEXES, "mirror_home_way.webp"), quality=88)


def build_junk_merchant():
    img = hex_base((104, 78, 46), (40, 28, 18))
    d = ImageDraw.Draw(img)
    # striped canopy
    d.polygon([(66, 150), (446, 150), (486, 250), (26, 250)], fill=(140, 36, 30, 255), outline=(50, 14, 10))
    for i in range(5):
        x0 = 66 + i * 76 + 38
        d.polygon([(x0, 150), (x0 + 38, 150), (x0 + 46, 250), (x0 + 8, 250)], fill=(216, 188, 140, 255))
    d.polygon([(26, 250), (486, 250), (466, 268), (46, 268)], fill=(90, 22, 16, 255))
    # poles + table
    d.rectangle([56, 250, 74, 430], fill=(74, 48, 26, 255))
    d.rectangle([438, 250, 456, 430], fill=(74, 48, 26, 255))
    d.rectangle([86, 330, 426, 356], fill=(120, 82, 44, 255), outline=(52, 32, 16), width=3)
    d.rectangle([100, 356, 412, 452], fill=(96, 64, 34, 255), outline=(52, 32, 16), width=3)
    # wares: authentic pixel icons laid on the counter
    for slug, (x, y, s) in {
        "gate_key": (120, 262, 2),
        "boots_of_haste": (216, 252, 2),
        "magic_wand": (312, 260, 2),
    }.items():
        icon = Image.open(os.path.join(ICONS, f"{slug}.webp")).convert("RGBA")
        big = icon.resize((icon.width * s, icon.height * s), Image.NEAREST)
        img.alpha_composite(big, (x, y))
    d = ImageDraw.Draw(img)
    # gold pile
    for gx, gy in [(150, 420), (176, 428), (200, 418), (166, 410), (350, 424), (372, 416)]:
        d.ellipse([gx, gy, gx + 18, gy + 12], fill=(226, 186, 70, 255), outline=(120, 84, 20))
    img.convert("RGB").save(os.path.join(HEXES, "junk_merchant.webp"), quality=88)


def main():
    for path in (CARDS, HEXES):
        os.makedirs(path, exist_ok=True)
    for slug, (name, tier, subtitle) in CARDS_SPEC.items():
        build_card(slug, name, tier, subtitle)
    build_emerald_tower()
    build_mirror_home_way()
    build_junk_merchant()
    print(f"built {len(CARDS_SPEC)} card faces + 3 hex arts")


if __name__ == "__main__":
    main()
