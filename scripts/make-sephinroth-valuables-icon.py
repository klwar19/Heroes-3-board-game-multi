#!/usr/bin/env python3
"""
Build the transparent Valuables icon used as the central specialty symbol for
Sephinroth (Dungeon), whose specialty IS Valuables (the resource her cards gain).
The old icon pointed at the generic Estates secondary-skill emblem
(abilities-estates.webp); Sephinroth now shows the game's own Valuables resource
icon — the same red-crystal icon the resource bar uses (RESOURCE_ICONS.valuables
-> icons/crystal_leather.gif).

Source asset (already in the repo): public/assets/icons/crystal_leather.gif — the
red-crystal Valuables resource icon, baked onto the shared brown LEATHER background
that every resource icon (gold/wood/ore/mercury/sulfur/gem) reuses unchanged.

Identical method to make-octavia-gold-icon.py: DIFFERENCE crystal against the other
resource icons — a pixel that matches most of them is shared leather (-> transparent),
one that differs is the crystal pile (-> kept) — then flood-fill interior holes from
the border, keep only the largest connected blob, feather the alpha edge, crop, save:

  /assets/specialty-card/icon-valuables.webp

Validated: the source/siblings exist and are equal-sized, and the output keeps a
real transparent margin; the script aborts loudly on any miss.
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ICONS = Path(__file__).resolve().parent.parent / "public" / "assets" / "icons"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "specialty-card" / "icon-valuables.webp"
CRYSTAL = "crystal_leather.gif"
OTHERS = ["gold_leather.gif", "wood_leather.gif", "ore_leather.gif", "mercury_leather.gif", "sulfur_leather.gif", "gem_leather.gif"]
TOL = 24       # per-channel L1 distance under which two pixels count as "the same leather"
MIN_AGREE = 3  # this many siblings agreeing with crystal => shared background


def load(name: str) -> Image.Image:
    p = ICONS / name
    if not p.exists():
        raise SystemExit(f"FAIL missing source icon {p}")
    return Image.open(p).convert("RGB")


def main() -> None:
    crystal = load(CRYSTAL)
    others = [load(f) for f in OTHERS]
    W, H = crystal.size
    for o in others:
        if o.size != (W, H):
            raise SystemExit(f"FAIL resource icons differ in size: {crystal.size} vs {o.size}")
    cp = crystal.load()
    op = [o.load() for o in others]

    def dist(a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])

    # 1) classify: kept (crystal pile) vs transparent (shared leather)
    kept = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            c = cp[x, y]
            agree = sum(1 for o in op if dist(c, o[x, y]) <= TOL)
            kept[y][x] = agree < MIN_AGREE

    # 2) flood-fill 'outside' from the border through transparent pixels, then fill
    #    interior holes (transparent pixels the border can't reach are inside the pile)
    outside = [[False] * W for _ in range(H)]
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if not kept[y][x] and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    for y in range(H):
        for x in (0, W - 1):
            if not kept[y][x] and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not kept[ny][nx] and not outside[ny][nx]:
                outside[ny][nx] = True
                q.append((nx, ny))
    for y in range(H):
        for x in range(W):
            if not kept[y][x] and not outside[y][x]:
                kept[y][x] = True

    # 3) keep only the largest 8-connected component (drops stray matched specks)
    comp = [[0] * W for _ in range(H)]
    cid = 0
    sizes = {}
    for y in range(H):
        for x in range(W):
            if kept[y][x] and comp[y][x] == 0:
                cid += 1
                cnt = 0
                comp[y][x] = cid
                stack = [(x, y)]
                while stack:
                    cx, cy = stack.pop()
                    cnt += 1
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < W and 0 <= ny < H and kept[ny][nx] and comp[ny][nx] == 0:
                                comp[ny][nx] = cid
                                stack.append((nx, ny))
                sizes[cid] = cnt
    if not sizes:
        raise SystemExit("FAIL no crystal pixels survived the cutout")
    main_id = max(sizes, key=sizes.get)

    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    outp = out.load()
    for y in range(H):
        for x in range(W):
            if kept[y][x] and comp[y][x] == main_id:
                c = cp[x, y]
                outp[x, y] = (c[0], c[1], c[2], 255)

    # 4) crop to content with a little padding, feather the alpha edge, save
    bbox = out.getbbox()
    if not bbox:
        raise SystemExit("FAIL crystal cutout is empty")
    out = out.crop(bbox)
    pad = 3
    canvas = Image.new("RGBA", (out.width + 2 * pad, out.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(out, (pad, pad), out)
    r, g, b, a = canvas.split()
    a = a.filter(ImageFilter.GaussianBlur(0.6))
    canvas = Image.merge("RGBA", (r, g, b, a))
    if canvas.getextrema()[3][0] != 0:
        raise SystemExit("FAIL valuables icon lost its transparency")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, "WEBP", quality=92, method=6)
    print(f"  {OUT.name:24s} <- {CRYSTAL} (leather removed) -> {canvas.size}")
    print("Done.")


if __name__ == "__main__":
    main()
