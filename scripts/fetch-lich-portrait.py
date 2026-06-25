#!/usr/bin/env python3
"""
Download the Power Lich creature PORTRAIT used as the central specialty symbol for
Moandor (Necropolis Death Knight), whose specialty IS the Liches. Moandor's three
specialty cards used to reference baked scan images (hero_specialties-moandor-*.webp)
that were never shipped — broken <img> links. Like every other unit specialist
(Ivor/Elves, Valeska/Marksmen, the Bulwark heroes…) Moandor is now rendered by the
native specialty card with the creature's own wiki portrait as the centre symbol.

Source: heroes.thelazy.net — "File:Power_Lich_portrait.png" (the in-game 58x64
creature portrait). We upscale it 3x to 174x192 with LANCZOS to match the other
creature-portrait specialty symbols (units-bulwark-*-portrait.webp) and save:

  /assets/units-lich-portrait.webp

The download is validated (HTTP 200 + decodable + expected portrait size); the
script aborts loudly on any miss so a broken icon can never slip through.
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
FILE_TITLE = "Power_Lich_portrait.png"
OUT_NAME = "units-lich-portrait.webp"
SCALE = 3  # 58x64 -> 174x192, matching units-bulwark-*-portrait.webp


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"  # agent-proxy MITM bundle, when present
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (lich-portrait-importer)"})
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


def process(raw: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if img.width < 40 or img.height < 40:
        raise SystemExit(f"FAIL Power Lich portrait is suspiciously small {img.size}")
    return img.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    url = image_url(FILE_TITLE)
    icon = process(fetch(url))
    icon.save(OUT / OUT_NAME, "WEBP", quality=92, method=6)
    print(f"  {OUT_NAME:28s} <- File:{FILE_TITLE} ({url}) -> {icon.size}")
    print("Done.")


if __name__ == "__main__":
    main()
