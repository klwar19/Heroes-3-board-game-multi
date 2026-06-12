#!/usr/bin/env python3
"""Convert Heroes III .def battle-effect sprites into web sprite sheets.

Reads a folder of .def files (extracted from H3sprite.lod), decodes every
frame, trims shared empty margins, packs the frames into a grid sprite sheet
and writes:

  public/assets/fx/<key>.webp        lossless WebP sheet with alpha
  src/data/fx-manifest.json          frame geometry + identification notes

Def names are mapped to readable keys using the spell->def references in
VCMI's config files (config/spells/*.json) plus visual identification for
files the configs never mention. Files whose content we could not identify
keep their original def name as key (group "unidentified") so they are
preserved for future use.

Usage:
  python3 scripts/convert-h3-defs.py <def-folder> [<def-folder> ...]

The decoder understands frame formats 0-3 and treats the H3 special palette
slots (cyan transparency, magenta shadows, selection highlights) correctly:
special handling only applies when the palette entry holds the engine's
magic placeholder colors, so effect art that legitimately uses yellow or
green keeps its pixels.
"""

import json
import math
import os
import struct
import sys

from PIL import Image

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "fx")
MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "fx-manifest.json")
MAX_SHEET_WIDTH = 4096
DEFAULT_FPS = 15

# H3 magic palette placeholders: (r, g, b) -> alpha to substitute. Shadow
# slots become translucent black; transparency/selection become fully clear.
MAGIC_COLORS = {
    (0, 255, 255): 0,      # transparency
    (255, 150, 255): 64,   # shadow border
    (255, 100, 255): 64,
    (255, 50, 255): 96,
    (255, 0, 255): 128,    # shadow body
    (255, 255, 0): 0,      # selection highlight (off in play)
    (180, 0, 255): 128,    # selection + shadow
    (0, 255, 0): 0,        # selection
}

# def name (upper, no extension) -> metadata. role: how the original game
# uses it (affect = plays over the target, hit = impact at target cell,
# projectile = travels caster -> target). anchor/opacity follow VCMI configs.
# Names verified against VCMI config/spells/*.json (develop branch).
NAME_MAP = {
    "C01SPA0": {"key": "air-shield", "label": "Air Shield", "group": "spell", "role": "affect"},
    "C01SPE0": {"key": "resurrection", "label": "Resurrection / Animate Dead / Sacrifice", "group": "spell", "role": "affect"},
    "C01SPF": {"key": "berserk", "label": "Berserk", "group": "spell", "role": "affect"},
    "C01SPF0": {"alias": "berserk"},
    "C01SPW": {"key": "bless", "label": "Bless", "group": "spell", "role": "affect"},
    "C01SPW0": {"alias": "bless"},
    "C02SPA0": {"key": "magic-mirror", "label": "Magic Mirror", "group": "spell", "role": "affect"},
    "C02SPE0": {"key": "anti-magic", "label": "Anti-Magic", "group": "spell", "role": "affect"},
    "C02SPF0": {"key": "blind", "label": "Blind", "group": "spell", "role": "affect"},
    "C03SPA0": {"key": "lightning-bolt", "label": "Lightning Bolt strike", "group": "spell", "role": "affect", "anchor": "bottom"},
    "C03SPA1": {"key": "lightning-sparks", "label": "Lightning sparks (bolt variant)", "group": "spell-extra", "role": "affect"},
    "C03SPW": {"key": "cure", "label": "Cure", "group": "spell", "role": "affect"},
    "C03SPW0": {"alias": "cure"},
    "C04SPA0": {"key": "counterstrike", "label": "Counterstrike", "group": "spell", "role": "affect"},
    "C04SPE0": {"key": "death-ripple", "label": "Death Ripple", "group": "spell", "role": "affect", "coverage": 1.5},
    "C04SPF0": {"key": "inferno", "label": "Inferno", "group": "spell", "role": "hit", "coverage": 1.7},
    "C04SPW": {"key": "curse", "label": "Curse", "group": "spell", "role": "affect"},
    "C04SPW0": {"alias": "curse"},
    "C05SPE0": {"key": "implosion", "label": "Implosion", "group": "spell", "role": "affect"},
    "C05SPF0": {"key": "fire-shield", "label": "Fire Shield", "group": "spell", "role": "affect"},
    "C05SPW": {"key": "dispel", "label": "Dispel", "group": "spell", "role": "affect"},
    "C05SPW0": {"alias": "dispel"},
    "C06SPF0": {"key": "armageddon", "label": "Armageddon", "group": "spell", "role": "hit", "coverage": 2.2},
    "C06SPW": {"key": "forgetfulness", "label": "Forgetfulness", "group": "spell", "role": "affect"},
    "C06SPW0": {"alias": "forgetfulness"},
    "C07SPA0": {"key": "disrupting-ray-projectile", "label": "Disrupting Ray projectile", "group": "spell", "role": "projectile"},
    "C07SPA1": {"key": "disrupting-ray", "label": "Disrupting Ray", "group": "spell", "role": "affect"},
    "C07SPE0": {"key": "death-stare", "label": "Death Stare", "group": "ability", "role": "affect"},
    "C07SPW": {"key": "frost-ring", "label": "Frost Ring", "group": "spell", "role": "hit", "coverage": 1.7},
    "C07SPW0": {"alias": "frost-ring"},
    "C08SPE0": {"key": "meteor-shower", "label": "Meteor Shower", "group": "spell", "role": "hit", "coverage": 1.7},
    "C08SPF0": {"key": "frenzy", "label": "Frenzy", "group": "spell", "role": "affect"},
    "C08SPW0": {"key": "ice-bolt-projectile-0", "label": "Ice Bolt projectile (flattest)", "group": "spell", "role": "projectile"},
    "C08SPW1": {"key": "ice-bolt-projectile-1", "label": "Ice Bolt projectile", "group": "spell", "role": "projectile"},
    "C08SPW2": {"key": "ice-bolt-projectile-2", "label": "Ice Bolt projectile", "group": "spell", "role": "projectile"},
    "C08SPW3": {"key": "ice-bolt-projectile-3", "label": "Ice Bolt projectile", "group": "spell", "role": "projectile"},
    "C08SPW4": {"key": "ice-bolt-projectile-4", "label": "Ice Bolt projectile (steepest)", "group": "spell", "role": "projectile"},
    "C08SPW5": {"key": "ice-bolt-hit", "label": "Ice Bolt impact", "group": "spell", "role": "hit"},
    "C09SPA0": {"key": "fortune", "label": "Fortune", "group": "spell", "role": "affect"},
    "C09SPE0": {"key": "slow", "label": "Slow", "group": "spell", "role": "affect", "anchor": "bottom"},
    "C09SPF0": {"key": "land-mine-a", "label": "Land Mine (variant)", "group": "obstacle", "role": "hit"},
    "C09SPF1": {"key": "land-mine-b", "label": "Land Mine (variant)", "group": "obstacle", "role": "hit"},
    "C09SPF2": {"key": "land-mine-c", "label": "Land Mine (variant)", "group": "obstacle", "role": "hit"},
    "C09SPF3": {"key": "land-mine-hit", "label": "Land Mine trigger", "group": "obstacle", "role": "hit"},
    "C09SPW0": {"key": "mirth", "label": "Mirth", "group": "spell", "role": "affect"},
    "C10SPA0": {"key": "hypnotize", "label": "Hypnotize", "group": "spell", "role": "affect"},
    "C10SPF0": {"key": "misfortune", "label": "Misfortune", "group": "spell", "role": "affect"},
    "C10SPW": {"key": "prayer", "label": "Prayer", "group": "spell", "role": "affect", "anchor": "bottom", "opacity": 0.5},
    "C11SPA0": {"key": "lightning-crackle-alt", "label": "Lightning ground crackle (variant)", "group": "spell-extra", "role": "affect"},
    "C11SPA1": {"key": "lightning-crackle", "label": "Lightning ground crackle", "group": "spell", "role": "affect"},
    "C11SPE0": {"key": "protect-air", "label": "Protection from Air", "group": "spell", "role": "affect"},
    "C11SPF0": {"key": "protect-water", "label": "Protection from Water", "group": "spell", "role": "affect"},
    "C11SPW0": {"key": "protect-fire", "label": "Protection from Fire", "group": "spell", "role": "affect"},
    "C12SPA0": {"key": "precision", "label": "Precision", "group": "spell", "role": "affect"},
    "C13SPA0": {"key": "protect-earth", "label": "Protection from Earth", "group": "spell", "role": "affect"},
    "C13SPE0": {"key": "shield", "label": "Shield", "group": "spell", "role": "affect"},
    "C13SPF": {"key": "fireball", "label": "Fireball explosion", "group": "spell", "role": "hit", "coverage": 1.6},
    "C13SPF0": {"alias": "fireball"},
    "C13SPW0": {"key": "slayer", "label": "Slayer", "group": "spell", "role": "affect"},
    "C14SPA0": {"key": "destroy-undead", "label": "Destroy Undead", "group": "spell", "role": "affect"},
    "C14SPE0": {"key": "sorrow", "label": "Sorrow", "group": "spell", "role": "affect"},
    "C15SPA0": {"key": "haste", "label": "Haste", "group": "spell", "role": "affect"},
    "C16SPE": {"key": "stone-skin", "label": "Stone Skin", "group": "spell", "role": "affect"},
    "C16SPE0": {"alias": "stone-skin"},
    "C17SPE0": {"key": "force-field-a", "label": "Force Field (piece)", "group": "obstacle", "role": "affect"},
    "C17SPE1": {"key": "force-field-b", "label": "Force Field (piece)", "group": "obstacle", "role": "affect"},
    "C17SPE2": {"key": "force-field-c", "label": "Force Field (piece)", "group": "obstacle", "role": "affect"},
    "C17SPW0": {"key": "weakness", "label": "Weakness / Acid Breath debuff", "group": "spell", "role": "affect"},
    "C20SPX": {"key": "magic-arrow-hit", "label": "Magic Arrow impact", "group": "spell", "role": "hit"},
    "C20SPX0": {"key": "magic-arrow-projectile-0", "label": "Magic Arrow projectile (flattest)", "group": "spell", "role": "projectile"},
    "C20SPX1": {"key": "magic-arrow-projectile-1", "label": "Magic Arrow projectile", "group": "spell", "role": "projectile"},
    "C20SPX2": {"key": "magic-arrow-projectile-2", "label": "Magic Arrow projectile", "group": "spell", "role": "projectile"},
    "C20SPX3": {"key": "magic-arrow-projectile-3", "label": "Magic Arrow projectile", "group": "spell", "role": "projectile"},
    "C20SPX4": {"key": "magic-arrow-projectile-4", "label": "Magic Arrow projectile (steepest)", "group": "spell", "role": "projectile"},
    "C0ACID": {"key": "acid-breath", "label": "Acid Breath splash", "group": "ability", "role": "hit"},
    "C0FEAR": {"key": "fear", "label": "Fear (Azure Dragon)", "group": "ability", "role": "affect"},
    "SP01_": {"key": "age", "label": "Age (Ghost Dragon)", "group": "ability", "role": "affect"},
    "SP02_": {"key": "bind", "label": "Bind (Dendroid)", "group": "ability", "role": "affect"},
    "SP04_": {"key": "death-cloud", "label": "Death Cloud (Lich)", "group": "ability", "role": "hit", "coverage": 1.6},
    "SP05_": {"key": "disease", "label": "Disease (Zombie)", "group": "ability", "role": "affect"},
    "SP10_": {"key": "paralyze", "label": "Paralyze (Scorpicore)", "group": "ability", "role": "affect"},
    "SP11_": {"key": "poison", "label": "Poison (Wyvern Monarch)", "group": "ability", "role": "affect"},
}

# Fire-wall flame columns: 13 variants, identified visually (orange flame
# pillars; VCMI renders fire wall as a battlefield obstacle so the configs
# never reference these defs directly).
for i, suffix in enumerate(["0", "1", "2", "3", "4", "5", "6", "60", "61", "62", "7", "8", "9"]):
    NAME_MAP[f"C07SPF{suffix}"] = {
        "key": f"fire-wall-{chr(ord('a') + i)}",
        "label": f"Fire Wall flame (variant {suffix})",
        "group": "obstacle",
        "role": "affect",
        "anchor": "bottom",
    }

# Visually inspected but not confidently identified; preserved for future use.
LOOKS_LIKE = {
    "C12SPE0": "white glowing orb",
    "C12SPF0": "orange star burst",
    "C12SPF1": "white orb flash",
    "C15SPE0": "blue spectral flame column",
    "C15SPE1": "blue spectral flame column",
    "C15SPE2": "blue spectral flame column",
    "C15SPE3": "blue spectral flame column",
    "C15SPE4": "blue spectral flame column",
    "C15SPE5": "blue spectral flame column",
    "C15SPE6": "blue spectral flame column",
    "C15SPE7": "blue spectral flame column",
    "C15SPE8": "blue spectral flame column",
    "C15SPE9": "blue spectral flame column",
    "C15SPE10": "blue spectral flame column",
    "C15SPE11": "blue spectral flame column",
    "C18SPW0": "blue-teal swirl",
    "SP03_": "green sparkle burst",
    "SP06_": "white wisp",
    "SP07_A": "blue-green spiral (A)",
    "SP07_B": "blue-green spiral (B)",
    "SP08_": "small dark burst",
    "SP09_": "purple burst",
    "SP12_": "blue orb burst",
    "SP13_": "dark cloud",
}


def parse_def(path):
    data = open(path, "rb").read()
    _def_type, full_w, full_h, block_count = struct.unpack_from("<IIII", data, 0)
    palette = [tuple(data[16 + i * 3: 16 + i * 3 + 3]) for i in range(256)]
    rgba_pal = []
    for idx, rgb in enumerate(palette):
        if idx < 8 and rgb in MAGIC_COLORS:
            alpha = MAGIC_COLORS[rgb]
            rgba_pal.append((0, 0, 0, alpha) if alpha else (0, 0, 0, 0))
        else:
            rgba_pal.append((*rgb, 255))

    pos = 16 + 768
    frames = []
    for _ in range(block_count):
        _block_id, n, _u1, _u2 = struct.unpack_from("<IIII", data, pos)
        pos += 16 + 13 * n
        offsets = struct.unpack_from(f"<{n}I", data, pos)
        pos += 4 * n
        frames.extend(offsets)
    return full_w, full_h, rgba_pal, frames, data


def decode_pixels(data, off):
    _size, fmt, fw, fh, w, h, left, top = struct.unpack_from("<IIIIIIii", data, off)
    body = off + 32
    pix = bytearray(w * h)

    if fmt == 0:
        pix[:] = data[body: body + w * h]
    elif fmt == 1:
        line_offs = struct.unpack_from(f"<{h}I", data, body)
        for y, lo in enumerate(line_offs):
            p = body + lo
            x = 0
            while x < w:
                code = data[p]; length = data[p + 1] + 1; p += 2
                if code == 0xFF:
                    pix[y * w + x: y * w + x + length] = data[p: p + length]
                    p += length
                else:
                    for i in range(length):
                        pix[y * w + x + i] = code
                x += length
    elif fmt in (2, 3):
        if fmt == 2:
            starts = [body + lo for lo in struct.unpack_from(f"<{h}H", data, body)]
        else:
            per_line = max(w // 32, 1)
            all_offs = struct.unpack_from(f"<{h * per_line}H", data, body)
            starts = [body + all_offs[y * per_line] for y in range(h)]
        for y, p in enumerate(starts):
            x = 0
            while x < w:
                b = data[p]; p += 1
                code, length = b >> 5, (b & 0x1F) + 1
                if code == 7:
                    pix[y * w + x: y * w + x + length] = data[p: p + length]
                    p += length
                else:
                    for i in range(length):
                        pix[y * w + x + i] = code
                x += length
    else:
        raise ValueError(f"unsupported frame format {fmt}")
    return w, h, left, top, fw, fh, pix


def decode_frames(path):
    full_w, full_h, rgba_pal, offsets, data = parse_def(path)
    canvas_w, canvas_h = full_w, full_h
    decoded = []
    seen = {}
    order = []
    for off in offsets:
        if off in seen:
            continue
        seen[off] = True
        rec = decode_pixels(data, off)
        canvas_w = max(canvas_w, rec[4])
        canvas_h = max(canvas_h, rec[5])
        decoded.append(rec)
        order.append(off)

    images = []
    for w, h, left, top, _fw, _fh, pix in decoded:
        img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        px = img.load()
        for y in range(h):
            row = y * w
            for x in range(w):
                px[left + x, top + y] = rgba_pal[pix[row + x]]
        images.append(img)
    return images, canvas_w, canvas_h


def union_bbox(images):
    box = None
    for img in images:
        b = img.getbbox()
        if b is None:
            continue
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])
        )
    return box


def convert(paths):
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {}
    aliases = []
    total_bytes = 0

    files = {}
    for folder in paths:
        for name in sorted(os.listdir(folder)):
            if name.lower().endswith(".def"):
                base = os.path.splitext(name)[0].upper()
                files.setdefault(base, os.path.join(folder, name))

    for base, path in sorted(files.items()):
        meta = NAME_MAP.get(base, {})
        if "alias" in meta:
            aliases.append((base, meta["alias"]))
            continue
        key = meta.get("key", base.lower())

        images, canvas_w, canvas_h = decode_frames(path)
        box = union_bbox(images)
        if box is None:
            print(f"  !! {base}: all frames empty, skipped")
            continue
        x0, y0, x1, y1 = box
        frames = [img.crop(box) for img in images]
        fw, fh = x1 - x0, y1 - y0

        cols = max(1, min(len(frames), MAX_SHEET_WIDTH // max(fw, 1)))
        rows = math.ceil(len(frames) / cols)
        sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
        for i, frame in enumerate(frames):
            sheet.paste(frame, ((i % cols) * fw, (i // cols) * fh))

        out_path = os.path.join(OUT_DIR, f"{key}.webp")
        sheet.save(out_path, lossless=True, quality=100, method=6)
        size = os.path.getsize(out_path)
        total_bytes += size

        entry = {
            "src": f"/assets/fx/{key}.webp",
            "label": meta.get("label", base),
            "group": meta.get("group", "unidentified"),
            "role": meta.get("role", "affect"),
            "frames": len(frames),
            "cols": cols,
            "rows": rows,
            "frameWidth": fw,
            "frameHeight": fh,
            "fps": DEFAULT_FPS,
            "anchor": meta.get("anchor", "center"),
            "sourceDef": base,
        }
        if "opacity" in meta:
            entry["opacity"] = meta["opacity"]
        if "coverage" in meta:
            entry["coverage"] = meta["coverage"]
        if base in LOOKS_LIKE:
            entry["looksLike"] = LOOKS_LIKE[base]
        # Original canvas + crop offset so in-game positioning stays exact.
        entry["trim"] = {"x": x0, "y": y0, "canvasWidth": canvas_w, "canvasHeight": canvas_h}
        manifest[key] = entry
        print(f"  {base:10s} -> {key}.webp  {len(frames)}f {fw}x{fh}  {size // 1024}KB")

    for base, target in aliases:
        if target in manifest:
            manifest[target].setdefault("aliasDefs", []).append(base)
        else:
            print(f"  !! alias {base} -> {target}: canonical file missing")

    ordered = dict(sorted(manifest.items()))
    with open(MANIFEST_PATH, "w") as fh:
        json.dump(ordered, fh, indent=2)
        fh.write("\n")
    print(f"\n{len(ordered)} sheets, {total_bytes / 1024 / 1024:.1f}MB total -> {os.path.relpath(OUT_DIR)}")
    print(f"manifest -> {os.path.relpath(MANIFEST_PATH)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    convert(sys.argv[1:])
