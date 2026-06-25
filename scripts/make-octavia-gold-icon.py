#!/usr/bin/env python3
"""
Build the transparent Gold icon used as the central specialty symbol for Octavia
(Inferno), whose specialty IS Gold (the Resource-die / gold specialist). The old
icon pointed at the generic Estates secondary-skill emblem
(abilities-estates.webp); Octavia now shows the game's own gold-coins icon.

Source asset (already in the repo): public/assets/icons/gold_leather.gif — the
HoMM3 gold-pile resource icon, baked onto the shared brown LEATHER background that
every resource icon (wood/ore/mercury/sulfur/crystal/gem) reuses unchanged.

To make the background transparent we DIFFERENCE gold against the other resource
icons: a pixel that matches most of them is shared leather (-> transparent); a
pixel that differs is the gold pile (-> kept). We then flood-fill from the border
to fill interior speckle-holes, keep only the largest connected blob (drops stray
matched pixels), feather the alpha edge slightly, crop and save:

  /assets/specialty-card/icon-gold.webp

Validated: the source/siblings exist and are equal-sized, and the output keeps a
real transparent margin; the script aborts loudly on any miss.
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ICONS = Path(__file__).resolve().parent.parent / "public" / "assets" / "icons"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "specialty-card" / "icon-gold.webp"
GOLD = "gold_leather.gif"
OTHERS = ["wood_leather.gif", "ore_leather.gif", "mercury_leather.gif", "sulfur_leather.gif", "crystal_leather.gif", "gem_leather.gif"]
TOL = 24       # per-channel L1 distance under which two pixels count as "the same leather"
MIN_AGREE = 3  # this many siblings agreeing with gold => shared background


def load(name: str) -> Image.Image:
    p = ICONS / name
    if not p.exists():
        raise SystemExit(f"FAIL missing source icon {p}")
    return Image.open(p).convert("RGB")


def main() -> None:
    gold = load(GOLD)
    others = [load(f) for f in OTHERS]
    W, H = gold.size
    for o in others:
        if o.size != (W, H):
            raise SystemExit(f"FAIL resource icons differ in size: {gold.size} vs {o.size}")
    gp = gold.load()
    op = [o.load() for o in others]

    def dist(a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])

    # 1) classify: kept (gold pile) vs transparent (shared leather)
    kept = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            g = gp[x, y]
            agree = sum(1 for o in op if dist(g, o[x, y]) <= TOL)
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
        raise SystemExit("FAIL no gold pixels survived the cutout")
    main_id = max(sizes, key=sizes.get)

    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    outp = out.load()
    for y in range(H):
        for x in range(W):
            if kept[y][x] and comp[y][x] == main_id:
                g = gp[x, y]
                outp[x, y] = (g[0], g[1], g[2], 255)

    # 4) crop to content with a little padding, feather the alpha edge, save
    bbox = out.getbbox()
    if not bbox:
        raise SystemExit("FAIL gold cutout is empty")
    out = out.crop(bbox)
    pad = 3
    canvas = Image.new("RGBA", (out.width + 2 * pad, out.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(out, (pad, pad), out)
    r, g, b, a = canvas.split()
    a = a.filter(ImageFilter.GaussianBlur(0.6))
    canvas = Image.merge("RGBA", (r, g, b, a))
    if canvas.getextrema()[3][0] != 0:
        raise SystemExit("FAIL gold icon lost its transparency")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, "WEBP", quality=92, method=6)
    print(f"  {OUT.name:24s} <- {GOLD} (leather removed) -> {canvas.size}")
    print("Done.")


if __name__ == "__main__":
    main()
