#!/usr/bin/env python3
"""Convert the Heroes III interface .def files this project uses for UI chrome.

Unlike convert-h3-defs.py (battle-effect sprite sheets), this handles the
single-purpose interface defs:

  * combat / defend command buttons (icm*.def)  -> one trimmed PNG (normal frame)
  * the main-menu New Game button (mmenu*.def)   -> one trimmed PNG (normal frame)
  * the morale sprite set (imrl42*.def)          -> one PNG per track step
  * the New Day animation (NewDay.def)           -> a packed WebP sprite sheet

The decoder is the same format reader as convert-h3-defs.py (frame formats
0-3, H3 magic palette slots). Run with the uploaded def paths; outputs land
under public/assets and the New Day geometry is printed for the manifest.

Usage:
  python3 scripts/convert-h3-ui-defs.py <combat.def> <defend.def> \
      <morale.def> <newgame.def> <newday.def>
"""

import json
import math
import os
import struct
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
UI_DIR = os.path.join(ROOT, "public", "assets", "ui")
ICON_DIR = os.path.join(ROOT, "public", "assets", "icons")
FX_DIR = os.path.join(ROOT, "public", "assets", "fx")
FX_MANIFEST = os.path.join(ROOT, "src", "data", "fx-manifest.json")

# H3 magic palette placeholders (first 8 slots): (r,g,b) -> substitute alpha.
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
    offsets = []
    names = []
    for _ in range(block_count):
        _block_id, n, _u1, _u2 = struct.unpack_from("<IIII", data, pos)
        pos += 16
        for i in range(n):
            raw = data[pos + i * 13: pos + i * 13 + 13]
            names.append(raw.split(b"\x00")[0].decode("ascii", "replace"))
        pos += 13 * n
        offsets.extend(struct.unpack_from(f"<{n}I", data, pos))
        pos += 4 * n
    return full_w, full_h, rgba_pal, offsets, names, data


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
    _full_w, _full_h, rgba_pal, offsets, names, data = parse_def(path)
    canvas_w = canvas_h = 0
    decoded = []
    for off in offsets:
        rec = decode_pixels(data, off)
        canvas_w = max(canvas_w, rec[4])
        canvas_h = max(canvas_h, rec[5])
        decoded.append(rec)

    images = []
    for w, h, left, top, _fw, _fh, pix in decoded:
        img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        px = img.load()
        for y in range(h):
            row = y * w
            for x in range(w):
                px[left + x, top + y] = rgba_pal[pix[row + x]]
        images.append(img)
    return images, names, canvas_w, canvas_h


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


def save_button(path, out_path):
    images, names, _w, _h = decode_frames(path)
    # Frame 0 is the enabled/normal button face.
    frame = images[0]
    box = frame.getbbox()
    if box:
        frame = frame.crop(box)
    frame.save(out_path)
    print(f"  {os.path.basename(path):24s} -> {os.path.relpath(out_path, ROOT)}  "
          f"{frame.width}x{frame.height}  frames={names}")


def save_morale(path):
    images, names, _w, _h = decode_frames(path)
    box = union_bbox(images)
    # Engine order in the def: b3 b2 b1 g0 g1 g2 g3  ->  morale -3..+3.
    values = [-3, -2, -1, 0, 1, 2, 3]
    mapping = {}
    for img, value in zip(images, values):
        cropped = img.crop(box) if box else img
        suffix = f"p{value}" if value > 0 else ("0" if value == 0 else f"m{-value}")
        out_path = os.path.join(ICON_DIR, f"morale-h3-{suffix}.png")
        cropped.save(out_path)
        mapping[value] = os.path.relpath(out_path, ROOT)
    print(f"  {os.path.basename(path):24s} -> {len(images)} morale frames "
          f"({union_bbox(images)[2:] if box else '?'})  names={names}")
    for value, rel in mapping.items():
        print(f"      morale {value:+d}: {rel}")


def save_sheet(path, key):
    images, names, canvas_w, canvas_h = decode_frames(path)
    box = union_bbox(images)
    x0, y0, x1, y1 = box
    frames = [img.crop(box) for img in images]
    fw, fh = x1 - x0, y1 - y0
    cols = len(frames)
    rows = 1
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, ((i % cols) * fw, (i // cols) * fh))
    out_path = os.path.join(FX_DIR, f"{key}.webp")
    sheet.save(out_path, lossless=True, quality=100, method=6)

    entry = {
        "src": f"/assets/fx/{key}.webp",
        "label": "New Day",
        "group": "ui",
        "role": "affect",
        "frames": len(frames),
        "cols": cols,
        "rows": rows,
        "frameWidth": fw,
        "frameHeight": fh,
        "fps": 8,
        "anchor": "center",
        "sourceDef": os.path.basename(path),
        "trim": {"x": x0, "y": y0, "canvasWidth": canvas_w, "canvasHeight": canvas_h},
    }
    if os.path.exists(FX_MANIFEST):
        manifest = json.load(open(FX_MANIFEST))
    else:
        manifest = {}
    manifest[key] = entry
    manifest = dict(sorted(manifest.items()))
    with open(FX_MANIFEST, "w") as fh_out:
        json.dump(manifest, fh_out, indent=2)
        fh_out.write("\n")
    size = os.path.getsize(out_path)
    print(f"  {os.path.basename(path):24s} -> {os.path.relpath(out_path, ROOT)}  "
          f"{len(frames)}f {fw}x{fh}  {size // 1024}KB  (manifest key '{key}')")


if __name__ == "__main__":
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    combat, defend, morale, newgame, newday = sys.argv[1:6]
    os.makedirs(UI_DIR, exist_ok=True)
    os.makedirs(ICON_DIR, exist_ok=True)
    os.makedirs(FX_DIR, exist_ok=True)
    save_button(combat, os.path.join(UI_DIR, "combat-button.png"))
    save_button(defend, os.path.join(UI_DIR, "defend-button.png"))
    save_button(newgame, os.path.join(UI_DIR, "new-game-button.png"))
    save_morale(morale)
    save_sheet(newday, "new-day")
    print("done.")
