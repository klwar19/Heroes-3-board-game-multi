#!/usr/bin/env python3
"""
Download the Factory (HotA expansion) unit PORTRAITS used as the central
specialty symbols for the six Factory unit-specialist heroes, matching every
other unit specialist (fetch-specialty-unit-portraits.py): the clean in-game
creature portrait, NOT the full unit card art the Factory heroes previously
borrowed (units-factory-<tier>-<unit>-few.webp), which showed a shrunk card with
its frame/stats instead of a portrait.

  henrietta  -> Halfling (Factory)  -> units-factory-halfling-portrait.webp
  sam        -> Mechanic            -> units-factory-mechanic-portrait.webp
  celestine  -> Armadillo           -> units-factory-armadillo-portrait.webp
  frederick  -> Automaton           -> units-factory-automaton-portrait.webp
  agar       -> Sandworm            -> units-factory-sandworm-portrait.webp
  tancred    -> Bounty Hunter       -> units-factory-bounty_hunter-portrait.webp

Source: heroes.thelazy.net — the in-game 58x64 creature portraits, upscaled 3x to
174x192 (LANCZOS) to match the other creature-portrait specialty symbols. Each
download is validated (HTTP 200 + decodable + the expected small portrait size);
the script aborts loudly on any miss so a broken icon can never slip through.
"""
import io
import os
import ssl
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
FILEPATH = "https://heroes.thelazy.net/index.php/Special:FilePath"
SCALE = 3  # 58x64 -> 174x192

# (output name, [candidate File: titles, first hit wins])
JOBS = [
    ("units-factory-halfling-portrait.webp", ["Halfling_(Factory)_portrait.png", "Halfling_portrait.png"]),
    ("units-factory-mechanic-portrait.webp", ["Mechanic_portrait.png"]),
    ("units-factory-armadillo-portrait.webp", ["Armadillo_portrait.png"]),
    ("units-factory-automaton-portrait.webp", ["Automaton_portrait.png"]),
    ("units-factory-sandworm-portrait.webp", ["Sandworm_portrait.png"]),
    ("units-factory-bounty_hunter-portrait.webp", ["Bounty_Hunter_portrait.png", "Gunslinger_portrait.png"]),
]


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"  # agent-proxy MITM bundle, when present
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(title: str) -> bytes | None:
    url = f"{FILEPATH}/{title.replace(' ', '_')}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (factory-portrait-importer)"})
    try:
        with urllib.request.urlopen(req, timeout=60, context=_ctx()) as resp:
            if resp.status != 200:
                return None
            return resp.read()
    except Exception:
        return None


def process(raw: bytes, title: str) -> Image.Image:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if img.width < 40 or img.height < 40:
        raise SystemExit(f"FAIL {title} portrait is suspiciously small {img.size}")
    # Only the small in-game portrait needs the 3x upscale; a larger source is kept.
    if img.width <= 96:
        img = img.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for out_name, candidates in JOBS:
        raw = None
        used = None
        for title in candidates:
            raw = fetch(title)
            if raw:
                used = title
                break
        if not raw:
            raise SystemExit(f"FAIL no portrait for {out_name} (tried {candidates})")
        icon = process(raw, used)
        icon.save(OUT / out_name, "WEBP", quality=92, method=6)
        print(f"  {out_name:44s} <- File:{used} -> {icon.size}")
    print("Done.")


if __name__ == "__main__":
    main()
