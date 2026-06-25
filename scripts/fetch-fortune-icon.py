#!/usr/bin/env python3
"""
Download the Fortune SPELL icon used as the central specialty symbol for Melodia
(Rampart Druid), whose specialty IS Fortune (the +Luck spell). The old icon
pointed at the generic Luck secondary-skill emblem (abilities-luck.webp); the
printed specialty actually shows the Fortune spell icon, so we fetch that —
mirroring the Septienna (Death Ripple) / Astra (Cure) / Ash (Bloodlust)
corrections.

Source: heroes.thelazy.net (the classic HoMM3 wiki, linked from its
List_of_spells page) — "File:Fortune.png", the emblem on a transparent
background. We resolve its real upload URL via the MediaWiki API, autocrop the
transparent margins, scale to match the other spell-emblem icons and save as a
transparent WEBP:

  /assets/specialty-card/icon-fortune.webp

The download is validated (HTTP 200 + decodable RGBA + non-trivial size + a real
transparent margin to trim); the script aborts loudly on any miss so a broken
icon can never slip through.
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
FILE_TITLE = "Fortune.png"
OUT_NAME = "icon-fortune.webp"
# Match the natural-aspect spell emblems already shipped (242-360px longest edge).
LONGEST_EDGE = 320


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"  # agent-proxy MITM bundle, when present
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (fortune-icon-importer)"})
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
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    if img.width < 40 or img.height < 40:
        raise SystemExit(f"FAIL Fortune icon is suspiciously small {img.size}")
    bbox = img.getbbox()  # trim the fully-transparent margin
    if not bbox or bbox == (0, 0, img.width, img.height):
        raise SystemExit(f"FAIL Fortune icon has no transparent margin to trim (bbox={bbox})")
    img = img.crop(bbox)
    scale = LONGEST_EDGE / max(img.width, img.height)
    img = img.resize(
        (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
        Image.LANCZOS,
    )
    if img.getextrema()[3][0] != 0:
        raise SystemExit("FAIL Fortune icon lost its transparency after processing")
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    url = image_url(FILE_TITLE)
    icon = process(fetch(url))
    icon.save(OUT / OUT_NAME, "WEBP", quality=92, method=6)
    print(f"  {OUT_NAME:24s} <- File:{FILE_TITLE} ({url}) -> {icon.size}")
    print("Done.")


if __name__ == "__main__":
    main()
