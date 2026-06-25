#!/usr/bin/env python3
"""
Download the two remaining spell-specialist central symbols from
heroes.thelazy.net (List of spells), so every art-less spell specialist shows its
actual SPELL icon instead of a generic secondary-skill emblem:

  • Merist is the Stone Skin specialist — was borrowing the Armorer emblem
    (abilities-armorer.webp). Now shows File:Stone Skin.png.
        /assets/specialty-card/icon-stone_skin.webp
  • Cyra is the Haste specialist — was borrowing the Air-Magic emblem
    (abilities-air_magic.webp). Now shows File:Haste.png.
        /assets/specialty-card/icon-haste.webp

Same treatment as the Forgetfulness/Fortune spell icons: trim the transparent
margin, scale to 320px on the longest edge (LANCZOS), keep transparency. Each
fetch is validated (HTTP 200 + decodable + a real transparent margin to trim +
transparency preserved); aborts loudly on any miss.
"""
import io
import json
import os
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "specialty-card"
API = "https://heroes.thelazy.net/api.php"
LONGEST_EDGE = 320

JOBS = [
    ("Stone Skin.png", "icon-stone_skin.webp"),
    ("Haste.png", "icon-haste.webp"),
]


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (spell-icon-importer)"})
    with urllib.request.urlopen(req, timeout=60, context=_ctx()) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def image_url(file_title: str) -> str:
    q = urllib.parse.urlencode(
        {"action": "query", "titles": f"File:{file_title}", "prop": "imageinfo", "iiprop": "url", "format": "json"}
    )
    data = json.loads(fetch(f"{API}?{q}").decode("utf-8"))
    for page in data["query"]["pages"].values():
        info = page.get("imageinfo")
        if info:
            return info[0]["url"]
    raise SystemExit(f"FAIL no imageinfo for File:{file_title}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for title, out_name in JOBS:
        url = image_url(title)
        img = Image.open(io.BytesIO(fetch(url))).convert("RGBA")
        if img.width < 40 or img.height < 40:
            raise SystemExit(f"FAIL {title} is suspiciously small {img.size}")
        bbox = img.getbbox()
        if not bbox or bbox == (0, 0, img.width, img.height):
            raise SystemExit(f"FAIL {title} has no transparent margin to trim (bbox={bbox})")
        img = img.crop(bbox)
        scale = LONGEST_EDGE / max(img.width, img.height)
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
        if img.getextrema()[3][0] != 0:
            raise SystemExit(f"FAIL {title} lost its transparency after processing")
        img.save(OUT / out_name, "WEBP", quality=92, method=6)
        print(f"  {out_name:24s} <- File:{title} ({url}) -> {img.size}")
    print("Done.")


if __name__ == "__main__":
    main()
