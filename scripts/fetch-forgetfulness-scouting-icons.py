#!/usr/bin/env python3
"""
Download two specialty central symbols from heroes.thelazy.net:

  • Zilare is the Forgetfulness specialist — was borrowing the generic Air-Magic
    secondary-skill emblem (abilities-air_magic.webp). Now shows the actual
    Forgetfulness SPELL icon (File:Forgetfulness.png), like Melodia's Fortune.
    Transparent margin trimmed, scaled to 320px longest edge -> transparent webp:
        /assets/specialty-card/icon-forgetfulness.webp

  • Miriam is the Scouting specialist — was borrowing the generic Scouting emblem
    (abilities-scouting.webp). Now shows the large Expert Scouting skill emblem the
    user pointed at (File:Expert Scouting large.png). It is an opaque framed square
    (no transparency), so we keep it square and just upscale to 320px:
        /assets/specialty-card/icon-scouting-expert.webp

Each fetch is validated (HTTP 200 + decodable + non-trivial size); the
Forgetfulness path additionally asserts it had a transparent margin to trim and
kept its transparency. Aborts loudly on any miss.
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


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (specialty-icon-importer)"})
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


def load(file_title: str) -> Image.Image:
    img = Image.open(io.BytesIO(fetch(image_url(file_title)))).convert("RGBA")
    if img.width < 40 or img.height < 40:
        raise SystemExit(f"FAIL {file_title} is suspiciously small {img.size}")
    return img


def scale_longest(img: Image.Image, edge: int = LONGEST_EDGE) -> Image.Image:
    scale = edge / max(img.width, img.height)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Forgetfulness — transparent spell icon: trim the transparent margin first.
    forg = load("Forgetfulness.png")
    bbox = forg.getbbox()
    if not bbox or bbox == (0, 0, forg.width, forg.height):
        raise SystemExit(f"FAIL Forgetfulness has no transparent margin to trim (bbox={bbox})")
    forg = scale_longest(forg.crop(bbox))
    if forg.getextrema()[3][0] != 0:
        raise SystemExit("FAIL Forgetfulness lost its transparency after processing")
    forg.save(OUT / "icon-forgetfulness.webp", "WEBP", quality=92, method=6)
    print(f"  icon-forgetfulness.webp     <- File:Forgetfulness.png -> {forg.size}")

    # Expert Scouting — opaque framed square: just upscale, no crop.
    scout = scale_longest(load("Expert Scouting large.png"))
    scout.save(OUT / "icon-scouting-expert.webp", "WEBP", quality=92, method=6)
    print(f"  icon-scouting-expert.webp   <- File:Expert Scouting large.png -> {scout.size}")
    print("Done.")


if __name__ == "__main__":
    main()
