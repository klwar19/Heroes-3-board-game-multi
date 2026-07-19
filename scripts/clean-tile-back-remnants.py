"""Scan / clean map tile images for attached or free back-tile fragments.

Example (Necropolis S1): a tiny starry 'I' back peeks outside the flower hex
on the top-right. Remnants are often alpha-bridged to the main tile.

Method (geometry-only — no colour flood, so terrain never gets eaten):
  1. Downsample alpha and erode hard to break thin bridges.
  2. Label components; largest = main core; every other core = remnant seed.
  3. main_keep  = dilate(main_core, erode + small)   → original main body
  4. remnant_kill = dilate(remnant_core, large)       → full mini-back incl. rim
  5. erase = remnant_kill & ~main_keep & opaque

Usage:
  py scripts/_scan-tile-back-remnants.py
  py scripts/_scan-tile-back-remnants.py --fix
  py scripts/_scan-tile-back-remnants.py --only s1 --fix --preview-dir tmp_out
"""
from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

TILE_DIRS = [
    Path("public/assets/board/tiles"),
    Path("public/assets/anime/tiles"),
]

DOWNSAMPLE = 4
ERODE_PX = 8  # downsampled (~32 px full-res)
# Grow main core back to (approx) the pre-erode body. Stay at erode-1 so we
# never re-cover remnant pixels that sat in the thin bridge zone.
MAIN_RECOVER_EXTRA = 0
# Grow remnant core enough to cover the silver rim of the mini-back flower.
REMNANT_DILATE_PX = 14  # downsampled (~56 px full-res)
ALPHA_THRESH = 24
MIN_REMNANT_CORE = 12  # downsampled
MIN_REMNANT_PX = 400  # full-res
WEBP_QUALITY = 95


def _label_components(binary: np.ndarray) -> tuple[np.ndarray, list[int]]:
    h, w = binary.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes: list[int] = [0]
    label = 0
    for y in range(h):
        for x in range(w):
            if not binary[y, x] or labels[y, x]:
                continue
            label += 1
            q: deque[tuple[int, int]] = deque([(y, x)])
            labels[y, x] = label
            size = 0
            while q:
                cy, cx = q.popleft()
                size += 1
                for ny, nx in (
                    (cy + 1, cx),
                    (cy - 1, cx),
                    (cy, cx + 1),
                    (cy, cx - 1),
                ):
                    if 0 <= ny < h and 0 <= nx < w and binary[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        q.append((ny, nx))
            sizes.append(size)
    return labels, sizes


def _dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0 or not mask.any():
        return mask
    k = radius * 2 + 1
    img = Image.fromarray((mask.astype(np.uint8) * 255))
    img = img.filter(ImageFilter.MaxFilter(size=k))
    return np.array(img) > 128


def remnant_mask_for(arr: np.ndarray) -> np.ndarray:
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    small_w = max(1, w // DOWNSAMPLE)
    small_h = max(1, h // DOWNSAMPLE)
    a_img = Image.fromarray(alpha).convert("L")
    small = np.array(
        a_img.resize((small_w, small_h), Image.Resampling.BILINEAR)
    )
    bin_small = small > ALPHA_THRESH

    erode_k = max(3, ERODE_PX * 2 + 1)
    core_img = Image.fromarray((bin_small.astype(np.uint8) * 255))
    core_img = core_img.filter(ImageFilter.MinFilter(size=erode_k))
    core = np.array(core_img) > 128
    if not core.any():
        return np.zeros((h, w), dtype=bool)

    labels, sizes = _label_components(core)
    if len(sizes) <= 2:
        return np.zeros((h, w), dtype=bool)

    main_id = int(np.argmax(sizes))
    main_core = labels == main_id
    remnant_core = np.zeros_like(core)
    for cid, sz in enumerate(sizes):
        if cid == 0 or cid == main_id:
            continue
        if sz < MIN_REMNANT_CORE:
            continue
        remnant_core |= labels == cid

    if not remnant_core.any():
        return np.zeros((h, w), dtype=bool)

    main_recover = max(0, ERODE_PX + MAIN_RECOVER_EXTRA)
    main_keep_small = _dilate(main_core, main_recover)
    remnant_kill_small = _dilate(remnant_core, REMNANT_DILATE_PX)

    def up(m: np.ndarray) -> np.ndarray:
        return (
            np.array(
                Image.fromarray((m.astype(np.uint8) * 255)).resize(
                    (w, h), Image.Resampling.NEAREST
                )
            )
            > 128
        )

    main_keep = up(main_keep_small)
    remnant_kill = up(remnant_kill_small)
    opaque = alpha > 8
    erase = remnant_kill & ~main_keep & opaque

    # Sweep leftover starfield / silver-rim freckles that sit in the bridge
    # zone (re-covered by main_keep). Only back-like colours, and only inside
    # a pad of the remnant kill region so terrain is safe.
    if erase.any():
        rgb = arr[:, :, :3].astype(np.int16)
        r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
        mean = (r.astype(np.int32) + g + b) // 3
        maxc = np.maximum(np.maximum(r, g), b)
        minc = np.minimum(np.minimum(r, g), b)
        starfield = opaque & (b > r + 6) & (b > g + 4) & (mean > 12) & (mean < 110)
        # silver/white rim of the mini flower (high lum, low chroma)
        silver = opaque & (mean > 100) & ((maxc - minc) < 60)
        # near-black AA inside the mini flower
        near_black = opaque & (mean <= 20) & (maxc < 35)
        pad = _dilate(erase, 10)
        freckles = (starfield | silver | near_black) & pad & ~erase
        erase = erase | freckles

    return erase


def analyze_tile(path: Path) -> dict | None:
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    remnant = remnant_mask_for(arr)
    n = int(remnant.sum())
    if n < MIN_REMNANT_PX:
        return None
    ys, xs = np.where(remnant)
    rgb = arr[remnant][:, :3].astype(float)
    return {
        "path": path,
        "arr": arr,
        "remnant": remnant,
        "remnant_px": n,
        "bbox": (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
        "mean_rgb": [int(v) for v in rgb.mean(axis=0)],
        "size": im.size,
    }


def clean_tile(info: dict, out_path: Path | None = None) -> Path:
    arr = info["arr"].copy()
    arr[info["remnant"]] = (0, 0, 0, 0)
    out = out_path or info["path"]
    Image.fromarray(arr, "RGBA").save(out, "WEBP", quality=WEBP_QUALITY, method=6)
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--fix", action="store_true", help="Erase remnants in place.")
    p.add_argument("--only", nargs="*", help="Basenames or stems to process.")
    p.add_argument(
        "--preview-dir",
        type=Path,
        default=None,
        help="Write remnant-highlight PNG previews here.",
    )
    p.add_argument("--erode", type=int, default=None)
    p.add_argument("--remnant-dilate", type=int, default=None)
    args = p.parse_args(argv)

    global ERODE_PX, REMNANT_DILATE_PX
    if args.erode is not None:
        ERODE_PX = args.erode
    if args.remnant_dilate is not None:
        REMNANT_DILATE_PX = args.remnant_dilate

    only = set(args.only) if args.only else None
    if args.preview_dir:
        args.preview_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    fixed = 0
    for d in TILE_DIRS:
        if not d.is_dir():
            continue
        print(f"=== {d} ===")
        for f in sorted(d.glob("*.webp")):
            if only and f.name not in only and f.stem not in only:
                continue
            info = analyze_tile(f)
            if not info:
                continue
            total += 1
            x0, y0, x1, y1 = info["bbox"]
            print(
                f"{f.name}: remnant_px={info['remnant_px']} "
                f"bbox=({x0},{y0})-({x1},{y1}) mean_rgb={info['mean_rgb']}"
            )
            if args.preview_dir:
                vis = info["arr"].copy()
                vis[info["remnant"]] = [255, 0, 255, 255]
                Image.fromarray(vis, "RGBA").save(
                    args.preview_dir / f"{f.stem}_highlight.png"
                )
                pad = 12
                hh, ww = info["arr"].shape[:2]
                cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
                cx1, cy1 = min(ww, x1 + pad + 1), min(hh, y1 + pad + 1)
                Image.fromarray(info["arr"][cy0:cy1, cx0:cx1], "RGBA").save(
                    args.preview_dir / f"{f.stem}_remnant.png"
                )
            if args.fix:
                clean_tile(info)
                fixed += 1
                print("  -> cleaned")

    print(f"\nFound {total} tile(s) with remnants; fixed={fixed if args.fix else 0}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
