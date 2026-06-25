#!/usr/bin/env python3
"""
Download the two specialty symbols that were previously borrowing a generic
secondary-skill emblem instead of the thing the specialty actually depicts:

  - Astra (Cove) — her specialty IS the Cure spell, so she must show the Cure
    SPELL icon, not the First Aid Tent war-machine emblem she used to borrow
    (abilities-first_aid.webp). Source: heroes.thelazy.net "File:Cure.png" — the
    transparent spell emblem linked from its List_of_spells page.
        -> /assets/specialty-card/icon-cure.webp

  - Jeremy (Cove) — his specialty IS the Cannon war machine, so he shows the
    actual Cannon rather than the generic Artillery skill card. Source:
    heroes.thelazy.net "File:Cannon Standing.webp" — the HotA Cannon's own
    transparent battle sprite (the same cannon model, facing right).
        -> /assets/specialty-card/icon-cannon.webp

Each download is resolved via the MediaWiki API, validated (HTTP 200 + decodable
RGBA + a real transparent margin to trim + non-trivial size), autocropped and
upscaled to match the other spell/creature emblems already shipped in
specialty-card/, then written as a transparent WEBP. The script aborts loudly on
any miss so a broken icon can never slip through.
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
# Match the natural-aspect emblems already shipped (242-360px longest edge).
LONGEST_EDGE = 320

# (output filename, wiki File: title)
ICONS = [
    ("icon-cure.webp", "Cure.png"),
    ("icon-cannon.webp", "Cannon Standing.webp"),
]


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"  # agent-proxy MITM bundle, when present
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
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    if img.getextrema()[3][0] != 0:
        raise SystemExit(f"FAIL {title} has no transparency (not a cut-out emblem)")
    bbox = img.getbbox()  # trim the fully-transparent margin
    if not bbox:
        raise SystemExit(f"FAIL {title} is fully transparent")
    img = img.crop(bbox)
    if img.width < 24 or img.height < 16:
        raise SystemExit(f"FAIL {title} is suspiciously small after trim {img.size}")
    scale = LONGEST_EDGE / max(img.width, img.height)
    img = img.resize(
        (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
        Image.LANCZOS,
    )
    if img.getextrema()[3][0] != 0:
        raise SystemExit(f"FAIL {title} lost its transparency after processing")
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for out_name, title in ICONS:
        url = image_url(title)
        icon = process(fetch(url), title)
        icon.save(OUT / out_name, "WEBP", quality=92, method=6)
        print(f"  {out_name:24s} <- File:{title} ({url}) -> {icon.size}")
    print("Done.")


if __name__ == "__main__":
    main()
