#!/usr/bin/env python3
"""
Download the Elemental creature PORTRAITS used as the central specialty symbols
for the three Conflux unit-specialist Planeswalkers, whose specialty cards used to
reference baked scans (hero_specialties-<slug>-*.webp) that were never shipped —
broken <img> links. Like Moandor (Liches) and the Bulwark unit specialists, each
is now rendered by the native specialty card with the creature's own wiki portrait:

  erdamon -> Magma Elemental   (units-magma_elemental-portrait.webp)
  monere  -> Magic Elemental   (units-magic_elemental-portrait.webp)
  pasis   -> Energy Elemental  (units-energy_elemental-portrait.webp)

Source: heroes.thelazy.net — the in-game 58x64 creature portraits, upscaled 3x to
174x192 (LANCZOS) to match the other creature-portrait specialty symbols
(units-bulwark-*-portrait.webp, units-lich-portrait.webp). Validated (HTTP 200 +
decodable + expected portrait size); aborts loudly on any miss.
"""
import io
import json
import os
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
API = "https://heroes.thelazy.net/api.php"
SCALE = 3  # 58x64 -> 174x192

JOBS = [
    ("Magma_Elemental_portrait.png", "units-magma_elemental-portrait.webp"),
    ("Magic_Elemental_portrait.png", "units-magic_elemental-portrait.webp"),
    ("Energy_Elemental_portrait.png", "units-energy_elemental-portrait.webp"),
]


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"  # agent-proxy MITM bundle, when present
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (conflux-elemental-importer)"})
    with urllib.request.urlopen(req, timeout=60, context=_ctx()) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def image_url(file_title: str) -> str:
    q = urllib.parse.urlencode(
        {
            "action": "query",
            "titles": f"File:{file_title}",
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json",
        }
    )
    data = json.loads(fetch(f"{API}?{q}").decode("utf-8"))
    for page in data["query"]["pages"].values():
        info = page.get("imageinfo")
        if info:
            return info[0]["url"]
    raise SystemExit(f"FAIL no imageinfo for File:{file_title}")


def process(raw: bytes, title: str) -> Image.Image:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if img.width < 40 or img.height < 40:
        raise SystemExit(f"FAIL {title} portrait is suspiciously small {img.size}")
    return img.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for title, out_name in JOBS:
        url = image_url(title)
        icon = process(fetch(url), title)
        icon.save(OUT / out_name, "WEBP", quality=92, method=6)
        print(f"  {out_name:36s} <- File:{title} ({url}) -> {icon.size}")
    print("Done.")


if __name__ == "__main__":
    main()
